import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWorld } from "../src/world/loader.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import type { WorldEntity } from "../src/types/entities.js";
import type { DeepReadonly } from "../src/types/readonly.js";

/** Calderan NPC Authoring Pass 3: civic, guild and district anchors. Roles, council seats, knowledge boundaries, no invented places. */
const world = await loadWorld("data");
type Character = Extract<WorldEntity, { type: "character" }>;
const npc = (id: string): Character => { const e = world.getEntity(id); assert.ok(e?.type === "character", id); return e as Character; };
const edge = (from: string, to: string) => npc(from).relationships.find(r => r.target === to);
const publicText = (e: DeepReadonly<WorldEntity>) => [e.name, e.summary, e.content, e.search_context, ...e.aliases, ...("appearance" in e && e.appearance ? [e.appearance] : []), ...("occupation" in e && e.occupation ? [e.occupation] : [])].join(" ");
const cast: Record<string, { readonly affiliations: readonly string[]; readonly work: string | null }> = {
  oren_quarn: { affiliations: ["city_magistracy"], work: "high_courts_of_calderan" },
  sister_veyra: { affiliations: ["church"], work: "saint_caldus_house" },
  severan_krauss: { affiliations: ["inquisition", "church"], work: "bastion_of_vigilance" },
  garran_holt: { affiliations: ["city_guard"], work: null },
  tavian_merrow: { affiliations: ["merchants_guild", "ducal_council_of_calderan"], work: "house_of_scales" },
  brunna_keld: { affiliations: ["artisans_guild", "ducal_council_of_calderan"], work: "house_of_making" },
  odelia_crane: { affiliations: ["learned_arts_guild", "ducal_council_of_calderan"], work: "the_collegium" },
  matthias_eld: { affiliations: ["learned_arts_guild"], work: "the_collegium" },
  halden_cross: { affiliations: ["city_guard"], work: "imperial_gate" },
  marta_pell: { affiliations: [], work: "wayfarers_rest" },
  rufus_tern: { affiliations: [], work: "the_long_yard" },
  lysandra_vell: { affiliations: [], work: "spire_academy" },
};

test("all pass 3 NPCs exist with exact affiliations, supplied workplaces and no home locations", () => {
  for (const [id, want] of Object.entries(cast)) {
    const c = npc(id);
    assert.deepEqual([...(c.affiliations ?? [])], [...want.affiliations], id);
    assert.equal(c.work_location, want.work, id); assert.equal(c.base_location, want.work, id); assert.equal(c.home_location, null, id);
    assert.ok(c.species && c.sex && c.age_band && c.appearance && c.purpose && c.morality && c.traits.length, id);
    assert.deepEqual(c.knowledge?.visibility, { narrator: true, player: true }, id);
  }
  // Holt has no invented Guard HQ; Rufus has no invented stable; the Registry stays a feature; no new places at all.
  assert.match(npc("garran_holt").content, /headquarters or principal office is not established/);
  assert.match(npc("rufus_tern").content, /stables are not a separately established location/);
  for (const id of ["guard_headquarters", "city_guard_headquarters", "mage_registry", "rufus_stables", "tern_stables", "quarn_residence", "holt_residence", "severan_residence", "marta_residence", "spire_academy_classroom"]) assert.equal(world.getEntity(id), undefined, id);
  assert.equal(world.getEntitiesByType("location").length, 96); // unchanged by this pass
  // The Magistracy remains a concept; no faction was created for it.
  assert.equal(world.getEntity("city_magistracy")!.type, "concept");
  assert.ok(!world.getEntitiesByType("faction").some(f => /magistra/i.test(f.id)));
  // Veyra is Saint Caldus House's medical sister, not Mereth's charity role; they are not personally linked.
  assert.equal(npc("sister_veyra").work_location, "saint_caldus_house"); assert.equal(npc("sister_mereth").work_location, "saint_orra_house");
  assert.deepEqual(npc("sister_veyra").relationships, []); assert.ok(!npc("sister_mereth").relationships.some(r => r.target === "sister_veyra"));
});

test("the Ducal Council keeps exactly nine standing seats; the named guild representatives hold the three guild seats", () => {
  const seated = world.getEntitiesByType("character").filter(c => (c.affiliations ?? []).includes("ducal_council_of_calderan")).map(c => c.id).sort();
  assert.deepEqual(seated, ["brunna_keld", "cassian_valerius", "corvinus_morvath", "odelia_crane", "sybilla_melakor", "tavian_merrow", "uther_calderan", "vaelen_vael", "vorn_dravendark"]);
  const council = world.getEntity("ducal_council_of_calderan")!;
  assert.match(council.content, /nine standing seats/);
  assert.match(council.content, /Tavian Merrow \(Merchants Guild\), Brunna Keld \(Artisans Guild\) and Magister Odelia Crane \(Learned Arts Guild\)/);
  // Non-permanent attendees are not seated.
  for (const id of ["oren_quarn", "garran_holt", "helbrecht"]) assert.ok(!(npc(id).affiliations ?? []).includes("ducal_council_of_calderan"), id);
  for (const id of ["oren_quarn", "garran_holt"]) assert.match(npc(id).content, /no permanent Ducal Council seat/, id);
  // No invented Guildmaster titles.
  for (const e of world.listEntities()) assert.doesNotMatch(publicText(e), /Guildmaster|Guild Master|Grand Master/i, e.id);
  assert.match(npc("tavian_merrow").private_notes!, /no Guildmaster or other guild office is established/);
  assert.equal(world.getEntity("merchants_guild")!.type === "faction" && (world.getEntity("merchants_guild") as { members: readonly string[] }).members.includes("tavian_merrow"), true);
});

