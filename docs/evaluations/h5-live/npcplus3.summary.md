Turns: 50 (success 50, failure 0, abandoned 0); success 100.0%.

| Metric | Value |
|---|---|
| Failure codes | none |
| Failure phases | none |
| Provider codes (failed turns) | none |
| Narrator provider success | 100.0% (50/50) |
| Controller provider success / parse | 100.0% / 100.0% |
| Proposals / authorized / rejected | 0 / 0 / 0 (authorized n/a) |
| Audit issue rate / issues per turn | 48.0% / 0.76 |
| Issue kinds | absent_participant: 28, player_agency: 6, private_player_fact: 2, uncommitted_constraint: 2 |
| Reconciliation / clean / still bad | 48.0% / 14 / 10 |
| Redaction | 20.0% |
| Retry (turns) / first-attempt success | 0.0% / 100.0% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 60.0% / lexical: 30, none: 20 / 30 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 320879/12691, 202060/300 |
| Estimated cost (USD) | 0.1848 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 50 | 4956 | 6060 | 6576 | 6576 |
| controller (incl. retries) | 50 | 987 | 2609 | 3137 | 3137 |
| reconciliation | 24 | 2967 | 3903 | 4123 | 4123 |
| total turn | 50 | 6988 | 10633 | 12997 | 12997 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| HH_D_follow | 10 | 10 | 10 | 10 | 0 | 0 |
| HH_C_relationship | 10 | 10 | 2 | 2 | 0 | 0 |
| CH_public | 10 | 10 | 10 | 10 | 10 | 0 |
| CH_private | 10 | 10 | 2 | 2 | 0 | 0 |
| CH_unrelated | 10 | 10 | 0 | 0 | 0 | 0 |
