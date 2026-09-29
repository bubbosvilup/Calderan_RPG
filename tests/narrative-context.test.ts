import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNarrativeContext, NarrativeContextError, NARRATIVE_CONTEXT_LIMITS as limits } from "../src/scene/narrative-context-builder.js";
import { buildSceneRam } from "../src/scene/scene-ram-builder.js";
import { SceneDeltaValidationError, validateSceneDelta } from "../src/scene/scene-delta.js";
import type { Narrator, NarratorTurnInput, NarratorTurnOutput } from "../src/types/narrative.js";
import { loadWorld } from "../src/world/loader.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { WorldStore } from "../src/world/world-store.js";
import { character, document, find, fixtures, garden, kitchen, location, room } from "./fixtures.js";

const policy = (narrator = true, player = true) => ({ visibility: { narrator, player }, known_by: [] });
function classified() {
  const sources = fixtures();
  for (const id of [room, kitchen, "heartstone_l1", "heartstone"]) find(sources, id).entity.knowledge = policy();
  Object.assign(find(sources, room).entity, { features: [{ name: "table", description: "Fixture furniture" }] });
  Object.assign(find(sources, "brenna").entity, { traits: ["Fixture trait"] });
  // Existing Brenna fixture is narrator-only; remote entities remain unclassified.
  return sources;
}
function setup(sources = classified()) {
  const world = new WorldStore(sources);
  const runtime = new RuntimeState(world, { player_location: room, world_time: { world_minute: 100 } });
  return { world, runtime, sources };
}
const snapshot = (runtime: RuntimeState) => ({ revision: runtime.revision, scene: runtime.getSceneState(), npcs: runtime.getNpcLocations() });

test("revision starts at zero, increments once per changed delta, and is read-only", () => {
  const { runtime } = setup();
  assert.equal(runtime.revision, 0);
  runtime.applySceneDelta({ player_location: kitchen, character_movements: [{ character_id: "brenna", current_location: kitchen }], time_advance_minutes: 5 });
  assert.equal(runtime.revision, 1);
  for (const delta of [{}, { expected_revision: 1 }, { time_advance_minutes: 0 }, { character_movements: [] }, { player_location: kitchen, character_movements: [{ character_id: "brenna", current_location: kitchen }] }]) {
    runtime.applySceneDelta(delta);
    assert.equal(runtime.revision, 1);
  }
  runtime.movePlayer(room); assert.equal(runtime.revision, 2);
  runtime.movePlayer(room); assert.equal(runtime.revision, 2);
  runtime.moveCharacter("brenna", room); assert.equal(runtime.revision, 3);
  runtime.advanceTime(1); assert.equal(runtime.revision, 4);
  runtime.advanceTime(0); assert.equal(runtime.revision, 4);
  assert.throws(() => Object.assign(runtime, { revision: 100 }), TypeError);
  assert.deepEqual(Object.keys(runtime.getSceneState()), ["player_location", "world_time"]);
});

for (const expected of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null, undefined, 1]) {
  test(`invalid/mismatched expected revision rejects atomically: ${String(expected)}`, () => {
    const { runtime } = setup();
    const before = snapshot(runtime);
    assert.throws(() => runtime.applySceneDelta({ expected_revision: expected, player_location: kitchen, character_movements: [{ character_id: "brenna", current_location: kitchen }], time_advance_minutes: 5 }), (error: unknown) => {
      assert(error instanceof SceneDeltaValidationError);
      assert.equal(error.field, "expected_revision");
      return true;
    });
    assert.deepEqual(snapshot(runtime), before);
  });
}

test("failed ordinary deltas preserve revision; matching revisions do not bypass validation", () => {
  const { runtime } = setup();
  const before = snapshot(runtime);
  assert.throws(() => runtime.applySceneDelta({ expected_revision: 0, player_location: kitchen, character_movements: [{ character_id: "brenna", current_location: "missing" }], time_advance_minutes: 5 }));
  assert.deepEqual(snapshot(runtime), before);
});

