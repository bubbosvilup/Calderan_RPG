import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { parse, stringify } from "yaml";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { validateWorldSources, WorldValidationError } from "../src/world/validation.js";
import { base, document, find, fixtures, location, room } from "./fixtures.js";

test("production dataset integrity: every file loads, resolves, and is explicitly classified", async () => {
  const world = await loadWorld(resolve("data"));
  async function files(directory: string): Promise<string[]> {
    const paths: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) paths.push(...await files(path));
      else if (entry.name.endsWith(".yaml")) paths.push(path);
    }
    return paths;
  }
  const paths = await files("data");
  const records = (["location", "character", "event", "faction", "item", "concept", "world_lore"] as const).flatMap(type => world.getEntitiesByType(type));
  assert.deepEqual(records.map(e => e.id).sort(), (await Promise.all(paths.map(async p => parse(await readFile(p, "utf8")).entity.id as string))).sort());
  for (const path of paths) {
    // Production load above is the authority for shape, refs, cycles, and placement.
    // This adds the authoring-level classification policy, not a second validator.
    const authored = parse(await readFile(path, "utf8"));
    const entity = world.getEntity(authored.entity.id)!;
    assert(entity.knowledge, entity.id);
    assert(!entity.id.startsWith("template_"));
    for (const chunk of authored.chunks) {
      assert.deepEqual(world.getChunk(chunk.id), chunk);
      assert(chunk.knowledge ?? entity.knowledge);
    }
  }
  assert.equal(world.getEntity("heartstone_lr")?.id, "heartstone_lr");
  assert.equal(world.hasEntity("missing"), false);
  assert.equal(world.getEntity("missing"), undefined);
  assert.equal(world.getChunk("missing"), undefined);
  assert.deepEqual(world.getAncestors("heartstone_lr").map(e => e.id), ["heartstone", "calderan_west", "calderan", "west", "continent"]);
  assert.deepEqual(world.getAncestors("heartstone").map(e => e.id), ["calderan_west", "calderan", "west", "continent"]);
  assert.deepEqual(world.getChildren("heartstone").map(e => e.id), ["heartstone_cy", "heartstone_f1", "heartstone_lr", "heartstone_u1"]);
  assert.deepEqual(world.getChildren("missing"), []);
  assert.throws(() => world.getAncestors("missing"), /Unknown entity/);
});

test("all seven subtypes validate; references resolve regardless of input ordering", () => {
  const sources = fixtures().reverse();
  const world = new WorldStore(sources);
  for (const type of ["location", "character", "event", "faction", "item", "concept", "world_lore"] as const) {
    assert(world.getEntitiesByType(type).length > 0);
  }
});

