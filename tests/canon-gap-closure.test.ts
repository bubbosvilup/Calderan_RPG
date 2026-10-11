import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { knowledgeGrants } from "../src/turn/knowledge-grants.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";

/** Canon gap closure pass: elements, the Four as child incarnations, no dragons, Church origin and hardening, mortal Light/Shadow doctrine, post-491 decline, Beastfolk, calendar constraints. */
const world = await loadWorld("data");
const service = new RetrievalService(world), lexical = new LexicalSearch(service);
const ALL = world.listEntities();
const corpus = (id: string) => { const e = world.getEntity(id)!; return [e.name, e.display_name, ...e.aliases, e.summary, e.content, ...world.listChunks().filter(c => c.entity_id === id).map(c => c.content)].join(" ").replace(/\s+/g, " "); };
const SEALED = ALL.filter(e => e.knowledge?.secrecy).map(e => e.id);
const TIER3 = ALL.filter(e => e.knowledge?.secrecy === "author_only").map(e => e.id);
const open = ALL.filter(e => !e.knowledge?.secrecy);
const openText = open.map(e => [e.id, corpus(e.id)] as const);
const chunkText = world.listChunks().filter(c => !(c.knowledge ?? world.getEntity(c.entity_id)!.knowledge)?.secrecy).map(c => [c.id, c.content.replace(/\s+/g, " ")] as const);
const allOpen = [...openText, ...chunkText];
const hits = (q: string, who: "narrator" | "player") => lexical.search({ query: q, limit: 5 }, who).candidates.map(c => c.kind === "chunk" && c.chunk_id ? c.chunk_id : c.entity_id);
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
/** Eight-word shingles of a sealed record; none may appear in any unsealed canon (a leak test that does not restate the sealed text). */
const shingles = (id: string) => { const w = words(corpus(id)), s = new Set<string>(); for (let i = 0; i + 8 <= w.length; i++) s.add(w.slice(i, i + 8).join(" ")); return s; };
const NEW_TIER3 = ["first_voice_operations", "hidden_persecution_truth", "beastfolk_origin"];