test("stale expected revision rejects even a no-op and prevalidated proposals are rechecked", () => {
  const { runtime, world } = setup();
  const proposal = validateSceneDelta({ expected_revision: 0, player_location: kitchen }, world, 100, 0);
  assert.equal(proposal.expected_revision, 0);
  runtime.advanceTime(1);
  const before = snapshot(runtime);
  for (const delta of [proposal, { expected_revision: 0 }]) assert.throws(() => runtime.applySceneDelta(delta), /stale proposal/);
  assert.deepEqual(snapshot(runtime), before);
  runtime.applySceneDelta({ player_location: kitchen });
  assert.equal(runtime.revision, 2); // unguarded local calls remain valid
});

test("context projects only current location, compact ancestors, time, mana, and present NPCs", () => {
  const { runtime, world } = setup();
  const context = buildNarrativeContext(world, runtime);
  assert.deepEqual(context, buildNarrativeContext(world, runtime));
  assert.equal(context.runtime_revision, 0);
  assert.equal(context.scene.player_location?.id, room);
  assert.deepEqual(Object.keys(context.scene.player_location!).sort(), ["content", "display_name", "features", "id", "name", "secret", "summary"]);
  assert.deepEqual(context.scene.location_ancestry.map(e => e.id), ["heartstone_l1", "heartstone"]);
  for (const ancestor of context.scene.location_ancestry) assert.deepEqual(Object.keys(ancestor).sort(), ["display_name", "id", "name", "secret", "summary"]);
  assert.deepEqual(context.scene.world_time, { world_minute: 100 });
  assert.deepEqual(context.scene.present_characters.map(e => e.id), ["brenna"]);
  assert.deepEqual(Object.keys(context.scene.present_characters[0]!).sort(), ["content", "display_name", "id", "name", "secret", "summary", "traits"]);
  assert.equal(context.scene.present_characters[0]!.secret, true);
  assert.equal(context.scene.player_location!.secret, false);
  const json = JSON.stringify(context);
  for (const excluded of ["maren", "nicco", garden, kitchen, "known_by", "relationships", "connections", "search_context", "Fixture passage", "brenna.overview"]) assert(!json.includes(excluded), excluded);
  assert.notEqual(context.scene.player_location, world.getEntity(room));
});

test("growing unrelated canon does not grow or alter primary context", () => {
  const initial = setup();
  const expanded = classified();
  for (let i = 0; i < 300; i++) {
    const remote = location(`remote_${i}`);
    remote.content = "Unrelated remote material. ".repeat(100);
    expanded.push({ source: `fixtures/${remote.id}.yaml`, document: document(remote) });
  }
  const larger = setup(expanded);
  assert.deepEqual(buildNarrativeContext(initial.world, initial.runtime), buildNarrativeContext(larger.world, larger.runtime));
});

test("entity policy covers features, introductions, traits, and ancestor summaries", () => {
  const sources = classified();
  find(sources, room).entity.knowledge = policy(true, false);
  find(sources, "heartstone").entity.knowledge = policy(true, false);
  const { world, runtime } = setup(sources);
  const context = buildNarrativeContext(world, runtime);
  assert.equal(context.scene.player_location!.secret, true);
  assert.equal(context.scene.location_ancestry[1]!.secret, true);
  assert.equal(context.scene.present_characters[0]!.secret, true);
  assert.equal(context.scene.player_location!.features[0]!.name, "table");
});

test("narrator-hidden entities are excluded completely, even when player-visible", () => {
  const sources = classified();
  for (const id of [room, "heartstone_l1", "brenna"]) {
    find(sources, id).entity.knowledge = policy(false, true);
    find(sources, id).entity.content = "HIDDEN_SENTINEL".repeat(1000);
  }
  const { runtime, world } = setup(sources);
  const context = buildNarrativeContext(world, runtime);
  assert.equal(context.scene.player_location, null);
  assert.deepEqual(context.scene.location_ancestry.map(e => e.id), ["heartstone"]);
  assert.deepEqual(context.scene.present_characters, []);
  const json = JSON.stringify(context);
  for (const hidden of [room, "heartstone_l1", "brenna", "HIDDEN_SENTINEL"]) assert(!json.includes(hidden));
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, ["brenna"]); // internal scene remains complete
});

