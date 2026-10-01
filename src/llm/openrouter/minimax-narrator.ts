import { ProviderError, providerError } from "../errors.js";
import type { NarratorProvider, NarratorResult, NarratorStreamEvent } from "../narrator-provider.js";
import type { GenerationRequest } from "../types.js";
import { OpenRouterClient } from "./client.js";
/**
 * Runtime Continuity Repair 1 production default (after the Long-Form Narrator Trial 1). Override with OPENROUTER_NARRATOR_MODEL
 * or NarratorConfig.model; overrides remain for evaluation and manual use.
 */
export const DEFAULT_NARRATOR_MODEL = "z-ai/glm-5.2";
/** Phase 1M.1–Repair 1.2 default; still supported through configuration. */
export const KIMI_NARRATOR_MODEL = "moonshotai/kimi-k2.5";
/** Evaluation/manual alternative (Vertex-pinned). Never an automatic fallback. */
export const GEMINI_NARRATOR_MODEL = "google/gemini-3.8-flash";
/** Previous default; still supported through configuration. */
export const MINIMAX_NARRATOR_MODEL = "minimax/minimax-m2-her";
/** OpenRouter provider routing. With allow_fallbacks false a provider outage fails visibly instead of switching narrator. */
export interface ProviderRouting { readonly order: readonly string[]; readonly allow_fallbacks: false }
/** Pinned providers per narrator model; models absent here keep OpenRouter's default routing (Kimi, MiniMax, others). */
export const NARRATOR_PROVIDER_ROUTING: Readonly<Record<string, ProviderRouting>> = Object.freeze({
  [DEFAULT_NARRATOR_MODEL]: Object.freeze({ order: Object.freeze(["z-ai/fp8"]), allow_fallbacks: false as const }),
  [GEMINI_NARRATOR_MODEL]: Object.freeze({ order: Object.freeze(["google-vertex/global"]), allow_fallbacks: false as const }),
});
export interface NarratorConfig {
  readonly model?: string; readonly timeout_ms?: number; readonly max_output_tokens?: number;
  readonly output_ceiling?: number;
  /**
   * Narration never uses hidden reasoning: on hybrid models (Kimi, Qwen) it consumes the output budget and delays first token.
   * Defaults to true, sending reasoning: {enabled: false}; models without reasoning ignore the field (no require_parameters). Set false only for evaluation.
   */
  readonly disable_reasoning?: boolean;
  /** Provider routing; defaults to NARRATOR_PROVIDER_ROUTING for the model. null sends no routing (evaluation harnesses pin their own). */
  readonly provider?: ProviderRouting | null;
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
      const model = this.config.model ?? DEFAULT_NARRATOR_MODEL;
      const provider = this.config.provider === undefined ? NARRATOR_PROVIDER_ROUTING[model] : this.config.provider;
      for await (const event of this.client.request({ model,
        messages: [{ role: "system", content: request.system_prompt }, ...(this.config.roleplay_context ?? []), ...request.messages], max_tokens,
        ...(this.config.disable_reasoning ?? true ? { reasoning: { enabled: false } } : {}),
        ...(provider ? { provider: { order: [...provider.order], allow_fallbacks: provider.allow_fallbacks } } : {}),
      }, true, Math.min(this.config.timeout_ms ?? 60_000, request.timeout_ms ?? Infinity), request.signal)) {
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
