import type { CampaignCommand } from "../../campaign/types.js";
import type { NarratorResult } from "../../llm/narrator-provider.js";
import type { ControllerResult } from "../../llm/state-controller-provider.js";
import type { WorldStore } from "../../world/world-store.js";
import { findRoute } from "../../world/travel.js";
import type { TurnContext } from "../context-builder.js";
import { renderKnowledgeAccess, type NarrativeKnowledgeAccess } from "../narrative-authority.js";
import { NARRATOR_SYSTEM } from "../prompt-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { EphemeralSceneParticipant, SceneParticipantPlan } from "../scene-participants.js";
import type { TurnEvidence } from "../turn-evidence.js";
import type { AuthorizationDiagnostic, RetrievalDiagnostic, TurnResult } from "../turn-types.js";
import type { TurnDelivery } from "./audit.js";
import type { CommitPlan } from "./commit-preparation.js";
import type { TurnIntent } from "./intent.js";

/**
 * Hardening H2: TurnResult assembly. Formatting only — no decisions, no state — so it is a helper, not a pipeline stage (the gap
 * audit rejected a standalone PublicationStage). Called after the commit; `now` is read here so latency fields keep pre-H2 timing.
 */
export function assembleTurnResult(i: { readonly world: WorldStore; readonly base_revision: number; readonly final_revision: number; readonly player_input: string;
  readonly proposal: readonly CampaignCommand[]; readonly commands: readonly CampaignCommand[]; readonly diagnostics: readonly AuthorizationDiagnostic[];
  readonly retrieval: { readonly data: unknown; readonly diagnostics: RetrievalDiagnostic }; readonly turn_evidence: TurnEvidence; readonly delivery: TurnDelivery;
  readonly narration: NarratorResult; readonly controller: ControllerResult; readonly controller_prior_state: string; readonly context: TurnContext;
  readonly recent: readonly RecentExchange[]; readonly access: NarrativeKnowledgeAccess; readonly scene: SceneParticipantPlan;
  readonly participants_after: readonly EphemeralSceneParticipant[]; readonly commit_plan: CommitPlan; readonly origin: string; readonly arrival: string;
  readonly intent: TurnIntent; readonly narrator_end: number; readonly start: number }): TurnResult {
  const { delivery, narration, controller } = i, text = delivery.text;
  return { narration: text, base_revision: i.base_revision, final_revision: i.final_revision,
    controller_proposal: i.proposal, authorized_commands: i.commands, authorization: i.diagnostics, retrieval: i.retrieval.diagnostics, turn_evidence: i.turn_evidence,
    narration_reconciliation: { delivered: delivery.delivered, draft: delivery.draft, issues: delivery.issues, ...(delivery.revision !== undefined ? { revision: delivery.revision, revision_issues: delivery.revision_issues } : {}), ...(delivery.repaired_arrivals ? { repaired_arrivals: delivery.repaired_arrivals } : {}) },
    narrator: { model: narration.model, usage: narration.usage, latency: narration.latency }, controller: { model: controller.model, usage: controller.usage, latency: controller.latency },
    // knowledge_access measures the projection the audit used (pre-H2 recomputed it with identical arguments).
    context_characters: { system: NARRATOR_SYSTEM.length, primary_context: JSON.stringify(i.context).length, recent_conversation: JSON.stringify(i.recent).length,
      knowledge_access: renderKnowledgeAccess(i.access).length, retrieval: JSON.stringify(i.retrieval.data).length, controller_evidence: i.controller_prior_state.length + i.player_input.length + text.length },
    scene_participants: { plan: i.scene, after: i.participants_after }, identity: i.commit_plan.identity,
    ...(i.commit_plan.identity_skipped !== undefined ? { identity_skipped: { reason: i.commit_plan.identity_skipped } } : {}),
    ...(i.origin !== i.arrival ? { travel: findRoute(i.world, i.origin, i.arrival) } : {}),
    ...(i.intent.natural ? { action_resolution: i.intent.natural } : {}),
    latency: { narrator_ttft_ms: narration.latency.time_to_first_token_ms, narrator_total_ms: narration.latency.elapsed_total_ms, controller_total_ms: controller.latency.elapsed_total_ms,
      controller_tail_ms: performance.now() - i.narrator_end, retrieval_ms: i.retrieval.diagnostics.elapsed_ms, coordinator_total_ms: performance.now() - i.start },
  };
}
