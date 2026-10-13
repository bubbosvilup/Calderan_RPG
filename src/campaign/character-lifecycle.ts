import type { CampaignCharacter, CampaignSnapshot } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";

/**
 * Block 5B: the identity LIFECYCLE of a person. It is NOT a UI tier (NPC / NPC+ stay as they are).
 *
 *   PROVISIONAL  a person narration introduced who is not (yet) a CampaignCharacter. Temporary, never part of CampaignState, never owns anything
 *                durable (no ownership, legal state, household, trade history or NPC+). See turn/identity/provisional-people.ts.
 *   PERSISTENT   a real CampaignCharacter: stable durable id, save/load identity, normal domain relationships.
 *   RETIRED      a persistent identity kept as history only (no longer an active participant; never a live target). Not deletion: the id stays
 *                referenceable. Set only by the human-authorized retire/merge repair commands.
 *
 * Only PERSISTENT and RETIRED exist in the snapshot. Lifecycle is derived from the record (`retirement`), never stored as a second source of truth.
 */
export type CharacterLifecycle = "provisional" | "persistent" | "retired";
export const isRetiredCharacter = (c: DeepReadonly<Pick<CampaignCharacter, "retirement">>): boolean => c.retirement !== undefined;
/** persistent | retired for a character that has a campaign record; undefined when the id has none (a canonical NPC not yet materialized, or a provisional person). */
export function characterLifecycle(snapshot: DeepReadonly<Pick<CampaignSnapshot, "characters">>, id: string): Exclude<CharacterLifecycle, "provisional"> | undefined {
  const record = snapshot.characters.find(c => c.id === id);
  return record ? (isRetiredCharacter(record) ? "retired" : "persistent") : undefined;
}
/** Ids that are retired: the single exclusion set live consumers (presence, targeting, foreground binding) use. */
export const retiredCharacterIds = (snapshot: DeepReadonly<Pick<CampaignSnapshot, "characters">>): ReadonlySet<string> =>
  new Set(snapshot.characters.filter(isRetiredCharacter).map(c => c.id));
