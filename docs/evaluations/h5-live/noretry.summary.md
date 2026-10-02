Turns: 175 (success 174, failure 1, abandoned 0); success 99.4%.

| Metric | Value |
|---|---|
| Failure codes | controller_failed: 1 |
| Failure phases | controller: 1 |
| Provider codes (failed turns) | structured_output_invalid: 1 |
| Narrator provider success | 100.0% (175/175) |
| Controller provider success / parse | 99.4% / 99.4% |
| Proposals / authorized / rejected | 37 / 6 / 31 (authorized 16.2%) |
| Audit issue rate / issues per turn | 14.9% / 0.16 |
| Issue kinds | uncommitted_condition: 13, asserts_uncommitted_transfer: 6, player_agency: 4, private_player_fact: 3, uncommitted_constraint: 1 |
| Reconciliation / clean / still bad | 14.9% / 14 / 12 |
| Redaction | 6.9% |
| Retry (turns) / first-attempt success | 0.0% / 99.4% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 28.6% / none: 125, lexical: 50 / 50 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 784473/33304, 760117/3089 |
| Estimated cost (USD) | 0.4667 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 175 | 4235 | 6554 | 7334 | 7418 |
| controller (incl. retries) | 175 | 1101 | 2698 | 3599 | 5543 |
| reconciliation | 26 | 2936 | 4015 | 4424 | 4424 |
| total turn | 175 | 5924 | 9544 | 11404 | 12754 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| A_conversation | 5 | 5 | 1 | 1 | 1 | 0 |
| B_movement | 5 | 5 | 1 | 1 | 0 | 0 |
| C_follower | 5 | 5 | 0 | 0 | 0 | 0 |
| D_carrying | 5 | 4 | 2 | 2 | 0 | 0 |
| E_handover | 5 | 5 | 2 | 2 | 1 | 0 |
| F_negotiation | 10 | 10 | 0 | 0 | 0 | 0 |
| G_purchase | 15 | 15 | 1 | 1 | 1 | 0 |
| H_late_naming | 20 | 20 | 1 | 1 | 1 | 0 |
| I_household | 5 | 5 | 0 | 0 | 0 | 0 |
| J_relationship | 5 | 5 | 0 | 0 | 0 | 0 |
| K_lore | 5 | 5 | 0 | 0 | 0 | 0 |
| L_restricted | 15 | 15 | 0 | 0 | 0 | 0 |
| M_ambiguous | 5 | 5 | 0 | 0 | 0 | 0 |
| N_refusal | 5 | 5 | 2 | 2 | 0 | 0 |
| O_departure | 5 | 5 | 1 | 1 | 1 | 0 |
| P_player_physical | 5 | 5 | 1 | 1 | 0 | 0 |
| Q_context_heavy | 5 | 5 | 2 | 2 | 1 | 0 |
| R_retrieval_heavy | 5 | 5 | 2 | 2 | 2 | 0 |
| S_reconciliation | 5 | 5 | 4 | 4 | 0 | 0 |
| T_noop | 5 | 5 | 2 | 2 | 2 | 0 |
| U_agency_offer | 5 | 5 | 2 | 2 | 1 | 0 |
| V_agency_threat | 5 | 5 | 0 | 0 | 0 | 0 |
| W_agency_follow | 5 | 5 | 1 | 1 | 0 | 0 |
| X_secret_holder | 5 | 5 | 1 | 1 | 1 | 0 |
| Y_left_behind | 10 | 10 | 0 | 0 | 0 | 0 |
| Z_two_names | 5 | 5 | 0 | 0 | 0 | 0 |
