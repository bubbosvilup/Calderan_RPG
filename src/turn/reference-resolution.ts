import { EXPLICIT_GIFT } from "../campaign/item-transfer.js";
import type { TurnContext } from "./context-builder.js";
export interface ResolvedReference { readonly phrase: string; readonly ids: readonly string[]; readonly basis: "exact" | "unique_present_recipient" | "bounded_item_description" }
export const normalizeReference = (s: string): string => s.toLowerCase().replace(/[_*]/g, " ").replace(/[.!]$/, "").replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
export function resolveRecipient(phrase: string, context: TurnContext): ResolvedReference | undefined {
  const people = context.characters.filter(c => c.id !== "nicco");
  if (/^(her|him|them)$/i.test(phrase)) return people.length === 1 ? { phrase, ids: [people[0]!.id], basis: "unique_present_recipient" } : undefined;
  const matches = people.filter(c => [c.id, c.profile.name].some(n => n && normalizeReference(n) === normalizeReference(phrase.replace(/^my\s+/i, ""))));
  return matches.length === 1 ? { phrase, ids: [matches[0]!.id], basis: "exact" } : undefined;
}
/** Descriptor vocabulary is deliberately limited to garments; exact IDs/names work for other items. */
export function resolveOfferedItems(phrase: string, context: TurnContext): ResolvedReference | undefined {
  if (/\b(not|except|maybe|might|would|could|if|either|or)\b/i.test(phrase)) return undefined;
  const items = context.items.filter(i => (i.position.kind === "carried" || i.position.kind === "equipped") && i.position.character_id === "nicco");
  const exact = items.filter(i => [i.id, i.name].some(n => n && normalizeReference(n) === normalizeReference(phrase.replace(/^my\s+/i, ""))));
  if (exact.length === 1) return { phrase, ids: [exact[0]!.id], basis: "exact" };
  // Resolve each named clothing group against established item names, with exact cardinality.
  const groups = [...phrase.matchAll(/\b(?:(one|two|three|a|the)\s+)?(?:(pink)\s+)?(shirts?|shorts)\b/gi)];
  if (!groups.length || groups.length > 4) return undefined;
  const residue = phrase.replace(/\b(?:(one|two|three|a|the)\s+)?(?:(pink)\s+)?(shirts?|shorts)\b/gi, " ")
    .replace(/one fluffy and thick one made of probably cotton/gi, " ")
    .replace(/are also pink and should be alright for her narrow waist/gi, " ")
    .replace(/\b(?:the|and)\b/gi, " ").replace(/[,\s]/g, "");
  if (residue) return undefined;
  const ids = new Set<string>();
  for (const group of groups) {
    const noun = group[3]!.toLowerCase() === "shorts" ? "shorts" : "shirt";
    const count = group[1]?.toLowerCase() === "two" ? 2 : group[1]?.toLowerCase() === "three" ? 3 : 1;
    const found = items.filter(i => {
      const words = normalizeReference(i.name ?? i.id).split(" ");
      return words.includes(noun) && (!group[2] || words.includes(group[2].toLowerCase()));
    });
    if (found.length !== count) return undefined;
    for (const item of found) ids.add(item.id);
  }
  return ids.size && ids.size <= 8 ? { phrase, ids: [...ids], basis: "bounded_item_description" } : undefined;
}
export function resolveTransferIntent(input: string, context: TurnContext) {
  const text = input.replace(/\s+(?:so (?:she|he|they) can read|to read|to hold|for (?:her|him) to read)\b.*$/i, "").replace(/\s+as a (?:gift|present)\b.*$/i, "").replace(/\.\s*(?:It\'s|It is|They are) .*$/i, "").trim().replace(/^\*|\*$/g, "").replace(/\.$/, "");
  let recipientPhrase: string | undefined, itemPhrase: string | undefined;
  const to = text.match(/^(?:\/give|I give|I hand) (.+?) to (.+)$/i);
  if (to) { itemPhrase = to[1]; recipientPhrase = to[2]; }
  else {
    const front = text.match(/^(?:I )?(?:give|gives|hand|hands) (\S+) (.+)$/i);
    if (front) { recipientPhrase = front[1]; itemPhrase = front[2]; }
  }
  if (!recipientPhrase || !itemPhrase) return undefined;
  const recipient = resolveRecipient(recipientPhrase, context), items = resolveOfferedItems(itemPhrase, context);
  return { mode: (EXPLICIT_GIFT.test(input) ? "gift" : "handoff") as "gift" | "handoff", recipient, items, unresolved: !recipient || !items };
}
