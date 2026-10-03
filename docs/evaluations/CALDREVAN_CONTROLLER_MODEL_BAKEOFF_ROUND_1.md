# Caldrevan controller model bakeoff — Round 1

## A. Setup

2026-10-03. Screening concluded with **36 paid responses**, covering all 12 cases for three models. **The planned 60 paid calls were not achieved**: GLM and Gemini rejected the contract at the API layer. There were 114 HTTP attempts, 78 rejected attempts, and no repeats of completed model outputs. No Round 2 calls were made.

Production behavior, routing, prompts, schema, validation and engine semantics are unchanged. The source default is already `deepseek/deepseek-v4-flash-0731:nitro`; evaluation deliberately used the requested plain `deepseek/deepseek-v4-flash-0731` ID. This routing difference limits direct comparisons with historical production latency.

The separate [harness](../../scripts/controller-bakeoff-round-1.mjs) captures real `TurnCoordinator` requests using existing offline household fixtures and scripted narration, calls the production `DeepSeekStateControllerProvider`, and replays outputs through the production coordinator on fresh disposable state. Narration is fixed; no paid narrator calls. Gold commands were checked against production authorization **before** calls, and requests/ground truth were frozen in ignored scratch storage. Model output never determined truth labels.

Shared policy: current `CONTROLLER_POLICY` and `CONTROLLER_EVIDENCE_SCHEMA`; max output 512; timeout 20 s; nonstreaming; no temperature/top-p set, matching production; reasoning disabled and excluded where supported; provider `require_parameters: true`. Prompt, schema and per-case request hashes are recorded in the [summary manifest](controller-bakeoff-round-1-summary.json). Provider-default sampling and OpenRouter's default upstream routing remain confounders.

Raw requests, responses, usage, per-command scoring, validation and failures are exclusively under ignored `saves/controller-bakeoff-round-1/`. No production source imports the harness. Validation: `npm run typecheck` passed; `npm test`: **1,752 passed, 0 failed, 4 existing TODOs**.

Reproduce with `npm run build`, then `node scripts/controller-bakeoff-round-1.mjs --prepare --out saves/<fresh-directory>` and `--run` with the same output directory. Preparation refuses to overwrite frozen truth. `--summarize` needs no paid calls. Only rejected API/transport cases can use `--retry-transport`, then `--retry-transport --tool-transport`; successful/model-invalid outputs are never repeated. A run resumes recorded cells; API keys come only from environment. The committed manifest preserves this run; subsequent summaries overwrite it locally.

## B. Exact model IDs

