# Caldrevan controller model bakeoff — Round 2

## A. Setup

**Recommendation: SWITCH RECOMMENDED, with a moderate practical correctness advantage for Qwen.** It recovered four additional required commands, made no scored false proposals and handled all strict abstentions. DeepSeek's production route was faster. Production remains unchanged; a switch requires a separate pass.

Run date: 2026-10-03. Base: clean current `origin/main`, `168299da56005c8448ef0c0c63b94a0905f45df5`. **30 distinct cases/model, 60 generated responses, 60 HTTP attempts, zero retries.** One sample per case; no stochastic repeats or paid narrator calls.

Evaluation-only [runner](../../scripts/controller-bakeoff-round-2.mjs) and [case definitions](../../scripts/controller-bakeoff-round-2-cases.mjs) use the real production provider, coordinator context construction, schema, parser/normalization, authorization and replay path. Fresh disposable campaigns and scripted narration make each model's input byte-identical. Only the model/route changes. Production default, controller policy, evidence schema, engine semantics and routing configuration were not edited.

Policy: native strict JSON Schema; `require_parameters:true`; max output 512; nonstreaming; 20 s attempt timeout; reasoning disabled/excluded; temperature/top-p unset as in production. Both use production `DEFAULT_RETRY_POLICY`: at most two attempts, 250–500 ms backoff, 120 s provider budget. Request time includes backoff/retries, though none occurred. No model-specific prompts, extra examples or transport adaptations.

Raw requests/responses, per-cell outputs, attempts, gold replay state and logs are ignored under `saves/controller-bakeoff-round-2/`. Only reusable evaluation code/tests, this report and the [compact summary/manifest](controller-bakeoff-round-2-summary.json) are committed. No production module imports the evaluation modules. Validation: **typecheck passed; 1,759 tests passed, 0 failed, same 4 accepted TODOs**. Seven added offline scoring tests cover multiset matching, engine-owned exclusions, invented IDs, wrong subjects, existing-knowledge redundancy and latency statistics.

## B. Routing/model IDs

| Role | Exact request ID | Observed upstream |
|---|---|---|
| Baseline | `deepseek/deepseek-v4-flash-0731:nitro` | Wafer, all 30 |
| Challenger | `qwen/qwen3.8-flash` | Alibaba, all 30 |

