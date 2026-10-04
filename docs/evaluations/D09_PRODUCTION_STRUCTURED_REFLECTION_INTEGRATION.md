# D-09 production structured reflection integration

Date: 2026-10-05. Production integration **PASS / COMPLETE**. D-09 **SOAK PENDING**, **not closed**.

This is an integration of the authorized qualified candidate. Prior semantic, citation-visibility, provider-reliability and exposure results remain their original evidence; no semantic OOS or provider qualification was rerun.

## Previous production path

The audit identified these actual integration points before replacement:

| Concern | Previous production implementation |
|---|---|
| Entry and finalized boundary | `src/dev/play.ts` calls `runPlayTurn` in `src/dev/play-turn.ts`. The wrapper publishes/drains the existing `TurnCoordinator.runTurn` iterator, requires a successful `turn_completed`, checks cancellation, then awaits reflection. |
| Trigger | `reflectionDue` in `src/turn/reflection.ts`: active NPC+, at least three developments since its cursor, changed rollup or newly established contract. One due character by default, stable order. Lifecycle developments count; D-17 remains separate. |
| Model/provider | `OpenRouterReflectionProvider`, default `deepseek/deepseek-v4-flash-0731:nitro`; `require_parameters:true`, without Alibaba-only restriction. |
| Prompt/request | Legacy `REFLECTION_SYSTEM`, English evidence summaries and existing note summaries; strict schema over five note kinds containing model-authored `label` and `text`. |
| Parsing/validation | Legacy exact-envelope parsing, `validateProposals` heuristics, evidence checks and `mergeNotes`. Maintenance defaulted to one attempt unless given a retry policy. |
| Persistence/revisions | Separate `record_reflection` campaign command at the captured expected revision; atomically changes reflection notes/cursor and increments revision. Empty and semantically rejected results advance the cursor. Explicit manual Save is separate. |
| Failure/diagnostics | Provider/malformed/stale results skip mutation. `runPlayTurn` catches unexpected maintenance exceptions without reclassifying the published player turn. Safe diagnostics contain counts, revision, timing and token totals. |
| Consumers | `npcPlusFragments`, `packNpcPlus`, `buildTurnContext`, `npcDeepSources`, `recoverNpcContext` consume note kind/label/rendered text and exact recovery payload. Reflection is interpretation, never current-state authority. |

The production turn iterator, publication/cancellation behavior, narrator, controller, extractor and D-26 code were not changed. Existing extractor maintenance remains at its coordinator finalized-turn boundary, before the wrapper starts reflection.

## New production path

`reflectAfterTurn` delegates to `src/turn/structured-reflection-maintenance.ts`. It captures an immutable snapshot/request and a full local validation catalog, builds the visible evidence projection and citation domains, derives the E1 wire schema and calls the reflection adapter. Validation proceeds through exact `JSON.parse`, dynamic wire, canonical E1 uniqueness/schema, CVC visibility, frozen semantic validation and deterministic rendering. The resulting accepted batch is adapted to existing bounded campaign notes and applied in one `record_reflection` command.

All current relationship snapshots remain hidden validation authority. Exact statement records with visible statement-event provenance remain hidden; their verified selectors are admitted through that visible provenance. Hidden current authority still checks historical contrasts. Environmental rule-event text is verified against the captured state; E1 anchors come from eligible exposed events. No hidden validation catalog is sent to the provider.

The wire includes exactly the qualified request-scoped evidence, statement, movement endpoint and E1 anchor domains. Unsupported `uniqueItems` is removed only from provider wire; local canonical uniqueness is mandatory. There is no JSON repair, coercion, fenced-output stripping or first-object salvage.

## Qualified freeze

| Component | SHA-256 |
|---|---|
| V2.3 source | `10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d` |
| CVC source | `fe0986ec9ce684287cc4c5f6e4b3f0de8a88767d61286041bd870e06b5dfca70` |
| E1 source / request-scoped wire | `e5bd6a44a0b77f0f4f5ffffd55d5f2da9fe4c017c04415ecb0a783f4fcc2ff3f` |
| E1 canonical schema | `a2dec6b343d8b8c97cdf33eed0ad9523ae62701cf98c702d60c4f48f6d328efe` |
| E1 prompt | `fc6fbaaae4a85f8eeb85d952a8f99cbdf6fda9701b087eb5e27d7e34352472f4` |

Eight modules were promoted to `src/turn/structured/` with import-path adjustments and a promotion comment only. Original dev sources are untouched. Production tests reverse the import adjustments and compare every promoted source to its frozen original, and compare canonical schema/prompt exactly. A standalone storage schema avoids a campaign-validation runtime import cycle; its equality with the qualified E1 schema is tested. Offline artifact verification checks the hashes above again.

