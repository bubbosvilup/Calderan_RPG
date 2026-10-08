import * as fs from "node:fs/promises";
import { CampaignSaveError } from "./errors.js";
import { MAX_SAVE_BYTES } from "./strict-json.js";

export interface SaveFileInfo { kind: "file" | "directory" | "link" | "other"; size: number; links: number; mtime_ms?: number }
/** Narrow storage seam for tests; production uses Node built-ins. */
export interface SaveFileSystem {
  info(path: string): Promise<SaveFileInfo>;
  realpath(path: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  names(path: string): Promise<string[]>;
  read(path: string): Promise<string>;
  writeNew(path: string, text: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  syncDirectory(path: string): Promise<void>;
  /** Save/Load v1 transcript: append UTF-8 text to a (possibly new) regular file and flush it. */
  append(path: string, text: string): Promise<void>;
  /** Save/Load v1 transcript: the last `maxBytes` of a file (UTF-8, a partial first line is the caller's to drop). */
  readTail(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean }>;
  /** Save/Load v1 lock heartbeat: set a file's modification time to now. */
  touch(path: string): Promise<void>;
}
export const nodeSaveFileSystem: SaveFileSystem = {
  async info(path) { const s = await fs.lstat(path); return { kind: s.isSymbolicLink() ? "link" : s.isFile() ? "file" : s.isDirectory() ? "directory" : "other", size: s.size, links: s.nlink, mtime_ms: s.mtimeMs }; },
  realpath: fs.realpath,
  async mkdir(path) { await fs.mkdir(path); },
  names: fs.readdir,
  async read(path) {
    const handle = await fs.open(path, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink > 1) throw new CampaignSaveError("unsafe_path");
      if (stat.size > MAX_SAVE_BYTES) throw new CampaignSaveError("invalid_save");
      // Bound reads even if a file grows after stat. Never load arbitrary-sized input.
      const buffer = Buffer.alloc(Math.min(MAX_SAVE_BYTES + 1, Math.max(stat.size + 1, 4096)));
      const chunks: Buffer[] = []; let size = 0;
      while (size <= MAX_SAVE_BYTES) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, MAX_SAVE_BYTES + 1 - size), null);
        if (bytesRead === 0) break;
        chunks.push(Buffer.from(buffer.subarray(0, bytesRead))); size += bytesRead;
      }
      if (size > MAX_SAVE_BYTES) throw new CampaignSaveError("invalid_save");
      try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
      catch { throw new CampaignSaveError("invalid_json"); }
    } finally { await handle.close(); }
  },
  async writeNew(path, text) {
    const handle = await fs.open(path, "wx", 0o600);
    try { await handle.writeFile(text, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
  },
  rename: fs.rename,
  unlink: fs.unlink,
  async syncDirectory(path) {
    // Node cannot portably open/fsync directories on Windows. File data is still flushed.
    if (process.platform === "win32") return;
    const handle = await fs.open(path, "r");
    try { await handle.sync(); } finally { await handle.close(); }
  },
  async append(path, text) {
    const handle = await fs.open(path, "a", 0o600);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink > 1) throw new CampaignSaveError("unsafe_path");
      await handle.appendFile(text, "utf8"); await handle.sync();
    } finally { await handle.close(); }
  },
  async touch(path) { const now = new Date(); await fs.utimes(path, now, now); },
  async readTail(path, maxBytes) {
    const handle = await fs.open(path, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink > 1) throw new CampaignSaveError("unsafe_path");
      const start = Math.max(0, stat.size - maxBytes), length = stat.size - start, buffer = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) { const { bytesRead } = await handle.read(buffer, offset, length - offset, start + offset); if (!bytesRead) break; offset += bytesRead; }
      return { text: buffer.subarray(0, offset).toString("utf8"), truncated: start > 0 };
    } finally { await handle.close(); }
  },
};
