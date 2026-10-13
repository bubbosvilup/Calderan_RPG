# P11 Temporal System Audit

Date: 2026-10-06. Audited source baseline: `925a5c3`.

Scope: audit and status documentation only. Production code, prompts, controller, waits, movement, pacing and tests are unchanged. Paid calls: **0**. No OpenRouter, Voyage or external API probes were made.

## 1. Executive summary

The game has one authoritative clock: `CampaignState`'s `snapshot.runtime.scene.world_time.world_minute`. It advances through validated, engine-owned runtime deltas. Recognized numeric waits and routed player travel produce those deltas. Ordinary dialogue, shopping, physical/combat actions and narrator prose have no automatic duration. The UI start applies a deliberate 600-minute initialization override.

Default opening: minute **0**, derived day **0**, **00:00**. Slave Pens UI: minute **600**, derived day **0**, **10:00**. These are different application starts, not competing clocks. Day length is 1440 minutes; crossing a day boundary recovers up to 25 mana. There is no executable NPC schedule, shop-hours gate, auction-lot timer, weather cycle or solar/calendar model.

Important distinction: the clock is authoritative for state, but temporal consistency in delivered prose is instructed rather than mechanically enforced. An offline ordinary turn delivered `*An hour passes.*` while retaining minute 0. This audit does not fix that gap.

Current P-series status, as requested:

| Item | Status |
|---|---|
| P3.3 Controlled naming disclosure | CLOSED |
| P3.4 Canonical participant continuity | CLOSED |
| P3.5 Canonical name knowledge commit | CLOSED |
| P10 Narrator perspective/pacing | OBSERVATION ONLY / NOT ACTIVE FIX ISSUE |
| P11 Temporal grounding/time system | OPEN / AUDIT COMPLETE / DESIGN PENDING |

P11 is the only active item in this P-series scope. Unrelated D-series debts remain unchanged. Historical P10 evidence remains in [P3_3_P10_P11_REGENERATION_FIX.md](P3_3_P10_P11_REGENERATION_FIX.md) and earlier reports.

Verification: actual source paths were traced, including typed mutation boundaries and indirect provenance readers. Existing offline tests passed **140/140**, zero failures/skips/TODOs: runtime, scene-delta, city-travel, opening-state, UI playtest, save-hardening-h4 and p33-p11-live-evidence. Temporary ignored inspection artifacts under `.build/` are not production changes or new tracked tests. No live-model behavior was measured.

## 2. Authoritative clock

| Property | Current implementation |
|---|---|
| Type | `WorldTime { world_minute: number }`, [src/types/entities.ts](src/types/entities.ts), safe integer at runtime |
| Scene field | `SceneState.world_time`, [src/types/scene.ts](src/types/scene.ts) |
| Production owner | Private immutable snapshot in `CampaignState`, [src/campaign/campaign-state.ts](src/campaign/campaign-state.ts) |
| Full path | `snapshot.runtime.scene.world_time.world_minute` |
| Initialization | Explicit `initialScene` supplied to constructor; opening factory supplies 0. No implicit constructor time default. |
| Advancement | `runtime_delta.delta.time_advance_minutes` -> `prepareRuntimeDelta` -> owner commit |
| Arithmetic | `newMinute = currentMinute + deltaMinutes`; absent delta means 0 |
| Validation | Safe integer clock; nonnegative safe integer delta; safe sum; valid references/revisions/mana; whole campaign snapshot validated |
| Serialization | Numeric clock stored in complete campaign snapshot inside save envelope |

[src/scene/scene-delta.ts](src/scene/scene-delta.ts), `validateSceneDelta`, rejects unknown fields, negative/fractional/unsafe advances and overflowing sums. Normal advancement is monotonic. Initialization/restore can supply signed safe integer clocks; there is no universal nonnegative clock constraint. There is no production command for directly assigning an absolute clock to an existing campaign. A host can initialize or restore an explicitly supplied, valid scene/snapshot.

