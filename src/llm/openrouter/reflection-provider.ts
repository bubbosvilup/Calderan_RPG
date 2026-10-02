import { ProviderError } from "../errors.js";
import { OpenRouterClient } from "./client.js";
import { DEFAULT_CONTROLLER_MODEL } from "./deepseek-controller.js";
import { REFLECTION_SCHEMA, REFLECTION_SYSTEM, type ReflectionProvider, type ReflectionRequest } from "../../turn/reflection.js";

/**
 * NPC+ Pass 6: a small, cheap structured reflection call (the controller-class model by default; never the narrator). Strict JSON schema,
 * reasoning disabled, small output budget. It only returns text: parsing and every validation happen deterministically in turn/reflection.ts,
 * and any error leaves campaign state untouched.
 */
export interface ReflectionConfig { readonly model?: string; readonly max_output_tokens?: number; readonly timeout_ms?: number }
export class OpenRouterReflectionProvider implements ReflectionProvider {
  constructor(private readonly client = new OpenRouterClient(), private readonly config: ReflectionConfig = {}) {}
  async reflect(request: ReflectionRequest): Promise<{ readonly text: string; readonly usage?: unknown; readonly model?: string }> {
    let text = "";
    for await (const event of this.client.request({ model: this.config.model ?? DEFAULT_CONTROLLER_MODEL, max_tokens: this.config.max_output_tokens ?? 600,
      messages: [{ role: "system", content: REFLECTION_SYSTEM }, { role: "user", content: JSON.stringify({ character: request.character, evidence: request.evidence, existing_notes: request.existing }) }],
      response_format: { type: "json_schema", json_schema: { name: "npc_reflection", strict: true, schema: REFLECTION_SCHEMA } },
      provider: { require_parameters: true }, reasoning: { exclude: true, enabled: false },
    }, false, Math.min(this.config.timeout_ms ?? 20_000, request.timeout_ms ?? Infinity))) {
      if (event.type === "text_delta") text += event.text;
      else return { text, usage: event.metadata.usage, model: event.metadata.model };
    }
    throw new ProviderError("invalid_provider_response");
  }
}
