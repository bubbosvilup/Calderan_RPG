import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { ITEM_GLYPHS, isItemGlyphName } from "../app/item-visuals.js";
import { resolve } from "node:path";
import { GameSession, SessionHost } from "../app/index.js";
import { CANON_AVATAR_DIR, readCanonAvatar } from "../app/canon-avatars.js";
import { UI_PLAYTEST_OPENING } from "../app/ui-playtest.js";
import { validTurnKey } from "../app/turn-receipts.js";

import { ALTERNATE_NARRATOR_MODELS, type NarratorAlternatives } from "../app/narrator-alternatives.js";

/** Portrait Gallery V2: batch generation, role assignment, Gallery delete and the reference upload. */
const PORTRAIT_ROUTES = new Set(["/api/portrait/generate", "/api/portrait/avatar", "/api/portrait/full-body", "/api/portrait/delete", "/api/portrait/reference"]);
/** Save/Load v1 campaign lifecycle (host mode only). */
const CAMPAIGN_ROUTES = new Set(["/api/campaigns/create", "/api/campaigns/load", "/api/campaigns/close", "/api/campaigns/delete", "/api/save"]);
interface Message { readonly comparison_id?: string; readonly role: "player" | "narrator" | "system"; readonly text: string }
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/client.js", ["client.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);

/**
 * Transport only: all game operations go through the application facade.
 *   - Given a GameSession (disposable playtest mode): that one session, a server-held transcript starting with the playtest opening.
 *   - Given a SessionHost (Save/Load v1 persistent campaigns): the host's active session (or none: start screen), the session-owned
 *     transcript, and the campaign create/load/close/save routes.
 */
