# CALDREVAN NPC+ Pass 7 — play integration and organic reflection

Date: 2026-10-02. Result: **COMPLETE**, with an explicit live coverage limit: **61 successful gameplay turns produced no new NPC+ developments, no due characters, and no reflection calls**. The integration and recurring-episode rule are verified deterministically; this live sample cannot establish reflection quality or usefulness. Triggers were not loosened to produce notes.

Context read: Pass 6 reflection and Pass 5 live rebaseline reports. No commit or push. Existing H5/NPC+ working-tree changes were preserved. No new NPC+ capabilities, autonomous behavior, personality evolution, relationship authority, memory, goals, or knowledge grants were added.

## A. Integration semantics

`src/dev/play.ts` uses `src/dev/play-turn.ts::runPlayTurn`, the same helper exercised by the integration tests and live evaluation. It drains `runTurn` and publishes every gameplay event first. Only after `turn_completed`, and after the generator has finished, does it call `reflectAfterTurn`. A failed turn or an already-aborted signal never invokes reflection. Default: at most one due character per post-turn operation, retaining Pass 6's stable selection and triggers.

The normal CLI prints streamed narration and the finalized gameplay revision before reflection starts. The next prompt, queued command, `/save`, or `/load` waits until the separate post-turn operation finishes. There is no parallel campaign mutation. A successful reflection can create a later revision in `premium_reflections`; the already-published gameplay revision still describes the gameplay commit. Saving afterward includes the reflection revision through the existing session/repository machinery.

Provider failure, malformed output, stale state, or rejection cannot change the gameplay outcome. Unexpected reflection infrastructure errors are also contained by the helper. As in Pass 6, an all-rejected valid response records `last_reflected_revision` without creating notes, preventing repeated submissions of identical evidence. This tracking revision is distinct from a gameplay change. Failure/malformed/stale responses do not record a reflection revision.

This is sequential post-turn execution, not a fully non-blocking worker. The existing provider has a 20-second default timeout and a 600-token output limit. Cancellation before reflection suppresses it; Ctrl-C during an already-running reflection does not propagate to that provider request, which finishes or times out. Narration never waits on the reflection request. `runTurn` remains **164 lines**; reflection logic was not inserted there.

## B. Bounded diagnostics

New `src/turn/reflection-diagnostics.ts` records base/final revision, due IDs/count, deferred count, attempts, `not_due`/`no_evidence` skips, per-character status/provider outcome, parsed and accepted proposal counts, rejection counts by reason, stale drop, committed revision, new/update counts, safe input/output token counts, and provider/operation elapsed milliseconds.

Due IDs and character details are capped at 32 entries, while counts describe the full set. IDs, statuses and aggregate counts are emitted; note text, proposal text, evidence text, provider error messages and arbitrary usage fields are excluded. Records are frozen. A throwing or rejected asynchronous diagnostics sink cannot change reflection state. Normal CLI reflection diagnostics are printed only with `--debug`.

The evaluation's accepted-note review artifact is separate from ordinary diagnostics. It deliberately includes accepted text and cited public evidence for review, and would mark classifications `PENDING_HUMAN_REVIEW`. Both live review artifacts are empty in this run.

## C. Narrow recurring-evidence guard

New proposals using recurring/recurrent, repeated/repeatedly/repeating/repeat, often, or habitual/habitually in their text or normalized label require **at least two distinct episode starts in their cited evidence**, in addition to the existing per-kind evidence policy. Rejection reason: `insufficient_distinct_episodes`.

Recent developments carry revision-based episode identity; multiple records at the same revision do not multiply episodes. A condition addition starts an episode, while its removal does not. For condition-specific wording, cited unrelated relationship changes or moves cannot supply a second condition episode. A small injury/wound wording match covers the measured injury case; this is not a general semantic entailment checker.

Consolidated condition `added` counters prove starts, capped at two for this check. A roll-up with one addition and one removal proves one episode, even if its total entry count is two or more. Generic aggregate entry totals do not retain enough identity to license recurrence. Tests cover both a real add/remove pair consolidated out of the recent window and a subsequent second addition supported across recent history and roll-up.

The reflection-only provider instruction explains the same rule and asks for interpretation beyond stored values. Runtime narrator/controller prompts and trigger thresholds were not changed during the live experiment. Existing saved notes are not retroactively rewritten by this proposal guard.

## D. Organic sessions and artifacts

Real OpenRouter narrator/controller requests ran against the existing small synthetic-world play fixture, with Brenna and Maren as two active NPC+ in Nicco's household. Setup creates membership only: each NPC has one `joined_household` development, no contract evidence, no roll-up and no reflection notes. **No premium developments, conditions, contracts or reflection notes were seeded to activate reflection.** After setup, the harness applies no campaign commands directly: all state changes must pass through ordinary gameplay.

