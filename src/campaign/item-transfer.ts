import type { CampaignItem, CampaignSnapshot, ItemPosition, ItemTransferMode } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";

/** One transition table, shared by preparation and authorization. Never guesses an unknown/unowned owner. */
export function itemHolder(item: Pick<DeepReadonly<CampaignItem>, "position">): string | undefined {
  return item.position.kind === "carried" || item.position.kind === "equipped" ? item.position.character_id : undefined;
}
export function transferRecipient(command: { readonly position: DeepReadonly<ItemPosition> }): string | undefined {
  return command.position.kind === "carried" || command.position.kind === "equipped" ? command.position.character_id : undefined;
}
export function validTransferMode(item: DeepReadonly<CampaignItem>, recipient: string, mode: ItemTransferMode): boolean {
  const source = itemHolder(item);
  if (!source || source === recipient) return false;
  if (mode === "gift" || mode === "lend") return item.owner_id === source;
  if (mode === "return" || mode === "reclaim") return item.owner_id === recipient;
  return mode === "handoff" || mode === "steal" || mode === "take";
}
/** Same physical presence rule for player, authored NPCs, campaign NPCs and NPC+. */
export function transferCharacterPresent(snapshot: DeepReadonly<CampaignSnapshot>, id: string): boolean {
  if (id === "nicco") return true;
  const c = snapshot.characters.find(c => c.id === id);
  if (c?.current.status === "dead") return false;
  const location = c?.origin.kind === "created" ? c.current.current_location : snapshot.runtime.npc_locations.find(c => c.character_id === id)?.current_location;
  return location !== undefined && location === snapshot.runtime.scene.player_location;
}
/** Only explicit permanence expresses a gift. Ordinary giving/receipt does not. */
export const EXPLICIT_GIFT = /\b(?:gifts?|gifted|as a present|(?:it(?:'s| is)|they(?:'re| are)) (?:hers|his|yours|theirs)(?: now)?|belongs? to (?:you|her|him|them) now|keep it forever)\b/i;
