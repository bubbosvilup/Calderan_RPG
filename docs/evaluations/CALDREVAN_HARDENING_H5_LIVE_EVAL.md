# Caldrevan hardening H5 — live evaluation artifact

Date: 2026-10-01. **Live status: BLOCKED.** `OPENROUTER_API_KEY` and `VOYAGE_API_KEY` are absent from the execution environment, so no paid provider call was made (0 calls, 0 tokens, $0). Every live metric requested by the brief is therefore **not measured**; none is estimated or invented. Machine-readable twin: `CALDREVAN_HARDENING_H5_LIVE_EVAL.json`.

## What was measured (offline, deterministic — not live)

Injection matrix (`tests/provider-failure-matrix-h5.ts`): 22 cases × 5 runs = 110 turns with a scripted provider, fake clock.

| | Retry enabled | Retry disabled (pre-H5 behaviour) |
|---|---:|---:|
| Turns | 110 | 110 |
| Successes | 50 | 0 |
| Single transient failure (429, timeout, network, 5xx; narrator, controller, reconciliation; empty narrator) | 50/50 recovered | 0/50 |
| Two consecutive transient failures | 0/40 (fail by design) | 0/40 |
| Non-retryable (malformed controller/response, auth, config) | 0/20, one attempt each | 0/20 |
| Turns with more than one commit | 0 | 0 |
| Commits on failed turns | 0 | 0 |

Happy-path bookkeeping (offline, 7×100 turns): 2.45 ms without retry layer, 2.37 ms with it (difference is noise). One transient failure with the real 250–500 ms backoff: median 364 ms (min 268, max 463).

## Harness ready for the live stages

`node .build/src/dev/eval-live-h5.js` — 26 scenarios (A–T plus agency, secrecy, continuity), 35 turns per run (175 turns at 5 runs, 350 at 10). Guards: exit 3 BLOCKED without key; exit 2 REFUSED above `--max-turns` (default 120); `--max-tokens` (default 600000); `--budget-usd` with explicit prices (no prices are baked in). Recommended order: (1) `--no-retry --runs 5` baseline, (2) default retry `--runs 5`, (3) unstable/critical scenarios `--runs 15`–`20`, (4) `--semantic` with a Voyage key. Aggregate with `aggregate-diagnostics.js`; output is JSON plus markdown, no prompts or canon.
