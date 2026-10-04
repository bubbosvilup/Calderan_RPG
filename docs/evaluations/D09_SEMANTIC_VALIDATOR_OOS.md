# D-09 fresh out-of-sample semantic validator gate

Date: 2026-10-04. **HARD GATE: FAIL. Production unchanged. D-09 SOAK PENDING.**

The frozen candidate rejected one of seven old-accepted misleading proposals (14.29%), preserved all five old-accepted useful proposals, and left six misleading proposals accepted. A 14.29% catch rate is materially below 50%; it does not qualify as a “somewhat lower” catch rate despite zero measured collateral damage. No rule changes, production integration, or post-integration calls were performed.

This is an explicitly independent dataset, not a reconstruction of the permanently unavailable original 148-proposal corpus. The original corpus was not recovered or used for scoring. D-10 remains CLOSED; D-26 remains OPEN — SHADOW DATA COLLECTION.

## Rule freeze and security

Required and measured SHA-256:

`cb3abd33b661decc8a62a8b980c15686f8589fe2fffa04728d171baa87c693cc`

Matched before construction/provider calls and checked again before scoring. `semantic-rules.mjs` was never edited. All four rules, including passive membership, remained enabled.

`git check-ignore` confirmed `APIKEY.env` and `saves/d09-semantic-oos/` artifacts are ignored. No credential file is tracked. A tracked-file scan found no OpenRouter key matching the real-key prefix and length pattern. Credentials were loaded locally into the process environment, never logged or stored in raw artifacts.

## Corpus and preregistration

| Item | Result |
| --- | ---: |
| Total frozen requests | 40 |
| Played / organic requests | 0 |
| Deterministic current-engine fixtures | 40 |
| Condition trajectories | 6 |
| Relationship trajectories | 6 |
| Self-statements / contracts | 6 |
| Membership / household context | 6 |
| Movement / activity | 6 |
| True / false tension | 6 (3 / 3) |
| Empty-appropriate | 4 |

Manifest SHA-256:

`5c92c8dcc980d48949bfcdfa9c0f6cf4a9537b7024463c6b5f6545b2bc3c9e1a`

The manifest was written and hashed before dispatch. Every request has its own hash, character, evidence refs/catalog, evidence family, input-opportunity expectation, validation context, command trace, and snapshot hash. Expectations classify inputs, not generated outputs. No manifest/request edits followed dispatch.

All evidence comes from normal `CampaignState.apply` commands followed by production `reflectionEvidence`. No raw reflection notes or development entries were fabricated. Snapshots and exact commands are retained. Engine commands are intentionally exercised in a noncanonical test world; these results are fixtures, not played or organic usefulness evidence. No narrator/controller gameplay calls were made.

Coverage limitations: world time remains 100 across command revisions, so the fixtures do not establish real-time behavioral frequency. The catalog exposes recorded states, moves, contracts, and household events, but not supply-management acts. The coordinating-role input therefore contains two explicit self-statements, **not an observed-action quartermaster control**. The desired richer played/current-engine mix and mandatory repeated-action role control were not achieved. These limitations preclude a strong production-candidacy claim independently of the low catch rate. No new controls were added after results appeared.

## Provider

| Item | Result |
| --- | --- |
| Model | `deepseek/deepseek-v4-flash-0731:nitro` |
| Setup | Actual unchanged `OpenRouterReflectionProvider` |
| Schema / prompt | Current production, hashes preregistered |
| Output budget | 600 tokens |
| Reasoning | `exclude: true`, `enabled: false` |
| Routing | `require_parameters: true` |
| Timeout | Production default, 20,000 ms |
| Logical / physical calls | 40 / 40 |
| Transport retries | 0 |
| Quality rerolls | 0 |
| Provider-reported cost | USD 0.012066496 |
| Provider failures | 0 |
| Empty accepted envelopes | 16 |
| Malformed envelopes | 1 |
| Parsed proposals | 45 |
| Additional proposals in malformed envelope | 2 |

Only one response per request was generated. No Qwen, strict alternative schema, ranking arms, or second candidate version was used. Full response bodies, usage, request-body hashes, and per-call ledger entries are retained.

