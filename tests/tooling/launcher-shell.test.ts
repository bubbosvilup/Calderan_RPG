import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, symlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alive, freePort, makeStubRoot, until } from "../support/launcher-fixtures.js";

// The Linux / macOS entry points of the one-click launcher: caldrevan.sh and setup.sh. They share scripts/launcher/*.mjs with the Windows batch files.
const read = (...parts: string[]) => readFile(join(...parts), "utf8");
const posix = process.platform !== "win32";

test("caldrevan.sh delegates to the launcher: own folder, quoted paths, node check, no destructive command, LF, executable", async () => {
  const text = await read("caldrevan.sh");
  assert.ok(text.startsWith("#!/usr/bin/env bash\n"), "bash shebang");
  assert.ok(!text.includes("\r"), "LF line endings only");
  assert.ok(/^[\x00-\x7f]*$/.test(text), "ASCII only");
  assert.match(text, /^set -u$/m);
  assert.match(text, /readlink -f/, "works through a symlink or a desktop entry");
  assert.match(text, /cd -- "\$here"/, "works from its own folder, whatever the caller's working directory");
  assert.match(text, /command -v node/);
  assert.match(text, /nodejs\.org/, "tells the user where to get Node");
  assert.match(text, /exec node "\$here\/scripts\/launcher\/main\.mjs" --detach$/m, "quoted path, detached so no terminal stays occupied");
  assert.doesNotMatch(text, /\$\*|\$@|\beval\b|\bsudo\b|\brm\b|\bmv\b|\bchmod\b|\bcurl\b|\bwget\b|\bnpm\b/, "no argument forwarding, no destructive, privileged or network command, no install");
  if (posix) assert.ok(((await stat("caldrevan.sh")).mode & 0o111) !== 0, "executable bit");
});

test("setup.sh runs npm ci, npm run build, npm run ui:build in order, stops at the first failure, and touches nothing else", async () => {
  const text = await read("setup.sh");
  assert.ok(text.startsWith("#!/usr/bin/env bash\n") && !text.includes("\r") && /^[\x00-\x7f]*$/.test(text));
  assert.match(text, /^set -u$/m);
  assert.match(text, /cd -- "\$here"/);
  const steps = [...text.matchAll(/^step (\d) "([^"]+)" (npm[^\n]*)$/gm)].map(m => `${m[1]}:${m[3]}`);
  assert.deepEqual(steps, ["1:npm ci", "2:npm run build", "3:npm run ui:build"]);
  assert.match(text, /\|\| \{[^}]*exit 1; \}/, "a failing step ends the script");
  const code = text.split("\n").filter(l => !l.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(code, /\beval\b|\bsudo\b|\brm\b|\bmv\b|\bcp\b|\bsaves\b|\.env|\bexport\b|OPENROUTER|HF_TOKEN/);
  if (posix) assert.ok(((await stat("setup.sh")).mode & 0o111) !== 0, "executable bit");
});

test(".gitattributes keeps shell scripts LF and batch files CRLF", async () => {
  const text = await read(".gitattributes");
  assert.match(text, /^\*\.sh text eol=lf$/m);
  assert.match(text, /^\*\.cmd text eol=crlf$/m);
});

test("caldrevan.sh --print-desktop-entry prints a desktop file for the checkout and starts nothing", { skip: !posix }, () => {
  const run = spawnSync("bash", ["caldrevan.sh", "--print-desktop-entry"], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^\[Desktop Entry\]\nType=Application\n/);
  assert.match(run.stdout, new RegExp(`Exec="${process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/caldrevan\\.sh"`));
  assert.notEqual(spawnSync("bash", ["caldrevan.sh", "--bogus"], { encoding: "utf8" }).status, 0, "unknown arguments are refused, never forwarded");
});

test("caldrevan.sh starts the launcher from a symlink in another folder, in a path with a space and an accent, and the launcher stops the stub game safely", { skip: !posix }, async t => {
  const root = await makeStubRoot();
  const elsewhere = await mkdtemp(join(tmpdir(), "caldrevan where é "));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(elsewhere, { recursive: true, force: true }); });
  await cp("caldrevan.sh", join(root, "caldrevan.sh"));
  await mkdir(join(root, "scripts"), { recursive: true });
  await cp(join("scripts", "launcher"), join(root, "scripts", "launcher"), { recursive: true });
  spawnSync("chmod", ["+x", join(root, "caldrevan.sh")]);
  const link = join(elsewhere, "play-caldrevan");
  await symlink(join(root, "caldrevan.sh"), link);
  const launcherPort = await freePort(), gamePort = await freePort();
  const env = { ...process.env, CALDREVAN_LAUNCHER_PORT: String(launcherPort), CALDREVAN_GAME_PORT: String(gamePort), PATH: process.env.PATH ?? "", DISPLAY: "", WAYLAND_DISPLAY: "", OPENROUTER_API_KEY: "" };
  const started = spawnSync(link, [], { cwd: elsewhere, encoding: "utf8", env });
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, new RegExp(`Caldrevan Launcher: http://127\\.0\\.0\\.1:${launcherPort}/`));
  const base = `http://127.0.0.1:${launcherPort}`;
  const token = /name="launcher-token" content="([^"]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1] ?? "";
  assert.ok(token, "the page carries the per-run token");
  const call = async (path: string, post = false) => (await fetch(base + path, { method: post ? "POST" : "GET", headers: { "X-Launcher-Token": token, ...(post ? { "Content-Type": "application/json", Origin: base } : {}) }, ...(post ? { body: "{}" } : {}) })).json() as Promise<{ state: string; pid: number | null; url: string | null }>;
  try {
    assert.equal((await call("/api/status")).state, "stopped", "launching starts no game");
    await call("/api/play", true);
    let status = await call("/api/status");
    await until(async () => (status = await call("/api/status")).state === "ready", "the stub game to become ready");
    assert.equal(status.url, `http://127.0.0.1:${gamePort}/app/`);
    const pid = status.pid!;
    await call("/api/stop", true);
    await until(async () => (await call("/api/status")).state === "stopped", "the stub game to stop");
    await until(() => !alive(pid), "the game process to exit");
    assert.deepEqual((await readdir(join(root, "saves", "campaigns", "c1"))).sort(), ["campaign.json"], "saves untouched");
  } finally {
    await call("/api/exit", true).catch(() => undefined);
  }
});
