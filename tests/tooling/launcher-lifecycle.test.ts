import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type SpawnOptions } from "node:child_process";
import { createHash } from "node:crypto";
import net from "node:net";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { alive, freePort, loadCore, makeStubRoot, until, type Launcher } from "../support/launcher-fixtures.js";

// The one-click launcher core (scripts/launcher/core.mjs) against a stub game in a temporary repository layout. Offline, loopback only, no real game.
type SpawnCall = { cmd: string; args: string[]; options: SpawnOptions };
async function harness(options: { mode?: string; root?: string; env?: Record<string, string | undefined>; port?: number; timeoutMs?: number; graceMs?: number; nodeVersion?: string } = {}) {
  const { createLauncher } = await loadCore();
  const root = options.root ?? await makeStubRoot();
  const port = options.port ?? await freePort();
  const env = { ...process.env, CALDREVAN_STUB: options.mode ?? "ok", ...options.env };
  const spawned: SpawnCall[] = [], opened: string[] = [];
  const launcher: Launcher = createLauncher({
    root, ports: { game: port }, env, pollMs: 15, startupTimeoutMs: options.timeoutMs ?? 20_000, stopGraceMs: options.graceMs ?? 10_000, killWaitMs: 5_000,
    ...(options.nodeVersion ? { nodeVersion: options.nodeVersion } : {}),
    spawn: (cmd, args, spawnOptions) => { spawned.push({ cmd, args, options: spawnOptions }); return spawn(cmd, args, spawnOptions); },
    openBrowser: url => { opened.push(url); },
  });
  const cleanup = async () => { await launcher.stop(); launcher.killNow(); await rm(root, { recursive: true, force: true }); };
  return { launcher, root, port, env, spawned, opened, cleanup };
}
const logText = (l: Launcher) => l.logs(500).lines.join("\n");

test("launcher: initial status is Stopped and nothing has been started", async () => {
  const h = await harness();
  try {
    assert.equal(h.launcher.snapshot().state, "stopped");
    assert.equal(h.launcher.snapshot().label, "Stopped");
    assert.equal(h.spawned.length, 0);
  } finally { await h.cleanup(); }
});

test("launcher: PLAY spawns node with an argument array in the repo root (a path with a space and a non-ASCII letter) and is Ready only once the health endpoint answers; the browser opens once, afterwards, on /app/", async () => {
  const h = await harness({ mode: "late" });
  try {
    assert.match(h.root, / .*é/);
    await h.launcher.play();
    await until(() => logText(h.launcher).includes("waiting for go-healthy"), "the stub to start");
    assert.equal(h.launcher.snapshot().state, "starting", "the process runs but is not healthy yet");
    assert.deepEqual(h.opened, []);
    assert.equal(h.spawned.length, 1);
    const call = h.spawned[0]!;
    assert.equal(call.cmd, process.execPath);
    assert.ok(Array.isArray(call.args));
    assert.deepEqual(call.args, [join(h.root, ".build", "src", "ui", "play.js"), `--port=${h.port}`, "--control-stdin"]);
    assert.equal(call.options.cwd, h.root);
    assert.ok(!call.options.shell, "never a shell");
    await writeFile(join(h.root, "go-healthy"), "");
    const ready = await h.launcher.settled();
    assert.equal(ready.state, "ready");
    assert.equal(ready.url, `http://127.0.0.1:${h.port}/app/`);
    assert.deepEqual(h.opened, [`http://127.0.0.1:${h.port}/app/`]);
    assert.match(logText(h.launcher), /stub argv \["--port=\d+","--control-stdin"\] cwd .*é/, "the game really ran in the repo root");
  } finally { await h.cleanup(); }
});

test("launcher: repeated PLAY is idempotent (one child, one browser open)", async () => {
  const h = await harness();
  try {
    await Promise.all([h.launcher.play(), h.launcher.play(), h.launcher.play()]);
    assert.equal((await h.launcher.settled()).state, "ready");
    await h.launcher.play();
    assert.equal(h.spawned.length, 1);
    assert.equal(h.opened.length, 1);
    assert.equal(h.launcher.snapshot().state, "ready");
  } finally { await h.cleanup(); }
});

test("launcher: STOP ends only the child it spawned, logs the exit code, and returns to Stopped; a later PLAY works", async () => {
  const bystander = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const h = await harness();
  try {
    await h.launcher.play(); await h.launcher.settled();
    const pid = h.launcher.snapshot().pid!;
    assert.ok(pid > 0 && alive(pid));
    const stopped = await h.launcher.stop();
    assert.equal(stopped.state, "stopped");
    assert.equal(alive(pid), false, "the owned child is gone");
    assert.equal(alive(bystander.pid!), true, "no other process is touched");
    assert.match(logText(h.launcher), /stub: stop received/);
    assert.match(logText(h.launcher), /Game process exited with code 0/);
    await h.launcher.play();
    assert.equal((await h.launcher.settled()).state, "ready");
  } finally { bystander.kill(); await h.cleanup(); }
});

