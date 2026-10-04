import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { mannerismEpistemicState } from "../src/campaign/mannerisms.js";
import { MANNERISM_SEEDS } from "../src/campaign/mannerism-seeds.js";
import type { CharacterMannerism, CampaignSnapshot } from "../src/campaign/types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { MannerismPortrayalGate, type PackedMannerism, type PortrayalGateInput } from "../src/turn/mannerism-portrayal-gate.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { mockNarrator, mockController, collect } from "./turn-fixtures.js";

const characters = [{ id: "brenna", name: "Brenna" }, { id: "maren", name: "Maren" }, { id: "gerome", name: "Gerome" }, { id: "nicco", name: "Nicco" }];
function cue(key: string, id = "maren", state: CharacterMannerism["epistemic_state"] = "emergent"): PackedMannerism {
  const seed = MANNERISM_SEEDS.find(s => s.canonical_key === key)!;
  return { character_id: id, character_name: characters.find(c => c.id === id)!.name, mannerism: { ...seed, id: "cue_test", source: "seeded", created_revision: 2, user_edited: false, epistemic_state: state!, known_by_character_ids: [] } };
}
const inspect = (narration: string, c: PackedMannerism, evidence = "", player_input = "") => new MannerismPortrayalGate().inspect({ turn_id: "fixture:r2:t1", revision: 2, narration, cues: [{ ...c, local_evidence: evidence }], characters, player_input, include_local_text: true });
function rig() {
  const f = turnFixture(); f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_shadow" },
    { kind: "set_membership", household_id: "campaign_household_shadow", membership: { character_id: "nicco", role: "owner", status: "member" } },
    { kind: "join_household", household_id: "campaign_household_shadow", character_id: "maren" },
    { kind: "set_knowledge", knowledge: { character_id: "maren", fact_id: "campaign_fact_bridge_closed", status: "knows" } },
  ] });
  const m = f.campaign.exportSnapshot().premium_characters[0]!.mannerisms![0]!;
  f.campaign.deleteMannerism({ expected_revision: f.campaign.revision, character_id: "maren", id: m.id });
  const seed = MANNERISM_SEEDS.find(s => s.canonical_key === "head_level_before_correction")!;
  f.campaign.addMannerism({ expected_revision: f.campaign.revision, character_id: "maren", definition: { canonical_key: seed.canonical_key, text: seed.text } });
  return f;
}
test("D26 source differs from recurrence; conservative legacy/default/edit semantics", () => {
  const c = cue("gaze_lower_before_lie").mannerism as CharacterMannerism;
  delete c.epistemic_state; assert.equal(mannerismEpistemicState(c), "emergent");
  c.source = "user"; assert.equal(mannerismEpistemicState(c), "emergent");
  c.source = "emergent"; assert.equal(mannerismEpistemicState(c), "established");
  c.user_edited = true; assert.equal(mannerismEpistemicState(c), "emergent");
  const f = rig(), m = f.campaign.exportSnapshot().premium_characters[0]!.mannerisms![0]!;
  assert.equal(m.source, "user"); assert.equal(m.epistemic_state, "emergent"); assert.deepEqual(m.known_by_character_ids, []);
});
test("D26 epistemic status/awareness persist, legacy fields remain absent and derive without fake evidence", () => {
  const f = rig(), snapshot = structuredClone(f.campaign.exportSnapshot()) as CampaignSnapshot;
  const m = snapshot.premium_characters[0]!.mannerisms![0]!; m.epistemic_state = "observed"; m.known_by_character_ids = ["nicco"];
  const restored = decodeSave(serializeSave(createSaveFile(snapshot, f.world, "2026-10-04T00:00:00.000Z"), f.world), f.world);
  assert.equal(restored.snapshot.premium_characters[0]!.mannerisms![0]!.epistemic_state, "observed");
  assert.deepEqual(restored.snapshot.premium_characters[0]!.mannerisms![0]!.known_by_character_ids, ["nicco"]);
  delete m.epistemic_state; delete m.known_by_character_ids;
  const legacy = CampaignState.restore(f.world, snapshot).exportSnapshot().premium_characters[0]!.mannerisms![0]!;
  assert.equal(mannerismEpistemicState(legacy), "emergent"); assert.equal(legacy.known_by_character_ids, undefined);
});
test("D26 compact packed status contains no provenance and preserves conditional text", () => {
  const f = rig(), s = f.campaign.exportSnapshot();
  const p = buildNarratorPrompt("Maren", buildTurnContext(f.world, s, { input: "Maren" }), [], undefined, { candidates: [], runtime: [] });
  const text = JSON.stringify(p); assert.ok(text.includes("Levels their head before correcting a spoken detail. [recurrence=emergent; recognized_by=nobody]"));
  assert.ok(text.includes("observed records an occurrence, not a habit"));
  for (const word of ["created_revision", "user_edited", "canonical_key", "known_by_character_ids", "cue_test"]) assert.ok(!text.includes(word));
});
test("D26 known conditional failures and attached habitual claim detected", () => {
  const a = inspect("Brenna leaves a short pause, the habitual one, then stays silent.", cue("pause_before_name", "brenna"), "Nobody is speaking or preparing to address anyone.");
  assert.deepEqual(a.findings.map(f => f.gate_rule), ["OUT_OF_TRIGGER", "UNSUPPORTED_RECURRENCE"]);
  const b = inspect('Maren levels her head. "It is closed," she agrees.', cue("head_level_before_correction"), "Nicco's statement is factually correct; no mistaken detail.");
  assert.equal(b.findings[0]!.gate_rule, "OUT_OF_TRIGGER");
});
test("D26 valid triggers, neutral/generic physical actions and unrelated recurrence words ignored", () => {
  for (const text of ["Maren tilts her head toward the window.", "Maren waits for a while.", "Maren glances toward the door again. The bridge is usually closed.", "Maren levels her head. Brenna makes her usual movement toward the window."]) assert.equal(inspect(text, cue("head_level_before_correction")).gate_findings_total, 0);
  assert.equal(inspect("Brenna pauses to catch her breath.", cue("pause_before_name", "brenna"), "Nobody is speaking.").gate_findings_total, 0);
  assert.equal(inspect("Gerome lowers his gaze before telling an obvious lie.", cue("gaze_lower_before_lie", "gerome"), "An obvious lie.").gate_findings_total, 0);
  assert.equal(inspect('Maren levels her head. "The bridge is closed."', cue("head_level_before_correction"), "Maren is about to correct a mistaken statement.").gate_findings_total, 0);
});
test("D26 awareness independent of established recurrence; known observers supported", () => {
  const c = cue("gaze_lower_before_lie", "gerome", "established"), text = 'Gerome lowers his gaze. Brenna says, "He does that sometimes."';
  assert.deepEqual(inspect(text, c).findings.map(f => f.gate_rule), ["UNSUPPORTED_AWARENESS"]);
  (c.mannerism as CharacterMannerism).known_by_character_ids = ["brenna"];
  assert.equal(inspect(text, c).gate_findings_total, 0);
  assert.equal(inspect("Gerome lowers his gaze, his familiar movement.", c).gate_findings_total, 0);
});
test("D26 observed is not a broad habit; finding snapshots survive later epistemic changes", () => {
  const c = cue("pause_before_name", "brenna", "observed");
  const r = inspect("Brenna leaves a short pause, the habitual pause.", c);
  assert.equal(r.findings[0]!.epistemic_state_at_generation, "observed");
  (c.mannerism as CharacterMannerism).epistemic_state = "established"; (c.mannerism as CharacterMannerism).known_by_character_ids!.push("nicco");
  assert.equal(r.findings[0]!.epistemic_state_at_generation, "observed"); assert.deepEqual(r.findings[0]!.known_by_at_generation, []);
});
test("D26 malformed/no-finding paths never throw or mutate inputs", () => {
  const input: PortrayalGateInput = { turn_id: "t", revision: 1, narration: "Maren sits quietly.", cues: [cue("head_level_before_correction")], characters, player_input: "" };
  const before = structuredClone(input); assert.equal(new MannerismPortrayalGate().inspect(input).gate_findings_total, 0); assert.deepEqual(input, before);
  assert.equal(new MannerismPortrayalGate().inspect({ ...input, narration: null as unknown as string }).status, "invalid_input");
});
test("D26 production lifecycle logs final deliverable, no repair/provider calls/authority effects", async () => {
  const f = rig(); f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "set_condition", character_id: "maren", conditions: [], presentation: "Nicco's statement is factually correct; no mistaken detail." }] });
  const service = new RetrievalService(f.world); let narratorCalls = 0; let diagnostics: import("../src/types/readonly.js").DeepReadonly<import("../src/turn/turn-diagnostics.js").TurnDiagnostics> | undefined;
  const text = 'Maren levels her head. "It is closed," she agrees.';
  const coordinator = new TurnCoordinator(f.world, mockNarrator(text, () => narratorCalls++), mockController([]), { service, search: new HybridSearch(service) }, { diagnostics_sink: d => { diagnostics = d; } });
  const before = f.campaign.exportSnapshot(); const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: 'Maren, hello.' }));
  const completed = events.find(e => e.type === "turn_completed"); assert.equal(completed?.type, "turn_completed");
  if (completed?.type === "turn_completed") assert.equal(completed.result.narration, text);
  assert.equal(narratorCalls, 1); assert.equal(diagnostics?.audit?.reconciliation_attempted, false);
  assert.equal(diagnostics?.mannerism_portrayal?.findings_by_rule.OUT_OF_TRIGGER, 1);
  assert.deepEqual(f.campaign.exportSnapshot().premium_characters, before.premium_characters);
});