## Provider configuration

| Setting | Production reflection |
|---|---|
| Model | `qwen/qwen3.8-flash` |
| Provider | Alibaba only; response provider must also identify Alibaba |
| Routing | `require_parameters:true`, `only:["alibaba"]`, `order:["alibaba"]`, `allow_fallbacks:false` |
| Output | Strict request-scoped E1 JSON schema; 600 tokens |
| Timeout | At most 20,000 ms per physical call |
| Reasoning | `enabled:false`, `exclude:true` |
| Scheduling | Reflection-only serialization, concurrency 1; launch spacing at least 1,000 ms, completion gap at least 250 ms |
| 429 | Honor Retry-After seconds or HTTP date; fallback cooldown 6,000 / 12,000 ms |
| Attempts | At most 2, technical retries only; same captured revision, input and serialized body/schema |

Configuration overrides cannot switch the reflection model or output budget away from the qualification. Narrator/controller/extractor/D-26 providers are unchanged.

## Wire / canonical / CVC / E1 pipeline

E1 preserves `environmental_shared_rule_text` with `household_id`, `relation=shared_exact_segment`, `anchor_ref`, `segment_index` and `occurrence_count`. The frozen validator verifies exact semicolon-delimited overlap across distinct state-verified rule additions and complete historical intervals. Its renderer quotes exact authoritative text and historical scope. No model-authored topic, motif prose, NPC authorship, personality or motive field was added.

Qualified batch behavior is unchanged: semantically accepted proposals are retained together, rejected proposals retain their reasons, and an empty envelope succeeds. Semantic rejection or valid emptiness never triggers a reroll. Duplicate claims follow the frozen batch validator; canonical duplicate refs fail the whole structural envelope.

## Persistence

New notes retain existing `id`, `kind`, bounded `label`, deterministic `text`, `evidence_refs`, confidence and revision fields. They additionally carry:

```text
structured.format_version = 1
structured.semantic_version = V2.3-CVC-E1
structured.source_revision = captured campaign revision
structured.proposal = exact accepted typed proposal, including original refs
```

This is version 1 of the optional persisted metadata extension; the candidate's internal accepted-note format remains unchanged. Structured note text is bounded at 400 characters to accommodate the frozen renderer; historical unversioned notes retain their 200-character bound.

Claim-family mapping preserves existing packing kinds. A bounded label contains the claim-family token and a deterministic claim hash; distinct accepted typed claims cannot collapse merely because their rendered text matches. A repeated structured claim updates its existing note. New accepted notes take precedence under unchanged per-kind caps so every accepted proposal in a maximum-three proposal result persists coherently. A historical unversioned note is never retroactively stamped as qualified, even when rendered text matches a new accepted claim.

One `record_reflection` operation persists the complete accepted result at the expected revision or none of it. No partial writes. Structured notes whose original refs cease to resolve are dropped as complete records; their typed provenance is never silently rewritten. Legacy evidence pruning remains compatible with its historical representation. This remains bounded reflection retention, not a new retrieval policy.

Storage validation enforces the canonical typed shape, matching subject/confidence/ref lists and source revision preceding the note's update revision. Plain-data validation rejects accessors, cycles, unknown fields and unbounded nested values. No automatic campaign disk-save was added. Manual Save semantics are preserved.

## Backward compatibility

The optional metadata field requires no save-version migration and no user action. Existing save migrations and legacy reflection records still load under their historical representation. Old notes do not receive the new marker on load. Tests cover legacy/new mixed-note round trips, exact recovery payload, identical-text legacy preservation, rich legacy saves and tampered structured metadata.

## Failure policy and revision safety

Transport/HTTP retryability, timeout, invalid wrapper, length finish, empty output, malformed envelope, wire/canonical/visibility invalidity use normalized reliability families. At most one retry is allowed. Authentication/configuration/nonretryable failure, stale revision and semantic rejection are not rerolled. Two technical failures skip maintenance without changing campaign state.

A valid `{"proposals":[]}` is successful, with zero notes; its cursor update matches prior production behavior. All-semantic-rejected results likewise advance only reflection maintenance state. Cursor policy and reflection frequency were not tuned.

Exact revision checks run before dispatch, after pacing/backoff, after provider completion and before persistence. A newer revision drops the result without replaying the player turn or writing into its state. Duplicate concurrent maintenance for the same campaign is suppressed; provider operations are serialized without background mutation. A 60-second logical operation budget bounds cooldown/retry scheduling; a Retry-After exceeding the available budget causes a safe skip rather than shortening the required cooldown.

