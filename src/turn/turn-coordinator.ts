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
import { ProviderError, type ProviderErrorCode } from "../llm/errors.js";
import { DEFAULT_RETRY_POLICY, NO_RETRY_POLICY, ProviderBudget, type ProviderAttemptRecord, type ProviderRetryPolicy } from "../llm/retry.js";
import {ReliabilityMetrics,diagnosticSync} from "../llm/reliability.js";
import type { WorldStore } from "../world/world-store.js";
import type { NarratorPromptOptions } from "./prompt-builder.js";
import { retrieveForTurn, RETRIEVAL_LIMITS, type TurnRetrieval } from "./retrieval-policy.js";
import type { EvidenceMode } from "./evidence-authorization.js";
import { RecentConversation } from "./recent-conversation.js";
import { SceneParticipants, nextParticipantSeed, type SceneParticipantPlan } from "./scene-participants.js";
import { trackablePeople, type TrackablePerson } from "./keep-track.js";
import { narratedForegroundCanonical, narratedSpeakerPartner } from "./foreground-binding.js";
import { backgroundGroundingOption } from "./background-grounding.js";
import { projectTurnIntent, resolveTurnIntent, type IntentStageInput } from "./stages/intent.js";
import { composeTurnPrompt, createDraftGenerator, truncationRecoveryRequest, type NarratorDraft } from "./stages/narration.js";
import { NarratorLedger, NARRATOR_RECOVERY_OUTPUT_TOKENS } from "./narrator-ledger.js";
import { requestControllerProposal } from "./stages/controller.js";
import { referencedCharacters } from "./referenced-characters.js";
import { assembleTurnCommands, authorizeTurn } from "./stages/authorization.js";
import { createNarrationAuditor, deliverDraft, reconcileNarration } from "./stages/audit.js";
import { prepareCommit } from "./stages/commit-preparation.js";
import { assembleTurnResult } from "./stages/result.js";
import { TurnError, type PublicationStep, type TurnDebugRecord, type TurnEvent, type TurnFailure, type TurnRequest } from "./turn-types.js";
import { TurnDiagnosticObserver, controllerModelDiagnostics, type DiagnosticPhase, type TurnDiagnosticsSink } from "./turn-diagnostics.js";
import { createFactSource } from "./narration-facts/index.js";
import { movementFactScope } from "./movement/movement-scope.js";
export type { TurnDebugRecord } from "./turn-types.js";

/**
 * The sole layer spanning a turn (docs/architecture/TURN_COORDINATOR.md). Hardening H2: an orchestrator over typed stages in
 * src/turn/stages/. Contractual order: input → intent/projection → retrieval → narration (draft) → controller (proposal) →
 * authorization → final preparation → audit/reconciliation → commit preparation → checkpoint → ONE commit → publication.
 * Block 4: NO narrator prose leaves the coordinator before the commit (only status words, `turn_progress`); once `campaign.commit` returns the turn
 * SUCCEEDED and every later step is a guarded, non-fatal publication step (PIPE-2); the narrator draws on one per-turn ledger (≤ 2 logical
 * generations, ≤ 3 physical provider requests) and a `length` ending is regenerated once, never delivered or committed (NARR-1).
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

/**
 * Foreground canonical binding: with no explicit selection this turn, the one present canonical actor the delivered narration foregrounded
 * (strong, exclusive authored-trait evidence) is the objective conversation partner for the next turn. Never across a location change.
 */
function narratedPartner(scene: SceneParticipantPlan, context: TurnContext, delivered: string, location: string | undefined, stayed: boolean, previous?: string) {
  const id = !scene.focus && location && stayed ? narratedForegroundCanonical(context, delivered) ?? narratedSpeakerPartner(context, previous, delivered) : undefined;
  return id && location ? { character_id: id, location_id: location } : undefined;
}

