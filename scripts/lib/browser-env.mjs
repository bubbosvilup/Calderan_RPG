// Shared, portable environment for the offline browser checks (scripts/*-browser-check.mjs). Every path is derived from this file's location,
// so a check runs from any checkout on Windows or Linux. Run `npm run build` first (the checks import the compiled `.build`).
//   PLAYWRIGHT_MODULE  optional: path (or bare specifier) of the Playwright package to load; default "playwright" (a local or global install)
//   CHROMIUM_PATH      optional: Chromium executable; default: Playwright's own managed browser
// Screenshots and other local output go to the gitignored `artifacts/local/browser/<check>/`.
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BUILD = join(ROOT, ".build");
export const DATA = join(ROOT, "data");

/** Imports a compiled module by its path inside `.build` (e.g. "src/ui/server.js"). */
export const fromBuild = relative => import(pathToFileURL(join(BUILD, relative)).href);

/** The gitignored output directory of one check, created on demand. */
export async function shotsDir(check) {
  const dir = join(ROOT, "artifacts", "local", "browser", check);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Playwright's `chromium`, loaded from PLAYWRIGHT_MODULE or the "playwright" package resolvable from this checkout. */
export async function chromium() {
  const spec = process.env.PLAYWRIGHT_MODULE;
  if (spec) {
    const loaded = isAbsolute(spec) ? await import(pathToFileURL(spec).href) : createRequire(join(ROOT, "package.json"))(spec);
    return (loaded.default ?? loaded).chromium;
  }
  return createRequire(join(ROOT, "package.json"))("playwright").chromium;
}

/** Launches Chromium headless; CHROMIUM_PATH overrides the executable. */
export async function launchBrowser() {
  const { CHROMIUM_PATH } = process.env;
  return (await chromium()).launch({ ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}), args: ["--no-sandbox"] });
}
