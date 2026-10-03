# D-04 final live closure validation

**Historical run:** its original scores and C1 note remain below. D-04 was subsequently closed by the [targeted follow-up](D04_FINAL_TARGETED_CLOSURE.md); no original output is retrospectively rescored.

2026-10-03. **D-04 remains IN PROGRESS; closure failed.** V2 was fast-forwarded into local `main` at `1b052a4` without semantic changes before validation. No closure commit or main push was made because the acceptance gate failed. D-05 and D-06 were not changed.

Implementation: `d04-lossless-grouping-v2`; policy: `d04-watermarks-v2`. Narrator: exact production `z-ai/glm-5.2`, pinned `z-ai/fp8`, fallbacks disabled, reasoning disabled, 512 output tokens and the unchanged production timeout. Production controller remains `qwen/qwen3.8-flash`; the lifecycle used a deterministic no-command controller spy to inspect original authority inputs without buying controller calls. Production compressor remains **NONE / UNSET BY DESIGN**. No controller or compressor model calls were purchased.

## Frozen protocol and evidence

Before any paid call, typecheck passed, tests were **1,826 passed / 0 failed / 4 accepted TODO / 1,830 total**, and playthrough was **25/25**. The original frozen A/B/C requests and source projections were reconstructed byte-equivalently; the V2 canonical renderer outputs matched the earlier frozen V2 artifacts. Only player stimuli were changed through `buildNarratorPrompt`; all source units, metadata and source hashes remained exact. No compacted context was hand-edited.

The original Case C request remains **11,798 tokens / 92.53% -> 8,002 / 62.76%**. Specific player questions increase the compacted C requests to 8,018--8,024 tokens, still below the unchanged 8,287-token target. Production selection chooses **expanded** for A/B and **dictionary** for C. Consequently this run tests epistemic safety under the production-selected A/B representation and dictionary comprehension under C; it does not claim that B exercised dictionary metadata families.

The complete model/routing, production prompt, schema, renderer, policy, request fingerprints, stimuli, MUST/MUST-NOT constraints and actual next-turn request were frozen in ignored `saves/d04-context/final-live/freeze.json`. SHA-256: `e116a23bd8c1fe24c4a3f50293ea18d6bd56b40c02897e93583a200e98ec0fc2`. All listed implementation fingerprints stayed unchanged throughout paid generation. No semantic rerolls, prompt edits, renderer/schema/policy edits, criteria relaxation or extra calls were performed.

Raw requests, captured response streams, generated outputs, manual aspect-by-aspect review, frozen stimuli and offline replay evidence remain ignored under `saves/d04-context/final-live/`. No raw model outputs are committed in this report. At this historical run, the evaluation script had the two recorder/instrumentation limitations described below; the ignored recovery runner safely persisted the remaining calls without changing generation parameters or requests. Those infrastructure issues were subsequently fixed in the targeted follow-up; the original freeze and raw evidence remain retained.

## Frozen semantic constraints and per-call review

All calls additionally require correct fact/subject/epistemic/privacy/provenance/continuity, no material unsupported facts and no representation mechanics as world facts. Irrelevant facts need not be mentioned; style, sentence ordering and incidental ambient description are non-blocking. Every verdict is manual; no opaque score is used.

| Call | Layout; estimated tokens | Frozen MUST | Frozen MUST-NOT | Verdict and review |
| --- | --- | --- | --- | --- |
| A1 | expanded; 3,026 | D04 Person 0: Ledger 0 shipment at sunset, keeper verified wax | Different time/subject, invented cargo/owner/item/physical ledger possession | **QUESTIONABLE**: HTTP 200; recorder terminated before output persistence. Semantics unassessed, not counted PASS. |
| A2 | expanded; 3,020 | D04 Person 6: Ledger 15 keeper recorded debt | Invent debt amount, creditor, item or ledger location | **PASS**: required debt and ledger subject correct; no material invention or syntax leakage. |
| B1 | expanded; 1,490 | Maren communicates Brenna does not know whether western keeper has key | Invert ignorance; affirm key exists/does not exist | **PASS**: explicit negative knowledge retained. |
| B2 | expanded; 1,488 | Maren believes keeper owns southern warehouse; belief attribution | Objective confirmation or evidence proving false belief | **PASS**: belief voiced by Maren and described as her assumption, not independently confirmed. |
| B3 | expanded; 1,501 | Box contents remain suspected; before-sunset arrival uncertain | Confirm contents/arrival or invent inspection | **PASS**: both epistemic qualifications retained. |
| B4 | expanded; 1,486 | Brenna must not use Maren-only Ironbound information | Narrator/Brenna disclosure, unsolicited Maren disclosure, Gerome speech | **FAIL**: unsolicited holder disclosure violates frozen rule; correct holder attribution. Existing contract allows holder to choose disclosure, so primary classification **F, test design**. This is not proof of wrong-holder leakage. |
| C1 | dictionary; 8,019 | Ledger 0 Entry 1 keeper counts crates; Ledger 1 Entry 1 watchman checks wax before gate closes | Subject/entry swap, crate inspection/travel, dictionary syntax | **QUESTIONABLE**: exact distinct answers; physical pages spread between people are not established in current item state. Possible dialogue-to-state embellishment; no material source/subject swap established. |
| C2 | dictionary; 8,018 | D04 Person 4 continues their prior promise to wait/keep place | Wrong speaker, dialogue changes location/equipment, invented completed event | **PASS**: correct speaker and retained promise. |
| C3 | dictionary; 8,024 | Inquisition answer from retrieved canon, distinct from current square activity | Invent local Inquisition intervention, travel or unsupported lore | **PASS**: supported public canon and current/lore distinction. Awkward supplied-lore phrasing and extra paragraphs are non-blocking style effects. |
| E2E | dictionary; 7,324 actual next-turn request | Correct Ledger 0 Entry 1 answer, activated candidate, original controller authority, actual delivery | Wrong fact/subject, paid semantic revision, authority crossover or compaction mutation | **FAIL**: grounded draft correct, but actual turn fails during audit/reconciliation; no delivered narration or commit. See smallest reproduction below. |

