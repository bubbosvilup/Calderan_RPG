import type { CampaignSnapshot, TradeCounterparty, TradeOfferRecord } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import { activeTradeOffer } from "../../campaign/trade.js";
import { activePlayerCharacterId } from "../../campaign/player-character.js";

/**
 * Actual Offer V1: what the NARRATOR is told about the trade state. A pending offer is only an offer; a completed one is a fact. These are
 * authoritative notes for narration (names are fine here: the narrator already works with real names under its own masking rules), never
 * player-facing text. The player-facing card is built separately and masked (app/trade-offer-view.ts).
 */
const partyName = (s: DeepReadonly<CampaignSnapshot>, world: WorldStore | undefined, c: DeepReadonly<TradeCounterparty>): string => {
  if (c.kind === "anonymous") return c.label;
  const record = s.characters.find(x => x.id === c.character_id);
  const e = world?.getEntity(record?.origin.kind === "canonical" ? record.origin.canonical_entity_id : c.character_id);
  return record?.profile.name ?? record?.origin_snapshot?.label ?? (e?.type === "character" ? e.name : "the other party");
};
const subjectName = (s: DeepReadonly<CampaignSnapshot>, o: DeepReadonly<TradeOfferRecord>): string => {
  const sub = o.subject;
  if (sub.kind === "goods") return sub.lines.map(l => l.name).join(", ");
  if (sub.kind === "items" && o.settlement?.removed_item_names?.length) return o.settlement.removed_item_names.join(", ");
  if (sub.kind === "items") return sub.item_ids.map(id => s.items.find(i => i.id === id)?.name ?? "an item").join(", ");
  const registers = sub.plan.find(c => c.kind === "register_character");
  const record = registers?.kind === "register_character" ? registers.character : s.characters.find(c => c.id === sub.subject_character_id);
  return record?.profile.name ?? record?.origin_snapshot?.label ?? "the person";
};
export function describeOffer(s: DeepReadonly<CampaignSnapshot>, world: WorldStore | undefined, o: DeepReadonly<TradeOfferRecord>): string {
  const other = partyName(s, world, o.counterparty), what = subjectName(s, o);
  return o.direction === "buy" ? `${other} offers to sell Nicco ${what} for ${o.price_gold} gold` : `${other} offers to buy ${what} from Nicco for ${o.price_gold} gold`;
}
const purse = (s: DeepReadonly<CampaignSnapshot>): number => s.funds.find(f => f.character_id === (activePlayerCharacterId(s) ?? "nicco"))?.gold ?? 0;
export function tradeStateNotes(s: DeepReadonly<CampaignSnapshot>, world?: WorldStore): string[] {
  const notes: string[] = [], offers = s.trade_offers ?? [];
  const active = activeTradeOffer(offers);
  if (active) notes.push(`TRADE OFFER PENDING (authoritative): ${describeOffer(s, world, active)}. It is only an offer: nothing is paid, delivered or transferred, and nothing changes until Nicco accepts it with the accept control of the game interface. Spoken agreement, "deal", or acting out payment does not complete it: do not narrate the payment, the handover or any change of ownership as having happened. Characters may keep negotiating, quote a new price, wait for the acceptance, or withdraw the offer.${active.direction === "buy" && purse(s) < active.price_gold ? ` Nicco has only ${purse(s)} gold, which does not cover the ${active.price_gold} gold price: he cannot accept it yet.` : ""}`);
  const done = offers.filter(o => o.status === "accepted" && o.settlement && s.revision - o.settlement.revision <= 2 + (o.settlement.created_item_ids?.length ?? 0)).at(-1);
  if (done) notes.push(`TRADE COMPLETED (authoritative, already settled by the game): ${describeOffer(s, world, done).replace(" offers to sell Nicco ", " sold Nicco ").replace(" offers to buy ", " bought ").replace(" from Nicco for ", " from Nicco for ")}; ${done.settlement!.gold} gold changed hands. Treat it as done and do not repeat or re-ask for payment.`);
  return notes;
}
