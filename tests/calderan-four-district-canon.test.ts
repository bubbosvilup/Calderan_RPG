import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWorld } from "../src/world/loader.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { buildNarrativeContext } from "../src/scene/narrative-context-builder.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";

/** Calderan Four-District + Institutional Authoring Pass 1: structure, visibility and canon-boundary guards. */
const world = await loadWorld("data");
const anchors: Record<string, readonly string[]> = {
  calderan_east: ["the_crucible", "the_merchants_mile", "the_smelter_pit", "house_of_scales", "house_of_making"],
  calderan_north: ["cathedral_of_the_bladed_sun", "saint_caldus_house", "pyres_of_the_fallen", "the_collegium", "spire_academy", "bastion_of_vigilance"],
  calderan_south: ["imperial_gate", "stonewatch_garrison", "calderan_south_prison", "the_long_yard", "wayfarers_rest"],
  calderan_center: ["ducal_citadel", "calderan_civil_registry", "ducal_archive", "office_of_holdings_and_title", "high_courts_of_calderan", "gilded_row", "fountain_court"],
};
/** Locations added by later passes (NPC Authoring Pass 2: The Bent Bough). */
const laterLocations: Record<string, readonly string[]> = { calderan_east: ["the_bent_bough"] };
const nobles = { house_vael: ["elspeth_vael", "seren_vael", "vaelen_vael"], house_melakor: ["azael_melakor", "gideon_melakor", "sybilla_melakor"],
  house_dravendark: ["boran_dravendark", "kaelen_dravendark", "vorn_dravendark"], house_morvath: ["corvinus_morvath", "iseult_morvath", "maelor_morvath"] };

test("four districts hold exactly the anchor locations with explicit public policies and only justified travel edges", () => {
  for (const [district, ids] of Object.entries(anchors)) {
    const children = world.getChildren(district).map(e => e.id).sort();
    for (const id of ids) {
      const e = world.getEntity(id)!;
      assert.equal(e.type, "location", id); assert.equal(e.parent, district, id);
      assert.deepEqual(e.knowledge?.visibility, { narrator: true, player: true }, id);
      assert.ok(e.knowledge?.awareness, id);
    }
    assert.deepEqual(children.filter(id => !world.getProvenance(id)!.source_path.includes("routes/")), [...ids, ...(laterLocations[district] ?? [])].sort(), district);
  }
  const edges = Object.values(anchors).flat().flatMap(id => { const e = world.getEntity(id)!; return e.type === "location" ? e.connections.map(c => `${id}->${c.target}`) : []; }).sort();
  assert.ok(edges.includes("the_crucible->the_merchants_mile") && edges.includes("the_merchants_mile->the_crucible"));
  // Headquarters sit in their districts, not Center; the gates and road are features, not invented entities.
  for (const [hq, district] of [["house_of_scales", "calderan_east"], ["house_of_making", "calderan_east"], ["the_collegium", "calderan_north"], ["cathedral_of_the_bladed_sun", "calderan_north"], ["bastion_of_vigilance", "calderan_north"]] as [string, string][]) assert.equal(world.getEntity(hq)!.parent, district);
  for (const id of ["the_masterworks", "gold_cloister", "mage_registry", "mages_guild", "mercenary_guild"]) assert.equal(world.getEntity(id), undefined, id);
});

test("every new location fits the NarrativeContext limits as a primary scene", () => {
  for (const id of Object.values(anchors).flat()) {
    const context = buildNarrativeContext(world, new RuntimeState(world, { player_location: id, world_time: { world_minute: 0 } }));
    assert.equal(context.scene.player_location!.id, id);
  }
});

