# Caldrevan hardening H5 — live model robustness and provider resilience

**Date:** 2026-10-01. The working tree is left for review: no commit, no push.

The offline part (retry layer, failure-injection suite, diagnostics extension, aggregation tool, live harness) was implemented first. A follow-up run with `OPENROUTER_API_KEY` and `VOYAGE_API_KEY` present completed the live part:

- 570 live turns across three configurations;
- a live Voyage retrieval evaluation;
- an excerpt-based safety review.

Raw results are in [`CALDREVAN_HARDENING_H5_LIVE_EVAL.md`](CALDREVAN_HARDENING_H5_LIVE_EVAL.md) / [`.json`](CALDREVAN_HARDENING_H5_LIVE_EVAL.json) and [`h5-live/`](h5-live/).

## A. Executive result

**Status: COMPLETE.** Every live stage in the brief ran.

**Provider robustness is good:**

- 570 turns: 99.82% success overall, and 100% across the 395 retry-enabled turns.
- Controller parse: 99.82%.
- Narrator availability: 100%.
- Total-turn p99: 11.2–11.4 s.

**Retry was never exercised live.** No transient provider error happened in 1,243 calls. Retry therefore cannot be credited with any measured improvement, and none is claimed.

**The live run found engine defects that sit outside provider robustness.** They are recorded here and not fixed, because H5 must not change gameplay:

1. A probable duplicate-identity purchase was committed: 1 of 30 purchase turns.
2. Narrated movement and departure are never committed for common phrasings: 0 of 119 completed movement turns committed a move.

| Measure | H4 baseline | H5 |
|---|---:|---:|
| Tests (total / pass / fail / todo) | 1157 / 1153 / 0 / 4 | 1196 / 1192 / 0 / 4 |
| Replay | 25/25 | 25/25 |
| H2 golden file | — | byte-unchanged |
| Live turn success (no retry / retry) | not measured | 99.43% / 100% |
| Live secret leaks / unsupported Nicco commits | not measured | 0 / 0 |
| Live wrong committed state | not measured | 1 (probable) |
| Hybrid retrieval multi-answer R@5 (live Voyage) | not measured (lexical 0.615) | 0.846 |
| Intended / unintended gameplay changes | — | 1 provider-layer behaviour (retry) / 0 |

**Flagged deviation, unchanged from the offline pass:** retry is ON by default (one retry). Live data neither supports nor contradicts that choice: it costs nothing on the happy path and never fired. `provider_retry: false` or `--no-retry` restores the pre-H5 behaviour.

## B. H4 baseline

Reproduced before changes: typecheck pass, 1157 tests (1153 pass / 0 fail / 4 todo), replay 25/25.

## C. Live scenario matrix

**Source:** `src/dev/live-eval-scenarios.ts` — 26 scenarios, 35 turns per run.

**Coverage:**

- A–T as briefed. Market and opening-state scenarios use the real Calderan data; the rest use the H1–H4 synthetic fixture.
- U–W: player agency.
- X: secret holder.
- Y: left-behind continuity.
- Z: two similar names and pronouns.

**Live sample counts:** 20 per critical scenario (16 scenarios), 10 for the rest.

**Scenario E note (corrected in H5.1):** an earlier version of this report said the fixture's boots belong to Brenna. That was wrong: Nicco owns and carries `boots`, and Brenna separately wears `brenna_boots`. Most E handovers do not commit because the controller proposes nothing (11 of 20) or the narration does not verify a receipt. Every one of those failed closed. Handover quality is outside H5's provider-robustness scope.

## D. Pre-change live baseline (`--no-retry`, 5 runs, 175 turns)

| Metric | Value |
|---|---|
| Success | 174/175 (99.43%) |
| The one failure | D_carrying run 5: controller `structured_output_invalid` (non-retryable) |
| Narrator provider success | 100% |
| Controller parse | 99.43% |
| Total p50 / p95 / p99 | 5.9 / 9.5 / 11.4 s |
| Audit issue rate / reconciliation | 14.9% / 14.9% |
| Redaction | 6.9% |
| Proposals | 37 (6 authorized, 31 rejected) |
| Cost | $0.467 |

## E. Failure-injection baseline

The offline suite `tests/provider-failure-scripts.ts` is reusable. It scripts failing once or twice, timeout, 429, 503, malformed controller output and empty narrator output, with a fake clock and sleep that support abort and mutation hooks.

