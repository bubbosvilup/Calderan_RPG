Turns: 175 (success 175, failure 0, abandoned 0); success 100.0%.

| Metric | Value |
|---|---|
| Failure codes | none |
| Failure phases | none |
| Provider codes (failed turns) | none |
| Narrator provider success | 100.0% (175/175) |
| Controller provider success / parse | 100.0% / 100.0% |
| Proposals / authorized / rejected | 35 / 3 / 32 (authorized 8.6%) |
| Audit issue rate / issues per turn | 16.6% / 0.18 |
| Issue kinds | player_agency: 9, uncommitted_condition: 9, asserts_uncommitted_transfer: 6, private_player_fact: 5, uncommitted_constraint: 2, invented_source: 1 |
| Reconciliation / clean / still bad | 16.6% / 19 / 10 |
| Redaction | 5.7% |
| Retry (turns) / first-attempt success | 0.0% / 100.0% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 28.6% / none: 125, lexical: 50 / 50 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 795150/33756, 764219/2823 |
| Estimated cost (USD) | 0.4726 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 175 | 4435 | 6634 | 7457 | 7918 |
| controller (incl. retries) | 175 | 1113 | 2478 | 5272 | 6704 |
| reconciliation | 29 | 3007 | 4242 | 4285 | 4285 |
| total turn | 175 | 6094 | 9915 | 11225 | 11692 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| A_conversation | 5 | 5 | 1 | 1 | 0 | 0 |
| B_movement | 5 | 5 | 3 | 3 | 0 | 0 |
| C_follower | 5 | 5 | 0 | 0 | 0 | 0 |
| D_carrying | 5 | 5 | 2 | 2 | 0 | 0 |
| E_handover | 5 | 5 | 0 | 0 | 0 | 0 |
| F_negotiation | 10 | 10 | 0 | 0 | 0 | 0 |
| G_purchase | 15 | 15 | 0 | 0 | 0 | 0 |
| H_late_naming | 20 | 20 | 1 | 1 | 0 | 0 |
| I_household | 5 | 5 | 0 | 0 | 0 | 0 |
| J_relationship | 5 | 5 | 1 | 1 | 0 | 0 |
| K_lore | 5 | 5 | 0 | 0 | 0 | 0 |
| L_restricted | 15 | 15 | 1 | 1 | 0 | 0 |
| M_ambiguous | 5 | 5 | 2 | 2 | 2 | 0 |
| N_refusal | 5 | 5 | 1 | 1 | 0 | 0 |
| O_departure | 5 | 5 | 0 | 0 | 0 | 0 |
| P_player_physical | 5 | 5 | 2 | 2 | 0 | 0 |
| Q_context_heavy | 5 | 5 | 0 | 0 | 0 | 0 |
| R_retrieval_heavy | 5 | 5 | 5 | 5 | 3 | 0 |
| S_reconciliation | 5 | 5 | 4 | 4 | 0 | 0 |
| T_noop | 5 | 5 | 0 | 0 | 0 | 0 |
| U_agency_offer | 5 | 5 | 0 | 0 | 0 | 0 |
| V_agency_threat | 5 | 5 | 1 | 1 | 1 | 0 |
| W_agency_follow | 5 | 5 | 1 | 1 | 1 | 0 |
| X_secret_holder | 5 | 5 | 1 | 1 | 1 | 0 |
| Y_left_behind | 10 | 10 | 3 | 3 | 2 | 0 |
| Z_two_names | 5 | 5 | 0 | 0 | 0 | 0 |
