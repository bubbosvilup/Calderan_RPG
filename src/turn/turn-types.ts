import type { SceneParticipantPlan, EphemeralSceneParticipant } from "./scene-participants.js";
import type { NaturalActionResolution } from "./natural-actions.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { GenerationMetadata } from "../llm/types.js";
import type { ProviderErrorCode } from "../llm/errors.js";
import type { TurnEvidence } from "./turn-evidence.js";
import type { AuditIssue } from "./narration-audit.js";
export type TurnFailure = "invalid_input" | "context_invalid" | "context_too_large" | "retrieval_failed" | "invalid_runtime_intent" | "stale_turn" | "turn_in_progress" | "cancelled" | "narrator_failed" | "controller_failed" | "campaign_validation_failed";
export class TurnError extends Error { constructor(readonly code: TurnFailure) { super(`Turn failed: ${code}`); } }
export interface TurnRequest { readonly campaign: CampaignState; readonly player_input: string; readonly signal?: AbortSignal }
export interface AuthorizationDiagnostic { readonly command: CampaignCommand; readonly authorized: boolean;
  /** Phase 1O: which path authorized it, the grammar-only result, and the controller evidence check (diagnostic only). */
  readonly source?: "grammar" | "evidence" | "both" | "rejected"; readonly grammar?: { readonly authorized: boolean; readonly reason: string };
  readonly evidence?: { readonly quote: string | null; readonly verified: boolean; readonly check: string };
  readonly reason: "authorized_controller_evidence" | "rejected_already_established" | "rejected_evidence_partial_group" | "rejected_incomplete_group_proposal" | "authorized_narrative_confirmation" | "authorized_collective_acceptance" | "authorized_explicit_information_transfer" | "rejected_insufficient_confirmation" | "rejected_reference_invalid" | "rejected_command_not_allowed" | "rejected_recipient_refused" | "rejected_ambiguous_reference" | "rejected_equipment_not_established" | "rejected_fact_not_communicated" | "rejected_time_not_exact" | "rejected_controller_mismatch" }
export interface RetrievalDiagnostic { readonly operations: number; readonly mode: "none" | "lexical" | "hybrid"; readonly ids: readonly string[]; readonly elapsed_ms: number; readonly outcome: "not_needed" | "found" | "unknown";
  /** Phase 1R: cleaned query, intent and named-entity tiers (2 explicit, 1 near/deictic) used for ranking. */
  readonly query?: string; readonly intent?: string | null; readonly mentions?: Readonly<Record<string, number>> }
export interface TurnResult {
  readonly narration: string; readonly base_revision: number; readonly final_revision: number;
  readonly controller_proposal: readonly CampaignCommand[]; readonly authorized_commands: readonly CampaignCommand[];
  readonly authorization: readonly AuthorizationDiagnostic[]; readonly retrieval: RetrievalDiagnostic;
  readonly turn_evidence: TurnEvidence;
  /** Repair 1: the draft never reaches the user unaudited. `delivered` says which text was shown. */
  readonly narration_reconciliation?: { readonly delivered: "draft" | "revision" | "redacted"; readonly draft: string; readonly issues: readonly AuditIssue[]; readonly revision?: string; readonly revision_issues?: readonly AuditIssue[] };
  readonly narrator: GenerationMetadata; readonly controller: GenerationMetadata;
  readonly context_characters: Readonly<Record<string, number>>;
  /** Phase 1P: session-local scene participants for this turn (plan) and after narration (continuity capture). Never persisted. */
  readonly scene_participants?: { readonly plan: SceneParticipantPlan; readonly after: readonly EphemeralSceneParticipant[] };
  /** Phase 1S dev diagnostics: resolved/blocked/unresolved natural player actions, pre-narration effects, outcome-dependent intents. */
  readonly action_resolution?: NaturalActionResolution;
  readonly latency: { readonly narrator_ttft_ms: number | null; readonly narrator_total_ms: number; readonly controller_total_ms: number; readonly controller_tail_ms: number; readonly retrieval_ms: number; readonly coordinator_total_ms: number };
}
export type TurnEvent =
  | { readonly type: "turn_started"; readonly base_revision: number }
  | { readonly type: "narration_delta"; readonly text: string }
  | { readonly type: "narration_completed"; readonly text: string }
  | { readonly type: "controller_started" }
  | { readonly type: "state_proposed"; readonly diagnostics: readonly AuthorizationDiagnostic[] }
  | { readonly type: "state_committed"; readonly revision: number; readonly changed: boolean }
  | { readonly type: "turn_completed"; readonly result: TurnResult }
  | { readonly type: "turn_failed"; readonly code: TurnFailure; readonly provider_code?: ProviderErrorCode; readonly narration: string; readonly incomplete: true; readonly base_revision: number; readonly final_revision: number };
