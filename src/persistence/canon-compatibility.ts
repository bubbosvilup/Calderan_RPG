import { createHash } from "node:crypto";
import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { CampaignSaveError } from "./errors.js";

/** One authored record the saved campaign depends on. `kind` (entity type or "chunk") is recorded from save format 5 on. */
export interface CanonReference { id: string; fingerprint: string; kind?: string }
/**
 * Save/Load v1 tiered canon compatibility. The authored world evolves; a campaign must survive additive and harmless authoring:
 *   compatible                 — nothing the campaign relies on changed (additions anywhere, label/prose edits, unrelated edits).
 *                                Additive canon never mutates the campaign: a newly authored NPC gets no runtime entry at load
 *                                (it stays available through the WorldStore; play may place it later through a normal commit).
 *   compatible_with_warnings   — a referenced record still exists with the same kind but its non-label content changed, a runtime-
 *                                only location entry for a removed NPC was dropped, or the save carries no fingerprint evidence.
 *   incompatible               — a referenced record disappeared or changed kind, or the reconciled state no longer validates.
 *                                Load stops; the save is never modified.
 */
export type CanonCompatibilityTier = "compatible" | "compatible_with_warnings";
export interface CanonCompatibilityReport {
  readonly tier: CanonCompatibilityTier;
  /** Runtime location entries of NPCs no longer authored and referenced nowhere else (authoritative change: revision + 1). */
  readonly removed_npc_locations: readonly string[];
  /** Referenced records whose non-label content changed since the save (IDs only). */
  readonly drifted_references: readonly string[];
  /** True when the save has no fingerprint evidence (legacy strict saves) and the world changed: drift cannot be assessed. */
  readonly unverified: boolean;
  /** The revision the save was written at, and whether reconciliation advanced it. */
  readonly saved_revision: number;
  readonly revision_advanced: boolean;
}
/** Descriptive labels are not structural identity. All other authored properties remain conservative. */
function fingerprint(record: object): string {
  const omitted = new Set(["name", "display_name", "summary", "description", "aliases"]);
  const value = Object.fromEntries(Object.entries(record).filter(([key]) => !omitted.has(key)));
  return `sha256:${createHash("sha256").update(JSON.stringify(value, (_key, child: unknown) => child && typeof child === "object" && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : child)).digest("hex")}`;
}
const kindOf = (world: WorldStore, id: string): string | undefined => world.getEntity(id)?.type ?? (world.getChunk(id) ? "chunk" : undefined);
/** A conservative superset of authored references, including chunk IDs. No campaign prose is retained. */
export function canonReferences(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore): readonly CanonReference[] {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string" && (world.hasEntity(value) || world.getChunk(value))) ids.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(snapshot);
  if (world.hasEntity("nicco")) ids.add("nicco");
  return [...ids].sort().map(id => ({ id, kind: kindOf(world, id)!, fingerprint: fingerprint(world.getEntity(id) ?? world.getChunk(id)!) }));
}
/** Every string in the snapshot except the runtime location entries of the given NPCs (used to prove they are referenced nowhere else). */
function referencedOutsideRuntimeLocations(snapshot: DeepReadonly<CampaignSnapshot>, ids: ReadonlySet<string>): Set<string> {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") { if (ids.has(value)) found.add(value); }
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  const { runtime, ...rest } = snapshot;
  visit(rest); visit(runtime.scene); visit(runtime.mana);
  for (const n of runtime.npc_locations) { if (n.current_location) visit(n.current_location); if (n.off_scene) visit(n.off_scene.last_known_location); }
  return found;
}
/**
 * Classifies a parsed (not yet graph-validated) snapshot against the current world and returns the reconciled snapshot. Throws
 * CampaignSaveError for the incompatible tier. Pure: the input is never mutated, and nothing is written.
 */
export function assessCanonCompatibility(input: {
  readonly snapshot: DeepReadonly<CampaignSnapshot>; readonly references: readonly CanonReference[] | undefined; readonly saved_dataset_id: string;
}, world: WorldStore): { readonly snapshot: CampaignSnapshot; readonly report: CanonCompatibilityReport } {
  const snapshot = structuredClone(input.snapshot) as CampaignSnapshot, references = input.references;
  const missing: string[] = [], drifted: string[] = [], retyped: string[] = [];
  if (references) {
    const seen = new Set<string>();
    for (const ref of references) {
      if (seen.has(ref.id) || !/^sha256:[a-f0-9]{64}$/.test(ref.fingerprint)) throw new CampaignSaveError("invalid_save");
      seen.add(ref.id);
      const kind = kindOf(world, ref.id);
      if (!kind) { missing.push(ref.id); continue; }
      if (ref.kind !== undefined && ref.kind !== kind) { retyped.push(ref.id); continue; }
      if (fingerprint((world.getEntity(ref.id) ?? world.getChunk(ref.id))!) !== ref.fingerprint) drifted.push(ref.id);
    }
    // The manifest must cover what the snapshot references today (tamper evidence; new authored records are not referenced yet).
    for (const required of canonReferences(snapshot, world)) if (!seen.has(required.id)) throw new CampaignSaveError("invalid_save");
  }
  if (retyped.length) throw new CampaignSaveError("dataset_mismatch", { ids: retyped.sort() });
  // A removed NPC is reconcilable only when the campaign knows it solely as a runtime location entry.
  const npcLocationIds = new Set(snapshot.runtime.npc_locations.map(n => n.character_id));
  const removable = missing.filter(id => npcLocationIds.has(id));
  const stillUsed = referencedOutsideRuntimeLocations(snapshot, new Set(removable));
  const blocking = missing.filter(id => !npcLocationIds.has(id) || stillUsed.has(id));
  if (blocking.length) throw new CampaignSaveError("reference_invalid", { ids: blocking.sort() });
  const removed = removable.filter(id => !stillUsed.has(id)).sort();
  // Legacy strict saves carry no references: any runtime entry for an NPC the world no longer authors is equally removable.
  if (!references) for (const n of snapshot.runtime.npc_locations) if (world.getEntity(n.character_id)?.type !== "character" && !referencedOutsideRuntimeLocations(snapshot, new Set([n.character_id])).size) removed.push(n.character_id);
  const removedSet = new Set(removed);
  if (removedSet.size) snapshot.runtime.npc_locations = snapshot.runtime.npc_locations.filter(n => !removedSet.has(n.character_id));
  const advanced = removed.length > 0;
  const saved_revision = snapshot.revision;
  if (advanced) snapshot.revision += 1;
  const unverified = !references && input.saved_dataset_id !== world.datasetId;
  const tier: CanonCompatibilityTier = drifted.length || removed.length || unverified ? "compatible_with_warnings" : "compatible";
  return { snapshot, report: Object.freeze({ tier, removed_npc_locations: Object.freeze([...removedSet].sort()),
    drifted_references: Object.freeze(drifted.sort()), unverified, saved_revision, revision_advanced: advanced }) };
}
