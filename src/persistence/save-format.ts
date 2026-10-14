import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { dataSchema, freezeSnapshot, validateId } from "../campaign/validation.js";
import { requireCurrentSnapshotVersion, validateCampaignSnapshot, SnapshotValidationError } from "../campaign/snapshot-validation.js";
import { extractOptionalState, fromPersistedSnapshot, toPersistedSnapshot, type OptionalSides, type OptionalStateMigrated, type OptionalStoreName } from "../campaign/optional-state.js";
import { OPTIONAL_STORE_VERSIONS } from "./optional-store.js";
import { CampaignSaveError, saveError } from "./errors.js";
import { MAX_SAVE_BYTES, parseSaveJson } from "./strict-json.js";
import { migrateSave, migrateSnapshot4to5, migrateSnapshot5to6, migrateSnapshot6to7, CURRENT_SAVE_VERSION } from "./save-migrations.js";
import { defaultPlayerCharacters } from "../campaign/player-character.js";
import { assessCanonCompatibility, canonReferences, type CanonCompatibilityReport, type CanonReference } from "./canon-compatibility.js";
import { parseCampaignSnapshot } from "../campaign/validation.js";
import { parseTurnReceipts, type TurnReceipt, type TurnReceiptBlock } from "./turn-receipts.js";
import { parseInteractionMetadata, type InteractionMetadataBlock } from "./pending-confirmations.js";

/** Why a save was written (format 5). `create` is the immediate first save of a new campaign. */
export type SaveReason = "create" | "manual" | "autosave" | "quit";
export interface SaveMetadata {
  saved_at: string; created_at?: string; engine_version?: string;
  /** Format 5: user-facing campaign name; independent of the campaign ID, editable later. */
  display_name?: string;
  save_reason?: SaveReason;
  /** Format 5: the starting scenario the campaign was created from (e.g. caldrevan.slave_market.v1). */
  scenario_id?: string;
}
/**
 * Format 5 continuity: the bounded recent conversation window (≤ 12 finalized exchanges), NON-AUTHORITATIVE. It only restores the
 * narrator/controller conversational context after a load; it is never replayed, never parsed into state and never validated against
 * canon. An invalid continuity block is dropped at load (with a report note) and never makes a save unloadable.
 */
export interface ContinuityExchange { player: string; narration: string; location_id?: string; conversation_partner_id?: string }
export interface SaveContinuity { authority: "non_authoritative"; revision: number; recent: ContinuityExchange[] }
export const CONTINUITY_LIMITS = Object.freeze({ exchanges: 12, text: 8000, total: 20_000 });
/**
 * Consolidation block 7 (schema 8): the explicit migration marker of one optional side store. Present = the store is AUTHORITATIVE for its domain and the
 * snapshot no longer carries that domain. Never inferred from the existence of the store file, from a revision or from a timestamp.
 */