test("launcher: a game that ignores the graceful stop is killed after the bounded wait, with a clear log line", async () => {
  const h = await harness({ mode: "ignore-stop", graceMs: 250 });
  try {
    await h.launcher.play(); await h.launcher.settled();
    const pid = h.launcher.snapshot().pid!;
    assert.equal((await h.launcher.stop()).state, "stopped");
    assert.equal(alive(pid), false);
    assert.match(logText(h.launcher), /WARNING: the game did not stop within .*killing process/);
  } finally { await h.cleanup(); }
});

test("launcher: an unexpected exit of the running game is an Error with the reason, and a startup crash fails early with the last output", async () => {
  const h = await harness();
  try {
    await h.launcher.play(); await h.launcher.settled();
    await writeFile(join(h.root, "crash-now"), "");
    await until(() => h.launcher.snapshot().state === "error", "the unexpected exit to be noticed");
    const e = h.launcher.snapshot().error!;
    assert.match(e.title, /stopped unexpectedly/);
    assert.match(e.detail, /exited with code 5/);
    await rm(join(h.root, "crash-now"));
  } finally { await h.cleanup(); }
  const c = await harness({ mode: "crash", timeoutMs: 600_000 });
  try {
    await c.launcher.play();
    const failed = await c.launcher.settled();
    assert.equal(failed.state, "error");
    assert.match(failed.error!.title, /stopped while starting/);
    assert.match(failed.error!.detail, /code 3/);
    assert.ok(failed.error!.lastLines.some(l => l.includes("fatal error while starting")));
    assert.equal(c.opened.length, 0);
  } finally { await c.cleanup(); }
});

test("launcher: a game that never becomes healthy ends in Error and the child is killed; the next PLAY works", async () => {
  const h = await harness({ mode: "never", timeoutMs: 400, graceMs: 200 });
  try {
    await h.launcher.play();
    const failed = await h.launcher.settled();
    assert.equal(failed.state, "error");
    assert.match(failed.error!.title, /did not become ready/);
    assert.match(failed.error!.detail, new RegExp(String(h.port)));
    assert.equal(h.opened.length, 0);
    const first = h.spawned.length;
    assert.equal(first, 1);
    h.env.CALDREVAN_STUB = "ok"; // a later PLAY starts a fresh child with the same launcher
    await h.launcher.play();
    const ready = await h.launcher.settled();
    assert.equal(ready.state, "ready");
    assert.equal(h.spawned.length, 2);
    await h.launcher.stop();
  } finally { await h.cleanup(); }
});

test("launcher: an occupied game port is a useful Error naming the port, and no game is started", async () => {
  const port = await freePort();
  const blocker = net.createServer(); await new Promise<void>(r => blocker.listen(port, "127.0.0.1", () => r()));
  const h = await harness({ port });
  try {
    await h.launcher.play();
    const failed = await h.launcher.settled();
    assert.equal(failed.state, "error");
    assert.ok(failed.error!.title.includes(String(port)));
    assert.match(failed.error!.detail, /in use by another program/);
    assert.match(failed.error!.fix ?? "", /Close that program.*CALDREVAN_GAME_PORT/);
    assert.equal(h.spawned.length, 0);
  } finally { blocker.close(); await h.cleanup(); }
});

test("launcher: missing node_modules, build output or UI build, or an old Node, are Errors that say how to fix it (setup.cmd) and start nothing", async () => {
  const cases: { name: string; root: () => Promise<string>; nodeVersion?: string; expect: RegExp }[] = [
    { name: "node_modules", root: () => makeStubRoot({ withNodeModules: false }), expect: /node_modules/ },
    { name: ".build", root: () => makeStubRoot({ withBuild: false }), expect: /\.build\/src\/ui\/play\.js/ },
    { name: "dist", root: () => makeStubRoot({ withDist: false }), expect: /dist\/ui-client\/index\.html/ },
    { name: "old node", root: () => makeStubRoot(), nodeVersion: "20.11.0", expect: /Node 20\.11\.0 is too old.*>=22/ },
  ];
  for (const c of cases) {
    const h = await harness({ root: await c.root(), ...(c.nodeVersion ? { nodeVersion: c.nodeVersion } : {}) });
    try {
      await h.launcher.play();
      const failed = await h.launcher.settled();
      assert.equal(failed.state, "error", c.name);
      assert.match(failed.error!.detail, c.expect, c.name);
      assert.match(failed.error!.fix ?? "", /setup\.cmd/, c.name);
      assert.match(failed.error!.fix ?? "", /npm ci && npm run build && npm run ui:build/, c.name);
      assert.equal(h.spawned.length, 0, c.name);
    } finally { await h.cleanup(); }
  }
});

test("launcher: reads the required Node range from package.json at runtime", async () => {
  const { parseMinNode, versionAtLeast } = await loadCore();
  assert.deepEqual(parseMinNode(">=22"), [22, 0, 0]);
  assert.deepEqual(parseMinNode(">=22.3.1"), [22, 3, 1]);
  assert.equal(parseMinNode("^22"), null);
  assert.equal(versionAtLeast("22.0.0", [22, 0, 0]), true);
  assert.equal(versionAtLeast("21.9.9", [22, 0, 0]), false);
  assert.equal(versionAtLeast("v24.1.0", [22, 3, 1]), true);
  const h = await harness({ root: await makeStubRoot({ node: ">=99" }) });
  try { await h.launcher.play(); const failed = await h.launcher.settled(); assert.match(failed.error!.detail, /needs Node >=99/); } finally { await h.cleanup(); }
});

