// Caldrevan launcher entry point: `node scripts/launcher/main.mjs [--detach] [--no-open] [--port=3199] [--game-port=3000]`.
// Caldrevan.cmd and caldrevan.sh run it with --detach: that process finds or starts the (hidden) launcher, opens its page, and exits. Plain ESM, no dependencies,
// no build needed. Environment: CALDREVAN_LAUNCHER_PORT, CALDREVAN_GAME_PORT (the flags win).
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSetup, createLauncher, openInBrowser } from "./core.mjs";
import { DEFAULT_PORT, findRunningLauncher, removeInstance, startControlServer, writeInstance } from "./server.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const logDir = join(root, "artifacts", "local", "launcher");
const args = process.argv.slice(2);
const flag = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const port = (value, fallback) => { const n = Number(value); return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback; };
const launcherPort = port(flag("port") ?? process.env.CALDREVAN_LAUNCHER_PORT, DEFAULT_PORT);
const gamePort = port(flag("game-port") ?? process.env.CALDREVAN_GAME_PORT, 3000);
const die = message => { console.error(message); process.exit(1); };

// Too old a Node cannot be trusted to run the rest of this program: say so first, in words.
const problems = (await checkSetup({ root, nodeVersion: process.versions.node })).filter(p => p.startsWith("Node "));
if (problems.length) die(problems[0]);

if (args.includes("--detach")) {
  // Re-use a running launcher, otherwise start one hidden (no console window) and wait for it; then show its page.
  let target = await findRunningLauncher(logDir);
  if (!target) {
    spawn(process.execPath, [fileURLToPath(import.meta.url), "--no-open", ...args.filter(a => a !== "--detach" && a !== "--no-open")], { cwd: root, detached: true, stdio: "ignore", windowsHide: true }).unref();
    for (let i = 0; i < 40 && !target; i++) { await new Promise(r => setTimeout(r, 250)); target = await findRunningLauncher(logDir); }
  }
  if (!target) die(`The launcher did not start. To see why, run in this folder:  node scripts/launcher/main.mjs\nLog: ${join(logDir, "launcher.log")}`);
  console.log(`Caldrevan Launcher: ${target}`);
  if (!args.includes("--no-open")) openInBrowser(target);
  process.exit(0);
}

const existing = await findRunningLauncher(logDir);
if (existing) { console.log(`The launcher is already running: ${existing}`); if (!args.includes("--no-open")) openInBrowser(existing); process.exit(0); }

const launcher = createLauncher({ root, ports: { game: gamePort }, openBrowser: openInBrowser });
let control;
let closing = false;
async function shutdown(reason) {
  if (closing) return;
  closing = true;
  console.log(`Closing the launcher (${reason}).`);
  try { await launcher.stop(); } finally {
    removeInstance(logDir);
    await control?.close().catch(() => {});
    process.exit(0);
  }
}
try { control = await startControlServer({ launcher, port: launcherPort, onExit: () => void shutdown("Exit pressed") }); }
catch (e) { die(`Cannot start the launcher on 127.0.0.1:${launcherPort}: ${e.message}`); }
writeInstance(logDir, control.port);
console.log(`Caldrevan Launcher: ${control.url}${control.fellBack ? ` (port ${launcherPort} was busy)` : ""}`);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, () => void shutdown(sig));
process.on("exit", () => { launcher.killNow(); removeInstance(logDir); }); // last resort if the launcher dies without the orderly path
if (!args.includes("--no-open")) openInBrowser(control.url);