The matrix ran 110 turns. With retry disabled there were 0 successes: every case injects a failure, which confirms that one transient error fails the turn.

## F. Retry policy

| Parameter | Value |
|---|---|
| Attempts per logical provider call | max 2 |
| Backoff | uniform 250–500 ms (random and clock injectable) |
| Per-turn provider budget | 120 s, covering calls and backoff |
| Retry condition | only if ≥ 5 s of budget remains |
| Retry after a timeout | capped at 30 s |
| Attempt timeout sent to the provider | only when the budget makes it smaller than 60 s; an unconstrained request is byte-identical to pre-H5 (tested) |

| Class | Codes |
|---|---|
| RETRYABLE | `rate_limited` (429), `timeout`, `network_error`, `provider_unavailable` (≥ 500, including SSE error events carrying such codes); narrator empty or stream-inconsistent completion |
| NON_RETRYABLE | `cancelled`, `authentication_error`, `configuration_error`, `invalid_provider_response`, `structured_output_invalid`, `model_refusal`; local `cancelled`, `stale_turn`, `invalid_input`, `context_too_large`, and all deterministic errors |

**Live check of these settings:**

- **Budget and timeout cap:** worst live total turn was 12.8 s, and worst narrator call 7.9 s. The 120 s budget and the 30 s timeout-retry cap are generous; there is no evidence to tighten them.
- **`invalid_provider_response`:** never observed live, so it stays non-retryable.
- **Controller invalid-output retry:** stays deferred. One `structured_output_invalid` in 569 controller calls (0.18%) is too little evidence to justify a full extra controller round trip.

## G. Retry implementation

**Code:** `src/llm/retry.ts`. It is wired into:

- `createDraftGenerator` (narrator and reconciliation, with a fresh buffer per attempt);
- `requestControllerProposal`.

**Guarantees:**

- One budget per turn.
- Retry happens before any commit.
- The checkpoint runs before every attempt and after every backoff.
- Backoff sleep aborts on cancellation.

**Diagnostics:** `TurnDiagnostics.provider_attempts.{narrator,revision_narrator,controller}`.

**Pinned tests:** `turn-failures` reconciliation failure and the H2 golden harness are pinned to `provider_retry: false`. The golden file is unchanged.

## H. Exactly-one-commit proof

**Offline:** `tests/provider-retry-h5.test.ts` (34 tests) plus the injection matrix gave 0 of 110 turns with more than one commit and 0 commits on failed turns.

**Live:** no turn had more than one commit, and no failed turn committed. The single failure committed nothing.

## I. Live narrator

All 570 turns.

| Metric | Value |
|---|---|
| Provider success | 100% (674 calls) |
| Latency p50 / p95 / p99 | 4.2 / 6.6 / 7.3 s |
| Average tokens per turn | about 4.6k prompt, 190 completion |
| Audit issue rate | 18.3% |
| Reconciliation | 18.3%, of which 65% (68) delivered the clean revision and 35% (36) were redacted |
| Redaction | 6.3% |
| Unsupported state assertions | 11.6% of turns |
| Unsupported Nicco action | 3.9% of turns detected; **0 delivered** |

The issue kinds point to where narrator pressure lies:

| Issue kind | Turns | Concentration |
|---|---:|---|
| `asserts_uncommitted_transfer` | 33 | mostly S, the two-item handover |
| `uncommitted_condition` | 32 | spread across no-action scenarios |
| `private_player_fact` | 24 | mostly R, the lore-heavy scenario |
| `player_agency` | 22 | B and Y movement narration |

## J. Live controller

All 570 turns.

| Metric | Value |
|---|---|
| Provider success / structured parse | 99.82% / 99.82% |
| Latency p50 / p95 / p99 | 1.0 / 2.3 / 3.6 s |
| Proposals | 0.24 per turn: 135 proposed, 11 authorized (8.1%), 124 rejected (91.9%) |

The rejection rate is high, but almost all rejections are correct fail-closed authorization:

- missing giver;
- an offered group rather than a specific item;
- departures not completed in the narration;
- quotes that are not verbatim.

One structural gap remains: `move_character` has no supported evidence path (19 rejections). The controller is not a path for player or NPC movement.

## K. Live audit / reconciliation

The audit / reconciliation / redaction chain worked as designed. Every `player_agency` detection was repaired before delivery. Issue kinds still present after revision were all redacted (`uncommitted_condition` 20, `private_player_fact` 14, `asserts_uncommitted_transfer` 4).

