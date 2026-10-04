# D-09 final campaign soak and narration ablation

Date: 2026-10-05. **SOAK STOPPED / INSUFFICIENT. D-09 remains SOAK PENDING.**

The requested bug-stop rule was activated after confirming delivered narration diverged from authoritative movement state. No matched ablation was performed and no material narration benefit is claimed. Production reflection integration and its previous qualification evidence remain unchanged.

## Campaign setup

This run used the actual player-facing application path: `createProductionDeps` → `GameSession.fromCampaign` → `submitPlayerInput` → production `TurnCoordinator` → delivered finalized narration → normal mannerism extraction → structured reflection maintenance. All providers were live, with their existing production defaults: GLM 5.2 narrator, Qwen controller/extractor and qualified Qwen/Alibaba reflection. No fixture world or stub narrator/controller was used.

The authored canonical world was loaded from `data/`. A disposable new Heartstone household scenario began on the observation floor, F1, with Nicco and two explicitly created campaign residents, Iris and Dain. Neither resident was represented as authored canon. Setup established location and household membership only; neither had a seeded relationship, contract, development trajectory or reflection. Baseline premium history contains only household joining. All subsequent state changes came through normal player input and production finalization. No direct command injection or reflection-memory editing occurred during play. No manual campaign Save was invoked; artifacts are evidence snapshots, not automatic campaign saves.

## Gameplay classification and turn range

**DEVELOPMENT-RICH CONTROLLED GAMEPLAY**, not organic play. The deliberately designed, pre-frozen 20-turn sequence covered offers of help, privacy, household arrangements, disagreement, rest and optional changes of floor. Intended relationship/movement development did not materialize as persistent relationship or NPC-movement trajectories. The recorded premium developments were joining plus three household rule additions. Conversational nuance alone was not promoted into invented relationship authority.

Nineteen turns finalized successfully according to the application. Turn 20's initial narrator request was interrupted when the active process was stopped. The first confirmed narration/state divergence occurred in turn 6; continuation from that point is retained for inspection but does not count as valid closure evidence. The process advanced while evidence was inspected; this accounts for the difference between the first offending turn and the eventual stop point.

The plan, review rubric, source freeze and proposed later-use turns 17/20 were recorded before paid gameplay. No model, prompt, schema, wire, trigger, retrieval weight, packing or token-budget tuning occurred after outputs were seen. Original integration smoke was not rerun.

## Reflection triggers and accepted notes

| Turn | Character | Source revision | Persisted revision | Accepted | Rejected |
|---|---|---:|---:|---:|---:|
| 10 | Dain | 16 | 17 | 1 | 1 |
| 11 | Iris | 18 | 19 | 1 | 1 |

Both accepted claims were the qualified `environmental_motif` family: two recorded `rule_added` events in the Heartstone household. Each result's other proposal was rejected as `authority_restatement`. There were **2 logical / 2 physical reflection calls**, **2 accepted / 2 rejected proposals**, **0 valid-empty results**, **0 retries**, **0 reflection failures** and **0 stale skips**.

The deterministic stored texts were:

> The household recorded 2 rule additions; this is environmental context, not Dain's act.

> The household recorded 2 rule additions; this is environmental context, not Iris's act.

Both notes synthesize the same underlying household events. Two stored notes therefore do not constitute two independent useful narrative cases. They preserve a historical count, not the specific meaning of the privacy/quiet-break arrangements, NPC authorship or a relationship trajectory. No reinterpretation of earlier E/F environmental qualification is made.

Each note retains format version 1, semantic version `V2.3-CVC-E1`, its captured source revision, exact typed proposal and original evidence refs. Validation/persistence artifacts record every proposal, semantic reason, source event, deterministic text, persistence revision, receipt cost and latency.

## Persistence

**PASS for observed reflection operations.** Both accepted notes persisted through the normal application maintenance path, each in one separate atomic reflection revision. Exact replay of the live receipts through unchanged production wire/canonical/CVC/semantic validation matches stored proposal/text. All non-reflection campaign domains match the snapshot captured immediately before the respective provider request, after extractor maintenance. No partial batch, duplicate write, stale write or manual disk-save was observed.

## Later retrieval and packing

Normal packing retained compact reflection tokens for both characters on multiple later turns. Full rendered note text is distinguished from those tokens:

| Note | Later full-text narrator request | Receipt/output status |
|---|---|---|
| Dain, `r17_shared_motif_1` | Turn 12, physical request 29 | Receipt retained; turn finalized |
| Dain, `r17_shared_motif_1` | Turn 20, physical request 46 | Request retained; interrupted, no receipt |
| Iris, `r19_shared_motif_1` | Turn 20, physical request 46 | Request retained; interrupted, no receipt |

Thus **2 notes were later selected as full text into 2 distinct narrator requests**; only **1 full-text request has a completed receipt**. Iris has no completed full-text later-use narration in this run. Compact label exposure is not treated as equivalent to receiving the full reflection synthesis. Request-body hashes, note IDs, source revisions and exact context sections are recorded.

Turn 17 did not contain full note text and was not frozen as a qualifying matched case. Turn 20 did contain both notes and its exact pre-narration state, revision 27, normal request body, `NarrativeContext`, recent conversation, routing and default randomness settings were frozen before dispatch. That turn did not finish, and no causal usefulness claim follows from the frozen request alone.

## Ablation method and blind review

The predeclared method was to generate a small matched A/B pair from the same frozen normal-production body, removing only the targeted packed reflection section in the ablation. Canon, current state, ordinary history, unrelated retrieval, routing and output budget would remain identical. Presentation was to be randomized and reviewed by a **model agent, NOT HUMAN**, against nine bounded 0–3 dimensions, with scores frozen before assignment reveal.

