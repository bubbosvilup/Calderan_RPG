import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { GenerationRequest, NarratorRequest } from "../llm/types.js";
import { MannerismPortrayalGate } from "./mannerism-portrayal-gate.js";
import { mannerismEpistemicState } from "../campaign/mannerisms.js";
import type { ContextCompactionService } from "./context-compaction.js";
import { buildTurnContext, type TurnContext } from "./context-builder.js";
import { buildNarratorPrompt } from "./prompt-builder.js";
import { ContextBudgetManager, prepareNarratorRequest, type ContextPolicy } from "./context-budget.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import { freezeSnapshot } from "../campaign/validation.js";
import type { NarratorProvider, NarratorResult } from "../llm/narrator-provider.js";
import type { StateControllerProvider } from "../llm/state-controller-provider.js";
import { ProviderError } from "../llm/errors.js";
import { DEFAULT_RETRY_POLICY, NO_RETRY_POLICY, ProviderBudget, type ProviderAttemptRecord, type ProviderRetryPolicy } from "../llm/retry.js";
import {ReliabilityMetrics,diagnosticSync} from "../llm/reliability.js";
import type { WorldStore } from "../world/world-store.js";
import type { NarratorPromptOptions } from "./prompt-builder.js";
import { retrieveForTurn, RETRIEVAL_LIMITS, type TurnRetrieval } from "./retrieval-policy.js";
import type { EvidenceMode } from "./evidence-authorization.js";
import { RecentConversation } from "./recent-conversation.js";
import { SceneParticipants } from "./scene-participants.js";
import { projectTurnIntent, resolveTurnIntent, type IntentStageInput } from "./stages/intent.js";
import { composeTurnPrompt, createDraftGenerator } from "./stages/narration.js";
import { requestControllerProposal } from "./stages/controller.js";
import { assembleTurnCommands, authorizeTurn } from "./stages/authorization.js";
import { createNarrationAuditor, deliverDraft, reconcileNarration } from "./stages/audit.js";
import { prepareCommit } from "./stages/commit-preparation.js";
import { assembleTurnResult } from "./stages/result.js";
import { TurnError, type TurnDebugRecord, type TurnEvent, type TurnFailure, type TurnRequest } from "./turn-types.js";
import { TurnDiagnosticObserver, type DiagnosticPhase, type TurnDiagnosticsSink } from "./turn-diagnostics.js";
export type { TurnDebugRecord } from "./turn-types.js";

/**
 * The sole layer spanning a turn (docs/architecture/TURN_COORDINATOR.md). Hardening H2: an orchestrator over typed stages in
 * src/turn/stages/. Contractual order: input → intent/projection → retrieval → narration (draft) → controller (proposal) →
 * authorization → final preparation → audit/reconciliation → commit preparation → checkpoint → ONE commit → publication.
 *
 * Authority: stages never mutate CampaignState. `campaign.prepare` is reachable only as a validation capability; the single
 * `campaign.commit` below is the only mutation. `stage` maps a non-TurnError failure to the code of the phase in flight.
 */
const active = new WeakSet<CampaignState>();
/** Observe final audited delivery against generation-time authority and cues surviving packing. */
function inspectPackedPortrayal(world: WorldStore, projected: DeepReadonly<CampaignSnapshot>, context: TurnContext, prompt: GenerationRequest, turn_id: string, revision: number, player_input: string, narration: string) {
  return diagnosticSync(()=>new MannerismPortrayalGate().inspect({ turn_id, revision, player_input, narration,
    characters: context.characters.map(c => ({ id: c.id, name: c.profile.name ?? world.getEntity(c.id)?.name ?? c.id })),
    cues: projected.premium_characters.flatMap(p => (p.mannerisms ?? []).filter(m => prompt.messages.some(msg => msg.content.includes(`- ${m.text} [recurrence=${mannerismEpistemicState(m)};`))).map(m => ({
      character_id: p.character_id, character_name: context.characters.find(c => c.id === p.character_id)?.profile.name ?? world.getEntity(p.character_id)?.name ?? p.character_id,
      mannerism: m, local_evidence: context.characters.find(c => c.id === p.character_id)?.current.presentation,
    }))),
  }),()=>{});
}

