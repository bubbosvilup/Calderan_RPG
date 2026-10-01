import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LexicalIndex } from "../src/retrieval/lexical-index.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { tokenize } from "../src/retrieval/tokenizer.js";
import { RetrievalValidationError } from "../src/retrieval/validation.js";
import { RetrievalProjectionError } from "../src/retrieval/projections.js";
import { WorldStore } from "../src/world/world-store.js";
import { loadWorld } from "../src/world/loader.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import type { KnowledgeChunk } from "../src/types/knowledge.js";
import type { WorldSearchResult } from "../src/retrieval/types.js";
import { document, fixtures, location, room } from "./fixtures.js";
import { evaluate } from "./retrieval-eval/evaluate.js";

const policy = (narrator = true, player = true) => ({ visibility: { narrator, player }, known_by: [] });
function source(id: string, name = id) {
  const e = location(id);
  Object.assign(e, { name, display_name: name, summary: "Fixture.", content: "Fixture passage.", knowledge: policy() });
  return { source: `fixtures/${id}.yaml`, document: document(e) };
}
function chunk(owner: string, section: string, content: string, knowledge?: ReturnType<typeof policy>): KnowledgeChunk {
  return { id: `${owner}.${section}`, entity_id: owner, section, summary: `Passage ${section}`, content, search_context: "", tags: [], ...(knowledge ? { knowledge } : {}) };
}
const service = (sources: ReturnType<typeof source>[]) => new LexicalSearch(new RetrievalService(new WorldStore(sources)));
const keys = (r: WorldSearchResult) => r.candidates.map(c => c.kind === "chunk" ? c.chunk_id : c.entity_id);

test("tokenization splits punctuation consistently; only plural folding (Phase 1R), no fuzzy, derivational stemming, accents or substrings", () => {
  assert.deepEqual(tokenize("  Dragon's Teeth—Zul-Rath; heartstone_lr ÉLAN 42!  "), ["dragon", "s", "teeth", "zul", "rath", "heartstone", "lr", "élan", "42"]);
  assert.deepEqual(tokenize("Dragon’s"), tokenize("Dragon's"));
  assert.deepEqual(tokenize("___..."), []);
  const a = source("sample", "Blackwater Élan pirates");
  const search = service([a]);
  for (const query of ["water", "blackwat", "elan", "pirats", "piracy", "..."]) assert.deepEqual(keys(search.search({ query }, "narrator")), []);
  assert.deepEqual(keys(search.search({ query: "pirate" }, "narrator")), ["sample"], "plural folding: pirates ~ pirate");
  assert.deepEqual(keys(search.search({ query: "ÉLAN" }, "narrator")), ["sample"]);
  assert(Object.isFrozen(tokenize("a b")));
});

test("identity, alias and feature fields outrank incidental prose; repetitions do not inflate scores", () => {
  const named = source("named", "Ember"), alias = source("alias"), feature = source("feature"), prose = source("prose");
  alias.document.entity.aliases = ["Ember", "Ember", " EMBER "];
  const f = feature.document.entity; assert(f.type === "location"); f.features = [{ name: "Ember", description: "Fixture feature." }];
  prose.document.entity.content = "ember ".repeat(200);
  const search = service([prose, alias, named, feature]);
  assert.deepEqual(keys(search.search({ query: "ember" }, "narrator")), ["named", "alias", "feature", "prose"]);
  const debug = search.searchDebug({ query: "ember" }, "narrator");
  assert(debug[0]!.score > debug[1]!.score && debug[1]!.score > debug[2]!.score && debug[2]!.score > debug[3]!.score);
  const single = structuredClone([prose, alias, named, feature]);
  single[0]!.document.entity.content = "ember"; single[1]!.document.entity.aliases = ["Ember"];
  assert.deepEqual(service(single).searchDebug({ query: "ember" }, "narrator"), debug);
  assert.deepEqual(search.searchDebug({ query: "cinder" }, "narrator"), []);
});

