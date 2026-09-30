import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import { TurnCoordinator, type TurnDebugRecord } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { DeepSeekStateControllerProvider } from "../src/llm/openrouter/deepseek-controller.js";
import { normalizeControllerOutput, NORMALIZATION_RULE } from "../src/llm/controller-schema.js";
import { ProviderError } from "../src/llm/errors.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Controller Reliability Pass 1: lossless structural normalization and omission diagnostics. */
const ITEM = "campaign_item_regression_leather_boots";
const TRANSFER = { kind: "transfer_item", item_id: ITEM, owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } };
/** Exact live output captured in Repair 1.2 (Sister Mereth). */
const MERETH = '{"commands":[{"kind":"transfer_item","item_id":"campaign_item_regression_leather_boots","owner_id":"nicco","position":{"kind":"carried","character_id":"nicco"},"evidence":"Nicco takes the boots from her."}]}';
const world = await loadWorld("data");
const provider = (content: string, onFetch?: () => void) => new DeepSeekStateControllerProvider(new OpenRouterClient({ api_key: () => "test-key-not-real", fetch: (async () => { onFetch?.(); return Response.json({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 } }); }) as typeof fetch }));
const propose = (content: string) => provider(content).propose({ player_action: "", prior_state: "", final_narration: "" });
function scene(npcs: readonly string[], owner = "sister_mereth", holder = owner) {
  const c = createOpeningCampaign(world, `reliability_${npcs.join("_") || "alone"}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { character_movements: npcs.map(id => ({ character_id: id, current_location: "heartstone_square" })) } },
    { kind: "register_item", item: { id: ITEM, origin: { kind: "created" }, name: "pair of leather boots", owner_id: owner, position: { kind: "carried", character_id: holder } } }] });
  return c;
}
const narrator = (text: string): NarratorProvider => ({ async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } });
async function turn(c: CampaignState, text: string, content: string, onFetch?: () => void, records: TurnDebugRecord[] = []) {
  const service = new RetrievalService(world);
  const events = await collect(new TurnCoordinator(world, narrator(text), provider(content, onFetch), { service, search: new HybridSearch(service) }, { debug_sink: r => records.push(r) }).runTurn({ campaign: c, player_input: "Sister Mereth gives Nicco a pair of leather boots." }));
  return { last: events.at(-1)!, events, records };
}

// ------------------------------------------------------------------------------------------------------------- positive
test("reliability: the exact Mereth hybrid output normalizes losslessly and strict-parses", async () => {
  const n = normalizeControllerOutput(MERETH);
  assert.deepEqual([n.attempted, n.rule, n.raw_shape], [true, NORMALIZATION_RULE, "commands[flat_with_evidence]"]);
  assert.deepEqual(JSON.parse(n.normalized_json!), { commands: [{ command: TRANSFER, evidence_quote: "Nicco takes the boots from her." }] });
  const result = await propose(MERETH);
  assert.deepEqual(result.commands, [TRANSFER]); assert.deepEqual(result.evidence, ["Nicco takes the boots from her."]);
  assert.equal(result.normalization!.rule, NORMALIZATION_RULE); assert.equal(result.normalization!.final_parse, "ok"); assert.equal(result.normalization!.raw_text, MERETH);
});
test("reliability: canonical output is untouched; several command kinds normalize independently", async () => {
  const canonical = JSON.stringify({ commands: [{ command: TRANSFER, evidence_quote: "Nicco takes the boots." }] });
  const plain = await propose(canonical);
  assert.equal(plain.normalization, undefined); assert.deepEqual(plain.commands, [TRANSFER]);
  assert.equal(normalizeControllerOutput(canonical).reason, "nothing_to_normalize");
  const knowledge = { kind: "set_knowledge", knowledge: { character_id: "sister_mereth", fact_id: "campaign_fact_nicco_light_mage", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
  const condition = { kind: "set_condition", character_id: "sister_mereth", conditions: ["minor_injury"] };
  const mixed = JSON.stringify({ commands: [{ ...TRANSFER, evidence: "Nicco takes the boots." }, { ...knowledge, evidence_quote: "Nicco tells her." }, { ...condition, evidence: "Her lip bleeds." }, { command: TRANSFER, evidence_quote: "again" }] });
  const n = normalizeControllerOutput(mixed);
  assert.equal(n.rule, NORMALIZATION_RULE);
  assert.equal(n.raw_shape, "commands[flat_with_evidence,flat_with_evidence_quote,flat_with_evidence,canonical]");
  assert.deepEqual(JSON.parse(n.normalized_json!).commands.map((c: { command: { kind: string } }) => c.command.kind), ["transfer_item", "set_knowledge", "set_condition", "transfer_item"]);
});

// ------------------------------------------------------------------------------------------------------------- negative
test("reliability: anything not uniquely lossless still fails strict parsing", async () => {
  const flat = (extra: Record<string, unknown>) => JSON.stringify({ commands: [{ ...TRANSFER, ...extra }] });
  const cases: readonly [string, string, RegExp][] = [
    ["invalid JSON", "{\"commands\":[", /invalid_json/],
    ["ambiguous hybrid (nested command beside flat fields)", JSON.stringify({ commands: [{ ...TRANSFER, command: TRANSFER, evidence_quote: "x" }] }), /conflicting_nested_and_flat/],
    ["conflicting evidence fields", flat({ evidence: "a", evidence_quote: "b" }), /conflicting_evidence_fields/],
    ["missing command field", JSON.stringify({ commands: [{ kind: "transfer_item", item_id: ITEM, position: TRANSFER.position, evidence: "x" }] }), /command_does_not_match_schema/],
    ["unknown extra field", flat({ evidence: "x", confidence: 0.9 }), /command_does_not_match_schema/],
    ["malformed position", JSON.stringify({ commands: [{ ...TRANSFER, position: { kind: "floating" }, evidence: "x" }] }), /command_does_not_match_schema/],
    ["unknown command kind", JSON.stringify({ commands: [{ kind: "set_trust", from_character_id: "a", to_character_id: "b", trust: 5, evidence: "x" }] }), /command_does_not_match_schema/],
    ["evidence not a string", flat({ evidence: ["x"] }), /evidence_not_string/],
    ["flat entry without evidence beside evidence entries", JSON.stringify({ commands: [TRANSFER, { ...TRANSFER, evidence: "x" }] }), /missing_evidence/],
    ["extra top-level key", JSON.stringify({ commands: [{ ...TRANSFER, evidence: "x" }], note: "hi" }), /top_level_shape/],
  ];
  for (const [label, content, reason] of cases) {
    assert.match(normalizeControllerOutput(content).reason, reason, label);
    await assert.rejects(propose(content), (e: unknown) => e instanceof ProviderError && e.code === "structured_output_invalid" && !!e.diagnostic?.normalization && e.diagnostic.normalization.rule === null, label);
  }
});

// ----------------------------------------------------------------------------------------- authorization not bypassed
test("reliability: a normalized proposal still needs evidence, ownership, presence and a current revision", async () => {
  const handover = "Sister Mereth hands the boots to Nicco. Nicco takes the boots from her.";
  // Valid: present owner-holder, verified handover → committed.
  const ok = scene(["sister_mereth"]);
  const good = await turn(ok, handover, MERETH);
  assert.equal(good.last.type, "turn_completed");
  assert.equal((good.last as { result: TurnResult }).result.authorization[0]!.authorized, true);
  assert.equal(ok.exportSnapshot().items[0]!.owner_id, "nicco");
  assert.ok(good.records.some(r => r.kind === "controller_normalized"));
  assert.ok(!JSON.stringify(good.events).includes("controller_normalized"), "normalization diagnostics are never in player-facing events");
  // No handover narrated → not authorized, nothing committed (and the draft cannot claim it).
  const noEvidence = scene(["sister_mereth"]);
  const a = await turn(noEvidence, "Sister Mereth holds the boots out toward Nicco.", MERETH);
  assert.equal((a.last as { result: TurnResult }).result.authorization[0]!.authorized, false); assert.equal(noEvidence.exportSnapshot().items[0]!.owner_id, "sister_mereth");
  // Ownership: Mereth carries boots Elara owns → rejected.
  const notOwner = scene(["sister_mereth"], "mistress_elara", "sister_mereth");
  const b = await turn(notOwner, handover, MERETH);
  assert.equal((b.last as { result: TurnResult }).result.authorization[0]!.reason, "rejected_reference_invalid"); assert.equal(notOwner.exportSnapshot().items[0]!.owner_id, "mistress_elara");
  // Presence: Mereth is not in the scene → rejected.
  const absent = scene([]);
  const c = await turn(absent, handover, MERETH);
  assert.equal((c.last as { result: TurnResult }).result.authorization[0]!.reason, "rejected_reference_invalid"); assert.equal(absent.exportSnapshot().items[0]!.owner_id, "sister_mereth");
  // Revision: state changes while the controller runs → stale turn, no commit.
  const stale = scene(["sister_mereth"]);
  const d = await turn(stale, handover, MERETH, () => stale.apply({ expected_revision: stale.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }));
  assert.equal(d.last.type, "turn_failed"); assert.equal((d.last as { code: string }).code, "stale_turn"); assert.equal(stale.exportSnapshot().items[0]!.owner_id, "sister_mereth");
});

// ----------------------------------------------------------------------------------------------- omission diagnostic
test("reliability: an empty proposal beside a verified narrated candidate is recorded as an omission, never synthesized", async () => {
  const c = scene(["sister_mereth"]);
  const r = await turn(c, "Sister Mereth hands the boots to Nicco. Nicco takes the boots from her.", '{"commands":[]}');
  assert.equal(c.exportSnapshot().items[0]!.owner_id, "sister_mereth", "no command is synthesized");
  const omission = r.records.filter(x => x.kind === "controller_omission_candidate");
  assert.equal(omission.length, 1);
  assert.deepEqual((omission[0] as Extract<TurnDebugRecord, { kind: "controller_omission_candidate" }>).candidate, TRANSFER);
  assert.ok(!JSON.stringify(r.events).includes("controller_omission_candidate"));
  // Without narrated evidence an empty proposal is not an omission.
  const quiet = await turn(scene(["sister_mereth"]), "Sister Mereth holds the boots out toward Nicco.", '{"commands":[]}');
  assert.equal(quiet.records.filter(x => x.kind === "controller_omission_candidate").length, 0);
});
