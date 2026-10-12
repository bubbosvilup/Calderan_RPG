# Audit D: UI/UX product audit and documentation reconciliation

Repo: /home/user/Calderan_RPG, main c0608a6, clean tree, nothing in the repo touched. Zero network or LLM calls.

## 0. Method and limits (read first)

- The UI could NOT be launched, so there are no screenshots. `node_modules` is absent and the `yaml` dependency (imported by `src/world/loader.ts:3` and `src/economy/economy.ts:5`) exists nowhere on the machine or in the npm cache. Building and calling `loadWorld` offline is therefore impossible. Playwright 1.56.1 and Chromium exist (`/opt/pw-browsers/chromium`), so the browser half works once `yaml` is available (for example `npm ci` on a networked machine, or a vendored copy).
- `tsc` (global v6.0.2) was not run: no `yaml` and no `@types/node` in the repo, so a typecheck would only produce noise.
- The UI part is a **static review** of `src/ui/client.js` (1171 lines), `index.html`, `style.css` (609 lines), `server.ts` (230 lines) and the read models they consume. Statements about rendered appearance (contrast, wrapping, mobile) are derived from CSS, not seen, and are marked "(static)".
- Docs were compared to the code for the normative set. The test count could not be re-run; it is taken from commit reports.

Classification keys: BUG, CONSISTENCY, USABILITY, ACCESSIBILITY, RESPONSIVE, PERFORMANCE, POLISH, FUTURE.

---

## PART 1. UI/UX

### 1.1 Highest-priority findings

| # | Class | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| U1 | ACCESSIBILITY / BUG | The character drawer's Tab trap cycles only `[close, appearance-tab, story-tab]`. "Promote to NPC+" (arrow, Cancel, Promote), "Edit NPC+", "Generate" and "Upload" can never be reached with Tab: the handler calls `preventDefault` and wraps among those three. The only keyboard route to Promote is the programmatic `focus()` after the arrow click, which needs the unreachable arrow. The most consequential mutating action in the drawer is mouse-only. | `client.js:707-713` (keydown), controls built in `renderCharacterActions`/`renderPromotion` (`client.js:~664-700`) | Compute the focus list at keydown time: all visible, enabled `button, [href], [tabindex]` descendants of `#character-drawer` (the lightbox trap at `client.js:~395-402` is the model, but with `querySelectorAll`). Better: make `<main>` `inert` while the dialog is open and drop the manual trap. |
| U2 | USABILITY / CONSISTENCY | "Accept offer" (spends gold, may transfer a person, irreversible) is an unstyled default button with no confirm step, while "Promote to NPC+" (also irreversible) has an inline confirm. `.trade-accept` has only cursor/disabled rules (`style.css:406-407`). `trade-buy`/`trade-sell` classes are emitted (`client.js` `renderTrade`) but no CSS targets them, so BUY vs SELL differ only by the text glyph; the 4px left border is the same colour. | `style.css:395-410`; `client.js` `renderTrade` | One visual rule for "commits authoritative state": filled primary (like `#send`, pink) for Accept with the price in the label ("Accept: 5 gold"); distinct border colours for BUY and SELL (keep glyph + text). For person purchases use the Promote-style inline Cancel/Confirm. Write the rule into `docs/UI.md`. |
| U3 | USABILITY | ACCEPT and "Promote to NPC+" are distinguishable only by location and wording. Promote is a bare `↑` glyph (`aria-label` and `title` only), visually weaker than the harmless "Edit NPC+". | `index.html` `#character-promote-button`, `style.css:387-388` | Replace the arrow by a text button "Promote to NPC+" (cyan outline, secondary line "Heartstone household rite"), keep the inline confirm. Reserve the filled pink style for Send and Accept, so the two state-mutating actions never look like navigation buttons. |
| U4 | PERFORMANCE | `/api/session` returns the whole transcript on every call and `render()` rebuilds the scene sidebar, household list and trade region each time. While a turn runs the client polls every 1 s (`render` end), a 4 s save-status poll runs forever, including in background tabs. A 500-turn campaign = ~1000 messages per poll and a DOM that only grows (`conversation.append`; `shown` only avoids re-creating bubbles). | `server.ts` `state()`, `client.js` `render`, `load`, `renderCampaign` | (1) `GET /api/session?after=<n>` or a message-count handshake so polls return only new messages (client already tracks `shown`). (2) Pause `poll`/`savePoll` when `document.hidden`. (3) Collapse old exchanges ("Show earlier", render last ~60) or add `content-visibility:auto; contain-intrinsic-size` on bubbles as a one-line mitigation. (4) Skip the sidebar rebuild when the scene payload is unchanged. |
| U5 | BUG (misleading error) | `/location` with a stale revision returns `stale_turn` whose default text is "The campaign changed while the turn was running. The turn was discarded." (no turn exists). The server also returns `candidates` (up to 5 ids) for unknown/ambiguous locations, but the client never reads `data.candidates`, so "use a canonical ID" gives no ids. | `game-session.ts:314` (no custom message), `app-errors.ts` stale_turn text; `server.ts:135-143`; `client.js` submit handler `/location` branch | Custom message at `game-session.ts:314` ("The campaign changed since this page loaded. Try again."); append `data.candidates` in the client; document `/location` in the composer hint. |
| U6 | USABILITY | Editor stale-revision text is accurate ("Reopen the editor...") but `editorRevision` is captured on open. Any commit in between (item sprite metadata commits, a changed offer) makes the next Save/Generate fail; recovery means leaving the editor and losing typed edits. `ACTUAL_OFFER.md` section 10 admits the same one-off stale on Accept. | `client.js` `saveEditor`, `portraitRequest`; `game-session.ts:492,607,683` | Portrait actions should send `currentRevision` (they do not depend on form state). On `stale_turn` in appearance Save, refresh `editorRevision = currentRevision` and retry once automatically, or offer "Use latest revision" which keeps the typed values. |

