import { ProviderError } from "../errors.js";
import { OpenRouterClient } from "./client.js";
import { COMPRESSOR_SCHEMA, COMPRESSOR_SYSTEM, type ContextCompressorProvider, type CompressionRequest, type CompressionResponse } from "../context-compressor-provider.js";
import { COMPRESSION_SCHEMA_VERSION } from "../../turn/narrator-pack.js";
/** No default or fallback model. Uses the existing authenticated, bounded HTTP transport. */
export class OpenRouterContextCompressor implements ContextCompressorProvider {
  constructor(readonly model_id: string, private readonly client = new OpenRouterClient()) { if (!model_id.trim()) throw new ProviderError("configuration_error"); }
  async compress(request: CompressionRequest): Promise<CompressionResponse> {
    let text = "";
    for await (const event of this.client.request({ model: this.model_id, max_tokens: Math.min(12_000, Math.max(512, Math.ceil(JSON.stringify(request.source_pack).length / 3))),
      messages: [{ role: "system", content: COMPRESSOR_SYSTEM }, { role: "user", content: JSON.stringify({ version: COMPRESSION_SCHEMA_VERSION, ...request, signal: undefined }) }],
      response_format: { type: "json_schema", json_schema: { name: "context_compression", strict: true, schema: COMPRESSOR_SCHEMA } },
      provider: { require_parameters: true }, reasoning: { exclude: true, enabled: false },
    }, false, 20_000, request.signal)) {
      if (event.type === "text_delta") text += event.text;
      else return { candidate: text, usage: event.metadata.usage, ...(event.metadata.cost_usd === undefined ? {} : { cost_usd: event.metadata.cost_usd }) };
    }
    throw new ProviderError("invalid_provider_response");
  }
}
