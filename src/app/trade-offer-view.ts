import { createHash } from "node:crypto";
import type { CampaignCharacter, CampaignSnapshot, TradeCounterparty, TradeOfferRecord } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { activePlayerCharacterId } from "../campaign/player-character.js";
import { activeTradeOffer } from "../campaign/trade.js";
import { knownCreatedName, playerCharacterProjection } from "./player-character-view.js";

/**
 * Actual Offer V1: the player-facing projection of the trade-offer domain. Plain JSON, derived from the authoritative snapshot, masked.
 *
 * Absolute identity masking: this view NEVER carries a hidden name, a character ID, a canonical ID, an avatar token or lore. An unknown enslaved
 * person is "Slave", or "<visible descriptor> Slave" when a safe visible descriptor was established, and nothing else. A counterparty follows the
 * same rule through the shared character projection. After a legitimate name reveal the SAME offer (same opaque ref) re-renders with the name: the
 * subject token never changes and no alias exists. The browser holds only the offer ref; settlement carries the ref and the revision, nothing else.
 */
export interface TradeCard {
  /** Opaque offer token (sha256 of campaign and offer ID); never the internal ID. */
  readonly ref: string;
  readonly direction: "buy" | "sell";
  readonly kind: "goods" | "person";
  /** Player-safe label of the other party. */
  readonly counterparty: string;
  readonly price_gold: number;
  /** Goods or item names (BUY: what is offered; SELL: what Nicco would give up), or the single person label. */
  readonly lines: readonly string[];
  /** Person offers only: the masked label and whether the name is legitimately known. */
  readonly person?: { readonly label: string; readonly name_known: boolean };
  /** BUY only: Nicco's tracked gold covers the price (a hint; the engine decides at acceptance). */
  readonly affordable: boolean | null;
  readonly gold: number | null;
  readonly summary: string;
}
export interface TradeNotice { readonly ref: string; readonly status: "withdrawn" | "invalidated"; readonly text: string }
export interface TradeReceipt { readonly ref: string; readonly direction: "buy" | "sell"; readonly kind: "goods" | "person"; readonly gold: number; readonly summary: string }
export interface TradeView { readonly offer: TradeCard | null; readonly notice: TradeNotice | null; readonly receipt: TradeReceipt | null }

export const tradeOfferRef = (campaignId: string, offerId: string): string => createHash("sha256").update(`${campaignId}:${offerId}`).digest("hex").slice(0, 24);

const ADJECTIVES = ["young", "old", "elderly", "tall", "short", "thin", "frail", "stout", "scarred", "injured", "wounded", "dark-haired", "fair-haired", "red-haired", "auburn-haired", "grey-haired", "black-haired", "blonde", "pale", "dark-skinned"];
const NOUNS = ["woman", "girl", "man", "boy", "lass", "lad", "youth", "child", "elf", "dwarf", "halfling", "orc"];
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A visible descriptor drawn ONLY from a closed lexicon (age/hair/build adjective and a person noun): no name, place or lore can pass through it. */
export function visibleDescriptor(sources: readonly (string | undefined)[]): string | undefined {
  const text = sources.filter((s): s is string => !!s).join(" ").toLowerCase();
  const adjective = ADJECTIVES.find(a => new RegExp(`\\b${a}\\b`).test(text));
  const noun = NOUNS.find(n => new RegExp(`\\b${n}\\b`).test(text));
  return adjective ?? noun;
}
export const slaveLabel = (descriptor: string | undefined): string => descriptor ? `${capital(descriptor)} Slave` : "Slave";

/**
 * The masked, knowledge-aware label of a person (shared by the trade card and the confirmation card): the real name only once it has been
 * legitimately learned, otherwise a closed-lexicon descriptor ("Young Slave"). Never a hidden name or an ID.
 */
export function personLabelOf(snapshot: DeepReadonly<CampaignSnapshot>, characters: ReturnType<typeof playerCharacterProjection>, record: DeepReadonly<CampaignCharacter> | undefined): { label: string; name_known: boolean } {
  // A person already in the campaign is labelled by the shared knowledge-aware projection; one still to be registered by acceptance only by what narration showed.
  const projected = record && snapshot.characters.some(c => c.id === record.id) ? characters.project(record.id) : undefined;
  const name = projected ? (projected.name_known ? projected.name : undefined) : record ? knownCreatedName(record) : undefined;
  if (name) return { label: characters.text(name), name_known: true };
  const o = record?.origin_snapshot?.established;
  // Descriptor sources are limited to what delivered narration established about the person (the promotion origin); canon appearance is never read.
  return { label: slaveLabel(visibleDescriptor([o?.descriptor, record?.origin_snapshot?.label, ...(o?.appearance ?? [])])), name_known: false };
}

