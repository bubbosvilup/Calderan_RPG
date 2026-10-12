import type { CampaignCommand, CampaignItem, CampaignSnapshot, ItemCategory, TradeGoodsLine, TradeInvalidReason, TradeOfferRecord } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { PreparationContext } from "./preparation.js";
import { fail } from "./validation.js";
import { formatItemId } from "./items.js";
import { itemHolder, transferCharacterPresent } from "./item-transfer.js";
import { activePlayerCharacterId } from "./player-character.js";

/**
 * Actual Offer V1. ONE explicit, player-visible, authoritative trade-offer domain for goods and people.
 *
 * An offer is a record, not a transaction: proposing, superseding, withdrawing and invalidating move no gold, goods, ownership or legal status.
 * Only `accept_trade_offer` settles, and it is issued solely by the player's UI action. Settlement is atomic inside the one revision of its
 * proposal: funds, items, ledger entry and the offer's own status change together or not at all. Gold only, whole numbers only. Goods BUY
 * materializes separate items through the ordinary `create_item` path; goods SELL removes existing authoritative items (V1 simplification:
 * the buyer keeps nothing in tracked state, documented in docs/ITEM_DOMAIN.md); person offers re-prepare their stored plan through the existing
 * person-transaction commands, which stay the single settlement path for people.
 *
 * Rejections use field "trade" with a machine reason code the application layer maps to a player-safe sentence.
 */
export const TRADE_FIELD = "trade";
export const MAX_GOODS_LINES = 8;
export const TRADE_OFFER_ID = /^trade_offer_(\d{8})$/;
export const tradeOfferSequence = (id: string): number | undefined => { const m = TRADE_OFFER_ID.exec(id); return m ? Number(m[1]) : undefined; };
export const formatTradeOfferId = (sequence: number): string => `trade_offer_${String(sequence).padStart(8, "0")}`;
export const isTradeCommand = (c: { readonly kind: string }): boolean => c.kind === "propose_trade_offer" || c.kind === "withdraw_trade_offer" || c.kind === "invalidate_trade_offer" || c.kind === "accept_trade_offer";

const player = (snapshot: DeepReadonly<Pick<CampaignSnapshot, "player_characters">>): string => activePlayerCharacterId(snapshot) ?? "nicco";
/** The one active offer, if any. */
export const activeTradeOffer = <T extends { readonly status: string }>(offers: readonly T[] | undefined): T | undefined => offers?.find(o => o.status === "active");

/**
 * Goods categories are resolved conservatively and never from the model alone: a clear keyword decides, anything else is miscellaneous.
 * Gems, jewellery and coin-like objects count as valuables; food and drink as consumables.
 */
const CATEGORY_WORDS: readonly (readonly [ItemCategory, RegExp])[] = [
  ["weapon", /\b(?:sword|dagger|knife|blade|axe|spear|bow|crossbow|mace|club|halberd|rapier|sabre|saber|javelin|sling|whip|staff|quiver|arrows?|bolts?)\b/i],
  ["armor", /\b(?:armou?r|helm(?:et)?|shield|breastplate|cuirass|gauntlets?|greaves|mail|chainmail|buckler|pauldron)\b/i],
  ["clothing", /\b(?:cloak|boots?|shoes?|sandals?|shirt|tunic|trousers|breeches|robe|dress|gloves?|hat|cap|hood|scarf|belt|coat|jacket|cape|stockings|socks|apron|garments?|clothes|clothing)\b/i],
  ["tool", /\b(?:hammer|saw|chisel|pick(?:axe)?|shovel|spade|rope|lantern|torch|tinderbox|needle|awl|trowel|pliers|file|crowbar|lockpicks?|whetstone|kit|tools?|bucket|flask|waterskin|backpack|satchel|pouch|sack)\b/i],
  ["consumable", /\b(?:bread|loaf|cheese|apple|meat|stew|ale|wine|beer|water|potion|elixir|salve|bandages?|herbs?|rations?|fruit|jerky|oil|mead|tea)\b/i],
  ["document", /\b(?:scroll|letter|map|book|deed|charter|writ|contract|ledger|journal|parchment|note|pass|seal)\b/i],
  ["valuable", /\b(?:gem|jewel|ring|necklace|amulet|pendant|brooch|bracelet|crown|idol|statuette|ingot|pearl|ruby|emerald|sapphire|diamond)\b/i],
  ["material", /\b(?:ore|leather|cloth|timber|plank|iron|steel|copper|wool|silk|hide|fur|bar|thread|nails|resin|wax|clay)\b/i],
];
export function resolveGoodsCategory(name: string): ItemCategory {
  for (const [category, pattern] of CATEGORY_WORDS) if (pattern.test(name)) return category;
  return "miscellaneous";
}

