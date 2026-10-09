import test from "node:test";
import assert from "node:assert/strict";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignSnapshot } from "../src/campaign/types.js";
import { DatasetCompatibilityError } from "../src/campaign/snapshot-validation.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { WorldStore } from "../src/world/world-store.js";
import { characterView, equipmentSlot, remainingEventMinutes } from "../src/campaign/projections.js";
import { validateSaveFileWithReport, createSaveFile, decodeSave, serializeSave, validateSaveFile, type CampaignSaveFile } from "../src/persistence/save-format.js";
import { CampaignSaveError } from "../src/persistence/errors.js";
import { parseSaveJson } from "../src/persistence/strict-json.js";
import { a, b, c, boots, stored, event, goal, household, change, richCampaign } from "./persistence-fixtures.js";
import { fixtures, room, garden } from "./fixtures.js";
const now = "2026-09-27T10:00:00.000Z";

test("new snapshots normalize signed zero before export so JSON round trips are exact", () => {
  const world = new WorldStore(fixtures());
  const campaign = new CampaignState(world, "zero_campaign", { player_location: room, world_time: { world_minute: -0 } }, { current: -0, max: 100 });
  const before = campaign.exportSnapshot();
  assert.equal(Object.is(before.runtime.scene.world_time.world_minute, -0), false);
  assert.equal(Object.is(before.runtime.mana.current, -0), false);
  const restored = CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(before, world, now), world), world).snapshot);
  assert.deepEqual(restored.exportSnapshot(), before);
});

test("rich snapshot direct restore preserves every domain and unknown value", () => {
  const { world, campaign } = richCampaign(), before = campaign.exportSnapshot();
  const file = createSaveFile(before, world, now), json = serializeSave(file, world);
  const restored = CampaignState.restore(world, decodeSave(json, world).snapshot), after = restored.exportSnapshot();
  assert.deepEqual(after, before); assert.notEqual(after, before);
  assert.equal(after.runtime.mana.current, 13); assert.equal(after.runtime.scene.world_time.world_minute, 3100);
  assert.equal(after.runtime.scene.player_location, garden); assert.equal(characterView(after, world, "brenna").current.current_location, garden);
  assert.deepEqual(characterView(after, world, c).profile, {}); assert.deepEqual(characterView(after, world, c).current, {});
  assert.equal(characterView(after, world, "maren").profile.name, "maren");
  assert.equal(after.characters.find(v => v.id === "maren")!.profile.name, undefined);
  assert.deepEqual(characterView(after, world, "brenna").profile.aliases, ["Fixture nickname"]);
  assert.deepEqual(after.items.find(i => i.id === stored)!.position, { kind: "stored", location_id: room });
  assert.deepEqual(equipmentSlot(after, world, a, "feet"), { state: "occupied", item_id: boots, mode: "worn" });
  assert.equal(equipmentSlot(after, world, a, "head").state, "empty"); assert.equal(equipmentSlot(after, world, a, "hands").state, "unknown");
  assert.deepEqual(after.knowledge.map(k => [k.character_id, k.status]), [[a, "knows"], [b, "suspects"]]);
  assert.equal(after.knowledge.some(k => k.character_id === c), false); assert.equal(after.relationships.length, 1); assert.equal(after.relationships[0]!.trust, 35);
  assert.equal(after.goals.find(g => g.id === goal)!.status, "completed");
  assert.equal(after.households.find(h => h.id === household)!.members.find(m => m.character_id === b)!.status, "former_member");
  assert.equal(remainingEventMinutes(after, event), 8 * 1440);
  assert.deepEqual(after.characters.find(v => v.id === a)!.profile.aliases, ["Second", "First"]);
});

test("restore revision 87 directly; no command replay, recovery or receipt reuse", () => {
  const { world, campaign } = richCampaign(); const snapshot = structuredClone(campaign.exportSnapshot()) as CampaignSnapshot; snapshot.revision = 87;
  const oldReceipt = campaign.prepare({ expected_revision: campaign.revision, commands: [] });
  const legacy = RuntimeState.prototype.applySceneDelta, apply = CampaignState.prototype.apply;
  let restored: CampaignState;
  try {
    RuntimeState.prototype.applySceneDelta = () => { throw new Error("must not replay runtime"); };
    CampaignState.prototype.apply = () => { throw new Error("must not replay campaign"); };
    restored = CampaignState.restore(world, snapshot);
  } finally { RuntimeState.prototype.applySceneDelta = legacy; CampaignState.prototype.apply = apply; }
  assert.equal(restored.revision, 87); assert.equal(restored.exportSnapshot().runtime.mana.current, 13);
  assert.throws(() => restored.commit(oldReceipt), /foreign/);
  change(restored); assert.equal(restored.revision, 87);
  change(restored, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } }); assert.equal(restored.revision, 88);
  snapshot.characters[0]!.profile.name = "external mutation";
  assert.notEqual(restored.exportSnapshot().characters[0]!.profile.name, "external mutation");
  assert.throws(() => Object.assign(restored.exportSnapshot().runtime.mana, { current: 90 }), TypeError);
});

