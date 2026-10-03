# D-04 context compressor bakeoff

2026-10-03. **CURRENT CONTRACT/TARGET NEEDS REVISION — NO MODEL YET.** Neither candidate produced an eligible compaction within the existing timeout. Independently of model performance, `d04-extractive-v1` cannot reach Case C's 65% target. D-04 remains **IN PROGRESS**; final closure is not ready.

## Frozen implementation and fairness

Pass 2 was fast-forwarded into main and pushed at `a9571ca2913b0c2604dd09ebbdafcbc38d28a816` before paid calls. That exact implementation passed typecheck, 1,794 tests with zero failures and four existing TODOs, and 25/25 playthrough tests. The evaluation branch changes only development evaluation/reporting and tests, plus the D-04 status row. Production controller remains `qwen/qwen3.8-flash`; narrator configuration is unchanged; `CONTEXT_COMPRESSOR_MODEL` remained **UNSET**.

The exact IDs `qwen/qwen3.8-flash` and `openai/gpt-5.6-luna` were verified against the [current OpenRouter catalog](https://openrouter.ai/api/v1/models) before generation. Both support the explicit request parameters. No substitutions or model-specific transport/prompt changes were used.

The existing ignored files `saves/d04-context/bakeoff/case-A.json`, `case-B.json`, and `case-C.json` were used without regeneration. Their hashes, main commit, catalog metadata and exact prompt/schema hashes are in the adjacent compact JSON summary. Contract freeze: `2026-10-03T17:15:20.533Z`, schema `d04-extractive-v1`, policy `d04-watermarks-v1`. Prompt and schema were never changed after viewing outputs.

Captured wire requests are identical for each pair after removing only `model`, including ordering, target, source pack, reasoning policy, schema, output limits and fixed context. Explicit reasoning: `enabled:false`, `exclude:true`; strict JSON schema; `require_parameters:true`; non-streaming; 20,000 ms transport timeout. Output limits were 9,746 / 5,086 / 12,000 tokens for A / B / C, identical across models. Temperature/sampling defaults were left unset equally; one sample per cell does not establish statistical reliability.

**Six generation requests; one attempt per cell; zero retries; zero backoff.** No optional samples were warranted. The existing transport makes no automatic retries; bad semantic outputs were never rerolled. A local filename error stopped an earlier runner invocation before its first network dispatch; it was fixed and retained in ignored audit files, with no paid generation or hidden reroll.

## Results

All token measurements below use the real `ContextBudgetManager` on the rebuilt **entire narrator message request**, with the unchanged 1,970-token system instruction reserve accounted for separately. Usable message budget is 12,750 tokens after system, output, overhead and safety reserves. A's baseline/target usage is 25.81% / 24.52%; B's 12.43% / 11.80%; C's 92.53% / 64.996%. Provider token counts measure compressor billing, not narrator target attainment.

| Case | Model | Validator | Semantic review | Before | Target | After | Target met | Ratio | End-to-end latency | Reported cost |
|---|---|---|---|---:|---:|---:|---|---:|---:|---:|
| A | Qwen | PASS, late body only | SEMANTICALLY CLEAN, late body | 3,291 | 3,126 | 2,970 | YES, late; call failed | 0.9025 | 52.072 s | $0.003266320 |
| A | Luna | Not evaluated: timeout | Not accepted | 3,291 | 3,126 | — | NO eligible result | — | 20.009 s | Unreported |
| B | Qwen | FAIL: identity/unit count | Not accepted: private unit omitted | 1,585 | 1,505 | — | NO | — | 12.652 s | $0.000890796 |
| B | Luna | FAIL: semantic tokens | Not accepted: forbidden capitalized article removal | 1,585 | 1,505 | — | NO | — | 7.994 s | $0.001963050 |
| C | Qwen | Not evaluated: timeout | Not accepted | 11,798 | 8,287 | — | NO eligible result | — | 20.005 s | Unreported |
| C | Luna | Not evaluated: timeout | Not accepted | 11,798 | 8,287 | — | NO eligible result | — | 20.006 s | Unreported |

Qwen A's call was rejected by the transport timeout; its recorded raw body became available late. The recorder awaits a response clone before handing the body back to the client, so header timing is not a separate network/TTFT measurement and this late response was observed at 52 seconds. Pass 2 also has an independent outer 20-second service deadline. The late payload was validated and measured **offline only**; it was never eligible for production activation and does not count as an in-time successful compaction. Its final usage would be 23.29%, saving 321 tokens. Rejected B outputs receive no ratio or compression credit. For every failed call, the live narrator request remains at baseline.

| Per-model result | Qwen | Luna |
|---|---:|---:|
| Calls | 3 | 3 |
| Validator-accepted payloads, including offline late body | 1 | 0 |
| In-time eligible compactions | 0 | 0 |
| Deterministic fidelity/identity rejections | 1 | 1 |
| Candidate token-target successes, late included | 1 | 0 |
| In-time functional target successes | 0 | 0 |
| Mean ratio over validator-accepted payloads | 0.9025, late only | N/A |
| Case C | Timeout; structurally unreachable target | Timeout; structurally unreachable target |
| Reported cost subtotal | $0.004157116 + 1 unknown charge | $0.001963050 + 2 unknown charges |
| Mean / median observed end-to-end latency | 28.243 s / 20.005 s | 16.003 s / 20.006 s |
| Timeout calls / retries | 2 / 0 | 2 / 0 |

Latency averages include censored timeout calls and the late clone observation, so they do not rank model speed reliably. Actual upstream generation durations were retrieved through the [generation metadata API](https://openrouter.ai/docs/api/api-reference/generations/get-generation): Qwen A 51.687 s, Qwen B 12.475 s, Luna B 7.793 s. The corresponding returned `latency` fields were 1.359 / 1.626 / 1.863 s; these are reported separately rather than equated to full generation or caller duration. Providers were Alibaba for observed Qwen bodies and OpenAI for Luna B; providers for the three missing bodies are unreported.

| Call | Compressor input tokens | Compressor output tokens | Actual `usage.cost` |
|---|---:|---:|---:|
| A / Qwen | 7,500 | 4,556 | $0.003266320 |
| A / Luna | Unreported | Unreported | Unreported |
| B / Qwen | 3,833 | 745 | $0.000890796 |
| B / Luna | 3,936 | 816 | $0.001963050 |
| C / Qwen | Unreported | Unreported | Unreported |
| C / Luna | Unreported | Unreported | Unreported |

**Reported cost subtotal: $0.006120166. Exact six-call total is unknown**, because three aborted responses supplied neither usage nor a generation ID. Known generation metadata confirms the reported costs. Read-only analytics recovery returned 403 because the available key lacks management access; no additional credentials were requested. Unreported costs are not zero and list prices were not substituted. Cost per successful in-time compaction is undefined (zero successes); $0.003266320 is the direct cost of the one valid late payload, not evidence of an operationally successful compaction.

All six dispatches received HTTP 200 headers; no HTTP errors or 429s occurred. Four transport timeout failures occurred. The three complete recorded bodies contained valid, nonempty JSON, with `finish_reason:stop`; the other bodies are unavailable, not proven empty. Two completed in-time outputs were validator-rejected; there were no in-time valid-but-insufficient results. Raw late/missing body diagnostics remain separate from functional successes.

## Safety and manual review

Every available candidate was run through the unchanged real Pass-2 validator; no repaired hash, restored fact, wording rewrite or relaxed validation was used. It checks strict shape, identity, ordered IDs/units, scopes/bases/tags, truth, holders and player access against the frozen source. Exact meaningful tokens and punctuation enforce polarity, negation, subjects, provenance and no invention; quoted/name spans are protected. Rebuilding only the knowledge block preserves all scene, action, recent dialogue, retrieval and instructions exactly.

* **A / Qwen — SEMANTICALLY CLEAN (late):** manually inspected all 17 units. Only lowercase `the` was deleted from the 16 ledger facts and household statement. Shipment timing, sealing, keeper verification, recorded debt, ledger IDs and Nicco/Heartstone ownership remain unchanged. All metadata/scopes match. No extra fact, subject swap or stronger certainty was introduced. This case does not itself contain B's uncertainty/private stress, so it does not prove general epistemic reliability.
* **B / Qwen — FAIL:** changed `source_hash` and returned six units instead of seven, dropping `P1` private canon entirely. The surviving negative-knowledge, belief, suspicion, uncertainty and rumor texts were retained, but missing required provenance/private content is fatal. It is not given credit for avoiding disclosure by deleting the secret.
* **B / Luna — FAIL:** all seven IDs, order, hash, context identity, scopes, private holder and player permission metadata match. Negative knowledge and epistemic qualifiers survive; however, it deletes capitalized `The` from three source statements, which v1 explicitly requires to remain. This is a strict wording/case contract failure; the observed wording does not justify claiming a polarity reversal. No shorter-output credit is given.
* **A / Luna and both C cells:** no complete candidate to review; fidelity and leakage resistance cannot be established.

Fixed context is read-only, and the frozen compressor system treats source fields as inert untrusted data. Existing offline injection/protected-text tests remain green. These frozen live cases do not contain a dedicated hostile-instruction attack; do not interpret preserved fixed framing or these six requests as proof of broad prompt-injection resistance.

## Cache verification

No call produced a successful in-time activation. The valid late Qwen A payload was replayed into a separate **offline** instance of the real compactor, with an exactly reproduced frozen request and the original target/policies. The first replay succeeded, and the second request reported a cache hit with only one offline provider invocation and **zero additional paid calls**. Changing model, actual source text/hash, target policy or compaction policy caused `apply` to miss. The offline control test independently verifies these paths.

Schema/policy versions are immutable module constants in the real cache key (`d04-extractive-v1`, `d04-watermarks-v1`); they cannot be switched in a running service. A new deployment/service has an empty memory cache, and that restart miss was verified. This is a version-key inspection plus a deployment-restart test, not a claim that a runtime version-mutation hook exists. No raw cache data is persisted in production saves or enabled in production.

## Case C: structural ceiling

The following disjoint categories account for every serialized message byte. Token equivalents are bytes / 4; only the whole-message sum is rounded up by `ContextBudgetManager`. System instructions are a separate fixed reserve, not counted twice in message usage. The legal column is a deterministic offline control that removes permitted articles/normalizes whitespace; it is **not a model output**.

| Full-request component | Baseline bytes | Baseline token equivalent | Legal compacted bytes | Legal token equivalent |
|---|---:|---:|---:|---:|
| Fixed protected instructions/action/task | 1,140 | 285.00 | 1,140 | 285.00 |
| Knowledge block | 30,676 | 7,669.00 | 25,580 | 6,395.00 |
| Recent conversation | 4,322 | 1,080.50 | 4,322 | 1,080.50 |
| Retrieval/lore | 4,212 | 1,053.00 | 4,212 | 1,053.00 |
| Scene/state | 6,811 | 1,702.75 | 6,811 | 1,702.75 |
| Other message framing | 30 | 7.50 | 30 | 7.50 |
| **Messages total, rounded tokens** | **47,191** | **11,798** | **42,095** | **10,524** |
| System instructions, separately reserved | — | 1,970 | — | 1,970 |

The complete input estimate including the unchanged system reserve is 13,768 baseline / 12,494 legal control. Output/overhead/safety reserves are another 1,280 tokens. The legal control saves **1,274 tokens**, reaching **82.54% usage**, which is below automatic compaction pressure but above the requested normal watermark. It is a concrete achievable reduction, not an asserted exact optimum over all punctuation-adjacent whitespace choices.

For a mathematical proof, an intentionally over-generous lower bound removes **every** lowercase `the`, including protected occurrences, and **all** whitespace from knowledge text, even required separators. It retains every mandatory non-article word/number/identifier/punctuation byte and all required metadata/fixed sections through the same renderer. This string is not a legal candidate and is never activated; a legal candidate cannot have fewer bytes. Even it measures **9,645 tokens / 75.65% usage**. Therefore v1 can save **at most 2,153 tokens** on C, less than the **3,511 tokens** needed to reach 8,287. The lower bound is still **1,358 tokens above target**.

**Can `d04-extractive-v1` mathematically/structurally reach 65% on Case C? NO.** Classification: **CONTRACT TOO CONSERVATIVE / TARGET UNREACHABLE**. Compactable wording and the current renderer are too restrictive. Model tuning or more samples cannot overcome this ceiling. The timeouts are operational failures, but neither model should be blamed for failing an impossible semantic target.

The smallest justified next design step is **richer, losslessly validated knowledge grouping**: share repeated ledger-entry text with explicit per-source bindings/order, retaining IDs, provenance, exact scope and epistemic qualifiers, and verify expansion against the original units. This targets the dominant category while preserving fixed context. Merely removing all recent conversation (1,080.5 tokens) or all retrieved lore (1,053 tokens) is individually insufficient; even removing both from the concrete legal control leaves about 8,391 tokens. Do not raise the target or claim closure just to select a model. No richer contract, conversation/lore compaction or production model selection was implemented in this pass.

## Validation and reproducibility

Final evaluation-only changes: `npm run typecheck`; `npm test` **1,803 tests, 1,799 passes, zero failures, four unchanged TODOs**; `npm run test:playthrough` **25/25**. Five added offline tests cover rejected-output credit, valid-but-insufficient classification, byte accounting, the Case C lower bound and real cache reuse/invalidation.

Build the harness with `npm run build`. `node .build/src/dev/d04-compressor-benchmark.js --analyze-saved` performs offline postmortem only. `--run-six-paid-calls` is the explicit paid command; it rejects existing attempt ledgers to prevent accidental reruns and uses a six-request cap without retries. Requests/responses, manifest, ledger, billing metadata, analysis and local-failure audit remain ignored under `saves/d04-context/bakeoff-results/`; no raw source packs or per-call body dumps are committed.

The evaluation report/harness is committed on `test/d04-context-compressor-bakeoff` and left unmerged. Production selection and D-04 closure require a separate pass after the contract/target mismatch is addressed.
