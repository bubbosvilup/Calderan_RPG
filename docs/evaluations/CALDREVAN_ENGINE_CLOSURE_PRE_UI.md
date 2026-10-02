# Caldrevan engine closure: final readiness pass before UI

Date: 2026-10-02. Base: `main` at e0a8a0a. No commit, no push for this pass. No paid call was made (EUR 0.00); every provider was a stub or a fault injection.

## A. Executive verdict

**ENGINE_READY_FOR_UI_WITH_NON_BLOCKING_DEBT.**

The engine itself was already sound; what was missing was the application layer. Before this pass a real user could not "start a campaign, play for hours, save, quit, reload, continue" without `src/dev/play.ts`, a paid developer harness that owned all the session glue. This pass adds the smallest seam that answers the mission question (`src/app`: `GameSession`, `SessionView`, `AppError`, `TurnTrace`), proves it offline, and documents the contract. No engine subsystem was changed.

## B. Verified baseline

| Check | Expected | Found at start | After this pass |
|---|---|---|---|
| `npm run typecheck` | PASS | PASS | PASS |
| `npm test` | 1661 / 1657 / 0 / 4 | 1661 / 1657 / 0 / 4 | **1676 / 1672 / 0 / 4** (15 new tests) |
| `npm run test:playthrough` | 25/25 | 25/25 | 25/25 |
| H2 golden | byte-identical | unchanged | unchanged (`tests/golden` untouched, test green) |
| `runTurn` | 164 lines | 164 | 164 (coordinator untouched; guard test green) |
| NPC+ closure suites | green | green | green |

The same 4 TODOs remain (the H1 known gaps, D-08).

## C. Real application lifecycle

| Step | Where it exists | Normal application code? |
|---|---|---|
| startup, world load | `loadWorld("data")` | yes (library) |
| campaign create | `createOpeningCampaign` | yes (library) |
| campaign load / save | `FileCampaignRepository`, `CampaignSession` | yes (library) |
| provider initialisation | `onlineCoordinator` in `src/dev/turn-services.ts` | **dev only** (also the architecture guard forbids production → dev imports) |
| play session loop, `/new /load /save /status /quit`, busy handling, Ctrl-C | `src/dev/play.ts` | **dev only** |
| turn execution (intent → retrieval → narrator → controller → authorize → audit → one commit) | `TurnCoordinator.runTurn` | yes (library) |
| post-turn reflection sequencing | `runPlayTurn` in `src/dev` | **dev only** |
| unsaved-changes tracking | `CampaignSession` | yes, but only used by the dev loop |
| quit semantics | `play.ts` (`/quit` breaks the loop) | dev only |

Conclusion: the pieces were real but the lifecycle was owned by a harness. Fixed by `GameSession` (D). Real wiring for a player build is `createProductionDeps()` (`src/app/production.ts`); it imports nothing from `src/dev`.

## D. Application/session façade

`src/app/game-session.ts`. Operations: `createCampaign`, `loadCampaign`, `listSaves`, `submitPlayerInput(input, {onEvent, signal})`, `save`, `getView`, `shutdown`, `listTurns`, `getTurn`, `exportTurnDebug`; `fromCampaign` is an embedding/test seam.

- It composes the existing `TurnCoordinator`, `CampaignSession` and repository; it owns no campaign truth.
- Game input and application commands are separate: `/save /load /new /quit /exit /status /help /debug` are rejected as `invalid_input` before the narrator (test: narrator call count stays 0). Game commands (`/go /wait /give /equip /tell /schedule`) pass through.
- Concurrency: the status machine (`idle → running_turn → post_turn → idle`, `closed`) is set synchronously at call time. Two overlapping submits: the second gets `turn_in_progress` and mutates nothing. The coordinator's own per-campaign guard remains as a second line.
- Composition hook: the coordinator is built by `deps.createCoordinator(hooks)` so each session captures the engine's per-turn diagnostics record.

## E. UI-facing view model