test("keyed array ordering does not turn a restored no-op into a revision change", () => {
  const { world, campaign } = richCampaign(); const s = structuredClone(campaign.exportSnapshot()) as CampaignSnapshot;
  s.characters.reverse(); s.items.reverse(); s.runtime.npc_locations.reverse(); s.households[0]!.members.reverse();
  const restored = CampaignState.restore(world, s); assert.deepEqual(restored.exportSnapshot(), s);
  const before = restored.exportSnapshot(); change(restored, { kind: "runtime_delta", delta: {} });
  assert.equal(restored.exportSnapshot(), before);
});

test("wall metadata differs while authoritative snapshots and deterministic serialization do not", () => {
  const { world, campaign } = richCampaign(); const s = campaign.exportSnapshot();
  const first = createSaveFile(s, world, now), second = createSaveFile(s, world, "2027-01-01T00:00:00.000Z");
  assert.notEqual(first.metadata.saved_at, second.metadata.saved_at); assert.deepEqual(first.snapshot, second.snapshot);
  assert.equal(serializeSave(first, world), serializeSave(first, world));
  const reversed = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(serializeSave(validateSaveFile(reversed, world), world), serializeSave(first, world));
  assert.ok(serializeSave(first, world).endsWith("\n")); assert.ok(serializeSave(first, world).includes('\n  "campaign_id"'));
  assert.equal(campaign.exportSnapshot(), s);
});

const corruptions: [string, (s: CampaignSnapshot) => void][] = [
  ["negative revision", s => { s.revision = -1; }], ["fractional minute", s => { s.runtime.scene.world_time.world_minute = 0.5; }],
  ["unsafe minute", s => { s.runtime.scene.world_time.world_minute = Number.MAX_SAFE_INTEGER + 1; }],
  ["mana over maximum", s => { s.runtime.mana = { current: 101, max: 100 }; }], ["negative mana", s => { s.runtime.mana = { current: -1, max: 100 }; }],
  ["duplicate NPC", s => { s.runtime.npc_locations[1] = s.runtime.npc_locations[0]!; }],
  ["wrong NPC type", s => { s.runtime.npc_locations[0]!.character_id = "nicco"; }],
  ["invalid player location", s => { s.runtime.scene.player_location = "brenna"; }],
  ["canonical origin missing", s => { s.characters.find(v => v.id === "brenna")!.origin = { kind: "canonical", canonical_entity_id: "missing" }; }],
  ["canonical location override", s => { s.characters.find(v => v.id === "brenna")!.current.current_location = room; }],
  ["created location missing", s => { s.characters.find(v => v.id === a)!.current.current_location = "missing"; }],
  ["bad created ID", s => { s.characters.find(v => v.id === c)!.id = "brenna"; }],
  ["duplicate character", s => { s.characters.push(s.characters[0]!); }],
  ["invalid owner", s => { s.items.find(i => i.id === boots)!.owner_id = "missing"; }],
  ["invalid holder", s => { s.items.find(i => i.id === boots)!.position = { kind: "carried", character_id: "missing" }; }],
  ["stored location missing", s => { s.items.find(i => i.id === stored)!.position = { kind: "stored", location_id: "missing" }; }],
  ["empty occupied slot", s => { s.characters.find(v => v.id === a)!.current.empty_slots!.push("feet"); }],
  ["duplicate equipped slot", s => { s.items.find(i => i.id === stored)!.position = { kind: "equipped", character_id: a, slot: "feet", mode: "worn" }; }],
  ["unknown household member", s => { s.households[0]!.members[0]!.character_id = "missing"; }],
  ["duplicate membership", s => { s.households[0]!.members.push(s.households[0]!.members[0]!); }],
  ["missing knowledge character", s => { s.knowledge[0]!.character_id = "missing"; }],
  ["dangling fact", s => { s.knowledge[0]!.fact_id = "missing"; }], ["duplicate knowledge", s => { s.knowledge.push(s.knowledge[0]!); }],
  ["bad canonical chunk", s => { s.facts.find(f => f.id === "campaign_fact_canon")!.content = { kind: "canonical", entity_id: "maren", chunk_id: "brenna.overview" }; }],
  ["missing provenance event", s => { s.knowledge[0]!.provenance!.source_event_id = "missing"; }],
  ["future provenance", s => { s.knowledge[0]!.provenance!.learned_at = 999999; }],
  ["relationship self-edge", s => { s.relationships[0]!.to_character_id = a; }],
  ["trust greater than 100", s => { s.relationships[0]!.trust = 101; }],
  ["relationship unknown endpoint", s => { s.relationships[0]!.to_character_id = "missing"; }],
  ["duplicate relationship", s => { s.relationships.push(s.relationships[0]!); }],
  ["goal unknown owner", s => { s.goals[0]!.character_id = "missing"; }],
  ["goal unknown target", s => { s.goals[0]!.target = { kind: "item", id: "missing" }; }],
  ["future goal creation", s => { s.goals[0]!.created_at = 999999; }],
  ["invalid participant", s => { s.scheduled_events[0]!.participants!.push("missing"); }],
  ["invalid event minute", s => { s.scheduled_events[0]!.scheduled_world_minute = Infinity; }],
  ["duplicate event", s => { s.scheduled_events.push(s.scheduled_events[0]!); }],
];
for (const [name, corrupt] of corruptions) test(`restore rejects ${name} without changing live campaign`, () => {
  const { world, campaign } = richCampaign(), before = campaign.exportSnapshot(); const s = structuredClone(before) as CampaignSnapshot; corrupt(s);
  assert.throws(() => CampaignState.restore(world, s)); assert.equal(campaign.exportSnapshot(), before);
});

