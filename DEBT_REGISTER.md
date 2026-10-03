# CALDREVAN — DEBT REGISTER

**Status:** `READY_WITH_NON_BLOCKING_DEBT`  
**Blocking debt:** none  
**Movement/follow state logic:** frozen  
**Production controller:** `qwen/qwen3.8-flash` (baseline for subsequent debt-closure work)
**Production controller frozen:** NO
**Last updated:** 2026-10-03

This is the short, living debt register intended to stay in the repository root.
IDs are never renumbered.

---

## Active debt

| ID | Area | Severity | Current state / next action |
|---|---|---|---|
| **D-04** | Context ceiling / knowledge packing | **IMPORTANT** | **IN PROGRESS — lossless grouping V2 implemented; V2 compressor bakeoff pending.** Crowded rich scenes can exceed the context budget. Planned fix: context budget meter + LLM-assisted semantic compaction, automatic near threshold and manually triggerable. Compaction must block turn submission until complete and preserve authoritative knowledge. |
| **D-05** | Real transient provider retry not live-exercised | **IMPORTANT** | Open. Offline retry safety is proven, including HTTP 429. The 16-call Qwen switch validation had no transient errors or retries; dedicated live validation remains required. Verify one commit max and no duplicate state. |
| **D-06** | Occasional controller `structured_output_invalid` | MINOR | Not observed after Qwen switch; insufficient soak to close. Open pending broader runtime evidence; 16/16 switch outputs were structured-valid. |
| **D-09** | Reflection organic usefulness unmeasured | **IMPORTANT** | Reflection has not yet been proven useful on genuine organic developments. Measure after recurring-behaviour support exists. |
| **D-10** | Recurring behaviour / motifs have no representation | **IMPORTANT** | Repeated habits currently vanish unless separately remembered. Add a small derived motif source feeding existing reflection; do not create a second general memory system. |
| **D-16** | `private_memory_refs` has no writer | MINOR | Dead/undefined structure today. Remove in a later schema migration or give it a concrete purpose during memory work. |
| **D-17** | Reflection trigger counts lifecycle entries | MINOR | First reflection can happen earlier than intended because lifecycle entries count. Revisit only together with D-09/D-10 evidence. |
| **D-19** | Reconciliation / redaction rate | **IMPORTANT** | Safe but narration is still revised/redacted more often than ideal. Remains relevant for proposal/reconciliation quality; measure by path and reduce causes without weakening audits. |
| **D-20** | Reflection can delay the next command | MINOR | Reflection may sit on the critical path. Move it off the critical path when autonomy/background work is introduced. |
| **D-21** | Type-only import cycles in `turn/` | MINOR | No runtime cycles. Clean up when the turn layer is next restructured. |
| **D-22** | Turn-level semantic retrieval not live-tested | MINOR | Include semantic retrieval in a future live matrix / soak. |

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

1. **D-04** — context budget + compaction system.
2. **D-05** — real transient retry validation.
3. **D-10** — recurring behaviour / motifs.
4. **D-19** — reduce reconciliation/redaction rate.
5. **D-09** — measure reflection once D-10 exists.

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