type Mutation = (sources: ReturnType<typeof fixtures>) => void;
const change = (id: string, values: Record<string, unknown>): Mutation => sources => { Object.assign(find(sources, id).entity, values); };
const invalid: [string, Mutation, RegExp][] = [
  ["duplicate entities", s => s.push({ source: "z/brenna.yaml", document: structuredClone(find(s, "brenna")) }), /duplicate entity ID/],
  ["sparse features", change(room, { features: new Array(1) }), /features\[0\].*holes/],
  ["sparse aliases", change("brenna", { aliases: new Array(1) }), /aliases\[0\].*holes/],
  ["sparse references", change("ritual", { related_entities: new Array(1) }), /related_entities\[0\].*holes/],
  ["sparse chunks", s => { find(s, "brenna").chunks = new Array(1); }, /chunks\[0\].*holes/],
  ["extra array properties", change("brenna", { aliases: Object.assign([], { surprise: true }) }), /unexpected array property/],
  ["invalid ID", change("brenna", { id: "Brenna angry" }), /snake_case/],
  ["missing required field", s => { Reflect.deleteProperty(find(s, "brenna").entity, "summary"); }, /entity.summary/],
  ["unsupported version", s => { Object.assign(find(s, "brenna"), { schema_version: 2 }); }, /schema_version/],
  ["invalid entity type", change("brenna", { type: "monster" }), /entity.type/],
  ["unknown field", change("brenna", { locatoin: room }), /unknown field/],
  ["bad subtype fields", change("brenna", { traits: "kind" }), /entity.traits/],
  ["invalid role", change("brenna", { role: "companion" }), /entity.role/],
  ["missing parent", change(room, { parent: "missing" }), /entity.parent.*unknown entity/],
  ["wrong parent type", change(room, { parent: "brenna" }), /entity.parent.*type location/],
  ["parent cycle", change("heartstone", { parent: room }), /parent cycle/],
  ["self parent", change("heartstone", { parent: "heartstone" }), /parent cycle/],
  ["chunk ownership", s => { find(s, "brenna").chunks[0]!.entity_id = "maren"; }, /chunks\[0\].entity_id/],
  ["chunk ID mismatch", s => { find(s, "brenna").chunks[0]!.id = "brenna.wrong"; }, /chunks\[0\].id/],
  ["chunk section syntax", s => { find(s, "brenna").chunks[0]!.section = "Bad Section"; }, /chunks\[0\].section/],
  ["duplicate chunk IDs", s => { const d = find(s, "brenna"); d.chunks.push(structuredClone(d.chunks[0]!)); }, /duplicate chunk ID/],
  ["missing chunk field", s => { Reflect.deleteProperty(find(s, "brenna").chunks[0]!, "content"); }, /chunks\[0\].content/],
  ["missing location reference", change("brenna", { location: "missing" }), /entity.location.*unknown entity/],
  ["wrong location type", change("brenna", { location: "coin" }), /entity.location.*type location/],
  ["wrong connection type", change(room, { connections: [{ target: "brenna", description: "Test", minutes: 1 }] }), /connections\[0\].target.*type location/],
  ["wrong relationship type", change("brenna", { relationships: [{ target: room, kind: "friend", description: "Test" }] }), /relationships\[0\].target.*type character/],
  ["duplicate reference IDs", change("meeting", { participants: ["brenna", "brenna"] }), /duplicate ID/],
  ["event anchor not participant", change("meeting", { participants: ["nicco"] }), /subset/],
  ["event anchor wrong type", change("meeting", { characters: ["clan"] }), /entity.characters.*type character/],
  ["participant wrong type", change("meeting", { participants: ["coin"] }), /entity.participants.*type character or faction/],
  ["related location wrong type", change("meeting", { related_locations: ["coin"] }), /related_locations/],
  ["time string", change("meeting", { time: "evening" }), /entity.time/],
  ["fractional time", change("meeting", { time: { world_minute: 1.5 } }), /safe integer/],
  ["unsafe time", change("meeting", { time: { world_minute: Number.MAX_SAFE_INTEGER + 1 } }), /safe integer/],
  ["missing placement", s => { Reflect.deleteProperty(find(s, "bag").entity, "owner"); }, /exactly one/],
  ["multiple placements", change("bag", { location: room }), /exactly one/],
  ["null placement", change("bag", { owner: null }), /entity.owner/],
  ["wrong owner type", change("bag", { owner: room }), /entity.owner.*type character or faction/],
  ["self container", change("coin", { container: "coin" }), /cannot contain itself/],
  ["container cycle", s => { Reflect.deleteProperty(find(s, "bag").entity, "owner"); Object.assign(find(s, "bag").entity, { container: "coin" }); }, /container cycle/],
  ["wrong container type", change("coin", { container: room }), /entity.container.*type item/],
  ["structured state key", change("bag", { state: { location: room } }), /structured fields/],
  ["invalid state key", change("bag", { state: { "is open": true } }), /snake_case/],
  ["nested state", change("bag", { state: { condition: {} } }), /finite number/],
  ["nonfinite state", change("bag", { state: { weight: Infinity } }), /finite number/],
  ["wrong faction member type", change("clan", { members: [room] }), /entity.members.*type character/],
  ["wrong territory type", change("clan", { territory: ["brenna"] }), /entity.territory.*type location/],
  ["wrong faction relation type", change("clan", { relations: [{ target: "brenna", kind: "ally", description: "Test" }] }), /entity.relations.*type faction/],
  ["unknown concept link", change("ritual", { related_entities: ["missing"] }), /entity.related_entities.*unknown entity/],
  ["unknown lore link", change("history", { related_entities: ["missing"] }), /entity.related_entities.*unknown entity/],
  ["bad lore category", change("history", { category: "unknown" }), /entity.category/],
  ["invalid lifecycle", change("brenna", { lifecycle: "deleted" }), /entity.lifecycle/],
  ["invalid visibility", change("brenna", { knowledge: { visibility: { narrator: "yes", player: false }, known_by: [] } }), /visibility.narrator/],
  ["knowledge of missing NPC", change("brenna", { knowledge: { visibility: { narrator: true, player: false }, known_by: ["missing"] } }), /known_by.*unknown entity/],
  ["knowledge of player", change("brenna", { knowledge: { visibility: { narrator: true, player: false }, known_by: ["nicco"] } }), /known_by.*NPC/],
  ["chunk knowledge reference", s => { find(s, "brenna").chunks[0]!.knowledge!.known_by = [room]; }, /chunks\[0\].knowledge.known_by.*type character/],
];
for (const [name, mutate, pattern] of invalid) {
  test(`validation rejects ${name} with source, ID, and path`, () => {
    const sources = fixtures(); mutate(sources);
    assert.throws(() => new WorldStore(sources), (error: unknown) => {
      assert(error instanceof WorldValidationError);
      assert(error.source.endsWith(".yaml"));
      assert(error.entityId);
      assert(error.field);
      assert.match(error.message, pattern);
      return true;
    });
  });
}

