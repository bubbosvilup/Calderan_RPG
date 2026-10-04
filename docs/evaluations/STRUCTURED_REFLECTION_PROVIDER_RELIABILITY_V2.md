# Structured reflection provider reliability V2

**RELIABILITY SCREEN: CANDIDATE FOUND.** Clean preflight/probes/comparison completed. Production unchanged. Frozen V2.3 semantics unchanged/hash verified. D-09 **SOAK PENDING**; no semantic OOS was run.

## Credential preflight and benchmark fail-fast

Credential present; exact `sk-or-v1-` plus 64 hexadecimal characters validated. Legacy local-file extraction is fixed-width and rejects ambiguous keys; provided environment values must match the complete exact format. The old trailing-text extraction bug is covered by a deterministic test. Read-only /api/v1/key returned **HTTP 200 before any generation**; account data and credentials were neither printed nor saved. Public model endpoint metadata returned HTTP 200 with visible DeepSeek and Qwen endpoints before generation.

The shared, campaign-independent benchmark gate stops the entire batch on the first auth error (including auth codes inside HTTP-200 error wrappers), and stops the affected schema/model/provider configuration on its first deterministic error. Tests simulate 48 queued auth-failing tasks and observe **one dispatch**, plus grammar/config errors stopping an arm after one call while another arm continues. This does not alter production retry behavior. Budget test covers shared accounting across probes/comparison/retries. No auth error occurred in this run.

## Preregistration and corpus

Plan hash `a79e9430c14f74de83476e1cca99b609a3ecb0ec5fc0ba1b2dc4c79884b36ecb`; comparison manifest `e9e1820f1fa1a33877dc59aecbce1e40cb355db4ab73f879d12617088413b6a9`. The plan froze all 16 existing reliability-only requests, snapshots, catalogs/traces, source hashes, routing, three profiles, minimal probes, settings, qualification/tie-break and retry policy before generation. The comparison manifest then fixed the projection choices from the preregistered probe rule before full reflection calls.

Two requests per family (fixture and complex scripted checkpoint): trajectory, parallel, contrast, condition, membership, movement, self-statements, environment. Bodies reuse the prior reliability corpus; **not independent semantic OOS**. One environmental fixture is empty-appropriate. User JSON, captured state and prompt are identical across all arms. Full comparisons retain **600 tokens**, 20-second timeout, reasoning excluded/disabled and require_parameters:true. Only model/routing/wire syntax differs. Twelve minimal/full-wire probes use a separate 160-token limit; **all probes count toward the same 64-generation-call cap**.

## Keyword compatibility probes

Three minimal schema configurations per endpoint: closed required/nested objects with enum; arrays of closed union objects with anyOf/const/minItems/maxItems; uniqueItems. One full selected-wire schema probe per endpoint then asks for a valid empty envelope. These are schema syntax probes, not reflection quality samples. Each distinct probe configuration is attempted once; no grammar error is retried. An unsupported uniqueItems case ends that configuration, while the separately preregistered projection can still be tested.

SUPPORTED means a request was accepted and generated a strict schema-valid minimal output. UNSUPPORTED means deterministic request/schema rejection; UNKNOWN means no conclusive compatible output. These positive cases do **not prove native grammar enforcement or adversarial conformance**. Local canonical validation remains mandatory even for SUPPORTED keywords.

| Endpoint | additionalProperties:false | anyOf | enum | min/maxItems | uniqueItems | nested required | array union |
|---|---|---|---|---|---|---|---|
| A | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED/SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| B | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED/SUPPORTED | UNSUPPORTED | SUPPORTED | SUPPORTED |
| C | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED/SUPPORTED | UNSUPPORTED | SUPPORTED | SUPPORTED |

A probes pinned Baidu FP8; B pinned DeepInfra FP8; C pinned Alibaba. DeepInfra explicitly returned Unimplemented keys: ["uniqueItems"]. Alibaba rejected arrays containing uniqueItems with a provider invalid_parameter_error. Both accepted the **full schema with only uniqueItems removed**. Baidu accepted the canonical schema in these small probes; this establishes request compatibility, not guaranteed strict enforcement. Actual full-response malformed rates below determine candidacy.

