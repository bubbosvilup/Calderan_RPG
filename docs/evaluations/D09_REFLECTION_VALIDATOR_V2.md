# D-09 Reflection Validator V2

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
