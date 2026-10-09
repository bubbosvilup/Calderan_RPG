import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { inventoryItems } from "../campaign/inventory.js";
import type { WorldStore } from "../world/world-store.js";

/** Future player cards: internal visual prose never leaves this projection. */
export function itemVisualView(item: DeepReadonly<CampaignSnapshot>["items"][number], world?: WorldStore) {
  const canon = item.origin.kind === "canonical" ? world?.getEntity(item.origin.canonical_entity_id) : undefined;
  return { id: item.id, name: item.name ?? canon?.name ?? "Unnamed item", description: item.description ?? canon?.summary,
    category: item.category, sprite_status: item.sprite?.status ?? "none",
    ...(item.sprite?.status === "ready" ? { sprite_asset_ref: item.sprite.asset_ref } : {}), position: item.position };
}
export const inventoryVisualView = (snapshot: DeepReadonly<CampaignSnapshot>, characterId: string, world?: WorldStore) =>
  inventoryItems(snapshot, characterId).map(i => itemVisualView(i, world));
