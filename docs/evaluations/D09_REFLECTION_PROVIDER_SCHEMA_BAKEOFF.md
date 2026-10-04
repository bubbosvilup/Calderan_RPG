# D-09 Reflection Provider / Schema Bake-off

Date: 2026-10-04. Status: evaluation only. **No production code, data, prompt, validator, policy or model default was changed.** D-09 is NOT closed.

## Verdicts (required answers)

- **DID QWEN OUTPERFORM DEEPSEEK? — MIXED.** Qwen (`qwen/qwen3.8-flash`) produced fewer validator-accepted notes that a manual pass judged misleading (24% / 31% of accepted notes vs 53% / 56% for DeepSeek, pass 1). It also over-proposed (46 / 38 proposals vs 23 / 21), was almost never empty (1–4 empties of 25), rejected 22–29 proposals mostly as `insufficient_evidence`/`unknown_evidence` (it cites names or single facts), produced the most REDUNDANT proposals, was ~2.5x slower (median ~2.9–3.0 s vs ~1.1–1.3 s) and ran on a single upstream (Alibaba). DeepSeek was cheaper per call and quieter, but its accepted output is more often wrong. Neither arm produced a meaningful count of USEFUL notes (0–1 of 15–17 accepted).
- **DID STRICTER SCHEMA HELP? — MIXED, leaning YES for wire/shape only.** The eval-only strict schema removed DeepSeek's production-shape failures (A: 3/25 shape-invalid responses, 5 `invalid_shape` proposals; B: 0/25, 0 proposals). For Qwen it helped less (C: 2/25 shape-invalid; D: 1/25) and Qwen under strict schema began citing character names instead of evidence refs (`unknown_evidence` 8 → 5 in pass 1, 4 of 11 proposals in the stability draw). The strict schema does nothing for semantics: accepted-and-misleading notes were not reduced (B 56% vs A 53%). Provider support is partial (see below), so several of the intended keywords are UNSUPPORTED upstream.
- **RECOMMENDED REFLECTION MODEL: NO CHANGE (keep DeepSeek default); NO CLEAR WINNER.** The evidence does not clear the "clearly better" bar required by the brief. Qwen's lower misleading rate is within the noise of 15–17 accepted notes per arm and one draw, and its cost in latency/over-proposal is real.
- **RECOMMENDED PROVIDER SCHEMA: current production schema stays; the strict eval schema (`reflection-schema-v2-eval`) is a candidate for a later change specifically for shape**, but not adopted tonight (it fixes shape, not meaning). Confidence: LOW to MODERATE on the shape claim, LOW on every model-quality claim.

## Production baseline (unchanged)

Reflection model `deepseek/deepseek-v4-flash-0731:nitro`; provider schema `REFLECTION_SCHEMA` with `label: {type: "string"}` and no length/pattern constraints; `max_tokens` 600; reasoning disabled; `require_parameters: true`; validator `validateProposals` (shape, unknown_evidence, insufficient_evidence, insufficient_distinct_episodes, tension_without_contrast, forbidden_inference, unsupported_person, duplicate) untouched. Cursor `last_reflected_revision` advances on empty or rejected results and not on provider failure / malformed / stale. Empty reflection stays valid.

## Provider structured-output support (probe)

Adversarial six-word-label probe, artifacts under `saves/d09-reflection-bakeoff/probe/`:

- A `pattern` on the label is enforced by both providers (Wafer for DeepSeek, Alibaba for Qwen).
- `maxLength` is accepted but not enforced.
- `uniqueItems` is rejected by Alibaba with HTTP 400 (removed from the strict schema).
- An unconstrained text pattern on DeepSeek caused runaway generation (`finish_reason: length` → `invalid_provider_response`); a non-blank-text pattern was removed from the strict schema.
- `:nitro` routing is upstream-non-deterministic; observed upstreams were always Wafer (DeepSeek) and Alibaba (Qwen).
- Fuzz equivalence (`schema-equivalence.json`, 30k samples): the strict schema accepts only outputs that are shape-valid for the production predicate, and shape-valid outputs the schema rejects are the documented limits (length keywords).

## Frozen corpus

25 requests frozen before any scored call (`corpus-manifest.json`, SHA-256 per request): 9 PLAYED due requests from a 100-turn disposable development-rich play (no injection, all through the production turn pipeline), 5 PLAYED-STATE requests built from later snapshots of the same play, and 11 hand-built FIXTURES (FX01–FX11: movement-only, rules-only, single condition episode, two-episode condition, tension candidates, repeated trust, mixed rich…). Provenance notes:

- Two earlier plays were aborted and kept as artifacts, not used for scoring: `play-v0-quiet-aborted` (only quiet turns) and `play-v1-courtyard-loop-aborted` (player/NPC entry loop in the courtyard).
- A pilot of 3 fixtures x 4 arms (`runs/test-pipeline`) verified the pipeline and is excluded from every metric.
- The 100 played turns produced only two organic development kinds: 21 `household_rule_added` and 8 `moved`. No organic conditions, trust shifts or contract developments occurred. So even the "played" requests are narrow.

## 2x2 results (pass 1, one draw per request, no retries or rerolls)

Arms: A = DeepSeek/current, B = DeepSeek/strict, C = Qwen/current, D = Qwen/strict. n = 25 calls per arm; wire-valid 25/25 for all arms.

| Arm | Shape-valid responses | Proposals | Accepted | Accepted USEFUL | NEUTRAL | REDUNDANT | MISLEADING | HARMFUL | Misleading+harmful of accepted | Empty (correct / missed) | Cost (25 calls) | Median latency |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 22 | 23 | 15 | 0 | 5 | 2 | 7 | 1 | 53% | 11 (9 / 2) | $0.0044 | 1.27 s |
| B | 25 | 21 | 16 | 0 | 6 | 1 | 7 | 2 | 56% | 12 (12 / 0) | $0.0042 | 1.05 s |
| C | 23 | 46 | 17 | 1 | 9 | 3 | 4 | 0 | 24% | 1 (1 / 0) | $0.0033 | 3.05 s |
| D | 24 | 38 | 16 | 0 | 8 | 3 | 5 | 0 | 31% | 4 (4 / 0) | $0.0028 | 2.87 s |

Rejections by validator (pass 1): A `invalid_shape` 5, `insufficient_evidence` 2, `tension_without_contrast` 1; B `tension_without_contrast` 3, `insufficient_evidence` 2; C `insufficient_evidence` 13, `unknown_evidence` 8, `invalid_shape` 4, `tension_without_contrast` 4; D `insufficient_evidence` 13, `unknown_evidence` 5, `tension_without_contrast` 3, `invalid_shape` 1.

Semantic class is a manual judgement by the primary agent (not a human), from `manual-review.json` (rubric in `manual-review-pass1.py`). All proposals were rated, including rejected ones; the table above shows accepted ones. Across all proposals, Qwen arms had 22 and 16 REDUNDANT proposals (restating membership/canon), mostly rejected safely.

Played vs fixture split is in `analysis-pass1.metrics.json`. The played subset alone shows the same pattern (A 5 of 8 accepted misleading, B 2 of 4, C 3 of 6, D 2 of 5), with very small n.

## Stability subset

Eight requests chosen and registered before any second draw (`stability-preregistration.json`, registered at 03:13:35Z), covering useful-opportunity, correct-empty, misleading-trap and redundant-trap categories. The two strongest arms by pass-1 shape compliance, B and D, received one extra draw each.

| Arm | Calls | Shape-valid | Accepted | USEFUL | NEUTRAL | REDUNDANT | MISLEADING | HARMFUL (all proposals) | Empty |
|---|---|---|---|---|---|---|---|---|---|
| B (draw 2) | 8 | 8 | 6 | 2 | 2 | 1 | 1 | 0 | 2 |
| D (draw 2) | 8 | 8 | 5 | 0 | 1 | 2 | 2 | 0 (1 rejected) | 2 |

Variance is large: B's second draw on the same requests produced two USEFUL notes and one misleading note where its first draw produced zero USEFUL and several misleading. Stability costs $0.0023. Conclusion: one draw per request cannot rank these arms; any difference below roughly 2x is within draw-to-draw noise at this sample size.

## What the data does say

1. The blocker is semantic, not wire/shape. Wire validity is 100% in all arms; shape faults are a minor, schema-fixable nuisance.
2. The unchanged validator accepts many misleading notes. 24–56% of accepted notes were manually judged MISLEADING or HARMFUL (invented identity/role/contrast beyond the cited evidence, "household member" restatements dressed up as roles, tensions asserted from tidy chronologies). `tension_without_contrast` and `insufficient_evidence` catch the crudest cases but not label overreach.
3. Organic development supply is sparse (rules and moves only), so reflection rarely has real material. Many notes either restate or invent.
4. Provider-facing schema can encode label/word/length/ref shape, not meaning.

## Cursor concern

