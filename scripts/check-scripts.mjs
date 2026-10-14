// Syntax check for every script under scripts/ (B2, TEST trust): `node --check` on each .mjs/.js file, so a broken browser check or tool fails
// fast instead of on its first manual run. Portable (Linux, Windows); read-only; never runs a script.
//   node scripts/check-scripts.mjs     exit 1 when any script fails to parse
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) files.push(p); } };
walk(join(ROOT, "scripts"));
const failed = [];
for (const f of files.sort()) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { failed.push(relative(ROOT, f)); process.stderr.write(`${relative(ROOT, f)}\n${e.stderr?.toString() ?? e.message}\n`); }
}
console.log(`${files.length} scripts, ${failed.length} with syntax errors`);
process.exitCode = failed.length ? 1 : 0;
