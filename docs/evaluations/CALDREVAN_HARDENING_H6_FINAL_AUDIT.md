# Caldrevan hardening H6 — final audit, rescore and pre-NPC+ gate

**Date:** 2026-10-01.
**Type:** audit only. No code, tests, prompts, data or golden changed; nothing committed or pushed.
**Inputs:** the gap-to-target audit and the H1, H2, H3, H4, H5 and H5.1 reports, plus the current validation. No new paid evaluation was run.

## A. Executive verdict

**READY WITH NON-BLOCKING DEBT.** This verdict comes with a gate miss the user should weigh.

**Scores.** Honest rescoring on the original scale and weights gives:

| Score | Result | Gap to minimum gate |
|---|---:|---:|
| Code Health | 90.7 | 1.3 below 92 |
| Core Deterministic | 93.4 | 0.6 below 94 |
| Functional Runtime | 88.0 | 2.0 below 90 |

All three numeric minimum gates are **missed**. That is reported, not adjusted.

**Why the verdict is still READY WITH DEBT:**

1. **No critical invariant fails** (section E).
2. **Every pre-NPC+ blocker the original audit named is closed:** save migration, shared negation gates, provider retry, context tiering, `known_by` reachability.
3. **14 of the 15 objective exit conditions are met.** The original audit called these "the real gates".
4. **The shortfall is concentrated** in narrator reconciliation quality, live-unexercised retry, the authored-NPC movement design scope and coordinator density. Another bounded repair pass would not move these materially.

If the numeric gates are meant to be hard, the correct verdict is NOT READY. Closing the gap would then require narrator-quality work, mainly reconciliation and redaction rates, which is not a hardening repair.

## B. Baseline validation

| Check | Expected | Measured |
|---|---|---|
| `npm run typecheck` | pass | pass |
| `npm test` (total / pass / fail / todo) | 1219 / 1215 / 0 / 4 | **1219 / 1215 / 0 / 4** |
| `npm run test:playthrough` | 25/25 | **25/25** |
| H2 golden (`tests/golden/`) | unchanged | unchanged (no diff vs HEAD) |
| Test files | — | 66 |

The baseline is reproduced exactly.

## C. Final scores

The scale, the 18 Code Health weights and the layer weights are exactly those of the gap audit, section 1. Component scores are judgement anchored to the measured evidence listed.

| Metric | Original | Post-hardening | Target (min / preferred) | Result |
|---|---:|---:|---|---|
| Code Health | 84.4 | **90.7** | ≥92 / 94–95 | **missed (−1.3)** |
| Core Deterministic | 88.2 | **93.4** | ≥94 / 95–96 | **missed (−0.6)** |
| Functional Runtime | 74.3 | **88.0** | ≥90 / 90–92+ | **missed (−2.0)** |
| Project Maturity | 43 | **49** | not a gate (~50–60) | n/a |

The original projections were: expected 90.5 / 93.0 / 85.9, and best-reasonable 93.3 / 95.2 / 90.5. The results land between the two, consistent with "all passes landed, with complications" (the live defects H5.1 had to repair).

### Code Health dimensions

