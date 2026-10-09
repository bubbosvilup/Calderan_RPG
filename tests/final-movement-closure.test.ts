import test from "node:test";
import assert from "node:assert/strict";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot } from "../src/campaign/types.js";
import { createSaveFile, decodeSave, serializeSave, validateSaveFile } from "../src/persistence/save-format.js";
import { migrateSave } from "../src/persistence/save-migrations.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { characterLocation } from "../src/turn/character-movement.js";
import { household, play } from "./pass10-support.js";

/**
 * Final movement closure: every persistent character has ONE authoritative location (LOCATED | OFF_SCENE), independent of Nicco.
 * The scene is a projection of co-location. Every test runs the real pipeline (scripted narrator, no controller proposals), so each
 * location change below is derived from completed narration -> evidence -> proposal -> authorization -> commit.
 */
const ROOM = "test_room", HALL = "test_hall", YARD = "test_yard";
type Placed = { readonly snapshot: { readonly runtime: { readonly npc_locations: readonly { readonly character_id: string; readonly current_location?: string | undefined; readonly off_scene?: { readonly last_known_location: string; readonly since_revision: number } | undefined }[] } } };
const here = (r: Placed, id: string) => r.snapshot.runtime.npc_locations.find(n => n.character_id === id);
const at = (r: Placed, id: string) => here(r, id)?.current_location;
/** The scene's NPCs among the household under test (the fixture also seats other canon NPCs in the room). */
const TRACKED = ["brenna", "gerome", "maren"];
const sceneOf = (f: ReturnType<typeof household>, tracked: readonly string[] = ["maren"]) => buildTurnContext(f.world, f.campaign.exportSnapshot()).characters.map(c => c.id).filter(id => tracked.includes(id)).sort();
const toHall: CampaignCommand = { kind: "runtime_delta", delta: { player_location: HALL, time_advance_minutes: 1 } };
const toRoom: CampaignCommand = { kind: "runtime_delta", delta: { player_location: ROOM, time_advance_minutes: 1 } };
const steer = (f: ReturnType<typeof household>, ...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });

test("persistence (20 turns, save/load): Maren moves while Nicco stays, keeps her own location, and the scene follows co-location", async () => {
  const f = household(["maren"]);
  // 1-2. Nicco stays in the room; Maren goes down to the hall.
  let r = await play("Maren heads down to the main hall.", "I read by the window.", { fixture: f });
  assert.equal(at(r, "maren"), HALL);
  assert.equal(r.snapshot.runtime.scene.player_location, ROOM);
  assert.deepEqual(r.moved("maren").map(e => ({ ...e })).map(({ kind, from, to }: { kind: string; from?: string; to?: string }) => ({ kind, from, to })), [{ kind: "moved", from: ROOM, to: HALL }], "exactly one history entry");
  assert.deepEqual(sceneOf(f), [], "she is not in Nicco's scene");
  // 3. Twenty unrelated turns: she is never reset to the canon baseline (the room), never unknown.
  for (let i = 0; i < 20; i++) {
    r = await play(`The afternoon drifts by. Dust turns in the window light (${i}).`, "I keep reading.", { fixture: f });
    assert.equal(at(r, "maren"), HALL, `turn ${i}`);
    assert.deepEqual(sceneOf(f), [], `turn ${i}: still not in the scene`);
  }
  // 4. Save and load.
  const file = createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T10:00:00.000Z");
  const loaded = CampaignState.restore(f.world, decodeSave(serializeSave(file, f.world), f.world).snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.exportSnapshot())), JSON.parse(JSON.stringify(f.campaign.exportSnapshot())), "lossless round trip");
  assert.equal(characterLocation(loaded.exportSnapshot(), f.world, "maren"), HALL);
  // 5. Nicco goes to the hall: she is in the scene (derived, not loaded by hand).
  steer(f, toHall);
  assert.deepEqual(sceneOf(f), ["maren"]);
  // 6. Nicco returns to the room: she is gone from the scene but is still in the hall.
  steer(f, toRoom);
  assert.deepEqual(sceneOf(f), []);
  assert.equal(characterLocation(f.campaign.exportSnapshot(), f.world, "maren"), HALL);
  // 7. Narration brings her up: she is present again, with exactly one more history entry.
  r = await play("Maren comes up the stairs into the Observation room, rubbing her arms against the cold.", "I look up.", { fixture: f });
  assert.equal(at(r, "maren"), ROOM);
  assert.deepEqual(sceneOf(f), ["maren"]);
  assert.equal(r.moved("maren").length, 2);
});

