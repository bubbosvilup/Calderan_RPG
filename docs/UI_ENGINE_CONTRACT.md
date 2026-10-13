# UI ↔ engine contract

Status: ACTIVE. Last reconciled: 2026-10-13 (re-checked after consolidation block 11, which changed no UI-facing API; content last revised on main c0608a6). Source of truth: `src/app/game-session.ts`, `session-view.ts` and the read-model modules. Companion: [UI](UI.md).

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
- HTTP (host mode): `GET /api/campaigns`, `POST /api/campaigns/create|load|close|delete` (delete is a soft delete to `saves/.deleted/`, refused for a locked or busy campaign), `POST /api/save`, `GET /api/save-status`. The session payload carries `campaign: null` (start screen) or `{id, display_name, save}`.

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
- Providers are configured by environment only: `OPENROUTER_API_KEY` (required), `OPENROUTER_NARRATOR_MODEL`, `OPENROUTER_CONTROLLER_MODEL`, `OPENROUTER_REFLECTION_MODEL` (the qualified adapter accepts only its default, `anthropic/claude-haiku-5.5`; reflection runs only with `CALDREVAN_REFLECTION_MODE=shadow`). `readProviderStatus()` / `view.session.provider` report `{mode, configured, models}`; the key is never exposed. Without a key a turn fails with `narrator_failed` / `provider_code: "configuration_error"` (not retryable): show a "provider not configured" state.

## 2. Submit player input

```ts
const outcome = await session.submitPlayerInput(text, { onEvent, signal });
```

- Accepts **game-world input only**: prose, natural actions, and the game commands `/go`, `/wait`, `/give`, `/equip`, `/tell`, `/schedule`. (`/mana` is a developer affordance; do not expose it.)
- Application words (`/save /load /new /quit /exit /status /help /debug`) are rejected with `invalid_input` and never reach the narrator. Call `save()`, `GameSession.loadCampaign`, `shutdown()`, `getView()` and the debug methods directly instead.
- Input must be 1..4000 characters.
- Returns immediately with `turn_in_progress` when a turn or post-turn step is running. No queue: disable the input box while `status !== "idle"`.

## 3. Streaming and final narration

Events (`SessionEvent`), in order for a successful turn: `status_changed(running_turn)`, `player_message`, `turn_progress` (phases `thinking`, `narrating`, `resolving`, in that order), `turn_completed`, `status_changed(idle)`. Optional enrichment (Mannerism, Reflection) runs detached after that and may emit a late `post_turn_completed` when Reflection is on; it never changes the status and is never required.

- **Block 4 (PIPE-1): there is no draft stream.** The Narrator draft is buffered and audited server-side; `narrator_preview` and `narration_delta` no longer exist. While a turn runs the UI shows a status word chosen from its own closed table keyed by `phase`; progress events carry no text. The finished narration is published exactly once, in `turn_completed.narration`, after the commit. The HTTP adapter's NDJSON stream carries `{type:"progress", phase}` lines and one final `{type:"result", ...}` line.
- **Request identity (REV-2).** `submitPlayerInput(text, { turn_key, expected_revision })`. The same `turn_key` never runs twice: an in-flight key is joined, a terminal key is replayed (`outcome.replayed === true`, no provider call, success or failure), the same key with a different request is `turn_key_conflict`. A stale `expected_revision` returns `stale_turn` before any provider call. A different key while busy is `turn_in_progress` (no queue). Retry a failed turn with a NEW key.
- **Post-commit failures (PIPE-2).** `outcome.ok === true` with `warnings` (and `trace.publication_warnings`) means the turn committed and a later step degraded; never retry it.
- **Truncation (NARR-1).** A Narrator answer cut by the output cap is regenerated once; if that fails the turn ends as `narrator_truncated` (nothing committed). See [Architecture 2a](ARCHITECTURE.md).
- The authoritative record is `turn_completed.narration` (equal to `outcome.narration`). It is what was committed with the turn. If the audit rewrote or redacted the draft, `trace.narration_status` says `revision` or `redacted`.
- On failure the event is `turn_failed` with `uncommitted_narration`. That text is always empty since block 4 (nothing is shown before the commit); the campaign is unchanged. The campaign is unchanged (`error.turn_state_changed` is false).
- Render three message kinds: player (`player_message`), narrator (`turn_completed`), system/error (`turn_failed`, `post_turn_completed`, errors from `save`).

## 4. View state

`session.getView()` returns a plain JSON `SessionView`, derived from authoritative state on every call, safe at any time (during a turn it shows the last committed state). Events carry a fresh `view`. Never cache it as truth; never mutate it (mutating the returned object cannot affect the campaign).