## Semantic review and same-output comparison

Production parsing/validation ran first. A separate evidence-bearing review file omitted candidate outcomes. The primary Codex agent manually classified all 45 parsed proposals against the actual catalog, with `SHOULD_REACH_NARRATOR` YES/NO and reasons. The completed review was saved and hashed before candidate execution. This is **agent review, not human review and not an independent reviewer**. The reviewer knew the frozen rule definitions, although computed candidate outcomes were hidden until the review was frozen.

Review SHA-256:

`7e3ba88751ece5b02d3e3889e1ad3a2c5db5c2ba4af1a78dc7e951680dbc88df`

Procedure deviation: the initial review-record extraction omitted the two proposals inside a markdown-fenced, production-malformed response (`OOS_empty_2`). Both received a separately labeled supplemental review **after candidate reveal**: membership restatement REDUNDANT, single-move pattern MISLEADING; narrator NO for both. The original blind review stayed immutable. The fenced response was never repaired for acceptance and these proposals never enter the primary metrics. All generated proposal text is now retained and classified, but a fully blind review of every generated proposal was not achieved.

USEFUL requires synthesis of at least two pieces/episodes, preservation of authority, later narrative value beyond keeping raw facts, and no invented psychology, motive, identity, tension, or causality. Character-irrelevant literal truth is not automatically NEUTRAL. YES is assigned only to useful synthesis in this review. Classification is evidence-aware but subjective; no human review has confirmed it.

The unchanged old validator was rerun offline and its result compared with the dispatch-time result. The candidate consumed only old-accepted proposals from those exact outputs. No output was generated separately for the candidate.

## Primary metrics

| Classification | Old accepted | New accepted | Newly rejected |
| --- | ---: | ---: | ---: |
| USEFUL | 5 | 5 | 0 |
| NEUTRAL | 5 | 5 | 0 |
| REDUNDANT | 7 | 7 | 0 |
| MISLEADING | 7 | 6 | 1 |
| HARMFUL | 0 | 0 | 0 |
| Total | 24 | 23 | 1 |

BAD_CAUGHT: **1**. BAD_ESCAPED: **6**. USEFUL_REJECTED: **0**. NEUTRAL_REJECTED: **0**. REDUNDANT_REJECTED: **0**.

Bad acceptance rate OLD: **7/24 = 29.17%**. NEW: **6/23 = 26.09%**. These rates use each validator's accepted-proposal denominator. Against the fixed 24 old-accepted proposals, the new residual bad share is 6/24 = 25.00%. Twenty-one of the 45 parsed proposals were rejected by production; their reasons and semantic classifications are retained.

## Per-rule findings

| Frozen rule | Newly rejected | Useful lost | Observation |
| --- | ---: | ---: | --- |
| `reflection_restates_authority` | 0 | 0 | No measured rejection in old-accepted outputs |
| `passive_membership_not_character_evidence` | 1 | 0 | Correctly rejected a rules-only Gerome role |
| `tension_from_missing_provenance` | 0 | 0 | Missed absence wording outside its frozen vocabulary |
| `unsupported_character_inference` | 0 | 0 | No rejection; unsupported interpretations outside its vocabulary escaped |

Counts are rule findings on old-accepted proposals. Zero activity is not proof of a rule's precision or overblocking safety.

The correct passive-membership rejection was `OOS_membership_3:0`, `receiving_household_rules`: “Gerome's membership in the household is marked by its new rules, not by his actions in adding them.” All cited entries are household rules explicitly not his acts. Denying authorship does not turn those rules into a Gerome role. The environmental `shared_motif` in `OOS_membership_6:0` stayed allowed; review classified it REDUNDANT because it adds no relational meaning.

Six misleading proposals escaped:

