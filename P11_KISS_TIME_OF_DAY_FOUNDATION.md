# P11 KISS Time-of-Day Foundation

Date: 2026-10-06. Status: **IMPLEMENTED / LIVE VERIFICATION PENDING**.

## 1. Scope

This pass implements a centralized, deterministic V1 daypart projection and bounded explicit-duration wait ergonomics. Three production files change: `src/turn/temporal-grounding.ts`, `src/turn/prompt-builder.ts`, and `src/turn/player-intent.ts`. Tests and current P11 status documentation accompany them.

No scheduler, NPC routines, shop-hours logic, auction timers, calendar, solar calculations, seasons, per-turn elapsed time, wait-until resolution, second clock or mutable daypart state is added. Participant/name knowledge, P3.3–P3.5, P10, P8/P9, reflection, provider/model settings, retrieval and pacing are unchanged. Historical [temporal audit](P11_TEMPORAL_SYSTEM_AUDIT.md) remains a record of the pre-foundation behavior. Paid calls: **0**; no OpenRouter, Voyage or external provider probes.

## 2. Existing clock preserved

Authority remains `CampaignState.snapshot.runtime.scene.world_time.world_minute`, a validated safe integer. The day remains 1440 minutes. Default opening remains minute 0; the disposable Slave Pens UI remains minute 600. The runtime domain, atomic commit boundary, mana recovery and save schema are unchanged.

There is no second game clock. `time_of_day` is derived on demand, never stored in mutable campaign state or persisted.

## 3. Time-of-day derivation

[src/turn/temporal-grounding.ts](src/turn/temporal-grounding.ts), `temporalGrounding`, owns the only bucket mapping:

```text
world_minute
-> minute_of_day = ((world_minute % 1440) + 1440) % 1440
-> fixed V1 time_of_day label
```

`day = floor(world_minute / 1440)`. A small ordered table of exclusive upper bounds selects the label. The helper retains exact `world_minute` and `actual_time` HH:MM for diagnostics/tests and adds `minute_of_day` and `time_of_day`. The prompt projects only day and label. No bucket logic is copied into the UI, movement, waits or prompt builder; test expectations are fixed boundary examples, not a second derivation algorithm.

Negative valid clock values normalize correctly. Minute 1439 -> 1440 -> 1441 changes day 0 -> 1 -> 1 and local minute 1439 -> 0 -> 1, while all three labels remain Midnight.

## 4. Boundary table

These exact user-specified V1 ranges are fixed and non-seasonal. Sunrise/Sunset are labels, not astronomical calculations.

| Label | Inclusive HH:MM range |
|---|---|
| Deep Hours | 01:00–04:59 |
| Sunrise | 05:00–06:29 |
| Morning | 06:30–09:29 |
| Late Morning | 09:30–11:59 |
| Early Afternoon | 12:00–13:59 |
| Afternoon | 14:00–16:29 |
| Late Afternoon | 16:30–18:29 |
| Sunset | 18:30–19:29 |
| Evening | 19:30–21:29 |
| Late Evening | 21:30–22:59 |
| Night | 23:00–23:29 |
| Midnight | 23:30–00:59, wrapping across the day boundary |

## 5. Narrator-facing change

At Slave Pens minute 600, [src/turn/prompt-builder.ts](src/turn/prompt-builder.ts) now supplies:

```text
[AUTHORITATIVE TIME]
{"day":0,"time_of_day":"Late Morning"}
```

The semantic block no longer contains raw `world_minute`, `minute_of_day`, `actual_time` or exact `10:00`. Existing raw world-minute scene metadata/context identity remains intact, as authorized; this pass does not refactor unrelated precise metadata. Engine precision and existing UI/debug values remain available. No UI redesign or additive UI field was needed.

The minimally revised rule is:

> TEMPORAL GROUNDING: Authoritative runtime time determines the current time of day; use the supplied time_of_day. Do not infer another daypart from prior prose, lighting, mood, traffic or habits. Conversation alone does not advance time; unchanged clock means unchanged time of day. Describe lighting/traffic consistently with that label. Labels are fixed; no calendar, season or dynamic sunrise/sunset model exists.

Existing compaction tests assert that the semantic label and rule survive candidate prompt rendering. Travel/wait narration receives the projected resulting label; authoritative state still publishes only after a successful atomic commit.

## 6. Numeric wait grammar

[src/turn/player-intent.ts](src/turn/player-intent.ts) adds a small private `explicitWaitMinutes` parser to the existing runtime-intent branch. Accepted whole-input, case-insensitive forms:

| Form | Example | Delta |
|---|---|---|
| `/wait N` | `/wait 10` | 10 minutes |
| `wait N minute(s)` | `wait 1 minute`, `wait 10 minutes` | 1 / 10 minutes |
| `wait N hour(s)` | `wait 2 hours` | 120 minutes |
| `I wait N minute(s)/hour(s)` | `I wait 10 minutes`, `I wait 2 hours` | 10 / 120 minutes |
| `wait an hour` / `wait one hour`, optionally prefixed `I ` | `I wait an hour`, `I wait one hour` | 60 minutes |
| `*waits N minute(s)/hour(s)*` | `*waits 10 minutes*`, `*waits 2 hours*` | 10 / 120 minutes |
| Existing spent-time form, retained | `*he spent 1 hour caring for someone*` | 60 minutes |

Natural unstarred waits accept an optional final period and surrounding input whitespace. Minutes/hours require digits; only the exact `an hour` and `one hour` word forms are added. Hours multiply by 60. No fractions, number-word parser, inferred duration or mixed-unit parser is introduced. Quoted dialogue containing a wait does not become a whole-input wait command.