| Block | Fields |
|---|---|
| `session` | `campaign_id`, `revision`, `status`, `save {state: "saved"|"unsaved", last_saved_revision}`, `provider`, `dataset_id` |
| `scene` | `location {id,name,summary,parent_name?}`, `exits[{target_id,name,minutes,description,kind?}]`, `time {world_minute, day, minute_of_day, time_of_day}`, `present[{id,name}]` |
| `player` | `name`, `mana {current,max}`, `gold` (**null = money not tracked**, not zero), `equipment[{id,name,slot,mode}]`, `inventory[{id,name,description?}]` |
| `household[]` | per household Nicco belongs to: `members[]`, `rules[]` |

Time retains the primitive world clock (`world_minute`, `day`, `minute_of_day`) and adds P11's centralized derived `time_of_day` label. Calendar, season, observances and weather are derived and exposed in `SessionView.scene.environment` (see [Time and environment](architecture/TIME_AND_ENVIRONMENT.md)); read them from there, never compute or invent them in the UI. There is no weather UI yet.

## 5. Save, load, shutdown

- `await session.save()` → `{ok, saved:{revision,saved_at}, view}` or `{ok:false, error}`. Immediate. Refused with `turn_in_progress` while busy. **Autosave** (Save/Load v1) runs only when `deps.autosave` is set (the persistent Play UI): coalesced 2 s after committed mutations, at most 10 s later, never while busy; see docs/architecture/PERSISTENCE.md.
- Unsaved indicator: `view.session.save.state` (`revision !== last_saved_revision`, or optional side-store state changed since the last save: block 7 optional changes do not move the revision but still make the campaign unsaved and notify autosave) or `session.hasUnsavedChanges`. A new campaign is unsaved until the first save. A turn that changes nothing leaves a saved campaign saved.
- `await session.shutdown({discard_unsaved?})`: cancels an active request, waits for the turn and any reflection to settle (reflection cannot be cancelled; wait is bounded by the reflection provider timeout, 20 s by default), then if there are unsaved changes returns `{closed:false, error: unsaved_changes}` and the session stays open. Ask the user; to quit anyway call again with `discard_unsaved: true`. With `save_reason: "quit"` it first saves a dirty campaign (the host does this on close and process shutdown).

## 6. Busy and error state

`session.status`: `idle | running_turn | closed` (block 7 removed `post_turn` from the type; the `post_turn_completed` EVENT remains and means the detached optional work finished). Input is accepted only in `idle`. Optional services (Mannerism, Reflection, sprites) never hold the turn lock: a pending optional task does not reject the next input, and (block 7) optional writes never change `view.session.revision`, so the revision a client holds stays valid for `expected_revision` through background work. Only an authoritative change (a turn, selecting an avatar / full body, a mannerism promotion) moves it. `GET /api/optional-services` returns per-service `{enabled, running, last_success_at, last_error:{at, code}}` (diagnostic only, never narration, never changes a revision). `session.lastError` holds the last failure.

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
- `getPlayerProfileView()` also carries `visual` (the player visual view: selected Avatar and Full Body, gallery, generation state), so Nicco uses the same portrait infrastructure as NPC+ (see [Image system](IMAGE_SYSTEM.md)). Nicco is never NPC+.
- The name is not editable. Clothing is not in the profile (it is current equipment). There is no biography, background or stats field.
- HTTP: the session payload carries `player_character` (the view above, or `null`); `POST /api/player-character {expected_revision, patch}` returns 200 / 409 (stale, busy) / 422 (invalid), each with the fresh state.

## 7c. Heartstone rite confirmation (explicit NPC+ promotion)

- `session.completeHeartstoneRite({ref, expected_revision})` → `{ok:true, changed:true, view}` or `{ok:false, error, reason?, view}`. `ref` is the opaque character ref of a card whose `character_capabilities.can_promote_to_npc_plus` is true; `expected_revision` is the revision the card was rendered at (stale → `stale_turn`). It commits one `join_household` into the Heartstone household; NPC+ promotion derives in the same preparation (one revision, or nothing). `reason` is one of `character_not_found`, `not_campaign_npc`, `already_npc_plus`, `not_active`, `not_at_heartstone`, `household_unavailable`, `not_keeper`; messages carry no ids. No model is called.
- `character_capabilities` gains `can_promote_to_npc_plus` and `promotion_unavailable_reason`; the client renders the arrow from the flag only.
- HTTP: `POST /api/npc-plus/promote {ref, expected_revision}` returns 200 / 409 (stale, busy) / 422 (refused), each with the refreshed session state.

## 7c2. Keep track (block 12, KPG-1)

