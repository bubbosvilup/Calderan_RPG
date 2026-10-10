import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EmbeddingError, SemanticCompatibilityError, type EmbeddingCallOptions, type EmbeddingProvider } from "../src/retrieval/embedding-provider.js";
import { cosine, normalizeBatch, normalizeVector } from "../src/retrieval/embedding-vectors.js";
import { HybridSearch, reciprocalRankFusion } from "../src/retrieval/hybrid-search.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { deriveSemanticDocuments, recordKey } from "../src/retrieval/semantic-documents.js";
import { SemanticIndex } from "../src/retrieval/semantic-index.js";
import { RetrievalValidationError } from "../src/retrieval/validation.js";
import { WorldStore } from "../src/world/world-store.js";
import { loadWorld } from "../src/world/loader.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { buildNarrativeContext } from "../src/scene/narrative-context-builder.js";
import { document, fixtures, location, room } from "./fixtures.js";
import { FixtureEmbeddingProvider } from "./retrieval-eval/fixture-embedding-provider.js";
import { evaluate, evaluateMode } from "./retrieval-eval/evaluate.js";
import type { KnowledgeChunk } from "../src/types/knowledge.js";

const policy = (narrator = true, player = true) => ({ visibility: { narrator, player }, known_by: [] });
function source(id: string, name = id) {
  const e = location(id); Object.assign(e, { name, display_name: name, summary: `Overview ${id}.`, content: `Passage ${id}.`, knowledge: policy() });
  return { source: `fixtures/${id}.yaml`, document: document(e) };
}
function chunk(owner: string, section: string, knowledge?: ReturnType<typeof policy>): KnowledgeChunk {
  return { id: `${owner}.${section}`, entity_id: owner, section, summary: `Overview ${section}`, content: `Passage ${section}`, search_context: "", tags: [], ...(knowledge ? { knowledge } : {}) };
}
const retrieval = (sources: ReturnType<typeof source>[]) => new RetrievalService(new WorldStore(sources));
const failure = (code: string) => (error: unknown) => error instanceof EmbeddingError && error.code === code;

test("provider vectors reject corruption, sparse/accessor tricks and zero norms; normalization is stable and immutable", () => {
  let called = false;
  const getter = [1, 2]; Object.defineProperty(getter, "0", { get() { called = true; return 1; }, enumerable: true });
  const subclass = new (class extends Array<number> {})(1, 2);
  for (const value of [[], [0, 0], [1], [1, 2, 3], [NaN, 0], [Infinity, 1], [-Infinity, 0], ["1", 0], new Array(2), getter, subclass, new Float32Array([1, 0]), Object.assign([1, 0], { extra: true }), Object.assign([1, 0], { [Symbol("extra")]: 1 })]) {
    assert.throws(() => normalizeVector(value, 2), failure("invalid_vector"));
  }
  for (const value of [[], [[1, 0], [0, 1]], new Array(1), { 0: [1, 0], length: 1 }]) assert.throws(() => normalizeBatch(value, 1, 2), failure("invalid_batch"));
  assert.equal(called, false);
  const original = [3, 4], v = normalizeVector(original, 2); original[0] = 999;
  assert(Math.abs(v[0]! - 0.6) < 1e-12); assert(Math.abs(v[1]! - 0.8) < 1e-12);
  assert.equal(cosine(v, v), 1); assert.equal(cosine(normalizeVector([1, 0], 2), normalizeVector([0, 1], 2)), 0);
  assert.equal(cosine(normalizeVector([1, 0], 2), normalizeVector([-1, 0], 2)), -1);
  for (const value of [[Number.MAX_VALUE, Number.MAX_VALUE], [Number.MIN_VALUE, Number.MIN_VALUE]]) assert(Math.abs(cosine(normalizeVector(value, 2), normalizeVector([1, 1], 2)) - 1) < 1e-12);
  assert(Object.isFrozen(v)); assert.throws(() => Object.assign(v, { 0: 3 }), TypeError);
});

