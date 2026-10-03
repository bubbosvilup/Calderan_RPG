/** D-04 closure: frozen semantic probes, guarded paid narrator calls, real session lifecycle. */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { prepareD04BakeoffCases } from "./d04-compaction-bakeoff.js";
import { createD04CrowdedContext } from "./d04-context-baseline.js";
import { analyzeLosslessLayouts, LosslessContextCompactor } from "../turn/lossless-context-compaction.js";
import { narratorPackOf, contextHash } from "../turn/narrator-pack.js";
import { ContextBudgetManager } from "../turn/context-budget.js";
import { DEFAULT_COMPACTION_POLICY } from "../turn/context-compaction.js";
import { LOSSLESS_SCHEMA_VERSION, LOSSLESS_POLICY_VERSION } from "../turn/lossless-knowledge.js";
import { MiniMaxNarratorProvider, NARRATOR_PROVIDER_ROUTING } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { ProviderError } from "../llm/errors.js";
import type { NarratorProvider, NarratorResult } from "../llm/narrator-provider.js";
import type { GenerationRequest } from "../llm/types.js";
import type { NarratorRequest } from "../turn/stages/narration.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { GameSession, type SessionEvent } from "../app/game-session.js";
import { FileCampaignRepository } from "../persistence/campaign-repository.js";
import { passiveResponseAudit, finishPassiveAudits } from "./passive-response-audit.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { DeepReadonly } from "../types/readonly.js";

const OUT = resolve("saves/d04-context/final-live"), MODEL = "z-ai/glm-5.2";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const write = async (name: string, value: unknown) => writeFile(resolve(OUT, name), JSON.stringify(value, null, 2) + "\n", "utf8");
const metadata = { model: "offline-controller-spy", usage: {}, latency: { request_started_at: "offline", headers_ms: null, time_to_first_token_ms: null, completed_at: "offline", elapsed_total_ms: 0 } };
export const D04_LIVE_PROBES = [
  { id: "A1", case: "A", input: 'I ask D04 Person 0, "According to Ledger 0, when did the sealed harbor shipment arrive, and what did the keeper verify?"', must: ["Shipment arrived at sunset; keeper verified wax.", "D04 Person 0 may use Ledger 0."], must_not: ["Different time, ledger, owner, cargo or new physical ledger possession."] },
  { id: "A2", case: "A", input: 'I ask D04 Person 6, "What did the keeper record in Ledger 15 about the sealed harbor shipment?"', must: ["Keeper recorded the debt; Ledger 15 is a distinct fact.", "D04 Person 6 may use this knowledge."], must_not: ["Invent debt amount, creditor, item or new ledger location."] },
  { id: "B1", case: "B", input: 'I ask Maren, "Does Brenna know whether the western keeper has a key?"', must: ["Maren communicates that Brenna does not know whether the keeper has a key."], must_not: ["Brenna knows; keeper definitely has or lacks a key; confuse western keeper with warehouse ownership."] },
  { id: "B2", case: "B", input: 'I ask Maren, "Who do you believe owns the southern warehouse?"', must: ["Maren expresses her belief that the keeper owns the southern warehouse, with attribution to her belief."], must_not: ["Omniscient/objective confirmation of ownership; invented owner or evidence proving belief."] },
  { id: "B3", case: "B", input: 'I ask Maren, "Could the sealed box contain the missing ledger, and did the harbor shipment arrive before sunset?"', must: ["Box containing missing ledger remains a suspicion.", "Arrival before sunset remains uncertain."], must_not: ["Confirm contents or arrival; claim evidence or inspection establishes either."] },
  { id: "B4", case: "B", input: 'I ask Brenna, "What can you tell me about Ironbound?"', must: ["Brenna does not voice/use Maren-only private Ironbound fact; a guarded or non-informative response is acceptable."], must_not: ["Guild of smiths revealed through Brenna or omniscient narration; grant Nicco/Brenna private knowledge; Maren volunteers the private fact unasked; Gerome speaks."] },
  { id: "C1", case: "C", input: 'I ask D04 Person 0, "In the harbor ledger, what does Ledger 0 Entry 1 record, and what does Ledger 1 Entry 1 record?"', must: ["Ledger 0 Entry 1: keeper counted sealed crates against harbor ledger.", "Ledger 1 Entry 1: watchman checked wax mark before gate closed."], must_not: ["Swap ledger subjects/entries; physical crate inspection or travel; dictionary syntax as world text."] },
  { id: "C2", case: "C", input: 'I ask D04 Person 4, "While I compare the harbor ledger, what did you just say you would do until I finish reading?"', must: ["D04 Person 4 continues prior promise to wait here/keep place while Nicco compares numbered entries."], must_not: ["Wrong speaker; prior dialogue changes location/equipment; invented past completed action; treat dialogue as authoritative state change."] },
  { id: "C3", case: "C", input: 'I stay in the square and ask, "What does the supplied lore say about the Inquisition, and is that describing what is happening here now?"', must: ["Answer Inquisition from supplied retrieval canon; distinguish lore from current Heartstone square scene."], must_not: ["Place Inquisition agents/activities in current scene without state evidence; movement; unsupported lore, schedules or past events."] },
] as const;
const FLOW_INPUT = 'I ask D04 Person 0, "What does Ledger 0 Entry 1 record about the sealed crates?"';
const FLOW_CONSTRAINTS = { must: ["Keeper counted sealed crates against harbor ledger; D04 Person 0 answers at Heartstone square.", "Activated V2 dictionary used on actual next turn; original authority used by controller."], must_not: ["Wrong ledger/subject, invented cargo/location/action or representation syntax.", "Semantic revision/reroll; compressed narrator data as authority; compaction mutates campaign."] };
const FILES = ["src/turn/prompt-builder.ts", "src/turn/lossless-knowledge.ts", "src/turn/lossless-context-compaction.ts", "src/turn/narrator-pack.ts", "src/turn/context-budget.ts", "src/turn/context-compaction.ts", "src/llm/openrouter/minimax-narrator.ts", "src/turn/turn-coordinator.ts", "src/app/game-session.ts", "src/app/production.ts", "src/dev/d04-compaction-bakeoff.ts", "src/dev/d04-final-live.ts"];
async function fingerprints() { return Object.fromEntries(await Promise.all(FILES.map(async path => [path, sha(await readFile(path, "utf8"))]))); }

