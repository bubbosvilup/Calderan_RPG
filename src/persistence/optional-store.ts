import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { CampaignSaveError, nodeCode } from "./errors.js";
import type { SaveFileSystem } from "./filesystem.js";
import { parseSaveJson } from "./strict-json.js";
import type { LearningStateData, MediaStateData, OptionalStoreName } from "../campaign/optional-state.js";

/**
 * Consolidation block 7: the optional-state side stores.
 *
 * One small JSON file per campaign per category under `<campaign>/optional/`:
 *   learning.json   reflection journal and notes, mannerism learning evidence
 *   media.json      item sprite bookkeeping, portrait gallery and generation metadata
 *
 * Each file is bound to its campaign (`campaign_id`), carries its OWN schema version (`store_version`, independent of the campaign snapshot version), the
 * snapshot revision it was written beside (`bound_revision`) and a SHA-256 of its canonical data (`content_sha256`, an integrity check, not a signature).
 * Writes are atomic: temp file, flush + fsync, rename, directory fsync. A partial or foreign file is never valid and an interrupted temp is never read.
 *
 * Whether a store is AUTHORITATIVE is decided by the marker in the campaign save, never by the existence of this file.
 */
export const OPTIONAL_STORE_FORMAT = "caldrevan_optional_store";
export const OPTIONAL_STORE_VERSIONS: Readonly<Record<OptionalStoreName, number>> = Object.freeze({ learning: 1, media: 1 });
export const OPTIONAL_STORE_DIRECTORY = "optional";
export const optionalStoreFile = (name: OptionalStoreName) => `${name}.json`;
export type StoreData = { learning: LearningStateData; media: MediaStateData };

export interface StoreFileContent<N extends OptionalStoreName = OptionalStoreName> {
  readonly format: typeof OPTIONAL_STORE_FORMAT; readonly store: N; readonly store_version: number; readonly campaign_id: string;
  readonly bound_revision: number; readonly saved_at: string; readonly content_sha256: string; readonly data: StoreData[N];
}
/** Canonical JSON: object keys sorted, arrays in order. */
export function canonicalJson(value: unknown, space?: number): string {
  return JSON.stringify(value, (_key, child: unknown) => child && typeof child === "object" && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : child, space);
}
export const contentDigest = (data: unknown): string => createHash("sha256").update(canonicalJson(data)).digest("hex");

export function encodeStore<N extends OptionalStoreName>(store: N, campaignId: string, boundRevision: number, savedAt: string, data: StoreData[N]): string {
  const content: StoreFileContent<N> = { format: OPTIONAL_STORE_FORMAT, store, store_version: OPTIONAL_STORE_VERSIONS[store], campaign_id: campaignId, bound_revision: boundRevision, saved_at: savedAt, content_sha256: contentDigest(data), data };
  return canonicalJson(content, 2) + "\n";
}
const invalid = (): never => { throw new CampaignSaveError("optional_state_invalid"); };
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KEYS = ["format", "store", "store_version", "campaign_id", "bound_revision", "saved_at", "content_sha256", "data"];
/** Structure, binding, version and integrity. Domain validation of the data happens when it is merged into the snapshot. Any failure is a HARD error. */
export function decodeStore<N extends OptionalStoreName>(text: string, store: N, campaignId: string): StoreFileContent<N> {
  let raw: unknown;
  try { raw = parseSaveJson(text); } catch { return invalid(); }
  if (!isObject(raw) || Object.keys(raw).length !== KEYS.length || KEYS.some(k => !(k in raw))) return invalid();
  if (raw.format !== OPTIONAL_STORE_FORMAT || raw.store !== store || raw.campaign_id !== campaignId) return invalid();
  if (raw.store_version !== OPTIONAL_STORE_VERSIONS[store]) throw new CampaignSaveError("optional_state_invalid");
  if (!Number.isSafeInteger(raw.bound_revision) || (raw.bound_revision as number) < 0 || typeof raw.saved_at !== "string" || typeof raw.content_sha256 !== "string" || !isObject(raw.data)) return invalid();
  if (contentDigest(raw.data) !== raw.content_sha256) return invalid();
  const data = raw.data;
  if (store === "learning") {
    const keys = Object.keys(data);
    if (!Array.isArray(data.premium_reflections) || keys.some(k => k !== "premium_reflections" && k !== "mannerism_learning") || (data.mannerism_learning !== undefined && !isObject(data.mannerism_learning))) return invalid();
  } else {
    const keys = Object.keys(data);
    if (!Array.isArray(data.item_sprites) || !Array.isArray(data.portraits) || keys.length !== 2) return invalid();
    for (const e of data.item_sprites as unknown[]) if (!isObject(e) || typeof e.item_id !== "string" || !isObject(e.sprite)) return invalid();
    for (const e of data.portraits as unknown[]) if (!isObject(e) || typeof e.character_id !== "string" || !Array.isArray(e.versions)) return invalid();
  }
  return raw as unknown as StoreFileContent<N>;
}

/**
 * Atomic replace of one store file: temp (created exclusively, flushed and fsynced by `writeNew`) -> rename -> directory fsync. The directory must exist.
 * The temp file is removed if anything fails before the rename; a leftover temp is never loaded.
 */
export async function writeStoreFile(fs: SaveFileSystem, directory: string, store: OptionalStoreName, text: string): Promise<void> {
  const target = join(directory, optionalStoreFile(store)), temp = join(directory, `.${store}-${randomUUID()}.tmp`);
  try {
    await fs.writeNew(temp, text);
    await fs.rename(temp, target);
    await fs.syncDirectory(directory);
  } catch (error) {
    try { await fs.unlink(temp); } catch (cleanup) { if (nodeCode(cleanup) !== "ENOENT") { /* A stale temp is never read. */ } }
    throw error;
  }
}
