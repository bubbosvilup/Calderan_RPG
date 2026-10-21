// Caldrevan launcher core (dependency-free, plain ESM, runs BEFORE `npm run build` exists so it can say "run setup first").
// Owns exactly one child: `node .build/src/ui/play.js --port=<n> --control-stdin`, spawned without a shell. It never reads, writes, moves or deletes
// anything under saves/ and never installs, builds or updates anything. Everything the tests need is injectable (spawn, ports, timeouts, platform).
// Stop contract with src/ui/play.ts: a line `stop` on the child's stdin (or stdin closing) means "save the dirty campaign and exit"; see docs/LAUNCHER.md.
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { join } from "node:path";

export const SETUP_FIX = "Run setup.cmd (double-click it in the Caldrevan folder), or in a terminal in that folder: npm ci && npm run build && npm run ui:build";
const LABELS = { stopped: "Stopped", starting: "Starting", ready: "Ready", stopping: "Stopping", error: "Error" };

// ---- redaction -------------------------------------------------------------------------------------------------------------------------
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD/i;
/** A function that hides secret-looking text: the values of secret-named environment variables, `Bearer ...`, `sk-...`, `hf_...`, `NAME=value`. */
export function createRedactor(env = process.env) {
  const values = Object.entries(env).filter(([k, v]) => SECRET_NAME.test(k) && typeof v === "string" && v.length >= 8).map(([, v]) => v).sort((a, b) => b.length - a.length);
  return text => {
    let out = String(text);
    for (const v of values) out = out.split(v).join("[redacted]");
    return out.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]").replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted]").replace(/\bhf_[A-Za-z0-9]{8,}/g, "[redacted]")
      .replace(/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*\s*[=:]\s*)[^\s"',;]+/gi, "$1[redacted]");
  };
}

// ---- log: bounded ring buffer in memory plus a size-capped file --------------------------------------------------------------------------
function createLog({ dir, redact, limit, maxBytes = 1_000_000 }) {
  const file = join(dir, "launcher.log"), ring = [];
  let size = 0, fileOk = true;
  try { size = statSync(file).size; } catch { /* no file yet */ }
  const add = (source, text) => {
    const line = `${new Date().toISOString()} [${source}] ${redact(text)}`;
    ring.push(line); if (ring.length > limit) ring.shift();
    if (!fileOk) return;
    try {
      mkdirSync(dir, { recursive: true });
      if (size > maxBytes) { renameSync(file, `${file}.1`); size = 0; } // one rotated generation: the log never exceeds about 2 x maxBytes
      appendFileSync(file, `${line}\n`); size += line.length + 1;
    } catch { fileOk = false; }
  };
  return { add, file, tail: n => ring.slice(-n) };
}
/** Splits a text stream into lines; call `.flush()` at the end for a last line without newline. */
function lineSplitter(onLine) {
  let rest = "";
  const push = chunk => { rest += chunk; const parts = rest.split(/\r?\n/); rest = parts.pop(); for (const p of parts) onLine(p); if (rest.length > 8192) { onLine(rest); rest = ""; } };
  push.flush = () => { if (rest) onLine(rest); rest = ""; };
  return push;
}

// ---- prerequisites -------------------------------------------------------------------------------------------------------------------------
/** `>=22` / `>=22.3.1` to [major, minor, patch]; null when the range is any other shape (the check is then skipped). */
export function parseMinNode(range) {
  const m = /^\s*>=\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(range ?? "");
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}
export function versionAtLeast(actual, min) {
  const a = String(actual).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) { const x = a[i] ?? 0; if (x !== min[i]) return x > min[i]; }
  return true;
}
const exists = path => access(path).then(() => true, () => false);
/** Problems that make PLAY pointless, each a human sentence. Empty list = ready to start. Read-only. */
export async function checkSetup({ root, nodeVersion }) {
  const problems = [];
  let range;
  try { range = JSON.parse(await readFile(join(root, "package.json"), "utf8"))?.engines?.node; } catch { problems.push("package.json was not found: this folder does not look like the Caldrevan folder."); }
  const min = parseMinNode(range);
  if (min && !versionAtLeast(nodeVersion, min)) problems.push(`Node ${nodeVersion} is too old: Caldrevan needs Node ${range} (install the current LTS from https://nodejs.org, then run setup.cmd).`);
  if (!(await exists(join(root, "node_modules")))) problems.push("Dependencies are not installed (node_modules is missing).");
  if (!(await exists(join(root, ".build", "src", "ui", "play.js")))) problems.push("The game is not built (.build/src/ui/play.js is missing).");
  if (!(await exists(join(root, "dist", "ui-client", "index.html")))) problems.push("The game screen is not built (dist/ui-client/index.html is missing).");
  return problems;
}

