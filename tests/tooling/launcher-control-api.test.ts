import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { alive, freePort, loadCore, loadServer, makeStubRoot, until, type Launcher } from "../support/launcher-fixtures.js";

// The launcher control server (scripts/launcher/server.mjs): loopback only, token, Host / Origin / content-type checks, no CORS, Exit stops the game.
interface Reply { status: number; headers: http.IncomingHttpHeaders; text: string; json: Record<string, unknown> }
function request(port: number, method: string, path: string, options: { headers?: Record<string, string>; body?: string; host?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers: { host: options.host ?? `127.0.0.1:${port}`, ...options.headers } }, res => {
      let text = ""; res.setEncoding("utf8"); res.on("data", d => { text += d; });
      res.on("end", () => { let json: Record<string, unknown> = {}; try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* html */ } resolve({ status: res.statusCode!, headers: res.headers, text, json }); });
    });
    req.on("error", reject); req.end(options.body);
  });
}
async function setup(extra: { onExit?: () => void; env?: Record<string, string> } = {}) {
  const { createLauncher } = await loadCore();
  const { startControlServer } = await loadServer();
  const root = await makeStubRoot();
  const gamePort = await freePort();
  const launcher: Launcher = createLauncher({ root, ports: { game: gamePort }, env: { ...process.env, ...extra.env }, pollMs: 15, stopGraceMs: 10_000, openBrowser: () => {} });
  const control = await startControlServer({ launcher, port: 0, ...(extra.onExit ? { onExit: extra.onExit } : {}) });
  const post = (path: string, headers: Record<string, string> = {}, body = "{}") =>
    request(control.port, "POST", path, { headers: { "x-launcher-token": control.token, "content-type": "application/json", ...headers }, body });
  const get = (path: string, headers: Record<string, string> = {}) => request(control.port, "GET", path, { headers: { "x-launcher-token": control.token, ...headers } });
  const cleanup = async () => { await launcher.stop(); launcher.killNow(); await control.close(); await rm(root, { recursive: true, force: true }); };
  return { launcher, control, root, gamePort, post, get, cleanup };
}

test("control API: binds 127.0.0.1 only and serves the page with a per-run token and a nonce-only CSP", async () => {
  const s = await setup();
  try {
    assert.equal((s.control.server.address() as net.AddressInfo).address, "127.0.0.1");
    const page = await request(s.control.port, "GET", "/");
    assert.equal(page.status, 200);
    assert.ok(page.text.includes(`content="${s.control.token}"`), "the token is delivered inside the page");
    assert.ok(!page.text.includes("__TOKEN__") && !page.text.includes("__NONCE__"));
    const nonce = /nonce="([^"]+)"/.exec(page.text)![1]!;
    assert.match(String(page.headers["content-security-policy"]), new RegExp(`script-src 'nonce-${nonce}'`));
    assert.match(String(page.headers["content-security-policy"]), /frame-ancestors 'none'/);
    assert.ok(!/<[^>]+\sstyle="/.test(page.text), "no inline style attributes (the CSP forbids them)");
    assert.equal(page.headers["access-control-allow-origin"], undefined);
    const other = await setup();
    try { assert.notEqual(other.control.token, s.control.token, "a new token per run"); } finally { await other.cleanup(); }
  } finally { await s.cleanup(); }
});