test("chains of command: Severan reports to Helbrecht; Holt is Doran's superior; no manufactured social networks", () => {
  assert.equal(edge("severan_krauss", "helbrecht")?.kind, "superior"); assert.equal(edge("helbrecht", "severan_krauss")?.kind, "subordinate");
  assert.equal(edge("garran_holt", "captain_doran_hale")?.kind, "subordinate"); assert.equal(edge("captain_doran_hale", "garran_holt")?.kind, "superior");
  assert.match(edge("severan_krauss", "helbrecht")!.description, /No personal friendship/);
  for (const id of ["oren_quarn", "sister_veyra", "tavian_merrow", "brunna_keld", "odelia_crane", "matthias_eld", "halden_cross", "marta_pell", "rufus_tern", "lysandra_vell"]) assert.deepEqual(npc(id).relationships, [], id);
  // Severan is distinct from Kaelen Dravendark and holds no noble affiliation; Brunna is not an Iron Hands member.
  assert.notEqual(npc("severan_krauss").name, npc("kaelen_dravendark").name);
  assert.ok(!(npc("severan_krauss").affiliations ?? []).some(a => a.startsWith("house_")));
  assert.ok(!(world.getEntity("iron_hands") as { members: readonly string[] }).members.includes("brunna_keld"));
  assert.ok(!(npc("brunna_keld").affiliations ?? []).includes("iron_hands"));
});

test("knowledge boundaries: no new Light-secret knowers; Severan knows Null Dust operationally but not the ritual; nothing leaks", () => {
  assert.deepEqual(world.getChunk("sun_emperor.light_secret")!.knowledge!.known_by, ["cassian_valerius", "helbrecht"]);
  assert.deepEqual(world.getEntity("mutilating_ritual")!.knowledge!.known_by, ["helbrecht"]);
  assert.deepEqual(world.getEntity("null_dust")!.knowledge!.known_by, ["helbrecht", "severan_krauss"]);
  const knowers = new Set([...world.listEntities().flatMap(e => e.knowledge?.known_by ?? []), ...world.listChunks().flatMap(c => c.knowledge?.known_by ?? [])]);
  for (const id of Object.keys(cast)) if (id !== "severan_krauss") assert.ok(!knowers.has(id), id);
  const SECRET = /real Light mage|genuine Light mage|immortality (?:derives|is tied|comes)|capture, silence, torture|Mutilating Ritual|sever\w* the target/i;
  for (const id of Object.keys(cast)) assert.doesNotMatch(publicText(npc(id)), SECRET, id);
  const search = new LexicalSearch(new RetrievalService(world));
  for (const query of ["Severan Mutilating Ritual", "Odelia Crane Light mage", "Quarn Sun Emperor secret", "Veyra Light magic healing"]) {
    const hits = search.search({ query, limit: 5 }, "player").candidates.map(c => "chunk_id" in c ? c.chunk_id : c.entity_id);
    assert.ok(!hits.includes("sun_emperor.light_secret") && !hits.includes("mutilating_ritual"), query);
  }
});

test("signature behaviours and undefined canon stay as supplied", () => {
  assert.match(npc("oren_quarn").content, /Under which authority\?/);
  assert.match(npc("garran_holt").content, /Whose problem is this supposed to be\?/);
  assert.match(npc("brunna_keld").content, /Who actually has to make it\?/);
  assert.match(npc("odelia_crane").content, /What exactly did you observe\?/);
  assert.match(npc("halden_cross").morality!, /difficult to bribe/);
  assert.match(npc("marta_pell").content, /runs no brothel/);
  assert.match(npc("rufus_tern").morality!, /will not knowingly overwork an injured animal/);
  assert.match(npc("brunna_keld").age_band!, /Dwarven equivalent/); assert.doesNotMatch(npc("brunna_keld").age_band!, /\d/);
  for (const id of ["oren_quarn", "sister_veyra", "garran_holt"]) assert.match(npc(id).private_notes!, /family is not established/, id);
  assert.match(npc("severan_krauss").private_notes!, /family and life before the Inquisition are not established/);
  assert.match(npc("matthias_eld").private_notes!, /staffing structure is not established/);
  assert.match(npc("lysandra_vell").private_notes!, /curriculum beyond its broad established fields is not established/);
  assert.match(world.getEntity("ducal_council_of_calderan")!.content, /Voting, quorum and procedures are not established/);
});