test("coverage rewards distinct terms; common words are downweighted within the authorized corpus", () => {
  const both = source("both"), one = source("one"), common = source("common");
  both.document.entity.content = "iron coal mining common"; one.document.entity.content = "iron common"; common.document.entity.content = "common";
  const search = service([both, one, common]);
  const results = search.searchDebug({ query: "iron coal mining common" }, "narrator");
  assert.equal(results[0]!.reference.entity_id, "both");
  const trace = results[0]!.contributions;
  assert(trace.find(c => c.token === "coal")!.inverse_frequency > trace.find(c => c.token === "common")!.inverse_frequency);
  assert.equal(trace.find(c => c.token === "common")!.document_frequency, 3);
  assert.deepEqual(search.searchDebug({ query: "iron coal" }, "narrator"), search.searchDebug({ query: "iron iron coal coal" }, "narrator"));
});

test("ranking preserves score order through canonical projection, with ID-only ties", () => {
  const a = source("aaa"), z = source("zzz"), b = source("bbb");
  a.document.entity.content = "beacon"; b.document.entity.content = "beacon"; z.document.entity.aliases = ["Beacon"];
  const search = service([z, b, a]);
  assert.deepEqual(keys(search.search({ query: "beacon" }, "narrator")), ["zzz", "aaa", "bbb"]);
  const baseline = search.searchDebug({ query: "beacon" }, "narrator");
  assert.deepEqual(baseline, service([a, z, b]).searchDebug({ query: "beacon" }, "narrator"));
  assert.equal(baseline[1]!.score, baseline[2]!.score);
});

test("search applies existing direct-parent/type/tag filters before scoring; chunk filters use authorized owner", () => {
  const root = source("root"), child = source("child"), grandchild = source("grandchild");
  child.document.entity.parent = "root"; grandchild.document.entity.parent = "child";
  child.document.entity.tags = ["garden", "plants"];
  for (const s of [root, child, grandchild]) s.document.entity.content = "willow";
  child.document.chunks.push(chunk("child", "notes", "willow willow willow"));
  const search = service([root, child, grandchild]);
  const request = { query: "willow", filters: { parent_ids: ["root"], entity_types: ["location"], tags_all: ["garden", "plants"] } };
  assert.deepEqual(keys(search.search(request, "narrator")), ["child", "child.notes"]);
  for (const filters of [{ tags_any: [] }, { entity_ids: [] }, { parent_ids: ["missing"] }, { entity_types: ["faction"] }]) assert.deepEqual(keys(search.search({ query: "willow", filters }, "narrator")), []);
  assert.deepEqual(keys(search.search({ query: "willow", filters: { entity_ids: ["grandchild"] } }, "narrator")), ["grandchild"]);
});

test("public and debug search reject malformed requests and keep the five-result hard bound", () => {
  const sources = Array.from({ length: 8 }, (_, i) => { const s = source(`entry_${i}`); s.document.entity.content = "beacon"; return s; });
  const search = service(sources);
  assert.equal(search.search({ query: "beacon" }, "narrator").candidates.length, 5);
  assert.equal(search.search({ query: "beacon", limit: 2 }, "narrator").candidates.length, 2);
  assert.equal(search.searchDebug({ query: "beacon" }, "narrator").length, 8);
  assert.equal(search.search({ query: "beacon" }, "narrator").next_offset, null);
  let called = false;
  const accessor = Object.defineProperty({}, "query", { enumerable: true, get() { called = true; return "beacon"; } });
  for (const request of [null, {}, accessor, Object.create({ query: "beacon" }), { query: " " }, { query: "x".repeat(513) }, { query: "beacon", limit: 6 }, { query: "beacon", limit: 0 }, { query: "beacon", audience: "player" }, { query: "beacon", offset: 1 }, { query: "beacon", filters: { parent: "root" } }, { query: "beacon", filters: { tags_all: new Array(1) } }]) {
    assert.throws(() => search.search(request, "narrator"), RetrievalValidationError);
    assert.throws(() => search.searchDebug(request, "player"), RetrievalValidationError);
  }
  assert.equal(called, false);
  assert.throws(() => search.search({ query: "beacon" }, "other" as "player"), RetrievalValidationError);
});

