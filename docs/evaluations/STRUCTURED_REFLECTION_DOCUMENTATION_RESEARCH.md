# Structured reflection: documentation-first reliability research

Reviewed **2026-10-04, Europe/Rome**. New generation/provider inference calls: **0**. Public documentation, repository pages, search and unauthenticated endpoint metadata were read; existing receipts were inspected offline. This supplements [Reliability V3](STRUCTURED_REFLECTION_RELIABILITY_V3.md), whose screen remains FAIL / SCHEMA_CONFORMANCE. V2.3 remains frozen / semantic PASS; D-09 SOAK PENDING; no qualified provider candidate or production change.

## Findings from official sources

OpenRouter documents schema-format requests using `response_format.type=json_schema` and `strict=true`. Support is endpoint-specific and can change. Its current best-practices section explicitly distinguishes native strict enforcement from translation or hint-based implementations. Consequently, parameter support alone does not guarantee every constraint on every endpoint. This warning is also present in the official documentation repository. [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [official source](https://github.com/OpenRouterTeam/docs/blob/main/guides/features/structured-outputs.mdx).

The initial indexed search excerpt omitted that warning; the opened current page and repository source include it. The reviewed current page takes precedence over the cached search excerpt. No endpoint-specific enforcement promise is inferred from the introductory wording.

`require_parameters=true` restricts eligibility to providers advertising the requested parameters. `only` restricts providers; `order` sets priority; disabling fallbacks prevents alternative providers. These are routing controls, not a published keyword-by-keyword certification. The frozen Alibaba-only routing already applies those controls; another probe of their documented purpose adds no information. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

The public endpoint response currently identifies `Alibaba | qwen/qwen3.8-flash-20260826`, tag `alibaba`, model `qwen/qwen3.8-flash`, and lists both `response_format` and `structured_outputs`. It contains no JSON Schema keyword matrix or decoding-backend identity. This is capability metadata, not evidence of complete conformance. [Exact model endpoint metadata](https://openrouter.ai/api/v1/models/qwen/qwen3.8-flash/endpoints).

Alibaba's supported-model section explicitly includes Qwen3.8-Flash for JSON Schema. It distinguishes JSON-object mode from schema mode and demonstrates `strict` and closed objects. It does not enumerate enforcement guarantees for the keywords below. Some introductory comparison wording is less specific than the supported-model list; neither resolves the keyword gap. Chinese and English versions were checked. [Alibaba structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output), [Chinese version](https://help.aliyun.com/zh/model-studio/qwen-structured-output).

QwenCloud's DashScope reference describes `json_schema`, the schema object and the strict flag, but likewise supplies no per-keyword matrix for this OpenRouter endpoint. A DashScope API contract is not proof of what the gateway forwards or what a specific hosted decoder enforces. [Official QwenCloud reference](https://docs.qwencloud.com/api-reference/chat/dashscope).

## Keyword matrix: documentation versus existing receipts

“Not found” means no explicit per-endpoint guarantee was found in the reviewed sources, not that a keyword is unsupported. Generic JSON Schema standards and other providers' subsets must not be substituted for an Alibaba contract.

| Keyword | Public documentation finding | Existing exact-endpoint evidence | Decision before another paid probe |
| --- | --- | --- | --- |
| `type`, `properties`, `required`, `enum`/`const` | Basic structure demonstrated; exhaustive enforcement contract not found | Earlier `closed_required_enum` and `array_union_bounds` compatibility probes succeeded | Do not repeat basic compatibility checks |
| `additionalProperties:false` | Demonstrated in official structured-output examples | Closed-object probe succeeded; retained invalid V3 attempts were not extra-property failures | No evidence it caused the current blocker |
| Nested `anyOf` | No Alibaba endpoint-specific support/limitation matrix found | Earlier union probe and the full wire schema were accepted | Acceptance is known; universal branch enforcement is not proved. No cause attribution from current receipts |
| `minItems` / `maxItems` | No endpoint-specific enforcement matrix found | Bounds-containing union probe succeeded; no array-bound violations in V3 invalid receipts | Repeating syntax acceptance would add nothing |
| `minLength` / `maxLength` | No endpoint-specific enforcement matrix found | Current wire containing these fields is accepted, yet V2.3 OOS and V3 receipts exceed maxLength 160 | Conformance failure already demonstrated; do not pay to demonstrate it again |
| `uniqueItems` | No explicit hosted-endpoint keyword guarantee found | Prior Alibaba compatibility probe returned HTTP 400 specifically naming this keyword | Do not reintroduce or re-probe unchanged `uniqueItems`; canonical uniqueness must stay local |
| `contains`, `minContains`, `maxContains` | No applicable guarantee found | Same prior error message names these keywords; only `uniqueItems` was isolated by that probe | Error wording is a warning, not independent proof for all three. Avoid them without documented support |
| `pattern`, positional/alternative uniqueness encodings | No applicable guarantee or proven equivalent projection established | No relevant distinguishing receipt | No probe yet: specify an actual candidate and prove its safety locally first |

The local `uniqueItems` evidence is in `saves/structured-reflection-reliability-v2/compatibility-probes.json`, arm `probe:C:uniqueItems`, physical call 9. It returned HTTP 400 with `invalid_parameter_error` naming `uniqueItems` and related array keywords. The supported probes are `probe:C:closed_required_enum`, `probe:C:array_union_bounds` and `probe:C:full_wire`. These are historical empirical evidence, not public documentation and not new calls.

The wire omits two uniqueness constraints; canonical validation retains them. A duplicate that passes that wire but fails canonical validation is therefore expected rejection behavior, not proof of a new wire-enforcement regression. Invalid envelopes must remain unusable. No deduplication, truncation, partial salvage, strict-mode weakening or prompt tuning is introduced.

## 429 and retry documentation

OpenRouter distinguishes platform limits from upstream provider capacity. It recommends exponential backoff and honoring Retry-After. Successful inference responses lack X-RateLimit headers; Retry-After is conditional on available provider retry hints. Free-model platform caps must not be applied to this paid model, and account in-flight-budget errors must not be conflated with upstream shared-pool receipts. [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits).

Alibaba documents request and token quotas, with per-second limits possible alongside per-minute limits. It recommends smooth scheduling, queues and exponential backoff for burst protection. Those published direct-account/region quotas are not a measured quota for OpenRouter's shared pool. No universal six-second cooldown is documented. [Alibaba rate limiting](https://help.aliyun.com/en/model-studio/rate-limit).

Alibaba's error catalog separately identifies request quota, burst protection, token quota, service overload and resource exhaustion. HTTP 429 alone is insufficient to identify which occurred. Our historical `upstream_provider_shared_pool` receipts identify pool pressure but do not reveal Alibaba's precise native subtype. [Alibaba error codes](https://help.aliyun.com/en/model-studio/error-code).

The old harness did not capture response headers, so historical Retry-After remains unknown. V3 captured whitelisted headers but saw no 429; its fallback cooldown was therefore not exercised live. The arithmetic has local tests, which do not establish an optimal shared-pool cooldown. Deferred old retries waited minutes, not merely the configured 250 ms. No documentation or receipt supports calling the old run a concurrent burst or attributing V3's zero 429 causally to pacing.

## Official repositories, issues and changelogs

Issue reports are observations with their stated model, client and serving environment; they are not guarantees about the frozen Alibaba endpoint.

| Source checked | Finding | Applicability |
| --- | --- | --- |
| [OpenRouter provider #483](https://github.com/OpenRouterTeam/ai-sdk-provider/issues/483), opened 2026-04-24; closed via #486 | Hardcoded strict mode could exclude all eligible endpoints for some models | Routing failure on other providers; not our successful Alibaba HTTP 200 conformance failure |
| [Official provider changelog, 2.9.0](https://github.com/OpenRouterTeam/ai-sdk-provider/blob/main/CHANGELOG.md) | Adds opt-out setting for strict mode in response formatting | Does not fix identifier-length enforcement; disabling strict is not adopted |
| [OpenRouter provider #530](https://github.com/OpenRouterTeam/ai-sdk-provider/issues/530), opened 2026-08-14; open when reviewed | Reporter describes dropped options and response-schema failures in a particular SDK alpha | Our repository uses its own client and verifies exact outbound body hashes; that SDK is not a dependency |
| [OpenRouter provider #411](https://github.com/OpenRouterTeam/ai-sdk-provider/issues/411), opened 2026-02-11; closed | Tools combined with structured output can produce unexpected tool-call handling | Our reflection requests contain no tools; does not explain the current failures |
| [Qwen3 #1421](https://github.com/QwenLM/Qwen3/issues/1421), opened 2025-05-18; closed as not planned | Whitespace output reported for Qwen3-32B with local vLLM and JSON schema | Different model/server and symptom; not proof about hosted Flash |
| [Qwen3 #1700](https://github.com/QwenLM/Qwen3/issues/1700) | Nontermination reported for Instruct-2507 models under vLLM | Backend-specific; Alibaba's backend is not established by public metadata |
| [Qwen3.8 #216](https://github.com/QwenLM/Qwen3.8/issues/216) | Reporter associates empty answers with high reasoning effort on local Qwen3.8-27B | Different model/deployment; frozen reflection reasoning is disabled |
| [Qwen Code structured-output documentation](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/structured-output.md) | Describes a terminal tool with local schema validation and additional turns | Agent-level validation/retry system, not native Alibaba response-format enforcement; not adopted |
| [Qwen official release/news repository](https://github.com/QwenLM/Qwen3.8) | Open-model release and serving guidance | No located release note claims a fix for this exact endpoint's length/uniqueness problem |
| [OpenRouter announcements](https://openrouter.ai/blog/announcements/) and [Response Healing](https://openrouter.ai/docs/guides/features/plugins/response-healing) | Public JSON-repair feature and release coverage | Repair is expressly outside this task; cannot recover conformance by altering output |

Official issue/repository searches included `json_schema`, `structured output`, `anyOf`, `additionalProperties`, `minItems`, `maxItems`, `maxLength`, `uniqueItems`, 429 and Retry-After. No exact-match official issue or changelog fix for `qwen/qwen3.8-flash` on Alibaba was located. This is a bounded search finding, not a claim that no such issue exists. Community search results were not used as authority where official evidence sufficed. No issue, comment or support message was posted.

## Documentation-first decision for future probes

No empirical probe is executed in this research step. The prior generic recommendation to probe a safe equivalent wire must first satisfy the requirements below; it is not a ready-to-run plan.

| Potential investigation | What remains unknown after this review | Distinguishing hypothesis | Why documentation does not already answer it | Decision |
| --- | --- | --- | --- | --- |
| Alternative identifier-bound encoding | Whether a specific safe encoding changes enforcement on this exact endpoint | A concrete documented/safely proven encoding is enforced where existing maxLength is not | No complete keyword matrix or decoding implementation is published | Deferred: first identify the actual encoding and prove equivalence; no generic repeat of maxLength failures |
| Alternative uniqueness encoding | Whether uniqueness can be expressed safely using supported wire syntax | An equivalent encoding avoids the known uniqueItems rejection and duplicate completions | Native uniqueItems failure is already known; no applicable alternative is documented | Deferred: no probe until a concrete bounded encoding is proven safe; never repeat the unchanged rejected keyword |
| 429 retry-hint observation | What hint, if any, this shared endpoint emits on a naturally occurring 429 | Retry-After is forwarded versus unavailable; precise native subtype might be exposed | General conditional forwarding is documented, but no per-request pool hint or fixed quota is | Collect passively in a later justified screen; do not manufacture 429s or run a batch just to confirm documented backoff advice |
| Direct Alibaba versus OpenRouter comparison | Whether transport translation accounts for an observed difference | Identical upstream model/snapshot behaves differently through the gateway | Upstream forwarding/backend details are not published | Deferred: needs equivalent endpoint identity, separate authorized credentials and an explicit plan; none assumed here |

Every future paid probe must preregister:

1. Review date and supporting official URLs, including the applicable model/provider/snapshot scope.
2. The precise remaining unknown, competing hypotheses, and the decision each outcome changes.
3. Why neither documentation nor existing receipts already resolves the question.
4. Exact frozen request/provider/wire/prompt hashes; one isolated variable; local safety/equivalence evidence. In particular, frozen string matching uses JavaScript UTF-16 length: regex/Unicode alternatives must not silently change acceptance for astral characters.
5. Physical-call/time budget, one technical retry at most, auth/config/grammar fail-fast behavior, and no repair or semantic reroll.
6. Separate syntax acceptance, actual constraint enforcement, canonical validity, and transport reliability metrics. A successful sample is not a universal guarantee.

Cancel the probe if it only reconfirms documented behavior or archived failures, or if the candidate cannot preserve canonical/V2.3 acceptance. Preserve source SHA `10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d`, canonical SHA `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba`, prompt SHA `fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09` and existing wire SHA `ba621d1dd29bddbd0e5688027211896b4734b73f5ff696d61e2ee789a08042fd` until a separately preregistered safe wire candidate exists. No semantic redesign, general OOS or production integration follows from this documentation review.
