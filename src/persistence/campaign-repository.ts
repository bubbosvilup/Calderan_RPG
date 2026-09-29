import { resolve, join, parse, sep, relative, isAbsolute, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { WorldStore } from "../world/world-store.js";
import { CampaignState } from "../campaign/campaign-state.js";
import type { DeepReadonly } from "../types/readonly.js";
import { CampaignSaveError, nodeCode, saveError, type SaveErrorCode } from "./errors.js";
import { createSaveFile, decodeSave, serializeSave, validateSaveId, type CampaignSaveFileV1 } from "./save-format.js";
import { nodeSaveFileSystem, type SaveFileInfo, type SaveFileSystem } from "./filesystem.js";

export type SaveSlot = "current" | "previous";
export interface SavedCampaign { readonly status: "saved"; readonly campaign_id: string; readonly revision: number; readonly saved_at: string }
export interface LoadedCampaign { readonly status: "loaded"; readonly slot: SaveSlot; readonly campaign: CampaignState; readonly metadata: DeepReadonly<CampaignSaveFileV1["metadata"]> }
export interface SlotListing { readonly exists: boolean; readonly status: "valid" | SaveErrorCode; readonly revision?: number; readonly saved_at?: string; readonly canonical_dataset_id?: string }
export interface SaveListing { readonly campaign_id: string; readonly current: SlotListing; readonly previous: SlotListing }
export interface CampaignSaveRepository {
  saveCampaign(campaign: CampaignState): Promise<SavedCampaign>;
  loadCampaign(campaignId: string, slot?: SaveSlot): Promise<LoadedCampaign>;
  listSaves(): Promise<readonly SaveListing[]>;
}
const activeWrites = new Set<string>();
const pathKey = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
function within(root: string, candidate: string): boolean { const rel = relative(root, candidate); return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)); }