export interface OptionalStoreMarker { readonly version: number; readonly completed: true }
export type OptionalStateMarkers = { readonly [K in OptionalStoreName]?: OptionalStoreMarker };
export interface CampaignSaveFile {
  format: "caldrevan_campaign_save"; schema_version: 8;
  campaign_id: string; canonical_dataset_id: string;
  metadata: SaveMetadata;
  snapshot: CampaignSnapshot;
  canon_compatibility: "strict" | "references";
  canon_references?: readonly CanonReference[];
  continuity?: SaveContinuity;
  /** Block 4 (REV-2): bounded terminal turn receipts (idempotency metadata), written atomically with the snapshot they belong to. Not campaign truth. */
  turn_receipts?: TurnReceiptBlock;
  /** Block 5A (schema 6): pending player confirmations (interaction metadata), written atomically with the snapshot they belong to. Not campaign truth. */
  interaction_metadata?: InteractionMetadataBlock;
  /** Block 7: which optional side stores are authoritative for this save (written atomically with the snapshot). Absent = nothing migrated, the snapshot owns it all. */
  optional_state?: OptionalStateMarkers;
}
/** Legacy shapes accepted by the migration dispatcher (their snapshots are schema 1, without premium_characters). */
export type CampaignSaveFileV1 = Omit<CampaignSaveFile, "schema_version" | "canon_compatibility" | "canon_references" | "snapshot"> & { schema_version: 1; snapshot: unknown };
export type CampaignSaveFileV2 = Omit<CampaignSaveFile, "schema_version" | "snapshot"> & { schema_version: 2; snapshot: unknown };
/** What a load learned besides the state: the source version and the canon compatibility classification. */
export interface DecodedSave { readonly file: DeepReadonly<CampaignSaveFile>; readonly optional_state: { readonly migrated: OptionalStateMigrated; readonly bound_revision: { readonly learning?: number; readonly media?: number } }; readonly migrated_from?: number; readonly snapshot_migrated_from?: number; readonly canon: CanonCompatibilityReport; readonly continuity_dropped: boolean }
/** Lowercase snake_case plus Windows device-name exclusion; no user filenames. */
export function validateSaveId(input: unknown): string {
  let id: string; try { id = validateId(input, "campaign_id"); } catch { throw new CampaignSaveError("invalid_id"); }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id)) throw new CampaignSaveError("invalid_id");
  return id;
}
const { object, text, integer, optional, choice, list } = dataSchema;
const reference = object({ id: text, fingerprint: text, kind: optional(text) });
const referenceList = list(reference, 16_384);
const timestamp = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new CampaignSaveError("invalid_save");
  return value;
};
const bounded = (re: RegExp) => (value: unknown): string => { if (typeof value !== "string" || !re.test(value)) throw new CampaignSaveError("invalid_save"); return value; };
const displayName = (value: unknown): string => {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new CampaignSaveError("invalid_save");
  return value;
};
export const SCENARIO_ID = /^[a-z][a-z0-9_]{0,40}(?:\.[a-z0-9_]{1,40}){0,4}$/;
/** Shape first; snapshot validation has its own schema/version/reference boundary. Continuity is checked separately (tolerant). */
const envelope = object({ format: choice("caldrevan_campaign_save"), schema_version: integer(8, 8), campaign_id: validateSaveId,
  canonical_dataset_id: text, metadata: object({ saved_at: timestamp, created_at: optional(timestamp), engine_version: optional(bounded(/^[0-9A-Za-z.+_-]{1,40}$/)),
    display_name: optional(displayName), save_reason: optional(choice("create", "manual", "autosave", "quit")), scenario_id: optional(bounded(SCENARIO_ID)) }),
  snapshot: (input: unknown) => input, canon_compatibility: choice("strict", "references"), canon_references: optional(referenceList), continuity: optional((input: unknown) => input), turn_receipts: optional((input: unknown) => input), interaction_metadata: optional((input: unknown) => input), optional_state: optional((input: unknown) => input) });
