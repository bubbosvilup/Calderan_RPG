# Next UI product review

Status: Evaluation (point in time), 2026-10-13. Static review of main `7e5e4ea` plus the uncommitted documentation reconciliation. Nothing was implemented and no visual change was made. Source of truth for status remains the [Master debt register](../MASTER_DEBT_REGISTER.md) (section 12 and the [Current residual debt](../MASTER_DEBT_REGISTER.md#current-residual-debt) list); this report proposes, it does not reclassify.

## 0. Scope, sources and limits

- **Read:** `src/ui/index.html`, `src/ui/client.js`, `src/ui/style.css`, `src/ui/server.ts`, `src/ui/play.ts`; the read models in `src/app/` that the HTTP state carries (`session-view.ts`, `play-ui-view.ts`, `player-character-view.ts`, `inventory-ui-view.ts`, `trade-offer-view.ts`) and the `GameSession` endpoints in `src/app/game-session.ts`; the eight offline browser checks in `scripts/browser/`; `tests/ui/*.test.ts` (by search); [UI](../UI.md), [UI engine contract](../UI_ENGINE_CONTRACT.md), [Time and environment](../architecture/TIME_AND_ENVIRONMENT.md), [Heartstone](../HEARTSTONE.md), [Master roadmap](../MASTER_ROADMAP.md) (T-UI, T-WEATHER, T-ITEMS, T-NPC+), the register rows UI-1 to UI-31 and the related ITM, IMG, NPC and ID rows, and the per-row verdicts in [A9 register reconciliation](post_cleanup_audit/A9_REGISTER_RECONCILIATION.md).
- **Not done:** no build, no test run, no browser check run, no screenshots (none are current). Every claim below is from reading code. Claims about rendered layout, screen-reader output or browser caching are marked **inferred** or **not confirmed by execution**.
- **Evidence ranking:** code, then tests, then the browser checks, then docs. Where a doc and the code disagree, the code is reported.

## 1. Summary

The UI is safe at its core: every mutation sends only an opaque ref or token and the rendered revision (`src/ui/server.ts:113-213`, `client.js:666`, `:857`, `:909`, `:947`), no narrator draft prose reaches the page (`client.js:729-737`, checked in a real browser by `scripts/browser/turn-reliability-browser-check.mjs`), and the server is loopback-only with a CSP (`server.ts:56-65`). Those properties should not regress.

The open UI debt from the 2026-10-12 audit is still open on current code, with four refinements and one new correctness bug:

| # | Finding | Kind | Proposed severity |
| --- | --- | --- | --- |
| N1 | Once the visible transcript holds 500 entries, new turns stop rendering until reload (the client counts messages, the server returns a sliding window of 500). **Inferred from code, not confirmed by execution; no test covers it.** | NEW, correctness | P2 |
| N2 | The `/location` success message carries a mis-encoded arrow and the raw location id (`game-session.ts:393`). | NEW, trust/polish | P3 |
| N3 | Inventory cells are `<button role="listitem" aria-pressed>`: the role override removes button semantics, and selecting a cell rebuilds the grid and drops keyboard focus (`client.js:105-118`). | NEW, accessibility | P3 (with UI-1/UI-20) |
| N4 | Every authoritative action (Accept, Confirm, Keep track, Promote) removes the focused button on success and focus is not restored. | NEW, accessibility | P3 (UI-26 family) |
| N5 | The trade and confirmation regions are re-appended inside the `role="log"` live region on every render, and the confirmation region is a nested live region. Re-announcement is **inferred**. | NEW, accessibility | P3 (UI-15 family) |
| R1 | UI-17 risk is lower than recorded: every participant and household card carries `name_known`, so the "Met this campaign · name unknown" miss does not reach the screen. The duplicated client logic and the dead legacy payload remain. | Refinement | P2 to P3 (proposal) |
| R2 | UI-8 is partly fixed: `#character-name` and the editor heading wrap; the sidebar participant name, the Household card heading, temporary-people labels and trade lines do not. | Refinement | P3 |
| R3 | UI-25 is partly fixed: the campaign "Confirm delete" button is red-bordered; the copy still does not say it is a soft delete. | Refinement | P3 |
| R4 | The browser checks are weaker evidence than "all eight green" suggests: only three set an exit code, two print JSON for a human to read, all run at desktop width, none uses the keyboard and none seeds a large campaign. | Evidence | P3 (REPO-14 family) |

Recommended order, each bundle pending the user's approval: **Bundle 1 (trust and keyboard)**, then **Weather UI** (small, independent), then **Bundle 2 (scale)** as the prerequisite for Property, then the **Property / containers and equipment UI** alongside the ownership and item-localization engine work, with **receipts** moved to the economy and transaction-history step. Polish (Bundle 3) can be interleaved. Section 6 has the detail.

## 2. CORRECTNESS / TRUST

Items where the page can show something false, hide something true, or make an irreversible action hard to recognise or impossible to reach.

### 2.1 Transcript window desync (N1, new)

- The server returns at most the last 500 transcript entries: `getTranscript()` is `this.#transcript.slice(-500)` (`game-session.ts:1254-1256`); the in-memory buffer trims from 1000 to 500 (`:1227`); a loaded campaign brings at most 500 entries (`src/persistence/transcript.ts:14`, `TRANSCRIPT_LIMITS.entries: 500`).
- The client renders `data.messages.slice(shown)` and then sets `shown = data.messages.length` (`client.js:974`, `:1030`). `shown` is reset only on a campaign change (`client.js:1160-1161`).
- Once the window is full, `data.messages.length` stays 500, so `slice(500)` is empty for every later turn. The pending player and narrator bubbles created at submit (`client.js:1089-1091`) are never filled: the reference is dropped (`client.js:1018`), the narrator bubble keeps its phase word ("Resolving…") and `aria-busy="true"`, and the status line says "Your turn." A reload shows the turn correctly. This happens after about 250 exchanges in a session, or immediately for a loaded campaign whose saved history already has 500 entries.
- Status: **inferred from code, not confirmed by execution.** No test exceeds 500 entries (`tests/session/campaign-lifecycle.integration.test.ts` and `tests/session/turn-request-identity.test.ts` are the only `getTranscript` callers).
- Fix direction (not applied): send a stable cursor. Each `TranscriptEntry` already has a monotonic index `i` (`game-session.ts:1224`); the client would track the last index it rendered instead of a count. This is the first half of UI-4 and is the reason UI-4 belongs partly in this section.

### 2.2 Keyboard accessibility (UI-1 P2, UI-26 P3, N3, N4)

- **UI-1 confirmed.** The character drawer Tab handler always calls `preventDefault` and cycles only Close, Appearance and Story (`client.js:683-689`). Unreachable by keyboard: the Promote button, its inline Cancel / Promote confirmation, the portrait Generate button and the footer Edit NPC+ button. Consequence: **a keyboard-only player cannot promote a character to NPC+ at all**, and cannot open the editor of an NPC+ who is no longer a household member (members are also reachable from the Household screen's Edit button, `client.js:543-546`). Upload is no longer rendered (`AVATAR_UPLOAD_SUPPORTED = false`, `src/app/character-capabilities.ts:12`), so the register row's mention of Upload is stale. The lightbox trap is correct and is the model to follow: it computes the visible, enabled controls at keydown (`client.js:488-494`).
- **N3, inventory cells.** Each cell is a `<button>` with `role="listitem"` and `aria-pressed` (`client.js:112-114`). An explicit role on a button replaces its button role, so assistive technology is told it is a list item, and `aria-pressed` is not valid on a list item. Selecting a cell calls `renderInventory()`, which empties and rebuilds the grid (`client.js:62`, `:105`); the focused button is removed and focus falls to the document. While any sprite is pending, the grid is rebuilt every 2 s (`client.js:124`), so keyboard focus is lost on each tick. Search rebuilds the grid per keystroke (`client.js:143`). The screen-reader effect is **inferred**.
- **N4, focus after authoritative actions.** Accept (`client.js:852-866`), Confirm/Cancel (`:904-917`), Keep track (`:942-955`) and Promote (`:661-680`) all re-render the region that holds the pressed button; the button node is replaced and no focus target is set. The editor and lightbox already restore focus deliberately (`client.js:389-397`); the play-screen actions do not.
- **UI-26 confirmed.** `switchView("play")` always focuses the Household nav button (`client.js:48`), also after closing the player editor or loading a campaign; the dead `view === "player"` branch looks for a `#player-back` that does not exist (`client.js:46`). Escape closes the drawer only when focus is inside it (`client.js:683-684`). The page behind the drawer and lightbox is not `inert`. The save button is an emoji with an aria-label (`index.html:9`). 18 declarations use 10 to 11 px text (`style.css`, search for `font-size:10px|11px`).
- **No keyboard test exists.** `tests/ui/` contains no `Tab` key event, and every browser check drives the page with `page.click` (for example `scripts/browser/explicit-promotion-browser-check.mjs:38-46`).

### 2.3 Accept / Promote visual language (UI-2 P2, UI-3 P3, UI-23 P3)

- **The only filled primary button is Send** (`style.css:163-168`), which is not irreversible. Everything that commits authoritative state is a default outline button: Accept offer (`style.css:605-606`, cursor rules only), the PendingConfirmation Confirm (`style.css:620-621`), Keep track (`style.css:645`), and the Promote confirm (`index.html:83`). The Household "Edit" button is more prominent than Accept (pink border, `style.css:474`).
- **BUY and SELL share one card style.** The client sets `trade-buy` / `trade-sell` classes (`client.js:825`) but no CSS rule exists for either; the 4 px left border uses `var(--line)` for both (`style.css:596`). The text and icon distinction (`▼ BUY` / `▲ SELL`, `client.js:830`) is correct and must stay.
- **A person purchase is one click.** `Accept offer` on a `kind: "person"` offer settles immediately (`client.js:837-844`), while freeing a person goes through a PendingConfirmation card (block 5A). The asymmetry is documented behaviour ([UI](../UI.md), Actual Offer card) and the register already recommends an inline confirm for person purchases (UI-2). Adding a step changes a documented flow, so it needs the user's approval.
- **Promote is a bare `&uarr;` glyph** with an aria-label (`index.html:83`, `style.css:587`). The confirmation copy is good ("Confirm that … has completed the Heartstone household rite", `client.js:643-644`), but the entry affordance is the weakest control in the drawer and is keyboard-unreachable (2.2).
- **UI-23 confirmed.** A disabled Accept says nothing during a turn (no `aria-describedby`, `client.js:840`); only the unaffordable case explains itself (`:842`). `.trade-label` is `0.7rem` at `opacity:.7` (`style.css:598`); contrast below 4.5:1 is **inferred**.
- One documented rule is still missing from [UI](../UI.md): "commits authoritative state" should look the same everywhere (Accept, Confirm, Promote, Keep track), distinct from navigation and from Send.

### 2.4 Receipts (UI-22 P2)

- **Confirmed.** Receipts are a client array (`tradeReceipts`, `client.js:808`), filled from `trade.receipt`, which the server derives only while `settlement.revision === snapshot.revision` (`src/app/trade-offer-view.ts:103-107`). The client shows the last three and re-appends the region after the newest message on every render (`client.js:818-821`, `:850`), so receipts drift down the conversation, are cleared on campaign change (`client.js:1161`) and vanish on reload.
- The same pattern applies to confirmation outcomes: `recent` notices are shown only for cards this page instance saw (`client.js:879-883`). `dismissedConfirmations` is never written to (dead set, `client.js:871`).
- **Where a durable receipt can come from today:** goods trades have no ledger (TRD-11, blocked on the currency decision ECO-1 / D3); accepted `trade_offers` keep a `settlement` but that list is never pruned and is a PER-1 driver (TRD-12). Person transactions are recorded (`src/campaign/types.ts:121-125`). A receipt read model built on `trade_offers` would tie the UI to the record that PER-1 needs to prune.
- **Recommendation:** make receipts the first UI consumer of the economy / transaction-history step in the user's roadmap rather than a separate UI patch (Bundle R, section 6). An interim option, anchoring a non-authoritative transcript entry at the point of the deal, is possible but adds a second record of the same fact.

### 2.5 Location correction copy (UI-5 P2, N2)

- **UI-5 confirmed.** A stale `/location` request calls `reject("stale_turn")` without a message (`game-session.ts:379`), so the player reads the default "The campaign changed while the turn was running. The turn was discarded." (`src/app/app-errors.ts:28`) although no turn ran. The server returns up to five `candidates` for an ambiguous name (`game-session.ts:384`); the client shows only `error.message` (`client.js:1079`). The error text tells the player to "use a canonical ID" (`game-session.ts:384`), which is developer language.
- **N2, new.** The success confirmation is `` `Manual location correction: ${from} â†’ ${to} (${target.id}). Time unchanged.` `` (`game-session.ts:393`). The bytes are a double-encoded U+2192 (`c3 a2 e2 80 a0 e2 80 99`), so the status line shows `â†’`, and it prints the raw location id. The client test uses its own fixture string (`tests/ui/play-client.test.ts:343`), so no test sees the server text.

### 2.6 Unknown identity (UI-17 P2, proposed P3)

- The client still decides "unknown" with string compares: `person.category === "Name unknown"` (`client.js:604`, `:764`) and `member.name === "Unfamiliar household member"` (`client.js:795`), and the client itself fabricates that label (`client.js:785`). The server also still sends the legacy `household` payload with the same fabricated label (`server.ts:53`), which the client uses only when `play.household` is absent (never, in either mode).
- The category string can be "Met this campaign · name unknown" (`player-character-view.ts:230`) and miss the exact match, as the register says. But every participant carries `name_known` from its card (`src/app/play-ui-view.ts:13`), and the client tests `name_known === false` first, so the miss does not reach the screen on current code. The residual is duplicated logic and a dead payload, not a visible error. Proposal: P3, kept in the consistency work (Bundle 3).

### 2.7 Live region and pending state (UI-15 P3, N5)

- **UI-15 confirmed.** `#conversation` is `role="log" aria-live="polite" aria-relevant="additions"` (`index.html:25`) and the pending bubble is added inside it (`client.js:1089`).
- **N5.** `renderTrade` and `renderConfirmations` call `conversation.append(region)` on every render (`client.js:850`, `:902`); appending an existing node moves it, which counts as an addition inside the log. The confirmation region also sets its own `aria-live` (`client.js:874`), a live region nested in a live region. Repeated announcement of the offer card is **inferred**, not confirmed with a screen reader.

### 2.8 Smaller trust items still open

- **UI-6 (P3, partial).** The editor captures the revision at open (`client.js:221`) and refreshes it after its own portrait changes (`client.js:455`); any other commit still makes Save fail with "reopen the editor" (`game-session.ts:634`, `:667`). The edits are kept, the recovery is manual.
- **UI-24 (P3).** Developer copy remains: "Check that npm run play:ui is running" (`client.js:1058`), "Check that it is running" (`:1207`). A save failure is shown in the composer error (`client.js:1268`), which is hidden while the Inventory, Household or editor screen is open.
- **IMG-4 (P2) and UI-31 (P3).** Image progress is a timer, and the hint says "up to about a minute" (`client.js:301`). UI-31 is covered in section 4.

## 3. SCALABILITY

Items that are correct at today's sizes and degrade with more turns, more people, more items or more images.

### 3.1 Transcript scale and polling (UI-4 P2)

- **Polling, confirmed.** A 1 s full-state poll runs only while the session is not idle and this page is not the one submitting (`client.js:1036`), for example during context compaction or a turn started in another tab. A 4 s `/api/save-status` poll runs forever while a campaign is open (`client.js:1182`); it is cheap on the server (`server.ts:85-89`) but never pauses for a hidden tab (no `document.hidden` check anywhere in `client.js`). The inventory polls every 2 s while a sprite is pending (`client.js:124`).
- **Payload, confirmed.** `/api/session` and every POST response carry the full state, including up to 500 transcript entries (`server.ts:43`). The DOM only grows: messages are appended (`client.js:974-981`) and never trimmed or collapsed; there is no `content-visibility` rule.
- **Server cost per round trip.** `state()` derives `getView()` (`server.ts:41`) and then `getPlayUiView()`, which derives `getView()` again (`game-session.ts:365`); each POST outcome also built a `view` that the server discards (`server.ts:148`, `:166`, `:172` and the other `const { view: _view, ...result }` lines). Each `getView()` builds a narrator context request (`game-session.ts:360`). So one UI round trip builds the turn context two to three times (PIPE-4).
- **Card duplication.** `participants` and `household` each embed the full character card, including the NPC+ editor payload with both portrait prompts and the whole gallery (`play-ui-view.ts:11-17`, `player-character-view.ts:235-246`). A present NPC+ household member is sent twice per state. Size growth with a 20-member household is **inferred** (no measurement exists).
- **Order of work:** the cursor (2.1) first, then pause the save poll when hidden, then stop rebuilding unchanged regions, then trim or collapse old exchanges, then de-duplicate cards (send each card once, referenced by `ref`).

### 3.2 Sidebar scale (UI-7 P3)

- **Confirmed.** Scene participants (`client.js:762-777`), sidebar household circles (`:791-802`) and temporary people (`:927-938`) are unbounded lists inside a 280 px column (`style.css:98-101`); the sidebar scrolls as one block (`style.css:178-184`). No "+N more" cap exists.
- Every list is rebuilt on every render (`replaceChildren`, `client.js:761`, `:784`, `:939`), which also drops focus if a render lands while a row is focused (2.2).
- The Weather UI and any Property summary would add to this column; sidebar density is a prerequisite if either goes there (section 5).

### 3.3 Long names (UI-8 P3, partial)

- **Fixed since the audit:** `#character-name` (`style.css:356-358`), the editor heading (`style.css:487`), the Household card details (`style.css:473`, `dd` only) and the inventory detail title (`style.css:35`) wrap with `overflow-wrap:anywhere`.
- **Still open:** `.scene-participant strong` (`style.css:205`) inside a flex row whose text span has no `min-width:0`; `.member-card-info h2` (`style.css:473`); `.provisional-person strong` (`style.css:639`); `.trade-lines` items (`style.css:603`). An unbroken long name overflowing the 280 px sidebar is **inferred** (no browser check uses long names).
- The sidebar household entries are 35 px initial circles with the name visually hidden (`style.css:236-254`), so long names do not affect them; the name is only in `title` and the hidden text.

### 3.4 Inventory node identity (UI-20 P3, N3)

- **Rebuild, confirmed.** `renderInventory` empties the grid and recreates every cell per keystroke, per 2 s poll and per selection (`client.js:96-125`, `:143`). The register estimates this is fine to about 200 items; no measurement exists. Keying nodes by item id and updating in place would also fix the focus loss (N3).
- **Identity on the wire.** Unlike every other actionable object, inventory items reach the browser by their internal item id: `InventoryUiItem.id` (`src/app/inventory-ui-view.ts:51`), `data-item` (`client.js:113`) and the sprite URL `/api/inventory/sprite/<campaign_id>/<item_id>` (`game-session.ts:1268`, `server.ts:77-83`). This is acceptable for a read-only grid. Any future item action (equip, store, move to a container) must follow the contract the rest of the UI uses: an opaque ref plus the rendered revision ([UI engine contract](../UI_ENGINE_CONTRACT.md) section 7d, "Client/server boundary"). This is a prerequisite for equipment actions and Property (section 5).
- The sprite route also hard-codes the player id (`server.ts:80`, `getInventoryVisuals("nicco")`; AUTH-3).

### 3.5 Images (IMG-5 P2)

- Gallery thumbnails load the full image (`client.js:369`). Canonical avatars are served whole with `Cache-Control: no-cache` (`server.ts:104`) and every other response carries `no-store` (`server.ts:56`), including generated portraits and sprites. The sidebar recreates its `<img>` elements on every render (3.2). Whether the browser re-fetches a 2 MB avatar for a 44 px circle on each render is **inferred, not confirmed by execution** (in-document image reuse may avoid it). Thumbnails and immutable caching for content-addressed tokens are the register's fix.

## 4. POLISH

### 4.1 Mobile layout (UI-28 P2, static)

- **Confirmed statically.** At 720 px and below the page becomes one column with `.story{height:75dvh; min-height:420px}` and the sidebar below it (`style.css:411-439`), which gives two scroll contexts and leaves the composer inside a fixed-height box when the soft keyboard opens (**inferred**). The header becomes `min-height:90px` and wraps the nav (`style.css:414-422`), while the campaign screen still starts at `inset:58px` below 600 px (`style.css:569`; 66 px above, `:547`), so the header and the campaign screen overlap. The editor stacks to one column with four prompt textareas (`index.html:76`, `style.css:493`).
- **No evidence at phone width.** Every browser check opens a 1280 px viewport (`newPage({ viewport: { width: 1280, height: 900 } })` in six checks; Playwright's default in the other two). The audit's visual pass at 390 px was never run ([Audit D](codebase_audit_2026-10-12/AUDIT_D_ui-ux-and-docs.md), appendix).
- This is the largest polish item and the only P2 one. It also gates where the Weather UI can sit in the header (section 5.2).

### 4.2 Dead and placeholder screens (UI-11, UI-12, UI-27)

| Element | Evidence | Status |
| --- | --- | --- |
| World and Debug nav buttons | `index.html:9`, `<button disabled>` with no id or handler | Placeholder, costs header width (UI-11) |
| Personality and Relations tabs | `index.html:84`, disabled; `characterTab` handles only Appearance and Story (`client.js:576-582`) | Placeholder (UI-11) |
| Upload control | not rendered, `AVATAR_UPLOAD_SUPPORTED = false` (`character-capabilities.ts:12`); avatar upload is an open user question | Absent by flag |
| Editor "Reference" section | `index.html:68`: says references are not used; only "Remove reference" exists (`client.js:496-498`); the server still accepts a 6 MB upload body (`server.ts:116`) | Waiting on D9 (IMG-10) |
| `#day` span | emptied on every render (`client.js:755`); tests pin it empty (`tests/ui/play-client.test.ts:384`, `:410`) | Dead element |
| `switchView` "player" branch | `client.js:46`, no `#player-back` in `index.html` | Dead code |
| Legacy `household` payload | `server.ts:53`, client fallback `client.js:785` | Dead payload (UI-17) |
| `dismissedConfirmations` | `client.js:871`, never added to | Dead set |
| `.top-bar nav button:last-child` | `style.css:95`; the nav's last child is `#save-status`, a span | Dead selector (UI-12) |
| Bare `article{grid-template-columns:100px …}` | `style.css:113`, also hits Household cards and campaign rows | Over-broad selector (UI-12) |
| `trade-buy` / `trade-sell` classes | set at `client.js:825`, no CSS | Unused classes (UI-2) |
| "/ for commands" hint | `index.html:30`; only `/location` exists (`client.js:1070`) | Misleading copy (UI-27) |
| `/api/optional-services`, `/api/repair/request` | routes exist (`server.ts:90-94`, `:190-196`), no client caller | Diagnostic and operator routes, see 5.1 |

### 4.3 Other polish rows, re-checked

| ID | Current evidence | Note |
| --- | --- | --- |
| UI-9 | `client.js:756` prints `scene.location_id`; pinned by `tests/ui/play-client.test.ts:384` | Fixing it changes a test |
| UI-10 | `client.js:101`, `:757` `String(gold)` | Should wait for D3 (gold-only vs silver/gold display); formatting now would be redone |
| UI-13 | `var(--panel)` / `var(--danger)` used at `style.css:596`, `:608`, `:614`, `:622`, never defined in `:root` (`:40-48`); 28 lines with literal hex colours | Token cleanup |
| UI-14 | player action and speech differ only by italics (`style.css:126-134`); narrator spans have their own colours | |
| UI-16 | "Regenerate with…" under narrator messages, raw `failure_code` (`client.js:982-1016`, `:1006-1007`); only when alternates are configured | Candidate for a Debug screen |
| UI-18 | player editor heading upper-cased (`client.js:207`) | |
| UI-19 | Generate and Edit NPC+ both open the same editor (`client.js:622-628`) | |
| UI-21 / ITM-1 | Head and Boots show "Empty" (`client.js:72`); no headwear/footwear category (`inventory-ui-view.ts:15-18`) | Solved by the equipment work, section 5.5 |
| UI-25 | "Confirm delete" is red-bordered (`style.css:555`); copy "Delete this campaign and its saves?" (`client.js:1244`) does not say it is a soft delete | Partly fixed |
| UI-29 | client-side `NUMBER_RANGES` (`client.js:163`), delete-block rules (`:283-288`), Accept enablement (`:840`), `dayLabel` (`:1197`) | See next row |
| UI-29 (clock) | The campaign list shows "Day N, HH:MM" from `world_minute` (`client.js:1197`, `:1228`) while the play header shows the calendar date with the daypart as a tooltip (`client.js:753-754`) | Two clock formats; the narrator's HH:MM is a separate, settled decision |
| UI-31 | `portraitStage(Date.now() - startedAt)` on a 1000 ms `setTimeout` chain (`client.js:289-309`) | OPEN, P3, no patch by user decision; belongs here, cosmetic only |
| MOV-6 | ambiguous multi-act travel gives no player feedback | Optional note in the status line |

## 5. NEW SCREENS

### 5.1 World and Debug

- **Today:** two disabled buttons (`index.html:9`) and no screen.
- **Debug, what exists in the engine:** `listTurns`, `getTurn` and `exportTurnDebug` (safe by default; [UI engine contract](../UI_ENGINE_CONTRACT.md) section 9, `game-session.ts:1312`); optional-service health with an HTTP route that no page calls (`server.ts:90-94`); the context budget inside `getView()` (`game-session.ts:361`), not on the wire; narrator alternatives (UI-16). None of these has a page.
- **Debug, what it needs:** a launch-time gate so a player never sees it (the server is loopback-only already, but the play page is the player's page); HTTP routes for the trace list and one trace; the safe export only (never `unsafe_trace`); traces contain model labels, retrieval ids and internal ids, which are acceptable in a gated developer screen and nowhere else. The operator repair request (block 5B) should stay off the page unless the user asks for an operator panel: it takes raw character ids by design (`server.ts:193`).
- **World, what it could show:** the current place, its parent, the calendar, observances and weather. `SessionView.scene.exits` carries `target_id` (`session-view.ts:94`) and `scene.present` carries names that are not masked (ID-5, `session-view.ts:98`), so a World screen must use the masked projections and never forward `view.scene` wholesale. A clickable exit list would be a new movement authority (movement is narrated); it needs a product decision and is out of scope here.
- **Recommendation (pending approval):** hide both buttons until a screen exists (UI-11). If a World screen is wanted, the Weather UI is a natural first content for it.

### 5.2 Weather UI

Weather already reaches `SessionView.scene.environment` (`session-view.ts:45-53`, built at `:125-131`): `date_text`, `kind`, `year`, leap and Great Illumination flags, `month_name`, `day_of_month`, `weekday_name`, `season_name` or `intercalary_name`, `observances`, `exposure`, and `weather {status, summary?, condition?, temperature?, note?}`. Status is `ok | no_climate | needs_climate_zone` (`src/world/environment.ts:11`). The model has no ids, seeds or block numbers.

What the Weather UI needs:

1. **One server change, field selection only.** The HTTP state forwards only `date_text` from the environment (`server.ts:46`). The UI needs a player-safe environment subset added there, selected field by field (the field selection in `state()` is the masking boundary, ID-5). No engine change.
2. **Exposure-aware wording that matches the narrator.** The narrator sees `Weather: …` outdoors and `Outside weather: …` otherwise ([Time and environment](../architecture/TIME_AND_ENVIRONMENT.md), "Environment exposure"). The UI should use the same rule so the panel never contradicts the narration (for example "Outside: cool, light rain" in the Heartstone living room, which is `indoor`).
3. **Neutral copy for the non-`ok` states.** The notes "Climate zone unresolved" and "No climate authored for this place" (`session-view.ts:127`) are author-facing; the player needs a neutral "Weather not known here" or nothing.
4. **No new polling.** Weather is constant for a six-hour block and changes only when world time advances on a committed turn; it arrives with the existing post-turn state.
5. **No forecast and no reroll.** Weather is deterministic from the campaign id, so future blocks are computable, but showing them would be a new player-visible rule. The roadmap already states there is no manual reroll ([Master roadmap](../MASTER_ROADMAP.md), T-WEATHER). A forecast needs the user's decision.
6. **Placement.** The header `.clock` (`index.html:8`) already wraps at 390 px (UI-28) and its `#day` span is dead; the sidebar location card (`index.html:36`) is lower risk but crowds the column (UI-7) and still shows the raw location id (UI-9). Either placement benefits from UI-9 and UI-28 landing first; UI-10 and UI-14, named as prerequisites in the roadmap, sit in the same area but do not block it.
7. **One clock format.** The header shows the calendar date with the daypart as a tooltip; the campaign list shows "Day N, HH:MM" (4.3). The Weather UI is the moment to settle one player-facing time display; the narrator keeps HH:MM by decision either way.
8. **Accessibility.** Text first, an icon only as a supplement (the BUY/SELL rule); not a live region, so each turn does not announce the weather.
9. **Tests.** A client test with an environment fixture for each exposure and status, a server test that the forwarded subset carries no ids, and a browser check at 1280 and 390 px.

Size: small. The roadmap allows it in parallel with other work because it is presentation over an existing engine ([Master roadmap](../MASTER_ROADMAP.md), Wave A note).

### 5.3 Property / containers

The UI half is small; the engine prerequisites are not. The Property UI depends on:

| Dependency | Current state | Evidence |
| --- | --- | --- |
| Containers (`container_id` / `contained_in`) | none; item positions are `carried`, `equipped`, `stored(location_id)` only | `src/campaign/types.ts:73-75`; ITM-5 |
| Stable item key and `quantity` | none; a bundle is N rows | ITM-4, ITM-5 |
| Owner vs carrier custody | not an invariant; the inventory shows only "Belongs to someone else" | ITM-3; `inventory-ui-view.ts:46-54` |
| A read model for stored items | none; the views list only the player's possession, and ground or stored items never appear | `session-view.ts:113-115`, `inventory-ui-view.ts:47` |
| Opaque item refs for actions | items reach the browser by internal id | 3.4 |
| Canonical-NPC policy | D5 open, "decide before Property"; AUTH-5 implicit record path | register section 16 |
| Save size and pruning | 16 MB cap stops autosave; `trade_offers` never pruned | PER-1, TRD-12 |
| Player id literals | `"nicco"` in the inventory path | AUTH-3; `inventory-ui-view.ts:45`, `server.ts:80` |
| Grid scale and mobile | full rebuild per change; no phone-width evidence | UI-20, UI-28 |
| Room data | LR, U1, F1 indoor, courtyard outdoor; storage described in canon (U1 shelves, barrels, crates) | [Heartstone](../HEARTSTONE.md), "Physical canon (authored)"; [Time and environment](../architecture/TIME_AND_ENVIRONMENT.md) |

This matches the first step of the user's product roadmap (ownership, possession, item localization), then robust transfers. Any Property action the UI offers must be player-authorized, `expected_revision`-guarded, single-revision, with stale and repeated-click tests ([Master roadmap](../MASTER_ROADMAP.md), definition of done). The ownership-vs-possession rule for the deed (carrying the paper is not owning the tower, [Heartstone](../HEARTSTONE.md)) must be visible in the UI wording: a Property screen shows what Nicco owns, the inventory shows what he carries.

### 5.4 Personality / Relations

- **Today:** two disabled tabs (`index.html:84`).
- **What player-safe data exists:** public canonical relationships towards Nicco only, already shown as "With Nicco" (`player-character-view.ts:193`, `:248`); known mannerism observations, already shown as "Known observations" in Story & knowledge (`player-character-view.ts:213`); learned story facts and history with their source (`:197-211`).
- **What does not exist:** a knowledge-gated projection of relationships between other people, and any player-facing view of the campaign relationship state. The campaign relationship dimensions are the NPC's own feelings towards Nicco, summarised as a narrator-facing headline (`src/campaign/relationship-summary.ts:4-19`, `session-view.ts:104`, `:107`); the card does not show them. Showing them is a knowledge-boundary decision (it would tell the player what the NPC feels, not what Nicco has observed).
- **Constraints already decided:** Reflection notes are soft-promoted durable enrichment, not authoritative; a Personality tab must not present them as facts. An "inactive NPC+" badge depends on D4.
- **Recommendation (pending approval):** hide both tabs until built (UI-11). Build Relations with or after the knowledge / rumors step of the roadmap, where "what Nicco knows about whom" gets its projection.

### 5.5 Equipment actions

- **Today:** none. The equipment panel is a read-only presentation of four category-mapped slots ([UI](../UI.md), Inventory); purchased gear cannot be equipped by any player-visible path (ITM-6: the authorizer rejects `place_item(equipped)` without evidence).
- **Needs:** a canonical slot enum and the headwear/footwear categories (ITM-1, which also resolves UI-21); an explicit, deterministic, UI-confirmed equip/unequip engine action with `expected_revision` (ITM-6); an opaque item ref (3.4); a policy for `worn` vs `held` and for the existing conflict marker (`client.js:73`); a policy for items that belong to someone else (ITM-3); and a narration consistency check, since a UI equip changes state that the next turn's scene projection will show (PIPE-7 territory). Stop persisting `empty_slots` first (ITM-2) so there is one slot truth.
- Best done inside the same items block as Property, not as a separate UI wave.

## 6. Recommended bundles

All bundles are proposals. None starts without the user's approval. They refine the three T-UI bundles of the [Master roadmap](../MASTER_ROADMAP.md) (section T-UI): N1 moves into Bundle 1, UI-17 moves out of it (R1), UI-22 moves to the economy step, and UI-20 becomes a Property prerequisite.

| Bundle | Contents | Why together | Size | Depends on |
| --- | --- | --- | --- | --- |
| **1. Trust and keyboard** | N1 transcript cursor; UI-1 drawer focus list; N3 cell role and focus; N4 focus after actions; UI-15 and N5 live regions; UI-5 and N2 location copy and candidates; UI-23 disabled-reason text; UI-24 copy and save-failure visibility; UI-2 / UI-3 one visual rule for "commits authoritative state" (style and labels only), documented in [UI](../UI.md); keyboard unit tests (Tab, Escape) and one keyboard browser check | All are correctness or reachability on the existing screens; no new engine rule | S to M | none. The person-purchase confirm step (UI-2) is a separate decision, Q1 |
| **W. Weather UI** | Section 5.2 items 1 to 9 | Presentation over an existing read model | S | ideally UI-9 and the header part of UI-28; Q3 |
| **2. Scale** | UI-4 remainder (hidden-tab pause, no rebuild of unchanged regions, trimming or collapsing old exchanges, card de-duplication); UI-7 caps; UI-8 remaining selectors; UI-20 keyed inventory nodes; IMG-5 thumbnails and caching; a seeded scale fixture (20+ characters, very long names, unknown identities, an active person offer, 300 items, more than 500 transcript entries) with browser checks at 1440 and 390 px | Needed before Property adds lists; one fixture exercises all of it | M | Bundle 1 (cursor) |
| **3. Responsive and polish** | UI-28 mobile; UI-11 hide placeholders (Q2); UI-12, UI-13 CSS and tokens; dead code of 4.2; UI-9; UI-14; UI-16 (to Debug if Q4 says yes); UI-17 cleanup and legacy payload removal; UI-18; UI-19; UI-25 copy; UI-26 remainder; UI-27; UI-29 facade fields and one clock format; UI-31; MOV-6 note; UI-10 after D3 | Low risk, many small edits, best batched to limit churn in tests that pin current text | M | D3 for UI-10; D9 for the Reference section |
| **R. Receipts** | UI-22 and confirmation outcome notices as a durable, positioned record | The record belongs to the transaction history | S (UI side) | economy / transaction-history step; ECO-1 / D3, TRD-11, TRD-12 |
| **P. Property, containers and equipment** | Section 5.3 and 5.5 screens and actions | Share the item identity, ref and slot work | M (UI) on top of M+ engine work | ownership / item-localization step; ITM-1 to ITM-6; D5; PER-1; Bundle 2 |
| **Later** | Personality / Relations (5.4); World screen (5.1); Debug screen (5.1) | Each needs a policy decision first | M each | knowledge / rumors step; Q4, Q5; D4 |

Suggested order: Bundle 1, then Weather UI, then Bundle 2, then Bundle P with the items engine work, then Bundle R with the economy step. Bundle 3 can be split and interleaved, but UI-28 should precede any new header content.

Test evidence to add alongside (proposal): make every browser check exit non-zero on failure (today only `block5b`, `block6` and `block7` set `process.exitCode`; `actual-offer`, `explicit-promotion` and `keep-track` print a count, `turn-reliability` and `confirmation` print JSON), and correct [Testing](../TESTING.md), which still says "Three scripted Playwright checks exist … their paths are environment-specific" although there are eight with repository-relative paths since Repository Cleanup A. These are REPO-14-level residuals, low priority.

## 7. What the current evidence covers

### 7.1 Browser checks (offline, scripted providers, desktop width)

| Check | Covers | Does not cover |
| --- | --- | --- |
| `turn-reliability` | no draft prose ever visible, neutral status words, final prose once, request carries `turn_key` and `expected_revision`, reload shows the turn once | prints JSON, no pass/fail exit |
| `actual-offer` | BUY, SELL and person cards; nothing settles before the click or from typed "Deal"; one settlement; only ref and revision on the wire; masked person labels and no hidden names in any payload; superseded and stale offers; unaffordable Accept | receipts after reload; keyboard; visual distinction of Accept |
| `confirmation` | the manumission card, Cancel, Confirm, reload, replay, rename re-renders the same card | prints JSON |
| `explicit-promotion` | the arrow only when eligible, confirm opens without a request, Cancel, one request and one revision, NPC+ controls after promotion, Household listing | keyboard reachability (UI-1) |
| `keep-track` | Temporary group, one request with token and revision, the person becomes persistent, reload, two same-label guards, Heartstone promote control | sidebar scale |
| `block5b` | narrated people are not persisted, offer Accept materializes once, operator repair card | |
| `block6` | optional services ON/OFF parity, pending optional work does not block turns, sprites | |
| `block7` | legacy save migration with an unchanged UI, side stores, gallery growth without revision change, one revision per avatar selection | |

No check runs below 1280 px, uses the keyboard, seeds more than a handful of people or items, or uses long names. The audit's visual pass ([Audit D](codebase_audit_2026-10-12/AUDIT_D_ui-ux-and-docs.md), appendix) was never completed.

### 7.2 Unit tests that pin current behaviour

`tests/ui/play-client.test.ts` asserts the raw location id (`:384`, `:407`, `:410`), the empty `#day` (`:384`, `:410`) and the legacy "Unfamiliar household member" payload (`:146`, `:161`, `:301`). Fixing UI-9, removing `#day` or deleting the legacy payload changes these tests by design; that is expected churn, not a regression.

## 8. Proposed register reconciliation (not applied)

| ID | Register | Current code | Proposal |
| --- | --- | --- | --- |
| UI-1 | P2 | Confirmed (`client.js:683-689`); Upload no longer rendered | Keep P2; drop "Upload" from the row; add "Promotion is impossible by keyboard" |
| UI-2 | P2 | Confirmed | Keep |
| UI-3 | P3 | Confirmed | Keep |
| UI-4 | P2 | Confirmed, plus N1 | Keep P2; record N1 as its correctness half |
| UI-5 | P2 | Confirmed (`game-session.ts:379`, `client.js:1079`) | Keep; add N2 |
| UI-6 | P3 partial | Partial (`client.js:221`, `:455`) | Keep |
| UI-7 | P3 | Confirmed | Keep |
| UI-8 | P3 | Partly fixed (3.3) | Keep P3; narrow the selector list |
| UI-9 to UI-14 | P3 | Confirmed | Keep; note UI-10 waits on D3 |
| UI-15 | P3 | Confirmed, plus N5 | Keep |
| UI-16 | P3 | Confirmed | Keep |
| UI-17 | P2 | Mitigated on screen by `name_known` (2.6) | Lower to P3 (proposal) |
| UI-18, UI-19 | P3 | Confirmed | Keep |
| UI-20 | P3 | Confirmed, plus N3 | Keep; add the focus loss |
| UI-21 | duplicate of ITM-1 | Confirmed | Keep as duplicate |
| UI-22 | P2 | Confirmed | Keep P2; schedule with the economy step |
| UI-23, UI-24 | P3 | Confirmed | Keep |
| UI-25 | P3 | Partly fixed (red border) | Keep P3; copy only |
| UI-26 | P3 | Confirmed, plus N4 | Keep |
| UI-27 | P3 | Confirmed | Keep |
| UI-28 | P2 | Confirmed statically | Keep |
| UI-29 | P3 | Confirmed, plus the two clock formats | Keep |
| UI-31 | P3 | Confirmed | OPEN, P3, no patch (user decision) |
| N1 to N5 | not in the register | Section 1 | Add as UI-32 to UI-36 if the user agrees |

## 9. Questions for the user

None of these blocks Bundle 1 except as noted. Existing open decisions that touch the UI are D3 (gold display, UI-10), D4 (inactive NPC+ badge), D5 (Promote eligibility for canonical NPCs; Property), D9 (the editor's Reference section) and real avatar upload; they are not repeated here.

| # | Question | Recommendation |
| --- | --- | --- |
| Q1 | Should buying a person get an inline Cancel / Confirm step, as freeing a person does? | Yes, inline (no modal), as UI-2 already suggests |
| Q2 | Hide the World and Debug buttons and the Personality and Relations tabs until they exist? | Yes |
| Q3 | Weather UI: header or sidebar location card; forecast or not? | Location card first; no forecast |
| Q4 | Should a gated Debug screen exist (trace list, optional-service health, narrator alternatives)? | Yes, developer-only behind a launch flag; never the operator repair request |
| Q5 | May the player see the campaign relationship state, or only what Nicco has observed? | Only what Nicco has observed, decided with the knowledge / rumors step |