[src/world/runtime-state.ts](src/world/runtime-state.ts) retains a standalone legacy `RuntimeState` owner with the same clock field and shared preparation function. Production uses it to initialize a campaign and to build a detached context projection from the campaign snapshot. Those copies are not independent live clocks and cannot drift the authoritative campaign.

Other temporal numbers are deadlines or historical stamps, not clocks: `scheduled_world_minute`, `created_at`, `joined_at`, `learned_at`, `acquired_at`, transaction/history `world_minute`, and promotion `promoted_world_minute`. Real UTC save/provider metadata and real performance timers are separate operational clocks; they never drive game time.

## 3. Initialization

| Entry | Assignment | Raw/derived time | Meaning |
|---|---|---|---|
| Canonical/new campaign | `createOpeningCampaign`, [src/campaign/opening-state.ts](src/campaign/opening-state.ts), passes `world_minute: 0` at `heartstone_square` | 0 / day 0 / 00:00 | Explicit current default; opening records do not advance it |
| Slave Pens UI | `createUIPlaytestSession`, [src/app/ui-playtest.ts](src/app/ui-playtest.ts), calls opening then one delta with `player_location: "calderan_slave_market", time_advance_minutes: 600` | 600 / day 0 / 10:00 | Intentional disposable arrival override, not route calculation |
| Generic host initialization | `CampaignState` / `RuntimeState` constructor | Caller-supplied safe integer | No hidden default or real-time conversion |
| Restore | `CampaignState.restore` | Saved value exactly | No opening factory replay |
| Developer fixtures | Explicit scenes in `src/dev/turn-fixture.ts`, `llm-scenarios.ts`, `live-eval-scenarios.ts`, evaluation fixtures | Fixture-specific values | Test/scenario setup, not a global alternate production clock |

The opening comment says Nicco arrived about one day earlier. That story-relative premise is not implemented by starting at minute 1440 or by tracking an arrival date. Minute 0 is the present opening clock epoch.

UI code explicitly documents the difference as location and daytime start. Creating this disposable session itself writes no save/canon data. If a campaign snapshot is explicitly saved through the general save API, its current runtime clock is serialized normally; the UI override is not a save-time reset rule. The injected daylight/auction opening is authored narration, not an event timer.

## 4. Every advancement or set path

All normal campaign mutations share this route: command schema validation -> detached `prepareCampaignChange` -> runtime delta validation/preparation -> whole-snapshot validation -> owner receipt -> one synchronous `CampaignState.commit`. Commands are processed in order on the draft; multiple trusted runtime deltas therefore sum sequentially. Preparation never publishes time. Invalid later commands discard the entire batch.

For gameplay, [src/turn/turn-coordinator.ts](src/turn/turn-coordinator.ts), `runTurn`, resolves player intent, projects it for context, obtains narration/controller proposals, authorizes, prepares the complete batch, audits, prepares the final receipt, checks cancellation/revision, then commits once. Provider/validation failure, cancellation or stale turn before commit does not publish this turn's time. An independently committed external change is not rolled back.

