import { compareIds } from "../world/provenance.js";
import { EmbeddingError, sameEmbedding, SemanticCompatibilityError, type EmbeddingFailure } from "./embedding-provider.js";
import { matchesEntityFilter } from "./filters.js";
import { LexicalSearch } from "./lexical-search.js";
import { bounded } from "./projections.js";
import type { RetrievalService } from "./retrieval-service.js";
import { authorizedDuplicateGroups, recordKey } from "./semantic-documents.js";
import { SemanticIndex, type SemanticHit } from "./semantic-index.js";
import { audience, validateWorldSearchRequest } from "./validation.js";
import type { CandidateReference, ResolutionResult, RetrievalAudience, RetrievalEntitySource, WorldSearchRequest, WorldSearchResult } from "./types.js";

export type SearchMode = "lexical" | "semantic" | "hybrid";
export const RRF_K = 60;
export interface RankedEvidence {
  readonly reference: CandidateReference;
  readonly lexical_rank?: number;
  readonly lexical_score?: number;
  readonly semantic_rank?: number;
  readonly semantic_score?: number;
  readonly hybrid_score: number;
  readonly exact_match?: "unique" | "ambiguous";
}
type RankedInput = { readonly reference: CandidateReference; readonly score: number };
/** Internal authorized lists, one record per channel. Raw score scales are never summed. */
export function reciprocalRankFusion(lexical: readonly RankedInput[], semantic: readonly RankedInput[]): readonly RankedEvidence[] {
  const evidence = new Map<string, RankedEvidence>();
  for (const [channel, list] of [["lexical", lexical], ["semantic", semantic]] as const) {
    const seen = new Set<string>(); let rank = 0;
    for (const hit of list) {
      const key = recordKey(hit.reference); if (seen.has(key)) continue; seen.add(key); rank++;
      const prior = evidence.get(key);
      evidence.set(key, { ...prior, reference: Object.freeze({ ...hit.reference }),
        ...(channel === "lexical" ? { lexical_rank: rank, lexical_score: hit.score } : { semantic_rank: rank, semantic_score: hit.score }),
        hybrid_score: (prior?.hybrid_score ?? 0) + 1 / (RRF_K + rank) });
    }
  }
  return Object.freeze([...evidence.values()].sort((a, b) => b.hybrid_score - a.hybrid_score || compareIds(recordKey(a.reference), recordKey(b.reference))).map(hit => Object.freeze(hit)));
}
export interface HybridDebugResult {
  readonly requested_mode: SearchMode;
  readonly used_mode: SearchMode;
  readonly semantic_status: "not_requested" | "available" | "unavailable" | "failed";
  readonly fallback_reason?: EmbeddingFailure;
  readonly hits: readonly RankedEvidence[];
}
/** Explicit opt-in hybrid engine. Dev tooling retains lexical as its default pending quality evaluation. */
export class HybridSearch {
  readonly #retrieval: RetrievalService;
  readonly #lexical: LexicalSearch;
  readonly #semantic = new Map<RetrievalAudience, SemanticIndex>();
  readonly #entities: ReadonlyMap<string, RetrievalEntitySource>;
  readonly #duplicates: Readonly<Record<RetrievalAudience, ReadonlyMap<string, number>>>;
  constructor(retrieval: RetrievalService, indexes: readonly SemanticIndex[] = [], lexical = new LexicalSearch(retrieval)) {
    this.#retrieval = retrieval; this.#lexical = lexical;
    this.#entities = new Map(retrieval.indexSource().entities().map(e => [e.id, e]));
    if (lexical.datasetId !== retrieval.indexSource().datasetId()) throw new SemanticCompatibilityError();
    for (const index of indexes) {
      if (index.identity.dataset_id !== lexical.datasetId || this.#semantic.has(index.identity.audience) ||
        (indexes[0] && !sameEmbedding(index.identity, indexes[0].identity))) throw new SemanticCompatibilityError();
      this.#semantic.set(index.identity.audience, index);
    }
    this.#duplicates = { narrator: authorizedDuplicateGroups(retrieval.indexSource(), "narrator"), player: authorizedDuplicateGroups(retrieval.indexSource(), "player") };
  }
  get datasetId(): string { return this.#lexical.datasetId; }
  private exact(request: WorldSearchRequest, who: RetrievalAudience): { references: readonly CandidateReference[]; ambiguous: boolean } {
    const refs: CandidateReference[] = []; let offset = 0, ambiguous = false;
    do {
      const result: ResolutionResult = this.#retrieval.resolveEntityReference(request.query, who, { offset });
      if (result.kind === "not_found") break;
      const candidates = result.kind === "found" ? [result.candidate] : result.candidates;
      for (const c of candidates) if (matchesEntityFilter(this.#entities.get(c.entity_id)!, request.filters ?? {})) refs.push(Object.freeze({ entity_id: c.entity_id }));
      if (result.kind !== "ambiguous") break;
      ambiguous = true; if (result.next_offset === null) break; offset = result.next_offset;
    } while (true);
    return { references: refs, ambiguous };
  }
  async searchDebug(input: unknown, who: RetrievalAudience, mode: SearchMode = "hybrid"): Promise<HybridDebugResult> {
    const request = validateWorldSearchRequest(input), a = audience(who);
    if (!["lexical", "semantic", "hybrid"].includes(mode)) throw new EmbeddingError("invalid_configuration");
    const lexical = mode === "semantic" ? [] : this.#lexical.searchDebug(request, a);
    let semantic: readonly SemanticHit[] = [], semantic_status: HybridDebugResult["semantic_status"] = "not_requested";
    let fallback_reason: EmbeddingFailure | undefined;
    if (mode !== "lexical") {
      const index = this.#semantic.get(a);
      if (!index) {
        if (mode === "semantic") throw new EmbeddingError("provider_unavailable");
        semantic_status = "unavailable"; fallback_reason = "provider_unavailable";
      } else {
        try { semantic = await index.searchDebug(request, a); semantic_status = "available"; }
        catch (error) {
          // Wrong dataset/model/audience is a configuration error, never silently fused.
          if (!(error instanceof EmbeddingError) || mode === "semantic") throw error;
          semantic_status = "failed"; fallback_reason = error.code;
        }
      }
    }
    const fused = reciprocalRankFusion(lexical, semantic.map(h => ({ reference: h.reference, score: h.semantic_score })));
    const ranked = [...fused];
    if (mode === "hybrid") {
      const exact = this.exact(request, a), keys = new Set(exact.references.map(recordKey));
      const byKey = new Map(fused.map(h => [recordKey(h.reference), h]));
      ranked.splice(0, ranked.length, ...exact.references.map(ref => Object.freeze({ ...byKey.get(recordKey(ref)), reference: ref,
        hybrid_score: byKey.get(recordKey(ref))?.hybrid_score ?? 0, exact_match: exact.ambiguous ? "ambiguous" as const : "unique" as const })),
      ...fused.filter(h => !keys.has(recordKey(h.reference))));
    }
    const groups = this.#duplicates[a], seen = new Set<number>();
    const hits = ranked.filter(h => {
      const group = groups.get(recordKey(h.reference));
      if (group === undefined) throw new SemanticCompatibilityError();
      if (seen.has(group)) return false; seen.add(group); return true;
    });
    return Object.freeze({ requested_mode: mode, used_mode: mode === "hybrid" && semantic_status !== "available" ? "lexical" : mode,
      semantic_status, ...(fallback_reason ? { fallback_reason } : {}), hits: Object.freeze(hits) });
  }
  async search(input: unknown, who: RetrievalAudience, mode: SearchMode = "hybrid"): Promise<WorldSearchResult> {
    return (await this.searchWithDiagnostics(input, who, mode)).result;
  }
  /** Internal evaluation/inspection: one query embedding, both compact output and diagnostics. */
  async searchWithDiagnostics(input: unknown, who: RetrievalAudience, mode: SearchMode = "hybrid"): Promise<{ readonly result: WorldSearchResult; readonly debug: HybridDebugResult }> {
    const request = validateWorldSearchRequest(input), a = audience(who);
    const debug = await this.searchDebug(request, a, mode);
    const candidates = debug.hits.slice(0, request.limit).flatMap(h => this.#retrieval.projectCandidates([h.reference], a).candidates);
    return Object.freeze({ result: bounded({ candidates: Object.freeze(candidates), next_offset: null }), debug });
  }
}