### 1.2 Full findings by area

**Layout, hierarchy, density**
- U7 POLISH: the sidebar shows "In the scene" and "Household" (plus a Household nav view). With 20+ characters both lists are unbounded: desktop scrolls inside `.scene-sidebar{overflow:auto}`; on mobile (<=720px) the sidebar sits under a 75dvh story pane and the page scrolls. Cap "In the scene" at ~8 rows with "+N more" in a `<details>`, ordered player, NPC+, named, unknown; reduce the Household panel to a one-line count with a link. (static)
- U8 RESPONSIVE: long names. `.scene-participant strong` and its flex child span have no `min-width:0`/`overflow-wrap:anywhere` (`style.css:198-210`); one long token overflows the 280px sidebar. Same gap for `#character-name`, `.household-member strong`. Add `min-width:0; overflow-wrap:anywhere`. (static)
- U9 POLISH: `#location-id` (`<code>`) prints the raw internal location id (for example `calderan_slave_market`) to the player (`index.html`, `client.js` `renderScene`). Everything else hides ids. Remove or put behind a debug toggle.
- U10 POLISH: gold is a bare integer in the sidebar and Inventory header ("Not tracked" when null). Format with `Intl.NumberFormat` and add the unit "gold".
- U11 POLISH: always-disabled "World" and "Debug" nav buttons and the disabled "Personality"/"Relations" drawer tabs cost header width on mobile and signal unfinished product. Hide them until built.
- U12 POLISH (dead CSS): `.top-bar nav button:last-child{border-left...}` targets the last child of `nav`, which is now `#save-status` (a span), so it matches nothing. The bare `article{grid-template-columns:100px ...}` rule hits every `<article>` (bubbles, household cards, campaign rows) and is overridden case by case; scope it to `#conversation>article`.
- U13 CONSISTENCY: three CSS dialects in one file: minified inventory block placed before `:root` (works only because custom properties are global), expanded core rules, and a rem-based trade block that falls back to undefined variables (`--panel`, `--danger`, `style.css:397,409`). Hard-coded hex colours (`#e8c872 #e8a23a #ff8a8a #ffb0ce #e07a7a #a78cff #97aed6 #f1dfb6 #edb0d0`) should become tokens (`--gold --warn --danger --narration --dialogue`).

**Chat readability**
- U14 POLISH: 21px serif, line-height 1.75, ~940px measure is good. Player bubbles are pink on a raised box; starred actions in player text do not get the narration colour, so a player's `*action*` and speech look alike apart from italic. Apply `.rpg-narration/.rpg-dialogue` colours inside `.player` too.
- U15 ACCESSIBILITY: `#conversation` is `role="log" aria-live="polite" aria-relevant="additions"`, and streaming does `replaceChildren` on every token (`client.js` `preview`). Screen readers can announce partial text repeatedly. Put the draft bubble outside the live region (or `aria-live="off"`) and announce only the finalized message.
- U16 USABILITY: the "Regenerate with..." selector appears under every narrator message when `comparison_available` (always, `play.ts` passes `comparisons`). It spends credits and is documented nowhere in `docs/UI.md`. Gate behind a Debug toggle; show a readable message instead of raw `failure_code` ("Alternative failed (rate_limited)").
- U17 positive: "Draft · Generating…" / "Revising…" labels and `.provisional{opacity:.65}` truthfully mark uncommitted prose.

