# D-09 final matched narration ablation

Date: 2026-10-05 (Europe/Rome). **D-09: SOAK PENDING. REFLECTION_USEFULNESS_CONCERN. BENEFIT NOT DEMONSTRATED.**

The bounded experiment produced one useful production reflection, normal persistence and later full-text packing, and completed one matched pair with a frozen blind model review. The reviewer preferred WITHOUT. No closure, tuning, automatic rerun, production change, D-25 repair or unrelated debt change follows.

## SETUP

Classification: **DEVELOPMENT-RICH CONTROLLED GAMEPLAY**, explicitly designed rather than organic. The authored `data/` world and normal `createProductionDeps` ? `GameSession.fromCampaign` ? `submitPlayerInput` ? production finalization/maintenance path were used. Campaign `d09_final_matched` began at Heartstone F1 with Nicco and Iris, an explicitly created disposable campaign resident, not authored canon. Setup only established location and household membership; there were no seeded reflections, relationships or contracts. Initial history contains only joining.

Production `src/` and `data/` hashes match the pre-run source freeze. Models, providers, prompts, schemas, V2.3-CVC-E1, CVC, trigger, retrieval, packing, controller, extractor and token budgets remained unchanged. Narrator: `z-ai/glm-5.2`; controller/extractor/reflection: existing Qwen configuration, reflection `qwen/qwen3.8-flash` on Alibaba. Prior report [D09_FINAL_CAMPAIGN_SOAK_AND_ABLATION.md](D09_FINAL_CAMPAIGN_SOAK_AND_ABLATION.md) is preserved: its count notes are not useful evidence and its run did not establish narration benefit.

## CONTROLLED DEVELOPMENT

Eleven normal player turns finalized, in one location, with **no player movement commands or NPC movement requests**. Turns 2/4 initially declared two semicolon-separated rules, but delivered prose did not establish adoption and the controller did not persist them. Conversation alone did not become invented development authority.

After completed turn 8, the process was interrupted before another request dispatched and resumed from the exact saved after-state. The adaptation was recorded before further calls: remaining turns 9/10 explicitly declared and adopted the rules through ordinary player wording. This was a continuation of the same campaign within the original 12-turn maximum, not a second soak or state edit. Rules persisted at revisions 13/15. Turn 10 triggered reflection normally. Turn 11 asked: ?Iris, I have been talking for a while. What would you like to happen next in our conversation?? It did not repeat the reflection or its operational wording. No turn 12 was needed.

## QUALIFYING REFLECTION

Claim family: `environmental_shared_rule_text`. Useful: **YES, potential later meaning**, independently of the negative causal result. It preserves the substantive no-explanation / lower-voices practice, rather than merely counting rules.

Note ID: `r17_shared_motif_1`; source revision **16**, persisted revision **17**; format 1, semantic version `V2.3-CVC-E1`, confidence high.

> Household rules added at revisions 13?15 share this exact recorded text: ?A quiet-break request needs no explanation and is answered by lowering voices.?.

Evidence refs: `npcmem:campaign_character_iris:history:r13.0` and `npcmem:campaign_character_iris:history:r15.0`. Proposal: shared exact segment, household `campaign_household_heartstone`, anchor r13.0, segment index 1, occurrence count 2. Exact proposal, source events, stored note and deterministic validation are in `qualifying-reflection.json` and `reflection-validation-and-persistence.json`.

## PERSISTENCE

**PASS.** One live structured proposal was accepted; the normal `record_reflection` maintenance path committed one atomic revision. Offline replay through unchanged production parsing, wire/canonical/CVC/semantic validation matches the persisted typed proposal and exact text. Non-reflection domains match the pre-provider captured state. Zero duplicate writes, zero stale skips, zero manual memory edits. No campaign Save was invoked; snapshots are evidence artifacts.

## LATER RETRIEVAL

**PASS.** Turn 11, pre-narration revision 17, selected the eligible note through normal NPC+ Tier B production packing. The full rendered text, not only its label, appears in the normal narrator body. A pause/quiet-preference interaction in the same household is relevant to the shared quiet-break practice. Ordinary rule/current-state sources remained present in both variants; this is a possible reason the additional synthesis provided little value.

## FROZEN TURN

`case-11-freeze.json` captures the exact campaign state/revision, NarrativeContext, recent conversation, selected note, full narrator system/user messages, model, provider routing and generation settings before execution. `hashes.json` covers these inputs. Temperature and seed were omitted exactly as in production; no unsupported seed was added. Stochastic variance remains a limitation.

Request 24 was saved then **locally suppressed before network dispatch** by the evidence interceptor. The unchanged production retry sent request 25, whose body hash matches request 24 byte-equivalently, and finalized the normal later-use turn. Thus the interceptor caused an observable local retry, not a paid missing receipt, state mutation or provider failure. The A/B calls below use the saved revision-17 request, not the finalized revision-18 state. This instrumentation limitation is retained explicitly.

## ABLATION

**One matched pair: one WITH and one WITHOUT**, two narrator calls total, in randomized dispatch order WITHOUT then WITH. The exact frozen request was used. WITHOUT removes only the targeted ` | reflection: shared motif "?"` entry. Every other message byte and request field is identical, verified by assertions and `body-diff.json`. Canon, current state, recent conversation, ordinary retrieval, NPC state, scene data and all generation settings remain intact. The narrator was not told an experiment was occurring. No new generation parameter was used.

## BLIND REVIEW

Reviewer: paid **MODEL AGENT, NOT HUMAN**, Qwen/Alibaba. Random labels X/Y were generated before review; the review request contains anonymous outputs, prior delivered play, player input and rubric, with no assignment key. `case-11-blind-review-frozen.json` was written with `assignment_revealed: false` before the revealed result.

