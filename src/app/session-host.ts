import { randomBytes } from "node:crypto";
import type { FileCampaignRepository, CampaignLock, SaveListing, SaveSlot } from "../persistence/campaign-repository.js";
import { appError, toAppError, type AppError } from "./app-errors.js";
import { GameSession, type LoadReport, type SessionDeps } from "./game-session.js";
import { DEFAULT_SCENARIO_ID, STARTING_SCENARIOS, scenarioById } from "./scenarios.js";

/**
 * Save/Load v1 active-session host (the Play UI's campaign lifecycle). It owns at most one live GameSession: none (start screen), or
 * one active campaign holding that campaign's process lock. Create/load/close are SWAPS:
 *   - refused while the active session is busy (turn, post-turn step, compaction, portrait batch, save) or another swap runs;
 *   - the target is loaded (and locked) BEFORE the old session is touched, so a failed load leaves the old campaign active;
 *   - the old session's autosave is suspended, a dirty campaign is saved (reason "quit"), the session is closed and its lock released.
 * A closed session rejects every operation, so late async work of the old campaign can never mutate the new one.
 */
export interface CampaignListEntry {
  readonly campaign_id: string; readonly display_name: string; readonly status: SaveListing["current"]["status"];
  readonly revision?: number; readonly saved_at?: string; readonly created_at?: string; readonly scenario_id?: string;
  readonly location_name?: string; readonly world_minute?: number; readonly household_members?: number;
  /** Explicit recovery options when the current slot is unusable. */
  readonly previous_valid: boolean; readonly backups: readonly string[]; readonly locked: boolean;
}
export type HostOutcome = { readonly ok: true; readonly load_report?: LoadReport } | { readonly ok: false; readonly error: AppError };
export class SessionHost {
  readonly #deps: SessionDeps & { readonly repository: FileCampaignRepository };
  readonly #ids: () => string;
  #active: { session: GameSession; lock: CampaignLock } | undefined;
  #swapping = false;
  constructor(deps: SessionDeps & { readonly repository: FileCampaignRepository }, options: { readonly campaign_id?: () => string } = {}) {
    this.#deps = deps;
    this.#ids = options.campaign_id ?? (() => `campaign_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(3).toString("hex")}`);
  }
  get active(): GameSession | undefined { return this.#active?.session; }
  get swapping(): boolean { return this.#swapping; }
  get scenarios() { return STARTING_SCENARIOS.map(({ id, label, description }) => ({ id, label, description })); }
  async listCampaigns(): Promise<readonly CampaignListEntry[]> {
    const listing = await this.#deps.repository.listSaves();
    return listing.map(entry => {
      const c = entry.current;
      return Object.freeze({ campaign_id: entry.campaign_id, display_name: c.display_name ?? entry.campaign_id, status: c.status, ...(c.revision !== undefined ? { revision: c.revision } : {}),
        ...(c.saved_at ? { saved_at: c.saved_at } : {}), ...(c.created_at ? { created_at: c.created_at } : {}), ...(c.scenario_id ? { scenario_id: c.scenario_id } : {}),
        ...(c.summary ? { location_name: c.summary.location_name, world_minute: c.summary.world_minute, household_members: c.summary.household_members } : {}),
        previous_valid: entry.previous.status === "valid", backups: entry.backups, locked: entry.locked && entry.campaign_id !== this.#active?.session.campaignId });
    }).sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? ""));
  }
  #guard(): AppError | undefined {
    if (this.#swapping) return appError("turn_in_progress", { message: "A campaign is already being opened. Wait for it to finish." });
    if (this.#active?.session.busy) return appError("turn_in_progress", { message: "Wait for the current turn, portrait generation or save to finish before switching campaigns." });
    return undefined;
  }
  async createCampaign(request: { readonly display_name: unknown; readonly scenario_id?: unknown }): Promise<HostOutcome> {
    const name = typeof request.display_name === "string" ? request.display_name.replace(/\s+/g, " ").trim() : "";
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) return { ok: false, error: appError("invalid_input", { message: "Enter a campaign name of 1–80 characters." }) };
    const scenario = scenarioById(request.scenario_id ?? DEFAULT_SCENARIO_ID);
    if (!scenario) return { ok: false, error: appError("invalid_input", { message: "Unknown starting scenario." }) };
    return this.#swap(async () => {
      const campaign_id = this.#ids(), lock = await this.#deps.repository.acquireLock(campaign_id);
      const started = await GameSession.startCampaign(this.#deps, { campaign_id, display_name: name, scenario_id: scenario.id });
      if (!started.ok) { await lock.release(); return started; }
      return { ok: true, session: started.session, lock };
    });
  }
  /**
   * Load a campaign slot. `previous`/backups are explicit recovery: when the current slot is unusable the first save of the recovered
   * session moves the corrupt file aside (kept) instead of being refused.
   */
  async loadCampaign(request: { readonly campaign_id: unknown; readonly slot?: unknown }): Promise<HostOutcome> {
    if (typeof request.campaign_id !== "string") return { ok: false, error: appError("invalid_input", { message: "Choose a campaign." }) };
    const slot = (request.slot ?? "current") as SaveSlot;
    if (typeof slot !== "string" || !(slot === "current" || slot === "previous" || /^backup:r\d{8,16}-\d{8}T\d{9}Z\.json$/.test(slot))) return { ok: false, error: appError("invalid_input", { message: "Unknown save slot." }) };
    const campaignId = request.campaign_id;
    return this.#swap(async () => {
      const same = this.#active?.session.campaignId === campaignId;
      // The active campaign is reopened from disk: close it first (saving if dirty) so its lock is free for the reload.
      if (same) { const closed = await this.#closeActive(); if (!closed.ok) return closed; }
      let lock: CampaignLock;
      try { lock = await this.#deps.repository.acquireLock(campaignId); } catch (error) { return { ok: false, error: toAppError(error) }; }
      let quarantine = false;
      if (slot !== "current") {
        const entry = (await this.#deps.repository.listSaves().catch(() => [] as readonly SaveListing[])).find(e => e.campaign_id === campaignId);
        quarantine = !!entry && entry.current.exists && entry.current.status !== "valid";
      }
      const loaded = await GameSession.loadCampaign(this.#deps, campaignId, slot, quarantine ? { quarantine_corrupt_current: true } : {});
      if (!loaded.ok) { await lock.release(); return loaded; }
      return { ok: true, session: loaded.session, lock, load_report: loaded.load_report };
    });
  }
  async #swap(open: () => Promise<{ ok: true; session: GameSession; lock: CampaignLock; load_report?: LoadReport } | { ok: false; error: AppError }>): Promise<HostOutcome> {
    const busy = this.#guard();
    if (busy) return { ok: false, error: busy };
    this.#swapping = true;
    this.#active?.session.suspendAutosave();
    try {
      const opened = await open();
      if (!opened.ok) { this.#active?.session.resumeAutosave(); return opened; }
      const closed = await this.#closeActive();
      if (!closed.ok) { await opened.session.shutdown({ discard_unsaved: true }); await opened.lock.release(); this.#active?.session.resumeAutosave(); return closed; }
      this.#active = { session: opened.session, lock: opened.lock };
      return { ok: true, ...(opened.load_report ? { load_report: opened.load_report } : {}) };
    } catch (error) { this.#active?.session.resumeAutosave(); return { ok: false, error: toAppError(error) }; }
    finally { this.#swapping = false; }
  }
  /** Save a dirty active campaign (reason "quit"), close it and release its lock. A failed save keeps it open. */
  async #closeActive(options: { readonly discard_unsaved?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: AppError }> {
    const active = this.#active;
    if (!active) return { ok: true };
    const closed = await active.session.shutdown({ save_reason: "quit", ...(options.discard_unsaved ? { discard_unsaved: true } : {}) });
    if (!closed.closed) return { ok: false, error: closed.error };
    await active.lock.release();
    this.#active = undefined;
    return { ok: true };
  }
  /** Back to the start screen. */
  async closeCampaign(): Promise<HostOutcome> {
    const busy = this.#guard();
    if (busy) return { ok: false, error: busy };
    this.#swapping = true;
    try { const closed = await this.#closeActive(); return closed.ok ? { ok: true } : closed; } finally { this.#swapping = false; }
  }
  /** Process shutdown: save the dirty active campaign where possible, then close regardless (the failure is reported to the caller). */
  async shutdown(): Promise<{ readonly saved_error?: AppError }> {
    const active = this.#active;
    if (!active) return {};
    const closed = await this.#closeActive();
    if (closed.ok) return {};
    await this.#closeActive({ discard_unsaved: true });
    return { saved_error: closed.error };
  }
}