**Identity masking / unknown identity**
- U18 CONSISTENCY: unknown identity is decided in the client by string comparison in three places: `person.name_known === false || person.category === "Name unknown"` (`renderScene`, `openCharacter`), `member.name === "Unfamiliar household member"` (household chip initial `?`), and the server fabricates that label in the legacy `household` payload (`server.ts` `state()`). The server category for the same state can be `"Met this campaign · name unknown"` (`player-character-view.ts:231`), which the exact match `=== "Name unknown"` misses (works only because `name_known` is also false). Expose one boolean plus a server-built `initial` on every card, delete all string compares and the legacy `household` field.
- U19 positive: masking is structural: trade card uses server-masked labels and opaque refs, the drawer footer says "Showing only what Nicco knows", unknown avatar is a dashed violet `?` (not colour alone).

**Player card, NPC cards, NPC+, Household**
- U20 CONSISTENCY: the player's editor heading is upper-cased (`card.name.toUpperCase()`, `renderEditor`), NPC headings are not.
- U21 USABILITY: Household cards have two tab stops (card, absolutely positioned "Edit"); verify the Edit button does not overlay the portrait in the 1-column layout at <=480px. (static)
- U22 USABILITY: drawer "Generate" and "Edit NPC+" both just open the editor (`open` callback in `renderCharacterActions`); "Generate" implies an immediate action. Rename to "Portrait editor" or "Generate…".
- U23 FUTURE: Personality/Relations tabs, avatar Upload, richer promotion screen (already in Roadmap).

**Inventory, gold, equipment**
- U24 PERFORMANCE: `renderInventory` rebuilds the whole grid on each search keystroke and each 2 s sprite poll, one lazy `<img>` per cell, no pagination or grouping. Fine to ~200 items. Debounce search (150 ms), key the nodes by item id, sort/group by category.
- U25 USABILITY: Head and Boots are permanently "Empty" (no headwear/footwear categories in the domain). Looks like the player forgot to equip. Hide them or add "No such item category yet".
- U26 POLISH: `#inventory-error` is `role="status"` but styled as an error; use `role="alert"` or a neutral style.

**Actual Offer card, receipts**
- U27 USABILITY: receipts are a client array (`tradeReceipts`, last 3) re-appended after the newest narrator message on every render, so a receipt drifts down the chat with each turn and vanishes on reload. Render it once as a persistent system line at the point of the deal (server-side transcript entry).
- U28 USABILITY: Accept error texts are actionable (`TRADE_MESSAGES`; e.g. "The campaign changed since this offer was shown. Check the current offer and try again."); unaffordable BUY says why. Missing: no reason shown when Accept is disabled because a turn is running; add `aria-describedby` "Wait for the narrator to finish".
- U29 POLISH: `.trade-label` is 0.7rem at opacity .7, likely under 4.5:1 (static). Use `--muted` at full opacity.

**Errors, loading states, stale revision**
- U30 POLISH: "Cannot reach the playtest. Check that npm run play:ui is running, then reload." is developer copy shown in production mode. Reword: "Lost connection to the game server. Reload to continue."
- U31 USABILITY: save failures go to the composer `#error` even when the user is in Inventory or Household, where it is hidden. Surface them in the always-visible `#save-status` plus a toast.
- U32 positive/POLISH: image-generation progress is honest (elapsed seconds, "Taking longer than usual" after 90 s, 6-minute abort with "may still have been saved"). Add a "Refresh Gallery" button to that timeout message.
- U33 USABILITY: campaign Delete has an inline two-step confirm (good), but "Confirm delete" looks the same as Cancel and the note ("Delete this campaign and its saves?") does not say it is a soft delete to `saves/.deleted/`.

**Navigation, keyboard, accessibility**
- U34 ACCESSIBILITY: `switchView("play")` always focuses `#household-nav` (`client.js` `switchView`) whichever view you left; the `view === "player"` branch is dead. Remember the nav button that opened the view and refocus it.
- U35 ACCESSIBILITY: drawer tabs have `role="tab"` but no roving `tabindex` or arrow-key handling, and are reachable only through the broken trap (U1). Implement the ARIA tabs pattern or drop the roles.
- U36 ACCESSIBILITY: the page behind the drawer/lightbox is not `inert`/`aria-hidden`; screen-reader cursors can escape the dialog. Set `inert` on `<main>`.
- U37 ACCESSIBILITY: Escape closes the drawer only when focus is inside it (keydown is on `#character-drawer`). Listen on `document` while open.
- U38 ACCESSIBILITY: reduced motion is respected for the only animations (spinner, pending box). Adequate.
- U39 ACCESSIBILITY: the save button is the emoji `&#128190;` (platform-dependent glyph) with an `aria-label`; add visible text at wide widths.
- U40 ACCESSIBILITY (static): `--muted #8291ae` on `#0b0f19` is ~6:1, fine; 18 declarations use 10-11px text (slot names, chips, labels). Floor at 12px.
- U41 USABILITY: the composer hint says "/ for commands" but only `/location` exists, unexplained in UI or docs. Show a help line on typing `/`, or remove the hint.

