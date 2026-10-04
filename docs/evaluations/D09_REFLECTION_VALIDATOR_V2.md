# D-09 Reflection Validator V2

**Final result: HARD GATE FAIL — two useful claims lost. Production defaults and campaign formats unchanged. D-09 SOAK PENDING.** All six old-accepted misleading claims were rejected in the explicit same-claim comparison. The frozen candidate was not edited after dispatch, and no V3 or production adoption was attempted.

## Architecture decision — recorded before implementation

Date: 2026-10-04. Choose **Option B: structured claims plus deterministic rendering**, in an isolated candidate path. Production defaults remain unchanged until a new independent OOS gate succeeds.

Current structural authority: `PremiumHistoryEntry` retains revision/world minute, relationship actor/target/dimension/before/after, condition operations, lifecycle operation and household ID, movement endpoints, legal/transaction facts, and contract field. Contract evidence retains field/quote/revision. Relationship snapshots retain directional dimensions. Rollups retain bounded counts, but lose event order and identity. These are sufficient to validate literal sequences, exact counts, directional transitions, condition additions/removals, lifecycle joins versus rejoins, and simultaneous dimension comparisons. None proves motivation, healing, temperament, or authorship of household rules.

Current `ReflectionEvidence` has refs, kind, display text, event count, strength, involved people, optional episode IDs, and movement-only. Relationship direction/endpoints, precise lifecycle operation, condition operation, and household ownership are exposed to reflection primarily as English. `describeDevelopment()` is display text. Free-prose proposals contain kind/label/text/refs/confidence; label and text can invent meaning. `validateProposals` combines shape, regex content checks, ref existence, coarse event/strength thresholds, lexical contrast, episode recurrence, person checks, and duplicates. Contracts count zero events; a multidimensional snapshot counts one ref. Those proxies explain observed false negatives.

Persistence today: schema-3 campaign snapshots store `ReflectionNote` ID/kind/label/text/refs/confidence/creation/update revisions. Campaign validation checks shape, caps, character-scoped handles and revisions, not semantic truth. `mergeNotes` updates by kind plus label or normalized text, retains ID/creation, drops unresolved refs, then caps by confidence/recency. `reflectAfterTurn` performs a separate revision, drops stale calls, and advances the cursor even for all-rejected output. These behaviors must not be changed in this task. NPC+ Tier B packs at most two free-text notes; Tier C packs one kind/label token. `npcDeepSources` exposes exact JSON notes under stable handles. Current packing/recovery has no structured claim boundary.

| Criterion | Option A: enhanced raw prose | Option B: typed claims/rendering |
| --- | --- | --- |
| Authority safety | Metadata helps, prose still invents meaning | Only closed, validated claim types render |
| Factual errors | Reliable only for parseable wording | Exact numeric/enumerated comparisons |
| Psychology leakage | Cannot cover arbitrary paraphrases safely | No psychology/motivation/free-text claim fields |
| Expression | Broad, unreliable | Bounded factual synthesis and attributed statements |
| Tokens | Smaller outputs; more validator ambiguity | Larger structured output, compact rendered context |
| Migration | Small schema changes | Versioned notes and conservative legacy handling needed |
| Save compatibility | Easy | Candidate leaves saves untouched; adoption needs migration |
| Narrator usefulness | Fluent but potentially false | Less expressive, faithful trajectories/comparisons |
| Provider reliability | Existing tested schema | New frozen schema needs independent validation |
| Scope | Smaller but does not solve leakage | Larger, finite entitlement matrix; chosen |

Candidate scope: public structured evidence collected from authoritative source payloads and snapshots; closed trajectory, comparison, movement, condition, membership, statement-synthesis, and environmental claims. Count, direction, sequence and ownership are validated before rendering. Missing provenance licenses no tension. Owned responsibility-taking actions are not retained by current premium history; do not fabricate a quartermaster control or ship a generic role field. Two independent self-statements may support an attributed stated-role synthesis, never proof of performed duties.

Development regression uses the failed 40-case dataset as **development only**. Old prose is not automatically converted into authoritative semantics: explicit regression annotations preserve the five useful meanings and encode six adversarial claims. Native legacy free-prose proposals cannot pass the V2 schema. Rejection of legacy prose alone is not credited as catching factual errors.

