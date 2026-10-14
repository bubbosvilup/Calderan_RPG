// Runs every offline browser check, one at a time (they share nothing but the build), and exits non-zero when any fails.
//   node scripts/browser/run-browser-checks.mjs [name ...]     names are file prefixes, e.g. "react-ui2 keep-track"; none = all
// Needs `npm run build` and `npm run ui:build` first, and a Playwright Chromium (CI installs one; locally `npx playwright install chromium` or CHROMIUM_PATH).
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wanted = process.argv.slice(2);
const all = (await readdir(here)).filter(file => file.endsWith("-browser-check.mjs")).sort();
const chosen = wanted.length ? all.filter(file => wanted.some(name => file.startsWith(name))) : all;
if (!chosen.length) { console.error(`No browser check matches: ${wanted.join(", ")}`); process.exit(1); }

const run = file => new Promise(resolve => {
  const started = Date.now();
  const child = spawn(process.execPath, [join(here, file)], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  child.on("close", code => resolve({ file, code: code ?? 1, output, seconds: Math.round((Date.now() - started) / 1000) }));
});

const failed = [];
for (const file of chosen) {
  const result = await run(file);
  const summary = result.output.match(/(\d+)\/(\d+) checks passed/)?.[0] ?? "no summary";
  console.log(`${result.code === 0 ? "PASS" : "FAIL"} ${file} (${summary}, ${result.seconds}s)`);
  if (result.code !== 0) { failed.push(file); console.log(result.output.split("\n").map(line => `    ${line}`).join("\n")); }
}
console.log(`\n${chosen.length - failed.length}/${chosen.length} browser checks passed${failed.length ? `; failed: ${failed.join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
