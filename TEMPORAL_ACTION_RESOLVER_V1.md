# Temporal Action Resolver V1

This is a follow-up to `LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md`, dated 2026-10-07. It adds deterministic elapsed time for Nicco's explicit wait, sleep, nap and rest requests, and a guard that stops delivered narration from completing time the clock did not advance. No paid provider calls were made.

**Audited vocabulary, all reused rather than redefined:**

- **Clock.** The single clock is `runtime.scene.world_time.world_minute`. A day is `WORLD_DAY_MINUTES` = 1440. The day is `floor(minute / 1440)` and the minute of day is `minute mod 1440`.
- **Dayparts.** The fixed `DAYPARTS` table in `temporal-grounding.ts` gives these period starts:

  | Period | Start (minute of day) |
  | --- | --- |
  | Midnight | 1410, spanning 1410–60 |
  | Deep Hours | 60 |
  | Sunrise | 300 |
  | Morning | 390 |
  | Late Morning | 570 |
  | Early Afternoon | 720 |
  | Afternoon | 840 |
  | Late Afternoon | 990 |
  | Sunset | 1110 |
  | Evening | 1170 |
  | Late Evening | 1290 |
  | Night | 1380 |

- **Mutation.** Time changes only through `prepareRuntimeDelta` → `time_advance_minutes`, committed once.
- **Mana.** Each crossed day boundary recovers +25 mana, capped at the maximum.
- **Travel.** Travel advances route minutes from `reachable()`.
- **Limit.** One player time request may advance at most 1440 minutes, the existing P11 limit.

## 1. Previous supported grammar

`/wait N`, `wait N minute(s)/hour(s)`, `I wait …`, `wait an/one hour`, exactly `*waits N …*`, and `*he spent N … <activity>*`, all limited to 1–1440 minutes. There was no sleep, nap or rest; no "at least"; no number words beyond one; and no targets.

## 2. New verbs and forms

One shared parser, `src/turn/temporal-action.ts` `parseTemporalAction`, handles all four verbs:

| Verb | Forms |
| --- | --- |
| wait | wait, waits, waiting |
| sleep | sleep, sleeps, sleeping, go(es) (back) to sleep, get(s) some sleep |
| nap | nap, naps, napping, take(s) a nap |
| rest | rest, rests, resting |

Accepted additions:

- **Subject:** `I`, `he` or `Nicco`, optionally followed by an adverb (`then`, `just`, `quietly`, `finally`, `simply`, `slowly`, `also`).
- **Place phrase:** an optional phrase such as `on the sofa`, before or after the time clause.
- **Format:** starred RPG action segments, and differences in case and punctuation.

Compound inputs work when the other clause is ordinary: `he lies down and rests for two hours`, `I drink the tea and then sleep for five hours`. `/wait N` and `*he spent N …*` stay in `player-intent.ts` unchanged.

## 3. Duration parser

The amount can be:

- digits, or the words one through twelve;
- `a` or `an` followed by a unit;
- `half an hour`, which is exactly 30 minutes because the representation is integer minutes.

Units are minutes/mins and hours/hrs. A duration may be prefixed by `for`.

`wait a minute` without `for` is treated as an interjection and advances nothing; `wait for a minute` advances 1 minute.

## 4. "At least" policy

`at least N`, `atleast N`, `for at least N` and `for atleast N` all resolve to **exactly N**: the minimum the player asked for. The engine never invents elapsed time beyond the explicit minimum and never randomizes it. The result is flagged `minimum: true`.

## 5. Named number support

The words one through twelve, plus `a`/`an`, are accepted. There is no general number parsing.

## 6. Daypart targets

`until <period>` accepts any `DAYPARTS` label (`night`, `evening`, `morning`, `sunset`, `late afternoon`, …), with or without `the`. Each label targets its **start**, read from `daypartStart()`, which is derived from the same table that labels the time. No minute values are duplicated.

`noon` is 12:00. `midnight` is the next 00:00 boundary, not the start of the Midnight label.

## 7. Clock targets

- 24-hour forms: `15:00`, `15:30`.
- 12-hour forms: `3 pm`, `3:30 pm`, `3 PM`, `8 am`, `8:30 AM`, `3 p.m.`.
- `until 3`, with no minutes and no am/pm, is ambiguous and therefore unsupported.
- Impossible values (`25:00`, `13 pm`, `3:75 pm`) are invalid and the turn is rejected.

## 8. Tomorrow targets

