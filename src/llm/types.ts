export interface Message { readonly role: "system" | "user" | "assistant"; readonly content: string }
export interface Usage { readonly prompt_tokens?: number; readonly completion_tokens?: number; readonly total_tokens?: number }
export interface Latency {
  readonly request_started_at: string;
  readonly headers_ms: number | null;
  readonly time_to_first_token_ms: number | null;
  readonly completed_at: string;
  readonly elapsed_total_ms: number;
}
export interface GenerationMetadata { readonly model: string; readonly provider?: string; readonly usage: Usage; readonly latency: Latency; readonly cost_usd?: number }
export interface GenerationRequest {
  readonly system_prompt: string;
  readonly messages: readonly Message[];
  readonly max_output_tokens?: number;
  readonly signal?: AbortSignal;
  /** H5: per-attempt upper bound; providers use the smaller of this and their configured timeout. */
  readonly timeout_ms?: number;
}

/** Already-filtered prompt envelope, shared without depending on turn execution stages. */
export type NarratorRequest = Pick<GenerationRequest, "system_prompt" | "messages">;
