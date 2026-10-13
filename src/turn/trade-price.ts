import { NUMBER_PHRASE_SOURCE, numberPhraseValue, numberWordValue } from "./language/numbers.js";

/**
 * Actual Offer: THE price grammar (TRD-3/TRD-4). One reader for goods authorization and person offers, so the two can never disagree about what
 * a price is. A number is a price only when it is attached to gold or scoped by a concrete-offer form; an age, a duration or a quantity is not.
 *
 * Gold only, whole numbers only. Silver, copper, marks, fractions and the like are reported as `unsupported` and NEVER converted: ECO-1 (a real
 * currency model) is a future product decision. Material and descriptive words ("silver locket", "silver-haired") are not currency: a currency
 * is a unit attached to a numeric expression ("ten silver", "5 copper pieces") or a coin noun ("a silver coin").
 */
export type PriceForm = "gold_unit" | "for_price" | "bargain" | "addressed" | "price_noun" | "subject_is" | "quoted_bare" | "bare_sentence";
export interface PriceStatement { readonly amount: number; readonly currency: "gold"; readonly span: string; readonly form: PriceForm }
export interface PriceReading {
  readonly statements: readonly PriceStatement[];
  /** Set when the text states money the engine does not settle (a non-gold currency or a fractional amount). No amount is reported then. */
  readonly unsupported?: "currency" | "fraction";
}
export interface PriceContext {
  /** True only where the text is already known to be the price statement of one concrete offer (a verified Controller quote, a resolved seller's speech). Scoped forms need it. */
  readonly concrete?: boolean;
  readonly prev?: string | undefined;
  readonly next?: string | undefined;
  /** Words naming the offer's subject: "the halberd is fifteen" prices the halberd only when the subject is named. */
  readonly subjects?: readonly string[];
}

const NUM = `(${NUMBER_PHRASE_SOURCE})`;
/** Spoken hundreds shorthand: "two-sixty" is 260, "three fifty" 350 (a unit digit then a tens/teen compound). */
function shorthandValue(phrase: string): number | undefined {
  const [unit, ...rest] = phrase.trim().toLowerCase().split(/[\s-]+/);
  const hundreds = unit ? numberWordValue(unit) : undefined;
  const tail = rest.length ? numberPhraseValue(rest.join(" ")) : undefined;
  return hundreds !== undefined && hundreds > 0 && hundreds < 10 && tail !== undefined && tail >= 10 && tail < 100 ? hundreds * 100 + tail : undefined;
}
export const priceValue = (s: string): number | undefined => numberPhraseValue(s) ?? shorthandValue(s);

const CURRENCY_WORD = "(?:silvers?|coppers?|bronze|platinum|crowns?|marks?|pennies|penny|pence|farthings?|shillings?|sovereigns?|florins?|ducats?|denarii|denarius)(?![-\\w])";
const COIN_NOUN = "(?:pieces?|coins?|bits?)";
/** A currency is a unit on a number ("ten silver", "5 copper pieces", "three marks") or a coin ("a silver coin", "coins of silver"). */
const CURRENCY = new RegExp(`\\b${NUM}\\s+${CURRENCY_WORD}|\\b(?:silver|copper|bronze|platinum)\\s+${COIN_NOUN}\\b|\\b${COIN_NOUN} of (?:silver|copper|bronze|platinum)\\b`, "i");
const FRACTION = /\b(?:half|quarter|third|fraction)\b[^.!?]{0,24}\b(?:gold|gp)\b|\b(?:gold|gp)\b[^.!?]{0,12}\b(?:half|quarter)\b|\b\d+\.\d+\s*(?:gold|gp|g)\b|\b\d+\/\d+\s*(?:gold|gp)\b/i;
/** Auction wording: bids, lots and hammers belong to a different (future) system and never create ordinary offers. */
export const AUCTION = /\b(?:auctions?|auctioneers?|bids?|bidding|bidders?|gavel|hammer price|lot (?:number|\d+)|going once|going twice|reserve price|high bid|increments?)\b/i;

