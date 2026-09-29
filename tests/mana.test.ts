import assert from "node:assert/strict";
import { test } from "node:test";
import { RuntimeState } from "../src/world/runtime-state.js";
import { WorldStore } from "../src/world/world-store.js";
import { loadWorld } from "../src/world/loader.js";
import { buildNarrativeContext } from "../src/scene/narrative-context-builder.js";
import { validateSceneDelta, SceneDeltaValidationError } from "../src/scene/scene-delta.js";
import { fixtures, room, kitchen } from "./fixtures.js";

function setup(current = 100, minute = 0, max = 100) {
  const world = new WorldStore(fixtures());
  return { world, runtime: new RuntimeState(world, { player_location: room, world_time: { world_minute: minute } }, { current, max }) };
}
const snapshot = (runtime: RuntimeState) => ({ scene: runtime.getSceneState(), npcs: runtime.getNpcLocations(), mana: runtime.getPlayerMana(), revision: runtime.revision });

test("player mana defaults to 100/100 (the canonical player authors no mana) and initializes by copy", async () => {
  const world = await loadWorld("data");
  const scene = { player_location: "heartstone_lr", world_time: { world_minute: 0 } };
  const runtime = new RuntimeState(world, scene);
  assert.deepEqual(runtime.getPlayerMana(), { current: 100, max: 100 });
  assert.equal(runtime.revision, 0);
  assert.equal(world.getEntity("nicco")?.type, "character");
  const initial = { current: 18, max: 100 };
  const restored = new RuntimeState(world, scene, initial);
  initial.current = 90;
  assert.equal(restored.getPlayerMana().current, 18);
  assert.throws(() => Object.assign(restored.getPlayerMana(), { current: 50 }), TypeError);
});

for (const [current, max] of [[-1, 100], [101, 100], [0.5, 100], [100, Infinity], [0, -1], [NaN, 100], [0, 1.5], [0, Number.MAX_SAFE_INTEGER + 1]]) {
  test(`invalid initial mana rejects: ${current}/${max}`, () => assert.throws(() => setup(current, 0, max), /player mana/));
}

test("mana expenditure and restoration commit once, zero deltas do not", () => {
  const { runtime } = setup();
  const before = runtime.getPlayerMana();
  runtime.applySceneDelta({ mana_delta: -25, expected_revision: 0 });
  assert.deepEqual(runtime.getPlayerMana(), { current: 75, max: 100 });
  assert.equal(runtime.revision, 1);
  runtime.applySceneDelta({ mana_delta: -25 });
  runtime.applySceneDelta({ mana_delta: 20 });
  assert.equal(runtime.getPlayerMana().current, 70);
  assert.equal(runtime.revision, 3);
  for (const delta of [{}, { mana_delta: 0 }, { mana_delta: -0, time_advance_minutes: 0 }]) runtime.applySceneDelta(delta);
  assert.equal(runtime.revision, 3);
  assert.equal(before.current, 100);
  runtime.applySceneDelta({ mana_delta: 0, player_location: kitchen });
  assert.equal(runtime.revision, 4);
});

for (const value of [-101, 1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "-25", null, undefined]) {
  test(`invalid explicit mana rejects all movement/time/NPC changes: ${String(value)}`, () => {
    const { runtime } = setup(100, 1430);
    const before = snapshot(runtime);
    assert.throws(() => runtime.applySceneDelta({ mana_delta: value, player_location: kitchen, character_movements: [{ character_id: "brenna", current_location: kitchen }], time_advance_minutes: 20 }), (error: unknown) => {
      assert(error instanceof SceneDeltaValidationError);
      assert.equal(error.field, "mana_delta");
      return true;
    });
    assert.deepEqual(snapshot(runtime), before);
  });
}

test("overspend at 20 rejects atomically even when the proposal crosses a day", () => {
  const { runtime } = setup(20, 1430);
  const before = snapshot(runtime);
  assert.throws(() => runtime.applySceneDelta({ player_location: kitchen, time_advance_minutes: 20, mana_delta: -25 }), /before daily recovery/);
  assert.deepEqual(snapshot(runtime), before);
});

test("strict explicit restoration, exact bounds, and zero-capacity pools", () => {
  const { runtime } = setup(90);
  assert.throws(() => runtime.applySceneDelta({ mana_delta: 25 }), /mana_delta/);
  assert.equal(runtime.revision, 0);
  runtime.applySceneDelta({ mana_delta: 10 });
  assert.equal(runtime.getPlayerMana().current, 100);
  runtime.applySceneDelta({ mana_delta: -100 });
  assert.equal(runtime.getPlayerMana().current, 0);
  const zero = setup(0, 1430, 0).runtime;
  zero.advanceTime(20);
  assert.deepEqual(zero.getPlayerMana(), { current: 0, max: 0 });
});

