import { compareIds } from "../world/provenance.js";
import { callEmbedding, embeddingIdentity, EmbeddingError, sameEmbedding, SemanticCompatibilityError, type EmbeddingIdentity, type EmbeddingProvider, type EmbeddingVector } from "./embedding-provider.js";
import { cosine, normalizeBatch, normalizeVector } from "./embedding-vectors.js";
import { matchesAuthorizedOwner } from "./filters.js";
import { deriveSemanticDocuments, recordKey, SEMANTIC_DOCUMENT_VERSION, type SemanticDocument } from "./semantic-documents.js";
import { audience, dataRecord, validateWorldSearchRequest } from "./validation.js";
import type { CandidateReference, RetrievalAudience, RetrievalIndexSource } from "./types.js";

export interface SemanticOptions { readonly batch_size?: number; readonly timeout_ms?: number; readonly minimum_similarity?: number }
function options(input: unknown): Required<SemanticOptions> {
  const r = dataRecord(input, "semantic_options", ["batch_size", "timeout_ms", "minimum_similarity"]);
  const batch_size = Object.hasOwn(r, "batch_size") ? r.batch_size : 32;
  const timeout_ms = Object.hasOwn(r, "timeout_ms") ? r.timeout_ms : 10000;
  const minimum_similarity = Object.hasOwn(r, "minimum_similarity") ? r.minimum_similarity : 0.35;
  if (typeof batch_size !== "number" || !Number.isSafeInteger(batch_size) || batch_size < 1 || batch_size > 128 ||
    typeof timeout_ms !== "number" || !Number.isSafeInteger(timeout_ms) || timeout_ms < 1 || timeout_ms > 60000 ||
    typeof minimum_similarity !== "number" || !Number.isFinite(minimum_similarity) || minimum_similarity <= 0 || minimum_similarity > 1) throw new EmbeddingError("invalid_configuration");
  return Object.freeze({ batch_size, timeout_ms, minimum_similarity });
}
export interface SemanticIdentity extends EmbeddingIdentity {
  readonly dataset_id: string;
  readonly audience: RetrievalAudience;
  readonly document_version: typeof SEMANTIC_DOCUMENT_VERSION;
}
export interface SemanticHit {
  readonly reference: CandidateReference;
  readonly semantic_score: number;
  readonly dataset_id: string;
  readonly audience: RetrievalAudience;
}
export class SemanticIndex {
  readonly identity: SemanticIdentity;
  readonly #provider: EmbeddingProvider;
  readonly #documents: readonly SemanticDocument[];
  readonly #vectors: readonly EmbeddingVector[];
  readonly #options: Required<SemanticOptions>;
  private constructor(provider: EmbeddingProvider, identity: SemanticIdentity, docs: readonly SemanticDocument[], vectors: readonly EmbeddingVector[], configuration: Required<SemanticOptions>) {
    this.#provider = provider; this.identity = Object.freeze(identity); this.#documents = docs;
    this.#vectors = Object.freeze([...vectors]); this.#options = configuration;
    Object.freeze(this);
  }
  static async build(source: RetrievalIndexSource, provider: EmbeddingProvider, who: RetrievalAudience, configuration: SemanticOptions = {}): Promise<SemanticIndex> {
    const a = audience(who), settings = options(configuration), embedding = embeddingIdentity(provider);
    const identity: SemanticIdentity = { ...embedding, dataset_id: source.datasetId(), audience: a, document_version: SEMANTIC_DOCUMENT_VERSION };
    const docs = deriveSemanticDocuments(source, a), vectors: EmbeddingVector[] = [];
    for (let offset = 0; offset < docs.length; offset += settings.batch_size) {
      if (!sameEmbedding(embedding, embeddingIdentity(provider))) throw new SemanticCompatibilityError();
      const texts = Object.freeze(docs.slice(offset, offset + settings.batch_size).map(d => d.text));
      const response = await callEmbedding(o => provider.embedDocuments(texts, o), settings.timeout_ms);
      if (!sameEmbedding(embedding, embeddingIdentity(provider))) throw new SemanticCompatibilityError();
      vectors.push(...normalizeBatch(response, texts.length, embedding.dimension));
    }
    // Construction is atomic: no partially populated object is returned on failure.
    return new SemanticIndex(provider, identity, docs, vectors, settings);
  }
  get documentCount(): number { return this.#documents.length; }
  get minimumSimilarity(): number { return this.#options.minimum_similarity; }
  async searchDebug(input: unknown, who: RetrievalAudience): Promise<readonly SemanticHit[]> {
    const request = validateWorldSearchRequest(input), a = audience(who);
    if (a !== this.identity.audience || !sameEmbedding(this.identity, embeddingIdentity(this.#provider))) throw new SemanticCompatibilityError();
    const eligible = this.#documents.map((d, i) => ({ d, i })).filter(({ d }) => matchesAuthorizedOwner(d.reference, d.filter_owner, request.filters ?? {}));
    if (!eligible.length) return Object.freeze([]);
    const response = await callEmbedding(o => this.#provider.embedQuery(request.query, o), this.#options.timeout_ms);
    if (!sameEmbedding(this.identity, embeddingIdentity(this.#provider))) throw new SemanticCompatibilityError();
    const query = normalizeVector(response, this.identity.dimension);
    const hits = eligible.map(({ d, i }) => ({ d, score: cosine(query, this.#vectors[i]!) }))
      .filter(h => h.score >= this.#options.minimum_similarity)
      .sort((a, b) => b.score - a.score || compareIds(recordKey(a.d.reference), recordKey(b.d.reference)));
    const seen = new Set<number>();
    return Object.freeze(hits.filter(({ d }) => {
      if (seen.has(d.duplicate_group)) return false; seen.add(d.duplicate_group); return true;
    }).map(({ d, score }) => Object.freeze({ reference: d.reference, semantic_score: score, dataset_id: this.identity.dataset_id, audience: a })));
  }
}
