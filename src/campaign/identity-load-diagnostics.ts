import type { CampaignCharacter, CampaignSnapshot, TradeOfferRecord } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { isRetiredCharacter } from "./character-lifecycle.js";

/**
 * Block B4 (P4): warn-level identity diagnostics computed when a campaign is loaded. READ-ONLY: nothing is repaired, merged, re-keyed or refused, and no
 * revision moves. Each warning names the records involved so a human (or the identity-fork scanner) can look closer.
 *
 *   duplicate_narrated_ref  (ID-4 / N5) two active materialized characters carry the same narrated origin under ONE key, `ephemeral_ref` + materialization
 *                           location. The three readers of `ephemeral_ref` still use their own keys; this is the key a later uniqueness rule would enforce.
 *   unnamed_twin            two active unnamed materialized characters with the same label at the same materialization location.
 *   counteroffer_subject_changed (F7) a person quote superseded by a quote at the same place and with the same counterparty, whose planned subject differs:
 *                           accepting the newer quote would materialize a second identity for what was one negotiation.
 *   accepted_offer_transaction_missing (AUTH-8) an accepted person offer whose settlement names no transaction, or one that is not in the snapshot.
 */
export type IdentityLoadWarningKind = "duplicate_narrated_ref" | "unnamed_twin" | "counteroffer_subject_changed" | "accepted_offer_transaction_missing";
export interface IdentityLoadWarning { readonly kind: IdentityLoadWarningKind; readonly ids: readonly string[]; readonly detail: string }
type Snap = DeepReadonly<CampaignSnapshot>;
type Char = DeepReadonly<CampaignCharacter>;
type Offer = DeepReadonly<TradeOfferRecord>;
const MAX_WARNINGS = 50;

const materialized = (snapshot: Snap): Char[] => snapshot.characters.filter(c => c.origin.kind === "created" && !!c.origin_snapshot && !isRetiredCharacter(c) && c.current.status !== "dead"
  && !snapshot.player_characters.some(p => p.character_id === c.id));
function groups<T>(values: readonly T[], key: (v: T) => string | undefined): T[][] {
  const map = new Map<string, T[]>();
  for (const v of values) { const k = key(v); if (k === undefined) continue; const list = map.get(k); if (list) list.push(v); else map.set(k, [v]); }
  return [...map.values()].filter(list => list.length > 1);
}
const counterpartyKey = (o: Offer) => o.counterparty.kind === "character" ? `character:${o.counterparty.character_id}` : `anonymous:${o.counterparty.label.toLowerCase()}`;
const personSubject = (o: Offer) => o.subject.kind === "person" ? o.subject.subject_character_id : undefined;

export function identityLoadWarnings(snapshot: Snap): readonly IdentityLoadWarning[] {
  const out: IdentityLoadWarning[] = [], people = materialized(snapshot);
  for (const twins of groups(people, c => c.origin_snapshot!.ephemeral_ref ? `${c.origin_snapshot!.ephemeral_ref}@${c.origin_snapshot!.location_id}` : undefined))
    out.push({ kind: "duplicate_narrated_ref", ids: twins.map(c => c.id), detail: `same narrated origin ${twins[0]!.origin_snapshot!.ephemeral_ref} at ${twins[0]!.origin_snapshot!.location_id}` });
  for (const twins of groups(people.filter(c => !c.profile.name), c => c.origin_snapshot!.label ? `${c.origin_snapshot!.label.toLowerCase()}@${c.origin_snapshot!.location_id}` : undefined))
    out.push({ kind: "unnamed_twin", ids: twins.map(c => c.id), detail: `unnamed, both "${twins[0]!.origin_snapshot!.label}" at ${twins[0]!.origin_snapshot!.location_id}` });
  const offers = snapshot.trade_offers ?? [];
  for (const old of offers) {
    const subject = personSubject(old);
    if (old.status !== "superseded" || subject === undefined) continue;
    // The quote that superseded it is created in the revision that resolved it, at the same place, with the same counterparty.
    const next = offers.find(o => o.id !== old.id && o.created_revision === old.resolved_revision && o.location_id === old.location_id && counterpartyKey(o) === counterpartyKey(old));
    const nextSubject = next ? personSubject(next) : undefined;
    if (next && nextSubject !== undefined && nextSubject !== subject) out.push({ kind: "counteroffer_subject_changed", ids: [old.id, next.id], detail: `${subject} became ${nextSubject}` });
  }
  const transactions = new Set(snapshot.transactions.map(t => t.id));
  for (const offer of offers) if (offer.status === "accepted" && offer.subject.kind === "person" && (!offer.settlement?.transaction_id || !transactions.has(offer.settlement.transaction_id)))
    out.push({ kind: "accepted_offer_transaction_missing", ids: [offer.id, ...(offer.settlement?.transaction_id ? [offer.settlement.transaction_id] : [])], detail: offer.settlement?.transaction_id ? "the settlement names a transaction that is not recorded" : "the settlement names no transaction" });
  return Object.freeze(out.slice(0, MAX_WARNINGS));
}