for (const id of [room, "heartstone_l1", "heartstone", "brenna"]) {
  test(`unclassified primary entity fails without changing runtime: ${id}`, () => {
    const sources = classified();
    delete find(sources, id).entity.knowledge;
    const { runtime, world } = setup(sources);
    const before = snapshot(runtime);
    assert.throws(() => buildNarrativeContext(world, runtime), (error: unknown) => {
      assert(error instanceof NarrativeContextError);
      assert.equal(error.entityId, id);
      assert.match(error.field, /knowledge$/);
      assert.match(error.message, /unclassified/);
      return true;
    });
    assert.deepEqual(snapshot(runtime), before);
  });
}

test("classified Heartstone canon builds context without altering authoring policy", async () => {
  const world = await loadWorld("data");
  const runtime = new RuntimeState(world, { player_location: "heartstone_lr", world_time: { world_minute: 100 } });
  const context = buildNarrativeContext(world, runtime);
  assert.equal(context.scene.player_location!.id, "heartstone_lr");
  assert.equal(context.scene.player_location!.secret, false);
  assert.deepEqual(world.getEntity("heartstone_lr")!.knowledge!.visibility, { narrator: true, player: true });
});

test("no chunks are expanded, including visible chunks overriding hidden entities", () => {
  const sources = classified();
  const brenna = find(sources, "brenna");
  brenna.entity.knowledge = policy(false, false);
  brenna.chunks[0]!.content = "VISIBLE_CHUNK_SHOULD_NOT_EXPAND";
  const { runtime, world } = setup(sources);
  assert(!JSON.stringify(buildNarrativeContext(world, runtime)).includes("VISIBLE_CHUNK_SHOULD_NOT_EXPAND"));
  assert.deepEqual(buildNarrativeContext(world, runtime).scene.present_characters, []);
});

test("unclassified absent NPCs, sibling/descendant locations and lore are not expanded", () => {
  const sources = classified();
  sources.push({ source: "fixtures/alcove.yaml", document: document(location("alcove", room)) });
  const { world, runtime } = setup(sources);
  assert.doesNotThrow(() => buildNarrativeContext(world, runtime));
  runtime.moveCharacter("maren", room);
  assert.throws(() => buildNarrativeContext(world, runtime), /maren.*unclassified/);
});

test("context has stable NPC order and is independent of source order", () => {
  const sources = classified();
  find(sources, "maren").entity.knowledge = policy();
  Object.assign(find(sources, "maren").entity, { location: room });
  const a = setup(sources);
  const b = setup([...sources].reverse());
  assert.deepEqual(buildNarrativeContext(a.world, a.runtime), buildNarrativeContext(b.world, b.runtime));
  assert.deepEqual(buildNarrativeContext(a.world, a.runtime).scene.present_characters.map(e => e.id), ["brenna", "maren"]);
});

test("context is deeply immutable, detached, and does not modify canon", () => {
  const { world, runtime, sources } = setup();
  const canonBefore = sources.map(s => structuredClone(world.getEntity(s.document.entity.id)));
  const context = buildNarrativeContext(world, runtime);
  const before = structuredClone(context);
  for (const object of [context, context.scene, context.scene.world_time, context.scene.player_location!, context.scene.player_location!.features, context.scene.player_location!.features[0]!, context.scene.location_ancestry, context.scene.location_ancestry[0]!, context.scene.present_characters, context.scene.present_characters[0]!, context.scene.present_characters[0]!.traits]) {
    assert(Object.isFrozen(object));
    assert.throws(() => Object.assign(object, { invalid: true }), TypeError);
  }
  runtime.applySceneDelta({ player_location: kitchen, time_advance_minutes: 1 });
  assert.deepEqual(context, before);
  assert.deepEqual(sources.map(s => world.getEntity(s.document.entity.id)), canonBefore);
  assert.throws(() => buildNarrativeContext(new WorldStore(classified()), runtime), /different WorldStore/);
});