test("Save/Load v1 (D2): a canonical NPC without a runtime entry is valid (not yet placed by play), restores unchanged and stays unplaced", () => {
  const { world, campaign } = richCampaign(), s = structuredClone(campaign.exportSnapshot()) as CampaignSnapshot, removed = s.runtime.npc_locations.pop()!;
  const restored = CampaignState.restore(world, s);
  assert.equal(restored.revision, campaign.revision); assert.ok(!restored.exportSnapshot().runtime.npc_locations.some(n => n.character_id === removed.character_id));
});

test("format, versions, conflicting identity and dataset mismatch have typed errors", () => {
  const { world, campaign } = richCampaign();
  const mutable = () => structuredClone(createSaveFile(campaign.exportSnapshot(), world, now)) as CampaignSaveFile;
  // NPC+ Pass 1: envelope 3 and snapshot 2 are current; a schema-1 snapshot is reachable only through save migration.
  for (const version of [0, 6, 7]) assert.throws(() => validateSaveFile({ ...mutable(), schema_version: version }, world), { code: "unsupported_version" });
  for (const version of [0, 1, 2, 3, 4, 5, 7]) assert.throws(() => CampaignState.restore(world, { ...campaign.exportSnapshot(), schema_version: version }), { code: "unsupported_version" });
  assert.throws(() => validateSaveFile({ ...mutable(), format: "other" }, world), { code: "invalid_save" });
  assert.throws(() => validateSaveFile({ ...mutable(), extra: true }, world), { code: "invalid_save" });
  assert.throws(() => validateSaveFile({ ...mutable(), campaign_id: "different" }, world), { code: "invalid_save" });
  const sources = fixtures(); sources[0]!.document.entity.summary = "Different dataset"; const different = new WorldStore(sources);
  assert.throws(() => CampaignState.restore(different, campaign.exportSnapshot()), error => error instanceof DatasetCompatibilityError && error.save_dataset_id === world.datasetId && error.current_dataset_id === different.datasetId);
  assert.equal(validateSaveFile(mutable(), different).snapshot.dataset_id, different.datasetId);
  // Save/Load v1: a legacy strict save (no fingerprint evidence) on a changed world loads, flagged as unverified; nothing is invented.
  const legacy = mutable(); delete legacy.canon_references; legacy.canon_compatibility = "strict";
  const decoded = validateSaveFileWithReport(legacy, different);
  assert.equal(decoded.canon.tier, "compatible_with_warnings"); assert.equal(decoded.canon.unverified, true); assert.equal(decoded.canon.revision_advanced, false);
  assert.equal(decoded.file.snapshot.revision, campaign.revision); assert.ok(CampaignSaveError);
});

test("strict JSON and plain-data boundary reject duplicate keys, hostile shapes and accessors", () => {
  for (const text of ['{', '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '[1,]', '{"a":1,}', 'null true', '01', 'NaN', '\uFEFF{}', '['.repeat(66) + ']'.repeat(66)]) assert.throws(() => parseSaveJson(text), { code: "invalid_json" });
  const { world, campaign } = richCampaign(); let invoked = false;
  const s = campaign.exportSnapshot();
  for (const invalid of [new Map(), new Set(), { ...s, [Symbol("key")]: 1 }, Object.create(s), { ...s, characters: new Array(1) },
    { ...s, runtime: { ...s.runtime, mana: { get current() { invoked = true; return 13; }, max: 100 } } },
    { ...s, runtime: { ...s.runtime, unexpected: true } }, { ...s, characters: [{ ...s.characters[0], profile: { name: () => "bad" } }] }]) assert.throws(() => CampaignState.restore(world, invalid), { code: "invalid_save" });
  const cyclic: Record<string, unknown> = { ...s }; cyclic.runtime = cyclic;
  assert.throws(() => CampaignState.restore(world, cyclic)); assert.equal(invoked, false);
  assert.throws(() => decodeSave(serializeSave(createSaveFile(s, world, now), world).replace('"format":', '"__proto__": {}, "format":'), world), { code: "invalid_save" });
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