OpenRouter documents endpoint-specific support and differing strict enforcement strengths: [official structured-output docs](https://github.com/OpenRouterTeam/docs/blob/main/guides/features/structured-outputs.mdx), [official provider-routing docs](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/provider-selection.mdx). Public metadata snapshots are stored from [DeepSeek endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints) and [Qwen endpoints](https://openrouter.ai/api/v1/models/qwen/qwen3.8-flash/endpoints). Advertised supported parameters alone did not establish keyword compatibility.

## Wire projections and acceptance safety

Canonical V2.3 schema hash: `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba`.

DeepInfra projection WIRE_DEEPINFRA_V1: `ba621d1dd29bddbd0e5688027211896b4734b73f5ff696d61e2ee789a08042fd`.

Alibaba projection WIRE_ALIBABA_V1: `ba621d1dd29bddbd0e5688027211896b4734b73f5ff696d61e2ee789a08042fd`.

The projected schemas have identical bytes because both omit exactly the two uniqueItems nodes. All eight closed claim branches, required fields, additionalProperties:false, enum/const, nesting, counts and string/array bounds remain. No provider-specific semantics or transformation of output objects. DeepInfra uses its projection; Alibaba's unsupported uniqueItems probe selects its projection under the frozen rule; A stays canonical.

Acceptance pipeline: one exact JSON.parse → local wire schema check → **unchanged canonical schema check** → frozen V2.3 validation for mechanical nonempty/admissibility sanity. Usable requires valid transport/finish plus wire AND canonical structure, before semantic validation. Duplicate refs/selectors can satisfy projected wire syntax but remain canonical-invalid and NOT usable. Fences, trailing prose/objects/punctuation, partial JSON and unknown-field coercion are never repaired; no first-object extraction promotes output.

Eight safety cases prove duplicate evidence refs, duplicate statement refs, unknown field, invalid enum, too many proposals, too many refs, wrong payload and missing required fields are not usable. The two duplicate cases demonstrate wire-valid/canonical-invalid. Other tests cover immutable projection, strict malformed rejection, exact key loading, read-only auth failure, auth/config fail-fast and cap sharing. Fifteen new tests; production files and frozen semantic candidate untouched.

## Arm results

Primary first attempts only; no retries during comparison. Wire/canonical columns count exact raw JSON structural validity, while strict usable additionally requires an acceptable provider wrapper/finish. No length response is accepted even if its raw text could parse. Valid nonempty/empty/proposal counts include strict usable envelopes only. Malformed/trailing/schema/length categories may overlap.

| Arm | Primary calls | Strict usable | Wire valid | Canonical valid | Nonempty/empty | Proposals | Malformed/trailing/schema/length |
|---|---:|---:|---:|---:|---:|---:|---|
| A | 16 | 9/16 | 9 | 9 | 9/0 | 20 | 5/4/2/1 |
| B | 16 | 14/16 | 14 | 14 | 12/2 | 20 | 1/0/0/1 |
| C | 16 | 16/16 | 16 | 16 | 15/1 | 28 | 0/0/0/0 |

### Arm A

Model `deepseek/deepseek-v4-flash-0731:nitro`; routing `{"require_parameters":true}`. Projection `CANONICAL`; actual providers `{"Baidu":16}`. Compatibility: REQUEST ACCEPTED; enforcement strength not proven. First-attempt failure classes `{"malformed_envelope":4,"schema_invalid":2,"finish_reason_length":1}`; deterministic primary configuration errors 0. Wire-valid but canonical-rejected 0. 12 proposals passed frozen V2.3 checks as mechanical sanity only, not blind semantic quality scoring.

Physical comparison calls 16; provider-reported comparison cost USD 0.018937320 (0 missing receipts). Median first-attempt latency 1885.902 ms. Technical retries 0; recovered 0; final logical usable 9/16.

### Arm B

Model `deepseek/deepseek-v4-flash-0731:nitro`; routing `{"require_parameters":true,"only":["deepinfra/fp8"],"order":["deepinfra/fp8"],"allow_fallbacks":false}`. Projection `WIRE_DEEPINFRA_V1`; actual providers `{"DeepInfra":15,"unreported":1}`. Compatibility: REQUEST ACCEPTED; enforcement strength not proven. First-attempt failure classes `{"finish_reason_length":1,"http_retryable":1}`; deterministic primary configuration errors 0. Wire-valid but canonical-rejected 0. 12 proposals passed frozen V2.3 checks as mechanical sanity only, not blind semantic quality scoring.

Physical comparison calls 16; provider-reported comparison cost USD 0.001997760 (1 missing receipts). Median first-attempt latency 5982.502 ms. Technical retries 0; recovered 0; final logical usable 14/16.

### Arm C

Model `qwen/qwen3.8-flash`; routing `{"require_parameters":true,"only":["alibaba"],"order":["alibaba"],"allow_fallbacks":false}`. Projection `WIRE_ALIBABA_V1`; actual providers `{"Alibaba":16}`. Compatibility: REQUEST ACCEPTED; enforcement strength not proven. First-attempt failure classes `{}`; deterministic primary configuration errors 0. Wire-valid but canonical-rejected 0. 11 proposals passed frozen V2.3 checks as mechanical sanity only, not blind semantic quality scoring.

Physical comparison calls 16; provider-reported comparison cost USD 0.005392050 (0 missing receipts). Median first-attempt latency 5400.566 ms. Technical retries 0; recovered 0; final logical usable 16/16.


DeepInfra's two failures were a 600-token length termination on R02 and an HTTP 429 shared-upstream-pool rate limit on R08. They are separate truncation and API availability failures, not grammar incompatibility. Baidu's two parseable schema failures exceeded the eight-item evidence/operation bounds; its remaining failures were malformed/trailing content and length. Successful minimal probes therefore do not establish reliable enforcement of the full schema. The underlying Baidu enforcement mechanism is not proven from these receipts.

The canonical-validation artifact records each attempt, request/state/body hashes and local validation stage. No wire-only invalid object is credited as a semantic rejection or accepted reflection. Mechanical V2.3 admissibility numbers are not a new blind semantic quality score; there is no human semantic review here.

## Selection, technical retry and accounting

Qualification was frozen at >=15/16 strict usable, >=8 valid nonempty envelopes, and at least one V2.3-admissible proposal. This prevents an all-empty provider winning. Ranking among qualifying arms: strict usable, then nonempty, then lower reported cost, then arm ID. Preferred first-attempt target 16/16; final target 16/16 after at most one technical retry. With n=16 this is screening evidence, not a statistical reliability guarantee.

Best qualifying arm: **C**. First-attempt rate 100.00%; technical retries attempted 0, recovered 0; final logical usability 16/16 (100.00%). Valid empty, successful, semantically rejected and unhelpful outputs are not retried. Retried requests, if any, use the exact original body, logical ID and frozen snapshot. Existing candidate retry handling replays the cached initial failure and dispatches only attempt 2; cached replay is not counted as a provider call. Auth/config errors are never contract retries.

The source-frozen harness supplies random=0 to retryPolicy, giving reproducible 250-ms backoff within its 250–500-ms policy bounds. No retry was needed for the winner, so this screen does not add empirical retry-recovery evidence; the existing deterministic reliability-contract tests cover that behavior. Keep this implementation setting with the frozen policy for the next OOS.

Total generation calls **60/64**: 12 probes + 48 primary comparisons + 0 retries. Provider-reported total cost **USD 0.027405150**, including probe cost USD 0.001078020. 3 calls have no reported cost receipt; missing costs are not established zero charges. Per-call latency, receipts, costs, usage and retry traces are retained. Config-incompatible probe receipts do not count as malformed model content.

## Candidate freeze and next step

**RELIABILITY CANDIDATE FOUND: YES.** Arm C meets the preregistered screen and final 16/16 target. This is a small reliability screen, not statistical proof or production authorization.

- Model: `qwen/qwen3.8-flash`.
- Routing: `{"require_parameters":true,"only":["alibaba"],"order":["alibaba"],"allow_fallbacks":false}`.
- Wire profile/hash: `WIRE_ALIBABA_V1` / `ba621d1dd29bddbd0e5688027211896b4734b73f5ff696d61e2ee789a08042fd`.
- Canonical schema: `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba`.
- Prompt: `fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09`.
- V2.3 source: `10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d`.
- Max tokens 600; timeout 20000 ms; reasoning `{"exclude":true,"enabled":false}`.
- Retry policy: `{"version":"candidate-technical-contract-v1","max_attempts":2,"backoff_ms":250,"max_backoff_ms":500,"turn_budget_ms":120000,"min_retry_window_ms":5000,"retry_after_timeout_cap_ms":30000,"max_attempt_ms":60000}`.
- First 16/16, final 16/16, first-attempt nonempty 15/16. Exact settings/configuration are in candidate-freeze.json. No post-selection tuning.

Next task: separately authorized independent V2.3 semantic OOS using **exactly this frozen provider/wire/canonical/prompt/retry configuration**. It must cover real provenance-equivalent, corroborating/context/contradictory exposure and convincingly useful membership/environment controls. Production provider, semantic reflection and turn publication remain unchanged.

## Verification and retained artifacts

Typecheck PASS; unit/integration **1962 passed, 0 failures, same four TODO (1966 total)**; playthrough **25/25**. Frozen V2.3 source `10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d`, schema and prompt match required hashes; dependencies remain byte-for-byte unchanged. Production model/reflection/publication unchanged; no new semantic OOS, prompt tuning or token-budget increase.

Ignored saves/structured-reflection-reliability-v2 contains plans/manifests/hashes, all request/state/catalog/trace bodies, endpoint metadata, canonical/projected schema files, compatibility probe receipts, private preflight **status only**, physical write-ahead/receipt ledger, outputs/failure taxonomy, canonical validation, retry traces, rankings, candidate freeze if qualified, tests and final analysis. No credentials. Reports and evaluation-only module/tests/harness are committed; raw artifacts stay local and ignored.
