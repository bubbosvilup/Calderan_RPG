# D-04 targeted final closure

2026-10-03. **D-04 CLOSED.** The corrected private-scope probe passes and the real automatic-maintenance / next-player-turn lifecycle now delivers grounded narration with a clean audit and a safe commit. Production compaction remains `d04-lossless-grouping-v2`, policy `d04-watermarks-v2`; **no LLM compressor is used and `CONTEXT_COMPRESSOR_MODEL` is intentionally unset**.

Production narrator is exactly `z-ai/glm-5.2`, pinned `z-ai/fp8`, fallbacks disabled, reasoning disabled, 512 output tokens. Production controller remains `qwen/qwen3.8-flash`. The lifecycle uses the same unpaid deterministic no-command controller spy as the earlier evaluation; no controller/compressor bakeoff or paid controller/compressor call occurred. This verifies original controller authority inputs, not live controller-model behavior. D-05/D-06 remain unchanged.

## Earlier blockers and targeted production fix

The [original live evaluation](D04_FINAL_LIVE_CLOSURE.md) remains historical evidence, with its original scores, missing A1 recording and questionable C1 page placement retained. Its factual E2E answer failed because dialogue attribution reset at a paragraph break. Its B4 rule also rejected disclosure by the correctly authorized private holder, although existing semantics permit holder disclosure. V2 maintenance, cache freshness, authority separation and exact source reconstruction were not the demonstrated causes.

The production change is confined to the shared `dialogueFocused` attribution parser in `src/turn/prompt-builder.ts`, also used by the audit. An immediately following leading quotation can inherit a known NPC's unambiguous delivery paragraph. The preceding paragraph must be quote-free, lead with that known NPC, end with the same subject and contain a syntactically connected delivery cue. Mentioning another present character/background person, negated speech, pronoun-only preludes and player speech cannot seed continuation. Unrelated paragraphs and new exchanges clear it. Explicit attribution in the quoted paragraph wins.

The first new E2E generation revealed another instance of the same class: a second quotation followed a neutral pause sentence within the same paragraph. Human review found the answer grounded, while the audit treated the continuation as an unattributed speaker and emitted `private_player_fact`. Its failed delivery is retained. The parser now preserves the established speaker through a tightly bounded non-person pause/silence/beat sentence *within the paragraph*. Arbitrary narrative, another character, or a new paragraph cannot use that rule. Both saved real drafts pass exact offline replay after this fix; no model call or prompt hint was needed for those replays.

No grouping eligibility, dictionary/schema/renderer, watermarks, target percentages, controller authority inputs, narrator system/task prompt or compressor configuration changed. Protected V2/production file hashes match the original freeze. Privacy and E2E generation requests match the earlier requests byte-for-byte, including the actual E2E request hash `ebd1fdb9cdde30056925012942c6310f64217c9466ff348ae9e9a3ace6ad7640`. The parser change affects safely attributed dialogue continuity and audit decisions, not generation instructions.

## Evaluation instrumentation

`observeLosslessApply` treats missing narrator-pack metadata as `source_hash: null`, delegates to production apply and measures the request without forcing a candidate. Revision requests no longer crash the observer. The original draft request remains the measured next-turn request even if a revision is attempted. Diagnostics now record actual audit/commit outcomes and campaign-state equality.

Response-clone rejection has an immediate handler, preventing transport cleanup from terminating the recorder before separately persisted generation results/accounting. Raw narrative/provider metadata are stored independently of best-effort HTTP-clone capture. The two earlier recording limitations are fixed; the earlier A1 output/cost remain unavailable and are not invented or retrospectively rescored.

The targeted runner has a persistent one-run marker, a three-attempt hard cap and a stream guard that refuses automatic paid reconciliation. The first E2E audit attempted a second stream request, but the guard rejected it before transport: that attempt bought **one**, not two narrator calls. The clarification marker prevents repeating the third call, and accounting resumes from the two already purchased calls. The first two results and both freeze files remain intact.

## Corrected privacy contract, frozen before generation

The stimulus still asks Brenna about Ironbound, using the existing B source and production-selected **expanded** layout (1,486 estimated message tokens). Only the evaluation rule changes: non-holders cannot use or imply the private fact; only Maren may disclose it in her own voice; voluntary holder disclosure is allowed; narration cannot independently expose it or silently make it globally known. No new lore, private knowledge grants, Gerome speech or dictionary mechanics are allowed.

The observed result is **PASS**: Brenna declines knowledge; Maren supplies no fact; no narrator/non-holder reveals the private guild information or asserts global knowledge. Offline tests additionally prove that Maren's voluntary disclosure is allowed and Brenna/narration disclosure remains rejected.

## Offline coverage and freezes

**18 new deterministic regressions** cover adjacent-paragraph attribution/auditing, unrelated paragraph reset, explicit speaker override, negated/indirect/ambiguous/player preludes, exchange boundaries, several neutral within-paragraph beats, ordinary/other-person interruption, unannotated revision observation, immediate clone-error handling, the three-call cap, permitted holder disclosure and rejection of non-holder/globalized private facts.

Before the initial two paid calls: typecheck PASS; **1,840 passed / 0 failed / 4 accepted TODO / 1,844 total**; playthrough **25/25**. The saved original E2E draft delivered with zero audit issues in offline rehearsal.

After resolving the within-paragraph ambiguity and before the third call: typecheck PASS; **1,844 passed / 0 failed / the same 4 accepted TODO / 1,848 total**; playthrough **25/25**. Offline replay of both real E2E drafts delivered with zero audit issues. No production fix followed the successful third call.