`src/app/session-view.ts`, `deriveSessionView(world, snapshot, ctx)`. Plain JSON, derived on demand from the authoritative snapshot and canon, no state of its own. Fields: session (revision, status, save state, provider, dataset id), scene (location, exits, time, present), player (name, mana, gold, equipment, inventory), household (members with presence, relationship headline, conditions, legal state, equipment; rules). Excluded by construction: private canon, narrator-only facts, knowledge edges, NPC+ history/contracts, reflection notes and evidence, prompts, secrets. Canonical characters whose canon marks them not player-visible are not listed as present. The whereabouts of an absent household member are not exposed. Tests assert no mutation back into campaign state, sentinel secrets absent, and view equality across save → load.

## F. Campaign lifecycle

Verified through the façade (tests in `tests/application-closure.test.ts`):

- New: revision 1, location `heartstone_square`, gold 500, household with zero members (no accidental NPC+), exits available.
- Create → save → load yields an identical view (only the saved flag differs by construction).
- No hidden autosave: after several turns the save directory does not exist until `save()` is called; `src` has no `saveCampaign` caller outside persistence and the explicit `save()`.
- Dataset identity: changing authored data changes `datasetId`; a save from another dataset fails with `dataset_mismatch` and the file is byte-identical afterwards. Session operations never write authored data (dataset id unchanged before/after).
- Smoke (spec 39): new → inspect → talk → `/go` → `/wait` → save → mutate → load (state equals the saved one, not the mutated one) → continue → shutdown, all through the façade.

## G. Save/load/shutdown

- Corrupt save → `invalid_json`/`invalid_save`, file untouched, no session. Missing → `not_found`. Invalid id → `invalid_id`.
- Dirty state is derived from revisions. A turn that changes nothing leaves a saved campaign saved.
- `save()` is refused with `turn_in_progress` while a turn or reflection runs.
- Shutdown: idle with no changes closes at once; with unsaved changes it refuses unless `discard_unsaved`; a running request is cancelled (verified: error `cancelled`, revision unchanged) and awaited; reflection cannot be cancelled and is awaited (bounded by the provider timeout, 20 s).
- Crash boundary (no autosave): before the commit, nothing changed in memory or on disk. After the gameplay commit and before a save, the committed revision exists only in memory and is lost; disk holds the last manual save. During reflection, a separate revision commits only on success, so a crash loses at most that note and the same unsaved state. During a save, the write is a temp file plus rename with the previous slot kept; a crash leaves a valid current or a valid previous slot (`PERSISTENCE.md`; two slots are not one atomic multi-file transaction, as documented there).

## H. Provider failures

Fault injection (no network): narrator `timeout`, `rate_limited` (429), `provider_unavailable` (5xx), malformed response, `authentication_error`, empty output; controller `timeout`, `rate_limited`, `provider_unavailable`, `structured_output_invalid`. For every case: `ok:false`, the expected code and `provider_code`, `retryable` as classified, `turn_state_changed:false`, revision and scene unchanged, session back to `idle`, a failed trace recorded, no stack text in the message. Reflection: a throwing provider (message containing a fake key) leaves the committed turn intact, narration already delivered, trace status `failed_nonblocking`, and the raw message never reaches the result. Production wiring without a key fails closed as `configuration_error`, not retryable, nothing committed. Stale revision (campaign changed mid-turn) discards the turn and keeps only the outside change.

## I. Error vocabulary

`src/app/app-errors.ts`: `AppError {code, provider_code?, message, retryable, turn_state_changed}`. `code` is the union of the existing `TurnFailure` and `SaveErrorCode` plus `session_closed`, `unsaved_changes`, `internal_error`; no second taxonomy. Table in `UI_ENGINE_CONTRACT.md` section 6.

## J. World/time/location

Committed turns change time only through runtime deltas (`/go` route minutes, `/wait`, natural movement); `/wait 30` advanced exactly 30 minutes and `/go` the authored route minutes (traced). Failed turns do not advance time or move anyone (matrix: scene unchanged). Resubmitting the same input is a new turn and advances once. Save/load preserves time (view equality). Exposed primitives: `world_minute`, `day`, `minute_of_day`. No calendar or lore was invented.

