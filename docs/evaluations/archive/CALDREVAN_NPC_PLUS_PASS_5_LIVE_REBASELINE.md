# Caldrevan NPC+ Pass 5 — post-audit live rebaseline

**Date:** 2026-10-02. Evaluation pass: no runtime, prompt, audit, retrieval, controller or NPC+ change. Nothing committed or pushed.
**Inputs:** the [NPC+ Pass 4](CALDREVAN_NPC_PLUS_PASS_4_AUDIT_PRECISION.md) and [H5 robustness](../CALDREVAN_HARDENING_H5_LIVE_MODEL_ROBUSTNESS.md) reports.
**Raw data:** `h5-live/npcplus5.jsonl` (with summary).

**The only file changed** is the evaluation harness `src/dev/eval-live-h5.ts`. It now records every `absent_participant` flag with its exact triggering sentence, taken from `TurnResult.narration_reconciliation`.

## A. Executive result

**Status: COMPLETE.** These are the acceptance answers.

| Question | Answer |
|---|---|
| **A. Did reconciliation and redaction improve broadly after Pass 4?** | **Yes for household and lore scenes, and neutral elsewhere.** Household and lore scenes fell from 45.9% / 14.9% (Pass 2/3) to 14.3% / 3.6%. On the H5.1-overlap scenarios they fell from 19.2% / 4.2% to 11.4% / 2.3%. On the H5-overlap scenarios they are within noise of H5 (11.8% / 2.4% against 14.5% / 1.3%). |
| **B. Are the remaining `absent_participant` flags mostly true positives?** | There were **none** in 105 turns, so there was nothing to classify. A scan of all 12 excerpts that mention an absent character found only references, every one correctly unflagged, and no missed participation in that sample. |
| **C. Did any correctness protection regress?** | **No.** 0 wrong or unexpected commits, 0 secret leaks; movement committed 20/20; purchase narration agrees with commits. |
| **D. Is the engine stable enough to resume NPC+ depth?** | **Yes.** 104/105 success (the one failure was non-retryable controller output, same rate as H5); reconciliation 14.4%; redaction 1.9%. |

## B. Live matrix

**Composition.** 19 representative scenarios × 4 runs, planned at 108 turns; **105 executed**, because one scenario stopped after its failed first turn. Production retry, GLM 5.2 narrator, DeepSeek controller.

**Scenarios:**

- ordinary conversation (A);
- movement (B), follower (C), left-behind (Y), departure (O);
- purchase (G), named and late naming (H);
- lore (K), relationship (J, HH_C), player agency (U, N);
- restricted canon (L);
- household one and group (HH_A, HH_B), NPC+ follow (HH_D);
- real-canon public, private and unrelated (CH_*).

## C. Before and after metrics

**Pass 5 overall (105 turns):**

| Metric | Value |
|---|---|
| Success | **99.0%** (1 `controller_failed`: `structured_output_invalid`, non-retryable) |
| Reconciliation / redaction | **14.4% / 1.9%** |
| `absent_participant` | **0** |
| `player_agency` | 6 (all revised; none delivered) |
| Unsupported state assertions | 9 (`uncommitted_condition` 8, `asserts_uncommitted_purchase` 1) |
| Wrong commits / unexpected commit kinds / secret leaks | **0 / 0 / 0** |
| Retry events | 0 (no transient errors) |
| Total turn p50 / p95 / p99 | 5.5 / 8.9 / 10.5 s |
| Context average / maximum | 7,037 / 15,579 characters |
| Cost | **$0.28** |

**Overlapping scenarios:**

| Comparison | Earlier: reconciliation / redaction / absent flags | Pass 5 |
|---|---|---|
| **Same scenarios as H5** (340 earlier turns, 77 now) | 11.8% / 2.4% / 0 | 14.5% / 1.3% / 0 |
| **Same scenarios as H5.1** (120 earlier, 45 now) | 19.2% / 4.2% / 8 | **11.4% / 2.3% / 0** |
| **Household and lore, Pass 2/3** (74 earlier, 28 now) | 45.9% / 14.9% / 33 | **14.3% / 3.6% / 0** |
| **Pass 4 household and lore** (36) | 25.0% / 0.0% / 4 | 14.3% / 3.6% / 0 |

