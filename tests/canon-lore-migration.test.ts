import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { knowledgeGrants } from "../src/turn/knowledge-grants.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { backgroundGrounding } from "../src/turn/background-grounding.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Major canon lore migration (cosmology / Helion / Aureth / the Church / the First Voice): public, restricted and deep layers stay separate. */
const world = await loadWorld("data");
const service = new RetrievalService(world), lexical = new LexicalSearch(service);
const ALL = world.listEntities();
const SEALED = ALL.filter(e => e.knowledge?.secrecy).map(e => e.id);
const audible = (e: (typeof ALL)[number]) => !e.knowledge?.secrecy;
const corpus = (id: string) => { const e = world.getEntity(id)!; return [e.name, e.display_name, ...e.aliases, e.summary, e.content, ...world.listChunks().filter(c => c.entity_id === id).map(c => c.content)].join(" ").replace(/\s+/g, " "); };
const nonSealedText = ALL.filter(audible).map(e => [e.id, corpus(e.id)] as const);
const publicText = ALL.filter(e => e.knowledge?.visibility.player).map(e => [e.id, corpus(e.id)] as const);
const hits = (q: string, who: "narrator" | "player") => lexical.search({ query: q, limit: 5 }, who).candidates.map(c => c.kind === "chunk" && c.chunk_id ? c.chunk_id : c.entity_id);

