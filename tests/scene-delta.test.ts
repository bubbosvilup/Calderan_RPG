import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSceneRam } from "../src/scene/scene-ram-builder.js";
import { SceneDeltaValidationError, validateSceneDelta } from "../src/scene/scene-delta.js";
import type { SceneDelta } from "../src/types/scene.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { WorldStore } from "../src/world/world-store.js";
import { fixtures, garden, kitchen, room } from "./fixtures.js";

function setup(minute = 100) {
  const sources = fixtures();
  const world = new WorldStore(sources);
  const runtime = new RuntimeState(world, { player_location: room, world_time: { world_minute: minute } });
  return { sources, world, runtime };
}

function snapshot(runtime: RuntimeState) {
  return { scene: runtime.getSceneState(), npcs: runtime.getNpcLocations() };
}

const combined = {
  player_location: kitchen,
  character_movements: [{ character_id: "brenna", current_location: kitchen }],
  time_advance_minutes: 5,
} as const satisfies SceneDelta;

test("combined delta commits player, NPC, and time changes and derives Scene RAM", () => {
  const { runtime, world, sources } = setup();
  const before = snapshot(runtime);
  const beforeRam = buildSceneRam(world, runtime);
  const authoredBefore = structuredClone(sources);
  const canonicalBefore = sources.map(s => structuredClone(world.getEntity(s.document.entity.id)));
  const result = runtime.applySceneDelta(combined);
  assert.deepEqual(result, { applied: true, player_moved: true, moved_characters: ["brenna"], time_advanced_minutes: 5 });
  assert.deepEqual(snapshot(runtime), {
    scene: { player_location: kitchen, world_time: { world_minute: 105 } },
    npcs: [{ character_id: "brenna", current_location: kitchen }, { character_id: "maren", current_location: garden }],
  });
  const ram = buildSceneRam(world, runtime);
  assert.equal(ram.player_location, kitchen);
  assert.equal(ram.current_location.id, kitchen);
  assert.equal(ram.world_time.world_minute, 105);
  assert.deepEqual(ram.location_ancestry.map(e => e.id), ["heartstone_l1", "heartstone"]);
  assert.deepEqual(ram.present_characters, ["brenna"]);
  assert.equal(before.scene.player_location, room);
  assert.equal(before.scene.world_time.world_minute, 100);
  assert.equal(before.npcs[0]!.current_location, room);
  assert.equal(beforeRam.current_location.id, room);
  assert.equal(beforeRam.world_time.world_minute, 100);
  assert.deepEqual(sources, authoredBefore);
  assert.deepEqual(sources.map(s => world.getEntity(s.document.entity.id)), canonicalBefore);
  assert.throws(() => Object.assign(result, { player_moved: false }), TypeError);
  assert.throws(() => Object.assign(result.moved_characters, { 0: "maren" }), TypeError);
  assert.throws(() => Object.assign(before.npcs[0]!, { current_location: garden }), TypeError);
  runtime.applySceneDelta({ character_movements: [{ character_id: "brenna", current_location: garden }] });
  assert.deepEqual(result.moved_characters, ["brenna"]);
  assert.deepEqual(ram.present_characters, ["brenna"]);
});

test("NPC leaving, entering, and player movement each recompute exact presence", () => {
  const { runtime, world } = setup();
  runtime.applySceneDelta({ character_movements: [{ character_id: "brenna", current_location: kitchen }] });
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, []);
  runtime.applySceneDelta({ character_movements: [{ character_id: "brenna", current_location: room }] });
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, ["brenna"]);
  runtime.applySceneDelta({ character_movements: [{ character_id: "brenna", current_location: kitchen }] });
  runtime.applySceneDelta({ player_location: kitchen });
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, ["brenna"]);
  assert.equal(runtime.getSceneState().world_time.world_minute, 100);
});