test("unauthorized owner, parent and unrelated text cannot change visible matching, scores, ranking or traces", () => {
  const open = source("open"), hidden = source("hidden_owner", "secretnamesentinel"), parent = source("hidden_parent", "secretparentsentinel");
  open.document.entity.content = "beacon"; open.document.entity.parent = "hidden_parent";
  for (const s of [hidden, parent]) s.document.entity.knowledge = policy(false, false);
  Object.assign(hidden.document.entity, { aliases: ["secretaliassentinel"], summary: "secretsummarysentinel", search_context: "secretcontextsentinel", content: "secretcontentsentinel", tags: ["secrettagsentinel"] });
  const e = hidden.document.entity; assert(e.type === "location"); e.features = [{ name: "secretfeaturesentinel", description: "secretdescriptionsentinel" }];
  hidden.document.chunks.push(chunk("hidden_owner", "public", "beacon", policy()));
  hidden.document.chunks.push(chunk("hidden_owner", "inherited", "secretinheritedsentinel"));
  const first = service([open, hidden, parent]);
  const changed = structuredClone([open, hidden, parent]);
  Object.assign(changed[1]!.document.entity, { name: "beacon", display_name: "beacon", aliases: ["beacon"], summary: "beacon", content: "beacon ".repeat(100), search_context: "beacon", tags: ["beacon"] });
  changed[2]!.document.entity.name = "beacon";
  changed[1]!.document.chunks[1]!.content = "beacon";
  const extra = source("extra_secret", "beacon"); extra.document.entity.knowledge = policy(false, false); changed.push(extra);
  const second = service(changed);
  for (const who of ["narrator", "player"] as const) {
    assert.equal(first.documentCount(who), 2); assert.equal(second.documentCount(who), 2);
    assert.deepEqual(first.searchDebug({ query: "beacon" }, who), second.searchDebug({ query: "beacon" }, who));
    assert.deepEqual(keys(first.search({ query: "beacon" }, who)), keys(second.search({ query: "beacon" }, who)));
    for (const token of ["secretnamesentinel", "secretaliassentinel", "secretsummarysentinel", "secretcontextsentinel", "secretcontentsentinel", "secrettagsentinel", "secretfeaturesentinel", "secretdescriptionsentinel", "secretparentsentinel", "secretinheritedsentinel"]) {
      assert.deepEqual(first.searchDebug({ query: token }, who), []);
      assert.deepEqual(keys(first.search({ query: token }, who)), []);
      assert(!JSON.stringify(first.searchDebug({ query: "beacon" }, who)).includes(token));
    }
    assert.deepEqual(keys(first.search({ query: "beacon", filters: { entity_ids: ["hidden_owner"] } }, who)), ["hidden_owner.public"]);
    for (const filters of [{ tags_any: ["secrettagsentinel"] }, { entity_types: ["location"] }, { parent_ids: ["hidden_parent"] }]) {
      assert(!keys(first.search({ query: "beacon", filters }, who)).includes("hidden_owner.public"));
    }
    const candidate = first.search({ query: "beacon" }, who).candidates.find(c => c.kind === "chunk")!;
    assert(candidate.kind === "chunk"); assert(!("name" in candidate)); assert(!("type" in candidate));
  }
});