| Path / trigger | Delta or assignment | Who drives it; determinism | Validation/failure/atomicity |
|---|---|---|---|
| `playerIntent` recognized wait, [src/turn/player-intent.ts](src/turn/player-intent.ts) | Parsed 1..1440 minutes | Player text -> deterministic engine; neither controller nor narrator authors the delta | Grammar/bounds + common validation; may reject or turn fail; commits atomically with other authorized changes |
| `playerIntent` strict `/go`, `go to`, `I go to`, etc. | Route total plus destination | Player -> deterministic route | Unknown/unreachable route rejects; common validation/turn atomicity |
| `resolveNaturalActions` / `resolveMovement`, [src/turn/natural-actions.ts](src/turn/natural-actions.ts); first-person movement fallback in `player-intent.ts` | Route total plus destination | Recognized completed player action -> deterministic engine | Unresolved/blocked/intended/already-here actions do not advance; common validation/turn atomicity |
| `resolvePlayerCarry`, [src/turn/character-movement.ts](src/turn/character-movement.ts) | Route total + player location + companion movement when carry clause resolves travel | Player -> deterministic engine | If player travel delta already exists, adds companion movement only; no duplicate travel charge. Blocked route adds no time; common validation/turn atomicity |
| Trusted host `CampaignState.prepare` + `commit` / `apply` with `runtime_delta` | Caller-supplied nonnegative safe integer; absent is 0 | Host/engine API; deterministic for same state/commands, not an LLM capability | Full validation, reference/revision/overflow checks; whole batch atomic |
| Legacy `RuntimeState.advanceTime` / `applySceneDelta` | Explicit supplied delta | Standalone host/legacy seam; deterministic | Shared runtime validation; synchronous scene/NPC/mana publication. No production caller of `advanceTime` was found; no campaign mutation through detached context copies |
| Canonical constructor/factory | Explicit initial value, normally 0 | Host initialization; deterministic | Scene/snapshot validation; invalid construction fails without a live campaign |
| UI arrival setup | +600 plus market location | Application initialization; deterministic | Common campaign batch validation and atomic location/time change; no provider needed |
| Save restore / load / previous-slot load | Installs validated saved snapshot, possibly earlier than current session | Host/player load, deterministic for file | Decode/migration/compatibility/snapshot validation; failure creates no replacement session. No command replay or extra duration |
| Developer CLI `/new`, `/load`, `/wait`, `/go` | New explicit scene, saved clock, or shared intent delta | Developer/player; no separate debug time rules | [src/dev/play.ts](src/dev/play.ts) routes to opening/fixture, repository or coordinator. `/mana` has no time delta |

No implicit elapsed-time path was found for ordinary dialogue, shopping/purchases, equipment transfers, combat/physical actions, household/relationship changes, NPC movement/following alone, scene foreground/background transitions, retrieval, compaction, alternate narrator regeneration, scheduled-event creation/status changes or scripted auction narration. A turn combining an activity with recognized travel/wait can advance because of that explicit runtime intent. Entering/leaving an authored location advances only if resolved as player route travel; scene identity changes alone do not add minutes. There is no wall-clock tick or background world simulation that advances the clock.

Narrator output may provide evidence for other authorized state changes; it cannot supply `runtime_delta`. The production controller schema [src/llm/controller-schema.ts](src/llm/controller-schema.ts) excludes that command; [src/turn/command-authorizer.ts](src/turn/command-authorizer.ts) rejects unallowed commands. Controller scheduling records a future deadline, not an advance.

## 5. Ordinary-turn behavior

**Ordinary dialogue does not advance authoritative runtime time automatically.** `Hello.` produces no runtime command; absent `time_advance_minutes` is 0. No default per-turn minutes exist.

The offline coordinator probe completed a normal `Hello.` turn with mock narration `*An hour passes.*`; delivered narration retained that sentence and the campaign retained minute 0. This demonstrates the enforcement gap without making a claim about live-model frequency. A greeting without a duration has the same zero-delta path. Narrator latency and the real elapsed duration of the exchange do not affect game minutes.

## 6. Wait behavior

The complete duration grammar in `playerIntent` is case-insensitive:

```regex
^(?:\/wait (\d+)|I wait (\d+) minutes\.?|\*he spent (\d+) (hours?|minutes?) [^*]+\*)$
```

Digit text converts with `Number(...)`; `hour`/`hours` multiplies by 60, otherwise minutes. Result must be a safe integer from **1 through 1440**. This player parser cap does not apply to the trusted runtime API, whose constraint is nonnegative safe integer and safe sum. These are current rules, not new proposals.

