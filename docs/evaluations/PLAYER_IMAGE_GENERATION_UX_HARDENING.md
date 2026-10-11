# Player / NPC+ image generation UX and async hardening

Date: 2026-10-11. Base: main 3bf6704 plus this uncommitted change. No commit, no push.

## 1. Verdict

UX_HARDENED. Generation was **not broken, only opaque** (case B, frontend waiting with poor feedback). The panel now shows a live progress block, three placeholder tiles, an elapsed timer, honest latency text, a long-wait message, a client-side safety timeout, inline errors and development diagnostics. Provider, batch size, adult-only gating, gallery model, selection logic, save schema and LLM context are unchanged.

## 2. Root cause

Clicking Generate did start work: the button switched to "Generating 3 avatars…" and a small text line changed. But the only other signal was one 11px status line in the Generation section, which sits below the Full Body panel in a scrolling column, so it was off-screen when the user clicked the Avatar button. Nothing moved for 30 to 90 seconds, then everything refreshed at once.

## 3. What happens after a click (all four paths)

Player Avatar, player Full Body, NPC+ Avatar and NPC+ Full Body share one path:

1. `client.js` `portraitRequest("/api/portrait/generate", {kind, pose}, "generate")` (one handler for both editors; the player editor is the shared editor in player mode).
2. One `fetch` POST with the opaque ref, the opened revision, kind and pose.
3. `server.ts` route calls `GameSession.generateNpcPortraitBatch` and awaits it.
4. The service runs three provider calls in parallel (`Promise.allSettled`), one same-seed recovery attempt per slot for retryable failures, stages the images, then commits one atomic revision with the asset metadata.
5. The HTTP response is sent only after the commit, carrying the fresh state and a message; the client then re-renders the gallery from that state.

Answers to the report questions:

- **Where the time is spent:** almost entirely in the provider calls (each up to a 180 s provider timeout, 60 s download timeout). Staging and commit are milliseconds.
- **Synchronous end to end:** yes. The browser waits on one long HTTP response; there is no job, polling or streaming.
- **Saved before the response returns:** yes.
- **UI refreshes only after full completion:** yes, by design; the response carries the refreshed projection, so there is no second fetch and no race that could hide new images. New images are not auto-selected except the existing Avatar bootstrap rule (first avatar batch with no Avatar).

I kept the synchronous design: it is correct and simple, and the missing piece was lifecycle feedback, not a job system.

## 3b. Lifecycle design (client)

- Click: within about 100 ms a sticky progress block appears at the top of the portrait column (visible whatever the scroll position): spinner, "Generating 3 avatar images" or "Generating 3 full-body images", stage text, an elapsed seconds counter and the hint "Image generation can take up to about a minute. You can keep editing; only the portrait controls wait."
- Stages: "Request sent" (first second), "Generating…", and after 90 s "Taking longer than usual. The request is still running." There is no honest "Saving results" stage because the server does not report it, so I did not fake one.
- Three animated placeholder tiles appear at the head of the Gallery while the request runs and disappear on completion or failure.
- Only the generate buttons, pose selectors and gallery role/delete controls wait (one batch at a time per session, as before). Appearance fields stay editable.
- Success: progress and placeholders clear, the gallery shows the three new images in the right bucket, and the existing message ("3 avatar options generated.") stays.
- The progress timer is unref'd and cleared on every exit path.

## 4. Error and timeout handling

- Server failures (502/409/422) show the server's message inline in the existing error region; the button state is restored; retry is immediate.
- Network failure shows "The portrait request failed. Check the connection and try again."
- Safety timeout: the browser aborts after 6 minutes (longer than the worst provider timeout plus the one recovery), with "No response after 6 minutes. The images may still have been saved: check the Gallery, then try again if it is empty." A request still valid after a long wait is never cancelled earlier than that.
- Existing retries are preserved: one same-seed recovery per slot and one refusal recovery. In the controlled failure run this made a total failure take about 24 s.

## 5. Result propagation

The response includes the full refreshed state, so gallery, selected Avatar/Full Body, counts and revision update in one render. Kind-to-bucket mapping is unchanged (tests assert the `kind-avatar`/`kind-fullbody` classes).

## 6. Diagnostics

- Browser console (development): `[portrait] request started | completed | failed` with kind, the opaque editor ref, duration and error code.
- Server (`play:ui` prints it; tests capture it): `portrait generate started kind=… target=<opaque ref>`, then `completed` or `failed code=…` with `duration_ms`. No prompt, seed, character id or path is logged. `createPlaytestServer` gained an optional `{ log }` option; default is silent.

## 7. Tests

Added to `tests/ui-v1.test.ts` (15 tests) and `tests/player-character-profile.test.ts` (1), mapped to the brief: G1 to G4 (player and NPC+, Avatar and Full Body enter loading), G5/G6/G15 (completion clears loading, refreshes, correct bucket), G7/G8 (failure and network failure clear loading, show the error, retry works), G9/G10 (only portrait controls blocked, appearance fields usable), G11 (identical lifecycle for player and NPC+), G12 (schema versions 6 and 5 asserted), G13 (request body exactly `ref, expected_revision, kind, pose`; nothing else sent), G14 (a held request keeps live stage and elapsed after more than a second), plus a server test that the player route logs started/failed with kind, opaque ref and duration.

## 8. Real-browser validation

Chromium (Playwright) against the real `play:ui` server code, with a **fake image generator that takes 12 s per batch** (no `HF_TOKEN` and no network in this environment, so a real provider run was impossible). Verified on Nicco:

- Avatar: 139 ms after the click the progress block, 3 placeholders and the button label were present; at 5 s the stage read "Generating…, 5 s"; typing in an appearance field during the wait worked; at about 12 s the progress cleared, 3 thumbnails appeared and "3 avatar options generated." showed.
- Full Body: same behavior.
- Failure (generator throwing): about 24 s later the progress cleared, the inline error "Portrait generation failed. The image provider failed. Nothing was saved." showed, and the buttons were usable again.
- Console and server logs showed started/completed/failed with durations.

**Not verified in a browser:** an NPC+ target (the disposable playtest has no NPC+ household member) and a real provider latency of 30 to 90 s. The NPC+ path runs through the identical handler and is covered by tests G3, G4 and G11.

## 9. Validation

`npm run typecheck`: clean. `npm run build`: clean. `npm test`: **3153 tests, 3153 pass, 0 fail, 0 skipped** (offline).

## 10. Remaining image UX debt

- No server-side progress or job id: closing the tab mid-generation loses the result view (the images still save; reopen the editor to see them), and a retry during an orphaned request gets "Portraits are already being generated."
- The 3 images arrive together; there is no per-image streaming.
- Gallery placeholders are below the fold in the narrow column; the sticky progress block compensates.
- Canon avatar PNGs are still full-size originals; no Upload; no thumbnails.