test("multiple NPCs have independent locations; every scene is a pure projection", async () => {
  const f = household(TRACKED, [toHall], { courtyard: true });
  // Nicco is in the hall. Brenna joins him there and Gerome goes out to the courtyard; Maren stays upstairs (nobody moved her).
  steer(f, { kind: "move_character", character_id: "brenna", location_id: HALL }, { kind: "move_character", character_id: "gerome", location_id: HALL });
  const r = await play("Gerome walks out to the Courtyard.", "I warm my hands at the hearth.", { fixture: f });
  assert.deepEqual([at(r, "maren"), at(r, "brenna"), at(r, "gerome")], [ROOM, HALL, YARD]);
  const sceneAt = (place: string) => { steer(f, { kind: "runtime_delta", delta: { player_location: place } }); return sceneOf(f, TRACKED); };
  assert.deepEqual(sceneAt(HALL), ["brenna"]);
  assert.deepEqual(sceneAt(ROOM), ["maren"]);
  assert.deepEqual(sceneAt(YARD), ["gerome"]);
  // Moving Nicco around never overwrote anybody's location.
  const after = { snapshot: f.campaign.exportSnapshot() };
  assert.deepEqual([at(after, "maren"), at(after, "brenna"), at(after, "gerome")], [ROOM, HALL, YARD]);
});

test("known destination: unique graph relation, explicit location, and never OFF_SCENE", async () => {
  const upstairs = (nar: string, geography = {}) => play(nar, "I sit by the fire.", { fixture: household(["maren"], [toHall, { kind: "move_character", character_id: "maren", location_id: HALL }], geography) });
  for (const nar of ["Maren goes upstairs to the Observation room.", "Maren goes upstairs.", "Maren heads up the stairs.", "Maren climbs... no, Maren goes up."]) {
    if (nar.includes("climbs")) continue;
    const r = await upstairs(nar);
    assert.equal(at(r, "maren"), ROOM, nar);
    assert.equal(here(r, "maren")?.off_scene, undefined, "a known destination is never OFF_SCENE");
  }
  const yard = await upstairs("Maren goes out into the courtyard.", { courtyard: true });
  assert.equal(at(yard, "maren"), YARD);
  // Two ways up: ambiguity fails closed (no move, no off-scene, the claim is withdrawn); naming one resolves it.
  const ambiguous = await upstairs("Maren goes upstairs.", { secondStairs: true });
  assert.equal(at(ambiguous, "maren"), HALL);
  assert.doesNotMatch(ambiguous.result?.narration ?? "", /upstairs/);
  assert.equal(at(await upstairs("Maren goes upstairs to the Attic.", { secondStairs: true }), "maren"), "test_attic");
});

test("OFF_SCENE: a completed destination-less departure is one authoritative state with exact history", async () => {
  for (const nar of ["Maren goes out for a while, the door shutting behind her.", "Maren leaves.", "Maren disappears into the city.", "Maren walks out and closes the door."]) {
    const r = await play(nar, "I read.", { members: ["maren"] });
    const state = here(r, "maren");
    assert.equal(state?.current_location, undefined, nar);
    assert.deepEqual(state?.off_scene, { last_known_location: ROOM, since_revision: r.snapshot.revision }, nar);
    assert.equal(characterLocation(r.snapshot, r.f.world, "maren"), undefined);
    assert.deepEqual(sceneOf(r.f), [], "off-scene means nowhere in the scene");
    const history = r.moved("maren").map(e => ({ ...e }) as { from?: string; to?: string });
    assert.equal(history.length, 1);
    assert.equal(history[0]!.from, ROOM, "left the room");
    assert.equal(history[0]!.to, undefined, "no fabricated destination");
    // She still exists: relationships, household membership and her premium record are untouched.
    assert.ok(r.snapshot.premium_characters.some(p => p.character_id === "maren" && p.metadata.active_household_member));
  }
});