| Exact input | Current authoritative effect, confirmed offline |
|---|---|
| `wait 10 minutes` | **None**; does not match |
| `/wait 10` | +10 |
| `I wait 10 minutes` / `I wait 10 minutes.` | +10 |
| `wait an hour` / `I wait an hour` | None; number words unsupported |
| `wait until evening` | None; no target-daypart resolver |
| `*waits*` | None |
| `*waits for the next slave lot*` | None; no event-directed duration/next-lot resolver |
| `*he spent 1 hour caring for someone*` | +60 |
| `*he spent one hour caring for someone*` | None |
| `/wait 0` / `/wait 1441` | `invalid_runtime_intent`; no commit |
| `/wait 1.5` | `invalid_input`; no commit |
| Two newline-separated `/wait 10` commands | `invalid_runtime_intent`; parser rejects multiple runtime-intent lines |

The spent-time action form needs text after its numeric unit. Unsupported ordinary prose can still reach the narrator; it does not become an engine wait. Natural-action resolution adds no alternate vague/numeric wait parser. Event-directed waits do not inspect `scheduled_events` or compute time to the next event. A new auction lot can be described as scene prose while runtime time stays fixed; no auction queue in the engine constrains that progression. No fix is included.

## 7. Movement/travel behavior

[src/world/travel.ts](src/world/travel.ts), `findRoute`, uses deterministic Dijkstra over authored directed location `connections`. Edge `minutes` must be positive safe integers; unsafe sums are ignored. Lowest total cost wins; equal costs compare the full node-ID sequence in code-point order. Route minutes are the sum of its legs. `travelDestination` redirects containers only through an explicitly authored `entrance`; containment alone creates no travel edge.

Actual current-world probe: `heartstone_square -> west_outer_lane -> calderan_slave_market` costs **12 + 8 = 20 minutes**. `/go heartstone_lr` from the square costs **1 minute**. These costs come from authored connections, not prose about approximate city crossing duration, distance estimation, narrator/controller judgment or real elapsed time.

Arrival is one runtime delta containing destination and total minutes; companion commands join the same campaign batch. Intermediate legs are route metadata, not separately committed scenes/ticks. Failed strict movement rejects; natural unresolved/blocked movement emits no runtime delta and keeps the player at origin. A later failed command or failed turn leaves both arrival and its time unpublished. The offline batch probe prepared +60 then an invalid destination; the full snapshot remained unchanged.

Movement within the same location, toward a person/object, has no automatic cost. Natural already-here movement has no state effect; low-level same-node routing yields 0. A move between separate authored interior nodes can cost time through its connections. NPC-only moves/following do not charge additional travel time. Trusted location-only `runtime_delta`, and legacy `movePlayer`, can change location with **0 minutes**: route costs belong to the player intent resolver rather than a mandatory charge on every location write. Offline host location-only mutation preserved minute 1690.

## 8. Time consumers / schedules

### Active readers and available helpers