Totals: **6 PASS / 2 QUESTIONABLE / 2 FAIL** across ten paid attempts. Nine outputs were preserved. Case A: 1 PASS, 1 QUESTIONABLE. Case B: 3 PASS, 1 FAIL. Case C: 2 PASS, 1 QUESTIONABLE. E2E: FAIL.

Negative-knowledge inversion, false-belief promotion, uncertainty promotion and material ledger/subject swaps were not observed in the nine assessable outputs. No dictionary/group mechanics appeared as world facts. A1 is unassessed and cannot support absence claims. B4 fails the frozen non-disclosure protocol, but no wrong-holder attribution was demonstrated. C1 has one questionable unsupported physical prop. Authority isolation and freshness checks passed.

## Real automatic maintenance and next turn

This uses real `GameSession`, `TurnCoordinator`, context construction, lexical retrieval, default watermarks and `LosslessContextCompactor(undefined)`. The coordinator's contextRequest was not replaced; apply did not force rendering; no synthetic policy overrides or provider setup calls were used. Twelve bounded finalized authored exchanges were seeded offline, using the same detailed ledger source as C and longer player-authored comparison notes to exceed the real 90% auto threshold. This is a separate lifecycle fixture, not a claim that the C canonical request has changed.

| Measurement | Observed result |
| --- | --- |
| Before maintenance | **11,535 tokens / 90.47%** |
| Selected layout | **dictionary** |
| After maintenance | **7,297 tokens / 57.23%** |
| Normal watermark / exact target | **65% / 8,287 tokens** |
| Saving | **4,238 tokens / 36.74%** |
| Compressor provider calls / cost | **0 / $0** |
| Automatic preflight | Input rejected as `context_too_large`; maintenance starts |
| Concurrent input during compaction | Rejected as `turn_in_progress` |
| Narrator calls during maintenance | **0** |
| Recovery | `idle` / READY after successful maintenance |
| Compaction changes campaign | **No**, snapshot byte-equivalent |
| Actual next narrator request | **7,324 tokens / 57.44%**, activated dictionary |
| Measured vs actual next request | **Exact request hash and full budget snapshot match** |
| Active source identity | Same source hash as maintenance; no stale/wrong candidate |
| Controller input | Original uncompressed ledger statements, no dictionary/group metadata |
| Actual player turn | **FAILED** in reconciliation, `narrator_failed`; no delivery and no state commit |

The next-turn action and scene framing add 27 tokens to the between-turn measurement. This is not a stale measurement: the actual request was measured independently, matched the frozen offline next-turn hash `ebd1fdb9cdde30056925012942c6310f64217c9466ff348ae9e9a3ace6ad7640`, and reused the activated source `c6b6d43eaf06cf82058d6dd7b59927adbd7aa328f2ccde17b1c8a4f40965fd9d`.

The controller was an offline no-command spy, so this demonstrates the original-input boundary, not live controller-model comprehension. Retrieval and authorization remain on their original production paths; neither reads the compacted narrator representation. D-05/D-06 gain no closure evidence from this run.

## Smallest reproducible closure blocker and attribution

