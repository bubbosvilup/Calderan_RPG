Turns: 220 (success 220, failure 0, abandoned 0); success 100.0%.

| Metric | Value |
|---|---|
| Failure codes | none |
| Failure phases | none |
| Provider codes (failed turns) | none |
| Narrator provider success | 100.0% (220/220) |
| Controller provider success / parse | 100.0% / 100.0% |
| Proposals / authorized / rejected | 63 / 2 / 61 (authorized 3.2%) |
| Audit issue rate / issues per turn | 22.3% / 0.26 |
| Issue kinds | asserts_uncommitted_transfer: 21, private_player_fact: 16, uncommitted_condition: 10, player_agency: 9, uncommitted_constraint: 1 |
| Reconciliation / clean / still bad | 22.3% / 35 / 14 |
| Redaction | 6.4% |
| Retry (turns) / first-attempt success | 0.0% / 100.0% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 36.4% / none: 140, lexical: 80 / 80 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 1016862/41171, 929310/4607 |
| Estimated cost (USD) | 0.5971 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 220 | 3994 | 6405 | 7265 | 8102 |
| controller (incl. retries) | 220 | 955 | 1831 | 2527 | 3945 |
| reconciliation | 49 | 2968 | 3916 | 4611 | 4611 |
| total turn | 220 | 5539 | 9367 | 11049 | 13032 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| D_carrying | 10 | 10 | 1 | 1 | 1 | 0 |
| S_reconciliation | 10 | 10 | 10 | 10 | 1 | 0 |
| E_handover | 10 | 10 | 3 | 3 | 1 | 0 |
| R_retrieval_heavy | 10 | 10 | 7 | 7 | 5 | 0 |
| T_noop | 10 | 10 | 3 | 3 | 3 | 0 |
| U_agency_offer | 10 | 10 | 3 | 3 | 0 | 0 |
| Q_context_heavy | 10 | 10 | 1 | 1 | 1 | 0 |
| N_refusal | 10 | 10 | 5 | 5 | 0 | 0 |
| B_movement | 10 | 10 | 4 | 4 | 0 | 0 |
| O_departure | 10 | 10 | 1 | 1 | 0 | 0 |
| C_follower | 10 | 10 | 1 | 1 | 0 | 0 |
| Y_left_behind | 20 | 20 | 3 | 3 | 1 | 0 |
| L_restricted | 30 | 30 | 1 | 1 | 0 | 0 |
| X_secret_holder | 10 | 10 | 1 | 1 | 0 | 0 |
| H_late_naming | 40 | 40 | 2 | 2 | 0 | 0 |
| W_agency_follow | 10 | 10 | 3 | 3 | 1 | 0 |
