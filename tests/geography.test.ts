import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWorld } from "../src/world/loader.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { buildNarrativeContext } from "../src/scene/narrative-context-builder.js";

const memberships = {
  west: ["calderan", "ironbound", "davenport", "blackwater"],
  center: ["zul_rath", "khar_dune", "sandspear"],
  east: ["vaelrost", "frostspire", "skardgard"],
};
const geography = ["continent", ...Object.keys(memberships), ...Object.values(memberships).flat(), "mist_sea", "sorrow_sea", "silent_ocean", "chained_bay", "dragons_teeth_mountains"];
const expectedFeatures: Record<string, string[]> = {
  continent: ["continental nations"],
  west: ["national capital", "land border with Center", "temperate regional climate"],
  center: ["national capital", "land border with West", "land border with East", "arid regional climate"],
  east: ["national capital", "land border with Center", "armed neutrality", "cold regional climate"],
  mist_sea: [], sorrow_sea: [], silent_ocean: [], chained_bay: [],
  dragons_teeth_mountains: ["northern geographic barrier"],
  calderan: ["capital of West", "five-district civic structure", "legal slave-market control"],
  ironbound: ["fortified frontier city", "military and customs filtering point"],
  davenport: ["principal economic and maritime port", "stone docks and warehouses", "legal slave-market control"],
  blackwater: ["de facto autonomy", "fragmented criminal governance", "illegal maritime trade", "maritime rival"],
  zul_rath: ["capital of Center"],
  khar_dune: ["fortified caravan watering point", "underground slave and contraband markets"],
  sandspear: ["solitary black-basalt tower", "corsair and mercenary-mariner stronghold", "navigator groups and warlords", "maritime rival"],
  vaelrost: ["capital of East"],
  frostspire: ["rocky spur and fortified keep", "iron and coal mining", "military frontier garrison", "armed neutrality"],
  skardgard: ["principal coastal city", "fjord-like coast and dark stone fortifications", "whaling, shipbuilding, and high-seas fishing"],
};

test("geography loads as 19 locations with explicit identity, containment, and classification", async () => {
  const world = await loadWorld("data");
  const locations = world.getEntitiesByType("location");
  // City-internal locations (Heartstone, the square outside it, the slave market) sit below Calderan and are not national geography.
  assert.deepEqual(locations.filter(e => !world.getAncestors(e.id).some(a => a.id === "calderan")).map(e => e.id).sort(), [...geography].sort());
  for (const id of geography) {
    const entity = locations.find(e => e.id === id)!;
    // Phase 1P ordinary-awareness annotations are the only additions (deliberately minimal migration).
    const awareness = ({ calderan: "public", davenport: "public" } as Record<string, string>)[entity.id];
    assert.deepEqual(entity.knowledge, { visibility: { narrator: true, player: true }, known_by: [], ...(awareness ? { awareness } : {}) });
    assert.deepEqual(entity.connections, []); // Neither containment nor border implies traversal.
    assert(Object.isFrozen(entity));
  }
  assert.equal(world.getEntity("continent")!.parent, null);
  assert.deepEqual(world.getChildren("continent").map(e => e.id).sort(), ["center", "dragons_teeth_mountains", "east", "west"]);
  for (const [nation, cities] of Object.entries(memberships)) {
    assert.equal(world.getEntity(nation)!.parent, "continent");
    assert.deepEqual(world.getChildren(nation).map(e => e.id).sort(), [...cities].sort());
    for (const city of cities) assert.deepEqual(world.getAncestors(city).map(e => e.id), [nation, "continent"]);
  }
});

test("canonical capitals and borders are distinct from travel connections", async () => {
  const world = await loadWorld("data");
  const locations = world.getEntitiesByType("location");
  const capitals = { west: "Calderan", center: "Zul-Rath", east: "Vaelrost" };
  const borders = { west: ["Center"], center: ["East", "West"], east: ["Center"] };
  for (const nation of ["west", "center", "east"] as const) {
    const features = locations.find(e => e.id === nation)!.features;
    const capitalFeatures = features.filter(f => f.name === "national capital");
    assert.equal(capitalFeatures.length, 1);
    assert.equal(capitalFeatures[0]!.description, capitals[nation]);
    const capital = locations.filter(e => e.parent === nation && e.name === capitals[nation]);
    assert.equal(capital.length, 1);
    assert.deepEqual(features.filter(f => f.name.startsWith("land border with ")).map(f => f.name.slice("land border with ".length)).sort(), borders[nation]);
  }
});

test("settlement features preserve supplied institutional and physical facts without matching narrative sentences", async () => {
  const world = await loadWorld("data");
  for (const location of world.getEntitiesByType("location").filter(e => geography.includes(e.id))) {
    // Feature labels carry the available schema's physical/institutional facts;
    // prose can be reworded without breaking these assertions.
    assert.deepEqual(location.features.map(f => f.name).sort(), [...expectedFeatures[location.id]!].sort());
  }
  const locations = world.getEntitiesByType("location");
  const rival = (id: string) => locations.find(e => e.id === id)!.features.find(f => f.name === "maritime rival")!.description;
  assert.equal(rival("blackwater"), "Sandspear");
  assert.equal(rival("sandspear"), "Blackwater");
  assert.equal(world.getEntity("blackwater")!.parent, "west");
});