| Dimension (weight) | Original | Now | Evidence |
|---|---:|---:|---|
| Architectural clarity (9) | 86 | 90 | Seven typed stage modules (H2). `runTurn` has regrown to **168 lines** with H4/H5 diagnostics and retry plumbing. |
| State authority (10) | 91 | 95 | Exactly-one-commit; 0 unauthorized commits live. One live wrong committed identity (H5) was found and repaired (H5.1). |
| Atomicity (9) | 91 | 96 | prepare/commit receipts; failed, stale and cancelled turns commit nothing; exactly-one-commit under retry (110 injected turns plus 570 live). |
| Test coverage (10) | 88 | 94 | 947 → 1219 tests; golden; failure matrix; property and permutation tests; live soak. Not inflated for the count alone. |
| Determinism (8) | 90 | 95 | Shared cue/gate table with a locked verdict matrix; deterministic projection and selection; no model authority over state or identity. |
| Persistence (6) | 82 | 92 | Ordered migrations, canon compatibility, corruption/recovery matrix. Fingerprints are conservative; legacy saves need their exact dataset. |
| Narrator safety (7) | 81 | 87 | Secret leaks 0; unsupported Nicco actions delivered 0; new movement/departure backstops. Reconciliation 18–26% and redaction 6% miss targets; 4 TODOs. |
| Controller authorization (7) | 88 | 93 | Proposal ≠ authorization holds live (92% rejected, all fail-closed); 1 structured-output failure in 569 calls. |
| Character continuity (5) | 83 | 90 | H5.1 alias rule fixed the wrong-identity purchase; late naming keeps its ID. Authored NPCs cannot follow; "What should I call you?" is weak. |
| World / canon (5) | 86 | 88 | All 16 `known_by` grants reachable; compatibility policy. Authoring quality is outside hardening. |
| Travel / spatial (5) | 91 | 94 | Movement commits 0/99 → 50/50; unchanged route invariants; the grammar is narrow by design. |
| Retrieval (4) | 76 | 87 | Live Voyage hybrid: top-1 32/34, R@5 0.957, multi-answer R@5 0.846; leakage 0. Turn-level semantic retrieval not tested live. |
| Maintainability (4) | 74 | 83 | Duplicate primitives consolidated and gates shared. Coordinator density has come back (168 lines); `runTurn <60` missed. |
| Extensibility (3) | 78 | 87 | Migration registry, stage seams, grant index, diagnostics sink. |
| Runtime performance (2) | 72 | 86 | Live turn p50 / p95 / p99 = 5.8 / 9.7 / 11.2 s; deterministic stages under 3 ms at scale. |
| Observability (2) | 82 | 93 | TurnDiagnostics, retry telemetry, aggregator, live JSONL harness. |
| Live-model robustness (2) | 61 | 87 | 570 live turns at 99.82% success (100% with retry on); narrator 100%; parse 99.82%. Retry never exercised by a real transient failure. |
| Gameplay completeness (2) | 48 | 50 | Scope unchanged (not scored as a bug); common movement phrasing now works. |

### Layer components (only those not listed above)

| Component | Original | Now | Evidence |
|---|---:|---:|---|
| Context scale behaviour (runtime, 8) | 74 | 90 | Selection before validation; never-drop tiering; capacity 23 → 114 people. A genuine 32k ceiling fails closed. |
| Save / runtime usability (runtime, 6) | 78 | 88 | Edits that leave referenced records untouched (labels, unrelated additions) load; actionable recovery hints. Manual saving by design. |

## D. Score deltas from original audit

| Metric | Δ | Largest contributors |
|---|---:|---|
| Code Health | **+6.3** | Atomicity, state authority, test coverage, persistence, live-model, retrieval |
| Core Deterministic | **+5.2** | Atomicity (+5), state authority (+4), persistence (+10), continuity (+7), determinism (+5) |
| Functional Runtime | **+13.7** | Live-model (+26 × 0.22), context scale (+16), retrieval (+11), runtime performance (+14) |
| Project Maturity | **+6** | Persistence lifecycle, observability and live evaluation infrastructure are complete; no new gameplay domains |

### Objective exit conditions (gap audit, section 21)

14 of 15 are met.

| Condition | Result |
|---|---|
| Suite 100% pass, ≥1,100 tests | met (4 are documented TODOs, not skips) |
| Replay 25/25 | met |
| Typecheck clean | met |
| All failure codes tested | met |
| Negation matrix locked | met |
| Shared primitives defined once | met |
| Context caps boundary-tested | met |
| Secret leakage 0 | met |
| Multi-answer R@5 ≥ 0.75 | met (0.846 hybrid, live) |
| Save loads after a canon edit | met (reference policy) |
| Diagnostics for all failure codes | met |
| Retry exactly-one-commit | met |
| Live soak ≥ 120 turns | met (570) |
| Golden byte-identical | met |
| **`runTurn` < 60 lines** | **missed (168)** |

## E. Critical invariant matrix