OOS comparison, if development passes: generate once using the candidate structured schema and current DeepSeek transport settings. Native production parsing cannot consume this schema. An explicit comparison adapter renders the same proposed fields without validation into legacy proposal shape and runs the unchanged old validator. This measures validator behavior on a common structured output, not quality/safety of the old free-prose provider. No independent old-model draws and no conversion of old notes are allowed. Review all generated claim objects, including diagnostically extractable malformed envelopes, before candidate outcomes are computed. Bad-catch gate requires actual old-accepted bad proposals; zero such proposals yields insufficient exposure, not a vacuous pass.

Candidate persistence design: version-2 isolated note envelope stores a validated claim, refs, confidence and revisions; text is derived, never independently editable. A future production adoption must validate deserialization against live evidence, prevent stale relationship snapshots from being treated as current, preserve historical trajectories without asserting current state, and leave legacy prose explicitly legacy rather than infer typed fields. Until the OOS gate, no campaign format, cursor, cadence, retrieval policy, D-10, D-26, movement or knowledge system changes.

This initial decision is also retained under ignored raw artifacts.

## Candidate implementation and development gate

Implemented only in `src/dev/reflection-v2.ts`, with no production imports/default changes. The collector reads public `npcDeepSources` exact JSON payloads and directional relationship domains. Structured fields: evidence version/type, subject ID, owner ID or null, revision/world minute or null, stable event ID, and typed authoritative payload. Relationship actors/endpoints, lifecycle operations, condition operations, household IDs, movement endpoints, and self-statement field/quote/revision come from owning engine data. Unknown household authorship stays unknown. Canon and rollups are retained as source context but cannot license exact trajectories when order/identity is missing.

| Evidence | Permitted claims | Not permitted |
| --- | --- | --- |
| Owned relationship changes | Literal contiguous trajectory, equal parallel trajectories | Psychology, motives, causality |
| Owned multidimensional relationship snapshot | Factual simultaneous dimension comparison | Openness, regard, attachment interpretation |
| Condition changes | Ordered add/remove trajectory and recorded episode starts | Healing rate/failure, cause, resilience |
| Membership changes | Exact join/leave/rejoin/migrate sequence/counts | Role or personality |
| Owned movements | Literal contiguous movement trajectory/recurrence | Restlessness, without settling, avoidance |
| Two independent quoted self-statements | Attributed statement synthesis | Performed duties or inferred identity |
| Repeated household-context rules | Explicit environmental context | NPC stance, signature, authorship, role |
| Unknown provenance / canon / aggregate | No new typed claim on their own | Missing information as positive tension |

Eight supported types: relationship_trajectory, relationship_contrast, relationship_parallel, condition_trajectory, membership_trajectory, movement_trajectory, self_statement_synthesis, environmental_motif. There is no generic free personality, role, motive, interpretation or display-text field. Unknown types/additional fields reject. Output is bounded to three proposals, eight evidence refs per proposal; prompt asks for at most two. Source sequences must be contiguous within cited endpoints; chronology uses revisions, never presumed elapsed time. Changes must be subject-owned; multidimensional snapshots supply multiple facts, independent of ref count. Contract-event handles cannot double-count their matching quotes.

Validation exposes separate factual and entitlement findings. Exact count/direction/state/episode/trajectory comparison rejects false fields. Rendered text is generated from validated fields and authoritative attributed quotes; unsafe instruction-like statements and rendering overflow reject. This candidate does not persist into campaign saves; it returns an isolated `format_version: 2` note envelope. `REASON_CODES` lists 16 stable reasons in the tracked freeze file. No LLM validator, embeddings, rewrite or vocabulary expansion was added.

The previous failed 40-case corpus is now DEVELOPMENT ONLY. All 45 native free-prose legacy proposals fail the typed-schema boundary, which is not counted as factual accuracy. Six explicit adversarial counterparts are rejected: missing provenance tension; interpretation field for openness/regard; wrong decline direction; two rejoins for one; movement interpretation field for without settling; one transition for two. Their individual reasons and evidence are retained in `dev-regression.json`.

