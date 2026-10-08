import type { CampaignState } from "../campaign/campaign-state.js";
import { CampaignSaveError } from "./errors.js";
import type { CampaignSaveRepository, LoadedCampaign, SavedCampaign } from "./campaign-repository.js";
import type { SaveContinuity, SaveReason } from "./save-format.js";

/** Campaign-level presentation metadata carried by every save (format 5). Never campaign truth. */
export interface CampaignMeta { readonly display_name?: string; readonly scenario_id?: string; readonly engine_version?: string }
export interface SessionSaveOptions { readonly reason?: SaveReason; readonly continuity?: SaveContinuity }

/** UI convenience only. Neither dirty tracking nor wall time enters campaign truth. */
export class CampaignSession {
  #lastSavedRevision: number | null = null;
  #saving = false;
  #meta: CampaignMeta;
  /** Explicit recovery from a non-current slot while the current slot is unreadable: the next save moves the corrupt file aside. */
  #quarantine = false;
  constructor(readonly campaign: CampaignState, readonly repository: CampaignSaveRepository, meta: CampaignMeta = {}) { this.#meta = meta; }
  /**
   * A loaded campaign starts clean at the revision it was saved at. When load reconciliation advanced the revision (authoritative
   * canon reconciliation), the reconciled state is unsaved and the session starts dirty.
   */
  static fromLoaded(loaded: Pick<LoadedCampaign, "campaign"> & Partial<LoadedCampaign>, repository: CampaignSaveRepository,
    options: { readonly quarantine_corrupt_current?: boolean; readonly engine_version?: string } = {}): CampaignSession {
    const meta = loaded.metadata;
    const session = new CampaignSession(loaded.campaign, repository, { ...(meta?.display_name ? { display_name: meta.display_name } : {}), ...(meta?.scenario_id ? { scenario_id: meta.scenario_id } : {}),
      ...(options.engine_version ? { engine_version: options.engine_version } : {}) });
    session.#lastSavedRevision = loaded.canon?.revision_advanced ? loaded.canon.saved_revision : loaded.campaign.revision;
    session.#quarantine = options.quarantine_corrupt_current === true;
    return session;
  }
  get last_saved_revision(): number | null { return this.#lastSavedRevision; }
  get hasUnsavedChanges(): boolean { return this.campaign.revision !== this.#lastSavedRevision; }
  get saving(): boolean { return this.#saving; }
  get meta(): CampaignMeta { return this.#meta; }
  /** Rename is presentation only: the campaign ID never changes. Written at the next save. */
  setDisplayName(name: string): void { this.#meta = { ...this.#meta, display_name: name }; }
  async save(options: SessionSaveOptions = {}): Promise<SavedCampaign> {
    if (this.#saving) throw new CampaignSaveError("save_in_progress");
    this.#saving = true;
    try {
      const metadata = { ...(this.#meta.display_name ? { display_name: this.#meta.display_name } : {}), ...(this.#meta.scenario_id ? { scenario_id: this.#meta.scenario_id } : {}),
        ...(this.#meta.engine_version ? { engine_version: this.#meta.engine_version } : {}), ...(options.reason ? { save_reason: options.reason } : {}) };
      const result = await this.repository.saveCampaign(this.campaign, { metadata, ...(options.continuity ? { continuity: options.continuity } : {}), ...(this.#quarantine ? { quarantine_corrupt_current: true } : {}) });
      this.#lastSavedRevision = result.revision; this.#quarantine = false; return result;
    } finally { this.#saving = false; }
  }
}
