Turns: 48 (success 48, failure 0, abandoned 0); success 100.0%.

| Metric | Value |
|---|---|
| Failure codes | none |
| Failure phases | none |
| Provider codes (failed turns) | none |
| Narrator provider success | 100.0% (48/48) |
| Controller provider success / parse | 100.0% / 100.0% |
| Proposals / authorized / rejected | 6 / 6 / 0 (authorized 100.0%) |
| Audit issue rate / issues per turn | 25.0% / 0.33 |
| Issue kinds | absent_participant: 5, private_player_fact: 4, player_agency: 4, uncommitted_condition: 2, uncommitted_constraint: 1 |
| Reconciliation / clean / still bad | 25.0% / 11 / 1 |
| Redaction | 2.1% |
| Retry (turns) / first-attempt success | 0.0% / 100.0% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 37.5% / none: 30, lexical: 18 / 18 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 218538/10039, 186194/582 |
| Estimated cost (USD) | 0.1324 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 48 | 4470 | 6406 | 6505 | 6505 |
| controller (incl. retries) | 48 | 965 | 1653 | 2699 | 2699 |
| reconciliation | 12 | 2427 | 4152 | 4152 | 4152 |
| total turn | 48 | 5927 | 10535 | 10946 | 10946 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| HH_A_one | 6 | 6 | 1 | 1 | 0 | 0 |
| HH_B_group | 6 | 6 | 0 | 0 | 0 | 0 |
| HH_C_relationship | 6 | 6 | 3 | 3 | 0 | 0 |
| HH_D_follow | 6 | 6 | 6 | 6 | 1 | 0 |
| HH_E_rule | 6 | 6 | 0 | 0 | 0 | 0 |
| HH_F_self | 6 | 6 | 1 | 1 | 0 | 0 |
| HH_G_private | 6 | 6 | 1 | 1 | 0 | 0 |
| HH_H_unrelated | 6 | 6 | 0 | 0 | 0 | 0 |
