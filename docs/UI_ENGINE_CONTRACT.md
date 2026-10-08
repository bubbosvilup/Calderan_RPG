# UI ↔ engine contract

Read this first. The UI talks to **one object**, `GameSession` (`src/app/game-session.ts`, re-exported from `src/app/index.ts`). It must not import `TurnCoordinator`, `CampaignState`, `CampaignSnapshot`, the OpenRouter classes, the save codecs, retrieval or reflection. Everything below is verified by `tests/application-closure.test.ts`.

**Save/Load v1:** the Play UI uses `SessionHost` (`src/app/session-host.ts`) for persistent campaigns (section 1b). The disposable V0 mode remains behind `npm run play:ui -- --playtest`: it uses the application-owned `createUIPlaytestSession` adapter (`src/app/ui-playtest.ts`) to wrap the existing canonical opening at `calderan_slave_market`, minute 600, as disposable `ui_playtest`. This arrival override is playtest-only; it changes no authored records or normal opening. The adapter returns a `GameSession`; subsequent gameplay uses only `submitPlayerInput`. The deterministic opening is presentation text, never parsed into state. V0 forces reflection off, writes no saves, and discards the session on shutdown.

## 1b. Persistent campaigns (Save/Load v1)

```ts
const deps = await createProductionDeps({ save_dir: "saves", persistent_campaigns: true }); // saves/campaigns/<id>/, autosave on
const host = new SessionHost(deps);
await host.listCampaigns();                                   // [{campaign_id, display_name, status, revision, saved_at, location_name, world_minute, previous_valid, backups, locked}]
await host.createCampaign({ display_name: "My run", scenario_id: "caldrevan.slave_market.v1" }); // creates, saves (reason create), opens
const r = await host.loadCampaign({ campaign_id, slot: "current" | "previous" | `backup:${name}` }); // r.load_report
host.active;                                                  // the GameSession, or undefined (start screen)
await host.closeCampaign(); await host.shutdown();            // both save a dirty campaign (reason quit) first
```

- Swaps (create/load/close) are refused with `turn_in_progress` while the active session is busy (turn, post-turn, compaction, portrait batch, save) or another swap runs. The target is opened and locked before the old session is touched; a failed load keeps the old campaign.
- `load_report`: `{migrated_from?, canon: {tier, removed_npc_locations, drifted_references, unverified, saved_revision, revision_advanced}, continuity: restored|none|dropped|stale, transcript: available|missing|unreadable|disabled, missing_assets, orphan_assets, recovered_from?, warnings[]}`. Show `warnings` (player-safe sentences); a normal load has none.
- `session.save({reason?})` is immediate; `view.session.save` adds `{saving, error?, autosave: off|on|stopped, transcript_error?}`. `session.getTranscript()` is the visible history; `session.campaignMeta` the display name and scenario.
- HTTP (host mode): `GET /api/campaigns`, `POST /api/campaigns/create|load|close`, `POST /api/save`, `GET /api/save-status`. The session payload carries `campaign: null` (start screen) or `{id, display_name, save}`.

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

Events (`SessionEvent`), in order for a successful turn: `status_changed(running_turn)`, `player_message`, [`narrator_preview` resets/deltas for generation, retries and revision], `narration_delta`, `turn_completed`, [`status_changed(post_turn)`, `post_turn_completed`], `status_changed(idle)`.

- UI V1 adds true provider-token previews: `narrator_preview` is `{action: "start" | "delta", phase: "draft" | "revision", text, provisional: true}`. Use one ephemeral bubble, clear it on each `start`, append deltas, and label it as a draft. It is neither evidence nor history. Remove it on failure/cancellation and replace it with the final outcome on success. Exceptions in visual observers cannot interrupt the engine.
- The engine still buffers and audits the whole draft. `narration_delta` carries the whole audited text as one chunk and is marked `provisional: true`. It is not final until `turn_completed`. UI V1's HTTP adapter waits for the successful application outcome before publishing its finalized transcript and projected panels.
- The authoritative record is `turn_completed.narration` (equal to `outcome.narration`). It is what was committed with the turn. If the audit rewrote or redacted the draft, `trace.narration_status` says `revision` or `redacted`.
- On failure the event is `turn_failed` with `uncommitted_narration`. That text may have been shown provisionally but **was not committed**; show it as discarded or hide it. The campaign is unchanged (`error.turn_state_changed` is false).
- Render three message kinds: player (`player_message`), narrator (`turn_completed`), system/error (`turn_failed`, `post_turn_completed`, errors from `save`).

## 4. View state

`session.getView()` returns a plain JSON `SessionView`, derived from authoritative state on every call, safe at any time (during a turn it shows the last committed state). Events carry a fresh `view`. Never cache it as truth; never mutate it (mutating the returned object cannot affect the campaign).

| Block | Fields |
|---|---|
| `session` | `campaign_id`, `revision`, `status`, `save {state: "saved"|"unsaved", last_saved_revision}`, `provider`, `dataset_id` |
| `scene` | `location {id,name,summary,parent_name?}`, `exits[{target_id,name,minutes,description,kind?}]`, `time {world_minute, day, minute_of_day, time_of_day}`, `present[{id,name}]` |
| `player` | `name`, `mana {current,max}`, `gold` (**null = money not tracked**, not zero), `equipment[{id,name,slot,mode}]`, `inventory[{id,name,description?}]` |
| `household[]` | per household Nicco belongs to: `members[]`, `rules[]` |

Time retains the primitive world clock (`world_minute`, `day`, `minute_of_day`) and adds P11's centralized derived `time_of_day` label. There is no calendar, season or named date; do not invent one.

