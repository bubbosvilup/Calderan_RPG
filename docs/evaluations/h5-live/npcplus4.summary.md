Turns: 36 (success 36, failure 0, abandoned 0); success 100.0%.

| Metric | Value |
|---|---|
| Failure codes | none |
| Failure phases | none |
| Provider codes (failed turns) | none |
| Narrator provider success | 100.0% (36/36) |
| Controller provider success / parse | 100.0% / 100.0% |
| Proposals / authorized / rejected | 0 / 0 / 0 (authorized n/a) |
| Audit issue rate / issues per turn | 25.0% / 0.25 |
| Issue kinds | absent_participant: 4, player_agency: 4, uncommitted_constraint: 1 |
| Reconciliation / clean / still bad | 25.0% / 9 / 0 |
| Redaction | 0.0% |
| Retry (turns) / first-attempt success | 0.0% / 100.0% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 75.0% / lexical: 27, none: 9 / 27 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 199279/7616, 145852/216 |
| Estimated cost (USD) | 0.1139 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 36 | 4535 | 6081 | 42096 | 42096 |
| controller (incl. retries) | 36 | 1069 | 2437 | 2498 | 2498 |
| reconciliation | 9 | 2550 | 3875 | 3875 | 3875 |
| total turn | 36 | 6028 | 12368 | 43052 | 43052 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| HH_D_follow | 9 | 9 | 5 | 5 | 0 | 0 |
| CH_public | 9 | 9 | 3 | 3 | 0 | 0 |
| CH_private | 9 | 9 | 1 | 1 | 0 | 0 |
| CH_unrelated | 9 | 9 | 0 | 0 | 0 | 0 |
