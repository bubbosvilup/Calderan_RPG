# UI ↔ engine contract

Read this first. The UI talks to **one object**, `GameSession` (`src/app/game-session.ts`, re-exported from `src/app/index.ts`). It must not import `TurnCoordinator`, `CampaignState`, `CampaignSnapshot`, the OpenRouter classes, the save codecs, retrieval or reflection. Everything below is verified by `tests/application-closure.test.ts`.

V0 uses the application-owned `createUIPlaytestSession` adapter (`src/app/ui-playtest.ts`) to wrap the existing canonical opening at `calderan_slave_market`, minute 600, as disposable `ui_playtest`. This arrival override is playtest-only; it changes no authored records or normal opening. The adapter returns a `GameSession`; subsequent gameplay uses only `submitPlayerInput`. The deterministic opening is presentation text, never parsed into state. V0 forces reflection off, writes no saves, and discards the session on shutdown.

## 1. Start or load a session

```ts
import { GameSession, createProductionDeps } from "./src/app/index.js";
const deps = await createProductionDeps({ save_dir: "saves" });          // canon world, file saves, live providers
const r = GameSession.createCampaign(deps, "my_campaign");                 // or: await GameSession.loadCampaign(deps, "my_campaign", "current" | "previous")
if (!r.ok) show(r.error); else session = r.session;
const saves = await GameSession.listSaves(deps.repository);                // current/previous slot status per campaign
```

- `createCampaign` builds the canonical opening (Heartstone Square, 500 gold, no household members). Nothing is written until `save()`.
- `loadCampaign` returns `{ok:false, error}` for a missing, corrupt, unsupported or dataset-mismatched save. It never mutates or migrates silently. Offer the `previous` slot explicitly.
- To switch campaign: `await session.shutdown(...)`, then create/load a new session. One session at a time.
- Providers are configured by environment only: `OPENROUTER_API_KEY` (required), `OPENROUTER_NARRATOR_MODEL`, `OPENROUTER_CONTROLLER_MODEL`, `OPENROUTER_REFLECTION_MODEL` (defaults to the controller model). `readProviderStatus()` / `view.session.provider` report `{mode, configured, models}`; the key is never exposed. Without a key a turn fails with `narrator_failed` / `provider_code: "configuration_error"` (not retryable): show a "provider not configured" state.

## 2. Submit player input

```ts
const outcome = await session.submitPlayerInput(text, { onEvent, signal });
```

- Accepts **game-world input only**: prose, natural actions, and the game commands `/go`, `/wait`, `/give`, `/equip`, `/tell`, `/schedule`. (`/mana` is a developer affordance; do not expose it.)
- Application words (`/save /load /new /quit /exit /status /help /debug`) are rejected with `invalid_input` and never reach the narrator. Call `save()`, `GameSession.loadCampaign`, `shutdown()`, `getView()` and the debug methods directly instead.
- Input must be 1..4000 characters.
- Returns immediately with `turn_in_progress` when a turn or post-turn step is running. No queue: disable the input box while `status !== "idle"`.

## 3. Streaming and final narration

Events (`SessionEvent`), in order for a successful turn: `status_changed(running_turn)`, `player_message`, `narration_delta`, `turn_completed`, [`status_changed(post_turn)`, `post_turn_completed`], `status_changed(idle)`.

- The engine buffers the narrator draft, audits it, and only then releases text. **There is no token streaming**: `narration_delta` carries the whole audited text as one chunk and is marked `provisional: true`. It is not final until `turn_completed`.
- The authoritative record is `turn_completed.narration` (equal to `outcome.narration`). It is what was committed with the turn. If the audit rewrote or redacted the draft, `trace.narration_status` says `revision` or `redacted`.
- On failure the event is `turn_failed` with `uncommitted_narration`. That text may have been shown provisionally but **was not committed**; show it as discarded or hide it. The campaign is unchanged (`error.turn_state_changed` is false).
- Render three message kinds: player (`player_message`), narrator (`turn_completed`), system/error (`turn_failed`, `post_turn_completed`, errors from `save`).

## 4. View state

`session.getView()` returns a plain JSON `SessionView`, derived from authoritative state on every call, safe at any time (during a turn it shows the last committed state). Events carry a fresh `view`. Never cache it as truth; never mutate it (mutating the returned object cannot affect the campaign).

| Block | Fields |
|---|---|
| `session` | `campaign_id`, `revision`, `status`, `save {state: "saved"|"unsaved", last_saved_revision}`, `provider`, `dataset_id` |
| `scene` | `location {id,name,summary,parent_name?}`, `exits[{target_id,name,minutes,description,kind?}]`, `time {world_minute, day, minute_of_day}`, `present[{id,name}]` |
| `player` | `name`, `mana {current,max}`, `gold` (**null = money not tracked**, not zero), `equipment[{id,name,slot,mode}]`, `inventory[{id,name,description?}]` |
| `household[]` | per household Nicco belongs to: `members[]`, `rules[]` |

Time is the primitive world clock only (`world_minute`, plus `day = floor(minute/1440)` and `minute_of_day`). There is no calendar, season or named date; do not invent one.

## 5. Save, load, shutdown

