import { ApiError, isRecord, requestJson } from "./client";
import type { NarratorAlternativeDto } from "./types";

/** The provider failure classes the server names for a failed comparison (shown as-is; nothing else from the response is rendered). */
const FAILURE_CODES = ["configuration_error", "authentication_error", "rate_limited", "timeout", "cancelled", "provider_unavailable", "invalid_provider_response", "network_error", "model_refusal"];

/**
 * Asks for a narration of one past turn by another model, for comparison only. This may call a paid provider, so it runs only from an
 * explicit choice in the transcript. The result is shown next to the message and stored nowhere: the story, the campaign and its revision
 * are untouched.
 */
export async function requestAlternative(request: { readonly messageId: string; readonly model: string }): Promise<readonly NarratorAlternativeDto[]> {
  try {
    const body = await requestJson<{ readonly alternatives?: readonly NarratorAlternativeDto[] }>("/alternative", { method: "POST", body: { message_id: request.messageId, model: request.model } });
    return body.alternatives ?? [];
  } catch (error) {
    const code = error instanceof ApiError && isRecord(error.body) && typeof error.body.failure_code === "string" ? error.body.failure_code : null;
    throw new ApiError(error instanceof ApiError ? error.kind : "unknown", `Alternative failed${code && FAILURE_CODES.includes(code) ? ` (${code})` : ""}. Choose the model again to retry.`);
  }
}
