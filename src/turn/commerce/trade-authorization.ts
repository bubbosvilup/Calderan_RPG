import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import type { TurnContext } from "../context/context-builder.js";
import type { AuthorizationDiagnostic } from "../turn-types.js";
import { itemHolder, transferCharacterPresent } from "../../campaign/item-transfer.js";
import { activePlayerCharacterId } from "../../campaign/player-character.js";
import { activeTradeOffer, isTradeCommand } from "../../campaign/trade.js";
import { EVIDENCE_QUOTE_MAX } from "../../llm/controller-schema.js";
import { AUCTION } from "./trade-price.js";
import { createFactSource, type NarrationFactSource } from "../narration-facts/index.js";
import { inSegment, unsupportedMoney, withdrawalIn } from "./commerce-evidence.js";
import { escapeRegExp as esc, sentencesOf } from "../language/text.js";

/**
 * Actual Offer V1: authorization of the Controller's trade proposals (propose and withdraw). The Controller proposes; this decides, on
 * deterministic evidence only: a verbatim quote from the delivered-narration draft that states the price, whole GOLD only, no auction wording,
 * no question or hypothetical, and goods/items/counterparty that the scene and the authoritative state actually contain. A rejection changes nothing.
 * Settlement is not in this module and cannot be: `accept_trade_offer` has no Controller or narration path at all.
 */
export const isTradeProposal = (c: CampaignCommand): boolean => isTradeCommand(c);
const STOP = new Set(["the", "a", "an", "of", "and", "with", "for", "in", "on", "to", "pair", "set", "some", "old", "new", "small", "large", "little", "big"]);
const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(?:the|a|an|some)\s+/, "");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 2 && !STOP.has(w));

const PERSON_GOODS = /\b(?:ones?|woman|women|girls?|men|man|boys?|slaves?|captives?|prisoners?|laundress|workers?|child|children|persons?|people|lass|lad|maid|servants?)\b/i;

/** The player's own words say THEY are the seller ("I want to sell my sword", "how much will you pay me for it"). */
const SELL_CUE = /\bsell(?:ing)?\b|\b(?:pay|give|offer|bid)\s+(?:me|us)\b|\bbuy\b[^.!?]{0,30}\bfrom me\b|\bwould you (?:buy|take)\b/i;
/**
 * The Controller sometimes encodes "a party pays Nicco for his own item" as a BUY of same-named goods. When EVERY goods line names an item Nicco holds
 * and the player's own words say he is selling, the only coherent reading is a SELL of exactly those items: reframe it (same price, counterparty and
 * quote) and let the ordinary validator decide. Without the player's sell cue nothing is reframed (buying a second copy of something one already holds is legitimate;
 * the card is shown to the player before any gold moves).
 */
export function reframeOwnItemPurchase(command: CampaignCommand, projected: DeepReadonly<CampaignSnapshot>, playerInput: string): CampaignCommand {
  if (command.kind !== "propose_trade_offer" || command.direction !== "buy" || command.subject.kind !== "goods" || !SELL_CUE.test(playerInput)) return command;
  const who = activePlayerCharacterId(projected) ?? "nicco";
  const own = projected.items.filter(i => itemHolder(i) === who && i.owner_id === who && i.name);
  const ids: string[] = [];
  for (const line of command.subject.lines) {
    const n = normName(line.name);
    const hits = n ? own.filter(i => { const o = normName(i.name!); return o === n || o.includes(n) || n.includes(o); }) : [];
    if (hits.length !== 1 || ids.includes(hits[0]!.id)) return command;
    ids.push(hits[0]!.id);
  }
  return { ...command, direction: "sell", subject: { kind: "items", item_ids: ids } };
}

export interface TradeProposalInput { readonly command: CampaignCommand; readonly quote: string | undefined }
/**
 * Decides every trade proposal of one turn. `proposed` carries the Controller's commands with their evidence quotes (same order as the proposal).
 * Returns one diagnostic per input.
 */