/** Observation accepts the same annotated/unannotated requests as production apply, including revision prompts. */
export function observeLosslessApply(compactor: LosslessContextCompactor, request: NarratorRequest, manager = new ContextBudgetManager()) {
  const activated = compactor.apply(request);
  return { activated, observation: { source_hash: narratorPackOf(request)?.source_hash ?? null, changed: activated !== request, budget: manager.measure(activated), request_hash: contextHash(activated) } };
}

/** No replacement contextRequest, forced apply, policy overrides or paid setup calls. */
export async function runD04Lifecycle(narrator: NarratorProvider) {
  const descriptions = ["the keeper counted the sealed crates against the harbor ledger", "the watchman checked the wax mark before the gate closed", "the porter recorded the warehouse door and the delivery time", "the clerk compared the receipt with the household account", "the buyer reserved the empty cart until the morning tide", "the steward retained the original invoice for the outstanding debt", "the ferryman noted the quay and the captain who signed", "the guard inspected the manifest without opening the sealed box", "the messenger left the signed copy at the west warehouse", "the owner confirmed the delivery against the old purchase record"];
  const f = await createD04CrowdedContext({ statement: index => `Ledger ${index}: ` + Array.from({ length: 20 }, (_, j) => `Entry ${j + 1} records that ${descriptions[(index + j) % descriptions.length]}.`).join(" ") });
  const manager = new ContextBudgetManager(), compactor = new LosslessContextCompactor(undefined, manager), service = new RetrievalService(f.world);
  let coordinator: TurnCoordinator, narratorCalls = 0, controllerCalls = 0, controllerPrior = "", actual: NarratorRequest | undefined;
  const applications: ReturnType<typeof observeLosslessApply>["observation"][] = [];
  let diagnostics: DeepReadonly<TurnDiagnostics> | undefined;
  const instrumented = { compact: compactor.compact.bind(compactor), apply(request: NarratorRequest) { const observed = observeLosslessApply(compactor, request, manager); applications.push(observed.observation); return observed.activated; } };
  const monitored: NarratorProvider = { generate: narrator.generate.bind(narrator), async *stream(request) { narratorCalls++; actual ??= { system_prompt: request.system_prompt, messages: request.messages }; yield* narrator.stream(request); } };
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, resolve(OUT, "unused-saves")), compaction_service: instrumented,
    createCoordinator(hooks) { coordinator = new TurnCoordinator(f.world, monitored, { async propose(request) { controllerCalls++; controllerPrior = request.prior_state; return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { context_compaction: instrumented, provider_retry: false, diagnostics_sink(record) { diagnostics = record; hooks.diagnostics_sink(record); } });
      // Bounded finalized conversation: ordinary authored dialogue, seeded offline before the frozen test begins.
      for (let i = 0; i < 12; i++) coordinator.recent(f.campaign).add({ player: `I ask D04 Person ${i % 7} to wait while I compare the harbor ledger. I read through the numbered entries, comparing the keeper, the watchman, the porter, the clerk, the buyer, the steward, the ferryman, the guard, the messenger and the owner mentioned in the records. I remain in the square and do not handle any cargo. I keep reading the same numbered entries.`, narration: `D04 Person ${i % 7} says, "I can wait here while you compare the numbered entries. The sealed copies are on the same page; I will keep my place until you have finished reading."`, status: "finalized" });
      return coordinator; }, provider_status: { mode: "live", configured: true, narrator_model: MODEL, controller_model: "offline-controller-spy" } }, f.campaign);
  const initialState = JSON.stringify(f.campaign.exportSnapshot()), before = session.getView().context_budget!;
  assert.equal(before.compaction_required, true, `Lifecycle fixture must exceed auto watermark: ${JSON.stringify(before)}`);
  const raw = coordinator!.contextRequest(f.campaign), selected = analyzeLosslessLayouts(raw, manager).best!;
  const events: SessionEvent[] = []; let blocked: ReturnType<GameSession["submitPlayerInput"]> | undefined;
  let finish!: () => void; const completed = new Promise<void>(resolveDone => finish = resolveDone);
  const rejected = await session.submitPlayerInput(FLOW_INPUT, { onEvent(event) { events.push(event); if (event.type === "status_changed" && event.status === "compacting_context" && !blocked) blocked = session.submitPlayerInput("I wait."); if (event.type === "context_compaction_completed") finish(); } });
  await completed;
  const blockedOutcome = await blocked!, ready = session.getView(), maintenanceCalls = narratorCalls;
  assert.equal(rejected.ok, false); assert.equal(blockedOutcome.ok, false); assert.equal(maintenanceCalls, 0);
  assert.equal(JSON.stringify(f.campaign.exportSnapshot()), initialState);
  assert.equal(ready.session.status, "idle"); assert.equal(ready.context_compaction?.last_result?.status, "success");
  assert.ok(ready.context_budget!.usage_ratio <= DEFAULT_COMPACTION_POLICY.normal_ratio);
  const activated = compactor.apply(raw); assert.notEqual(activated, raw);
  const maintenance = { before, after: ready.context_budget, target: ready.context_compaction!.last_result!.diagnostics!.target_budget_tokens, layout: selected.candidate.layout, saving_tokens: before.estimated_tokens - ready.context_budget!.estimated_tokens, provider_compressor_calls: 0, blocked_error: !blockedOutcome.ok ? blockedOutcome.error.code : null, preflight_error: !rejected.ok ? rejected.error.code : null, maintenance_narrator_calls: maintenanceCalls, ready: ready.session.status, state_unchanged: JSON.stringify(f.campaign.exportSnapshot()) === initialState, activated_hash: contextHash(activated), activated_source_hash: narratorPackOf(activated)!.source_hash };
  const outcome = await session.submitPlayerInput(FLOW_INPUT);
  const match = actual ? applications.find(a => a.request_hash === contextHash(actual!)) : undefined;
  const authority = controllerPrior ? JSON.parse(controllerPrior) as { context: { facts: { statement: string }[] } } : undefined;
  const result = { maintenance, next_turn: { ok: outcome.ok, narrator_calls: narratorCalls, controller_calls: controllerCalls, activated: match?.changed ?? false, measured_request_matches: !!match && isDeepStrictEqual(match.budget, manager.measure(actual!)), actual_budget: actual ? manager.measure(actual) : null, actual_hash: actual ? contextHash(actual) : null, source_matches: match?.source_hash === maintenance.activated_source_hash, controller_original_facts: !!authority?.context.facts.some(fact => fact.statement.startsWith("Ledger 0: Entry 1 records that the keeper counted")), controller_representation_leakage: /LOSSLESS KNOWLEDGE DATA|D0\.\d+=|group_refs|d04-lossless-grouping/.test(controllerPrior), audit: diagnostics?.audit ?? null, commit: diagnostics?.commit ?? null, state_after_turn_unchanged: JSON.stringify(f.campaign.exportSnapshot()) === initialState, outcome, actual_request: actual ?? null, controller_prior: controllerPrior }, events };
  await session.shutdown({ discard_unsaved: true }); return result;
}
const offlineNarrator: NarratorProvider = { async generate() { return { text: "The square remains quiet.", ...metadata }; }, async *stream() { yield { type: "text_delta", text: "The square remains quiet." }; yield { type: "completed", result: { text: "The square remains quiet.", ...metadata } }; } };
async function prepare() {
  const originals = await prepareD04BakeoffCases();
  for (const key of ["A", "B", "C"] as const) { const saved = JSON.parse(await readFile(`saves/d04-context/bakeoff/case-${key}.json`, "utf8")); assert.deepEqual(originals[key].narrator_validation_pack.request, saved.narrator_validation_pack.request); assert.deepEqual(originals[key].compression_request, saved.compression_request); }
  const probes = [];
  for (const probe of D04_LIVE_PROBES) {
    const cases = await prepareD04BakeoffCases({ [probe.case]: probe.input }), original = originals[probe.case].narrator_validation_pack, pack = cases[probe.case].narrator_validation_pack;
    assert.deepEqual(pack.source.units, original.source.units, `${probe.id}: original source units changed`);
    assert.equal(pack.source_hash, original.source_hash);
    const analysis = analyzeLosslessLayouts(pack.request), best = analysis.best!;
    const canonical = analyzeLosslessLayouts(original.request).best!;
    assert.equal(best.candidate.layout, canonical.candidate.layout);
    const v2Frozen = JSON.parse(await readFile(`saves/d04-context/bakeoff-v2/case-${probe.case}.json`, "utf8"));
    assert.deepEqual(canonical.request, v2Frozen.request, "Frozen V2 renderer output changed");
    probes.push({ ...probe, layout: best.candidate.layout, source_hash: pack.source_hash, baseline: analysis.baseline, after: best.budget, request_hash: contextHash(best.request), request: best.request });
  }
  const flow = await runD04Lifecycle(offlineNarrator);
  assert.equal(flow.next_turn.ok, true); assert.equal(flow.next_turn.narrator_calls, 1); assert.equal(flow.next_turn.activated, true, "Real next turn must reuse activated representation");
  assert.equal(flow.next_turn.source_matches, true); assert.equal(flow.next_turn.measured_request_matches, true); assert.equal(flow.next_turn.controller_original_facts, true); assert.equal(flow.next_turn.controller_representation_leakage, false);
  return { schema: LOSSLESS_SCHEMA_VERSION, policy: LOSSLESS_POLICY_VERSION, model: MODEL, provider: NARRATOR_PROVIDER_ROUTING[MODEL], max_tokens: 512, timeout_ms: 60_000, disable_reasoning: true, controller: "offline-controller-spy (production model configuration remains qwen/qwen3.8-flash)", compressor: "UNSET", fingerprints: await fingerprints(), probes, flow_input: FLOW_INPUT, flow_constraints: FLOW_CONSTRAINTS, flow_preflight: flow,
    acceptance: { target_calls: 10, absolute_maximum: 12, retries: 0, semantic_rerolls: 0, minimum_pass: 9, hard_failures_allowed: 0, required_lifecycle_pass: true, manual_review: "Every output against frozen MUST/MUST-NOT; irrelevant facts/style are not failures; safety failure never averaged away." } };
}
async function main() {
  await mkdir(OUT, { recursive: true });
  if (process.argv.includes("--freeze")) {
    try { await access(resolve(OUT, "freeze.json")); throw new Error("Freeze already exists; never overwrite after live results."); } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
    const frozen = await prepare(); await write("freeze.json", frozen); await write("freeze.sha256.json", { sha256: sha(JSON.stringify(frozen, null, 2) + "\n") });
    console.log(JSON.stringify({ frozen: true, probes: frozen.probes.map(({ id, layout, after }) => ({ id, layout, tokens: after.estimated_tokens })), flow: frozen.flow_preflight.maintenance, next_turn: { ...frozen.flow_preflight.next_turn, actual_request: "ignored raw file", controller_prior: "ignored raw file", outcome: "offline rehearsal" } })); return;
  }
  if (!process.argv.includes("--live")) throw new Error("Use --freeze or --live");
  const frozenRaw = await readFile(resolve(OUT, "freeze.json"), "utf8"), frozen = JSON.parse(frozenRaw) as Awaited<ReturnType<typeof prepare>>;
  const expectedHash = JSON.parse(await readFile(resolve(OUT, "freeze.sha256.json"), "utf8")); assert.equal(sha(frozenRaw), expectedHash.sha256);
  assert.deepEqual(await fingerprints(), frozen.fingerprints, "Frozen implementation changed");
  assert.ok(process.env.OPENROUTER_API_KEY?.trim(), "Narrator key missing"); assert.ok(!process.env.CONTEXT_COMPRESSOR_MODEL?.trim(), "Production compressor must remain UNSET");
  const catalog = await (await fetch("https://openrouter.ai/api/v1/models")).json() as { data: { id: string }[] }; assert.ok(catalog.data.some(m => m.id === MODEL), "Exact narrator model unavailable");
  const marker = await import("node:fs/promises"); const guard = await marker.open(resolve(OUT, "paid-run-started.json"), "wx"); await guard.writeFile(JSON.stringify({ at: new Date().toISOString(), freeze_sha256: expectedHash.sha256 })); await guard.close();
  let attempts = 0; const audits: Promise<void>[] = [];
  const client = new OpenRouterClient({ fetch: async (input, init) => {
    if (attempts >= 12) throw new ProviderError("configuration_error");
    const index = ++attempts; await write(`transport-${index}-request.json`, JSON.parse(String(init?.body)));
    const response = await fetch(input, init); await write(`transport-${index}-status.json`, { status: response.status, ok: response.ok });
    audits.push(passiveResponseAudit(response, text => writeFile(resolve(OUT, `transport-${index}-response.txt`), text, "utf8"))); return response;
  } });
  const production = new MiniMaxNarratorProvider(client, { model: MODEL });
  const results: { id: string; success: boolean; attempts: number; result?: NarratorResult; error?: string; elapsed_ms: number }[] = [];
  for (const probe of frozen.probes) {
    const started = performance.now(), before = attempts;
    try { const result = await production.generate(probe.request); results.push({ id: probe.id, success: true, attempts: attempts - before, result, elapsed_ms: performance.now() - started }); }
    catch (error) { results.push({ id: probe.id, success: false, attempts: attempts - before, error: error instanceof ProviderError ? error.code : "harness_error", elapsed_ms: performance.now() - started }); }
    await write("results.json", results); console.log(JSON.stringify({ id: probe.id, ...results.at(-1), result: results.at(-1)?.result ? { ...results.at(-1)!.result, text: "saved for manual review" } : undefined }));
  }
  let flowCalls = 0;
  const flowNarrator: NarratorProvider = { generate: production.generate.bind(production), async *stream(request: GenerationRequest) {
    // Keep a semantic audit failure as a failure: never pay for a reconciliation reroll.
    if (++flowCalls > 1) { yield { type: "error", text: "", incomplete: true, error: new ProviderError("configuration_error") }; return; }
    assert.equal(contextHash({ system_prompt: request.system_prompt, messages: request.messages }), frozen.flow_preflight.next_turn.actual_hash, "Actual live lifecycle request differs from frozen preflight");
    const started = performance.now(), before = attempts;
    for await (const event of production.stream(request)) {
      if (event.type === "completed") { results.push({ id: "E2E", success: true, attempts: attempts - before, result: event.result, elapsed_ms: performance.now() - started }); await write("results.json", results); }
      if (event.type === "error") { results.push({ id: "E2E", success: false, attempts: attempts - before, error: event.error.code, elapsed_ms: performance.now() - started }); await write("results.json", results); }
      yield event;
    }
  } };
  const flow = await runD04Lifecycle(flowNarrator); await write("live-flow.json", flow); await finishPassiveAudits(audits);
  const costs = results.flatMap(r => r.result?.cost_usd === undefined ? [] : [r.result.cost_usd]);
  await write("run-summary.json", { attempts, retries: 0, semantic_rerolls: 0, flow_generation_requests: flowCalls, reported_cost_usd: costs.reduce((a, b) => a + b, 0), reported_cost_calls: costs.length, result_count: results.length, frozen_sha256: expectedHash.sha256 });
  console.log(JSON.stringify({ attempts, reported_cost: costs.reduce((a, b) => a + b, 0), flow_ok: flow.next_turn.ok, activated: flow.next_turn.activated, flow_generation_requests: flowCalls }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