Five old-accepted useful meanings are preserved: `OOS_condition_4:0`, `OOS_condition_1:0`, `OOS_relationship_5:0`, `OOS_relationship_6:1`, `OOS_tension_3:1`. Each unequal trust/respect trajectory is represented by both a factual dimension comparison and a literal trust trajectory, preserving both components rather than silently dropping the history. The three old-rejected meanings pass under structured counterparts: `OOS_self_statement_6:0` as two attributed independent statements (not an observed role); `OOS_tension_1:0` and `OOS_tension_3:0` as actual simultaneous trust/wariness comparisons. Ref count and lexical “but/while/yet” are not entitlement tests. No claim is made that these original free-text outputs were safely parsed or automatically recovered.

Focused structural tests: nine passing tests covering counts, directions, endpoints, omission of intermediate changes, ownership, episodes, membership identity, multidimensional contrast, independent statements, household context, additional-field leakage, malformed envelopes, and display independence. Actual repeated-duty role control remains unavailable because current premium history does not encode those acts; it is not fabricated or reported passed.

## V2 freeze before constructing new OOS

Source SHA-256: `2a74c0c184c8be3137199cd765a1130d4cb8b694c51da9b56c2b014912cc84a6`.

Schema SHA-256: `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba`.

Prompt SHA-256: `fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09`.

Evidence structure version: **2**. Reason-code SHA-256: `667731f0ea4e39fa8b4bfabe46516ca51fbe150a834a4cc7cc2790db3e60ef20`. Schema changed: **YES**, necessarily to express typed claims. Candidate protocol prompt changes explain the schema, not provider ranking/tuning. Model/routing/reasoning/output budget remain production defaults.

Pre-freeze tests: typecheck PASS; unit/integration 1,902 passed, zero failed, same four TODOs (1,906 total); playthrough 25/25. Candidate design/implementation is committed before new corpus construction. The frozen source must not change during scored validation.

## Context cost estimate

Using project `estimateContextTokens` (ceil UTF-8 bytes / 4), representative condition notes measure current vs candidate packed rendering: one note **29 → 21** estimated tokens; two notes **65 → 46**. The maximum typical Tier B NPC+ displays two notes, so its reflection contribution has the same estimated 19-token reduction in this example; the rest of context is unchanged. This is a microbenchmark of two development examples, not tokenizer-exact usage or an end-to-end packing test. The isolated candidate does not send evidence arrays, revision metadata or validator diagnostics to a narrator. Actual future packing/migration still requires validation if adoption is authorized by a successful OOS gate.

## New independent OOS preregistration

Constructed after candidate commit `eaf4df1`, with source/prompt/schema/compiled hashes checked before construction, dispatch and scoring. The corpus contains **48 requests**, split **24 deterministic fixtures + 24 scripted current-engine scenario checkpoints** (`played_state_evaluation`). All use normal `CampaignState.apply` transitions and production source collection in a noncanonical testing world. **Organic played requests: 0.** The checkpoints are evaluation states, not real user gameplay or organically sampled data. They are serial checkpoints from eight scenarios, so requests within a scenario are correlated, not 48 independent gameplay histories.

Each family has six requests: conditions, relationship trajectories, relationship comparison, self-statements/contracts, membership, movement, environmental context, empty-appropriate. Engine time advances normally between commands; revision and minute provenance are retained. Actual owned-duty actions remain unavailable in premium history and are not fabricated. Each case includes exact request, catalog, legacy catalog, command trace, source label, input-opportunity category, per-request SHA and snapshot SHA. No desired output wording appears in the manifest. All 48 request hashes are unique. Fixture/checkpoint generation includes shared base world/character canon and mechanical patterns; new cases are independent of the 40-case development outputs but not a wholly unseen world or new canonical cast.

OOS manifest SHA-256: `5677beff41564d5d1fbd933dcfe9a61bc6872624e946bc3c42190573aa407e52`.

Before the manifest existed, the builder detected duplicate empty-state requests and stopped without dispatch. Empty checkpoint subjects were diversified using legitimate engine membership before preregistration. This was corpus design before outputs, not a post-dispatch edit. No manifest/request/candidate changes followed dispatch.

## Provider and blind review

Only `deepseek/deepseek-v4-flash-0731:nitro`, through production `OpenRouterClient` with the frozen V2 protocol/schema. Production settings retained: 600 output tokens, 20,000 ms timeout, nonstreaming, `require_parameters: true`, reasoning disabled/excluded. The structured protocol is necessarily part of the candidate change, not a model/provider tuning experiment. No Qwen, provider-ranking arms, quality rerolls or second generations. **48 logical and physical calls, zero retries, cost USD 0.030848064.** All calls have provider cost receipts; no unknown-cost attempts. Routing reported Baidu on the retained responses; no provider pinning change was made.

