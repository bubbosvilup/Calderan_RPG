Turns: 48 (success 48, failure 0, abandoned 0); success 100.0%.

| Metric | Value |
|---|---|
| Failure codes | none |
| Failure phases | none |
| Provider codes (failed turns) | none |
| Narrator provider success | 100.0% (48/48) |
| Controller provider success / parse | 100.0% / 100.0% |
| Proposals / authorized / rejected | 0 / 0 / 0 (authorized n/a) |
| Audit issue rate / issues per turn | 10.4% / 0.10 |
| Issue kinds | unsourced_history: 3, uncommitted_condition: 1, asserts_uncommitted_transfer: 1 |
| Reconciliation / clean / still bad | 10.4% / 3 / 2 |
| Redaction | 4.2% |
| Retry (turns) / first-attempt success | 0.0% / 100.0% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 16.7% / none: 40, lexical: 8 / 8 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 188957/8179, 190620/294 |
| Estimated cost (USD) | 0.1125 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 48 | 3505 | 4591 | 4846 | 4846 |
| controller (incl. retries) | 48 | 943 | 1760 | 2922 | 2922 |
| reconciliation | 5 | 2564 | 3249 | 3249 | 3249 |
| total turn | 48 | 4608 | 7779 | 8592 | 8592 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| RF_care | 8 | 8 | 1 | 1 | 1 | 0 |
| RF_disagree | 8 | 8 | 3 | 3 | 1 | 0 |
| RF_protect | 8 | 8 | 0 | 0 | 0 | 0 |
| RF_ritual | 8 | 8 | 0 | 0 | 0 | 0 |
| RF_contra | 8 | 8 | 1 | 1 | 0 | 0 |
| RF_unrelated | 8 | 8 | 0 | 0 | 0 | 0 |