`tomorrow morning`, `tomorrow afternoon`, `tomorrow evening`, `tomorrow night`, `tomorrow noon`, `tomorrow <clock>` and `tomorrow <daypart>` always resolve on the **next world day**. `tomorrow midnight` is deliberately unsupported because it could mean either tonight's 00:00 or the following one; bare `tomorrow` is unsupported too.

A tomorrow target more than 1440 minutes ahead is rejected under the preserved limit. For example, `tomorrow noon` asked at 10:00 would be +1560.

## 9. Strictly future targets

**Yes.** A same-day target advances by `(target − now) mod 1440`, and a result of 0 becomes 1440, so a request never advances zero.

- `sleep until night` asked at 23:10, already inside Night, advances 1430 to the next 23:00.
- `until midnight` asked at 00:00 advances 1440.

## 10. Ambiguity and fail-safe behavior

**Unsupported inputs** add no time, and the turn continues as ordinary interaction:

- vague amounts: `a while`, `a few hours`, `several hours`, `some time`, `ages`;
- vague targets: `later`, `he arrives`, `tomorrow`, `tomorrow midnight`, `3`;
- a bare verb: `rest`, `wait`, `sleep`;
- inactivity verbs without a temporal clause: `lies down`, `sits`, `relaxes`;
- more than one temporal clause (`sleep for five hours, then wait another two hours`). Sequential requests are not summed in V1;
- a duration and a target that disagree (`sleep for five hours until night`). They are accepted only when they agree.

**Invalid inputs** are matched but out of range: zero, more than 1440 minutes, an impossible clock time, or a target beyond the limit. They raise `invalid_runtime_intent`, the existing P11 convention, and the turn is rejected atomically.

## 11. Player-action authority

The request must be Nicco's present action:

- **Speech is ignored.** Quoted spans are dropped, and when an input has starred segments, its unstarred text is ignored.
- **Any modal, plan or hypothetical anywhere in the input rejects it:** `will`, `would`, `should`, `could`, `might`, `may`, `can`, `must`, `maybe`, `perhaps`, `if`, `when`, `plans`, `wants`, `needs`, `tries`, `decides`, `considers`, `later`, `tonight`, `'ll`, `'d`.
- **So do instructions:** `tell`, `ask`, `order`, `let`.
- **The first word may not name someone else.** `she`, `they`, `the woman` and the names of present characters are rejected. So is a capitalized name that is not `I`/`He`/`Nicco` or a temporal verb, and a bare subject followed by a verb (`korvin drinks …`).

## 12. NPC-action exclusion

`Mira sleeps for five hours`, `*Mira naps for an hour*`, `the woman rests for two hours`, `tell Mira to sleep …` and `She should sleep …` advance no time. There is no NPC scheduler.

## 13. Runtime mutation path

A resolved request becomes the existing `runtime_delta { time_advance_minutes }`. It is projected before narration, validated by the same 1–1440 check, and committed atomically with the turn. The day and daypart are still derived from the committed minute. There is no new mutation domain, no direct day or daypart write, and no controller involvement; the controller schema is unchanged.

A temporal request combined with travel in the same input (`walk to the heartstone tower and sleep for 5 hours`) is rejected with `invalid_runtime_intent` rather than charging route minutes plus the request.

## 14. Mana interaction

Mana uses the existing path only. Sleeping across a day boundary (21:40 → `tomorrow morning` = day 1, 06:30) gives +25 capped at the maximum, through `prepareRuntimeDelta`. A same-day sleep crosses no boundary and recovers nothing. Sleep, rest and nap themselves restore nothing.

## 15. Narrator elapsed-time guard

A new audit issue, `uncommitted_elapsed_time` in `narration-audit.ts`, joins the existing revision → redaction architecture. The coordinator passes `elapsed_minutes` (prepared minute minus base minute) to the auditor on the existing line, so `runTurn` stays at its pinned 164 lines.

**With zero elapsed minutes**, these completed elapsed-time claims are flagged:

- an interval: `Five hours pass`, `He wakes five hours later`, `A few hours later`, `After two hours`;
- a passage: `Hours pass`, `The afternoon passes into evening`;
- a transition: `Night has fallen`, `night arrives`, `Daylight disappears`;
- waking later: `When he wakes the next morning`, `By the time he wakes`, `The next morning`;
- a completed sleep: `He sleeps until sunset`, `He sleeps for five hours`.

The correction tells the narrator the current time of day and lets Nicco begin to rest without completing an interval.

**With the player's own temporal request**, an exact narrated duration (digits or a number word) must equal the committed one. For example, `Eight hours later` after a 5-hour sleep is flagged.

