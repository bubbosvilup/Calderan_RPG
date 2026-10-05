import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type GameSession } from "../app/index.js";
import { UI_PLAYTEST_OPENING } from "../app/ui-playtest.js";

import { ALTERNATE_NARRATOR_MODELS, type NarratorAlternatives } from "../app/narrator-alternatives.js";

interface Message { readonly comparison_id?: string; readonly role: "player" | "narrator"; readonly text: string }
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/client.js", ["client.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);

/** Transport only: all game operations go through the application facade. */
export function createPlaytestServer(session: GameSession, assetDir = resolve("src/ui"), comparisons?: NarratorAlternatives) {
  const messages: Message[] = [{ role: "narrator", text: UI_PLAYTEST_OPENING }];
  const state = () => ({ messages: messages.map(message => message.comparison_id ? { ...message, comparison_available: comparisons?.has(message.comparison_id) ?? false, alternatives: comparisons?.results(message.comparison_id) ?? [] } : message), ...(comparisons ? { alternate_models: ALTERNATE_NARRATOR_MODELS } : {}), status: session.status, configured: session.getView().session.provider.configured });
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (code: number, data: unknown) => reply(res, code, "application/json; charset=utf-8", JSON.stringify(data));
    // Loopback only, with a same-origin write boundary (including DNS-rebinding protection).
    const host = req.headers.host;
    if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) { json(403, { error: "Local access only." }); return; }
    if (req.method === "POST" && (req.headers.origin && req.headers.origin !== `http://${host}` || req.headers["sec-fetch-site"] === "cross-site")) {
      json(403, { error: "Local access only." }); return;
    }
    try {
      if (req.method === "GET" && req.url === "/api/session") { json(200, state()); return; }
      if (req.method === "POST" && (req.url === "/api/turn" || req.url === "/api/alternative")) {
        if (req.headers["content-type"] !== "application/json") { json(415, { error: "Expected JSON." }); return; }
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 24000) { json(413, { error: "Message too long." }); return; }
        }
        let input: unknown;
        try { input = JSON.parse(body); } catch { json(400, { error: "Invalid request." }); return; }
        if (req.url === "/api/alternative") {
          if (!comparisons || !input || typeof input !== "object" || !("message_id" in input) || !("model" in input) || typeof input.message_id !== "string" || typeof input.model !== "string" || !messages.some(message => message.role === "narrator" && message.comparison_id === input.message_id)) {
            json(400, { ok: false, error: "Invalid comparison request." }); return;
          }
          const result = await comparisons.regenerate(input.message_id, input.model);
          json(result.ok ? 200 : 422, result); return;
        }
        const text = input && typeof input === "object" && "text" in input ? input.text : undefined;
        if (typeof text !== "string" || !text.trim() || text.length > 4000) { json(400, { error: "Enter 1–4000 characters." }); return; }
        if (session.status === "idle") comparisons?.begin();
        const outcome = await session.submitPlayerInput(text.trim());
        if (outcome.ok) {
          messages.push({ role: "player", text: text.trim() }, { role: "narrator", text: outcome.narration, ...(comparisons?.finalize(outcome.turn_id) ? { comparison_id: outcome.turn_id } : {}) });
          json(200, { ok: true, ...state() });
        } else {
          console.error(`Playtest turn failed: ${outcome.error.code}${outcome.error.provider_code ? ` (${outcome.error.provider_code})` : ""}`);
          json(outcome.error.code === "turn_in_progress" ? 409 : 422, { ok: false, error: outcome.error, ...state() });
        }
        return;
      }
      const asset = req.method === "GET" ? assets.get(req.url ?? "") : undefined;
      if (asset) { reply(res, 200, asset[1]!, await readFile(resolve(assetDir, asset[0]!))); return; }
      json(404, { error: "Not found." });
    } catch {
      console.error("Playtest request failed.");
      if (!res.headersSent) json(500, { error: "Request failed. Reload to check the conversation before trying again." });
      else res.end();
    }
  });
}

function reply(res: ServerResponse, code: number, type: string, body: string | Buffer) {
  res.writeHead(code, { "Content-Type": type }); res.end(body);
}