test("waters and range have canonical names without invented national ownership or extra physical features", async () => {
  const world = await loadWorld("data");
  for (const [id, name] of Object.entries({ mist_sea: "Mist Sea", sorrow_sea: "Sorrow Sea", silent_ocean: "The Silent Ocean", chained_bay: "Chained Bay" })) {
    assert.equal(world.getEntity(id)!.name, name);
    assert.equal(world.getEntity(id)!.parent, null); // Surrounding waters are not contained by the landmass.
  }
  assert.equal(world.getEntity("dragons_teeth_mountains")!.name, "The Dragon's Teeth Mountains");
  assert.equal(world.getEntity("dragons_teeth_mountains")!.parent, "continent");
});

test("Calderan resolves existing city institutions without renaming permanent IDs; Heartstone is contained in Calderan", async () => {
  const world = await loadWorld("data");
  assert.equal(world.getEntity("calderan")!.name, "Calderan");
  for (const absent of ["caldrevan", "merovar", "sandspire"]) assert.equal(world.hasEntity(absent), false);
  assert.equal(world.getEntity("sandspear")!.name, "Sandspear");
  assert.deepEqual(world.getEntity("davenport")!.aliases, ["The Port of Chains"]);
  assert.deepEqual(world.getEntity("blackwater")!.aliases, ["The Unchained Haven"]);
  assert.deepEqual(world.getEntity("ironbound")!.aliases, ["The Fortress on the Edge"]);
  const names = new Map<string, string>();
  for (const e of world.getEntitiesByType("location")) {
    for (const name of [e.name, ...e.aliases]) {
      assert(!names.has(name.toLowerCase()) || names.get(name.toLowerCase()) === e.id, name);
      names.set(name.toLowerCase(), e.id);
    }
  }
  for (const id of ["main_city_structure", "city_magistracy"]) {
    const e = world.getEntity(id)!;
    assert("related_entities" in e && e.related_entities.includes("calderan"));
  }
  assert.deepEqual(world.getEntitiesByType("faction").find(e => e.id === "city_guard")!.territory, ["calderan"]);
  assert.equal(world.getEntity("heartstone")!.parent, "calderan_west");
  assert.deepEqual(world.getAncestors("heartstone_lr").map(e => e.id), ["heartstone", "calderan_west", "calderan", "west", "continent"]);
});

test("geography uses only location schema fields and adds no traversal edges or actor records", async () => {
  const world = await loadWorld("data");
  const fields = ["id", "type", "name", "display_name", "parent", "aliases", "summary", "content", "tags", "search_context", "knowledge", "features", "connections"].sort();
  for (const entity of world.getEntitiesByType("location").filter(e => geography.includes(e.id))) {
    assert.deepEqual(Object.keys(entity).sort(), fields);
    assert.deepEqual(entity.connections, []);
    // Structural guard only: this does not prove arbitrary prose contains no invented facts.
    assert(!Object.values(entity).some(value => typeof value === "number"));
  }
  assert.deepEqual(world.getEntitiesByType("faction").map(e => e.id).sort(), ["artisans_guild", "carrion_dogs", "church", "city_guard", "inquisition", "learned_arts_guild", "merchants_guild"]);
  // The only character record is the canonical player (baseline opening), not a geography actor.
  assert.deepEqual(world.getEntitiesByType("character").map(e => e.id), ["bartolomhew", "blackthorn", "bram_kessel", "brother_aven", "captain_doran_hale", "dren", "hadrik_voss", "jessa_rook", "korvin", "livia_marr", "mira_thorne", "mistress_elara", "nicco", "niles_vanner", "orla_fen", "pellan", "sister_mereth"]);
  assert.deepEqual(world.getEntitiesByType("event"), []);
  assert.deepEqual(world.getEntitiesByType("item"), []);
});

test("every geographic primary scene fits NarrativeContext without map image or unrelated expansions", async () => {
  const world = await loadWorld("data");
  for (const id of geography) {
    const runtime = new RuntimeState(world, { player_location: id, world_time: { world_minute: 0 } });
    const context = buildNarrativeContext(world, runtime);
    assert.equal(context.scene.player_location!.id, id);
    assert.deepEqual(context.scene.player_resources.mana, { current: 100, max: 100 });
    assert.deepEqual(context.scene.location_ancestry.map(e => e.id), world.getAncestors(id).map(e => e.id));
    assert.deepEqual(context.scene.present_characters, []);
    for (const ancestor of context.scene.location_ancestry) assert(!("content" in ancestor));
    assert.deepEqual(Object.keys(context.scene).sort(), ["location_ancestry", "player_location", "player_resources", "present_characters", "world_time"]);
  }
});
