/**
 * Repair 1.1: bounded item references for evidence. An item is referenced by the head noun of its own name, or by a category
 * word ("footwear" for boots) when that category is derived from the item's own name/description AND no other item in the
 * given pool shares it. Ambiguity therefore still rejects: two pieces of footwear make "the footwear" refer to neither.
 */
const CATEGORIES: readonly (readonly [RegExp, readonly string[]])[] = [
  [/\b(?:boots?|shoes?|sandals?|slippers?|clogs?)\b/i, ["footwear"]],
  [/\b(?:shirts?|tunics?|coats?|cloaks?|trousers|breeches|dress(?:es)?|skirts?|jackets?|shorts|vests?)\b/i, ["clothing", "clothes", "garment", "garments"]],
  [/\b(?:swords?|daggers?|knives|knife|axes?|maces?|spears?)\b/i, ["weapon", "blade"]],
  [/\b(?:rings?|necklaces?|bracelets?|brooch(?:es)?|amulets?|pendants?)\b/i, ["jewelry", "jewellery", "trinket"]],
];
interface ItemLike { readonly id: string; readonly name?: string | undefined; readonly description?: string | undefined }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const headNoun = (item: ItemLike) => (item.name ?? item.id).toLowerCase().split(/[^a-z']+/).filter(Boolean).at(-1)!;
export function itemCategories(item: ItemLike): readonly string[] {
  const text = `${item.name ?? item.id} ${item.description ?? ""}`;
  return CATEGORIES.flatMap(([pattern, words]) => pattern.test(text) ? words : []);
}
/** Alternation (regex source, no groups) of words that uniquely reference `item` among `pool`. */
export function itemTerms(item: ItemLike, pool: readonly ItemLike[]): string {
  const others = pool.filter(i => i.id !== item.id).flatMap(itemCategories);
  const unique = itemCategories(item).filter(w => !others.includes(w));
  return [headNoun(item), ...unique].map(esc).join("|");
}
