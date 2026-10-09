import type { CampaignSnapshot } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { compareIds } from "../world/provenance.js";

/**
 * Permanent Inventory V1: inventory is DERIVED state. CampaignItem (identity, owner, one physical position) is the only source of
 * truth; nothing here stores or mutates anything, and no per-character inventory array exists anywhere.
 *
 * One query layer for every persistent character (active player, campaign-created NPCs, NPC+, authored NPCs): all of them are
 * addressed by the same character ID, so there is no per-class implementation.
 *
 *   inventory  = physically ON the character: carried OR equipped.
 *   owned      = owner_id is the character, wherever the item physically is.
 *   stored     = lying at a structured location; never part of anyone's inventory.
 *
 * Order is deterministic: item ID order (compareIds), so the same snapshot always yields the same list.
 */
type Snapshot = DeepReadonly<CampaignSnapshot>;
export type InventoryItem = Snapshot["items"][number];

const sorted = (items: readonly InventoryItem[]): readonly InventoryItem[] => Object.freeze([...items].sort((a, b) => compareIds(a.id, b.id)));
const item = (s: Snapshot, itemId: string) => s.items.find(i => i.id === itemId);

/** Items carried (not equipped) by the character. */
export function carriedItems(s: Snapshot, characterId: string): readonly InventoryItem[] {
  return sorted(s.items.filter(i => i.position.kind === "carried" && i.position.character_id === characterId));
}
/** Items equipped (worn or held in a slot) by the character. */
export function equippedItems(s: Snapshot, characterId: string): readonly InventoryItem[] {
  return sorted(s.items.filter(i => i.position.kind === "equipped" && i.position.character_id === characterId));
}
/** The character's inventory: everything physically on them (carried + equipped). Ownership is irrelevant here. */
export function inventoryItems(s: Snapshot, characterId: string): readonly InventoryItem[] {
  return sorted(s.items.filter(i => (i.position.kind === "carried" || i.position.kind === "equipped") && i.position.character_id === characterId));
}
/** Everything the character owns, wherever it physically is (on them, on someone else, stored somewhere, unknown). */
export function ownedItems(s: Snapshot, characterId: string): readonly InventoryItem[] {
  return sorted(s.items.filter(i => i.owner_id === characterId));
}
/** Items physically stored/lying at exactly this structured location (no containment walk; no containers in V1). */
export function itemsAtLocation(s: Snapshot, locationId: string): readonly InventoryItem[] {
  return sorted(s.items.filter(i => i.position.kind === "stored" && i.position.location_id === locationId));
}

/** has_item: the item is physically on the character (carried OR equipped). NEVER ownership. */
export const hasItem = (s: Snapshot, characterId: string, itemId: string): boolean => {
  const p = item(s, itemId)?.position; return !!p && (p.kind === "carried" || p.kind === "equipped") && p.character_id === characterId;
};
/** carries_item: carried specifically (not equipped). */
export const carriesItem = (s: Snapshot, characterId: string, itemId: string): boolean => {
  const p = item(s, itemId)?.position; return p?.kind === "carried" && p.character_id === characterId;
};
/** equipped: in one of the character's equipment slots. */
export const equipsItem = (s: Snapshot, characterId: string, itemId: string): boolean => {
  const p = item(s, itemId)?.position; return p?.kind === "equipped" && p.character_id === characterId;
};
/** owns_item: owner_id is the character. Unknown (omitted) and explicitly unowned (null) owners are owned by nobody. */
export const ownsItem = (s: Snapshot, characterId: string, itemId: string): boolean => item(s, itemId)?.owner_id === characterId;
/** item_at: physically stored at exactly this location. Carried/equipped items are with a person, not "at" a place. */
export const itemAt = (s: Snapshot, itemId: string, locationId: string): boolean => {
  const p = item(s, itemId)?.position; return p?.kind === "stored" && p.location_id === locationId;
};
