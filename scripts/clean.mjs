// `npm run clean`: removes the compiled output directory `.build` of this checkout, and nothing else. Cross-platform (Node only, no shell `rm`).
// `npm run build` runs it first, so every build, test run and benchmark starts from an empty `.build` and a deleted source file can never leave
// a stale compiled test behind for `node --test ".build/tests/**/*.test.js"` to discover.
import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Removes `<root>/.build` (recursively; absent is fine). Refuses any target whose last segment is not `.build` or that is not directly inside `root`. */
export async function cleanBuild(root = REPOSITORY_ROOT) {
  const target = resolve(root, ".build");
  if (basename(target) !== ".build" || dirname(target) !== resolve(root)) throw new Error(`refusing to clean ${target}`);
  await rm(target, { recursive: true, force: true, maxRetries: 3 });
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await cleanBuild();