| Proposal | Finding |
| --- | --- |
| `OOS_condition_1:1` | Missing healing record framed as tension; “not indicated” escapes the absence vocabulary |
| `OOS_relationship_6:0` | Openness / measured regard inferred from raw trust/respect values |
| `OOS_self_statement_1:1` | `none → low` trust incorrectly described as a downward shift from neutral |
| `OOS_membership_6:2` | Claims two joins after initial membership; evidence contains one rejoin |
| `OOS_movement_1:0` | “Without settling” overinterprets movement records |
| `OOS_tension_1:1` | Says trust rose once, but the cited records show two raises; independence also overclaimed |

No rule was broadened to catch these examples.

## Positive controls

Eight generated parsed proposals were reviewed USEFUL. Five reached the old validator's accepted set; **all five were preserved**, with **zero candidate failures** among exposed useful outputs. They comprise two independent-condition syntheses, two trust/respect trajectory contrasts, and one parallel trust/wariness trajectory.

Three useful proposals were already rejected by production:

| Proposal | Old rejection |
| --- | --- |
| `OOS_self_statement_6:0` — role from two explicit supply statements | `insufficient_evidence` (contracts count as zero events) |
| `OOS_tension_1:0` — coexisting trust/wariness | `tension_without_contrast` (no required lexical connector) |
| `OOS_tension_3:0` — coexisting trust/wariness | `insufficient_evidence` (one relationship ref) |

Literal movement chronology was preserved without candidate rejection; the only generated four-move pattern added “without settling” and was misleading. Literal multi-step trust inputs generated tension-kind proposals rejected by the old validator. Explicit stoic/restless statement inputs did not yield an old-accepted, genuinely useful trait synthesis. Trust/affection contrast was present as input but no useful combined output exposed it. Thus these positive-control families do not prove candidate sensitivity/precision. The observed-action quartermaster control was not available in this corpus and is not represented as passed.

## Decision, production, and post-integration live check

**HARD GATE: FAIL.** Zero useful loss passes the strict collateral constraint, but catching 1/7 bad proposals is too low to pass the effectiveness requirement. Limited controls and review deviations reinforce the conservative decision. The exception for a somewhat lower catch rate was not used to stretch a 14.29% result into a pass.

Production candidate performed: **NO**. Structured ownership implemented: **NO**. Template regex removed: **NO**. Production changed: **NO**. Existing evaluation-only English-template ownership remains in the frozen candidate; it was not shipped. No fifth rule, vocabulary expansion, LLM validator, rewrite, or automatic promotion was added.

Post-integration live performed: **NO**, because the gate failed. Calls: **0**. Useful lost / bad newly rejected: **N/A**. Cost: **USD 0**.

## Tests and artifacts

| Check | Result |
| --- | --- |
| Typecheck | PASS |
| Unit/integration | 1,893 passed, 0 failed, 4 existing TODOs (1,897 total) |
| Focused playthrough | 25 passed, 0 failed |
| Frozen rule / manifest / request / review hashes | PASS |
| Old-validator replay parity | PASS |
| Credential ignore / tracked credential checks | PASS |

Ignored artifacts reside under `saves/d09-semantic-oos/`: manifest and hash, snapshots and commands, frozen requests/catalogs, raw outputs, provider ledger/usage/cost, blind review records, immutable semantic review and hash, supplemental malformed review, old/new outcomes, per-rule findings, and test logs. `artifact-hashes.json` records artifact hashes. No credentials are included. Evaluation scripts under `docs/evaluations/d09-reflection/oos-*.mjs` make the design, review decisions, and scoring inspectable; builders/review writers refuse to overwrite frozen artifacts. The raw corpus remains local and ignored, so a checkout alone cannot replay the paid outputs.

## D-09 status and next step

**D-09 SOAK PENDING.** This task does not establish persistence, later packing/retrieval, narrative benefit, or ablation evidence and does not close D-09.

The next narrowly scoped task should review the six escapes and missing positive-control exposure with a human reviewer, then separately preregister any revised candidate and a richer independent corpus containing actual owned actions. Preserve this failed corpus and the frozen four-rule result; do not tune rules and rescore this run as a new OOS pass.

Git delivery: evaluation/report changes only, commit message `eval: validate reflection semantics out of sample`. No production commit. Push is contingent on green tests, ignored credentials, and a clean working tree.
