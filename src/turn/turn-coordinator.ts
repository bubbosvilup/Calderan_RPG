import type { CampaignState } from "../campaign/campaign-state.js";
import { freezeSnapshot } from "../campaign/validation.js";
import type { NarratorProvider, NarratorResult } from "../llm/narrator-provider.js";
import type { StateControllerProvider } from "../llm/state-controller-provider.js";
import { parseControllerProposal } from "../llm/controller-schema.js";
import { ProviderError } from "../llm/errors.js";
import type { WorldStore } from "../world/world-store.js";
import { buildTurnContext } from "./context-builder.js";
import { buildNarratorPrompt, NARRATOR_SYSTEM, relevanceSignals, type NarratorPromptOptions } from "./prompt-builder.js";
import { projectKnowledgeAccess, renderKnowledgeAccess } from "./narrative-authority.js";
import { retrieveForTurn, type TurnRetrieval } from "./retrieval-policy.js";
import { playerIntent } from "./player-intent.js";
import { authorizeWithEvidence, type EvidenceMode } from "./evidence-authorization.js";
import { deriveTurnEvidence } from "./turn-evidence.js";
import { RecentConversation } from "./recent-conversation.js";
import { SceneParticipants } from "./scene-participants.js";
import { TurnError, type TurnEvent, type TurnFailure, type TurnRequest, type TurnResult } from "./turn-types.js";

