import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { sourceFiles, toPosixPath } from "../support/source-paths.js";

/**
 * The source audits (narration-facts consumers, movement and commerce single-source audits, the manumission entry-point audit, the dev-tooling
 * and React client boundaries, the import graph) match POSIX path patterns. These cases pin the normalization with fixed Windows-style and
 * POSIX-style inputs built by `path.win32` / `path.posix`, so they check both syntaxes on any host OS.
 */
const segments = ["src", "turn", "narration-facts", "location-forms.ts"];

test("toPosixPath: Windows syntax becomes POSIX; POSIX syntax is unchanged; normalization is idempotent", () => {
  assert.equal(win32.join(...segments), "src\\turn\\narration-facts\\location-forms.ts");
  assert.equal(toPosixPath(win32.join(...segments)), "src/turn/narration-facts/location-forms.ts");
  assert.equal(toPosixPath(posix.join(...segments)), posix.join(...segments));
  assert.equal(toPosixPath("src\\turn/narration-facts\\types.ts"), "src/turn/narration-facts/types.ts", "mixed separators");
  assert.equal(toPosixPath(toPosixPath(win32.join(...segments))), "src/turn/narration-facts/location-forms.ts");
  assert.equal(toPosixPath(win32.relative("C:\\repo", "C:\\repo\\src\\dev\\play.ts")), "src/dev/play.ts");
});

test("the audit path filters classify Windows-style and POSIX-style inputs identically once normalized (and a raw Windows path would not)", () => {
  // The exact filters the audits apply: the fact layer and src/dev are excluded from the runtime set.
  const runtime = (p: string) => !p.includes("narration-facts/") && !p.startsWith("src/dev");
  const fixtures: readonly (readonly string[])[] = [
    ["src", "turn", "narration-facts", "location-forms.ts"],
    ["src", "turn", "narration-facts", "index.ts"],
    ["src", "dev", "live", "keep-track-live.ts"],
    ["src", "turn", "movement", "movement-evidence.ts"],
    ["src", "turn", "commerce", "commerce-evidence.ts"],
  ];
  const expected = [false, false, false, true, true];
  assert.deepEqual(fixtures.map(f => runtime(toPosixPath(win32.join(...f)))), expected);
  assert.deepEqual(fixtures.map(f => runtime(toPosixPath(posix.join(...f)))), expected);
  // The defect these helpers close: matched raw, a Windows path slips through the fact-layer exclusion.
  assert.equal(runtime(win32.join(...fixtures[0]!)), true);
});

test("sourceFiles: repository-relative POSIX paths, sorted, readable, filtered by the predicate", () => {
  const files = sourceFiles("src/turn/narration-facts");
  assert.ok(files.length > 5);
  assert.ok(files.includes("src/turn/narration-facts/location-forms.ts"));
  assert.ok(files.every(f => f.startsWith("src/turn/narration-facts/") && !f.includes("\\") && f.endsWith(".ts") && existsSync(f)));
  assert.deepEqual(files, [...files].sort());
  const everything = sourceFiles("src/ui", () => true);
  assert.ok(everything.includes("src/ui/client.js") && everything.includes("src/ui/style.css"), "a custom predicate keeps non-.ts files");
});
