import { resolve, join, parse, sep, relative, isAbsolute, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { WorldStore } from "../world/world-store.js";
import { CampaignState } from "../campaign/campaign-state.js";
import type { DeepReadonly } from "../types/readonly.js";
import { CampaignSaveError, nodeCode, saveError, type SaveErrorCode } from "./errors.js";
import { createSaveFile, decodeSaveWithReport, serializeSave, validateSaveId, type CampaignSaveFile, type SaveContinuity, type SaveMetadata, type SaveReason } from "./save-format.js";
import type { CanonCompatibilityReport } from "./canon-compatibility.js";
import { nodeSaveFileSystem, type SaveFileInfo, type SaveFileSystem } from "./filesystem.js";
import { parseSaveJson } from "./strict-json.js";
import { parseTranscript, serializeTranscriptRecords, TRANSCRIPT_LIMITS, type TranscriptEntry, type TranscriptRecord } from "./transcript.js";

/** `current` / `previous` slots, or one rolling checkpoint by its file name (`backup:r00000412-20261008T210411123Z.json`). */
export type SaveSlot = "current" | "previous" | `backup:${string}`;
export interface SavedCampaign { readonly status: "saved"; readonly campaign_id: string; readonly revision: number; readonly saved_at: string;
  /** Rolling checkpoint written by this save (file name), when one was due. */ readonly checkpoint?: string;
  /** A checkpoint was due but could not be written; the canonical save itself succeeded. */ readonly checkpoint_failed?: true;
  /** File name the corrupt current slot was moved to before this save (explicit recovery only). */ readonly quarantined?: string }
export interface LoadedCampaign { readonly status: "loaded"; readonly slot: SaveSlot; readonly campaign: CampaignState; readonly metadata: DeepReadonly<CampaignSaveFile["metadata"]>;
  /** Save/Load v1: non-authoritative recent conversation, when present and well formed. */ readonly continuity?: DeepReadonly<SaveContinuity>;
  readonly migrated_from?: number; readonly snapshot_migrated_from?: number; readonly canon: CanonCompatibilityReport; readonly continuity_dropped: boolean }
export interface SlotListing { readonly exists: boolean; readonly status: "valid" | SaveErrorCode; readonly revision?: number; readonly saved_at?: string; readonly canonical_dataset_id?: string;
  readonly display_name?: string; readonly created_at?: string; readonly scenario_id?: string; readonly save_reason?: SaveReason;
  /** Safe summary for a campaign list: no character state beyond counts. */
  readonly summary?: { readonly location_id: string; readonly location_name: string; readonly world_minute: number; readonly household_members: number } }
export interface SaveListing { readonly campaign_id: string; readonly current: SlotListing; readonly previous: SlotListing; readonly backups: readonly string[]; readonly locked: boolean }
export interface SaveCampaignOptions {
  readonly metadata?: Partial<Pick<SaveMetadata, "display_name" | "save_reason" | "scenario_id" | "engine_version">>;
  readonly continuity?: SaveContinuity;
  /** Explicit recovery only: move an unreadable current slot to `save.corrupt-<ts>.json` (never deleted) instead of refusing. */
  readonly quarantine_corrupt_current?: boolean;
}
export interface CampaignLock { readonly campaign_id: string; release(): Promise<void> }
export interface TranscriptRead { readonly status: "ok" | "missing" | "unreadable"; readonly entries: readonly TranscriptEntry[]; readonly next_index: number; readonly invalid_lines: number; readonly max_revision: number }
/** Asset files (character ID + file name) referenced by the retained saves; `complete` is false when any retained save was unreadable. */
export interface RetainedAssets { readonly complete: boolean; readonly references: ReadonlySet<string> }
export const assetKey = (characterId: string, file: string) => `${characterId}\u0000${file}`;
export interface CampaignSaveRepository {
  saveCampaign(campaign: CampaignState, options?: SaveCampaignOptions): Promise<SavedCampaign>;
  loadCampaign(campaignId: string, slot?: SaveSlot): Promise<LoadedCampaign>;
  listSaves(): Promise<readonly SaveListing[]>;
}
const activeWrites = new Set<string>();
const pathKey = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
function within(root: string, candidate: string): boolean { const rel = relative(root, candidate); return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)); }
const BACKUP = /^r(\d{8,16})-(\d{8}T\d{9}Z)\.json$/;
const compact = (iso: string) => iso.replace(/[-:.]/g, "");
const processAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return nodeCode(error) === "EPERM"; } };
export interface RepositoryOptions {
  filesystem?: SaveFileSystem; now?: () => string;
  /** Soft-delete destination (default `<root>/../.deleted`). */ deleted_root?: string;
  /** Rolling checkpoints: how many to keep (default 5) and the minimum interval between autosave checkpoints (default 15 min). */
  max_backups?: number; checkpoint_interval_ms?: number;
  /** Lock liveness seam for tests. */ process_alive?: (pid: number) => boolean; pid?: number;
  /**
   * A held lock is refreshed (heartbeat) every `lock_heartbeat_ms` (default 30 s); a lock whose heartbeat is older than
   * `lock_stale_ms` (default 90 s) is stale even if its PID is alive (Windows reuses PIDs quickly). `clock_ms` is a test seam.
   */
  lock_heartbeat_ms?: number; lock_stale_ms?: number; clock_ms?: () => number;
}