// ---- ports and health ----------------------------------------------------------------------------------------------------------------------
const connects = port => new Promise(resolve => {
  const s = net.connect({ port, host: "127.0.0.1" });
  s.setTimeout(1000);
  s.once("connect", () => { s.destroy(); resolve(true); });
  s.once("error", () => resolve(false));
  s.once("timeout", () => { s.destroy(); resolve(false); });
});
const bindError = port => new Promise(resolve => {
  const s = net.createServer();
  s.once("error", e => resolve(e.code ?? "error"));
  s.listen({ port, host: "127.0.0.1", exclusive: true }, () => s.close(() => resolve(null)));
});
/** null when 127.0.0.1:port is free; otherwise a short reason. A connect probe and a bind probe: Windows lets a bind succeed next to a wildcard listener. */
export async function portProblem(port) {
  if (await connects(port)) return "in use";
  const code = await bindError(port);
  return code ? (code === "EADDRINUSE" ? "in use" : `not usable (${code})`) : null;
}
const httpStatus = (port, path, timeout = 2000) => new Promise(resolve => {
  const req = http.get({ host: "127.0.0.1", port, path, timeout }, res => { res.resume(); resolve(res.statusCode ?? null); });
  req.once("timeout", () => req.destroy());
  req.once("error", () => resolve(null));
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const within = async (promise, ms) => { let t; try { await Promise.race([promise, new Promise(resolve => { t = setTimeout(resolve, ms); })]); } finally { clearTimeout(t); } };

// ---- the few platform-specific actions (Windows branches are unverified on Linux; each is one small function) ------------------------------
/** Kills the OWNED pid and its tree. Windows: `taskkill /pid <pid> /T /F` (arguments array, no shell). POSIX: SIGKILL. */
export function forceKill(pid, { platform = process.platform, spawn = nodeSpawn } = {}) {
  if (platform === "win32") { const k = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); k.on?.("error", () => {}); return; }
  try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
}
function forceKillSync(pid, platform) {
  if (platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
}
/** Opens a URL in the default browser without a shell: rundll32 (Windows), open (macOS), xdg-open (Linux). Fire and forget. */
export function openInBrowser(url, { platform = process.platform, spawn = nodeSpawn } = {}) {
  const [cmd, args] = platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { const c = spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true }); c.on?.("error", () => {}); c.unref?.(); } catch { /* the page also offers an OPEN GAME link */ }
}

