import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";

/** West economy/world-authoring pass: Calderan, Davenport, Ironbound, Blackwater, Woodsong Forest, Woodsingers, the World Tree. */
const world = await loadWorld("data");
const service = new RetrievalService(world), search = new HybridSearch(service);
const ids = async (query: string, audience: "narrator" | "player" = "narrator", limit = 4) =>
  (await search.search({ query, limit }, audience, "lexical")).candidates.map(c => c.kind === "chunk" && c.chunk_id ? c.chunk_id : c.entity_id);
const text = (id: string) => { const e = world.getEntity(id)!; return [e.summary, e.content, ...world.listChunks().filter(c => c.entity_id === id).map(c => c.content)].join(" ").replace(/\s+/g, " "); };

test("Calderan: same entity; manufacturing, Woodsong timber and Dragon's Teeth metalworking are retrievable; no 'Calderan metal' substance", async () => {
  const c = world.getEntity("calderan")!;
  assert.deepEqual([c.type, c.parent, c.name], ["location", "west", "Calderan"]);
  const t = text("calderan");
  assert.match(t, /high-skill manufacturing/); assert.match(t, /premium timber comes from Woodsong Forest/);
  assert.match(t, /dwarven artisans from the Dragon's Teeth Mountains/); assert.match(t, /not a separate natural material/);
  assert.ok((await ids("Calderan armour")).includes("calderan.economy_and_trade"));
  assert.ok((await ids("Calderan metal")).includes("calderan.economy_and_trade"));
  assert.equal(world.listEntities().filter(e => /calderan[ _]metal/i.test(e.id + " " + e.name)).length, 0);
  assert.match(text("iron_hands"), /Calderan metal\W+ a technique and alloy\s+tradition/);
});
test("Davenport: shipbuilding, pearls and marine production are explicit; no duplicate city", async () => {
  const d = world.getEntity("davenport")!;
  assert.ok(d.type === "location" && d.features.some(f => f.name === "West's principal shipyards") && d.features.some(f => f.name === "renowned pearls"));
  const t = text("davenport");
  assert.match(t, /large quantities of fish and marine food/); assert.match(t, /exceptionally fine pearls/); assert.match(t, /marine oils/);
  assert.match(t, /boats do not\s+enter Calderan through its walls/); // locked spatial canon preserved
  for (const q of ["Davenport shipyard", "Davenport pearls", "Davenport sailor"]) assert.ok((await ids(q)).includes("davenport.economy_and_port"), q);
  assert.equal(world.getEntitiesByType("location").filter(e => /davenport/i.test(e.name)).length, 1);
});
test("Ironbound: West frontier fortress with a military-service economy and repair smithing; the general is not invented", async () => {
  const i = world.getEntity("ironbound")!;
  assert.deepEqual([i.parent, i.name], ["west", "Ironbound"]);
  assert.ok(i.type === "location" && i.features.some(f => f.name === "fortified frontier city") && i.features.some(f => f.name === "military governance"));
  const t = text("ironbound");
  assert.match(t, /recruit skilled\s+guards, mercenaries, veterans and soldiers for hire/); assert.match(t, /reclaimed and recycled from broken weapons/);
  assert.match(t, /the general's identity is not established/);
  assert.doesNotMatch(t, /General [A-Z][a-z]+/); // no named general
  assert.ok((await ids("Ironbound smith")).includes("ironbound.military_economy"));
  assert.match(text("west_governance"), /Ironbound is an exception/);
});
test("Blackwater: pirate/smuggling economy and Blackwater Fire are retrievable; illegal trafficking stays distinct; the Duke is unnamed", async () => {
  const t = text("blackwater");
  assert.match(t, /Most of Blackwater's economy is illegal or semi-legal/); assert.match(t, /Blackwater Fire, a\s+rum produced locally/);
  assert.match(t, /illegal slave trafficking, distinct from West's legal regulated trade/);
  assert.match(t, /his name is not established/); assert.doesNotMatch(t, /Duke [A-Z][a-z]+/);
  assert.ok((await ids("Blackwater Fire")).includes("blackwater.illicit_economy"));
  assert.ok((await ids("Blackwater pirate")).includes("blackwater"));
  assert.equal(world.listEntities().filter(e => /blackwater fire/i.test(e.name)).length, 0); // kept inside Blackwater canon
});
test("Woodsong Forest: same stable ID, canonical name, no duplicate Northern Forest; Woodsingers retrievable; restricted harvesting; elves not all Woodsingers", async () => {
  const f = world.getEntity("calderan_northern_forest")!;
  assert.deepEqual([f.name, f.display_name, f.aliases, f.parent], ["Woodsong Forest", "Woodsong Forest", ["Northern Forest"], "continent"]);
  assert.equal(world.getEntitiesByType("location").filter(e => /northern forest|woodsong/i.test([e.name, ...e.aliases].join(" "))).length, 1);
  assert.doesNotMatch(text("calderan_northern_forest"), /world tree/i); // the public forest record never reveals it
  const w = text("woodsingers");
  assert.match(w, /do not freely\s+cut healthy Woodsong trees/); assert.match(w, /naturally fallen timber, dying trees/);
  assert.match(w, /not every captured elf is a Woodsinger/); assert.doesNotMatch(w, /world tree/i);
  assert.match(text("elves"), /Not every elf is a Woodsinger/);
  assert.ok((await ids("Woodsinger")).includes("woodsingers")); assert.ok((await ids("Woodsong elf")).includes("calderan_northern_forest"));
  // The existing Calderan Woodsigner faction is preserved, not merged or renamed.
  assert.deepEqual([world.getEntity("woodsigner")!.name, world.getEntity("arwen_woodsigner")!.name], ["Woodsigner", "Arwen Woodsigner"]);
});
test("World Tree: exists, restricted, absent from player retrieval, available to the narrator only as a secret candidate", async () => {
  const t = world.getEntity("world_tree")!;
  assert.deepEqual(t.knowledge, { visibility: { narrator: true, player: false }, known_by: [], awareness: "private" });
  assert.match(t.summary, /^Restricted:/); assert.match(t.content, /physically exists deep within Woodsong Forest/); assert.match(t.content, /not established as a god/);
  assert.ok(!(await ids("World Tree", "player", 5)).includes("world_tree"));
  const narrator = (await search.search({ query: "World Tree", limit: 5 }, "narrator", "lexical")).candidates.find(c => c.entity_id === "world_tree");
  assert.ok(narrator && narrator.secret === true);
  assert.equal(service.get({ entity_id: "world_tree" }, "player").kind === "found", false);
});
test("cross-record trade links are retrievable and no transcription-variant entities exist", async () => {
  const t = text("west_trade_network");
  for (const link of [/Dragon's Teeth Mountains region reach Calderan/, /Woodsong Forest reach Calderan/, /Farms and granaries around Calderan feed the city/, /Fine textiles, salt,\s+spices/, /Davenport\s+supplies fish/, /Blackwater exports Blackwater Fire/, /keep Ironbound\s+supplied/, /Ordinary commerce with Center continues/])
    assert.match(t, link);
  assert.ok((await ids("Zul-Rath textiles salt spices Calderan")).includes("west_trade_network"));
  for (const absent of ["merovar", "cardun", "senspire", "zurrath", "zulrath", "vail_frost", "vailfrost", "aurat"]) assert.equal(world.hasEntity(absent), false, absent);
  assert.doesNotMatch(JSON.stringify(world.listEntities().map(e => [e.name, e.aliases])), /Merovar|Cardun|Senspire|Zurrath|Vail ?Frost|Aurat\b/);
  for (const [id, wording] of [["calderan_east", "Center District"], ["the_crucible", "Center District"], ["house_morvath", "Center District"]] as const) assert.match(text(id), new RegExp(wording));
});