test("semantic builds batch once per audience, bind identity and keep provider-retained arrays detached", async () => {
  const r = retrieval([source("c"), source("a"), source("b")]);
  const provider = new FixtureEmbeddingProvider();
  const index = await SemanticIndex.build(r.indexSource(), provider, "player", { batch_size: 2 });
  assert.deepEqual(provider.batches.map(b => b.length), [2, 1]);
  assert(provider.batches[0]![0]!.startsWith("Name: a\n"));
  assert.equal(index.identity.dataset_id, r.indexSource().datasetId()); assert.equal(index.identity.audience, "player");
  assert.equal(index.identity.dimension, 2); assert.equal(index.identity.model_id, provider.modelId);
  const first = await index.searchDebug({ query: "directions" }, "player");
  assert.deepEqual(first.map(h => h.reference.entity_id), ["a", "b", "c"]);
  assert.deepEqual(await index.searchDebug({ query: "directions" }, "player"), first);
  assert.equal(provider.batches.length, 2); assert.equal(provider.queries.length, 2);
  for (const item of [index, index.identity, first, first[0]!, first[0]!.reference]) assert(Object.isFrozen(item));
  const raw = [[1, 0]];
  provider.embedDocuments = async () => raw;
  const detached = await SemanticIndex.build(retrieval([source("one")]).indexSource(), provider, "narrator");
  raw[0]![0] = 0; raw[0]![1] = 1;
  assert.equal((await detached.searchDebug({ query: "direction" }, "narrator"))[0]!.semantic_score, 1);
});

test("cosine ranks only threshold-qualified authorized filtered records, including ties and empty corpus", async () => {
  const a = source("a"), b = source("b"), weak = source("weak"), opposite = source("opposite"), parent = source("parent");
  a.document.entity.parent = "parent"; b.document.entity.parent = "a"; a.document.entity.tags = ["test_tag"];
  const r = retrieval([b, parent, weak, opposite, a]);
  const provider = new FixtureEmbeddingProvider(text => text.startsWith("Name: weak\n") ? [0.1, 1] : text.startsWith("Name: opposite\n") ? [-1, 0] : [1, 0]);
  const index = await SemanticIndex.build(r.indexSource(), provider, "narrator", { minimum_similarity: 0.8 });
  assert.deepEqual((await index.searchDebug({ query: "test" }, "narrator")).map(h => h.reference.entity_id), ["a", "b", "parent"]);
  assert.deepEqual((await index.searchDebug({ query: "test", filters: { entity_types: ["location"], parent_ids: ["parent"], tags_all: ["test_tag"] } }, "narrator")).map(h => h.reference.entity_id), ["a"]);
  const count = provider.queries.length;
  assert.deepEqual(await index.searchDebug({ query: "test", filters: { entity_ids: [] } }, "narrator"), []);
  assert.equal(provider.queries.length, count);
  const emptyProvider = new FixtureEmbeddingProvider();
  const empty = await SemanticIndex.build(retrieval([]).indexSource(), emptyProvider, "player");
  assert.equal(empty.documentCount, 0); assert.deepEqual(await empty.searchDebug({ query: "test" }, "player"), []);
  assert.equal(emptyProvider.batches.length + emptyProvider.queries.length, 0);
});

test("provider and semantic options validation fail before embedding work", async () => {
  const r = retrieval([source("a")]);
  for (const settings of [{ batch_size: 0 }, { batch_size: 129 }, { timeout_ms: 0 }, { minimum_similarity: NaN }, { minimum_similarity: -1 }, { minimum_similarity: 0 }, { minimum_similarity: 1.1 }]) {
    await assert.rejects(SemanticIndex.build(r.indexSource(), new FixtureEmbeddingProvider(), "narrator", settings), failure("invalid_configuration"));
  }
  for (const update of [{ modelId: "" }, { providerId: "" }, { dimension: 0 }, { dimension: 1.5 }, { dimension: 16385 }, { purpose: "pretend" }]) {
    const provider = Object.assign(new FixtureEmbeddingProvider(), update) as EmbeddingProvider;
    await assert.rejects(SemanticIndex.build(r.indexSource(), provider, "narrator"), failure("invalid_configuration"));
  }
});

