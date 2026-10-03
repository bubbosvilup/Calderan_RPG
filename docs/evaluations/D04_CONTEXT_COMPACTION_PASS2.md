# D-04 context compaction — Pass 2

D-04 remains **IN PROGRESS: compressor pipeline implemented; model bakeoff pending**. No paid calls, production compressor selection, UI, authoritative-state changes or save schema bump.

## Legacy gates

| Limit | Classification | Pass 2 treatment |
|---|---|---|
| 32,000 serialized context characters | C: historical token approximation | No longer a rejection gate. Final narrator requests use ContextBudgetManager. A separate 100,000-character resource bound is shared with the existing HTTP transport ceiling; this is not a model window. |
| 6,000 rendered knowledge characters | C: historical token approximation | Retain the existing lossless complement/group formatting optimization; output may exceed 6k if final tokens fit. Transport-scale resource bound remains. |
| NPC+ 4,000 characters, traits/refs/recovery caps | D: component quality/selection | Unchanged. The old 32k NPC+ flavour headroom remains a **soft packing policy**, not a turn rejection. Authority remains outside it. |
| Primary scene field lengths/counts/16k text; access fact-count cap | B/D: bounded projection resources/quality | Retained; never silently truncate primary state. |
| 12 exchanges / 16k recent history | D: intentional continuity window | Unchanged. |
| 100k HTTP request, bounded response/output buffering | B: resource/DoS safeguards | Retained. Controller envelopes remain original, uncompressed and subject to their transport safeguard. |
| Knowledge grants, visibility, location/time/legal/relationship authority | A: correctness/security | Unchanged. Compressor cannot change any of them. |

Regression: the original 7-NPC+ baseline builds **34,484 context characters**, **3,291 narrator-message tokens / 12,750 usable = 25.81%**. Direct narration is allowed; the old 32k gate no longer rejects it. Actual crowded coordinator turns, >6k knowledge rendering, independent resource overflow and final hard token failures are covered.

## Representation and contract

The existing builder registers a derived NarratorPack after its normal visibility/relevance and knowledge-access projection. Compressor input contains only those filtered knowledge units and the read-only fixed narrator frame. Each unit retains ID/ref/provenance, truth classification, player access, private holders and each character's epistemic tag/basis. Missing permission is `UNKNOWN_PERMISSION`, explicitly **not proof of actual ignorance**. Negative-knowledge statements stay negative. Belief in a false proposition is `FALSE_BELIEF`; uncertainty and private scopes remain distinct.

**Compactable now:** knowledge wording and repetitive knowledge permission rendering. Equivalent permission vectors may share rendering only after deterministic exact comparison. Units themselves are never merged or dropped. Recent conversation, retrieved-lore payloads and repeated scene descriptions remain read-only in this version; their later compression is optional work, not implicitly authorized here.

**Never replaced:** system instructions, critical IDs, location/time, scene participants, social/legal/relationship/current state, player action, hard constraints and all other fixed prompt bytes. The builder records the exact knowledge-section offset; activation uses slices, not pattern matching against untrusted text. Controller prior state, retrieval, authorization and auditing continue to receive the original context. Fact truth used for compressor metadata is attached to filtered fact objects through a WeakMap, avoiding controller-envelope or campaign-save changes. Existing ordinary narrator/controller golden traces remain byte-identical.

Independent interface: `ContextCompressorProvider.compress(CompressionRequest) -> CompressionResponse`. Requests include source hash, context/revision identity, target, reason and level. Version: `d04-extractive-v1`; policy version: `d04-watermarks-v1`. The dedicated prompt treats every supplied field, dialogue and lore as inert untrusted data; forbids inference, external knowledge, ambiguity resolution, new facts/entities, polarity changes and rewritten scopes.

This initial contract is deliberately **conservative and extractive**: candidate wording may normalize whitespace/remove lowercase article `the`; every other word, number, identifier and punctuation must remain in order/case. Names and quoted spans remain exact. Free paraphrase is rejected. Most crowded-case reduction comes from lossless permission rendering, supplemented by validated extraction. This constrains model freedom and achievable compression; it does not claim a general semantic theorem prover.

## Validation, activation and cache

Strict candidate/schema parsing rejects extra/missing/reordered units, unknown IDs/characters, altered tags/truth/provenance/scope/holders/player access, new lexical entities, removed negation, malformed text and resource overflow. Provider-reported estimates are not trusted: the rebuilt full narrator request is measured again. It must be smaller by the configured material saving, meet the requested target and fit hard/resource bounds.

