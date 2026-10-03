# D-04 lossless context compaction v2

2026-10-03. **V2 structurally reaches the unchanged Case C target without a model call.** Schema: `d04-lossless-grouping-v2`. Policy namespace: `d04-watermarks-v2`. No production compressor was selected and no real model/provider calls were made. Controller remains `qwen/qwen3.8-flash`; narrator remains `z-ai/glm-5.2`; compressor remains **UNSET**. D-04 remains **IN PROGRESS**.

The completed bakeoff evidence, harness, compact summary and offline tests were fast-forwarded into main and pushed at `2a033d6` before v2 work. Main was clean. This implementation is on a separate branch and is not automatically merged.

## Why v1 was insufficient

V1 permitted only lowercase article deletion and whitespace normalization while repeating source text in the narrator table. The frozen Case C baseline was 11,798 message tokens, with a target of 8,287. Even an intentionally illegal, over-generous v1 lower bound was 9,645 tokens. More model calls, a longer timeout or prompt tuning could not fix that structural gap. V2 changes representation, not the target or authoritative facts.

## Representation and eligibility

Code precomputes whole-fact groups. Each group contains exact `canonical_text`, its original ordered unit-index bindings, and a metadata-family index. Two whole-fact units share text only when their complete text and metadata match exactly. Metadata comparison excludes only `id`, `ref` and `text`: source kind/provenance category, truth, player access, private holders, every character ID/tag/basis and any future metadata field must match. Each distinct source ID/ref remains an explicit binding; sharing wording does not declare source identities or provenance aliases equivalent.

No canonical text normalization is currently needed. Names, quotes, articles, case, punctuation, leading/trailing whitespace and separators reconstruct byte-for-byte. Different subjects or ledger numbers prevent whole-fact grouping. Same text with different knowledge/belief/negative-knowledge status, truth, private holder, basis, player access or source kind cannot enter the same metadata family or fact group.

V2 supports three finite, code-defined layouts:

| Layout | Representation |
|---|---|
| `expanded` | Exact original unit text in the existing compact fact table; identical character grant vectors share their permission rendering. |
| `grouped` | One exact whole-fact string per eligible group, with all original ID/ref/order bindings and complete metadata-family vectors. |
| `dictionary` | Exact repeated text fragments stored once within a metadata family; each distinct group retains its own ordered fragment sequence and original bindings. |

Fragment sharing is **not** an assertion that different facts mean the same thing. For example, different numbered ledgers remain different groups. Only literal repeated fragments are factored; their subject/number fragments, order, separators and per-source bindings remain explicit. Dictionary pools never cross metadata-family boundaries, including public/private or epistemic boundaries. A deterministic repeated-pair algorithm builds flattened quoted strings, with a 2,048-round work bound and removal of unused dictionary definitions. There are no recursive executable templates or model-written clauses.

The model contract, if used separately, can emit only `version`, `source_hash`, `context_identity`, `revision`, `layout`, and `group_refs`. The model cannot supply text, metadata, eligibility rules or new bindings. Every legal group reference must occur exactly once. Reference order may vary; expansion and rendering restore the canonical source order. Wire inputs include immutable source units and compact precomputed group descriptors, not a second copy of every canonical string. The explicit-model HTTP adapter uses v2's prompt/schema; it has no default model.

## Expansion, validation and activation

`expandLosslessCandidate` validates strict shape/version, source hash, context identity, revision, permitted layout, complete reference coverage, uniqueness and known group IDs. It rebuilds dictionary strings by concatenating the actual canonical fragments, verifies those strings equal the source text, then restores units by their original index. **Expanded units must deep-equal the original units, including every metadata field, ID/ref and byte of text.** Duplicate source identities are rejected. No human semantic judgment is needed to activate a candidate.

Rendering uses the existing trusted knowledge-block offset seam. All other message bytes, the system prompt, scene/state, immediate action, recent conversation, retrieval and fixed instructions are retained. Player and character permission vectors come from the existing trusted renderer. Only the narrator receives this derived representation; controller proposals, authorization, retrieval and campaign persistence continue using original inputs. V1 remains available for historical evaluation/tests; its cache entries cannot be consumed by the separate v2 service/version namespace.

