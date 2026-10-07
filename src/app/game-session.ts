import type { NarratorRequest } from "../llm/types.js";
import { ContextBudgetManager, type ContextPolicy } from "../turn/context-budget.js";
import { unavailableCompactor, type ContextCompactionService, type CompactionReason, type CompactionResult } from "./context-compaction.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import type { CampaignSnapshot, CharacterProfile } from "../campaign/types.js";
import { applyAppearancePatch } from "../campaign/permanent-appearance.js";
import { portraitFingerprint, PORTRAIT_PROMPT_VERSION } from "../campaign/portrait-prompt.js";
import { portraitAssetToken, portraitRecord, MAX_PORTRAIT_VERSIONS } from "../campaign/portraits.js";
import { decodeImage, ImageGenerationError, type ImageReference, type PortraitImageGenerator } from "../llm/openrouter/image-client.js";
import { extensionFor, type PortraitAssetStore } from "./portrait-store.js";
import { randomBytes } from "node:crypto";
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
  /** Portrait Image Generation V1: the image provider seam and the local portrait asset store (both optional; absent = feature off). */
  readonly portrait_generator?: PortraitImageGenerator;
  readonly portrait_store?: PortraitAssetStore;
  /** Safe server-side diagnostics for portrait failures: an error code and HTTP status only (never bodies, prompts or keys). */
  readonly portrait_log?: (entry: { readonly code: string; readonly status?: number }) => void;
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
/** Portrait Image Generation V1 outcome. `cost_usd` only when the provider reported it (never estimated). */
export type PortraitOutcome = { readonly ok: true; readonly changed: boolean; readonly cost_usd?: number; readonly view: SessionView }
  | { readonly ok: false; readonly error: AppError; readonly view: SessionView };
const REFERENCE_MAX_BYTES = 4 * 1024 * 1024;
/** Concise player-facing messages per image failure; provider bodies are never shown. */
const PORTRAIT_MESSAGES: Readonly<Record<string, string>> = {
  configuration_error: "Portrait generation is not configured: set OPENROUTER_API_KEY and restart the game.",
  authentication_error: "The image provider rejected the API key.",
  insufficient_credits: "The image provider reports insufficient credits.",
  rate_limited: "The image provider is rate-limiting requests. Try again shortly.",
  timeout: "Portrait generation timed out. Nothing was saved.",
  provider_unavailable: "The image provider failed. Nothing was saved.",
  unsupported_configuration: "The configured image model or settings are not supported.",
  invalid_request: "The portrait prompt could not be sent.",
  invalid_provider_response: "The image provider returned an unusable response. Nothing was saved.",
  invalid_image: "The image provider returned an unusable image. Nothing was saved.",
  network_error: "Could not reach the image provider.",
  storage_error: "The portrait could not be stored. Nothing was saved.",
};
/** Permanent Appearance V1 editor save. `field` names the rejected patch field, when one was. */
export type AppearanceOutcome = { readonly ok: true; readonly changed: boolean; readonly view: SessionView }
  | { readonly ok: false; readonly error: AppError; readonly field?: string; readonly view: SessionView };

/** Application commands own explicit entry points; they must never be sent to the narrator as player prose. */
const APPLICATION_COMMAND = /^\s*\/(?:save|load|new|quit|exit|status|help|debug|location)(?:\s|$)/i;
const STUB_STATUS: ProviderStatus = { mode: "stub", configured: true };

