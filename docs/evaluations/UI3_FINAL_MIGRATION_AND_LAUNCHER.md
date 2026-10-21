# UI-3: final React migration and one-click launcher

Status: implemented, **not committed** (awaiting the owner's authorization). Date: 2026-10-18. Starting commit: `cb2bceb` (main, CI green on Linux and Windows).
No engine rule, schema, provider or save change. No schema bump. No live provider or image call was made.

## 1. Parity matrix (legacy behaviour → React → evidence)

| Legacy behaviour | React location | Evidence |
| --- | --- | --- |
| Campaign list, load (current / previous / backup), create, scenario | `/app/` CampaignsPage | `CampaignsPage.test`, `CampaignsLifecycle.test`, `react-ui3` S |
| Close campaign, delete (two-step) | CampaignsPage, Settings; Delete uses a modal naming the campaign | `CampaignsPage.test`, `SettingsPage.test`, `react-ui3` S2-S4 |
| Load report, damaged-save recovery | CampaignsPage (warnings via route state) | `CampaignsLifecycle.test` |
| Save button, status, failed / too large | SaveIndicator, SaveBanner | `CampaignsLifecycle.test`, `SessionChrome.test` |
| Transcript, RPG text, progress words, no draft prose | Transcript, useTurn | `Transcript.test`, `PlayTurn.test`, `react-reliability` T1-T6 |
| Composer, Enter / Shift+Enter, `/location`, draft kept | Composer, PlayScreen | `Composer.test`, `PlayTurn.test`, `react-ui2` D15, `SessionChrome.test` |
| Same-key retry, stale revision | useTurn | `react-reliability` T6, `react-play` A17-A18 |
| Scene participants, drawer (tabs, tier controls, promotion + confirm) | CharacterSidebar / Drawer / PromoteControl | `CharacterSidebar.test`, `CharacterPeople.test`, `react-people` P, Q |
| Temporary people, Keep track | CharacterSidebar | `react-people` K1-K15, `CharacterPeople.test` |
| Actual Offer card, masking, receipts | TradeRegion | `ActualOfferCard.test`, `TradeRegion.test`, `react-play` A10-A16, C |
| Pending confirmations, duplicate repair card | PendingConfirmations | `PendingConfirmations.test`, `react-play` B, `react-reliability` R1-R7 |
| Household screen, filters, cards | `/household` HouseholdPage | `HouseholdPage.test`, `react-ui3` H1-H4 |
| NPC+ editor, portraits, generation lifecycle | `/characters/<ref>` NpcCharacterPage + PortraitStudio | `NpcCharacterPage.test`, `react-ui3` H5-H10, `react-background` |
| Player character page, Gallery, Lightbox | `/character/player` | `PlayerCharacterPage.test`, `react-ui2` D |
| Inventory (filters, search, detail, sprite polling, equipment, gold) | `/inventory` | `InventoryPage.test`, `react-ui2` D1-D4, `react-background` A5, B4 |
| Narrator alternatives | AlternativeNarration | `AlternativeNarration.test`, `SessionChrome.test` |
| Optional-service status | `/settings` | `SettingsPage.test`, `react-background` A1c, A2b, A7c |
| Optional services never alter a turn; legacy save load; side stores | (server behaviour, observed through React) | `react-background` A1-A7, B1-B8 |
| World / Debug buttons, Personality / Relations tabs | removed on purpose (unfinished, disabled placeholders; owner decision 2026-10-14) | n/a |
| Reference-image upload route in the UI | not ported (owner decision: no img2img) | n/a |

Removed with the legacy client: `src/ui/index.html`, `client.js`, `style.css`, nine legacy browser checks (mapped in the headers of `react-people`, `react-background`, `react-reliability`), and the legacy-client tests (the 40 `vm` client tests of `play-client.test.ts`, `actual-offer-card`, `campaign-screens`, `drawer-keyboard`, `legacy-turn-status`, client parts of `confirmation-card`, `transcript-cursor`, `ui-playtest`, `keep-track`, `narrator-alternatives`, `player-visuals`, `canon-avatars`, `player-character-profile`). Server and engine tests in those files were kept.

## 2. Routes and components
`/app/` campaigns · `/app/play[/<campaign>]` story · `…/household` · `…/inventory` · `…/character/player` · `…/characters/<opaque ref>` · `…/settings`. New: `features/household`, `features/settings`, `features/character/{NpcCharacterPage,NpcCharacterRoute,PortraitStudio}`, `features/session/SessionNav`, `features/save/SaveBanner`, `features/transcript/AlternativeNarration`, `api/{diagnostics,alternatives}`. `PortraitStudio` is the shared render-prop used by both editors. One `SessionNav` is in every session page header; on screens narrower than 640 px it takes its own row (found and fixed by the 390 px check).

## 3-9. Feature notes
- **Household:** the engine's members only; masked names unchanged; `npc_plus` badge and `character_capabilities` come from the read model; Edit link only when `can_edit_npc_plus`; the engine's `edit_unavailable_reason` is shown otherwise; promotion only through the drawer's existing explicit flow. Search and filters change the list only and send nothing.
- **NPC+ editor / images:** appearance patch (changed fields only) through `POST /api/appearance` with `{ref, expected_revision, patch}`; Avatar, Full Body, delete with confirmation, generation only from a button; refusals shown at the field; no reference upload, no img2img, no client policy for minors (the server's `generation_blocked` is shown).
- **Campaign management, save UI, alternatives, diagnostics, inventory:** as in the matrix. Diagnostics display only `/api/optional-services` data.
- Read-model additions needed by the editor and Household (card capability flags, `appearance_editor`, `alternate_models`, comparison fields) already existed server-side; the client DTOs were extended and pinned by `tests/ui/react-client-contract.test.ts`.

## 10. Accessibility and responsive checks
`react-ui3` H11 (navigation visible, no horizontal overflow on Play, Household, editor and Settings at 1440 / 1024 / 390 px), `react-play` A20, `react-ui2` D17. Keyboard: promotion by keyboard (`react-people` Q1-Q11), lightbox trap and Escape (`react-ui2` D8-D9), drawer cycle (`CharacterPeople.test`), delete dialog Escape (`react-ui3` S3). Dialogs share `useDialogFocus` (inert background, Escape only on the topmost).

## 11-16. Launcher
- **Choice:** a small Node localhost launcher (`scripts/launcher/`), no Electron, no dependency. Reason: the project already requires Node ≥ 22 and the game is a local web app; Electron would add a large binary and an update surface.
- **Startup path:** double-click `Caldrevan.cmd` → `node scripts/launcher/main.mjs --detach` (hidden re-spawn) → launcher UI on `127.0.0.1:3199` (falls back to a free port; `artifacts/local/launcher/launcher.json` lets a second click reuse it) → PLAY spawns `node .build/src/ui/play.js --port=3000 --control-stdin` (no shell) → waits for real health → opens `http://127.0.0.1:3000/app/`. The backend serves the built React UI; Vite is not used.
- **Lifecycle:** Stopped → Starting → Ready / Error (+ transient Stopping). PLAY is idempotent. STOP writes `stop` to the child's stdin; `play.ts` then saves the dirty campaign and exits; after 20 s the launcher force-kills only its own child (`taskkill /T /F` on Windows). Stdin closing (launcher killed) also stops the game, so no orphan remains. Exit stops the game first.
- **Ports / processes:** an occupied game port is reported and never replaced by another one (two writers on one `saves/` are refused). Control API: localhost only, Host check, same-origin POST check, per-run token on start / stop.
- **Prerequisites:** Node (≥ 22, from `engines`), `node_modules`, `.build/src/ui/play.js`, `dist/ui-client/index.html`; missing ones give an actionable error; nothing is installed silently. `setup.cmd` is the explicit first-run path (`npm ci`, build, UI build; project-local only).
- **Data safety:** the launcher never reads, writes or moves `saves/`; API keys are optional and never logged; launching makes no provider call. Bounded logs under `artifacts/local/launcher/`.
- Full operating guide: [LAUNCHER.md](../LAUNCHER.md) (first launch, normal launch, stop, dev mode, troubleshooting, saves and logs location, recovery).

## 17. Tests and results (Linux, Node 22.22, clean build)
| Step | Result |
| --- | --- |
| `npm run typecheck`, `npm run ui:typecheck` | clean |
| `npm run ui:test` | 165 / 165 (24 files) |
| `npm run ui:build` | ok |
| `npm test` (clean `.build`) | 3733 / 3733. The first run had one failure (`evaluation history…`, a deleted but still tracked file); after staging the deletions the full re-run passed |
| `npm run benchmark:modern` | 55 / 55, no failing, no known gaps |
| `check:architecture`, `check:scripts` | clean (0 runtime cycles) |
| `check:docs` | clean once this file exists |
| `npm run check:browser` | 6 / 6 files: `react-play` 31, `react-ui2` 22, `react-ui3` 17, `react-people` 43, `react-background` 41, `react-reliability` 20 checks (the first run had one stale expectation, `react-ui2` E1, updated to the new navigation; re-run 22/22; the other five were green in the first run) |
| Launcher tests L1-L18 | `tests/tooling/launcher-{lifecycle,control-api,files}.test.ts`, 25 tests, part of `npm test` |
| Manual: real `play.js --control-stdin` | `/` → 302 `/app/`; `/app/` and a deep link 200; the `stop` line exits the process; closing stdin exits the process |

## 19. Known limitations and genuine gaps
1. **Windows launcher is untested on Windows**: `Caldrevan.cmd` / `setup.cmd` behaviour, the hidden detached start, `taskkill`, opening the browser, the stdin pipe on a Windows pipe. Only argument arrays and file text are asserted on Linux. CI does not exercise them.
2. **No poll for portraits generated outside the page** (another tab, background work): the gallery refreshes after its own action, a reload, or when the tab returns to the foreground.
3. **An NPC+ who left the household has no card in the read model** (only its name in `promoted`), so it cannot be listed or edited. Needs a read-model field (not added: no engine change allowed here).
4. React focuses Confirm (not Cancel) when a confirmation opens; intent kept, assertion adapted.
5. The legacy "Generating…" status word has no React equivalent (phase words only).
6. Duplicate-repair request has no UI control, in the legacy UI either (an API call); the confirmation card is ported.
7. `Caldrevan.cmd` does not check the Node version itself; an old Node fails with a raw syntax error (documented).
8. CI (`fast.yml`) has not run on this code.

## 21. Instructions for the owner (Windows)
1. First time only: `git pull`, double-click `setup.cmd` (needs Node 22 or newer), wait for "done".
2. Double-click `Caldrevan.cmd`. In the launcher press PLAY; the browser opens when the game is ready. Set `OPENROUTER_API_KEY` in your user environment beforehand (see LAUNCHER.md) to play turns.
3. STOP saves and stops the game; Exit closes the launcher. Developer mode: `npm run play:ui` and `npm run ui:dev`.
