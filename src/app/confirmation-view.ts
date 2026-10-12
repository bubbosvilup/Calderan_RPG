import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { PendingConfirmation } from "../persistence/pending-confirmations.js";
import type { ConfirmationCard, ConfirmationKinds } from "./confirmation-kinds.js";

/**
 * Block 5A: the player-facing projection of the pending-confirmation records. Plain JSON, derived on demand from the records and the CURRENT authoritative
 * state: the card text is never stored (a rename or a later name reveal re-renders the same card, bound by id). It carries the opaque ref and display
 * strings only: no character ID, no payload, no hidden name. An active record whose preconditions no longer hold is never shown.
 */
export interface ConfirmationCardView extends ConfirmationCard { readonly ref: string; readonly kind: string; readonly created_revision: number }
export interface ConfirmationNotice { readonly ref: string; readonly status: "confirmed" | "cancelled" | "invalidated"; readonly subject_label: string; readonly text: string }
export interface ConfirmationView { readonly cards: readonly ConfirmationCardView[]; readonly recent: readonly ConfirmationNotice[] }

/** Safe, player-facing text for each terminal reason. Machine codes are never echoed. */
export const CONFIRMATION_MESSAGES: Readonly<Record<string, string>> = {
  player_confirmed: "Confirmed.",
  player_cancelled: "Cancelled. Nothing changed.",
  subject_missing: "No longer possible: that person is no longer here to act on.",
  subject_no_longer_enslaved: "No longer applicable: the person's legal status has changed.",
  holder_changed: "No longer applicable: the person is no longer legally held by you.",
  superseded: "Replaced by a newer request.",
  command_rejected: "That could not be completed. Nothing changed.",
  unknown_kind: "No longer available.",
  default: "No longer applicable.",
};
export const CONFIRMATION_RECENT_LIMIT = 3;

export function deriveConfirmationView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, records: readonly PendingConfirmation[], kinds: ConfirmationKinds): ConfirmationView {
  const cards: ConfirmationCardView[] = [], recent: ConfirmationNotice[] = [];
  const label = (r: PendingConfirmation): string => { try { return kinds.get(r.kind)?.card(world, snapshot, r).subject_label ?? "That request"; } catch { return "That request"; } };
  for (const r of records) {
    const kind = kinds.get(r.kind);
    if (r.status === "pending") {
      if (!kind || kind.invalid_reason(snapshot, r) !== undefined) continue;
      try { cards.push({ ...kind.card(world, snapshot, r), ref: r.ref, kind: r.kind, created_revision: r.created_revision }); } catch { /* A card that cannot render is simply not offered. */ }
    } else recent.push({ ref: r.ref, status: r.status, subject_label: label(r), text: CONFIRMATION_MESSAGES[r.terminal_reason ?? ""] ?? CONFIRMATION_MESSAGES.default! });
  }
  return { cards, recent: recent.slice(-CONFIRMATION_RECENT_LIMIT) };
}
