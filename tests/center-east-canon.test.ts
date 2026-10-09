import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";

/** Center and East macro-world pass: nations, Zul-Rath, Khar-Dune, Sandspear, Central Oasis, Vaelrost, Frostspire, Skardgard. */
const world = await loadWorld("data");
const search = new LexicalSearch(new RetrievalService(world));
const top = (query: string, n = 3) => search.search({ query, limit: n }, "narrator").candidates.map(c => c.kind === "chunk" && c.chunk_id ? c.chunk_id : c.entity_id);
const text = (id: string) => { const e = world.getEntity(id)!; return [e.summary, e.content, ...world.listChunks().filter(c => c.entity_id === id).map(c => c.content)].join(" ").replace(/\s+/g, " "); };

test("Center: stable IDs, Beastfolk-led martial culture, magic prohibition and tournament rulership, ruler unnamed", () => {
  for (const [id, name, parent] of [["center", "Center", "continent"], ["zul_rath", "Zul-Rath", "center"], ["khar_dune", "Khar-Dune", "center"], ["sandspear", "Sandspear", "center"], ["central_oasis_settlement", "Central Oasis", "center"]] as const)
    assert.deepEqual([world.getEntity(id)!.name, world.getEntity(id)!.parent], [name, parent], id);
  const t = text("center");
  assert.match(t, /it is prohibited throughout Center/); assert.match(t, /national law and culture, not every\s+individual's attitude/);
  assert.match(t, /chosen\s+every five years by a dangerous martial tournament/); assert.match(t, /may never compete again/);
  assert.match(t, /The ruler's title, the current ruler and the tournament's detailed rules are not\s+established/);
  assert.match(t, /not merely a\s+slave or criminal economy/);
  assert.ok(top("magic forbidden in Center").includes("center"));
});
test("Zul-Rath: spice and silk economy retrievable; slavery is an institution, not biology; human merchants are a tendency", () => {
  const t = text("zul_rath");
  assert.match(t, /dominant source\s+of most culinary spices/); assert.match(t, /salt is not exclusive to Center/);
  assert.match(t, /silk and luxury textiles are expensive,\s+prestigious and widely exported/);
  assert.match(t, /oppressive institution/); assert.match(t, /though not all/);
  assert.match(t, /a social and\s+institutional tendency, not a rule, and Beastfolk trade as well/);
  for (const q of ["Zul-Rath silk worker", "spice trader", "Beastfolk merchant from Zul-Rath"]) assert.ok(top(q).some(id => id.startsWith("zul_rath")), q);
  const beastfolk = text("beastfolk");
  assert.match(beastfolk, /Not every Beastfolk is\s+enslaved/); assert.match(beastfolk, /neither synonymous with slavery nor with rule/);
  assert.match(beastfolk, /cannot use magic/); assert.match(text("mana"), /Beastfolk, as currently\s+understood, cannot use magic/);
});
test("Khar-Dune, Sandspear and the Central Oasis keep their identities and gain distinct economies", () => {
  assert.match(text("khar_dune"), /more caravan-oriented,\s+mercenary-heavy and commercially rough/); assert.match(text("khar_dune"), /not a lawless one/);
  assert.ok(top("Khar-Dune caravan guard").includes("khar_dune.caravan_economy"));
  assert.match(text("sandspear"), /Davenport remains superior and more famous for large\s+conventional and fleet shipbuilding/);
  assert.ok(top("Sandspear sailor").includes("sandspear.maritime_economy"));
  const oasis = world.getEntity("central_oasis_settlement")!;
  assert.match(oasis.display_name, /provisional/); assert.match(oasis.content, /common tendency shaped by lifestyle, not a rule/);
  assert.match(oasis.content, /not\s+biology/); assert.doesNotMatch(JSON.stringify(oasis), /african|arab|bedouin/i);
});
test("East: Vaelrost capital, Frostspire exports, Skardgard maritime economy, neutrality preserved, no ruler invented", () => {
  assert.equal(world.getEntity("vaelrost")!.parent, "east");
  const east = world.getEntity("east")!;
  assert.ok(east.type === "location" && east.features.some(f => f.name === "national capital" && f.description === "Vaelrost"));
  assert.match(text("east"), /armed\s+neutrality/i); assert.match(text("east"), /resource-rich but climate-constrained, not poor/);
  assert.match(text("east"), /East's internal government, ruler, religion, and broader foreign policy\s+remain undefined/);
  assert.match(text("frostspire"), /It exports iron, coal and stone/); assert.ok(top("Frostspire worker").includes("frostspire.mining_economy"));
  assert.match(text("skardgard"), /whale oil and whale-derived industrial materials/); assert.ok(top("Skardgard sailor").includes("skardgard.maritime_economy"));
  assert.match(text("vaelrost"), /not superior to Calderan in precision manufacture or to Frostspire in extraction/);
  for (const id of ["east", "vaelrost", "frostspire", "skardgard"]) assert.doesNotMatch(text(id), /\b(?:King|Queen|Jarl|Emperor|Lord) [A-Z][a-z]+/, id);
});
test("cross-nation trade links are retrievable and no voice-transcription duplicates exist", () => {
  const t = text("aureth_trade");
  for (const link of [/Center sends West spices, silk and fine\s+textiles/, /West sends\s+Center precision manufactures, weapons and armour, wood/, /East sends West and Center iron, coal, cold-sea and whale products/, /West and Center send East spices, luxury textiles/])
    assert.match(t, link);
  for (const absent of ["zulrath", "car_dune", "kar_dune", "sandspier", "sandspire", "caldera", "vail_frost", "scardgard", "cardun"]) assert.equal(world.hasEntity(absent), false, absent);
  assert.doesNotMatch(JSON.stringify(world.listEntities().map(e => [e.name, e.aliases])), /Zulrath|Car ?Dune|Kar ?Dune|Sandspier|Sandspire|\bCaldera\b|Vail ?Frost|Scardgard/);
});