| Reader / source | Exact time read | What it affects / production status |
|---|---|---|
| `prepareRuntimeDelta`, `src/world/runtime-domain.ts` | Old/new `scene.world_time.world_minute` | Advancement and day-boundary mana recovery; active |
| `validateSceneDelta`, `src/scene/scene-delta.ts` | Current world minute | Safe sum/validity; active |
| `historicalMinute`, `src/campaign/preparation.ts`; item/social handlers | Draft current minute vs supplied `acquired_at`, `joined_at`, `learned_at` | Rejects future provenance; active. `social.ts` stamps default membership/join time with current clock |
| `validateCampaignSnapshot`, `src/campaign/snapshot-validation.ts` | Runtime minute vs provenance/transaction/goal/premium-history times | Restore/prepare graph consistency; active |
| `prepareAgendaCommand`, `src/campaign/agenda.ts` | `worldMinute(context)` | Goal `created_at` stamp; active. Event deadlines/statuses are separate records |
| `prepareLegalCommand`, `src/campaign/legal.ts` | `worldMinute(context)` | Sale/gift/assignment/manumission transaction stamps; active, no duration |
| Promotion / character preparation, `src/campaign/promotion.ts`, `characters.ts`; `src/turn/name-establishment.ts`, `person-transactions.ts` | Current runtime minute / passed `world_minute` | Promotion origin stamp and equality validation; active |
| `src/turn/stages/authorization.ts` | Projected scene world minute | Item acquisition timestamp; active |
| `src/turn/stages/commit-preparation.ts` | Prepared snapshot world minute | Canonical-name `learned_at` timestamp; active |
| `syncPremiumCharacters`, `src/campaign/premium-characters.ts` | Draft scene world minute | Durable development/history stamps; active when relevant domains change |
| `playerIntent`, `src/turn/player-intent.ts`; command authorizer | Current scene world minute | `/schedule ... at N` and authorized event must be in the future; active, records deadline only |
| `buildNarrativeContext`, `src/scene/narrative-context-builder.ts`; detached `buildTurnContext` | Runtime scene world minute | Projects scene time; active, never ticks it |
| `buildNarratorPrompt`, `src/turn/prompt-builder.ts`; `temporalGrounding` | Projected scene world minute | Raw time, derived day/HH:MM, temporal rule and context identity; active |
| `deriveSessionView`, `src/app/session-view.ts` | Committed scene world minute | UI/API `world_minute`, `day`, `minute_of_day`; active |
| `movementOf`, `src/app/game-session.ts` | After minus before runtime minute | Trace `minutes_elapsed`; active diagnostic, no duration policy |
| Save encode/decode/repository, `src/persistence/` | Entire snapshot containing clock | Persist/restore exact state; active |
| Save migration 2 -> 3, `src/persistence/save-migrations.ts` | Saved scene world minute | Stamps migrated premium member histories with saved clock; migration only, preserves clock |
| `remainingEventMinutes`, `src/campaign/projections.ts` | Deadline minus snapshot runtime minute | Exported utility; negative means overdue. No production scheduler caller found; tests/host can use it |
| Reflection evidence builders, `src/turn/structured/reflection-v2.ts`, `reflection-v23-cvc-e1.ts`; `src/turn/reflection.ts` | Current minute and recorded history minutes | Scoped evidence stamps, matching and descriptions. Optional reflection paths; generation/exposure is off by default. Does not advance time |
| Developer status/inspection/evaluation, `src/dev/` | Snapshot/historical clock or explicit fixture start | Diagnostics, scenario replay/assertions; not autonomous world simulation |

Daily mana is an actual time-dependent mechanic: `crossedDays = floor(new/1440) - floor(old/1440)`, recovery `min(max - explicitMana, crossedDays * 25)`. Crossing minute 1439 -> 1440 recovered 50 -> 75 in the offline probe. Recovery is tied to day boundaries, not an inferred night's sleep or a rolling 24-hour timer. Explicit mana bounds are validated before recovery. It commits in the same runtime/campaign transaction as time.

### Scheduled events: records, not an automatic scheduler

`src/campaign/agenda.ts` supports schedule, reschedule and explicit status transitions. None moves the clock. `scheduled -> triggered/cancelled`, then `triggered -> completed/cancelled`, requires an explicit command; passing the deadline triggers nothing. Trusted scheduling validates references/integer fields, but does not impose the gameplay future-deadline authorization rule. `reschedule_event` changes the record's deadline, not current time.

`src/turn/context-builder.ts` selects events involving Nicco with status `scheduled`; under its cap, it favors earlier deadlines. It does **not** compare deadlines to the current clock or remove/trigger overdue events. Prompt exposes these records. `src/turn/turn-evidence.ts` verifies narrative confirmation of the player's exact proposed event minute; this checks an appointment record, not elapsed time. Provider controller schema permits `schedule_event`, but not arbitrary `set_event_status`, `reschedule_event` or clock deltas. Gameplay authorization requires an exact matching player intent, future time, present participants and confirmation.

Offline example: event at minute 5, clock advanced to 10 -> remaining **-5**, status still **scheduled**.

### Authored data versus executable consumers

