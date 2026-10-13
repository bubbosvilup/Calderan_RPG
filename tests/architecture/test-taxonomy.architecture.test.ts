import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/**
 * Test taxonomy (Repository Cleanup F). Current executable tests live in one domain folder each and are named for the behavior or contract
 * they protect, never for the milestone that introduced them. Frozen oracles (tests/frozen/), fixtures (tests/fixtures/) and runnable
 * historical tools (tests/support/historical/) keep their historical names: those names are part of what they preserve.
 * Reads tracked and untracked file names only (a new test is checked before it is committed).
 */
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "tests"], { encoding: "utf8" }).split("\n").filter(f => f && existsSync(f));
const tests = files.filter(f => f.endsWith(".test.ts"));
const HISTORICAL = /^tests\/(?:frozen|fixtures|support\/historical)\//;

/** Domain folders of current executable tests. A new folder is a deliberate taxonomy change: add it here and to docs/TESTING.md. */
const DOMAINS = new Set(["architecture", "authority", "canon", "commerce", "context", "identity", "images", "items", "language", "movement",
  "npc-plus", "optional", "persistence", "providers", "reflection", "retrieval", "session", "tooling", "turn", "ui", "world"]);
/** Milestone vocabulary that must not name a current executable test. */
const MILESTONE = /(?:^|[-_.])(?:block-?\d|pass-?\d|phase-?\d|p\d{1,3}(?=[-_.])|consolidation(?:-block)?|hotfix|wave-?\d|milestone|cleanup-[a-z]\b)/i;

test("taxonomy: every current executable test lives in exactly one known domain folder", () => {
  assert.ok(tests.length > 200);
  const misplaced = tests.filter(f => !HISTORICAL.test(f)).filter(f => { const parts = f.split("/"); return parts.length !== 3 || !DOMAINS.has(parts[1]!); });
  assert.deepEqual(misplaced, [], "a test sits at the tests/ root, in a nested folder or in an unknown folder");
  assert.deepEqual(tests.filter(f => HISTORICAL.test(f)), [], "frozen, fixture and historical-support folders hold no executable test");
});

test("taxonomy: no current executable test is named for a milestone (block, pass, phase, pNN, consolidation, hotfix, wave)", () => {
  assert.equal(MILESTONE.test("block5b-auth2.test.ts"), true);
  assert.equal(MILESTONE.test("p31-identity-gating.test.ts"), true);
  assert.equal(MILESTONE.test("npc-plus-pass-10-architecture.test.ts"), true);
  assert.equal(MILESTONE.test("canonical-identity-gating.test.ts"), false);
  assert.equal(MILESTONE.test("passive-perception.test.ts"), false);
  assert.deepEqual(tests.map(f => f.split("/").pop()!).filter(n => MILESTONE.test(n)), []);
});

test("taxonomy: the type suffixes are used as defined (.architecture only under architecture/, never two suffixes)", () => {
  const SUFFIX = /\.(integration|regression|architecture)\.test\.ts$/;
  for (const f of tests) {
    const name = f.split("/").pop()!, suffix = SUFFIX.exec(name)?.[1];
    assert.equal(f.startsWith("tests/architecture/"), suffix === "architecture", `${f}: structural guards and only they live under tests/architecture/ as *.architecture.test.ts`);
    assert.doesNotMatch(name.replace(SUFFIX, ""), /\.(?:integration|regression|architecture|unit|spec)$/, `${f}: one suffix at most`);
  }
});

test("taxonomy: non-test modules live in support, fixtures or frozen; none at the tests/ root", () => {
  const helpers = files.filter(f => /\.(?:ts|mts|js|mjs)$/.test(f) && !f.endsWith(".test.ts"));
  const loose = helpers.filter(f => !/^tests\/(?:support|fixtures|frozen|benchmark|retrieval-eval)\//.test(f));
  assert.deepEqual(loose, [], "a helper module sits outside tests/support/ (or the fixture, frozen, benchmark and retrieval-eval folders)");
  const current = helpers.filter(f => f.startsWith("tests/support/") && !HISTORICAL.test(f)).map(f => f.split("/").pop()!);
  assert.deepEqual(current.filter(n => MILESTONE.test(n)), [], "a current support module is named for a milestone");
});

test("taxonomy: npm test discovers every folder (recursive glob) and the build compiles every test", () => {
  const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  assert.match(scripts.test!, /node --test "\.build\/tests\/\*\*\/\*\.test\.js"/);
  const include = (JSON.parse(readFileSync("tsconfig.json", "utf8")) as { include: string[] }).include;
  assert.ok(include.includes("tests/**/*.ts"));
});