test("semantic requests reuse plain-data validation before provider calls", async () => {
  const r = retrieval([source("a")]), provider = new FixtureEmbeddingProvider();
  const index = await SemanticIndex.build(r.indexSource(), provider, "narrator"), hybrid = new HybridSearch(r, [index]);
  let invoked = false; const getter = Object.defineProperty({}, "query", { enumerable: true, get() { invoked = true; return "test"; } });
  for (const input of [null, {}, getter, Object.create({ query: "test" }), { query: " " }, { query: "x".repeat(513) }, { query: "test", limit: 6 }, { query: "test", audience: "player" }, { query: "test", filters: { ancestor_ids: ["a"] } }]) {
    await assert.rejects(index.searchDebug(input, "narrator"), RetrievalValidationError);
    await assert.rejects(hybrid.search(input, "narrator"), RetrievalValidationError);
  }
  assert.equal(invoked, false); assert.equal(provider.queries.length, 0);
});

test("failed builds are atomic, query response corruption rejects, and timeouts abort without exposing provider errors", async () => {
  const r = retrieval([source("a"), source("b")]), provider = new FixtureEmbeddingProvider();
  provider.embedDocuments = async () => [];
  await assert.rejects(SemanticIndex.build(r.indexSource(), provider, "narrator"), failure("invalid_batch"));
  provider.embedDocuments = async () => [[1, 0], [0, NaN]];
  await assert.rejects(SemanticIndex.build(r.indexSource(), provider, "narrator"), failure("invalid_vector"));
  let batches = 0;
  provider.embedDocuments = async texts => { if (++batches === 2) throw new Error("SECRET_PROVIDER_BODY"); return texts.map(() => [1, 0]); };
  await assert.rejects(SemanticIndex.build(r.indexSource(), provider, "narrator", { batch_size: 1 }), failure("provider_unavailable"));
  provider.embedDocuments = async texts => texts.map(() => [1, 0]);
  const index = await SemanticIndex.build(r.indexSource(), provider, "narrator", { timeout_ms: 15 });
  for (const vector of [[1], [0, 0], [Infinity, 0]]) {
    provider.embedQuery = async () => vector;
    await assert.rejects(index.searchDebug({ query: "test" }, "narrator"), failure("invalid_vector"));
  }
  let signal: AbortSignal | undefined;
  provider.embedQuery = async (_text, options) => { signal = options?.signal; return new Promise(() => {}); };
  await assert.rejects(index.searchDebug({ query: "test" }, "narrator"), failure("timeout")); assert.equal(signal?.aborted, true);
  provider.embedQuery = async () => { throw new Error("SECRET_PROVIDER_BODY"); };
  const fallback = await new HybridSearch(r, [index]).searchDebug({ query: "passage" }, "narrator");
  assert.equal(fallback.used_mode, "lexical"); assert.equal(fallback.fallback_reason, "provider_unavailable");
  assert(!JSON.stringify(fallback).includes("SECRET_PROVIDER_BODY"));
  provider.embedQuery = async () => [1, 0];
  assert.equal((await index.searchDebug({ query: "test" }, "narrator")).length, 2);
});

