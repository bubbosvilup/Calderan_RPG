import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { buildSceneRam } from "../src/scene/scene-ram-builder.js";
import { character, document, find, fixtures, garden, kitchen, room } from "./fixtures.js";

function setup(minute = 0) {
  const sources = fixtures();
  const world = new WorldStore(sources);
  const runtime = new RuntimeState(world, { player_location: room, world_time: { world_minute: minute } });
  return { sources, world, runtime };
}

test("requested Brenna/Maren sequence derives presence from runtime locations", () => {
  const { sources, world, runtime } = setup(100);
  const before = JSON.stringify(sources);
  const canonical = JSON.stringify(world.getEntity("brenna"));
  const first = buildSceneRam(world, runtime);
  assert.equal(first.player_location, room);
  assert.equal(first.current_location.id, room);
  assert.deepEqual(first.world_time, { world_minute: 100 });
  assert.deepEqual(first.location_ancestry.map(e => e.id), ["heartstone_l1", "heartstone"]);
  assert.deepEqual(first.present_characters, ["brenna"]);
  assert.deepEqual(runtime.getNpcLocations().map(e => e.character_id), ["brenna", "maren"]);
  runtime.moveCharacter("brenna", kitchen);
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, []);
  runtime.movePlayer(kitchen);
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, ["brenna"]);
  assert.deepEqual(first.present_characters, ["brenna"]); // prior snapshot remains unchanged
  assert.equal(first.player_location, room);
  assert.equal(JSON.stringify(world.getEntity("brenna")), canonical);
  assert.equal(JSON.stringify(sources), before);
  const authored = world.getEntity("brenna");
  assert(authored?.type === "character");
  assert.equal(authored.location, room);
});

test("no presence from parents, adjacency, event participants, relationships, or aliases", () => {
  const sources = fixtures();
  Object.assign(find(sources, "brenna").entity, { location: "heartstone_l1", aliases: [room], relationships: [{ target: "nicco", kind: "friend", description: "Fixture" }] });
  Object.assign(find(sources, room).entity, { connections: [{ target: garden, description: "Fixture", minutes: 1 }] });
  const world = new WorldStore(sources);
  const runtime = new RuntimeState(world, { player_location: room, world_time: { world_minute: 0 } });
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, []);
  runtime.moveCharacter("maren", room);
  runtime.moveCharacter("brenna", room);
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, ["brenna", "maren"]);
});

test("production world initializes with the canonical player Nicco, who is never a present NPC", async () => {
  const world = await loadWorld("data");
  const runtime = new RuntimeState(world, { player_location: "heartstone_lr", world_time: { world_minute: 0 } });
  const nicco = world.getEntity("nicco"); assert.equal(nicco?.type === "character" && nicco.role, "player");
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, []);
  runtime.movePlayer("heartstone");
  assert.deepEqual(buildSceneRam(world, runtime).location_ancestry.map(e => e.id), ["calderan_west", "calderan", "west", "continent"]);
});

test("invalid NPC/player movement leaves all state unchanged", () => {
  const { runtime } = setup();
  for (const [characterId, locationId] of [["nicco", room], ["missing", room], ["bag", room], ["brenna", "missing"], ["brenna", "bag"]]) {
    const before = JSON.stringify([runtime.getSceneState(), runtime.getNpcLocations()]);
    assert.throws(() => runtime.moveCharacter(characterId!, locationId!));
    assert.equal(JSON.stringify([runtime.getSceneState(), runtime.getNpcLocations()]), before);
  }
  for (const target of ["missing", "brenna"]) {
    assert.throws(() => runtime.movePlayer(target));
    assert.equal(runtime.getSceneState().player_location, room);
  }
});

test("time advances numerically, accepts zero, and leaves canon untouched", () => {
  const { world, runtime } = setup(100);
  const event = JSON.stringify(world.getEntity("meeting"));
  runtime.advanceTime(0); runtime.advanceTime(5);
  assert.equal(runtime.getSceneState().world_time.world_minute, 105);
  assert.equal(JSON.stringify(world.getEntity("meeting")), event);
  for (const bad of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => runtime.advanceTime(bad), /safe integer/);
    assert.equal(runtime.getSceneState().world_time.world_minute, 105);
  }
  const limit = setup(Number.MAX_SAFE_INTEGER).runtime;
  limit.advanceTime(0);
  assert.throws(() => limit.advanceTime(1), /safe-integer/);
  assert.equal(limit.getSceneState().world_time.world_minute, Number.MAX_SAFE_INTEGER);
});

test("runtime snapshots and initialization inputs cannot bypass movement/time checks", () => {
  const world = new WorldStore(fixtures());
  const input = { player_location: room, world_time: { world_minute: 0 } };
  const runtime = new RuntimeState(world, input);
  input.player_location = "missing"; input.world_time.world_minute = 999;
  assert.equal(runtime.getSceneState().player_location, room);
  assert.equal(runtime.getSceneState().world_time.world_minute, 0);
  assert.throws(() => Object.assign(runtime.getSceneState(), { player_location: "missing" }), TypeError);
  assert.throws(() => Object.assign(runtime.getSceneState().world_time, { world_minute: -1 }), TypeError);
  assert.throws(() => Object.assign(runtime.getNpcLocations()[0]!, { current_location: "missing" }), TypeError);
  const ram = buildSceneRam(world, runtime);
  assert.throws(() => Object.assign(ram.present_characters, { 0: "nicco" }), TypeError);
  assert.throws(() => buildSceneRam(new WorldStore(fixtures()), runtime), /different WorldStore/);
});

test("initialization rejects invalid player starts and unknown NPC locations", () => {
  const world = new WorldStore(fixtures());
  for (const id of ["missing", "brenna"]) assert.throws(() => new RuntimeState(world, { player_location: id, world_time: { world_minute: 0 } }), /Location/);
  for (const time of [NaN, Infinity, 0.5]) assert.throws(() => new RuntimeState(world, { player_location: room, world_time: { world_minute: time } }), /safe integer/);
  const sources = fixtures();
  Object.assign(find(sources, "brenna").entity, { location: null });
  assert.throws(() => new RuntimeState(new WorldStore(sources), { player_location: room, world_time: { world_minute: 0 } }), /brenna requires a starting location/);
});

test("Nicco cannot acquire an NPC record and other player roles are rejected", () => {
  const sources = fixtures();
  Object.assign(find(sources, "nicco").entity, { role: "npc" });
  assert.throws(() => new RuntimeState(new WorldStore(sources), { player_location: room, world_time: { world_minute: 0 } }), /nicco must be/);
  const others = fixtures();
  others.push({ source: "fixtures/other.yaml", document: document(character("other", room, "player")) });
  assert.throws(() => new RuntimeState(new WorldStore(others), { player_location: room, world_time: { world_minute: 0 } }), /Unsupported player/);
});
