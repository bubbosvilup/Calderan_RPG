# Caldrevan minimal playtest UI V0

Date: 2026-10-05.

## UI CONTRACT FOUND

`docs/UI_ENGINE_CONTRACT.md` is authoritative. Inspected package.json, tsconfig.json, src/app, the developer entrypoint, engine freeze notes, and UI/frontend/interface/desktop/web/React/chat/client/view/presentation/contract references. No existing frontend stack or required framework was found. The contract's GameSession boundary, final narration, busy states, and errors apply; larger panels and save/load UX are deferred.

## IMPLEMENTATION

Plain HTML/CSS/JavaScript and Node's built-in HTTP server; no dependencies added. One restrained charcoal/parchment chat screen, left narrator messages, right player messages, bottom textarea and Send. Enter sends; Shift+Enter inserts a newline; composition Enter is respected. Blank input is ignored. Input is disabled while pending or while the session is not idle. Successful submissions clear the draft and scroll to the latest finalized message. Failed turns preserve the draft and show a separate error. Text renders through textContent. The server binds only to 127.0.0.1 and checks local Host and same-origin writes.

## PLAYTEST START

Canonical location found: **YES**, `calderan_slave_market` (Calderan Slave Market; aliases include The Slave Pens). Source: `data/locations/calderan/west/calderan_slave_market.yaml`. Inspected adjacent Back Alleys and authored Nicco, Korvin, Mistress Elara and Bartolomhew records. Canon supports a broad packed-earth/gravel square, holding pens, auctions, clerks, patrols, loading/unloading and private sellers. Exits connect to west_outer_lane and slave_market_back_alleys. No invented permanent location or named NPC was added.

Application-owned `createUIPlaytestSession` wraps the existing canonical opening as `ui_playtest`, with a PLAYTEST-ONLY location/daytime override to the Slave Pens at minute 600. This presents Nicco's immediate arrival instead of the normal Heartstone start one day later. Existing player identity, private opening facts, 500 gold and empty Heartstone household are retained. Canon and evaluation campaigns are untouched. Nothing is saved; restarting creates a fresh campaign. Reloading the page retains the current process's transcript.

## OPENING MESSAGE

Deterministic, 163 words, zero provider calls. Exact text:

> Suddenly there is daylight, dust, and the sound of voices all around Nicco.
>
> Packed earth and loose gravel stretch across a broad square. Feet and wagon traffic have churned its surface into uneven tracks. The air carries the smell of animals and close-packed people. Somewhere ahead, a voice calls out above the bargaining; another answers with a price.
>
> Holding pens stand beside the auction area. People wait inside them while buyers gather outside, looking them over. A handler brings a captive out for display. The conversation nearby continues without a pause.
>
> At the edge of the auction, clerks attend to sale papers. Guards patrol through the traffic. Caravans are being loaded and unloaded, and people step around the work on their way between the pens and the sellers beyond. There is no hush around the trading, no attempt to conceal what is being bought.
>
> The next price is called. Between the auction crowd and the holding pens, a strip of open ground remains.

These ordinary ambient actions are disposable opening staging grounded in the location record, not new durable entities or canon. Nicco's choices, thoughts and dialogue are left to the player.

## ENGINE INTEGRATION

Browser → local HTTP adapter → GameSession.submitPlayerInput → existing production TurnCoordinator → narrator/controller/audit/commit → authoritative campaign. Startup uses createProductionDeps and the small application scenario adapter; UI modules never import or mutate CampaignState, providers, saves or turn internals. Only successful outcome.narration is appended, paired with its player input. Draft and failed-turn narration are hidden. GameSession rejects overlapping requests across tabs. Existing production mannerism maintenance remains enabled. Reflection is explicitly off; narrator exposure stays off. D-09 DEFERRED / SHADOW is unchanged; D-19 and D-22 are untouched.

## FILES CHANGED

- `src/app/ui-playtest.ts`: small scenario-start adapter and opening constant.
- `src/ui/play.ts`, `server.ts`, `index.html`, `client.js`, `style.css`: entrypoint, transport, single screen and styles.
- `tests/ui-playtest.test.ts`: four focused tests.
- `package.json`: play:ui command.
- `README.md`, `docs/UI_ENGINE_CONTRACT.md`, this report: launch and adapter documentation.

No existing engine implementation was changed; the application adapter is additive.

## TESTS

- Typecheck: PASS.
- Full unit suite: **2024 passed, 0 failed, 4 unchanged TODOs** (2020 baseline plus four new checks).
- Offline playthrough: **25/25**.
- Focused UI/application: **4/4**. Covers production startup with no opening call, canonical Nicco/location, real GameSession/coordinator integration, HTTP opening/assets, finalized transcript, concurrent rejection, provider failure without secret leakage, recovery, composer Enter/Shift+Enter/blank/pending behavior, draft clearing/preservation, safe text rendering, scrolling and UI import/mutation boundary.
- Production launch smoke: server returned the opening and screen assets. One live input, “I look at the public auction and listen to the nearby bargaining.”, completed through the configured production providers; endpoint returned ok=true, status=idle and three transcript messages. Server was stopped afterward.
- Visual browser smoke unavailable: browser discovery returned no connected browsers. No visual inspection is claimed; browser event behavior was checked with the focused DOM harness.

## HOW TO RUN

From `C:\Users\be_fr\CaldrevanRPG`, with Node 22+ and dependencies installed:

```powershell
npm run play:ui
```

Open **http://127.0.0.1:3000**. Set `OPENROUTER_API_KEY` in the launching environment to play live turns. Optional `OPENROUTER_NARRATOR_MODEL`, `OPENROUTER_CONTROLLER_MODEL`, and `MANNERISM_EXTRACTOR_MODEL` retain existing production defaults. No key is needed for the opening. No Voyage key is required; retrieval remains the production lexical default. V0 sets reflection off regardless of CALDREVAN_REFLECTION_MODE. Keys stay server-side; no new secret-file loader was added. Live turns use paid providers. Stop with **Ctrl+C**; unsaved disposable state is discarded.

## INTENTIONALLY NOT IMPLEMENTED

All non-chat gameplay UI: inventory, character/NPC/household/relationship panels, maps, quests, codex, settings, provider/reflection/mannerism controls, debug/admin tools, portraits, generated assets, animations, sound, character creation, save/load menus or persistence. No engine expansion or refactoring.

## KNOWN V0 LIMITATIONS

Single local process/session and fixed port 3000. Transcript/state are lost when the process stops. Multiple tabs share the same campaign; an idle tab refreshes its transcript on reload or submission. No token streaming or provisional story display; narration appears after the full session operation, including existing post-turn maintenance. On transport interruption the client checks the current transcript and preserves its draft; review before resending because a turn may already have committed. Logs are ordinary console errors with safe failure codes. No visual browser QA was possible in this environment.
