import type { IdentityResolution } from "./name-establishment.js";
import type { SceneParticipantPlan, EphemeralSceneParticipant } from "./scene-participants.js";
import type { NaturalActionResolution } from "./natural-actions.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { GenerationMetadata } from "../llm/types.js";
import type { ControllerParseDiagnostic, ProviderErrorCode } from "../llm/errors.js";
import type { ControllerResult } from "../llm/state-controller-provider.js";
import type { TurnEvidence } from "./turn-evidence.js";
import type { AuditIssue } from "./narration-audit.js";
export type TurnFailure = "invalid_input" | "context_invalid" | "context_too_large" | "retrieval_failed" | "invalid_runtime_intent" | "stale_turn" | "turn_in_progress" | "cancelled" | "narrator_failed" | "narrator_truncated" | "controller_failed" | "campaign_validation_failed";
export class TurnError extends Error { constructor(readonly code: TurnFailure, readonly provider_code?: ProviderErrorCode) { super(`Turn failed: ${code}`); } }
/**
 * Block 4 (PIPE-1): the ONLY thing a player sees while a turn runs. A closed vocabulary of status words; it can never carry Narrator prose
 * (the type has no text field). Narrative prose becomes visible once, after the whole pipeline and the commit.
 */
export const TURN_PROGRESS_PHASES = ["thinking", "narrating", "resolving"] as const;
export type TurnProgressPhase = typeof TURN_PROGRESS_PHASES[number];
/** `turn_key` and `expected_revision` are the request identity (REV-2): the turn layer checks the revision before any provider call. */
export interface TurnRequest { readonly campaign: CampaignState; readonly player_input: string; readonly signal?: AbortSignal; readonly turn_key?: string; readonly expected_revision?: number }
export interface AuthorizationDiagnostic { readonly command: CampaignCommand; readonly authorized: boolean;
  /** Phase 1O: which path authorized it, the grammar-only result, and the controller evidence check (diagnostic only). */
  readonly source?: "grammar" | "evidence" | "both" | "rejected"; readonly grammar?: { readonly authorized: boolean; readonly reason: string };
  readonly evidence?: { readonly quote: string | null; readonly verified: boolean; readonly check: string;
    /** Where the verified receipt came from: the Controller's quote, or a receipt recovered deterministically from the current narrator draft. */
    readonly source?: "controller_quote" | "recovered_narrator_receipt"; readonly original_quote?: string | null; readonly original_check?: string };
  /** Pre-Property Debt Zero: a precise machine code for item/placement decisions (ambiguous_item, item_not_present, controller_item_mismatch, conflicting_item_mutations, ownership_not_evidenced, ...). Diagnostic only. */
  readonly code?: string; readonly signals?: readonly string[];
  readonly reason: "authorized_controller_evidence" | "rejected_already_established" | "rejected_evidence_partial_group" | "rejected_incomplete_group_proposal" | "authorized_narrative_confirmation" | "authorized_collective_acceptance" | "authorized_explicit_information_transfer" | "rejected_insufficient_confirmation" | "rejected_reference_invalid" | "rejected_command_not_allowed" | "rejected_recipient_refused" | "rejected_ambiguous_reference" | "rejected_equipment_not_established" | "rejected_fact_not_communicated" | "rejected_time_not_exact" | "rejected_controller_mismatch" | "rejected_conflicting_mutations" }
export interface RetrievalDiagnostic { readonly operations: number; readonly mode: "none" | "lexical" | "hybrid"; readonly ids: readonly string[]; readonly elapsed_ms: number; readonly outcome: "not_needed" | "found" | "unknown";
  /** Phase 1R: cleaned query, intent and named-entity tiers (2 explicit, 1 near/deictic) used for ranking. */
  readonly query?: string; readonly intent?: string | null; readonly mentions?: Readonly<Record<string, number>> }
