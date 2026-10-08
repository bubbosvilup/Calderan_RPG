import type { NarratorRequest } from "../llm/types.js";
import { ContextBudgetManager, type ContextPolicy } from "../turn/context-budget.js";
import { unavailableCompactor, type ContextCompactionService, type CompactionReason, type CompactionResult } from "./context-compaction.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import type { CampaignCommand, CampaignSnapshot, CharacterProfile } from "../campaign/types.js";
import { applyAppearancePatch } from "../campaign/permanent-appearance.js";
import { appearanceFingerprint, composePortraitPrompt, isPortraitKind, isPortraitPose, PORTRAIT_PROMPT_VERSION, type PortraitKind, type PortraitPose } from "../campaign/portrait-prompt.js";
import { portraitAssetToken, portraitItemToken, portraitRecord, MAX_PORTRAIT_VERSIONS, PORTRAIT_BATCH_SIZE } from "../campaign/portraits.js";
import type { CharacterPortraitVersion } from "../campaign/types.js";
import { decodeImage, ImageGenerationError, recoveryFor, type GeneratedImage, type PortraitImageGenerator } from "../llm/image-generator.js";
import { RAENA_IMAGE_STACK, type PortraitImageStack } from "./image-stack.js";
import { extensionFor, type PortraitAssetStore } from "./portrait-store.js";
import { randomBytes, randomInt } from "node:crypto";
import type { DeepReadonly } from "../types/readonly.js";
import { assetKey, type CampaignSaveRepository, type FileCampaignRepository, type SaveListing, type SaveSlot, type SavedCampaign } from "../persistence/campaign-repository.js";
import type { CanonCompatibilityReport } from "../persistence/canon-compatibility.js";
import { CONTINUITY_LIMITS, type SaveContinuity, type SaveReason } from "../persistence/save-format.js";
import type { TranscriptEntry, TranscriptRecord, TranscriptRole } from "../persistence/transcript.js";
import { AutosaveScheduler, type AutosaveOptions, type AutosaveState } from "./autosave.js";
import { assessPortraitAssets, collectDeferredDeletions, type PortraitAssetReport } from "./portrait-assets.js";
import { scenarioById } from "./scenarios.js";
import { activePlayerCharacter } from "../campaign/player-character.js";
import { applyPlayerProfilePatch, playerProfileView, type PlayerProfileView } from "./player-profile-view.js";
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
import { playerCharacterProjection } from "./player-character-view.js";
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
  readonly createCoordinator: (hooks: SessionHooks) => Pick<TurnCoordinator, "runTurn"> & Partial<Pick<TurnCoordinator, "contextRequest" | "resetSceneContinuity" | "recent">>;
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
  /** Portrait image generation: the provider-neutral image seam and the local portrait asset store (both optional; absent = feature off). */
  readonly portrait_generator?: PortraitImageGenerator;
  /** Prompt trigger, per-kind sizes and price per billable unit (default: the v1 Raena stack). No provider request shapes. */
  readonly portrait_stack?: Pick<PortraitImageStack, "trigger" | "avatar_size" | "fullbody_size" | "price_usd_per_billable_unit">;
  readonly portrait_store?: PortraitAssetStore;
  /** Safe server-side diagnostics for portrait failures: an error code and HTTP status only (never bodies, prompts or keys). */
  readonly portrait_log?: (entry: { readonly code: string; readonly status?: number; readonly recovery?: "reseed" | "same_seed" }) => void;
  /** Portrait Gallery V2 test seam: bounded index pick for the first-batch Avatar (default node:crypto randomInt, uniform). */
  readonly portrait_pick?: (count: number) => number;
  /** Test seam: the seed source (default node:crypto randomInt over [1, 2^31 - 1)); seeds within one batch are always distinct. */
  readonly portrait_seed?: () => number;
  /** Test seam: the wait before a same-seed retry (default 2 s after a 429, 1 s otherwise). */
  readonly portrait_retry_delay_ms?: (code: string) => number;
  /** Save/Load v1: autosave policy. Absent/false = manual saves only (CLI, tests); the persistent Play UI turns it on. */
  readonly autosave?: AutosaveOptions | false;
  /** Informational engine version written into saves. */
  readonly engine_version?: string;
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
/** `transcript_error`: the canonical save succeeded but the history append did not (retried at the next save). */
export type SaveOutcome = { readonly ok: true; readonly saved: SavedCampaign; readonly transcript_error?: true; readonly view: SessionView } | { readonly ok: false; readonly error: AppError };
/**
 * Save/Load v1 structured load result. `warnings` are the player-relevant, non-fatal findings (empty for a normal load, which stays
 * quiet); the other fields are informational. Character IDs never appear in warnings.
 */
export interface LoadReport {
  readonly campaign_id: string; readonly slot: SaveSlot;
  readonly migrated_from?: number;
  readonly canon: CanonCompatibilityReport;
  /** Bounded recent conversation: restored, absent, dropped as malformed, or stale (written at another revision). */
  readonly continuity: "restored" | "none" | "dropped" | "stale";
  readonly transcript: "available" | "missing" | "unreadable" | "disabled";
  readonly transcript_invalid_lines: number;
  readonly missing_assets: number; readonly orphan_assets: number;
  /** Temporary scene participants are never saved: a load is always a scene boundary for them. */
  readonly temporary_participants_reset: true;
  /** Explicit recovery source when the current slot was not used. */
  readonly recovered_from?: "previous" | "backup";
  readonly warnings: readonly string[];
}
/** Compact, player-facing save status (view.session.save adds it). */
export interface SaveStatus { readonly saving: boolean; readonly error?: AppError["code"]; readonly autosave: "off" | "on" | "stopped"; readonly transcript_error?: true }
interface SessionInit { readonly opening_text?: string; readonly transcript?: { readonly entries: readonly TranscriptEntry[]; readonly next_index: number; readonly rollback_to?: number } }
const FATAL_SAVE = new Set(["invalid_json", "invalid_save", "unsupported_version", "migration_failed", "dataset_mismatch", "reference_invalid", "unsafe_path", "campaign_locked", "invalid_id", "session_closed"]);
type HistoryRepository = CampaignSaveRepository & Partial<Pick<FileCampaignRepository, "appendTranscript" | "readTranscript" | "retainedAssetReferences">>;
export type ShutdownOutcome = { readonly closed: true; readonly discarded_unsaved_changes: boolean } | { readonly closed: false; readonly error: AppError };
export interface SubmitOptions { readonly onEvent?: (event: SessionEvent) => void; readonly signal?: AbortSignal }
export type LocationOutcome = { readonly ok: true; readonly changed: boolean; readonly confirmation: string; readonly view: SessionView }
  | { readonly ok: false; readonly error: AppError; readonly candidates?: readonly string[]; readonly view: SessionView };
/** Portrait reference / role / delete outcome. */
export type PortraitOutcome = { readonly ok: true; readonly changed: boolean; readonly view: SessionView }
  | { readonly ok: false; readonly error: AppError; readonly view: SessionView };
/**
 * Portrait batch outcome. `cost_usd` is the sum of costs derived from what the provider actually returned for the successful images
 * (reported cost, or billable units × the configured unit price; absent when nothing was returned; never estimated). `failed` includes
 * `refused` (content refusals that survived their one reseed). `provider_calls` ≤ 2 × requested. Provider bodies are never included.
 */
