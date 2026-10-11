import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignItem } from "../campaign/types.js";

/**
 * Item visual seam (UI only; never authoritative state, never in a save, never in LLM context). Two separate ROLES:
 *   icon   — small grid artwork;  detail — large artwork loaded only when an item is selected.
 * Precedence per role: specific item visual (a ready generated sprite) > authored template visual (static registry keyed by the item id
 * or its canonical template id) > category fallback glyph > generic placeholder. No path is ever derived from a display name.
 */
export type ItemVisualKind = "document" | "weapon" | "armor" | "clothing" | "headwear" | "footwear" | "consumable" | "tool" | "valuable" | "material" | "misc";
export type ItemVisualSource = "item" | "template" | "category" | "placeholder";
export interface ItemVisualRole { readonly source: ItemVisualSource; readonly url: string }
export interface ItemVisual { readonly kind: ItemVisualKind; readonly icon: ItemVisualRole; readonly detail: ItemVisualRole }
/** Authored per-template artwork: same-origin URLs under /assets/items/ only. Empty until artwork is authored. */
export interface ItemVisualEntry { readonly icon?: string; readonly detail?: string }
export type ItemVisualRegistry = Readonly<Record<string, ItemVisualEntry>>;
export const ITEM_VISUAL_REGISTRY: ItemVisualRegistry = Object.freeze({});
const AUTHORED_URL = /^\/assets\/items\/[a-z0-9_\-]+\.(png|webp|jpg|svg)$/;

const KIND_BY_CATEGORY: Readonly<Record<string, ItemVisualKind>> = { document: "document", weapon: "weapon", armor: "armor", clothing: "clothing", headwear: "headwear", footwear: "footwear",
  consumable: "consumable", food: "consumable", tool: "tool", valuable: "valuable", material: "material", miscellaneous: "misc" };
/** Closed visual kind for an item's authoritative category; uncategorized items use the generic placeholder kind. */
export const itemVisualKind = (category: string | undefined): ItemVisualKind => (category !== undefined && Object.hasOwn(KIND_BY_CATEGORY, category) ? KIND_BY_CATEGORY[category] : undefined) ?? "misc";
export const ITEM_VISUAL_KINDS: readonly ItemVisualKind[] = Object.freeze(["document", "weapon", "armor", "clothing", "headwear", "footwear", "consumable", "tool", "valuable", "material", "misc"]);
export const itemGlyphUrl = (kind: ItemVisualKind | "silhouette") => `/api/item-glyph/${kind}`;

type VisualItem = Pick<DeepReadonly<CampaignItem>, "id" | "origin" | "category">;
interface VisualContext { readonly registry?: ItemVisualRegistry; readonly sprite_url?: string }
const templateEntry = (item: VisualItem, registry: ItemVisualRegistry): ItemVisualEntry | undefined => {
  const keys = [item.id, ...(item.origin.kind === "canonical" ? [item.origin.canonical_entity_id] : [])];
  for (const key of keys) if (Object.hasOwn(registry, key)) return registry[key];
  return undefined;
};
function resolveRole(role: "icon" | "detail", item: VisualItem, context: VisualContext): ItemVisualRole {
  if (context.sprite_url) return { source: "item", url: context.sprite_url };
  const authored = templateEntry(item, context.registry ?? ITEM_VISUAL_REGISTRY)?.[role];
  if (authored && AUTHORED_URL.test(authored)) return { source: "template", url: authored };
  const kind = itemVisualKind(item.category);
  return { source: kind === "misc" && item.category === undefined ? "placeholder" : "category", url: itemGlyphUrl(kind) };
}
/** The icon-role artwork (small grid image). */
export const resolveItemIcon = (item: VisualItem, context: VisualContext = {}): ItemVisualRole => resolveRole("icon", item, context);
/** The detail-role artwork (large image, requested only for the selected item). */
export const resolveItemDetailArtwork = (item: VisualItem, context: VisualContext = {}): ItemVisualRole => resolveRole("detail", item, context);
export const resolveItemVisual = (item: VisualItem, context: VisualContext = {}): ItemVisual =>
  ({ kind: itemVisualKind(item.category), icon: resolveItemIcon(item, context), detail: resolveItemDetailArtwork(item, context) });

const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#c9b27a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
/** Neutral line glyphs (static, no text, no metadata): category fallbacks and the paper-doll silhouette. */
export const ITEM_GLYPHS: Readonly<Record<ItemVisualKind | "silhouette", string>> = Object.freeze({
  document: wrap('<path d="M18 8h20l10 10v38H18z"/><path d="M38 8v10h10M25 28h16M25 36h16M25 44h10"/>'),
  weapon: wrap('<path d="M14 50l30-30 6-12 6 6-12 6-30 30z"/><path d="M12 44l8 8M8 56l6-6"/>'),
  armor: wrap('<path d="M32 6l20 8v16c0 14-9 24-20 28C21 54 12 44 12 30V14z"/><path d="M32 6v52"/>'),
  clothing: wrap('<path d="M22 8l-14 8 6 12 8-4v32h24V24l8 4 6-12-14-8c-2 5-6 8-10 8s-8-3-10-8z"/>'),
  headwear: wrap('<path d="M10 38c0-14 10-24 22-24s22 10 22 24z"/><path d="M6 42h52M10 38v4"/>'),
  footwear: wrap('<path d="M18 10h14v22l20 8c4 2 6 4 6 8v4H12V10z"/><path d="M18 20h14"/>'),
  consumable: wrap('<path d="M26 8h12M28 8v14L16 48c-2 6 2 10 8 10h16c6 0 10-4 8-10L36 22V8"/><path d="M22 40h20"/>'),
  tool: wrap('<path d="M44 8a10 10 0 0 0-9 14L10 47l7 7 25-25a10 10 0 0 0 14-9l-7 6-6-1-1-6z"/>'),
  valuable: wrap('<path d="M32 8l20 14-20 34L12 22z"/><path d="M12 22h40M24 22l8 34 8-34M22 12l10 10 10-10"/>'),
  material: wrap('<path d="M8 40l24-12 24 12-24 12z"/><path d="M8 40v8l24 12 24-12v-8M32 28v24"/>'),
  misc: wrap('<path d="M12 22l20-10 20 10v22L32 54 12 44z"/><path d="M12 22l20 10 20-10M32 32v22"/>'),
  silhouette: wrap('<circle cx="32" cy="12" r="7"/><path d="M20 58V34l-6 8-4-3 8-14c1-2 3-3 5-3h18c2 0 4 1 5 3l8 14-4 3-6-8v24M26 58V40M38 58V40"/>'),
});
export const isItemGlyphName = (value: string): value is ItemVisualKind | "silhouette" => Object.hasOwn(ITEM_GLYPHS, value);