test("semantic derivation and hybrid ranking never use hidden parent/owner data, including provider inputs", async () => {
  const open = source("open"), hidden = source("hidden_owner", "SENTINEL_NAME"), parent = source("hidden_parent", "SENTINEL_PARENT");
  open.document.entity.parent = "hidden_parent";
  hidden.document.entity.knowledge = policy(false, false); parent.document.entity.knowledge = policy(false, false);
  Object.assign(hidden.document.entity, { display_name: "SENTINEL_DISPLAY", aliases: ["SENTINEL_ALIAS"], summary: "SENTINEL_SUMMARY", content: "SENTINEL_CONTENT", search_context: "SENTINEL_CONTEXT", tags: ["secret_tag"] });
  const e = hidden.document.entity; assert(e.type === "location"); e.features = [{ name: "SENTINEL_FEATURE", description: "SENTINEL_DESCRIPTION" }];
  hidden.document.chunks.push(chunk("hidden_owner", "public", policy()), chunk("hidden_owner", "inherited"));
  const sources = [open, hidden, parent], changed = structuredClone(sources);
  Object.assign(changed[1]!.document.entity, { name: "passage", aliases: ["passage"], content: "passage ".repeat(30) });
  changed[2]!.document.entity.name = "passage"; changed[1]!.document.chunks[1]!.content = "passage";
  const extra = source("extra_hidden"); extra.document.entity.knowledge = policy(false, false); changed.push(extra);
  const r1 = retrieval(sources), r2 = retrieval(changed);
  for (const who of ["narrator", "player"] as const) {
    const p1 = new FixtureEmbeddingProvider(), p2 = new FixtureEmbeddingProvider();
    const i1 = await SemanticIndex.build(r1.indexSource(), p1, who), i2 = await SemanticIndex.build(r2.indexSource(), p2, who);
    assert.deepEqual(p1.batches, p2.batches); assert(!JSON.stringify(p1.batches).includes("SENTINEL"));
    assert.equal(i1.documentCount, 2);
    const h1 = await i1.searchDebug({ query: "passage" }, who), h2 = await i2.searchDebug({ query: "passage" }, who);
    assert.deepEqual(h1.map(h => [h.reference, h.semantic_score]), h2.map(h => [h.reference, h.semantic_score]));
    const hybrid1 = new HybridSearch(r1, [i1]), hybrid2 = new HybridSearch(r2, [i2]);
    assert.deepEqual(await hybrid1.searchDebug({ query: "passage" }, who), await hybrid2.searchDebug({ query: "passage" }, who));
    for (const filters of [{ tags_any: ["secret_tag"] }, { entity_types: ["location"] }, { parent_ids: ["hidden_parent"] }]) {
      assert(!(await i1.searchDebug({ query: "passage", filters }, who)).some(h => h.reference.chunk_id === "hidden_owner.public"));
    }
    assert.deepEqual((await i1.searchDebug({ query: "passage", filters: { entity_ids: ["hidden_owner"] } }, who)).map(h => recordKey(h.reference)), ["hidden_owner.public"]);
    const preview = (await hybrid1.search({ query: "passage" }, who)).candidates.find(c => c.kind === "chunk")!;
    assert(preview.kind === "chunk"); assert(!("name" in preview)); assert(!("type" in preview));
    assert(!JSON.stringify([preview, await hybrid1.searchDebug({ query: "passage" }, who)]).includes("SENTINEL"));
  }
});

test("audience-local embeddings honor unclassified/inherited/override policies and safe text context", async () => {
  const missing = source("missing"), secret = source("secret", "PRIVATE_NAME"), player = source("player"), child = source("child");
  delete missing.document.entity.knowledge; secret.document.entity.knowledge = policy(true, false); player.document.entity.knowledge = policy(false, true);
  missing.document.chunks.push(chunk("missing", "public", policy()), chunk("missing", "inherited"));
  secret.document.chunks.push(chunk("secret", "inherited"), chunk("secret", "denied", policy(false, false)));
  child.document.entity.parent = "secret";
  const e = child.document.entity; assert(e.type === "location"); e.features = [{ name: "fixture feature", description: "Fixture detail." }]; e.aliases = ["Child alias"]; e.search_context = "Fixture context.";
  const r = retrieval([missing, secret, player, child]);
  const n = deriveSemanticDocuments(r.indexSource(), "narrator"), p = deriveSemanticDocuments(r.indexSource(), "player");
  assert(n.some(d => d.text.includes("Parent: PRIVATE_NAME"))); assert(!p.some(d => d.text.includes("PRIVATE_NAME")));
  assert(n.some(d => d.text.includes("Feature: fixture feature. Fixture detail.")));
  assert.deepEqual(n.map(d => recordKey(d.reference)), ["child", "missing.public", "secret", "secret.inherited"]);
  assert.deepEqual(p.map(d => recordKey(d.reference)), ["child", "missing.public", "player"]);
  const hidden = source("hidden"); hidden.document.entity.knowledge = policy(false, false); hidden.document.entity.content = "x".repeat(30000);
  assert.equal((await SemanticIndex.build(retrieval([hidden]).indexSource(), new FixtureEmbeddingProvider(), "player")).documentCount, 0);
  hidden.document.entity.knowledge = policy();
  await assert.rejects(SemanticIndex.build(retrieval([hidden]).indexSource(), new FixtureEmbeddingProvider(), "player"), failure("document_too_large"));
  assert.equal((await new HybridSearch(retrieval([hidden])).search({ query: "hidden" }, "player")).candidates.length, 1);
});