The production factory now creates `LosslessContextCompactor`, which measures all three deterministic legal layouts and selects the smallest resource-safe layout. If it meets the requested target and material-saving floor, it activates with **zero provider calls**, even with the production model unset. If the finite minimum cannot meet the target, the result is insufficient: a model cannot improve the code-defined candidate set, so the service does not make a pointless paid request. The reference-only HTTP contract is prepared for a separately authorized evaluation, not invoked by maintenance.

The original 65% normal target, 50% strong ratio, 95% manual ratio, 64-token material-saving floor and resource limits remain unchanged. The policy namespace increments because deterministic-first selection/activation behavior changed. There is no target inflation. Activation retains the busy guard, synchronous cache application, bounded ephemeral cache and freshness checks. The complete request hash is captured before layout construction and compared again after the live-source callback; cancellation or stale knowledge/frame rejects activation. No await separates the final freshness check from cache activation. Failures preserve prior cache entries and authoritative state.

## Frozen A/B/C measurements

The original ignored v1 source contexts were not edited. They were reproduced through the real builder and compared exactly against frozen compression requests and narrator frames before generating v2 fixtures. All estimates use `ContextBudgetManager` on the entire serialized message request; the unchanged 1,970-token system reserve is accounted for separately. Usable message budget is 12,750 tokens.

| Case | Original baseline | Target | Deterministic selected layout | After grouping | Valid finite-catalog minimum | Margin below target | Final usage |
|---|---:|---:|---|---:|---:|---:|---:|
| A: crowded knowledge | 3,291 | 3,126 | expanded | 3,003 | 3,003 | 123 | 23.55% |
| B: epistemic/private | 1,585 | 1,505 | expanded | 1,476 | 1,476 | 29 | 11.58% |
| C: mixed high pressure | 11,798 | 8,287 | dictionary | 8,002 | 8,002 | 285 | 62.76% |

| Case | Exact expanded layout | Whole-fact grouped layout | Dictionary layout |
|---|---:|---:|---:|
| A | 3,003 | 3,486 | 3,254 |
| B | 1,476 | 2,077 | 2,307 |
| C | 11,485 | 12,381 | 8,002 |

The analyzer enumerates every layout authorized by this v2 contract, validates expansion, rebuilds the full request and measures it. The reported **legal lower bound is an actually achievable minimum over this finite precomputed catalog**, not an information-theoretic optimum over arbitrary future dictionaries or renderers. Group-reference permutations do not change canonical rendering or size. The selected deterministic result equals that minimum; no illegal separator removal or dropped information is used.

**Can v2 structurally reach 65% on exact frozen Case C? YES.** The first achievable legal bound is **8,002 tokens**, 285 below the 8,287 target, saving 3,796 tokens. Including the separate unchanged system reserve gives 9,972 estimated input tokens, versus 13,768 baseline. Provider billing tokens are not used to establish this gate.

A retains all 17 distinct source units: its ledger numbers make whole-fact texts distinct, so safe permission formatting beats the additional dictionary/metadata overhead at this size. It is not forced into a larger grouping layout. B retains seven separate groups/units and all original negative knowledge, belief/false-belief, suspicion, uncertainty, rumor, private-holder, provenance and player-access distinctions. Its modest 109-token saving comes from safe rendering, not merging epistemically different units. C likewise retains all 20 distinct units; large savings come from repeated literal fragments, not fact identity collapse.

## Case C full-request breakdown

These are disjoint serialized-message byte categories. Token equivalents are bytes / 4; `ContextBudgetManager` rounds only the full message sum. The system reserve is not counted twice.

