# Caldrevan hardening H5 — live model robustness and provider resilience

Date: 2026-10-01. Working tree left for review. No commit, no push. **No paid provider call was made: no API key exists in this environment.** The retry layer, failure-injection suite, diagnostics extension, aggregation tool and live harness are implemented and tested; every live measurement is BLOCKED and reported as such.

## A. Executive result

Status: **PARTIAL.** Deterministic and offline-injection criteria are met; the live baseline, live soak, live semantic retrieval and all live safety evaluations (criteria 12–16) are not.

| Measure | H4 baseline | H5 |
|---|---:|---:|
| Tests (total / pass / fail / todo) | 1157 / 1153 / 0 / 4 | 1196 / 1192 / 0 / 4 (5 consecutive clean full runs) |
| Replay | 25/25 | 25/25 |
| H2 golden file | — | byte-unchanged (`git diff tests/golden` empty) |
| Intended / unintended gameplay changes | — | 1 provider-layer behaviour (retry) / 0 |

**Deviation to flag.** The brief forbids changing provider policy before a live baseline exists. Retry is ON by default (one retry) although no baseline could be taken. Mitigation: `provider_retry: false` / `--no-retry` reproduce pre-H5 behaviour exactly, so the baseline can still be taken afterwards. Flipping the default to off is a one-line change if you prefer.

## B. H4 baseline

Reproduced before changes: typecheck pass, 1157 tests (1153/0/4), 25/25 replay.

## C. Live scenario matrix

`src/dev/live-eval-scenarios.ts`: 26 scenarios, 35 turns per run. A–T as briefed (market and opening-state scenarios use the real Calderan data; the rest use the H1–H4 synthetic fixture), plus U–W player agency, X secret holder, Y left-behind continuity, Z two similar names/pronouns. Critical scenarios are flagged for 15–20 runs. Each carries `allowed_commit_kinds`; anything outside is flagged `unexpected_commit`. Secret check is the fixture sentinel; Nicco-agency is a regex candidate; paraphrase leakage, holder-reveal appropriateness and identity continuity are labelled HUMAN REVIEW and store only a ≤400-character excerpt of flagged turns.

## D. Pre-change live baseline

**BLOCKED — not measured.** Offline pre-change behaviour was confirmed by the H1 `turn-failures` suite (green at baseline): one transient narrator/controller error fails the whole turn. Retry-off tests reproduce it.

## E. Failure-injection baseline

`tests/provider-failure-scripts.ts` (reusable: fail once/twice, timeout, 429, 503, malformed controller, empty narrator, fake clock/sleep with abort and mutation hooks). Matrix of 110 turns: with retry disabled 0 successes (every case injects a failure), confirming one transient error fails the turn. Details in the LIVE_EVAL artifacts.

## F. Retry policy

Max 2 attempts per logical provider call; backoff uniform 250–500 ms (random and clock injectable); per-turn provider budget 120 s covering calls and backoff; retry only if ≥5 s of budget remains; a retry after a timeout is capped at 30 s; an attempt timeout is passed to the provider only when the budget makes it smaller than 60 s (an unconstrained request is byte-identical to pre-H5, tested).

| Class | Codes |
|---|---|
| RETRYABLE | `rate_limited` (HTTP 429), `timeout`, `network_error` (fetch rejection, connection reset), `provider_unavailable` (HTTP ≥500, incl. 500/502/503/504 and SSE error events with such codes); narrator empty or stream-inconsistent completion |
| NON_RETRYABLE | `cancelled`, `authentication_error` (401/403), `configuration_error`, `invalid_provider_response` (other 4xx, malformed/truncated/oversized body, non-stop finish), `structured_output_invalid`, `model_refusal`; TurnError `cancelled`, `stale_turn`, `invalid_input`, `context_too_large`, all local deterministic errors |

`invalid_provider_response` is conservatively not retried because it also covers non-transient 4xx and truncated streams cannot be told apart from them; revisit with live data. Controller invalid-output retry: **not implemented** (deferred; no measurement exists, and it would add a full controller round trip).

## G. Retry implementation

`src/llm/retry.ts` (classification, policy, `ProviderBudget`, `withProviderRetry`); wired in `createDraftGenerator` (narrator and reconciliation, fresh buffer per attempt) and `requestControllerProposal`; the coordinator creates one budget per turn. Providers honour `timeout_ms` as `min(configured, request)`. `allow_fallbacks:false` untouched. Retry sits before any commit; checkpoint (cancellation/stale) runs before every attempt and after every backoff; backoff sleep aborts on cancellation.

Diagnostics: `TurnDiagnostics.provider_attempts.{narrator,revision_narrator,controller}` = attempts, retry reasons, recovered, cumulative provider_ms, final outcome. No request content.