export class TurnCoordinator {
  readonly #recent = new WeakMap<CampaignState, RecentConversation>();
  readonly #lastInput = new WeakMap<CampaignState, string>();
  readonly #participants = new WeakMap<CampaignState, SceneParticipants>();
  constructor(private readonly world: WorldStore, private readonly narrator: NarratorProvider, private readonly controller: StateControllerProvider, private readonly retrieval: TurnRetrieval, private readonly promptOptions: NarratorPromptOptions & { readonly narrator_request_setup?: (request: NarratorRequest) => NarratorRequest; readonly evidence_authorization?: EvidenceMode; readonly debug_sink?: (record: TurnDebugRecord) => void; readonly diagnostics_sink?: TurnDiagnosticsSink; readonly diagnostics_include_query?: boolean;
  /** H5: transient provider retry. Omitted → DEFAULT_RETRY_POLICY (one retry); false → none. */ readonly reliability_contract?:boolean; readonly context_policy?: ContextPolicy; readonly context_compaction?: ContextCompactionService; readonly provider_retry?: ProviderRetryPolicy | false } = {}) {}
  recent(campaign: CampaignState): RecentConversation { let recent = this.#recent.get(campaign); if (!recent) { recent = new RecentConversation(); this.#recent.set(campaign, recent); } return recent; }
  /** Session-local ephemeral scene participants (Phase 1P); never persisted or saved. */
  /** Actual Offer V1: a narrated captive promoted outside a turn (by accepting an offer) leaves the temporary registry. */
  retireParticipants(campaign: CampaignState, ids: readonly string[]): void { this.participants(campaign).retire(ids); }
  participants(campaign: CampaignState): SceneParticipants { let p = this.#participants.get(campaign); if (!p) { p = new SceneParticipants(nextParticipantSeed(campaign.exportSnapshot())); this.#participants.set(campaign, p); } return p; }
  /** Block 12 (KPG-1): the provisional people of the current scene the player may Keep track of (read-only; the scene reading plus this session's participants). */
  trackablePeople(campaign: CampaignState): readonly TrackablePerson[] {
    const snapshot = campaign.exportSnapshot();
    return trackablePeople({ recent: this.recent(campaign).finalized(), context: buildTurnContext(this.world, snapshot), world: this.world, snapshot, participants: this.participants(campaign).active() });
  }
  /** Explicit application correction only; no campaign history or state is rewritten. */
  resetSceneContinuity(campaign: CampaignState): void {
    this.#recent.set(campaign, new RecentConversation());
    this.#lastInput.delete(campaign);
    this.#participants.get(campaign)?.resetBoundary();
  }
  /** Between-turn derived request. Uses the same projection, prompt options and retained dialogue. No hypothetical player action/retrieval. */
  contextRequest(campaign: CampaignState) {
    const input = this.#lastInput.get(campaign) ?? "", recent = this.recent(campaign).forPrompt();
    const context = buildTurnContext(this.world, campaign.exportSnapshot(), { input, recent_text: recent.map(e => `${e.player} ${e.narration}`).join(" ") });
    return buildNarratorPrompt("", context, recent, undefined, { candidates: [], runtime: [] }, { ...this.promptOptions, knowledge_relevance_input: input, recent_scene_source: this.recent(campaign).finalized() });
  }
  /** Finalizes the exchange in recent memory and commits scene participants; a narrated canonical foreground person is bound as the partner. */
  private recordExchange(campaign: CampaignState, i: { readonly player_input: string; readonly scene: SceneParticipantPlan; readonly context: TurnContext; readonly delivered: string; readonly location: string | undefined; readonly stayed: boolean }): void {
    const narrated = narratedPartner(i.scene, i.context, i.delivered, i.location, i.stayed, this.recent(campaign).finalized().at(-1)?.narration);
    this.recent(campaign).add({ player: i.player_input, narration: i.delivered, status: "finalized", ...(i.location ? { location_id: i.location } : {}), ...(i.scene.canonical_location_id && i.scene.focus ? { conversation_partner_id: i.scene.focus } : narrated ? { conversation_partner_id: narrated.character_id } : {}) });
    this.participants(campaign).commit(i.scene, i.delivered, narrated);
  }
  /**
   * NARR-1: exactly ONE constrained regeneration replaces a truncated primary (same base revision, same context, a larger cap, a minimal recovery
   * instruction; not a continuation, nothing stitched). Shares the turn's physical/logical budget. Any failure is the terminal `narrator_truncated`.
   */
  private async regenerateTruncated(c: { readonly ledger: NarratorLedger; readonly generate: ReturnType<typeof createDraftGenerator>; readonly prompt: NarratorRequest; readonly checkpoint: () => void; readonly run: <T>(action: () => Promise<T>) => Promise<T> }): Promise<NarratorDraft> {
    const failTruncated = (code?: ProviderErrorCode) => { c.ledger.recovery("failed"); return new TurnError("narrator_truncated", code); };
    if (c.ledger.physicalRemaining() < 1 || c.ledger.logicalRemaining() < 1) { c.ledger.recovery("budget_exhausted"); throw new TurnError("narrator_truncated"); }
    c.checkpoint();
    let again: NarratorDraft;
    try { again = await c.run(() => c.generate(truncationRecoveryRequest(c.prompt), { generation: "recovery", max_output_tokens: NARRATOR_RECOVERY_OUTPUT_TOKENS, accept_truncated: true })); }
    catch (error) {
      if (error instanceof TurnError && (error.code === "cancelled" || error.code === "stale_turn")) throw error;
      throw failTruncated(error instanceof ProviderError ? error.code : undefined);
    }
    if (again.finish_reason === "length") throw failTruncated();
    c.ledger.recovery("succeeded");
    return again;
  }
  /** PIPE-2: everything after the single commit. Each step is guarded; nothing here can turn the committed turn into a failure. */
  private async *publishCommitted(c: { readonly campaign: CampaignState; readonly committed: ReturnType<CampaignState["commit"]>; readonly plan: ReturnType<typeof prepareCommit>; readonly scene: SceneParticipantPlan; readonly context: TurnContext;
    readonly player_input: string; readonly delivery_text: string; readonly prepared_snapshot: DeepReadonly<CampaignSnapshot>; readonly stayed: boolean; readonly resultDraft: ReturnType<typeof assembleTurnResult>; readonly narratorEnd: number; readonly start: number;
    readonly observer: TurnDiagnosticObserver | undefined; readonly reliability: ReliabilityMetrics; readonly warnings: PublicationStep[]; readonly commitStart: number }): AsyncGenerator<TurnEvent> {
    const { campaign, committed, plan, scene, context, player_input, observer, reliability, warnings } = c;
    const diagnostic = (action: () => void) => { try { action(); } catch { if (!warnings.includes("diagnostics")) warnings.push("diagnostics"); } };
    diagnostic(() => {
      if(Object.values(observer?.record.provider_attempts??{}).some(r=>r?.recovered))reliability.increment("state_commit_after_retry_count");
      if (observer) { observer.elapsed("commit", c.commitStart, false); observer.record.commit.attempted = true; observer.record.commit.succeeded = true; observer.phase = "publication"; }
    });
    yield { type: "state_committed", ...committed, narration: c.delivery_text, ...(c.resultDraft.confirmation_proposals ? { confirmation_proposals: c.resultDraft.confirmation_proposals } : {}) };
    const publicationStart = observer ? performance.now() : 0;
    // Publication: conversation history and scene continuity are updated only after the commit.
    try { this.recordExchange(campaign, { player_input, scene, context, delivered: c.delivery_text, location: c.prepared_snapshot.runtime.scene.player_location, stayed: c.stayed }); }
    catch {
      warnings.push("exchange_history");
      try { this.recent(campaign).add({ player: player_input, narration: c.delivery_text, status: "finalized" }); } catch { /* Continuity degrades; the committed turn does not. */ }
    }
    let participantsAfter: ReturnType<SceneParticipants["retire"]> = [];
    try { participantsAfter = this.participants(campaign).name(plan.identity.provisional.flatMap(p => p.participant_id && p.name ? [{ id: p.participant_id, name: p.name }] : [])); }
    catch { warnings.push("scene_participants"); }
    const now = performance.now();
    const result = { ...c.resultDraft, final_revision: committed.revision, scene_participants: { plan: scene, after: participantsAfter },
      latency: { ...c.resultDraft.latency, controller_tail_ms: now - c.narratorEnd, coordinator_total_ms: now - c.start } };
    diagnostic(() => { if (observer) { observer.elapsed("publication", publicationStart, false); observer.record.outcome = "success"; if (warnings.length) observer.record.publication_warnings = [...warnings]; } });
    yield { type: "narration_completed", text: c.delivery_text };
    for (const step of warnings) yield { type: "publication_warning", step };
    let completedEvent: TurnEvent = { type: "turn_completed", result };
    try { completedEvent = freezeSnapshot(completedEvent) as TurnEvent; } catch { /* An unfrozen result is still the committed result. */ }
    yield completedEvent;
  }
  /** The one terminal event of an errored turn: a publication warning when the commit already happened (PIPE-2), otherwise `turn_failed`. */
  private failureEvent(c: { readonly error: unknown; readonly committedTurn: { readonly revision: number } | undefined; readonly warnings: PublicationStep[]; readonly observer: TurnDiagnosticObserver | undefined; readonly reliability: ReliabilityMetrics;
    readonly signal: AbortSignal | undefined; readonly stage: TurnFailure; readonly campaign: CampaignState; readonly base_revision: number; readonly player_input: string }): TurnEvent {
    const { error, observer, reliability, warnings, campaign, base_revision, player_input, stage } = c;
    if (c.committedTurn) {
      // An error after the commit is a publication problem, never a failed turn (the player must not retry a turn that already happened).
      if (!warnings.includes("result_publication")) warnings.push("result_publication");
      if (observer) { try { observer.record.outcome = "success"; observer.record.publication_warnings = [...warnings]; } catch { /* diagnostics only */ } }
      return { type: "publication_warning", step: "result_publication" };
    }
    reliability.increment("player_turn_degraded_failure_count");
    if(error instanceof TurnError&&error.code==="stale_turn")reliability.increment("stale_revision_count");
    if(error instanceof TurnError&&error.code==="turn_in_progress")reliability.increment("duplicate_effect_prevented_count");
    const code = c.signal?.aborted ? "cancelled" : error instanceof TurnError ? error.code : stage;
    if (observer) { observer.record.outcome = "failure"; observer.record.failure_code = code; observer.record.failure_phase = observer.phase;
      if (observer.phase === "commit" && !(error instanceof TurnError)) observer.record.commit.attempted = true;
      if (code === "context_too_large") observer.record.context_too_large_cause = observer.phase;
      if (code === "retrieval_failed" && observer.phase === "retrieval") observer.record.retrieval = { triggered: true, mode: "failed", ids: [], reference_count: 0, fetched_count: 0,
        payload_characters: 0, latency_ms: observer.record.stage_timings.retrieval?.deterministic_ms ?? 0, lexical_used: false, limits: RETRIEVAL_LIMITS, failure_code: code };
      if (error instanceof ProviderError) observer.record.provider_code = error.code; else if (error instanceof TurnError && error.provider_code) observer.record.provider_code = error.provider_code; }
    // Repair 1.2: evaluation/debug evidence only; never part of the player-facing event.
    if (error instanceof ProviderError && error.diagnostic) { try { this.promptOptions.debug_sink?.({ kind: "controller_parse_failure", campaign_id: campaign.exportSnapshot().campaign_id, base_revision, player_input, stage, ...error.diagnostic }); } catch { /* Optional debug emission. */ } }
    const provider_code = error instanceof ProviderError ? error.code : error instanceof TurnError ? error.provider_code : undefined;
    // `narration` is always empty: no prose is ever delivered before the commit, so a failed turn has nothing to show.
    return { type: "turn_failed", code, ...(provider_code ? { provider_code } : {}), narration: "", incomplete: true, base_revision, final_revision: campaign.revision };
  }
  async *runTurn(request: TurnRequest): AsyncGenerator<TurnEvent> {
    const { campaign, player_input, signal, turn_key, expected_revision, pending_confirmations } = request;
    const base_revision = campaign.revision, start = performance.now();
    // Spanning state: only what the failure path and `finally` need. Everything else is an immutable stage output.
    let stage: TurnFailure = "context_invalid", narration: NarratorResult | undefined, recorded = false, owned = false, committedTurn: { readonly revision: number; readonly narration: string } | undefined;
    const observer = this.promptOptions.diagnostics_sink ? new TurnDiagnosticObserver(base_revision) : undefined;
    if (observer && turn_key) observer.record.turn_key = turn_key;
    const reliability=new ReliabilityMetrics();
    const warnings: PublicationStep[] = [];
    const ledger = new NarratorLedger();
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
      if (!player_input.trim() || player_input.length > 4000 || /^\s*\/location(?:\s|$)/i.test(player_input)) throw new TurnError("invalid_input");
      // REV-2: a request built on another revision is rejected before any provider call or mutation.
      if (expected_revision !== undefined && expected_revision !== base_revision) throw new TurnError("stale_turn");
      checkpoint();
      const snapshot = campaign.exportSnapshot();
      yield { type: "turn_started", base_revision, ...(turn_key ? { turn_key } : {}) };
      yield { type: "turn_progress", phase: "thinking" };
      checkpoint();
      // IntentResolutionStage: player-authored effects, resolved and prevalidated; the projection is detached (never committed here).
      const intentInput: IntentStageInput = { world: this.world, snapshot, base_revision, player_input, prepare: proposal => campaign.prepare(proposal),
        plan: (input, context) => this.participants(campaign).plan(input, context, this.recent(campaign).finalized()), finalized: this.recent(campaign).finalized(), pending_confirmations: pending_confirmations ?? [] };
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
      const { recent, prompt: directPrompt } = measure("prompt_composition", () => composeTurnPrompt({ player_input, context, recent: this.recent(campaign).forPrompt(), retrieved: retrieved.data, prompt_intent: promptIntent, options: { ...this.promptOptions, recent_scene_source: this.recent(campaign).finalized(), ...backgroundGroundingOption(this.world, context, player_input, this.recent(campaign).finalized(), scene) }, scene }));
      this.#lastInput.set(campaign, player_input); const preparedPrompt = prepareNarratorRequest(directPrompt, this.promptOptions.context_compaction, this.promptOptions.context_policy); const prompt = this.promptOptions.narrator_request_setup ? prepareNarratorRequest(this.promptOptions.narrator_request_setup(preparedPrompt), undefined, this.promptOptions.context_policy) : preparedPrompt;
      if (observer) observer.record.context_budget = new ContextBudgetManager(this.promptOptions.context_policy).measure(prompt);
      if (observer?.record.context) observer.record.context.knowledge_access_compaction_used = prompt.messages.some(m => m.content.includes("Everyone else present (") || m.content.includes("DO NOT USE every other fact above"));
      // NarrationStage: a buffered DRAFT, never delivered before the audit (Repair 1 authoritative narration order). The player sees status only.
      stage = "narrator_failed";
      yield { type: "turn_progress", phase: "narrating" };
      let revisionGeneration = false, recoveryGeneration = false;
      if (observer) observer.record.narrator = { completed: false, streamed_characters: 0, final_text_characters: 0 };
      const retryPolicy = this.promptOptions.provider_retry === false ? NO_RETRY_POLICY : this.promptOptions.provider_retry ?? DEFAULT_RETRY_POLICY;
      const budget = new ProviderBudget(retryPolicy);
      const attempts = (key: "narrator" | "recovery_narrator" | "revision_narrator" | "controller") => (record: ProviderAttemptRecord) => { reliability.observe(key==="revision_narrator"?"reconciliation":key==="recovery_narrator"?"narrator":key,record);if (observer) (observer.record.provider_attempts ??= {})[key] = this.promptOptions.reliability_contract?{...record,logical_request_id:`${observer.record.turn_id}:${base_revision}:${key}`}:record; };
      const currentKey = () => revisionGeneration ? "revision_narrator" as const : recoveryGeneration ? "recovery_narrator" as const : "narrator" as const;
      const generate = createDraftGenerator(this.narrator, network.signal, checkpoint, observer ? count => {
        const record = revisionGeneration ? observer.record.revision_narrator : observer.record.narrator;
        if (record) record.streamed_characters += count;
      } : undefined, { technical_contract:!!this.promptOptions.reliability_contract,policy: retryPolicy, budget, record: record => attempts(currentKey())(record),
        // A discarded attempt's partial characters are not counted as the delivered stream.
        attempt_started: () => { const record = revisionGeneration ? observer?.record.revision_narrator : observer?.record.narrator; if (record) record.streamed_characters = 0; } }, ledger);
      let drafted: NarratorDraft = await measureAsync("narrator", () => generate(prompt, { generation: "primary", accept_truncated: true }), true);
      // NARR-1: a `length` ending is an incomplete narration, never delivered, never sent to the controller, never audited, never committed (see regenerateTruncated).
      if (drafted.finish_reason === "length") { recoveryGeneration = true; drafted = await this.regenerateTruncated({ ledger, generate, prompt, checkpoint, run: a => measureAsync("narrator", a, true) }); recoveryGeneration = false; }
      if (observer) observer.record.narrator = { streamed_characters: observer.record.narrator?.streamed_characters ?? 0, model: drafted.result.model, usage: drafted.result.usage, latency_ms: drafted.result.latency.elapsed_total_ms, completed: true, final_text_characters: drafted.text.length };
      narration = drafted.result;
      const draft = drafted.text, narratorEnd = performance.now();
      checkpoint();
      yield { type: "controller_started" };
      yield { type: "turn_progress", phase: "resolving" };

      // ControllerStage: a PROPOSAL only — not authorization, not state, not truth. Reached only with ONE complete narration.
      checkpoint(); stage = "controller_failed";
      const proposed = await measureAsync("controller", () => requestControllerProposal({ controller: this.controller, signal: network.signal, base_revision, context, intent, movable, projected, player_input, draft,
        referenced: referencedCharacters(this.world, projected, context.characters.map(c => c.id), player_input, draft), retry: { technical_contract:!!this.promptOptions.reliability_contract,policy: retryPolicy, budget, checkpoint, record: attempts("controller") } }), true);
      if (observer) observer.record.controller = { ...controllerModelDiagnostics(proposed.result), usage: proposed.result.usage, latency_ms: proposed.result.latency.elapsed_total_ms,
        parse_success: false, proposed_count: proposed.result.commands.length, command_kinds: proposed.result.commands.map(c => c.kind), normalization_used: !!proposed.result.normalization };
      checkpoint();

      // AuthorizationStage: proposal → per-command decision against deterministic evidence (still detached from state).
      const debugSink = this.promptOptions.debug_sink;
      const sink = debugSink ? (record: TurnDebugRecord) => { try { debugSink(record); } catch { /* Optional debug emission. */ } } : undefined;
      // NarrationFacts: ONE extraction of the draft, read by authorization and by the audit below.
      const factSource = createFactSource(movementFactScope(projected, this.world, context, [origin, arrival], player_input));
      const authorization = measure("authorization", () => authorizeTurn({ controller: proposed.result, intent, draft, context, projected, movable, origin, arrival, world: this.world, facts: factSource,
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
      const auditor = measure("audit", () => createNarrationAuditor({ facts: factSource, before: snapshot, base_revision, context, world: this.world, retrieved: retrieved.data, player_input, recent, finalized: this.recent(campaign).finalized(), intent, scene,
        turn_evidence: authorization.turn_evidence, diagnostics: authorization.diagnostics, authorized, prepared: prepared.snapshot, origin, elapsed_minutes: prepared.snapshot.runtime.scene.world_time.world_minute - snapshot.runtime.scene.world_time.world_minute }));
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
            // The revision is the turn's (at most) second logical generation and shares the physical budget: when none is left the complete
            // draft is redacted deterministically instead (no extra provider request, no regression to a failed turn).
            if (ledger.logicalRemaining() < 1 || ledger.physicalRemaining() < 1) return undefined;
            const revision = await generate(prepareNarratorRequest(p, this.promptOptions.context_compaction, this.promptOptions.context_policy), { generation: "revision", accept_truncated: true });
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
        delivered: delivery.text, scene, base_revision, facts: factSource, disclosure_intent: promptIntent, trade_recheck: { diagnostics: authorization.diagnostics, projected }, location_changed: origin !== arrival,
        on_skip: reason => sink?.({ kind: "identity_establishment_skipped", campaign_id: snapshot.campaign_id, base_revision, player_input, reason }) }));
      if (observer) Object.assign(observer.record.commit, { identity_provisional_count: plan.identity.provisional.length, identity_skipped: !!plan.identity_skipped,
        location_changed_naming_skip: origin !== arrival });
      if (observer) {const portrayal=inspectPackedPortrayal(this.world, projected, context, prompt, observer.record.turn_id, base_revision, player_input, delivery.text);if(portrayal)observer.record.mannerism_portrayal=portrayal;else reliability.increment("shadow_skips");}
      // A deliverable is prepared and checked before committing; publication follows the single commit.
      if(!delivery.text.trim())throw new TurnError("narrator_failed");
      // PIPE-2: everything that can be computed without the commit's outcome is computed BEFORE it, so a failure here is still a clean pre-commit failure.
      const resultDraft = assembleTurnResult({ world: this.world, base_revision, final_revision: prepared.snapshot.revision, player_input, proposal: authorization.proposal, commands,
        diagnostics: authorization.diagnostics, retrieval: retrieved, turn_evidence: authorization.turn_evidence, delivery, narration, controller: proposed.result,
        controller_prior_state: proposed.prior_state, context, recent, access: auditor.access, scene, participants_after: [], commit_plan: plan,
        origin, arrival, intent, narrator_end: narratorEnd, start });
      if (observer) { observer.phase = "commit"; }
      const commitStart = observer ? performance.now() : 0;
      checkpoint();
      const committed = campaign.commit(plan.receipt); // No await/callback/yield between the last checkpoint and commit.
      // From here the turn SUCCEEDED. Nothing below may turn it into a failure: history bookkeeping is ours, every step is guarded.
      committedTurn = { revision: committed.revision, narration: delivery.text }; recorded = true;
      yield* this.publishCommitted({ campaign, committed, plan, scene, context, player_input, delivery_text: delivery.text, prepared_snapshot: prepared.snapshot, stayed: origin === arrival,
        resultDraft, narratorEnd, start, observer, reliability, warnings, commitStart });
    } catch (error) {
      yield this.failureEvent({ error, committedTurn, warnings, observer, reliability, signal, stage, campaign, base_revision, player_input });
    } finally {
      network.abort(); signal?.removeEventListener("abort", cancel);
      // Runtime Continuity Repair 1: only delivered text is ever retained; an undelivered draft or revision never enters history.
      if (narration && !recorded) this.recent(campaign).add({ player: player_input, narration: "", status: "state_failed" });
      if (owned) active.delete(campaign);
      if (observer) { try { if (ledger.physical > 0) observer.record.narrator_generation = ledger.snapshot(); } catch { /* diagnostics only */ } }
      if (observer && this.promptOptions.diagnostics_sink) {if(this.promptOptions.reliability_contract)observer.record.provider_reliability={...reliability.counters};observer.emit(this.promptOptions.diagnostics_sink, campaign.revision);}
    }
  }
}