export function deriveTradeView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>): TradeView {
  const offers = snapshot.trade_offers ?? [];
  if (!offers.length) return { offer: null, notice: null, receipt: null };
  const characters = playerCharacterProjection(world, snapshot);
  const who = activePlayerCharacterId(snapshot) ?? "nicco";
  const gold = snapshot.funds.find(f => f.character_id === who)?.gold ?? null;
  const personLabel = (record: DeepReadonly<CampaignCharacter> | undefined) => personLabelOf(snapshot, characters, record);
  const partyLabel = (c: DeepReadonly<TradeCounterparty>): string => {
    if (c.kind === "anonymous") return /^(?:the )?[a-z][a-z' -]{1,40}$/i.test(c.label) ? characters.text(capital(c.label)) : "Unfamiliar person";
    const record = snapshot.characters.find(x => x.id === c.character_id);
    const enslaved = snapshot.legal_statuses.some(l => l.character_id === c.character_id && l.status === "enslaved");
    if (enslaved && record) return personLabel(record).label;
    const p = characters.project(c.character_id);
    return p ? p.name : "Unfamiliar person";
  };
  const subjectOf = (o: DeepReadonly<TradeOfferRecord>) => {
    const s = o.subject;
    if (s.kind === "items" && o.status === "accepted" && o.settlement?.removed_item_names) return { kind: "goods" as const, lines: o.settlement.removed_item_names.map(n => characters.text(n)) };
    if (s.kind === "goods") return { kind: "goods" as const, lines: s.lines.map(l => characters.text(l.name)) };
    if (s.kind === "items") return { kind: "goods" as const, lines: s.item_ids.map(id => characters.text(snapshot.items.find(i => i.id === id)?.name ?? "Item")) };
    const registers = s.plan.find(c => c.kind === "register_character");
    const record = registers?.kind === "register_character" ? registers.character : snapshot.characters.find(c => c.id === s.subject_character_id);
    const person = personLabel(record as DeepReadonly<CampaignCharacter> | undefined);
    return { kind: "person" as const, lines: [person.label], person };
  };
  const verb = (o: DeepReadonly<TradeOfferRecord>, kind: "goods" | "person") => o.direction === "buy" ? (kind === "person" ? "Buy" : "Buy") : "Sell";
  const describe = (o: DeepReadonly<TradeOfferRecord>) => { const s = subjectOf(o); return `${verb(o, s.kind)} ${s.lines.join(", ")} for ${o.price_gold} gold`; };
  const active = activeTradeOffer(offers);
  const offer: TradeCard | null = active ? (() => {
    const s = subjectOf(active), sellsPerson = s.kind === "person";
    return { ref: tradeOfferRef(snapshot.campaign_id, active.id), direction: active.direction, kind: s.kind, counterparty: partyLabel(active.counterparty), price_gold: active.price_gold, lines: s.lines,
      ...(sellsPerson && s.person ? { person: s.person } : {}), affordable: active.direction === "buy" ? gold !== null && gold >= active.price_gold : null, gold, summary: describe(active) };
  })() : null;
  // Closed by the latest revision: a short notice so a vanished card is never unexplained.
  const closed = offers.filter(o => (o.status === "withdrawn" || o.status === "invalidated") && o.resolved_revision === snapshot.revision).at(-1);
  const notice: TradeNotice | null = closed && !active ? { ref: tradeOfferRef(snapshot.campaign_id, closed.id), status: closed.status as "withdrawn" | "invalidated",
    text: closed.status === "withdrawn" ? "The offer was withdrawn." : closed.invalid_reason === "scene_changed" ? "The offer lapsed when the scene changed." : "The offer is no longer available." } : null;
  const done = offers.filter(o => o.status === "accepted" && o.settlement?.revision === snapshot.revision).at(-1);
  const receipt: TradeReceipt | null = done ? (() => {
    const s = subjectOf(done);
    return { ref: tradeOfferRef(snapshot.campaign_id, done.id), direction: done.direction, kind: s.kind, gold: done.price_gold, summary: `${done.direction === "buy" ? "Bought" : "Sold"} ${s.lines.join(", ")} for ${done.price_gold} gold` };
  })() : null;
  return Object.freeze({ offer, notice, receipt });
}

/** Safe, player-facing reasons for a refused acceptance. Machine codes come from the campaign layer (field "trade"); nothing else is ever echoed. */
export type TradeBlock = "offer_not_found" | "offer_not_active" | "insufficient_funds" | "offer_unavailable" | "stale";
export const TRADE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  insufficient_funds: "Not enough gold. The offer stays open.",
  offer_accepted: "That offer was already accepted.",
  offer_superseded: "That offer was replaced by a newer one. Use the current offer.",
  offer_withdrawn: "That offer was withdrawn.",
  offer_invalidated: "That offer is no longer available.",
  offer_invalid_scene_changed: "The scene has changed; the offer lapsed.",
  offer_invalid_counterparty_gone: "The other party is no longer here; the offer lapsed.",
  offer_invalid_item_unavailable: "The item is no longer available; the offer lapsed.",
  offer_invalid_item_not_owned: "You do not own that item; the offer lapsed.",
  item_not_owned: "You do not own that item, so you cannot sell it.",
  offer_invalid_person_unavailable: "The person is no longer available; the offer lapsed.",
  default: "The trade could not be completed. Nothing changed.",
});