export class TurnCoordinator {
  readonly #recent = new WeakMap<CampaignState, RecentConversation>();
  readonly #lastInput = new WeakMap<CampaignState, string>();
  readonly #participants = new WeakMap<CampaignState, SceneParticipants>();
  constructor(private readonly world: WorldStore, private readonly narrator: NarratorProvider, private readonly controller: StateControllerProvider, private readonly retrieval: TurnRetrieval, private readonly promptOptions: NarratorPromptOptions & { readonly narrator_request_setup?: (request: NarratorRequest) => NarratorRequest; readonly evidence_authorization?: EvidenceMode; readonly debug_sink?: (record: TurnDebugRecord) => void; readonly diagnostics_sink?: TurnDiagnosticsSink; readonly diagnostics_include_query?: boolean;
  /** H5: transient provider retry. Omitted → DEFAULT_RETRY_POLICY (one retry); false → none. */ readonly reliability_contract?:boolean; readonly context_policy?: ContextPolicy; readonly context_compaction?: ContextCompactionService; readonly provider_retry?: ProviderRetryPolicy | false } = {}) {}
  recent(campaign: CampaignState): RecentConversation { let recent = this.#recent.get(campaign); if (!recent) { recent = new RecentConversation(); this.#recent.set(campaign, recent); } return recent; }
  /** Session-local ephemeral scene participants (Phase 1P); never persisted or saved. */
  participants(campaign: CampaignState): SceneParticipants { let p = this.#participants.get(campaign); if (!p) { p = new SceneParticipants(); this.#participants.set(campaign, p); } return p; }
  /** Between-turn derived request. Uses the same projection, prompt options and retained dialogue. No hypothetical player action/retrieval. */
  contextRequest(campaign: CampaignState) {
    const input = this.#lastInput.get(campaign) ?? "", recent = this.recent(campaign).forPrompt();
    const context = buildTurnContext(this.world, campaign.exportSnapshot(), { input, recent_text: recent.map(e => `${e.player} ${e.narration}`).join(" ") });
    return buildNarratorPrompt("", context, recent, undefined, { candidates: [], runtime: [] }, { ...this.promptOptions, knowledge_relevance_input: input, recent_scene_source: this.recent(campaign).finalized() });
  }
  async *runTurn(request: TurnRequest): AsyncGenerator<TurnEvent> {
    const { campaign, player_input, signal } = request;
    const base_revision = campaign.revision, start = performance.now();
    // Spanning state: only what the failure path and `finally` need. Everything else is an immutable stage output.
    let stage: TurnFailure = "context_invalid", shown = "", narration: NarratorResult | undefined, recorded = false, owned = false;
    const observer = this.promptOptions.diagnostics_sink ? new TurnDiagnosticObserver(base_revision) : undefined;
    const reliability=new ReliabilityMetrics();
    const measure = <T>(phase: DiagnosticPhase, action: () => T): T => observer ? observer.sync(phase, action) : action();
    const measureAsync = <T>(phase: DiagnosticPhase, action: () => Promise<T>, provider = false): Promise<T> => observer ? observer.async(phase, action, provider) : action();
    const network = new AbortController();
    const cancel = () => network.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const checkpoint = () => {
      if (signal?.aborted) throw new TurnError("cancelled");
      if (campaign.revision !== base_revision) throw new TurnError("stale_turn");
    };
    try {
      // TurnInputStage: one turn per campaign, bounded input, captured base snapshot and revision.
      if (active.has(campaign)) throw new TurnError("turn_in_progress");
      active.add(campaign); owned = true;
      if (!player_input.trim() || player_input.length > 4000) throw new TurnError("invalid_input");
      checkpoint();
      const snapshot = campaign.exportSnapshot();
      yield { type: "turn_started", base_revision };
      checkpoint();
      // IntentResolutionStage: player-authored effects, resolved and prevalidated; the projection is detached (never committed here).
      const intentInput: IntentStageInput = { world: this.world, snapshot, base_revision, player_input, prepare: proposal => campaign.prepare(proposal),
        plan: (input, context) => this.participants(campaign).plan(input, context), finalized: this.recent(campaign).finalized() };
      const resolved = measure("input_intent", () => resolveTurnIntent(intentInput));
      if (resolved.intent.runtime.length) stage = "invalid_runtime_intent";
      const { projected, context, origin, arrival, movable, prompt_intent: promptIntent, scene } = measure("projection", () => projectTurnIntent(intentInput, resolved));
      observer?.context(context);
      const { intent } = resolved;
      // RetrievalStage: read-only and conditional; its output is evidence for narration, never authority.
      stage = "retrieval_failed";
      const retrieved = await measureAsync("retrieval", () => retrieveForTurn(player_input, context, this.world, this.retrieval));
      observer?.retrieved(retrieved, context, !!this.promptOptions.diagnostics_include_query);
      checkpoint();
      const { recent, prompt: directPrompt } = measure("prompt_composition", () => composeTurnPrompt({ player_input, context, recent: this.recent(campaign).forPrompt(), retrieved: retrieved.data, prompt_intent: promptIntent, options: { ...this.promptOptions, recent_scene_source: this.recent(campaign).finalized() }, scene }));
      this.#lastInput.set(campaign, player_input); const preparedPrompt = prepareNarratorRequest(directPrompt, this.promptOptions.context_compaction, this.promptOptions.context_policy); const prompt = this.promptOptions.narrator_request_setup ? prepareNarratorRequest(this.promptOptions.narrator_request_setup(preparedPrompt), undefined, this.promptOptions.context_policy) : preparedPrompt;
      if (observer) observer.record.context_budget = new ContextBudgetManager(this.promptOptions.context_policy).measure(prompt);
      if (observer?.record.context) observer.record.context.knowledge_access_compaction_used = prompt.messages.some(m => m.content.includes("Everyone else present (") || m.content.includes("DO NOT USE every other fact above"));
      // NarrationStage: a buffered DRAFT, never delivered before the audit (Repair 1 authoritative narration order).
      stage = "narrator_failed";
      let revisionGeneration = false;
      if (observer) observer.record.narrator = { completed: false, streamed_characters: 0, final_text_characters: 0 };
      const retryPolicy = this.promptOptions.provider_retry === false ? NO_RETRY_POLICY : this.promptOptions.provider_retry ?? DEFAULT_RETRY_POLICY;
      const budget = new ProviderBudget(retryPolicy);
      const attempts = (key: "narrator" | "revision_narrator" | "controller") => (record: ProviderAttemptRecord) => { reliability.observe(key==="revision_narrator"?"reconciliation":key,record);if (observer) (observer.record.provider_attempts ??= {})[key] = this.promptOptions.reliability_contract?{...record,logical_request_id:`${observer.record.turn_id}:${base_revision}:${key}`}:record; };
      const generate = createDraftGenerator(this.narrator, network.signal, checkpoint, observer ? count => {
        const record = revisionGeneration ? observer.record.revision_narrator : observer.record.narrator;
        if (record) record.streamed_characters += count;
      } : undefined, { technical_contract:!!this.promptOptions.reliability_contract,policy: retryPolicy, budget, record: record => attempts(revisionGeneration ? "revision_narrator" : "narrator")(record),
        // A discarded attempt's partial characters are not counted as the delivered stream.
        attempt_started: () => { const record = revisionGeneration ? observer?.record.revision_narrator : observer?.record.narrator; if (record) record.streamed_characters = 0; } });
      const drafted = await measureAsync("narrator", () => generate(prompt), true);
      if (observer) observer.record.narrator = { streamed_characters: observer.record.narrator?.streamed_characters ?? 0, model: drafted.result.model, usage: drafted.result.usage, latency_ms: drafted.result.latency.elapsed_total_ms, completed: true, final_text_characters: drafted.text.length };
      narration = drafted.result;
      const draft = drafted.text, narratorEnd = performance.now();
      checkpoint();
      yield { type: "controller_started" };

      // ControllerStage: a PROPOSAL only — not authorization, not state, not truth.
      checkpoint(); stage = "controller_failed";
      const proposed = await measureAsync("controller", () => requestControllerProposal({ controller: this.controller, signal: network.signal, base_revision, context, intent, movable, projected, player_input, draft,
        retry: { technical_contract:!!this.promptOptions.reliability_contract,policy: retryPolicy, budget, checkpoint, record: attempts("controller") } }), true);
      if (observer) observer.record.controller = { model: proposed.result.model, ...(proposed.result.provider ? { provider: proposed.result.provider } : {}), usage: proposed.result.usage, latency_ms: proposed.result.latency.elapsed_total_ms,
        parse_success: false, proposed_count: proposed.result.commands.length, command_kinds: proposed.result.commands.map(c => c.kind), normalization_used: !!proposed.result.normalization };
      checkpoint();

      // AuthorizationStage: proposal → per-command decision against deterministic evidence (still detached from state).
      const debugSink = this.promptOptions.debug_sink;
      const sink = debugSink ? (record: TurnDebugRecord) => { try { debugSink(record); } catch { /* Optional debug emission. */ } } : undefined;
      const authorization = measure("authorization", () => authorizeTurn({ controller: proposed.result, intent, draft, context, projected, movable, origin, arrival, world: this.world,
        mode: this.promptOptions.evidence_authorization ?? "hybrid", sink, debug_base: { campaign_id: snapshot.campaign_id, base_revision, player_input } }));
      observer?.authorization(authorization.diagnostics, authorization.duplicates_removed);
      if (observer?.record.controller) observer.record.controller.parse_success = true;
      // Freeze before exposing events: consumers cannot edit commands between authorization and commit.
      yield freezeSnapshot({ type: "state_proposed" as const, diagnostics: structuredClone(authorization.diagnostics) }) as TurnEvent;
      checkpoint();
      const { authorized, commands } = assembleTurnCommands({ diagnostics: authorization.diagnostics, intent, projected });

      // Final preparation: the WHOLE candidate batch, validated against the captured base revision. A receipt, not a commit.
      stage = "campaign_validation_failed";
      const prepared = measure("preparation", () => campaign.prepare({ expected_revision: base_revision, commands }));
      if (observer) Object.assign(observer.record.commit, { prepare_changed: prepared.changed, command_count: commands.length, command_kinds: commands.map(c => c.kind) });
      checkpoint();

      // AuditStage: the draft must not contradict the prepared candidate. One bounded revision, then deterministic redaction.
      // It only chooses the delivered text; state is never changed here.
      const auditor = measure("audit", () => createNarrationAuditor({ base_revision, context, world: this.world, retrieved: retrieved.data, player_input, recent, intent, scene,
        turn_evidence: authorization.turn_evidence, diagnostics: authorization.diagnostics, authorized, prepared: prepared.snapshot, origin }));
      const issues = measure("audit", () => auditor.check(draft, authorization.turn_evidence));
      if (observer) observer.record.audit = { issue_count: issues.length, issue_kinds: issues.map(i => i.kind), reconciliation_attempted: issues.length > 0,
        revision_issue_count: 0, revision_issue_kinds: [], redaction_used: false, delivered: "draft" };
      let delivery = deliverDraft(draft, issues);
      if (issues.length) {
        const outcome = auditor.outcome(issues);
        stage = "narrator_failed";
        revisionGeneration = true;
        if (observer) observer.record.revision_narrator = { completed: false, streamed_characters: 0, final_text_characters: 0 };
        delivery = await measureAsync("reconciliation", () => reconcileNarration({ auditor: { ...auditor, check: (text, evidence) => measure("reconciliation_audit", () => auditor.check(text, evidence)) },
          generate: p => measureAsync("reconciliation_narrator", async () => {
            const revision = await generate(prepareNarratorRequest(p, this.promptOptions.context_compaction, this.promptOptions.context_policy));
            if (observer) observer.record.revision_narrator = { streamed_characters: observer.record.revision_narrator?.streamed_characters ?? 0,
              model: revision.result.model, usage: revision.result.usage, latency_ms: revision.result.latency.elapsed_total_ms, completed: true, final_text_characters: revision.text.length };
            return revision;
          }, true), checkpoint, prompt, draft, issues, outcome, intent, context }));
        stage = "campaign_validation_failed";
      }

      if (observer?.record.audit) Object.assign(observer.record.audit, { revision_issue_count: delivery.revision_issues.length,
        revision_issue_kinds: delivery.revision_issues.map(i => i.kind), redaction_used: delivery.delivered === "redacted", delivered: delivery.delivered });
      // CommitPreparation: name-driven identity on the DELIVERED narration joins the batch, or is skipped observably (H1).
      const plan = measure("commit_preparation", () => prepareCommit({ world: this.world, prepare: proposal => campaign.prepare(proposal), prepared, commands, finalized: this.recent(campaign).finalized(), player_input,
        delivered: delivery.text, scene, base_revision, disclosure_intent: promptIntent, location_changed: origin !== arrival,
        on_skip: reason => sink?.({ kind: "identity_establishment_skipped", campaign_id: snapshot.campaign_id, base_revision, player_input, reason }) }));
      if (observer) Object.assign(observer.record.commit, { identity_promotion_count: plan.identity.promoted.length, identity_skipped: !!plan.identity_skipped,
        location_changed_naming_skip: origin !== arrival });
      if (observer) {const portrayal=inspectPackedPortrayal(this.world, projected, context, prompt, observer.record.turn_id, base_revision, player_input, delivery.text);if(portrayal)observer.record.mannerism_portrayal=portrayal;else reliability.increment("shadow_skips");}
      // A deliverable is prepared and checked before committing; publication follows the single commit.
      if(!delivery.text.trim())throw new TurnError("narrator_failed");
      if(!this.promptOptions.reliability_contract){shown=delivery.text;yield {type:"narration_delta",text:delivery.text};yield {type:"narration_completed",text:delivery.text};}
      if (observer) { observer.phase = "commit"; }
      const commitStart = observer ? performance.now() : 0;
      checkpoint();
      const committed = campaign.commit(plan.receipt); // No await/callback/yield between the last checkpoint and commit.
      if(Object.values(observer?.record.provider_attempts??{}).some(r=>r?.recovered))reliability.increment("state_commit_after_retry_count");
      if (observer) { observer.elapsed("commit", commitStart, false); observer.record.commit.attempted = true; observer.record.commit.succeeded = true; observer.phase = "publication"; }
      const publicationStart = observer ? performance.now() : 0;
      // Publication: conversation history and scene continuity are updated only after the commit.
      this.recent(campaign).add({ player: player_input, narration: delivery.text, status: "finalized", location_id: prepared.snapshot.runtime.scene.player_location, ...(scene.canonical_location_id && scene.focus ? { conversation_partner_id: scene.focus } : {}) }); recorded = true;
      this.participants(campaign).commit(scene, delivery.text);
      const participantsAfter = this.participants(campaign).retire(plan.identity.promoted.flatMap(p => p.participant_id ? [p.participant_id] : []));
      const result = assembleTurnResult({ world: this.world, base_revision, final_revision: committed.revision, player_input, proposal: authorization.proposal, commands,
        diagnostics: authorization.diagnostics, retrieval: retrieved, turn_evidence: authorization.turn_evidence, delivery, narration, controller: proposed.result,
        controller_prior_state: proposed.prior_state, context, recent, access: auditor.access, scene, participants_after: participantsAfter, commit_plan: plan,
        origin, arrival, intent, narrator_end: narratorEnd, start });
      if (observer) { observer.elapsed("publication", publicationStart, false); observer.record.outcome = "success"; }
      if(this.promptOptions.reliability_contract){shown=delivery.text;yield {type:"narration_delta",text:delivery.text};yield {type:"narration_completed",text:delivery.text};}
      yield { type: "state_committed", ...committed };
      yield freezeSnapshot({ type: "turn_completed" as const, result }) as TurnEvent;
    } catch (error) {
      reliability.increment("player_turn_degraded_failure_count");
      if(error instanceof TurnError&&error.code==="stale_turn")reliability.increment("stale_revision_count");
      if(error instanceof TurnError&&error.code==="turn_in_progress")reliability.increment("duplicate_effect_prevented_count");
      const code = signal?.aborted ? "cancelled" : error instanceof TurnError ? error.code : stage;
      if (observer) { observer.record.outcome = "failure"; observer.record.failure_code = code; observer.record.failure_phase = observer.phase;
        if (observer.phase === "commit" && !(error instanceof TurnError)) observer.record.commit.attempted = true;
        if (code === "context_too_large") observer.record.context_too_large_cause = observer.phase;
        if (code === "retrieval_failed" && observer.phase === "retrieval") observer.record.retrieval = { triggered: true, mode: "failed", ids: [], reference_count: 0, fetched_count: 0,
          payload_characters: 0, latency_ms: observer.record.stage_timings.retrieval?.deterministic_ms ?? 0, lexical_used: false, limits: RETRIEVAL_LIMITS, failure_code: code };
        if (error instanceof ProviderError) observer.record.provider_code = error.code; }
      // Repair 1.2: evaluation/debug evidence only; never part of the player-facing event.
      if (error instanceof ProviderError && error.diagnostic) { try { this.promptOptions.debug_sink?.({ kind: "controller_parse_failure", campaign_id: campaign.exportSnapshot().campaign_id, base_revision, player_input, stage, ...error.diagnostic }); } catch { /* Optional debug emission. */ } }
      yield { type: "turn_failed", code, ...(error instanceof ProviderError ? { provider_code: error.code } : {}), narration: shown, incomplete: true, base_revision, final_revision: campaign.revision };
    } finally {
      network.abort(); signal?.removeEventListener("abort", cancel);
      // Runtime Continuity Repair 1: only delivered text is ever retained; an undelivered draft or revision never enters history.
      if (narration && !recorded) this.recent(campaign).add({ player: player_input, narration: shown, status: "state_failed" });
      if (owned) active.delete(campaign);
      if (observer && this.promptOptions.diagnostics_sink) {if(this.promptOptions.reliability_contract)observer.record.provider_reliability={...reliability.counters};observer.emit(this.promptOptions.diagnostics_sink, campaign.revision);}
    }
  }
}