test("1 the modern continent renders Helion, never Aureth; legacy id is preserved", () => {
  const continent = world.getEntity("continent")!;
  assert.deepEqual([continent.id, continent.name, continent.display_name], ["continent", "Helion", "Helion"]);
  for (const e of ALL.filter(e => e.type === "location")) assert.doesNotMatch(corpus(e.id), /Aureth/, e.id);
  assert.doesNotMatch(JSON.stringify(world.listEntities().filter(e => e.type === "location").map(e => e.aliases)), /Aureth/);
});
test("2 Eldaven exists only in restricted/sealed canon, with no default holder, and never reaches the player", () => {
  const withName = ALL.filter(e => /Eldaven/.test(corpus(e.id))).map(e => e.id).sort();
  assert.ok(withName.every(id => id === "forgotten_era_fragments" || SEALED.includes(id)), withName.join(","));
  const frag = world.getEntity("forgotten_era_fragments")!;
  assert.deepEqual(frag.knowledge, { visibility: { narrator: true, player: false }, known_by: [], awareness: "specialized" });
  for (const q of ["Eldaven", "what was the continent called before Year 0"]) assert.ok(!JSON.stringify(lexical.search({ query: q, limit: 5 }, "player")).includes("Eldaven"), q);
  assert.ok(nonSealedText.every(([id, t]) => id === "forgotten_era_fragments" || !/Eldaven/.test(t)));
});
test("3 Aureth's objective identity is the incarnation of Light, not a golden dragon", () => {
  const t = corpus("aureth_true_identity");
  assert.match(t, /current incarnation of Light/); assert.match(t, /sealed him/); assert.match(t, /not killed or destroyed/);
  assert.doesNotMatch(t, /is an ancient golden dragon|true creator|three draconic children|green dragon|red dragon|supreme Light mage/i);
  assert.match(t, /not a golden dragon/); assert.match(t, /did not create the world, the Four or dragons/);
  assert.equal(world.hasEntity("shadow_adversary"), false); assert.equal(world.hasEntity("beastfolk_origin_truth"), false);
});
test("4 public Aureth canon (Sun Emperor, doctrine, myth, reckoning) never reveals incarnation, sealing or the six forces", () => {
  for (const id of ["sun_emperor", "church", "church_doctrine", "aureth_creation_myth", "modern_reckoning", "the_four", "forgotten_era", "continent", "south_continent", "light_and_shadow"]) {
    const t = id === "sun_emperor" ? [corpus(id)].join(" ").replace(/Restricted state and theological secret[\s\S]*$/, "") : corpus(id);
    assert.doesNotMatch(t.replace(/Restricted state and theological secret.*$/s, ""), /incarnat|reincarnat|\bsealed (?:him|Aureth)|First Voice|complementary|mutually necessary|six primordial/i, id);
  }
  for (const [id, t] of publicText) assert.doesNotMatch(t, /First Voice|incarnation of (?:Light|Shadow)|six primordial forces/i, id);
});
test("5 the First Voice is inaccessible publicly: not fetchable, not searchable, no public reference", () => {
  for (const id of ["the_first_voice", "church_hidden_control", "primordial_cosmology", "aureth_true_identity", "first_voice_hidden_authority"]) for (const who of ["narrator", "player"] as const) assert.equal(service.get({ entity_id: id }, who).kind, "not_visible", `${id}/${who}`);
  for (const q of ["the First Voice", "First Voice Shadow incarnate", "who controls the Church", "hidden authority of the Church"]) for (const who of ["narrator", "player"] as const) {
    const r = JSON.stringify(lexical.search({ query: q, limit: 5 }, who));
    assert.doesNotMatch(r, /First Voice|incarnation of Shadow|hidden authority/i, `${q}/${who}`);
    assert.ok(!hits(q, who).some(id => SEALED.includes(id)), `${q}/${who}`);
  }
  assert.ok(nonSealedText.every(([, t]) => !/First Voice/.test(t)));
});
test("6 public Church doctrine still worships Aureth and Light, with Shadow as the opposed danger", () => {
  assert.match(corpus("church"), /sincerely worships Aureth, the Sun Emperor/); assert.match(corpus("church"), /1191/);
  const doctrine = corpus("church_doctrine");
  assert.match(doctrine, /Aureth, the Sun Emperor, revealed himself to the world in Year 0/); assert.match(doctrine, /Shadow is forbidden, corruptive and hostile to the divine order/);
  assert.match(doctrine, /does not declare him dead/); assert.match(doctrine, /Shadow magic\s+is absolute heresy/);
});
test("7 ordinary Church NPCs hold public doctrine only and receive no migrated restricted or sealed fact", () => {
  const grants = knowledgeGrants(world), ids = (who: string) => (grants.restricted.get(who) ?? []).map(g => g.id);
  const migrated = ["forgotten_era_restricted_access", "church_curated_history", "forgotten_era_fragments", "first_voice_hidden_authority", "sun_emperor.light_secret"];
  for (const who of ["sister_veyra", "brother_aven"]) { assert.deepEqual(ids(who).filter(id => migrated.includes(id)), [], who); assert.doesNotMatch(JSON.stringify(world.getEntity(who)), /Shadow|First Voice|hidden authority|incarnat/i, who); }
  assert.doesNotMatch(corpus("church"), /secretly worship|controlled by|worships Shadow/i);
});
test("8 senior NPCs receive exactly the intended partial fragments; nobody gets the deep truth", () => {
  const grants = knowledgeGrants(world), ids = (who: string) => (grants.restricted.get(who) ?? []).map(g => g.id).filter(id => id !== "mutilating_ritual");
  assert.deepEqual(ids("cassian_valerius"), ["church_curated_history", "first_voice_hidden_authority", "forgotten_era_restricted_access", "sun_emperor.light_secret"]);
  assert.deepEqual(ids("helbrecht"), ["church_curated_history", "forgotten_era_restricted_access", "sun_emperor.light_secret"]);
  assert.deepEqual(ids("severan_krauss"), ["forgotten_era_restricted_access"]);
  for (const id of ["aureth_true_identity", "the_first_voice", "primordial_cosmology", "church_hidden_control"]) assert.deepEqual(world.getEntity(id)!.knowledge!.known_by, [], id);
  const cassian = (grants.restricted.get("cassian_valerius") ?? []).find(g => g.id === "first_voice_hidden_authority")!;
  assert.doesNotMatch(cassian.summary, /Shadow|Light|incarnat|sealed/i); assert.match(cassian.summary, /does not know what the First Voice is/);
});
test("9 the Four are four, tied to the four great divisions, with no species or parentage", () => {
  const t = corpus("the_four");
  for (const place of ["West", "Center", "East", "South Continent"]) assert.match(t, new RegExp(place));
  assert.match(t, /Four sacred elemental figures/); assert.doesNotMatch(t, /\bthree\b|children|father|created by/i);
  assert.match(t, /not an established account of what they are/);
  assert.match(corpus("primordial_cosmology"), /not created by Aureth and are not his children, and are not required to be\s+dragons/);
  assert.ok(!/three|children/i.test(corpus("aureth_creation_myth")));
});
test("10 South Continent sits under Helion as the fourth division", () => {
  const south = world.getEntity("south_continent")!;
  assert.deepEqual([south.type, south.parent, south.name], ["location", "continent", "South Continent"]);
  assert.deepEqual(world.getChildren("continent").map(e => e.id).sort(), ["calderan_northern_forest", "center", "dragons_teeth_mountains", "east", "south_continent", "west"]);
  assert.match(corpus("continent"), /South\s+Continent, the fourth great division of Helion, lies to the south of West, Center and East/);
});
test("11 South Continent carries no invented capital, city, people, ruler or proper name", () => {
  const south = world.getEntity("south_continent")!;
  assert.deepEqual(world.getChildren("south_continent"), []); assert.deepEqual(south.aliases, []); assert.deepEqual(south.type === "location" ? south.connections : null, []);
  const t = corpus("south_continent");
  assert.match(t, /not a\s+proper name/); assert.match(t, /no capital in current canon/);
  assert.doesNotMatch(t, /capital of|ruled by|city of|the \w+ people|kingdom of|empire of|desert|jungle|snow/i);
  assert.ok(ALL.filter(e => e.id !== "south_continent").every(e => !("parent" in e) || e.parent !== "south_continent"));
});
test("12 the old Three Dragon Children model is gone from all non-sealed canon; dragon imagery survives only as iconography or folklore", () => {
  for (const [id, t] of nonSealedText) assert.doesNotMatch(t, /three (?:draconic )?(?:children|dragons)|dragon children|draconic child|creator of (?:the )?dragons|created (?:the )?dragons|green dragon|red dragon|father of/i, id);
  for (const [id, t] of nonSealedText) for (const m of t.matchAll(/golden dragon|as dragons|drawn as/gi)) assert.match(t, /iconography|folk art|folklore|dragon imagery/i, id + ":" + m[0]);
  assert.doesNotMatch(corpus("aureth_true_identity").replace(/not a golden dragon[^.]*\./, ""), /dragon children|three draconic/i);
});
test("13 old sleeper hooks survive as tier 2 secrets about one of the Four, without dragon species, parentage or invented sleepers", () => {
  for (const [id, place] of [["world_tree_sleeper", /World Tree of\s+Woodsong Forest/], ["oasis_sleeper", /Central Oasis/]] as const) {
    const e = world.getEntity(id)!, t = corpus(id);
    assert.equal(e.knowledge!.secrecy, "holder_only"); assert.deepEqual(e.knowledge!.known_by, []);
    assert.match(t, place); assert.match(t, /one of the Four/); assert.doesNotMatch(t, /dragon|green|red dragon|eldest|twin|female|male dragon/i);
  }
  assert.match(corpus("oasis_sleeper"), /red reflections/);
  assert.equal(ALL.filter(e => /sleeper/i.test(e.id)).length, 2); // no East or South sleeper was invented
  assert.match(corpus("primordial_cosmology"), /places of East's and South's are not established/);
});
test("14 no deep truth leaks through retrieval for any audience on migration-specific queries", () => {
  const queries = ["Aureth", "Helion", "Eldaven", "the Four", "South Continent", "Year 491", "Year 1191", "seven hundredth anniversary", "Forgotten Era", "Sun Emperor disappeared", "Light and Shadow", "sealed", "primordial", "incarnation", "who rules the Church", "dormant", "elemental forces", "reincarnation"];
  for (const q of queries) for (const who of ["narrator", "player"] as const) {
    assert.ok(!hits(q, who).some(id => SEALED.includes(id)), `${q}/${who}`);
    assert.doesNotMatch(JSON.stringify(lexical.search({ query: q, limit: 5 }, who)), /First Voice|incarnation of (?:Light|Shadow)|six primordial forces|incarnates cyclically|primordial elemental power/i, `${q}/${who}`);
  }
  assert.ok(hits("Forgotten Era", "player").includes("forgotten_era")); assert.ok(hits("Year 1191 anniversary", "player").includes("modern_reckoning"));
  assert.ok(hits("the Four", "player").includes("the_four"));
});
test("15 world validation, referential integrity and sealed-reference rules hold after migration", () => {
  assert.ok(world.listEntities().length >= 200);
  for (const e of ALL.filter(audible)) if ("related_entities" in e) for (const r of e.related_entities) { assert.ok(world.hasEntity(r), `${e.id} -> ${r}`); assert.ok(!SEALED.includes(r), `${e.id} -> sealed ${r}`); }
});
test("16 the geography ancestry and aliases show Helion, not Aureth", () => {
  assert.deepEqual(world.getAncestors("calderan").map(e => e.name), ["West", "Helion"]);
  assert.ok(world.getEntity("continent")!.aliases.includes("Known Continent"));
});
test("17 current year 1191, disappearance 491 and the 700-year difference are consistent wherever they appear", () => {
  assert.equal(1191 - 491, 700);
  const years = new Set<string>();
  for (const [id, t] of nonSealedText) for (const m of t.matchAll(/\bYear (\d+)\b|\b(1191|491)\b/g)) years.add(`${m[1] ?? m[2]}`), assert.ok(["0", "491", "1191"].includes(m[1] ?? m[2]!), `${id}: ${m[0]}`);
  assert.deepEqual([...years].sort(), ["0", "1191", "491"]);
  const r = corpus("modern_reckoning"); assert.match(r, /present year is 1191/); assert.match(r, /seven-hundredth\s+anniversary/);
  assert.match(corpus("sun_emperor"), /seven hundred years before the\s+present year 1191/);
});
test("18 no save-schema impact: a fresh campaign saves, loads and restores under the migrated world", () => {
  const campaign = createOpeningCampaign(world, "canon_migration_save");
  const text = serializeSave(createSaveFile(campaign.exportSnapshot(), world, "2026-10-10T10:00:00.000Z"), world);
  assert.deepEqual(decodeSave(text, world).snapshot, campaign.exportSnapshot());
});