test("OFF_SCENE: incomplete, hypothetical, past, ordered or refused departures change nothing", async () => {
  for (const nar of ["Maren looks toward the door.", "Maren starts toward the stairs.", "Maren almost leaves.", "Maren might leave.", "Maren says she'll leave later.", "Maren usually leaves in the morning.",
    "Maren left yesterday.", "Maren considers leaving.", "Maren's gaze shifts toward the doorway.", "Maren steps toward Nicco.", "Maren shakes her head and stays where she is."]) {
    const r = await play(nar, "Maren, go out for a while.", { members: ["maren"] });
    assert.deepEqual(here(r, "maren"), { character_id: "maren", current_location: ROOM }, nar);
    assert.equal(r.moved("maren").length, 0, nar);
  }
  // The player's order is not authority, only a narrated completed exit is.
  const ordered = await play("Maren studies him for a moment, then goes back to her book.", "Maren, leave. Now.", { members: ["maren"] });
  assert.equal(at(ordered, "maren"), ROOM);
});

test("return from OFF_SCENE: only an exact destination with a completed arrival; mentions never teleport", async () => {
  const f = household(["maren"]);
  let r = await play("Maren goes out for a while.", "I read.", { fixture: f });
  assert.ok(here(r, "maren")?.off_scene);
  const since = here(r, "maren")!.off_scene!.since_revision;
  for (const nar of ["I wonder where Maren is.", "Maren should be back soon.", "Nicco calls for Maren.", "Somewhere in the city, Maren is walking.", "Maren might come back to the Observation room later."]) {
    r = await play(nar, "I wait.", { fixture: f });
    assert.deepEqual(here(r, "maren")?.off_scene, { last_known_location: ROOM, since_revision: since }, nar);
  }
  r = await play("Maren returns to the Observation room, shaking rain from her cloak.", "I wait.", { fixture: f });
  assert.deepEqual(here(r, "maren"), { character_id: "maren", current_location: ROOM });
  assert.deepEqual(sceneOf(f), ["maren"]);
  assert.deepEqual(r.moved("maren").map(e => ({ ...e }) as { from?: string; to?: string }).map(e => [e.from, e.to]), [[ROOM, undefined], [undefined, ROOM]], "left, then arrived: structured, no prose memory");
  // Return into a DIFFERENT known place while Nicco is elsewhere is only representable through an arrival in his scene or a named destination.
  const g = household(["maren"]);
  let q = await play("Maren disappears into the city.", "I read.", { fixture: g });
  q = await play("Maren walks back into the main hall.", "I read.", { fixture: g });
  assert.equal(at(q, "maren"), undefined, "an arrival where Nicco is not is not narratable evidence for an off-scene character");
});

test("known -> known return: a character who does not come down stays where she is", async () => {
  const f = household(["maren"], [toHall, { kind: "move_character", character_id: "maren", location_id: ROOM }]);
  let r = await play("The hall is warm.", "I stoke the fire.", { fixture: f });
  assert.equal(at(r, "maren"), ROOM);
  r = await play("Maren stays upstairs, her footsteps pacing overhead.", "I call up the stairs.", { fixture: f });
  assert.equal(at(r, "maren"), ROOM);
  r = await play("Maren comes down the stairs into the main hall.", "I wait.", { fixture: f });
  assert.equal(at(r, "maren"), HALL);
  assert.equal(r.moved("maren").length, 1);
});

