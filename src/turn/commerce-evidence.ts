import type { CommerceFact, NarrationFacts, PriceQuoteFact, TransferClaimFact } from "./narration-facts/index.js";
import { escapeRegExp as esc } from "./language/text.js";

/**
 * Commerce POLICY over shared NarrationFacts. The facts say what a text states (a number, who stands behind it, a withdrawal, a claim that
 * money or a person changed hands); this module decides what that is worth: which quote is actionable, which quotes are only negotiation,
 * which claims contradict the authoritative state. Nothing here parses narration grammar (the facts did), and nothing here settles anything.
 *
 * INVARIANTS (also in docs/evaluations/CONSOLIDATION_BLOCK10_NARRATIONFACTS_COMMERCE.md)
 *  - A player counteroffer is NOT a seller offer: only a seller-voiced, current, completed quote is ever actionable.
 *  - The latest concrete seller quote supersedes the earlier one (the state machine records the supersession; this decides which quote is "latest").
 *  - Several different prices in one sentence are ambiguous: nothing is chosen.
 *  - Narration cannot settle a trade: payment / transfer / settlement are CLAIMS the audit compares with the authoritative state.
 */
const norm = (s: string): string => s.replace(/[*"“”]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
/** True when `segment` (a consumer's unit of text: a sentence, a quote, a plain line) contains the text a fact was read from, or the fact's text contains the segment. */
export const inSegment = (fact: CommerceFact, segment: string | undefined): boolean => {
  if (segment === undefined) return true;
  const a = norm(segment), b = norm(fact.source_text);
  return !!b && !!a && (a.includes(b) || b.includes(a));
};

export interface SellerQuote { readonly amount: number; readonly sentence: string; readonly fact: PriceQuoteFact; readonly group: string }
const groupOf = (f: CommerceFact) => `${f.span.sentence_index}:${f.span.clause_index}`;

/**
 * Recipient policy (Block 11): a price line explicitly addressed to somebody other than Nicco is not an offer to the player. Only the explicit forms
 * count: a narrated "says to X" around the line (the whole line), or a vocative in the price's own sentence ("Brenna, a hundred."). An addressee
 * that is ambiguous ("says to her" with two women present) or unresolved fails closed. The weaker "tells her" / "turns to him" beat is not used:
 * a seller often instructs the captive in the same breath as quoting the buyer.
 */
const addressedElsewhere = (facts: NarrationFacts, f: PriceQuoteFact): boolean => facts.identity.some(r => r.kind === "recipient_attribution" && r.recipient.entity_id !== "nicco"
  && (r.form === "says_to" ? inSegment(f, r.source_text) : r.form === "vocative" && inSegment(f, r.source_text) && new RegExp(`\\b${esc(r.recipient.surface)}\\b`, "i").test(f.sentence)));

/** Prices a seller voice STATES as the current price TO THE PLAYER, in the segment (or everywhere): completed, a current quote, never the player's own figure. */
export function sellerQuotes(facts: NarrationFacts, segment?: string): readonly SellerQuote[] {
  return facts.commerce.flatMap(f => f.kind === "price_quote" && f.voice !== "player_input" && f.modality === "completed" && f.quote_kind === "current"
    && (f.quote_role === "seller_ask" || f.quote_role === "seller_counter") && inSegment(f, segment) && !addressedElsewhere(facts, f) ? [{ amount: f.amount, sentence: f.sentence, fact: f, group: groupOf(f) }] : []);
}
/** Amounts only (the shape the person-offer reader works with). */
export const sellerPrices = (facts: NarrationFacts, segment?: string): number[] => sellerQuotes(facts, segment).map(q => q.amount);

export type ActionableQuote = { readonly kind: "quote"; readonly quote: SellerQuote } | { readonly kind: "ambiguous"; readonly amounts: readonly number[] } | { readonly kind: "none" };
/**
 * The quote that would be an Actual Offer: the LAST statement group among the seller's quotes. When that group states several different prices
 * ("The first is 90 gold, the second 120 gold") no price is chosen.
 */
export function actionableQuote(quotes: readonly SellerQuote[]): ActionableQuote {
  const last = quotes.at(-1);
  if (!last) return { kind: "none" };
  const same = quotes.filter(q => q.group === last.group), amounts = [...new Set(same.map(q => q.amount))];
  return amounts.length > 1 ? { kind: "ambiguous", amounts } : { kind: "quote", quote: last };
}

/** Money the engine does not settle (silver, marks, fractions), stated in the segment. */
export const unsupportedMoney = (facts: NarrationFacts, segment?: string): "currency" | "fraction" | undefined =>
  facts.commerce.find(f => f.kind === "unsupported_money" && f.voice !== "player_input" && inSegment(f, segment))?.form as "currency" | "fraction" | undefined;

/** A completed withdrawal of the standing offer stated inside `quote` (a verbatim span of the delivered text). */
export const withdrawalIn = (facts: NarrationFacts, quote: string): boolean =>
  facts.commerce.some(f => f.kind === "offer_withdrawn" && f.modality === "completed" && norm(quote).includes(norm(f.span.text)));

/** The player's own figures (their counteroffers) in the facts of their input. Never an offer. */
export const playerCounters = (inputFacts: readonly CommerceFact[]): readonly number[] => inputFacts.flatMap(f => f.kind === "price_quote" && f.modality === "completed" && f.quote_kind === "current" ? [f.amount] : []);

export interface SettlementClaim { readonly sentence: string; readonly fact: CommerceFact }
/**
 * Completed claims that a trade was paid, delivered or closed. `standing`: a standing offer exists (any such claim contradicts the state;
 * hand-overs count only for the offer's goods, `words`). Otherwise `negotiation`: a person trade is being discussed (payment, a closed
 * deal, ownership and papers). Both are only ever flagged: they never change state.
 */
export function settlementClaims(facts: NarrationFacts, scope: { readonly standing: boolean; readonly words?: readonly string[] }): readonly SettlementClaim[] {
  const wordSet = scope.words ?? [];
  const seen = new Set<string>(), out: SettlementClaim[] = [];
  for (const f of facts.commerce) {
    if (f.modality !== "completed") continue;
    const hit = f.kind === "payment_claim" ? (scope.standing || f.form === "pay_verb" || f.form === "hands_changed")
      : f.kind === "settlement_claim" || (f.kind === "transfer_claim" && f.form !== "goods_handover") ? true
      : f.kind === "transfer_claim" && f.form === "goods_handover" ? scope.standing && handsOverGoods(f, wordSet) : false;
    if (hit && !seen.has(f.sentence)) { seen.add(f.sentence); out.push({ sentence: f.sentence, fact: f }); }
  }
  return out;
}
const handsOverGoods = (f: TransferClaimFact, words: readonly string[]): boolean => !!f.object_phrase && words.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(f.object_phrase!));
