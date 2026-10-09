import { OpenRouterClient } from "./client.js";
import { ProviderError } from "../errors.js";
import { MANNERISM_EXTRACTOR_SYSTEM, MANNERISM_EXTRACTOR_TASK, MANNERISM_EXTRACTION_SCHEMA, type MannerismExtractor, type MannerismExtractionRequest } from "../../turn/mannerism-extraction.js";
/**
 * Production default (2026-10-08): GPT-6 Luna, replacing qwen/qwen3.8-flash (validated on the D-10 Pass 2B matrix; retired for
 * Alibaba shared-pool 429s). Same request contract; single model, no fallback; failure skips extraction.
 */
export const DEFAULT_MANNERISM_EXTRACTOR_MODEL = "openai/gpt-6-luna";
export class OpenRouterMannerismExtractor implements MannerismExtractor {
  constructor(private readonly client = new OpenRouterClient(), private readonly config: { model?: string; timeout_ms?: number } = {}) {}
  async extract(request: MannerismExtractionRequest) {
    let text = "";
    const { signal, ...data } = request;
    for await (const event of this.client.request({ model: this.config.model ?? DEFAULT_MANNERISM_EXTRACTOR_MODEL, max_tokens: 2048,
      messages: [{ role: "system", content: MANNERISM_EXTRACTOR_SYSTEM }, { role: "user", content: MANNERISM_EXTRACTOR_TASK + JSON.stringify(data) }],
      response_format: { type: "json_schema", json_schema: { name: "npc_mannerism_observations", strict: true, schema: MANNERISM_EXTRACTION_SCHEMA } },
      provider: { require_parameters: true }, reasoning: { exclude: true, enabled: false },
    }, false, this.config.timeout_ms ?? 20_000, signal)) {
      if (event.type === "text_delta") text += event.text; else return { text, metadata: event.metadata };
    }
    throw new ProviderError("invalid_provider_response");
  }
}