test("D26 rejects nonexistent awareness references and manual edits reset recognition/history", () => {
  const f = rig(), snapshot = structuredClone(f.campaign.exportSnapshot()) as CampaignSnapshot;
  snapshot.premium_characters[0]!.mannerisms![0]!.known_by_character_ids = ["unknown_character"];
  assert.throws(() => CampaignState.restore(f.world, snapshot));
  const m = snapshot.premium_characters[0]!.mannerisms![0]!; m.known_by_character_ids = ["nicco"]; m.epistemic_state = "established";
  const campaign = CampaignState.restore(f.world, snapshot);
  campaign.editMannerism({ expected_revision: campaign.revision, character_id: "maren", id: m.id, definition: { canonical_key: m.canonical_key, text: m.text } });
  const edited = campaign.exportSnapshot().premium_characters[0]!.mannerisms![0]!;
  assert.equal(edited.epistemic_state, "emergent"); assert.deepEqual(edited.known_by_character_ids, []);
});
test("D26 ignores quoted actions and ambiguous pronouns; normal diagnostics redact local prose", () => {
  const c = cue("head_level_before_correction");
  assert.equal(inspect('Brenna says, "Maren levels her head, as is her usual gesture."', c, "Factually correct.").gate_findings_total, 0);
  assert.equal(inspect('Brenna says, \u201cMaren levels her head, as is her usual gesture.\u201d', c, "Factually correct.").gate_findings_total, 0);
  assert.equal(inspect('Brenna sits beside Maren. She levels her head, her usual gesture.', c).gate_findings_total, 0);
  const input: PortrayalGateInput = { turn_id: "safe", revision: 1, narration: 'Maren levels her head, her usual gesture. PRIVATE_SECRET_123', cues: [c], characters, player_input: "" };
  const result = new MannerismPortrayalGate().inspect(input);
  assert.equal(result.gate_findings_total, 1); assert.ok(!JSON.stringify(result).includes("PRIVATE_SECRET_123"));
});
