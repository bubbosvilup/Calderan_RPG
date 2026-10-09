import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { ENGINE_ITEM_ID } from "../campaign/items.js";

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
  return snapshot.items.filter(i => i.position.kind === "stored" && i.position.location_id === locationId);
}
/** Narrator-facing view of an item record: engine identity and creation bookkeeping removed; authored/legacy IDs unchanged. */
export function narratorItemView<T extends { readonly id: string; readonly created_revision?: number }>(item: T): Partial<T> {
  const { created_revision: _revision, ...rest } = item;
  if (!isEngineItem(item)) return rest as Partial<T>;
  const { id: _id, ...named } = rest;
  return named as Partial<T>;
}
/** Human-readable carried-item lines for a future inventory section, e.g. "Ivory figurine (owned by the merchant)". Never IDs. */
export function narratorCarriedLines(items: readonly Item[], characterId: string, nameOf: (id: string) => string): string[] {
  return items.filter(i => i.position.kind === "carried" && i.position.character_id === characterId)
    .map(i => `${i.name ?? "an unnamed item"}${i.owner_id && i.owner_id !== characterId ? ` (owned by ${nameOf(i.owner_id)})` : ""}`);
}
