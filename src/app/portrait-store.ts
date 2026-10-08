import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/**
 * Portrait Image Generation V1: local, campaign-specific portrait files (never inside a save's JSON). Layouts:
 *   campaign (Save/Load v1, real campaigns):  <campaigns root>/<campaign_id>/portraits/<character token>/<file>
 *   legacy   (disposable playtest mode):       <portraits root>/<campaign_id>/<character token>/<file>
 * The character token is a hash, so no character ID or name appears on disk paths; file names are store-generated tokens validated
 * by pattern, and every resolved path must stay inside the root. Nothing here is reachable by a browser-supplied path. Saves store
 * only the bare file name, so a campaign folder can be moved or exported as a unit.
 */
const CAMPAIGN = /^[a-z0-9][a-z0-9_-]{0,119}$/;
const FILE = /^(?:portrait|reference)_[a-z0-9_]{1,80}\.(?:png|jpg|webp)$/;
const TEMP = /^\.tmp-[0-9a-f]{16}$/;
const TOKEN = /^[0-9a-f]{24}$/;
export const PORTRAIT_FILE_LIMIT = 15 * 1024 * 1024;
export const extensionFor = (media: string) => media === "image/png" ? "png" : media === "image/jpeg" ? "jpg" : media === "image/webp" ? "webp" : undefined;
/** One file found on disk under a campaign's portrait tree (`key` = `<character token>/<file>`). */
export interface StoredPortraitFile { readonly key: string; readonly token: string; readonly file: string; readonly temporary: boolean; readonly mtime_ms: number }

export class PortraitAssetStore {
  readonly #root: string; readonly #layout: "legacy" | "campaign";
  constructor(root: string, options: { readonly layout?: "legacy" | "campaign" } = {}) { this.#root = resolve(root); this.#layout = options.layout ?? "legacy"; }
  get layout(): "legacy" | "campaign" { return this.#layout; }
  #campaignDir(campaignId: string): string {
    if (!CAMPAIGN.test(campaignId)) throw new Error("invalid campaign id for portrait storage");
    return this.#inside(this.#layout === "campaign" ? join(this.#root, campaignId, "portraits") : join(this.#root, campaignId));
  }
  /** The opaque per-character folder name (stable for a campaign ID + character ID). */
  characterToken(campaignId: string, characterId: string): string {
    return createHash("sha256").update(`portrait-store:${campaignId}:${characterId}`).digest("hex").slice(0, 24);
  }
  #dir(campaignId: string, characterId: string): string { return this.#inside(join(this.#campaignDir(campaignId), this.characterToken(campaignId, characterId))); }
  #inside(path: string): string {
    const full = resolve(path);
    if (full !== this.#root && !full.startsWith(this.#root + sep)) throw new Error("portrait path escapes the store");
    return full;
  }
  #file(campaignId: string, characterId: string, file: string): string {
    if (!FILE.test(file)) throw new Error("invalid portrait file name");
    return this.#inside(join(this.#dir(campaignId, characterId), file));
  }
  /** Write bytes to a private temporary file next to their final place. */
  async stage(campaignId: string, characterId: string, bytes: Uint8Array): Promise<string> {
    const dir = this.#dir(campaignId, characterId);
    await mkdir(dir, { recursive: true });
    const tmp = this.#inside(join(dir, `.tmp-${randomBytes(8).toString("hex")}`));
    await writeFile(tmp, bytes, { flag: "wx" });
    return tmp;
  }
  /** Move a staged file to its final name; never overwrites an existing portrait. */
  async finalize(tmp: string, campaignId: string, characterId: string, file: string): Promise<void> {
    const target = this.#file(campaignId, characterId, file);
    if (await stat(target).then(() => true, () => false)) throw new Error("portrait file already exists");
    await rename(this.#inside(tmp), target);
  }
  async discard(path: string): Promise<void> { await rm(this.#inside(path), { force: true }).catch(() => undefined); }
  /** Best-effort removal of a final file; resolves false (never throws) when it could not be removed, leaving a safe orphan. */
  async remove(campaignId: string, characterId: string, file: string): Promise<boolean> {
    try { await rm(this.#file(campaignId, characterId, file), { force: true }); return true; } catch { return false; }
  }
  async exists(campaignId: string, characterId: string, file: string): Promise<boolean> {
    try { return (await stat(this.#file(campaignId, characterId, file))).isFile(); } catch { return false; }
  }
  async read(campaignId: string, characterId: string, file: string): Promise<Buffer | undefined> {
    const path = this.#file(campaignId, characterId, file);
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile() || info.size > PORTRAIT_FILE_LIMIT) return undefined;
    return readFile(path);
  }
  /** Every portrait/reference/temporary file under the campaign's tree. Anything not matching the store's own patterns is ignored. */
  async listFiles(campaignId: string): Promise<readonly StoredPortraitFile[]> {
    const root = this.#campaignDir(campaignId), out: StoredPortraitFile[] = [];
    const tokens = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const t of tokens) {
      if (!t.isDirectory() || !TOKEN.test(t.name)) continue;
      for (const f of await readdir(join(root, t.name), { withFileTypes: true }).catch(() => [])) {
        if (!f.isFile() || !(FILE.test(f.name) || TEMP.test(f.name))) continue;
        const info = await stat(this.#inside(join(root, t.name, f.name))).catch(() => undefined);
        if (info) out.push(Object.freeze({ key: `${t.name}/${f.name}`, token: t.name, file: f.name, temporary: TEMP.test(f.name), mtime_ms: info.mtimeMs }));
      }
    }
    return Object.freeze(out.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  /** Remove one listed file by its key (orphan cleanup). Path rules as everywhere: inside this campaign's tree, store patterns only. */
  async removeListed(campaignId: string, key: string): Promise<boolean> {
    const [token, file, extra] = key.split("/");
    if (extra !== undefined || !token || !file || !TOKEN.test(token) || !(FILE.test(file) || TEMP.test(file))) return false;
    try { await rm(this.#inside(join(this.#campaignDir(campaignId), token, file)), { force: true }); return true; } catch { return false; }
  }
}