export function authorizeTradeProposals(inputs: readonly TradeProposalInput[], narration: string, context: TurnContext, projected: DeepReadonly<CampaignSnapshot>, world: WorldStore | undefined, factSource?: NarrationFactSource): AuthorizationDiagnostic[] {
  const text = squash(narration), who = activePlayerCharacterId(projected) ?? "nicco";
  // The SAME commerce facts every other consumer of this text reads (the coordinator hands its source; direct callers get one built from the context).
  const source = factSource ?? createFactSource({ movers: [], context }), draftFacts = source.of(narration);
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
      if (!withdrawalIn(draftFacts, q)) return no("withdrawal_not_stated");
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
    const money = unsupportedMoney(draftFacts, sentence) ?? unsupportedMoney(draftFacts, q);
    if (money === "currency" || source.quote(q, []).some(f => f.kind === "unsupported_money" && f.form === "currency")) return no("unsupported_currency");
    if (AUCTION.test(sentence) || AUCTION.test(q) || auctionPlace) return no("auction_not_an_offer", "auction_bid_not_offer");
    const subjectWords = command.subject.kind === "goods" ? command.subject.lines.flatMap(l => wordsOf(l.name)) : command.subject.kind === "items" ? command.subject.item_ids.flatMap(id => wordsOf(projected.items.find(i => i.id === id)?.name ?? "")) : [];
    const quoteFacts = source.quote(q, subjectWords), quoted = quoteFacts.filter(f => f.kind === "price_quote");
    // A quote that states its price only as a question, condition, refusal or supposition is not a concrete offer.
    if (quoted.length && !quoted.some(f => f.modality === "completed") || /\?/.test(q)) return no("not_a_concrete_offer", "hypothetical_or_question");
    if (money === "fraction" || quoteFacts.some(f => f.kind === "unsupported_money" && f.form === "fraction")) return no("fractional_price", "unsupported_currency");
    // The player's own figure is a counteroffer, never the seller's price: a quote the narration attributes to Nicco cannot back an offer.
    if (draftFacts.commerce.some(f => f.kind === "price_quote" && f.quote_role === "player_counter" && inSegment(f, q))) return no("player_counter_not_offer", "player_counter_not_offer");
    const stated = quoted.flatMap(f => f.kind === "price_quote" && f.modality === "completed" && f.quote_kind === "current" ? [f.amount] : []);
    if (!stated.includes(command.price_gold)) return no("price_not_in_quote");
    if (new Set(stated).size > 1 && !new RegExp(`\\b(?:total|altogether|for the (?:lot|pair|set|both|all))\\b`, "i").test(q)) return no("several_prices_in_quote");
    // The goods or items must be in the scene's narration around the quote, never invented by the proposal.
    const window = text.slice(Math.max(0, at - 400), at + q.length + 400).toLowerCase();
    const mentions = (name: string) => wordsOf(name).some(w => new RegExp(`\\b${esc(w)}`, "i").test(window));
    // A person is never goods: a "line" that is a person ("The debt-settlement one", "the laundress") is the engine's person offer or nothing.
    if (command.subject.kind === "goods" && command.subject.lines.some(l => PERSON_GOODS.test(l.name))) return no("goods_is_a_person", "person_offer_not_controller");
    if (command.subject.kind === "goods") { if (!command.subject.lines.every(l => mentions(l.name))) return no("goods_not_in_scene", "goods_not_in_narration"); }
    else if (command.subject.kind === "items") {
      for (const id of command.subject.item_ids) {
        const item = projected.items.find(i => i.id === id);
        if (!item || itemHolder(item) !== who) return no("item_not_held", "item_not_held_by_player");
        if (item.owner_id !== who) return no("item_not_owned", "item_not_owned");
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
    const hit = c.kind === "create_item" ? [...goods].some(g => key(c.name) === g || key(c.name).includes(g) || g.includes(key(c.name))) : (c.kind === "transfer_item" || c.kind === "place_item") && ids.has(c.item_id);
    return hit ? { ...d, authorized: false, reason: "rejected_command_not_allowed" as const, source: "rejected" as const, code: "trade_settles_through_offer", signals: [...(d.signals ?? []), "trade_settles_through_offer"] } : d;
  });
}