| Authored data | Current treatment |
|---|---|
| [Slave Market](data/locations/calderan/west/calderan_slave_market.yaml): around-the-clock market, formal auctions primarily by day, direct purchases outside auction hours, daytime traffic | Retrievable/projected lore. No auction hours gate, next-lot queue/timer, closing logic or time-based crowd simulation |
| [The Crucible](data/locations/calderan/east/the_crucible.yaml): food/farmer market in mornings, general daytime commerce | Lore; no timed stock/service/spawn switch |
| [Heartstone Square](data/locations/calderan/heartstone/heartstone_square.yaml): moderate daytime foot traffic | Lore; no time-based scene presence/traffic filter |
| City geography's approximate crossing duration | Descriptive lore; numeric connection minutes separately determine routes |
| `EventEntity.time: WorldTime \| null`, `src/types/entities.ts`; `src/world/validation.ts` | Authored schema supports a time value and validates it. Current loaded world has **zero authored event entities**. No authored-event time scheduler found |

`src/turn/retrieval-policy.ts` classifies questions about opening hours/schedules to retrieve canon. It does not use current clock to open/close/filter a location. `src/scene/scene-ram-builder.ts` determines presence from runtime placements/co-location, not NPC hours. No executable NPC daily routine, shop opening/closing, auction scheduler, lighting/day-night state, time-gated retrieval/encounter/spawn, calendar, weather or ambient world simulation was found. Lighting/traffic consistency is a narrator instruction over clock plus lore, not computed environmental state.

## 9. Save/reload

[src/persistence/save-format.ts](src/persistence/save-format.ts) puts the complete schema-3 campaign snapshot in a schema-4 save envelope. `createSaveFile`, `serializeSave`, `decodeSave` and snapshot validation preserve the numeric clock. Compatibility checks may rebind dataset identity after reference validation; they do not recalculate time.

[src/persistence/campaign-repository.ts](src/persistence/campaign-repository.ts) captures the snapshot before asynchronous save I/O and writes atomically. `loadCampaign` validates and calls `CampaignState.restore`; restore installs the validated snapshot directly without opening initialization, command replay or mana recovery replay. Migrations preserve scene clock; migration-created histories use that saved value. Invalid saves fail rather than reset to 0 or 600.

Offline roundtrip at minute **1690** preserved the entire campaign snapshot exactly, including event/mana data; derived narrator grounding after restore was `{"world_minute":1690,"day":1,"actual_time":"04:10"}`. `GameSession.loadCampaign`, [src/app/game-session.ts](src/app/game-session.ts), wraps the restored campaign with fresh session/coordinator state. Session conversation/scene continuity buffers and diagnostics are not a second persisted clock; their reset does not reset runtime time or scheduled records. Next prompt derives time from restored snapshot. Loading an older slot deliberately returns to that older saved clock.

`metadata.saved_at` / `created_at` are real UTC ISO timestamps from `new Date().toISOString()`, not world-minute conversions. Offline elapsed time, app downtime, save age, provider latency and UI polling add **0 game minutes**. No session-only elapsed-world-time accumulator was found.

## 10. Day/date/calendar state

The engine stores only the primitive world-minute clock, alongside deadlines and historical stamps. Day index is derived as `floor(world_minute / 1440)`; it is not a separate mutable day field. Narrator minute-of-day uses normalized modulo 1440; UI exposes a modulo projection. HH:MM is arithmetic formatting of that index.

There is no day-of-week, calendar date, month, year, season, sunrise/sunset time, latitude model, location-local offset or game timezone. Day 0 is an index, not an established named date. Real UTC metadata does not establish an in-world timezone. Formatting midnight at a 1440-minute boundary does not establish solar/seasonal daylight rules.

## 11. Existing temporal helpers

