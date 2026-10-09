# State Controller model bakeoff — Round 3

**Date:** 2026-10-08 · **Decision:** GPT-6 Luna primary, Claude Haiku 5.5 fallback (via OpenRouter native `models` fallback). Qwen3.8 Flash retired; DeepSeek V4 Pro rejected.

Machine-readable results: [controller-bakeoff-round-3-summary.json](controller-bakeoff-round-3-summary.json). Raw per-call cells stay in the git-ignored `saves/controller-benchmark/bakeoff-1/`.

## Method

- **Contract (identical for every model):** the production `OpenRouterStateControllerProvider`: `CONTROLLER_POLICY`, the `{player_action, prior_state, final_narration}` envelope, the strict `campaign_proposal_with_evidence` JSON schema, `max_tokens: 512`, `reasoning: {exclude: true, enabled: false}`, non-streaming, `provider: {require_parameters: true, allow_fallbacks: true}`, 20 s timeout, the shared production retry policy (2 attempts). Each model was called **directly** (no model fallback). No model-specific prompt changes.
- **Cases:** 101, frozen before any paid call ([src/dev/controller-benchmark-cases.ts](../../src/dev/controller-benchmark-cases.ts)): 29 Round 2 cases, 30 from the Phase 1O evidence corpus, 42 engine-grounded variants of existing regression tests. Groups: items 19, ownership 4, economy 4, relationships 10, knowledge 23, conditions 4, movement/time 11, household/legal 6, ambiguous language 6, multi-mutation 9, no-op 5. 62 cases expect no controller command; 39 carry 52 controller-owned mutations; 3 use ordinary adult prose as robustness input.
- **Gold:** every expected proposal was replayed through the real TurnCoordinator authorization and commit and had to be authorized and deterministic. Cases where the engine commits the change without any proposal (2 household-member movement cases) count those commands as engine-owned, never as model recall. Stale `expected_revision` rejection is model-independent and checked once as a harness invariant.
- **Scoring:** primary = final authoritative state matches gold state. Recall = expected mutations proposed **and** accepted. Precision = correct proposals / all proposals (engine-owned excluded).
- **Runs:** 2 full runs × 101 cases × 4 models = 808 calls, sequential, model order rotated per case.
- **Reproduce:** `npm run benchmark:controller -- prepare --out DIR`, then `run --out DIR --runs 2 <models...>`, then `summarize --out DIR` (or `rescore`, which re-replays stored proposals offline).

## Results (202 cases per model)

| Model | Full-case accuracy | Accuracy when a response came back | Recall | Precision | False positives (accepted) | Missed | Auth rejects | JSON/schema/length failures | HTTP 429 | p50 / p95 latency | Cost / 100 turns |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **openai/gpt-6-luna** | **94.6%** | 94.6% | 84.6% | **78.9%** | 24 (0) | 16 | 22.4% | 0 | 0 | **1.63 / 2.35 s** | $0.020 |
| anthropic/claude-haiku-5.5 | 93.6% | 93.6% | 85.6% | 56.3% | 69 (0) | 15 | 43.1% | 0 | 0 | 1.80 / 2.32 s | $0.080 |
| deepseek/deepseek-v4-pro | 68.8% | 72.8% | 25.0% | 31.5% | 50 (1, a deduplicated duplicate) | 69 | 67.1% | 11 | 0 | 3.35 / 13.86 s | $0.104 |
| qwen/qwen3.8-flash | 33.2% | 100% (67 cases) | 100% | 71.7% | 13 (0) | 0 | 27.7% | 0 | **305** | 7.08 / 13.29 s | $0.013 |

Category accuracy (state match %):

| Model | items | ownership | economy | relationships | knowledge | conditions | movement/time | household/legal | ambiguous | multi-mutation | no-op |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Luna | 94.7 | 100 | 100 | 100 | 100 | 100 | 100 | 58.3 | 100 | 77.8 | 100 |
| Haiku | 100 | 100 | 100 | 75 | 100 | 100 | 100 | 83.3 | 100 | 66.7 | 100 |
| DeepSeek V4 Pro | 81.6 | 62.5 | 100 | 45 | 84.8 | 50 | 81.8 | 58.3 | 25 | 27.8 | 100 |

Qwen's category numbers mostly reflect rate-limit failures, so they are not shown.

- **Run-to-run:** Luna 94.1% / 95.0% (1 unstable case); Haiku 93.1% / 94.1% (1); DeepSeek 66.3% / 71.3% (7).
- **Luna vs Haiku:** 16 paired disagreements, 7 against Luna and 9 against Haiku. Exact McNemar p = 0.80, so accuracy is statistically indistinguishable.
  - Luna misses household rule/leave declarations and two list/participle item receipts.
  - Haiku misses simple embrace/confide relationship steps and multi-relationship turns.
  - Both miss the protectiveness step in a household oath and the affection step after a tell.
- **Safety:** no model got invented state committed. Haiku's 69 false positives, mostly item transfers in no-transfer cases, were all rejected by authorization.
- **Adult prose:** Luna and Haiku scored 100% on these cells with no refusals or false positives. No model refused anywhere.

## Decision

1. **Primary: GPT-6 Luna.** It ties Haiku on full-state accuracy and wins on the next criteria: precision / fewer false positives, latency, and roughly 4× lower cost. Haiku is billed for about 7.5k prompt tokens on the same request where Luna reports about 3k.
2. **Fallback: Claude Haiku 5.5.** It's a different vendor with comparable accuracy, zero transport/schema failures in this run, and complementary strengths (household declarations, list receipts).
3. **Qwen3.8 Flash retired** from the controller route. 66.8% of its calls (135/202) failed even after retry: 305 HTTP 429s, every one `limit_source: upstream_provider_shared_pool`, `provider_name: Alibaba`, on its single OpenRouter endpoint. Where it did answer (same 67 cells), its quality matched Luna's.
4. **DeepSeek V4 Pro rejected.** It had 25% recall, repeatedly proposed spurious `set_knowledge` commands, produced 11 schema/length failures, and had a p95 of 13.9 s. 135/202 of its calls were routed to StreamLake fp8, so some of this may be provider-specific.

## Limitations

- One synthetic household world plus the canonical market and Heartstone fixtures.
- The case mix leans towards abstention (62% of cases expect no commands).
- Some truth labels come from the Phase 1O corpus, which is marked as pending human review.
- The household category is small (6 cases), so Luna's household weakness should get a targeted follow-up.
- The former production fallback `deepseek/deepseek-v4.1-flash` was not part of this run.