/** An item that goals or mannerisms still point at cannot silently disappear in a sale. */
function itemReferenced(s: DeepReadonly<CampaignSnapshot>, id: string): boolean {
  return s.goals.some(g => g.target?.kind === "item" && g.target.id === id) || s.premium_characters.some(p => (p.mannerisms ?? []).some(m => m.requires_item_id === id))
    || (s.mannerism_learning?.candidates ?? []).some(c => c.requires_item_id === id);
}

/**
 * Why an ACTIVE offer can no longer be settled, or undefined while it can. Pure and deterministic over authoritative state; used by preparation
 * (automatic invalidation in the same revision), by acceptance (revalidation) and by the player-facing view (never shows an unsettleable offer as actionable).
 * Funds are deliberately not a reason: insufficient funds leave the offer active.
 */
export function tradeOfferInvalidReason(s: DeepReadonly<CampaignSnapshot>, offer: DeepReadonly<TradeOfferRecord>): TradeInvalidReason | undefined {
  if (offer.status !== "active") return undefined;
  if (s.runtime.scene.player_location !== offer.location_id) return "scene_changed";
  const who = player(s);
  if (offer.counterparty.kind === "character" && !transferCharacterPresent(s, offer.counterparty.character_id)) return "counterparty_gone";
  const subject = offer.subject;
  if (subject.kind === "items") {
    for (const id of subject.item_ids) { const item = s.items.find(i => i.id === id); if (!item || itemHolder(item) !== who || itemReferenced(s, id)) return "item_unavailable"; if (item.owner_id !== who) return "item_not_owned"; }
  } else if (subject.kind === "person") {
    const registers = subject.plan.find(c => c.kind === "register_character");
    const existing = s.characters.find(c => c.id === subject.subject_character_id);
    if (registers && registers.kind === "register_character") {
      // The narrated person was promoted by another path since the offer was made (same ephemeral reference): this offer is stale.
      const ref = registers.character.origin_snapshot?.ephemeral_ref;
      if (existing || (ref !== undefined && s.characters.some(c => c.origin_snapshot?.ephemeral_ref === ref))) return "person_unavailable";
    } else {
      if ((!existing && !s.runtime.npc_locations.some(n => n.character_id === subject.subject_character_id)) || !transferCharacterPresent(s, subject.subject_character_id)) return "person_unavailable";
      const legal = s.legal_statuses.find(l => l.character_id === subject.subject_character_id);
      const sets = subject.plan.find(c => c.kind === "set_legal_status");
      const transfer = subject.plan.find(c => c.kind === "transfer_person");
      // An anonymous seller sells a person who has no legal record yet; a held person is sold by their present legal holder.
      if (transfer?.kind === "transfer_person" && transfer.from_counterparty) { if (legal) return "person_unavailable"; }
      else if (!sets && (!legal || legal.status !== "enslaved" || (transfer?.kind === "transfer_person" && transfer.from_holder_id !== undefined && legal.holder_id !== transfer.from_holder_id))) return "person_unavailable";
    }
  }
  return undefined;
}

/** The identity of a person offer's subject across turns: a narrated captive by its scene reference, a persistent person by ID (plan IDs are revision-scoped and never compared). */
const personKey = (plan: readonly DeepReadonly<CampaignCommand>[], id: string): string => {
  const registers = plan.find(c => c.kind === "register_character");
  return registers && registers.kind === "register_character" ? `ref:${registers.character.origin_snapshot?.ephemeral_ref ?? registers.character.id}` : `id:${id}`;
};
/**
 * TRD-5: the identity of an offer's TERMS, never of its prose. Direction, price, counterparty and subject identity decide whether a re-proposal
 * is the same standing offer; descriptions, visual descriptions, categories, casing and articles are cosmetic and do not.
 */
const normName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(?:the|a|an|some)\s+/, "");
export function tradeTermsDigest(c: { readonly direction: string; readonly price_gold: number; readonly counterparty: DeepReadonly<TradeOfferRecord["counterparty"]>; readonly subject: DeepReadonly<TradeOfferRecord["subject"]> }): string {
  const who = c.counterparty.kind === "character" ? `character:${c.counterparty.character_id}` : `label:${normName(c.counterparty.label)}`;
  const subject = c.subject.kind === "goods" ? `goods:${c.subject.lines.map(l => normName(l.name)).sort().join("|")}`
    : c.subject.kind === "items" ? `items:${[...c.subject.item_ids].sort().join("|")}` : `person:${personKey(c.subject.plan, c.subject.subject_character_id)}`;
  return JSON.stringify([c.direction, c.price_gold, who, subject]);
}
const sameOffer = (a: DeepReadonly<TradeOfferRecord>, c: Extract<CampaignCommand, { kind: "propose_trade_offer" }>): boolean => tradeTermsDigest(a) === tradeTermsDigest(c);