| File / function or constant | Responsibility |
|---|---|
| `src/world/runtime-domain.ts`: `WORLD_DAY_MINUTES`, `DAILY_MANA_RECOVERY`, `prepareRuntimeDelta` | 1440-minute day, 25 mana per crossed day, validated arithmetic/preparation |
| `src/scene/scene-delta.ts`: `validateSceneDelta` | Safe nonnegative advancement, clock sum, revision/reference/resource validation |
| `src/world/runtime-state.ts`: `advanceTime`, `applySceneDelta`, `exportSnapshot` | Legacy explicit advancement and immutable snapshot; same shared domain |
| `src/campaign/campaign-state.ts`: `prepareCampaignChange`, `prepare`, `commit`, `apply`, `restore` | Atomic owner boundary; initialize/restore exact clock |
| `src/turn/player-intent.ts`: `playerIntent` | Bounded digit-duration wait parsing and strict travel intent |
| `src/world/travel.ts`: `findRoute`, `travelDestination` | Deterministic route sum; authored entrance resolution |
| `src/turn/natural-actions.ts`: `reachable`, `resolveMovement`, `resolveNaturalActions` | Natural travel -> same route/time delta |
| `src/turn/character-movement.ts`: `resolvePlayerCarry` | Shared player travel duration, no duplicate companion charge |
| `src/turn/temporal-grounding.ts`: `temporalGrounding`, `TEMPORAL_GROUNDING_RULE` | Normalized minute-of-day -> zero-padded HH:MM and day; prompt rule |
| `src/app/session-view.ts`: `deriveSessionView` | On-demand committed clock/day/minute-of-day projection |
| `src/app/game-session.ts`: `movementOf` | Observed elapsed-minute diagnostic |
| `src/campaign/projections.ts`: `remainingEventMinutes` | Safe deadline subtraction; explicitly no implicit trigger |
| `src/campaign/preparation.ts`: `worldMinute`, `historicalMinute` | Current draft stamp source and future-provenance rejection |
| `src/persistence/save-format.ts`, `save-migrations.ts`, `campaign-repository.ts` | Exact snapshot time persistence; separate real metadata |

There is no general human-duration parser, daypart/bucket helper, wait-until helper, solar helper or active schedule-check loop. Existing event helpers operate on records/deadline arithmetic only.

## 12. Current narrator exposure and temporal consistency rule

[src/turn/prompt-builder.ts](src/turn/prompt-builder.ts), `buildNarratorPrompt`, inserts raw world minute in its authoritative scene block and a dedicated block produced by `temporalGrounding`. At the UI start:

```text
World minute: 600. Player mana: 100/100.
[AUTHORITATIVE CLOCK]
{"world_minute":600,"day":0,"actual_time":"10:00"}
TEMPORAL GROUNDING: The authoritative clock determines the current time. Do not infer morning, afternoon, evening or night from prior prose, lighting, mood, traffic, habits or schedules. Conversation alone does not advance time; unchanged clock means unchanged time of day. Describe current lighting/traffic consistently with that clock. No calendar, season or sunrise/sunset time is established.
```

That is the exact current temporal rule from [src/turn/temporal-grounding.ts](src/turn/temporal-grounding.ts). The narrator receives raw minute, derived day index and exact HH:MM. It receives **no semantic daypart label**, location-local time, calendar date or solar data. Scheduled-event records, authored location lore and recent prose can also appear in context; none has authority to override the clock. Clock is included in narrator context identity. For travel/wait, the intent stage projects the proposed resulting clock before narration; it becomes durable only at final commit. On failure that projection is discarded.

The rule forbids deriving time of day from earlier prose/lighting and says conversation does not advance time. It does not establish duration semantics for all activities or implement an elapsed-hours detector. Runtime/schema/authorization enforcement prevents narrator/controller clock mutation; it does **not** guarantee delivered prose cannot claim elapsed hours or contradictory lighting. Existing deterministic audit/reconciliation does not supply a general temporal prose consistency check. The offline delivered `*An hour passes.*` at unchanged minute 0 proves that distinction. No prompt or enforcement change is made here.

## 13. Ownership of time mutation

**The deterministic engine owns advancement; a validated typed runtime delta is its mutation vehicle; `CampaignState` owns the single commit.** Player text can request recognized waits/travel. Trusted host APIs and UI initialization can supply validated deltas. Initialization and restore can supply a complete valid clock value. Legacy standalone runtime uses the same domain and owns only its own state.

