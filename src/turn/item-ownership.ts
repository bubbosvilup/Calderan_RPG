import type { CampaignCommand } from "../campaign/types.js";
import { escapeRegExp as esc } from "./language/text.js";
import { sentencesOf } from "./language/text.js";
import { referenceWords } from "./item-resolution.js";

/**
 * Pre-Property Debt Zero: create_item facts that must come from the narration or the player's own words, never from inference.
 *
 * OWNERSHIP is independent of existence and placement. A created item's `owner_id` is kept only when a sentence that names the item ALSO
 * establishes the owner: a possessive naming them ("Brenna's ledger", "the innkeeper's cup"), "belongs to / owned by / property of X",
 * an explicit permanent giving or sale naming them ("a gift for Brenna", "sold to Brenna", "Brenna's now"), or, for the player, "my/mine/his own".
 * Being mentioned, discovered, carried or stood next to is NOT ownership. When the owner is not evidenced the item is still created, just
 * with no owner (diagnostic signal `ownership_not_evidenced`); nothing else about the command changes.
 */
export function ownerEvidenced(command: Extract<CampaignCommand, { kind: "create_item" }>, narration: string, playerInput: string, ownerNames: readonly string[]): boolean {
  if (typeof command.owner_id !== "string") return true;
  const tokens = [...new Set(ownerNames.flatMap(n => n.toLowerCase().split(/[\s_]+/)).filter(t => t.length >= 3 && !/^(?:the|lord|lady|sir|dame|master|mistress|old|young)$/.test(t)))];
  const item = referenceWords({ name: command.name, category: command.category }).map(esc).join("|");
  if (!tokens.length || !item) return false;
  const who = tokens.map(esc).join("|");
  const own = `(?:${who})`;
  const sentences = sentencesOf(narration.replace(/[*_`]/g, "")).filter(s => new RegExp(`\\b(?:${item})(?:e?s)?\\b`, "i").test(s));
  const forms = [
    new RegExp(`\\b${own}['’]s\\s+(?:[\\w-]+\\s+){0,3}(?:${item})\\b`, "i"),
    new RegExp(`\\b(?:belongs?|belonged|belonging)\\s+to\\s+(?:\\w+\\s+){0,2}${own}\\b`, "i"),
    new RegExp(`\\b(?:owned|owner)\\s+(?:by|is)\\s+(?:\\w+\\s+){0,2}${own}\\b`, "i"),
    new RegExp(`\\bproperty\\s+of\\s+(?:\\w+\\s+){0,2}${own}\\b`, "i"),
    new RegExp(`\\b(?:gift|present|keepsake)\\s+(?:for|to)\\s+(?:\\w+\\s+){0,2}${own}\\b`, "i"),
    new RegExp(`\\b(?:sold|sells|gives?|gave|presents?|presented)\\s+(?:it\\s+|the\\s+[\\w-]+\\s+|a\\s+[\\w-]+\\s+)?(?:to\\s+)?${own}\\b[^.!?]*\\b(?:for\\s+(?:keeps|good)|to\\s+keep|as\\s+a\\s+gift|his\\s+now|hers\\s+now|yours\\s+now|theirs\\s+now)\\b`, "i"),
    new RegExp(`\\b${own}['’]s\\s+now\\b`, "i"),
    // A lender lending HIS/HER/THEIR item (the lend rules already require lender = owner); lending "the" or "a" item says nothing.
    new RegExp(`\\b${own}\\s+(?:lends?|lent|loans?|loaned)\\s+(?:his|her|their)\\s+(?:[\\w-]+\\s+){0,2}(?:${item})\\b`, "i"),
  ];
  if (sentences.some(s => forms.some(f => f.test(s)))) return true;
  // The player's own claim of his property, in his own words ("my iron cup", "mine", "his own"), counts for Nicco only.
  if (command.owner_id === "nicco") return /\b(?:my|mine|his\s+own)\b/i.test(playerInput) && new RegExp(`\\b(?:${item})(?:e?s)?\\b`, "i").test(playerInput);
  return false;
}

const COUNTS: Readonly<Record<string, number>> = { two: 2, three: 3, four: 4, five: 5, twin: 2, pair: 2, couple: 2, both: 2 };
/**
 * How many identical copies of the named object the narration ESTABLISHES ("Two identical iron cups", "a pair of daggers", "three torches").
 * Default 1: a repeated mention of one object ("the cup ... the cup") never multiplies it. Capped at 5.
 */
export function establishedCount(name: string, narration: string): number {
  const words = referenceWords({ name, category: undefined }).map(esc);
  if (!words.length) return 1;
  const noun = `(?:${words.join("|")})(?:e?s)?`;
  const re = new RegExp(`\\b(two|three|four|five|twin|both|a\\s+(?:pair|couple)\\s+of)\\s+(?:identical\\s+|matching\\s+|twin\\s+|plain\\s+|similar\\s+)?(?:[\\w-]+\\s+){0,2}?${noun}\\b`, "i");
  const m = re.exec(narration.replace(/[*_`]/g, ""));
  if (!m) return 1;
  const key = m[1]!.toLowerCase().replace(/^a\s+/, "").replace(/\s+of$/, "");
  return Math.min(5, COUNTS[key] ?? 1);
}