Initial freeze SHA-256: `7fc12669817cea4438a6270ffdfb246f7c4c5702cbe5ceecce7d5cea7da5a559`. Clarification freeze SHA-256: `cc39c75a56f4bd04e343937578ba304399d369af733e26359981ad5a2a81f398`. The latter records the same privacy criteria, acceptance rules, semantic constraints and generation request, with updated attribution-parser/evaluation fingerprints. This is an explicitly permitted ambiguity clarification; the grounded first result is not replaced or hidden, and no semantic criterion is weakened.

Raw requests, generated responses, HTTP statuses, diagnostics, both freezes, exact offline replays and manual reviews are ignored under `saves/d04-context/final-targeted/`. Earlier evidence remains under `saves/d04-context/final-live/`. No raw model outputs are committed. No A1/A2/B1/B2/B3/C1/C2/C3 generation was repeated.

## Three paid calls and live review

| Call | HTTP/provider | Semantic result | Actual delivery / audit result |
| --- | --- | --- | --- |
| Corrected privacy | 200 / Z.AI success | **PASS**: no unauthorized disclosure/globalization; holder rule correct | Direct narrator probe; no campaign mutation |
| First targeted E2E | 200 / Z.AI success | **QUESTIONABLE** human/audit disagreement; required ledger fact and subject correct | **FAILED**: neutral-pause attribution gap triggered audit; paid revision blocked, no commit |
| One permitted E2E clarification | 200 / Z.AI success | **PASS**: correct Ledger 0 Entry 1 keeper/crates answer and scope, no representation leakage | **PASS**: zero audit issues, original draft delivered, safe empty commit |

Only the user-authorized third ambiguity call was added. There were **3 paid narrator calls**, **0 retries**, **0 paid automatic reconciliation calls**, **0 compressor calls**, and no fallback/model switch. No new compaction-specific semantic corruption was observed. No arbitrary 9/10 aggregate gate is applied; the closure criteria are preserved V2 structural correctness, corrected privacy PASS, corrected real E2E PASS, and no new compaction-specific corruption.

| Call | Prompt tokens | Completion tokens | Latency ms | Actual reported cost USD |
| --- | ---: | ---: | ---: | ---: |
| PRIVACY | 2912 | 88 | 3412.32 | 0.00446400 |
| E2E | 9481 | 163 | 4081.70 | 0.00319252 |
| E2E-CLARIFICATION | 9481 | 95 | 3766.61 | 0.01179444 |

Total reported OpenRouter `usage.cost`: **$0.01945096 across all 3 targeted calls**. Mean latency **3.754 s**, median **3.767 s**. This total excludes the historical ten-call run and its unreported A1 cost. Compressor cost is zero.

## Successful real automatic lifecycle

| Check | Result |
| --- | --- |
| Before / above auto threshold | **11,535 tokens / 90.47%** |
| Maintenance layout | **dictionary** |
| After maintenance | **7,297 tokens / 57.23%** |
| Normal watermark / exact target | **65% / 8,287 tokens** |
| Saving | **4,238 tokens / 36.74%** |
| Compressor provider calls | **0** |
| Turn blocking | Preflight `context_too_large`; concurrent submit `turn_in_progress` |
| Narrator calls during compaction | **0** |
| READY recovery | **PASS**, session returns `idle` |
| Compaction changes campaign | **No**, snapshot equality verified |
| Actual next narrator request | **7,324 tokens / 57.44%** |
| Actual request vs measured/frozen request | **Exact hash and budget snapshot match** |
| Freshness | Source matches activated candidate; no stale/wrong activation |
| Controller authority | Original uncompressed ledger facts; no dictionary/group metadata |
| Narrator grounding | Correct person, ledger, entry and keeper/crates fact |
| Audit / reconciliation | **0 issues; no reconciliation needed** |
| Delivered narration | **YES**, original draft |
| Commit | **Attempted and succeeded**, 0 commands, 0 identity promotions |
| State safety | Campaign unchanged after maintenance and after the safe no-op turn |

This uses real GameSession/TurnCoordinator, default policies, actual context construction/retrieval/authorization/audit/commit and production narrator transport. No replacement contextRequest, forced apply, altered watermarks, generation hints or paid controller is used. The lifecycle source is the same detailed ledger fixture as before, with its retained authored dialogue; it is not a rewrite of canonical Case C.

## Residual note and verdict

**C1's questionable physical-ledger placement remains recorded in the original report.** No new evidence attributes it to V2 compaction. It is not erased, converted into PASS or treated as a closure blocker under the requested targeted standard. Generic conservative attribution still fails closed on genuinely ambiguous discourse; no separate residual paragraph-attribution debt was identified in this bounded fix. Broader reconciliation debt D-19 remains unchanged.

Final post-live checks passed: **typecheck PASS; 1,844 passed / 0 failed / the same 4 accepted TODO / 1,848 total; playthrough 25/25**. `git diff --check` is clean. All three actual production request bodies match their freezes; protected V2 fingerprints are unchanged. Historical ten-call evidence and D-05/D-06/D-19 statuses are preserved. Raw responses stay ignored. Closure fixes/evidence use the requested `fix: close d04 context compaction validation` commit on main.

**D-04 CLOSED: YES.** Deterministic lossless narrator-context compaction V2 meets the unchanged target and has passed live automatic maintenance, scope safety and actual grounded narrator delivery. `CONTEXT_COMPRESSOR_MODEL` remains **UNSET BY DESIGN**. No LLM compressor is selected. D-05/D-06 are unchanged.