/** Preparation-time dispatch of the existing domain commands a settlement reuses (create_item, transfer_person, ...). */
export type CommandDispatch = (command: CampaignCommand) => void;

export function prepareTradeCommand(context: PreparationContext, command: CampaignCommand, dispatch: CommandDispatch): boolean {
  const { draft, refs } = context;
  const nextRevision = draft.revision + 1;
  const offers = () => draft.trade_offers ??= [];
  const find = (id: string) => offers().find(o => o.id === id) ?? fail("offer_id", "unknown trade offer");
  const funds = (id: string) => draft.funds.find(f => f.character_id === id);
  switch (command.kind) {
    case "propose_trade_offer": {
      const who = player(draft), subject = command.subject;
      if (command.counterparty.kind === "character") { refs.character(command.counterparty.character_id); if (command.counterparty.character_id === who) fail(TRADE_FIELD, "counterparty_is_player"); if (!transferCharacterPresent(draft, command.counterparty.character_id)) fail(TRADE_FIELD, "counterparty_absent"); }
      if (subject.kind === "goods") {
        if (command.direction !== "buy") fail(TRADE_FIELD, "goods_lines_are_for_buying");
        if (!subject.lines.length || subject.lines.length > MAX_GOODS_LINES || subject.lines.some(l => !l.name.trim())) fail(TRADE_FIELD, "invalid_goods_lines");
      } else if (subject.kind === "items") {
        if (command.direction !== "sell") fail(TRADE_FIELD, "items_are_for_selling");
        if (!subject.item_ids.length || subject.item_ids.length > MAX_GOODS_LINES) fail(TRADE_FIELD, "invalid_item_list");
        for (const id of subject.item_ids) {
          const item = draft.items.find(i => i.id === id);
          if (!item) fail(TRADE_FIELD, "unknown_item");
          if (itemHolder(item) !== who) fail(TRADE_FIELD, "item_not_held_by_player");
          // TRD-1: holding is not owning. A sale needs the seller to be the item's recorded owner (unknown or other owners cannot be sold).
          if (item.owner_id !== who) fail(TRADE_FIELD, "item_not_owned");
          if (itemReferenced(draft, id)) fail(TRADE_FIELD, "item_unavailable");
        }
      } else {
        if (command.direction !== "buy") fail(TRADE_FIELD, "person_sale_unsupported");
        const transfer = subject.plan.find(c => c.kind === "transfer_person");
        if (!transfer || transfer.kind !== "transfer_person" || transfer.transaction_kind !== "sale" || transfer.to_holder_id !== who || transfer.payment?.gold !== command.price_gold || transfer.payment.payer_id !== who) fail(TRADE_FIELD, "person_plan_mismatch");
        if (transfer.character_id !== subject.subject_character_id) fail(TRADE_FIELD, "person_plan_mismatch");
      }
      // Re-proposing the identical standing offer (the narrator repeating a quote) is one offer, not a new one.
      const standing = activeTradeOffer(offers());
      if (standing && sameOffer(standing, command)) return true;
      if (standing) { standing.status = "superseded"; standing.resolved_revision = nextRevision; }
      const sequence = Math.max(0, ...offers().map(o => tradeOfferSequence(o.id) ?? 0)) + 1;
      if (sequence > 99_999_999) fail(TRADE_FIELD, "offer_id_space_exhausted");
      offers().push({ id: formatTradeOfferId(sequence), direction: command.direction, status: "active", price_gold: command.price_gold, counterparty: structuredClone(command.counterparty),
        subject: structuredClone(command.subject), location_id: draft.runtime.scene.player_location, created_revision: nextRevision, created_minute: draft.runtime.scene.world_time.world_minute,
        ...(command.evidence ? { evidence: command.evidence } : {}) });
      return true;
    }
    case "withdraw_trade_offer": {
      const offer = find(command.offer_id);
      if (offer.status !== "active") fail(TRADE_FIELD, "offer_not_active");
      offer.status = "withdrawn"; offer.resolved_revision = nextRevision; return true;
    }
    case "invalidate_trade_offer": {
      const offer = find(command.offer_id);
      if (offer.status !== "active") fail(TRADE_FIELD, "offer_not_active");
      offer.status = "invalidated"; offer.invalid_reason = command.reason; offer.resolved_revision = nextRevision; return true;
    }
    case "accept_trade_offer": {
      const offer = find(command.offer_id), who = player(draft), minute = draft.runtime.scene.world_time.world_minute;
      if (offer.status !== "active") fail(TRADE_FIELD, `offer_${offer.status}`);
      const stale = tradeOfferInvalidReason(draft, offer);
      if (stale) fail(TRADE_FIELD, `offer_invalid_${stale}`);
      const purse = funds(who)?.gold ?? 0;
      const settlement: NonNullable<TradeOfferRecord["settlement"]> = { gold: offer.price_gold, revision: nextRevision, world_minute: minute };
      const subject = offer.subject;
      if (subject.kind === "goods") {
        if (purse < offer.price_gold) fail(TRADE_FIELD, "insufficient_funds");
        const ids: string[] = [];
        const provenance = offer.counterparty.kind === "character" ? offer.counterparty.character_id : undefined;
        for (const line of subject.lines) {
          const id = formatItemId(draft.next_item_sequence);
          const create: Extract<CampaignCommand, { kind: "create_item" }> = { kind: "create_item", name: line.name, description: line.description, visual_description: line.visual_description,
            category: resolveGoodsCategory(`${line.name}`), owner_id: who, position: { kind: "carried", character_id: who } };
          dispatch(create);
          const created = draft.items.find(i => i.id === id) as CampaignItem | undefined;
          if (!created) fail(TRADE_FIELD, "item_creation_failed");
          created.acquisition = { acquisition_kind: "purchase", acquired_at: minute, ...(provenance ? { from_character_id: provenance } : {}) };
          ids.push(id);
        }
        const record = funds(who); if (!record) fail(TRADE_FIELD, "insufficient_funds");
        record.gold = purse - offer.price_gold;
        settlement.created_item_ids = ids;
      } else if (subject.kind === "items") {
        // TRD-1b: a sale TRANSFERS the very same item out of the seller's custody; it never destroys it. The buyer is the offer's persistent
        // character (who then holds and owns it), or, for an anonymous counterparty, the generic external custody: position `unknown`, owner `null`
        // (no merchant inventory and no invented character). Either way the item keeps its identity and the settlement records where it went.
        const removed: string[] = [], names: string[] = [];
        const buyer = offer.counterparty.kind === "character" ? offer.counterparty.character_id : undefined;
        for (const id of subject.item_ids) {
          const item = draft.items.find(i => i.id === id);
          if (!item || itemHolder(item) !== who) fail(TRADE_FIELD, "offer_invalid_item_unavailable");
          if (item.owner_id !== who) fail(TRADE_FIELD, "offer_invalid_item_not_owned");
          if (item.position.kind === "equipped") {
            const c = draft.characters.find(x => x.id === who);
            if (c) c.current.empty_slots = [...new Set([...(c.current.empty_slots ?? []), item.position.slot])].sort();
          }
          names.push((item.name ?? "Item").slice(0, 120));
          if (buyer) { item.position = { kind: "carried", character_id: buyer }; item.owner_id = buyer; item.acquisition = { acquisition_kind: "purchase", acquired_at: minute, from_character_id: who }; }
          else { item.position = { kind: "unknown" }; item.owner_id = null; }
          removed.push(id);
        }
        const total = purse + offer.price_gold;
        if (!Number.isSafeInteger(total) || total > 1_000_000_000) fail(TRADE_FIELD, "funds_overflow");
        const record = funds(who);
        if (record) record.gold = total; else draft.funds.push({ character_id: who, gold: total });
        settlement.removed_item_ids = removed.sort(); settlement.removed_item_names = names;
        settlement.custody = buyer ? { kind: "character", character_id: buyer } : { kind: "external" };
      } else {
        const transfer = subject.plan.find(c => c.kind === "transfer_person");
        if (purse < offer.price_gold) fail(TRADE_FIELD, "insufficient_funds");
        // A narrated captive is promoted by the settlement itself: the promotion is stamped with the revision and minute it actually commits at.
        for (const stored of subject.plan) {
          const step = structuredClone(stored) as CampaignCommand;
          if (step.kind === "register_character" && step.character.origin_snapshot) step.character.origin_snapshot = { ...step.character.origin_snapshot, promoted_revision: nextRevision, promoted_world_minute: minute };
          dispatch(step);
        }
        if (transfer?.kind === "transfer_person") settlement.transaction_id = transfer.transaction_id;
      }
      offer.status = "accepted"; offer.resolved_revision = nextRevision; offer.settlement = settlement;
      return true;
    }
    default: return false;
  }
}

/**
 * Automatic, deterministic invalidation: after any change is applied to the draft, every active offer that can no longer be settled is
 * invalidated in the SAME revision. Never moves anything; it only withdraws actionability.
 */
export function invalidateStaleOffers(draft: CampaignSnapshot): void {
  const nextRevision = draft.revision + 1;
  for (const offer of draft.trade_offers ?? []) {
    if (offer.status !== "active") continue;
    const reason = tradeOfferInvalidReason(draft, offer);
    if (reason) { offer.status = "invalidated"; offer.invalid_reason = reason; offer.resolved_revision = nextRevision; }
  }
}
export type { TradeGoodsLine };