export class GameSession {
  readonly #mannerisms: MannerismMaintenance | undefined;
  readonly #deps: SessionDeps; readonly #session: CampaignSession; readonly #coordinator: Pick<TurnCoordinator, "runTurn"> & Partial<Pick<TurnCoordinator, "contextRequest" | "resetSceneContinuity">>;
  readonly #traces: TurnTrace[] = []; #sequence = 0; #status: SessionStatus = "idle"; #abort: AbortController | undefined; #inflight: Promise<unknown> | undefined;
  #compactionReason: CompactionReason | undefined; #compactionResult: CompactionResult | undefined;
  #diagnostics: DeepReadonly<TurnDiagnostics> | undefined; #reflectionRecord: DeepReadonly<ReflectionDiagnostics> | undefined; #lastError: AppError | undefined;
  /** Portrait Image Generation V1: the character whose portrait is being generated (one generation per session at a time). */
  #portraitBusy: string | undefined; #idleWaiters: (() => void)[] = [];
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
  #setStatus(status: SessionStatus, emit?: (e: SessionEvent) => void): void {
    if (this.#status !== status) { this.#status = status; emit?.({ type: "status_changed", status }); }
    if (status === "idle" || status === "closed") for (const wake of this.#idleWaiters.splice(0)) wake();
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
      this.#lastError = undefined;
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
      this.#lastError = undefined;
      return { ok: true, changed: true, view: this.getView() };
    } catch { return reject("campaign_validation_failed", "The appearance change was refused. The campaign is unchanged."); }
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
   * Portrait Image Generation V1. Generates one portrait for an eligible managed NPC+ from the CURRENT committed appearance (the browser
   * supplies only the opaque ref and the revision it saw; prompt, model and paths are server-side). Sequence: validate (revision,
   * eligibility, lock) → build prompt → provider call → decode/validate → stage file → wait for any turn to finish → re-check that the
   * prompt is unchanged → finalize file → prepare+commit metadata synchronously → expose. Any failure leaves the campaign and the active
   * portrait unchanged; a staged or finalized-but-uncommitted file is removed. The generated image never changes appearance.
   */
  async generateNpcPortrait(request: { readonly ref: unknown; readonly expected_revision: unknown }): Promise<PortraitOutcome> {
    const reject = (code: AppError["code"], message: string): PortraitOutcome => ({ ok: false, error: appError(code, { message }), view: this.getView() });
    if (this.#status === "closed") return reject("session_closed", "The session is closed.");
    if (this.#status !== "idle") return reject("turn_in_progress", "A turn is running. Generate the portrait when it finishes.");
    if (this.#portraitBusy) return reject("turn_in_progress", "A portrait is already being generated.");
    const generator = this.#deps.portrait_generator, store = this.#deps.portrait_store;
    if (!generator || !store) return reject("portrait_generation_failed", "Portrait generation is not available in this session.");
    const campaign = this.#session.campaign;
    if (typeof request.expected_revision !== "number" || request.expected_revision !== campaign.revision) return reject("stale_turn", "The campaign changed since the editor opened. Reopen the editor before generating.");
    const target = this.#managedTarget(request.ref);
    if (!target) return reject("invalid_input", "This character's portrait cannot be generated.");
    const { id } = target, campaignId = target.snapshot.campaign_id, prompt = target.editor.portrait_prompt.prompt, fingerprint = portraitFingerprint(prompt);
    const existing = portraitRecord(target.snapshot, id);
    if ((existing?.versions.length ?? 0) >= MAX_PORTRAIT_VERSIONS) return reject("portrait_generation_failed", "This character has reached the portrait version limit.");
    this.#portraitBusy = id;
    let staged: string | undefined;
    try {
      const references: ImageReference[] = [];
      if (existing?.reference) {
        const bytes = await store.read(campaignId, id, existing.reference.asset_file);
        if (!bytes) return reject("portrait_generation_failed", "The attached reference image could not be read. Remove it or attach it again.");
        references.push({ media_type: existing.reference.media_type, bytes });
      }
      const image = await generator.generate({ prompt, references });
      const ext = extensionFor(image.media_type);
      if (!ext) throw new ImageGenerationError("invalid_image");
      staged = await store.stage(campaignId, id, image.bytes);
      // Never commit under a running turn: wait until the session is idle again, then re-validate against the current state.
      while (this.#now() !== "idle" && this.#now() !== "closed") await new Promise<void>(wake => this.#idleWaiters.push(wake));
      if (this.#now() === "closed") return reject("session_closed", "The session closed before the portrait was saved.");
      const now = this.#managedTarget(request.ref);
      if (!now || now.id !== id) return reject("invalid_input", "This character can no longer be edited. The portrait was not saved.");
      if (portraitFingerprint(now.editor.portrait_prompt.prompt) !== fingerprint) return reject("portrait_generation_failed", "The appearance changed while the portrait was generating. It was not saved; generate again.");
      const number = (portraitRecord(now.snapshot, id)?.versions.length ?? 0) + 1;
      const version_id = `portrait_${number}_${randomBytes(4).toString("hex")}`, asset_file = `${version_id}.${ext}`;
      const version = { version_id, prompt_version: PORTRAIT_PROMPT_VERSION, prompt_fingerprint: fingerprint, model: image.model, created_at: new Date().toISOString(),
        media_type: image.media_type, asset_file, ...(image.cost_usd !== undefined ? { cost_usd: image.cost_usd } : {}), ...(references.length ? { reference_used: true as const } : {}) };
      await store.finalize(staged, campaignId, id, asset_file); staged = undefined;
      try {
        // Synchronous: no other operation can interleave between preparation and commit.
        campaign.commit(campaign.prepare({ expected_revision: campaign.revision, commands: [{ kind: "record_portrait", character_id: id, version }] }));
      } catch {
        await store.remove(campaignId, id, asset_file);
        return reject("campaign_validation_failed", "The portrait could not be recorded. Nothing was saved.");
      }
      this.#lastError = undefined;
      return { ok: true, changed: true, ...(image.cost_usd !== undefined ? { cost_usd: image.cost_usd } : {}), view: this.getView() };
    } catch (error) {
      const code = error instanceof ImageGenerationError ? error.code : "storage_error";
      this.#deps.portrait_log?.({ code, ...(error instanceof ImageGenerationError && error.status ? { status: error.status } : {}) });
      return reject("portrait_generation_failed", PORTRAIT_MESSAGES[code] ?? PORTRAIT_MESSAGES.storage_error!);
    } finally {
      if (staged) await store.discard(staged);
      this.#portraitBusy = undefined;
    }
  }

  /**
   * Portrait Image Generation V1: attach (or with `image: null` remove) the single reference image that guides this character's
   * generations. A PNG/JPEG/WebP of at most 4 MB, verified by signature; stored as a local file, never as a URL (no fetching).
   * Guidance only: nothing is read back into appearance.
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
      await store.remove(campaignId, id, previous.asset_file);
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
      if (previous) await store.remove(campaignId, id, previous.asset_file);
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
