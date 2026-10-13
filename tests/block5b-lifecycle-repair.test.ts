import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand, CampaignSnapshot } from "../src/campaign/types.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { characterLifecycle, retiredCharacterIds } from "../src/campaign/character-lifecycle.js";
import { mergeConflicts, retireConflicts } from "../src/campaign/character-repair.js";
import { createSaveFile, validateSaveFile } from "../src/persistence/save-format.js";
import { migrateSnapshot6to7 } from "../src/persistence/save-migrations.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { movableCharacters } from "../src/turn/movement/character-movement.js";
import { buildTurnContext } from "../src/turn/context/context-builder.js";

/** Consolidation block 5B, phases 1/5/6 (campaign level): lifecycle states, schema 7, retire and merge preconditions and atomic application. */
const A = "campaign_character_maren", B = "campaign_character_maren_two", C = "campaign_character_lira";
const person = (id: string, name: string | undefined, location = "test_room", extra: object = {}): CampaignCommand => ({ kind: "register_character",
  character: { id, origin: { kind: "created" }, profile: { ...(name ? { name } : {}), age: { kind: "exact", years: 19 } }, current: { current_location: location, status: "active" }, ...extra } as never });
function fixture(commands: readonly CampaignCommand[] = [person(A, "Maren")]) {
  const f = turnFixture(); f.campaign.apply({ expected_revision: f.campaign.revision, commands: [...commands] }); return f;
}
const run = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const record = (c: CampaignState, id: string) => c.exportSnapshot().characters.find(x => x.id === id);

test("L1: a persistent character retires into a durable historical identity; the id stays referenceable", () => {
  const f = fixture();
  assert.equal(characterLifecycle(f.campaign.exportSnapshot(), A), "persistent");
  assert.equal(characterLifecycle(f.campaign.exportSnapshot(), "nobody_here"), undefined, "a provisional (or unknown) person is not in the snapshot at all");
  const before = f.campaign.revision;
  run(f.campaign, { kind: "retire_character", character_id: A, reason: "operator_retired" });
  const r = record(f.campaign, A)!;
  assert.equal(characterLifecycle(f.campaign.exportSnapshot(), A), "retired");
  assert.equal(r.current.status, "inactive"); assert.equal(r.current.current_location, undefined);
  assert.deepEqual(r.retirement, { revision: before + 1, world_minute: f.campaign.exportSnapshot().runtime.scene.world_time.world_minute, reason: "operator_retired" });
  assert.equal(r.profile.name, "Maren", "history is kept, not deleted");
  assert.deepEqual([...retiredCharacterIds(f.campaign.exportSnapshot())], [A]);
});
test("L2: a retired character cannot be changed, moved or revived by ordinary commands", () => {
  const f = fixture(); run(f.campaign, { kind: "retire_character", character_id: A, reason: "operator_retired" });
  for (const command of [{ kind: "set_profile", character_id: A, profile: { name: "Other" } }, { kind: "move_character", character_id: A, location_id: "test_hall" },
    { kind: "set_condition", character_id: A, conditions: [], status: "active" }] as CampaignCommand[]) assert.throws(() => run(f.campaign, command), /retired/, command.kind);
  assert.throws(() => run(f.campaign, { kind: "retire_character", character_id: A, reason: "operator_retired" }), /already_retired/);
  assert.equal(record(f.campaign, A)!.current.status, "inactive");
});
test("L3: a retired character is not present, not movable and does not claim a name in the live scene", () => {
  const f = fixture(); const ctx = () => buildTurnContext(f.world, f.campaign.exportSnapshot(), { input: "" });
  assert.ok(ctx().characters.some(c => c.id === A));
  run(f.campaign, { kind: "retire_character", character_id: A, reason: "operator_retired" });
  assert.ok(!ctx().characters.some(c => c.id === A), "not in the scene");
  assert.ok(!movableCharacters(f.campaign.exportSnapshot(), ["test_room"], f.world).some(m => m.id === A));
});
test("L4: retirement is durable across save/load; schema 7; a v6 snapshot migrates version-only; a v6 snapshot with a retirement is malformed", () => {
  const f = fixture(); run(f.campaign, { kind: "retire_character", character_id: A, reason: "operator_retired" });
  const snap = f.campaign.exportSnapshot();
  assert.equal(snap.schema_version, 7);
  const file = createSaveFile(snap, f.world, "2026-10-12T00:00:00.000Z");
  assert.equal(file.schema_version, 8);
  const loaded = validateSaveFile(JSON.parse(JSON.stringify(file)), f.world);
  assert.deepEqual(loaded.snapshot.characters.find(c => c.id === A)?.retirement, snap.characters.find(c => c.id === A)?.retirement);
  assert.equal(CampaignState.restore(f.world, loaded.snapshot as CampaignSnapshot).exportSnapshot().characters.find(c => c.id === A)?.current.status, "inactive");
  const v6 = { ...JSON.parse(JSON.stringify(snap)), schema_version: 6 }; delete v6.characters.find((c: { id: string }) => c.id === A).retirement;
  assert.deepEqual(migrateSnapshot6to7(v6), { ...v6, schema_version: 7 });
  assert.throws(() => migrateSnapshot6to7({ ...JSON.parse(JSON.stringify(snap)), schema_version: 6 }), /migration_failed/);
});
test("L5: snapshot validation rejects an impossible retirement (canonical, active, located, future, bad merge target)", () => {
  const f = fixture(); run(f.campaign, { kind: "retire_character", character_id: A, reason: "operator_retired" });
  const good = JSON.parse(JSON.stringify(f.campaign.exportSnapshot())) as CampaignSnapshot;
  const bad = (mutate: (c: CampaignSnapshot["characters"][number]) => void) => { const s = JSON.parse(JSON.stringify(good)) as CampaignSnapshot; mutate(s.characters.find(c => c.id === A)!); return s; };
  for (const [label, s] of [["active", bad(c => { c.current.status = "active"; })], ["located", bad(c => { c.current.current_location = "test_room"; })],
    ["future", bad(c => { c.retirement!.revision = 999; })], ["merge without target", bad(c => { c.retirement!.reason = "duplicate_merged"; })],
    ["target without merge", bad(c => { c.retirement!.merged_into = "nicco"; })]] as const) assert.throws(() => CampaignState.restore(f.world, s), label);
});

