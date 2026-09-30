import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWorld } from "../src/world/loader.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import type { WorldEntity } from "../src/types/entities.js";
import type { DeepReadonly } from "../src/types/readonly.js";

/** Calderan NPC Authoring Pass 2: power figures and East anchors. Identity, family, knowledge boundaries and undefined canon. */
const world = await loadWorld("data");
type Character = Extract<WorldEntity, { type: "character" }>;
const npc = (id: string): Character => { const e = world.getEntity(id); assert.ok(e?.type === "character", id); return e as Character; };
const edge = (from: string, to: string) => npc(from).relationships.find(r => r.target === to);
const publicText = (e: DeepReadonly<WorldEntity>) => [e.name, e.summary, e.content, e.search_context, ...e.aliases, ...("appearance" in e && e.appearance ? [e.appearance] : []), ...("occupation" in e && e.occupation ? [e.occupation] : [])].join(" ");
const affiliations: Record<string, readonly string[]> = {
  cassian_valerius: ["church", "ducal_council_of_calderan"], helbrecht: ["inquisition", "church"], uther_calderan: ["ducal_council_of_calderan"],
  vaelen_vael: ["house_vael", "ducal_council_of_calderan"], elspeth_vael: ["house_vael"], seren_vael: ["house_vael"],
  sybilla_melakor: ["house_melakor", "ducal_council_of_calderan"], azael_melakor: ["house_melakor"], gideon_melakor: ["house_melakor"],
  vorn_dravendark: ["house_dravendark", "ducal_council_of_calderan"], boran_dravendark: ["house_dravendark"], kaelen_dravendark: ["house_dravendark"],
  corvinus_morvath: ["house_morvath", "ducal_council_of_calderan"], iseult_morvath: ["house_morvath"], maelor_morvath: ["house_morvath"],
  gaston: [], dunrig_iron_hands: ["iron_hands"], arwen_woodsigner: ["woodsigner"],
};
const SECRET = /real Light mage|genuine Light mage|immortality (?:derives|is tied|comes)|capture, silence, torture|Mutilating Ritual|sever\w* the target/i;

test("pass 2 NPCs exist with supplied identities, affiliations and only canon-supported locations", () => {
  for (const [id, aff] of Object.entries(affiliations)) {
    const c = npc(id);
    assert.deepEqual([...(c.affiliations ?? [])], [...aff], id);
    assert.ok(c.species && c.sex && c.age_band && c.appearance && c.purpose && c.morality && c.traits.length, id);
    assert.ok(c.traits.length <= 24 && c.traits.every(t => t.length <= 200), id);
    assert.deepEqual(c.knowledge?.visibility, { narrator: true, player: true }, id);
  }
  assert.deepEqual([npc("cassian_valerius").base_location, npc("cassian_valerius").work_location, npc("cassian_valerius").home_location], ["cathedral_of_the_bladed_sun", "cathedral_of_the_bladed_sun", "cathedral_of_the_bladed_sun"]);
  assert.deepEqual([npc("helbrecht").work_location, npc("helbrecht").home_location], ["bastion_of_vigilance", null]);
  assert.deepEqual([npc("uther_calderan").base_location, npc("uther_calderan").home_location], ["ducal_citadel", "ducal_citadel"]);
  assert.equal(npc("vaelen_vael").work_location, "ducal_citadel");
  assert.equal(npc("arwen_woodsigner").work_location, "the_bent_bough");
  assert.equal(world.getEntity("the_bent_bough")!.parent, "calderan_east");
  for (const id of ["elspeth_vael", "seren_vael", "sybilla_melakor", "azael_melakor", "gideon_melakor", "boran_dravendark", "kaelen_dravendark", "iseult_morvath", "maelor_morvath"]) assert.equal(npc(id).base_location, null, id);
  // No invented residences, workshops or family seats.
  for (const id of ["vael_residence", "gaston_workshop", "iron_hands_workshop", "melakor_residence", "morvath_residence", "dravendark_residence"]) assert.equal(world.getEntity(id), undefined, id);
  for (const house of ["house_vael", "house_melakor", "house_dravendark", "house_morvath"]) assert.match(world.getEntity(house)!.name, /^House (?:Vael|Melakor|Dravendark|Morvath)$/);
  assert.doesNotMatch(JSON.stringify(world.listEntities()), /Malakor|Valis Vael/);
});

