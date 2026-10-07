import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/**
 * Portrait Image Generation V1: local, campaign-specific portrait files (never inside a save's JSON). Layout:
 *   <root>/<campaign_id>/<character token>/<portrait_… | reference_…>.<png|jpg|webp>
 * The character token is a hash, so no character ID or name appears on disk paths; file names are store-generated tokens validated
 * by pattern, and every resolved path must stay inside the root. Nothing here is reachable by a browser-supplied path.
 */
const CAMPAIGN = /^[a-z0-9][a-z0-9_-]{0,119}$/;
const FILE = /^(?:portrait|reference)_[a-z0-9_]{1,80}\.(?:png|jpg|webp)$/;
export const PORTRAIT_FILE_LIMIT = 15 * 1024 * 1024;
export const extensionFor = (media: string) => media === "image/png" ? "png" : media === "image/jpeg" ? "jpg" : media === "image/webp" ? "webp" : undefined;

export class PortraitAssetStore {
  readonly #root: string;
  constructor(root: string) { this.#root = resolve(root); }
  #dir(campaignId: string, characterId: string): string {
    if (!CAMPAIGN.test(campaignId)) throw new Error("invalid campaign id for portrait storage");
    const token = createHash("sha256").update(`portrait-store:${campaignId}:${characterId}`).digest("hex").slice(0, 24);
    return this.#inside(join(this.#root, campaignId, token));
  }
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
  async remove(campaignId: string, characterId: string, file: string): Promise<void> { await rm(this.#file(campaignId, characterId, file), { force: true }).catch(() => undefined); }
  async read(campaignId: string, characterId: string, file: string): Promise<Buffer | undefined> {
    const path = this.#file(campaignId, characterId, file);
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile() || info.size > PORTRAIT_FILE_LIMIT) return undefined;
    return readFile(path);
  }
}