Safe diagnostics now include logical ID, captured source revision, provider/model, physical attempt number, normalized failures/retry reasons, wire/canonical/visibility results when available, semantic result, accepted/rejected counts, stale status, reported cost and latency. Credentials and raw reasoning are excluded.

Reflection stays synchronous after valid narration publication: the CLI waits for maintenance before its next command. A failure cannot consume/roll back the completed player turn or suppress already-published narration. D-20 latency debt remains open; no unsafe background scheduling was introduced.

## Retrieval compatibility

Existing packing consumes deterministic rendered text without requiring a new representation. Exact recovery returns the full stored note including typed provenance. Production tests verify mixed legacy/new Save round trips, context packing and recovery. The live smoke verifies exact recovery and inclusion in the actual narrator request of a later finalized turn. The smoke narrator is offline; this verifies transport/packing compatibility, not narration benefit.

## Tests

Final required checks: `npm run typecheck` PASS; `npm test` **2,008 PASS, 0 FAIL, the same 4 TODO** (2,012 total); `npm run test:playthrough` **25/25 PASS**. Relevant legacy integration fixtures now emit qualified structured proposals; pure legacy validation/merge tests remain intact.

| Required coverage | Production evidence |
|---|---|
| A/B | Accepted note persists once with exact typed metadata; valid empty succeeds once with zero notes |
| C/D | Strict malformed/fenced/trailing/multiple/partial/extra-field responses retry then skip; 429 Retry-After recovery and fallback exhaustion with identical input |
| E/F/G | Canonical duplicate refs, unknown domain refs and hidden direct refs fail closed without persistence |
| H/I | Visible event provenance resolves hidden exact statements; history-only contrast validates against hidden current authority |
| J/K | Exact E1 shared-text note persists; concurrent revision advance skips stale output |
| L/M | Production `runPlayTurn` preserves published successful narration/player state after maintenance failure; existing post-turn fault/publication regressions pass |
| N/O | Old saves and unversioned notes remain loadable; new note is recoverable and packable, with exact typed provenance |
| Additional | Qualified source/schema/prompt parity, atomic multi-accepted batch, unchanged other domains, legacy identical-text preservation and six structured-save tamper cases |

## Live smoke

Single-use runner and raw local artifacts: `saves/d09-production-structured-reflection/`. Tests passed before dispatch. The bounded plan permitted two logical opportunities and stopped after its first accepted persisted note, without further semantic cohort chasing. Real flow: controlled campaign → real `TurnCoordinator`/`runPlayTurn` → normal finalized-turn trigger → production reflection adapter → live Qwen/Alibaba → strict/semantic validation → campaign persistence → inspection → subsequent narrator-request packing. Narrator/controller fixtures were offline; no other role was paid or switched.

| Measurement | Result |
|---|---|
| Logical opportunities / physical calls | **1 / 1** |
| Accepted proposals / persisted notes | **1 / 1**, `environmental_shared_rule_text` |
| Valid empty / retries / failures | **0 / 0 / 0** |
| Stale skips / duplicate writes | **0 / 0** |
| Reported cost | **USD 0.000296** |
| Physical-call latency | **3,931.83 ms** |
| Complete logical smoke latency | **4,059.63 ms**, including later inspection/turn |
| Provider/config/strict validation | **PASS**, Qwen/Alibaba, qualified schema/prompt |
| Persistence | **PASS**, one separate atomic revision, all non-reflection finalized-gameplay domains identical |
| Recovery / later narrator-request packing | **PASS / PASS** |
| Manual Save semantics | **Preserved**, no campaign disk-save invoked |

The state snapshots, before/finalized/after hashes, request bodies without auth headers, provider receipt with hidden reasoning removed, diagnostics, cost/latency, persistence/retrieval inspection and required test logs are retained locally. `verify.mjs` replays the raw accepted receipt through the final compiled production validators, checks exact stored text/provenance, restores stored state, confirms freeze hashes and scans artifacts for credentials without additional paid calls. Final storage/observability checks were added after live dispatch and the receipt was replayed offline against them; no prompt, provider body or candidate semantics changed. A preliminary runner invocation stopped on UTF-16 log decoding before any network/credential access; it is not counted as a logical reflection opportunity.

## Remaining D-09 closure gate

**D-09 CLOSED: NO.** Production integration is complete, but this controlled smoke does not establish organic usefulness. Closure still requires real development-rich campaign gameplay → accepted production reflection → persistence → later retrieval/packing → later narrator use → demonstrated narration benefit → ablation. D-06, D-17, D-19, D-20 and D-26 remain separate unchanged debts.

Next step: real development-rich campaign soak with end-to-end reflection benefit and ablation evidence.