The existing safe integer **1..1440 minute** player bound is unchanged. `/wait 1440` and `wait 24 hours` are valid; zero, 25 hours, oversized integer values and multiple slash-runtime-intent lines reject without mutation. Unsupported natural duration prose such as `wait 1.5 hours` and `wait half an hour` yields no runtime delta. Invalid slash-command syntax such as `/wait 1.5` rejects. Valid waits use the existing `runtime_delta` and transaction pipeline; a provider failure leaves the campaign clock unchanged.

## 7. Explicit non-support for `wait until`

**`wait until ...` is not implemented.** No daypart target lookup or event lookup was added. `wait until evening`, `wait until sunset`, `wait until midnight`, `wait until Korvin arrives`, `wait until the next auction lot`, `wait until someone knocks` and `wait until the shop opens` produce no wait-related runtime advancement.

Vague `*waits*`, `I wait`, `wait`, `wait for a while` and `*waits for the next slave lot*` remain non-mutating because they supply no duration. No arbitrary minutes are invented.

## 8. Ordinary-turn policy

Ordinary dialogue and ordinary local interaction remain **0 automatic minutes**. Shopping/combat/scene prose does not acquire a duration estimate. Only explicit numeric wait, existing routed travel or a trusted runtime delta can advance time. No timer or default per-turn cost is introduced.

The actual UI session test submits `Hello.` at minute 600: state remains 600 and narrator receives Late Morning. It then submits `wait 2 hours`: state reaches 720 and narrator receives Early Afternoon.

## 9. Travel unchanged

Travel retains authored connection minutes -> deterministic route sum -> atomic location/time commit. No changes were made to travel algorithms, connections, movement or carrying logic.

Integration tests use the existing 20-minute Slave Market -> Heartstone Square route. Starting at minute 600 reaches 620 and stays Late Morning; starting at 700 reaches 720 and becomes Early Afternoon. Only the derived label changes with the clock boundary; route costs and arrival behavior are unchanged.

## 10. Save/reload

No save schema or serializer changes. The test saves minute 2160, roundtrips through `createSaveFile`, `serializeSave`, `decodeSave` and `CampaignState.restore`, and compares the complete snapshot. Saved JSON contains neither `time_of_day` nor `minute_of_day`. Restored minute 2160 derives day 1 / Early Afternoon, including in the next narrator prompt.

This verifies derivation after restore from the existing precise clock rather than persisted daypart state.

## 11. Tests

New focused tests: [tests/p11-time-foundation.test.ts](tests/p11-time-foundation.test.ts). Existing P11 assertions in `tests/p33-p11-live-evidence.test.ts` were updated for the new semantic block; their exact HH:MM diagnostic checks and unrelated P3/P10 coverage are retained. The pipeline golden was deliberately refreshed: an independent recursive comparison confirmed **only seven temporal prompt blocks changed**, with all remaining pipeline data identical.

Coverage includes every requested bucket boundary across negative/zero/positive days, 1439/1440/1441 rollover, all ten requested explicit wait forms, preserved spent-time syntax, safety bounds, malformed/vague/event waits, quote protection, real UI/coordinator dialogue and +120 wait, travel crossing/non-crossing, compaction, exact save restore and failed-turn atomicity.

| Validation | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | 2251 tests: **2247 passed**, **0 failures**, **4 historical TODOs**, 0 skipped/cancelled |
| `npm run test:playthrough` | **25/25 passed**, 0 failures/TODOs |
| Focused temporal/wait/UI/travel tests | **110/110 passed**, 0 failures/TODOs |
| Pipeline golden tests | **6/6 passed**; only seven semantic time blocks changed |

All runs use offline fixtures/mocks; no provider probes were performed. The same four historical H1 TODOs are preserved: group-pronoun phantom transfer, first-name condition attribution, unnamed captive price over-redaction and fronted-adverbial receipt detection. None is newly introduced or closed here.

## 12. Remaining limitations

No temporal prose reconciler is added. Narration can still imply elapsed time, for example `*An hour passes.*`, without authoritative advancement; the prompt rule is guidance, not a mechanical elapsed-hours detector. Daypart projection does not solve pending-event or auction continuity.

No NPC/market scheduling, automatic event trigger, solar/calendar model, action duration estimates or dialogue progression is added. Existing raw minute metadata remains in the prompt; semantic HH:MM has been removed, but live verification must still assess whether the model naturally uses labels without inferring exact times.

## 13. Future `wait until` dependency on event continuity

**TEMPORAL FUTURE WORK — NOT IMPLEMENTED**

1. `wait until <time/daypart>`: a future deterministic temporal target category.
2. `wait until <event>`: a separate future event-directed category.
3. Integration with immediate/pending event continuity.
4. Possible temporal prose reconciliation if later needed.
5. Possible season/solar model only if gameplay ever justifies it.

Neither wait-until category is designed here. **Event-directed wait-until must not be implemented before the event-continuity layer is understood.** This is a recorded dependency, not an implemented scheduler or event resolver.

## 14. Live verification checklist

P11 remains **IMPLEMENTED / LIVE VERIFICATION PENDING**, not closed. This task makes zero paid calls. A later authorized live verification should confirm:

- Narrator uses supplied dayparts naturally, including Late Morning at minute 600.
- No exact-clock overfitting or clock-like prose from raw metadata.
- Numeric waits behave as intended in gameplay and update the next narration's label.
- Conversation leaves time unchanged; routed travel changes labels only at boundaries.
- No temporal regression across rollover or reload.

No live result is claimed by the offline checks.
