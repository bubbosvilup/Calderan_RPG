import type { CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { ControllerResult, StateControllerProvider } from "../../llm/state-controller-provider.js";
import type { MovableCharacter } from "../character-movement.js";
import type { TurnContext } from "../context-builder.js";
import type { TurnIntent } from "./intent.js";
import { withProviderRetry, type ProviderAttemptRecord, type ProviderBudget, type ProviderRetryPolicy } from "../../llm/retry.js";

/**
 * Hardening H2 — ControllerStage. The controller reads the player's action, bounded prior state and the finalized narration DRAFT, and
 * returns a PROPOSAL. Controller output is never authorization, never state and never truth: AuthorizationStage verifies it against
 * deterministic evidence, and only CampaignState preparation can validate it. Retry (H5) is transport-level only and optional.
 */
export interface ControllerProposalOutput {
  /** The serialized prior-state envelope sent to the controller (also measured in TurnResult.context_characters). */
  readonly prior_state: string;
  /** Raw controller result: proposed commands, evidence quotes, usage/latency, optional normalization record. */
  readonly result: ControllerResult;
}
/**
 * Async. Failure mapping: the coordinator holds `controller_failed`; a ProviderError also carries its provider code (and, for an
 * unparseable output, a debug-only parse diagnostic).
 */
export async function requestControllerProposal(i: { readonly controller: StateControllerProvider; readonly signal: AbortSignal; readonly base_revision: number;
  readonly context: TurnContext; readonly intent: TurnIntent; readonly movable: readonly MovableCharacter[]; readonly projected: DeepReadonly<CampaignSnapshot>;
  readonly player_input: string; readonly draft: string;
  /** H5: bounded transient retry; the same request is re-sent, nothing is committed before a parse, and structured-output failures are never retried. */
  readonly retry?: { readonly policy: ProviderRetryPolicy; readonly budget: ProviderBudget; readonly checkpoint: () => void; readonly record: (record: ProviderAttemptRecord) => void } }): Promise<ControllerProposalOutput> {
  // Hardening H3: NPC-private (narrator-only) canon is not controller input; the controller proposes state from narration.
  const { npc_private_canon: _private, ...context } = i.context;
  const prior_state = JSON.stringify({ base_revision: i.base_revision, context, explicit_intent: i.intent.candidates,
    ...(i.movable.length ? { movable_characters: i.movable.map(m => ({ id: m.id, name: m.names[0], location_id: i.projected.characters.find(c => c.id === m.id)?.current.current_location })) } : {}) });
  const request = { player_action: i.player_input, prior_state, final_narration: i.draft, signal: i.signal };
  const result = i.retry ? await withProviderRetry({ ...i.retry, signal: i.signal, run: (_attempt, timeout_ms) => i.controller.propose(timeout_ms === undefined ? request : { ...request, timeout_ms }) }) : await i.controller.propose(request);
  return { prior_state, result };
}
