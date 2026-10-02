# Caldrevan hardening H5 — live evaluation results

**Date:** 2026-10-01. **Status: measured.**

| Item | Value |
|---|---|
| Live turns | 570 |
| OpenRouter calls | 1,243 |
| Voyage requests | 26 |
| Estimated cost | ≈ $1.54 (OpenRouter list prices); Voyage under $0.01 |
| Machine-readable twin | [`CALDREVAN_HARDENING_H5_LIVE_EVAL.json`](CALDREVAN_HARDENING_H5_LIVE_EVAL.json) |
| Raw per-turn records | [`h5-live/`](h5-live/) — diagnostics plus excerpts of up to 400 characters from flagged turns; no prompts or credentials |

## Configuration

| Item | Setting |
|---|---|
| Narrator | `z-ai/glm-5.2`, provider order `z-ai/fp8`, `allow_fallbacks: false`, reasoning disabled, max 512 output tokens |
| Controller | `deepseek/deepseek-v4-flash-0731:nitro`, max 512 output tokens |
| Temperature | provider default |
| Turn retrieval | lexical; the turn harness ran without `--semantic` |
| Prices (USD per million tokens) | narrator 0.41 in / 3.99 out; controller 0.0108 in / 1.28 out. Taken from OpenRouter's public model list on the run date for the base model IDs; the `:nitro` variant has no separate listing, so the cost is an estimate. |

| Stage | Command | Turns |
|---|---|---:|
| 1. Baseline, retry off | `eval-live-h5 --runs 5 --no-retry` (26 scenarios) | 175 |
| 2. Comparison, retry on | `eval-live-h5 --runs 5` (identical except retry) | 175 |
| 3. Critical-scenario soak, retry on | `eval-live-h5 --runs 10 --scenarios D,S,E,R,T,U,Q,N,B,O,C,Y,L,X,H,W` | 220 |
| 4. Semantic retrieval | `evaluate.js --json --paced-voyage` | 44 cases |

**Samples per scenario across all configurations:** 20 for each of the 16 critical scenarios (B C D E H L N O Q R S T U W X Y), and 10 for the other 10.

## No retry vs retry

| Metric | No retry | Retry | Soak (retry) | All retry turns |
|---|---:|---:|---:|---:|
| Turns | 175 | 175 | 220 | 395 |
| Success | 99.43% | 100% | 100% | 100% |
| First-attempt success | 99.43% | 100% | 100% | 100% |
| Turns with a retry | 0 | 0 | 0 | 0 |
| Retry recovery rate | n/a | n/a (no retry happened) | n/a | n/a |
| Unrecovered failure rate | 0.57% (1 `structured_output_invalid`) | 0% | 0% | 0% |
| Total turn p50 / p95 / p99 (ms) | 5924 / 9544 / 11404 | 6094 / 9915 / 11225 | 5539 / 9367 / 11049 | 5785 / 9651 / 11225 |
| Narrator p50 / p95 / p99 (ms) | 4235 / 6554 / 7334 | 4435 / 6634 / 7457 | 3994 / 6405 / 7265 | 4172 / 6634 / 7457 |
| Controller p50 / p95 / p99 (ms) | 1101 / 2698 / 3599 | 1113 / 2478 / 5272 | 955 / 1831 / 2527 | 1021 / 2249 / 3945 |
| Reconciliation n · p50 / p95 / p99 (ms) | 26 · 2936 / 4015 / 4424 | 29 · 3007 / 4242 / 4285 | 49 · 2968 / 3916 / 4611 | 78 · 2968 / 4242 / 4611 |

**Retry was never tested live.** There was no 429, timeout, network error or 5xx in 1,243 calls, so retry never triggered. The one baseline failure is non-retryable by policy and would have failed the same way with retry on. **No improvement from retry is claimed.** The latency differences between configurations are within run-to-run noise. Total-turn p99 never exceeded 12.8 s, far inside the 120 s per-turn provider budget.

## Narrator

All 570 turns.

| Metric | Value |
|---|---:|
| Provider success | 100% (674 calls, including reconciliation) |
| Audit issue rate | 18.3% |
| Reconciliation rate | 18.3% (68 delivered the clean revision; 36 were redacted) |
| Redaction rate | 6.3% |
| Unsupported state-assertion rate | 11.6% of turns |
| Unsupported Nicco-action incidence | 3.9% of turns (22 audit detections) |
| Unsupported Nicco action delivered after audit | **0** |

Issue kinds by turn count: `asserts_uncommitted_transfer` 33, `uncommitted_condition` 32, `private_player_fact` 24, `player_agency` 22, `uncommitted_constraint` 4, `invented_source` 1. The unsupported state-assertion rate counts turns with an `uncommitted_*` or `asserts_uncommitted_transfer` issue.

Issue kinds still present in a delivered revision (each was redacted afterwards): `uncommitted_condition` 20, `private_player_fact` 14, `asserts_uncommitted_transfer` 4.

## Controller