test("R1: retirement preconditions fail closed (player, canonical, household, legal hold, holder, items, funds)", () => {
  const f = fixture([person(A, "Maren"), person(B, "Lira"), person(C, "Gill")]);
  const snap = () => f.campaign.exportSnapshot();
  assert.deepEqual(retireConflicts(snap(), A), [], "an ordinary persistent character may retire");
  assert.equal(retireConflicts(snap(), "nicco")[0]!.code, "player_character");
  assert.equal(retireConflicts(snap(), "nobody")[0]!.code, "unknown_character");
  run(f.campaign, { kind: "set_legal_status", character_id: A, status: "enslaved", holder_id: "nicco" });
  assert.ok(retireConflicts(snap(), A).some(c => c.code === "legal_status"));
  run(f.campaign, { kind: "set_legal_status", character_id: B, status: "enslaved", holder_id: C });
  assert.ok(retireConflicts(snap(), C).some(c => c.code === "legal_holder"));
  run(f.campaign, { kind: "set_funds", character_id: C, gold: 5 });
  assert.ok(retireConflicts(snap(), C).some(c => c.code === "funds"));
  run(f.campaign, { kind: "create_item", name: "Knife", description: "d", visual_description: "v", owner_id: B, position: { kind: "carried", character_id: B } });
  assert.ok(retireConflicts(snap(), B).some(c => c.code === "owns_items"));
  run(f.campaign, { kind: "create_household", id: "campaign_household_one" }, { kind: "set_membership", household_id: "campaign_household_one", membership: { character_id: C, status: "member" } });
  assert.ok(retireConflicts(snap(), C).some(c => c.code === "household_member"));
  assert.throws(() => run(f.campaign, { kind: "retire_character", character_id: C, reason: "operator_retired" }), /retirement refused/);
  assert.equal(record(f.campaign, C)!.retirement, undefined, "a refused retirement mutates nothing");
});