Calls in pass 1 with no accepted note (cursor advances anyway): A 14/25, B 14/25, C 11/25, D 12/25. A safely rejected or empty reflection still advances `last_reflected_revision`, so a character can lose a window of developments without ever receiving a note. **Concern demonstrated: INSUFFICIENT.** The bake-off used one-shot independent calls; no multi-call chain with cursor state was run, and in the 100-turn play only 9 reflection calls fired. The concern is plausible but untested.

## Not run, and why (Phase 10 stop)

No arm was clearly better, so the candidate E2E (60–100 turns), accepted-note later-use chains, ablation, human-packet exposure of later use and cursor behavior experiments were NOT run. `D09_REFLECTION_CANDIDATE_E2E.md` therefore does not exist. Later-use chains 1–3: not run. Reflection ablation: not run. Accepted-note quality beyond the bake-off tables: not measured end-to-end.

## D-26 shadow, context cost, continuity side findings (from the 100-turn play, offline analysis `saves/d09-reflection-bakeoff/play/play-analysis.json`)

- D-26 shadow gate: 177 conditional mannerism cue exposures (all epistemic state `emergent`), **0 findings** across OUT_OF_TRIGGER / UNSUPPORTED_RECURRENCE / UNSUPPORTED_AWARENESS. No `observed`/`established` exposures occurred, so the gate was not exercised on the states where overclaiming is likely. This adds data but not decisive evidence for D-26.
- Context cost: no accepted reflection note was ever carried into a narrator request in this run (reflection notes were not committed because no candidate was adopted), so reflection block tokens = 0 by construction. For reference, NPC+ block ≈ 820 tokens at turn 1 and ≈ 670–710 tokens at turns 25–100 in a ≈ 4.6–5.2k-token request. The Tier B top-2 / Tier C one-token design would add at most roughly two short notes per NPC; an accurate cost needs the E2E that was not run.
- Continuity: 39 authorization-rejected commands in 100 turns; 11 `send` turns narrate a departure (descends / goes / leaves …) without a `moved` development; 3 audit redactions (turns 17, 37, 41). These are side findings for the movement/follow owner and were not investigated further (movement/follow is frozen; this task changed nothing there).

## Cost

Provider-reported cost (`usage.cost`, summed from per-directory ledgers): probe $0.0035, final play $0.3863, two aborted plays $0.1373 + $0.1052, pass 1 $0.0147, stability $0.0023, pilot $0.0018. **Total ≈ $0.65** of the $8 task cap. The bake-off calls themselves cost about $0.0147 for 100 calls; play (narrator + controller) dominated.

## Limitations (do not overclaim)

- The primary agent, not a human, produced all semantic labels. Preference of an agent is not preference of the player.
- One draw per request per arm; 25 requests; 15–17 accepted notes per arm. Differences in the table are directional.
- Synthetic scripted play, not a real campaign; only two development kinds were observed.
- `:nitro` routing means the upstream could change.
- The V2 archived rejected drafts (Phase 1) were not replayed against the live code here because the archived draft files live only on the user's machine; `docs/evaluations/d09-reflection/replay-v2-drafts.mjs` is provided for that (self-test passes: `v2-replay-SELFTEST.json`).
- No retries or rerolls were used anywhere in scoring.

## D-09 readiness

**A — NOT READY.** Reflection output is wire-reliable and shape-fixable but semantically unsafe at the current validator, and organic material is too thin to show benefit. D-09 stays open.

## Recommended next narrow investigation

Target the semantic gap in the validator/prompt boundary, not the model: define a precise, conservative rule for labels/roles that merely restate membership or canon and for tensions that rest on a single chronological fact (offline, against the 148 rated proposals in this corpus), measure how many of the roughly 25 accepted-misleading notes of pass 1 would be caught without rejecting the accepted useful ones, and only then re-run a small bake-off. Separately, collect organic condition/trust/contract developments in a richer play before judging usefulness.

## Reproduction

Scripts: `docs/evaluations/d09-reflection/` (`lib.mjs`, `probe-schema-support.mjs`, `schema-equivalence.mjs`, `build-fixtures.mjs`, `play.mjs`, `build-played-states.mjs`, `build-corpus.mjs`, `bakeoff.mjs`, `analyze.mjs`, `play-analysis.mjs`, `replay-v2-drafts.mjs`, `manual-review-pass1.py`, `manual-review-pass2.py`). Raw artifacts (ignored by git, no credentials) under `saves/d09-reflection-bakeoff/`. Human packet: `D09_REFLECTION_HUMAN_REVIEW_V3.md`.
