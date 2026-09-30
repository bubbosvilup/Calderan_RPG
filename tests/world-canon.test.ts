import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { readFile } from "node:fs/promises";
import { document, location } from "./fixtures.js";

const newIds = ["magic_overview","mana","elemental_magic","light_and_shadow","magic_subschools","races_overview","humans","elves","dwarves","beastfolk","mixed_ancestry","continental_structure","west_governance","west_slavery","main_city_structure","merchants_guild","artisans_guild","learned_arts_guild","church","inquisition","city_guard","city_magistracy"];
const factionIds = ["artisans_guild", "carrion_dogs", "church", "city_guard", "inquisition", "learned_arts_guild", "merchants_guild"];

test("Phase 1E's 22 records and West's two lore additions have explicit policies and valid references", async () => {
  const world = await loadWorld("data");
  const records = ["world_lore", "concept", "faction"].flatMap(type => world.getEntitiesByType(type as "world_lore" | "concept" | "faction"));
  assert.deepEqual(records.map(e => e.id).sort(), [...newIds, "grey_brook", "calderan_west_daily_life", "carrion_dogs"].sort());
  assert.equal(world.getEntitiesByType("world_lore").length, 17);
  assert.equal(world.getEntitiesByType("concept").length, 1);
  const aliases = new Set<string>();
  for (const entity of records) {
    assert.match(entity.id, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
    // Phase 1P ordinary-awareness annotations are the only additions (deliberately minimal migration).
    const awareness = ({ magic_subschools: "specialized", light_and_shadow: "public", inquisition: "public", learned_arts_guild: "local:west", main_city_structure: "local:calderan", grey_brook: "local:calderan", calderan_west_daily_life: "local:calderan", carrion_dogs: "specialized" } as Record<string, string>)[entity.id];
    assert.deepEqual(entity.knowledge, { visibility: { narrator: true, player: true }, known_by: [], ...(awareness ? { awareness } : {}) });
    assert(entity.summary.length <= 600);
    assert(entity.content.length <= 2000);
    for (const alias of entity.aliases) {
      assert(!aliases.has(alias.toLowerCase()), alias);
      aliases.add(alias.toLowerCase());
    }
    if ("related_entities" in entity) for (const id of entity.related_entities) assert(world.hasEntity(id));
  }
  assert.deepEqual(world.getEntitiesByType("faction").map(e => e.id).sort(), factionIds);
  assert.deepEqual(world.getEntitiesByType("character").map(e => e.id), ["bartolomhew", "blackthorn", "bram_kessel", "brother_aven", "captain_doran_hale", "dren", "hadrik_voss", "jessa_rook", "korvin", "livia_marr", "mira_thorne", "mistress_elara", "nicco", "niles_vanner", "orla_fen", "pellan", "sister_mereth"]);
  assert.deepEqual(world.getEntitiesByType("event"), []);
  assert.deepEqual(world.getEntitiesByType("item"), []);
});

test("allowed ambiguous aliases never become implicit ID resolution", () => {
  const a = location("first"); a.aliases = ["shared"];
  const b = location("second"); b.aliases = ["shared"];
  const world = new WorldStore([a, b].map(e => ({ source: e.id + ".yaml", document: document(e) })));
  assert.equal(world.getEntity("shared"), undefined);
  assert.equal(world.getEntity("first")!.id, "first");
  assert.equal(world.getEntity("second")!.id, "second");
});

test("magic and peoples retain the supplied non-deterministic boundaries", async () => {
  const world = await loadWorld("data");
  const prose = (id: string) => world.getEntity(id)!.content;
  assert.match(prose("light_and_shadow"), /Light is not inherently good; Shadow is not inherently evil/);
  assert.match(prose("light_and_shadow"), /no spell automatically summons the Inquisition/);
  assert.match(prose("beastfolk"), /West social prejudice, not biological truth/);
  assert.match(prose("beastfolk"), /not universal across the world/);
  const east = world.getEntitiesByType("location").find(e => e.id === "east")!;
  assert(east.features.some(f => f.name === "armed neutrality"));
  assert.equal(east.features.find(f => f.name === "national capital")!.description, "Vaelrost");
  assert.match(prose("continental_structure"), /not perpetual declared total war/);
  assert.match(prose("magic_subschools"), /illustrative possibilities, not an exhaustive canonical taxonomy/);
  assert.match(prose("mana"), /no fixed spellbook/);
  assert.match(prose("mana"), /Sleep or rest alone grants nothing/);
  for (const anchor of ["5 for minor", "25 for superficial", "50 for serious", "75 for major"]) assert(prose("mana").includes(anchor));
});

test("national institutions preserve guild, Church, and civic distinctions without invented factions", async () => {
  const world = await loadWorld("data");
  assert.equal(world.hasEntity("mages_guild"), false);
  const learned = world.getEntity("learned_arts_guild")!;
  assert.equal(learned.name, "Learned Arts Guild");
  assert.match(learned.content, /magical scholarship, and practicing mages/);
  assert.match(learned.content, /do not automatically rule/);
  assert.match(world.getEntity("church")!.content, /not a guild/);
  assert.equal(world.getEntity("inquisition")!.parent, "church");
  assert.deepEqual(world.getAncestors("inquisition").map(e => e.id), ["church"]);
  assert.equal(world.getEntity("city_magistracy")!.type, "concept");
  assert.match(world.getEntity("city_magistracy")!.content, /not a formal subordinate branch/);
  for (const id of ["merchants_guild", "artisans_guild", "learned_arts_guild"]) {
    assert.match(world.getEntity(id)!.content, /local.*representatives/i);
    assert.match(world.getEntity(id)!.content, /national representative/);
  }
  assert.deepEqual(world.getEntitiesByType("faction").map(e => e.id).sort(), factionIds);
});

test("Calderan identity resolves main-city lore; Heartstone is contained in Calderan without changing its physical canon", async () => {
  const world = await loadWorld("data");
  assert.deepEqual(world.getEntitiesByType("location").map(e => e.id).filter(id => id.startsWith("heartstone")).sort(), ["heartstone", "heartstone_cy", "heartstone_f1", "heartstone_lr", "heartstone_square", "heartstone_u1"]);
  assert.equal(world.getEntity("heartstone")!.parent, "calderan_west"); assert.equal(world.getEntity("heartstone_square")!.parent, "calderan_west");
  assert.equal(world.hasEntity("caldrevan"), false);
  const city = world.getEntity("main_city_structure")!;
  assert.equal(city.type, "world_lore");
  assert(city.type === "world_lore" && city.related_entities.includes("calderan"));
  assert.match(city.summary, /West, East, North, South, and Center/);
  assert.match(city.content, /not exclusive zoning/);
  assert.match(world.getEntity("calderan_north")!.content, /Religion is not universally fraudulent/);
  assert.match(world.getEntity("calderan_north")!.content, /temple healing is not universally magical/);
  for (const faction of world.getEntitiesByType("faction")) assert.deepEqual(faction.territory, faction.id === "city_guard" ? ["calderan"] : []);
  const manaYaml = await readFile("data/world/magic/mana.yaml", "utf8");
  assert(!manaYaml.includes("current_mana:"));
});
