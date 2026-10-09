import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import type { WorldEntity } from "../src/types/entities.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { knowledgeGrants } from "../src/turn/knowledge-grants.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { backgroundGrounding, classifyBackgroundClaim } from "../src/turn/background-grounding.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { SemanticIndex } from "../src/retrieval/semantic-index.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { collect, metadata } from "./turn-fixtures.js";
import { FixtureEmbeddingProvider } from "./retrieval-eval/fixture-embedding-provider.js";

/**
 * Mythology / Church / secret-knowledge pass. Knowledge tiers: 0 public, 1 restricted (narrator-visible, player-invisible, known_by),
 * 2 manual secret (sealed holder_only), 3 deepest world truth (sealed author_only). The ENGINE must withhold tiers 2-3.
 */
const world = await loadWorld("data");
const service = new RetrievalService(world);
const lexical = new LexicalSearch(service);
const SEALED = ["world_tree_sleeper", "oasis_sleeper", "aureth_true_identity", "shadow_adversary", "beastfolk_origin_truth"];
const TIER3 = ["aureth_true_identity", "shadow_adversary", "beastfolk_origin_truth"];
/** Phrases that only sealed canon states. None may appear in any narrator-facing or player-facing payload. */
const SECRET_PHRASES = [/sleeps? (?:within|beneath|in) the World Tree/i, /green dragon (?:still exists|sleeps)/i, /red dragon[^.]*(?:sleeps|beneath)/i,
  /(?:Sun Emperor|founder)[^.]{0,60}\bAureth\b[^.]{0,40}same being/i, /same being/i, /created the Beastfolk/i, /ancient adversary/i,
  /Manual Secret:|Sealed Truth:/, /dormant presence/i, /twin brother/i, /\b(?:holder_only|author_only)\b/, ...SEALED.map(id => new RegExp(`\\b${id}\\b`))];
const assertNoSecrets = (payload: string, label: string) => { for (const p of SECRET_PHRASES) assert.doesNotMatch(payload, p, `${label}: ${p}`); };
const text = (id: string) => { const e = world.getEntity(id)!; return [e.summary, e.content, ...world.listChunks().filter(c => c.entity_id === id).map(c => c.content)].join(" ").replace(/\s+/g, " "); };
const ids = (r: { candidates: readonly { entity_id: string; chunk_id?: string; kind: string }[] }) => r.candidates.map(c => c.kind === "chunk" && c.chunk_id ? c.chunk_id : c.entity_id);
const top = (query: string, who: "narrator" | "player" = "player") => ids(lexical.search({ query, limit: 5 }, who));

test("MYTH 1-4, 21: one public ancestral myth, retrievable; no deep truth; Center child red; East colour undefined", () => {
  const myth = world.getEntity("aureth_creation_myth")!;
  assert.deepEqual(myth.knowledge, { visibility: { narrator: true, player: true }, known_by: [], awareness: "public" });
  for (const q of ["Aureth creation myth", "golden dragon who shaped the land", "three dragon children of West, Center and East"]) assert.ok(top(q).includes("aureth_creation_myth"), q);
  const t = text("aureth_creation_myth");
  assert.match(t, /older than the Church of the Sun Emperor/); assert.match(t, /absorbed, reinterpreted or overwritten/);
  assert.match(t, /Center with a red one/); assert.doesNotMatch(t, /bronze|white|\bice\b/i);
  assert.match(t, /no settled colour or form/); assert.match(t, /In public knowledge this is mythology, not established fact/);
  assert.match(t, /Whether\s+Aureth or the children ever existed/); assert.doesNotMatch(t, /Sun Emperor (?:is|was) Aureth|sleep|Shadow/i);
  assertNoSecrets(JSON.stringify(myth), "myth");
  // 21: no duplicate myth/secret entities by alias or name; no transcription variants.
  const mythLike = world.listEntities().filter(e => /myth of aureth|creation myth/i.test([e.name, ...e.aliases].join(" ")));
  assert.deepEqual(mythLike.map(e => e.id), ["aureth_creation_myth"]);
  for (const absent of ["god_king", "god_emperor", "aureth_myth", "aureth_creation", "oreth", "auret"]) assert.equal(world.hasEntity(absent), false, absent);
  assert.doesNotMatch(JSON.stringify(world.listEntities().map(e => [e.name, e.aliases])), /God[- ]?(?:King|Emperor)|Oreth|Aurette/i);
});