| Component | Baseline bytes | Baseline token equivalent | V2 bytes | V2 token equivalent |
|---|---:|---:|---:|---:|
| Fixed protected instructions/action/task | 1,140 | 285.00 | 1,140 | 285.00 |
| Knowledge | 30,676 | 7,669.00 | 15,491 | 3,872.75 |
| Recent conversation | 4,322 | 1,080.50 | 4,322 | 1,080.50 |
| Retrieval/lore | 4,212 | 1,053.00 | 4,212 | 1,053.00 |
| Scene/state | 6,811 | 1,702.75 | 6,811 | 1,702.75 |
| Framing | 30 | 7.50 | 30 | 7.50 |
| **Message total, rounded tokens** | **47,191** | **11,798** | **32,006** | **8,002** |
| System reserve, separate | — | 1,970 | — | 1,970 |

V1's concrete legal knowledge block was about 6,395 token-equivalent; v2 reaches 3,872.75 without deleting even an article. Knowledge remains the largest category, but now fits the configured target. No older conversation or lore was summarized or removed.

## Timeout and measurement architecture

**Measurement bug found: YES. Production timeout changed: NO.** The old evaluation fetch wrapper awaited `response.clone().text()` and a disk write before returning the original response to `OpenRouterClient`. That moved header timing to full audit-body completion and could delay timeout observation. The recorder now consumes the clone concurrently, returns the original response immediately, captures generation/end-to-end duration before audit flushing, and bounds the later audit flush separately. A blocked-clone regression test proves the usable original body is not held behind the audit.

The explicit HTTP adapters retain a **20,000 ms transport timeout**, which aborts HTTP consumption. The legacy model-assisted Pass-2 service retains its independent **20,000 ms outer deadline**, which races the provider and rejects late results even if an adapter ignores cancellation. V2's production maintenance makes no asynchronous provider request, so there is no provider wait to race; its shared timeout setting remains 20,000 ms for the prepared transport contract. Deterministic computation is synchronous and bounded by source/layout limits plus the factoring round cap. Timeout tuning was not performed.

Historical provider-reported generation durations remain unchanged: Qwen A 51.687 s, Qwen B 12.475 s, Luna B 7.793 s. The historical report is preserved; no old paid sample was rerun or reclassified as an in-time success. V2 made **zero paid calls**, so no new provider latency or narrator-comprehension claim is made.

## Tests, fixtures and next step

Twenty-seven focused offline tests cover compatible grouping; incompatible text/scope/basis/truth/provenance/private/player fields; exact reconstruction and ordering; missing/duplicate/invented references; forbidden metadata overrides; source hash/revision/version/layout rejection; quoted/imperative text; Case B exactness; Case C finite legal minimum and fixed-frame isolation; model-free target attainment/cache hits; cancellation/stale-frame/no-op/insufficient paths; cache version separation; passive audit timing; mocked v2 HTTP; and actual coordinator isolation from controller/retrieval/authorization. An integration fixture uses a test-only 96% manual ratio to exercise a smaller coordinator request; all frozen A/B/C design-gate measurements use the unchanged real production policy.

Final validation: `npm run typecheck`; `npm test` **1,830 tests, 1,826 passes, zero failures, the same four accepted TODOs**; `npm run test:playthrough` **25/25**. Existing controller, authorization, save, golden-trace and retrieval tests remain green.

`node .build/src/dev/d04-lossless-fixtures.js` regenerates only ignored `saves/d04-context/bakeoff-v2/case-A.json`, `case-B.json`, `case-C.json` and `manifest.json`. Each freezes original-context hash, source hash, v2 prompt/schema/policy, unchanged target, legal grouping set, layout measurements, exact expansion oracle, full baseline/rebuilt frame and legal bound. The adjacent committed summary contains hashes and measurements, not raw packs. Fixtures are deterministic and hash-stable on repeated preparation.

**V2 BAKEOFF READY: YES — structural, validation and fixture prerequisites are met.** However, a paid compressor selection bakeoff is **not needed to achieve these three targets**: deterministic code already enumerates the entire legal candidate set. A future paid run would test reference-selection compliance/transport, not find compression beyond this catalog. It requires separate authorization and should have a clear added purpose. Structural losslessness does not by itself prove a real narrator interprets dictionary references correctly; any live narrative-quality/closure validation remains a separate pass. No model is selected and D-04 is not closed here.