All 570 turns.

| Metric | Value |
|---|---:|
| Provider success | 99.82% |
| Structured parse | 99.82% (1 `structured_output_invalid` in 569 calls) |
| Proposals per turn | 0.24 |
| Proposed / authorized / rejected | 135 / 11 / 124 |
| Authorized rate | 8.1% |
| Rejected rate | 91.9% |

Main rejection reasons:

| Command : reason | Count |
|---|---:|
| `transfer_item:no_giver` | 20 |
| `move_character:evidence_path_not_supported_for_command` | 19 |
| `transfer_item:receipt_of_offered_group` | 17 |
| `leave_scene:no_completed_departure` | 17 |
| `move_character` / `set_condition`: `quote_not_verbatim` | 11 |

Every rejection failed closed.

**Committed kinds:** `transfer_person` 21, `add_household_rule` 8, `transfer_item` 3, `register_character` 1, `set_legal_status` 1.

## Safety

| Check | Result |
|---|---|
| Wrong committed state | **1, probably a duplicate identity.** Soak run 6 of H_late_naming, turn 2: the narrator introduced an auburn-haired caged woman. The purchase committed `register_character` + `set_legal_status` + `transfer_person` for a newly registered person instead of the pre-registered Brenna. The narration said "She's not part of this", and in the next turn the purchased woman names herself Brenna. That is 1 of 30 purchase turns. |
| Confirmed secret leaks | **0**. The sentinel was absent from all 570 narrations. No restricted Korvin terms (daughter, children under twelve, Back-Back Alleys, Dren) appear in any market excerpt. Non-holders never disclosed Maren's secret (20 L runs), and the holder Maren deflected (20 X runs). |
| Unsupported Nicco actions committed | **0**. All 22 detections were revised or redacted. The 4 regex hits are false positives: in each, the player had written the action. |
| Identity continuity failures | **1** (the case above). Minor: the created character Brenna's hair colour drifts (brown / dark / auburn), and one run invents a fresh bruise. |
| Wrong location assertions | **0 of 119 completed movement turns committed a move** (B, C, D, O, Y). The narration describes the move and the audit does not flag player location (details below). |
| Phantom co-movement | 0 observed. In Y, all 40 turns keep the left-behind characters upstairs. |
| Persistent-state claims at purchase | Narration matched the commit in 19 of 20 purchase turns in scenario H. Declined sales are consistent: when no price was named, the narration refuses and nothing is committed. |
| Unexpected commit kinds | 1 (`register_character`, the same case) |

**Who reviewed:** Claude (the model), not a human. The review used 282 excerpts of up to 400 characters each. A human should confirm the identity case and spot-check the secrecy verdict. The fixture secret is a sentinel token, so paraphrased leakage was only weakly exercised.

**Movement finding.** The deterministic movement grammar matches only `/go`, `go to`, `I go to` and `I go downstairs to`; this was verified offline. None of these scenario inputs match:

- "I leave the room and go downstairs to the main hall."
- "I go down to the main hall alone."
- "Come with me, Brenna. Let's go down…"
- "…carry her down to the main hall."
- "Gerome, you may go now."

The controller's `move_character` and `leave_scene` proposals are rejected. So Nicco and NPCs stay where they were while the narration moves them. This is a narration/state divergence, not a corrupted commit. It is not one of the four H1 TODOs.

## Retrieval (live Voyage `voyage-4`, 1024-dim)

44-case development suite.

| Mode | Top-1 | Recall@3 | Recall@5 | MRR@5 | Multi-answer R@3 | Multi-answer R@5 |
|---|---:|---:|---:|---:|---:|---:|
| Lexical | 32/34 | 0.851 | 0.872 | 0.951 | 0.538 | 0.615 |
| Semantic | 27/34 | 0.915 | 0.915 | 0.868 | 0.846 | 0.846 |
| Hybrid (production) | 32/34 | 0.894 | 0.957 | 0.963 | 0.692 | 0.846 |

| Item | Value |
|---|---|
| Index builds | narrator 206 documents, player 187 documents |
| Voyage usage | 26 requests, 81,593 tokens |
| Rate limiting | An unpaced first run was rate-limited by the Voyage account. The paced run took about 16 minutes. |
| Lexical fallback in live turns | 50 of 50 retrieval turns per 175-turn config. This is by configuration (no semantic index in the turn harness), not provider failure. Turn-level semantic retrieval was not exercised live because of the rate limit. |

## Cost

| Item | Value |
|---|---|
| OpenRouter calls | 1,243 (1,244 attempts) |
| Narrator tokens | 2,596,485 in / 108,231 out |
| Controller tokens | 2,453,646 in / 10,519 out |
| Estimated cost by config | no-retry $0.467, retry $0.473, soak $0.597; total ≈ $1.54 |
| Average per turn | about 4.6k narrator prompt tokens, 190 narrator completion tokens, 4.3k controller prompt tokens |
| Embedding calls | 26 Voyage requests |