**Responsive (static)**
- U42 RESPONSIVE: at <=720px `.story{height:75dvh}` plus the sidebar below gives two scroll contexts; with the soft keyboard open the composer can be hidden. Use full-height story and a "Scene" bottom sheet.
- U43 RESPONSIVE: at 390px the header (title, clock pill with `Year 1191, Vesp Alpha 1, Stonewake` nowrap, up to 9 nav buttons) wraps to >=90px (11% of 844px). Move nav to a bottom tab bar.
- U44 RESPONSIVE: `.campaign-screen{position:fixed; inset:58px 0 0}` at <=600px, but the mobile header is >=90px, so the screen overlaps the header.
- U45 RESPONSIVE: the editor on mobile stacks 15 fields, four read-only prompt textareas (9 rows) and the Gallery. Put the prompts in `<details>`.

**Domain logic duplicated in client JS (should consume facades)**
- U46 CONSISTENCY: `dayLabel(minute)` reformats `world_minute` ("Day 12, 14:30") for the campaign list while the scene header shows the server's `date_text`. Have `host.listCampaigns()` return `date_text`.
- U47 CONSISTENCY: `NUMBER_RANGES` (height 30-300, weight 1-500) duplicates server validation and the HTML min/max. Take them from `appearance_editor.fields[]`.
- U48 CONSISTENCY: `kindBlock`, `deleteBlock`, `roleLabels` re-derive portrait eligibility text. Flags come from the server; add `delete_blocked_reason` to gallery items.
- U49 CONSISTENCY: story-fact statuses are rendered by `f.status.replace(/_/g," ")` (raw enum text). Provide `status_label` from the read model.
- U50 CONSISTENCY: Accept enablement is recomputed in the client (`data.status`, `ready`) beside `offer.affordable`; expose `offer.accept_blocked_reason`.

### 1.3 Positive findings (do not regress)
Opaque refs and revision guard on every mutation; no price/subject on the wire for trade; tier capabilities omit controls; text+icon (not colour alone) for BUY/SELL/Person; honest generation lifecycle; stale/older-appearance badges; lightbox focus trap; `[hidden]{display:none!important}`; CSP, loopback-only host check, same-origin write check.

### 1.4 Client fetch calls vs server routes; unused and abandoned code

| Client call | Server route | Status |
|---|---|---|
| GET /api/session, /api/inventory, /api/save-status, /api/campaigns | `server.ts:64-90` | ok |
| POST /api/turn, /alternative, /location, /appearance, /player-character, /npc-plus/promote, /trade/accept, /portrait/{generate,avatar,full-body,delete,reference}, /campaigns/{create,load,close,delete}, /save | `server.ts:12-14,105` | ok |
| GET /api/item-glyph/<kind>, /api/inventory/sprite/..., /api/portrait/asset/<token>, /api/canon-avatar/<token> | present, reached via URLs inside read models | ok |

No obsolete server route found: every route has a caller.

Dead or vestigial client elements:
- Legacy `household` in `/api/session` (`server.ts` `state()`) and the client fallback `: (data.household ?? [])` (`renderScene`): dead whenever `play.household` exists (always). Remove both.
- `switchView` branch `view === "player"` is dead (U34).
- `#day` span: `ui("day").textContent = ""` runs on every render; vestigial since commit 66631f8 (calendar date). Remove element and code.
- `.trade-buy`/`.trade-sell` have no CSS (classes unused). A mechanical check of every class and id in `style.css` against `index.html` + `client.js` found no other unused selectors (`kind-avatar`, `save-failed`, `save-unsaved` are built dynamically).
- `scripts/explicit-promotion-browser-check.mjs` and `scripts/actual-offer-browser-check.mjs` hard-code `/home/user/Calderan_RPG/.build`, `/opt/node-tools/...` and `/tmp/claude-0/browser/`; Playwright is not a devDependency. Parameterise via env vars.

---

## PART 2. Documentation reconciliation

Authority per `docs/README.md`: code, tests, data, latest reports, active docs, historical. All normative docs carry "Last reconciled: 2026-10-11"; three commits landed after the reconciliation (63af784 campaign delete, d4e9e22 foreground identity, c0608a6 person offer). Line numbers are as of c0608a6.

### 2.1 Objective stale or missing statements

