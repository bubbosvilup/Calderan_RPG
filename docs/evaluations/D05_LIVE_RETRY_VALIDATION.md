# D-05 live transient retry validation

**Verdict: CLOSED.** Controlled injected HTTP 429 followed by one real production OpenRouter controller request validated the existing retry/authorization/commit boundary. This is not an observed OpenRouter 429. Run: 2026-10-03, 20:41 UTC.

## Frozen case and transport

A fresh disposable `turnFixture` campaign (revision 1) contains the true fact `campaign_fact_bridge_closed`, known to Nicco and absent from Brenna's knowledge. The player action is `/tell campaign_fact_bridge_closed to brenna`; the scripted narration is `Nicco tells Brenna that the eastern bridge is closed.` Ground truth, expected command, initial snapshot, production policy values and transport/controller/coordinator source contents were persisted before dispatch. No narrator or compressor calls were purchased.

The injected fetch supplied to the real `OpenRouterClient` returns a single HTTP 429 Response before dispatch. The production client normalizes this to `ProviderError("rate_limited")`. The next fetch delegates directly to real OpenRouter; both serialized request bodies are asserted byte-identical. Production controller prompt, strict evidence JSON schema, routing, parsing, authorization and candidate preparation are unchanged. The controller is `qwen/qwen3.8-flash`, served by Alibaba; production narrator remains `z-ai/glm-5.2`.

The coordinator receives no retry override: it selects the actual `DEFAULT_RETRY_POLICY`. Two attempts maximum; uniform configured backoff 250 to 500 ms; turn budget 120,000 ms; minimum retry window 5,000 ms; timeout-retry cap 30,000 ms; maximum attempt cap 60,000 ms. The controller's own default 20,000 ms timeout remains unchanged. No policy tuning or engine changes were needed.

## Attempt and state evidence

| Measurement | Result |
|---|---|
| Attempt 1 | Injected pre-dispatch HTTP 429; normalized `rate_limited`; 15.4905 ms; no HTTP dispatch |
| Backoff | Observed wall interval between failed proposal settlement and next proposal start: 341.7269 ms |
| Attempt 2 | Real OpenRouter success; 2,845.6102 ms for controller proposal |
| Successful controller responses | 1 |
| Retry diagnostics | attempts 2; retry reasons `[rate_limited]`; recovered true; final outcome success |
| Authorization passes | 1; one authorized command, grammar and quoted evidence both pass |
| Commit attempts / successful commits | 1 / 1 |
| Knowledge edges added / duplicate effects | 1 / 0 |
| Revision before / after | 1 / 2 |
| Total full-turn latency | 3,279.1217 ms |
| Actual HTTP dispatches / paid controller calls | 1 / 1 |
| Tokens | 2,099 input; 69 output; 2,168 total |
| Reported `usage.cost` | $0.00034728 |

The backoff measurement includes timer scheduling and wrapper/checkpoint overhead. The exact random delay is not exposed by production diagnostics; no sleep, random, clock or policy function was substituted to obtain this measurement. Successful transport latency was 2,844.4782 ms; headers arrived after 1,978.9829 ms.

Parsed proposal:

```json
{"kind":"set_knowledge","knowledge":{"character_id":"brenna","fact_id":"campaign_fact_bridge_closed","status":"knows","provenance":{"source_character_id":"nicco","acquisition_kind":"told"}}}
```

Evidence quote: `Nicco tells Brenna that the eastern bridge is closed.` Authorization: `authorized_explicit_information_transfer`; evidence check `nicco_communicates_fact`; source `both`. The final authorized batch contains exactly this one command. No identity promotions or other state commands occurred.

Before: two total knowledge edges; Brenna has no bridge edge. After: three total edges; exactly one Brenna bridge edge with the above provenance. The entire failed-attempt snapshot equals the initial snapshot. Before each transport attempt the harness also asserts unchanged authoritative state and zero commit calls. The complete final campaign snapshot exactly equals an offline single-success control that replays only the accepted live result through a fresh coordinator; this comparison includes all campaign fields and provenance, not just edge count.