test("save/load: LOCATED and OFF_SCENE persist; old saves migrate losslessly; the dataset identity is untouched", async () => {
  const f = household(["maren", "brenna"]);
  await play("Maren heads down to the main hall.", "I read.", { fixture: f });
  const located = createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T10:00:00.000Z");
  assert.equal(located.canonical_dataset_id, f.world.datasetId);
  const reloaded = decodeSave(serializeSave(located, f.world), f.world);
  assert.deepEqual(reloaded.snapshot.runtime.npc_locations.find(n => n.character_id === "maren"), { character_id: "maren", current_location: HALL });
  await play("Brenna goes out for a while.", "I read.", { fixture: f });
  const off = createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T10:05:00.000Z");
  const offJson = serializeSave(off, f.world);
  const back = CampaignState.restore(f.world, decodeSave(offJson, f.world).snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(back.exportSnapshot())), JSON.parse(JSON.stringify(f.campaign.exportSnapshot())));
  assert.equal(serializeSave(createSaveFile(back.exportSnapshot(), f.world, "2026-10-02T10:05:00.000Z"), f.world), offJson, "deterministic serialization");
  assert.equal(off.canonical_dataset_id, located.canonical_dataset_id, "the dataset hash does not depend on runtime location state");
  // An envelope-3 / snapshot-2 save (only LOCATED entries) migrates by version bump alone.
  const legacy = JSON.parse(serializeSave(located, f.world));
  legacy.schema_version = 3; legacy.snapshot.schema_version = 2; delete legacy.snapshot.player_characters; delete legacy.snapshot.next_item_sequence;
  const migrated = migrateSave(legacy) as { schema_version: number; snapshot: CampaignSnapshot };
  assert.equal(migrated.schema_version, 5); assert.equal(migrated.snapshot.schema_version, 4);
  assert.deepEqual(JSON.parse(JSON.stringify({ ...migrated.snapshot, schema_version: 0 })), { ...legacy.snapshot, schema_version: 0 }, "nothing else changed");
  assert.deepEqual(JSON.parse(JSON.stringify(validateSaveFile(legacy, f.world).snapshot.runtime)), JSON.parse(JSON.stringify(located.snapshot.runtime)), "old save loads losslessly");
  // An OFF_SCENE entry can never ride in an old-schema file.
  const smuggled = JSON.parse(offJson); smuggled.schema_version = 3; smuggled.snapshot.schema_version = 2;
  assert.throws(() => decodeSave(JSON.stringify(smuggled), f.world), { code: "migration_failed" });
});

