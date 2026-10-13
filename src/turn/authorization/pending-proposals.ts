import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { PendingPayload } from "../../types/pending-confirmation.js";

/**
 * Consolidation block 5A — what the TURN PIPELINE knows about a pending player confirmation.
 *
 * A proposal is a semantic interpretation of the player's words ("I hereby free you, Maren.") that must NOT directly commit an irreversible act. The turn
 * resolves it BEFORE narration so the Narrator can be told the three distinct states: the CURRENT world state (unchanged), the PROPOSED action
 * (awaiting the player's explicit confirmation in the interface) and, only after that confirmation, the COMPLETED action. The pipeline never commits a
 * proposal; the session turns it into a persisted PendingConfirmation after the turn finalizes, and only the interface can confirm it.
 */
export interface PendingProposal {
  readonly kind: string;
  readonly subject_id: string;
  readonly actor_id: string;
  readonly payload: PendingPayload;
}

/** What a turn knows about pending player confirmations: `recognized` = interpretations of THIS turn's words (never committed by the pipeline); `pending` = everything awaiting confirmation that the Narrator must treat as a proposal. */
export interface TurnConfirmations { readonly recognized: readonly PendingProposal[]; readonly pending: readonly PendingProposal[] }

/** AUTH-1 domain prerequisites (shared by create-time validation, confirm-time revalidation and the deterministic command, so they cannot drift). */
export function manumissionInvalidReason(snapshot: DeepReadonly<CampaignSnapshot>, subject_id: string, actor_id: string, payload: PendingPayload): string | undefined {
  if (!snapshot.characters.some(c => c.id === subject_id)) return "subject_missing";
  const legal = snapshot.legal_statuses.find(l => l.character_id === subject_id);
  if (!legal || legal.status !== "enslaved") return "subject_no_longer_enslaved";
  if (legal.holder_id !== payload.holder_id || actor_id !== payload.holder_id) return "holder_changed";
  return undefined;
}
export function manumissionCommand(transaction_id: string, subject_id: string, payload: PendingPayload): CampaignCommand {
  return { kind: "manumit", transaction_id, character_id: subject_id, by_holder_id: String(payload.holder_id), documentation: payload.documentation === "documented" ? "documented" : "unestablished" };
}

/** What the Narrator is told about a pending proposal. A proposal is never a completed act; the line names the unchanged current state. */
export function proposalNarratorLine(kind: string, name: string): string {
  if (kind === "manumission") return `Nicco has voiced an intent to legally free ${name}. This is only a PROPOSAL awaiting the player's explicit confirmation in the interface: ${name} is STILL legally enslaved and still held by Nicco; nothing has been signed or granted. Do not narrate ${name} as freed, released from ownership or holding papers. You may narrate the moment, reactions, hesitation or hope without completing the act.`;
  return `A proposed act concerning ${name} is awaiting the player's explicit confirmation in the interface. It is NOT completed: the current state of ${name} is unchanged. Do not narrate it as done.`;
}