test("launcher: only loopback sockets are opened", async () => {
  const targets: string[] = [];
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const first = args[0];
    targets.push(typeof first === "object" && first !== null ? String((first as { host?: string }).host ?? "localhost") : String(typeof args[1] === "string" ? args[1] : "localhost"));
    return (original as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof original;
  const h = await harness();
  try {
    await h.launcher.play(); await h.launcher.settled(); await h.launcher.stop();
    assert.ok(targets.length > 0, "the health poll connected");
    assert.deepEqual([...new Set(targets)].filter(t => t !== "127.0.0.1" && t !== "localhost"), []);
  } finally { net.Socket.prototype.connect = original; await h.cleanup(); }
});

test("launcher: a secret passed in the environment and printed by the game never reaches the log buffer, the log file or a status", async () => {
  const secret = "sk-or-v1-TESTSECRETVALUE0123456789";
  const hf = "hf_ABCDEFGHIJKLMNOP1234";
  const h = await harness({ env: { OPENROUTER_API_KEY: secret, HF_TOKEN: hf } });
  try {
    await h.launcher.play(); await h.launcher.settled(); await h.launcher.stop();
    const file = await readFile(h.launcher.logs().file, "utf8");
    const everything = [logText(h.launcher), file, JSON.stringify(h.launcher.snapshot()), JSON.stringify(h.launcher.logs(500))].join("\n");
    assert.ok(everything.includes("provider key is [redacted]"), "the game printed the key and it was redacted");
    for (const s of [secret, hf, "TESTSECRETVALUE", "sk-abcdefghijklmnopqrstuv"]) assert.ok(!everything.includes(s), `leaked ${s}`);
    assert.match(everything, /Bearer \[redacted\]/);
  } finally { await h.cleanup(); }
  const { createRedactor } = await loadCore();
  const redact = createRedactor({ OPENROUTER_API_KEY: "plain-key-value-123", PATH: "/usr/bin" });
  assert.equal(redact("x plain-key-value-123 y"), "x [redacted] y");
  assert.equal(redact("VOYAGE_API_KEY=abc123 next"), "VOYAGE_API_KEY=[redacted] next");
  assert.equal(redact("PATH is /usr/bin"), "PATH is /usr/bin");
});

async function treeHash(dir: string): Promise<string> {
  const hash = createHash("sha256");
  const walk = async (d: string): Promise<void> => {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name); hash.update(p);
      if (e.isDirectory()) await walk(p); else hash.update(await readFile(p)).update(String((await stat(p)).mtimeMs));
    }
  };
  await walk(dir);
  return hash.digest("hex");
}
test("launcher: never touches saves/ across start, stop, crash and failure", async () => {
  const h = await harness();
  try {
    const before = await treeHash(join(h.root, "saves"));
    await h.launcher.play(); await h.launcher.settled(); await h.launcher.stop();
    await writeFile(join(h.root, "crash-now"), ""); await h.launcher.play(); await until(() => h.launcher.snapshot().state === "error", "the crash");
    await h.launcher.stop();
    assert.equal(await treeHash(join(h.root, "saves")), before);
  } finally { await h.cleanup(); }
});

test("launcher: the Windows branches use argument arrays and no shell (taskkill for the owned pid, rundll32 to open the browser)", async () => {
  const { forceKill, openInBrowser } = await loadCore();
  const calls: { cmd: string; args: string[]; options: SpawnOptions }[] = [];
  const fake = (cmd: string, args: string[], options: SpawnOptions) => { calls.push({ cmd, args, options }); return { on: () => {}, unref: () => {} }; };
  forceKill(4242, { platform: "win32", spawn: fake });
  openInBrowser("http://127.0.0.1:3000/app/", { platform: "win32", spawn: fake });
  openInBrowser("http://127.0.0.1:3000/app/", { platform: "linux", spawn: fake });
  assert.deepEqual(calls.map(c => [c.cmd, c.args]), [["taskkill", ["/pid", "4242", "/T", "/F"]], ["rundll32", ["url.dll,FileProtocolHandler", "http://127.0.0.1:3000/app/"]], ["xdg-open", ["http://127.0.0.1:3000/app/"]]]);
  assert.ok(calls.every(c => !c.options.shell));
});

test("launcher: the log is a bounded ring buffer", async () => {
  const { createLauncher } = await loadCore();
  const root = await makeStubRoot({ withBuild: false }); // every PLAY fails fast and logs a few lines
  try {
    const l = createLauncher({ root, lineLimit: 5, env: {}, ports: { game: await freePort() } });
    for (let i = 0; i < 10; i++) { await l.play(); await l.settled(); }
    assert.ok(l.logs(500).lines.length <= 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});
