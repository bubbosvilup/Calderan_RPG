import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { PendingConfirmation, PendingPayload } from "../persistence/pending-confirmations.js";
import { personLabelOf } from "./trade-offer-view.js";
import { playerCharacterProjection } from "./player-character-view.js";
import { mergeConflicts, retireConflicts } from "../campaign/character-repair.js";
import { manumissionCommand, manumissionInvalidReason } from "../turn/pending-proposals.js";

/**
 * Consolidation block 5A — a CONFIRMATION KIND: everything the generic PendingConfirmation lifecycle needs to know about one reusable act.
 *
 * Class C (an irreversible act whose authority is the player) is an AUTHORITY category. PendingConfirmation is a MECHANISM that some Class C acts
 * use when the player's authority is expressed in free text and then has to be confirmed in the interface. Acts that already have their own explicit
 * interface authority (Actual Offer Accept, NPC+ Promote) do NOT use it.
 *
 * A kind is pure: it never mutates anything, never calls a model and never reads prose. The lifecycle owns locking, revision checks, commit and the
 * terminal transition.
 */
export interface ConfirmationCard {
  /** Short player-facing question ("Free Maren?"). Derived from the CURRENT view at render time, never stored. */
  readonly title: string;
  readonly body: string;
  /** The masked, knowledge-aware label of the subject (a rename or a later name reveal re-renders the same card). */
  readonly subject_label: string;
  readonly confirm_label: string;
  readonly cancel_label: string;
}
export interface ConfirmationKind {
  readonly kind: string;
  /** Meaning check of a payload (its structure is already validated). */
  readonly payload_valid: (payload: PendingPayload) => boolean;
  /** Real preconditions on the CURRENT authoritative state. A stable reason code when the act can no longer be confirmed, otherwise undefined. */
  readonly invalid_reason: (snapshot: DeepReadonly<CampaignSnapshot>, record: PendingConfirmation) => string | undefined;
  /** The deterministic command batch a confirmation commits (one atomic revision). */
  readonly commands: (snapshot: DeepReadonly<CampaignSnapshot>, record: PendingConfirmation) => readonly CampaignCommand[];
  readonly card: (world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, record: PendingConfirmation) => ConfirmationCard;
}
export type ConfirmationKinds = ReadonlyMap<string, ConfirmationKind>;

const DOCUMENTATION = new Set(["documented", "unestablished"]);
const SAFE_ID = /[^a-z0-9_]/g;

/** AUTH-1: freeing a person Nicco legally holds. The player's words propose it; the player's explicit confirmation commits the deterministic `manumit`. */
export const MANUMISSION_KIND: ConfirmationKind = {
  kind: "manumission",
  payload_valid: p => typeof p.holder_id === "string" && p.holder_id.length > 0 && typeof p.documentation === "string" && DOCUMENTATION.has(p.documentation),
  invalid_reason: (snapshot, record) => manumissionInvalidReason(snapshot, record.subject_id, record.actor_id, record.payload),
  commands: (_snapshot, record) => [manumissionCommand(`campaign_transaction_c${record.ref.slice(0, 12)}_${record.subject_id.replace(/^campaign_character_/, "").toLowerCase().replace(SAFE_ID, "_")}`.slice(0, 120), record.subject_id, record.payload)],
  card: (world, snapshot, record) => {
    const record_ = snapshot.characters.find(c => c.id === record.subject_id);
    const label = personLabelOf(snapshot, playerCharacterProjection(world, snapshot), record_).label;
    return { title: `Free ${label}?`, subject_label: label, confirm_label: `Free ${label}`, cancel_label: "Keep as is",
      body: `Nicco's words describe freeing ${label}. Nothing has changed yet. Confirming ends ${label}'s legal enslavement; household, residence and feelings are not affected.` };
  },
};

const repairLabel = (world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, id: string): string => {
  const c = snapshot.characters.find(x => x.id === id);
  return c ? personLabelOf(snapshot, playerCharacterProjection(world, snapshot), c).label : "an unknown person";
};
const REPAIR_REASON = (conflicts: readonly { readonly code: string }[]): string | undefined => conflicts.length ? `repair_refused_${conflicts[0]!.code}`.slice(0, 60) : undefined;

/**
 * Block 5B: a human operator retires one persistent identity (never deletion; the id stays referenceable). Class C. Created ONLY by an explicit operator
 * invocation after a conflict-free preflight, never by a scanner, a model or the player's prose. The same `retireConflicts` analysis runs at Confirm.
 */
export const RETIRE_CHARACTER_KIND: ConfirmationKind = {
  kind: "retire_character",
  payload_valid: p => p.reason === "operator_retired",
  invalid_reason: (snapshot, record) => REPAIR_REASON(retireConflicts(snapshot, record.subject_id)),
  commands: (_snapshot, record) => [{ kind: "retire_character", character_id: record.subject_id, reason: "operator_retired" }],
  card: (world, snapshot, record) => {
    const label = repairLabel(world, snapshot, record.subject_id);
    return { title: `Retire ${label}?`, subject_label: label, confirm_label: `Retire ${label}`, cancel_label: "Keep as is",
      body: `Operator repair. ${label} is taken out of play: not present anywhere, not targetable, not available to the story. The record is kept (this is not a deletion) and the character cannot be reactivated here. Nothing has changed yet.` };
  },
};
/** Block 5B: a human operator merges SOURCE (the duplicate) into TARGET (the identity to preserve). SOURCE is retired with `merged_into`. */
export const MERGE_CHARACTER_KIND: ConfirmationKind = {
  kind: "merge_character",
  payload_valid: p => typeof p.target_id === "string" && p.target_id.length > 0 && p.target_id !== "nicco",
  invalid_reason: (snapshot, record) => REPAIR_REASON(mergeConflicts(snapshot, record.subject_id, String(record.payload.target_id)).conflicts),
  commands: (_snapshot, record) => [{ kind: "merge_characters", source_id: record.subject_id, target_id: String(record.payload.target_id) }],
  card: (world, snapshot, record) => {
    const source = repairLabel(world, snapshot, record.subject_id), target = repairLabel(world, snapshot, String(record.payload.target_id));
    const summary = mergeConflicts(snapshot, record.subject_id, String(record.payload.target_id)).summary;
    const moved = Object.entries(summary.rewrites).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ");
    return { title: `Merge ${source} into ${target}?`, subject_label: `${source} → ${target}`, confirm_label: `Merge into ${target}`, cancel_label: "Keep both",
      body: `Operator repair. SOURCE ${source} is the duplicate and is retired; TARGET ${target} is the identity that is kept.${moved ? ` References moved to the target: ${moved}.` : ""} Nothing has changed yet.` };
  },
};
export const PRODUCTION_CONFIRMATION_KINDS: ConfirmationKinds = new Map([[MANUMISSION_KIND.kind, MANUMISSION_KIND], [RETIRE_CHARACTER_KIND.kind, RETIRE_CHARACTER_KIND], [MERGE_CHARACTER_KIND.kind, MERGE_CHARACTER_KIND]]);