- `await session.save()` → `{ok, saved:{revision,saved_at}, view}` or `{ok:false, error}`. Manual only; **there is no autosave**. Refused with `turn_in_progress` while busy.
- Unsaved indicator: `view.session.save.state` (`revision !== last_saved_revision`) or `session.hasUnsavedChanges`. A new campaign is unsaved until the first save. A turn that changes nothing leaves a saved campaign saved.
- `await session.shutdown({discard_unsaved?})`: cancels an active request, waits for the turn and any reflection to settle (reflection cannot be cancelled; wait is bounded by the reflection provider timeout, 20 s by default), then if there are unsaved changes returns `{closed:false, error: unsaved_changes}` and the session stays open. Ask the user; to quit anyway call again with `discard_unsaved: true`. It never saves.

## 6. Busy and error state

`session.status`: `idle | running_turn | post_turn | closed`. Input is accepted only in `idle`. `post_turn` is the reflection step after narration was delivered; the next input is rejected as `turn_in_progress` until it settles. `session.lastError` holds the last failure.

Every failure is an `AppError`: `{code, provider_code?, message, retryable, turn_state_changed}`. `message` is player-safe (no stack, no provider text).

| code | meaning | retryable |
|---|---|---|
| `narrator_failed`, `controller_failed` (+`provider_code`) | provider timeout, rate limit, 5xx, malformed output; no commit | yes, except `configuration_error` / `authentication_error` |
| `context_too_large` | the scene holds too much to narrate; no commit; recurs until the scene changes | no |
| `invalid_input`, `invalid_runtime_intent` | blank/oversize text, application command, impossible move or wait | no |
| `turn_in_progress` | another turn is running | yes, later |
| `stale_turn`, `cancelled`, `retrieval_failed`, `context_invalid`, `campaign_validation_failed` | turn discarded, campaign unchanged | `stale_turn`, `cancelled`, `retrieval_failed` yes |
| `not_found`, `invalid_json`, `invalid_save`, `unsupported_version`, `migration_failed`, `dataset_mismatch`, `reference_invalid`, `invalid_id`, `unsafe_path`, `save_in_progress`, `io_error` | save/load problems (the existing `SaveErrorCode`s) | only `save_in_progress`, `io_error` |
| `session_closed`, `unsaved_changes`, `internal_error` | session-level | no |

A reflection failure is **never** an error: the turn stays committed and `trace.reflection.status` becomes `failed_nonblocking`.

## 7. Household

`view.household[].members[]`: `id`, `name`, `role?`, `presence` (`present` | `away`), `location` (**only while present**; the engine never tells the player where an absent member is), `relationship_to_player` (one of `HOSTILE AFRAID WARY ATTACHED TRUSTING GUARDED NEUTRAL`; absent when no relationship exists), `conditions[]`, `presentation?`, `legal? {status, holder_name?}`, `equipment[]`. NPC+ internals (history, contracts, reflection notes) are never in the view.

## 8. Inventory and equipment

Supported now: Nicco's carried and stored-owned items, Nicco's equipped items by free-form slot (`slot`, `mode: worn|held`), and each household member's equipped items. Not in the view: items merely carried by household members, quantities, weight, durability, containers, shops. See `ENGINE_CAPABILITIES_PRE_UI.md`. Do not promise more.

## 9. Debug inspector

Every completed or failed turn gets a `TurnTrace` (bounded in-memory ring of 200, never saved):

- `session.listTurns()` (newest first), `session.getTurn(turn_id)`.
- `turn_id` = `<campaign_id>:r<revision_before>:t<session sequence>`, e.g. `my_campaign:r41:t3`. This is the id a player copies into a bug report; `trace.revision_before/after` tie it to the saved state.
- Trace fields: `player_input`, `outcome`, `error?`, `narration_status`, `delivered_narration`, `audit_issue_kinds`, `revision_issue_kinds`, `committed_command_kinds`, `rejected_command_kinds`, `movement {location_before, location_after, minutes_elapsed, characters_moved}`, `retrieval_ids`, `retrieval_mode`, `context_chars`, `models`, `usage` (tokens; no cost is available from the engine), `latency_ms`, `provider_attempts` (attempt counts and retry reasons), `failure {phase, provider_code}`, `reflection {status, characters, revisions_added}`.
- `session.exportTurnDebug(turn_id)` returns a JSON bundle (`snapshot_metadata` + `trace`). **Safe by default**: no drafts, prompts, controller proposal or authorization evidence. Those exist only if the session was created with `unsafe_trace: true` *and* the export asks `{unsafe: true}`; ship builds must not set `unsafe_trace`.
- Retrieval ids are source identifiers, not lore text.

## 10. What the UI must not mutate or read

- Never write campaign state, authored canon (`data/`) or the save files directly. The only mutations are `submitPlayerInput`, `save`, `shutdown` and `loadCampaign`/`createCampaign`.
- Never read `CampaignSnapshot` or save JSON for display. It holds private campaign facts, knowledge edges and reflection notes the player must not see.
- Never render `trace` fields as story text; they are diagnostics.

## 11. Secret and private-data boundary

The view, traces and exports contain no API key, no narrator-only canon, no NPC-only knowledge, no reflection evidence and no prompts. Verified by test against sentinel strings (`HIDDEN_SECRET_SENTINEL`, a fake key). The save file may contain private campaign facts by design and never contains the key. Treat the save directory as private user data.