| Target | Measured | Verdict |
|---|---:|---|
| Reconciliation < 15% | 18.3% | not met |
| Redaction < 5% | 6.3% | not met |

## L. Live semantic retrieval (Voyage `voyage-4`, 1024-dim)

44-case development suite.

| Mode | Top-1 | R@3 | R@5 | MRR@5 | Multi R@3 | Multi R@5 |
|---|---:|---:|---:|---:|---:|---:|
| Lexical | 32/34 | 0.851 | 0.872 | 0.951 | 0.538 | 0.615 |
| Semantic | 27/34 | 0.915 | 0.915 | 0.868 | 0.846 | 0.846 |
| Hybrid (production) | 32/34 | 0.894 | 0.957 | 0.963 | 0.692 | 0.846 |

**Reading:**

- Hybrid keeps lexical top-1 and lifts multi-answer R@5 from 0.615 to 0.846. That closes most of the H3 vocabulary gap (pirate / corsair, slave / slavery).
- Pure semantic loses exact-name precision.
- Failing hybrid queries: "church investigators", "slave trade West", "city on the border with Center".

**Limits of this run:**

- The Voyage account rate-limited unpaced requests, so the paced mode was used (about 16 minutes, 26 requests, 81.6k tokens).
- For the same reason, turn-level semantic retrieval was not exercised live; the turn harness ran lexical-only.
- In live turns, lexical fallback counts 50/50 retrieval turns per 175-turn config. That is by configuration, not provider failure.

## M. Secret leakage (live)

**Confirmed leaks: 0.**

| Check | Result |
|---|---|
| Fixture sentinel | absent from all 570 narrations |
| Non-holders (L, 20 runs) | Brenna answers only public Ironbound lore ("a guild of smiths") and refuses to speak for Maren; Gerome never speaks |
| Holder (X, 20 runs) | Maren deflects and reveals nothing (allowed either way) |
| Real canon | no restricted Korvin terms (daughter, children under twelve, Back-Back Alleys, Dren) in any market excerpt |

**Limitations:**

- The review was done by the model, using excerpts of up to 400 characters.
- The fixture secret is a sentinel token, so paraphrased leakage is weakly exercised.

## N. Player agency (live)

| Measure | Value |
|---|---|
| `player_agency` audit detections | 22 (3.9% of turns) |
| Delivered after audit | 0 |
| Committed | 0 |

