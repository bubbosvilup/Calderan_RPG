import { LexicalIndex } from "./lexical-index.js";
import { bounded } from "./projections.js";
import type { RetrievalService } from "./retrieval-service.js";
import type { RetrievalAudience, WorldSearchResult } from "./types.js";
import { audience, validateWorldSearchRequest } from "./validation.js";

/** Actual world_search engine boundary, not a registered LLM tool. Construct once. */
export class LexicalSearch {
  readonly #retrieval: RetrievalService;
  readonly #index: LexicalIndex;
  constructor(retrieval: RetrievalService, index = new LexicalIndex(retrieval.indexSource())) {
    if (index.datasetId !== retrieval.indexSource().datasetId()) throw new Error("Lexical index dataset mismatch; rebuild from this canon");
    this.#retrieval = retrieval; this.#index = index;
  }
  get datasetId(): string { return this.#index.datasetId; }
  documentCount(who: RetrievalAudience): number { return this.#index.documentCount(who); }
  search(input: unknown, who: RetrievalAudience): WorldSearchResult {
    const request = validateWorldSearchRequest(input), a = audience(who);
    const hits = this.#index.searchDebug(request, a).slice(0, request.limit);
    // Phase 1F projector sorts IDs. Project one hit at a time to preserve lexical rank,
    // while retaining its visibility recheck, canonical previews, and defensive bounds.
    const candidates = hits.flatMap(hit => this.#retrieval.projectCandidates([hit.reference], a).candidates);
    return bounded({ candidates: Object.freeze(candidates), next_offset: null });
  }
  /** Authorized scores/explanations for the entire matching corpus; never model context. */
  searchDebug(input: unknown, who: RetrievalAudience) { return this.#index.searchDebug(input, who); }
}
