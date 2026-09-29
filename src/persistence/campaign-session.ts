import type { CampaignState } from "../campaign/campaign-state.js";
import { CampaignSaveError } from "./errors.js";
import type { CampaignSaveRepository, LoadedCampaign, SavedCampaign } from "./campaign-repository.js";

/** UI convenience only. Neither dirty tracking nor wall time enters campaign truth. */
export class CampaignSession {
  #lastSavedRevision: number | null = null;
  #saving = false;
  constructor(readonly campaign: CampaignState, readonly repository: CampaignSaveRepository) {}
  static fromLoaded(loaded: LoadedCampaign, repository: CampaignSaveRepository): CampaignSession {
    const session = new CampaignSession(loaded.campaign, repository);
    session.#lastSavedRevision = loaded.campaign.revision; return session;
  }
  get last_saved_revision(): number | null { return this.#lastSavedRevision; }
  get hasUnsavedChanges(): boolean { return this.campaign.revision !== this.#lastSavedRevision; }
  async save(): Promise<SavedCampaign> {
    if (this.#saving) throw new CampaignSaveError("save_in_progress");
    this.#saving = true;
    try {
      const result = await this.repository.saveCampaign(this.campaign);
      this.#lastSavedRevision = result.revision; return result;
    } finally { this.#saving = false; }
  }
}