40 envelopes parsed; seven successful transport responses were malformed; one response failed production transport validation (`invalid_provider_response`, upstream length finish). Two parsed envelopes were empty. Complete proposal objects were diagnostically extracted from every malformed/failed response before review; no envelope was repaired for acceptance. Malformations include extra closing braces/quote, appended prose, and a response containing analysis instead of a conforming envelope. Raw bytes, text, usage, request hashes and cost are retained. A balanced-object diagnostic extractor recovered **96 complete claims**, of which **77** belonged to parsed envelopes. Any remaining incomplete/trailing raw content is retained, never accepted.

The primary agent reviewed all 96 complete objects against actual catalogs before candidate outcomes were computed. Classified totals: USEFUL 37, NEUTRAL 10, REDUNDANT 39, MISLEADING 10, HARMFUL 0; narrator YES only for useful synthesis. This is **agent review, not human and not an independent reviewer**. Validator definitions were known; computed outcomes were hidden. Membership/state restatements and character-irrelevant rule accumulation were not rewarded as neutral solely because true. Review includes citations, subject, complete evidence, classifications, reasons, factual-error flag, and envelope status.

Blind review SHA-256: `17b9bcd6fa7c55617ba57460d8d72fdefc5b4cc197e77e051a56216223aaa59d`.

## Same-output old-versus-V2 comparison

**Native unchanged production validator accepted zero typed proposals**, because its required legacy schema differs. That zero is schema incompatibility, not measured model quality. The following results use an explicit diagnostic comparison layer: render the exact unvalidated proposed fields into legacy kind/label/text/refs/confidence and call the unchanged old validator on the whole batch. The layer does not consult V2 acceptance, replace fields, correct counts, or draw separately. Invalid/malformed envelopes are rejected by both pipelines. Diagnostic objects from them are reviewed but excluded from primary acceptance metrics.

The bridge inherits limitations: it cannot exercise old free-prose psychology leakage because rendering is deterministic, and its type-based labels can cause the old duplicate policy to suppress a second same-type proposal. These results compare validators on one typed provider output, **not** native production reflection quality versus a new provider. Per-proposal old results saved at dispatch are diagnostic; primary scoring uses batch validation including the old duplicate policy. Old shape-reject and bridge outcomes are both retained. No results from malformed-envelope repair are credited.

| Semantic class | Old bridge accepted | V2 accepted |
| --- | ---: | ---: |
| USEFUL | 22 | 28 |
| NEUTRAL | 6 | 7 |
| REDUNDANT | 11 | 4 |
| MISLEADING | 6 | 0 |
| HARMFUL | 0 | 0 |
| Total | 45 | 39 |

Useful lost from old bridge accepted: **2**. Additional useful recovered beyond old bridge: **8**. Bad caught: **6/6 (100%)**. Bad escaped: **0**. Neutral collateral: **0**. Redundant newly rejected: **7**. Higher net useful acceptance does not excuse individual useful losses.

| Source | Old useful / neutral / redundant / misleading / harmful | V2 useful / neutral / redundant / misleading / harmful |
| --- | --- | --- |
| Deterministic fixture | 10 / 2 / 7 / 3 / 0 | 10 / 3 / 3 / 0 / 0 |
| Scripted engine evaluation checkpoint | 12 / 4 / 4 / 3 / 0 | 18 / 4 / 1 / 0 / 0 |

Four diagnostic proposals contained manually identified, deterministically disprovable world/count/path claims; **all four rejected, zero admitted**. Three were in valid envelopes and were rejected by semantic validation; the fourth, invented movement from canon/membership, was already blocked by its malformed envelope. The two invalid statement-handle selections are separately retained as reference/state errors rather than counted as false world facts. This small observed sample is not a claim of exhaustive factual safety.

| Bad old-accepted proposal | Rejection finding |
| --- | --- |
| `V2_fixture_contrast_1_1:0` | Two wariness transitions claimed, only the final transition cited; count/state/trajectory mismatch |
| `V2_fixture_relationship_3_1:0` | Four cited trust changes called three; count mismatch |
| `V2_fixture_self_statement_1_1:0` | Event identities substituted for statement catalog refs; state/reference mismatch |
| `V2_engine_state_relationship_1_1:1` | Missing/none dimension treated as positive contrast; missing positive evidence and inconsistent extra transitions |
| `V2_engine_state_self_statement_1_1:2` | Event identities substituted for statement catalog refs; state/reference mismatch |
| `V2_engine_state_environment_1_3:0` | Membership plus one rule described as two rule additions; wrong evidence entitlement |