All five exact IDs verified against the [OpenRouter catalog](https://openrouter.ai/api/v1/models); no substitutions.

| Candidate | Exact ID | Catalog snapshot |
|---|---|---|
| Baseline | `deepseek/deepseek-v4-flash-0731` | 20260731 |
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` | 20260910 |
| Qwen3.8 Flash | `qwen/qwen3.8-flash` | 20260826 |
| GLM-5.3 FlashX | `z-ai/glm-5.3-flashx` | 20260918 |
| Gemini 3.7 Flash | `google/gemini-3.7-flash` | 20260813 |

GLM lacks advertised `structured_outputs`. Its native schema request failed HTTP 404. Transport retries sent the **same schema** as function parameters, using named then `required` tool choice, with lowest advertised mandatory reasoning (`low`); both were rejected for tool-choice compatibility. Gemini first rejected disabled reasoning, then rejected reasoning `low` with native schema and the unchanged schema through a required function call, HTTP 400 `INVALID_ARGUMENT`. The provider did not identify the offending argument. No schema simplification or weaker local validation was attempted. These are **compatibility failures, not observed JSON/model-quality failures**. See [structured-output support](https://openrouter.ai/docs/guides/features/structured-outputs) and [reasoning controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

## C. Twelve scenarios

Existing regression-derived telling, movement, private-fact and relative-clause fixtures were preferred; the manifest contains exact text and fixture provenance for all cases.

| Case | Scenario | Expected controller count / behavior |
|---|---|---|
| 01 | Quiet reading | 0; abstain |
| 02 | Completed explicit telling | 1; `set_knowledge`, Brenna learns bridge fact from Nicco |
| 03 | Abandoned telling | 0; abstain |
| 04 | Nicco goes to Main hall, Maren stays | 0; player movement is deterministic engine intent, not controller vocabulary |
| 05 | Maren independently goes to Main hall | 1; `move_character`, Maren → `test_hall` |
| 06 | Maren refuses requested movement | 0; abstain |
| 07 | Brenna embraces Nicco | 1; `adjust_relationship`, Brenna → Nicco, affection/raise |
| 08 | Polite nod | 0; abstain |
| 09 | Brenna does not know Maren's secret | 0; no secret/knowledge mutation |
| 10 | Same bridge fact told twice | 1; same knowledge change, no duplicate |
| 11 | Telling with pronouns/relative clause | 1; same knowledge change |
| 12 | Telling + Maren movement + future trip plan | 2; knowledge + Maren → `test_hall`; no scheduled trip/player movement |

## D. Ground truth and scoring

Six abstention cases; seven expected controller commands. Full expected commands, subjects, targets and unacceptable-proposal rule were frozen before calls. Any unmatched or duplicate command is a false proposal. Commands match as unordered multisets with exact semantic fields; duplicate proposals consume no additional true-positive credit. Precision = TP/(TP+FP); recall = TP/7. Abstention requires a valid production-parsed empty proposal, not an API failure. Strict wire-schema validity is reported separately from production parsing/normalization.

**Context limitation discovered during analysis:** production controller input omits destination ID `test_hall` in cases 05/12. Engine ground truth contains it, but models cannot safely infer that ID under the evidence policy. Frozen truth and raw recall remain unchanged. Supplementary context-feasible recall excludes those two unavailable commands: baseline **4/5 (80%)**, V4.1 **4/5 (80%)**, Qwen **5/5 (100%)**. Invented IDs still count as false proposals. Case 04 explicitly verifies the engine moved Nicco to `test_hall`; requiring a controller movement proposal would contradict production semantics.

## E. Results

| Model | Valid structured output | Correct abstain | Precision | Raw recall | False proposals | Mean latency | Cost USD |
|---|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek V4 Flash 0731 | 12/12 | 6/6 | 100% | 57.1% | 0 | 3.637 s | $0.001424 |
| DeepSeek V4.1 Flash | 12/12 | 6/6 | 40% | 57.1% | 6 | 1.923 s | $0.003744 |
| Qwen3.8 Flash | 12/12 | 6/6 | 71.4% | 71.4% | 2 | 2.842 s | $0.002222 |
| GLM-5.3 FlashX | N/A; 12 blocked | N/A | N/A | N/A | N/A | N/A | N/A |
| Gemini 3.7 Flash | N/A; 12 blocked | N/A | N/A | N/A | N/A | N/A | N/A |

All 36 generated outputs passed strict evidence-schema parsing without normalization. No observed malformed JSON, refusals, empty responses or timeouts. Twelve responses per model cannot establish that a rare historical `structured_output_invalid` problem has been eliminated. Exact case matches: baseline 9/12, V4.1 9/12, Qwen 10/12. Matching case counts conceal severity: V4.1 generated five extra commands in one case.

## F. Notable failures and disagreements

| Case | Baseline | V4.1 | Qwen |
|---|---|---|---|
| 05 | Safe abstention; unavailable movement missed | Invented `main_hall` | Invented `test_room_main_hall` |
| 07 | Missed affection change | Missed affection change | Correct affection/raise |
| 12 | Correct telling; unavailable movement missed | Missed movement; unsupported knowledge for Maren/Gerome, repeated telling/rumor commands | Correct telling; invented `main_hall` |

All other cases matched. V4.1's six false proposals comprise one invented destination, four unsupported rumor commands and one duplicate correct telling. Qwen's two false proposals are invented destination IDs. Unsupported proposals were rejected by authorization; the duplicate telling was authorized again, making output duplication observable even though it does not create additional factual knowledge. The deterministic movement path supplied the real Maren movement where the controller omitted/misidentified it. All successful-provider replays completed; controller recall is therefore distinct from final engine recall. None exposed the private secret sentinel.

## G. Latency, tokens, cost and failures

| Model | Median | P95* | Input / output tokens | Rejected HTTP attempts / retries |
|---|---:|---:|---:|---:|
| Baseline | 3.414 s | 7.053 s | 42,780 / 505 | 0 / 0 |
| V4.1 | 1.385 s | 6.712 s | 37,171 / 793 | 0 / 0 |
| Qwen | 2.143 s | 7.446 s | 25,684 / 764 | 6 / 6 |
| GLM | N/A | N/A | N/A | 36 / 24 |
| Gemini | N/A | N/A | N/A | 36 / 24 |

*Nearest-rank P95 with n=12 is the sample maximum, not a reliable tail estimate. Latencies cover generated responses only; rejected requests are not ranked as fast completions. Qwen's initial six HTTP 429 shared-pool failures all recovered on one transport retry. Retry waiting is excluded from the main latency comparison. TTFT is unavailable for genuine first-token timing because production uses nonstreaming requests.

Total generated-call cost: **$0.007389795**, using OpenRouter `usage.cost`, including cache discounts. Rejected requests returned no usage/cost; no charges were reported for them, and this is not a billing-ledger audit. Baseline is cheapest among models with a completed dataset. Upstream providers varied for both DeepSeek models; Qwen used Alibaba. Full provider sets and catalog prices are in the manifest.

## H. Keep/drop decision

- **KEEP FOR ROUND 2: baseline.** Best precision and zero unsupported proposals; competitive despite one feasible relationship miss.
- **KEEP FOR ROUND 2: Qwen, provisional.** Better feasible recall and faster mean response; invented IDs and initial rate limits remain weaknesses. Retaining it is for further screening, not a production endorsement.
- **DROP: DeepSeek V4.1.** Faster but repeated unsupported knowledge/duplicate proposals, with no recall advantage over baseline.
- **DROP: GLM and Gemini for this contract.** No usable responses after transport adaptations. Semantic quality is inconclusive; compatibility remediation would be a separate task.

## I. Recommended Round 2

Baseline and Qwen, approximately 25–30 cases each, with repeats only for ambiguous/stochastic cases. Explicitly separate engine-only movement from controller work and distinguish unavailable-ID commands from feasible commands. Retain adversarial knowledge, duplicate and relationship checks. No permanent winner; no production model change. Round 2 was **not run**.

Round 1 screening is concluded; the five-model/60-paid-response comparison remains incomplete because two exact candidates reject the preserved contract.