| Invariant | Verdict | Evidence |
|---|---|---|
| Wrong committed state under normal tested flows: protected | **PASS** | 0 wrong commits in all deterministic suites and in H5.1's live revalidation. The one H5 live case is reproduced and fixed. |
| Failed turn commits nothing | **PASS** | Failure matrix: 0 commits on 60 failed injected turns; 0 on the live failure. |
| Stale / cancelled turn commits nothing | **PASS** | H2/H5 tests: cancellation during backoff and stale revision produce zero commits. |
| Exactly one commit | **PASS** | 0 turns with more than one commit, offline (110 injected) and live (710 turns). |
| Narrator cannot directly mutate state | **PASS** | The narrator only produces text; the audit chooses delivered text and never changes state; the movement audit cannot create commands. |
| Controller cannot bypass authorization | **PASS** | Every proposal passes `authorizeCommands`; 124 of 135 live proposals were rejected, all fail-closed. |
| Player agency protected | **PASS** | 22 live `player_agency` detections, 0 delivered and 0 committed; regex candidates were false positives. |
| Secret canon isolated | **PASS** | Retrieval leakage 0 (benchmark plus live); 0 confirmed live leaks. Live paraphrase testing is weak (model-reviewed excerpts). |
| Persistent identity stable | **PASS** | H5.1 alias rule; same-ID late naming; same-name people stay distinct; save/load preserves IDs. |
| Movement / state continuity repaired | **PARTIAL** | Nicco and carried movement: 50/50 live, and the audit backstop exists. Authored NPCs cannot follow or leave through narration; the audit keeps prose consistent instead. |
| Save/load preserves state | **PASS** | Round-trip suites across rich scenarios; migrations validated; corruption never alters live state. |
| Unknown ≠ hidden | **PASS** | H3 knowledge semantics and tests; retrieval excludes restricted records without treating unknown as secret. |
| Manual save only | **PASS** | No save path outside `src/persistence` and the dev tools; turns, loads and migrations never save. |

## F. Remaining debt

Intentionally deferred gameplay systems are not listed as defects.

1. **Narrator reconciliation and redaction.** Reconciliation is 18.3% across H5 and 26.4% on the H5.1 scenarios; redaction is 6.3% (targets <15% and <5%). This is the largest single drag on the runtime score.
2. **Authored NPCs cannot follow or leave by narration.** This is a design decision, now explicit.
3. **Coordinator density has come back:** `runTurn` is 168 lines.
4. **Retry was never exercised by a real transient failure.** It is proven only by offline injection.
5. **Turn-level semantic retrieval has not been tested live.**
6. **Four H1 TODOs** (over-redaction and false negatives).
7. **Controller rejection rate of 92%** (fail-closed), and 1 structured-output failure in 569 calls.
8. **Other known limits:**
   - the movement grammar is narrow by design;
   - "What should I call you?" is not a name question;
   - canon fingerprints are conservative;
   - the 32k context ceiling is genuine and fails closed.

## G. Pre-NPC+ gate

**Is the current engine foundation ready to begin NPC+?** **READY WITH NON-BLOCKING DEBT.** The numeric gates are missed, as stated in section A.

Five debts to track during NPC+:

1. **Reconciliation and redaction rate.** NPC+ adds dialogue and evidence paths, so track it per new path.
2. **Authored-NPC movement policy.** NPC+ autonomy will need an explicit decision on whether, and how, authored NPCs move.
3. **Coordinator density.** Put NPC+ stages behind new stage modules rather than in `runTurn`.
4. **Live retry evidence.** Keep the diagnostics sink on during NPC+ playtests to capture real transient failures.
5. **Context headroom.** NPC+ raises the counts of present people and knowledge edges; watch the measured 32k ceiling (85% at 30 people).

## H. Recommended next step

1. **Begin NPC+**, with a pre-agreed rule that new behaviour enters through stage modules and existing audit/authorization seams.
2. **Use the H5 harness during development:** a small live matrix after each NPC+ milestone, tracking success, reconciliation, redaction and identity/movement agreement.
3. **If the numeric gates must be met first,** the only pass that would move them materially is a narrator-quality pass on reconciliation and redaction rates. It is not a correctness repair, and it is not recommended as a blocker.

CALDREVAN HARDENING H6 COMPLETE
