import type { ProviderErrorCode } from "../llm/errors.js";
import type { SaveErrorCode } from "../persistence/errors.js";
import { CampaignSaveError } from "../persistence/errors.js";
import type { TurnFailure } from "../turn/turn-types.js";

/**
 * The application error vocabulary is the union of the two taxonomies the engine already owns (TurnFailure, SaveErrorCode) plus
 * three session-level codes. It is a descriptor over those codes, not a new taxonomy.
 */
export type AppErrorCode = TurnFailure | SaveErrorCode | "session_closed" | "unsaved_changes" | "internal_error" | "portrait_generation_failed";
export interface AppError {
  readonly code: AppErrorCode;
  /** Present when the code is narrator_failed / controller_failed and the provider reported why. */
  readonly provider_code?: ProviderErrorCode;
  /** Short, player-safe sentence. Never a stack trace and never provider payload text. */
  readonly message: string;
  /** Resubmitting the same input (or repeating the operation) can plausibly succeed without changing anything. */
  readonly retryable: boolean;
  /** The authoritative campaign revision changed because of the failed operation. For turns this is always false before the commit. */
  readonly turn_state_changed: boolean;
}
const MESSAGES: Record<AppErrorCode, string> = {
  invalid_input: "That input cannot be used as a player action.",
  context_invalid: "The scene could not be assembled. The turn did not happen.",
  context_too_large: "The scene holds too much to narrate in one turn. The turn did not happen and the campaign is unchanged.",
  retrieval_failed: "Background lookup failed. The turn did not happen.",
  invalid_runtime_intent: "That movement or time command is not possible right now.",
  stale_turn: "The campaign changed while the turn was running. The turn was discarded.",
  turn_in_progress: "A turn is already running. Wait for it to finish.",
  cancelled: "The turn was cancelled. The campaign is unchanged.",
  narrator_failed: "The narrator could not answer. The turn did not happen.",
  controller_failed: "The state controller could not answer. The turn did not happen.",
  campaign_validation_failed: "The turn produced changes that were refused. The campaign is unchanged.",
  not_found: "No such save exists.", invalid_json: "The save file is damaged.", invalid_save: "The save file is invalid.",
  unsupported_version: "The save was written by a different engine version.", migration_failed: "The save could not be upgraded.",
  dataset_mismatch: "The save belongs to a different version of the world data and was not loaded.", reference_invalid: "The save refers to world data that no longer exists.",
  invalid_id: "That campaign name is not allowed.", unsafe_path: "The save location is not safe to use.", save_in_progress: "A save is already running.",
  io_error: "The save could not be read or written.", campaign_locked: "Another running game has this campaign open.",
  portrait_generation_failed: "The portrait could not be generated. Nothing was saved and the current portrait is unchanged.",
  session_closed: "The session is closed.", unsaved_changes: "There are unsaved changes.", internal_error: "Something went wrong inside the game. The campaign was not changed by this action.",
};
/** Errors a user can only fix by changing configuration or input are not worth an automatic retry. */
const NEVER_RETRY = new Set<AppErrorCode>(["invalid_input", "context_too_large", "context_invalid", "invalid_runtime_intent", "campaign_validation_failed", "session_closed", "unsaved_changes",
  "not_found", "invalid_json", "invalid_save", "unsupported_version", "migration_failed", "dataset_mismatch", "reference_invalid", "invalid_id", "unsafe_path"]);
export function appError(code: AppErrorCode, extra: { provider_code?: ProviderErrorCode | undefined; turn_state_changed?: boolean | undefined; message?: string | undefined } = {}): AppError {
  const provider = extra.provider_code;
  const retryable = !NEVER_RETRY.has(code) && !(provider && (provider === "configuration_error" || provider === "authentication_error"));
  const detail = provider === "configuration_error" ? " The provider is not configured." : provider === "authentication_error" ? " The provider rejected the credentials." : provider === "rate_limited" ? " The provider is rate limiting requests." : provider === "timeout" ? " The provider timed out." : "";
  return Object.freeze({ code, ...(provider ? { provider_code: provider } : {}), message: extra.message ?? `${MESSAGES[code]}${detail}`, retryable, turn_state_changed: extra.turn_state_changed ?? false });
}
/** Maps anything thrown at the application boundary. Raw exception text is never copied into the result. */
export function toAppError(error: unknown): AppError {
  return error instanceof CampaignSaveError ? appError(error.code) : appError("internal_error");
}
