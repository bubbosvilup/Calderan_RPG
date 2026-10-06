# CALDREVAN — DEBT REGISTER

**Status:** `READY_WITH_NON_BLOCKING_DEBT`  
**Blocking debt:** none  
**Movement/follow state logic:** frozen except the narrow P12.2 canonical departure exception
**Production controller:** `qwen/qwen3.8-flash` (baseline for subsequent debt-closure work)
**Production controller frozen:** NO
**Last updated:** 2026-10-06

This is the short, living debt register intended to stay in the repository root.
IDs are never renumbered.

## Current playtest P-series status

| Item | Status / evidence |
|---|---|
| **P3.3** | **CLOSED** — controlled naming disclosure. [Report](P3_3_CANONICAL_NAME_DISCLOSURE_FINAL.md). |
| **P3.4** | **CLOSED** — canonical participant continuity. [Report](P3_4_CANONICAL_PARTICIPANT_CONTINUITY.md). |
| **P3.5** | **CLOSED** — canonical name knowledge commit. [Report](P3_5_CANONICAL_NAME_KNOWLEDGE_COMMIT.md). |
| **P10** | **OBSERVATION ONLY / NOT ACTIVE FIX ISSUE** — historical perspective/pacing evidence preserved; no new fix work. [Evidence](P3_3_P10_P11_REGENERATION_FIX.md). |
| **P11** | **IMPLEMENTED / LIVE VERIFICATION PENDING** — fixed derived dayparts and bounded explicit-duration waits; no wait-until or prose reconciler. [Foundation](P11_KISS_TIME_OF_DAY_FOUNDATION.md), [historical audit](P11_TEMPORAL_SYSTEM_AUDIT.md). |
| **P12** | **OPEN / P12.1 AND P12.2 IMPLEMENTED / LIVE VERIFICATION PENDING** — bounded scene-local projection and narrow canonical departure reconciliation implemented; ordinary-play verification and remaining event continuity are open. [Audit](P12_IMMEDIATE_SCENE_CONTINUITY_AUDIT.md). |
| **P12.1** | **IMPLEMENTED / LIVE VERIFICATION PENDING** - two finalized exchanges, 2,000-character masked narration budget; storage and typed state unchanged. [Report](P12_1_BOUNDED_RECENT_SCENE_NARRATION.md). |
| **P12.2** | **IMPLEMENTED / LIVE VERIFICATION PENDING** - uniquely attributed completed current-scene canonical departures reuse OFF_SCENE; rejected covered departures are reconciled before delivery. No general movement authority. [Report](P12_2_CANONICAL_DEPARTURE_RECONCILIATION.md). |
| **P8** | **V1 CLOSED / IMPLEMENTED** - Gold/Silver currency (10S = 1G), authored anchor table `config/economy.yaml`, persisted per-seller Personal Price Index, selective `[ECONOMIC REFERENCE]` injection with matching audit policy. No price engine; purse/transaction authority unchanged; auction lot/bid continuity stays with P9. [Report](P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md). |
| **Character Performance Contract Pilot** (no P-number) | **ADOPTED / LIVE OBSERVATION PENDING** - prompt-only `[CHARACTER PERFORMANCE]` block, three non-canonical style examples and a near-output reminder; blind A/B 3.47 → 4.01, +616 prompt tokens. Not engine debt. Observed lossless-compaction 65%-target quirk recorded in the report for triage. [Report](CHARACTER_PERFORMANCE_CONTRACT_PILOT.md). |

P12 remains the active continuity issue; P11 still awaits live verification. The unrelated D-series debts below remain unchanged. This current status supersedes historical P-series status wording in earlier evidence reports without rewriting that evidence.

---

## Active debt

| ID | Area | Severity | Current state / next action |
|---|---|---|---|
| **D-06** | Occasional controller `structured_output_invalid` | MINOR | 2026-10-05 audit: Qwen switch 16/16; later raw current-schema controller receipts 32/32 parsed, plus three 429s. Reflection qualification uses a different schema/route. Remains OPEN: broader representative current-controller gameplay reliability beyond curated/controlled samples is still missing; no new paid soak. [Sweep](docs/evaluations/MINOR_DEBT_SWEEP_D06_D16_D17_D20_D21.md). |
| **D-09** | Reflection organic usefulness unmeasured | **DEFERRED / SHADOW** | 2026-10-05: Engineering PASS; semantic safety PASS; provider reliability PASS; production integration PASS; narrative utility UNPROVEN. Default narrator exposure OFF; production generation OFF by default. Optional SHADOW during real user playthroughs records qualified notes without narrator exposure. Reopen only when real gameplay naturally produces a reflection with a plausible unique-value later-use case. Do not manufacture authority specifically to test D-09. No automatic soak or A/B; historical negative and stopped-run evidence preserved. [Current policy](docs/evaluations/D09_DEFERRED_SHADOW_POLICY.md). [Integration](docs/evaluations/D09_PRODUCTION_STRUCTURED_REFLECTION_INTEGRATION.md), [prior soak](docs/evaluations/D09_FINAL_CAMPAIGN_SOAK_AND_ABLATION.md), [matched ablation](docs/evaluations/D09_FINAL_MATCHED_NARRATION_ABLATION.md), [unique-value follow-up](docs/evaluations/D09_UNIQUE_VALUE_MATCHED_ABLATION.md), [offline eligibility](docs/evaluations/D09_QUALIFYING_REFLECTION_ELIGIBILITY.md), [final relationship run](docs/evaluations/D09_FINAL_RELATIONSHIP_UNIQUE_VALUE_ABLATION.md), [utility/packing review](docs/evaluations/D09_REFLECTION_UTILITY_AND_PACKING_REVIEW.md). |
| **D-19** | Reconciliation / redaction rate | **IMPORTANT** | Safe but narration is still revised/redacted more often than ideal. Remains relevant for proposal/reconciliation quality; measure by path and reduce causes without weakening audits. |
| **D-21** | Type-only import cycles in `turn/` | MINOR | 2026-10-05 partial cleanup: prompt-envelope and evidence-result types use dependency leaves; AST source back-edges 20 to 16, zero runtime cycles, all 765 runtime dependency edges unchanged. OPEN: core turn result/evidence/audit, context budget/compaction, and reflection/schema/diagnostics type components still need extraction. [Sweep](docs/evaluations/MINOR_DEBT_SWEEP_D06_D16_D17_D20_D21.md). |
| **D-22** | Turn-level semantic retrieval not live-tested | MINOR | Include semantic retrieval in a future live matrix / soak. |
| **D-26** | Mannerism Epistemic Fidelity & Portrayal Repair | **OPEN — SHADOW DATA COLLECTION** | Gate remains diagnostics-only. D-09 V2: zero findings / 105 organic cue exposures, plus a manually confirmed coverage miss; more data needed before Phase C. [Organic appendix](docs/evaluations/D26_SHADOW_SOAK_APPENDIX.md), [implementation](docs/evaluations/D26_EPISTEMIC_SHADOW_GATE.md). |