| Session | Complete turns | Activities |
|---|---:|---|
| Meals | 15 | Breakfast, requests, company, practical help, movement invitations |
| Chores | 15 | Tidying, assistance, differing arrangements, compromise, movement |
| Disagreement | 15 | Quiet/shared space, listening, disagreement, compromise, a break |
| Assistance | 15 | Help, respecting preferences, work division, rest, movement |

The first batch stopped at its 250,000-token cap after meals, chores and one disagreement turn. It used 254,057 tokens because caps are checked before each turn and allow one-turn overshoot. The continuation restarted disagreement from the same unseeded baseline and completed disagreement/assistance under a 400,000-token cap. Thus there are **60 turns in four complete sessions plus one separately retained prefix turn**, all included in safety/cost totals. Each batch also had a $1 estimated-cost ceiling; actual combined cost was much lower. The first summary predates the harness fix that includes partial-session summaries, so the aggregate includes the prefix from its raw JSONL rather than silently omitting it.

Artifacts:

- [First batch JSONL](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/h5-live/npcplus7.jsonl), [summary](../h5-live/npcplus7.summary.json), [review](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/h5-live/npcplus7.review.json).
- [Continuation JSONL](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/h5-live/npcplus7-continuation.jsonl), [summary](../h5-live/npcplus7-continuation.summary.json), [review](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/h5-live/npcplus7-continuation.review.json).
- [Combined measurements](../h5-live/npcplus7.aggregate.json).

`src/dev/eval-organic-reflection.ts` records authored inputs, safe gameplay/reflection diagnostics and aggregate measurements, rather than storing full provider prompts or delivered narration. It supports `--dry`, `--sessions`, `--max-tokens`, and `--out`. For a new 60-turn replication, build then run `node .build/src/dev/eval-organic-reflection.js --max-tokens 650000 --out <new-file.jsonl>` with the existing API-key environment. Provider output is stochastic; a replication need not produce the same trigger rate. An offline 60-turn dry run also passed without paid calls.

## E. Measured trigger rate and evidence

| Measure | Observed |
|---|---:|
| Gameplay turns / successful outcomes | 61 / 61 |
| New organic NPC+ developments | 0 |
| Post-turn due checks | 61 |
| Due character observations / actual reflection calls | 0 / 0 |
| Reflection calls per 100 turns | 0 |
| Characters reflected | None |
| Accepted / rejected proposals | 0 / 0 |
| Note kinds / updates / new notes | None / 0 / 0 |
| Evidence entries sent to reflection / accepted-note evidence refs | 0 / 0 |

Each NPC's baseline catalog has two entries: one public canon entry and one membership development. Neither supplies the three-development trigger. No relationship/condition/rule/contract changes arose from these requests. Eight authoritative `runtime_delta` commands moved the player between rooms; invited NPCs did not acquire committed movement developments. Conversation, assistance wording and disagreement alone do not create recorded premium history. This explains the measured zero rate without implying that an activated provider rejected notes.

## F. Accepted-note human review

There are **zero accepted organic notes**, so there are zero items requiring SUPPORTED / MILD OVERREACH / UNSUPPORTED classification. Both review lists are `[]`; pending human reviews: zero. No human review was performed or fabricated. There are no accepted organic examples to record. A future run with accepted notes must obtain the requested human classifications; the harness preserves the note and its cited public evidence for that purpose.

Zero unsupported accepted notes here is a zero-denominator observation, not a measured 100% faithfulness result.

## G. Usefulness review

USEFUL / REDUNDANT / TRIVIAL counts are all zero because no notes were produced. This pass cannot demonstrate continuity value beyond raw storage, recurring household contribution, or interpretation of mixed relationship tendencies. The reflection prompt prefers that meaning and the existing caps remain, but usefulness needs accepted organic examples. No notes were manufactured or triggers weakened to populate this review.

## H. Latency, context and cost

| Token family | Input | Output |
|---|---:|---:|
| Narrator, including revisions | 255,878 | 9,612 |
| Controller | 230,364 | 515 |
| Reflection | 0 | 0 |
| Total | **486,242** | **10,127** |

Total: **496,369 tokens**, **127 gameplay provider attempts**, approximately **$0.146409** estimated combined cost. Reflection cost is zero. Models were `z-ai/glm-5.2` and `deepseek/deepseek-v4-flash-0731:nitro`; the reflection provider retains the controller-class default but was never invoked live.

