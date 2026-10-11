import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { inventoryVisualView } from "./item-visual-view.js";
import { itemGlyphUrl, resolveItemVisual, type ItemVisual, type ItemVisualRegistry } from "./item-visuals.js";

/**
 * Inventory / Equipment UI read model (display only). Possession is the engine's derived inventory; this module only classifies and
 * decorates it for the screen. Nothing here is persisted, no state is repaired, and none of it reaches the narrator, the controller,
 * retrieval, the scene projection or any lore.
 */
export const EQUIPMENT_SLOTS = Object.freeze([{ id: "head", label: "Head" }, { id: "chest", label: "Chest" }, { id: "weapon", label: "Weapon" }, { id: "boots", label: "Boots" }] as const);
export type EquipmentSlotId = (typeof EQUIPMENT_SLOTS)[number]["id"];
/**
 * The ONLY slot mapping: the item's authoritative category. Never a name, description or slot-string guess. The engine has no
 * headwear/footwear category yet (see the evaluation), so Head and Boots stay empty until it does; the table already accepts them.
 */
const SLOT_BY_CATEGORY: Readonly<Record<string, EquipmentSlotId>> = Object.freeze({ weapon: "weapon", armor: "chest", headwear: "head", footwear: "boots" });
export const equipmentSlotFor = (category: string | undefined): EquipmentSlotId | null => category !== undefined && Object.hasOwn(SLOT_BY_CATEGORY, category) ? SLOT_BY_CATEGORY[category]! : null;

export interface InventoryUiItem {
  readonly id: string; readonly name: string; readonly description: string | null;
  readonly category: string | null; readonly category_label: string;
  readonly position: { readonly kind: "carried" | "equipped"; readonly slot?: string; readonly mode?: "worn" | "held" };
  readonly state_label: string; readonly equipped: boolean;
  /** Owner shown only when the item is Nicco's possession but belongs to someone else (never names the owner). */
  readonly held_for_other: boolean;
  readonly sprite_status: "none" | "pending" | "failed" | "ready";
  /** Same-origin URL of the ready generated sprite (the specific item visual), else absent. */
  readonly sprite_url?: string;
  readonly visual: ItemVisual;
}
export interface EquipmentSlotView { readonly id: EquipmentSlotId; readonly label: string; readonly item_ids: readonly string[]; readonly conflict: boolean }
export interface InventoryUiView {
  readonly campaign_id: string; readonly revision: number;
  /** Authoritative current funds (snapshot.funds), or null when Nicco has no tracked purse. */
  readonly gold: number | null;
  readonly counts: { readonly total: number; readonly carried: number; readonly equipped: number };
  readonly items: readonly InventoryUiItem[];
  readonly equipment: { readonly slots: readonly EquipmentSlotView[]; readonly unclassified_equipped: readonly string[]; readonly full_body_url: string | null; readonly silhouette_url: string };
}
const title = (value: string) => value.replaceAll("_", " ");
export function inventoryUiView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, options: {
  readonly player_id?: string; readonly full_body_url?: string | null; readonly registry?: ItemVisualRegistry; readonly sprite_url?: (itemId: string) => string } = {}): InventoryUiView {
  const player = options.player_id ?? "nicco";
  const owners = new Map(snapshot.items.map(i => [i.id, i.owner_id] as const));
  const items: InventoryUiItem[] = inventoryVisualView(snapshot, player, world).map(raw => {
    const equipped = raw.position.kind === "equipped";
    const sprite_url = raw.sprite_status === "ready" ? options.sprite_url?.(raw.id) : undefined;
    const owner = owners.get(raw.id);
    return { id: raw.id, name: raw.name, description: raw.description ?? null, category: raw.category ?? null, category_label: title(raw.category ?? "miscellaneous"),
      position: raw.position.kind === "equipped" ? { kind: "equipped" as const, slot: raw.position.slot, mode: raw.position.mode } : { kind: "carried" as const },
      state_label: raw.position.kind === "equipped" ? `Equipped · ${title(raw.position.slot)} · ${raw.position.mode === "worn" ? "worn" : "held"}` : "Carried",
      equipped, ...(sprite_url ? { sprite_url } : {}), held_for_other: typeof owner === "string" && owner !== player, sprite_status: raw.sprite_status,
      visual: resolveItemVisual({ id: raw.id, origin: snapshot.items.find(i => i.id === raw.id)!.origin, ...(raw.category ? { category: raw.category } : {}) }, { ...(options.registry ? { registry: options.registry } : {}), ...(sprite_url ? { sprite_url } : {}) }) };
  });
  const equippedItems = items.filter(i => i.equipped), bySlot = new Map<EquipmentSlotId, string[]>();
  const unclassified: string[] = [];
  for (const item of equippedItems) {
    const slot = equipmentSlotFor(item.category ?? undefined);
    if (slot) bySlot.set(slot, [...(bySlot.get(slot) ?? []), item.id]); else unclassified.push(item.id);
  }
  return { campaign_id: snapshot.campaign_id, revision: 0, gold: snapshot.funds.find(f => f.character_id === player)?.gold ?? null,
    counts: { total: items.length, carried: items.length - equippedItems.length, equipped: equippedItems.length }, items,
    equipment: { slots: EQUIPMENT_SLOTS.map(s => ({ id: s.id, label: s.label, item_ids: bySlot.get(s.id) ?? [], conflict: (bySlot.get(s.id)?.length ?? 0) > 1 })),
      unclassified_equipped: unclassified, full_body_url: options.full_body_url ?? null, silhouette_url: itemGlyphUrl("silhouette") } };
}