---

## Accepted / intentional limitations

| ID | Status |
|---|---|
| **D-03** | Cosmetic invited-NPC hedge remains accepted; attempts to remove it materially distorted follow behaviour. |
| **D-08** | Four accepted H1 TODOs remain fail-closed / over-redaction cases. |
| **D-12** | Follow grammar is closed for observed production language; unsupported ornate forms intentionally fail closed. |
| **D-18** | Absent-participant possessive/pronoun gaps remain accepted until there is real coreference support. |
| **D-23** | `runTurn` remains at the guarded 164-line ceiling. |
| **D-25** | Rare movement narration/state divergence remains in unrecognised departure wording. State stays correct; occasional departure prose may survive or valid movement prose may be withdrawn. No more synonym-hunting. Reopen only for a reproduced real-play bug or a clear class-level fix. |

---

## Closed

**D-16 CLOSED** - 2026-10-05: deprecated optional legacy-only `private_memory_refs`; no runtime initialization/recovery dependency, old save values preserved. Save/migration/knowledge-recovery tests PASS. [Sweep](docs/evaluations/MINOR_DEBT_SWEEP_D06_D16_D17_D20_D21.md).

**D-17 CLOSED** - 2026-10-05: initial join/migration excluded from generic reflection count; leave/rejoin evidence, cursor, contract and rollup triggers preserved. Focused trigger/shadow tests PASS. [Sweep](docs/evaluations/MINOR_DEBT_SWEEP_D06_D16_D17_D20_D21.md).

**D-20 CLOSED AS DEFAULT-OBSOLETE** - 2026-10-05: D-09 default OFF removes reflection wait from normal play; optional shadow is explicitly synchronous diagnostic maintenance. OFF/shadow session tests PASS. [Sweep](docs/evaluations/MINOR_DEBT_SWEEP_D06_D16_D17_D20_D21.md).

**D-10 CLOSED** — emergent NPC+ mannerisms: calibrated Qwen 8/8 live recall, zero accepted hard false positives, live aliases and finalized promotion/anti-feedback/save-load verified. [Evidence](docs/evaluations/D10_MANNERISM_EXTRACTOR_CALIBRATION.md).

**D-05 CLOSED** — live production retry lifecycle validated with controlled injected transient and real OpenRouter retry attempt; failed attempts cannot mutate authority; exactly one commit/effect. [Evidence](docs/evaluations/D05_LIVE_RETRY_VALIDATION.md).

**D-04 CLOSED** — deterministic lossless narrator-context compaction v2; live automatic maintenance and narrator comprehension validated; no LLM compressor required, `CONTEXT_COMPRESSOR_MODEL` intentionally unset. [Evidence](docs/evaluations/D04_FINAL_TARGETED_CLOSURE.md).

### Movement / follow
`D-01, D-02, D-07, D-11, D-13, D-14, D-15, D-24`

Key current guarantees:

- each persistent authored NPC has independent authoritative location state;
- known destination → real `LOCATED(place)`;
- unknown completed departure → `OFF_SCENE`;
- scene membership is derived from co-location with Nicco;
- NPC locations persist across unrelated turns and save/load;
- rejected Nicco movement cannot commit dependent follower movement;
- 0 known invalid committed moves after the final fixes;
- movement state logic is considered frozen.

### Other previously closed work
Pass-10 hardening, persistence, authorization, retry safety, narrator revision repair,
NPC+ packing/performance, and prior regression repairs remain closed in their historical reports.

---

## Priority order

1. **D-19** — reduce reconciliation/redaction rate.
2. **D-26** — OPEN — NEEDS MORE DATA: evaluate organic matcher coverage and precision before repair design.
3. **D-09** - DEFERRED / SHADOW: narrative utility UNPROVEN; narrator exposure OFF. Reopen only on a naturally occurring reflection with plausible unique-value later use; no manufactured authority or automatic soak.

D-06 remains open pending broader representative current-controller gameplay evidence; reflection reliability is a separate schema/route. No new paid soak is scheduled.

---

## Rule for updates

When a debt is closed:
- keep its ID;
- move it to **Closed**;
- add only a one-line closure reason.

When a new debt is found:
- assign the next unused ID;
- do not renumber old IDs.

Keep this file short. Detailed evidence belongs in `docs/evaluations/`.
