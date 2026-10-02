Turns: 105 (success 104, failure 1, abandoned 0); success 99.0%.

| Metric | Value |
|---|---|
| Failure codes | controller_failed: 1 |
| Failure phases | controller: 1 |
| Provider codes (failed turns) | structured_output_invalid: 1 |
| Narrator provider success | 100.0% (105/105) |
| Controller provider success / parse | 99.0% / 99.0% |
| Proposals / authorized / rejected | 8 / 0 / 8 (authorized 0.0%) |
| Audit issue rate / issues per turn | 14.4% / 0.16 |
| Issue kinds | uncommitted_condition: 8, player_agency: 6, invented_source: 1, private_player_fact: 1, asserts_uncommitted_purchase: 1 |
| Reconciliation / clean / still bad | 14.4% / 13 / 2 |
| Redaction | 1.9% |
| Retry (turns) / first-attempt success | 0.0% / 99.0% |
| Retry reasons / recovered calls / unrecovered | none / 0 / 0 |
| Retrieval triggered / modes / lexical fallbacks | 26.7% / none: 77, lexical: 28 / 28 |
| Commit success | 100.0% |
| Tokens (narrator in/out, controller in/out) | 475948/19732, 442344/1038 |
| Estimated cost (USD) | 0.2800 |

| Latency (ms) | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| narrator (incl. retries) | 105 | 4090 | 5921 | 7354 | 11490 |
| controller (incl. retries) | 105 | 893 | 1968 | 2551 | 2688 |
| reconciliation | 15 | 2755 | 3485 | 3485 | 3485 |
| total turn | 105 | 5482 | 8932 | 10496 | 12664 |

| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |
|---|---:|---:|---:|---:|---:|---:|
| A_conversation | 4 | 4 | 0 | 0 | 0 | 0 |
| B_movement | 4 | 4 | 0 | 0 | 0 | 0 |
| C_follower | 4 | 4 | 0 | 0 | 0 | 0 |
| Y_left_behind | 8 | 8 | 2 | 2 | 1 | 0 |
| G_purchase | 12 | 12 | 1 | 1 | 0 | 0 |
| H_late_naming | 13 | 12 | 1 | 1 | 0 | 0 |
| O_departure | 4 | 4 | 1 | 1 | 0 | 0 |
| K_lore | 4 | 4 | 0 | 0 | 0 | 0 |
| J_relationship | 4 | 4 | 0 | 0 | 0 | 0 |
| U_agency_offer | 4 | 4 | 2 | 2 | 0 | 0 |
| N_refusal | 4 | 4 | 4 | 4 | 0 | 0 |
| L_restricted | 12 | 12 | 0 | 0 | 0 | 0 |
| HH_A_one | 4 | 4 | 0 | 0 | 0 | 0 |
| HH_B_group | 4 | 4 | 0 | 0 | 0 | 0 |
| HH_C_relationship | 4 | 4 | 2 | 2 | 1 | 0 |
| HH_D_follow | 4 | 4 | 2 | 2 | 0 | 0 |
| CH_public | 4 | 4 | 0 | 0 | 0 | 0 |
| CH_private | 4 | 4 | 0 | 0 | 0 | 0 |
| CH_unrelated | 4 | 4 | 0 | 0 | 0 | 0 |
