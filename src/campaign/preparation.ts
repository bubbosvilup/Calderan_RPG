import type { CampaignCharacter, CampaignSnapshot } from "./types.js";
import { CampaignIdentityResolver } from "./identity.js";
import { fail } from "./validation.js";

/** Private mutable draft, never the committed snapshot. All domain functions are preparation only. */
export interface PreparationContext { draft: CampaignSnapshot; refs: CampaignIdentityResolver }
export const worldMinute = (context: PreparationContext): number => context.draft.runtime.scene.world_time.world_minute;
export function historicalMinute(value: number | undefined, context: PreparationContext, field: string): void {
  if (value !== undefined && value > worldMinute(context)) fail(field, "provenance cannot be in the future");
}
export function characterForUpdate(context: PreparationContext, id: string): CampaignCharacter {
  const origin = context.refs.character(id);
  let character = context.draft.characters.find(c => c.id === id);
  if (!character) {
    character = { id, origin, profile: {}, current: {} };
    context.draft.characters.push(character);
  }
  return character;
}
export function findRequired<T extends { id: string }>(list: T[], id: string, field: string): T {
  return list.find(record => record.id === id) ?? fail(field, "unknown record");
}