Two existing tests were pinned to single-attempt (`provider_retry:false`) because they assert the pre-H5 call count/trace: `turn-failures` reconciliation failure and the H2 golden harness. The golden file is unchanged.

## H. Exactly-one-commit proof

`tests/provider-retry-h5.test.ts` (34 tests): narrator once (×4 codes) → one commit; controller once (×4) → one commit, same prior_state/narration re-sent, narrator not re-run; reconciliation retry → one commit; narrator/controller/reconciliation twice → zero commit and state object identical; partial draft from a failed attempt never reaches events, controller, history or the stream counter; cancellation during backoff → one call, zero commit; stale revision during backoff → one call, only the external mutation advances revision; real OpenRouter adapters through the coordinator (503 then 429) → one commit. Matrix: 0 of 110 turns with more than one commit.

## I–L. Live narrator, controller, audit/reconciliation, semantic retrieval

**BLOCKED — not measured.** The aggregation tool (`src/dev/diagnostics-aggregate.ts`, CLI `aggregate-diagnostics.js`) computes every requested metric (success/failure/codes/phases, p50/p95/p99 per stage, reconciliation/redaction/still-bad, issues per turn and kinds, controller parse/authorization, retry and first-attempt success, tokens, cost only with operator-supplied prices) and is tested on injected outcomes. Semantic: embedding transient failure never fails a turn — tested for four failure types, lexical fallback recorded, no provider text leaked. The live Voyage comparison (lexical vs hybrid) needs `VOYAGE_API_KEY`.

## M–O. Secret leakage, player agency, character continuity (live)

**BLOCKED — not measured.** Scenarios L, X (secrecy), N, U–W (agency), C/D/H/O/Y/Z (continuity) are ready; deterministic safety remains covered by the H1–H3 suites, which stayed green.

## P. Latency

| | Before | After |
|---|---:|---:|
| Happy path (offline bookkeeping) | 2.45 ms | 2.37 ms (noise) |
| One transient failure | turn fails | +250–500 ms backoff (median 364 ms offline, instant fake failure) |
| Worst sequential chain | 60+20+60 ≈ 140 s | ≤ 120 s budget + ≤ 3 backoffs ≈ 121.5 s |
| Worst failed narrator (double timeout) | 60 s | ≤ 90.5 s (60 + 0.5 + 30) |
| Worst failed controller | 20 s | ≤ 40.5 s |

Honest reading: failing turns can take longer than before (bounded), while the absolute chain is shorter. The 30 s retry cap and 120 s budget are provisional until live p95/p99 exist; timeouts themselves were not changed. Live p50/p95/p99: BLOCKED. Prior non-H5 evidence (Long-Form Trial 1, 18 turns): mean narrator 4.8–6.3 s, zero provider blocks.

## Q. Cost

0 live calls, 0 tokens, $0. Planning: 175 turns (5 runs) or 350 (10 runs); controller prompts were ~2.2k tokens in earlier traces, narrator size unmeasured, so a token estimate would be speculative. The harness caps turns and tokens and refuses oversized plans.

## R. Failure/error budget

Live defects: none classifiable (no live run). Offline injection: CRITICAL 0, HIGH 0 (single transient failures all recovered), MEDIUM 0, LOW 0.

## S. Fallback decision

NARRATOR FALLBACK: **deferred** (no availability data). CONTROLLER FALLBACK: **deferred**. MODEL FALLBACK: **deferred**; `allow_fallbacks:false` and no hedging preserved. Revisit only if live baseline availability is poor and retry alone misses the target.

## T. Remaining H5 debt

1. All live stages (baseline `--no-retry`, post-change, critical-scenario deep runs, Voyage, human review of secrecy/agency/continuity).
2. Confirm or tune 120 s budget, 30 s timeout-retry cap, and non-retry of `invalid_provider_response` from live latency and error data.
3. Decide controller invalid-output retry from live parse-failure rate.
4. Measure H1 TODO live frequency (phantom plural transfer, first-name condition, unnamed captive price, fronted "Without hesitation"); no fix attempted, TODO count stays 4.
5. Acceptance targets (§30) unverifiable live; offline-attained: transient recovery 100% (50/50), exactly-one-commit 100%.

## U. H6 readiness

Not ready to rescore reliably: live evidence is missing. Evidence-backed projection only: deterministic reliability of the provider layer improved (bounded retry, cancellation/stale-safe, diagnostics); live runtime score movement is unknowable until the stages above run. No official Code Health / Core Deterministic / Functional Runtime / Project Maturity scores are published.

Final validation: typecheck pass; 1196 tests, 0 fail, 4 todo; playthrough 25/25; focused retry, golden, failures, diagnostics, H3 and persistence suites green. No save-format, gameplay, command, NPC+ or authored-data change.