const REJECTS = /\b(?:off|too (?:low|little|cheap)|no\b|not (?:a|going|enough)|never|insult\w*|won'?t|can'?t|nowhere near|laughable)\b/i;
/** A number that is an age, a duration or a count, not money. Checked around an otherwise bare number. */
const NOT_MONEY = /\b(?:years?|old|aged?|born|winters?|summers?|minutes?|hours?|days?|nights?|weeks?|months?|seconds?|moments?|paces?|steps?|miles?)\b/i;
const BARGAIN = `(?:(?:i'?ll|i will|we'?ll|i can|i could)\\s+(?:go|do|take|say|sell (?:her|him|them) (?:for|at)|let (?:her|him|them) go (?:for|at))|make it|let'?s say|call it|say|down to|settle (?:on|for|at)|(?:i'?d|i would) (?:take|do|settle for)|asking(?: price)?(?: is)?|the price is|how about|lowest i'?ll go is|best i can do is)`;
/** What may follow a scoped number: the end of the clause, or a word that continues a price ("fifteen for the halberd"), never a counted noun ("ten minutes", "three swords"). */
const PRICE_END = "(?=\\s*(?:[.,;:!?\"”')]|$)|\\s+(?:gold|gp|for|each|apiece|and|or|but|if|then|only|flat|final|even|the|it|her|him|them|that|this|as|said|please)\\b)";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The prices one sentence states (with the evidence span of each), or the unsupported-money verdict. */
export function readPrices(sentence: string, ctx: PriceContext = {}): PriceReading {
  if (CURRENCY.test(sentence)) return { statements: [], unsupported: "currency" };
  if (FRACTION.test(sentence)) return { statements: [], unsupported: "fraction" };
  const out: PriceStatement[] = [];
  const take = (form: PriceForm, re: RegExp) => { for (const m of sentence.matchAll(re)) { const raw = m[1] ?? m[2] ?? m[3]; const v = raw === undefined ? undefined : priceValue(raw); if (v !== undefined) out.push({ amount: v, currency: "gold", span: m[0].trim(), form }); } };
  // Always a price: a number attached to gold. "300 gold", "300g", "three hundred gold pieces", "15 gp".
  take("gold_unit", new RegExp(`\\b${NUM}\\s*(?:gold(?:\\s+(?:pieces?|coins?|crowns?))?|gp)\\b`, "gi"));
  take("gold_unit", /\b(\d[\d,]*)\s?g\b(?![-\w])/gi);
  if (!ctx.concrete) return { statements: out };
  // Scoped forms: only where the text is the price statement of one concrete offer.
  take("for_price", new RegExp(`\\bfor\\s+${NUM}${PRICE_END}`, "gi"));
  take("quoted_bare", new RegExp(`["“]\\s*${NUM}\\s*(?:gold)?\\s*[.!,]?\\s*["”]`, "gi"));
  take("quoted_bare", new RegExp(`["“]\\s*${NUM}\\s*\\.`, "gi"));
  take("addressed", new RegExp(`\\b${NUM}\\s+(?:gold\\s+)?(?:for|apiece)\\s+(?:her|him|them|that one|this one|the (?:woman|girl|man|boy|lad|lass|slave|captive))\\b`, "gi"));
  take("bargain", new RegExp(`\\b${BARGAIN}\\s+(?:to |for |at )?${NUM}${PRICE_END}`, "gi"));
  take("price_noun", new RegExp(`\\b${NUM}(?:'s|’s|\\s+is)\\s+(?:the |my |her |his )?(?:number|price|figure|asking(?: price)?|offer)\\b`, "gi"));
  for (const name of ctx.subjects ?? []) if (name.length > 2) take("subject_is", new RegExp(`\\b${escape(name)}\\w*\\s+(?:is|costs?|goes for|will be|comes to)\\s+(?:only |just )?${NUM}${PRICE_END}`, "gi"));
  if (out.length) return { statements: dedupe(out) };
  // A sentence that is only a number ("Five."), unless a neighbour makes it an age, a duration or a rejected figure.
  const bare = sentence.match(new RegExp(`^\\s*${NUM}\\s*(?:gold)?\\s*[.,!]?\\s*$`, "i"));
  const v = bare ? priceValue(bare[1]!) : undefined;
  const neighbours = [ctx.prev, sentence, ctx.next].filter((x): x is string => !!x);
  if (v === undefined || (ctx.next && REJECTS.test(ctx.next)) || neighbours.some(n => NOT_MONEY.test(n))) return { statements: [] };
  return { statements: [{ amount: v, currency: "gold", span: sentence.trim(), form: "bare_sentence" }] };
}
function dedupe(list: PriceStatement[]): PriceStatement[] {
  const seen = new Set<number>();
  return list.filter(s => { const k = s.amount; if (seen.has(k)) return false; seen.add(k); return true; });
}