test("RRF combines ranks not score scales, rewards both channels, deduplicates identities and breaks ties by ID", () => {
  const hit = (id: string, score = 1) => ({ reference: { entity_id: id }, score });
  const fused = reciprocalRankFusion([hit("both", 999999), hit("lexical")], [hit("semantic"), hit("second"), hit("third"), hit("both", 0.36)]);
  assert.equal(fused[0]!.reference.entity_id, "both");
  assert.equal(fused[0]!.lexical_rank, 1); assert.equal(fused[0]!.semantic_rank, 4);
  assert(Math.abs(fused[0]!.hybrid_score - (1 / 61 + 1 / 64)) < 1e-12);
  assert.deepEqual(reciprocalRankFusion([hit("z")], [hit("a")]).map(h => h.reference.entity_id), ["a", "z"]);
  assert.deepEqual(reciprocalRankFusion([hit("a"), hit("a"), hit("b")], []).map(h => h.lexical_rank), [1, 2]);
  assert(Object.isFrozen(fused[0]!.reference)); assert(Object.isFrozen(fused));
});

test("hybrid pins exact IDs/names/aliases ahead of semantic neighbors, respects filters, preserves ambiguous class", async () => {
  const alpha = source("alpha", "Alpha Name"), beta = source("beta", "Beta Name");
  alpha.document.entity.aliases = ["Special Alias", "Shared"]; beta.document.entity.aliases = ["Shared"];
  const r = retrieval([alpha, beta]), provider = new FixtureEmbeddingProvider(text => text.startsWith("Name: Alpha") ? [0, 1] : [1, 0]);
  const index = await SemanticIndex.build(r.indexSource(), provider, "narrator"), hybrid = new HybridSearch(r, [index]);
  for (const query of ["alpha", "Alpha Name", "Special Alias"]) {
    const { result, debug } = await hybrid.searchWithDiagnostics({ query }, "narrator");
    assert.equal(result.candidates[0]!.entity_id, "alpha"); assert.equal(debug.hits[0]!.exact_match, "unique");
    assert.equal(r.resolveEntityReference(query, "narrator").kind, "found");
  }
  const ambiguous = await hybrid.searchDebug({ query: "Shared" }, "narrator");
  assert.deepEqual(ambiguous.hits.map(h => [h.reference.entity_id, h.exact_match]), [["alpha", "ambiguous"], ["beta", "ambiguous"]]);
  assert.equal(r.resolveEntityReference("Shared", "narrator").kind, "ambiguous");
  const filtered = await hybrid.search({ query: "Special Alias", filters: { entity_ids: ["beta"] } }, "narrator");
  assert.deepEqual(filtered.candidates.map(c => c.entity_id), ["beta"]);
});

test("hybrid and semantic collapse same-owner identical passages while keeping distinct chunks", async () => {
  const s = source("owner"), copy = chunk("owner", "copy"); copy.summary = s.document.entity.summary; copy.content = s.document.entity.content;
  s.document.chunks.push(copy, chunk("owner", "details"));
  const r = retrieval([s]), index = await SemanticIndex.build(r.indexSource(), new FixtureEmbeddingProvider(), "narrator");
  for (const mode of ["semantic", "hybrid"] as const) {
    const hits = (await new HybridSearch(r, [index]).searchDebug({ query: "passage" }, "narrator", mode)).hits;
    assert.equal(hits.length, 2); assert(hits.some(h => h.reference.chunk_id === "owner.details"));
  }
});

