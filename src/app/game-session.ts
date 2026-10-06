import type { NarratorRequest } from "../llm/types.js";
import { ContextBudgetManager, type ContextPolicy } from "../turn/context-budget.js";
import { unavailableCompactor, type ContextCompactionService, type CompactionReason, type CompactionResult } from "./context-compaction.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignSaveRepository, SaveListing, SaveSlot, SavedCampaign } from "../persistence/campaign-repository.js";
import { CampaignSession } from "../persistence/campaign-session.js";
import { validateSaveId } from "../persistence/save-format.js";
import { reflectAfterTurn, type ReflectionProvider, type ReflectionRun } from "../turn/reflection.js";
import { MannerismMaintenance, type MannerismExtractor, type MannerismRun } from "../turn/mannerism-extraction.js";
import type { ReflectionDiagnostics } from "../turn/reflection-diagnostics.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { TurnEvent } from "../turn/turn-types.js";
import type { TurnCoordinator } from "../turn/turn-coordinator.js";
import type { WorldStore } from "../world/world-store.js";
import { appError, toAppError, type AppError } from "./app-errors.js";
import { deriveSessionView, type ProviderStatus, type SessionStatus, type SessionView } from "./session-view.js";
import { derivePlayUiView } from "./play-ui-view.js";
import { buildTrace, exportTrace, summarizeReflection, turnIdOf, type DebugExport, type TurnTrace } from "./turn-trace.js";

/**
 * The single application seam a UI talks to (docs/UI_ENGINE_CONTRACT.md). It composes the existing TurnCoordinator,
 * CampaignSession (manual save, dirty tracking) and the save repository; it owns no campaign truth of its own.
 */
export interface SessionHooks {
  /** Optional application-owned narrator setup; does not affect controller requests or campaign state. */
  readonly narrator_request_setup?: (request: NarratorRequest) => NarratorRequest;
  readonly diagnostics_sink: (record: DeepReadonly<TurnDiagnostics>) => unknown }
export interface SessionDeps {
  readonly world: WorldStore; readonly repository: CampaignSaveRepository;
  /** Receives the session's diagnostics hook so per-turn diagnostics can be captured; a stub coordinator may ignore it. */
  readonly createCoordinator: (hooks: SessionHooks) => Pick<TurnCoordinator, "runTurn"> & Partial<Pick<TurnCoordinator, "contextRequest" | "resetSceneContinuity">>;
  readonly context_policy?: ContextPolicy;
  readonly compaction_service?: ContextCompactionService;
  readonly reflection_provider?: ReflectionProvider | undefined;
  readonly mannerism_extractor?: MannerismExtractor;
  readonly mannerism_diagnostics_sink?: (run: MannerismRun) => unknown;
  readonly provider_status?: ProviderStatus;
  /** Bounded in-memory trace ring (default 200). */
  readonly trace_capacity?: number;
  /** Developer-only: keep draft text, controller proposal and authorization evidence in traces and allow exporting them. */
  readonly unsafe_trace?: boolean;
}
export type SessionEvent =
  | ({ readonly type: "narrator_preview"; readonly provisional: true } & import("../turn/turn-types.js").NarratorPreview)
  | { readonly type: "context_compaction_completed"; readonly result: CompactionResult; readonly view: SessionView }
  | { readonly type: "player_message"; readonly turn_id: string; readonly text: string }
  | { readonly type: "status_changed"; readonly status: SessionStatus }
  | { readonly type: "narration_delta"; readonly turn_id: string; readonly text: string; /** Audited text, but not final until `turn_completed`. */ readonly provisional: true }
  | { readonly type: "turn_completed"; readonly turn_id: string; readonly narration: string; readonly view: SessionView; readonly trace: TurnTrace }
  | { readonly type: "turn_failed"; readonly turn_id: string; readonly error: AppError; readonly uncommitted_narration: string; readonly view: SessionView }
  | { readonly type: "post_turn_completed"; readonly turn_id: string; readonly view: SessionView; readonly reflection: TurnTrace["reflection"] };
