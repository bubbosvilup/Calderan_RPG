import { DatasetCompatibilityError, SnapshotValidationError } from "../campaign/snapshot-validation.js";
import { CampaignValidationError } from "../campaign/validation.js";

export type SaveErrorCode = "not_found" | "invalid_json" | "invalid_save" | "unsupported_version" | "migration_failed" | "dataset_mismatch" | "reference_invalid" | "invalid_id" | "unsafe_path" | "save_in_progress" | "io_error";
const recoveryHints: Record<SaveErrorCode, string> = {
  not_found: "Inspect available saves and select an existing slot.",
  invalid_json: "Inspect both slots; explicitly load a valid previous slot. Preserve the corrupt file before replacing it.",
  invalid_save: "Inspect both slots; explicitly load a valid previous slot or retain the file for schema repair.",
  unsupported_version: "Use an engine supporting this save version, or explicitly select a supported previous slot.",
  migration_failed: "Preserve the original save and use an engine with a valid migration, or explicitly select a valid previous slot.",
  dataset_mismatch: "Use compatible authored canon, or explicitly select a compatible previous slot.",
  reference_invalid: "Restore the required authored references, or explicitly select a valid previous slot.",
  invalid_id: "Use a bounded lowercase campaign ID without path separators or reserved device names.",
  unsafe_path: "Use a save directory without links, junctions or hard-linked save files, outside authored data.",
  save_in_progress: "Wait for the current explicit save to finish before saving again.",
  io_error: "Inspect disk permissions and both slots before retrying; a complete replacement may already be visible.",
};
export class CampaignSaveError extends Error {
  readonly recovery_hint: string;
  constructor(readonly code: SaveErrorCode, readonly details?: Readonly<{ save_dataset_id: string; current_dataset_id: string }>) {
    super(`Campaign persistence: ${code}. ${recoveryHints[code]}`); this.name = "CampaignSaveError"; this.recovery_hint = recoveryHints[code];
  }
}
export function saveError(error: unknown): CampaignSaveError {
  if (error instanceof CampaignSaveError) return error;
  if (error instanceof DatasetCompatibilityError) return new CampaignSaveError("dataset_mismatch", Object.freeze({ save_dataset_id: error.save_dataset_id, current_dataset_id: error.current_dataset_id }));
  if (error instanceof SnapshotValidationError) return new CampaignSaveError(error.code);
  if (error instanceof CampaignValidationError) return new CampaignSaveError("invalid_save");
  return new CampaignSaveError("io_error");
}
export const nodeCode = (error: unknown): string | undefined => error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