const movement = (character_id: unknown, current_location: unknown) => ({ character_id, current_location });
const invalid: [string, unknown, string, string?][] = [
  ["null", null, "$"],
  ["undefined", undefined, "$"],
  ["array instead of object", [], "$"],
  ["string instead of object", "move", "$"],
  ["date instead of object", new Date(0), "$"],
  ["unknown top-level field", { ...combined, present_characters: [] }, "present_characters"],
  ["unknown clock field", { ...combined, world_time: { world_minute: 1 } }, "world_time"],
  ["undefined player target", { ...combined, player_location: undefined }, "player_location"],
  ["null player target", { ...combined, player_location: null }, "player_location"],
  ["bad player ID", { ...combined, player_location: "Living Room" }, "player_location", "Living Room"],
  ["missing player target", { ...combined, player_location: "missing" }, "player_location", "missing"],
  ["wrong player target type", { ...combined, player_location: "bag" }, "player_location", "bag"],
  ["non-array movements", { ...combined, character_movements: {} }, "character_movements"],
  ["undefined movements", { ...combined, character_movements: undefined }, "character_movements"],
  ["null movement", { ...combined, character_movements: [null] }, "character_movements[0]"],
  ["missing movement character", { ...combined, character_movements: [{ current_location: kitchen }] }, "character_movements[0].character_id"],
  ["missing movement target", { ...combined, character_movements: [{ character_id: "brenna" }] }, "character_movements[0].current_location"],
  ["unknown movement field", { ...combined, character_movements: [{ ...movement("brenna", kitchen), entered: true }] }, "character_movements[0].entered"],
  ["missing character", { ...combined, character_movements: [movement("missing", kitchen)] }, "character_movements[0].character_id", "missing"],
  ["non-character mover", { ...combined, character_movements: [movement("bag", kitchen)] }, "character_movements[0].character_id", "bag"],
  ["Nicco as NPC", { ...combined, character_movements: [movement("nicco", kitchen)] }, "character_movements[0].character_id", "nicco"],
  ["late missing target", { ...combined, character_movements: [movement("brenna", kitchen), movement("maren", "missing")] }, "character_movements[1].current_location", "missing"],
  ["late wrong target type", { ...combined, character_movements: [movement("brenna", kitchen), movement("maren", "bag")] }, "character_movements[1].current_location", "bag"],
  ["identical duplicate NPC", { ...combined, character_movements: [movement("brenna", kitchen), movement("brenna", kitchen)] }, "character_movements[1].character_id", "brenna"],
  ["conflicting duplicate NPC", { ...combined, character_movements: [movement("brenna", kitchen), movement("brenna", garden)] }, "character_movements[1].character_id", "brenna"],
  ["duplicate even when destinations are unchanged", { ...combined, character_movements: [movement("brenna", room), movement("brenna", room)] }, "character_movements[1].character_id", "brenna"],
  ["negative time", { ...combined, time_advance_minutes: -1 }, "time_advance_minutes"],
  ["fractional time", { ...combined, time_advance_minutes: 0.5 }, "time_advance_minutes"],
  ["NaN time", { ...combined, time_advance_minutes: NaN }, "time_advance_minutes"],
  ["infinite time", { ...combined, time_advance_minutes: Infinity }, "time_advance_minutes"],
  ["unsafe time", { ...combined, time_advance_minutes: Number.MAX_SAFE_INTEGER + 1 }, "time_advance_minutes"],
  ["overflow time", { ...combined, time_advance_minutes: Number.MAX_SAFE_INTEGER }, "time_advance_minutes"],
  ["string time", { ...combined, time_advance_minutes: "5" }, "time_advance_minutes"],
  ["null time", { ...combined, time_advance_minutes: null }, "time_advance_minutes"],
  ["explicit undefined time", { ...combined, time_advance_minutes: undefined }, "time_advance_minutes"],
];

for (const [name, delta, field, entityId] of invalid) {
  test(`atomic rejection: ${name}`, () => {
    const { runtime, world } = setup();
    const before = snapshot(runtime);
    const ram = buildSceneRam(world, runtime);
    const errors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(() => runtime.applySceneDelta(delta), (error: unknown) => {
        assert(error instanceof SceneDeltaValidationError);
        assert.equal(error.field, field);
        assert.equal(error.entityId, entityId);
        assert(!error.message.includes("\n    at "));
        errors.push(error.message);
        return true;
      });
      assert.deepEqual(snapshot(runtime), before);
      assert.deepEqual(buildSceneRam(world, runtime), ram);
    }
    assert.equal(errors[0], errors[1]);
  });
}

test("no-op deltas succeed and receipts describe actual changes only", () => {
  const { runtime } = setup();
  const before = snapshot(runtime);
  for (const delta of [{}, { character_movements: [] }, { time_advance_minutes: 0 }, { time_advance_minutes: -0 }, {
    player_location: room, character_movements: [{ character_id: "brenna", current_location: room }], time_advance_minutes: 0,
  }]) {
    assert.deepEqual(runtime.applySceneDelta(delta), { applied: true, player_moved: false, moved_characters: [], time_advanced_minutes: 0 });
    assert.deepEqual(snapshot(runtime), before);
  }
  runtime.applySceneDelta(combined);
  assert.deepEqual(runtime.applySceneDelta(combined), {
    applied: true, player_moved: false, moved_characters: [], time_advanced_minutes: 5,
  }); // A new time proposal advances again; no replay protection is implied.
  assert.equal(runtime.getSceneState().world_time.world_minute, 110);
});

