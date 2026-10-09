import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";

/** Aureth world-content pass: continent name, myth, northern forest, central oasis, Dragon's Teeth dwarf homeland. */
const world = await loadWorld("data");
const search = new HybridSearch(new RetrievalService(world));
const top = async (query: string, n = 3) => (await search.search({ query, limit: n }, "narrator", "lexical")).candidates.map(c => c.entity_id);

test("the single continent entity keeps its ID and resolves as Aureth; nations are unchanged", () => {
  const continent = world.getEntity("continent")!;
  assert.deepEqual([continent.name, continent.display_name, continent.parent], ["Aureth", "Aureth", null]);
  assert.ok(continent.aliases.includes("Known Continent"));
  const roots = world.getEntitiesByType("location").filter(e => e.parent === null && !["mist_sea", "sorrow_sea", "silent_ocean", "chained_bay"].includes(e.id));
  assert.deepEqual(roots.map(e => e.id), ["continent"]);
  for (const [id, name] of [["west", "West"], ["center", "Center"], ["east", "East"]] as const) {
    assert.equal(world.getEntity(id)!.name, name); assert.equal(world.getEntity(id)!.parent, "continent");
  }
});
test("Aureth is retrievable by name and the creation myth is recorded as mythology", async () => {
  assert.equal((await top("Aureth"))[0], "continent");
  const myth = world.getEntity("aureth_creation_myth")!;
  assert.equal(myth.type, "world_lore");
  assert.ok("category" in myth && myth.category === "cultures");
  assert.match(myth.content, /myth/i); assert.match(myth.content, /not established fact/i);
  assert.ok((await top("golden dragon creation myth")).includes("aureth_creation_myth"));
});
test("the forest north of Calderan resolves under its canonical name Woodsong Forest and carries the elven population-center lore", async () => {
  const forest = world.getEntity("calderan_northern_forest")!;
  assert.equal(forest.type, "location"); assert.equal(forest.parent, "continent");
  // Named Woodsong Forest in the West economy pass; the former placeholder survives only as an alias of the same entity.
  assert.equal(forest.display_name, "Woodsong Forest"); assert.ok(forest.aliases.includes("Northern Forest"));
  assert.ok(forest.type === "location" && forest.features.some(f => f.name === "major elven population center"));
  assert.ok((await top("where do elves come from forest homeland")).includes("calderan_northern_forest"));
  const elves = world.getEntity("elves")!;
  assert.ok("related_entities" in elves && elves.related_entities.includes("calderan_northern_forest"));
});
test("central oasis resolves in Center with its cultural lore; no real-world labels or invented ethnonym", async () => {
  const oasis = world.getEntity("central_oasis_settlement")!;
  assert.equal(oasis.type, "location"); assert.deepEqual(world.getAncestors(oasis.id).map(e => e.id), ["center", "continent"]);
  assert.match(oasis.display_name, /provisional/i);
  assert.ok(oasis.type === "location" && oasis.features.some(f => f.name === "mounted martial tradition"));
  assert.match(oasis.content, /comes from culture and\s+training, not biology/);
  assert.doesNotMatch(JSON.stringify(oasis), /african|arab|bedouin/i);
  assert.ok((await top("desert mounted warriors scimitar horse riders oasis")).includes("central_oasis_settlement"));
});
test("Dragon's Teeth Mountains keep their identity and carry the dwarven homeland lore", async () => {
  const range = world.getEntity("dragons_teeth_mountains")!;
  assert.deepEqual([range.name, range.parent], ["The Dragon's Teeth Mountains", "continent"]);
  assert.ok(range.type === "location" && range.features.some(f => f.name === "ancestral dwarven homeland"));
  assert.match(range.content, /ancestral\s+homeland/); assert.match(range.content, /No single unified dwarf kingdom/);
  assert.ok((await top("dwarf homeland clans metalworking")).includes("dragons_teeth_mountains"));
  const dwarves = world.getEntity("dwarves")!;
  assert.ok("related_entities" in dwarves && dwarves.related_entities.includes("dragons_teeth_mountains"));
});
test("no Merovar canon and no renamed duplicate city or continent", () => {
  for (const absent of ["merovar", "caldrevan", "sandspire", "cardun", "zulrat", "balerost", "aureth"]) assert.equal(world.hasEntity(absent), false, absent);
  const all = [...world.getEntitiesByType("location"), ...world.getEntitiesByType("world_lore")];
  assert.doesNotMatch(JSON.stringify(all), /merovar/i);
  const names = world.getEntitiesByType("location").flatMap(e => [e.name, ...e.aliases]).map(n => n.toLowerCase());
  for (const city of ["calderan", "davenport", "blackwater", "ironbound", "zul-rath", "khar-dune", "sandspear", "vaelrost", "frostspire", "skardgard"]) assert.equal(names.filter(n => n === city).length, 1, city);
});