/** Structural check of a continuity block; undefined when absent or unusable (the caller reports the drop). */
export function parseContinuity(input: unknown): SaveContinuity | undefined {
  if (input === undefined) return undefined;
  try {
    const c = input as Record<string, unknown>;
    if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).some(k => !["authority", "revision", "recent"].includes(k)) || c.authority !== "non_authoritative"
      || !Number.isSafeInteger(c.revision) || (c.revision as number) < 0 || !Array.isArray(c.recent) || c.recent.length > CONTINUITY_LIMITS.exchanges) return undefined;
    const recent: ContinuityExchange[] = [];
    for (const e of c.recent as unknown[]) {
      const x = e as Record<string, unknown>;
      if (!x || typeof x !== "object" || Array.isArray(x) || Object.keys(x).some(k => !["player", "narration", "location_id", "conversation_partner_id"].includes(k))) return undefined;
      if (typeof x.player !== "string" || typeof x.narration !== "string" || x.player.length > CONTINUITY_LIMITS.text || x.narration.length > CONTINUITY_LIMITS.text) return undefined;
      for (const key of ["location_id", "conversation_partner_id"] as const) if (x[key] !== undefined) { try { validateId(x[key], key); } catch { return undefined; } }
      recent.push({ player: x.player, narration: x.narration, ...(x.location_id ? { location_id: x.location_id as string } : {}), ...(x.conversation_partner_id ? { conversation_partner_id: x.conversation_partner_id as string } : {}) });
    }
    if (JSON.stringify(recent).length > CONTINUITY_LIMITS.total) return undefined;
    return { authority: "non_authoritative", revision: c.revision as number, recent };
  } catch { return undefined; }
}
const MARKER_STORES: readonly OptionalStoreName[] = ["learning", "media"];
/** Structural check of the migration markers. A marker from a newer build is `unsupported_version`; anything else malformed is `invalid_save`. */
export function parseOptionalMarkers(input: unknown): OptionalStateMarkers | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !(MARKER_STORES as readonly string[]).includes(k))) throw new CampaignSaveError("invalid_save");
  const out: { -readonly [K in OptionalStoreName]?: OptionalStoreMarker } = {};
  for (const store of MARKER_STORES) {
    const marker = (input as Record<string, unknown>)[store];
    if (marker === undefined) continue;
    if (!marker || typeof marker !== "object" || Array.isArray(marker) || Object.keys(marker).length !== 2 || (marker as Record<string, unknown>).completed !== true || !Number.isSafeInteger((marker as Record<string, unknown>).version) || ((marker as { version: number }).version) < 1) throw new CampaignSaveError("invalid_save");
    const version = (marker as { version: number }).version;
    if (version > OPTIONAL_STORE_VERSIONS[store]) throw new CampaignSaveError("unsupported_version");
    if (version !== OPTIONAL_STORE_VERSIONS[store]) throw new CampaignSaveError("invalid_save");
    out[store] = { version, completed: true };
  }
  return Object.keys(out).length ? out : undefined;
}
/** Which side stores a save says are authoritative, read from the raw text WITHOUT validating the rest (the repository then loads exactly those stores). */
export function peekOptionalMarkers(text: string): OptionalStateMarkers | undefined {
  const raw = parseSaveJson(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CampaignSaveError("invalid_save");
  const version = (raw as { schema_version?: unknown }).schema_version;
  if (typeof version === "number" && version > 8) throw new CampaignSaveError("unsupported_version");
  return version === 8 ? parseOptionalMarkers((raw as { optional_state?: unknown }).optional_state) : undefined;
}
export const migratedStores = (markers: OptionalStateMarkers | undefined): OptionalStateMigrated => ({ learning: !!markers?.learning, media: !!markers?.media });
/** The optional state of a composed snapshot, as the sides a decode of its persisted form needs. */
export function sidesOf(snapshot: DeepReadonly<CampaignSnapshot>): OptionalSides {
  const { learning, media } = extractOptionalState(snapshot);
  return { learning, media, learning_bound_revision: snapshot.revision, media_bound_revision: snapshot.revision };
}
function sourceVersion(input: unknown): number | undefined {
  const d = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "schema_version") : undefined;
  return d && "value" in d && Number.isSafeInteger(d.value) ? d.value as number : undefined;
}
/** Full decode with the canon compatibility report (Save/Load v1). Never mutates input or disk. */
export interface DecodeOptions { readonly sides?: OptionalSides; readonly core_only?: boolean }
export function validateSaveFileWithReport(input: unknown, world: WorldStore, expectedCampaignId?: string, options: DecodeOptions = {}): DecodedSave {
  try {
    const from = sourceVersion(input);
    const migrated = migrateSave(input);
    const file = envelope(migrated, "save") as CampaignSaveFile;
    if (!/^sha256:[a-f0-9]{64}$/.test(file.canonical_dataset_id)) throw new CampaignSaveError("invalid_save");
    if (expectedCampaignId !== undefined && file.campaign_id !== expectedCampaignId) throw new CampaignSaveError("invalid_save");
    // Snapshot-level migration inside the current envelope (Player Character Profile V1: snapshot 4 -> 5, world-aware).
    // Item Domain V1: snapshot 5 -> 6 (item ID allocator), chained after 4 -> 5.
    // Block 7: an envelope written at schema 8 carries a PERSISTED snapshot (schema 8): the fields of every migrated side store are absent and are composed back
    // from that store. Earlier envelopes carry the full snapshot and own all their optional state (nothing is migrated until the first schema-8 save).
    const markers = parseOptionalMarkers(file.optional_state), stores = from !== undefined && from < 8 ? migratedStores(undefined) : migratedStores(markers);
    if (from === undefined || from >= 8) {
      const snapshotVersion = (file.snapshot as { schema_version?: unknown } | undefined)?.schema_version;
      // A composed (self-contained, schema 7 shaped) snapshot inside a schema 8 envelope is only legal while no store is migrated (an in-memory file round trip).
      const composed = snapshotVersion === 7 && !MARKER_STORES.some(store => stores[store]);
      if (!composed && snapshotVersion !== 8) throw new CampaignSaveError((file.snapshot as { schema_version?: unknown } | undefined)?.schema_version === 7 ? "invalid_save" : "unsupported_version");
      for (const store of MARKER_STORES) if (stores[store] && !options.core_only && !options.sides?.[store]) throw new CampaignSaveError("optional_state_invalid");
      if (!composed) {
      const persisted = file.snapshot as unknown as { revision?: unknown };
      file.snapshot = fromPersistedSnapshot(file.snapshot, stores, options.sides ?? {}, { ...(options.core_only ? { core_only: true } : {}), ...(typeof persisted?.revision === "number" ? { revision: persisted.revision } : {}) }) as unknown as CampaignSnapshot;
      }
    }
    const rawSnapshotVersion = (file.snapshot as { schema_version?: unknown } | undefined)?.schema_version;
    const snapshotFrom = rawSnapshotVersion === 4 || rawSnapshotVersion === 5 || rawSnapshotVersion === 6 ? rawSnapshotVersion : undefined;
    if (snapshotFrom === 4) { try { file.snapshot = migrateSnapshot4to5(file.snapshot, () => defaultPlayerCharacters(world)) as unknown as CampaignSnapshot; } catch { throw new CampaignSaveError("migration_failed"); } }
    if (snapshotFrom === 4 || snapshotFrom === 5) { try { file.snapshot = migrateSnapshot5to6(file.snapshot) as unknown as CampaignSnapshot; } catch { throw new CampaignSaveError("migration_failed"); } }
    if (snapshotFrom !== undefined) { try { file.snapshot = migrateSnapshot6to7(file.snapshot) as unknown as CampaignSnapshot; } catch { throw new CampaignSaveError("migration_failed"); } }
    requireCurrentSnapshotVersion(file.snapshot);
    const parsed = parseCampaignSnapshot(file.snapshot);
    if (parsed.campaign_id !== file.campaign_id || parsed.dataset_id !== file.canonical_dataset_id) throw new CampaignSaveError("invalid_save");
    if (file.canon_compatibility === "references" ? !file.canon_references : !!file.canon_references) throw new CampaignSaveError("invalid_save");
    // Tiered compatibility (never all-or-nothing): reconcile, then the complete runtime reference validator runs on the result.
    const assessed = assessCanonCompatibility({ snapshot: parsed, references: file.canon_references, saved_dataset_id: file.canonical_dataset_id }, world);
    let snapshot: DeepReadonly<CampaignSnapshot>;
    try { snapshot = validateCampaignSnapshot({ ...assessed.snapshot, dataset_id: world.datasetId }, world); }
    catch (error) {
      // State that validated against its own world but not against this one: the authoring change made reconstruction unsafe.
      const e = saveError(error);
      throw e.code === "invalid_save" && file.canonical_dataset_id !== world.datasetId ? new CampaignSaveError("dataset_mismatch") : e;
    }
    const continuity = parseContinuity(file.continuity);
    const receipts = parseTurnReceipts(file.turn_receipts, snapshot.revision);
    // Structure only: the session decides which kinds it can confirm (an unregistered kind is dropped there, observably).
    const interaction = parseInteractionMetadata(file.interaction_metadata, snapshot.revision, () => true);
    const { continuity: _raw, turn_receipts: _receipts, interaction_metadata: _interaction, ...rest } = file;
    const result = freezeSnapshot({ ...rest, canonical_dataset_id: world.datasetId, snapshot: snapshot as CampaignSnapshot, ...(continuity ? { continuity } : {}), ...(receipts ? { turn_receipts: receipts } : {}), ...(interaction ? { interaction_metadata: interaction } : {}) }) as DeepReadonly<CampaignSaveFile>;
    return Object.freeze({ file: result, optional_state: Object.freeze({ migrated: stores, bound_revision: Object.freeze({ ...(options.sides?.learning_bound_revision !== undefined ? { learning: options.sides.learning_bound_revision } : {}), ...(options.sides?.media_bound_revision !== undefined ? { media: options.sides.media_bound_revision } : {}) }) }), ...(from !== undefined && from !== CURRENT_SAVE_VERSION ? { migrated_from: from } : {}), ...(snapshotFrom !== undefined ? { snapshot_migrated_from: snapshotFrom } : {}), canon: assessed.report,
      continuity_dropped: file.continuity !== undefined && !continuity });
  } catch (error) { throw saveError(error); }
}
export function validateSaveFile(input: unknown, world: WorldStore, expectedCampaignId?: string, options: DecodeOptions = {}): DeepReadonly<CampaignSaveFile> {
  return validateSaveFileWithReport(input, world, expectedCampaignId, options).file;
}
export function decodeSaveWithReport(text: string, world: WorldStore, expectedCampaignId?: string, options: DecodeOptions = {}): DecodedSave {
  return validateSaveFileWithReport(parseSaveJson(text), world, expectedCampaignId, options);
}
export function decodeSave(text: string, world: WorldStore, expectedCampaignId?: string, options: DecodeOptions = {}): DeepReadonly<CampaignSaveFile> {
  return decodeSaveWithReport(text, world, expectedCampaignId, options).file;
}
export interface SaveExtras {
  readonly metadata?: Partial<Pick<SaveMetadata, "engine_version" | "display_name" | "save_reason" | "scenario_id">>;
  readonly continuity?: SaveContinuity;
  readonly turn_receipts?: TurnReceiptBlock;
  readonly interaction_metadata?: InteractionMetadataBlock;
  /** Block 7: the side stores this save declares authoritative. Omitted = nothing migrated (self-contained snapshot). */
  readonly optional_state?: OptionalStateMarkers;
}
export type { TurnReceipt };
export function createSaveFile(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, savedAt: string, createdAt = savedAt, extras: SaveExtras = {}): DeepReadonly<CampaignSaveFile> {
  // A write may never manufacture compatibility evidence for a campaign bound to another world.
  try { validateCampaignSnapshot(snapshot, world); } catch (error) { throw saveError(error); }
  const metadata = Object.fromEntries(Object.entries({ saved_at: savedAt, created_at: createdAt, ...extras.metadata }).filter(([, v]) => v !== undefined));
  if (extras.continuity && !parseContinuity(extras.continuity)) throw new CampaignSaveError("invalid_save");
  const markers = parseOptionalMarkers(extras.optional_state);
  return validateSaveFile({ format: "caldrevan_campaign_save", schema_version: 8, campaign_id: snapshot.campaign_id, canonical_dataset_id: snapshot.dataset_id, metadata, snapshot: toPersistedSnapshot(snapshot, migratedStores(markers)),
    canon_compatibility: "references", canon_references: canonReferences(snapshot, world), ...(extras.continuity ? { continuity: extras.continuity } : {}), ...(extras.turn_receipts ? { turn_receipts: extras.turn_receipts } : {}), ...(extras.interaction_metadata ? { interaction_metadata: extras.interaction_metadata } : {}),
    ...(markers ? { optional_state: markers } : {}) }, world, undefined, { sides: sidesOf(snapshot) });
}
/** The file as persisted: schema 8, with the fields of every migrated side store removed from the snapshot. */
function persistedFile(file: DeepReadonly<CampaignSaveFile>): Record<string, unknown> {
  return { ...(file as unknown as Record<string, unknown>), snapshot: toPersistedSnapshot(file.snapshot, migratedStores(file.optional_state)) };
}
/** Called only after validation; sorts object keys, preserves all array order and missing fields. */
export function serializeSave(file: DeepReadonly<CampaignSaveFile>, world: WorldStore): string {
  const valid = validateSaveFile(persistedFile(file), world, undefined, { sides: sidesOf(file.snapshot) });
  const json = JSON.stringify(persistedFile(valid), (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value) + "\n";
  // Block B4: compact JSON (P2; strict-json reads compact and pretty alike). Oversize is its own code (PER-1: nothing was written, not corruption).
  if (Buffer.byteLength(json, "utf8") > MAX_SAVE_BYTES) throw new CampaignSaveError("save_too_large");
  return json;
}