const active = new WeakSet<CampaignState>();
export class TurnCoordinator {
  readonly #recent = new WeakMap<CampaignState, RecentConversation>();
  readonly #participants = new WeakMap<CampaignState, SceneParticipants>();
  constructor(private readonly world: WorldStore, private readonly narrator: NarratorProvider, private readonly controller: StateControllerProvider, private readonly retrieval: TurnRetrieval, private readonly promptOptions: NarratorPromptOptions & { readonly evidence_authorization?: EvidenceMode } = {}) {}
  recent(campaign: CampaignState): RecentConversation { let recent = this.#recent.get(campaign); if (!recent) { recent = new RecentConversation(); this.#recent.set(campaign, recent); } return recent; }
  /** Session-local ephemeral scene participants (Phase 1P); never persisted or saved. */
  participants(campaign: CampaignState): SceneParticipants { let p = this.#participants.get(campaign); if (!p) { p = new SceneParticipants(); this.#participants.set(campaign, p); } return p; }
  async *runTurn(request: TurnRequest): AsyncGenerator<TurnEvent> {
    const { campaign, player_input, signal } = request;
    const base_revision = campaign.revision, start = performance.now();
    let text = "", narration: NarratorResult | undefined, recorded = false, owned = false;
    let stage: TurnFailure = "context_invalid";
    const network = new AbortController();
    const cancel = () => network.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const checkpoint = () => {
      if (signal?.aborted) throw new TurnError("cancelled");
      if (campaign.revision !== base_revision) throw new TurnError("stale_turn");
    };
    try {
      if (active.has(campaign)) throw new TurnError("turn_in_progress");
      active.add(campaign); owned = true;
      if (!player_input.trim() || player_input.length > 4000) throw new TurnError("invalid_input");
      checkpoint();
      const snapshot = campaign.exportSnapshot();
      yield { type: "turn_started", base_revision };
      checkpoint();
      const baseContext = buildTurnContext(this.world, snapshot);
      // Deterministic, pre-narration; applied only when the turn finalizes. The controller never decides who exists.
      const basePlan = this.participants(campaign).plan(player_input, baseContext);
      const intent = playerIntent(player_input, baseContext, snapshot, this.world, basePlan.participants, basePlan.turn);
      // Validate player-controlled runtime effects before spending tokens. The receipt is never committed: its detached
      // snapshot is the projected state the narrator, controller and authorization see (Phase 1S). Durable state changes only
      // at finalization, when runtime and authorized commands are prepared together from the base revision.
      let projected = snapshot;
      if (intent.runtime.length) { stage = "invalid_runtime_intent"; projected = campaign.prepare({ expected_revision: base_revision, commands: intent.runtime }).snapshot; }
      const context = projected === snapshot ? baseContext : buildTurnContext(this.world, projected);
      const scene = context.primary.scene.player_location?.id === baseContext.primary.scene.player_location?.id ? basePlan : this.participants(campaign).plan(player_input, context);
      stage = "retrieval_failed";
      const retrieved = await retrieveForTurn(player_input, context, this.world, this.retrieval);
      checkpoint();
      const recent = this.recent(campaign).forPrompt();
      const prompt = buildNarratorPrompt(player_input, context, recent, retrieved.data, intent, this.promptOptions, scene);
      stage = "narrator_failed";
      for await (const event of this.narrator.stream({ ...prompt, signal: network.signal })) {
        checkpoint();
        if (event.type === "error") throw event.error;
        if (event.type === "text_delta") { text += event.text; if (text.length > 24_000) throw new TurnError("context_too_large"); yield { type: "narration_delta", text: event.text }; }
        else { if (event.result.text !== text || !text.trim()) throw new TurnError("narrator_failed"); narration = event.result; }
      }
      if (!narration) throw new TurnError("narrator_failed");
      const narratorEnd = performance.now();
      yield { type: "narration_completed", text };
      checkpoint();
      yield { type: "controller_started" };
      checkpoint(); stage = "controller_failed";
      const evidence = JSON.stringify({ base_revision, context, explicit_intent: intent.candidates });
      const controller = await this.controller.propose({ player_action: player_input, prior_state: evidence, final_narration: text, signal: network.signal });
      checkpoint();
      const proposal = parseControllerProposal(JSON.stringify({ commands: controller.commands }));
      const turnEvidence = deriveTurnEvidence(intent, text, context);
      const diagnostics = authorizeWithEvidence(proposal, controller.evidence, turnEvidence, text, context, projected, this.promptOptions.evidence_authorization ?? "hybrid");
      // Freeze before exposing events: consumers cannot edit commands between authorization and commit.
      yield freezeSnapshot({ type: "state_proposed" as const, diagnostics: structuredClone(diagnostics) }) as TurnEvent;
      checkpoint();
      const commands = [...intent.runtime, ...diagnostics.filter(d => d.authorized).map(d => d.command)];
      stage = "campaign_validation_failed";
      const prepared = campaign.prepare({ expected_revision: base_revision, commands });
      checkpoint();
      const committed = campaign.commit(prepared); // No await/callback/yield between preparation and commit.
      this.recent(campaign).add({ player: player_input, narration: text, status: "finalized" }); recorded = true;
      const participantsAfter = this.participants(campaign).commit(scene, text);
      const result: TurnResult = { narration: text, base_revision, final_revision: committed.revision,
        controller_proposal: proposal, authorized_commands: commands, authorization: diagnostics, retrieval: retrieved.diagnostics, turn_evidence: turnEvidence,
        narrator: { model: narration.model, usage: narration.usage, latency: narration.latency }, controller: { model: controller.model, usage: controller.usage, latency: controller.latency },
        context_characters: { system: NARRATOR_SYSTEM.length, primary_context: JSON.stringify(context).length, recent_conversation: JSON.stringify(recent).length, knowledge_access: renderKnowledgeAccess(projectKnowledgeAccess(context, retrieved.data, relevanceSignals(player_input, recent, intent), scene)).length, retrieval: JSON.stringify(retrieved.data).length, controller_evidence: evidence.length + player_input.length + text.length },
        scene_participants: { plan: scene, after: participantsAfter },
        ...(intent.natural ? { action_resolution: intent.natural } : {}),
        latency: { narrator_ttft_ms: narration.latency.time_to_first_token_ms, narrator_total_ms: narration.latency.elapsed_total_ms, controller_total_ms: controller.latency.elapsed_total_ms, controller_tail_ms: performance.now() - narratorEnd, retrieval_ms: retrieved.diagnostics.elapsed_ms, coordinator_total_ms: performance.now() - start },
      };
      yield { type: "state_committed", ...committed };
      yield freezeSnapshot({ type: "turn_completed" as const, result }) as TurnEvent;
    } catch (error) {
      const code = signal?.aborted ? "cancelled" : error instanceof TurnError ? error.code : stage;
      yield { type: "turn_failed", code, ...(error instanceof ProviderError ? { provider_code: error.code } : {}), narration: text, incomplete: true, base_revision, final_revision: campaign.revision };
    } finally {
      network.abort(); signal?.removeEventListener("abort", cancel);
      if (narration && !recorded) this.recent(campaign).add({ player: player_input, narration: text, status: "state_failed" });
      if (owned) active.delete(campaign);
    }
  }
}
