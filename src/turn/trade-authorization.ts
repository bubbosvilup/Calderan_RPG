import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import type { AuthorizationDiagnostic } from "./turn-types.js";
import { itemHolder, transferCharacterPresent } from "../campaign/item-transfer.js";
import { activePlayerCharacterId } from "../campaign/player-character.js";
import { activeTradeOffer, isTradeCommand } from "../campaign/trade.js";
import { EVIDENCE_QUOTE_MAX } from "../llm/controller-schema.js";
import { NUMBER_PHRASE_SOURCE, numberPhraseValue } from "./language/numbers.js";
import { escapeRegExp as esc, sentencesOf } from "./language/text.js";

/**
 * Actual Offer V1: authorization of the Controller's trade proposals (propose and withdraw). The Controller proposes; this decides, on
 * deterministic evidence only: a verbatim quote from the delivered-narration draft that states the price, whole GOLD only, no auction wording,
 * no question or hypothetical, and goods/items/counterparty that the scene and the authoritative state actually contain. A rejection changes nothing.
 * Settlement is not in this module and cannot be: `accept_trade_offer` has no Controller or narration path at all.
 */
export const isTradeProposal = (c: CampaignCommand): boolean => isTradeCommand(c);
/** Any currency other than gold in the sentence that quotes the price: no actionable offer (clear unsupported-currency reason). */
const NON_GOLD = /\b(?:silvers?|coppers?|bronze|platinum|crowns?|marks?|pennies|penny|farthings?|shillings?|sovereigns?|florins?|ducats?|denarii|denarius|coins? of (?:silver|copper|bronze))\b/i;
/** Auction wording: bids, lots and hammers belong to a different (future) system and never create ordinary offers. */
const AUCTION = /\b(?:auctions?|auctioneers?|bids?|bidding|bidders?|gavel|hammer price|lot (?:number|\d+)|going once|going twice|reserve price)\b/i;
const HYPOTHETICAL = /\?|\b(?:if|maybe|perhaps|might|could|would|should|supposing|suppose|how much|what(?:'s| is) (?:the|your) price|name your price|haggl\w*|negotiat\w*)\b/i;
const FRACTION = /\b(?:half|quarter|third|fraction)\b|\d\.\d|\d\/\d/i;
const WITHDRAWAL = /\b(?:withdraws?|withdrew|refuses?|refused|no longer|not for sale|changes? (?:his|her|their) mind|changed (?:his|her|their) mind|takes? (?:it|them) back|off the table|won'?t sell|will not sell|not selling|sold (?:it|them) (?:to|already)|offer (?:is )?(?:gone|off|withdrawn)|pulls? (?:it|them) back|put[s]? (?:it|them) away)\b/i;
const STOP = new Set(["the", "a", "an", "of", "and", "with", "for", "in", "on", "to", "pair", "set", "some", "old", "new", "small", "large", "little", "big"]);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 2 && !STOP.has(w));

/** Whole-gold amounts the sentence states: "five gold", "5 gold", "for five", "five." (a quoted bare number). */
export function statedGold(sentence: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`\\b(${NUMBER_PHRASE_SOURCE})\\s*(?:gold(?:\\s+(?:pieces?|coins?|crowns?))?|gp)\\b|\\bfor\\s+(${NUMBER_PHRASE_SOURCE})\\b|["“]\\s*(${NUMBER_PHRASE_SOURCE})\\s*[.!,]`, "gi");
  for (const m of sentence.matchAll(re)) { const v = numberPhraseValue(m[1] ?? m[2] ?? m[3]!); if (v !== undefined) out.push(v); }
  return out;
}

export interface TradeProposalInput { readonly command: CampaignCommand; readonly quote: string | undefined }
/**
 * Decides every trade proposal of one turn. `proposed` carries the Controller's commands with their evidence quotes (same order as the proposal).
 * Returns one diagnostic per input.
 */
export function authorizeTradeProposals(inputs: readonly TradeProposalInput[], narration: string, context: TurnContext, projected: DeepReadonly<CampaignSnapshot>, world: WorldStore | undefined): AuthorizationDiagnostic[] {
  const text = squash(narration), who = activePlayerCharacterId(projected) ?? "nicco";
  const location = projected.runtime.scene.player_location;
  const place = world?.getEntity(location);
  const auctionPlace = !!place && /\bauction/i.test(`${place.name} ${place.display_name}`);
  const decide = (command: CampaignCommand, quote: string | undefined, authorized: boolean, check: string, code?: string): AuthorizationDiagnostic => ({ command, authorized,
    reason: authorized ? "authorized_controller_evidence" : "rejected_insufficient_confirmation", source: authorized ? "evidence" : "rejected", grammar: { authorized: false, reason: "trade_proposals_have_no_grammar_path" },
    evidence: { quote: quote ?? null, verified: authorized, check }, ...(code ? { code, signals: [code] } : {}) });
  return inputs.map(({ command, quote }): AuthorizationDiagnostic => {
    const no = (check: string, code = check) => decide(command, quote, false, check, code);
    if (command.kind === "withdraw_trade_offer") {
      const standing = activeTradeOffer(projected.trade_offers);
      if (!standing || standing.id !== command.offer_id) return no("withdraw_not_standing", "offer_not_active");
      if (!quote) return no("no_quote");
      const q = squash(quote), at = text.indexOf(q);
      if (q.length < 8 || q.length > EVIDENCE_QUOTE_MAX || at < 0) return no("quote_not_verbatim");
      if (!WITHDRAWAL.test(q)) return no("withdrawal_not_stated");
      return decide(command, quote, true, "withdrawal_stated");
    }
    if (command.kind !== "propose_trade_offer") return no("trade_kind_not_allowed", "trade_kind_not_allowed");
    // Person offers come only from the engine's scene reading, never from the Controller.
    if (command.subject.kind === "person") return { ...no("person_offer_not_controller", "person_offer_not_controller"), reason: "rejected_command_not_allowed" };
    if (!quote) return no("no_quote");
    const q = squash(quote), at = text.indexOf(q);
    if (q.length < 8 || q.length > EVIDENCE_QUOTE_MAX) return no("quote_length");
    if (at < 0) return no("quote_not_verbatim");
    // The containing sentence(s) decide currency and auction wording even when the quote is only the price clause.
    const sentence = sentencesOf(text).filter(s => s.includes(q) || q.includes(s) || text.indexOf(s) < at + q.length && text.indexOf(s) + s.length > at).join(" ") || q;
    if (NON_GOLD.test(sentence) || NON_GOLD.test(q)) return no("unsupported_currency");
    if (AUCTION.test(sentence) || AUCTION.test(q) || auctionPlace) return no("auction_not_an_offer", "auction_bid_not_offer");
    if (HYPOTHETICAL.test(q)) return no("not_a_concrete_offer", "hypothetical_or_question");
    if (FRACTION.test(q)) return no("fractional_price", "unsupported_currency");
    const stated = statedGold(q);
    if (!stated.includes(command.price_gold)) return no("price_not_in_quote");
    if (new Set(stated).size > 1 && !new RegExp(`\\b(?:total|altogether|for the (?:lot|pair|set|both|all))\\b`, "i").test(q)) return no("several_prices_in_quote");
    // The goods or items must be in the scene's narration around the quote, never invented by the proposal.
    const window = text.slice(Math.max(0, at - 400), at + q.length + 400).toLowerCase();
    const mentions = (name: string) => wordsOf(name).some(w => new RegExp(`\\b${esc(w)}`, "i").test(window));
    if (command.subject.kind === "goods") { if (!command.subject.lines.every(l => mentions(l.name))) return no("goods_not_in_scene", "goods_not_in_narration"); }
    else if (command.subject.kind === "items") {
      for (const id of command.subject.item_ids) {
        const item = projected.items.find(i => i.id === id);
        if (!item || itemHolder(item) !== who) return no("item_not_held", "item_not_held_by_player");
        if (!mentions(item.name ?? "")) return no("item_not_in_scene", "goods_not_in_narration");
      }
    }
    if (command.counterparty.kind === "character") {
      const id = command.counterparty.character_id;
      if (id === who || !transferCharacterPresent(projected, id) || !context.characters.some(c => c.id === id)) return no("counterparty_not_present");
    } else if (!wordsOf(command.counterparty.label).some(w => new RegExp(`\\b${esc(w)}`, "i").test(text))) return no("counterparty_not_in_scene");
    return decide(command, quote, true, "concrete_gold_offer_stated");
  });
}

/**
 * A purchase or sale is settled by its trade offer alone. A create_item / transfer_item that would also materialize or move the very goods of a
 * pending or just-proposed offer is withdrawn, so spoken agreement or narrated payment can never settle through the ordinary item path.
 */
export function vetoSettlementThroughItems(decided: readonly AuthorizationDiagnostic[], projected: DeepReadonly<CampaignSnapshot>): AuthorizationDiagnostic[] {
  const pending = [activeTradeOffer(projected.trade_offers), ...decided.filter(d => d.authorized && d.command.kind === "propose_trade_offer").map(d => d.command)].filter(o => o !== undefined);
  const subjects = pending.map(o => ("subject" in o ? o.subject : undefined)).filter(s => s !== undefined);
  const key = (name: string) => name.trim().toLowerCase().replace(/^(?:the|a|an)\s+/, "");
  const goods = new Set(subjects.flatMap(s => s.kind === "goods" ? s.lines.map(l => key(l.name)) : []));
  const ids = new Set(subjects.flatMap(s => s.kind === "items" ? s.item_ids : []));
  return decided.map(d => {
    if (!d.authorized) return d;
    const c = d.command;
    const hit = c.kind === "create_item" ? [...goods].some(g => key(c.name) === g || key(c.name).includes(g) || g.includes(key(c.name))) : c.kind === "transfer_item" && ids.has(c.item_id);
    return hit ? { ...d, authorized: false, reason: "rejected_command_not_allowed" as const, source: "rejected" as const, code: "trade_settles_through_offer", signals: [...(d.signals ?? []), "trade_settles_through_offer"] } : d;
  });
}