## Exact gate failures — no candidate repair

**HARD GATE: FAIL.** Bad catch exceeds 70%, factual false admissions are zero in observed samples, and neutral collateral is zero, but useful lost must equal zero and instead equals **2**.

1. `V2_fixture_relationship_1_1:0`: correct Maren trust trajectory `none → low → moderate`, two increases, cites both matching transitions **plus the confirming relationship snapshot**. Candidate rejects `unsupported_claim_from_evidence` because `requireOnly` demands every ref be a relationship change matching the trajectory. The snapshot is corroboration, not unsupported semantics.
2. `V2_fixture_contrast_1_1:1`: the same correct two-step trust trajectory cites its two trust changes **plus two wariness changes**. Candidate rejects the same reason because additional dimensions are not matching trust transitions. Extra evidence does not make this factual useful trajectory false.

The development controls used narrowly selected refs and therefore did not expose this overblocking. Frozen rules/source were not changed to accept them during scored validation. No V3, second OOS version, reroll, or production adoption was attempted. `oos-collateral.json` retains both complete failure records and their diagnostic evidence.

## Production, compatibility, tests and limitations

Production changed: **NO**. Evaluation-only collector/claim validator/schema/rendering and tests were added. No production caller imports the candidate; reflection model defaults, cadence, cursor, campaign authorities, movement/follow, knowledge, D-10, D-26 and retrieval remain unchanged. No new campaign-persisted format was adopted. Existing saves and free-text notes remain handled by the existing code; no old note was reinterpreted or annotated with fabricated structured claims. Actual migration/load/packing/retrieval and end-to-end narrative benefit are deferred because the gate failed. Candidate `format_version: 2` is an isolated evaluation representation, not a claim that campaign schema version 2 or a new save format was shipped.

Tests: `npm run typecheck` PASS; `npm test` **1,902 passed, zero failures, same four accepted TODOs**; `npm run test:playthrough` **25/25**. Node worker spawning required sandbox escalation after an EPERM; the authorized unsandboxed runs succeeded. Candidate source remained unchanged after these checks and through OOS dispatch/scoring. Evaluation script syntax and deterministic scoring/review hashes were also checked. No test was added for the two newly observed failures during this frozen run; doing so would be development work for a separately authorized revision.

Security: `APIKEY.env` and all raw artifacts under `saves/d09-reflection-v2/` are ignored; no credential file is tracked, and no secrets were printed or included in manifests/logs. Raw artifacts include initial architecture decision, annotated dev regression, structured evidence examples, candidate freeze/schema, all snapshots/command traces/frozen requests, OOS manifest/hash, raw responses/ledger, diagnostic envelopes, frozen blind review, native old/bridge/V2 decisions, collateral, token estimates and test logs. `artifact-hashes.json` records raw file hashes. Raw artifacts remain local/ignored; a checkout cannot reconstruct paid responses without those artifacts.

Limitations: small noncanonical scripted corpus, correlated checkpoints, no actual owned-duty role capability, agent rather than human review, new-schema provider malformations, and bridge comparability limits. V2 substantially improves structural precision in this sample but still overblocks valid claims with additional evidence. Safe adoption must also address stale current-state comparison notes, conservative legacy handling, versioned save validation and bounded narrator integration; those were designed but not shipped.

**D-09 STATUS: SOAK PENDING.** D-04/D-05/D-10 remain CLOSED; D-26 remains OPEN — SHADOW DATA COLLECTION. D-09 is not closed by this work.

Next step: review the two extra-citation false negatives with a human and authorize a separately frozen successor that distinguishes claim-supporting transitions from corroborating/context refs, while preserving exact factual checks. Keep this failed V2 and its OOS outputs intact; do not tune and rescore it as an independent pass.

Git: design commit `ca964f0`; candidate/freeze commit `eaf4df1`; final evaluation/report commit delivered separately. No production-adoption commit. Push only with green tests, ignored credentials and clean working tree.