## K. Gold/inventory/equipment

- Gold: tracked per character in `funds`; the view reports Nicco's purse or `null` when untracked (tested). Gold changes only through committed person transactions; nothing in `src/turn` authorizes a bare `set_funds`, and narrated payment without a committed command changes nothing (existing household tests, referenced). No prices or item purchases exist.
- Inventory/equipment: SUPPORTED NOW: ownership, carried, equipped by free-form slot with worn/held, stored by location, transfers (`/give`, natural handover). PARTIALLY: view shows Nicco's carried/stored-owned and equipped items and household members' equipped items; not carried-by-members. NOT IMPLEMENTED: quantities, weight, capacity, durability, stats, a slot catalogue, shops. Full table in `ENGINE_CAPABILITIES_PRE_UI.md`.

## L. Household/NPC+ UI readiness

A UI can read each household member's id, name, role, presence, location (only when present), relationship headline toward Nicco, conditions, presentation, legal state and equipment; verified with a fixture household (present member, absent member with hidden location, condition, relationship, equipment) and across reload. NPC+ is untouched and frozen; its history, contracts and notes are not in the view.

## M. Narration/streaming

The engine buffers the draft, audits it and releases it once (`narration_delta` is a single audited chunk; there is no token stream, by the Repair 1 design). The session marks deltas `provisional` and delivers the final committed text in `turn_completed`; a failed turn returns `uncommitted_narration` separately. Distinct event kinds: player message, narrator message, system/error. Partial text never becomes authority: the commit is a single step after delivery and failure paths leave state intact.

## N. Debug inspector / turn trace

`TurnTrace` per turn in a bounded in-memory ring (200), never saved: turn id (`<campaign>:r<revision_before>:t<n>`), revisions, player input, outcome and error, narration status (draft/revision/redacted), audit and revision issue kinds, committed and rejected command kinds, movement outcome, retrieval ids and mode, context characters, models, token usage, latency, provider attempts and retry reasons, failure phase, reflection summary. `exportTurnDebug` is safe by default; drafts, controller proposals and authorization evidence require both `unsafe_trace` at session creation and `{unsafe:true}` on export (tested). Cost estimates are not available from the engine.

## O. Long-session soak

`node --expose-gc .build/tests/closure-soak.js 1000` (script `tests/closure-soak.ts`; offline, stub providers, through the façade, 12 NPC+ in the household): **1000 turns, 0 failures, 20 s wall**, revisions monotonic, no duplicate character/item/transaction ids. Mix: conversation turns, `/go` between two rooms, `/wait`, relationship and condition changes, gold changes (16), reflection stub, a save + reload checkpoint every 100 turns (reloaded scene equals live scene each time). Heap rose from 22 to 33 MB and stayed flat from turn 200 to 1000. Local turn latency p50 12.8 ms, p95 23.7 ms, max 123 ms. Context size 7,974 chars at start, p50 8,845, max 12,676 (cap 32,000). The in-memory trace ring stays at its 50-turn cap.

## P. State/save growth

| Turn | Revision | Save bytes | NPC+ state | Reflection | Relationships |
|---|---|---|---|---|---|
| 0 | 2 | 26,781 | 3,745 | 2 | 2 |
| 100 | 31 | 29,148 | 4,500 | 84 | 422 |
| 500 | 161 | 38,209 | 7,659 | 837 | 1,304 |
| 1000 | 303 | 45,034 | 11,162 | 1,007 | 1,292 |

Growth is about 18 KB per 1000 turns for 12 NPC+ and is bounded by existing caps: recent developments are retained to a fixed window, the long-term roll-up tables are capped (24 relationship rows, 12 condition rows), reflection notes are capped, relationships plateau (1,304 → 1,292), the rest of the domains are flat. No unbounded array found; the soak does not exercise transactions with many persons (that ledger is append-only by design and was measured in earlier passes).

