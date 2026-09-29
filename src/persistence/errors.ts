import { DatasetCompatibilityError, SnapshotValidationError } from "../campaign/snapshot-validation.js";
import { CampaignValidationError } from "../campaign/validation.js";

export type SaveErrorCode = "not_found" | "invalid_json" | "invalid_save" | "unsupported_version" | "dataset_mismatch" | "reference_invalid" | "invalid_id" | "unsafe_path" | "save_in_progress" | "io_error";
export class CampaignSaveError extends Error {
  constructor(readonly code: SaveErrorCode, readonly details?: Readonly<{ save_dataset_id: string; current_dataset_id: string }>) {
    super(`Campaign persistence: ${code}`); this.name = "CampaignSaveError";
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