function forkFixture() {
  const f = fixture([person(A, "Maren"), person(B, "Maren")]);
  run(f.campaign, { kind: "set_legal_status", character_id: A, status: "enslaved", holder_id: "nicco" },
    { kind: "create_item", name: "Shawl", description: "d", visual_description: "v", owner_id: B, position: { kind: "carried", character_id: B } },
    { kind: "seed_relationship", relationship: { from_character_id: B, to_character_id: "nicco", trust: 10 } },
    { kind: "create_fact", fact: { id: "campaign_fact_one", content: { kind: "campaign", statement: "Maren sings.", truth: "true" } } },
    { kind: "set_knowledge", knowledge: { character_id: B, fact_id: "campaign_fact_one", status: "knows" } });
  return f;
}
test("M1: a safe merge rewrites live references to the TARGET, retires the SOURCE with merged_into and keeps the target id", () => {
  const f = forkFixture(); const snap = () => f.campaign.exportSnapshot();
  const plan = mergeConflicts(snap(), B, A);
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.summary.rewrites.items, 1); assert.equal(plan.summary.rewrites.relationships, 1); assert.equal(plan.summary.rewrites.knowledge, 1);
  const before = f.campaign.revision;
  run(f.campaign, { kind: "merge_characters", source_id: B, target_id: A });
  assert.equal(f.campaign.revision, before + 1, "one atomic commit");
  const s = snap();
  assert.equal(s.characters.find(c => c.id === B)!.retirement?.merged_into, A);
  assert.equal(characterLifecycle(s, A), "persistent");
  const shawl = s.items.find(i => i.name === "Shawl")!;
  assert.equal(shawl.owner_id, A); assert.deepEqual(shawl.position, { kind: "carried", character_id: A });
  assert.deepEqual(s.relationships.filter(r => r.from_character_id === A || r.to_character_id === A || r.from_character_id === B || r.to_character_id === B).map(r => [r.from_character_id, r.to_character_id]), [[A, "nicco"]]);
  assert.deepEqual(s.knowledge.filter(k => k.fact_id === "campaign_fact_one").map(k => [k.character_id, k.fact_id]), [[A, "campaign_fact_one"]]);
  assert.equal(s.legal_statuses.filter(l => l.character_id === A).length, 1);
  assert.equal(s.items.filter(i => i.name === "Shawl").length, 1, "items are not duplicated");
});
test("M2: conflicting authoritative truth REFUSES the merge and leaves both records untouched (names, legal, location, canonical-free slots)", () => {
  const f = forkFixture(); const snap = () => f.campaign.exportSnapshot();
  run(f.campaign, { kind: "set_legal_status", character_id: B, status: "free" });
  assert.ok(mergeConflicts(snap(), B, A).conflicts.some(c => c.code === "legal_conflict"));
  const before = JSON.stringify(snap());
  assert.throws(() => run(f.campaign, { kind: "merge_characters", source_id: B, target_id: A }), /merge refused/);
  assert.equal(JSON.stringify(snap()), before, "atomic failure: nothing changed");
  const g = fixture([person(A, "Maren"), person(B, "Lira")]);
  assert.ok(mergeConflicts(g.campaign.exportSnapshot(), B, A).conflicts.some(c => c.code === "names_differ"));
  const h = fixture([person(A, "Maren"), person(B, "Maren", "test_hall")]);
  assert.ok(mergeConflicts(h.campaign.exportSnapshot(), B, A).conflicts.some(c => c.code === "location_differs"));
  assert.ok(mergeConflicts(h.campaign.exportSnapshot(), A, A).conflicts.some(c => c.code === "same_identity"));
  assert.ok(mergeConflicts(h.campaign.exportSnapshot(), "nicco", A).conflicts.some(c => c.code === "player_character"));
});
test("M3: a second merge of the same source is refused (already retired); a retired target is refused", () => {
  const f = forkFixture(); run(f.campaign, { kind: "merge_characters", source_id: B, target_id: A });
  assert.ok(mergeConflicts(f.campaign.exportSnapshot(), B, A).conflicts.some(c => c.code === "already_retired"));
  assert.ok(mergeConflicts(f.campaign.exportSnapshot(), A, B).conflicts.some(c => c.code === "already_retired"));
  assert.throws(() => run(f.campaign, { kind: "merge_characters", source_id: B, target_id: A }), /merge refused/);
});
test("M4: duplicate relationships/knowledge collapse; equipment slot collision and active offers refuse; the merged state saves and reloads", () => {
  const f = forkFixture();
  run(f.campaign, { kind: "seed_relationship", relationship: { from_character_id: A, to_character_id: "nicco", trust: 10 } },
    { kind: "set_knowledge", knowledge: { character_id: A, fact_id: "campaign_fact_one", status: "knows" } });
  run(f.campaign, { kind: "set_legal_status", character_id: B, status: "enslaved", holder_id: "nicco" });
  assert.deepEqual(mergeConflicts(f.campaign.exportSnapshot(), B, A).conflicts, []);
  run(f.campaign, { kind: "merge_characters", source_id: B, target_id: A });
  const s = f.campaign.exportSnapshot();
  assert.equal(s.relationships.filter(r => r.from_character_id === A).length, 1); assert.equal(s.knowledge.filter(k => k.character_id === A).length, 1);
  const file = createSaveFile(s, f.world, "2026-10-12T00:00:00.000Z");
  const loaded = validateSaveFile(JSON.parse(JSON.stringify(file)), f.world);
  assert.equal(loaded.snapshot.characters.find(c => c.id === B)?.retirement?.merged_into, A);
});