## Q. Performance

Local cost, medians, no provider (from the soak profile and `pass10-perf`):

| Campaign | new session | view | save | load | stub turn |
|---|---|---|---|---|---|
| small (12 chars, 6 NPC+) | 1.2 ms | 0.9 ms | 59 ms | 76 ms | 63 ms |
| medium (200, 60) | 1.8 ms | 10.8 ms | 81 ms | 104 ms | 190 ms |
| stress (500, 200) | 1.1 ms | 44.6 ms | 166 ms | 133 ms | 136 ms |

Stage detail at 500/200 from `pass10-perf`: intent 35 ms, audit 14 ms, commit preparation 35 ms, context build 38 ms. The model call dominates play latency; nothing here is pathological. The view derivation at stress size is the one number worth watching (C-02).

## R. Retrieval/privacy/security

- Sentinels: `HIDDEN_SECRET_SENTINEL` (a campaign fact only Maren knows) and a fake API key never appear in the view, traces or debug export; the key never appears in the save file.
- Provider status exposes model ids and a boolean only.
- Debug export: retrieval ids only, no lore text, no prompts, no drafts by default.
- Prompt-injection-like retrieved text remains data (existing `npc-plus-pass-10-injection` suite, green); retrieval failure fails the turn with no mutation (`turn-failures` suite, green).
- Not re-run live: semantic retrieval (D-22).

## S. Defects found and repaired

1. No application seam (lifecycle only in a dev harness): added `src/app` (the only production code added besides the two items below).
2. No stable UI error vocabulary: `AppError`.
3. No view model and no quotable turn id/debug export: `SessionView`, `TurnTrace`, `exportTurnDebug`.
4. Application commands shared the player-input path: rejected before the narrator.
5. Reflection model ignored `OPENROUTER_CONTROLLER_MODEL` (the dev loop built the reflection provider with the default): production reads `OPENROUTER_REFLECTION_MODEL`, defaulting to the controller model.
6. Production composition root lived in `src/dev` (violates the dependency-direction guard, which failed when `src/app` imported it): moved `NARRATOR_OUTPUT_TOKENS` and `selectedModels` to `src/app/provider-config.ts`; `src/dev/turn-services.ts` re-exports them (one-line change; all dev callers and `narrator-bakeoff` tests unchanged and green).

No defect was found in state authority, persistence or the turn pipeline.

## T. Unsupported features

Combat, crafting, quests, shops and item prices, quantities/weight/containers, NPC autonomy and goals, party, calendar, autosave, multiplayer, cloud saves, settings UI. The UI must not promise them.

## U. Known debt

The register in `CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md` stands (none blocking). New, non-blocking: C-01..C-08 in `ENGINE_FREEZE_PRE_UI.md` (dev harness duplicates session glue; view cost at 500 characters; no token streaming; traces not persisted; no cost estimate; reflection not cancellable; unnamed ephemeral participants not in `present`; one live session per process).

## V. UI integration readiness

Checklist: start a new game, continue a save, talk, move, have NPCs move, read household state, read gold where tracked, read inventory and equipment where supported, save manually, reload, survive provider failure without corruption, get readable errors, export diagnostics for a bug report: **all supported through `GameSession`, offline-verified.** Two items are PARTIAL by engine design, not by missing seam: gold (moves only via person transactions) and inventory/equipment (no quantities or stats). Live end-to-end play through the façade with a real key was not run (no spend); the pipeline behind it is unchanged from the live-validated passes.

## W. Final recommendation

Freeze the engine and start the UI against `docs/UI_ENGINE_CONTRACT.md`. Keep `src/dev/play.ts` only as a developer tool and plan to retire it. First UI task suggestion: a thin screen that exercises `createProductionDeps` with a real key for one live session, copying a `turn_id` from the debug panel, as the last acceptance check for the one thing this pass could not do offline.

ENGINE_READY_FOR_UI_WITH_NON_BLOCKING_DEBT
