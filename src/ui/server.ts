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
  const state = () => {
    const view = session.getView();
    const play = session.getPlayUiView();
    return { messages: messages.map(message => message.comparison_id ? { ...message, comparison_available: comparisons?.has(message.comparison_id) ?? false, alternatives: comparisons?.results(message.comparison_id) ?? [] } : message), ...(comparisons ? { alternate_models: ALTERNATE_NARRATOR_MODELS } : {}), status: session.status, configured: view.session.provider.configured,
      revision: view.session.revision,
      scene: { location: view.scene.location.name, location_id: view.scene.location.id, time_of_day: view.scene.time.time_of_day },
      play,
      household: play.household.map(h => ({ members: h.members.map(m => ({ name: m.name_known ? m.name : "Unfamiliar household member", presence: m.presence, ...(m.known_location ? { location: m.known_location } : {}) })) })) };
  };
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
      // Portrait Image Generation V1: stored portrait/reference bytes by opaque token only (no path, ID or name is accepted).
      const assetToken = req.method === "GET" ? /^\/api\/portrait\/asset\/([0-9a-f]{32})$/.exec(req.url ?? "")?.[1] : undefined;
      if (assetToken) {
        const file = await session.readPortraitAsset(assetToken);
        if (!file) { json(404, { error: "Not found." }); return; }
        res.writeHead(200, { "Content-Type": file.media_type, "Content-Length": String(file.bytes.length) }); res.end(file.bytes); return;
      }
      if (req.method === "POST" && (req.url === "/api/turn" || req.url === "/api/alternative" || req.url === "/api/location" || req.url === "/api/appearance" || req.url === "/api/portrait/generate" || req.url === "/api/portrait/reference")) {
        if (req.headers["content-type"] !== "application/json") { json(415, { error: "Expected JSON." }); return; }
        // A reference upload carries one base64 image (at most 4 MB decoded); every other request stays small.
        const limit = req.url === "/api/portrait/reference" ? 6_000_000 : 24000;
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > limit) { json(413, { error: req.url === "/api/portrait/reference" ? "The image is too large (at most 4 MB)." : "Message too long." }); return; }
        }
        let input: unknown;
        try { input = JSON.parse(body); } catch { json(400, { error: "Invalid request." }); return; }
        if (req.url === "/api/location") {
          if (!input || typeof input !== "object" || !("target" in input) || !("expected_revision" in input) || typeof input.target !== "string" || typeof input.expected_revision !== "number") {
            json(400, { ok: false, error: { message: "Expected target and current revision." }, ...state() }); return;
          }
          const outcome = session.overridePlayerLocation({ target: input.target, expected_revision: input.expected_revision });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422,
            { ...result, ...state() }); return;
        }
        if (req.url === "/api/portrait/generate" || req.url === "/api/portrait/reference") {
          // The browser supplies only the opaque ref, the revision it saw and (for a reference) the image itself: never a prompt,
          // model, path or character ID. The server builds the prompt from committed appearance.
          const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
          const outcome = req.url === "/api/portrait/generate"
            ? await session.generateNpcPortrait({ ref: body.ref, expected_revision: body.expected_revision })
            : await session.setNpcPortraitReference({ ref: body.ref, expected_revision: body.expected_revision, image: body.image });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : outcome.error.code === "portrait_generation_failed" ? 502 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/appearance") {
          // Permanent Appearance V1: the Household editor's narrow write; eligibility, revision and patch rules live in GameSession.
          const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
          const outcome = session.updateNpcAppearance({ ref: body.ref, expected_revision: body.expected_revision, patch: body.patch });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422, { ...result, ...state() }); return;
        }
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
        const streaming = req.headers.accept === "application/x-ndjson";
        const abort = new AbortController();
        const disconnected = () => { if (!res.writableEnded) abort.abort(); };
        if (streaming) { res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" }); res.flushHeaders(); res.on("close", disconnected); }
        const writeEvent = (event: unknown) => { if (!res.destroyed) res.write(JSON.stringify(event) + "\n"); };
        const outcome = await session.submitPlayerInput(text.trim(), streaming ? { signal: abort.signal, onEvent: event => {
          if (event.type === "narrator_preview") writeEvent({ type: "draft", action: event.action, phase: event.phase, text: event.text });
        } } : {});
        res.off("close", disconnected);
        if (outcome.ok) {
          messages.push({ role: "player", text: text.trim() }, { role: "narrator", text: outcome.narration, ...(comparisons?.finalize(outcome.turn_id) ? { comparison_id: outcome.turn_id } : {}) });
          if (streaming) { writeEvent({ type: "result", ok: true, ...state() }); res.end(); }
          else json(200, { ok: true, ...state() });
        } else {
          console.error(`Playtest turn failed: ${outcome.error.code}${outcome.error.provider_code ? ` (${outcome.error.provider_code})` : ""}`);
          if (streaming) { writeEvent({ type: "result", ok: false, error: outcome.error, ...state() }); res.end(); }
          else json(outcome.error.code === "turn_in_progress" ? 409 : 422, { ok: false, error: outcome.error, ...state() });
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
