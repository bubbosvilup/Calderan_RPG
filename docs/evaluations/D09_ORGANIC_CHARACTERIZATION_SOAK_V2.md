# D-09 organic characterization soak V2

2026-10-04, Europe/Rome. **Raw measurement complete; D-09 remains SOAK PENDING, with a specific follow-up required.** Fifty new production-finalized turns exposed the actual reflection lifecycle but produced no accepted notes or later-use chain. This does not establish that reflection is useless. D-26 remains separately **OPEN — NEEDS MORE SHADOW DATA**: its zero organic findings do not certify portrayal correctness.

Engine closure evidence: **INCOMPLETE**. Human qualitative review: **PENDING**. [Human packet](D09_HUMAN_REVIEW_V2.md), [D-26 appendix](D26_SHADOW_SOAK_APPENDIX.md), [previous soak](D09_ORGANIC_CHARACTERIZATION_SOAK.md).

## Source, production freeze and run design

Baseline production commit: `fefb1e0b4b972c852b447f56f12674ceb194d5f8`. No `src/` or `data/` file changed. Production prompts, models, settings, reflection schema, extraction, learning thresholds, gate, retrieval, relationships, budgeting and compaction remained frozen. Only evaluation/report files and the debt register changed.

Source category **C**: a disposable continuation of the first D-09's saved synthetic current-engine campaign. The local compatible saves were evaluation fixtures, not a real played campaign. The retained user CSV contains prose but no compatible authoritative snapshot; importing biography, possessions, relationships or contracts from inference would invent state. The original `saves/d09-soak/campaign/turn_fixture/save.json` was byte-copied to ignored `saves/d09-soak-v2/source-copy.json` and restored against its unchanged noncanonical fixture world. Original source hash remained unchanged. Four previous finalized turns are not counted again: this report measures **50 new turns**, authority revision 7 → 61, with three recurring NPC+: Brenna, Maren and Gerome.

The new session uses normal production load semantics; earlier raw conversation is not injected as campaign authority. The snapshot preserves the three initial seeded cues and membership developments; no histories, reflections, personality contracts, relationships, candidates or learned mannerisms were fabricated. Brenna's recovering condition/appearance and Gerome's silent stone-construct canon provide the strongest differentiation. The fixture is explicitly not representative of a richly developed real campaign.

Normal player actions add three practical household rules, discuss route knowledge, invite cooperation, make promises and feedback requests, handle owned boots, change scenes and revisit recurring NPCs. Reflection is never directly called by the evaluator: `GameSession` runs normal post-turn maintenance. There are five player scene changes, but no committed NPC movement or relationship development. Fifteen turns take place in an empty hall; 35 turns expose all three NPC cues. The authoritative clock advances only 100 → 105 world minutes. Some player questions mention yesterday/tomorrow, but this does **not** establish multiple elapsed campaign days; time framing and sparse structured change limit the long-form claim.

## Calls and exact cost

| Family | Physical calls | Reported USD |
|---|---:|---:|
| Production narrator, including six existing audit revisions | 56 | 0.184174320 |
| Controller | 50 | 0.012077152 |
| Mannerism extractor | 8 | 0.002257278 |
| Reflection | 3 | 0.000418320 |
| Narrator-only paired ablations | 10 | 0.028441720 |
| Other providers | 0 | 0 |
| **Total** | **127** | **0.227368790** |

Fifty logical production turns finalized once; 66 physical narrator calls including ablations remain below the 100-call bound. There were no prose rerolls or transient retries, six normal audit reconciliation calls, no redactions, and no unmetered request. All costs are summed from provider-reported metadata, not tariff estimates. The 3 USD cap was respected.