test("receipts sort changed NPC IDs and exclude already-satisfied moves", () => {
  const { runtime } = setup();
  assert.deepEqual(runtime.applySceneDelta({ character_movements: [movement("maren", kitchen), movement("brenna", kitchen)] }).moved_characters, ["brenna", "maren"]);
  const receipt = runtime.applySceneDelta({ character_movements: [movement("maren", kitchen), movement("brenna", room)] });
  assert.deepEqual(receipt.moved_characters, ["brenna"]);
});

test("validation is read-only and owns its proposal copy; input is never retained", () => {
  const { runtime, world } = setup();
  const input = { player_location: kitchen, character_movements: [{ character_id: "brenna", current_location: kitchen }], time_advance_minutes: 5 };
  const before = snapshot(runtime);
  const validated = validateSceneDelta(input, world, 100);
  assert.deepEqual(snapshot(runtime), before);
  input.character_movements[0]!.current_location = garden;
  assert.equal(validated.character_movements[0]!.current_location, kitchen);
  assert.throws(() => Object.assign(validated.character_movements[0]!, { current_location: garden }), TypeError);
  runtime.applySceneDelta(validated);
  input.player_location = garden; input.time_advance_minutes = 1000;
  assert.equal(runtime.getSceneState().player_location, kitchen);
  assert.equal(runtime.getSceneState().world_time.world_minute, 105);
});

test("a previously validated proposal is revalidated against the current clock", () => {
  const { runtime, world } = setup(Number.MAX_SAFE_INTEGER - 1);
  const proposal = validateSceneDelta({ time_advance_minutes: 1 }, world, Number.MAX_SAFE_INTEGER - 1);
  runtime.advanceTime(1);
  const before = snapshot(runtime);
  assert.throws(() => runtime.applySceneDelta(proposal), SceneDeltaValidationError);
  assert.deepEqual(snapshot(runtime), before);
  assert.equal(runtime.applySceneDelta({}).time_advanced_minutes, 0);
});

test("legacy primitives share the same successful state and validation errors", () => {
  const direct = setup().runtime;
  const legacy = setup().runtime;
  direct.applySceneDelta(combined);
  legacy.movePlayer(kitchen); legacy.moveCharacter("brenna", kitchen); legacy.advanceTime(5);
  assert.deepEqual(snapshot(legacy), snapshot(direct));
  const pairs = [
    [() => legacy.movePlayer("missing"), () => direct.applySceneDelta({ player_location: "missing" })],
    [() => legacy.moveCharacter("nicco", room), () => direct.applySceneDelta({ character_movements: [movement("nicco", room)] })],
    [() => legacy.advanceTime(-1), () => direct.applySceneDelta({ time_advance_minutes: -1 })],
  ];
  for (const pair of pairs) {
    const errors = pair.map(run => { try { run(); } catch (error) { assert(error instanceof SceneDeltaValidationError); return [error.field, error.entityId, error.message]; } throw new Error("Expected rejection"); });
    assert.deepEqual(errors[0], errors[1]);
  }
});

test("non-data properties and sparse movement lists cannot masquerade as no-ops", () => {
  const { runtime } = setup();
  let invoked = false;
  const accessor = Object.defineProperty({}, "player_location", { get() { invoked = true; return kitchen; } });
  const unknownHidden = Object.defineProperty({}, "present_characters", { value: [] });
  const unknownSymbol = { [Symbol("presence")]: [] };
  const extendedArray = Object.assign([], { present_characters: ["brenna"] });
  for (const invalid of [accessor, unknownHidden, unknownSymbol, Object.create({ player_location: kitchen }), { character_movements: new Array(1) }, { character_movements: extendedArray }]) {
    const before = snapshot(runtime);
    assert.throws(() => runtime.applySceneDelta(invalid), SceneDeltaValidationError);
    assert.deepEqual(snapshot(runtime), before);
  }
  assert.equal(invoked, false);
});

test("same initial state and delta sequence produce identical commits and rejected-state snapshots", () => {
  const first = setup(1430).runtime;
  const second = setup(1430).runtime;
  const complete = (runtime: RuntimeState) => ({ ...snapshot(runtime), mana: runtime.getPlayerMana(), revision: runtime.revision });
  for (const delta of [{ mana_delta: -75 }, { ...combined, time_advance_minutes: 20 }, { mana_delta: 0 }, { mana_delta: -100 }, { expected_revision: 0, time_advance_minutes: 1 }, { time_advance_minutes: 4320 }]) {
    const outcomes = [first, second].map(runtime => {
      try { return runtime.applySceneDelta(delta); }
      catch (error) { assert(error instanceof SceneDeltaValidationError); return { field: error.field, message: error.message }; }
    });
    assert.deepEqual(outcomes[0], outcomes[1]);
    assert.deepEqual(complete(first), complete(second));
  }
});