All dimensions use 0?3; dimensions 8/9 are costs, lower better.

| Dimension | X | Y |
|---|---:|---:|
| Factual continuity | 3 | 2 |
| Character continuity | 2 | 3 |
| Relationship continuity | 2 | 3 |
| Accumulated-development use | 1 | 3 |
| Contradiction avoidance | 3 | 2 |
| Grounded specificity | 2 | 3 |
| Narrative usefulness | 1 | 3 |
| Unnecessary repetition (lower better) | 2 | 1 |
| Unsupported invention (lower better) | 0 | 1 |

Frozen verdict: **Y**, material difference **YES**. Reviewer rationale: Y gives Iris a concrete next conversational activity; X mostly continues the existing quiet-dialogue loop. The reviewer also flags Y's newly standing posture. This is a preference for WITHOUT, not evidence of WITH benefit.

## ASSIGNMENT REVEAL

**X = WITH; Y = WITHOUT.** Utility totals (dimensions 1?7 minus dimensions 8?9): **WITH 12; WITHOUT 17**. The original result's raw sums are 16/21; those sums include adverse costs and are retained only for transparency, not called higher-is-better utility. Both scoring methods favor WITHOUT here. Assignment reveal references the frozen review hash. No further A/B or review was run.

## AUTHORITATIVE GROUNDING

The reflection itself is factual: both distinct state-verified rule events at revisions 13/15 contain the exact clause, with matching rule identity, created revision and immutable text. It is historical shared wording, not proof of NPC authorship, psychology or current policy by itself. Both rules remain in the frozen state; no stale fact, role leakage or unsupported inference is present in the reflection.

WITH says Iris would rather Nicco not fill all the quiet, then suggests seeing what is here without explaining it. This is compatible with earlier dialogue, but no specific accumulated no-explanation/lowering-voices benefit can be identified. **Grounded material WITH benefit: NO.** WITHOUT suggests seeing more of the floor or being told about upstairs; these are proposals, not executed inter-location movement. D-25 is neither exercised nor made a prerequisite.

Review limits are explicit: X does not actually say Iris remains seated, despite the review's claim; Y's proposal is character agency, not proof of a persisted relationship trajectory. WITH introduces folded blankets; WITHOUT introduces standing/cabinet staging. Those incidental details are not supported by the reflection, and no claim that reflection caused them is justified by a single stochastic pair. The favorable WITHOUT result is not a production quality certification.

## COMPRESSION VALUE

Existing UTF-8 bytes/4 estimator: packed reflection entry **48 approximate tokens**; two minimal raw authoritative rule segments with revision labels **55 tokens**. **POSITIVE, modest**, for representing both recorded occurrences. Full serialized source records are not the baseline. This is supporting byte-size evidence, not demonstrated narration benefit; abbreviated references or different source formatting could narrow this seven-token difference.

## SAFETY

Production source freeze PASS. All 11 before/after player locations are `heartstone_f1`; zero characters moved, zero authoritative movement divergences, zero relevant integrity bug-stop. No reflection-caused error, duplicate write or stale skip was observed. New staging in A/B is reported separately and does not change campaign state or invalidate byte-matched inputs. Existing debts remain separate. No hidden reasoning or credentials are stored; receipts filter reasoning fields.

Receipted cost only:

| Role | Receipted calls | USD |
|---|---:|---:|
| Gameplay narrator (includes normal revision call) | 12 | 0.029574040 |
| Controller | 11 | 0.003116858 |
| Extractor | 2 | 0.000330968 |
| Reflection | 1 | 0.000201752 |
| Ablation narrator | 2 | 0.004102320 |
| Blind reviewer | 1 | 0.000650360 |
| Total | 29 | **0.037976298** |

All dispatched calls have retained usage/cost receipts. Local request 24 was not dispatched and has no billing. Per-call and per-role latency are in `ledger.json` / `cost-latency.json`; reflection latency approximately 4,402 ms.

Fresh required tests: `npm run typecheck` PASS; `npm test` **2,008 passed, 0 failures, 4 existing TODOs** (2,012 total); `npm run test:playthrough` **25/25**. Existing TODOs concern phantom transfer from a group pronoun, condition attribution by first name, price over-redaction without legal state, and missed receipt after a fronted adverbial. Logs and accounting retained under the artifact directory.

## CLOSURE DECISION

| Gate | Result |
|---|---|
| Useful production reflection | PASS |
| Normal persistence | PASS |
| Later full-text retrieval/packing | PASS |
| Genuinely relevant later scene | PASS |
| Matched A/B | PASS |
| Blind review frozen before reveal | PASS |
| WITH materially better | **FAIL ? WITHOUT wins** |
| Authoritatively grounded material benefit | **FAIL ? not demonstrated** |
| No reflection-caused factual/stale/unsupported error | PASS for observed chain |
| Production safety | PASS with disclosed interceptor retry |

**D-09 remains SOAK PENDING; REFLECTION_USEFULNESS_CONCERN.** No automatic rerun or redesign. DEBT_REGISTER updated only to record this outcome; all prior qualification conclusions remain intact. No unrelated debt closes.

Artifacts: `saves/d09-final-matched-ablation/` includes initial/adapted plans, source freeze, initial/resumed runner copies, snapshots/turn traces, structured proposal/persistence validation, retrieval/frozen turn, matched bodies/diff/hashes, filtered receipts, anonymous packet, frozen blind review, assignment reveal, grounding/compression/safety/cost, tests and decision freeze. Evidence scripts are under `scripts/`. Commits remain local on main; **DO NOT PUSH**.
