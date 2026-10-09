export type ProviderErrorCode = "configuration_error" | "authentication_error" | "rate_limited" | "timeout" | "cancelled" | "provider_unavailable" | "invalid_provider_response" | "structured_output_invalid" | "network_error" | "model_refusal";
/**
 * Repair 1.2 debug-only evidence for a controller output that failed strict parsing: the model's own output text and generation
 * metadata. Never HTTP bodies, headers, request objects or credentials; never part of any player-facing event or message.
 */
export interface ControllerParseDiagnostic {
  readonly raw_text: string; readonly model: string; readonly response_model?: string; readonly finish_reason: "stop"; readonly usage: import("./types.js").Usage;
  readonly expected_schema: string; readonly parse_error: string;
  /** Controller Reliability Pass 1: the normalization attempt and the strict parse that followed. */
  readonly normalization?: import("./controller-schema.js").ControllerNormalization & { readonly final_parse: string };
}
/** Never retain raw errors, bodies, headers, request objects, or credentials (the optional controller diagnostic above excepted). */
export type ProviderFailureClass = "transport_error" | "timeout" | "http_retryable" | "http_nonretryable" | "invalid_provider_response" | "finish_reason_length" | "empty_output" | "malformed_envelope" | "schema_invalid" | "parser_failure" | "stale_revision" | "reconciliation_failure";
/**
 * Safe OpenRouter error classification (HTTP error or in-band error object). Whitelisted short identifiers only: never the error
 * message, the provider's raw text, the response body, headers other than Retry-After / X-Generation-Id, prompts or credentials.
 */
export interface ProviderHttpDiagnostic {
  readonly status: number;
  /** OpenRouter metadata.error_type, e.g. a canonical rate-limit type. */
  readonly error_type?: string;
  /** Upstream provider that failed (metadata.provider_name), e.g. "Alibaba". */
  readonly provider_name?: string;
  /** Which budget was exhausted (metadata.limit_source), e.g. "upstream_provider_shared_pool". */
  readonly limit_source?: string;
  readonly provider_code?: string;
  readonly is_byok?: boolean;
  readonly retry_after_s?: number;
  readonly generation_id?: string;
  /** The model slugs requested (primary first); never anything else from the request. */
  readonly requested_models: readonly string[];
}
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, readonly latency?: import("./types.js").Latency, readonly diagnostic?: ControllerParseDiagnostic, readonly failure_class?: ProviderFailureClass, readonly http?: ProviderHttpDiagnostic) { super(`Generation failed: ${code}`); this.name = "ProviderError"; }
}
export function providerError(error: unknown): ProviderError { return error instanceof ProviderError ? error : new ProviderError("network_error"); }
export function normalizeProviderFailure(error:ProviderError):ProviderFailureClass {
 if(error.failure_class)return error.failure_class;
 switch(error.code){case"network_error":return"transport_error";case"timeout":return"timeout";case"rate_limited":case"provider_unavailable":return"http_retryable";case"authentication_error":case"configuration_error":case"model_refusal":case"cancelled":return"http_nonretryable";case"structured_output_invalid":return"schema_invalid";default:return"invalid_provider_response";}
}