**Reading:**

- The audit-precision repair removed the absent-mention false positives that dominated the H5.1, Pass 2/3 and Pass 4 rates.
- Scenarios that never produced them (H5 overlap) stay within run-to-run noise. Samples are small, so a few points of difference are not significant.

## D. `absent_participant` classification

| Class | Count |
|---|---:|
| True positive | 0 |
| False positive | 0 |
| Uncertain | 0 |

**No flags fired.** As a false-negative check, every captured excerpt with an absent character's name was examined: 12 excerpts, in left-behind, NPC+ follow and absent-Korvin lore scenes. Examples:

- "He had called to Brenna, but the tall woman remained upstairs…"
- "Brenna does not follow."
- "Brenna was not there."
- "Korvin is a licensed generalist slaver…"
- "What Nicco can piece together about Korvin's trade…"

All are references; none shows the absent person participating; none was flagged. **Limitation:** only flagged or review scenarios store excerpts (up to 400 characters), so unflagged participation outside them cannot be seen.

## E. Correctness and safety

| Check | Result |
|---|---|
| Wrong commits / unexpected commit kinds | 0 / 0 |
| Secret sentinel / restricted canon in narration | 0 |
| Movement | committed 20/20 (B, C, Y×2, HH_D) |
| Purchases | 4/7 committed. In every captured H case, narration matched state ("We hadn't settled on a number" when no sale was committed; "Korvin took the coins…" when it was). |
| Controller | 8 proposals, all rejected and failing closed (`leave_scene` against canon-placed Gerome ×4, unsupported `transfer_item` ×4) |
| Player agency | 6 detections, 0 delivered |
| Provider | narrator 100%; controller 99.0%; no transient failures, so retry was not exercised (unchanged H6 debt) |

## F. NPC+ observations

| Metric | Value |
|---|---|
| NPC+ context present | 28/28 household and canon turns; Tier B 16, C 44, D 0 |
| Recovery hits | 4 (CH_public), all **de-duplicated** against the same turn's H3 retrieval (4/4) |
| Follow evidence / proposals / commits | 0 / 0 / 0. The narrator again chose not to narrate following (left-behind note; design). |
| Relationship proposals / commits | 0 / 0 (Pass 3 root cause: no evidenced relationship act) |
| Contracts established | 0 |

## G. Remaining debt

1. **Retry is not exercised live** (0 transient errors over all live runs so far).
2. **One non-retryable controller output failure** per about 100–570 turns (H5: 1/569; here: 1/105).
3. **`uncommitted_condition` is now the leading audit issue** (8/105): narrator texture describing conditions. This is pre-existing and was not investigated in this pass.
4. **NPC+ write paths are rarely triggered live:** following, relationships and contracts. These are design and narrator-behaviour questions, not defects.
5. **Absent-participation false negatives are only sample-checked:** excerpts exist for review scenarios only.
6. **Carry-overs:** the 32k ceiling for full-household scenes; authored destination-less departure; four H1 TODOs.

## H. Readiness for reflection

**Ready.**

- The runtime is stable at about 99% success, with reconciliation near or below the H5 level and redaction under 2%.
- The NPC+ foundation (lifecycle, structured developments, consolidation, contracts, recovery, de-duplication, audit precision) holds live without wrong commits or leaks.

**Recommended next step:** a first bounded reflection pass. It would derive structured, evidence-cited stance notes from developments and roll-ups, as proposals only, behind the existing evidence and authorization path. Model output never becomes authority; the live measure is that reconciliation, redaction and leaks stay at this baseline.

CALDREVAN NPC+ PASS 5 COMPLETE