export type PortraitBatchOutcome = { readonly ok: true; readonly changed: true; readonly kind: PortraitKind; readonly requested: number; readonly succeeded: number; readonly failed: number;
    readonly refused: number; readonly provider_calls: number; readonly avatar_auto_selected: boolean; readonly message: string; readonly cost_usd?: number; readonly view: SessionView }
  | { readonly ok: false; readonly error: AppError; readonly kind?: PortraitKind; readonly requested?: number; readonly succeeded?: 0; readonly failed?: number; readonly refused?: number;
    readonly provider_calls?: number; readonly view: SessionView };
const REFERENCE_MAX_BYTES = 4 * 1024 * 1024;
/** Concise player-facing messages per image failure code; provider bodies, raw errors and tokens are never shown. */
const PORTRAIT_MESSAGES: Readonly<Record<string, string>> = {
  configuration_error: "Portrait generation is not configured: set HF_TOKEN (a Hugging Face token) and restart the game.",
  auth_error: "The image provider rejected the Hugging Face token.",
  insufficient_credits: "The image provider reports insufficient credits.",
  rate_limited: "The image provider is rate-limiting requests. Try again shortly.",
  transient_provider_error: "The image provider timed out or was temporarily unavailable.",
  provider_error: "The image provider failed.",
  invalid_request: "The image provider rejected the request.",
  malformed_response: "The image provider returned an unusable response.",
  invalid_image: "The image provider returned an unusable image.",
  content_refusal: "The image provider refused the image.",
  storage_error: "The portrait could not be stored.",
};
const KIND_NOUN: Readonly<Record<PortraitKind, string>> = { avatar: "avatar", fullbody: "full-body" };
/** One batch slot's result: a staged success, or the failure code that ended it after at most one recovery. */
type PortraitSlot = { readonly ok: true; readonly image: GeneratedImage; readonly seed: number; readonly prompt: string } | { readonly ok: false; readonly code: string };
/** Permanent Appearance V1 editor save. `field` names the rejected patch field, when one was. */
export type AppearanceOutcome = { readonly ok: true; readonly changed: boolean; readonly view: SessionView }
  | { readonly ok: false; readonly error: AppError; readonly field?: string; readonly view: SessionView };

/** Application commands own explicit entry points; they must never be sent to the narrator as player prose. */
const APPLICATION_COMMAND = /^\s*\/(?:save|load|new|quit|exit|status|help|debug|location)(?:\s|$)/i;
const STUB_STATUS: ProviderStatus = { mode: "stub", configured: true };