## 5. Save, load, shutdown

- `await session.save()` → `{ok, saved:{revision,saved_at}, view}` or `{ok:false, error}`. Immediate. Refused with `turn_in_progress` while busy. **Autosave** (Save/Load v1) runs only when `deps.autosave` is set (the persistent Play UI): coalesced 2 s after committed mutations, at most 10 s later, never while busy; see docs/architecture/PERSISTENCE.md.
- Unsaved indicator: `view.session.save.state` (`revision !== last_saved_revision`) or `session.hasUnsavedChanges`. A new campaign is unsaved until the first save. A turn that changes nothing leaves a saved campaign saved.
- `await session.shutdown({discard_unsaved?})`: cancels an active request, waits for the turn and any reflection to settle (reflection cannot be cancelled; wait is bounded by the reflection provider timeout, 20 s by default), then if there are unsaved changes returns `{closed:false, error: unsaved_changes}` and the session stays open. Ask the user; to quit anyway call again with `discard_unsaved: true`. With `save_reason: "quit"` it first saves a dirty campaign (the host does this on close and process shutdown).

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

## 7b. Player character profile (Player Character Profile V1)

- `session.getPlayerProfileView()` → `{name, role_label: "Player Character", identity[{key: sex|species|apparent_age, label, value|null}], fields[{key, label, group, kind: number|text|lines, unit?, value|null}], narrator_summary}`, or `null`. It is read-only and never dirties. `narrator_summary` is exactly the visible-appearance string the narrator receives each turn (`derivePlayerCharacterContext`). It is not a UI rendering.
- `session.updatePlayerProfile({expected_revision, patch})` → `{ok, changed, view}` or `{ok:false, error, field?}`. This is the player's only profile write. `patch` keys are the identity keys plus the NPC+ permanent-appearance keys (`height_cm weight_kg build skin hair_color hair_texture hair_description eyes scars distinguishing_marks distinctive_traits description`): omitted = unchanged, `null` = clear, a value = set. Errors: unknown keys (including `name`, `background`), control characters, over-limit values (identity 60, text 200, description 1000, 12 list items) → `invalid_input`; a revision other than the current one → `stale_turn`; busy → `turn_in_progress`. A refused edit changes nothing. A changed edit commits one `set_player_character_profile` (revision + 1, unsaved, autosave). An unchanged patch does not commit.
- The name is not editable. Clothing is not in the profile (it is current equipment). There is no biography, background or stats field.
- HTTP: the session payload carries `player_character` (the view above, or `null`); `POST /api/player-character {expected_revision, patch}` returns 200 / 409 (stale, busy) / 422 (invalid), each with the fresh state.

## 8. Inventory and equipment

UI V1 uses `members[].display_name` for player-facing labels: unknown canonical names are masked using committed Nicco name knowledge, and missing labels never fall back to opaque IDs. The loopback adapter transmits only `{members: [{name, presence, location?}]}`; it excludes the legacy IDs, raw names, private fields and household identifiers. `scene.time.time_of_day` comes directly from the centralized P11 `temporalGrounding` projection; the UI receives the location label and daypart, with no exact game clock or frontend bucket mapping.

Supported now: Nicco's carried and stored-owned items, Nicco's equipped items by free-form slot (`slot`, `mode: worn|held`), and each household member's equipped items. Not in the view: items merely carried by household members, quantities, weight, durability, containers, shops. See `ENGINE_CAPABILITIES_PRE_UI.md`. Do not promise more.

## 9. Debug inspector

Every completed or failed turn gets a `TurnTrace` (bounded in-memory ring of 200, never saved):

- `session.listTurns()` (newest first), `session.getTurn(turn_id)`.
- `turn_id` = `<campaign_id>:r<revision_before>:t<session sequence>`, e.g. `my_campaign:r41:t3`. This is the id a player copies into a bug report; `trace.revision_before/after` tie it to the saved state.
- Trace fields: `player_input`, `outcome`, `error?`, `narration_status`, `delivered_narration`, `audit_issue_kinds`, `revision_issue_kinds`, `committed_command_kinds`, `rejected_command_kinds`, `movement {location_before, location_after, minutes_elapsed, characters_moved}`, `retrieval_ids`, `retrieval_mode`, `context_chars`, `models`, `usage` (tokens; no cost is available from the engine), `latency_ms`, `provider_attempts` (attempt counts and retry reasons), `failure {phase, provider_code}`, `reflection {status, characters, revisions_added}`.
- `session.exportTurnDebug(turn_id)` returns a JSON bundle (`snapshot_metadata` + `trace`). **Safe by default**: no drafts, prompts, controller proposal or authorization evidence. Those exist only if the session was created with `unsafe_trace: true` *and* the export asks `{unsafe: true}`; ship builds must not set `unsafe_trace`.
- Retrieval ids are source identifiers, not lore text.

## 10. What the UI must not mutate or read

- Never write campaign state, authored canon (`data/`) or the save files directly. The only mutations are `submitPlayerInput`, `save`, `shutdown`, `loadCampaign`/`createCampaign` and the narrow editor writes (NPC+ appearance/portraits, `updatePlayerProfile`).
- Never read `CampaignSnapshot` or save JSON for display. It holds private campaign facts, knowledge edges and reflection notes the player must not see.
- Never render `trace` fields as story text; they are diagnostics.

## 11. Secret and private-data boundary

The view, traces and exports contain no API key, no narrator-only canon, no NPC-only knowledge, no reflection evidence and no prompts. Verified by test against sentinel strings (`HIDDEN_SECRET_SENTINEL`, a fake key). The save file may contain private campaign facts by design and never contains the key. Treat the save directory as private user data.