test("tampered location state is rejected at restore", async () => {
  const f = household(["maren"]);
  await play("Maren goes out for a while.", "I read.", { fixture: f });
  const good = JSON.parse(serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T10:00:00.000Z"), f.world));
  const entry = (s: { snapshot: CampaignSnapshot }) => s.snapshot.runtime.npc_locations.find(n => n.character_id === "maren")!;
  const MUTATIONS: [string, (s: { snapshot: CampaignSnapshot }) => void][] = [
    ["both located and off-scene", s => { entry(s).current_location = ROOM; }],
    ["neither located nor off-scene", s => { delete entry(s).off_scene; }],
    ["invalid last known location", s => { entry(s).off_scene!.last_known_location = "nowhere_at_all"; }],
    ["last known is not a location", s => { entry(s).off_scene!.last_known_location = "maren"; }],
    ["future since_revision", s => { entry(s).off_scene!.since_revision = s.snapshot.revision + 1; }],
    ["negative since_revision", s => { entry(s).off_scene!.since_revision = -1; }],
    ["unknown extra field", s => { (entry(s).off_scene as unknown as Record<string, unknown>).destination = HALL; }],
    ["unknown character", s => { s.snapshot.runtime.npc_locations.push({ character_id: "nobody_at_all", off_scene: { last_known_location: ROOM, since_revision: 0 } }); }],
    ["a created-style duplicate entry", s => { s.snapshot.runtime.npc_locations.push(structuredClone(entry(s))); }],
    ["the player off-scene", s => { s.snapshot.runtime.npc_locations.push({ character_id: "nicco", off_scene: { last_known_location: ROOM, since_revision: 0 } }); }],
  ];
  for (const [name, mutate] of MUTATIONS) {
    const bad = structuredClone(good); mutate(bad);
    assert.throws(() => decodeSave(JSON.stringify(bad), f.world), name);
  }
  assert.doesNotThrow(() => decodeSave(JSON.stringify(good), f.world));
});

test("runtime_delta cannot place a character both ways or off-scene without being located", () => {
  const f = household(["maren"]);
  const bad = (movement: object) => assert.throws(() => steer(f, { kind: "runtime_delta", delta: { character_movements: [movement] } } as CampaignCommand), JSON.stringify(movement));
  bad({ character_id: "maren", off_scene: true, current_location: HALL });
  bad({ character_id: "maren", off_scene: false });
  bad({ character_id: "maren" });
  bad({ character_id: "nicco", off_scene: true });
  steer(f, { kind: "runtime_delta", delta: { character_movements: [{ character_id: "maren", off_scene: true }] } });
  const state = f.campaign.exportSnapshot().runtime.npc_locations.find(n => n.character_id === "maren");
  assert.deepEqual(state?.off_scene, { last_known_location: ROOM, since_revision: f.campaign.revision });
  // Leaving again is a no-op: the last known place and the revision are kept.
  const before = f.campaign.revision;
  steer(f, { kind: "runtime_delta", delta: { character_movements: [{ character_id: "maren", off_scene: true }] } });
  assert.equal(f.campaign.revision, before);
});

// ------------------------------------------------------------------------------------------------ D-24
const NICCO_REJECTED = "I walk to the remote docks. Maren, come with me.";
const grid = async (input: string, narration: string) => { const r = await play(narration, input, { members: ["maren"] }); return r; };
test("D-24 A: a valid inter-location move with a follow moves both", async () => {
  const r = await grid("I go down to the main hall. Maren, come with me.", "Nicco goes down the stairs. Maren follows him.");
  assert.deepEqual([r.snapshot.runtime.scene.player_location, at(r, "maren")], [HALL, HALL]);
  assert.match(r.result?.narration ?? "", /Maren follows him/);
});
test("D-24 B/C: Nicco's move is rejected, so no follower moves and no dependent arrival prose is delivered", async () => {
  for (const narration of ["Nicco walks to the remote docks. Maren follows him there.", "Nicco walks to the remote docks. Maren follows him.", "Nicco walks to the remote docks. Maren came down after him.",
    "Nicco walks to the remote docks. Behind him, Maren followed a moment later."]) {
    const r = await grid(NICCO_REJECTED, narration);
    assert.deepEqual([r.snapshot.runtime.scene.player_location, at(r, "maren")], [ROOM, ROOM], narration);
    assert.doesNotMatch(r.result?.narration ?? "", /Maren (?:follows|came|followed)|walks to the remote/i, narration);
  }
});
test("D-24 D: a local follow while Nicco stays put is not an inter-location follow and is delivered", async () => {
  const r = await grid("I sit down and read. Maren, stay close.", "Nicco settles at the table. Maren follows him over to the table.");
  assert.equal(at(r, "maren"), ROOM);
  assert.match(r.result?.narration ?? "", /Maren follows him over to the table/);
});
test("D-24 E/F: a rejected move with Maren only watching is clean; a valid move with Maren explicitly staying behind keeps her", async () => {
  const watch = await grid("I walk to the remote docks.", "Nicco walks to the remote docks. Maren watches him from the window.");
  assert.equal(at(watch, "maren"), ROOM);
  assert.match(watch.result?.narration ?? "", /Maren watches him from the window/);
  const stay = await grid("I go down to the main hall.", "Nicco goes down the stairs. Maren stays behind in the room.");
  assert.deepEqual([stay.snapshot.runtime.scene.player_location, at(stay, "maren")], [HALL, ROOM]);
  assert.match(stay.result?.narration ?? "", /Maren stays behind/);
});
test("D-24 G: Nicco's move is rejected but Maren independently departs: a known destination, or OFF_SCENE", async () => {
  const known = await grid("I walk to the remote docks.", "Nicco walks to the remote docks. Maren goes down to the main hall.");
  assert.equal(known.snapshot.runtime.scene.player_location, ROOM);
  assert.equal(at(known, "maren"), HALL);
  const unknown = await grid("I walk to the remote docks.", "Nicco walks to the remote docks. Maren goes out for a while.");
  assert.equal(unknown.snapshot.runtime.scene.player_location, ROOM);
  assert.ok(here(unknown, "maren")?.off_scene);
  assert.match(unknown.result?.narration ?? "", /Maren goes out for a while/);
});
