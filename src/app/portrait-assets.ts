import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { assetKey, type RetainedAssets } from "../persistence/campaign-repository.js";
import type { PortraitAssetStore } from "./portrait-store.js";

/**
 * Save/Load v1 portrait asset lifecycle. A file is PROTECTED while any retained campaign state references it: the live campaign,
 * save.json, save.previous.json or any kept backup. Protection keeps the FILE only — it never puts a deleted version back into the
 * live Gallery (the live snapshot alone decides membership).
 *
 *   deferred deletion: a Gallery delete commits metadata only; the file is removed later, once no retained state references it.
 *   orphan detection:  files under the campaign's portrait tree that no retained state references (reported, never auto-removed).
 *   missing files:     references of the live campaign whose file is absent (reported; the record stays; the UI shows a placeholder).
 */
export function liveAssetReferences(snapshot: DeepReadonly<CampaignSnapshot>): Set<string> {
  const refs = new Set<string>();
  for (const item of snapshot.items) if (item.sprite?.status === "ready") refs.add(assetKey(item.id, item.sprite.asset_ref));
  for (const record of snapshot.portraits ?? []) {
    for (const v of record.versions) refs.add(assetKey(record.character_id, v.asset_file));
    if (record.reference) refs.add(assetKey(record.character_id, record.reference.asset_file));
  }
  return refs;
}
const split = (key: string) => { const at = key.indexOf("\u0000"); return { character_id: key.slice(0, at), file: key.slice(at + 1) }; };
export interface PortraitAssetReport {
  /** Live references whose file is absent on disk. */
  readonly missing: readonly { readonly character_id: string; readonly file: string }[];
  /** Files no retained state references (store keys `<token>/<file>`). Temporary files count only when older than the grace period. */
  readonly orphans: readonly string[];
  /** False when a retained save could not be read: orphan candidates are then unknown and nothing may be removed. */
  readonly complete: boolean;
}
export const TEMP_GRACE_MS = 60 * 60_000;
export async function assessPortraitAssets(store: PortraitAssetStore, campaignId: string, snapshot: DeepReadonly<CampaignSnapshot>, retained: RetainedAssets, now = Date.now()): Promise<PortraitAssetReport> {
  const live = liveAssetReferences(snapshot), protectedKeys = new Set<string>();
  for (const key of [...live, ...retained.references]) { const { character_id, file } = split(key); protectedKeys.add(`${store.characterToken(campaignId, character_id)}/${file}`); }
  const files = await store.listFiles(campaignId), present = new Set(files.map(f => f.key));
  const missing = [...live].map(split).filter(r => !present.has(`${store.characterToken(campaignId, r.character_id)}/${r.file}`))
    .sort((a, b) => a.character_id < b.character_id ? -1 : a.character_id > b.character_id ? 1 : a.file < b.file ? -1 : 1);
  const orphans = retained.complete ? files.filter(f => f.temporary ? now - f.mtime_ms > TEMP_GRACE_MS : !protectedKeys.has(f.key)).map(f => f.key) : [];
  return Object.freeze({ missing: Object.freeze(missing), orphans: Object.freeze(orphans), complete: retained.complete });
}
/**
 * Physically removes the deferred deletions that no retained state references any more. Returns the keys that must stay pending
 * (still protected, or the retained set is incomplete). Never touches anything that was not explicitly deleted by the player.
 */
export async function collectDeferredDeletions(store: PortraitAssetStore, campaignId: string, snapshot: DeepReadonly<CampaignSnapshot>, retained: RetainedAssets, pending: ReadonlySet<string>): Promise<{ pending: Set<string>; failed: number }> {
  const live = liveAssetReferences(snapshot), keep = new Set<string>();
  let failed = 0;
  for (const key of pending) {
    if (!retained.complete || live.has(key) || retained.references.has(key)) { keep.add(key); continue; }
    const { character_id, file } = split(key);
    // A file that cannot be removed now is dropped from the pending set: it stays on disk as a detectable orphan.
    if (!await store.remove(campaignId, character_id, file)) failed++;
  }
  return { pending: keep, failed };
}
