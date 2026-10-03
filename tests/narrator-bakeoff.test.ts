import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { MiniMaxNarratorProvider, DEFAULT_NARRATOR_MODEL, MINIMAX_NARRATOR_MODEL, KIMI_NARRATOR_MODEL, GEMINI_NARRATOR_MODEL, NARRATOR_PROVIDER_ROUTING } from "../src/llm/openrouter/minimax-narrator.js";
import { CONTROLLER_POLICY, DEFAULT_CONTROLLER_MODEL } from "../src/llm/openrouter/deepseek-controller.js";
import { NARRATOR_SYSTEM, NARRATOR_STATE_PRECEDENCE } from "../src/turn/prompt-builder.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnEvent } from "../src/turn/turn-types.js";
import { onlineCoordinator, selectedModels, NARRATOR_OUTPUT_TOKENS } from "../src/dev/turn-services.js";
import { withHistoricalContext } from "../src/dev/historical-context.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { checkBakeoff } from "../src/dev/narrative-checks.js";
import { ADULT_PROBES, NARRATOR_CANDIDATES, adultProbeRequest, capturingFetch, classifyOutcome, diagnoseStageB, fingerprint, quantile, stageACases, stageARequest, stageBCases, targetedCases, usageOf } from "../src/dev/narrator-bakeoff.js";
import { collect, mockController, mockNarrator, setup, transfer } from "./turn-fixtures.js";

const corpus = JSON.parse(readFileSync("tests/playthrough/curated.json", "utf8"));
const history = JSON.parse(readFileSync("tests/playthrough/historical-windows.json", "utf8"));
const sseEvent = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
function sse(text: string, finish = "stop", usage: Record<string, unknown> = { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 }): Response {
  return new Response(sseEvent({ provider: "OfflineMock", choices: [{ delta: { content: text }, finish_reason: null }] }) + sseEvent({ provider: "OfflineMock", choices: [{ delta: { content: "" }, finish_reason: finish }] }) + sseEvent({ choices: [], usage }) + "data: [DONE]\n\n");
}
const controllerReply = (commands: unknown[]) => Response.json({ choices: [{ message: { content: JSON.stringify({ commands }) }, finish_reason: "stop" }], usage: {} });
async function fullLoop(model: string | undefined, disable_reasoning?: boolean) {
  const { world, campaign } = turnFixture();
  const narratorBodies: Record<string, unknown>[] = [], controllerBodies: Record<string, unknown>[] = [];
  const narrator_client = new OpenRouterClient({ api_key: () => "fake-offline", fetch: (async (_url: unknown, init: RequestInit) => { narratorBodies.push(JSON.parse(String(init.body))); return sse("Brenna accepts boots from Nicco."); }) as typeof fetch });
  const controller_client = new OpenRouterClient({ api_key: () => "fake-offline", fetch: (async (_url: unknown, init: RequestInit) => { controllerBodies.push(JSON.parse(String(init.body))); return controllerReply([transfer]); }) as typeof fetch });
  const coordinator = await onlineCoordinator(world, false, p => p, { ...(model ? { model } : {}), ...(disable_reasoning === undefined ? {} : { disable_reasoning }), narrator_client, controller_client });
  const events = await collect(coordinator.runTurn({ campaign, player_input: "I give boots to Brenna." }));
  return { narratorBodies, controllerBodies, events, last: events.at(-1)!, snapshot: campaign.exportSnapshot() };
}