| ID | Doc:line | Doc says | Code/report truth |
|---|---|---|---|
| D-1 | `docs/CURRENT_STATE.md:98`, `docs/TESTING.md:13` | "3205 tests, 0 failed" | Later reports record 3262 (`evaluations/FOREGROUND_CANONICAL_IDENTITY_BINDING_P0.md:3`) and 3278 (`evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md:3`, latest). Static: 192 `tests/*.test.ts` files. Not re-run here. |
| D-2 | `docs/UI_ENGINE_CONTRACT.md:24` | host routes `POST /api/campaigns/create\|load\|close` | also `POST /api/campaigns/delete` (`server.ts:14,129`, `SessionHost.deleteCampaign`, commit 63af784). Soft delete to `saves/.deleted/` is already in `architecture/PERSISTENCE.md:21`. |
| D-3 | `docs/UI.md:11` | Campaigns start screen: create or load | also delete with inline confirm (`client.js` `loadCampaignList`), disabled for a locked campaign; load-report banner. |
| D-4 | `docs/UI.md` (Screens) | silent | Undocumented but present: `/location <id or name>` composer command (`server.ts:135`), narrator "Regenerate with…" alternatives (`narrator-alternatives.ts`), Save indicator states and 4 s poll. |
| D-5 | `docs/ARCHITECTURE.md:75`, `docs/CURRENT_STATE.md` section 3 | identity paragraph stops at replay-fidelity-pass-2 (`identity-request.ts`, exclusive traits, `narrated-captives.ts`, `#focus`) | d4e9e22 added `src/turn/foreground-binding.ts` (`narratedForegroundCanonical`, `narratedSpeakerPartner`), `src/turn/partner-identity-guard.ts` (reject a conflicting self-introduced name, audit issue `canonical_name_conflict`), `[CURRENT INTERACTION PARTNER - OBJECTIVE IDENTITY]` and `[PEOPLE JUST SHOWN TO NICCO]` blocks (`prompt-builder.ts`), `canonical_partner_conflict` skip (`name-establishment.ts`), `APPROACH_MOTION` engagement (`canonical-interaction-targets.ts`), `conversation_partner_id` in `TurnCoordinator.recordExchange`. No normative doc mentions it. |
| D-6 | `docs/architecture/ACTUAL_OFFER.md:3`, `docs/TESTING.md` Actual Offer bullet | tests `actual-offer-v1`, `actual-offer-ui` only | c0608a6 added `tests/person-offer-e2e.test.ts` (+ `tests/fixtures/person-offer-playthrough.ts`, `src/dev/person-offer-live-cert.ts`); d4e9e22 added `tests/foreground-canonical-binding.test.ts`, `src/dev/identity-live-cert.ts`. Note: the c0608a6 prose (spoken prices, stable subject, Slave NPC on Accept, rename) IS already in ACTUAL_OFFER.md section 7. |
| D-7 | `docs/CURRENT_STATE.md` section 8b | trade bullets | does not say that Accept always leaves a persistent Campaign NPC shown as "Slave" until named (only in ACTUAL_OFFER.md section 7). |
| D-8 | `docs/UI_ENGINE_CONTRACT.md:39` | `OPENROUTER_REFLECTION_MODEL` "defaults to the controller model" | `reflection-provider.ts:10` default `anthropic/claude-haiku-5.5`; `production.ts:39` accepts only its default. `CONFIGURATION.md` is correct; the contract is stale. |
| D-9 | `docs/TESTING.md:30` | "no automated browser test suite ... manual or ad hoc" | two scripted Playwright checks exist (`scripts/explicit-promotion-browser-check.mjs`, `scripts/actual-offer-browser-check.mjs`), not in `npm test`, environment-pinned. |
| D-10 | `README.md` "Where things are", `docs/ARCHITECTURE.md` section 5 | source map | omits `src/economy` (P8 Economic Baseline V1), `src/types`, `config/`, `scripts/`, `city_map/`, `playtrough_example/`, `longplaytrough_transcript.txt`. |
| D-11 | `docs/CURRENT_STATE.md` section 3, `docs/CONFIGURATION.md`, `docs/README.md` | no entry | P8 Economic Baseline V1 (`config/economy.yaml`, `src/economy/economy.ts`, selective narrator injection) is a shipped system documented only by root `P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md`. |
| D-12 | `docs/CURRENT_STATE.md` 8b Currency | "whole-number gold only (no silver ...)" | true for settlement, but `config/economy.yaml` has `silver_per_gold: 10` and silver-denominated anchors that reach the narrator. |
| D-13 | `docs/CONFIGURATION.md` | env table | `src/app/narrator-alternatives.ts:10-17` hard-codes six alternate narrator ids (`xiaomi/mimo-v2.6-flash`, `stealth/space-bunny-alpha`, `openai/gpt-5.6-sol`, `deepseek/deepseek-v4-flash-0731`, `tencent/hy4-preview`, `z-ai/glm-5.3-flash`) used by the UI selector; undocumented. |
| D-14 | `docs/IMAGE_SYSTEM.md` last paragraph, `docs/architecture/INVENTORY_UI_V1.md:26` | "authored template registry (`/assets/items/` only)" in the precedence chain | `server.ts:16-20` serves only `/`, `/client.js`, `/style.css`; no `assets/` directory or `/assets/items/` route exists; `item-visuals.ts:14` says "Empty until artwork is authored". The tier is a stub. |
| D-15 | `docs/CURRENT_STATE.md` section 3, `docs/ROADMAP.md` Complete | list | missing rows: foreground identity binding, person Actual Offer end-to-end, campaign deletion, P8 economy. |
| D-16 | `docs/README.md` evaluation list | "newest relevant reports" | omits `FOREGROUND_CANONICAL_IDENTITY_BINDING_P0`, `PERSON_ACTUAL_OFFER_END_TO_END_FIX`, `PLAYER_IMAGE_GENERATION_UX_HARDENING`. |
| D-17 | `docs/README.md` root-report list | `DEBT_REGISTER.md` listed as HISTORICAL "preserved as written" | it opens with a live status ("READY_WITH_NON_BLOCKING_DEBT"); decide whether it is maintained. |
| D-18 | `docs/world/CANON_OVERVIEW.md` section 10 | AUTHOR-ONLY spoilers inside a normative, indexed doc | no stale fact, but a spoiler section in a doc linked from the public index is a leakage risk; relocate (see edit 18). |