The saved real draft has the correct Ledger 0 Entry 1 answer, with the speaker's memory/recitation attribution in one paragraph and the quotation in the next. Offline replay of that same draft requires **zero paid calls** and reproduces one `private_player_fact` audit issue. `dialogueFocused` resets subject tracking at paragraph boundaries; the standalone quotation becomes an unattributed speaker, so the audit gives it no CAN USE entries. Shared ledger vocabulary then triggers a false privacy warning mentioning Ledger 22. This warning does not show that the narrator confused Ledger 0 and Ledger 22: the actual answer is correct and Ledger 22 is the audit's lexical match. An additional zero-paid-call synthetic control places the same factual answer after an explicit same-paragraph D04 Person 0 speech attribution: the actual turn then completes with one offline narrator call and the same activated dictionary. This isolates the attribution boundary; it does not replace, rescore or repair the live failed turn.

The audit independently reconstructs access from original context and retrieval, never dictionary data. Primary attribution is **E: existing narrator/audit attribution boundary**, not proven A/B/C representation corruption or D caching failure. The production audit did request reconciliation. An additional **F: evaluation instrumentation** problem occurs first: the evaluation apply observer assumes every request has a registered narrator pack, but revision requests are unannotated. It dereferences missing metadata and fails before reaching the no-paid-reroll stream guard. This explains why the lifecycle has one stream invocation, not two. Either way, the required actual delivered next turn was not achieved; the run cannot close D-04.

The frozen B4 requirement was also stricter than existing original renderer semantics: the original private-canon contract allows only the authorized holder to voice the fact if they choose to reveal it. Maren is that holder. Its unsolicited disclosure remains **FAIL under the frozen criterion**; the criterion is not rewritten after seeing the result. Primary attribution is **F, test design**. It is unsafe to label this a proven V2 wrong-holder leak.

No production fix or semantic rerun was made. A separate targeted pass should isolate paragraph-attribution auditing and repair evaluation recording/annotation handling, then define a privacy probe consistent with holder-disclosure semantics *before* freezing a new run. C1's unsupported page placement also remains recorded, without being promoted into an established compaction root cause. No new regression test was added because no production behavior was changed; the exact offline reproduction and diagnostics are preserved for that targeted pass.

## Recorder failure, cost and latency

The first A1 request returned HTTP 200. Its asynchronous response clone rejected on transport cleanup; because the rejection handler was only attached at final audit flush, Node terminated before result persistence. This is a recorder failure, not a demonstrated OpenRouter transport/model error. It remains a counted paid attempt with **unknown output, cost and latency**. The recovery runner handles audit rejection immediately and keeps partial raw capture; it used only the remaining frozen requests and unchanged production adapter. No A1 replacement or ambiguity extra was purchased.

All remaining nine provider generations completed through production `MiniMaxNarratorProvider`, provider reported as **Z.AI**, with HTTP 200. No transport retry, provider fallback or paid semantic reroll occurred. There were **10 paid narrator attempts**, within the 12-call cap. Total **reported** OpenRouter `usage.cost` is **$0.03938460 from 9 calls**. This is not the complete billed cost: A1 remains unreported. Compressor cost is zero.

Observed narrator latency across nine completed calls: **mean 3.385 s / median 3.054 s**. A1 is excluded because its timing was lost. Raw-audit flush is outside narrator timing.

| Call | HTTP / provider | Prompt tokens | Completion tokens | Latency ms | Reported cost USD |
| --- | --- | ---: | ---: | ---: | ---: |
| A1 | 200 / unassessed | unreported | unreported | unreported | unreported |
| A2 | 200 / Z.AI success | 4351 | 104 | 3054.49 | 0.00654900 |
| B1 | 200 / Z.AI success | 2915 | 66 | 2326.54 | 0.00247444 |
| B2 | 200 / Z.AI success | 2912 | 87 | 2664.38 | 0.00256264 |
| B3 | 200 / Z.AI success | 2921 | 102 | 2840.78 | 0.00132796 |
| B4 | 200 / Z.AI success | 2912 | 122 | 2893.13 | 0.00140336 |
| C1 | 200 / Z.AI success | 10246 | 138 | 3272.46 | 0.01137656 |
| C2 | 200 / Z.AI success | 10240 | 130 | 3086.85 | 0.00338032 |
| C3 | 200 / Z.AI success | 10241 | 364 | 6614.46 | 0.00441132 |
| E2E | 200 / Z.AI success | 9481 | 148 | 3709.18 | 0.00589900 |

## Final validation and verdict

Final post-live checks passed: **typecheck PASS; 1,826 tests passed, 0 failed, the same 4 accepted TODO (1,830 total); playthrough 25/25**. Logs are preserved under ignored final-live storage. `git diff --check` is clean. No production prompt/schema/renderer/policy changes were made during or after generation.

**D-04 CLOSED: NO.** The 9/10 PASS threshold is not met and the actual player turn is not delivered. Compaction/cache/authority isolation alone cannot average away the failed closure gate. Production implementation remains V2, compressor remains UNSET, and there is no closure commit or main push.
