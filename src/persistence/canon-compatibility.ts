import { createHash } from "node:crypto";
import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { CampaignSaveError } from "./errors.js";

export interface CanonReference { id: string; fingerprint: string }
/** Descriptive labels are not structural identity. All other authored properties remain conservative. */
function fingerprint(record: object): string {
  const omitted = new Set(["name", "display_name", "summary", "description", "aliases"]);
  const value = Object.fromEntries(Object.entries(record).filter(([key]) => !omitted.has(key)));
  return `sha256:${createHash("sha256").update(JSON.stringify(value, (_key, child: unknown) => child && typeof child === "object" && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : child)).digest("hex")}`;
}
/** A conservative superset of authored references, including chunk IDs. No campaign prose is retained. */
export function canonReferences(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore): readonly CanonReference[] {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string" && (world.hasEntity(value) || world.getChunk(value))) ids.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(snapshot);
  if (world.hasEntity("nicco")) ids.add("nicco");
  return [...ids].sort().map(id => ({ id, fingerprint: fingerprint(world.getEntity(id) ?? world.getChunk(id)!) }));
}
export function checkCanonReferences(references: readonly CanonReference[], snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore): void {
  const seen = new Set<string>();
  for (const ref of references) {
    if (seen.has(ref.id) || !/^sha256:[a-f0-9]{64}$/.test(ref.fingerprint)) throw new CampaignSaveError("invalid_save");
    seen.add(ref.id);
    const record = world.getEntity(ref.id) ?? world.getChunk(ref.id);
    if (!record) throw new CampaignSaveError("reference_invalid");
  }
  for (const ref of references) if (fingerprint((world.getEntity(ref.id) ?? world.getChunk(ref.id))!) !== ref.fingerprint) throw new CampaignSaveError("dataset_mismatch");
  for (const required of canonReferences(snapshot, world)) if (!seen.has(required.id)) throw new CampaignSaveError("invalid_save");
}