Verified correct (no edit): model topology table (narrator `z-ai/glm-5.2`, controller `openai/gpt-6-luna` + fallback `anthropic/claude-haiku-5.5`, extractor, reflection, sprite QA), snapshot schema 6 / save schema 5, image stack (992x992, 800x1200, `fal-ai/qwen-image`, LoRA scale 1, trigger, gallery 64, six canon avatars), time constants (`WEATHER_BLOCK_MINUTES` 360, `WEATHER_LOOKBACK_BLOCKS` 27), Heartstone mechanics and `POST /api/npc-plus/promote`, Actual Offer lifecycle/masking/limits. Every relative link in the 14 reviewed docs resolves.

### 2.2 Precise edits (old -> new). Not applied.

1. `docs/CURRENT_STATE.md:98`: old `Latest recorded run for this reconciliation: **3205 tests, 0 failed**` -> new `Latest recorded run: **3278 tests, 0 failed** at c0608a6 (see evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md)`.
2. `docs/TESTING.md:13`: old `**3205 tests, 0 failed** (after the explicit NPC+ promotion pass, see [report](evaluations/EXPLICIT_NPC_PLUS_PROMOTION_RITE_SIMPLIFICATION.md); ...` -> new `**3278 tests, 0 failed** at c0608a6 (see [report](evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md); the Heartstone rite tests are ...` (keep the rest).
3. `docs/TESTING.md:30`: old `There is no automated browser test suite in the repo; UI behavior is covered by server/read-model tests. Browser checks (screenshots in docs/ui-screenshots/) were manual or ad hoc.` -> new `Browser checks are not part of npm test; UI behavior is covered by server/read-model tests. Two scripted Playwright checks exist for development (scripts/explicit-promotion-browser-check.mjs, scripts/actual-offer-browser-check.mjs; offline, scripted providers, need the .build output and a Playwright install, paths are environment-specific). Screenshots in docs/ui-screenshots/ are older manual captures.`
4. `docs/TESTING.md` Actual Offer bullet: append `, person-offer-e2e.test.ts (spoken price forms, stable subject, Slave NPC on Accept, rename)`. Add bullet `- **Identity:** foreground-canonical-binding.test.ts; live certification harnesses src/dev/identity-live-cert.ts and src/dev/person-offer-live-cert.ts (live, spend credits, never run by npm test).`
5. `docs/UI_ENGINE_CONTRACT.md:24`: old `POST /api/campaigns/create|load|close` -> new `POST /api/campaigns/create|load|close|delete` (delete is a soft delete to saves/.deleted/, refused for a locked or busy campaign).
6. `docs/UI_ENGINE_CONTRACT.md:39`: old `OPENROUTER_REFLECTION_MODEL` (defaults to the controller model) -> new `OPENROUTER_REFLECTION_MODEL` (the qualified adapter accepts only its default, anthropic/claude-haiku-5.5; reflection runs only with CALDREVAN_REFLECTION_MODE=shadow).
7. `docs/UI.md:11`: old `create or load a persistent campaign from the scenario registry; recovery of damaged saves is reported, not hidden.` -> new `create, load or delete a persistent campaign (scenario registry). Delete is a two-step inline confirm and a soft delete; a campaign open in another process cannot be loaded or deleted. Recovery of damaged saves is reported, not hidden.`
8. `docs/UI.md` Screens, add three bullets: `**Composer command:** only /location <canonical id or name> (administrative location correction, POST /api/location, revision-guarded); other text is game-world input.` / `**Narrator alternatives:** when alternate models are configured (src/app/narrator-alternatives.ts), a "Regenerate with…" selector under narrator messages shows comparison-only alternatives that never change the story; a developer aid that spends credits.` / `**Save indicator:** Saved / Unsaved changes / Saving / Save failed, refreshed every 4 s, plus the header Save button.`
9. `docs/ARCHITECTURE.md` after line 75, add paragraph: `**Foreground canonical identity binding (d4e9e22).** The engine, not the model, holds who the player is talking to. The partner is bound from an explicit player selection (APPROACH_MOTION engagement + exclusive trait match, canonical-interaction-targets.ts) or from the delivered narration (foreground-binding.ts: narratedForegroundCanonical when exactly one canonical actor is shown; narratedSpeakerPartner among several shown). TurnCoordinator.recordExchange stores conversation_partner_id; the Narrator receives [CURRENT INTERACTION PARTNER - OBJECTIVE IDENTITY] or [PEOPLE JUST SHOWN TO NICCO - OBJECTIVE IDENTITIES] (prompt-builder.ts) and may speak only a listed name. If the model gives a bound canonical partner another name, partner-identity-guard.ts rejects it: no character, alias or participant is created, the audit issue canonical_name_conflict requests one bounded revision, and name-establishment.ts skips with canonical_partner_conflict. The player keeps seeing "Unfamiliar person" until a legitimate reveal. Report: evaluations/FOREGROUND_CANONICAL_IDENTITY_BINDING_P0.md.`
10. `docs/ARCHITECTURE.md` section 5 and `README.md` "Where things are": add `src/economy   P8 Economic Baseline V1 reference prices (config/economy.yaml), selective narrator injection`, `src/types     shared type helpers`, `config/        economy.yaml (outside the hashed data/ dataset)`, `scripts/       dev, browser-check and live evaluation scripts (some spend credits)`.
11. `docs/CURRENT_STATE.md` section 3 table and `docs/ROADMAP.md` Complete table: add rows `Foreground canonical identity binding (partner binding, conflicting-name guard) | Complete, live-certified`, `Person Actual Offer end-to-end (spoken prices, stable subject, Slave NPC on Accept, same-entity rename) | Complete`, `Campaign deletion (soft delete) | Complete`, `P8 Economic Baseline V1 (narrator price anchors) | Complete (config/economy.yaml)`.
12. `docs/CURRENT_STATE.md` 8b: old `whole-number gold only (no silver, decimals or exchange)` -> new `settlement is whole-number gold only (no silver, decimals or exchange); the narrator's price anchors (config/economy.yaml) may be written in silver (10 silver = 1 gold) but never settle`. Add: `Accepting a person offer always leaves a persistent Campaign NPC (reused, canonical or created from the authoritative subject), shown as "Slave" until the name is learned; a later self-introduction renames the same entity.`
13. `docs/CURRENT_STATE.md:90`: append `Composer command /location; campaign Delete on the start screen.`
14. `docs/CONFIGURATION.md`: add section `## Non-environment configuration`: `config/economy.yaml (P8 reference prices, loaded by src/economy/economy.ts) and the six alternate narrator ids in src/app/narrator-alternatives.ts (UI comparison selector only; not defaults, not env-configurable).`
15. `docs/IMAGE_SYSTEM.md` last paragraph and `docs/architecture/INVENTORY_UI_V1.md:26`: old `authored template registry (/assets/items/ only)` -> new `authored template registry (currently empty: no /assets/items/ route or files exist yet; src/app/item-visuals.ts)`.
16. `docs/architecture/ACTUAL_OFFER.md:3`: append `tests/person-offer-e2e.test.ts` to the test list; in section 7 add `Person identity before and after Accept follows the foreground binding in [Architecture](../ARCHITECTURE.md): a conflicting name never creates a second person.`
17. `docs/README.md`: add to the evaluation list `[Foreground canonical identity binding](evaluations/FOREGROUND_CANONICAL_IDENTITY_BINDING_P0.md)`, `[Person Actual Offer end-to-end](evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md)`, `[Player image generation UX hardening](evaluations/PLAYER_IMAGE_GENERATION_UX_HARDENING.md)`; add under Runtime `ACTIVE [Economic baseline](../P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md)` until a docs/architecture/ECONOMY.md exists. Set "Last reconciled" to the new date (and c0608a6) in README.md (docs), CURRENT_STATE, ARCHITECTURE, ROADMAP, HEARTSTONE, IMAGE_SYSTEM, CONFIGURATION, UI, TESTING, UI_ENGINE_CONTRACT, TIME_AND_ENVIRONMENT, CANON_OVERVIEW (ACTUAL_OFFER has no date line; add one).
18. `docs/world/CANON_OVERVIEW.md` section 10: move to an author-only file excluded from prompt/doc globs (for example `data/world/secrets/AUTHOR_NOTES.md`) and leave a pointer line.