test("aliases may be ambiguous and repeated; validation order is deterministic", () => {
  const sources = fixtures();
  find(sources, "brenna").entity.aliases = ["friend", "friend"];
  find(sources, "maren").entity.aliases = ["friend"];
  assert.doesNotThrow(() => new WorldStore(sources));
  Object.assign(find(sources, "brenna").entity, { location: "missing" });
  Object.assign(find(sources, "maren").entity, { location: "missing" });
  const message = (input: typeof sources) => {
    try { validateWorldSources(input); } catch (e) { return (e as Error).message; }
    throw new Error("Expected validation failure");
  };
  assert.equal(message(sources), message(sources.reverse()));
});

test("ancestry uses parent links rather than ID naming; defensive cycle detection", () => {
  const world = new WorldStore([
    { source: "root.yaml", document: document(location("root")) },
    { source: "unrelated_name.yaml", document: document(location("unrelated_name", "root")) },
  ]);
  assert.deepEqual(world.getAncestors("unrelated_name").map(e => e.id), ["root"]);
  // Simulate a broken lookup implementation, without mutating frozen canon.
  const original = world.getEntity.bind(world);
  world.getEntity = id => id === "root" ? { ...location("root"), parent: "unrelated_name" } : original(id);
  assert.throws(() => world.getAncestors("unrelated_name"), /Impossible parent cycle/);
});

test("canon is deeply frozen and detached from original authoring objects", () => {
  const sources = fixtures();
  const world = new WorldStore(sources);
  find(sources, "brenna").entity.name = "Changed outside store";
  find(sources, "brenna").chunks[0]!.content = "Changed outside store";
  assert.equal(world.getEntity("brenna")!.name, "brenna");
  assert.equal(world.getChunk("brenna.overview")!.content, "Fixture passage");
  assert.throws(() => Object.assign(world.getEntity("brenna")!, { name: "Changed" }), TypeError);
  assert.throws(() => Object.assign(world.getEntity("brenna")!.knowledge!.visibility, { player: true }), TypeError);
  assert.throws(() => Object.assign(world.getChunk("brenna.overview")!, { content: "Changed" }), TypeError);
});

