import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { dataSchema, freezeSnapshot, validateId } from "../campaign/validation.js";
import { DatasetCompatibilityError, requireVersionOne, validateCampaignSnapshot } from "../campaign/snapshot-validation.js";
import { CampaignSaveError, saveError } from "./errors.js";
import { MAX_SAVE_BYTES, parseSaveJson } from "./strict-json.js";

export interface CampaignSaveFileV1 {
  format: "caldrevan_campaign_save"; schema_version: 1;
  campaign_id: string; canonical_dataset_id: string;
  metadata: { saved_at: string; created_at?: string; engine_version?: string };
  snapshot: CampaignSnapshot;
}
/** Lowercase snake_case plus Windows device-name exclusion; no user filenames. */
export function validateSaveId(input: unknown): string {
  let id: string; try { id = validateId(input, "campaign_id"); } catch { throw new CampaignSaveError("invalid_id"); }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id)) throw new CampaignSaveError("invalid_id");
  return id;
}
const { object, text, integer, optional, choice } = dataSchema;
const timestamp = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new CampaignSaveError("invalid_save");
  return value;
};
/** Shape first; snapshot validation has its own schema/version/reference boundary. */
const envelope = object({ format: choice("caldrevan_campaign_save"), schema_version: integer(1, 1), campaign_id: validateSaveId,
  canonical_dataset_id: text, metadata: object({ saved_at: timestamp, created_at: optional(timestamp), engine_version: optional(text) }), snapshot: (input: unknown) => input });
export function validateSaveFile(input: unknown, world: WorldStore, expectedCampaignId?: string): DeepReadonly<CampaignSaveFileV1> {
  try {
    requireVersionOne(input);
    const file = envelope(input, "save") as CampaignSaveFileV1;
    if (!/^sha256:[a-f0-9]{64}$/.test(file.canonical_dataset_id)) throw new CampaignSaveError("invalid_save");
    if (expectedCampaignId !== undefined && file.campaign_id !== expectedCampaignId) throw new CampaignSaveError("invalid_save");
    if (file.canonical_dataset_id !== world.datasetId) throw new DatasetCompatibilityError(file.canonical_dataset_id, world.datasetId);
    const snapshot = validateCampaignSnapshot(file.snapshot, world);
    if (snapshot.campaign_id !== file.campaign_id || snapshot.dataset_id !== file.canonical_dataset_id) throw new CampaignSaveError("invalid_save");
    return freezeSnapshot({ ...file, snapshot }) as DeepReadonly<CampaignSaveFileV1>;
  } catch (error) { throw saveError(error); }
}
export function decodeSave(text: string, world: WorldStore, expectedCampaignId?: string): DeepReadonly<CampaignSaveFileV1> {
  return validateSaveFile(parseSaveJson(text), world, expectedCampaignId);
}
export function createSaveFile(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, savedAt: string, createdAt = savedAt): DeepReadonly<CampaignSaveFileV1> {
  return validateSaveFile({ format: "caldrevan_campaign_save", schema_version: 1, campaign_id: snapshot.campaign_id,
    canonical_dataset_id: snapshot.dataset_id, metadata: { saved_at: savedAt, created_at: createdAt }, snapshot }, world);
}
/** Called only after validation; sorts object keys, preserves all array order and missing fields. */
export function serializeSave(file: DeepReadonly<CampaignSaveFileV1>, world: WorldStore): string {
  const valid = validateSaveFile(file, world);
  const json = JSON.stringify(valid, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value, 2) + "\n";
  if (Buffer.byteLength(json, "utf8") > MAX_SAVE_BYTES) throw new CampaignSaveError("invalid_save");
  return json;
}
