import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Portable paths for source-level audits. Node's `path` functions return native separators (`\` on Windows), while every audit pattern and
 * expected list in the test suite is written in POSIX form (`src/turn/narration-facts/`). Audits normalize with these helpers BEFORE
 * matching or comparing, so the same audit sees the same paths on every platform. `fs` accepts POSIX separators on Windows too, so a
 * normalized path can still be read.
 */

/** The path with every `\` turned into `/`. POSIX paths are returned unchanged. */
export const toPosixPath = (path: string): string => path.replace(/\\/g, "/");

/** Every file under `dir` (recursively) that `accept` keeps, as POSIX paths relative to the working directory, sorted. Default: `.ts` files. */
export function sourceFiles(dir: string, accept: (path: string) => boolean = path => path.endsWith(".ts")): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const name of readdirSync(d)) { const p = join(d, name); if (statSync(p).isDirectory()) walk(p); else if (accept(toPosixPath(p))) out.push(toPosixPath(p)); } };
  walk(dir);
  return out.sort();
}
