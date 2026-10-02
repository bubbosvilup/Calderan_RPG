import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { runPlayTurn } from "../src/dev/play-turn.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { mockController, mockNarrator } from "./turn-fixtures.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { reflectAfterTurn, reflectionEvidence, validateProposals, type Proposal, type ReflectionProvider } from "../src/turn/reflection.js";
import type { ReflectionDiagnostics } from "../src/turn/reflection-diagnostics.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { TurnEvent } from "../src/turn/turn-types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { CampaignState } from "../src/campaign/campaign-state.js";

function household(due = false) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: "campaign_household_home", character_id: "brenna" },
  ] });
  if (due) for (const dimension of ["trust", "respect"] as const) f.campaign.apply({ expected_revision: f.campaign.revision,
    commands: [{ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension, direction: "raise" }] });
  const service = new RetrievalService(f.world);
  return { ...f, coordinator: new TurnCoordinator(f.world, mockNarrator("Brenna smiles."), mockController([]), { service, search: new HybridSearch(service) }) };
}
const proposal = (text: string, evidence_refs: string[], label = "recurring_injury"): Proposal => ({ kind: "signature_pattern", label, text, evidence_refs, confidence: "medium" });

for (const failure of ["provider", "malformed", "stale", "rejected"] as const) test(`post-turn ${failure} cannot alter or reclassify the completed gameplay turn`, async () => {
  const f = household(true), published: TurnEvent[] = [], diagnostic: DeepReadonly<ReflectionDiagnostics>[] = [];
  let afterGameplay: ReturnType<typeof f.campaign.exportSnapshot> | undefined;
  const provider: ReflectionProvider = { async reflect(request) {
    assert.equal(published.at(-1)?.type, "turn_completed"); afterGameplay = f.campaign.exportSnapshot();
    if (failure === "provider") throw new Error("private failure");
    if (failure === "malformed") return { text: "not JSON" };
    if (failure === "stale") f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] });
    return { text: JSON.stringify({ proposals: failure === "rejected" ? [proposal("A recurring secret injury.", request.evidence.slice(0, 2).map(e => e.ref))] : [] }), usage: { prompt_tokens: 10, completion_tokens: 3, private_evidence: "NEVER_LOG" } };
  } };
  const runs = await runPlayTurn({ ...f, request: { campaign: f.campaign, player_input: "I smile." }, publish: e => published.push(e), reflection_provider: provider, reflection_diagnostics_sink: d => diagnostic.push(d) });
  assert.equal(published.filter(e => e.type === "turn_completed").length, 1); assert.equal(published.some(e => e.type === "turn_failed"), false);
  assert.equal(runs[0]?.status, failure === "provider" ? "provider_failed" : failure === "malformed" ? "malformed" : failure === "stale" ? "stale" : "committed");
  if (failure === "provider" || failure === "malformed") assert.equal(f.campaign.exportSnapshot(), afterGameplay);
  if (failure === "stale") { assert.equal(f.campaign.revision, afterGameplay!.revision + 1); assert.equal(diagnostic[0]?.characters[0]?.stale_drop, true); }
  assert.equal(f.campaign.exportSnapshot().premium_reflections.flatMap(r => r.notes).length, 0);
  assert.equal(JSON.stringify(diagnostic).includes("NEVER_LOG"), false); assert.equal(JSON.stringify(diagnostic).includes("secret injury"), false);
});

test("not due makes no provider call; failed/cancelled gameplay does not even check reflection", async () => {
  const f = household(), diagnostics: unknown[] = []; let calls = 0;
  const provider: ReflectionProvider = { async reflect() { calls++; return { text: '{"proposals":[]}' }; } };
  await runPlayTurn({ ...f, request: { campaign: f.campaign, player_input: "I smile." }, publish: () => {}, reflection_provider: provider, reflection_diagnostics_sink: d => diagnostics.push(d) });
  assert.equal(calls, 0); assert.equal((diagnostics[0] as ReflectionDiagnostics).skipped_reason, "not_due");
  await runPlayTurn({ ...f, request: { campaign: f.campaign, player_input: "" }, publish: () => {}, reflection_provider: provider, reflection_diagnostics_sink: d => diagnostics.push(d) });
  assert.equal(diagnostics.length, 1); assert.equal(calls, 0);
  const signal = AbortSignal.abort();
  await runPlayTurn({ ...f, request: { campaign: f.campaign, player_input: "I smile.", signal }, publish: () => {}, reflection_provider: provider }); assert.equal(calls, 0);
});