export type TurnOutcome =
  | { readonly ok: true; readonly turn_id: string; readonly narration: string; readonly view: SessionView; readonly trace: TurnTrace }
  | { readonly ok: false; readonly error: AppError; readonly turn_id?: string; readonly uncommitted_narration?: string; readonly view: SessionView };
export type SaveOutcome = { readonly ok: true; readonly saved: SavedCampaign; readonly view: SessionView } | { readonly ok: false; readonly error: AppError };
export type ShutdownOutcome = { readonly closed: true; readonly discarded_unsaved_changes: boolean } | { readonly closed: false; readonly error: AppError };
export interface SubmitOptions { readonly onEvent?: (event: SessionEvent) => void; readonly signal?: AbortSignal }
export type LocationOutcome = { readonly ok: true; readonly changed: boolean; readonly confirmation: string; readonly view: SessionView }
  | { readonly ok: false; readonly error: AppError; readonly candidates?: readonly string[]; readonly view: SessionView };

/** Application commands own explicit entry points; they must never be sent to the narrator as player prose. */
const APPLICATION_COMMAND = /^\s*\/(?:save|load|new|quit|exit|status|help|debug|location)(?:\s|$)/i;
const STUB_STATUS: ProviderStatus = { mode: "stub", configured: true };

export class GameSession {
  readonly #mannerisms: MannerismMaintenance | undefined;
  readonly #deps: SessionDeps; readonly #session: CampaignSession; readonly #coordinator: Pick<TurnCoordinator, "runTurn"> & Partial<Pick<TurnCoordinator, "contextRequest" | "resetSceneContinuity">>;
  readonly #traces: TurnTrace[] = []; #sequence = 0; #status: SessionStatus = "idle"; #abort: AbortController | undefined; #inflight: Promise<unknown> | undefined;
  #compactionReason: CompactionReason | undefined; #compactionResult: CompactionResult | undefined;
  #diagnostics: DeepReadonly<TurnDiagnostics> | undefined; #reflectionRecord: DeepReadonly<ReflectionDiagnostics> | undefined; #lastError: AppError | undefined;
  private constructor(deps: SessionDeps, session: CampaignSession) {
    this.#deps = deps; this.#session = session;
    this.#mannerisms = deps.mannerism_extractor ? new MannerismMaintenance(deps.world, deps.mannerism_extractor) : undefined;
    this.#coordinator = deps.createCoordinator({ diagnostics_sink: record => { this.#diagnostics = record; } });
  }
  /** New campaign from the canonical opening. Nothing is written to disk until `save()`. */
  static createCampaign(deps: SessionDeps, campaignId: string): { readonly ok: true; readonly session: GameSession } | { readonly ok: false; readonly error: AppError } {
    try {
      validateSaveId(campaignId);
      return { ok: true, session: new GameSession(deps, new CampaignSession(createOpeningCampaign(deps.world, campaignId), deps.repository)) };
    } catch (error) { return { ok: false, error: error instanceof Error && error.name === "CampaignSaveError" ? toAppError(error) : appError("invalid_id") }; }
  }
  /** Existing save. A corrupt, mismatched or missing save yields an error and no session; nothing is mutated or migrated silently. */
  static async loadCampaign(deps: SessionDeps, campaignId: string, slot: SaveSlot = "current"): Promise<{ readonly ok: true; readonly session: GameSession } | { readonly ok: false; readonly error: AppError }> {
    try { return { ok: true, session: new GameSession(deps, CampaignSession.fromLoaded(await deps.repository.loadCampaign(campaignId, slot), deps.repository)) }; }
    catch (error) { return { ok: false, error: toAppError(error) }; }
  }
  /** Embedding and test seam: wrap a campaign the host already holds. A UI uses `createCampaign` / `loadCampaign`. */
  static fromCampaign(deps: SessionDeps, campaign: CampaignState): GameSession { return new GameSession(deps, new CampaignSession(campaign, deps.repository)); }
  static async listSaves(repository: CampaignSaveRepository): Promise<readonly SaveListing[]> { return repository.listSaves(); }

