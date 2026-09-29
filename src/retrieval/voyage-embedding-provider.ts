import { EmbeddingError, type EmbeddingProvider, type EmbeddingCallOptions, type EmbeddingVector } from "./embedding-provider.js";
import { normalizeBatch } from "./embedding-vectors.js";

export interface VoyageConfiguration {
  readonly apiKey?: string;
  readonly model?: string;
  readonly dimensions?: number;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}
/** Native transport; credentials and raw remote errors never become public metadata. */
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly providerId = "voyage";
  readonly purpose = "production" as const;
  readonly modelId: string;
  readonly dimension: number;
  readonly model: string;
  readonly #key: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeout: number;
  #requests = 0; #texts = 0; #tokens = 0; #usageResponses = 0;
  constructor(configuration: VoyageConfiguration = {}) {
    const key = configuration.apiKey ?? process.env.VOYAGE_API_KEY;
    if (!key?.trim()) throw new Error("Voyage configuration: VOYAGE_API_KEY is required");
    this.model = configuration.model ?? "voyage-4";
    this.dimension = configuration.dimensions ?? 1024;
    this.#timeout = configuration.timeoutMs ?? 10000;
    if (!/^voyage-[a-z0-9.-]+$/.test(this.model) || ![256, 512, 1024, 2048].includes(this.dimension) ||
      !Number.isSafeInteger(this.#timeout) || this.#timeout < 1 || this.#timeout > 60000) throw new EmbeddingError("invalid_configuration");
    this.modelId = `voyage:${this.model}:${this.dimension}`;
    this.#key = key; this.#fetch = configuration.fetch ?? globalThis.fetch;
    Object.freeze(this);
  }
  get usage() { return Object.freeze({ requests: this.#requests, input_texts: this.#texts, total_tokens: this.#tokens, responses_with_usage: this.#usageResponses }); }
  async embedDocuments(texts: readonly string[], options?: EmbeddingCallOptions): Promise<readonly EmbeddingVector[]> {
    return this.embed(texts, "document", options);
  }
  async embedQuery(text: string, options?: EmbeddingCallOptions): Promise<EmbeddingVector> {
    return (await this.embed([text], "query", options))[0]!;
  }
  /** Developer evaluation can batch independent queries without changing the engine interface. */
  async embedQueries(texts: readonly string[], options?: EmbeddingCallOptions): Promise<readonly EmbeddingVector[]> {
    return this.embed(texts, "query", options);
  }
  private async embed(texts: readonly string[], inputType: "document" | "query", options?: EmbeddingCallOptions): Promise<readonly EmbeddingVector[]> {
    // UTF-8 bytes are a conservative token upper bound. Leave room for provider prompts.
    const batches: string[][] = []; let batch: string[] = [], bytes = 0;
    for (const text of texts) {
      if (typeof text !== "string" || !text.trim()) throw new EmbeddingError("invalid_batch");
      const size = Buffer.byteLength(text, "utf8") + 128;
      if (size > 32000) throw new EmbeddingError("document_too_large");
      if (batch.length >= 128 || bytes + size > 120000) { batches.push(batch); batch = []; bytes = 0; }
      batch.push(text); bytes += size;
    }
    if (batch.length) batches.push(batch);
    const vectors: EmbeddingVector[] = [];
    for (const input of batches) vectors.push(...await this.request(input, inputType, options));
    return Object.freeze(vectors);
  }
  private async request(input: string[], inputType: string, options?: EmbeddingCallOptions): Promise<readonly EmbeddingVector[]> {
    const controller = new AbortController(); let timedOut = false;
    let rejectCancellation: (error: EmbeddingError) => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
    const cancel = () => { controller.abort(); rejectCancellation(new EmbeddingError("cancelled")); };
    options?.signal.addEventListener("abort", cancel, { once: true });
    if (options?.signal.aborted) cancel();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        cancelled,
        (async () => {
          if (controller.signal.aborted) throw new EmbeddingError("cancelled");
          this.#requests++; this.#texts += input.length;
          const response = await this.#fetch("https://api.voyageai.com/v1/embeddings", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.#key}` },
            signal: controller.signal,
            body: JSON.stringify({ input, model: this.model, input_type: inputType, output_dimension: this.dimension, output_dtype: "float", truncation: false }),
          });
          if (!response.ok) throw new EmbeddingError(response.status === 401 || response.status === 403 ? "authentication" : response.status === 429 ? "rate_limit" : response.status >= 500 ? "provider_unavailable" : "provider_error");
          let raw: unknown;
          try { raw = await response.json(); } catch { throw new EmbeddingError("malformed_response"); }
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new EmbeddingError("malformed_response");
          const body = raw as Record<string, unknown>;
          if (body.error) throw new EmbeddingError("provider_error");
          if (!Array.isArray(body.data) || body.data.length !== input.length) throw new EmbeddingError("malformed_response");
          const ordered: unknown[] = new Array(input.length); const seen = new Set<number>();
          for (const rawItem of body.data as unknown[]) {
            if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) throw new EmbeddingError("malformed_response");
            const item = rawItem as Record<string, unknown>;
            if (typeof item.index !== "number" || !Number.isSafeInteger(item.index) || item.index < 0 || item.index >= input.length || seen.has(item.index)) throw new EmbeddingError("malformed_response");
            seen.add(item.index); ordered[item.index] = item.embedding;
          }
          const result = normalizeBatch(ordered, input.length, this.dimension);
          const tokens = body.usage && typeof body.usage === "object" && "total_tokens" in body.usage ? body.usage.total_tokens : undefined;
          if (typeof tokens === "number" && Number.isSafeInteger(tokens) && tokens >= 0) { this.#tokens += tokens; this.#usageResponses++; }
          return result;
        })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new EmbeddingError("timeout")); }, this.#timeout); }),
      ]);
    } catch (error) {
      if (timedOut) throw new EmbeddingError("timeout");
      if (options?.signal.aborted) throw new EmbeddingError("cancelled");
      if (error instanceof EmbeddingError) throw error;
      throw new EmbeddingError("provider_unavailable");
    } finally { clearTimeout(timer); options?.signal.removeEventListener("abort", cancel); }
  }
}