test("dataset, audience, provider/model and dimension mismatches cannot silently fuse", async () => {
  const r = retrieval([source("a")]), other = retrieval([source("b")]), p = new FixtureEmbeddingProvider();
  const n = await SemanticIndex.build(r.indexSource(), p, "narrator");
  assert.throws(() => new HybridSearch(other, [n]), SemanticCompatibilityError);
  assert.throws(() => new HybridSearch(r, [n], new LexicalSearch(other)), SemanticCompatibilityError);
  assert.throws(() => new HybridSearch(r, [n, n]), SemanticCompatibilityError);
  await assert.rejects(n.searchDebug({ query: "a" }, "player"), SemanticCompatibilityError);
  const p2 = new FixtureEmbeddingProvider(); p2.modelId = "another-model";
  const player = await SemanticIndex.build(r.indexSource(), p2, "player");
  assert.throws(() => new HybridSearch(r, [n, player]), SemanticCompatibilityError);
  p.modelId = "changed-after-build";
  await assert.rejects(n.searchDebug({ query: "a" }, "narrator"), SemanticCompatibilityError);
  await assert.rejects(new HybridSearch(r, [n]).search({ query: "a" }, "narrator"), SemanticCompatibilityError);
  p.modelId = n.identity.model_id; p.dimension = 3;
  await assert.rejects(n.searchDebug({ query: "a" }, "narrator"), SemanticCompatibilityError);
  const drifting = new FixtureEmbeddingProvider();
  drifting.embedDocuments = async texts => { drifting.modelId = "changed-during-build"; return texts.map(() => [1, 0]); };
  await assert.rejects(SemanticIndex.build(r.indexSource(), drifting, "narrator"), SemanticCompatibilityError);
});

test("lexical remains synchronous and hybrid falls back when semantic is absent or query vectors fail", async () => {
  const r = retrieval([source("alpha"), source("beta")]), lexical = new LexicalSearch(r);
  const request = { query: "passage" };
  const noProvider = new HybridSearch(r, [], lexical);
  assert.deepEqual(await noProvider.search(request, "narrator"), lexical.search(request, "narrator"));
  assert.equal((await noProvider.searchDebug(request, "narrator")).semantic_status, "unavailable");
  await assert.rejects(noProvider.search(request, "narrator", "semantic"), failure("provider_unavailable"));
  const p = new FixtureEmbeddingProvider(), index = await SemanticIndex.build(r.indexSource(), p, "narrator");
  p.embedQuery = async () => [0, 0];
  const broken = new HybridSearch(r, [index], lexical);
  assert.deepEqual(await broken.search(request, "narrator"), lexical.search(request, "narrator"));
  assert.equal((await broken.searchDebug(request, "narrator")).fallback_reason, "invalid_vector");
  await assert.rejects(evaluateMode(noProvider, "hybrid"), failure("provider_unavailable"));
  assert.deepEqual(await broken.search(request, "narrator", "lexical"), lexical.search(request, "narrator"));
});