export class GameSession {
  readonly #mannerisms: MannerismMaintenance | undefined;
  readonly #deps: SessionDeps; readonly #session: CampaignSession; readonly #coordinator: Pick<TurnCoordinator, "runTurn"> & Partial<Pick<TurnCoordinator, "contextRequest" | "resetSceneContinuity" | "recent">>;
  readonly #traces: TurnTrace[] = []; #sequence = 0; #status: SessionStatus = "idle"; #abort: AbortController | undefined; #inflight: Promise<unknown> | undefined;
  #compactionReason: CompactionReason | undefined; #compactionResult: CompactionResult | undefined;
  #diagnostics: DeepReadonly<TurnDiagnostics> | undefined; #reflectionRecord: DeepReadonly<ReflectionDiagnostics> | undefined; #lastError: AppError | undefined;
  /** Portrait Gallery V2: the character whose batch is being generated (one batch per session at a time). */
  #portraitBusy: string | undefined; #portraitDone: Promise<void> | undefined; #idleWaiters: (() => void)[] = [];
  /** Save/Load v1: scenario opening (narrator context until the first finalized exchange), history, autosave, deferred deletions. */
  readonly #openingText: string | undefined;
  readonly #autosave: AutosaveScheduler | undefined;
  #transcript: TranscriptEntry[] = []; #pendingTranscript: TranscriptRecord[] = []; #nextTranscript = 0; #rollbackTo: number | undefined; #transcriptError = false;
  #saveError: AppError["code"] | undefined; #pendingDeletions = new Set<string>(); #suspended = false;
  private constructor(deps: SessionDeps, session: CampaignSession, init: SessionInit = {}) {
    this.#deps = deps; this.#session = session; this.#openingText = init.opening_text;
    this.#mannerisms = deps.mannerism_extractor ? new MannerismMaintenance(deps.world, deps.mannerism_extractor) : undefined;
    // The scenario opening is given to the narrator while no exchange has been finalized (fresh campaigns and never-played loads).
    const opening = init.opening_text;
    this.#coordinator = deps.createCoordinator({ diagnostics_sink: record => { this.#diagnostics = record; },
      ...(opening ? { narrator_request_setup: (request: NarratorRequest) => this.#coordinator.recent?.(this.#session.campaign).finalized().length
        ? request : { ...request, messages: [{ role: "assistant" as const, content: opening }, ...request.messages] } } : {}) });
    if (init.transcript) { this.#transcript = [...init.transcript.entries]; this.#nextTranscript = init.transcript.next_index; this.#rollbackTo = init.transcript.rollback_to; }
    this.#autosave = deps.autosave ? new AutosaveScheduler(deps.autosave, {
      // Canonical changes, or delivered exchanges whose continuity/history is not on disk yet (a dialogue-only turn commits no state).
      dirty: () => this.#session.hasUnsavedChanges || this.#historyPending(),
      ready: () => this.#status === "idle" && !this.#portraitBusy && !this.#session.saving && !this.#suspended,
      save: async () => { const r = await this.#saveNow("autosave"); return r.ok ? { ok: true } : { ok: false, fatal: FATAL_SAVE.has(r.error.code) }; },
    }) : undefined;
  }
  /** New campaign, unsaved (CLI/tests). With a scenario ID it starts from that scenario; otherwise from the canonical opening. */
  static createCampaign(deps: SessionDeps, campaignId: string, options: { readonly display_name?: string; readonly scenario_id?: string } = {}): { readonly ok: true; readonly session: GameSession } | { readonly ok: false; readonly error: AppError } {
    try {
      validateSaveId(campaignId);
      const scenario = options.scenario_id === undefined ? undefined : scenarioById(options.scenario_id);
      if (options.scenario_id !== undefined && !scenario) return { ok: false, error: appError("invalid_input", { message: "Unknown starting scenario." }) };
      const campaign = scenario ? scenario.create(deps.world, campaignId) : createOpeningCampaign(deps.world, campaignId);
      const session = new GameSession(deps, new CampaignSession(campaign, deps.repository, { ...(options.display_name ? { display_name: options.display_name } : {}),
        ...(scenario ? { scenario_id: scenario.id } : {}), ...(deps.engine_version ? { engine_version: deps.engine_version } : {}) }), scenario ? { opening_text: scenario.opening_text } : {});
      if (scenario) session.#recordHistory([{ role: "narrator", text: scenario.opening_text }]);
      return { ok: true, session };
    } catch (error) { return { ok: false, error: error instanceof Error && error.name === "CampaignSaveError" ? toAppError(error) : appError("invalid_id") }; }
  }
  /** Save/Load v1: create from a scenario and save immediately (reason `create`), so the campaign exists on disk and in listings. */
  static async startCampaign(deps: SessionDeps, options: { readonly campaign_id: string; readonly display_name: string; readonly scenario_id: string }): Promise<{ readonly ok: true; readonly session: GameSession } | { readonly ok: false; readonly error: AppError }> {
    const created = GameSession.createCampaign(deps, options.campaign_id, { display_name: options.display_name, scenario_id: options.scenario_id });
    if (!created.ok) return created;
    const saved = await created.session.save({ reason: "create" });
    if (!saved.ok) { await created.session.shutdown({ discard_unsaved: true }); return { ok: false, error: saved.error }; }
    return created;
  }
  /**
   * Existing save. A corrupt, incompatible or missing save yields an error and no session; nothing is mutated or written. Canonical
   * state is restored first; derived context is rebuilt on demand; the bounded recent conversation is put back into the narrator's
   * conversation window only (never replayed); the transcript, missing portrait files and orphans are reported, never fatal.
   */
  static async loadCampaign(deps: SessionDeps, campaignId: string, slot: SaveSlot = "current", options: { readonly quarantine_corrupt_current?: boolean } = {}): Promise<{ readonly ok: true; readonly session: GameSession; readonly load_report: LoadReport } | { readonly ok: false; readonly error: AppError }> {
    let loaded;
    try { loaded = await deps.repository.loadCampaign(campaignId, slot); }
    catch (error) { return { ok: false, error: toAppError(error) }; }
    const repository = deps.repository as HistoryRepository, id = loaded.campaign.exportSnapshot().campaign_id, canon = loaded.canon;
    const read = repository.readTranscript ? await repository.readTranscript(id) : undefined;
    const scenario = scenarioById(loaded.metadata.scenario_id);
    const session = new GameSession(deps, CampaignSession.fromLoaded(loaded, deps.repository, { ...(options.quarantine_corrupt_current ? { quarantine_corrupt_current: true } : {}), ...(deps.engine_version ? { engine_version: deps.engine_version } : {}) }), {
      ...(scenario ? { opening_text: scenario.opening_text } : {}),
      ...(read && read.status === "ok" ? { transcript: { entries: read.entries, next_index: read.next_index, ...(read.max_revision > canon.saved_revision ? { rollback_to: canon.saved_revision } : {}) } } : {}),
    });
    // Continuity is context, not commands: added to the conversation window only when it belongs to exactly this saved revision.
    let continuity: LoadReport["continuity"] = loaded.continuity_dropped ? "dropped" : "none";
    if (loaded.continuity) {
      const recent = session.#coordinator.recent?.(loaded.campaign);
      if (loaded.continuity.revision !== canon.saved_revision || !recent) continuity = "stale";
      else { for (const e of loaded.continuity.recent) recent.add({ ...e, status: "finalized" }); continuity = "restored"; }
    }
    let assets: PortraitAssetReport | undefined;
    if (deps.portrait_store && repository.retainedAssetReferences) {
      try { assets = await assessPortraitAssets(deps.portrait_store, id, loaded.campaign.exportSnapshot(), await repository.retainedAssetReferences(id)); } catch { assets = undefined; }
    }
    const recovered = slot === "current" ? undefined : slot === "previous" ? "previous" as const : "backup" as const;
    const warnings = [
      ...(recovered ? [`Loaded from the ${recovered === "previous" ? "previous save" : "backup"}, not the latest save.`] : []),
      ...(canon.drifted_references.length ? [`World data changed for ${canon.drifted_references.length} record${canon.drifted_references.length === 1 ? "" : "s"} this campaign uses; the campaign's saved state still applies.`] : []),
      ...(canon.removed_npc_locations.length ? [`${canon.removed_npc_locations.length} character${canon.removed_npc_locations.length === 1 ? " is" : "s are"} no longer in the world data and ${canon.removed_npc_locations.length === 1 ? "was" : "were"} removed from the map.`] : []),
      ...(canon.unverified ? ["This older save cannot verify which world data changed since it was written."] : []),
      ...(continuity === "dropped" ? ["The recent conversation could not be restored; the narrator starts this session without it."] : []),
      ...(read?.status === "unreadable" ? ["The campaign history file could not be read; play and saving are unaffected."] : []),
      ...(assets?.missing.length ? [`${assets.missing.length} portrait image file${assets.missing.length === 1 ? " is" : "s are"} missing; ${assets.missing.length === 1 ? "it shows" : "they show"} as a placeholder.`] : []),
    ];
    const load_report: LoadReport = Object.freeze({ campaign_id: id, slot, ...(loaded.migrated_from !== undefined ? { migrated_from: loaded.migrated_from } : {}), canon, continuity,
      transcript: read ? (read.status === "ok" ? "available" as const : read.status) : "disabled" as const, transcript_invalid_lines: read?.invalid_lines ?? 0,
      missing_assets: assets?.missing.length ?? 0, orphan_assets: assets?.orphans.length ?? 0, temporary_participants_reset: true as const, ...(recovered ? { recovered_from: recovered } : {}),
      warnings: Object.freeze(warnings) });
    // Reconciliation is an authoritative change: the session starts dirty and autosave picks it up.
    session.#autosave?.notify();
    return { ok: true, session, load_report };
  }
  /** Embedding and test seam: wrap a campaign the host already holds. A UI uses `createCampaign` / `loadCampaign`. */
  static fromCampaign(deps: SessionDeps, campaign: CampaignState, options: { readonly opening_text?: string } = {}): GameSession {
    return new GameSession(deps, new CampaignSession(campaign, deps.repository), options.opening_text ? { opening_text: options.opening_text } : {});
  }
  static async listSaves(repository: CampaignSaveRepository): Promise<readonly SaveListing[]> { return repository.listSaves(); }

  get status(): SessionStatus { return this.#status; }
  get hasUnsavedChanges(): boolean { return this.#session.hasUnsavedChanges; }
  get lastError(): AppError | undefined { return this.#lastError; }
  /** Derived on demand from authoritative state; safe to call at any time, including while a turn runs (it shows committed state). */
  getView(): SessionView {
    const view = deriveSessionView(this.#deps.world, this.#session.campaign.exportSnapshot(), { status: this.#status, last_saved_revision: this.#session.last_saved_revision, provider: this.#deps.provider_status ?? STUB_STATUS, save_status: this.saveStatus() });
    let request: ReturnType<TurnCoordinator["contextRequest"]> | undefined;
    try { request = this.#coordinator.contextRequest?.(this.#session.campaign); if (request) request = this.#deps.compaction_service?.apply?.(request) ?? request; } catch { /* Existing coordinator fails closed with context_invalid/context_too_large on submission. */ }
    return { ...view, ...(request ? { context_budget: new ContextBudgetManager(this.#deps.context_policy).measure(request) } : {}),
      context_compaction: { status: this.#status === "compacting_context" ? "compacting" : "idle", ...(this.#compactionReason ? { trigger: this.#compactionReason } : {}), ...(this.#compactionResult ? { last_result: this.#compactionResult } : {}) } };
  }
  /** Read-only, player-facing character whitelist for the play screen. */
  getPlayUiView() { return derivePlayUiView(this.#deps.world, this.#session.campaign.exportSnapshot(), this.getView()); }
  #setStatus(status: SessionStatus, emit?: (e: SessionEvent) => void): void {
    if (this.#status !== status) { this.#status = status; emit?.({ type: "status_changed", status }); }
    if (status === "idle" || status === "closed") for (const wake of this.#idleWaiters.splice(0)) wake();
    if (status === "idle") this.#autosave?.notify();
  }
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
      this.#lastError = undefined; this.#autosave?.notify();
      return { ok: true, changed: receipt.changed, confirmation: `Manual location correction: ${before.scene.location.name} → ${target.display_name} (${target.id}). Time unchanged.`, view: this.getView() };
    } catch { return reject("campaign_validation_failed"); }
  }

  /**
   * Permanent Appearance V1: the Household editor's only write. Resolves the opaque ref among cards the shared projection marks
   * editable (active managed NPC+ member, never Nicco), checks the revision the editor opened with, merges only supported appearance
   * fields into the existing profile (everything else in it is kept as is) and commits one set_profile atomically. No controller,
   * model or world data is involved. An unchanged result commits nothing.
   */
  updateNpcAppearance(request: { readonly ref: unknown; readonly expected_revision: unknown; readonly patch: unknown }): AppearanceOutcome {
    const reject = (code: AppError["code"], message: string, field?: string): AppearanceOutcome => ({ ok: false, error: appError(code, { message }), ...(field ? { field } : {}), view: this.getView() });
    if (this.#status === "closed") return reject("session_closed", "The session is closed.");
    if (this.#status !== "idle") return reject("turn_in_progress", "A turn is running. Try saving the appearance again when it finishes.");
    const campaign = this.#session.campaign, snapshot = campaign.exportSnapshot();
    if (typeof request.expected_revision !== "number" || !Number.isSafeInteger(request.expected_revision) || request.expected_revision !== campaign.revision)
      return reject("stale_turn", "The campaign changed since the editor opened. Your edits are kept; reopen the editor to load the current appearance.");
    if (typeof request.ref !== "string" || !/^[0-9a-f]{24}$/.test(request.ref)) return reject("invalid_input", "Unknown character.");
    const characters = playerCharacterProjection(this.#deps.world, snapshot);
    const target = snapshot.characters.find(c => characters.project(c.id)?.ref === request.ref);
    if (!target || !characters.project(target.id)?.appearance_editor_eligible) return reject("invalid_input", "This character's appearance cannot be edited.");
    if (this.#portraitBusy === target.id) return reject("turn_in_progress", "A portrait is being generated for this character. Save the appearance when it finishes.");
    const patched = applyAppearancePatch(target.profile.appearance, request.patch);
    if (!patched.ok) return reject("invalid_input", patched.reason, patched.field);
    if (!patched.changed) return { ok: true, changed: false, view: this.getView() };
    const { appearance: _previous, ...rest } = structuredClone(target.profile) as CharacterProfile;
    const profile: CharacterProfile = { ...rest, ...(patched.appearance ? { appearance: patched.appearance } : {}) };
    try {
      campaign.commit(campaign.prepare({ expected_revision: request.expected_revision, commands: [{ kind: "set_profile", character_id: target.id, profile }] }));
      this.#lastError = undefined; this.#autosave?.notify();
      return { ok: true, changed: true, view: this.getView() };
    } catch { return reject("campaign_validation_failed", "The appearance change was refused. The campaign is unchanged."); }
  }

  /** Player Character Profile V1: the active player character's profile view (read-only; never dirties the campaign). */
  getPlayerProfileView(): PlayerProfileView | null { return playerProfileView(this.#deps.world, this.#session.campaign.exportSnapshot()); }
  /**
   * Player Character Profile V1: the player's only profile write. Checks the revision the editor opened with, applies the bounded
   * patch to the ACTIVE player character's profile and commits one set_player_character_profile atomically. Unchanged = no commit.
   */
  updatePlayerProfile(request: { readonly expected_revision: unknown; readonly patch: unknown }): AppearanceOutcome {
    const reject = (code: AppError["code"], message: string, field?: string): AppearanceOutcome => ({ ok: false, error: appError(code, { message }), ...(field ? { field } : {}), view: this.getView() });
    if (this.#status === "closed") return reject("session_closed", "The session is closed.");
    if (this.#status !== "idle") return reject("turn_in_progress", "A turn is running. Try saving the profile again when it finishes.");
    const campaign = this.#session.campaign, profile = activePlayerCharacter(campaign.exportSnapshot());
    if (typeof request.expected_revision !== "number" || !Number.isSafeInteger(request.expected_revision) || request.expected_revision !== campaign.revision)
      return reject("stale_turn", "The campaign changed since the profile opened. Your edits are kept; reopen the profile to load the current values.");
    if (!profile) return reject("invalid_input", "There is no player character profile.");
    const patched = applyPlayerProfilePatch(profile, request.patch);
    if (!patched.ok) return reject("invalid_input", patched.reason, patched.field);
    if (!patched.changed) return { ok: true, changed: false, view: this.getView() };
    try {
      campaign.commit(campaign.prepare({ expected_revision: request.expected_revision, commands: [{ kind: "set_player_character_profile", profile: patched.profile }] }));
      this.#lastError = undefined; this.#autosave?.notify();
      return { ok: true, changed: true, view: this.getView() };
    } catch { return reject("campaign_validation_failed", "The profile change was refused. The campaign is unchanged."); }
  }

  /** The live status (not narrowed by earlier checks: it changes across awaits). */
  #now(): SessionStatus { return this.#status; }
  /** Eligible managed NPC+ target for an opaque ref, with its committed editor projection (or an error message). */
  #managedTarget(ref: unknown) {
    if (typeof ref !== "string" || !/^[0-9a-f]{24}$/.test(ref)) return undefined;
    const snapshot = this.#session.campaign.exportSnapshot(), characters = playerCharacterProjection(this.#deps.world, snapshot);
    const record = snapshot.characters.find(c => characters.project(c.id)?.ref === ref);
    const card = record ? characters.project(record.id) : undefined;
    return record && card?.appearance_editor_eligible && card.appearance_editor ? { id: record.id, card, editor: card.appearance_editor, snapshot } : undefined;
  }

  /**
   * Image generation v1 (Portrait Gallery V2 batches). One explicit player action = one batch of exactly PORTRAIT_BATCH_SIZE (3)
   * independent images of ONE kind (avatar 992×992 bust-up, or fullbody 800×1200 head-to-feet) and ONE curated pose, run concurrently.
   * The browser supplies only the opaque ref, the revision it saw, the kind and a pose id; prompt, sizes, seeds, model and paths are
   * server-side. Each slot gets its own explicit seed (distinct within the batch, recorded for traceability) and at most ONE recovery:
   * a content refusal is retried once with a NEW seed and the modest-wording reinforcement (same character, kind and pose); a 429,
   * 5xx, timeout or network failure is retried once with the SAME seed after a short wait; auth, credits, invalid request and malformed
   * output are not retried. So a batch makes at most 6 provider calls. Sequence: validate (revision, eligibility, adult, lock, kind/pose,
   * 3 free Gallery slots) → 3 slots (allSettled) → stage each success → wait for any turn to finish → re-check eligibility and that
   * the appearance is unchanged → finalize the successful files → ONE metadata commit carrying every successful version (plus, on the
   * first AVATAR batch while no Avatar exists, one uniformly random Avatar among this batch's successes) → expose. Partial success keeps
   * the successes; 0 successes changes nothing. Full Body is never selected here. A failed commit removes every finalized file of the
   * batch. The stored reference image is NOT sent (v1 text-to-image has no reference input). Images never change appearance.
   */
  async generateNpcPortraitBatch(request: { readonly ref: unknown; readonly expected_revision: unknown; readonly kind?: unknown; readonly pose?: unknown }): Promise<PortraitBatchOutcome> {
    const reject = (code: AppError["code"], message: string, counts?: { readonly succeeded: 0; readonly failed: number; readonly refused: number; readonly provider_calls: number }): PortraitBatchOutcome =>
      ({ ok: false, error: appError(code, { message }), ...(isPortraitKind(request.kind) ? { kind: request.kind } : {}), ...(counts ? { requested: PORTRAIT_BATCH_SIZE, ...counts } : {}), view: this.getView() });
    if (this.#status === "closed") return reject("session_closed", "The session is closed.");
    if (this.#status !== "idle") return reject("turn_in_progress", "A turn is running. Generate portraits when it finishes.");
    if (this.#portraitBusy) return reject("turn_in_progress", "Portraits are already being generated.");
    if (!isPortraitKind(request.kind)) return reject("invalid_input", "Choose whether to generate avatars or full-body images.");
    const kind: PortraitKind = request.kind, pose = (request.pose ?? "neutral") as PortraitPose;
    if (!isPortraitPose(kind, pose)) return reject("invalid_input", "Choose a pose from the list.");
    const generator = this.#deps.portrait_generator, store = this.#deps.portrait_store;
    if (!generator || !store) return reject("portrait_generation_failed", "Portrait generation is not available in this session.");
    const campaign = this.#session.campaign;
    if (typeof request.expected_revision !== "number" || request.expected_revision !== campaign.revision) return reject("stale_turn", "The campaign changed since the editor opened. Reopen the editor before generating.");
    const target = this.#managedTarget(request.ref);
    if (!target) return reject("invalid_input", "This character's portrait cannot be generated.");
    if (target.editor.portrait.generation_blocked) return reject("invalid_input", target.editor.portrait.generation_blocked);
    const { id } = target, campaignId = target.snapshot.campaign_id, details = target.editor.portrait_details, fingerprint = appearanceFingerprint(details);
    const existing = portraitRecord(target.snapshot, id);
    // Never pay for images that could not be recorded: refuse before any provider call unless the whole batch fits.
    if ((existing?.versions.length ?? 0) + PORTRAIT_BATCH_SIZE > MAX_PORTRAIT_VERSIONS) return reject("invalid_input", "Gallery is full. Delete some unused portraits first.");
    // Avatar bootstrap is decided from the state BEFORE the batch: an avatar batch, no Avatar assigned and no avatar-kind image yet.
    const bootstrapAvatar = kind === "avatar" && existing?.avatar_version_id === undefined && !existing?.versions.some(v => v.kind === "avatar");
    const stack = this.#deps.portrait_stack ?? RAENA_IMAGE_STACK, size = kind === "avatar" ? stack.avatar_size : stack.fullbody_size;
    this.#portraitBusy = id;
    let batchDone!: () => void; this.#portraitDone = new Promise<void>(resolve => { batchDone = resolve; });
    const staged: { tmp: string; slot: Extract<PortraitSlot, { ok: true }>; ext: string }[] = [], finalized: string[] = [];
    let committed = false, calls = 0;
    try {
      const used = new Set<number>();
      const freshSeed = () => {
        for (let attempt = 0; attempt < 64; attempt++) {
          const seed = (this.#deps.portrait_seed ?? (() => randomInt(1, 2 ** 31 - 1)))();
          if (Number.isSafeInteger(seed) && seed >= 0 && !used.has(seed)) { used.add(seed); return seed; }
        }
        throw new Error("no distinct portrait seed");
      };
      const runSlot = async (initialSeed: number): Promise<PortraitSlot> => {
        let seed = initialSeed, modest = false;
        for (let attempt = 1; ; attempt++) {
          const { prompt, negative_prompt } = composePortraitPrompt({ details, kind, pose, trigger: stack.trigger, ...(modest ? { modest: true } : {}) });
          if (calls >= 2 * PORTRAIT_BATCH_SIZE) return { ok: false, code: "provider_error" };
          calls++;
          try { return { ok: true, image: await generator.generate({ prompt, negative_prompt, width: size.width, height: size.height, seed }), seed, prompt }; }
          catch (error) {
            const code = error instanceof ImageGenerationError ? error.code : "provider_error", recovery = attempt === 1 ? recoveryFor(error instanceof ImageGenerationError ? error.code : undefined) : "none";
            this.#deps.portrait_log?.({ code, ...(error instanceof ImageGenerationError && error.status ? { status: error.status } : {}), ...(recovery !== "none" ? { recovery } : {}) });
            if (recovery === "none") return { ok: false, code };
            if (recovery === "reseed") { seed = freshSeed(); modest = true; }
            else await new Promise(wake => setTimeout(wake, Math.max(0, Math.min(10_000, (this.#deps.portrait_retry_delay_ms ?? (c => c === "rate_limited" ? 2000 : 1000))(code)))));
          }
        }
      };
      const seeds = Array.from({ length: PORTRAIT_BATCH_SIZE }, freshSeed);
      const settled = await Promise.allSettled(seeds.map(runSlot));
      const failures: string[] = [];
      for (const result of settled) {
        const slot: PortraitSlot = result.status === "fulfilled" ? result.value : { ok: false, code: "provider_error" };
        if (!slot.ok) { failures.push(slot.code); continue; }
        try {
          const ext = extensionFor(slot.image.media_type);
          if (!ext) throw new ImageGenerationError("invalid_image");
          staged.push({ tmp: await store.stage(campaignId, id, slot.image.bytes), slot, ext });
        } catch (error) {
          const code = error instanceof ImageGenerationError ? error.code : "storage_error";
          failures.push(code); this.#deps.portrait_log?.({ code });
        }
      }
      const refused = failures.filter(code => code === "content_refusal").length;
      if (!staged.length) {
        const counts = { succeeded: 0 as const, failed: PORTRAIT_BATCH_SIZE, refused, provider_calls: calls };
        if (refused === failures.length) return reject("portrait_generation_failed", `None of the ${PORTRAIT_BATCH_SIZE} ${KIND_NOUN[kind]} options could be generated: the image provider refused ${refused === 1 ? "it" : "them"}. Try again or choose another pose.`, counts);
        const other = failures.find(code => code !== "content_refusal") ?? "storage_error";
        return reject("portrait_generation_failed", `Portrait generation failed. ${PORTRAIT_MESSAGES[other] ?? PORTRAIT_MESSAGES.storage_error!} Nothing was saved.`, counts);
      }
      // Never commit under a running turn: wait until the session is idle again, then re-validate against the current state.
      while (this.#now() !== "idle" && this.#now() !== "closed") await new Promise<void>(wake => this.#idleWaiters.push(wake));
      if (this.#now() === "closed") return reject("session_closed", "The session closed before the portraits were saved.");
      const now = this.#managedTarget(request.ref);
      if (!now || now.id !== id) return reject("invalid_input", "This character can no longer be edited. The portraits were not saved.");
      if (appearanceFingerprint(now.editor.portrait_details) !== fingerprint) return reject("portrait_generation_failed", "The appearance changed while the portraits were generating. They were not saved; generate again.");
      const created_at = new Date().toISOString();
      const versions: CharacterPortraitVersion[] = staged.map(({ slot: { image, seed, prompt }, ext }) => {
        const version_id = `portrait_${randomBytes(6).toString("hex")}`;
        // Cost only from what the provider returned: its reported cost, else its billable units × the configured unit price.
        const cost = image.cost_usd ?? (image.billable_units !== undefined ? Math.round(image.billable_units * stack.price_usd_per_billable_unit * 1e6) / 1e6 : undefined);
        return { version_id, prompt_version: PORTRAIT_PROMPT_VERSION, prompt_fingerprint: fingerprint, model: image.model, created_at, media_type: image.media_type, asset_file: `${version_id}.${ext}`,
          ...(cost !== undefined ? { cost_usd: cost } : {}), kind, pose, prompt, seed, ...(image.provider_seed !== undefined ? { provider_seed: image.provider_seed } : {}), provider: image.provider,
          ...(image.style_id ? { style_id: image.style_id } : {}), width: size.width, height: size.height, ...(image.billable_units !== undefined ? { billable_units: image.billable_units } : {}) };
      });
      for (const [index, entry] of staged.entries()) { await store.finalize(entry.tmp, campaignId, id, versions[index]!.asset_file); finalized.push(versions[index]!.asset_file); entry.tmp = ""; }
      // Uniform over THIS batch's successes only; a CSPRNG-backed bounded integer, no persisted seed.
      const avatar = bootstrapAvatar ? versions[this.#pick(versions.length)]!.version_id : undefined;
      try {
        // Synchronous: no other operation can interleave between preparation and commit. One revision for the whole batch.
        campaign.commit(campaign.prepare({ expected_revision: campaign.revision, commands: [{ kind: "record_portrait_batch", character_id: id, versions, ...(avatar ? { avatar_version_id: avatar } : {}) }] }));
        committed = true;
      } catch { return reject("campaign_validation_failed", "The portraits could not be recorded. Nothing was saved."); }
      this.#lastError = undefined;
      const costs = versions.flatMap(v => v.cost_usd !== undefined ? [v.cost_usd] : []);
      const succeeded = versions.length, failed = PORTRAIT_BATCH_SIZE - succeeded, otherFailed = failed - refused;
      const problems = [refused ? `${refused} ${refused === 1 ? "was" : "were"} refused by the image provider` : "", otherFailed ? `${otherFailed} failed` : ""].filter(Boolean).join(" and ");
      return { ok: true, changed: true, kind, requested: PORTRAIT_BATCH_SIZE, succeeded, failed, refused, provider_calls: calls, avatar_auto_selected: !!avatar,
        message: failed ? `${succeeded} of ${PORTRAIT_BATCH_SIZE} generated successfully; ${problems}.` : `${succeeded} ${KIND_NOUN[kind]} options generated.`,
        ...(costs.length ? { cost_usd: Math.round(costs.reduce((a, b) => a + b, 0) * 1e6) / 1e6 } : {}), view: this.getView() };
    } catch (error) {
      const code = error instanceof ImageGenerationError ? error.code : "storage_error";
      this.#deps.portrait_log?.({ code, ...(error instanceof ImageGenerationError && error.status ? { status: error.status } : {}) });
      return reject("portrait_generation_failed", `${PORTRAIT_MESSAGES[code] ?? PORTRAIT_MESSAGES.storage_error!} Nothing was saved.`);
    } finally {
      for (const { tmp } of staged) if (tmp) await store.discard(tmp);
      if (!committed) for (const file of finalized) await store.remove(campaignId, id, file);
      this.#portraitBusy = undefined; this.#portraitDone = undefined; batchDone();
      this.#autosave?.notify();
    }
  }
  #pick(count: number): number {
    const index = (this.#deps.portrait_pick ?? randomInt)(count);
    if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw new Error("portrait pick out of range");
    return index;
  }

  /** Shared preconditions for the role and delete mutations: open, idle, unlocked, current revision, an eligible managed target. */
  #portraitMutationTarget(request: { readonly ref: unknown; readonly expected_revision: unknown }) {
    const reject = (code: AppError["code"], message: string) => ({ ok: false as const, error: appError(code, { message }), view: this.getView() });
    if (this.#status === "closed") return reject("session_closed", "The session is closed.");
    if (this.#status !== "idle" || this.#portraitBusy) return reject("turn_in_progress", "Wait for the current turn or portrait generation to finish.");
    const campaign = this.#session.campaign;
    if (typeof request.expected_revision !== "number" || request.expected_revision !== campaign.revision) return reject("stale_turn", "The campaign changed since the editor opened. Reopen the editor and try again.");
    const target = this.#managedTarget(request.ref);
    if (!target) return reject("invalid_input", "This character's portraits cannot be changed.");
    return { ok: true as const, campaign, id: target.id, campaignId: target.snapshot.campaign_id, record: portraitRecord(target.snapshot, target.id) };
  }
  /** As above, plus one Gallery item of THIS character resolved from its opaque item token (never a version ID, file name or path). */
  #galleryTarget(request: { readonly ref: unknown; readonly expected_revision: unknown; readonly item: unknown }) {
    const target = this.#portraitMutationTarget(request);
    if (!target.ok) return target;
    const version = typeof request.item === "string" && /^[0-9a-f]{32}$/.test(request.item)
      ? target.record?.versions.find(v => portraitItemToken(target.campaignId, target.id, v.version_id) === request.item) : undefined;
    if (!target.record || !version) return { ok: false as const, error: appError("invalid_input", { message: "That image is not in this character's gallery." }), view: this.getView() };
    return { ...target, record: target.record, version };
  }
  #commitPortrait(campaign: CampaignState, command: CampaignCommand, failure: string): PortraitOutcome {
    try {
      const receipt = campaign.prepare({ expected_revision: campaign.revision, commands: [command] });
      campaign.commit(receipt); this.#lastError = undefined; this.#autosave?.notify();
      return { ok: true, changed: receipt.changed, view: this.getView() };
    } catch { return { ok: false, error: appError("campaign_validation_failed", { message: failure }), view: this.getView() }; }
  }
  /** Portrait Gallery V2: assign the Avatar role to one Gallery image (the previous Avatar loses it). No file is copied; Avatar is never cleared. */
  setNpcPortraitAvatar(request: { readonly ref: unknown; readonly expected_revision: unknown; readonly item: unknown }): PortraitOutcome {
    const target = this.#galleryTarget(request);
    if (!target.ok) return target;
    if (target.record.avatar_version_id === target.version.version_id) return { ok: true, changed: false, view: this.getView() };
    // Image generation v1 role-kind rule (legacy images keep a role they already hold, but cannot receive one).
    if (target.version.kind !== "avatar") return { ok: false, error: appError("invalid_input", { message: "Only an avatar image can be the Avatar. Generate avatars to choose one." }), view: this.getView() };
    return this.#commitPortrait(target.campaign, { kind: "set_portrait_avatar", character_id: target.id, version_id: target.version.version_id }, "The Avatar could not be changed.");
  }
  /** Portrait Gallery V2: assign the Full Body role to one Gallery image, or clear it with `item: null` (no image is deleted). Avatar is untouched. */
  setNpcPortraitFullBody(request: { readonly ref: unknown; readonly expected_revision: unknown; readonly item: unknown }): PortraitOutcome {
    if (request.item === null) {
      const target = this.#portraitMutationTarget(request);
      if (!target.ok) return target;
      if (target.record?.full_body_version_id === undefined) return { ok: true, changed: false, view: this.getView() };
      return this.#commitPortrait(target.campaign, { kind: "set_portrait_full_body", character_id: target.id, version_id: null }, "The Full Body image could not be cleared.");
    }
    const target = this.#galleryTarget(request);
    if (!target.ok) return target;
    if (target.record.full_body_version_id === target.version.version_id) return { ok: true, changed: false, view: this.getView() };
    if (target.version.kind !== "fullbody") return { ok: false, error: appError("invalid_input", { message: "Only a full-body image can be the Full Body. Generate full-body images to choose one." }), view: this.getView() };
    return this.#commitPortrait(target.campaign, { kind: "set_portrait_full_body", character_id: target.id, version_id: target.version.version_id }, "The Full Body image could not be changed.");
  }
  /**
   * Portrait Gallery V2: delete one unassigned Gallery image; an image holding the Avatar or Full Body role is refused. Order: validate →
   * commit the metadata removal → deferred file deletion (Save/Load v1): the file is removed only once no retained state (live campaign,
   * save.json, save.previous.json, kept backups) references it, so recovering an older save never finds a missing file. A file that
   * cannot be removed stays as a detectable orphan (logged); the delete still succeeds.
   */
  async deleteNpcPortrait(request: { readonly ref: unknown; readonly expected_revision: unknown; readonly item: unknown }): Promise<PortraitOutcome> {
    const target = this.#galleryTarget(request);
    if (!target.ok) return target;
    const { record, version } = target, isAvatar = record.avatar_version_id === version.version_id, isFullBody = record.full_body_version_id === version.version_id;
    if (isAvatar || isFullBody) return { ok: false, error: appError("invalid_input", { message: isAvatar && isFullBody
      ? "This image is the Avatar and the Full Body. Choose another Avatar, and another Full Body image or clear Full Body, before deleting it."
      : isAvatar ? "Choose another Avatar before deleting this image." : "Choose another Full Body image or clear Full Body first." }), view: this.getView() };
    const outcome = this.#commitPortrait(target.campaign, { kind: "delete_portrait_version", character_id: target.id, version_id: version.version_id }, "The image could not be deleted.");
    if (!outcome.ok) return outcome;
    this.#pendingDeletions.add(assetKey(target.id, version.asset_file)); await this.#collectDeletions();
    return outcome;
  }

  /**
   * Portrait Image Generation V1: attach (or with `image: null` remove) the single reference image of this character. A PNG/JPEG/WebP of
   * at most 4 MB, verified by signature; stored as a local file, never as a URL (no fetching). Nothing is read back into appearance.
   * Image generation v1 does NOT send it (text-to-image has no reference input; a future image-edit path may use it). Existing
   * reference data is kept; the UI hides the control and says it is deferred.
   */
  async setNpcPortraitReference(request: { readonly ref: unknown; readonly expected_revision: unknown; readonly image: unknown }): Promise<PortraitOutcome> {
    const reject = (code: AppError["code"], message: string): PortraitOutcome => ({ ok: false, error: appError(code, { message }), view: this.getView() });
    if (this.#status === "closed") return reject("session_closed", "The session is closed.");
    if (this.#status !== "idle" || this.#portraitBusy) return reject("turn_in_progress", "Wait for the current turn or portrait generation to finish.");
    const store = this.#deps.portrait_store;
    if (!store) return reject("portrait_generation_failed", "Portrait references are not available in this session.");
    const campaign = this.#session.campaign;
    if (typeof request.expected_revision !== "number" || request.expected_revision !== campaign.revision) return reject("stale_turn", "The campaign changed since the editor opened. Reopen the editor and try again.");
    const target = this.#managedTarget(request.ref);
    if (!target) return reject("invalid_input", "This character's portrait reference cannot be changed.");
    const { id } = target, campaignId = target.snapshot.campaign_id, previous = portraitRecord(target.snapshot, id)?.reference;
    if (request.image === null) {
      if (!previous) return { ok: true, changed: false, view: this.getView() };
      try { campaign.commit(campaign.prepare({ expected_revision: campaign.revision, commands: [{ kind: "set_portrait_reference", character_id: id, reference: null }] })); }
      catch { return reject("campaign_validation_failed", "The reference could not be removed."); }
      this.#pendingDeletions.add(assetKey(id, previous.asset_file)); await this.#collectDeletions(); this.#autosave?.notify();
      return { ok: true, changed: true, view: this.getView() };
    }
    const input = request.image as { data_base64?: unknown } | undefined;
    let image: { bytes: Buffer; media_type: "image/png" | "image/jpeg" | "image/webp" };
    try {
      if (!input || typeof input !== "object" || typeof input.data_base64 !== "string" || input.data_base64.length > Math.ceil(REFERENCE_MAX_BYTES / 3) * 4 + 8) throw new Error();
      image = decodeImage(input.data_base64);
      if (image.bytes.length > REFERENCE_MAX_BYTES) throw new Error();
    } catch { return reject("invalid_input", "Choose a PNG, JPEG or WebP image of at most 4 MB."); }
    const asset_file = `reference_${randomBytes(6).toString("hex")}.${extensionFor(image.media_type)}`;
    let staged: string | undefined;
    try {
      staged = await store.stage(campaignId, id, image.bytes);
      if (campaign.revision !== request.expected_revision || this.#now() !== "idle") return reject("stale_turn", "The campaign changed while the reference was uploading. Try again.");
      await store.finalize(staged, campaignId, id, asset_file); staged = undefined;
      try { campaign.commit(campaign.prepare({ expected_revision: campaign.revision, commands: [{ kind: "set_portrait_reference", character_id: id, reference: { media_type: image.media_type, asset_file, uploaded_at: new Date().toISOString() } }] })); }
      catch { await store.remove(campaignId, id, asset_file); return reject("campaign_validation_failed", "The reference could not be recorded."); }
      if (previous) { this.#pendingDeletions.add(assetKey(id, previous.asset_file)); await this.#collectDeletions(); }
      this.#autosave?.notify();
      return { ok: true, changed: true, view: this.getView() };
    } catch { return reject("portrait_generation_failed", "The reference image could not be stored."); }
    finally { if (staged) await store.discard(staged); }
  }

  /** Bytes for an opaque portrait/reference token of the CURRENT campaign only; no path, ID or name is accepted. */
  async readPortraitAsset(token: unknown): Promise<{ readonly bytes: Buffer; readonly media_type: string } | undefined> {
    const store = this.#deps.portrait_store;
    if (!store || typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return undefined;
    const snapshot = this.#session.campaign.exportSnapshot();
    for (const record of snapshot.portraits ?? []) {
      const files = [...record.versions.map(v => ({ file: v.asset_file, media_type: v.media_type })), ...(record.reference ? [{ file: record.reference.asset_file, media_type: record.reference.media_type }] : [])];
      const match = files.find(f => portraitAssetToken(snapshot.campaign_id, record.character_id, f.file) === token);
      if (match) { const bytes = await store.read(snapshot.campaign_id, record.character_id, match.file); return bytes ? { bytes, media_type: match.media_type } : undefined; }
    }
    return undefined;
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
        // History only (never canonical): recorded with the revision the turn committed, written to transcript.jsonl after a save.
        this.#recordHistory([{ role: "player", text: input }, { role: "narrator", text: completed.result.narration }], turn_id);
        this.#autosave?.notify();
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
  /**
   * Save now (manual by default; immediate). Refused while a turn or post-turn step is running so the saved revision is well defined.
   * Autosave (Save/Load v1, when enabled) calls the same path in the background.
   */
  async save(options: { readonly reason?: SaveReason } = {}): Promise<SaveOutcome> {
    if (this.#status === "closed") return { ok: false, error: appError("session_closed") };
    if (this.#status !== "idle") return { ok: false, error: appError("turn_in_progress") };
    const outcome = await this.#saveNow(options.reason ?? "manual");
    // A successful manual save after a stopped autosave (e.g. explicit recovery) resumes it.
    if (outcome.ok && this.#autosave?.state === "stopped" && !this.#suspended) this.#autosave.resume();
    return outcome;
  }
  async #saveNow(reason: SaveReason): Promise<SaveOutcome> {
    let saved: SavedCampaign;
    try { saved = await this.#session.save({ reason, ...this.#continuityOption() }); }
    catch (error) {
      const e = toAppError(error), err = e.code === "internal_error" ? appError("io_error") : e;
      if (err.code !== "save_in_progress") this.#saveError = err.code;
      return { ok: false, error: err };
    }
    this.#saveError = undefined;
    // Canonical save is complete; history and file cleanup can only report, never undo it.
    const transcriptOk = await this.#flushTranscript(saved.revision);
    await this.#collectDeletions();
    return { ok: true, saved, ...(transcriptOk ? {} : { transcript_error: true as const }), view: this.getView() };
  }
  /** Bounded, non-authoritative recent conversation for the save (≤ 12 finalized exchanges; oversized ones and the oldest are dropped). */
  exportContinuity(): SaveContinuity | undefined {
    const recent = this.#coordinator.recent?.(this.#session.campaign);
    if (!recent) return undefined;
    let entries = recent.finalized().filter(e => e.player.length <= CONTINUITY_LIMITS.text && e.narration.length <= CONTINUITY_LIMITS.text).slice(-CONTINUITY_LIMITS.exchanges)
      .map(e => ({ player: e.player, narration: e.narration, ...(e.location_id ? { location_id: e.location_id } : {}), ...(e.conversation_partner_id ? { conversation_partner_id: e.conversation_partner_id } : {}) }));
    while (entries.length && JSON.stringify(entries).length > CONTINUITY_LIMITS.total) entries = entries.slice(1);
    return { authority: "non_authoritative", revision: this.#session.campaign.revision, recent: entries };
  }
  /** Finalized exchanges not yet written by a successful save (continuity + history). Not "unsaved changes": canon is unchanged. */
  #historyPending(): boolean { return this.#pendingTranscript.length > 0 && !this.#transcriptError; }
  #continuityOption(): { continuity?: SaveContinuity } { const c = this.exportContinuity(); return c ? { continuity: c } : {}; }
  #recordHistory(items: readonly { readonly role: TranscriptRole; readonly text: string }[], turn_id?: string): void {
    const at = new Date().toISOString(), revision = this.#session.campaign.revision;
    for (const item of items) {
      const entry: TranscriptEntry = { i: this.#nextTranscript++, at, role: item.role, text: item.text.slice(0, 16_000), revision, ...(turn_id ? { turn_id } : {}) };
      this.#transcript.push(entry); this.#pendingTranscript.push(entry);
    }
    if (this.#transcript.length > 1000) this.#transcript = this.#transcript.slice(-500);
  }
  /** Appends saved history (entries up to the saved revision) to transcript.jsonl. Failure keeps them pending and is reported separately. */
  async #flushTranscript(savedRevision: number): Promise<boolean> {
    const repository = this.#deps.repository as HistoryRepository;
    if (!repository.appendTranscript) { this.#pendingTranscript = []; return true; }
    const ready = this.#pendingTranscript.filter(r => r.revision <= savedRevision);
    const records: TranscriptRecord[] = [...(this.#rollbackTo !== undefined ? [{ i: this.#nextTranscript++, at: new Date().toISOString(), kind: "rollback" as const, revision: this.#rollbackTo }] : []), ...ready];
    if (!records.length) return true;
    try {
      await repository.appendTranscript(this.#session.campaign.exportSnapshot().campaign_id, records);
      this.#pendingTranscript = this.#pendingTranscript.filter(r => r.revision > savedRevision); this.#rollbackTo = undefined; this.#transcriptError = false; return true;
    } catch { this.#transcriptError = true; return false; }
  }
  /** Removes player-deleted portrait files once no retained state references them (never during a portrait batch). */
  async #collectDeletions(): Promise<void> {
    const store = this.#deps.portrait_store, repository = this.#deps.repository as HistoryRepository;
    if (!store || !this.#pendingDeletions.size || this.#portraitBusy) return;
    const id = this.#session.campaign.exportSnapshot().campaign_id;
    try {
      const retained = repository.retainedAssetReferences ? await repository.retainedAssetReferences(id) : { complete: true, references: new Set<string>() };
      const { pending, failed } = await collectDeferredDeletions(store, id, this.#session.campaign.exportSnapshot(), retained, this.#pendingDeletions);
      this.#pendingDeletions = pending;
      for (let i = 0; i < failed; i++) this.#deps.portrait_log?.({ code: "orphaned_asset" });
    } catch { /* Kept pending; retried after the next save. */ }
  }
  /** Save/Load v1 history for the UI: the visible transcript (rollbacks applied), oldest first, bounded. */
  getTranscript(): readonly { readonly role: TranscriptRole; readonly text: string; readonly turn_id?: string }[] {
    return this.#transcript.slice(-500).map(e => ({ role: e.role, text: e.text, ...(e.turn_id ? { turn_id: e.turn_id } : {}) }));
  }
  get campaignId(): string { return this.#session.campaign.exportSnapshot().campaign_id; }
  get campaignMeta(): { readonly display_name?: string; readonly scenario_id?: string } { const { display_name, scenario_id } = this.#session.meta; return { ...(display_name ? { display_name } : {}), ...(scenario_id ? { scenario_id } : {}) }; }
  /** Rename (presentation only; the ID never changes). Written by the next save; autosave picks it up only with a later mutation. */
  setDisplayName(name: string): void { this.#session.setDisplayName(name); }
  /** Anything in flight that a campaign swap must not interrupt: a turn, post-turn step, compaction, portrait batch or save. */
  get busy(): boolean { return this.#status !== "idle" || !!this.#portraitBusy || this.#session.saving || this.#autosave?.state === "saving"; }
  saveStatus(): SaveStatus {
    const state = this.#autosave?.state;
    return { saving: this.#session.saving, ...(this.#saveError ? { error: this.#saveError } : {}), autosave: !this.#autosave ? "off" : state === "stopped" ? "stopped" : "on", ...(this.#transcriptError ? { transcript_error: true as const } : {}) };
  }
  get autosaveState(): AutosaveState | "off" { return this.#autosave?.state ?? "off"; }
  /** Settles when no autosave is in flight (host coordination and tests). */
  async autosaveSettled(): Promise<void> { await this.#autosave?.idle(); }
  /** Host seam: no autosave while a campaign load/swap is coordinated. */
  suspendAutosave(): void { this.#suspended = true; }
  resumeAutosave(): void { this.#suspended = false; this.#autosave?.notify(); }
  /** Orphan detection (never destructive): files no retained state references, and live references whose file is missing. */
  async portraitAssetReport(): Promise<PortraitAssetReport | undefined> {
    const store = this.#deps.portrait_store, repository = this.#deps.repository as HistoryRepository;
    if (!store || !repository.retainedAssetReferences) return undefined;
    const id = this.campaignId;
    return assessPortraitAssets(store, id, this.#session.campaign.exportSnapshot(), await repository.retainedAssetReferences(id));
  }
  /** Explicit, confirmed orphan cleanup: only files inside this campaign's portrait tree that no retained state references. */
  async removePortraitOrphans(options: { readonly confirm: boolean }): Promise<{ readonly removed: number }> {
    if (options.confirm !== true || this.busy) return { removed: 0 };
    const report = await this.portraitAssetReport(), store = this.#deps.portrait_store;
    if (!report || !store || !report.complete) return { removed: 0 };
    let removed = 0;
    for (const key of report.orphans) if (await store.removeListed(this.campaignId, key)) removed++;
    return { removed };
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
  async shutdown(options: { readonly discard_unsaved?: boolean; readonly save_reason?: "quit" } = {}): Promise<ShutdownOutcome> {
    if (this.#status === "closed") return { closed: true, discarded_unsaved_changes: false };
    this.#abort?.abort();
    await this.#inflight?.catch(() => undefined);
    // A portrait batch cannot be cancelled mid-provider-call; wait for it so its files are committed or cleaned up, never stranded.
    await this.#portraitDone;
    await this.#autosave?.stop();
    // Graceful quit (Save/Load v1): save a dirty campaign before closing. A failed quit save keeps the session open unless discarding.
    if (options.save_reason === "quit" && (this.hasUnsavedChanges || this.#historyPending()) && this.#status === "idle") {
      const saved = await this.#saveNow("quit");
      if (!saved.ok && !options.discard_unsaved) { this.#autosave?.resume(); return { closed: false, error: saved.error }; }
    }
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