test("normal CLI source uses the tested post-turn path and runTurn stays at its 164-line baseline", async () => {
  const cli = await readFile("src/dev/play.ts", "utf8"), coordinator = await readFile("src/turn/turn-coordinator.ts", "utf8");
  assert.match(cli, /await runPlayTurn\(/); assert.match(cli, /new OpenRouterReflectionProvider\(/);
  assert.doesNotMatch(coordinator, /reflectAfterTurn|runPlayTurn|ReflectionProvider/);
  const body = coordinator.slice(coordinator.indexOf("  async *runTurn("), coordinator.lastIndexOf("\n  }") + 4);
  assert.ok(body.trimEnd().split("\n").length <= 164);
});

for (const wording of ["recurring", "repeated", "repeatedly", "often", "habitual", "pattern of repeated"])
  test(`one condition episode cannot support '${wording}'`, () => {
    const f = household();
    for (const conditions of [["recovering", "injured"], ["recovering"]]) f.campaign.apply({ expected_revision: f.campaign.revision,
      commands: [{ kind: "set_condition", character_id: "brenna", conditions }] });
    const catalog = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "brenna").filter(e => e.kind === "development" && /condition/.test(e.text));
    const result = validateProposals([proposal(`Shows ${wording} injury.`, catalog.map(e => e.ref), "injury_history")], catalog, { id: "brenna", name: "Brenna" }, new Map());
    assert.equal(result.accepted.length, 0); assert.equal(result.rejected[0]?.reason, "insufficient_distinct_episodes");
  });

test("two distinct condition additions support recurrence; removal and unrelated evidence cannot manufacture it", () => {
  const f = household();
  const commit = (...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  commit({ kind: "set_condition", character_id: "brenna", conditions: ["recovering", "injured"] });
  commit({ kind: "set_condition", character_id: "brenna", conditions: ["recovering"] });
  commit({ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  commit({ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "respect", direction: "raise" });
  let catalog = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "brenna");
  const validate = () => validateProposals([proposal("Recurring injury interrupts her routine.", catalog.filter(e => e.kind === "development").map(e => e.ref))], catalog, { id: "brenna", name: "Brenna" }, new Map());
  assert.equal(validate().rejected[0]?.reason, "insufficient_distinct_episodes");
  commit({ kind: "set_condition", character_id: "brenna", conditions: ["recovering", "injured"] });
  catalog = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "brenna"); assert.equal(validate().accepted.length, 1);
});

test("same-revision evidence is deduplicated and aggregate entries alone cannot license recurrence", () => {
  const f = household(true), catalog = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "brenna");
  const refs = catalog.filter(e => e.kind === "development").slice(0, 2).map(e => e.ref);
  const changed = catalog.map(e => ({ ...e, episodes: [{ id: "same_episode" }] }));
  assert.equal(validateProposals([proposal("Often expresses cautious trust.", refs, "cautious_trust")], changed, { id: "brenna", name: "Brenna" }, new Map()).rejected[0]?.reason, "insufficient_distinct_episodes");
  const rolled = [{ ref: "rollup", kind: "rollup" as const, text: "two entries", events: 2, strong: true, others: [], episodes: [] }];
  assert.equal(validateProposals([proposal("Recurring setbacks.", ["rollup"])], rolled, { id: "brenna", name: "Brenna" }, new Map()).rejected[0]?.reason, "insufficient_distinct_episodes");
});

test("safe diagnostics include attempts, counts, revisions, tokens and timings; failing sinks do not change commit", async () => {
  const f = household(true), records: DeepReadonly<ReflectionDiagnostics>[] = [];
  const provider: ReflectionProvider = { async reflect(request) { return { text: JSON.stringify({ proposals: [
    { ...proposal("Approaches Nicco cautiously.", ["npcrel:brenna:nicco"], "cautious"), kind: "stance" },
    proposal("Recurring secret motives.", request.evidence.slice(0, 2).map(e => e.ref)),
  ] }), usage: { prompt_tokens: 123, completion_tokens: 24 } }; } };
  const runs = await reflectAfterTurn(f.campaign, f.world, provider, { diagnostics_sink: d => { records.push(d); throw new Error("sink"); } });
  const d = records[0]!; assert.equal(d.attempted, 1); assert.equal(d.due_count, 1); assert.equal(d.characters[0]?.provider_success, true);
  assert.equal(d.characters[0]?.parsed_proposals, 2); assert.equal(d.characters[0]?.accepted_proposals, 1); assert.equal(d.characters[0]?.input_tokens, 123);
  assert.equal(d.characters[0]?.output_tokens, 24); assert.equal(d.characters[0]?.committed_revision, f.campaign.revision);
  assert.ok(d.elapsed_ms >= 0); assert.ok(d.characters[0]!.provider_ms >= 0); assert.equal(runs[0]?.status, "committed");
  assert.equal(JSON.stringify(d).includes("Approaches"), false); assert.throws(() => Object.assign(d, { attempted: 3 }), TypeError);
  const s = f.campaign.exportSnapshot();
  assert.deepEqual(CampaignState.restore(f.world, decodeSave(serializeSave(createSaveFile(s, f.world, "2026-10-02T18:00:00.000Z"), f.world), f.world).snapshot).exportSnapshot(), s);
});


test("due normal play commits accepted reflection only after publication", async () => {
  const f = household(true); let published = false;
  let gameplay: ReturnType<typeof f.campaign.exportSnapshot> | undefined;
  const runs = await runPlayTurn({ ...f, request: { campaign: f.campaign, player_input: "I smile." },
    publish: e => { if (e.type === "turn_completed") { published = true; gameplay = f.campaign.exportSnapshot(); } },
    reflection_provider: { async reflect() {
      assert.equal(published, true);
      return { text: JSON.stringify({ proposals: [{ ...proposal("Approaches Nicco cautiously.", ["npcrel:brenna:nicco"], "cautious"), kind: "stance" }] }) };
    } } });
  assert.equal(runs[0]?.accepted.length, 1); assert.equal(runs[0]?.status, "committed");
  const { revision: beforeRevision, premium_reflections: _beforeNotes, ...before } = gameplay!;
  const { revision: afterRevision, premium_reflections: afterNotes, ...after } = f.campaign.exportSnapshot();
  assert.deepEqual(after, before); assert.equal(afterRevision, beforeRevision + 1);
  assert.equal(afterNotes[0]?.notes.length, 1);
});

test("condition episode guard survives real history consolidation and checks recurrence in labels", () => {
  const f = household();
  const commit = (...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  commit({ kind: "set_condition", character_id: "brenna", conditions: ["recovering", "injured"] });
  commit({ kind: "set_condition", character_id: "brenna", conditions: ["recovering"] });
  for (let i = 0; i < 20; i++) commit({ kind: "move_character", character_id: "brenna", location_id: i % 2 ? "test_room" : "test_hall" });
  let catalog = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "brenna");
  const rollup = catalog.find(e => e.kind === "rollup")!;
  assert.ok(rollup); assert.equal(rollup.episodes?.filter(e => e.condition === "injured").length, 1);
  const validate = (refs: string[]) => validateProposals([proposal("Injury interrupts her routine.", refs)], catalog, { id: "brenna", name: "Brenna" }, new Map());
  assert.equal(validate([rollup.ref]).rejected[0]?.reason, "insufficient_distinct_episodes");
  commit({ kind: "set_condition", character_id: "brenna", conditions: ["recovering", "injured"] });
  catalog = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "brenna");
  const addition = catalog.find(e => e.episodes?.some(ep => ep.condition === "injured"))!;
  assert.equal(validate([rollup.ref, addition.ref]).accepted.length, 1);
});
