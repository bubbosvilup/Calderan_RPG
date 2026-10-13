import type { WorldStore } from "./world-store.js";

/**
 * Canonical character names and aliases are RESERVED identity handles (REPO-12 policy decision, 2026-10-13). A non-canonical person, provisional
 * or persistent, never acquires through self-introduction or name disclosure an exact canonical name, display name or alias that belongs to
 * another identity. The collision fails closed for the name establishment only: it never merges the person with the canonical identity, never
 * replaces an id, never renames the canonical character, never creates a character and never infers that the speaker "must really be" them.
 *
 * Exact handles only (case and inner whitespace normalized): a shared first name ("Mira" vs Mira Thorne) is not a reserved handle; the scene
 * reading's canon nonduplication rules decide those.
 */
const normalized = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const reserved = new WeakMap<WorldStore, ReadonlyMap<string, readonly string[]>>();
function handles(world: WorldStore): ReadonlyMap<string, readonly string[]> {
  let map = reserved.get(world);
  if (!map) {
    const built = new Map<string, string[]>();
    for (const e of world.listEntities()) if (e.type === "character")
      for (const handle of new Set([e.name, e.display_name, ...(e.aliases ?? [])].filter((h): h is string => !!h?.trim()).map(normalized))) built.set(handle, [...(built.get(handle) ?? []), e.id]);
    reserved.set(world, map = built);
  }
  return map;
}
/** The canonical characters whose exact name, display name or alias is `name` (empty when the name is not reserved). */
export function canonicalHandleOwners(world: WorldStore, name: string): readonly string[] { return handles(world).get(normalized(name)) ?? []; }
/** True when `name` is an exact canonical handle of an identity other than `self` (a canonical character's own name is never a collision). */
export function reservedForAnotherIdentity(world: WorldStore, name: string, self?: string): boolean { return canonicalHandleOwners(world, name).some(id => id !== self); }
