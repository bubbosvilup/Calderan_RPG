# Structured reflection wire V2 CVC — provider reliability screen

Reviewed 2026-10-04, Europe/Rome. **Reliability PASS; blocker NONE.** Production unchanged; V2.3-CVC frozen / local semantic PASS; D-09 SOAK PENDING. Reliability only: no new semantic OOS, U/N/R/M review, prompt tuning, repair or targeted exposure testing.

## FREEZE

Frozen V2.3 source 10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d; canonical c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba; prompt fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09; CVC fe0986ec9ce684287cc4c5f6e4b3f0de8a88767d61286041bd870e06b5dfca70; wire generator 0b42b45e4664473e0fc3de864bf396b829ebc1e622c13a6b90ed2849066cbbeb. All source/body/request/snapshot/dynamic-schema hashes MATCH before inference and in final receipt audit. Manifest fa0227e6fdbfedec7963fd45116f69d425520aef65d8dd4dbd2f1c8a34ff4e5a. Existing local proof: 40 requests, 28,464 accepted samples, zero false rejections, 205 safety negatives. No frozen semantics or wire domains changed during the run.

## PREFLIGHT

Exact credential format checked privately; one read-only authentication check: HTTP 200. No account details or credentials stored. Tests green before inference. No additional generic documentation research or minimal keyword probes. Model qwen/qwen3.8-flash, Alibaba only, no fallback, require_parameters true, strict JSON Schema, 600 tokens, 20 seconds, reasoning disabled/excluded.

## SCREEN CORPUS

Exact archived next-paid-screen bodies: 24 requests, three per eight claim families. Captured catalogs/states, request/snapshot/schema hashes and domains are retained in manifest.json. Body hashes match the prepared archive. No cases regenerated/substituted after dispatch. Logical dispatched 24/24; physical 24. Distinct preregistered confirmation cases retained separately.

## DYNAMIC SCHEMA DOMAINS

Only evidence refs, verified received statement selectors and visible movement endpoints receive request enums. Embedded selectors already transmitted in typed event metadata remain citable; no hidden handles are exposed. Unsupported uniqueItems is omitted only from provider wire. Canonical uniqueness stays mandatory. Screen schema UTF-8 bytes min/median/max: 3973 / 4274.5 / 5026; exact domains and per-field cardinalities are in manifest.json. No token estimate is claimed.

## PROVIDER RESULTS

| Metric | Result |
| --- | ---: |
| logical | 24 |
| dispatched | 24 |
| physical | 24 |
| first_usable | 24 |
| first_rate | 1 |
| retries | 0 |
| recovered | 0 |
| final_usable | 24 |
| final_rate | 1 |
| http_429 | 0 |
| malformed | 0 |
| length | 0 |
| timeout | 0 |
| wire_invalid | 0 |
| canonical_only_invalid | 0 |
| visibility_invalid | 0 |
| enum_violation_attempts | 0 |
| enum_violation_values | 0 |
| evidence_enum_violations | 0 |
| statement_enum_violations | 0 |
| location_enum_violations | 0 |
| valid_empty | 0 |
| valid_nonempty | 24 |
| cost_usd | 0.007213193999999999 |
| missing_cost_receipts | 0 |
| median_latency_ms | 4665.203850000002 |
| p95_latency_ms | 6302.2353 |

## ENUM ENFORCEMENT

Evidence violations 0; statement violations 0; locations 0. Exact attempt/request/path/value/expected-domain/cardinality and recovery are archived in validation-results.json. No request-scoped enum violation observed. This finite screen does not establish universal keyword enforcement.

## CANONICAL VALIDITY

Wrapper and finish stop precede exact JSON.parse, dynamic wire, canonical structure and CVC visibility checks. Valid empty envelopes count as usable. Canonical-only invalid attempts 0; visibility-invalid 0. No deduplication, coercion, proposal dropping, selector replacement, first-object extraction or JSON repair occurred. Invalid-finish raw content is retained diagnostically without becoming usable.

## RETRIES

Screen retries 0; recovered 0. Maximum two attempts per request; technical failures only, deferred after first attempts; exact same body/state/schema checked. No semantic, quality or valid-empty reroll. Retry traces and write-ahead dispatch/receipt pairs retained. Shared physical cap 48, used 40. Frozen V3 pacing retained: concurrency one, launch floor 1,000ms, post-completion gap 250ms, Retry-After honored, fallback 429 delay 6/12 seconds. No tuning.

## 429

Screen natural 429 receipts 0. Whitelisted Retry-After/X-RateLimit headers, upstream errors, timing and attempt number retained in raw receipts. No rate-limit failure manufactured.

## LATENCY

Screen physical-attempt median 4665.20 ms; P95 6302.24 ms (nearest-rank percentile; median midpoint). Includes request completion/validation, excludes pacing wait. Timing/pacing waits retained per receipt.

## COST

Screen provider-reported cost $0.007213193999999999; missing cost receipts 0. Total screen plus confirmation provider-reported cost $0.012489935999999998; authentication is not an inference call. These are usage receipts, not an independent billing audit.

## CONFIRMATION

Run YES. Distinct logical 16; dispatched 16; physical 16; final usable 16/16; enum violations 0; reported cost $0.005276741999999999. Confirmation requires screen first >=23/24, final24/24 and zero enum violations plus budget/time. No first-screen failure triggers confirmation.

## DECISION

**PASS / NONE.** Reliability candidate frozen YES. WIRE_ALIBABA_V2_CVC is qualified only for the targeted missing-exposure soak. Production changed NO. Semantics, prompt, canonical structure and provenance/visibility remain frozen. D-09 SOAK PENDING.

## NEXT STEP

Targeted missing-exposure soak only, as a separate task. No production integration.

Raw artifacts: saves/structured-reflection-wire-v2-provider/. Credential scan and final tests are recorded in final-verification.json.

Verification before and after dispatch: typecheck PASS; unit 1,972 passed, zero failures, same four TODOs; playthrough 25/25. Final audit confirms 40 write-ahead/receipt pairs, unchanged source/request/snapshot/body/schema hashes, concurrency one, frozen pacing, strict usable pipeline and zero credential leaks. Only evaluation harness/report files are committed; raw receipts, manifests, schemas and qualification freeze remain in the ignored local saves directory.
