export type EmbeddingVector = readonly number[];
export interface EmbeddingCallOptions { readonly signal: AbortSignal }
/** Vendor formats, credentials, transport and provider token limits belong in adapters. */
export interface EmbeddingProvider {
  readonly providerId: string;
  /** Must identify an immutable model/version and document/query encoding recipe. */
  readonly modelId: string;
  readonly dimension: number;
  readonly purpose: "production" | "test";
  embedDocuments(texts: readonly string[], options?: EmbeddingCallOptions): Promise<readonly EmbeddingVector[]>;
  embedQuery(text: string, options?: EmbeddingCallOptions): Promise<EmbeddingVector>;
}
export type EmbeddingFailure = "provider_unavailable" | "authentication" | "rate_limit" | "malformed_response" | "provider_error" | "cancelled" | "timeout" | "invalid_vector" | "invalid_batch" | "document_too_large" | "invalid_configuration";
/** Sanitized failures: provider response bodies/credentials never enter debug output. */
export class EmbeddingError extends Error {
  constructor(readonly code: EmbeddingFailure) { super(`Embedding failure: ${code}`); this.name = "EmbeddingError"; }
}
export class SemanticCompatibilityError extends Error {
  constructor() { super("Semantic dataset, audience, provider, model or dimension mismatch; rebuild the index"); this.name = "SemanticCompatibilityError"; }
}
export interface EmbeddingIdentity {
  readonly provider_id: string;
  readonly model_id: string;
  readonly dimension: number;
  readonly purpose: "production" | "test";
}
export function embeddingIdentity(provider: EmbeddingProvider): EmbeddingIdentity {
  const validId = (v: unknown) => typeof v === "string" && v.trim().length > 0 && v.length <= 200;
  if (!provider || !validId(provider.providerId) || !validId(provider.modelId) ||
    !Number.isSafeInteger(provider.dimension) || provider.dimension < 1 || provider.dimension > 16384 ||
    !["production", "test"].includes(provider.purpose) || typeof provider.embedDocuments !== "function" || typeof provider.embedQuery !== "function") {
    throw new EmbeddingError("invalid_configuration");
  }
  return Object.freeze({ provider_id: provider.providerId, model_id: provider.modelId, dimension: provider.dimension, purpose: provider.purpose });
}
export function sameEmbedding(a: EmbeddingIdentity, b: EmbeddingIdentity): boolean {
  return a.provider_id === b.provider_id && a.model_id === b.model_id && a.dimension === b.dimension && a.purpose === b.purpose;
}
/** Deadline rejects even if an adapter ignores abort; adapters should honor the signal. */
export async function callEmbedding<T>(call: (options: EmbeddingCallOptions) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => call({ signal: controller.signal })),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { reject(new EmbeddingError("timeout")); controller.abort(); }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;
    throw new EmbeddingError("provider_unavailable");
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
