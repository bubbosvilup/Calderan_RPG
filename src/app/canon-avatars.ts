import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

/**
 * Authored canonical NPC avatars: static project assets under `data/canonNPCAvatar/` (the single source of truth, served in place, never
 * copied). The registry is explicit and keyed by the stable authored character id; no path is ever built from a display name or any
 * request text. UI-only visual metadata: it is not campaign state, not in saves, and never reaches narrator/controller context or lore.
 * The filenames keep the author's spelling ("Bartholomew") while the canonical id stays "bartolomhew".
 */
export const CANON_AVATAR_FILES: Readonly<Record<string, string>> = Object.freeze({
  korvin: "Korvin_avatar.png",
  mistress_elara: "Elara_avatar.png",
  bartolomhew: "Bartholomew_avatar.png",
  blackthorn: "Blackthorn_avatar.png",
  captain_doran_hale: "DoranHale_avatar.png",
  brother_aven: "Aven_avatar.png",
});
export const CANON_AVATAR_DIR = resolve("data/canonNPCAvatar");
export const CANON_AVATAR_ROUTE = "/api/canon-avatar/";
/** The public URL token is an opaque hash, so a URL never reveals the authored id or name of a character Nicco has not identified. */
const tokenOf = (id: string) => createHash("sha256").update(`canon-avatar:${id}`).digest("hex").slice(0, 24);
const BY_TOKEN: ReadonlyMap<string, string> = new Map(Object.keys(CANON_AVATAR_FILES).map(id => [tokenOf(id), id]));
const fileFor = (id: string): string | undefined => Object.hasOwn(CANON_AVATAR_FILES, id) ? CANON_AVATAR_FILES[id] : undefined;

/** The same-origin URL for a registered canonical character whose asset file is present, else null (the passive placeholder stays). */
export function canonAvatarUrl(canonicalId: string, dir: string = CANON_AVATAR_DIR): string | null {
  const file = fileFor(canonicalId);
  return file && existsSync(join(dir, file)) ? `${CANON_AVATAR_ROUTE}${tokenOf(canonicalId)}` : null;
}
/** Bytes for a registered opaque token only (anything else, including ids, names and path-like text, is undefined). */
export async function readCanonAvatar(token: string, dir: string = CANON_AVATAR_DIR): Promise<Buffer | undefined> {
  const id = BY_TOKEN.get(token), file = id ? fileFor(id) : undefined;
  if (!file) return undefined;
  try { return await readFile(join(dir, file)); } catch { return undefined; }
}
/** Test/diagnostic helper: the public token for a registered id. */
export const canonAvatarToken = (canonicalId: string): string | undefined => fileFor(canonicalId) ? tokenOf(canonicalId) : undefined;
