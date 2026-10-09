import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { ENGINE_ITEM_ID } from "../campaign/items.js";
import { inventoryItems, itemsAtLocation } from "../campaign/inventory.js";
import type { WorldStore } from "../world/world-store.js";

/**
 * Item Domain V1 projection seams (see docs/architecture/ITEM_DOMAIN.md).
 *  - Controller: stable identity. Relevant materialized items reach it with their engine ID, owner and position, so a later operation
 *    can target the exact instance (TurnContext.items for present people, TurnContext.items_here for items lying at the scene).
 *  - Narrator: human-readable only. Engine-allocated IDs (campaign_item_NNNNNNNN) and allocator bookkeeping never enter narrator prose
 *    context. No inventory dump is added; Permanent Inventory decides later what the narrator sees each turn.
 */
type Item = DeepReadonly<CampaignSnapshot>["items"][number];
export const isEngineItem = (item: { readonly id: string }) => ENGINE_ITEM_ID.test(item.id);

/** Items lying at a location (V1 "stored" position), in snapshot order. Controller context only. */
export function itemsAt(snapshot: DeepReadonly<CampaignSnapshot>, locationId: string): readonly Item[] {
  return itemsAtLocation(snapshot, locationId);
}
/** Narrator-facing view of an item record: engine identity and creation bookkeeping removed; authored/legacy IDs unchanged. */
export function narratorItemView<T extends { readonly id: string; readonly created_revision?: number; readonly visual_description?: string; readonly sprite?: unknown }>(item: T): Partial<T> {
  const { created_revision: _revision, visual_description: _visual, sprite: _sprite, ...rest } = item;
  if (!isEngineItem(item)) return rest as Partial<T>;
  const { id: _id, ...named } = rest;
  return named as Partial<T>;
}
/**
 * Permanent Inventory V1: human-readable inventory lines for ANY persistent character (player, campaign NPC, NPC+), derived from
 * CampaignItem positions via the domain helpers, e.g. ["Ivory figurine (owned by Brenna)", "Iron sword [equipped]"]. Never IDs.
 * A reusable projection for future UI/context policy; it is not injected into narrator turns by itself.
 */
export function inventoryLines(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, characterId: string, nameOf: (id: string) => string, options: { readonly owners?: boolean } = {}): string[] {
  return inventoryItems(snapshot, characterId).map(i => {
    const canonical = i.origin.kind === "canonical" ? world.getEntity(i.origin.canonical_entity_id) : undefined;
    const label = i.name ?? canonical?.name ?? "an unnamed item";
    const owner = options.owners !== false && i.owner_id && i.owner_id !== characterId ? ` (owned by ${nameOf(i.owner_id)})` : "";
    return `${label}${i.position.kind === "equipped" ? " [equipped]" : ""}${owner}`;
  });
}