test("control API: rejects a wrong Host, a missing or wrong token, a cross-origin POST and a non-JSON POST; nothing is started by any of them; no CORS", async () => {
  const s = await setup();
  try {
    const goodHeaders = { "x-launcher-token": s.control.token, "content-type": "application/json" };
    for (const host of ["evil.example", `evil.example:${s.control.port}`, `127.0.0.1:${s.control.port + 1}`, "127.0.0.1", `[::1]:${s.control.port}`]) {
      assert.equal((await request(s.control.port, "GET", "/", { host })).status, 403, host);
      assert.equal((await request(s.control.port, "GET", "/api/status", { host, headers: goodHeaders })).status, 403, host);
      assert.equal((await request(s.control.port, "POST", "/api/play", { host, headers: goodHeaders, body: "{}" })).status, 403, host);
    }
    assert.equal((await request(s.control.port, "GET", "/api/status", { host: `localhost:${s.control.port}`, headers: goodHeaders })).status, 200, "localhost with the exact port is fine");
    assert.equal((await request(s.control.port, "GET", "/api/status")).status, 401);
    assert.equal((await request(s.control.port, "GET", "/api/status", { headers: { "x-launcher-token": "wrong" } })).status, 401);
    assert.equal((await request(s.control.port, "POST", "/api/play", { headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
    assert.equal((await request(s.control.port, "POST", "/api/play", { headers: { "x-launcher-token": `${s.control.token}x`, "content-type": "application/json" }, body: "{}" })).status, 401);
    assert.equal((await s.post("/api/play", { origin: "http://evil.example" })).status, 403, "cross-origin Origin");
    assert.equal((await s.post("/api/play", { origin: `http://127.0.0.1:${s.control.port + 1}` })).status, 403, "same host, other port");
    assert.equal((await s.post("/api/play", { "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await s.post("/api/play", { "sec-fetch-site": "same-site" })).status, 403);
    assert.equal((await s.post("/api/play", { "content-type": "text/plain" })).status, 415);
    assert.equal((await s.post("/api/play", { "content-type": "application/x-www-form-urlencoded" }, "a=b")).status, 415);
    assert.equal((await s.post("/api/play", {}, "not json")).status, 400);
    assert.equal((await s.post("/api/play", {}, "[1]")).status, 400);
    assert.equal((await s.post("/api/play", {}, JSON.stringify({ pad: "x".repeat(10_000) }))).status, 400, "oversized body");
    assert.equal((await s.get("/api/play")).status, 405);
    assert.equal((await request(s.control.port, "OPTIONS", "/api/play", { headers: { origin: "http://evil.example", "access-control-request-method": "POST" } })).status, 401);
    const probe = await s.get("/api/status");
    assert.equal(probe.headers["access-control-allow-origin"], undefined);
    assert.equal(s.launcher.snapshot().state, "stopped", "none of the rejected requests started the game");
  } finally { await s.cleanup(); }
});

test("control API: status, play, logs and stop work with the token and same-origin headers; no secret appears in any response", async () => {
  const secret = "sk-or-v1-APITESTSECRET0123456789";
  const s = await setup({ env: { OPENROUTER_API_KEY: secret } });
  try {
    assert.equal((await s.get("/api/status")).json.state, "stopped");
    const origin = `http://127.0.0.1:${s.control.port}`;
    const played = await s.post("/api/play", { origin, "sec-fetch-site": "same-origin" });
    assert.equal(played.status, 200);
    assert.ok(["starting", "ready"].includes(String(played.json.state)));
    assert.equal((await s.post("/api/play", { origin })).json.state === "stopped", false, "a second PLAY changes nothing");
    await until(async () => (await s.get("/api/status")).json.state === "ready", "Ready through the API");
    const status = await s.get("/api/status");
    assert.equal(status.json.url, `http://127.0.0.1:${s.gamePort}/app/`);
    const logs = await s.get("/api/logs?lines=50");
    assert.ok((logs.json.lines as string[]).length > 0);
    assert.ok(String(logs.json.file).endsWith("launcher.log"));
    const pid = Number(status.json.pid);
    const stopped = await s.post("/api/stop", { origin });
    assert.equal(stopped.json.state, "stopped");
    assert.equal(alive(pid), false);
    const everything = [status.text, logs.text, stopped.text, (await s.get("/")).text, (await s.get("/api/logs")).text].join("\n");
    assert.ok(!everything.includes(secret) && !everything.includes("APITESTSECRET"));
    assert.match((await s.get("/api/logs")).text, /provider key is \[redacted\]/);
  } finally { await s.cleanup(); }
});

test("control API: Exit stops the owned game, answers, and then asks the launcher process to exit (once)", async () => {
  let exits = 0;
  const s = await setup({ onExit: () => { exits++; } });
  try {
    await s.post("/api/play"); await s.launcher.settled();
    const pid = s.launcher.snapshot().pid!;
    assert.ok(alive(pid));
    const reply = await s.post("/api/exit");
    assert.equal(reply.status, 200);
    assert.equal(reply.json.state, "stopped");
    assert.equal(alive(pid), false, "the game is gone before the launcher exits");
    await until(() => exits === 1, "the exit callback");
    assert.equal(exits, 1);
  } finally { await s.cleanup(); }
});

test("control API: a busy launcher port falls back to a free one (or fails when fallback is off); a second double-click finds the running launcher", async () => {
  const { startControlServer, writeInstance, removeInstance, findRunningLauncher } = await loadServer();
  const { createLauncher } = await loadCore();
  const root = await makeStubRoot();
  const launcher = createLauncher({ root, ports: { game: await freePort() }, env: {} });
  const logDir = join(root, "artifacts", "local", "launcher");
  const first = await startControlServer({ launcher, port: 0 });
  try {
    const second = await startControlServer({ launcher, port: first.port });
    assert.equal(second.fellBack, true);
    assert.notEqual(second.port, first.port);
    await second.close();
    await assert.rejects(startControlServer({ launcher, port: first.port, fallback: false }), /EADDRINUSE/);
    assert.equal(await findRunningLauncher(logDir), null, "no instance file");
    writeInstance(logDir, first.port);
    assert.equal(await findRunningLauncher(logDir), `http://127.0.0.1:${first.port}/`);
    assert.equal((JSON.parse(await readFile(join(logDir, "launcher.json"), "utf8")) as { port: number }).port, first.port);
    await first.close();
    assert.equal(await findRunningLauncher(logDir), null, "a stale file naming a dead port is ignored");
    const stranger = net.createServer(socket => socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nhi")); // something else on that port
    await new Promise<void>(r => stranger.listen(first.port, "127.0.0.1", () => r()));
    assert.equal(await findRunningLauncher(logDir), null, "a port answering as something else is not a launcher");
    stranger.close();
    removeInstance(logDir);
    assert.equal(await findRunningLauncher(logDir), null);
  } finally { await first.close().catch(() => {}); await rm(root, { recursive: true, force: true }); }
});
