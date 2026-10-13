import type { WorldStore } from "../../world/world-store.js";
import { reservedForAnotherIdentity } from "../../world/canonical-names.js";
import type { IdentityFact } from "../narration-facts/index.js";

/**
 * Reserved canonical handles, applied to a name narration established (REPO-12 policy decision, see world/canonical-names.ts). One rule for both
 * sides of materialization: the provisional reading and Keep track (before) and late naming on a persistent record (after).
 *
 * A name is checked as itself and as every whole name the identity facts gave it under: "My name is Doran Hale" establishes the token "Doran" but
 * claims the canonical alias "Doran Hale". The handles come from the shared NarrationFacts identity facts, never from the prose.
 */
export function claimedHandles(identity: readonly IdentityFact[], name: string): readonly string[] {
  return [name, ...identity.flatMap(f => f.kind === "self_introduction" && f.name === name && f.full_name ? [f.full_name] : [])];
}
/** True when narration gave `name` as (or as part of) an exact canonical name or alias of an identity other than `self`. */
export function claimsReservedHandle(world: WorldStore, identity: readonly IdentityFact[], name: string, self?: string): boolean {
  return claimedHandles(identity, name).some(handle => reservedForAnotherIdentity(world, handle, self));
}
