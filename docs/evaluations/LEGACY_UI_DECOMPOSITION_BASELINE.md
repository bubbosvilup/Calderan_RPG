# Legacy UI decomposition baseline

Status: Baseline evidence (2026-10-14, main `ebe7d2a` plus the UI-1 working tree). Preserved as written; it is the reference point for removing the legacy UI (UI-9 in the [UI migration roadmap](../roadmap/UI_MIGRATION_ROADMAP.md)). Current architecture: [Frontend architecture](../architecture/FRONTEND_ARCHITECTURE.md).

## 1. Files

| File | Lines | Role |
| --- | --- | --- |
| `src/ui/client.js` | 1,329 | the whole client: state, rendering, requests, event wiring, polling, keyboard handling for every screen |
| `src/ui/style.css` | 655 | every screen's styles, minified one-rule-per-line style, ~448 rule blocks |
| `src/ui/index.html` | 101 | every screen and dialog pre-declared as hidden markup (~210 element ids) |
| `src/ui/server.ts` | 282 (310 after UI-1) | HTTP transport over `GameSession` / `SessionHost`; serves both UIs |
| `src/ui/play.ts` | 43 (44) | process entry (`npm run play:ui`) |

## 2. Structure of `client.js`

- **Shared mutable module state:** 20 top-level `let` statements declaring about 50 variables (`submitting`, `ready`, `pending`, `currentRevision`, `selectedCharacter`, `returnFocus`, `activeView`, `editorRef`, `editorMode`, `playerProfile`, `inventoryData`, `tradeBusy`, `tradeReceipts`, `confirmBusy`, `keepBusy`, `portraitBusy`, `lightboxToken`, `campaignMode`, `activeCampaign`, ...). Any function can read or write any of them.
- **One render function for everything:** `render(data)` re-derives campaign mode, inventory, the scene, the household, the player, the transcript, trade, confirmations and temporary people from each payload, and re-schedules polling.
- **Rendering by imperative DOM:** 117 `createElement`, 150 `textContent =`, 60 `.hidden =` toggles, 20 `replaceChildren`, 260 `ui("<id>")` lookups against ids in `index.html`. Lists (participants, household, gallery, inventory, offers, confirmations) are rebuilt wholesale on each render. `innerHTML` is never used: model text is always assigned as text, which the React client preserves.
- **Requests embedded in handlers:** 15 `fetch` calls spread across feature code (`/api/session`, `/turn`, `/location`, `/trade/accept`, `/confirmation/{confirm,cancel}`, `/people/keep`, `/npc-plus/promote`, `/appearance`, `/player-character`, `/portrait/*`, `/inventory`, `/campaigns*`, `/save`, `/save-status`, `/alternative`), each with its own busy flag, error string and recovery (`render(data)` or a full `load()`).
- **61 `addEventListener` registrations**, mostly bound once at load to static ids.
- **Timers:** session poll (1 s while busy), save-status poll (4 s), inventory sprite poll (2 s, 4 s after a failure), portrait progress tick (1 s), client-side portrait timeout (6 min).
- **Focus management by hand:** per-dialog Tab cycling for the character drawer and the lightbox; `returnFocus` and `restoreFocus` helpers.

## 3. Mixed responsibilities

| Concern | Where it lives today | Problem |
| --- | --- | --- |
| Server state | module variables refreshed from every payload | no single owner; stale reads possible between renders |
| Request identity and revision | `currentRevision`, `editorRevision`, `newTurnKey()` | correct, but every feature re-implements the pattern |
| Presentation state | the same module variables | cannot be reasoned about per screen |
| Layout | fixed in `index.html` | every future screen grows the same file |
| Styling | `style.css` with 30 hardcoded hex colors next to 229 `var(--…)` uses | partial tokenization; no component scoping |
| Accessibility | ARIA attributes set in markup and code | works for the current screens, but every new dialog repeats the focus logic |

## 4. Accessibility observations

Good: real buttons throughout, a `log` transcript, one polite announcer, `aria-describedby` reasons on disabled offer and confirmation buttons, drawer and lightbox focus cycling, Escape to close. Gaps: the background is not inert behind dialogs; the character tabs have no Arrow-key navigation and the disabled Personality/Relations tabs sit in the tab order as placeholders; World and Debug are disabled placeholder buttons; household entries without a card are `div`s that carry information only through `title`; the scene card shows the internal location id (`<code id="location-id">`).

## 5. Migration risks

- **Behavioral parity hidden in conditionals:** e.g. confirmation notices are echoed only for cards the page showed; trade receipts accumulate (last 3); the composer intercepts `/location`. Each was re-implemented explicitly in React (UI-1) or is listed as a gap below.
- **Polling interplay:** a session poll resolving after a mutation response could overwrite newer state. The React client cancels in-flight reads before applying a mutation's state.
- **Browser checks are bound to legacy ids** (`#input`, `.trade-card`, `.confirm-card`, ...). They stay on the legacy UI until it is removed; the React UI has its own role-based check.
- **Image-heavy editor and gallery code** (portrait generation lifecycle, lightbox, role assignment) is the largest single block (~350 lines) and the riskiest to port; it is UI-2.