// ------------------------------------------------------------------ First Voice information-leak audit (all narrator paths)
const LEAK = /incarnation of Shadow|incarnat|Shadow[^.]{0,40}(?:sealed|seals)|sealed Aureth|sealed the Sun Emperor|controls? the Church|hidden control|six primordial|mutually necessary|complementary/i;
function sceneCampaign(id: string, withCassian: boolean) {
  const c = createOpeningCampaign(world, id);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "cathedral_of_the_bladed_sun" } },
    { kind: "move_character", character_id: "cassian_valerius", location_id: withCassian ? "cathedral_of_the_bladed_sun" : "bastion_of_vigilance" }] });
  return c;
}
test("D1 narrator context never carries the First Voice unless its sole authored holder is present, and then only the partial grant", () => {
  const without = buildTurnContext(world, sceneCampaign("fv_without", false).exportSnapshot(), { input: "Who is the First Voice?" });
  assert.doesNotMatch(JSON.stringify(without), /First Voice/);
  const withHolder = buildTurnContext(world, sceneCampaign("fv_with", true).exportSnapshot(), { input: "Who is the First Voice?" });
  const grants = (withHolder.npc_private_canon ?? []).filter(g => g.id === "first_voice_hidden_authority");
  assert.deepEqual(grants.map(g => g.character_id), ["cassian_valerius"]);
  const ctxText = JSON.stringify(withHolder);
  assert.doesNotMatch(ctxText, LEAK); assert.doesNotMatch(ctxText, /Eldaven|Aureth, the current incarnation|primordial elemental power/);
  assert.match(grants[0]!.summary, /does not know what the First Voice is/);
});
test("D2 character, faction and relationship rendering for Church figures never names the First Voice or the Shadow link", () => {
  for (const id of ["cassian_valerius", "helbrecht", "severan_krauss", "sister_veyra", "brother_aven", "sun_emperor", "church", "inquisition"]) assert.doesNotMatch(JSON.stringify(world.getEntity(id)) + JSON.stringify(world.listChunks().filter(c => c.entity_id === id && c.knowledge?.visibility.player !== false)), /First Voice|incarnation of Shadow|hidden authority/i, id);
  for (const e of ALL.filter(e => e.type === "character" || e.type === "faction")) assert.doesNotMatch(JSON.stringify("relationships" in e ? e.relationships : []), /First Voice/, e.id);
});
test("D3 background grounding for a First Voice / Aureth / origin query uses public canon only", () => {
  const c = createOpeningCampaign(world, "fv_ground");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }] });
  const g = backgroundGrounding(world, buildTurnContext(world, c.exportSnapshot()), "Where is she from? Is she a follower of the First Voice?", [{ player: "*looks*", narration: "A woman sits in the pen.", status: "finalized", location_id: "calderan_slave_market" }]);
  assert.ok(g); assert.doesNotMatch(g!.block, /First Voice|Eldaven|incarnat|sealed/i);
  assert.match(g!.block, /Helion/); assert.match(g!.block, /South Continent/); assert.doesNotMatch(g!.block, /Aureth/);
});
test("D4 full narrator and controller payloads for First Voice, Aureth and Forgotten Era questions stay free of deep truth, with or without the holder present", async () => {
  async function payload(withCassian: boolean, input: string) {
    const c = sceneCampaign(`fv_prompt_${withCassian}_${input.length}`, withCassian), seen: string[] = [], svc = new RetrievalService(world);
    const co = new TurnCoordinator(world, { async generate(r: GenerationRequest) { seen.push(JSON.stringify(r)); return { text: "The wind moves.", ...metadata }; },
      async *stream(r: GenerationRequest) { seen.push(JSON.stringify(r)); yield { type: "text_delta", text: "The wind moves." }; yield { type: "completed", result: { text: "The wind moves.", ...metadata } }; } },
      { async propose(...args: unknown[]) { seen.push(JSON.stringify(args)); return { commands: [], ...metadata }; } }, { service: svc, search: new HybridSearch(svc) });
    await collect(co.runTurn({ campaign: c, player_input: input }));
    return seen.join("\n");
  }
  for (const input of ["Who is the First Voice? Who really leads the Church?", "Is the Sun Emperor Aureth a mortal man? Where did he go in Year 491?", "What was the continent called before Year 0, in the Forgotten Era?"]) {
    for (const holder of [false, true]) {
      const p = await payload(holder, input);
      assert.doesNotMatch(p, LEAK, `${holder}/${input}`); assert.doesNotMatch(p, /Eldaven|primordial elemental power|Sealed Truth|author_only/i, `${holder}/${input}`);
      if (!holder) assert.doesNotMatch(p.split(input).join("").replace(/First Voice\?/g, ""), /First Voice/, input); // the player's own words are the only mention
    }
  }
});