**Option B selected:** compare the actual production `:nitro` baseline. No baseline route mixing. The catalog confirmed the same underlying families/snapshots verified in Round 1; endpoint inventories were captured before calls. [Nitro routes by throughput](https://openrouter.ai/docs/guides/routing/model-variants/nitro), so it is a routing policy rather than a permanently pinned provider. Both upstreams happened to remain stable during this run. Qwen's [endpoint inventory](https://openrouter.ai/api/v1/models/qwen/qwen3.8-flash/endpoints) advertised only Alibaba; no alternative route or BYOK configuration was introduced. This is an operational replacement comparison, not a provider-independent model benchmark.

## C. Case composition

| Category | Distinct cases | Coverage |
|---|---:|---|
| Abstention | 8 | quiet scene, emotion alone, future intent, refusal, incomplete/hypothetical receipt, unknown secret, local flavor |
| Knowledge | 6 | direct/repeated telling, abandoned telling, pronouns/relative clause, one intended recipient among bystanders, wrong-source/private-knowledge boundary |
| Relationships | 5 | affection, confiding/trust, clear respect decrease, politeness, intense implication without an NPC act |
| Movement/presence | 4 | independent visible-destination return, refusal, completed temporary departure, ambiguous departure |
| Multi-action | 4 | valid telling + hypothetical movement, knowledge + affection, knowledge + visible movement, accepted boots among irrelevant mentions/plans |
| Duplication | 3 | already-known fact, item event described twice, embrace described twice |

**23 cases** contain realistic difficult prose, including pronouns, quotation, multiple people, relative/subordinate clauses, negation, indirect speech and future/completed distinctions. Existing evidence-corpus, movement, temporary-departure and household regression language was preferred. Exact stimuli and provenance are in the case definitions/manifest. These are production-shaped regression fixtures, not a sampled live-traffic distribution; most use the existing minimal household evaluation world. Temporary Dell's profile and exit phrase come from the current continuity regression, with his location adapted to the shared scene.

## D. Ground truth methodology

Before paid calls, froze exact stimuli, input hashes, required/optional semantic commands, abstention labels, evidence basis, unacceptable-proposal rules and feasibility. Every required command's entity/fact/item IDs were verified in the actual controller envelope and its gold proposal passed production authorization and replay. The hidden secret sentinel never entered controller input. No labels were changed from model outputs.

Two explicitly frozen boundaries prevent Round 1's confounder:

- `m01` and `x03` contain completed Maren returns to **visible `test_room`**, the player's current scene. These are engine-owned: replay proves the engine supplies identical state with or without the correct model proposal. Correct movement is allowed, but excluded from required recall and precision credit. Either empty/required-only output or output including that movement can be exact. Invented IDs and duplicate moves remain false proposals. Player movement is never scored as controller work.
- `r03` has an unmistakable respect decrease and established prior respect, but the production verifier has **no respect/lower evidence family**. Gold validation confirmed rejection before calls. It is an unscored contract-gap probe: neither model is rewarded or penalized in primary metrics. The clear decrease is retained and disclosed rather than pretending it is authorizable. No engine changes were made to make it pass.

Thus **29 primary-scored cases, 14 required controller-feasible commands, 15 strict abstention cases**, plus one excluded probe. `m03`'s non-household temporary departure is genuinely controller-owned; unlike active-household movement, empty-controller replay does not supply it.

Scoring is deterministic and model-identity-blind: unordered semantic multisets, exact subject/target/dimension/direction/provenance; each gold command consumed once. Missing required commands are FN; extra/duplicate commands are FP. Exact cases require all required commands and no FP. Optional engine work never inflates TP. Schema errors would fail abstention/exact matching. Severity review uses frozen prior state; counts and labels stay unchanged.

## E. Overall results

| Metric | DeepSeek `:nitro` | Qwen |
|---|---:|---:|
| Precision | **81.8% (9/11)** | **100% (13/13)** |
| Context-feasible recall | **64.3% (9/14)** | **92.9% (13/14)** |
| Correct strict abstention | 13/15 (86.7%) | 15/15 (100%) |
| Exact scored cases | 22/29 (75.9%) | 28/29 (96.6%) |
| False proposals | 2 | 0 |
| Severe / moderate / low | 1 / 1 / 0 | 0 / 0 / 0 |
| Missed required commands | 5 | 1 |
| Duplicate proposals within a response | 0 | 0 |
| API schema acceptance / raw JSON / strict evidence schema / production parsing | 30/30 each | 30/30 each |
| Normalization / empty / refused / schema-invalid responses | 0 each | 0 each |

Qwen additionally emitted one semantically appropriate respect/lower command in the **excluded** probe; production rejected it. This rejected contract-gap proposal is disclosed separately, not hidden inside the zero primary-FP figure. No observed structured-output failures; **D-06 is not closed** by this sample.

## F. Category results

| Category | DeepSeek exact | Qwen exact | Required recall, DeepSeek → Qwen | FP, DeepSeek → Qwen |
|---|---:|---:|---:|---:|
| Abstention | 8/8 | 8/8 | N/A | 0 → 0 |
| Knowledge | 5/6 | 6/6 | 4/4 → 4/4 | 1 → 0 |
| Relationships | 2/4 | 3/4 | 0/2 → 1/2 | 0 → 0 |
| Movement/presence | 3/4 | 4/4 | 0/1 → 1/1 | 0 → 0 |
| Multi-action | 3/4 | 4/4 | 4/5 → 5/5 | 0 → 0 |
| Duplication | 1/3 | 3/3 | 1/2 → 2/2 | 1 → 0 |

Both missed confiding/trust (`r02`). The shared policy mentions confiding as trust evidence but also says “No trust commands are allowed”; this wording is a possible explanation, not a demonstrated cause. It was not tuned. Qwen's affection advantage appears in three turn forms, but those share one evidence cue and should not be treated as three independent capability families.

## G. Every semantic disagreement

`K` = Brenna learns the bridge fact from Nicco; `A` = Brenna → Nicco affection/raise; `L` = Dell `leave_scene`; `M` = Maren → `test_room`.

| Case | Gold / allowed | DeepSeek | Qwen | Better contract match and reason |
|---|---|---|---|---|
| `k06_wrong_source` | empty | K, citing Maren's speech | empty | Qwen: Nicco only listened; Maren lacks the fact and no authorized Nicco telling occurred |
| `r01_affection` | A | empty | A | Qwen: Brenna's own completed embrace supports affection |
| `r03_respect_lower_gap` | respect/lower semantic probe; unscored | empty | respect/lower | Qwen matches prose semantically; neither can commit it under current verifier; excluded before calls |
| `m01_independent_return` | empty or M; engine-owned | empty | M | Both acceptable: destination is visible and engine commits the move either way; no recall advantage assigned |
| `m03_temporary_exit` | L | empty | L | Qwen: completed temporary departure requires the controller proposal |
| `x02_knowledge_affection` | K + A | K | K + A | Qwen: two independently supported changes |
| `d01_already_known` | empty | K | empty | Qwen: existing knowledge must not be regranted or provenance overwritten |
| `d03_repeated_embrace` | one A | empty | one A | Qwen: one bounded relationship event, with no duplication |

All other semantic proposals agreed, including the shared trust miss. Evidence quotes and complete authorization records remain in scratch; the compact manifest preserves semantic disagreements. The recommendation follows this review, not just aggregate percentages.

## H. Failure severity and engine effects

DeepSeek's wrong-source knowledge grant is **severe controller error**: it invents communication/provenance. Its already-known regrant is **moderate redundant state mutation**, not invented new knowledge. Both were rejected (`rejected_fact_not_communicated`, `rejected_already_established`); neither altered state. No secret sentinel disclosure or invented entity IDs occurred.

Misses: DeepSeek omitted three affection adjustments and one trust adjustment (**moderate**, lost persistent relationship continuity), plus Dell's departure (**higher impact**, stale temporary presence unless reconciled). Qwen omitted only the shared trust adjustment. The missing departure was reconciled fail-closed; it was not an unsupported exit commit.

**Final engine safety:** zero unauthorized/unsupported state commits and zero failed replay turns for either model. Relative to prevalidated gold, five DeepSeek cases and one Qwen case lacked expected authoritative mutations, all from model omissions. These are end-to-end recall losses, not evidence that authorization accepted unsafe changes. Engine-owned Maren movement succeeded for both. The excluded respect/lower proposal was also rejected and did not change state.

## I. Latency, retries and cost

Times in seconds. Generated-response latency is production provider elapsed time; end-to-end is the request/retry wrapper elapsed time, excluding subsequent offline replay. Nonstreaming means genuine TTFT is unavailable.

| Metric | DeepSeek `:nitro` | Qwen |
|---|---:|---:|
| Generated-response mean / median / P95 | 0.874 / 0.888 / 1.442 | 1.868 / 1.719 / 3.566 |
| End-to-end mean / median / P95 | 0.874 / 0.888 / 1.443 | 1.868 / 1.720 / 3.567 |
| Initial HTTP failures / retries / recovered retries / final failures | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Input / output tokens | 78,185 / 1,037 | 66,556 / 1,198 |
| Total OpenRouter `usage.cost`, USD | **$0.008179200** | **$0.004577564** |

Total: **$0.012756764**. Qwen cost about **44% less** in this run, with provider/cache discounts included; relative costs are route-specific, not universal model price claims. Prompt bytes were identical despite different tokenizers. P95 is nearest-rank with n=30, a descriptive small-sample estimate. Nitro was about 0.83 s faster at median and 0.99 s faster on mean end-to-end latency. Qwen's Round 1 rate limits did not recur; 30 calls cannot establish they are resolved.

## J. Recommendation

**SWITCH RECOMMENDED — moderate practical advantage, conditional on a separate production-switch pass.** Qwen's feasible recall increased by 28.6 percentage points, without primary precision loss or extra false proposals; it improved affection handling, temporary presence, wrong-source abstention and existing-knowledge discipline. Six scored disagreements favored Qwen; none favored DeepSeek. The benefit is useful even though it is concentrated in a small set of evidence families.

DeepSeek remains faster on its actual production route. Qwen's roughly one-second mean latency increase is an explicit tradeoff; correctness takes priority, and its observed operational reliability was comparable. Lower measured cost supports but does not determine the recommendation. Limits: curated small regression set, one sample/case, shared affection cue, unresolved trust wording/respect verifier gap and earlier Qwen rate limits. This is evidence for migration, not a permanent winner or statistical reliability guarantee. Reassess D-06 only after any separately authorized switch and later soak.

Reproduce on a fresh ignored directory: `npm run build`, then `node scripts/controller-bakeoff-round-2.mjs --prepare --out saves/<fresh-run>`, followed by `--run --out saves/<fresh-run>`. Ground truth cannot be overwritten; completed cells resume without paid repeats, and unfinished paid cells block automatic reissue. `--summarize --out saves/controller-bakeoff-round-2` is offline and reproduces aggregation from retained artifacts. Future runs overwrite the local summary, not this report's frozen results.

Production model changed: **NO**. Main updated: **NO**.
