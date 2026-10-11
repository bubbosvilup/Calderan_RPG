import type { CampaignSnapshot } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { OPENING_HOUSEHOLD } from "./opening-state.js";

/**
 * Heartstone stone recognition (derived, never persisted). The interior stone feels gently, pleasantly warm through direct bare-skin
 * contact to the Keeper and to ACTIVE household members; anyone else feels ordinary stone at its real temperature. There is no
 * per-character "warm" flag: the answer is recomputed from household membership, the place and the contact, so it ends the moment
 * membership is no longer active, and it is not healing, a buff, or a sign of sentience.
 */
export type StoneContact = "bare_skin" | "shod_or_none";
export type StoneFeel = "gentle_warmth" | "ordinary_stone";

/** Nicco as Keeper of Heartstone, or a current ("member") member of the Heartstone household. */
export function recognizedByHeartstone(snapshot: DeepReadonly<Pick<CampaignSnapshot, "households">>, characterId: string): boolean {
  const household = snapshot.households.find(h => h.id === OPENING_HOUSEHOLD);
  return !!household?.members.some(m => m.character_id === characterId && m.status === "member");
}
/** True inside Heartstone's interior (the property or any room of it), false outdoors or elsewhere. */
export function insideHeartstoneInterior(world: WorldStore, locationId: string | null | undefined): boolean {
  if (!locationId) return false;
  const entity = world.getEntity(locationId);
  if (!entity || ![locationId, ...world.getAncestors(locationId).map(a => a.id)].includes("heartstone")) return false;
  return !(entity.type === "location" && entity.environment_exposure === "outdoor");
}
/** What `characterId` feels standing in `locationId` with the given contact. Contact is a fact of the scene, never inferred here. */
export function stoneFeel(snapshot: DeepReadonly<Pick<CampaignSnapshot, "households">>, world: WorldStore, characterId: string, locationId: string | null | undefined, contact: StoneContact): StoneFeel {
  return contact === "bare_skin" && insideHeartstoneInterior(world, locationId) && recognizedByHeartstone(snapshot, characterId) ? "gentle_warmth" : "ordinary_stone";
}
