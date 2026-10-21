import { createServer } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { Server } from "node:http";

/**
 * Fixtures for the one-click launcher tests (scripts/launcher/*.mjs, plain ESM). The "game" is a stub `.build/src/ui/play.js` written into a
 * temporary repository layout: it listens on the --port it is given, answers GET /api/session, and behaves according to CALDREVAN_STUB:
 *   ok (default)  healthy at once; a `stop` line on stdin or SIGTERM saves ("stub: stop received") and exits 0
 *   late          starts listening only after a file `go-healthy` appears in its working directory
 *   never         runs but never listens
 *   crash         exits 3 before listening
 *   ignore-stop   healthy, but ignores `stop` and SIGTERM (only a kill ends it)
 * and, in ok / ignore-stop mode, exits 5 when a file `crash-now` appears. No provider, no real game, loopback only.
 */
export interface LauncherState { readonly state: "stopped" | "starting" | "ready" | "stopping" | "error"; readonly label: string; readonly message: string; readonly port: number; readonly url: string | null; readonly pid: number | null;
  readonly error: { readonly title: string; readonly detail: string; readonly fix: string | null; readonly lastLines: readonly string[] } | null; readonly logFile: string }
export interface Launcher { snapshot(): LauncherState; logs(n?: number): { file: string; lines: string[] }; play(): Promise<LauncherState>; stop(): Promise<LauncherState>; settled(): Promise<LauncherState>; killNow(): void }
export interface LauncherOptions {
  root: string; ports?: { game?: number }; spawn?: (cmd: string, args: string[], options: SpawnOptions) => ChildProcess; platform?: string; env?: Record<string, string | undefined>; nodeVersion?: string;
  openBrowser?: (url: string) => unknown; startupTimeoutMs?: number; pollMs?: number; stopGraceMs?: number; killWaitMs?: number; logDir?: string; lineLimit?: number; execPath?: string;
}
export interface Core {
  createLauncher(options: LauncherOptions): Launcher;
  createRedactor(env?: Record<string, string | undefined>): (text: string) => string;
  forceKill(pid: number, options?: { platform?: string; spawn?: (cmd: string, args: string[], options: SpawnOptions) => { on?: (e: string, f: () => void) => void } }): void;
  openInBrowser(url: string, options?: { platform?: string; spawn?: (cmd: string, args: string[], options: SpawnOptions) => { on?: (e: string, f: () => void) => void; unref?: () => void } }): void;
  checkSetup(options: { root: string; nodeVersion: string }): Promise<string[]>;
  parseMinNode(range: string | undefined): number[] | null;
  versionAtLeast(actual: string, min: number[]): boolean;
  SETUP_FIX: string;
}
export interface ControlServer { server: Server; token: string; port: number; url: string; fellBack: boolean; close(): Promise<void> }
export interface ServerModule {
  startControlServer(options: { launcher: Launcher; port?: number; fallback?: boolean; onExit?: () => void; page?: string; token?: string }): Promise<ControlServer>;
  writeInstance(logDir: string, port: number): void;
  removeInstance(logDir: string): void;
  findRunningLauncher(logDir: string, probe?: (port: number) => Promise<boolean>): Promise<string | null>;
  APP_ID: string;
}
const load = <T>(...parts: string[]): Promise<T> => import(pathToFileURL(resolve("scripts", "launcher", ...parts)).href) as Promise<T>;
export const loadCore = (): Promise<Core> => load<Core>("core.mjs");
export const loadServer = (): Promise<ServerModule> => load<ServerModule>("server.mjs");

export const STUB_BACKEND = `import http from "node:http";
import { existsSync } from "node:fs";
const mode = process.env.CALDREVAN_STUB ?? "ok";
const port = Number((process.argv.find(a => a.startsWith("--port=")) ?? "").slice(7));
console.log("stub argv " + JSON.stringify(process.argv.slice(2)) + " cwd " + process.cwd());
const key = process.env.OPENROUTER_API_KEY;
if (key) { console.log("provider key is " + key); console.error("Authorization: Bearer " + key + " and sk-abcdefghijklmnopqrstuv"); }
if (mode === "crash") { console.error("stub: fatal error while starting"); process.exit(3); }
const stopNow = why => { console.log("stub: stop received (" + why + "), campaign saved"); process.exit(0); };
if (mode !== "ignore-stop") {
  process.on("SIGTERM", () => stopNow("SIGTERM"));
  let buffered = "";
  process.stdin.setEncoding("utf8").on("data", d => { buffered += d; if (/^stop$/m.test(buffered)) stopNow("stdin line"); }).on("end", () => stopNow("stdin closed"));
} else { process.on("SIGTERM", () => console.log("stub: ignoring SIGTERM")); process.stdin.resume(); }
const serve = () => {
  http.createServer((req, res) => { if (req.url === "/api/session") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); } else { res.writeHead(404); res.end(); } })
    .listen(port, "127.0.0.1", () => console.log("stub listening on " + port));
  setInterval(() => { if (existsSync("crash-now")) process.exit(5); }, 20);
};
if (mode === "never") { console.log("stub: never becomes healthy"); setInterval(() => {}, 1000); }
else if (mode === "late") { console.log("stub: waiting for go-healthy"); const t = setInterval(() => { if (existsSync("go-healthy")) { clearInterval(t); serve(); } }, 20); }
else serve();
`;

/** A temporary repository layout with a space and a non-ASCII character in its path, the stub backend, built-looking folders and a saves/ tree. */
export async function makeStubRoot(options: { node?: string; withNodeModules?: boolean; withBuild?: boolean; withDist?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "caldrevan launcher é "));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "stub", type: "module", engines: { node: options.node ?? ">=22" } }));
  if (options.withNodeModules !== false) await mkdir(join(root, "node_modules"), { recursive: true });
  if (options.withBuild !== false) { await mkdir(join(root, ".build", "src", "ui"), { recursive: true }); await writeFile(join(root, ".build", "src", "ui", "play.js"), STUB_BACKEND); }
  if (options.withDist !== false) { await mkdir(join(root, "dist", "ui-client"), { recursive: true }); await writeFile(join(root, "dist", "ui-client", "index.html"), "<!doctype html>"); }
  await mkdir(join(root, "saves", "campaigns", "c1"), { recursive: true });
  await writeFile(join(root, "saves", "campaigns", "c1", "campaign.json"), '{"fake":"save"}');
  return root;
}

export function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const port = (s.address() as { port: number }).port; s.close(() => resolvePort(port)); });
  });
}

/** True while a process with this pid exists. */
export function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

/** Polls until `ready()` is true (state changes are awaited by the callers; this is for files and sockets the stub controls). */
export async function until(ready: () => boolean | Promise<boolean>, what: string, limitMs = 15_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!(await ready())) { if (Date.now() > end) throw new Error(`gave up waiting for ${what}`); await new Promise(r => setTimeout(r, 15)); }
}
