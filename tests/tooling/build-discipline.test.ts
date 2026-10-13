import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

// Repository Cleanup A: `.build` is disposable compiled output. Every authoritative build, test run and benchmark starts from an empty `.build`,
// so a compiled test whose source was deleted can never be discovered by `node --test ".build/tests/**/*.test.js"`.
type Clean = { cleanBuild(root?: string): Promise<string>; REPOSITORY_ROOT: string };
const clean = (): Promise<Clean> => import(pathToFileURL(resolve("scripts", "clean.mjs")).href) as Promise<Clean>;
const exists = (path: string) => stat(path).then(() => true, () => false);
const scripts = async (): Promise<Record<string, string>> => (JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;

test("cleanBuild removes a stale compiled test under .build and nothing outside .build", async () => {
  const { cleanBuild } = await clean();
  const root = await mkdtemp(join(tmpdir(), "caldrevan-clean-"));
  try {
    const stale = join(root, ".build", "tests", "deleted-source.test.js");
    await mkdir(join(root, ".build", "tests"), { recursive: true }); await writeFile(stale, "throw new Error('stale compiled test');\n");
    await mkdir(join(root, "tests"), { recursive: true }); await writeFile(join(root, "tests", "kept.test.ts"), "// source\n");
    await mkdir(join(root, ".build-notes"), { recursive: true }); await writeFile(join(root, ".build-notes", "keep.txt"), "not build output\n");
    assert.equal(await cleanBuild(root), resolve(root, ".build"));
    assert.equal(await exists(stale), false);
    assert.equal(await exists(join(root, ".build")), false);
    assert.equal(await exists(join(root, "tests", "kept.test.ts")), true, "sources are untouched");
    assert.equal(await exists(join(root, ".build-notes", "keep.txt")), true, "only the directory named exactly .build is removed");
    await cleanBuild(root); // absent is fine (idempotent)
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the clean script resolves the repository root from its own location, never the shell or an absolute checkout path", async () => {
  const { REPOSITORY_ROOT } = await clean();
  assert.equal(REPOSITORY_ROOT, resolve("."));
  const source = await readFile(join("scripts", "clean.mjs"), "utf8");
  assert.doesNotMatch(source, /rm -rf|\/home\/|[A-Z]:\\\\/);
});

test("authoritative commands start from an empty .build exactly once (build cleans; test and the benchmark go through build; no lifecycle hooks)", async () => {
  const s = await scripts();
  assert.equal(s.clean, "node scripts/clean.mjs");
  assert.match(s.build!, /^node scripts\/clean\.mjs && tsc /);
  assert.match(s.test!, /^npm run build && node --test "\.build\/tests\/\*\*\/\*\.test\.js"$/);
  assert.match(s["benchmark:modern"]!, /^npm run build( --silent)? && /);
  assert.equal(s["check:architecture"], "node scripts/minor-debt-cycle-check.mjs");
  for (const hook of ["prebuild", "postbuild", "pretest", "posttest", "preclean"]) assert.equal(s[hook], undefined, `${hook} would clean or build twice`);
  // Every npm script that runs compiled output builds (and so cleans) first.
  for (const [name, command] of Object.entries(s)) if (/\.build\//.test(command)) assert.match(command, /^npm run build( --silent)? && /, name);
});

test("nothing under the runtime save root saves/ is tracked: committed evidence lives under docs/evaluations/ (REPO-1)", t => {
  let tracked: string;
  try { tracked = execFileSync("git", ["ls-files", "--", "saves"], { encoding: "utf8" }); } catch { t.skip("git is not available in this checkout"); return; }
  assert.equal(tracked.trim(), "", "a file under saves/ is tracked; move evidence to docs/evaluations/");
});
