# Caldrevan controller switch to Qwen

Date: 2026-10-03. **Migration authorized for main; Qwen is the new production baseline. Production controller frozen: NO.**

Previous: `deepseek/deepseek-v4-flash-0731:nitro`. New default: `qwen/qwen3.8-flash`.

[Round 2](CALDREVAN_CONTROLLER_MODEL_BAKEOFF_ROUND_2.md) favored Qwen: precision 100% vs 81.8%, feasible recall 92.9% vs 64.3%, exact 28/29 vs 22/29, with approximately one additional second per call. This independent mini-validation did **not** reproduce perfect proposal precision.

## Configuration

`src/llm/openrouter/state-controller.ts` owns the single production default and generic `OpenRouterStateControllerProvider`. The old DeepSeek module is a compatibility re-export of that implementation, with no fallback. Production and developer wiring use the neutral name. Existing model environment overrides remain supported. Provider status exposes `controller_model`; controller diagnostics retain the exact requested model and optional OpenRouter upstream provider (Alibaba in this run).

Controller policy and evidence schema SHA-256 match Round 2 exactly. Max output 512, non-streaming, reasoning disabled/excluded, strict JSON schema, `require_parameters:true`, 20-second default timeout, authorization, replay and `DEFAULT_RETRY_POLICY` are unchanged. HTTP 429 still maps to `rate_limited` and the existing retry tests pass. Reflection retains its former DeepSeek default instead of silently inheriting Qwen; explicit overrides remain supported. Narrator selection and canon are unchanged.

## Offline checks

- `npm run typecheck`: passed.
- `npm test`: 1760 passed, 0 failures, same 4 accepted TODOs (1764 total).
- `npm run test:playthrough`: 25/25 passed.
- Upstream telemetry test verifies that the reported provider does not replace the requested model ID.

## Targeted live validation

Exactly 16 calls / 16 HTTP 200 responses, one sample per case; zero paid narrator calls. `node scripts/controller-switch-qwen.mjs --prepare` freezes production-shaped requests and engine-verified gold before `--run`. It uses the production controller default without a model override, production retry policy, scripted finalized narration, and authoritative coordinator replay. Raw requests/responses, frozen gold, and summary remain ignored under `saves/controller-switch-qwen/`.

| Metric | Result |
|---|---|
| Structured JSON / strict schema / production parser | 16/16 each |
| Correct required proposals / false proposals / missed required proposals | 8 / 2 / 0 |
| Precision / feasible recall | 80.0% / 100.0% |
| Exact proposal cases / strict abstentions | 14/16 / 6/8 |
| Optional engine-owned visible movement | 1 correct proposal; excluded from required recall |
| Authoritative final state matches | 16/16 |
| Unauthorized commits / duplicate effects / invented IDs / private sentinel leaks | 0 / 0 / 0 / 0 |
| Wrong-source knowledge **commits** | 0 (one wrong-source proposal rejected) |
| Retries / HTTP errors / unrecovered errors | 0 / 0 / 0 |
| E2E latency mean / median / P95 | 2.031s / 2.078s / 2.901s |
| Generation mean / median / P95 | 2.031s / 2.078s / 2.900s |
| Prompt / completion tokens | 35537 / 816 |
| Total reported cost | $0.002969750 (OpenRouter usage.cost; cache-dependent) |

The two false proposals were **k06_wrong_source** (severe: Maren lacks the fact; `rejected_controller_mismatch`) and **d01_already_known** (moderate redundant grant; `rejected_already_established`). Both were rejected by unchanged authorization. No rerolls or prompt changes were made to conceal these results. All eight required commands were authorized, including temporary departure, affection and combined telling/affection. Repeated-embrace validation produced one adjustment with no duplicated state effect. Visible-destination NPC movement matched the engine-owned gold path.

| Case | Required TP | FP | FN | Engine result |
|---|---:|---:|---:|---|
| `a01_quiet` | 0 | 0 | 0 | abstain |
| `k01_direct` | 1 | 0 | 0 | gold state matched |
| `k06_wrong_source` | 0 | 1 | 0 | gold state matched |
| `d01_already_known` | 0 | 1 | 0 | gold state matched |
| `r01_affection` | 1 | 0 | 0 | gold state matched |
| `r04_politeness` | 0 | 0 | 0 | abstain |
| `m03_temporary_exit` | 1 | 0 | 0 | gold state matched |
| `m02_refusal` | 0 | 0 | 0 | abstain |
| `m01_independent_return` | 0 | 0 | 0 | gold state matched |
| `x02_knowledge_affection` | 2 | 0 | 0 | gold state matched |
| `d03_repeated_embrace` | 1 | 0 | 0 | gold state matched |
| `a07_secret_unknown` | 0 | 0 | 0 | abstain |
| `k04_pronoun` | 1 | 0 | 0 | gold state matched |
| `k05_one_recipient` | 1 | 0 | 0 | gold state matched |
| `a05_incomplete` | 0 | 0 | 0 | abstain |
| `a03_future` | 0 | 0 | 0 | abstain |

Private boundary checks confirm that the frozen controller input excludes the fixture's hidden-secret sentinel; output and authoritative state audits found no leakage or unexpected writes. These 16 sampled cases establish safety for the checked paths, not broader model reliability.

## Debt and verdict

**D-05 remains open:** no natural transient/429 occurred; no live failure was forced. **D-06 remains open:** Not observed after Qwen switch; insufficient soak to close.

Offline and engine-safety validation are green; proposal-quality validation has two failures. The user authorized merging switch commit `0413ab0` into main and accepted both rejected false proposals as known bounded controller-quality issues: all 16 authoritative states were correct, all eight required commands were recovered, and no unauthorized commits, duplicate effects, invented IDs or private leakage occurred. Qwen is the production baseline for subsequent debt-closure work; **production controller frozen: NO**. D-19 remains relevant for proposal/reconciliation quality. No additional paid validation was run, and no prompt or authorization semantics were changed for this merge. Post-merge validation passed: typecheck, 1,760 passing tests with zero failures and the same four accepted TODOs, and 25/25 playthrough. Production default and provider status both report `qwen/qwen3.8-flash`; narrator and reflection selections are preserved.