test("audience corpora honor unclassified, inherited, restrictive override and player-only policies", () => {
  const missing = source("missing"), secret = source("secret"), player = source("player");
  delete missing.document.entity.knowledge;
  missing.document.chunks.push(chunk("missing", "public", "beacon", policy()), chunk("missing", "inherited", "beacon"));
  secret.document.entity.knowledge = policy(true, false); secret.document.entity.content = "beacon";
  secret.document.chunks.push(chunk("secret", "inherited", "beacon"), chunk("secret", "denied", "beacon", policy(false, false)));
  player.document.entity.knowledge = policy(false, true); player.document.entity.content = "beacon";
  const search = service([missing, secret, player]);
  assert.deepEqual(keys(search.search({ query: "beacon" }, "narrator")), ["missing.public", "secret", "secret.inherited"]);
  assert.deepEqual(keys(search.search({ query: "beacon" }, "player")), ["missing.public", "player"]);
  assert(search.search({ query: "beacon" }, "narrator").candidates.filter(c => c.entity_id === "secret").every(c => c.secret));
});

test("safe parent/owner text and search_context are indexed without being required", () => {
  const parent = source("parent", "Aurora"), child = source("child", "Birchwood"), contextual = source("contextual");
  child.document.entity.parent = "parent"; child.document.entity.content = "willow";
  child.document.chunks.push(chunk("child", "notes", "birch"));
  contextual.document.entity.search_context = "willow";
  const search = service([parent, child, contextual]);
  assert.deepEqual(keys(search.search({ query: "willow" }, "narrator")), ["contextual", "child"]);
  assert(search.searchDebug({ query: "aurora" }, "narrator").find(h => h.reference.entity_id === "child")!.contributions.some(c => c.field === "parent"));
  assert(search.searchDebug({ query: "birchwood" }, "narrator").find(h => h.reference.chunk_id === "child.notes")!.contributions.some(c => c.field === "owner"));
});

test("entity and chunk records compete, suppress same-owner duplicate passages and retain distinct details", () => {
  const owner = source("owner"); owner.document.entity.summary = "A beacon"; owner.document.entity.content = "beacon";
  const identical = chunk("owner", "copy", "beacon"); identical.summary = "A beacon";
  owner.document.chunks.push(identical, chunk("owner", "details", "beacon silver"));
  const search = service([owner]);
  const hits = search.searchDebug({ query: "beacon" }, "narrator");
  assert.equal(hits.length, 2); assert.equal(hits[0]!.reference.entity_id, "owner");
  assert(hits.some(h => h.reference.chunk_id === "owner.details"));
  const ranked = search.search({ query: "silver" }, "narrator");
  assert.deepEqual(keys(ranked), ["owner.details"]);
});

test("index binding rejects mismatched datasets and supports equivalent source order", () => {
  const a = source("alpha"), b = source("beta"); a.document.entity.content = "beacon";
  const retrieval = new RetrievalService(new WorldStore([a, b]));
  const index = new LexicalIndex(retrieval.indexSource());
  const equivalent = new RetrievalService(new WorldStore([b, a]));
  assert.equal(new LexicalSearch(equivalent, index).datasetId, index.datasetId);
  a.document.entity.content = "changed";
  assert.throws(() => new LexicalSearch(new RetrievalService(new WorldStore([a, b])), index), /dataset mismatch/);
  assert.throws(() => Object.assign(index, { datasetId: "fake" }), TypeError);
});

test("search previews remain bounded immutable and separate from exact fetch and debug", () => {
  const s = source("sample"); s.document.entity.content = "beacon " + "detail ".repeat(2000);
  const retrieval = new RetrievalService(new WorldStore([s])), search = new LexicalSearch(retrieval);
  const result = search.search({ query: "beacon" }, "narrator"), candidate = result.candidates[0]!;
  for (const value of [result, result.candidates, candidate, candidate.provenance, search.searchDebug({ query: "beacon" }, "narrator")[0]!.contributions]) {
    assert(Object.isFrozen(value)); assert.throws(() => Object.assign(value, { changed: true }), TypeError);
  }
  for (const field of ["content", "features", "score", "contributions", "source_path"]) assert(!(field in candidate));
  assert.equal(retrieval.get({ entity_id: "sample" }, "narrator").kind, "too_large");
  s.document.entity.summary = "beacon".repeat(101);
  assert.throws(() => service([s]).search({ query: "beacon" }, "narrator"), RetrievalProjectionError);
  s.document.entity.knowledge = policy(false, false);
  assert.deepEqual(keys(service([s]).search({ query: "beacon" }, "narrator")), []);
});