export class FileCampaignRepository implements CampaignSaveRepository {
  readonly #world: WorldStore;
  readonly #root: string;
  readonly #fs: SaveFileSystem;
  readonly #now: () => string;
  constructor(world: WorldStore, root = "saves", options: { filesystem?: SaveFileSystem; now?: () => string } = {}) {
    this.#world = world; this.#root = resolve(root); this.#fs = options.filesystem ?? nodeSaveFileSystem;
    this.#now = options.now ?? (() => new Date().toISOString());
    if (within(resolve("data"), this.#root)) throw new CampaignSaveError("unsafe_path");
  }
  private campaignPath(id: string): string {
    const path = join(this.#root, validateSaveId(id));
    if (!within(this.#root, path)) throw new CampaignSaveError("unsafe_path"); return path;
  }
  private async info(path: string): Promise<SaveFileInfo | undefined> {
    try { return await this.#fs.info(path); } catch (error) { if (nodeCode(error) === "ENOENT") return undefined; throw error; }
  }
  /** Reject pre-existing links/junctions in every directory component, including configured root. */
  private async directory(path: string, create: boolean): Promise<void> {
    const root = parse(path).root; let current = root;
    for (const segment of path.slice(root.length).split(sep).filter(Boolean)) {
      current = join(current, segment); let info = await this.info(current);
      if (!info && create) {
        try { await this.#fs.mkdir(current); await this.#fs.syncDirectory(dirname(current)); }
        catch (error) { if (nodeCode(error) !== "EEXIST") throw error; }
        info = await this.info(current);
      }
      if (!info) throw new CampaignSaveError("not_found");
      if (info.kind !== "directory" || pathKey(await this.#fs.realpath(current)) !== pathKey(current)) throw new CampaignSaveError("unsafe_path");
    }
  }
  private async regularFile(path: string): Promise<SaveFileInfo | undefined> {
    const info = await this.info(path);
    if (info && (info.kind !== "file" || info.links > 1)) throw new CampaignSaveError("unsafe_path"); return info;
  }
  private filename(directory: string, slot: SaveSlot): string {
    if (slot !== "current" && slot !== "previous") throw new CampaignSaveError("invalid_save");
    return join(directory, slot === "current" ? "save.json" : "save.previous.json");
  }
  private async readSlot(directory: string, id: string, slot: SaveSlot): Promise<{ text: string; file: DeepReadonly<CampaignSaveFileV1> }> {
    await this.directory(directory, false); const path = this.filename(directory, slot);
    if (!await this.regularFile(path)) throw new CampaignSaveError("not_found");
    const text = await this.#fs.read(path); return { text, file: decodeSave(text, this.#world, id) };
  }
  async saveCampaign(campaign: CampaignState): Promise<SavedCampaign> {
    // Capture synchronously before any filesystem await; later gameplay remains unsaved.
    const snapshot = campaign.exportSnapshot(), id = validateSaveId(snapshot.campaign_id), directory = this.campaignPath(id), key = pathKey(directory);
    if (activeWrites.has(key)) throw new CampaignSaveError("save_in_progress");
    activeWrites.add(key);
    const temps = new Set<string>();
    const writeTemp = async (text: string) => {
      const path = join(directory, `.save-${randomUUID()}.tmp`); temps.add(path);
      try { await this.#fs.writeNew(path, text); }
      catch (error) { if (nodeCode(error) === "EEXIST") temps.delete(path); throw error; }
      return path;
    };
    try {
      // Validate snapshot and metadata before creating directories or touching existing saves.
      const initial = createSaveFile(snapshot, this.#world, this.#now());
      await this.directory(directory, true);
      const current = this.filename(directory, "current"), previous = this.filename(directory, "previous");
      let old: Awaited<ReturnType<FileCampaignRepository["readSlot"]>> | undefined;
      if (await this.regularFile(current)) old = await this.readSlot(directory, id, "current");
      await this.regularFile(previous);
      const file = createSaveFile(snapshot, this.#world, initial.metadata.saved_at, old?.file.metadata.created_at ?? initial.metadata.saved_at);
      const nextTemp = await writeTemp(serializeSave(file, this.#world));
      if (old) {
        const backupTemp = await writeTemp(old.text);
        await this.directory(directory, false); await this.regularFile(previous);
        await this.#fs.rename(backupTemp, previous); temps.delete(backupTemp);
        await this.#fs.syncDirectory(directory);
      }
      await this.directory(directory, false); await this.regularFile(current);
      await this.#fs.rename(nextTemp, current); temps.delete(nextTemp);
      await this.#fs.syncDirectory(directory);
      return Object.freeze({ status: "saved", campaign_id: id, revision: snapshot.revision, saved_at: file.metadata.saved_at });
    } catch (error) { throw saveError(error); }
    finally {
      for (const path of temps) {
        try { await this.directory(directory, false); await this.regularFile(path); await this.#fs.unlink(path); } catch { /* Best effort: stale temps are never loaded. */ }
      }
      activeWrites.delete(key);
    }
  }
  async loadCampaign(campaignId: string, slot: SaveSlot = "current"): Promise<LoadedCampaign> {
    try {
      const id = validateSaveId(campaignId), { file } = await this.readSlot(this.campaignPath(id), id, slot);
      return Object.freeze({ status: "loaded", slot, campaign: CampaignState.restore(this.#world, file.snapshot), metadata: file.metadata });
    } catch (error) { throw saveError(error); }
  }
  async listSaves(): Promise<readonly SaveListing[]> {
    try {
      try { await this.directory(this.#root, false); } catch (error) { if (error instanceof CampaignSaveError && error.code === "not_found") return Object.freeze([]); throw error; }
      const entries: SaveListing[] = [];
      for (const name of (await this.#fs.names(this.#root)).sort()) {
        try { validateSaveId(name); } catch { continue; }
        const directory = this.campaignPath(name), info = await this.info(directory);
        if (!info || (info.kind !== "directory" && info.kind !== "link")) continue;
        const inspect = async (slot: SaveSlot): Promise<SlotListing> => {
          let exists = false;
          try {
            await this.directory(directory, false);
            exists = (await this.info(this.filename(directory, slot))) !== undefined;
            const { file } = await this.readSlot(directory, name, slot);
            return Object.freeze({ exists: true, status: "valid", revision: file.snapshot.revision, saved_at: file.metadata.saved_at, canonical_dataset_id: file.canonical_dataset_id });
          } catch (error) { return Object.freeze({ exists, status: saveError(error).code }); }
        };
        entries.push(Object.freeze({ campaign_id: name, current: await inspect("current"), previous: await inspect("previous") }));
      }
      return Object.freeze(entries);
    } catch (error) { throw saveError(error); }
  }
}