The narrator may **describe** time and propose prose, but may not **mutate** authoritative time. The production controller may propose an exactly authorized appointment deadline, but may not advance the clock. UI does not operate a ticking game clock. Tests/developer fixtures can supply explicit initial times/deltas without changing production authority. Reflection/mannerism maintenance does not advance time.

## 14. Evidence-backed risks / inconsistencies

These are audit findings, not newly implemented rules or automatic new D-series debts. No BLOCKING state-corruption issue was found in the traced paths and offline checks.

| Severity | Finding / evidence | Implication |
|---|---|---|
| IMPORTANT | Delivered mock `*An hour passes.*` on `Hello.` kept minute 0 | Prompt grounding does not mechanically reconcile elapsed-time claims with state |
| IMPORTANT | All five requested wait examples (`wait 10 minutes`, `wait an hour`, `wait until evening`, `*waits*`, `*waits for the next slave lot*`) yield no runtime duration | Natural player expectations can exceed the exact grammar; scene prose can progress without clock progress |
| IMPORTANT | Event at minute 5 remains scheduled at clock 10; no automatic triggering or next-lot scheduler | Deadline/auction prose must not be mistaken for an executable event progression system |
| MINOR | Player-route travel adds minutes; local action/shopping/combat/dialogue does not; trusted location-only move adds none | Passage of time is currently explicit and uneven across activity classes; universal travel cost is not enforced at the low-level location setter |
| MINOR | Signed safe-integer clocks are allowed; UI uses `% 1440`, narrator normalizes modulo | For a supplied negative clock, UI minute-of-day can be negative while narrator HH:MM stays normalized. Normal current starts do not exercise this edge |
| OBSERVATION | Default 0 versus UI 600 is documented intentional setup | Comparing openings without their initial clock can misattribute a time discrepancy |
| OBSERVATION | Authored day/morning/auction-hours lore is not mechanically consumed as schedules | Retrieval can expose timing descriptions without opening/closing enforcement |
| OBSERVATION | HH:MM/day exist, semantic daypart/solar context does not | Exact clock input is present; clock-like prose remains a possible presentation concern, not a measured live-model defect in this audit |
| OBSERVATION | Mana recovery occurs at index boundaries, not after a rolling 24 hours | Short advance across a boundary can recover mana; this is existing behavior, not a new pacing decision |

State atomicity, safe integer validation and exact save restore passed the examined checks. This does not establish live narrator temporal reliability or cover every possible provider response.

## 15. KISS recommendation

CURRENT:

```text
one authoritative world_minute
-> validated explicit wait/travel/host delta, atomic commit
-> existing deterministic day/HH:MM projection
-> narrator clock block + grounding instruction
```

MINIMUM FUTURE SHAPE, compatible with the audited architecture:

```text
authoritative time
-> deterministic derived time-of-day bucket
-> narrator-facing label
```

No second clock, mutable bucket state, scheduler or engine refactor is needed merely to expose a label. The smaller implementation surface would be the existing temporal projection helper and its current prompt seam, once mapping/presentation decisions are approved. This is a compatibility finding, not a finalized design. Labels alone would not change supported waits, advancement policy, event progression or prose enforcement. This audit chooses no rules for any of those.

## 16. Decisions deliberately NOT made

The preferred possible future labels are **Sunrise, Morning, Late Morning, Early Afternoon, Afternoon, Late Afternoon, Sunset, Evening, Late Evening, Night, Midnight, Deep Hours**. No ranges, boundaries, ordering semantics at wraparound, seasonal mapping or implementation were assigned.

Also undecided: sunrise/sunset logic; calendar/seasonality; whether exact HH:MM remains in prompts; whether dialogue advances time; default per-turn minutes; vague/event-directed wait resolution; action/combat/shopping durations; event triggering; start-time changes; prose enforcement or pacing changes.

P11 remains **OPEN / AUDIT COMPLETE / DESIGN PENDING**. Production code changed: **NO**. Paid calls: **0**. Only this report and the living status documentation are changed; P10 observations and historical implementation evidence are preserved.
