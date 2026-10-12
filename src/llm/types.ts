export interface Message { readonly role: "system" | "user" | "assistant"; readonly content: string }
export interface Usage { readonly prompt_tokens?: number; readonly completion_tokens?: number; readonly total_tokens?: number }
export interface Latency {
  readonly request_started_at: string;
  readonly headers_ms: number | null;
  readonly time_to_first_token_ms: number | null;
  readonly completed_at: string;
  readonly elapsed_total_ms: number;
}
/**
 * `model` is the REQUESTED (primary) model. `response_model` is the model OpenRouter reports in the response body, which differs
 * when a `models` fallback answered. `generation_id` is OpenRouter's gen-… id (body `id` or X-Generation-Id), safe to log.
 */
/** Why the provider stopped generating. `stop` is the only complete result; `length` is a truncation. Anything else never reaches a caller as a result. */
export type FinishReason = "stop" | "length";
export interface GenerationMetadata { readonly model: string; readonly response_model?: string; readonly generation_id?: string; readonly provider?: string; readonly usage: Usage; readonly latency: Latency; readonly cost_usd?: number;
  /** Block 4: the provider's completion signal for this physical attempt. Absent only for providers that do not expose one (test doubles). */
  readonly finish_reason?: FinishReason;
  /** Block 4: the output-token cap this physical attempt was sent with, and the configured provider route (order) when one is pinned. */
  readonly max_output_tokens?: number; readonly route?: string }
export interface GenerationRequest {
  readonly system_prompt: string;
  readonly messages: readonly Message[];
  readonly max_output_tokens?: number;
  readonly signal?: AbortSignal;
  /** H5: per-attempt upper bound; providers use the smaller of this and their configured timeout. */
  readonly timeout_ms?: number;
  /**
   * Block 4: a `length` termination is returned as a completed result carrying `finish_reason: "length"` (the turn layer decides: it is never
   * delivered) instead of failing as a generic provider error. Default false: every other caller keeps the strict behavior.
   */
  readonly accept_truncated?: boolean;
}

/** Already-filtered prompt envelope, shared without depending on turn execution stages. */
export type NarratorRequest = Pick<GenerationRequest, "system_prompt" | "messages">;