Narrator: `z-ai/glm-5.2`, production pinned route, 512 output tokens, reasoning disabled, no sampling overrides. Controller/extractor: `qwen/qwen3.8-flash`. Reflection retains `deepseek/deepseek-v4-flash-0731:nitro`. Initial unpaid preflight could not find the suffixed reflection ID in the model catalog; pricing metadata was resolved from the base entry without changing the request model or routing. OpenRouter documents `:nitro` as a routing alias rather than a separate catalog model ([official documentation](https://openrouter.ai/docs/guides/routing/model-variants/nitro)). No paid generation occurred in that failed preflight.

## Checkpoints and reflection lifecycle

| Checkpoint | Finalized | Reflection calls / accepted notes | Extractor malformed | Gate findings / exposures | Organic spend |
|---|---:|---:|---:|---:|---:|
| B1 | 25 | 3 / 0 | 0 / 4 calls | 0 / 57 | 0.103566124 USD |
| B2 | 50 | 3 / 0 | 0 / 8 calls | 0 / 105 | 0.198927070 USD |

Both checkpoints round-trip authoritative snapshots exactly through the save repository. After B1, lifecycle exposure was nonzero and no severe defect existed; one bounded B2 tranche continued to measure characterization stability and ordinary development. After B2, additional quiet turns could not supply missing note-use evidence, so the run stopped rather than extending to 80 or forcing maintenance.

Each NPC receives 50 evaluator-recorded due checks: **150 checks**, six positive NPC/check observations and three actual calls under the production one-character-per-turn limit. The initial membership plus the first two new rules naturally reach the three-development trigger. Calls occur at T4/Brenna, T5/Gerome and T6/Maren. Source catalogs cite membership revision 2 and rule revisions 8/12; offline replay verifies each captured request catalog exactly matches the generation-time stored state.

| NPC | Result | Rejection / manual draft assessment |
|---|---|---|
| Brenna | Empty proposals, cursor committed | Valid conservative empty response; no note to classify |
| Gerome | One proposal, not accepted | `invalid_shape`: five-word label exceeds the four-word limit. Draft is **REDUNDANT**, restating membership and canonical service |
| Maren | One proposal, not accepted | `invalid_shape`: five-word label. Draft is **MISLEADING**: absence of recorded rule authorship does not establish a no-voice identity |

The rejected proposals never enter authority. Accepted-note quality counts are USEFUL 0, NEUTRAL 0, REDUNDANT 0, MISLEADING 0, HARMFUL 0; rejected-draft assessments are reported separately, not hidden. No notes are created, updated/replaced, rendered later or deeply retrieved. **Useful later-context chains: 0/3 sought.** Reflection ablation is ineligible because no real note was retrieved.

Production legitimately advances the reflection cursor even on empty/rejected proposals. The third household rule leaves one new development after each cursor, below the trigger. Neither conversation, promises, player-only movement nor rejected knowledge proposals create new qualifying NPC developments. This is **accepted-note/later-use underexposure**, with observed proposal-shape failures and sparse subsequent evidence; it is not the “reflection never became due” failure of V1.

## Mannerisms and characterization

| NPC | Cue source / effective state / recognized-by | Slots | Packed exposures | Manually observed cue uses |
|---|---|---:|---:|---|
| Brenna | seeded / emergent / nobody | 1/4 | 35 | Two high-confidence quoted-word pauses, T20/T41; T23 is a boundary case |
| Maren | seeded / emergent / nobody | 1/4 | 35 | 16 explicit or clearly subject-bound head-level movements |
| Gerome | seeded / emergent / nobody | 1/4 | 35 | No gaze-lowering lie cue; generic bows/stillness excluded |

All 105 packed cue exposures remain epistemically emergent; observed/established exposures and state transitions are zero. Deferred owned-cue advancement stays deferred. Eight extraction calls are valid: **0 malformed, 0 provider failures, 0% malformed**. Ten proposed observations are considered; five are rejected for evidence binding and five for personality/inference policy. Accepted observations, new/reinforced candidates and promotions are zero. Final occupancy is three slots out of 12, with no automatic overwrite or duplicated ownership.

The learning sequence ends at 39 with processed sequence 36: four prior sources plus 35 new eligible turns; three final sources remain in the normal incomplete batch. The evaluator does not force a flush or buy an extra extraction. Original learned authority is unchanged.

There is **zero personality pollution from promoted mannerisms**, because none are promoted. This is not proof that every narrated psychological or autobiographical sentence is grounded. No candidate approaches a 3/4/5 threshold, so threshold permissiveness is **not assessable** here. D-10 stays CLOSED.

Primary-agent manual differentiation: Gerome **DISTINCT**, grounded in silence and stone embodiment; Brenna/Maren **PARTIALLY DISTINCT**, grounded in recovery/companionship versus corrective pragmatism. Human dialogue often shares guarded, matter-of-fact phrasing. Maren repeatedly turns questions into semantic corrections, accompanied by head leveling. Cue performance can improve physical recognizability while distorting an answer; that is not automatically an acquired personality. No systematic cross-NPC homogenization caused by learned mannerisms is demonstrated.

Recurring narrator style is tracked separately: quiet/stillness endings, unhurried gestures, weighing questions, guarded practicality and repeated recovery/companionship language. Unsupported phrases about earlier experience remain prose, not reflection or learned mannerism authority. No intimate scene was manufactured or naturally observed; this run cannot assess that domain.

## Paired ablations and human packet

Five frozen states were selected before ablation outputs: T3 practical question, T8 neutral Gerome acknowledgment, T20 natural quoted-word cue, T23 recovery/answer boundary and T25 planning clarification. None was selected because a shadow finding fired. Each pair uses the identical original normal prompt versus only current mannerism cue lines omitted; the shared rule, snapshots, input, other context and conversation remain unchanged. No campaign commits occur.

| Frozen turn | Primary-agent preference | Qualification |
|---|---|---|
| 3 | TIED | Both ordinary replies fit sparse canon |
| 8 | OMITTED | Normal contradicts its own gesture description; generic prose variation, not isolated cue causality |
| 20 | TIED | Both invent an earlier water delivery/hovering; no trustworthy history advantage |
| 23 | TIED | Near-identical response, including head leveling despite cue omission |
| 25 | NORMAL | Better grounding in the departure rule/recovering condition; weak attribution to cues specifically |

Result: **1 normal preference, 3 ties, 1 omission preference**. Review is state-aware primary-agent assessment, not a human blind verdict or statistical result. Retained conversation still contains past cue use, so current omission does not remove all historical cue influence. Reflection pairs: **0**, ineligible. The human packet contains five paired samples plus seven organic samples: **17 passages**, conditions hidden until the answer key; human judgments remain pending.

## D-26, continuity and safety

Organic shadow findings are zero over 105 exposures; see the separate [appendix](D26_SHADOW_SOAK_APPENDIX.md). Manual inspection outside gate output marks T6 ambiguous/LOW and T41 a true conditional-portrayal concern/MODERATE. Those are coverage observations, not retroactively manufactured gate events or evidence of precision. No HIGH issue or pathological measured finding rate occurs.

Three controller commands are rejected. At T5, compound-recipient bridge knowledge proposals fail `other_character_in_quote`; subsequent T19/T27 route recall is weak. There are no retained knowledge-transfer developments to support a reflection chain. This is a continuity/authorization limitation, not harmful reflection influence. Requested boots set-down/pick-up at T13/T16 are narrated without durable item commands; authoritative possession remains carried. Both are nonsevere review findings to investigate separately, without changing production here.

Boots, carried clothing and ring already exist in the authoritative fixture; Brenna's boots are equipped. No new possession is legitimized by reflection or acquisition, and no object-bound cue is promoted. An earlier water delivery in both T20 ablations is ungrounded historical prose and explicitly loses quality credit. Some hearth/window/sleeve/blanket details and autobiographical statements exceed the sparse source. No private sentinel leaks, authority/save corruption, unsupported sexual authority, forced reflection or systematic acquired-personality pollution occurs. These limitations prevent certifying all narration as canonically correct.

## Context cost

Estimates use the existing UTF-8-bytes/4 estimator. “Total” includes message estimate plus 1,970 fixed system-instruction tokens; buffers are not narrated context. NPC+ measurements include its header/shared rule; suffix cost measures just recurrence/recognition metadata. Retrieved payload and reflection costs are zero; retained conversation is already included in total.

| Turn | Total estimate | NPC+ block | Epistemic suffixes | Reflection / retrieved history |
|---|---:|---:|---:|---:|
| 1, early/present | 4,285 | 784 | 33 | 0 / 0 |
| 25, middle/present | 5,311 | 787 | 33 | 0 / 0 |
| 40, late/present | 5,316 | 829 | 33 | 0 / 0 |
| 50, late/empty hall | 4,235 | 509 | 0 | 0 / 0 |

Context is bounded and no compaction/provider change occurs. The lower final cost reflects an empty scene, not improved characterization efficiency. No reflection benefit-per-token can be measured with zero notes.

## Follow-up, artifacts and validation

The [focused follow-up](D09_REFLECTION_EXPOSURE_FOLLOW_UP.md) is open. Before another closure attempt, use a richer compatible played state or genuinely accumulate NPC movement/relationship/contract developments through normal play. Independently examine reflection proposal/schema adherence: two five-word labels were safely rejected. Keep empty-output conservatism and authority validation intact; do not relax policy or repair/retry proposals inside this run. Separately inspect compound-recipient knowledge and requested item-placement coverage. D-09 closure requires actual accepted reflection and later-use evidence, not more silent iterations of this fixture.

Ignored `saves/d09-soak-v2/` contains the source copy, frozen start manifest/pricing, 50 turn records with pre/delivery/post authority, exact request ledgers, checkpoint decisions/saves, reflection rejection replay, metrics, manual review, blind key, verification and ten separate ablation outputs. No credentials are stored. Evaluation scripts refuse paid reruns of started runs. Offline analysis does not call providers.

Validation after all paid work: typecheck PASS; **1,897 tests, 1,893 pass, zero failures, same four accepted TODOs**; **playthrough 25/25**. Source copy/hash and all production fingerprints are unchanged; checkpoint save/load is exact.

**D-09 CLOSED: NO. D-09 requires a specific exposure/schema follow-up and remains SOAK PENDING. D-26 OPEN — NEEDS MORE DATA; not ready for Phase C auto-repair design.** Neither verdict is disguised by the other's dataset.