---

## PART 3. Docs taxonomy and repository cleanup (proposal; nothing moved)

Observed: 1863 tracked files. Root: 32 `.md` (31 historical reports + README), `longplaytrough_transcript.txt` (76 KB), `playtrough_example/` (csv), `city_map/city_map.png` (4 MB). `docs/`: 699 tracked files. `docs/evaluations/`: 570 tracked files (182 md, 221 json, 101 mjs, 32 jsonl, 16 png, 15 txt; ~27 MB; 114 of them in subdirectories). `docs/ui-screenshots` 5.3 MB, `docs/portrait-benchmark-anime` 5 MB. `.gitignore` lists `saves/`, yet 310 files in five `saves/d09-*` evidence folders (~11 MB) are tracked, and `docs/evaluations/D09_*.md` cite them as "Artifacts: saves/d09-...". Labelling in `docs/README.md` (NORMATIVE / ACTIVE / HISTORICAL / SUPERSEDED) is good; physical placement is the problem.

Problems:
1. `saves/` is both the runtime campaign store (`saves/campaigns/`, `saves/ui_playtest/`) and an evidence archive. It is ignored but partly tracked: a `git clean -fdx`, a wipe of `saves/`, or code that scans `saves/` can destroy or misread evidence.
2. Root pollution: 31 reports hide the entry point.
3. Raw evidence (json, jsonl, png) and executable harnesses (101 `.mjs`) sit next to human reports in `docs/evaluations/`.
4. Superseded families at the docs root (`*_audit.md`, `image_system_*`, `save_load_*`, `ENGINE_*_PRE_UI.md`).
5. No automated freshness check: three commits already left the normative set stale one day after reconciliation.

