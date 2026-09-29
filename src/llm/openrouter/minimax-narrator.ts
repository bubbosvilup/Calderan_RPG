import { ProviderError, providerError } from "../errors.js";
import type { NarratorProvider, NarratorResult, NarratorStreamEvent } from "../narrator-provider.js";
import type { GenerationRequest } from "../types.js";
import { OpenRouterClient } from "./client.js";
/** Phase 1M.1 default (selected in the Phase 1M bake-off). Override with OPENROUTER_NARRATOR_MODEL or NarratorConfig.model. */
export const DEFAULT_NARRATOR_MODEL = "moonshotai/kimi-k2.5";
/** Previous default; still supported through configuration. */
export const MINIMAX_NARRATOR_MODEL = "minimax/minimax-m2-her";
export interface NarratorConfig {
  readonly model?: string; readonly timeout_ms?: number; readonly max_output_tokens?: number;
  readonly output_ceiling?: number;
  /**
   * Narration never uses hidden reasoning: on hybrid models (Kimi, Qwen) it consumes the output budget and delays first token.
   * Defaults to true, sending reasoning: {enabled: false}; models without reasoning ignore the field (no require_parameters). Set false only for evaluation.
   */
  readonly disable_reasoning?: boolean;
  /** Adapter-local examples/group context; ordinary engine messages remain portable. */
  readonly roleplay_context?: readonly { role: "user_system" | "group" | "sample_message_user" | "sample_message_ai"; content: string }[];
}
/** Generic OpenRouter streaming narrator adapter (the name predates the Kimi default; nothing in it is MiniMax-specific). */
export class MiniMaxNarratorProvider implements NarratorProvider {
  constructor(private readonly client = new OpenRouterClient(), private readonly config: NarratorConfig = {}) {}
  async *stream(request: GenerationRequest): AsyncGenerator<NarratorStreamEvent> {
    let text = "";
    try {
      const max_tokens = request.max_output_tokens ?? this.config.max_output_tokens ?? 512;
      if (max_tokens > (this.config.output_ceiling ?? 2048)) throw new ProviderError("configuration_error");
      for await (const event of this.client.request({ model: this.config.model ?? DEFAULT_NARRATOR_MODEL,
        messages: [{ role: "system", content: request.system_prompt }, ...(this.config.roleplay_context ?? []), ...request.messages], max_tokens,
        ...(this.config.disable_reasoning ?? true ? { reasoning: { enabled: false } } : {}),
      }, true, this.config.timeout_ms ?? 60_000, request.signal)) {
        if (event.type === "text_delta") { text += event.text; yield event; }
        else yield { type: "completed", result: { text, ...event.metadata } };
      }
    } catch (error) { yield { type: "error", text, incomplete: true, error: providerError(error) }; }
  }
  async generate(request: GenerationRequest): Promise<NarratorResult> {
    for await (const event of this.stream(request)) {
      if (event.type === "error") throw event.error;
      if (event.type === "completed") return event.result;
    }
    throw new ProviderError("invalid_provider_response");
  }
}