Optional abstention case: NOT RUN. The primary case fully exercises the requested boundary; no additional paid calls or semantic rerolls were needed. No natural provider transient occurred.

## Exactly-once boundary, late results and identifiers

The guarantee is local authority, not provider-side idempotency:

- [Retry lifecycle](../../src/llm/retry.ts): `withProviderRetry` serially awaits each proposal. A retry begins only after the previous promise rejects and the real backoff completes. A resolved proposal immediately returns one accepted result; there are no parallel attempts or timeout `Promise.race` producing detached proposals.
- [HTTP lifecycle](../../src/llm/openrouter/client.ts): each request creates its own abort controller and timeout, normalizes HTTP errors, and cleans up the timer/signal/reader in `finally`. This injected 429 has no upstream request and therefore no late upstream result. If a transport ignored abort and remained pending, this serial abstraction could not start its retry until settlement. A rejected promise cannot subsequently resolve into authorization or overwrite the accepted retry diagnostics. No artificial concurrency is needed.
- [Controller stage](../../src/turn/stages/controller.ts): retries reuse the same logical action, prior state and frozen narration; an optional budget-constrained timeout is the only per-attempt request variation. In this run the actual wire bodies are identical. Both attempts retain coordinator `base_revision: 1`.
- [Coordinator](../../src/turn/turn-coordinator.ts): retry completes before authorization. Checkpoints enforce the captured revision before authorization, preparation and final commit. Candidate preparation uses `expected_revision: base_revision`. There is one `campaign.commit(plan.receipt)` site, with no await/callback/yield between the final checkpoint and commit.
- [Campaign authority](../../src/campaign/campaign-state.ts): receipts are owned by the campaign, tied to the exact base snapshot, and consumed on commit. Foreign, stale, forged or reused receipts cannot commit. Thus multiple provider attempts cannot become multiple engine commits.

The transport creates no client request ID, operation ID or idempotency key. There is one stable campaign ID (`turn_fixture`) and captured revision, with fresh per-attempt transport cancellation resources. The local one-shot marker prevents rerunning this paid evaluation; it is not a production idempotency mechanism. Attempt 1 has no provider generation ID. Attempt 2 returned OpenRouter generation ID `gen-1791060083-jS6p7y2zNrm5Bo8oOltN`, retained in ignored raw output; the production `GenerationMetadata` does not expose it or use it for state authority. No new idempotency system was introduced.

## Deterministic coverage and validation

Two focused [D-05 tests](../../tests/d05-live-retry.test.ts) use the actual default policy and production adapter: injected 429 then one knowledge mutation equal to the single-success control; injected 429 then 503 exhaustion with zero authorization/commit/state effects. They verify byte-identical retry requests and unchanged state at each attempt.

Existing coverage is reused:

- [H5 retry tests](../../tests/provider-retry-h5.test.ts): four retryable classifications; non-retryable errors; HTTP 429 normalization; recovered controller retries with one commit and no duplicate commands; exhaustion; cancellation and stale revision during backoff; budgets and timeout caps.
- [Coordinator tests](../../tests/turn-coordinator.test.ts): stale proposals and mutation at the authorization event fail closed.
- [Campaign tests](../../tests/campaign-state.test.ts): expected revision enforcement and stale/foreign/forged/altered/reused receipt rejection.

Validation: `npm run typecheck` PASS; `npm test` 1,850 tests, 1,846 PASS, zero failures, the same four accepted TODOs; `npm run test:playthrough` 25/25 PASS.

Raw freeze, full provider response, serialized requests, per-attempt diagnostics, before/after snapshots and verdict are under ignored `saves/d05-retry/`. Headers and API keys are not logged. The evaluator has a create-exclusive paid-run marker and bounds transport attempts to two, with at most one actual dispatch.

D-04 remains CLOSED. D-06 remains unchanged and open pending broader structured-output soak. D-05 CLOSED: controlled injected transient plus a real retry attempt; failed attempts cannot mutate authority; exactly one commit/effect.