- `session.getProvisionalPeopleView()` → `{people: [{token, label, held, keepable, reason?}]}`; the HTTP state carries it as `state.provisional`. These are the scene's PROVISIONAL people (named or anchored to one scene participant, present, not persistent), never campaign characters. `token` is opaque (24 hex chars, campaign-bound, derived from the scene ref and the location); `label` is player-facing and distinguished when two people share one ("Guard (1)", "Guard (2)"); `keepable: false` comes with a safe `reason` text (two present people share the name, a known figure's name, a same-name known character, the subject of the open offer).
- `session.keepTrack({token, expected_revision})` → `{ok:true, changed, already?, label, view}` or `{ok:false, error, reason?, view}`; `reason` is `unknown_person` (malformed, forged, other campaign, or the person is no longer in the scene), `stale`, `rejected`, or a block code (`ambiguous_name`, `canonical_name`, `same_name_persistent`, `offer_subject`). It commits exactly one `register_character` for that same person (one revision) and calls no model; a token that already resolves to a kept character answers `{ok:true, changed:false, already:true}` with no revision, before the stale check.
- HTTP: `POST /api/people/keep {token, expected_revision}` returns 200 / 409 (stale, busy) / 422 (refused), each with the refreshed state. The client renders a "Temporary" group with one **Keep track** button per row and sends only the token and the revision it rendered; it never sends a name, id or payload. After the keep the person is an ordinary campaign NPC in the participants list and the NPC drawer; NPC+ promotion keeps its own eligibility.

## 7d. Trade offers (Actual Offer V1)

- The view state carries `trade: { offer, notice, receipt }`: masked, player-visible labels only, with an opaque `ref` (never an internal id). `trade.offer` also carries `direction`, `kind` (`goods` | `person`), `price_gold`, `lines`, `affordable`.
- **Identity repair (block 5B, operator only).** `session.requestRepair({operation: "retire"|"merge", character_id, target_id?, expected_revision})`; HTTP `POST /api/repair/request` (200 card created or reused, 409 stale or busy, 422 refused with `conflicts[]` of `{code, detail}`). It creates at most one `retire_character` / `merge_character` card (the merge card names SOURCE and TARGET) and never mutates; the ordinary confirm/cancel routes decide. Not reachable from play text, the Narrator, the Controller or the scanner. PROVISIONAL people are not campaign characters: they do not appear in `characters`, the NPC drawer or `can_promote_to_npc_plus` until the player keeps them (section 7c2).
- **Confirmation cards (block 5A).** `state.confirmations` lists the active cards (`ref`, `title`, `body`, `confirm_label`, `cancel_label`, no ids or payload) plus the last notices. `session.confirmPending({ref, expected_revision})` / `session.cancelPending(...)`; HTTP `POST /api/confirmation/confirm` and `/api/confirmation/cancel` with only `ref` + `expected_revision` (200 ok, 409 stale or busy, 422 refused). Confirm and Cancel call no provider and are idempotent per ref. Only the stale-revision and busy refusals are retryable.
- `session.acceptTradeOffer({ref, expected_revision})`; HTTP `POST /api/trade/accept {ref, expected_revision}` returns 200 / 409 (stale, busy) / 422 (refused), each with the refreshed state and a safe message.
- **Client/server boundary** (same for NPC+ promotion, `POST /api/npc-plus/promote {ref, expected_revision}`, and Keep track, `POST /api/people/keep {token, expected_revision}`): the client sends only a ref and the revision it rendered. It never authors price, subject, buyer, seller, item or person payloads; the server loads them from the authoritative offer and validates. The Controller never settles; only this route does.
- A stale or superseded offer is refused with no mutation and no revision. A settled offer cannot settle again. Offers persist through save/load.

## 8. Inventory and equipment

UI V1 uses `members[].display_name` for player-facing labels: unknown canonical names are masked using committed Nicco name knowledge, and missing labels never fall back to opaque IDs. The loopback adapter transmits only `{members: [{name, presence, location?}]}`; it excludes the legacy IDs, raw names, private fields and household identifiers. `scene.time.time_of_day` comes directly from the centralized P11 `temporalGrounding` projection; the UI receives the location label and daypart, with no exact game clock or frontend bucket mapping.

**Inventory screen:** `session.getPlayerInventoryView()` (HTTP `GET /api/inventory`) returns the derived Inventory/Equipment read model: items (carried or equipped), counts, authoritative `gold` (`null` = not tracked), item `visual` metadata, and a read-only four-slot equipment projection mapped by item category only. It is display-only and never saved; see [Inventory UI](architecture/INVENTORY_UI_V1.md).

Supported now: Nicco's carried and stored-owned items, Nicco's equipped items by free-form slot (`slot`, `mode: worn|held`), and each household member's equipped items. Not in the view: items merely carried by household members, quantities, weight, durability, containers, shops. See [Engine capabilities before UI](evaluations/superseded/ENGINE_CAPABILITIES_PRE_UI.md) (superseded snapshot). Do not promise more.

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