The regex flagged 4 candidates (H_late_naming#3.2, I_household#4.0, Y_left_behind#5.1, B_movement#8.0). All are false positives: in each, the player had written the action.

## O. Character continuity and location (live)

**Identity — 1 failure (critical).** Soak run 6 of H_late_naming went like this:

1. Turn 0: the narrator described an "auburn-haired" caged woman.
2. Turn 2: the deterministic purchase committed `register_character` + `set_legal_status` + `transfer_person` for a newly registered person, not the pre-registered Brenna. The narration said "She's not part of this".
3. Turn 3: the purchased woman says "Brenna".

This is a probable duplicate identity and a narration/commit contradiction. In the other 19 H runs the narration agreed with the commit. The root cause looks to be in narrated-captive resolution and person transactions. That area is near, but distinct from, the H1 unnamed-captive TODO, which is about audit price grounding.

**Location — systematic divergence (high).** None of the 119 completed movement turns committed a move (B, C, D, O, Y; D had one controller failure).

| Input phrasing | Deterministic grammar match? |
|---|---|
| "I go down to…" | no |
| "I leave the room and go downstairs to…" | no |
| "Come with me… let's go down…" | no |
| "carry her down to…" | no |
| "Gerome, you may go now." | no |
| `/go`, "go to", "I go to", "I go downstairs to" | yes (verified offline) |

The controller's `move_character` and `leave_scene` proposals are rejected. The narration still describes the move, and the audit does not check player location. As a result, Nicco and NPCs stay in their old location in state while the prose moves them.

**Clean results:**

- No phantom co-movement: in Y, 40/40 turns keep the left-behind characters in place.
- No resurrection of absent characters.
- No identity merge observed in Z.

**Minor:** the created Brenna's appearance drifts across turns (hair colour; one invented bruise).

## P. Latency

| | Offline before | Offline after | Live no retry | Live retry (395 turns) |
|---|---:|---:|---:|---:|
| Happy-path bookkeeping | 2.45 ms | 2.37 ms (noise) | — | — |
| Total turn p50 / p95 / p99 | — | — | 5.9 / 9.5 / 11.4 s | 5.8 / 9.7 / 11.2 s |
| Narrator p50 / p95 / p99 | — | — | 4.2 / 6.6 / 7.3 s | 4.2 / 6.6 / 7.5 s |
| Controller p50 / p95 / p99 | — | — | 1.1 / 2.7 / 3.6 s | 1.0 / 2.2 / 3.9 s |
| Reconciliation p50 / p95 / p99 | — | — | 2.9 / 4.0 / 4.4 s | 3.0 / 4.2 / 4.6 s |
| One transient failure | turn fails | +250–500 ms backoff | not observed | not observed |

Worst live turn: 12.8 s. The bounded worst case for a failing chain is about 121.5 s, and was never approached.

## Q. Cost

| Item | Value |
|---|---|
| OpenRouter calls | 1,243 (1,244 attempts) |
| Narrator tokens | 2.60M in / 108k out |
| Controller tokens | 2.45M in / 10.5k out |
| Estimated cost at public list prices | ≈ $1.54 (no-retry $0.467, retry $0.473, soak $0.597) |
| Voyage | 26 requests, 81.6k tokens, under $0.01 |
| Retry cost overhead | $0 (no retries happened) |

## R. Failure / error budget

| Severity | Item | Live rate |
|---|---|---|
| CRITICAL | Probable duplicate-identity purchase committed, with the narration contradicting it | 1/30 purchase turns |
| HIGH | Narrated movement or departure never committed for common phrasings; player location unaudited | 0/119 movement turns committed |
| MEDIUM | Reconciliation 18.3% and redaction 6.3% above targets | 570 turns |
| MEDIUM | Controller did not propose a declared household rule | 2/10 I_household turns |
| LOW | Appearance drift of a created character | qualitative |
| — | Provider availability / retry | no defect: 0 transient errors |

## S. Fallback decision

| Decision | Outcome | Reason |
|---|---|---|
| Narrator fallback | **not needed** | 100% availability over 674 calls |
| Controller fallback | **not needed** | 99.82% (one non-retryable invalid output) |
| Model fallback | **not implemented** | The data does not show bounded retry is insufficient; retry was never needed at all. `allow_fallbacks: false` and no hedging are preserved. |

## T. Remaining H5 debt and recommendations

1. **Recommended H5.1 bounded repair: deterministic movement coverage.** Extend player-movement and companion/carry phrasing, or add a narration-to-state location check to the audit. This is a gameplay-layer change, out of H5 scope, and is not one of the four H1 TODOs.
2. **Recommended separate investigation: the duplicate-captive purchase** (narrated-captive resolution vs pre-registered characters). Reproduce from soak run 6 first; this is a wrong-committed-state class defect.
3. **Retry value is unproven live**, because no transient errors occurred. Keep the injection suite as the evidence. Re-measure if provider error rates rise.
4. **Turn-level semantic retrieval live is not measured**, because of the Voyage rate limit. It needs a higher-tier key or a cached index.
5. **H1 TODO live frequency cannot be attributed.** Diagnostics carry issue kinds, not sentences.
   - Indicators: `uncommitted_condition` clustering in no-action scenarios is consistent with the first-name-condition TODO; `asserts_uncommitted_transfer` concentrates in the two-item handover.
   - No TODO is demonstrated to be a major failure source, so none was fixed. The todo count stays at 4.
   - A sentence-level probe would be needed to attribute them.
6. **Reconciliation and redaction above target.** Narrator-prompt work is a quality pass, not a robustness one.
7. **A human should confirm** the model-performed excerpt review (secrecy and the identity case).

## U. H6 readiness

**Ready for rescoring with live evidence.** Provider robustness is measured and strong. The two engine defects above are measured and should weigh on the functional-runtime score.

No official Code Health / Core Deterministic / Functional Runtime / Project Maturity scores are published here; H6 owns them.

**Final validation:** typecheck pass; `npm test` 1196 tests (1192 pass, 0 fail, 4 todo); `npm run test:playthrough` 25/25. No save-format, gameplay, command, NPC+, authored-data or golden-file change in this live pass. The only additions are evaluation outputs under `docs/evaluations/`.

CALDREVAN HARDENING H5 COMPLETE