for (const [name, change] of [
  ["long introduction", (s: ReturnType<typeof fixtures>) => { find(s, room).entity.content = "x".repeat(limits.content + 1); }],
  ["long ancestor summary", (s: ReturnType<typeof fixtures>) => { find(s, "heartstone").entity.summary = "x".repeat(limits.summary + 1); }],
  ["too many features", (s: ReturnType<typeof fixtures>) => { Object.assign(find(s, room).entity, { features: Array.from({ length: limits.features + 1 }, () => ({ name: "fixture", description: "fixture" })) }); }],
  ["too many traits", (s: ReturnType<typeof fixtures>) => { Object.assign(find(s, "brenna").entity, { traits: Array(limits.traits + 1).fill("fixture") }); }],
] as const) {
  test(`oversized context fails explicitly without truncation: ${name}`, () => {
    const sources = classified(); change(sources);
    const { world, runtime } = setup(sources);
    assert.throws(() => buildNarrativeContext(world, runtime), /exceeds/);
  });
}

test("aggregate primary text is bounded even when individual fields fit", () => {
  const sources = classified();
  for (let i = 0; i < 8; i++) {
    const npc = character(`guest_${i}`, room);
    npc.knowledge = policy(); npc.content = "x".repeat(limits.content);
    sources.push({ source: `fixtures/${npc.id}.yaml`, document: document(npc) });
  }
  const { world, runtime } = setup(sources);
  assert.throws(() => buildNarrativeContext(world, runtime), /total text budget/);
});

test("NPC and ancestry counts are bounded without silently dropping entries", () => {
  const sources = classified();
  for (let i = 0; i < limits.present_characters; i++) {
    const npc = character(`guest_${i}`, room); npc.knowledge = policy();
    sources.push({ source: `fixtures/${npc.id}.yaml`, document: document(npc) });
  }
  const crowded = setup(sources);
  assert.throws(() => buildNarrativeContext(crowded.world, crowded.runtime), /count exceeds/);
  const deep = classified();
  for (let i = 0; i < limits.ancestors; i++) {
    const ancestor = location(`ancestor_${i}`, i === 0 ? null : `ancestor_${i - 1}`); ancestor.knowledge = policy();
    deep.push({ source: `fixtures/${ancestor.id}.yaml`, document: document(ancestor) });
  }
  find(deep, "heartstone").entity.parent = `ancestor_${limits.ancestors - 1}`;
  const hierarchy = setup(deep);
  assert.throws(() => buildNarrativeContext(hierarchy.world, hierarchy.runtime), /count exceeds/);
});

/** Test-only scripted adapter: returns supplied output, no world/gameplay reasoning. */
class ScriptedNarrator implements Narrator {
  constructor(private readonly output: NarratorTurnOutput) {}
  narrate(_input: NarratorTurnInput): NarratorTurnOutput { return this.output; }
}

test("mock narrator turn proposes a guarded delta; engine commits and rebuilds context", async () => {
  const { world, runtime } = setup();
  const original = buildNarrativeContext(world, runtime);
  const narrator: Narrator = new ScriptedNarrator({
    text: "Brenna follows him into the kitchen.",
    scene_delta: { expected_revision: original.runtime_revision, player_location: kitchen, character_movements: [{ character_id: "brenna", current_location: kitchen }], time_advance_minutes: 2 },
  });
  const output = await narrator.narrate({ context: original, user_message: "Move to the kitchen." });
  assert.equal(runtime.revision, 0); // text/output alone cannot change state
  runtime.applySceneDelta(output.scene_delta);
  assert.equal(runtime.revision, 1);
  assert.equal(runtime.getSceneState().player_location, kitchen);
  assert.equal(runtime.getSceneState().world_time.world_minute, 102);
  assert.equal(runtime.getNpcLocations()[0]!.current_location, kitchen);
  assert.deepEqual(buildSceneRam(world, runtime).present_characters, ["brenna"]);
  const next = buildNarrativeContext(world, runtime);
  assert.equal(next.runtime_revision, 1);
  assert.equal(next.scene.player_location!.id, kitchen);
  assert.deepEqual(next.scene.present_characters.map(e => e.id), ["brenna"]);
  assert.equal(original.runtime_revision, 0);
  assert.equal(original.scene.player_location!.id, room);
  assert.equal(original.scene.world_time.world_minute, 100);
  const beforeRetry = snapshot(runtime);
  assert.throws(() => runtime.applySceneDelta(output.scene_delta), /stale proposal/);
  assert.deepEqual(snapshot(runtime), beforeRetry);
});
