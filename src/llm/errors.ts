export type ProviderErrorCode = "configuration_error" | "authentication_error" | "rate_limited" | "timeout" | "cancelled" | "provider_unavailable" | "invalid_provider_response" | "structured_output_invalid" | "network_error" | "model_refusal";
/** Never retain raw errors, bodies, headers, request objects, or credentials. */
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, readonly latency?: import("./types.js").Latency) { super(`Generation failed: ${code}`); this.name = "ProviderError"; }
}
export function providerError(error: unknown): ProviderError { return error instanceof ProviderError ? error : new ProviderError("network_error"); }