export function createPlaytestServer(target: GameSession | SessionHost, assetDir = resolve("src/ui"), comparisons?: NarratorAlternatives, canonAvatarDir = CANON_AVATAR_DIR, options: { readonly log?: (line: string) => void } = {}) {
  const log = options.log ?? (() => undefined);
  const host = target instanceof SessionHost ? target : undefined;
  const fixed = target instanceof GameSession ? target : undefined;
  const legacyMessages: Message[] = [{ role: "narrator", text: UI_PLAYTEST_OPENING }];
  const comparable = new Set<string>();
  const current = (): GameSession | undefined => fixed ?? host?.active;
  const messages = (session: GameSession): readonly Message[] => fixed ? legacyMessages
    : session.getTranscript().map(m => ({ role: m.role, text: m.text, ...(m.role === "narrator" && m.turn_id && comparable.has(m.turn_id) ? { comparison_id: m.turn_id } : {}) }));
  const state = () => {
    const session = current();
    if (!session) return { campaign: null, messages: [], status: "idle", configured: true };
    const view = session.getView();
    const play = session.getPlayUiView();
    return { messages: messages(session).map(message => message.comparison_id ? { ...message, comparison_available: comparisons?.has(message.comparison_id) ?? false, alternatives: comparisons?.results(message.comparison_id) ?? [] } : message), ...(comparisons ? { alternate_models: ALTERNATE_NARRATOR_MODELS } : {}), status: session.status, configured: view.session.provider.configured,
      revision: view.session.revision,
      ...(host ? { campaign: { id: session.campaignId, display_name: session.campaignMeta.display_name ?? session.campaignId, save: view.session.save } } : {}),
      scene: { location: view.scene.location.name, location_id: view.scene.location.id, time_of_day: view.scene.time.time_of_day, date_text: view.scene.environment.date_text },
      play,
      player_character: session.getPlayerProfileView(),
      inventory: session.getPlayerInventoryView(),
      trade: session.getTradeView(),
      confirmations: session.getConfirmationView(),
      provisional: session.getProvisionalPeopleView(),
      household: play.household.map(h => ({ members: h.members.map(m => ({ name: m.name_known ? m.name : "Unfamiliar household member", presence: m.presence, ...(m.known_location ? { location: m.known_location } : {}) })) })) };
  };
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (code: number, data: unknown) => reply(res, code, "application/json; charset=utf-8", JSON.stringify(data));
    // Loopback only, with a same-origin write boundary (including DNS-rebinding protection).
    const reqHost = req.headers.host;
    if (!reqHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(reqHost)) { json(403, { error: "Local access only." }); return; }
    if (req.method === "POST" && (req.headers.origin && req.headers.origin !== `http://${reqHost}` || req.headers["sec-fetch-site"] === "cross-site")) {
      json(403, { error: "Local access only." }); return;
    }
    try {
      if (req.method === "GET" && req.url === "/api/session") { json(200, state()); return; }
      if (req.method === "GET" && req.url === "/api/inventory") {
        const session = current(); json(200, session ? session.getPlayerInventoryView() : { campaign_id: null, items: [] }); return;
      }
      const glyph = req.method === "GET" ? /^\/api\/item-glyph\/([a-z]{3,12})$/.exec(req.url ?? "")?.[1] : undefined;
      if (glyph) {
        // Static category fallback glyphs (closed name set; nothing campaign-specific, no path is built from the request).
        if (!isItemGlyphName(glyph)) { json(404, { error: "Not found." }); return; }
        reply(res, 200, "image/svg+xml", ITEM_GLYPHS[glyph]); return;
      }
      const itemAsset = req.method === "GET" ? /^\/api\/inventory\/sprite\/([a-z][a-z0-9_]{0,119})\/([a-z][a-z0-9_]{0,119})$/.exec(req.url ?? "") : undefined;
      if (itemAsset) {
        const session = current();
        if (!session || session.campaignId !== itemAsset[1] || !session.getInventoryVisuals("nicco").some(i => i.id === itemAsset[2])) { json(404, { error: "Not found." }); return; }
        const file = await session.readItemSprite(itemAsset[2]!);
        if (!file) { json(404, { error: "Not found." }); return; }
        res.writeHead(200, { "Content-Type": file.media_type, "Content-Length": String(file.bytes.length) }); res.end(file.bytes); return;
      }
      if (req.method === "GET" && req.url === "/api/save-status") {
        // Cheap poll for the header indicator (autosave runs in the background): no view or context derivation.
        const session = host?.active;
        json(host ? 200 : 404, session ? { campaign: { id: session.campaignId, save: { state: session.hasUnsavedChanges ? "unsaved" : "saved", ...session.saveStatus() } } } : { campaign: null }); return;
      }
      if (req.method === "GET" && req.url === "/api/optional-services") {
        // Block 6: runtime service health (enabled / running / last success or error code). Diagnostic only: never narration, never a revision bump.
        const session = current();
        json(200, { services: session ? session.getOptionalServices() : [] }); return;
      }
      if (req.method === "GET" && req.url === "/api/campaigns") {
        if (!host) { json(404, { error: "Not found." }); return; }
        json(200, { campaigns: await host.listCampaigns(), scenarios: host.scenarios, active_campaign_id: host.active?.campaignId ?? null }); return;
      }
      // Authored canonical avatars: registered opaque tokens only (no path, name or other text is ever joined into a file path).
      const canonId = req.method === "GET" ? /^\/api\/canon-avatar\/([0-9a-f]{24})$/.exec(req.url ?? "")?.[1] : undefined;
      if (canonId) {
        const bytes = await readCanonAvatar(canonId, canonAvatarDir);
        if (!bytes) { json(404, { error: "Not found." }); return; }
        res.writeHead(200, { "Content-Type": "image/png", "Content-Length": String(bytes.length), "Cache-Control": "no-cache" }); res.end(bytes); return;
      }
      // Portrait Image Generation V1: stored portrait/reference bytes by opaque token only (no path, ID or name is accepted).
      const assetToken = req.method === "GET" ? /^\/api\/portrait\/asset\/([0-9a-f]{32})$/.exec(req.url ?? "")?.[1] : undefined;
      if (assetToken) {
        const file = await current()?.readPortraitAsset(assetToken);
        if (!file) { json(404, { error: "Not found." }); return; }
        res.writeHead(200, { "Content-Type": file.media_type, "Content-Length": String(file.bytes.length) }); res.end(file.bytes); return;
      }
      if (req.method === "POST" && (req.url === "/api/turn" || req.url === "/api/alternative" || req.url === "/api/location" || req.url === "/api/appearance" || req.url === "/api/player-character" || req.url === "/api/npc-plus/promote" || req.url === "/api/people/keep" || req.url === "/api/trade/accept" || req.url === "/api/confirmation/confirm" || req.url === "/api/confirmation/cancel" || req.url === "/api/repair/request" || PORTRAIT_ROUTES.has(req.url ?? "") || CAMPAIGN_ROUTES.has(req.url ?? ""))) {
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
        const fields = input && typeof input === "object" ? input as Record<string, unknown> : {};
        if (CAMPAIGN_ROUTES.has(req.url ?? "")) {
          if (!host) { json(404, { error: "Not found." }); return; }
          if (req.url === "/api/save") {
            const session = host.active;
            if (!session) { json(409, { ok: false, error: { message: "No campaign is open." }, ...state() }); return; }
            const outcome = await session.save({ reason: "manual" });
            // Revision and time only: no file names, slots or paths reach the browser.
            const result = outcome.ok ? { ok: true as const, saved: { revision: outcome.saved.revision, saved_at: outcome.saved.saved_at }, ...(outcome.transcript_error ? { transcript_error: true } : {}) } : outcome;
            json(outcome.ok ? 200 : outcome.error.code === "turn_in_progress" || outcome.error.code === "save_in_progress" ? 409 : 500, { ...result, ...state() }); return;
          }
          const outcome = req.url === "/api/campaigns/create" ? await host.createCampaign({ display_name: fields.display_name, scenario_id: fields.scenario_id })
            : req.url === "/api/campaigns/load" ? await host.loadCampaign({ campaign_id: fields.campaign_id, slot: fields.slot })
            : req.url === "/api/campaigns/delete" ? await host.deleteCampaign({ campaign_id: fields.campaign_id }) : await host.closeCampaign();
          if (outcome.ok) comparable.clear();
          json(outcome.ok ? 200 : outcome.error.code === "turn_in_progress" || outcome.error.code === "campaign_locked" ? 409 : 422, { ...outcome, ...state() }); return;
        }
        const session = current();
        if (!session) { json(409, { ok: false, error: { message: "No campaign is open." }, ...state() }); return; }
        if (req.url === "/api/location") {
          if (!input || typeof input !== "object" || !("target" in input) || !("expected_revision" in input) || typeof input.target !== "string" || typeof input.expected_revision !== "number") {
            json(400, { ok: false, error: { message: "Expected target and current revision." }, ...state() }); return;
          }
          const outcome = session.overridePlayerLocation({ target: input.target, expected_revision: input.expected_revision });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422,
            { ...result, ...state() }); return;
        }
        if (PORTRAIT_ROUTES.has(req.url ?? "")) {
          // The browser supplies only the opaque ref, the revision it saw, the kind and a pose id (generate; both validated against the
          // server's enums), an opaque Gallery item token (roles, delete) or the reference image itself: never a prompt, model, seed, size,
          // batch size, path, file name, version ID or character ID. The server builds the prompt from committed appearance.
          const base = { ref: fields.ref, expected_revision: fields.expected_revision };
          // Development diagnostics: kind, the opaque ref the browser already holds and the duration; never a prompt, seed or character id.
          const generating = req.url === "/api/portrait/generate", startedAt = Date.now();
          if (generating) log(`portrait generate started kind=${String(fields.kind)} target=${String(fields.ref)}`);
          const outcome = req.url === "/api/portrait/generate" ? await session.generateNpcPortraitBatch({ ...base, kind: fields.kind, pose: fields.pose })
            : req.url === "/api/portrait/avatar" ? session.setNpcPortraitAvatar({ ...base, item: fields.item })
            : req.url === "/api/portrait/full-body" ? session.setNpcPortraitFullBody({ ...base, item: fields.item })
            : req.url === "/api/portrait/delete" ? await session.deleteNpcPortrait({ ...base, item: fields.item })
            : await session.setNpcPortraitReference({ ...base, image: fields.image });
          if (generating) log(`portrait generate ${outcome.ok ? "completed" : `failed code=${outcome.error.code}`} kind=${String(fields.kind)} target=${String(fields.ref)} duration_ms=${Date.now() - startedAt}`);
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : outcome.error.code === "portrait_generation_failed" ? 502 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/appearance") {
          // Permanent Appearance V1: the Household editor's narrow write; eligibility, revision and patch rules live in GameSession.
          const outcome = session.updateNpcAppearance({ ref: fields.ref, expected_revision: fields.expected_revision, patch: fields.patch });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/trade/accept") {
          // Actual Offer V1: the browser sends only the opaque offer ref and the revision it rendered; the engine revalidates and settles atomically.
          const outcome = session.acceptTradeOffer({ ref: fields.ref, expected_revision: fields.expected_revision });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/confirmation/confirm" || req.url === "/api/confirmation/cancel") {
          // Block 5A: the browser sends only the opaque ref and the revision it rendered; the engine resolves, revalidates and (for confirm) commits the deterministic act.
          const request = { ref: fields.ref, expected_revision: fields.expected_revision };
          const outcome = req.url === "/api/confirmation/confirm" ? session.confirmPending(request) : session.cancelPending(request);
          // The session `status` field of the state payload would shadow the outcome's own `status`, so the outcome is reported as `confirmation`.
          const { view: _view, ...rest } = outcome, result = outcome.ok ? { ...rest, confirmation: outcome.status } : rest;
          delete (result as { status?: string }).status;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/repair/request") {
          // Block 5B: a HUMAN operator's explicit identity repair request (retire / merge) by explicit ids. It only creates a PendingConfirmation (or reports conflicts);
          // the existing confirm/cancel routes decide. Never reachable from the Narrator, the Controller or a scanner.
          const outcome = session.requestRepair({ operation: fields.operation, character_id: fields.character_id, target_id: fields.target_id, expected_revision: fields.expected_revision });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/people/keep") {
          // Block 12 (KPG-1) Keep track: the browser sends only the opaque person token and the revision it rendered; the engine recomputes and decides.
          const outcome = session.keepTrack({ token: fields.token, expected_revision: fields.expected_revision });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/npc-plus/promote") {
          // Heartstone rite confirmation: the browser sends only the opaque ref and the revision it rendered; eligibility lives in GameSession.
          const outcome = session.completeHeartstoneRite({ ref: fields.ref, expected_revision: fields.expected_revision });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/player-character") {
          // Player Character Profile V1: the player's narrow profile write; the patch, revision and bounds rules live in GameSession.
          const outcome = session.updatePlayerProfile({ expected_revision: fields.expected_revision, patch: fields.patch });
          const { view: _view, ...result } = outcome;
          json(outcome.ok ? 200 : outcome.error.code === "stale_turn" || outcome.error.code === "turn_in_progress" ? 409 : 422, { ...result, ...state() }); return;
        }
        if (req.url === "/api/alternative") {
          if (!comparisons || !input || typeof input !== "object" || !("message_id" in input) || !("model" in input) || typeof input.message_id !== "string" || typeof input.model !== "string" || !messages(session).some(message => message.role === "narrator" && message.comparison_id === input.message_id)) {
            json(400, { ok: false, error: "Invalid comparison request." }); return;
          }
          const result = await comparisons.regenerate(input.message_id, input.model);
          json(result.ok ? 200 : 422, result); return;
        }
        const text = fields.text;
        if (typeof text !== "string" || !text.trim() || text.length > 4000) { json(400, { error: "Enter 1–4000 characters." }); return; }
        // REV-2: the request identity is part of the contract. A turn without a valid key and the revision the player saw is malformed (no provider is called).
        const turnKey = fields.turn_key, expectedRevision = fields.expected_revision;
        if (!validTurnKey(turnKey) || typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) { json(400, { error: "Malformed turn request: it needs a turn key and the revision shown." }); return; }
        if (session.status === "idle" && !session.turnKeyKnown(turnKey)) comparisons?.begin();
        const streaming = req.headers.accept === "application/x-ndjson";
        const abort = new AbortController();
        const disconnected = () => { if (!res.writableEnded) abort.abort(); };
        if (streaming) { res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" }); res.flushHeaders(); res.on("close", disconnected); }
        const writeEvent = (event: unknown) => { if (!res.destroyed) res.write(JSON.stringify(event) + "\n"); };
        // PIPE-1: while the turn runs the browser receives status words only (`progress`), never narrator prose; the narration arrives once, inside the final `result`.
        const outcome = await session.submitPlayerInput(text.trim(), { turn_key: turnKey, expected_revision: expectedRevision, ...(streaming ? { signal: abort.signal, onEvent: event => {
          if (event.type === "turn_progress") writeEvent({ type: "progress", phase: event.phase });
        } } : {}) });
        res.off("close", disconnected);
        if (outcome.ok) {
          // A duplicate (replayed or joined) executed nothing: it must not touch the transcript mirrors or the comparison capture a second time.
          if (!outcome.replayed) {
            try {
              const comparison = comparisons?.finalize(outcome.turn_id) ? outcome.turn_id : undefined;
              if (fixed) legacyMessages.push({ role: "player", text: text.trim() }, { role: "narrator", text: outcome.narration, ...(comparison ? { comparison_id: comparison } : {}) });
              else if (comparison) comparable.add(comparison);
            } catch { console.error("Playtest turn published with warnings: comparison_capture"); }
          }
          // PIPE-2: the turn is committed; a failure while describing the new state must not turn it into an error response.
          let snapshot: Record<string, unknown>;
          try { snapshot = state(); } catch {
            console.error("Playtest turn published with warnings: state_view");
            snapshot = { messages: [{ role: "player", text: text.trim() }, { role: "narrator", text: outcome.narration }], status: "idle", configured: true, warnings: ["state_view"] };
          }
          const warnings = [...new Set([...(outcome.warnings ?? []), ...(Array.isArray(snapshot.warnings) ? snapshot.warnings as string[] : [])])];
          const { warnings: _w, ...rest } = snapshot;
          const body = { ok: true, ...rest, ...(warnings.length ? { warnings } : {}), ...(outcome.replayed ? { replayed: true } : {}) };
          if (streaming) { writeEvent({ type: "result", ...body }); res.end(); }
          else json(200, body);
        } else {
          console.error(`Playtest turn failed: ${outcome.error.code}${outcome.error.provider_code ? ` (${outcome.error.provider_code})` : ""}`);
          const conflict = outcome.error.code === "turn_in_progress" || outcome.error.code === "stale_turn" || outcome.error.code === "turn_key_conflict";
          if (streaming) { writeEvent({ type: "result", ok: false, error: outcome.error, ...(outcome.replayed ? { replayed: true } : {}), ...state() }); res.end(); }
          else json(conflict ? 409 : 422, { ok: false, error: outcome.error, ...(outcome.replayed ? { replayed: true } : {}), ...state() });
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
