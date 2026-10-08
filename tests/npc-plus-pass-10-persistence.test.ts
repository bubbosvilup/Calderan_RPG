import { productionStub, testTrajectory, testContrast, testMovement, instantReflectionPacing } from "./production-reflection-fixtures.js";
import test from "node:test";
import assert from "node:assert/strict";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignSnapshot } from "../src/campaign/types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { reflectAfterTurn, reflectionEvidence, type ReflectionProvider } from "../src/turn/reflection.js";
import { build, BASE } from "./pass10-headroom.js";
import { household, play } from "./pass10-support.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { loadWorld } from "../src/world/loader.js";

/** NPC+ Pass 10 — save/migration/replay torture. Every tamper of premium or reflection state must fail closed at restore. */
const world = await loadWorld("data");
const { campaign } = build({ ...BASE, n: 3, history: "rollup", reflections: true, facts: 4, knowsPer: 2, rules: 2 });
const good = campaign.exportSnapshot() as CampaignSnapshot;
const P = (s: CampaignSnapshot, i = 0) => s.premium_characters[i]!;
const MUTATIONS: [string, (s: CampaignSnapshot) => void][] = [
  ["active flag cleared for a current member", s => { P(s).metadata.active_household_member = false; }],
  ["premium record for an unknown character", s => { s.premium_characters.push({ ...structuredClone(P(s)), character_id: "campaign_character_nobody" }); }],
  ["duplicate premium record", s => { s.premium_characters.push(structuredClone(P(s))); }],
  ["development from the future", s => { P(s).dynamic.recent_developments[0]!.revision = s.revision + 3; }],
  ["history over the 16 cap", s => { const d = P(s).dynamic.recent_developments; while (d.length < 20) d.push(structuredClone(d[0]!)); }],
  ["moved development with unknown location", s => { P(s).dynamic.recent_developments.push({ kind: "moved", from: "nowhere_at_all", to: "also_nowhere", revision: s.revision, world_minute: 0 }); }],
  ["rollup negative counts", s => { P(s).dynamic.long_term!.moves = -3; }],
  ["rollup entries over total", s => { P(s).dynamic.long_term!.entries = 0; P(s).dynamic.long_term!.moves = 40; }],
  ["rollup first_revision after last", s => { P(s).dynamic.long_term!.first_revision = P(s).dynamic.long_term!.last_revision + 5; }],
  ["reflection evidence of another character", s => { s.premium_reflections[0]!.notes[0]!.evidence_refs = ["npcmem:campaign_character_h001:history:r5.0"]; }],
  ["reflection duplicate note id", s => { s.premium_reflections[0]!.notes[1]!.id = s.premium_reflections[0]!.notes[0]!.id; }],
  ["reflection over the per-kind cap", s => { const n = s.premium_reflections[0]!.notes; n.push({ ...structuredClone(n[0]!), id: "extra_1" }, { ...structuredClone(n[0]!), id: "extra_2" }); }],
  ["reflection reflected in the future", s => { s.premium_reflections[0]!.last_reflected_revision = s.revision + 9; }],
  ["reflection for a character without NPC+ state", s => { s.premium_reflections.push({ character_id: "campaign_character_nobody", notes: [], last_reflected_revision: 0 }); }],
  ["reflection note text too long", s => { s.premium_reflections[0]!.notes[0]!.text = "x".repeat(500); }],
  ["reflection note without evidence", s => { s.premium_reflections[0]!.notes[0]!.evidence_refs = []; }],
  ["reflection note updated in the future", s => { s.premium_reflections[0]!.notes[0]!.updated_revision = s.revision + 4; }],
  ["private_memory_refs unknown fact", s => { P(s).dynamic.private_memory_refs = ["campaign_fact_does_not_exist"]; }],
  ["contract evidence from the future", s => { P(s).stable.contract_evidence = [{ field: "voice", revision: s.revision + 9, quote: "x" }]; P(s).stable.voice_contract = "soft"; }],
  ["contract text without evidence", s => { P(s).stable.voice_contract = "invented voice"; }],
  ["premium created_revision in the future", s => { P(s).metadata.created_revision = s.revision + 2; }],
  ["premium last_updated before created", s => { P(s).metadata.last_updated_revision = 0; P(s).metadata.created_revision = 3; }],
  ["unknown extra field on a premium record", s => { (P(s) as unknown as Record<string, unknown>).secret_follower = true; }],
  ["unknown development kind", s => { (P(s).dynamic.recent_developments as unknown[]).push({ kind: "follows_nicco", revision: s.revision, world_minute: 0 }); }],
  ["development revisions out of order", s => { const d = P(s).dynamic.recent_developments; [d[0], d[d.length - 1]] = [d[d.length - 1]!, d[0]!]; }],
  ["snapshot revision rewound below developments", s => { s.revision = 2; }],
];

test("baseline: the rich snapshot (history at cap, rollups, reflections at cap) restores and round-trips through the save format byte-identically", () => {
  CampaignState.restore(world, structuredClone(good));
  const text = serializeSave(createSaveFile(good, world, "2026-10-02T09:00:00.000Z"), world);
  const again = serializeSave(createSaveFile(decodeSave(text, world).snapshot, world, "2026-10-02T09:00:00.000Z"), world);
  assert.equal(again, text);
  assert.ok(P(good).dynamic.recent_developments.length <= 16 && !!P(good).dynamic.long_term && good.premium_reflections.length === 3);
});
for (const [label, mutate] of MUTATIONS) test(`tampered premium/reflection state fails closed at restore: ${label}`, () => {
  const s = structuredClone(good); mutate(s);
  assert.throws(() => CampaignState.restore(world, s), (e: { code?: string }) => e.code === "reference_invalid" || e.code === "invalid_save");
});
test("a tampered save file fails at decode as well (not only at restore)", () => {
  const text = serializeSave(createSaveFile(good, world, "2026-10-02T09:00:00.000Z"), world), file = JSON.parse(text);
  file.snapshot.premium_characters[0].metadata.active_household_member = false;
  assert.throws(() => decodeSave(JSON.stringify(file), world));
});