test("programmatic canon rejects accessors and non-data records without invoking getters", () => {
  let invoked = false;
  const sources = fixtures();
  Object.defineProperty(find(sources, room).entity, "content", { enumerable: true, get() { invoked = true; return "changed"; } });
  assert.throws(() => new WorldStore(sources), WorldValidationError);
  assert.equal(invoked, false);
  const identity = fixtures();
  Object.defineProperty(find(identity, room).entity, "id", { enumerable: true, get() { invoked = true; return room; } });
  assert.throws(() => new WorldStore(identity), WorldValidationError);
  assert.equal(invoked, false);
  const entries = fixtures();
  const aliases: string[] = ["fixture"];
  Object.defineProperty(aliases, "0", { enumerable: true, get() { invoked = true; return "changed"; } });
  find(entries, room).entity.aliases = aliases;
  assert.throws(() => new WorldStore(entries), WorldValidationError);
  assert.equal(invoked, false);
});

async function withDataset(run: (directory: string) => Promise<void>): Promise<void> {
  const root = resolve(tmpdir());
  const directory = await mkdtemp(join(root, "caldrevan-world-test-"));
  try { await run(directory); }
  finally {
    const rel = relative(root, resolve(directory));
    assert(rel && !rel.startsWith("..") && !rel.includes("/") && !rel.includes("\\") && basename(directory).startsWith("caldrevan-world-test-"));
    await rm(directory, { recursive: true, force: true });
  }
}

test("loader and runtime preserve YAML files across movement and time changes", async () => {
  await withDataset(async directory => {
    const sources = fixtures();
    await mkdir(join(directory, "arbitrary"));
    const texts = new Map<string, string>();
    for (const s of sources) {
      const file = join(directory, "arbitrary", basename(s.source));
      const text = stringify(s.document); texts.set(file, text);
      await writeFile(file, text);
    }
    const world = await loadWorld(directory);
    assert.equal(world.getEntitiesByType("character").length, 3);
    const runtime = new RuntimeState(world, { player_location: room, world_time: { world_minute: 0 } });
    runtime.moveCharacter("brenna", "heartstone");
    runtime.movePlayer("heartstone");
    runtime.advanceTime(5);
    runtime.applySceneDelta({
      player_location: "heartstone_l1_kitchen",
      character_movements: [{ character_id: "brenna", current_location: "heartstone_l1_kitchen" }],
      time_advance_minutes: 5,
      mana_delta: -25,
    });
    runtime.advanceTime(1440);
    for (const [file, text] of texts) assert.equal(await readFile(file, "utf8"), text);
  });
});

for (const [name, text, pattern] of [
  ["duplicate YAML keys", "schema_version: 1\nschema_version: 1\n", /invalid YAML/],
  ["syntax errors", "entity: [\n", /invalid YAML/],
  ["multiple documents", "---\na: 1\n---\nb: 2\n", /invalid YAML/],
  ["custom tags", "entity: !custom test\n", /invalid YAML/],
  ["anchors and aliases", "entity: &entity { id: test }\nother: *entity\n", /aliases, anchors/],
  ["empty documents", "", /expected an object/],
] as const) {
  test(`loader rejects ${name}`, async () => withDataset(async directory => {
    await writeFile(join(directory, "test.yaml"), text);
    await assert.rejects(loadWorld(directory), pattern);
  }));
}

test("loader accepts supported .yml independently of entity ID", async () => {
  await withDataset(async directory => {
    await writeFile(join(directory, "test.yml"), stringify(document({ ...base("test"), type: "concept", tags: ["ritual"], related_entities: [] })));
    assert.equal((await loadWorld(directory)).getEntity("test")!.id, "test");
  });
});