The harness fetched public per-token pricing from [OpenRouter's models API](https://openrouter.ai/api/v1/models): narrator input/output $0.41/$3.99 per million; controller input/output $0.0108/$1.28 per million. This is a token-rate estimate, not an invoice; cached-input discounts and any unreported billable tokens are not reconstructed. Recorded usage includes the five revision narrator calls. Caps account for reported completed-call usage, not an external hard spending limit.

Observed narration-call latency p50/p95: **3,301 / 4,576 ms**; controller: **850 / 1,520 ms**. Reflection due-check operation p50/p95: **0.0083 / 0.0282 ms**. Reflection provider latency is **not measured**, rather than reported as zero. Sequential prompt delay for an actual reflection request remains to be measured live.

Maximum live serialized context: **5,065 characters**; NPC+ contribution: **519 characters**; reflection context delta: **0**. Tier B max two reflection notes, Tier C max one token, global NPC+ 4,000-character budget and 32,000-character protection are unchanged. The existing mixed stress test with 30 NPC+, 64 facts, 32 events and full reflection caps passed again after integration, checking both ceilings and all 31 present people.

## I. Safety, correctness and validation

Live checks observed zero gameplay failures, zero reflection-induced changes to gameplay domains and zero secret-sentinel matches. No reflection prompt existed live, so this alone does not exercise private-evidence exclusion on an activated provider; the existing real-canon private-evidence test and diagnostics redaction tests remain green.

Existing narration auditing found three `uncommitted_condition`, one `player_agency`, and one `asserts_uncommitted_transfer` draft issue. Four were delivered as clean revisions; the disagreement turn 8 condition issue survived revision and was delivered through the existing redaction path. No such narration was used to seed an authoritative condition or premium development. These are recorded gameplay audit findings, not reflection proposals.

New focused suite: **17 tests**, all pass. Coverage includes publication-before-provider ordering; failure/malformed/stale/all-rejected isolation; not-due and failed/cancelled gameplay; an accepted due reflection committing only its own domain after publication; all six requested recurrence wordings; label-only recurrence; add/remove; distinct additions; same-revision deduplication; actual consolidation; safe diagnostics and sink isolation; CLI wiring; save/load; and coordinator size. No preexisting test expectations were changed.

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | PASS | PASS |
| `npm test` | 1,269 total; 1,265 pass; 0 fail; 4 TODO | **1,286 total; 1,282 pass; 0 fail; 4 TODO** |
| `npm run test:playthrough` | 25/25 | **25/25** |
| H2 golden | PASS | **PASS, unchanged, not regenerated** |
| Prior NPC+ suites / context stress | PASS | **PASS** |
| `runTurn` lines | 164 | **164** |

Deterministic fixtures deliberately construct evidence to test activated paths; they are separate from the unseeded live experiment. Reflection remains non-authoritative and writes only its existing reflection domain plus campaign revision. Tests verify unchanged gameplay domains and save/load preservation.

## J. Remaining debt

1. Organic domestic conversation in this sample produced no structured developments. Activated live reflection latency, faithfulness and usefulness remain unmeasured in Pass 7.
2. The lexical recurrence guard proves recorded episode counts, not complete semantic support for every claimed behavior. It recognizes a narrow condition match and does not become a general paraphrase/causality checker. Generic roll-up recurrence is conservatively rejected when identity was lost.
3. Saved Pass 6 notes are not retroactively revalidated. The new guard applies to proposed notes; existing note retention/eviction stays unchanged.
4. Reflection still delays the next command when due, can consume up to its provider timeout, and does not support in-flight cancellation. Provider failure/malformed output leaves evidence due for a later turn, retaining the existing retry-on-later-turn behavior.
5. Cost ceilings are pre-turn estimates with one-turn overshoot and depend on reported usage. The synthetic household covers two NPC+ but does not establish broader real-canon organic trigger rates.

## K. Recommendation for Pass 8

Study why meaningful ordinary interactions yield no authoritative NPC+ developments before adding personality evolution. Observe longer canonical household play and review which existing authorized state/history transitions naturally occur. Distinguish conversational interpretation from evidence that the engine actually records. Keep the current triggers and authority boundaries until that observation supplies a reasoned change; do not synthesize injuries, rules, contracts or notes to manufacture a benchmark.

When organic notes do appear, review every accepted note with a human for support and usefulness, and measure actual post-turn prompt delay. Retain the failed/malformed/stale, private-evidence, consolidation and context stress checks. No additional NPC+ capabilities are recommended on the basis of this zero-note sample.

CALDREVAN NPC+ PASS 7 COMPLETE