test("the Sun Emperor's Light secret and the Mutilating Ritual stay restricted and never reach public text or player search", () => {
  const secret = world.getChunk("sun_emperor.light_secret")!;
  // NPC Pass 2: the High Archon and the High Inquisitor are the only authored knowers.
  assert.deepEqual(secret.knowledge, { visibility: { narrator: true, player: false }, known_by: ["cassian_valerius", "helbrecht"], awareness: "private" });
  assert.deepEqual(world.getEntity("mutilating_ritual")!.knowledge, { visibility: { narrator: true, player: false }, known_by: ["helbrecht"], awareness: "private" });
  const leaks = [/real Light mage/i, /immortality (?:derives|is tied|comes)/i, /capture, silence, torture/i, /Mutilating Ritual/i, /sever\w* the target/i];
  for (const e of world.listEntities()) {
    if (!e.knowledge?.visibility.player) continue;
    const text = [e.summary, e.content, e.search_context, ...e.aliases, ...("features" in e ? e.features.map(f => `${f.name} ${f.description}`) : [])].join(" ");
    for (const leak of leaks) assert.doesNotMatch(text, leak, `${e.id} ${leak}`);
  }
  for (const c of world.listChunks()) if ((c.knowledge ?? world.getEntity(c.entity_id)!.knowledge)?.visibility.player)
    for (const leak of leaks) assert.doesNotMatch(`${c.summary} ${c.content}`, leak, c.id);
  const search = new LexicalSearch(new RetrievalService(world));
  for (const query of ["Light mage", "Sun Emperor immortality Light magic", "Inquisition break a mage"]) {
    const hits = search.search({ query, limit: 5 }, "player").candidates.map(c => "chunk_id" in c ? c.chunk_id : c.entity_id);
    assert.ok(!hits.includes("sun_emperor.light_secret") && !hits.includes("mutilating_ritual"), query);
  }
});

test("institutions keep their separations: council seats, houses versus guilds, temporal versus spiritual authority", () => {
  const council = world.getEntity("ducal_council_of_calderan")!;
  assert.equal(council.type, "concept");
  for (const seat of ["Duke of Calderan", "High Archon of the West", "Merchants Guild", "Artisans Guild", "Learned Arts Guild", "House Vael", "House Melakor", "House Dravendark", "House Morvath"]) assert.match(council.content, new RegExp(seat));
  assert.match(council.content, /nine standing seats/);
  assert.match(council.content, /no permanent seats/);
  for (const [house, members] of Object.entries(nobles)) {
    const h = world.getEntity(house)!; assert.equal(h.type, "faction");
    assert.deepEqual(h.type === "faction" ? [...h.members].sort() : [], members);
    assert.equal(h.type === "faction" ? h.relations.length : 0, 3);
    assert.match(h.content, /not a guild/);
    for (const id of members) { const c = world.getEntity(id)!; assert.ok(c.type === "character" && !!c.affiliations?.includes(house)); }
  }
  // NPC Authoring Pass 2 supplied the house members' identities; their guards live in calderan-npc-pass-2.test.ts.
  const duke = world.getEntity("uther_calderan")!;
  assert.ok(duke.type === "character" && "base_location" in duke && duke.base_location === "ducal_citadel");
  assert.match(duke.content, /does not control Church doctrine/);
  assert.equal(world.getEntity("inquisition")!.parent, "church");
  assert.match(world.getEntity("church")!.content, /not a guild/);
  assert.match(world.getEntity("west_governance")!.content, /Sun Emperor is the reigning sovereign/);
  assert.doesNotMatch(world.getEntity("west_governance")!.content, /King, Queen/);
});

test("authored canon uses the settled names and avoids reference-franchise or modern terminology", () => {
  const text = [...world.listEntities().map(e => JSON.stringify(e)), ...world.listChunks().map(c => JSON.stringify(c))].join("\n");
  for (const banned of [/Learned Hearts/i, /Malakor/i, /\bvisa\b/i, /pyromancy/i, /Imperium/i, /Warhammer/i, /\bChaos\b/, /Mages Guild(?! )/, /Mercenary Guild/i, /Saint Michael/i, /Saint Jude/i])
    assert.doesNotMatch(text.replace(/there is no separate Mages Guild/gi, ""), banned, String(banned));
  assert.equal(world.getEntity("learned_arts_guild")!.name, "Learned Arts Guild");
  assert.equal(world.getEntity("church")!.name, "Church of the Sun Emperor");
  assert.equal(world.getEntity("saint_caldus_house")!.name, "Saint Caldus House");
});