test("narrator model override leaves controller model, policy, evidence and committed state unchanged", async () => {
  const [a, b] = [await fullLoop(NARRATOR_CANDIDATES[1].model, true), await fullLoop(NARRATOR_CANDIDATES[3].model, true)];
  assert.equal(a.narratorBodies[0]!.model, NARRATOR_CANDIDATES[1].model); assert.equal(b.narratorBodies[0]!.model, NARRATOR_CANDIDATES[3].model);
  const withoutModel = ({ model: _, ...rest }: Record<string, unknown>) => rest;
  assert.deepEqual(withoutModel(a.narratorBodies[0]!), withoutModel(b.narratorBodies[0]!));
  assert.deepEqual(a.controllerBodies, b.controllerBodies);
  assert.equal(a.controllerBodies[0]!.model, selectedModels().controller);
  assert.equal((a.controllerBodies[0]!.messages as { content: string }[])[0]!.content, CONTROLLER_POLICY);
  assert.equal(a.last.type, "turn_completed"); assert.equal(b.last.type, "turn_completed");
  if (a.last.type !== "turn_completed" || b.last.type !== "turn_completed") return;
  assert.deepEqual(a.last.result.authorization, b.last.result.authorization);
  assert.deepEqual(a.last.result.turn_evidence, b.last.result.turn_evidence);
  assert.deepEqual(a.snapshot, b.snapshot);
  assert.equal(a.snapshot.items.find(i => i.id === "boots")!.owner_id, "brenna");
});
test("production default narrator is GLM 5.2 pinned to Z.AI without fallbacks, reasoning disabled; controller request unchanged", async () => {
  const saved = process.env.OPENROUTER_NARRATOR_MODEL;
  delete process.env.OPENROUTER_NARRATOR_MODEL;
  try {
    const run = await fullLoop(undefined);
    assert.equal(DEFAULT_NARRATOR_MODEL, "z-ai/glm-5.2");
    assert.equal(run.narratorBodies[0]!.model, "z-ai/glm-5.2");
    assert.deepEqual(run.narratorBodies[0]!.provider, { order: ["z-ai/fp8"], allow_fallbacks: false });
    assert.equal(run.narratorBodies[0]!.max_tokens, NARRATOR_OUTPUT_TOKENS);
    assert.equal(run.narratorBodies[0]!.max_tokens, 512); // Runtime Continuity Repair 1.1 production cap
    assert.deepEqual(run.narratorBodies[0]!.reasoning, { enabled: false });
    assert.equal(run.narratorBodies[0]!.stream, true);
    assert.equal(run.controllerBodies[0]!.model, DEFAULT_CONTROLLER_MODEL);
    assert.equal((run.controllerBodies[0]!.messages as { content: string }[])[0]!.content, CONTROLLER_POLICY);
    assert.deepEqual(run.controllerBodies[0]!.reasoning, { exclude: true, enabled: false });
    // Repair 1 authoritative order: the draft is buffered; audited narration is delivered after authorization and before one commit.
    assert.deepEqual(run.events.map(e => e.type), ["turn_started", "controller_started", "state_proposed", "narration_delta", "narration_completed", "state_committed", "turn_completed"]);
    const optOut = await fullLoop(undefined, false);
    assert.equal("reasoning" in optOut.narratorBodies[0]!, false);
    const { reasoning: _, ...rest } = run.narratorBodies[0]!;
    assert.deepEqual(rest, optOut.narratorBodies[0]);
  } finally { if (saved === undefined) delete process.env.OPENROUTER_NARRATOR_MODEL; else process.env.OPENROUTER_NARRATOR_MODEL = saved; }
});
test("OPENROUTER_NARRATOR_MODEL still overrides the default; controller and reasoning policy do not change", async () => {
  const saved = process.env.OPENROUTER_NARRATOR_MODEL;
  process.env.OPENROUTER_NARRATOR_MODEL = MINIMAX_NARRATOR_MODEL;
  try {
    const run = await fullLoop(undefined);
    assert.equal(run.narratorBodies[0]!.model, "minimax/minimax-m2-her");
    assert.deepEqual(run.narratorBodies[0]!.reasoning, { enabled: false });
    assert.equal("provider" in run.narratorBodies[0]!, false);
    assert.equal(run.controllerBodies[0]!.model, DEFAULT_CONTROLLER_MODEL);
  } finally { if (saved === undefined) delete process.env.OPENROUTER_NARRATOR_MODEL; else process.env.OPENROUTER_NARRATOR_MODEL = saved; }
});
test("Runtime Continuity Repair 1: Kimi stays available unpinned; Gemini is a Vertex-pinned manual alternative, never a fallback", async () => {
  const saved = process.env.OPENROUTER_NARRATOR_MODEL;
  try {
    for (const [model, provider] of [[KIMI_NARRATOR_MODEL, undefined], [GEMINI_NARRATOR_MODEL, { order: ["google-vertex/global"], allow_fallbacks: false }]] as const) {
      process.env.OPENROUTER_NARRATOR_MODEL = model;
      const run = await fullLoop(undefined);
      assert.equal(run.narratorBodies[0]!.model, model);
      assert.deepEqual(run.narratorBodies[0]!.provider, provider);
      assert.equal(run.narratorBodies[0]!.max_tokens, NARRATOR_OUTPUT_TOKENS);
      assert.equal(run.controllerBodies[0]!.model, DEFAULT_CONTROLLER_MODEL);
    }
    // The production pin names exactly one provider and forbids fallbacks.
    assert.deepEqual(NARRATOR_PROVIDER_ROUTING[DEFAULT_NARRATOR_MODEL], { order: ["z-ai/fp8"], allow_fallbacks: false });
    assert.equal(NARRATOR_OUTPUT_TOKENS, 512); // Runtime Continuity Repair 1.1 (was 384)
  } finally { if (saved === undefined) delete process.env.OPENROUTER_NARRATOR_MODEL; else process.env.OPENROUTER_NARRATOR_MODEL = saved; }
});
test("Stage A request is byte-identical to the coordinator's narrator request for every case", async () => {
  const cases = stageACases(corpus.fixtures);
  assert.ok(cases.length >= 8 && cases.length <= 12);
  for (const c of cases) {
    const { world, campaign } = turnFixture(c.ground_garments), service = new (await import("../src/retrieval/retrieval-service.js")).RetrievalService(world);
    let seen: GenerationRequest | undefined;
    const window = c.window ? history[c.window] : [];
    const inner = mockNarrator("Brenna smiles.");
    const narrator = { generate: inner.generate, stream: (request: GenerationRequest) => { seen = withHistoricalContext(request, window); return inner.stream(seen); } };
    const coordinator = new TurnCoordinator(world, narrator, mockController([]), { service, search: new (await import("../src/retrieval/hybrid-search.js")).HybridSearch(service) });
    await collect(coordinator.runTurn({ campaign, player_input: c.input }));
    const built = await stageARequest(c, history);
    assert.equal(built.request.system_prompt, seen!.system_prompt, c.id);
    assert.deepEqual(built.request.messages, seen!.messages, c.id);
    assert.equal(built.fingerprint, fingerprint(seen!), c.id);
    assert.equal((await stageARequest(c, history)).fingerprint, built.fingerprint, `${c.id} deterministic`);
  }
});
test("Stage A covers the required failure modes and Stage B keeps the 12 state rows plus knowledge", () => {
  const modes = new Set(stageACases(corpus.fixtures).flatMap(c => c.failure_modes));
  for (const m of ["gerome_silence", "equipment_continuity", "multi_item_handover", "knowledge", "player_agency", "multi_npc", "short_context_input", "retrieval"]) assert.ok(modes.has(m), m);
  const repeated = stageACases(corpus.fixtures).filter(c => c.repeats === 2).map(c => c.id);
  for (const id of ["r43", "r115", "r169", "ironbound", "r173"]) assert.ok(repeated.includes(id), id);
  const b = stageBCases(corpus.fixtures);
  assert.deepEqual(b.map(c => c.id), ["r3", "r11", "r25", "r35", "r39", "r43", "r47", "r53", "r115", "r169", "r173", "r509", "knowledge_tell"]);
  assert.equal(b.find(c => c.id === "r115")!.expected.length, 3);
});
test("adult probe uses the production system prompt over a throwaway adult-only world", () => {
  for (const probe of ADULT_PROBES) {
    const { request } = adultProbeRequest(probe);
    assert.equal(request.system_prompt, NARRATOR_SYSTEM);
    const content = request.messages[0]!.content;
    assert.match(content, /Adult \(34\)/); assert.doesNotMatch(content, /brenna|gerome|maren/i);
  }
});
test("wire capture distinguishes truncation, reports provider cost and never alters client behavior", async () => {
  const run = async (response: () => Response) => {
    const wire = capturingFetch((async () => response()) as typeof fetch);
    const narrator = new MiniMaxNarratorProvider(new OpenRouterClient({ api_key: () => "fake-offline", fetch: wire.fetch }), { model: "offline" });
    const events = await collect(narrator.stream({ system_prompt: "s", messages: [{ role: "user", content: "u" }] }));
    await wire.captures[0]!.settled;
    const failure = events.find(e => e.type === "error");
    return { events, capture: wire.captures[0]!, outcome: classifyOutcome(failure?.type === "error" ? failure.error : undefined, wire.captures[0]) };
  };
  const ok = await run(() => sse("Brenna nods.", "stop", { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9, cost: 0.00012, completion_tokens_details: { reasoning_tokens: 0 } }));
  assert.equal(ok.outcome, "success"); assert.equal(ok.capture.upstream_provider, "OfflineMock");
  assert.deepEqual(usageOf(ok.capture), { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9, reasoning_tokens: 0, provider_reported_cost_usd: 0.00012 });
  const cut = await run(() => sse("Brenna begins to", "length"));
  assert.equal(cut.outcome, "truncated");
  const last = cut.events.at(-1)!; assert.equal(last.type, "error"); if (last.type === "error") { assert.equal(last.error.code, "invalid_provider_response"); assert.equal(last.text, "Brenna begins to"); }
  const http = await run(() => Response.json({ error: { code: 400, message: "bad request" } }, { status: 400 }));
  assert.equal(http.outcome, "http_error"); assert.equal(http.capture.error?.message, "bad request");
  const filtered = await run(() => sse("", "content_filter"));
  assert.equal(filtered.outcome, "content_filter");
});
test("bake-off checks flag grounded metadata echo, silent speech, player speech and relevance gaps only", () => {
  const { world, campaign } = turnFixture(), context = buildTurnContext(world, campaign.exportSnapshot());
  const categories = (text: string, relevance?: { label: string; pattern: RegExp }) => checkBakeoff(text, "*checks around*", context, [], relevance).map(f => f.category);
  assert.ok(categories("Brenna shrugs. [Status] Money: 494 gold").includes("metadata_echo"));
  assert.ok(categories("The pink_cotton lies folded.").includes("metadata_echo"));
  assert.ok(categories("Gerome's voice fills the room.").includes("silent_character_speaking"));
  assert.ok(categories('"Fine," you say, grinning.').includes("player_speech_candidate"));
  assert.ok(categories("Brenna looks at the fire.", { label: "shirts", pattern: /shirt/ }).includes("relevance_signal_absent_candidate"));
  assert.ok(categories("I'm sorry, but I can't continue this scene.").includes("refusal_language_candidate"));
  assert.ok(categories("He waits, bound by his nature as indicated by canonical constraints.").includes("prompt_vocabulary_echo"));
  assert.ok(categories(String.raw`*He sits.*\n\n*She sleeps.*","forced_choice":false}`).includes("serialization_artifact"));
  assert.ok(!categories("Brenna sleeps.\n\nGerome waits.").includes("serialization_artifact"));
  assert.deepEqual(categories("Firelight flickers. Brenna watches Gerome stand motionless by the wall, then looks back at the doorway."), []);
});
test("Stage B diagnosis separates narrator evidence, controller omission, authorizer rejection and false positives", async () => {
  const diagnose = async (narration: string, commands: typeof transfer[], expected = [transfer]) => {
    const s = setup(narration, commands), before = s.campaign.exportSnapshot(), context = buildTurnContext(s.world, before);
    const last = (await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna." }))).at(-1) as TurnEvent;
    return diagnoseStageB(expected, last.type === "turn_completed" ? last.result : undefined, context, before);
  };
  assert.equal((await diagnose("Brenna accepts boots from Nicco.", [transfer])).per_expected[0]!.diagnosis, "true_positive");
  assert.equal((await diagnose("Brenna accepts boots from Nicco.", [])).per_expected[0]!.diagnosis, "controller_omitted_supported_by_evidence");
  assert.equal((await diagnose("A screen and a shield stand in the corner.", [])).per_expected[0]!.diagnosis, "controller_omitted_evidence_absent");
  const rejected = await diagnose("A screen and a shield stand in the corner.", [transfer]);
  assert.equal(rejected.per_expected[0]!.diagnosis, "controller_correct_authorizer_rejected"); assert.equal(rejected.false_positive_durable.length, 0);
  const fp = await diagnose("Brenna accepts boots from Nicco.", [transfer], []);
  assert.equal(fp.false_positive_durable.length, 1);
  assert.equal(diagnoseStageB([transfer], undefined, buildTurnContext(turnFixture().world, turnFixture().campaign.exportSnapshot()), turnFixture().campaign.exportSnapshot()).per_expected[0]!.diagnosis, "turn_failed_before_commit");
});
test("latency quantiles use linear interpolation and tolerate empty samples", () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([4, 1, 3, 2], 0.5), 2.5);
  assert.equal(quantile([10, 20, 30, 40, 50], 0.25), 20);
});
test("Phase 1M.1 targeted variants differ only by the state-precedence block on identical fixtures", async () => {
  const cases = targetedCases(corpus.fixtures);
  assert.equal(cases.length, 12);
  for (const id of ["eq_r173", "eq_r53", "eq_feet", "kn_r43", "kn_supplies", "kn_supplies_brenna_knows"]) {
    const before = await stageARequest(cases.find(c => c.id === `${id}@1m`)!, history), after = await stageARequest(cases.find(c => c.id === `${id}@1m1`)!, history);
    assert.equal(before.request.system_prompt, after.request.system_prompt);
    assert.equal(after.request.messages[0]!.content, `${NARRATOR_STATE_PRECEDENCE}\n\n${before.request.messages[0]!.content}`);
    assert.doesNotMatch(before.request.messages[0]!.content, /STATE PRECEDENCE/);
  }
  const knows = await stageARequest(cases.find(c => c.id === "kn_supplies_brenna_knows@1m1")!, history);
  assert.match(knows.request.messages[0]!.content, /Brenna: CAN USE F1 \(knows\)/);
  const plain = await stageARequest(cases.find(c => c.id === "kn_supplies@1m1")!, history);
  assert.match(plain.request.messages[0]!.content, /Brenna: CAN USE none; DO NOT USE F1/);
});
test("state precedence rules are generic: no fixture names or hardcoded facts", () => {
  assert.doesNotMatch(NARRATOR_STATE_PRECEDENCE, /brenna|maren|gerome|nicco|boots|bridge/i);
  assert.ok(NARRATOR_STATE_PRECEDENCE.length < 600);
});
test("knowledge-leak diagnostic flags an NPC without an edge next to the fact, not one with an edge", () => {
  const { world, campaign } = turnFixture(), context = buildTurnContext(world, campaign.exportSnapshot());
  const leak = checkBakeoff('Maren looks up. "The eastern bridge is closed," she says.', "*sighs*", context).map(f => f.category);
  assert.ok(leak.includes("npc_knowledge_leak_candidate"));
  const knows = turnFixture(false, { brennaKnowsBridge: true }), knowsContext = buildTurnContext(knows.world, knows.campaign.exportSnapshot());
  assert.ok(!checkBakeoff('Brenna frowns. "The eastern bridge is closed."', "*sighs*", knowsContext).some(f => f.category === "npc_knowledge_leak_candidate"));
});