## 6. Feature parity matrix

API = endpoint(s); Server = what the server owns; Local = presentation state the client keeps; Auth? = whether the client could hold authoritative data (it must not); Phase = migration phase.

| Feature | Legacy location | API | Server state | Local UI state | Auth? | Phase | Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Campaign list / load / create | `loadCampaignList`, `campaignRequest` | `GET /api/campaigns`, `POST /api/campaigns/{load,create}` | campaigns, active campaign | form fields | no | **UI-1 done** | none |
| Campaign delete (soft) | `loadCampaignList` inline confirm | `POST /api/campaigns/delete` | campaigns | confirm step | no | UI-4 | none |
| Close campaign (Campaigns button) | `campaigns-nav` | `POST /api/campaigns/close` | active campaign | none | no | UI-4 (React links to `/`, loading another campaign swaps) | none |
| Load report warnings | `showLoadReport` | create/load responses | load report | dismissed flag | no | **UI-1 done** | none |
| Transcript | `render`, `bubble`, `renderRpg` | `GET /api/session` | transcript (500-message window, `seq`) | scroll follow | no | **UI-1 done** | none |
| Turn submission + progress | form submit, `sendTurn`, `readStream` | `POST /api/turn` (NDJSON) | turn, receipts | pending exchange, draft | no | **UI-1 done** | none |
| Same-key retry, stale recovery | `sendTurn`, error branch | `POST /api/turn` | `turn_key` receipts, revision | none | no | **UI-1 done** | none |
| `/location` correction | form submit branch | `POST /api/location` | location | none | no | **UI-1 done** | none |
| Scene / location / date | `renderScene` | session | scene projection | none | no | **UI-1 done** (no internal id shown) | none |
| Gold | `renderScene`, inventory | session `play.gold` | funds | none | no | **UI-1 done** | none |
| Scene participants | `renderScene` | session `play.participants` | characters, masking | selected ref | no | **UI-1 done** | none |
| Temporary people + Keep track | `renderProvisional`, `keepTrack` | `POST /api/people/keep` | provisional people | per-row error | no | **UI-1 done** | none |
| Household sidebar list | `renderScene` | session `play.household` | household | none | no | **UI-1 done** | none |
| Character drawer (appearance, story) | `openCharacter` | session cards | knowledge-scoped card | open/tab | no | **UI-1 done** | none |
| NPC+ promotion | `renderPromotion` | `POST /api/npc-plus/promote` | eligibility (capability) | confirm step | no | **UI-1 done** | none |
| Actual Offer (BUY/SELL/person, receipts, notices) | `renderTrade`, `acceptTrade` | `POST /api/trade/accept` | offer, settlement | receipts seen | no | **UI-1 done** | none |
| Pending confirmations | `renderConfirmations` | `POST /api/confirmation/{confirm,cancel}` | pending records | notices seen | no | **UI-1 done** | none |
| Save indicator + manual save | `renderSaveStatus`, save button | `GET /api/save-status`, `POST /api/save` | save state | none | no | **UI-1 done** | none |
| Save banners (too large / size warning) | `renderSaveStatus` | save-status | save state | none | no | UI-4 (indicator states done; banners pending) | none |
| Provider not configured notice | `render` status text | session `configured` | provider status | none | no | **UI-1 done** | none |
| Inventory screen (grid, filters, detail, equipment figure) | `renderInventory`, `renderEquipment` | `GET /api/inventory`, sprite routes | possession, visuals | filter, search, selection | no | **UI-2 done** (filters All/Carried/Equipped, detail, read-only equipment list; no search, no sprite polling, no figure) | none |
| Player character page (appearance editor) | `openPlayer`, `renderEditor` | `POST /api/player-character` | profile | unsaved form edits | no | **UI-2 done** | none |
| NPC+ appearance editor | `openEditor`, `saveEditor` | `POST /api/appearance` | appearance | unsaved form edits | no | UI-3 | none |
| Portrait generation, gallery, lightbox, roles, delete | `portraitRequest`, `renderGallery`, lightbox | `POST /api/portrait/*` | portraits | progress, lightbox index | no | **UI-2 done** (player gallery, lightbox, roles, delete, generation); UI-3 (NPC+ management) | none |
| Household screen (filters, large cards) | `renderHousehold` | session | household | filter | no | UI-3 | none |
| Narrator alternatives (comparison) | `render` select | `POST /api/alternative` | comparison results | select state | no | UI-4 (developer aid) | none |
| Optional service diagnostics | (no UI; endpoint only) | `GET /api/optional-services` | service health | none | no | UI-4 | none |
| Identity repair request | (no UI; operator route) | `POST /api/repair/request` | pending confirmation | none | no | not planned for the player UI | none |
| World / Debug | disabled placeholders | none | none | none | no | UI-6 / not planned | engine views |

No blocker requires an engine, schema or API change for UI-2..UI-4.