**Not flagged** (plans, hypotheticals, feelings and memories): `He considers sleeping for five hours`, `It feels as if he has been awake for hours`, `He could sleep for five hours`, `If he sleeps until night…`, `He plans to sleep until evening`, `Five hours would probably help`, `The room was dark five hours ago`, `It feels like hours`.

**Not covered in V1:** whether a daypart word in the narration matches the resulting daypart when time *did* advance. The narrator already receives the projected `time_of_day` before drafting.

## 16. Long-playthrough regressions

The audit characterizations were converted into acceptance tests, each running end to end through the coordinator:

| Input | Minute | Daypart |
| --- | --- | --- |
| `he sleeps for atleast 5 hours` | 600 → **900** | **Afternoon**, Day 0 |
| `he sleeps for at least 5 hours` | 600 → 900 | Afternoon |
| `he sleeps until night` | 600 → **1380** | **Night** |

The session view derives each daypart. A new case covers an unsupported `he sleeps for a while`: it commits nothing and cannot deliver `Five hours pass … night arrives`.

The P11 cases `wait until evening/sunset/midnight` and `wait half an hour` moved from "unsupported" to the supported table (+570, +510, +840 and +30 from minute 600). The rest of P11's unsupported list is unchanged.

## 17. Travel non-regression

Route-minute semantics are unchanged. All city-travel, movement, safeswitch, follow and live-movement suites pass. `walk for five hours to Heartstone` is not a temporal action, and travel combined with a temporal request is rejected rather than double-charged.

## 18. UI verification

There is no UI change. `deriveSessionView` reports the committed day and daypart after temporal turns: Afternoon, Night, and Day 1 Morning after a cross-day sleep. The existing P11 UI test still passes.

## 19. Tests

- **New:** `tests/temporal-action.test.ts`, 10 tests:
  - daypart starts against grounding;
  - acceptance cases A–F and the other duration forms;
  - acceptance cases G–K, targets, strictly-future behavior, and agreeing or conflicting constraints;
  - negatives;
  - invalid inputs and travel combined with a temporal request;
  - acceptance case L, cross-day mana;
  - failed-turn atomicity, using a controller failure;
  - the zero-delta guard, both flagged and allowed cases;
  - projected grounding and the duration-mismatch guard.
- **Updated:** `tests/long-playthrough-continuity-audit.test.ts` (sleep cases converted, plus the vague-sleep guard case) and `tests/p11-time-foundation.test.ts` (four forms moved to supported).
- **Focused:** temporal, P11, P33/P11 live evidence, audit, city travel and movement, runtime and runtime continuity, narration audits, turn coordinator and UI playtest/v1: **386 passed, 0 failed.**
- **Full suite:** 2529 tests, 2526 passed, **0 failed**, 3 TODO (pre-existing known-limitation tests).
- Typecheck: PASS. Build: PASS.

## 20. Paid calls

0. All providers in the tests are local mocks.

## 21. Changed files

- `src/turn/temporal-action.ts` (new): the parser and resolver
- `src/turn/temporal-grounding.ts`: `daypartStart` and `DAYPART_LABELS`, derived from `DAYPARTS`
- `src/turn/player-intent.ts`: routing, the `temporal` field, and the travel-combination rejection
- `src/turn/narration-audit.ts`: `uncommitted_elapsed_time`
- `src/turn/stages/audit.ts`: passes elapsed minutes through
- `src/turn/turn-coordinator.ts`: elapsed minutes passed to the auditor, on the existing line
- `tests/temporal-action.test.ts` (new)
- `tests/long-playthrough-continuity-audit.test.ts`
- `tests/p11-time-foundation.test.ts`
- `TEMPORAL_ACTION_RESOLVER_V1.md` (new)

## 22. Deliberately unsupported phrases

- **Vague durations:** `a while`, `a few` / `several` / `many` / `some` hours, `ages`, `a bit`, `most of the day`.
- **Fractions:** `1.5 hours`, `an hour and a half`.
- **Bare verbs:** `rest`, `wait`, `sleep`, `go to bed` (which the existing movement rule already rejects), `try to sleep`.
- **Vague or event targets:** `until later`, `tonight`, `until he arrives`, `until the shop opens`, `until 3`, `tomorrow`, `tomorrow midnight`.
- **Requests over 1440 minutes,** including far `tomorrow` targets.
- **Multiple temporal clauses,** and a duration that conflicts with its target.
- **Combinations with other actions:**
  - travel combined with a temporal request is rejected;
  - a transfer in the same input as a temporal request takes the existing transfer path first, so the time request is ignored, as it was for waits before.
- **Non-Nicco sleep,** future or hypothetical requests, and instructions to others.
- **Narration checks left for later:** whether daypart words in narration match the resulting daypart when time did advance.