test("lexical search leaves all production YAML, canon snapshots and runtime location/time/mana/revision untouched", async () => {
  const world = await loadWorld("data"), search = new LexicalSearch(new RetrievalService(world));
  const files = world.listEntities().map(e => join("data", world.getProvenance(e.id)!.source_path));
  const beforeFiles = await Promise.all(files.map(file => readFile(file, "utf8")));
  const canon = JSON.stringify([world.listEntities(), world.listChunks()]);
  const runtimeSources = fixtures(); for (const s of runtimeSources) s.document.entity.knowledge = policy();
  const runtimeWorld = new WorldStore(runtimeSources), runtime = new RuntimeState(runtimeWorld, { player_location: room, world_time: { world_minute: 1430 } });
  runtime.applySceneDelta({ mana_delta: -25 });
  const state = () => ({ revision: runtime.revision, scene: runtime.getSceneState(), npcs: runtime.getNpcLocations(), mana: runtime.getPlayerMana() });
  const before = state(), runtimeSearch = new LexicalSearch(new RetrievalService(runtimeWorld));
  const sourceBefore = JSON.stringify(runtimeWorld.listEntities());
  for (const query of ["border fortress", "pirate city", "iron coal mining", "legendary rare magic", "beastfolk slavery west", "food storage cellar"]) {
    search.search({ query }, "narrator"); search.searchDebug({ query }, "player");
  }
  runtimeSearch.search({ query: "fixture" }, "narrator"); runtimeSearch.searchDebug({ query: "brenna" }, "player");
  assert.deepEqual(state(), before); assert.equal(JSON.stringify(runtimeWorld.listEntities()), sourceBefore);
  assert.equal(JSON.stringify([world.listEntities(), world.listChunks()]), canon);
  assert.deepEqual(await Promise.all(files.map(file => readFile(file, "utf8"))), beforeFiles);
  const ranked = runtimeSearch.searchDebug({ query: "fixture" }, "narrator");
  runtime.advanceTime(20); assert.deepEqual(runtimeSearch.searchDebug({ query: "fixture" }, "narrator"), ranked);
});

test("production evaluation reports actual successes and unresolved gaps without weakening expectations", async () => {
  const world = await loadWorld("data"), search = new LexicalSearch(new RetrievalService(world));
  assert.equal(search.documentCount("narrator"), 206); assert.equal(search.documentCount("player"), 187);
  const report = evaluate(search);
  assert.equal(report.cases, 44);
  assert(report.top1.passed / report.top1.total >= 0.85);
  assert(report.recall_at_5 >= 0.85);
  assert(report.rows.some(r => r.status === "fail"));
  for (const query of ["Blackwater", "The Unchained Haven", "Davenport", "The Port of Chains", "Ironbound", "The Fortress on the Edge", "Sandspear", "Frostspire", "iron coal mining", "border fortress", "food storage cellar"]) {
    assert.equal(report.rows.find(r => r.query === query)!.top1_pass, true, query);
  }
  assert.deepEqual(keys(search.search({ query: "quasarxylophone" }, "narrator")), []);
  assert.equal(keys(search.search({ query: "Blackwater black water" }, "narrator"))[0], "blackwater");
  assert(search.searchDebug({ query: "dragon ruler" }, "narrator").find(h => h.reference.entity_id === "dragons_teeth_mountains")!.matched_tokens.every(t => t !== "ruler"));
  for (const row of report.rows) for (const id of row.ids) assert(world.hasEntity(id));
  assert(!world.hasEntity("mages_guild"));
  assert.deepEqual(evaluate(search), report);
});
