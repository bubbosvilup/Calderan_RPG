// Caldrevan launcher control server: 127.0.0.1 only, one self-contained page and a tiny JSON API. No CORS, ever.
// Every /api request needs the per-run token (header X-Launcher-Token, delivered inside the served page); every request needs a Host of
// 127.0.0.1:<port> or localhost:<port> (DNS rebinding); a POST also needs a same-origin Origin / Sec-Fetch-Site and a JSON body.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ID = "caldrevan-launcher";
export const DEFAULT_PORT = 3199;
const here = dirname(fileURLToPath(import.meta.url));
const instanceFile = logDir => join(logDir, "launcher.json");

const sameToken = (a, b) => { const x = Buffer.from(String(a ?? "")), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Starts the control server on 127.0.0.1. When the preferred port is taken it falls back to a free one (unless fallback is false). */
export async function startControlServer({ launcher, port = DEFAULT_PORT, fallback = true, onExit = () => {}, page = readFileSync(join(here, "page.html"), "utf8"), token = randomBytes(24).toString("base64url") }) {
  const server = http.createServer((req, res) => { handle(req, res).catch(() => send(res, 500, { error: "Internal launcher error." })); });
  const send = (res, status, body, headers = {}, after) => {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, { "Content-Type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", ...headers });
    res.end(text, after);
  };
  async function readJson(req) {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > 4096) return undefined; chunks.push(c); }
    try { const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : undefined; } catch { return undefined; }
  }
  async function handle(req, res) {
    const own = server.address().port;
    const host = req.headers.host ?? "";
    if (host !== `127.0.0.1:${own}` && host !== `localhost:${own}`) return send(res, 403, { error: "Local access only." });
    const path = new URL(req.url ?? "/", `http://127.0.0.1:${own}`).pathname;
    if (req.method === "GET" && path === "/") {
      const nonce = randomBytes(12).toString("base64url");
      return send(res, 200, page.replaceAll("__TOKEN__", token).replaceAll("__NONCE__", nonce), { "Content-Security-Policy":
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` });
    }
    if (req.method === "GET" && path === "/ping") return send(res, 200, { app: APP_ID });
    if (!path.startsWith("/api/")) return send(res, 404, { error: "Not found." });
    if (!sameToken(req.headers["x-launcher-token"], token)) return send(res, 401, { error: "Missing or wrong launcher token. Reload the launcher page." });
    if (req.method === "GET" && path === "/api/status") return send(res, 200, launcher.snapshot());
    if (req.method === "GET" && path === "/api/logs") return send(res, 200, launcher.logs(Number(new URL(req.url, "http://x").searchParams.get("lines")) || 200));
    const action = { "/api/play": () => launcher.play(), "/api/stop": () => launcher.stop(), "/api/exit": () => launcher.stop() }[path];
    if (!action) return send(res, 404, { error: "Not found." });
    if (req.method !== "POST") return send(res, 405, { error: "Use POST." }, { Allow: "POST" });
    const origin = req.headers.origin, site = req.headers["sec-fetch-site"];
    if ((origin !== undefined && origin !== `http://${host}`) || (site !== undefined && site !== "same-origin")) return send(res, 403, { error: "Cross-origin request refused." });
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) return send(res, 415, { error: "Content-Type must be application/json." });
    if (await readJson(req) === undefined) return send(res, 400, { error: "The body must be a small JSON object." });
    const result = await action();
    send(res, 200, result, {}, path === "/api/exit" ? () => setImmediate(onExit) : undefined);
  }

  const listen = p => new Promise((resolve, reject) => { server.once("error", reject); server.listen({ port: p, host: "127.0.0.1" }, () => { server.off("error", reject); resolve(); }); });
  let fellBack = false;
  try { await listen(port); } catch (e) {
    if (e.code !== "EADDRINUSE" || !fallback) throw e;
    fellBack = true; await listen(0);
  }
  const actual = server.address().port;
  return { server, token, port: actual, url: `http://127.0.0.1:${actual}/`, fellBack, close: () => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections(); }) };
}

// ---- single instance: launcher.json in the log directory names the running launcher; it is trusted only if it answers /ping ---------------
export function writeInstance(logDir, port) { mkdirSync(logDir, { recursive: true }); writeFileSync(instanceFile(logDir), JSON.stringify({ pid: process.pid, port })); }
export function removeInstance(logDir) {
  try { if (JSON.parse(readFileSync(instanceFile(logDir), "utf8")).pid === process.pid) rmSync(instanceFile(logDir), { force: true }); } catch { /* none */ }
}
/** The URL of an already running launcher, or null (no file, stale file, or the port answers as something else). */
export async function findRunningLauncher(logDir, probe = ping) {
  let port;
  try { port = JSON.parse(readFileSync(instanceFile(logDir), "utf8")).port; } catch { return null; }
  return Number.isInteger(port) && await probe(port) ? `http://127.0.0.1:${port}/` : null;
}
function ping(port) {
  return new Promise(resolve => {
    const req = http.get({ host: "127.0.0.1", port, path: "/ping", timeout: 1500 }, res => {
      let body = ""; res.setEncoding("utf8"); res.on("data", d => { body += d; if (body.length > 200) res.destroy(); });
      res.on("end", () => { try { resolve(JSON.parse(body).app === APP_ID); } catch { resolve(false); } });
      res.on("error", () => resolve(false));
    });
    req.once("timeout", () => req.destroy());
    req.once("error", () => resolve(false));
  });
}
