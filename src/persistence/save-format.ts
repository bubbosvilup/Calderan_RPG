import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { dataSchema, freezeSnapshot, validateId } from "../campaign/validation.js";
import { DatasetCompatibilityError, requireCurrentSnapshotVersion, validateCampaignSnapshot } from "../campaign/snapshot-validation.js";
import { CampaignSaveError, saveError } from "./errors.js";
import { MAX_SAVE_BYTES, parseSaveJson } from "./strict-json.js";
import { migrateSave } from "./save-migrations.js";
import { canonReferences, checkCanonReferences, type CanonReference } from "./canon-compatibility.js";
import { parseCampaignSnapshot } from "../campaign/validation.js";

export interface CampaignSaveFile {
  format: "caldrevan_campaign_save"; schema_version: 3;
  campaign_id: string; canonical_dataset_id: string;
  metadata: { saved_at: string; created_at?: string; engine_version?: string };
  snapshot: CampaignSnapshot;
  canon_compatibility: "strict" | "references";
  canon_references?: readonly CanonReference[];
}
/** Legacy shapes accepted by the migration dispatcher (their snapshots are schema 1, without premium_characters). */
export type CampaignSaveFileV1 = Omit<CampaignSaveFile, "schema_version" | "canon_compatibility" | "canon_references" | "snapshot"> & { schema_version: 1; snapshot: unknown };
export type CampaignSaveFileV2 = Omit<CampaignSaveFile, "schema_version" | "snapshot"> & { schema_version: 2; snapshot: unknown };
/** Lowercase snake_case plus Windows device-name exclusion; no user filenames. */
export function validateSaveId(input: unknown): string {
  let id: string; try { id = validateId(input, "campaign_id"); } catch { throw new CampaignSaveError("invalid_id"); }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id)) throw new CampaignSaveError("invalid_id");
  return id;
}
const { object, text, integer, optional, choice, list } = dataSchema;
const reference = object({ id: text, fingerprint: text });
const referenceList = list(reference, 16_384);
const timestamp = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new CampaignSaveError("invalid_save");
  return value;
};
/** Shape first; snapshot validation has its own schema/version/reference boundary. */
const envelope = object({ format: choice("caldrevan_campaign_save"), schema_version: integer(3, 3), campaign_id: validateSaveId,
  canonical_dataset_id: text, metadata: object({ saved_at: timestamp, created_at: optional(timestamp), engine_version: optional(text) }), snapshot: (input: unknown) => input,
  canon_compatibility: choice("strict", "references"), canon_references: optional(referenceList) });
export function validateSaveFile(input: unknown, world: WorldStore, expectedCampaignId?: string): DeepReadonly<CampaignSaveFile> {
  try {
    const migrated = migrateSave(input);
    const file = envelope(migrated, "save") as CampaignSaveFile;
    if (!/^sha256:[a-f0-9]{64}$/.test(file.canonical_dataset_id)) throw new CampaignSaveError("invalid_save");
    if (expectedCampaignId !== undefined && file.campaign_id !== expectedCampaignId) throw new CampaignSaveError("invalid_save");
    requireCurrentSnapshotVersion(file.snapshot);
    const parsed = parseCampaignSnapshot(file.snapshot);
    if (parsed.campaign_id !== file.campaign_id || parsed.dataset_id !== file.canonical_dataset_id) throw new CampaignSaveError("invalid_save");
    if (file.canon_compatibility === "references") {
      if (!file.canon_references) throw new CampaignSaveError("invalid_save");
      checkCanonReferences(file.canon_references, parsed, world);
    } else {
      if (file.canon_references) throw new CampaignSaveError("invalid_save");
      if (file.canonical_dataset_id !== world.datasetId) throw new DatasetCompatibilityError(file.canonical_dataset_id, world.datasetId);
    }
    // Reference checks are never bypassed. Rebind detached runtime identity only after compatibility succeeds.
    const snapshot = validateCampaignSnapshot({ ...parsed, dataset_id: world.datasetId }, world);
    return freezeSnapshot({ ...file, canonical_dataset_id: world.datasetId, snapshot }) as DeepReadonly<CampaignSaveFile>;
  } catch (error) { throw saveError(error); }
}
export function decodeSave(text: string, world: WorldStore, expectedCampaignId?: string): DeepReadonly<CampaignSaveFile> {
  return validateSaveFile(parseSaveJson(text), world, expectedCampaignId);
}
export function createSaveFile(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, savedAt: string, createdAt = savedAt): DeepReadonly<CampaignSaveFile> {
  // A write may never manufacture compatibility evidence for a campaign bound to another world.
  try { validateCampaignSnapshot(snapshot, world); } catch (error) { throw saveError(error); }
  return validateSaveFile({ format: "caldrevan_campaign_save", schema_version: 3, campaign_id: snapshot.campaign_id,
    canonical_dataset_id: snapshot.dataset_id, metadata: { saved_at: savedAt, created_at: createdAt }, snapshot, canon_compatibility: "references", canon_references: canonReferences(snapshot, world) }, world);
}
/** Called only after validation; sorts object keys, preserves all array order and missing fields. */
export function serializeSave(file: DeepReadonly<CampaignSaveFile>, world: WorldStore): string {
  const valid = validateSaveFile(file, world);
  const json = JSON.stringify(valid, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value, 2) + "\n";
  if (Buffer.byteLength(json, "utf8") > MAX_SAVE_BYTES) throw new CampaignSaveError("invalid_save");
  return json;
}
