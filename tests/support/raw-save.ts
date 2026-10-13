import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { decodeSave, decodeSaveWithReport, peekOptionalMarkers } from "../../src/persistence/save-format.js";
import { decodeStore, optionalStoreFile, OPTIONAL_STORE_DIRECTORY } from "../../src/persistence/optional-store.js";
import type { WorldStore } from "../../src/world/world-store.js";

/** Test helper (block 7): decodes a save file exactly as the repository does, reading the side stores its markers declare authoritative. */
export async function readSides(savePath: string, text: string, campaignId: string) {
  const markers = peekOptionalMarkers(text), sides: Record<string, unknown> = {};
  for (const store of ["learning", "media"] as const) {
    if (!markers?.[store]) continue;
    const content = decodeStore(await fs.readFile(join(dirname(savePath), OPTIONAL_STORE_DIRECTORY, optionalStoreFile(store)), "utf8"), store, campaignId);
    sides[store] = content.data; sides[`${store}_bound_revision`] = content.bound_revision;
  }
  return sides;
}
export async function decodeSaveFile(savePath: string, world: WorldStore) {
  const text = await fs.readFile(savePath, "utf8"), campaignId = (JSON.parse(text) as { campaign_id: string }).campaign_id;
  return decodeSave(text, world, undefined, { sides: await readSides(savePath, text, campaignId) as never });
}
export async function decodeSaveFileWithReport(savePath: string, world: WorldStore) {
  const text = await fs.readFile(savePath, "utf8"), campaignId = (JSON.parse(text) as { campaign_id: string }).campaign_id;
  return decodeSaveWithReport(text, world, undefined, { sides: await readSides(savePath, text, campaignId) as never });
}

/**
 * Rewrites a current (schema 8, side-store) save into the exact PRE-BLOCK-7 shape: schema 7 envelope, composed snapshot with all optional fields inline,
 * no markers, no `optional/` directory. Returns the mutable JSON (callers may mutate and write it back).
 */
export async function toLegacyFile(savePath: string, world: WorldStore): Promise<any> {
  const composed = await decodeSaveFile(savePath, world), json = JSON.parse(JSON.stringify(composed));
  json.schema_version = 7; delete json.optional_state; delete json.snapshot.portrait_selections;
  await fs.rm(join(dirname(savePath), OPTIONAL_STORE_DIRECTORY), { recursive: true, force: true });
  await fs.writeFile(savePath, JSON.stringify(json, null, 2));
  return json;
}