Proposed taxonomy:
```
README.md                        only root doc
docs/
  README.md                      index
  current/       CURRENT_STATE ARCHITECTURE ROADMAP CONFIGURATION TESTING UI UI_ENGINE_CONTRACT IMAGE_SYSTEM HEARTSTONE   (NORMATIVE only)
  architecture/  world/  authoring/  schemas/        (ACTIVE specs; keep)
  history/
    reports/       the 31 root *.md + docs/evaluations/*.md   (immutable)
    superseded/    docs/*_audit.md, image_system_*, save_load_*, ENGINE_*_PRE_UI.md
    phases/        architecture/PHASE_*, RETRIEVAL_FOUNDATION, SCENE_DELTA_ENGINE, *_EVALUATION
  evidence/        raw dirs, *.json, *.jsonl, *.mjs from docs/evaluations; saves/d09-*
  media/           ui-screenshots, portrait-benchmark-anime, city_map
```
Steps for a later task: (a) `git mv saves/d09-* docs/evidence/d09/` and rewrite the path mentions in `docs/evaluations/D09_*.md` and the `scripts/d09-*.mjs` defaults; keep `saves/` fully ignored. (b) Move the 31 root reports to `docs/history/reports/` and rewrite the 31 links in `docs/README.md`. (c) Add `docs/evidence/README.md`: never edited, never imported by code. (d) Add `tests/docs-links.test.ts` resolving every relative link in the index and normative set (all resolve today, so it is a pure regression guard) and a staleness tripwire comparing "Last reconciled" with the newest commit touching `src/ui/server.ts`, `src/app/session-host.ts` or `docs/architecture/*`. (e) If clone size matters, archive the 27 MB of evidence as a release tarball.

Priority: P1 fix the `saves/` tracking collision; P2 apply Part 2 edits; P3 move root reports; P4 split evidence; P5 docs link/staleness test.

---

## Appendix: completing the visual audit later
On a machine with network or a vendored `yaml`: `npm ci && npm run build`, reuse the scripted-coordinator setup from `scripts/actual-offer-browser-check.mjs` (zero live calls) to seed a campaign with 20+ characters, very long names, unknown identities, an active person offer and a 300-item inventory, then screenshot at 1440x900 and 390x844 into `/tmp/claude-0/-home-user-Calderan-RPG/4de59164-b9cb-511f-af0e-5c5b984e0de9/scratchpad/shots/` (created, empty). Verify visually: U7, U8, U12, U21, U29, U42-U45.
