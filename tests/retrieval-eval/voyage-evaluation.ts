import { VoyageEmbeddingProvider } from "../../src/retrieval/voyage-embedding-provider.js";
import { type EmbeddingProvider, type EmbeddingVector, EmbeddingError, embeddingIdentity } from "../../src/retrieval/embedding-provider.js";
import { cosine } from "../../src/retrieval/embedding-vectors.js";
import { SemanticIndex } from "../../src/retrieval/semantic-index.js";
import { deriveSemanticDocuments } from "../../src/retrieval/semantic-documents.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import type { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import type { LexicalSearch } from "../../src/retrieval/lexical-search.js";
import { evaluationCases } from "./cases.js";

export const representativeQueries = ["magic specializations", "church investigators", "places where pirates operate", "religious secret police", "special branches of elemental magic", "institution responsible for investigating dangerous rare magic", "Blackwater", "The Unchained Haven", "The Port of Chains", "The Fortress on the Edge", "border fortress", "iron coal mining", "food storage cellar"];

export async function evaluateVoyage(retrieval: RetrievalService, lexical: LexicalSearch, evaluate: typeof import("./evaluate.js").evaluate, evaluateMode: typeof import("./evaluate.js").evaluateMode) {
  const voyage = new VoyageEmbeddingProvider();
  try {
  const paced = process.argv.includes("--paced-voyage");
  let lastRequest = 0;
  const pace = async () => {
    if (paced) await new Promise(resolve => setTimeout(resolve, Math.max(0, 40000 - (Date.now() - lastRequest))));
    lastRequest = Date.now();
  };
  // Evaluation-only memoization: same model/query reused across modes and audiences.
  const queries = new Map<string, EmbeddingVector>(), documents = new Map<string, EmbeddingVector>();
  const provider: EmbeddingProvider = {
    providerId: voyage.providerId, modelId: voyage.modelId, dimension: voyage.dimension, purpose: voyage.purpose,
    async embedDocuments(texts, options) {
      await pace();
      const vectors = await voyage.embedDocuments(texts, options);
      texts.forEach((text, i) => documents.set(text, vectors[i]!)); return vectors;
    },
    async embedQuery(text, options) {
      let vector = queries.get(text);
      if (!vector) { vector = await voyage.embedQuery(text, options); queries.set(text, vector); }
      return vector;
    },
  };
  const source = retrieval.indexSource(), indexes: SemanticIndex[] = [], builds = [];
  for (const audience of ["narrator", "player"] as const) {
    const before = voyage.usage, start = performance.now();
    const index = await SemanticIndex.build(source, provider, audience, { batch_size: paced ? 16 : 128, timeout_ms: paced ? 60000 : 10000 });
    indexes.push(index);
    builds.push({ audience, documents: index.documentCount, milliseconds: Math.round(performance.now() - start), requests: voyage.usage.requests - before.requests, tokens: voyage.usage.total_tokens - before.total_tokens });
    process.stderr.write(`Built ${audience} semantic index: ${index.documentCount} documents\n`);
  }
  const uniqueQueries = [...new Set([...evaluationCases.map(c => c.query), ...representativeQueries])];
  await pace();
  const queryVectors = await voyage.embedQueries(uniqueQueries);
  uniqueQueries.forEach((query, i) => queries.set(query, queryVectors[i]!));
  const search = new HybridSearch(retrieval, indexes, lexical);
  const metrics = { lexical: evaluate(lexical), semantic: await evaluateMode(search, "semantic"), hybrid: await evaluateMode(search, "hybrid") };
  const representative = [];
  for (const query of representativeQueries) {
    const results: Record<string, unknown> = {};
    for (const mode of ["lexical", "semantic", "hybrid"] as const) {
      const { result, debug } = await search.searchWithDiagnostics({ query }, "narrator", mode);
      if (mode !== "lexical" && debug.semantic_status !== "available") throw new EmbeddingError("provider_unavailable");
      results[mode] = result.candidates.map(c => c.entity_id);
    }
    representative.push({ query, ...results });
  }
  const docs = deriveSemanticDocuments(source, "narrator");
  const threshold = [...new Set([...evaluationCases.map(c => c.query), ...representativeQueries])].map(query => {
    const vector = queries.get(query)!;
    const scores = docs.map(d => ({ id: d.reference.entity_id, score: cosine(vector, documents.get(d.text)!) })).sort((a, b) => b.score - a.score);
    return { query, candidates_at_threshold: scores.filter(s => s.score >= 0.35).length, scores };
  });
  const player = await search.searchWithDiagnostics({ query: "church investigators" }, "player", "hybrid");
  if (player.debug.semantic_status !== "available") throw new EmbeddingError("provider_unavailable");
  const identityQueries = new Set(evaluationCases.slice(28, 36).map(c => c.query));
  return { status: "semantic real provider available", provider: embeddingIdentity(voyage), builds, metrics,
    direct_identity_alias: Object.fromEntries(Object.entries(metrics).map(([mode, report]) => [mode, { passed: report.rows.filter(r => identityQueries.has(r.query) && r.top1_pass).length, total: identityQueries.size }])),
    representative, threshold, player_verification: player.result.candidates.map(c => c.entity_id),
    document_samples: (["narrator", "player"] as const).map(audience => ({ audience, documents: deriveSemanticDocuments(source, audience).filter(d => ["inquisition", "magic_subschools", "blackwater", "sandspear", "frostspire"].includes(d.reference.entity_id)).map(d => ({ id: d.reference.entity_id, text: d.text })) })),
    usage: voyage.usage, query_cache_entries: queries.size };
  } catch (error) {
    return { status: "semantic unavailable/fallback", reason: error instanceof EmbeddingError ? error.code : "evaluation_failed",
      metrics: { lexical: evaluate(lexical) }, provider: embeddingIdentity(voyage), usage: voyage.usage };
  }
}