test("G1 elemental mapping is West=Earth, Center=Fire, East=Water, South=Air in deep canon and tradition, with no contradicting pairing anywhere", () => {
  assert.match(corpus("primordial_cosmology"), /West is Earth, Center is Fire, East is Water and the South Continent is Air/);
  for (const id of ["the_four", "continent"]) assert.match(corpus(id), /Earth with West, Fire with Center, Water\s+with East and Air with the South Continent/, id);
  assert.match(corpus("elemental_magic"), /Earth with West, Fire with Center, Water\s+with East and Air with the South Continent/);
  for (const [id, t] of [...allOpen, ["primordial_cosmology", corpus("primordial_cosmology")] as const]) assert.doesNotMatch(t, /Earth with (?:Center|East|South)|Fire with (?:West|East|South)|Water with (?:West|Center|South)|Air with (?:West|Center|East)|West is (?:Fire|Water|Air)|Center is (?:Earth|Water|Air)|East is (?:Earth|Fire|Air)/, id);
  assert.match(corpus("elemental_magic"), /not a rule of who can learn what/);
  assert.match(corpus("primordial_cosmology"), /same four categories as mortal elemental magic/); assert.match(corpus("primordial_cosmology"), /not a cultural one/);
});
test("G2 the Four are the current embodied child incarnations of the elements, parallel to but not inferred identical to Light and Shadow", () => {
  const t = corpus("primordial_cosmology");
  assert.match(t, /current embodied child\s+incarnations of Earth, Fire, Water and Air/); assert.match(t, /whether their incarnation works as Light's and Shadow's does is\s+not inferred and is undefined/);
  assert.match(t, /no\s+established names, sexes, personalities, ages, species, origin\s+stories, detailed powers or combat abilities/);
  assert.match(t, /not dragons and have never been dragons/); assert.match(t, /not created by Aureth and are not his children/);
  assert.match(t, /alive but dormant, not dead/); assert.match(t, /no\s+method of waking them is established/);
  assert.doesNotMatch(corpus("the_four"), /dragon|incarnat|child|dormant|sleep/i);
});
test("G3 dormant locations: Earth in the World Tree, Fire beneath the oasis, Water and Air unlocated, and no extra sleeper records", () => {
  assert.match(corpus("world_tree_sleeper"), /Earth child/); assert.match(corpus("world_tree_sleeper"), /World Tree is the objective identity of the sleeper/);
  assert.match(corpus("oasis_sleeper"), /Fire child/); assert.match(corpus("oasis_sleeper"), /the being itself is not red/); assert.match(corpus("oasis_sleeper"), /red reflections/);
  const t = corpus("primordial_cosmology");
  assert.match(t, /Water child lies dormant somewhere in the East and the Air child somewhere in the South Continent, and\s+neither place is established/);
  assert.equal(ALL.filter(e => /sleeper/i.test(e.id)).length, 2);
  assert.deepEqual(world.getChildren("south_continent"), []);
  assert.equal(world.getEntity("world_tree_sleeper")!.knowledge!.secrecy, "holder_only"); assert.deepEqual(world.getEntity("oasis_sleeper")!.knowledge!.known_by, []);
});
test("G4 Nicco: an otherworlder with extremely rare Light of unknown cause; no Aureth link; the Light-mage fact stays in engine state", () => {
  const nicco = corpus("nicco");
  assert.match(nicco, /Light, which is extraordinarily rare; why he has it is unknown/); assert.match(nicco, /nothing\s+establishes any link between him and Aureth/);
  assert.doesNotMatch(nicco, /reincarnat|\bheir\b|chosen of/i);
  const c = createOpeningCampaign(world, "gap_nicco");
  assert.ok(JSON.stringify(c.exportSnapshot()).includes("Nicco is a Light mage."));
  assert.match(corpus("aureth_true_identity"), /Nicco is not established as his reincarnation, heir, fragment or chosen/);
  assert.match(corpus("primordial_cosmology"), /mortal Light mage is not an incarnation of Light/);
});
test("G5 Aureth's prison is a pocket dimension; only the First Voice definitively knows the access; nothing about it is defined", () => {
  const t = corpus("aureth_true_identity");
  assert.match(t, /pocket dimension, a space outside the ordinary geography/); assert.match(t, /Only the First Voice definitively knows how it is\s+reached, and that method is not authored here/);
  for (const k of ["appearance", "physical rules", "time flow", "dimensions", "entrance", "access ritual", "key", "conscious", "communicate"]) assert.match(t, new RegExp(k));
  assert.ok(openText.every(([id, x]) => !/pocket dimension/i.test(x)), "the prison never appears in unsealed canon");
});
test("G6 the Church began in Year 0, benevolent, with no Inquisition; the Inquisition and the hardening are post-491 (public, restricted and sealed layers)", () => {
  const origins = corpus("church_origins");
  assert.match(origins, /began in Year 0/); assert.match(origins, /sincerely\s+devoted and generous/); assert.doesNotMatch(origins, /Inquisition/i);
  const sealed = corpus("church_hidden_control");
  assert.match(sealed, /not secretly founded by Shadow, was not originally corrupt, and had no Inquisition/); assert.match(sealed, /the Inquisition was created after 491/);
  for (const k of ["centralized", "censorship increased", "restricted", "doctrine hardened", "persecution of magic", "political influence"]) assert.match(sealed, new RegExp(k));
  const r = world.getEntity("church_post_491_history")!;
  assert.deepEqual(r.knowledge, { visibility: { narrator: true, player: false }, known_by: ["cassian_valerius", "helbrecht"], awareness: "private" });
  assert.match(corpus("church_post_491_history"), /did not exist\s+in the Sun Emperor's reign/);
  assert.ok(!hits("When was the Inquisition founded?", "player").includes("church_post_491_history"));
});
test("G7 Aureth was sovereign of all Helion; West's rule in his name and later regional independence both stand", () => {
  assert.match(corpus("helion_empire"), /sovereign of all of Helion, a\s+continent-wide empire in which local lords, cities and regional authorities kept their own offices/);
  assert.match(corpus("helion_empire"), /fragmented into dukedoms, noble holdings, regional rulers and competing\s+states/); assert.match(corpus("helion_empire"), /West's\s+Dukes still govern in the Sun Emperor's name/);
  assert.match(corpus("sun_emperor"), /sovereign of the whole of Helion/); assert.match(corpus("west_governance"), /sovereign of all Helion/);
  for (const [id, t] of allOpen) assert.doesNotMatch(t, /sovereign of West|West's (?:divine )?sovereign|reigning sovereign of West|rules? only West/i, id);
  assert.match(corpus("uther_calderan"), /in the Sun Emperor's name/); assert.match(corpus("aureth_true_identity"), /sovereign of all of\s+Helion/);
});
test("G8 the Canticle of the Watchful Sun is public, short, devotional, ambiguous and leaks nothing", () => {
  const e = world.getEntity("sun_emperor_prayer")!, t = corpus("sun_emperor_prayer");
  assert.deepEqual(e.knowledge, { visibility: { narrator: true, player: true }, known_by: [], awareness: "public" });
  assert.match(t, /Keep me in the Light, and the Light in my keeping/); assert.match(t, /Where pride wears the colors of humility, let me look twice/);
  assert.ok(t.split(/\n|\. /).length < 40);
  assert.doesNotMatch(t, /First Voice|incarnat|sealed|Shadow|conspir|Church leader|High Archon|Inquisit/i);
  assert.ok(hits("Canticle of the Watchful Sun prayer", "player").includes("sun_emperor_prayer"));
  assert.match(corpus("sun_emperor_shadow_warnings"), /Canticle of the Watchful Sun/);
  assert.match(corpus("aureth_true_identity"), /He did not write\s+that the First Voice is Shadow|he did not write\s+that the First Voice is Shadow/i);
  assert.match(corpus("aureth_true_identity"), /No line names anyone, and an\s+ordinary priest cannot solve the conspiracy/);
});
test("G9 Light mage is not Light incarnation and Shadow mage is not Shadow incarnation; rarity and prevalence are cultural scales", () => {
  const t = corpus("primordial_cosmology");
  assert.match(t, /mortal Light mage is not an incarnation of Light and a mortal Shadow mage is not an incarnation\s+of Shadow/); assert.match(t, /fraction or expression of a force/);
  const pub = corpus("light_and_shadow");
  assert.match(pub, /perhaps once in a century, a figure of tradition and not a rule/); assert.match(pub, /somewhat more common than Light/); assert.doesNotMatch(pub, /\d+\s?%/);
  assert.match(pub, /neither virtue nor vice/);
});
test("G10 public doctrine: Aureth's Light sacred, mortal Light a sacrilege, Shadow heresy actively persecuted; the contradiction is intentional", () => {
  const d = corpus("church_doctrine");
  assert.match(d, /The Sun's Light is\s+given to the world through the Sun Emperor; no mortal may claim the Sun for themselves/);
  for (const k of ["illicit fragment or stolen echo", "false prophet or blasphemer", "spiritually dangerous", "sacred in Aureth and forbidden in ordinary mortals", "does not regard this as a contradiction"]) assert.match(d, new RegExp(k.replace(/ /g, "\\s+")), k);
  const chunk = world.getChunk("church_doctrine.light_and_shadow")!;
  assert.deepEqual(chunk.knowledge, { visibility: { narrator: true, player: true }, known_by: [], awareness: "public" });
  const ls = corpus("light_and_shadow");
  for (const k of ["imprisoned", "interrogated", "tortured", "publicly condemned as heretics", "actively hunted"]) assert.match(ls, new RegExp(k));
  assert.ok(hits("Why are Light mages forbidden?", "player").some(id => id === "church_doctrine.light_and_shadow" || id === "light_and_shadow"));
});
test("G11 restricted and sealed persecution truth: Light mages as the true threat, capture to execution, small diverted Shadow cadre; Nicco triggers nothing automatically", () => {
  const s = world.getChunk("sun_emperor.light_secret")!;
  assert.deepEqual(s.knowledge, { visibility: { narrator: true, player: false }, known_by: ["cassian_valerius", "helbrecht"], awareness: "private" });
  assert.match(s.content, /highest-priority threat/); assert.match(s.content, /captured, investigated, condemned and executed/); assert.match(s.content, /survival after confirmed\s+discovery by the Church is extremely unlikely/);
  assert.match(s.content, /no\s+single universal procedure and no spell\s+summons the Inquisition automatically/);
  const t = corpus("hidden_persecution_truth");
  assert.match(t, /true high-priority threat/); assert.match(t, /small hidden\s+cadre, not an army/); assert.match(t, /most Shadow users still suffer ordinary persecution/);
  assert.match(t, /Nicco's Light does not\s+automatically summon any of this/);
  assert.match(corpus("light_and_shadow"), /no spell\s+automatically summons the Inquisition/);
  assert.equal(world.getEntity("hidden_persecution_truth")!.knowledge!.secrecy, "author_only");
});
test("G12 post-491 decline: magic fading and a harsher world as tendencies with no dates or numbers; healthy places remain", () => {
  const t = corpus("modern_world_decline"), e = corpus("elemental_magic");
  for (const k of ["slowly fading", "weaker and\\s+rarer", "failed harvests", "periodic famine", "disease", "resource", "political tension", "more frequent conflict"]) assert.match(t, new RegExp(k), k);
  assert.match(t, /not\s+a universal law: healthy and beautiful places remain/); assert.match(e, /no end date or rate is established/); assert.doesNotMatch(t + e, /\d+\s?%|by the year|will end in/i);
  assert.match(corpus("primordial_cosmology"), /tendencies\s+over centuries and in many regions, not a universal law/);
});
test("G13 Beastfolk: public no-magic plus a careful resistance; the Fire origin and its cause stay sealed; nothing invented about Center", () => {
  const b = corpus("beastfolk");
  assert.match(b, /cannot use magic/); assert.match(b, /resist hostile magic/); assert.match(b, /not a guarantee against every supernatural danger, indirect harm from a spell's\s+physical effects, environmental hazards or beneficial magic/);
  assert.doesNotMatch(b, /\bFire\b|created|dragon|elemental/i);
  const o = corpus("beastfolk_origin");
  assert.match(o, /created by the Fire\s+elemental/); assert.match(o, /not created by a dragon, by Aureth, by Light or by Shadow/); assert.match(o, /immune to ordinary offensive magic and to Shadow-based mental confusion/);
  assert.match(o, /not immune to every supernatural phenomenon/); assert.match(o, /no\s+ritual or date is established/);
  for (const [id, t] of allOpen) if (id !== "beastfolk") assert.doesNotMatch(t, /Beastfolk (?:were|are) (?:created|made)/i, id);
});
test("G14 calendar constraints: 360 + 5 intercalary, 360 + 6 in leap years, 1191 is a leap year; no names or anniversary day decided", () => {
  const t = corpus("modern_reckoning");
  assert.match(t, /twelve months of thirty days plus five intercalary days, 365 in\s+all/); assert.match(t, /every fourth year is a leap year with six, 366 in all/); assert.match(t, /the year 1191 is a leap year/);
  assert.doesNotMatch(t, /January|Sunday|Monday|Midwinter|Solstice day/i);
});
test("G15 centennial observances: continent-wide, illumination and prayer, 1191 exceptional; the soul-fragment belief is explicitly not objective and not Nicco", () => {
  const t = corpus("centennial_observances");
  for (const k of ["Every hundredth year after", "public prayer", "artificial and sacred light", "expanded Church ceremonies", "civic rulers", "mixed with solemnity", "exceptionally significant"]) assert.match(t, new RegExp(k.replace(/ /g, "\\s+")), k);
  assert.match(t, /fragment or echo of Aureth's soul or Light may return/); assert.match(t, /belief and rumor, not an established fact/); assert.match(t, /tolerates this\s+belief and in places encourages it/);
  assert.doesNotMatch(t, /Nicco/); assert.match(corpus("church"), /seven-hundredth anniversary/);
});
test("G16 Woodsingers protect the tree, not a creature; the Dragon's Teeth name is mountain-shape folklore", () => {
  assert.doesNotMatch(corpus("woodsingers"), /dragon/i); assert.doesNotMatch(corpus("world_tree"), /dragon/i);
  assert.match(corpus("woodsingers"), /protecting the tree itself and not any creature\s+of legend/); assert.match(corpus("world_tree"), /confers no automatic knowledge/);
  const d = corpus("dragons_teeth_mountains");
  assert.equal(world.getEntity("dragons_teeth_mountains")!.name, "The Dragon's Teeth Mountains");
  assert.match(d, /teeth of some vast beast of long-vanished stories/); assert.match(d, /no known dragons, remains or records of one/); assert.match(d, /mountain-shape folklore/);
});
test("G17 dragon erasure sweep: every non-sealed mention of dragons is the Dragon's Teeth name or its folklore line; no sealed record asserts a living dragon", () => {
  for (const [id, t] of allOpen) for (const m of t.matchAll(/dragon/gi)) { const ctx = t.slice(Math.max(0, m.index! - 12), m.index! + 12); assert.ok(/Dragon's Teeth|no known dragons|dragon history|dragon\)/i.test(t.slice(Math.max(0, m.index! - 2), m.index! + 20)) || /dragon history|no known dragons/.test(t), `${id}: ${ctx}`); }
  assert.ok(openText.every(([id, t]) => !/(?:Aureth|Four|Beastfolk|World Tree|Woodsingers?)[^.]{0,80}dragon/i.test(t) || id === "dragons_teeth_mountains"));
  for (const id of SEALED) assert.doesNotMatch(corpus(id).replace(/not a dragon[^.]*\./gi, "").replace(/not dragons[^.]*\./gi, "").replace(/not created by a dragon[^.]*\./gi, "").replace(/no dragon exists in\s+this canon/gi, "").replace(/no dragon exists in this canon/gi, ""), /\bdragons?\b/i, id);
});
test("G18 Church NPC knowledge: ordinary clergy public only; Helbrecht and Cassian gain only the Church's own history; Severan and below nothing new", () => {
  const grants = knowledgeGrants(world), ids = (w: string) => (grants.restricted.get(w) ?? []).map(g => g.id).filter(i => i !== "mutilating_ritual");
  assert.deepEqual(ids("cassian_valerius"), ["church_curated_history", "church_post_491_history", "first_voice_hidden_authority", "forgotten_era_restricted_access", "sun_emperor.light_secret"]);
  assert.deepEqual(ids("helbrecht"), ["church_curated_history", "church_post_491_history", "forgotten_era_restricted_access", "sun_emperor.light_secret"]);
  assert.deepEqual(ids("severan_krauss"), ["forgotten_era_restricted_access"]); assert.deepEqual(ids("sister_veyra"), []); assert.deepEqual(ids("brother_aven").filter(i => !i.startsWith("bartolomhew") && !i.startsWith("brother_aven")), []);
  for (const id of [...TIER3, "world_tree_sleeper", "oasis_sleeper"]) assert.deepEqual(world.getEntity(id)!.knowledge!.known_by, [], id);
  const cassian = (grants.restricted.get("cassian_valerius") ?? []).find(g => g.id === "first_voice_hidden_authority")!;
  assert.doesNotMatch(cassian.summary, /Shadow|Light|incarnat|sealed|Keeper|keeper|Testament/i); assert.match(cassian.summary, /does not know what the First Voice is/);
  assert.equal(world.getEntity("first_voice_hidden_authority")!.knowledge!.secrecy, "holder_only");
  assert.equal(ALL.filter(e => e.type === "character" && /archivist|auditor|vicar|inquisitor/i.test(e.id)).length, 0, "no new Church NPC was created");
});
test("G19 sealed operational layer: authored under tier 3 and tested; no eight-word passage of it appears in any unsealed canon, prompt-facing chunk or retrieval", () => {
  for (const id of NEW_TIER3) { const e = world.getEntity(id)!; assert.deepEqual(e.knowledge, { visibility: { narrator: false, player: false }, known_by: [], secrecy: "author_only" }, id); assert.ok(corpus(id).length > 400, id); }
  const sealedShingles = new Set([...NEW_TIER3, "first_voice_hidden_authority"].flatMap(id => [...shingles(id)]));
  for (const [id, t] of allOpen) { const w = words(t); for (let i = 0; i + 8 <= w.length; i++) assert.ok(!sealedShingles.has(w.slice(i, i + 8).join(" ")), `${id}: ${w.slice(i, i + 8).join(" ")}`); }
});
test("G20 retrieval secrecy: new sealed records never surface for any audience on topical queries, and public gap records stay findable", () => {
  const queries = ["how does the First Voice hide", "who controls the Church", "Shadow disciples", "hidden cadre", "Aureth prison", "pocket dimension", "where is the Sun Emperor sealed", "Beastfolk origin", "who made the Beastfolk", "why can Beastfolk not use magic", "the Four sleeping", "Earth child", "Fire child", "Light mage persecution", "Nicco Light origin", "Church founding", "when was the Inquisition created", "700th anniversary", "centennial"];
  for (const q of queries) for (const who of ["narrator", "player"] as const) assert.ok(!hits(q, who).some(id => SEALED.includes(id)), `${q}/${who}`);
  for (const [q, id] of [["Canticle of the Watchful Sun", "sun_emperor_prayer"], ["centennial observances hundredth anniversary", "centennial_observances"], ["Empire of the Sun Emperor fragmentation", "helion_empire"], ["origins of the Church", "church_origins"], ["fading of magic and harsher world", "modern_world_decline"]] as const) assert.ok(hits(q, "player").includes(id), q);
  for (const id of ["helion_empire", "sun_emperor_prayer", "centennial_observances", "church_origins", "modern_world_decline"]) assert.deepEqual(world.getEntity(id)!.knowledge, { visibility: { narrator: true, player: true }, known_by: [], awareness: "public" }, id);
});