export class FileCampaignRepository implements CampaignSaveRepository {
  readonly #world: WorldStore;
  readonly #root: string; readonly #deleted: string;
  readonly #fs: SaveFileSystem;
  readonly #now: () => string;
  readonly #maxBackups: number; readonly #interval: number;
  readonly #alive: (pid: number) => boolean; readonly #pid: number;
  readonly #heartbeat: number; readonly #stale: number; readonly #clock: () => number;
  /** Locks this repository instance holds: campaign ID → token. */
  readonly #locks = new Map<string, string>();
  constructor(world: WorldStore, root = "saves", options: RepositoryOptions = {}) {
    this.#world = world; this.#root = resolve(root); this.#fs = options.filesystem ?? nodeSaveFileSystem;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#deleted = resolve(options.deleted_root ?? join(dirname(this.#root), ".deleted"));
    this.#maxBackups = options.max_backups ?? 5; this.#interval = options.checkpoint_interval_ms ?? 15 * 60_000;
    this.#alive = options.process_alive ?? processAlive; this.#pid = options.pid ?? process.pid;
    this.#heartbeat = options.lock_heartbeat_ms ?? 30_000; this.#stale = options.lock_stale_ms ?? 90_000; this.#clock = options.clock_ms ?? Date.now;
    if (within(resolve("data"), this.#root)) throw new CampaignSaveError("unsafe_path");
    if (within(this.#root, this.#deleted)) throw new CampaignSaveError("unsafe_path");
  }
  get root(): string { return this.#root; }
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
    if (slot === "current") return join(directory, "save.json");
    if (slot === "previous") return join(directory, "save.previous.json");
    const name = typeof slot === "string" && slot.startsWith("backup:") ? slot.slice(7) : "";
    if (!BACKUP.test(name)) throw new CampaignSaveError("invalid_save");
    return join(directory, "backups", name);
  }
  private async readSlot(directory: string, id: string, slot: SaveSlot) {
    await this.directory(slot.startsWith("backup:") ? join(directory, "backups") : directory, false); const path = this.filename(directory, slot);
    if (!await this.regularFile(path)) throw new CampaignSaveError("not_found");
    const text = await this.#fs.read(path); return { text, decoded: decodeSaveWithReport(text, this.#world, id) };
  }
  async saveCampaign(campaign: CampaignState, options: SaveCampaignOptions = {}): Promise<SavedCampaign> {
    // Capture synchronously before any filesystem await; later gameplay remains unsaved.
    const snapshot = campaign.exportSnapshot(), id = validateSaveId(snapshot.campaign_id), directory = this.campaignPath(id), key = pathKey(directory);
    if (activeWrites.has(key)) throw new CampaignSaveError("save_in_progress");
    activeWrites.add(key);
    const temps = new Set<string>();
    const writeTemp = async (folder: string, text: string) => {
      const path = join(folder, `.save-${randomUUID()}.tmp`); temps.add(path);
      try { await this.#fs.writeNew(path, text); }
      catch (error) { if (nodeCode(error) === "EEXIST") temps.delete(path); throw error; }
      return path;
    };
    try {
      // Validate snapshot and metadata before creating directories or touching existing saves.
      const savedAt = this.#now();
      createSaveFile(snapshot, this.#world, savedAt, savedAt, { metadata: options.metadata ?? {}, ...(options.continuity ? { continuity: options.continuity } : {}) });
      await this.directory(directory, true);
      await this.#checkLock(directory);
      const current = this.filename(directory, "current"), previous = this.filename(directory, "previous");
      let old: Awaited<ReturnType<FileCampaignRepository["readSlot"]>> | undefined, quarantined: string | undefined;
      if (await this.regularFile(current)) {
        try { old = await this.readSlot(directory, id, "current"); }
        catch (error) {
          const code = saveError(error).code;
          // Explicit recovery: a corrupt/unusable current is MOVED aside (evidence kept), never overwritten or deleted.
          if (!options.quarantine_corrupt_current || code === "io_error" || code === "unsafe_path" || code === "not_found") throw error;
          quarantined = `save.corrupt-${compact(savedAt)}.json`;
          await this.#fs.rename(current, join(directory, quarantined)); await this.#fs.syncDirectory(directory);
        }
      }
      await this.regularFile(previous);
      // Display name and scenario persist across saves unless the caller sets them.
      const previousMeta = old?.decoded.file.metadata;
      const metadata = Object.fromEntries(Object.entries({ display_name: previousMeta?.display_name, scenario_id: previousMeta?.scenario_id, engine_version: previousMeta?.engine_version, ...options.metadata })
        .filter(([, v]) => v !== undefined)) as NonNullable<SaveCampaignOptions["metadata"]>;
      const file = createSaveFile(snapshot, this.#world, savedAt, previousMeta?.created_at ?? savedAt, { metadata, ...(options.continuity ? { continuity: options.continuity } : {}) });
      const text = serializeSave(file, this.#world);
      const nextTemp = await writeTemp(directory, text);
      if (old) {
        const backupTemp = await writeTemp(directory, old.text);
        await this.directory(directory, false); await this.regularFile(previous);
        await this.#fs.rename(backupTemp, previous); temps.delete(backupTemp);
        await this.#fs.syncDirectory(directory);
      }
      await this.directory(directory, false); await this.regularFile(current);
      await this.#fs.rename(nextTemp, current); temps.delete(nextTemp);
      await this.#fs.syncDirectory(directory);
      // Rolling checkpoint (best effort; never fails a completed canonical save). Saves only: no image bytes, no transcript.
      let checkpoint: string | undefined, checkpointFailed = false;
      try { checkpoint = await this.#checkpoint(directory, snapshot.revision, savedAt, options.metadata?.save_reason, text, writeTemp, temps); }
      catch { checkpointFailed = true; }
      return Object.freeze({ status: "saved", campaign_id: id, revision: snapshot.revision, saved_at: savedAt, ...(checkpoint ? { checkpoint } : {}), ...(checkpointFailed ? { checkpoint_failed: true as const } : {}),
        ...(quarantined ? { quarantined } : {}) });
    } catch (error) { throw saveError(error); }
    finally {
      for (const path of temps) {
        try { await this.directory(dirname(path), false); await this.regularFile(path); await this.#fs.unlink(path); } catch { /* Best effort: stale temps are never loaded. */ }
      }
      activeWrites.delete(key);
    }
  }
  async #checkpoint(directory: string, revision: number, savedAt: string, reason: SaveReason | undefined, text: string, writeTemp: (folder: string, text: string) => Promise<string>, temps: Set<string>): Promise<string | undefined> {
    const folder = join(directory, "backups");
    await this.directory(folder, true);
    const names = await this.#backupNames(folder);
    const newest = names[0] ? BACKUP.exec(names[0])![2]! : undefined;
    const newestMs = newest ? Date.parse(`${newest.slice(0, 4)}-${newest.slice(4, 6)}-${newest.slice(6, 8)}T${newest.slice(9, 11)}:${newest.slice(11, 13)}:${newest.slice(13, 15)}.${newest.slice(15, 18)}Z`) : undefined;
    const due = reason === "create" || reason === "manual" || reason === "quit" || newestMs === undefined || Date.parse(savedAt) - newestMs >= this.#interval;
    if (!due) return undefined;
    const name = `r${String(revision).padStart(8, "0")}-${compact(savedAt)}.json`;
    if (names.includes(name)) return undefined;
    const temp = await writeTemp(folder, text);
    await this.#fs.rename(temp, join(folder, name)); temps.delete(temp);
    await this.#fs.syncDirectory(folder);
    for (const stale of [name, ...names].slice(this.#maxBackups)) { try { await this.#fs.unlink(join(folder, stale)); } catch { /* Kept; retried at the next checkpoint. */ } }
    return name;
  }
  /** Newest first (by timestamp, then revision). */
  async #backupNames(folder: string): Promise<string[]> {
    let names: string[];
    try { names = await this.#fs.names(folder); } catch (error) { if (nodeCode(error) === "ENOENT") return []; throw error; }
    return names.filter(n => BACKUP.test(n)).sort((a, b) => { const [, ra, ta] = BACKUP.exec(a)!, [, rb, tb] = BACKUP.exec(b)!; return ta! < tb! ? 1 : ta! > tb! ? -1 : Number(rb) - Number(ra); });
  }
  async listBackups(campaignId: string): Promise<readonly string[]> {
    try { const directory = this.campaignPath(campaignId); await this.directory(directory, false); return Object.freeze(await this.#backupNames(join(directory, "backups"))); }
    catch (error) { const e = saveError(error); if (e.code === "not_found") return Object.freeze([]); throw e; }
  }
  async loadCampaign(campaignId: string, slot: SaveSlot = "current"): Promise<LoadedCampaign> {
    try {
      const id = validateSaveId(campaignId), { decoded } = await this.readSlot(this.campaignPath(id), id, slot), file = decoded.file;
      return Object.freeze({ status: "loaded", slot, campaign: CampaignState.restore(this.#world, file.snapshot), metadata: file.metadata, ...(file.continuity ? { continuity: file.continuity } : {}),
        ...(decoded.migrated_from !== undefined ? { migrated_from: decoded.migrated_from } : {}), ...(decoded.snapshot_migrated_from !== undefined ? { snapshot_migrated_from: decoded.snapshot_migrated_from } : {}),
        canon: decoded.canon, continuity_dropped: decoded.continuity_dropped });
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
            const { file } = (await this.readSlot(directory, name, slot)).decoded, s = file.snapshot, meta = file.metadata;
            const household = s.households.find(h => h.members.some(m => m.character_id === "nicco" && m.status === "member" && m.role === "owner"));
            return Object.freeze({ exists: true, status: "valid", revision: s.revision, saved_at: meta.saved_at, canonical_dataset_id: file.canonical_dataset_id,
              ...(meta.display_name ? { display_name: meta.display_name } : {}), ...(meta.created_at ? { created_at: meta.created_at } : {}), ...(meta.scenario_id ? { scenario_id: meta.scenario_id } : {}),
              ...(meta.save_reason ? { save_reason: meta.save_reason } : {}),
              summary: Object.freeze({ location_id: s.runtime.scene.player_location, location_name: this.#world.getEntity(s.runtime.scene.player_location)?.display_name ?? s.runtime.scene.player_location,
                world_minute: s.runtime.scene.world_time.world_minute, household_members: household?.members.filter(m => m.status === "member" && m.character_id !== "nicco").length ?? 0 }) });
          } catch (error) { return Object.freeze({ exists, status: saveError(error).code }); }
        };
        let backups: readonly string[] = []; try { backups = await this.#backupNames(join(directory, "backups")); } catch { /* Listed without backups. */ }
        entries.push(Object.freeze({ campaign_id: name, current: await inspect("current"), previous: await inspect("previous"), backups: Object.freeze(backups), locked: await this.#lockedByOther(directory) }));
      }
      return Object.freeze(entries);
    } catch (error) { throw saveError(error); }
  }
  // ------------------------------------------------------------------ process lock (one writer per campaign)
  async #readLock(directory: string): Promise<{ pid: number; token: string; fresh: boolean } | "unreadable" | undefined> {
    const path = join(directory, ".lock");
    const info = await this.info(path);
    if (!info) return undefined;
    const fresh = info.mtime_ms === undefined || this.#clock() - info.mtime_ms <= this.#stale;
    try { const value = JSON.parse(await this.#fs.read(path)) as { pid?: unknown; token?: unknown }; return Number.isSafeInteger(value.pid) && typeof value.token === "string" ? { pid: value.pid as number, token: value.token, fresh } : "unreadable"; }
    catch { return "unreadable"; }
  }
  /** A lock is HELD while its process runs and its heartbeat is recent; a dead holder or a silent (stale) lock is free. */
  #held(lock: { pid: number; fresh: boolean }): boolean { return lock.fresh && (lock.pid === this.#pid || this.#alive(lock.pid)); }
  /** Held by another live process, or by another session of this process (a different token). */
  async #lockedByOther(directory: string): Promise<boolean> {
    const lock = await this.#readLock(directory).catch(() => undefined);
    if (!lock || lock === "unreadable") return false;
    const id = directory.slice(this.#root.length + 1);
    if (lock.pid === this.#pid && this.#locks.get(id) === lock.token) return false;
    return this.#held(lock);
  }
  async #checkLock(directory: string): Promise<void> { if (await this.#lockedByOther(directory)) throw new CampaignSaveError("campaign_locked"); }
  /** Acquire the campaign's writer lock (creates the campaign folder). A lock left by a dead process is replaced. */
  async acquireLock(campaignId: string): Promise<CampaignLock> {
    try {
      const id = validateSaveId(campaignId), directory = this.campaignPath(id), path = join(directory, ".lock");
      await this.directory(directory, true);
      const token = randomUUID();
      for (let attempt = 0; attempt < 2; attempt++) {
        try { await this.#fs.writeNew(path, JSON.stringify({ pid: this.#pid, token, acquired_at: this.#now() })); this.#locks.set(id, token); break; }
        catch (error) {
          if (nodeCode(error) !== "EEXIST" || attempt) throw error;
          const lock = await this.#readLock(directory);
          if (lock && lock !== "unreadable" && this.#held(lock)) throw new CampaignSaveError("campaign_locked");
          await this.#fs.unlink(path); // stale: the holder no longer runs, its heartbeat stopped, or the file is unreadable
        }
      }
      // Heartbeat: a live holder keeps the lock fresh; it never keeps the process alive.
      const beat = setInterval(() => { void this.#fs.touch(path).catch(() => undefined); }, this.#heartbeat);
      (beat as { unref?: () => void }).unref?.();
      return Object.freeze({ campaign_id: id, release: async () => {
        clearInterval(beat);
        if (this.#locks.get(id) !== token) return;
        this.#locks.delete(id);
        try { const lock = await this.#readLock(directory); if (lock && lock !== "unreadable" && lock.token === token) await this.#fs.unlink(path); } catch { /* A leftover lock of this pid is stale for the next process. */ }
      } });
    } catch (error) { throw saveError(error); }
  }
  // ------------------------------------------------------------------ soft delete
  /** Moves the whole campaign folder (saves, transcript, portraits, backups) to the soft-delete root. Nothing is permanently deleted. */
  async deleteCampaign(campaignId: string): Promise<{ readonly moved_to: string }> {
    try {
      const id = validateSaveId(campaignId), directory = this.campaignPath(id);
      await this.directory(directory, false);
      if (await this.#lockedByOther(directory) || this.#locks.has(id)) throw new CampaignSaveError("campaign_locked");
      await this.directory(this.#deleted, true);
      const name = `${id}-${compact(this.#now())}`, target = join(this.#deleted, name);
      if (await this.info(target)) throw new CampaignSaveError("io_error");
      await this.#fs.rename(directory, target); await this.#fs.syncDirectory(this.#root);
      return Object.freeze({ moved_to: name });
    } catch (error) { throw saveError(error); }
  }
  // ------------------------------------------------------------------ transcript (history, never canonical)
  async appendTranscript(campaignId: string, records: readonly TranscriptRecord[]): Promise<void> {
    if (!records.length) return;
    try {
      const directory = this.campaignPath(validateSaveId(campaignId)), path = join(directory, "transcript.jsonl");
      await this.directory(directory, false); await this.regularFile(path);
      await this.#fs.append(path, serializeTranscriptRecords(records));
    } catch (error) { throw saveError(error); }
  }
  async readTranscript(campaignId: string, maxEntries: number = TRANSCRIPT_LIMITS.entries): Promise<TranscriptRead> {
    const empty = (status: TranscriptRead["status"]): TranscriptRead => Object.freeze({ status, entries: [], next_index: 0, invalid_lines: 0, max_revision: -1 });
    try {
      const directory = this.campaignPath(validateSaveId(campaignId)), path = join(directory, "transcript.jsonl");
      await this.directory(directory, false);
      if (!await this.regularFile(path)) return empty("missing");
      const { text, truncated } = await this.#fs.readTail(path, TRANSCRIPT_LIMITS.read_bytes);
      const parsed = parseTranscript(text, truncated, maxEntries);
      return Object.freeze({ status: "ok", ...parsed });
    } catch (error) { return saveError(error).code === "not_found" ? empty("missing") : empty("unreadable"); }
  }
  // ------------------------------------------------------------------ asset references of the retained saves
  /** Portrait/reference files referenced by save.json, save.previous.json and every retained backup (strict JSON only; no world validation). */
  async retainedAssetReferences(campaignId: string): Promise<RetainedAssets> {
    const references = new Set<string>(); let complete = true;
    const collect = (value: unknown) => {
      const items = (value as { snapshot?: { items?: unknown } } | undefined)?.snapshot?.items;
      if (items !== undefined && !Array.isArray(items)) complete = false;
      if (Array.isArray(items)) for (const item of items) {
        if (item?.sprite?.status === "ready") {
          if (typeof item.id === "string" && typeof item.sprite.asset_ref === "string") references.add(assetKey(item.id, item.sprite.asset_ref));
          else complete = false;
        }
      }
      const portraits = (value as { snapshot?: { portraits?: unknown } } | undefined)?.snapshot?.portraits;
      if (portraits === undefined) return;
      if (!Array.isArray(portraits)) { complete = false; return; }
      for (const record of portraits as { character_id?: unknown; versions?: unknown; reference?: { asset_file?: unknown } }[]) {
        if (typeof record?.character_id !== "string" || !Array.isArray(record.versions)) { complete = false; continue; }
        for (const v of record.versions as { asset_file?: unknown }[]) if (typeof v?.asset_file === "string") references.add(assetKey(record.character_id, v.asset_file)); else complete = false;
        if (record.reference && typeof record.reference.asset_file === "string") references.add(assetKey(record.character_id, record.reference.asset_file));
      }
    };
    try {
      const directory = this.campaignPath(validateSaveId(campaignId));
      try { await this.directory(directory, false); } catch (error) { if (saveError(error).code === "not_found") return Object.freeze({ complete: true, references }); throw error; }
      const files = [this.filename(directory, "current"), this.filename(directory, "previous"), ...(await this.#backupNames(join(directory, "backups"))).map(n => join(directory, "backups", n))];
      for (const path of files) {
        try { if (!await this.regularFile(path)) continue; collect(parseSaveJson(await this.#fs.read(path))); }
        catch { complete = false; }
      }
    } catch { complete = false; }
    return Object.freeze({ complete, references });
  }
}