// ---- the launcher ----------------------------------------------------------------------------------------------------------------------------
export function createLauncher(options) {
  const { root, spawn = nodeSpawn, platform = process.platform, env = process.env, nodeVersion = process.versions.node, execPath = process.execPath,
    openBrowser = () => {}, startupTimeoutMs = 60_000, pollMs = 250, stopGraceMs = 20_000, killWaitMs = 5_000, lineLimit = 500 } = options;
  const gamePort = options.ports?.game ?? 3000;
  const logDir = options.logDir ?? join(root, "artifacts", "local", "launcher");
  const redact = createRedactor(env);
  const log = createLog({ dir: logDir, redact, limit: lineLimit });
  const pidFile = join(logDir, "child.pid");
  const events = new EventEmitter();
  let state = "stopped", error = null, run = null, seq = 0;

  const url = r => `http://127.0.0.1:${r.port}/app/`;
  const set = (next, why) => { if (next !== state) log.add("launcher", `${LABELS[state]} -> ${LABELS[next]}${why ? `: ${why}` : ""}`); state = next; events.emit("change"); };
  const messageFor = () => ({ stopped: "The game is not running.", starting: `Starting the game and waiting for it on port ${run?.port}...`, ready: `The game is running at ${run ? url(run) : ""}`,
    stopping: "Stopping the game and saving the campaign...", error: error?.title ?? "Something went wrong." })[state];
  const snapshot = () => ({ state, label: LABELS[state], message: messageFor(), port: run?.port ?? gamePort, url: state === "ready" && run ? url(run) : null, pid: run?.child?.pid ?? null,
    error, logFile: log.file });
  const failure = (title, detail, fix) => ({ title, detail: redact(detail), fix: fix ?? null, lastLines: log.tail(15) });

  function finalize(r) {
    if (run !== r) return;
    run = null;
    if (r.failure && !r.userStop) { error = r.failure; set("error", `${r.failure.title} ${r.failure.detail}`); } else { error = null; set("stopped"); }
  }
  function fail(r, err) {
    r.failure ??= err;
    if (r.child && !r.gone) { if (run === r) set("stopping", err.title); return terminate(r); }
    finalize(r); return Promise.resolve();
  }
  /** Cooperative stop first (the `stop` line; plus SIGTERM where signals are real), then a bounded wait, then the forced kill of the owned pid only. */
  function terminate(r) {
    r.aborted = true;
    r.terminating ??= (async () => {
      if (r.child && !r.gone) {
        log.add("launcher", `Asking the game (pid ${r.child.pid}) to save and stop.`);
        try { r.child.stdin.write("stop\n"); } catch { /* stdin already closed */ }
        if (platform !== "win32") { try { r.child.kill("SIGTERM"); } catch { /* gone */ } }
        await within(r.closed, stopGraceMs);
        if (!r.gone) {
          log.add("launcher", `WARNING: the game did not stop within ${Math.round(stopGraceMs / 1000)} s; killing process ${r.child.pid} (a save already made is kept; unsaved turns may be lost).`);
          forceKill(r.child.pid, { platform, spawn });
          await within(r.closed, killWaitMs);
          if (!r.gone) log.add("launcher", `WARNING: process ${r.child.pid} still has not exited; it is no longer tracked.`);
        }
      }
      finalize(r);
    })();
    return r.terminating;
  }

  /** A pid file left by a launcher that died hard: reported, never acted on (a pid can be reused; only the owned child is ever killed). */
  function noteStalePid() {
    try {
      const { pid } = JSON.parse(readFileSync(pidFile, "utf8"));
      try { process.kill(pid, 0); log.add("launcher", `WARNING: ${pidFile} lists pid ${pid} from an earlier launcher run and that pid is still alive. It is NOT touched; if the port check fails, close that game in Task Manager.`); }
      catch (e) { if (e.code === "ESRCH") rmSync(pidFile, { force: true }); }
    } catch { /* no pid file */ }
  }

  async function startRun(r) {
    try {
      const problems = await checkSetup({ root, nodeVersion });
      if (r.aborted) return;
      if (problems.length) return await fail(r, failure("Setup is incomplete", problems.join(" "), SETUP_FIX));
      noteStalePid();
      const bad = await portProblem(r.port);
      if (r.aborted) return;
      if (bad) return await fail(r, failure(`Port ${r.port} is ${bad}`,
        `Port ${r.port} is ${bad} by another program (maybe another Caldrevan, for example 'npm run play:ui'). The launcher never starts a second game on the same saves.`,
        "Close that program and press PLAY again, or choose another port by setting CALDREVAN_GAME_PORT (for example 3001) before starting the launcher."));
      const args = [join(root, ".build", "src", "ui", "play.js"), `--port=${r.port}`, "--control-stdin"];
      log.add("launcher", `Starting: ${execPath} ${args.join(" ")} (cwd ${root})`);
      const child = spawn(execPath, args, { cwd: root, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      r.child = child;
      r.closed = new Promise(resolve => { r.markGone = resolve; });
      child.stdin?.on("error", () => {});
      const splitters = [[child.stdout, "game"], [child.stderr, "game!"]].map(([stream, tag]) => {
        const split = lineSplitter(line => log.add(tag, line));
        stream?.setEncoding("utf8"); stream?.on("data", split);
        return split;
      });
      child.once("error", e => { if (child.pid === undefined) onGone(r, null, null, e); else log.add("launcher", `child error: ${e.message}`); });
      child.once("close", (code, signal) => { splitters.forEach(s => s.flush()); onGone(r, code, signal); });
      if (child.pid !== undefined) try { mkdirSync(logDir, { recursive: true }); writeFileSync(pidFile, JSON.stringify({ pid: child.pid, port: r.port, launcher: process.pid, root })); } catch { /* informational */ }
      await waitHealthy(r);
    } catch (e) { await fail(r, failure("The launcher hit an unexpected error", String(e?.message ?? e))); }
  }
  function onGone(r, code, signal, spawnError) {
    if (r.gone) return;
    r.gone = true; r.exit = { code, signal };
    try { if (JSON.parse(readFileSync(pidFile, "utf8")).pid === r.child?.pid) rmSync(pidFile, { force: true }); } catch { /* none */ }
    const how = spawnError ? `could not be started: ${spawnError.message}` : signal ? `was ended by signal ${signal}` : `exited with code ${code}`;
    log.add("launcher", `Game process ${how}.`);
    if (!r.terminating && run === r) {
      r.failure ??= failure(spawnError ? "The game could not be started" : state === "starting" ? "The game stopped while starting" : "The game stopped unexpectedly",
        `The game process ${how}. Last output is in Show Logs.`);
      finalize(r);
    }
    r.markGone?.();
  }
  async function waitHealthy(r) {
    const deadline = Date.now() + startupTimeoutMs;
    while (!r.aborted && !r.gone) {
      if (await httpStatus(r.port, "/api/session") === 200) {
        if (r.aborted || r.gone || run !== r) return;
        set("ready", `healthy on port ${r.port}`);
        try { await openBrowser(url(r)); } catch (e) { log.add("launcher", `Could not open the browser (${e?.message}); use OPEN GAME.`); }
        return;
      }
      if (Date.now() > deadline) return void await fail(r, failure("The game did not become ready",
        `No healthy answer from /api/session on port ${r.port} within ${Math.round(startupTimeoutMs / 1000)} s.`, "Open Show Logs for the game output, then press PLAY to try again."));
      await sleep(pollMs);
    }
  }

  return {
    snapshot,
    events,
    logs: (n = 200) => ({ file: log.file, lines: log.tail(Math.max(1, Math.min(n, lineLimit))) }),
    /** Idempotent: while Starting, Ready or Stopping it only reports. Returns at once (state Starting); await settled() for the outcome. */
    play() {
      if (state === "starting" || state === "ready" || state === "stopping") { log.add("launcher", `PLAY ignored: already ${LABELS[state]}.`); return Promise.resolve(snapshot()); }
      const r = run = { id: ++seq, port: gamePort, child: null, closed: Promise.resolve(), gone: false, aborted: false, failure: null, userStop: false };
      error = null; set("starting");
      r.startup = startRun(r);
      return Promise.resolve(snapshot());
    },
    /** Stops only the child this launcher spawned. In Error it just clears the error. Resolves when the child is gone. */
    async stop() {
      const r = run;
      if (!r) { if (state === "error") { error = null; set("stopped", "error cleared"); } return snapshot(); }
      r.userStop = true;
      if (state !== "stopping") set("stopping", "STOP");
      await terminate(r);
      return snapshot();
    },
    async settled() { while (state === "starting" || state === "stopping") await new Promise(resolve => events.once("change", resolve)); return snapshot(); },
    /** Synchronous last resort for process exit handlers. */
    killNow() { if (run?.child && !run.gone) forceKillSync(run.child.pid, platform); },
  };
}