// ------------------------------------------------------------------------------------------------ after real gameplay
test("save immediately after a committed follow: the moved NPC+ and its single `moved` development survive a reload; reloading changes nothing", async () => {
  const r = await play("Nicco goes down the stairs. Maren follows him.", "I go down to the main hall. Maren, come with me.");
  const text = serializeSave(createSaveFile(r.snapshot, r.f.world, "2026-10-02T09:00:00.000Z"), r.f.world);
  const loaded = CampaignState.restore(r.f.world, decodeSave(text, r.f.world).snapshot).exportSnapshot();
  assert.deepEqual(loaded.premium_characters, r.snapshot.premium_characters);
  assert.equal(loaded.runtime.npc_locations.find(n => n.character_id === "maren")?.current_location, "test_hall");
  assert.equal(loaded.premium_characters.find(p => p.character_id === "maren")!.dynamic.recent_developments.filter(e => e.kind === "moved").length, 1);
});
test("save/load between an invitation and a later turn creates no phantom following: the invitation lives only in its own turn's input", async () => {
  const first = await play("Nicco goes down the stairs alone, and the hall is quiet.", "I go down to the main hall. Maren, come with me.");
  assert.equal(first.where("maren"), "test_room");
  const text = serializeSave(createSaveFile(first.snapshot, first.f.world, "2026-10-02T09:00:00.000Z"), first.f.world);
  const reloaded = CampaignState.restore(first.f.world, decodeSave(text, first.f.world).snapshot);
  // The next turn: Nicco goes back up. Narration says Maren follows him (down?) with no invitation this turn: Maren is upstairs, so nothing moves her to the hall.
  const second = await play("Nicco climbs the stairs. Maren follows him.", "I go back upstairs to the observation room.", { fixture: { f: first.f, campaign: reloaded, world: first.f.world } as never });
  assert.ok(second.result);
  assert.equal(second.snapshot.runtime.npc_locations.find(n => n.character_id === "maren")?.current_location, "test_room");
  assert.equal(second.snapshot.premium_characters.find(p => p.character_id === "maren")!.dynamic.recent_developments.filter(e => e.kind === "moved").length, 0);
});
test("replay/duplicate: a stale revision cannot re-apply a committed move, and re-applying the same move to the same place records no second development", async () => {
  const r = await play("Nicco goes down the stairs. Maren follows him.", "I go down to the main hall. Maren, come with me.");
  const campaign = r.f.campaign, revision = campaign.revision;
  assert.throws(() => campaign.apply({ expected_revision: revision - 1, commands: [{ kind: "move_character", character_id: "maren", location_id: "test_hall" }] }));
  campaign.apply({ expected_revision: revision, commands: [{ kind: "move_character", character_id: "maren", location_id: "test_hall" }] });
  assert.equal(campaign.exportSnapshot().premium_characters.find(p => p.character_id === "maren")!.dynamic.recent_developments.filter(e => e.kind === "moved").length, 1);
});

// ------------------------------------------------------------------------------------------------ reflection and persistence
const stub = (proposals: unknown[]): ReflectionProvider => ({ async reflect() { return { text: JSON.stringify({ proposals }), model: "stub" }; } });
test("reflection revision then save/load; and a proposal computed before the load is stale after newer gameplay (dropped, nothing changes)", async () => {
  const f = household(["maren"]);
  for (const loc of ["test_hall", "test_room", "test_hall"]) f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "maren", location_id: loc }] });
  const refs = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "maren").filter(e => / moved from /.test(e.text)).map(e => e.ref);
  const note = { kind: "shared_motif", label: "hall_and_room", text: "Maren has moved between the observation room and the main hall several times.", evidence_refs: refs, confidence: "medium" };
  // Stale: the provider is slow and gameplay commits meanwhile.
  const slow: ReflectionProvider = { async reflect() { f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "maren", location_id: "test_room" }] }); return { text: JSON.stringify({ proposals: [note] }) }; } };
  const stale = await reflectAfterTurn(f.campaign, f.world, slow);
  assert.equal(stale[0]!.status, "stale");
  assert.equal(f.campaign.exportSnapshot().premium_reflections.length, 0, "a stale reflection changes nothing");
  const fresh = await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testMovement(r)]));
  assert.equal(fresh[0]!.status, "committed");
  const text = serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T09:00:00.000Z"), f.world);
  const loaded = CampaignState.restore(f.world, decodeSave(text, f.world).snapshot).exportSnapshot();
  assert.deepEqual(loaded.premium_reflections, f.campaign.exportSnapshot().premium_reflections);
});
test("legacy v2 save of a household with a former NPC+ migrates to the current version; the inactive record is preserved and strict validation follows", () => {
  const f = household(["brenna", "maren"]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "leave_household", household_id: "campaign_household_home", character_id: "maren" }] });
  const file = JSON.parse(serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T09:00:00.000Z"), f.world));
  file.schema_version = 2; file.snapshot.schema_version = 1; delete file.snapshot.premium_characters; delete file.snapshot.premium_reflections; delete file.snapshot.player_characters;
  const migrated = decodeSave(JSON.stringify(file), f.world).snapshot;
  assert.deepEqual(migrated.premium_characters.map(p => [p.character_id, p.metadata.active_household_member]), [["brenna", true]], "only current members are derived; a former member has no record to reconstruct");
  assert.doesNotThrow(() => CampaignState.restore(f.world, migrated));
});