test("CHURCH 5-8: public doctrine, absence and Shadow taboo retrievable; Light-mage founder restricted; adversary absent", () => {
  assert.ok(top("Why is Shadow magic forbidden?").includes("church_doctrine.founder_and_shadow"));
  assert.ok(top("Church doctrine Sun Emperor").some(id => id.startsWith("church_doctrine")));
  assert.ok(top("Where did the Sun Emperor go? absent emperor").some(id => id === "sun_emperor" || id.startsWith("church_doctrine")));
  const doctrine = text("church_doctrine");
  assert.match(doctrine, /disappeared from the world long ago/); assert.match(doctrine, /does not declare him dead/);
  assert.match(doctrine, /prohibition of Shadow rests on the Sun Emperor's own teaching/); assert.match(doctrine, /Shadow magic\s+is absolute heresy/);
  assert.match(text("sun_emperor"), /He disappeared long ago and has not been publicly seen since/);
  assert.match(text("light_and_shadow"), /Shadow magic is extremely rare, absolute heresy/);
  // 6: the Light-mage founder secret is tier 1 (existing canon holders only) and never player-visible.
  const secret = world.getChunk("sun_emperor.light_secret")!;
  assert.deepEqual(secret.knowledge, { visibility: { narrator: true, player: false }, known_by: ["cassian_valerius", "helbrecht"], awareness: "private" });
  const publicText = (id: string) => [world.getEntity(id)!.summary, world.getEntity(id)!.content, ...world.listChunks().filter(c => c.entity_id === id && (c.knowledge ?? world.getEntity(id)!.knowledge)!.visibility.player).map(c => c.content)].join(" ");
  for (const id of ["sun_emperor", "church_doctrine", "church", "light_and_shadow", "west_governance"]) assert.doesNotMatch(publicText(id), /Light mage|real Light/i, id);
  // Restricted Church reading of the Shadow warnings: tier 1, no holder.
  assert.deepEqual(world.getEntity("sun_emperor_shadow_warnings")!.knowledge, { visibility: { narrator: true, player: false }, known_by: [], awareness: "private" });
  assert.ok(!top("Sun Emperor warnings against Shadow").includes("sun_emperor_shadow_warnings"));
  // 8: no public record mentions the adversary or identifies the founder with Aureth.
  for (const e of world.listEntities().filter(e => e.knowledge?.visibility.narrator)) assertNoSecrets(JSON.stringify(e), e.id);
  for (const c of world.listChunks().filter(c => (c.knowledge ?? world.getEntity(c.entity_id)!.knowledge)?.visibility.narrator)) assertNoSecrets(JSON.stringify(c), c.id);
});

test("WORLD TREE 9-11 / OASIS 12-14: public and restricted layers work; sleeping dragons and Beastfolk origin never retrievable", async () => {
  // 9: public Woodsinger lore for everyone; the World Tree itself stays tier 1 (narrator secret candidate, never player).
  assert.ok(top("Tell me about the elves north of Calderan").some(id => id === "woodsingers" || id === "calderan_northern_forest" || id === "elves"));
  assert.ok(!top("What's the World Tree?").includes("world_tree"));
  assert.match(text("world_tree"), /connects the Tree and the forest to the ancient creation myth of Aureth/); assert.doesNotMatch(text("world_tree"), /dragon/i);
  // 10-11, 13-14: sealed, no default holder, not fetchable or searchable by any audience in any mode.
  for (const id of SEALED) {
    const k = world.getEntity(id)!.knowledge!;
    assert.deepEqual([k.visibility, k.known_by, k.awareness], [{ narrator: false, player: false }, [], undefined], id);
    for (const who of ["narrator", "player"] as const) assert.equal(service.get({ entity_id: id }, who).kind, "not_visible", `${id}/${who}`);
  }
  assert.deepEqual(SEALED.map(id => world.getEntity(id)!.knowledge!.secrecy), ["holder_only", "holder_only", "author_only", "author_only", "author_only"]);
  const queries = ["dragon inside World Tree", "green dragon sleeping in the World Tree", "Aureth true identity", "is the Sun Emperor Aureth", "Beastfolk creator",
    "who created the Beastfolk", "sleeping dragon under the oasis", "why is the oasis water red", "who captured Aureth", "Shadow adversary", "Manual Secret Sleeper", "Sealed Truth"];
  const provider = new FixtureEmbeddingProvider();
  const hybrid = new HybridSearch(service, [await SemanticIndex.build(service.indexSource(), provider, "narrator"), await SemanticIndex.build(service.indexSource(), provider, "player")]);
  for (const q of queries) for (const who of ["narrator", "player"] as const) {
    const lex = ids(lexical.search({ query: q, limit: 5 }, who)), hyb = ids(await hybrid.search({ query: q, limit: 5 }, who, "hybrid"));
    for (const id of SEALED) assert.ok(!lex.includes(id) && !hyb.includes(id), `${q}/${who}`);
    assertNoSecrets(JSON.stringify(lexical.search({ query: q, limit: 5 }, who)), `${q}/${who}`);
  }
  // 12: the red reflections are public and retrievable, with no cause.
  assert.ok(top("What's strange about the oasis?").includes("central_oasis_settlement.red_waters"));
  assert.match(text("central_oasis_settlement"), /public knowledge does not explain/); assert.doesNotMatch(text("central_oasis_settlement"), /dragon/i);
  assert.match(text("beastfolk"), /cannot use magic/); assert.doesNotMatch(text("beastfolk"), /dragon|created/i);
});

test("DEEPEST 15-17: tier 3 has no holder by validation and no index path; grants index only holder_only holders", () => {
  for (const id of TIER3) assert.deepEqual(world.getEntity(id)!.knowledge, { visibility: { narrator: false, player: false }, known_by: [], secrecy: "author_only" }, id);
  assert.match(text("aureth_true_identity"), /the same being/); assert.match(text("aureth_true_identity"), /colour, kind, sleeping place and nature are\s+not established/);
  assert.match(text("shadow_adversary"), /It is not the hidden cause of every evil/);
  const grants = knowledgeGrants(world);
  for (const list of grants.restricted.values()) for (const g of list) assert.ok(!SEALED.includes(g.id), g.id);
  for (const list of grants.public.values()) for (const id of list) assert.ok(!SEALED.includes(id), id);
  // No public record references sealed canon (validation also enforces this).
  for (const e of world.listEntities()) if (!e.knowledge?.secrecy && "related_entities" in e) for (const id of e.related_entities) assert.ok(!SEALED.includes(id), `${e.id} -> ${id}`);
});

test("validation is the boundary: malformed sealed policies and public references to sealed canon are rejected", () => {
  const lore = (id: string, knowledge: unknown, related: string[] = []) => ({ source: `synthetic/${id}.yaml`, document: { schema_version: 1, entity: { id, type: "world_lore", name: id, display_name: id, parent: null, aliases: [], summary: "s", tags: [], search_context: "", content: "c", knowledge, category: "fundamentals", related_entities: related } as unknown as WorldEntity, chunks: [] } });
  const sealed = (secrecy: string, known_by: string[] = []) => ({ visibility: { narrator: false, player: false }, known_by, secrecy });
  const pub = { visibility: { narrator: true, player: true }, known_by: [] };
  assert.doesNotThrow(() => new WorldStore([lore("a", sealed("author_only")), lore("b", sealed("holder_only"), ["a"])]));
  assert.throws(() => new WorldStore([lore("a", { ...sealed("author_only"), visibility: { narrator: true, player: false } })]), /must be invisible to narrator and player/);
  assert.throws(() => new WorldStore([lore("a", { ...sealed("holder_only"), awareness: "public" })]), /no ordinary awareness/);
  assert.throws(() => new WorldStore([lore("a", sealed("everyone"))]), /expected holder_only or author_only/);
  assert.throws(() => new WorldStore([lore("a", sealed("author_only")), lore("p", pub, ["a"])]), /sealed canon and may only be referenced by sealed canon/);
});

// ------------------------------------------------------------------------------------------------ prompt leak tests (real canon)
async function prompts(location: string, input: string, recent?: RecentExchange) {
  const c = createOpeningCampaign(world, `myth_${location}_${input.length}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: location } }] });
  const seen: string[] = [], svc = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate(r: GenerationRequest) { seen.push(JSON.stringify(r)); return { text: "The wind moves.", ...metadata }; },
    async *stream(r: GenerationRequest) { seen.push(JSON.stringify(r)); yield { type: "text_delta", text: "The wind moves." }; yield { type: "completed", result: { text: "The wind moves.", ...metadata } }; } },
    { async propose(...args: unknown[]) { seen.push(JSON.stringify(args)); return { commands: [], ...metadata }; } }, { service: svc, search: new HybridSearch(svc) });
  if (recent) co.recent(c).add(recent);
  await collect(co.runTurn({ campaign: c, player_input: input }));
  assert.ok(seen.length >= 1);
  return seen.join("\n");
}
test("PROMPT 15/16/19: real narrator and controller payloads for five representative turns contain no tier 2/3 phrase or ID", async () => {
  const cases: [string, string, string, RecentExchange?][] = [
    ["calderan", "calderan_slave_market", "What do they make in Calderan, and who rules here?"],
    ["woodsong", "calderan_northern_forest", "What's the World Tree? Tell me about the elves of this forest."],
    ["oasis", "central_oasis_settlement", "What's strange about the oasis water? Why does it shine red?"],
    ["church", "cathedral_of_the_bladed_sun", "Why is Shadow magic forbidden? Where did the Sun Emperor go, and is he Aureth the golden dragon?"],
    ["background", "calderan_slave_market", "I ask the beastfolk woman where she is from and who made her people.",
      { player: "*looks around*", narration: "A beastfolk woman sits in the nearest pen, her wrists bound, watching the auction crowd.", status: "finalized", location_id: "calderan_slave_market" }],
  ];
  const out: Record<string, string> = {};
  for (const [label, location, input, recent] of cases) { out[label] = await prompts(location, input, recent); assertNoSecrets(out[label]!, label); }
  assert.match(out.background!, /BACKGROUND GROUNDING/); assert.match(out.background!, /Beastfolk/);
  assert.match(out.oasis!, /red reflections/i);
});

test("BACKGROUND 18-19: grounding receives public places, peoples and slave-source canon only; sealed names never verify", () => {
  const c = createOpeningCampaign(world, "myth_grounding");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }] });
  const pen: RecentExchange = { player: "*looks*", narration: "A beastfolk woman and an elf sit in the nearest pen.", status: "finalized", location_id: "calderan_slave_market" };
  const g = backgroundGrounding(world, buildTurnContext(world, c.exportSnapshot()), "Where is she from? How did she end up enslaved?", [pen])!;
  for (const name of ["Zul-Rath", "Khar-Dune", "Sandspear", "Davenport", "Ironbound", "Blackwater", "Vaelrost", "Frostspire", "Skardgard"]) assert.match(g.block, new RegExp(name), name);
  assert.match(g.block, /People: Beastfolk/); assert.match(g.block, /People: Elves/); assert.match(g.block, /Slavery canon/);
  assertNoSecrets(g.block, "grounding"); assert.doesNotMatch(g.block, /World Tree|red reflections|dragon(?!'s Teeth)/i);
  for (const id of g.entity_ids) { const k = world.getEntity(id)!.knowledge!; assert.ok(k.visibility.narrator && k.visibility.player, id); }
  assert.equal(classifyBackgroundClaim("She came from the Sealed Truth: The Maker of the Beastfolk.", world).status, "unverified");
  assert.equal(classifyBackgroundClaim("I'm from Zul-Rath.", world).status, "verified");
});

test("PUBLIC WORLD 20: representative geography, peoples, economy and religion queries reach useful public records", () => {
  const expect: [string, (id: string) => boolean][] = [
    ["Where is Davenport?", id => id.startsWith("davenport")], ["Calderan armour", id => id.startsWith("calderan")], ["Davenport pearls", id => id.startsWith("davenport")],
    ["Davenport shipyard", id => id.startsWith("davenport")], ["Ironbound mercenary", id => id.startsWith("ironbound")], ["Blackwater Fire", id => id.startsWith("blackwater")],
    ["Woodsinger", id => id === "woodsingers"], ["Zul-Rath spices", id => id.startsWith("zul_rath")], ["Zul-Rath silk", id => id.startsWith("zul_rath")],
    ["Where does this silk come from?", id => id.startsWith("zul_rath") || id === "aureth_trade" || id === "center"], ["Khar-Dune caravan", id => id.startsWith("khar_dune")],
    ["Sandspear corsair", id => id.startsWith("sandspear")], ["Frostspire iron", id => id.startsWith("frostspire")], ["Skardgard whaling", id => id.startsWith("skardgard")],
    ["Vaelrost trade", id => id.startsWith("vaelrost")], ["Central Oasis riders", id => id.startsWith("central_oasis_settlement")], ["Aureth creation myth", id => id === "aureth_creation_myth"],
    ["Church Shadow doctrine", id => id.startsWith("church_doctrine") || id === "light_and_shadow"], ["Dragon's Teeth Mountains", id => id === "dragons_teeth_mountains"],
    ["Beastfolk", id => id === "beastfolk"], ["dwarves", id => id === "dwarves"], ["trade between West, Center and East", id => id === "aureth_trade"],
  ];
  for (const [q, ok] of expect) { const hits = top(q); assert.ok(hits.some(ok), `${q}: ${hits.join(",")}`); assertNoSecrets(JSON.stringify(lexical.search({ query: q, limit: 5 }, "narrator")), q); }
});

test("WOODSIGNER/WOODSINGERS: separate stable records, explicit derivation, public sacred-tree tradition, sealed sleeper untouched", () => {
  const branch = world.getEntity("woodsigner")!, culture = world.getEntity("woodsingers")!;
  assert.deepEqual([branch.type, culture.type], ["faction", "world_lore"]);
  assert.match(branch.content, /small urban branch descended from the broader Woodsinger\s+culture of Woodsong Forest/);
  assert.match(branch.content, /preserves recognizable Woodsinger traditions in bowmaking, woodcraft and cultural identity/);
  assert.ok(culture.type === "world_lore" && culture.related_entities.includes("woodsigner"));
  assert.match(culture.content, /Woodsigners of Calderan's East District are a small urban branch descended from this culture/);
  assert.ok(top("Woodsigner").includes("woodsigner")); assert.ok(top("Woodsingers").includes("woodsingers"));
  assert.ok(top("Calderan wood elves").includes("woodsigner")); assert.ok(top("elves of Woodsong Forest").includes("woodsingers"));
  const sacred = world.getChunk("woodsingers.sacred_tree")!;
  assert.equal(sacred.content.replace(/\s+/g, " ").split(/(?<=\.)\s/)[0], "Woodsinger tradition reveres an ancient sacred tree deep in Woodsong Forest, associated with the forest's continuity and protection.");
  assert.doesNotMatch(JSON.stringify(sacred), /World Tree|dragon|sleep|conceal|will\b|sentien/i);
  assert.ok(top("sacred tree of the Woodsingers").includes("woodsingers.sacred_tree"));
  for (const q of ["sacred tree of the Woodsingers", "dragon in the tree", "what sleeps beneath the tree"]) for (const who of ["narrator", "player"] as const) {
    const hits = ids(lexical.search({ query: q, limit: 5 }, who));
    assert.ok(!hits.some(id => SEALED.includes(id)), `${q}/${who}`); assertNoSecrets(JSON.stringify(lexical.search({ query: q, limit: 5 }, who)), q);
    if (who === "player") assert.ok(!hits.includes("world_tree"), q);
  }
  assert.deepEqual(world.getEntity("world_tree_sleeper")!.knowledge, { visibility: { narrator: false, player: false }, known_by: [], secrecy: "holder_only" });
});

// ------------------------------------------------------------------------------------------------ authorized secret (fixture IDs only)
function fixtureWorld(holders: readonly string[]) {
  const base = (id: string, name: string) => ({ id, name, display_name: name, parent: null, aliases: [], summary: `${name}.`, tags: [], search_context: "", content: `${name}.`, knowledge: { visibility: { narrator: true, player: true }, known_by: [] as string[] } });
  const entities: WorldEntity[] = [
    { ...base("fixture_grove", "Fixture grove"), type: "location", features: [], connections: [] },
    { ...base("nicco", "Nicco"), type: "character", role: "player", location: null, traits: [], relationships: [] },
    ...["fixture_keeper", "fixture_stranger"].map(id => ({ ...base(id, id === "fixture_keeper" ? "Keeper" : "Stranger"), type: "character" as const, role: "npc" as const, location: "fixture_grove", traits: [], relationships: [] })),
    { ...base("fixture_manual_secret", "Fixture manual secret"), summary: "FIXTURE-TIER2: something sleeps under the fixture grove.", content: "FIXTURE-TIER2 detail.", type: "world_lore", category: "fundamentals", related_entities: ["fixture_deep_truth"],
      knowledge: { visibility: { narrator: false, player: false }, known_by: [...holders], secrecy: "holder_only" } },
    { ...base("fixture_deep_truth", "Fixture deep truth"), summary: "FIXTURE-TIER3: the deepest fixture truth.", content: "FIXTURE-TIER3 detail.", type: "world_lore", category: "fundamentals", related_entities: [],
      knowledge: { visibility: { narrator: false, player: false }, known_by: [], secrecy: "author_only" } },
  ];
  const w = new WorldStore(entities.map(entity => ({ source: `synthetic/${entity.id}.yaml`, document: { schema_version: 1, entity, chunks: [] } })));
  return { w, campaign: new CampaignState(w, `fixture_${holders.join("_") || "none"}`, { player_location: "fixture_grove", world_time: { world_minute: 100 } }) };
}
test("AUTHORIZED 26: an explicitly authorized fixture holder receives a tier 2 fact; nobody else does; tier 3 never", async () => {
  const none = fixtureWorld([]), held = fixtureWorld(["fixture_keeper"]);
  assert.equal(buildTurnContext(none.w, none.campaign.exportSnapshot()).npc_private_canon?.length ?? 0, 0);
  const ctx = buildTurnContext(held.w, held.campaign.exportSnapshot());
  assert.deepEqual(ctx.npc_private_canon?.map(g => [g.character_id, g.id]), [["fixture_keeper", "fixture_manual_secret"]]);
  assert.deepEqual(knowledgeGrants(held.w).restricted.get("fixture_stranger"), undefined);
  for (const who of ["narrator", "player"] as const) {
    assert.equal(new RetrievalService(held.w).get({ entity_id: "fixture_manual_secret" }, who).kind, "not_visible");
    assert.deepEqual(ids(new LexicalSearch(new RetrievalService(held.w)).search({ query: "fixture manual secret sleeps grove", limit: 5 }, who)).filter(id => id.startsWith("fixture_m") || id.startsWith("fixture_d")), []);
  }
  const run = async (f: ReturnType<typeof fixtureWorld>) => {
    const seen: string[] = [], svc = new RetrievalService(f.w);
    const co = new TurnCoordinator(f.w, { async generate(r: GenerationRequest) { seen.push(JSON.stringify(r)); return { text: "Wind.", ...metadata }; },
      async *stream(r: GenerationRequest) { seen.push(JSON.stringify(r.messages)); yield { type: "text_delta", text: "Wind." }; yield { type: "completed", result: { text: "Wind.", ...metadata } }; } },
      { async propose() { return { commands: [], ...metadata }; } }, { service: svc, search: new HybridSearch(svc) });
    await collect(co.runTurn({ campaign: f.campaign, player_input: "I ask the Keeper what sleeps under the grove." }));
    return seen.join("\n");
  };
  const heldPrompt = await run(held), nonePrompt = await run(none);
  assert.match(heldPrompt, /FIXTURE-TIER2: something sleeps/); assert.doesNotMatch(nonePrompt, /FIXTURE-TIER2/);
  for (const p of [heldPrompt, nonePrompt]) assert.doesNotMatch(p, /FIXTURE-TIER3/);
});