test("family and friendship edges are exactly the supplied ones, reciprocal where appropriate", () => {
  assert.equal(edge("vaelen_vael", "elspeth_vael")?.kind, "spouse"); assert.equal(edge("elspeth_vael", "vaelen_vael")?.kind, "spouse");
  for (const parent of ["vaelen_vael", "elspeth_vael"]) { assert.equal(edge(parent, "seren_vael")?.kind, "child"); assert.equal(edge("seren_vael", parent)?.kind, "parent"); }
  assert.equal(edge("uther_calderan", "vaelen_vael")?.kind, "friend"); assert.equal(edge("vaelen_vael", "uther_calderan")?.kind, "friend");
  assert.equal(edge("vaelen_vael", "corvinus_morvath")?.kind, "friend"); assert.equal(edge("corvinus_morvath", "vaelen_vael")?.kind, "friend");
  assert.equal(edge("vorn_dravendark", "boran_dravendark")?.kind, "sibling"); assert.equal(edge("boran_dravendark", "vorn_dravendark")?.kind, "sibling");
  assert.equal(edge("corvinus_morvath", "iseult_morvath")?.kind, "sibling"); assert.equal(edge("iseult_morvath", "corvinus_morvath")?.kind, "sibling");
  assert.equal(edge("vorn_dravendark", "kaelen_dravendark")?.kind, "child"); assert.equal(edge("kaelen_dravendark", "vorn_dravendark")?.kind, "parent");
  assert.equal(edge("uther_calderan", "sun_emperor")?.kind, "sovereign");
  assert.equal(edge("cassian_valerius", "helbrecht")?.kind, "professional"); assert.equal(edge("helbrecht", "cassian_valerius")?.kind, "professional");
  assert.match(edge("cassian_valerius", "helbrecht")!.description, /No personal friendship or hostility/);
  // No invented family: the Duke has no spouse or children; Melakor members and Maelor have no family edges.
  assert.ok(!npc("uther_calderan").relationships.some(r => /spouse|child|parent|sibling/.test(r.kind)));
  for (const id of ["sybilla_melakor", "azael_melakor", "gideon_melakor", "maelor_morvath", "gaston", "dunrig_iron_hands", "arwen_woodsigner"]) assert.deepEqual(npc(id).relationships, [], id);
  assert.match(npc("uther_calderan").content, /No wife, children or other family are established/);
  // Family resemblance: Seren inherits Elspeth's hair and eyes.
  for (const id of ["elspeth_vael", "seren_vael"]) { assert.match(npc(id).appearance!, /dark[- ]brown\b[^.]*wavy/i, id); assert.match(npc(id).appearance!, /green-hazel eyes/, id); }
});

test("Kaelen Dravendark is distinct from Inquisitor Severan (authored in NPC Pass 3); Kaelen is not formally named heir", () => {
  const kaelen = npc("kaelen_dravendark");
  assert.deepEqual([...(kaelen.affiliations ?? [])], ["house_dravendark"]);
  assert.equal(world.getEntity("inquisitor_severan"), undefined); // Severan is authored as severan_krauss, a separate person.
  assert.doesNotMatch(JSON.stringify(world.listEntities()), /Inquisitor Kaelen/);
  assert.ok(!(kaelen.affiliations ?? []).includes("inquisition")); assert.notEqual(npc("severan_krauss").name, kaelen.name);
  assert.match(kaelen.content, /Succession law is not established and she is not formally named heir/);
  assert.match(npc("maelor_morvath").content, /establishes no broader noble succession law/);
});

test("Gaston is a free, surname-less rat Beastfolk master clockmaker and not a mage", () => {
  const g = npc("gaston");
  assert.equal(g.name, "Gaston"); assert.deepEqual(g.aliases, []); assert.match(g.content, /has no surname/);
  assert.match(g.species!, /Beastfolk/); assert.match(g.species!, /rat/);
  assert.match(g.content, /now a free man/); assert.doesNotMatch(publicText(g), /\b(?:is|remains|currently) (?:still )?enslaved\b/i);
  assert.match(g.content, /he is not a mage/);
  assert.ok(!(g.affiliations ?? []).includes("learned_arts_guild"));
  assert.match(g.private_notes!, /manumission document/); assert.match(g.private_notes!, /no secret magical lore/);
  assert.ok(!world.getEntity("mage_registration")!.knowledge!.known_by.includes("gaston"));
});

