export type ProviderErrorCode = "configuration_error" | "authentication_error" | "rate_limited" | "timeout" | "cancelled" | "provider_unavailable" | "invalid_provider_response" | "structured_output_invalid" | "network_error" | "model_refusal";
/**
 * Repair 1.2 debug-only evidence for a controller output that failed strict parsing: the model's own output text and generation
 * metadata. Never HTTP bodies, headers, request objects or credentials; never part of any player-facing event or message.
 */
export interface ControllerParseDiagnostic {
  readonly raw_text: string; readonly model: string; readonly finish_reason: "stop"; readonly usage: import("./types.js").Usage;
  readonly expected_schema: string; readonly parse_error: string;
  /** Controller Reliability Pass 1: the normalization attempt and the strict parse that followed. */
  readonly normalization?: import("./controller-schema.js").ControllerNormalization & { readonly final_parse: string };
}
/** Never retain raw errors, bodies, headers, request objects, or credentials (the optional controller diagnostic above excepted). */
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, readonly latency?: import("./types.js").Latency, readonly diagnostic?: ControllerParseDiagnostic) { super(`Generation failed: ${code}`); this.name = "ProviderError"; }
}
export function providerError(error: unknown): ProviderError { return error instanceof ProviderError ? error : new ProviderError("network_error"); }