test("synthetic indexing of production canon preserves identity strengths and bounded outputs, not semantic quality evidence", async () => {
  const r = new RetrievalService(await loadWorld("data")), p = new FixtureEmbeddingProvider();
  const index = await SemanticIndex.build(r.indexSource(), p, "narrator"), hybrid = new HybridSearch(r, [index]);
  assert.equal(index.documentCount, 235); assert.deepEqual(p.batches.map(b => b.length), [32, 32, 32, 32, 32, 32, 32, 11]);
  for (const [query, expected] of [["Blackwater", "blackwater"], ["The Unchained Haven", "blackwater"], ["Davenport", "davenport"], ["The Port of Chains", "davenport"], ["Ironbound", "ironbound"], ["The Fortress on the Edge", "ironbound"], ["Sandspear", "sandspear"], ["Frostspire", "frostspire"]]) {
    assert.equal((await hybrid.search({ query }, "narrator")).candidates[0]!.entity_id, expected);
  }
  // Concept queries carry only lexical signal here: the fixture gives every document the same vector, so its "semantic" order is
  // file order and fusion depends on how many records sort before the target (Four-District pass). Assert the real signal, top-1.
  for (const [query, expected] of [["iron coal mining", "frostspire"], ["border fortress", "ironbound"]]) assert.equal((await hybrid.search({ query }, "narrator", "lexical")).candidates[0]!.entity_id, expected);
  for (const mode of ["lexical", "semantic", "hybrid"] as const) {
    const result = await hybrid.search({ query: "magic" }, "narrator", mode);
    assert(result.candidates.length <= 5); assert.equal(result.next_offset, null);
    assert.equal((await hybrid.search({ query: "magic", limit: 1 }, "narrator", mode)).candidates.length, 1);
    for (const candidate of result.candidates) {
      for (const field of ["vector", "embedding", "content", "features", "semantic_score", "hybrid_score"]) assert(!(field in candidate));
      assert.equal(candidate.provenance.dataset_id, hybrid.datasetId);
      assert(Object.isFrozen(candidate));
    }
  }
  const lexicalReport = evaluate(new LexicalSearch(r));
  assert.equal(lexicalReport.top1.passed, 32); assert.equal(lexicalReport.cases, 44); // NPC Pass 2: "mages guild" top-1 restored to learned_arts_guild
});

test("semantic and hybrid determinism survives source ordering and leaves YAML/runtime/NarrativeContext unchanged", async () => {
  const sources = fixtures(); for (const s of sources) s.document.entity.knowledge = policy();
  const world = new WorldStore(sources), r = new RetrievalService(world), reversed = new RetrievalService(new WorldStore([...sources].reverse()));
  const runtime = new RuntimeState(world, { player_location: room, world_time: { world_minute: 1430 } }); runtime.applySceneDelta({ mana_delta: -25 });
  const state = () => ({ revision: runtime.revision, scene: runtime.getSceneState(), npcs: runtime.getNpcLocations(), mana: runtime.getPlayerMana(), context: buildNarrativeContext(world, runtime) });
  const before = state(), canon = JSON.stringify([world.listEntities(), world.listChunks()]);
  const p = new FixtureEmbeddingProvider(), p2 = new FixtureEmbeddingProvider();
  const index = await SemanticIndex.build(r.indexSource(), p, "narrator"), equivalent = await SemanticIndex.build(reversed.indexSource(), p2, "narrator");
  assert.deepEqual(p.batches, p2.batches);
  const search = new HybridSearch(r, [index]), other = new HybridSearch(reversed, [equivalent]);
  const debug = await search.searchDebug({ query: "fixture" }, "narrator");
  assert.deepEqual(await other.searchDebug({ query: "fixture" }, "narrator"), debug);
  await search.search({ query: "fixture" }, "narrator");
  assert.deepEqual(state(), before); assert.equal(JSON.stringify([world.listEntities(), world.listChunks()]), canon);
  runtime.advanceTime(20); assert.deepEqual(await search.searchDebug({ query: "fixture" }, "narrator"), debug);
  const production = await loadWorld("data"), paths = production.listEntities().map(e => join("data", production.getProvenance(e.id)!.source_path));
  const files = await Promise.all(paths.map(path => readFile(path, "utf8")));
  const productionRetrieval = new RetrievalService(production);
  const productionIndex = await SemanticIndex.build(productionRetrieval.indexSource(), new FixtureEmbeddingProvider(), "player");
  await new HybridSearch(productionRetrieval, [productionIndex]).search({ query: "magic specializations" }, "player");
  assert.deepEqual(await Promise.all(paths.map(path => readFile(path, "utf8"))), files);
});