export interface TurnResult {
  readonly travel?: import("../world/travel.js").TravelRoute | undefined;
  readonly narration: string; readonly base_revision: number; readonly final_revision: number;
  readonly controller_proposal: readonly CampaignCommand[]; readonly authorized_commands: readonly CampaignCommand[];
  readonly authorization: readonly AuthorizationDiagnostic[]; readonly retrieval: RetrievalDiagnostic;
  readonly turn_evidence: TurnEvidence;
  /** Repair 1: only audited text is delivered as authoritative narration. `delivered` excludes visual-only draft previews. */
  readonly narration_reconciliation?: { readonly delivered: "draft" | "revision" | "redacted"; readonly draft: string; readonly issues: readonly AuditIssue[]; readonly revision?: string; readonly revision_issues?: readonly AuditIssue[]; readonly repaired_arrivals?: readonly string[] };
  readonly narrator: GenerationMetadata; readonly controller: GenerationMetadata;
  readonly context_characters: Readonly<Record<string, number>>;
  /** Phase 1P: session-local scene participants for this turn (plan) and after narration (continuity capture). Never persisted. */
  /** Person-transaction diagnostics of this turn (resolved, blocked, ambiguous, no_offer); absent when the turn had none. */
  readonly person_transactions?: readonly import("./player-intent.js").TransactionDiagnostic[];
  readonly scene_participants?: { readonly plan: SceneParticipantPlan; readonly after: readonly EphemeralSceneParticipant[] };
  /** Persistence Pass 1.2: characters promoted because a proper name was established, and late namings, committed with this turn. */
  readonly identity?: Omit<IdentityResolution, "commands">;
  /** Hardening H1: identity establishment was skipped because its preparation failed (the turn still committed). Diagnostic only. */
  readonly identity_skipped?: { readonly reason: string };
  /** Phase 1S dev diagnostics: resolved/blocked/unresolved natural player actions, pre-narration effects, outcome-dependent intents. */
  readonly action_resolution?: NaturalActionResolution;
  readonly latency: { readonly narrator_ttft_ms: number | null; readonly narrator_total_ms: number; readonly controller_total_ms: number; readonly controller_tail_ms: number; readonly retrieval_ms: number; readonly coordinator_total_ms: number };
}
/** A post-commit publication step that failed without failing the committed turn (PIPE-2). Names the step only: no text, no error message. */
export type PublicationStep = "exchange_history" | "scene_participants" | "result_publication" | "diagnostics" | "transcript_history" | "item_visuals" | "post_turn";
export type TurnEvent =
  | { readonly type: "turn_started"; readonly base_revision: number; readonly turn_key?: string }
  | { readonly type: "turn_progress"; readonly phase: TurnProgressPhase }
  /** The complete, audited and committed narration, published ONCE (never as chunks, never before the commit). */
  | { readonly type: "narration_completed"; readonly text: string }
  | { readonly type: "controller_started" }
  | { readonly type: "state_proposed"; readonly diagnostics: readonly AuthorizationDiagnostic[] }
  /** The authoritative commit succeeded: from here the turn SUCCEEDED, whatever publication does. Carries the delivered text so a degraded publication can still answer. */
  | { readonly type: "state_committed"; readonly revision: number; readonly changed: boolean; readonly narration: string }
  | { readonly type: "publication_warning"; readonly step: PublicationStep }
  | { readonly type: "turn_completed"; readonly result: TurnResult }
  | { readonly type: "turn_failed"; readonly code: TurnFailure; readonly provider_code?: ProviderErrorCode; readonly narration: string; readonly incomplete: true; readonly base_revision: number; readonly final_revision: number };

/** Repair 1.2: debug-only record of a controller output that failed strict parsing. */
interface TurnDebugBase { readonly campaign_id: string; readonly base_revision: number; readonly player_input: string }
/** Debug-only records (Repair 1.2, Controller Reliability Pass 1, Hardening H1). Never part of player-facing events or state. */
export type TurnDebugRecord =
  | (ControllerParseDiagnostic & TurnDebugBase & { readonly kind: "controller_parse_failure"; readonly stage: string })
  | (TurnDebugBase & { readonly kind: "controller_normalized"; readonly normalization: NonNullable<ControllerResult["normalization"]> })
  | (TurnDebugBase & { readonly kind: "controller_omission_candidate"; readonly candidate: CampaignCommand; readonly evidence: string; readonly proposal_size: number })
  | (TurnDebugBase & { readonly kind: "identity_establishment_skipped"; readonly reason: string });
export type TurnDebugSink = (record: TurnDebugRecord) => void;
