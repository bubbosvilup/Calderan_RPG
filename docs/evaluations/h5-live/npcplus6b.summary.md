Turns: 36 (success 36, failure 0, abandoned 0); success 100.0%.

| Metric | Value |
|---|---|
| Failure codes | none |
| Failure phases | none |
| Provider codes (failed turns) | none |
| Narrator provider success | 100.0% (36/36) |
| Controller provider success / parse | 100.0% / 100.0% |
| Proposals / authorized / rejected | 0 / 0 / 0 (authorized n/a) |
| Audit issue rate / issues per turn | 8.3% / 0.08 |
| Issue kinds | uncommitted_condition: 2, asserts_uncommitted_transfer: 1 |
| Reconciliation / clean / still bad | 8.3% / 2 / 1 |
| Redaction | 2.8% |
| Retry (turns) / first-attempt success | 0.0% / 100.0% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 16.7% / none: 30, lexical: 6 / 6 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 138857/6557, 143497/220 |
| Estimated cost (USD) | 0.0849 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 36 | 3874 | 5278 | 24126 | 24126 |
| controller (incl. retries) | 36 | 937 | 1963 | 2013 | 2013 |
| reconciliation | 3 | 2718 | 3263 | 3263 | 3263 |
| total turn | 36 | 5222 | 9239 | 25020 | 25020 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| RF_care | 6 | 6 | 2 | 2 | 1 | 0 |
| RF_disagree | 6 | 6 | 0 | 0 | 0 | 0 |
| RF_protect | 6 | 6 | 0 | 0 | 0 | 0 |
| RF_ritual | 6 | 6 | 0 | 0 | 0 | 0 |
| RF_contra | 6 | 6 | 1 | 1 | 0 | 0 |
| RF_unrelated | 6 | 6 | 0 | 0 | 0 | 0 |