  get status(): SessionStatus { return this.#status; }
  get hasUnsavedChanges(): boolean { return this.#session.hasUnsavedChanges; }
  get lastError(): AppError | undefined { return this.#lastError; }
  /** Derived on demand from authoritative state; safe to call at any time, including while a turn runs (it shows committed state). */
  getView(): SessionView {
    const view = deriveSessionView(this.#deps.world, this.#session.campaign.exportSnapshot(), { status: this.#status, last_saved_revision: this.#session.last_saved_revision, provider: this.#deps.provider_status ?? STUB_STATUS });
    let request: ReturnType<TurnCoordinator["contextRequest"]> | undefined;
    try { request = this.#coordinator.contextRequest?.(this.#session.campaign); if (request) request = this.#deps.compaction_service?.apply?.(request) ?? request; } catch { /* Existing coordinator fails closed with context_invalid/context_too_large on submission. */ }
    return { ...view, ...(request ? { context_budget: new ContextBudgetManager(this.#deps.context_policy).measure(request) } : {}),
      context_compaction: { status: this.#status === "compacting_context" ? "compacting" : "idle", ...(this.#compactionReason ? { trigger: this.#compactionReason } : {}), ...(this.#compactionResult ? { last_result: this.#compactionResult } : {}) } };
  }
  /** Read-only, player-facing character whitelist for the play screen. */
  getPlayUiView() { return derivePlayUiView(this.#deps.world, this.#session.campaign.exportSnapshot(), this.getView()); }
  #setStatus(status: SessionStatus, emit?: (e: SessionEvent) => void): void { if (this.#status !== status) { this.#status = status; emit?.({ type: "status_changed", status }); } }
  #reject(error: AppError): TurnOutcome { this.#lastError = error; return { ok: false, error, view: this.getView() }; }
  /** Explicit administrative correction, never a model command or simulated journey. */
  overridePlayerLocation(request: { readonly target: string; readonly expected_revision: number }): LocationOutcome {
    const reject = (code: AppError["code"], message?: string, candidates?: readonly string[]): LocationOutcome => ({ ok: false,
      error: appError(code, message ? { message } : {}), ...(candidates ? { candidates } : {}), view: this.getView() });
    if (this.#status === "closed") return reject("session_closed");
    if (this.#status !== "idle") return reject("turn_in_progress");
    const campaign = this.#session.campaign;
    if (!Number.isSafeInteger(request.expected_revision) || request.expected_revision !== campaign.revision) return reject("stale_turn");
    if (typeof request.target !== "string" || !request.target.trim() || request.target.length > 200) return reject("invalid_input");
    const label = request.target.trim().toLowerCase();
    const matches = this.#deps.world.getEntitiesByType("location").filter(e => e.knowledge?.visibility.player && e.knowledge.visibility.narrator
      && [e.id, e.name, e.display_name].some(n => n.toLowerCase() === label));
    if (matches.length !== 1) return reject("invalid_input", matches.length ? "Ambiguous canonical location; use a canonical ID." : "Unknown or unavailable canonical location; use a canonical ID.", matches.slice(0, 5).map(e => e.id));
    // A coordinator without the boundary capability cannot safely offer emergency correction.
    if (!this.#coordinator.resetSceneContinuity) return reject("internal_error", "Location correction is unavailable in this session.");
    const target = matches[0]!, before = this.getView();
    try {
      const receipt = campaign.prepare({ expected_revision: request.expected_revision, commands: [{ kind: "runtime_delta", delta: { player_location: target.id } }] });
      campaign.commit(receipt);
      this.#coordinator.resetSceneContinuity(campaign);
      this.#lastError = undefined;
      return { ok: true, changed: receipt.changed, confirmation: `Manual location correction: ${before.scene.location.name} → ${target.display_name} (${target.id}). Time unchanged.`, view: this.getView() };
    } catch { return reject("campaign_validation_failed"); }
  }

  /**
   * One player turn. Rejects immediately (no mutation) when closed, busy, or when the text is an application command. A turn that
   * fails before the commit leaves the campaign exactly as it was; the post-turn reflection can never fail a committed turn.
   */
  submitPlayerInput(input: string, options: SubmitOptions = {}): Promise<TurnOutcome> {
    if (this.#status === "closed") return Promise.resolve(this.#reject(appError("session_closed")));
    if (this.#status !== "idle") return Promise.resolve(this.#reject(appError("turn_in_progress")));
    if (APPLICATION_COMMAND.test(input)) return Promise.resolve(this.#reject(appError("invalid_input", { message: "That is an application command; the interface must call it directly, not send it as a player action." })));
    if (this.getView().context_budget?.compaction_required) {
      void this.requestContextCompaction({ reason: "auto", ...(options.onEvent ? { onEvent: options.onEvent } : {}) });
      return Promise.resolve(this.#reject(appError("context_too_large", { message: "Context maintenance is required before another turn; compressor availability is shown in the session view." })));
    }
    this.#setStatus("running_turn", options.onEvent);
    const run = this.#runTurn(input, options);
    const tracked: Promise<unknown> = run.finally(() => { if (this.#inflight === tracked) this.#inflight = undefined; });
    this.#inflight = tracked;
    return run.then(outcome => ({ ...outcome, view: this.getView() }));
  }
  requestContextCompaction(options: { reason: CompactionReason; onEvent?: (event: SessionEvent) => void }): Promise<CompactionResult> {
    if (this.#status !== "idle") return Promise.resolve({ status: "failed", reason: options.reason, detail: "Session is busy or closed." });
    const emit = (e: SessionEvent) => { try { options.onEvent?.(e); } catch {} };
    this.#compactionReason = options.reason; this.#status = "compacting_context"; this.#abort = new AbortController();
    // Track before publishing status, so a synchronous UI shutdown callback can cancel and await this operation safely.
    const run = Promise.resolve().then(() => this.#compact(options.reason, emit));
    const tracked = run.finally(() => { if (this.#inflight === tracked) this.#inflight = undefined; });
    this.#inflight = tracked;
    emit({ type: "status_changed", status: "compacting_context" });
    return run;
  }
  async #compact(reason: CompactionReason, emit: (e: SessionEvent) => void, postTurn = false): Promise<CompactionResult> {
    this.#compactionReason = reason; this.#setStatus("compacting_context", emit);
    try {
      const request = this.#coordinator.contextRequest?.(this.#session.campaign);
      this.#compactionResult = request ? await (this.#deps.compaction_service ?? unavailableCompactor).compact({ reason, request, current: () => this.#coordinator.contextRequest?.(this.#session.campaign), ...(this.#abort ? { signal: this.#abort.signal } : {}) })
        : { status: "unavailable", reason, detail: "Coordinator does not expose derived context." };
    } catch { this.#compactionResult = { status: "failed", reason, detail: "Compaction failed; active context retained." }; }
    finally { if (!postTurn) { this.#compactionReason = undefined; this.#abort = undefined; if (this.#status !== "closed") this.#setStatus("idle", emit); } }
    emit({ type: "context_compaction_completed", result: this.#compactionResult, view: this.getView() });
    return this.#compactionResult;
  }
  async #runTurn(input: string, options: SubmitOptions): Promise<TurnOutcome> {
    const emit = (event: SessionEvent) => { try { options.onEvent?.(event); } catch { /* A UI callback can never affect the turn. */ } };
    const campaign = this.#session.campaign, before = campaign.exportSnapshot(), sequence = ++this.#sequence, turn_id = turnIdOf(before.campaign_id, before.revision, sequence);
    const controller = new AbortController(); this.#abort = controller;
    const forward = () => controller.abort(); options.signal?.addEventListener("abort", forward, { once: true }); if (options.signal?.aborted) forward();
    this.#diagnostics = undefined; this.#reflectionRecord = undefined; this.#lastError = undefined;
    let completed: Extract<TurnEvent, { type: "turn_completed" }> | undefined, failed: Extract<TurnEvent, { type: "turn_failed" }> | undefined;
    try {
      emit({ type: "player_message", turn_id, text: input });
      for await (const event of this.#coordinator.runTurn({ campaign, player_input: input, signal: controller.signal, on_narrator_preview: preview => emit({ type: "narrator_preview", ...preview, provisional: true }) })) {
        if (event.type === "narration_delta") emit({ type: "narration_delta", turn_id, text: event.text, provisional: true });
        else if (event.type === "turn_completed") completed = event;
        else if (event.type === "turn_failed") failed = event;
      }
      const after = campaign.exportSnapshot();
      if (completed) {
        const trace = this.#record(buildTrace({ sequence, campaign_id: before.campaign_id, dataset_id: before.dataset_id, player_input: input, revision_before: before.revision, revision_after: after.revision,
          outcome: "completed", result: completed.result, ...(this.#diagnostics ? { diagnostics: this.#diagnostics } : {}), movement: movementOf(before, after), ...(this.#deps.unsafe_trace ? { unsafe: true } : {}) }));
        const view = this.getView();
        emit({ type: "turn_completed", turn_id, narration: completed.result.narration, view, trace });
        await this.#postTurn(turn_id, trace, controller.signal, emit, completed.result);
        if (this.getView().context_budget?.compaction_required) await this.#compact("auto", emit, true);
        return { ok: true, turn_id, narration: completed.result.narration, view: this.getView(), trace: this.#traces.find(t => t.turn_id === turn_id) ?? trace };
      }
      const error = appError(failed?.code ?? "internal_error", { provider_code: failed?.provider_code, turn_state_changed: failed ? failed.final_revision !== failed.base_revision : false });
      this.#lastError = error;
      this.#record(buildTrace({ sequence, campaign_id: before.campaign_id, dataset_id: before.dataset_id, player_input: input, revision_before: before.revision, revision_after: after.revision, outcome: "failed", error,
        ...(failed ? { failure_event: failed } : {}), ...(this.#diagnostics ? { diagnostics: this.#diagnostics } : {}) }));
      const uncommitted = failed?.narration ?? "";
      emit({ type: "turn_failed", turn_id, error, uncommitted_narration: uncommitted, view: this.getView() });
      return { ok: false, error, turn_id, uncommitted_narration: uncommitted, view: this.getView() };
    } catch (thrown) {
      const error = toAppError(thrown); this.#lastError = error;
      emit({ type: "turn_failed", turn_id, error, uncommitted_narration: "", view: this.getView() });
      return { ok: false, error, turn_id, view: this.getView() };
    } finally {
      options.signal?.removeEventListener("abort", forward); this.#abort = undefined; this.#compactionReason = undefined;
      if (this.#status !== "closed") this.#setStatus("idle", emit);
    }
  }
  /** Optional maintenance runs after delivered narration and never fails gameplay; the next input stays busy until it settles. */
  async #postTurn(turn_id: string, trace: TurnTrace, signal: AbortSignal, emit: (e: SessionEvent) => void, delivered: import("../turn/turn-types.js").TurnResult): Promise<void> {
    const provider = this.#deps.reflection_provider;
    if ((!provider && !this.#mannerisms) || signal.aborted) return;
    this.#setStatus("post_turn", emit);
    const campaign = this.#session.campaign;
    if (this.#mannerisms) {
      try { const run = await this.#mannerisms.afterFinalizedTurn(campaign, turn_id, delivered, signal); try { this.#deps.mannerism_diagnostics_sink?.(run); } catch {} }
      catch { /* Optional maintenance never fails a delivered, committed player turn. */ }
    }
    const revisionBefore = campaign.revision;
    let runs: readonly ReflectionRun[] = [], failedHard = false;
    try { if (provider && !signal.aborted) runs = await reflectAfterTurn(campaign, this.#deps.world, provider, { max_characters: 1, diagnostics_sink: record => { this.#reflectionRecord = record; } }); }
    catch { failedHard = true; }
    const summary = failedHard ? { status: "failed_nonblocking" as const, characters: [], revisions_added: campaign.revision - revisionBefore } : summarizeReflection(runs, this.#reflectionRecord, campaign.revision - revisionBefore);
    const index = this.#traces.findIndex(t => t.turn_id === trace.turn_id);
    if (index >= 0) this.#traces[index] = { ...this.#traces[index]!, revision_after: campaign.revision, reflection: summary };
    emit({ type: "post_turn_completed", turn_id, view: this.getView(), reflection: summary });
  }
  #record(trace: TurnTrace): TurnTrace {
    this.#traces.push(trace); const capacity = Math.max(1, this.#deps.trace_capacity ?? 200); while (this.#traces.length > capacity) this.#traces.shift();
    return trace;
  }
  /** Explicit manual save; never automatic. Refused while a turn or post-turn step is running so the saved revision is well defined. */
  async save(): Promise<SaveOutcome> {
    if (this.#status === "closed") return { ok: false, error: appError("session_closed") };
    if (this.#status !== "idle") return { ok: false, error: appError("turn_in_progress") };
    try { const saved = await this.#session.save(); return { ok: true, saved, view: this.getView() }; }
    catch (error) { const e = toAppError(error); return { ok: false, error: e.code === "internal_error" ? appError("io_error") : e }; }
  }
  /** Most recent traces first. Bounded; ends with the session. */
  listTurns(): readonly TurnTrace[] { return [...this.#traces].reverse(); }
  getTurn(turn_id: string): TurnTrace | undefined { return this.#traces.find(t => t.turn_id === turn_id); }
  /** Safe by default. `unsafe: true` only has an effect when the session was created with `unsafe_trace`. */
  exportTurnDebug(turn_id: string, options: { readonly unsafe?: boolean } = {}): DebugExport | undefined {
    const trace = this.getTurn(turn_id); return trace ? exportTrace(trace, this.#session.campaign.revision, !!options.unsafe && !!this.#deps.unsafe_trace) : undefined;
  }
  /**
   * Cancels an active turn, waits for any running turn and reflection to settle, then closes. With unsaved changes it refuses
   * (session stays open) unless `discard_unsaved` is true. Never saves.
   */
  async shutdown(options: { readonly discard_unsaved?: boolean } = {}): Promise<ShutdownOutcome> {
    if (this.#status === "closed") return { closed: true, discarded_unsaved_changes: false };
    this.#abort?.abort();
    await this.#inflight?.catch(() => undefined);
    if (this.hasUnsavedChanges && !options.discard_unsaved) return { closed: false, error: appError("unsaved_changes") };
    const discarded = this.hasUnsavedChanges;
    this.#status = "closed"; return { closed: true, discarded_unsaved_changes: discarded };
  }
}
function movementOf(before: DeepReadonly<CampaignSnapshot>, after: DeepReadonly<CampaignSnapshot>): TurnTrace["movement"] {
  const place = (n: { readonly current_location?: string | undefined; readonly off_scene?: { readonly since_revision: number } | undefined }) => n.off_scene ? `off:${n.off_scene.since_revision}` : n.current_location;
  const was = new Map(before.runtime.npc_locations.map(n => [n.character_id, place(n)]));
  return { location_before: before.runtime.scene.player_location, location_after: after.runtime.scene.player_location,
    minutes_elapsed: after.runtime.scene.world_time.world_minute - before.runtime.scene.world_time.world_minute,
    characters_moved: after.runtime.npc_locations.filter(n => was.get(n.character_id) !== place(n)).map(n => n.character_id).sort() };
}