test("stale mana proposal and re-applied validated proposal use current authority", () => {
  const { world, runtime } = setup(50);
  const proposal = validateSceneDelta({ mana_delta: -40 }, world, 0, 0, runtime.getPlayerMana());
  runtime.applySceneDelta(proposal);
  const before = snapshot(runtime);
  assert.throws(() => runtime.applySceneDelta({ expected_revision: 0, mana_delta: 5 }), /stale/);
  assert.throws(() => runtime.applySceneDelta(proposal), /mana_delta/);
  assert.deepEqual(snapshot(runtime), before);
  assert.throws(() => validateSceneDelta({ mana_delta: 0 }, world, 0), /requires valid current player mana/);
});

test("combined valid delta spends first, recovers second, and commits once", () => {
  const { runtime } = setup(50, 1430);
  runtime.applySceneDelta({ expected_revision: 0, player_location: kitchen, character_movements: [{ character_id: "brenna", current_location: kitchen }], time_advance_minutes: 20, mana_delta: -25 });
  assert.equal(runtime.getPlayerMana().current, 50);
  assert.equal(runtime.getSceneState().world_time.world_minute, 1450);
  assert.equal(runtime.getSceneState().player_location, kitchen);
  assert.equal(runtime.getNpcLocations().find(n => n.character_id === "brenna")!.current_location, kitchen);
  assert.equal(runtime.revision, 1);
  const capped = setup(100, 1430).runtime;
  capped.applySceneDelta({ mana_delta: -25, time_advance_minutes: 20 });
  assert.equal(capped.getPlayerMana().current, 100);
  assert.equal(capped.revision, 1);
});

for (const [current, minute, advance, expected] of [
  [18, 1430, 20, 43], [88, 1430, 20, 100], [90, 1430, 20, 100],
  [0, 1439, 1, 25], [0, 1440, 1, 0], [0, 0, 4320, 75],
  [50, 0, 4320, 100], [10, 10, 100, 10], [18, 1440, 0, 18],
  [0, -1, 1, 25], [0, -1440, 1439, 0],
] as const) {
  test(`day recovery ${current} at ${minute} advancing ${advance} yields ${expected}`, () => {
    const { runtime } = setup(current, minute);
    runtime.advanceTime(advance);
    assert.equal(runtime.getPlayerMana().current, expected);
    assert.equal(runtime.revision, advance > 0 ? 1 : 0);
  });
}

test("arbitrary rest-sized time calls neither multiply recovery nor require sleep", () => {
  const { runtime } = setup(0, 1430);
  runtime.advanceTime(5); runtime.advanceTime(4);
  assert.equal(runtime.getPlayerMana().current, 0);
  runtime.advanceTime(1);
  assert.equal(runtime.getPlayerMana().current, 25);
  runtime.advanceTime(0); runtime.advanceTime(60); runtime.advanceTime(60);
  assert.equal(runtime.getPlayerMana().current, 25);
  assert.throws(() => runtime.applySceneDelta({ sleep: true }), /unknown field/);
});

test("invalid time and NPC changes cannot commit otherwise valid mana", () => {
  const { runtime } = setup(50, Number.MAX_SAFE_INTEGER);
  const before = snapshot(runtime);
  for (const delta of [{ mana_delta: -5, time_advance_minutes: 1 }, { mana_delta: -5, time_advance_minutes: -1 }, { mana_delta: 5, character_movements: [{ character_id: "missing", current_location: kitchen }] }]) {
    assert.throws(() => runtime.applySceneDelta(delta));
    assert.deepEqual(snapshot(runtime), before);
  }
});

test("large safe clock and mana arithmetic stays exact and capped", () => {
  const { runtime } = setup(Number.MAX_SAFE_INTEGER - 10, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  runtime.advanceTime(Number.MAX_SAFE_INTEGER);
  assert.equal(runtime.getPlayerMana().current, Number.MAX_SAFE_INTEGER);
  assert.equal(runtime.getSceneState().world_time.world_minute, 0);
});

test("NarrativeContext contains immutable current/max mana without spells or secondary lore", async () => {
  const world = await loadWorld("data");
  const runtime = new RuntimeState(world, { player_location: "heartstone_lr", world_time: { world_minute: 1430 } });
  runtime.applySceneDelta({ mana_delta: -25 });
  const before = buildNarrativeContext(world, runtime);
  assert.deepEqual(before.scene.player_resources, { mana: { current: 75, max: 100 } });
  assert(Object.isFrozen(before.scene.player_resources));
  assert(Object.isFrozen(before.scene.player_resources.mana));
  const json = JSON.stringify(before);
  for (const forbidden of ["spell", "abilities", "magic_overview", "light_and_shadow", "inquisition", "related_entities"]) assert(!json.includes(forbidden));
  runtime.advanceTime(20);
  assert.equal(buildNarrativeContext(world, runtime).scene.player_resources.mana.current, 100);
  assert.equal(before.scene.player_resources.mana.current, 75);
  assert.equal(before.runtime_revision, 1);
});