**Execution: NOT RUN. Matched pairs: 0. WITH score: N/A. WITHOUT score: N/A. Winner: N/A. Material difference: NOT DEMONSTRATED.** The mandatory bug stop occurred before any A/B generation or blind-review call. No assignment was revealed and no blind score was fabricated. The rubric and explicit not-run record are retained. No post-stop paid request was dispatched.

## Authoritative source check

The reflection claims' two additions resolve to revisions 5 and 15 and the exact then-recorded household rules. Offline production validation confirms their counts and deterministic rendering. The historical notes do not assert NPC authorship. A third rule was later added; the old notes are not evidence that the current household has only two rules. No reflection-caused factual distortion was observed in completed later full-text narration, but a matched causal/source check cannot be claimed without an A/B pair.

The stop-triggering independent mismatch is concrete:

- Turn ID: `d09_final_campaign:r9:t6`.
- Input begins: “I go down the spiral stairs to the Heartstone living floor.”
- Delivered prose says “Nicco descended” and describes Dain following to LR.
- Authoritative player location remains `heartstone_f1` before and after; no move committed, no NPC moved, and the proposed `move_character` was rejected.
- Offline replay of `playerIntent` for that exact input yields no runtime movement command. The natural wording was not recognized as authoritative movement while departure prose survived the audit.

This reproduces the already documented **D-25 narration/state divergence in unrecognized movement wording**. It predates both reflection generations and is not a reflection-caused failure. No D-25 repair, movement-grammar expansion or production change was attempted. D-25 remains separate debt, and its status was not changed. The user-mandated stop invalidates this run for closure; it does not mean D-25 must be closed as a new prerequisite to D-09.

## Compression value

Using the existing UTF-8 bytes/4 ceiling estimator, each packed note entry is approximately **26 tokens**. The full cited structured evidence records are approximately **261 tokens for Dain / 358 for Iris**, but comparing to those complete payloads overstates equivalent-information savings: the notes discard rule wording and retain only a count. The minimum corresponding raw-event count representation (`r5: rule_added; r15: rule_added`) is approximately **8 tokens**.

The note is shorter than full event payloads but **meaningful compression value was not demonstrated**. It does not transfer the nuanced content of the underlying arrangements or supply a proven narrative continuity benefit. These are approximate engineering estimates, not billed tokenizer counts or an optimization target.

## Cost and latency

| Role | Receipted physical calls | Reported USD cost |
|---|---:|---:|
| Narrator | 21 | 0.084431200 |
| Controller | 19 | 0.006132084 |
| Extractor | 3 | 0.000841268 |
| Reflection | 2 | 0.000444802 |
| Ablation / blind reviewer | 0 / 0 | 0 |
| Total with receipts | 45 | **0.091849354** |

Physical request 46, the turn-20 narrator call, was initiated but has no retained completion receipt. Its final response and billing are unknown; the total above is reported receipted cost, not a guaranteed final account charge. Reflection receipt latencies were **4,791.78 ms / 4,115.96 ms**. Per-role latency/token usage and retrieval/context sizes are retained in the raw ledger and turn traces. No attempt was made to optimize the run.

## Safety and tests

Qualified production sources remained unchanged throughout the run and offline analysis. Reflection persistence safety passed; overall narration continuity did not pass the bug-stop requirement. No reflection-caused rollback, player-turn consumption, duplicate write or stale skip was observed. The existing production extractor order/configuration was preserved. D-17/D-19/D-20/D-26 were not changed or folded into the closure decision.

Fresh checks after the stop:

- `npm run typecheck`: PASS.
- `npm test`: **2,008 passed, 0 failures, existing 4 TODOs** (2,012 total).
- `npm run test:playthrough`: **25/25 passed**.
- Credential scan: PASS. No authentication headers, credentials or hidden reasoning are stored in artifacts.

The existing tests passing does not erase the captured D-25 live divergence. No production bug fix or new semantic evaluation was introduced in this evidence-only task.

## Limitations and closure decision

| Required gate | Result |
|---|---|
| Accepted production reflection | PASS, two environmental-count notes |
| Normal atomic persistence | PASS |
| Later production packing / narrator request | PASS with limitations: one completed full-text request, one interrupted request |
| Genuinely meaningful later scene/memory | NOT ESTABLISHED |
| Matched ablation | NOT RUN |
| Blind material WITH benefit | NOT DEMONSTRATED |
| Authoritatively grounded improvement | NOT DEMONSTRATED; stored counts themselves are grounded |
| No reflection-caused error | None observed; causal experiment absent |
| Stable overall soak | FAIL / STOPPED for the turn-6 D-25 reproduction |

**D-09: SOAK PENDING. CLOSED: NO.** The exact remaining D-09 evidence gap is a valid matched later-use experiment demonstrating material, authoritatively grounded narration benefit. This stopped run cannot satisfy it. No tie, ablation winner or reflection-semantic failure is inferred from an experiment that did not run.

## Artifacts and local commits

Artifacts: `saves/d09-final-campaign-soak/`, including the pre-run plan/source freeze, baseline and completed-turn snapshots, turn IDs/revisions, redacted request bodies, reasoning-filtered receipts, exact reflection validation/persistence replay, retrieval/compression traces, turn-20 request freeze, stopped-bug reproduction, explicit not-run blind review, source comparison, cost/latency, fresh test logs and decision freeze.

The reproducible runner and offline analyzer are under `scripts/`. The started marker prevents an accidental paid rerun. The evidence run was stopped, not silently resumed or restarted under a changed plan. Commits remain local on `main`; **DO NOT PUSH** is preserved.
