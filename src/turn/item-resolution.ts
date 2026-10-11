import { escapeRegExp as esc } from "./language/text.js";
import { itemCategories } from "./item-reference.js";

/**
 * Item reference resolution (Pre-Property Debt Zero Pass). ONE deterministic, bounded way to say "does this phrase refer to this tracked
 * item", shared by player-intent binding and by evidence verification, so the two can never disagree about an alias.
 *
 * Reference words of an item, in order of authority:
 *  1. the significant tokens of its exact normalized name ("plain iron sword" -> plain, iron, sword; the full phrase also matches);
 *  2. the bounded category words that the name itself implies (item-reference.ts: sword/dagger/knife -> weapon, blade; boots -> footwear);
 *  3. its authored category when the category is a safe generic ("weapon").
 * Nothing else: no thesaurus, no embeddings. A noun with no entry (a satchel is not "a bag": the category enum has no container) simply
 * has no synonym. An alias that two items share is never a reason to pick one; callers treat it as ambiguity.
 */
export interface RefItem {
  readonly id: string; readonly name?: string | undefined; readonly category?: string | undefined; readonly owner_id?: string | null | undefined;
  readonly position: { readonly kind: string; readonly character_id?: string; readonly location_id?: string };
}
const STOP = new Set(["the", "a", "an", "my", "your", "his", "her", "their", "our", "this", "that", "these", "those", "some", "of", "to", "and", "in", "on", "at", "it", "its", "is", "are", "was", "were", "has", "have", "been", "be", "for", "with", "by", "from", "off", "up", "down"]);
/** An authored category that is a safe generic noun for its members. */
const CATEGORY_WORD: Readonly<Record<string, string>> = Object.freeze({ weapon: "weapon" });
export const wordsOf = (text: string): string[] => text.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(w => w && !STOP.has(w));
const singular = (w: string) => w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;

/** Lower-case reference words of an item (name tokens, head-class words, safe category word), deduplicated, in name order. */
export function referenceWords(item: Pick<RefItem, "name" | "category">): string[] {
  const name = wordsOf(item.name ?? "").filter(w => w.length >= 3).map(singular);
  // The existing bounded category registry (Repair 1.1: footwear, clothing, weapon/blade, jewelry) plus the authored category when it is a safe generic.
  const out = [...name, ...itemCategories({ id: "", name: item.name }), ...(item.category && CATEGORY_WORD[item.category] ? [CATEGORY_WORD[item.category]!] : [])];
  return [...new Set(out)];
}
/** Does `text` contain one of the item's reference words as a whole word (plural allowed)? */
export const mentionsItem = (text: string, item: Pick<RefItem, "name" | "category">): boolean =>
  referenceWords(item).some(w => new RegExp(`\\b${esc(w)}(?:e?s)?\\b`, "i").test(text));

export type Resolution = { readonly status: "unique"; readonly id: string } | { readonly status: "ambiguous"; readonly ids: readonly string[] } | { readonly status: "none" };
export interface ResolveEnv {
  /** Known people for possessive qualifiers: display tokens (lower-case) to character id. "my"/"your" map to the actor. */
  readonly people: ReadonlyMap<string, string>;
  readonly actor: string;
}
/**
 * Resolve a noun phrase against a pool of candidate items using only authoritative properties: name tokens, head class, category word,
 * the owner ("Brenna's sword", "my sword"), and the holder ("the sword in Nicco's hand"). Positional chatter that is not state ("by the
 * fireplace") is ignored, never used to pick. One unique match wins; an exact full-name match breaks a tie; otherwise ambiguous.
 */
export function resolveItemPhrase(phrase: string, pool: readonly RefItem[], env: ResolveEnv): Resolution {
  const text = phrase.toLowerCase().replace(/[’]/g, "'").trim();
  if (!text) return { status: "none" };
  let ownerId: string | undefined, holderId: string | undefined, stripped = text;
  stripped = stripped.replace(/\b(?:in|held by|carried by)\s+(?:(my|your)|([a-z][a-z' ]*?)'s)\s+(?:hands?|grasp|grip|arms?)\b/g, (_, mine: string | undefined, who: string | undefined) => { holderId = mine ? env.actor : env.people.get((who ?? "").trim()); return " "; });
  stripped = stripped.replace(/\b(?:(my|your)|([a-z][a-z']*?)'s)\s+/g, (_, mine: string | undefined, who: string | undefined) => { ownerId = mine ? env.actor : env.people.get(who ?? "") ?? "__unknown__"; return " "; });
  const tokens = wordsOf(stripped).map(singular).filter(w => !["floor", "ground", "here", "there", "table", "shelf"].includes(w));
  if (!tokens.length) return { status: "none" };
  const holds = (i: RefItem) => (i.position.kind === "carried" || i.position.kind === "equipped") ? i.position.character_id : undefined;
  let matches = pool.filter(i => { const ref = new Set(referenceWords(i)); return tokens.every(t => ref.has(t)); });
  if (ownerId) matches = matches.filter(i => ownerId !== "__unknown__" && (i.owner_id === ownerId || holds(i) === ownerId));
  if (holderId) matches = matches.filter(i => holds(i) === holderId);
  if (ownerId === "__unknown__") return { status: "none" };
  if (matches.length === 1) return { status: "unique", id: matches[0]!.id };
  if (matches.length === 0) return { status: "none" };
  // An exact full-name match ("iron sword" when exactly one item is named that) breaks the tie; a class word never does.
  const exact = matches.filter(i => wordsOf(i.name ?? "").map(singular).join(" ") === tokens.join(" "));
  return exact.length === 1 ? { status: "unique", id: exact[0]!.id } : { status: "ambiguous", ids: matches.map(i => i.id) };
}
/** Items of the pool that share a reference word with `target` (its rivals for an ambiguous mention). */
export const rivalsOf = (target: RefItem, pool: readonly RefItem[]): RefItem[] => {
  const mine = new Set(referenceWords(target));
  return pool.filter(i => i.id !== target.id && referenceWords(i).some(w => mine.has(w)));
};
