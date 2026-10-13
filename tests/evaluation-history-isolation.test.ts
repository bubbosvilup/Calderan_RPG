import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Historical evidence is not an executable dependency (Repository Cleanup B2, REPO-3). Production code, tests and active tools never use the
 * evaluations namespace as an input or output path: executable fixtures live under tests/fixtures/, local output under artifacts/local/.
 * Only the historical reproduction tools in HISTORICAL_TOOLS may read (and the D09 harnesses write) recorded evidence there. Comments that
 * cite a report are text, not paths, and are allowed. Deterministic, no model calls.
 */
const HISTORY = ["docs", "evaluations"].join("/");
const HISTORICAL_TOOLS: readonly { file: RegExp; why: string }[] = [
  { file: /^src\/dev\/historical\/eval-evidence\.ts$/, why: "Phase 1O evidence evaluation: re-scores the recorded Phase 1M/1N runs in the archive" },
  { file: /^src\/dev\/historical\/shadow-evidence\.ts$/, why: "Phase 1N shadow-evidence experiment: re-scores the recorded Phase 1M runs in the archive" },
  { file: /^scripts\/historical\/d09-[\w-]+\.mjs$/, why: "D09 reflection harnesses: run, resume and analyze the recorded D09 evidence directories" },
  { file: /^scripts\/historical\/minor-debt-controller-audit\.mjs$/, why: "audits the controller receipts recorded in the D09 evidence" },
];
/** A string literal that starts with the history path, possibly relative, or a join("docs", "evaluations", ...) call. */
const PATH_USE = new RegExp(String.raw`(["'\x60])(?:\.\.?/)*docs/evaluations|join\(\s*(["'])docs\2\s*,\s*(["'])evaluations\3`);
const COMMENT = /^\s*(?:\/\/|\*|\/\*)/;
const tracked = execFileSync("git", ["ls-files", "-z", "--", "src", "tests", "scripts"], { encoding: "utf8" }).split("\0")
  .filter(f => /\.(?:ts|mts|js|mjs|cjs)$/.test(f) && !f.startsWith("tests/fixtures/"));
const uses = (file: string) => readFileSync(file, "utf8").split("\n").flatMap((line, i) => !COMMENT.test(line) && PATH_USE.test(line) ? [`${file}:${i + 1}`] : []);

test("evaluation history: no production code, test or active tool uses the evaluations namespace as a path", () => {
  const offenders = tracked.filter(f => !HISTORICAL_TOOLS.some(h => h.file.test(f))).flatMap(uses);
  assert.deepEqual(offenders, [], `executable fixtures belong in tests/fixtures/ and local output in artifacts/local/, not ${HISTORY}/`);
});
test("evaluation history: production code outside src/dev does not even name the evaluations namespace in code", () => {
  const production = tracked.filter(f => f.startsWith("src/") && !f.startsWith("src/dev/"));
  assert.ok(production.length > 100);
  assert.deepEqual(production.filter(f => readFileSync(f, "utf8").split("\n").some(l => !COMMENT.test(l) && l.includes(HISTORY))), []);
});
test("evaluation history: the historical-tool allowlist stays tiny and every entry still needs its exception", () => {
  assert.ok(HISTORICAL_TOOLS.length <= 4);
  for (const h of HISTORICAL_TOOLS) assert.ok(tracked.filter(f => h.file.test(f)).some(f => uses(f).length > 0), `stale allowlist entry ${h.file} (${h.why})`);
});
test("evaluation history: every fixture copied from historical evidence is byte-identical to its recorded hash", () => {
  const manifest = JSON.parse(readFileSync("tests/fixtures/provenance.json", "utf8")) as { fixtures: { path: string; source: string; sha256: string }[] };
  assert.ok(manifest.fixtures.length >= 10);
  for (const f of manifest.fixtures) assert.equal(createHash("sha256").update(readFileSync(`tests/fixtures/${f.path}`)).digest("hex"), f.sha256, `${f.path} changed; record a new hash and the reason`);
});