test("Arwen's Beastfolk-origin belief is restricted clan tradition, not public or objective lore; no exact elf age", () => {
  const tradition = world.getChunk("woodsigner.beastfolk_origin_tradition")!;
  assert.deepEqual(tradition.knowledge, { visibility: { narrator: true, player: false }, known_by: ["arwen_woodsigner"], awareness: "private" });
  assert.match(tradition.content, /not established world truth/);
  for (const e of world.listEntities()) if (e.knowledge?.visibility.player) assert.doesNotMatch(publicText(e), /descend(?:ed|s)? from[^.]*elves|transformed[^.]*from[^.]*elves/i, e.id);
  assert.doesNotMatch(world.getEntity("beastfolk")!.content, /elf|elves/i);
  const search = new LexicalSearch(new RetrievalService(world));
  for (const query of ["Beastfolk descend from elves", "Woodsigner tradition Beastfolk origin", "Beastfolk transformed from Wood Elves"])
    assert.ok(!search.search({ query, limit: 5 }, "player").candidates.some(c => "chunk_id" in c && c.chunk_id === tradition.id), query);
  const arwen = npc("arwen_woodsigner");
  assert.doesNotMatch(arwen.age_band!, /\d/); assert.match(arwen.age_band!, /exact age not established/);
  assert.equal(arwen.species, "Wood Elf");
});

test("restricted knowledge: only Cassian and Helbrecht know the Light secret; nothing leaks to player-visible text or player search", () => {
  assert.deepEqual(world.getChunk("sun_emperor.light_secret")!.knowledge!.known_by, ["cassian_valerius", "helbrecht"]);
  assert.deepEqual(world.getEntity("mutilating_ritual")!.knowledge!.known_by, ["helbrecht"]);
  assert.deepEqual(world.getEntity("null_dust")!.knowledge!.known_by, ["helbrecht", "severan_krauss"]); // NPC Pass 3: operational knower
  const knowers = new Set([...world.listEntities().flatMap(e => e.knowledge?.known_by ?? []), ...world.listChunks().flatMap(c => c.knowledge?.known_by ?? [])]);
  for (const id of ["uther_calderan", "vaelen_vael", "elspeth_vael", "seren_vael", "sybilla_melakor", "azael_melakor", "gideon_melakor", "vorn_dravendark", "boran_dravendark", "kaelen_dravendark", "corvinus_morvath", "iseult_morvath", "maelor_morvath", "gaston", "dunrig_iron_hands"])
    assert.ok(!knowers.has(id), id);
  for (const id of Object.keys(affiliations)) {
    assert.doesNotMatch(publicText(npc(id)), SECRET, id);
    if (!["cassian_valerius", "helbrecht"].includes(id)) assert.doesNotMatch(npc(id).private_notes ?? "", /Sun Emperor's Light|Mutilating Ritual|Null Dust/, id);
  }
  const search = new LexicalSearch(new RetrievalService(world));
  for (const query of ["Cassian Valerius Light mage secret", "Helbrecht Mutilating Ritual", "High Archon knows the Sun Emperor is a Light mage", "Helbrecht Null Dust"]) {
    const hits = search.search({ query, limit: 5 }, "player").candidates.map(c => "chunk_id" in c ? c.chunk_id : c.entity_id);
    assert.ok(!hits.includes("sun_emperor.light_secret") && !hits.includes("mutilating_ritual"), query);
  }
});

test("East clans: supplied specialties, no invented arrival dates, recipe, inviting Duke or clan hierarchy", () => {
  const iron = world.getEntity("iron_hands")!, wood = world.getEntity("woodsigner")!;
  assert.ok(iron.type === "faction" && iron.members.includes("dunrig_iron_hands"));
  assert.ok(wood.type === "faction" && wood.members.includes("arwen_woodsigner"));
  for (const clan of [iron, wood]) {
    assert.doesNotMatch(clan.content, /\b\d{2,4}\b|\byear\b/i, clan.id);
    assert.match(clan.content, /neither the date nor the (?:Duke who invited them|inviting Duke) is established/, clan.id);
  }
  assert.match(iron.content, /not from magic/); assert.match(iron.content, /exact process is closely guarded clan knowledge/);
  assert.match(wood.content, /without a rigid clan-chief structure/);
  assert.equal(npc("dunrig_iron_hands").species, "Dwarf"); assert.match(npc("dunrig_iron_hands").age_band!, /Over 100/);
});