The previous active representation stays intact through generation and validation. A live source/hash/revision check **and full current-request hash check** precede synchronous cache insertion/activation, with no intervening await/callback. Stale or cancelled results are discarded. The model receives detached data; no authoritative mutation capability. Failure/timeout/insufficient results leave existing context intact and exit maintenance cleanly.

Cache is bounded in-memory derived state (default 32 entries). Identity includes compactable content/scope hash, context identity/revision, compressor model, schema/policy versions, budget policy, target and level. Fixed frames are rebuilt intact for each request; they do not prevent reuse of identical knowledge, but are checked for freshness during generation. Cache reuse revalidates the candidate and current hard/resource capacity. Source/model/policy changes miss. A new service starts empty; an existing service may safely revalidate a matching reconstructed source after load. No artifacts, metrics or in-progress operation are written to campaign saves.

Default policy: existing 80/90/100% warning/auto/hard thresholds; normal target **65%** usable capacity, stronger target **50%**, maximum **two attempts**. Manual target is the smaller of the normal watermark and **95% of current size**, requiring at least **64 tokens** of material saving. The gentler below-threshold manual target accommodates measured knowledge-only savings without demanding impossible reductions of fixed state. All targets are configurable. Empty or provably immaterial sources return `no_op` without a provider call; an unset independent model returns `unavailable`. Stronger/insufficient paths never recurse indefinitely.

GameSession retains `idle/running_turn/post_turn/compacting_context`. Real auto maintenance follows successful turn/reflection and blocks input until settled; initial crowded preflight still rejects acceptance while maintenance starts. Manual compaction uses the same pipeline even below auto threshold. Actual player turns only reuse validated artifacts synchronously; **no compressor call occurs inside a running turn**. If a newly introduced query changes the scope and exceeds hard capacity, it fails closed rather than reusing an incompatible candidate. Shutdown cancellation and synchronous status-callback races are covered.

Session views/results/events expose success/no_op/failed/insufficient/unavailable and before/after tokens/percent, ratio, source hash, cache hit, model, level/target, duration, usage and reported cost. `context_compaction_completed` supplies a refreshed view. Actual turn budget diagnostics measure the active request; aggregate pressure prefers that authoritative token snapshot. Normal logs never dump source contents.

Production wiring uses the existing OpenRouter client and strict JSON schema, with reasoning disabled and bounded timeout/output. `CONTEXT_COMPRESSOR_MODEL` is independent and **unset by default**; no narrator/controller/reflection fallback. Reported `usage.cost` is propagated when supplied. Narrator configuration and controller `qwen/qwen3.8-flash` remain unchanged.

## Pass 3 artifacts and verification

Local-only reproduction:

```
npm run build
node .build/src/dev/d04-context-baseline.js
node .build/src/dev/d04-compaction-bakeoff.js
```

Ignored `saves/d04-context/bakeoff/case-{A,B,C}.json` contain exact compression inputs, fixed narrator frames, versioned prompt/schema, targets, IDs/tags and validation oracles. No raw packs are committed.

| Case | Baseline tokens | Usage | First target |
|---|---:|---:|---:|
| A: 7 NPC+, 32 known facts each, existing relevance shows 16 each | 3,291 | 25.81% | 3,126 |
| B: known, explicit unknown wording/denied permission, suspected, false belief, uncertainty, rumor, holder-private canon | 1,585 | 12.43% | 1,505 |
| C: detailed ledger knowledge + 12 recent exchanges + actual permission-filtered lexical lore + scene | 11,798 | 92.53% | 8,287 |

`evaluateBakeoffCandidate` runs the same validator/rebuild/accounting and returns acceptance, target result, final tokens, ratio, latency, usage, cost and failure information. Oracle acceptance is a deterministic extractive-contract check; human semantic review is still required. Any epistemic/scope/entity corruption rejects the candidate. Case C can expose insufficient compression under this conservative contract; no model performance or winner is asserted.

Validation: **typecheck passes; 1,798 tests, 1,794 passes, zero failures, same four TODOs; playthrough 25/25**. The 29 new tests cover direct/manual/auto/post-turn paths, atomicity, stale source, cache/revision/content changes, epistemic polarity/private scope, IDs/entities, injection/quoted spans, bounded levels, unavailable/no-op, failures/timeouts, blocking, shutdown, save/load, controller isolation, HTTP schema/cost handling and bakeoff oracles. All network activity in compressor tests is mocked.

Pass 3: run identical exported inputs against independent candidates, review semantic and epistemic fidelity first, record zero-invention/leakage and target success, then compare ratio/tokens/latency/usage/cost/schema failures. Measure whether conservative targets need adjustment or a separately validated richer schema. Select no permanent production compressor until that evidence exists; D-04 remains open.
