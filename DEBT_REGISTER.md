# CALDREVAN — DEBT REGISTER

**Status:** `READY_WITH_NON_BLOCKING_DEBT`  
**Blocking debt:** none  
**Movement/follow state logic:** frozen  
**Production controller:** `qwen/qwen3.8-flash` (baseline for subsequent debt-closure work)
**Production controller frozen:** NO
**Last updated:** 2026-10-05

This is the short, living debt register intended to stay in the repository root.
IDs are never renumbered.

---

## Active debt

| ID | Area | Severity | Current state / next action |
|---|---|---|---|
| **D-06** | Occasional controller `structured_output_invalid` | MINOR | Not observed after Qwen switch; insufficient soak to close. Open pending broader runtime evidence; 16/16 switch outputs were structured-valid. |
| **D-09** | Reflection organic usefulness unmeasured | **SOAK PENDING - PRODUCTION INTEGRATED** | 2026-10-05: qualified V2.3-CVC-E1 production integration remains PASS. Final non-movement matched experiment generated a useful E1 reflection, persisted normally and packed full text at later turn 11. One blinded pair preferred WITHOUT (utility 17 vs WITH 12): **REFLECTION_USEFULNESS_CONCERN; benefit not demonstrated**. Unique-value follow-up produced only one authoritative statement and a valid-empty reflection; no new A/B. Interrupted-request index collision recorded separately; no complete closure chain. Offline eligibility now PASS for a separately prevalidated relationship fallback only; self-synthesis is reachable but compact-equivalent. Final relationship live sequence: 3 submitted attempts, 2 finalized turns, zero authoritative respect increases; one controller rate-limited failure. **RELATIONSHIP_REALIZATION_INSUFFICIENT**; no reflection trigger, later packing or A/B. No material benefit demonstrated. Corrected instrumentation PASS; production unchanged. No tuning or automatic rerun. Prior stopped soak conclusions preserved; unrelated debts remain separate. [Integration](docs/evaluations/D09_PRODUCTION_STRUCTURED_REFLECTION_INTEGRATION.md), [prior soak](docs/evaluations/D09_FINAL_CAMPAIGN_SOAK_AND_ABLATION.md), [matched ablation](docs/evaluations/D09_FINAL_MATCHED_NARRATION_ABLATION.md), [unique-value follow-up](docs/evaluations/D09_UNIQUE_VALUE_MATCHED_ABLATION.md), [offline eligibility](docs/evaluations/D09_QUALIFYING_REFLECTION_ELIGIBILITY.md), [final relationship run](docs/evaluations/D09_FINAL_RELATIONSHIP_UNIQUE_VALUE_ABLATION.md). |
| **D-16** | `private_memory_refs` has no writer | MINOR | Dead/undefined structure today. Remove in a later schema migration or give it a concrete purpose during memory work. |
| **D-17** | Reflection trigger counts lifecycle entries | MINOR | First reflection can happen earlier than intended because lifecycle entries count. Revisit only together with D-09/D-10 evidence. |
| **D-19** | Reconciliation / redaction rate | **IMPORTANT** | Safe but narration is still revised/redacted more often than ideal. Remains relevant for proposal/reconciliation quality; measure by path and reduce causes without weakening audits. |
| **D-20** | Reflection can delay the next command | MINOR | Reflection may sit on the critical path. Move it off the critical path when autonomy/background work is introduced. |
| **D-21** | Type-only import cycles in `turn/` | MINOR | No runtime cycles. Clean up when the turn layer is next restructured. |
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
3. **D-09** - SOAK PENDING: final matched non-movement pair preferred WITHOUT; REFLECTION_USEFULNESS_CONCERN, material grounded benefit not demonstrated. No automatic rerun or redesign.

D-06 remains open pending broader runtime soak after the Qwen switch.

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
