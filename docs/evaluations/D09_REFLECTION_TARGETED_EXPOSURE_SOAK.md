# D-09 targeted missing-exposure soak

**Semantic PASS · Exposure INSUFFICIENT · Reliability STABLE · D-09 SOAK PENDING.** Production is unchanged and integration is not authorized by this result.

## Freeze

| Component | SHA-256 / setting |
|---|---|
| V2.3 | `10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d` |
| CVC | `fe0986ec9ce684287cc4c5f6e4b3f0de8a88767d61286041bd870e06b5dfca70` |
| Canonical schema | `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba` |
| Prompt | `fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09` |
| WIRE_ALIBABA_V2_CVC generator | `0b42b45e4664473e0fc3de864bf396b829ebc1e622c13a6b90ed2849066cbbeb` |

All matched before dispatch and after scoring. Model `qwen/qwen3.8-flash`; Alibaba only, `require_parameters:true`, no fallbacks, strict request-scoped JSON Schema, 600 tokens, 20-second timeout, reasoning disabled/excluded. V3 pacing remains concurrency 1, launch floor 1000 ms, completion gap 250 ms, Retry-After honored, fallback 6000/12000 ms, maximum two attempts. The task-specific physical cap is 32; the inherited qualification freeze retains its historical 48-call policy metadata, while the actual targeted manifest policy overrides the cap to 32.

No frozen source, prompt, schema, wire algorithm, production code or production routing changed.

## Corpus

24 captured cases, four per cohort; 20 logical provider requests dispatched. Planned split: 12 deterministic fixtures / 12 scripted engine checkpoints. Dispatched split: 10 / 10. Organic: zero. Both groups use deterministic engine commands and exported CampaignState; the checkpoint group includes captured command traces and state but shares the same fixture family. These are correlated synthetic opportunities, not independent organic captures.

Manifest SHA-256: `68286328c286700ce552ec8374ac594056d564b7372cdf13530773ea1f70017c`. All 24 request bodies are distinct. Two characters, reversed directed relationships, four concrete statement pairs, distinct households, and distinct time advances supply controlled variation.

EVENT exposes exact typed statement events with hidden quote records. MIXED exposes one quote and one exact source event. CORROBORATING supplies three trust increases plus a matching current snapshot. CONTRADICTORY supplies two increases followed by a decline. HISTORICAL_CONTRAST exposes owned trust and wariness changes while keeping the later simultaneous current snapshot hidden. ENVIRONMENTAL supplies three coherent wet-clay, shelf-marking and firing-inspection rules across revisions.

**Budget deviation:** four environmental cases were retained as local capacity controls and not dispatched. The frozen environmental claim carries only household, event type and occurrence count; its renderer emits a rule-addition count and a non-authorship disclaimer. It cannot express the operational meaning required by this request. The previous OOS rubric already excludes count-only output from USEFUL. Paying for four more count-only outputs would reprove an established limitation. This leaves F unexposed and insufficient; it is not a successful completion of the preferred 24-provider-request target.

## Reliability

| Observation | Result |
|---|---:|
| Planned / dispatched logical / physical | 24 / 20 / 20 |
| First usable / final usable | 20 / 20 |
| Retries / recovered | 0 / 0 |
| 429 / wire-invalid / canonical-invalid | 0 / 0 / 0 |
| Visibility-invalid / enum violations | 0 / 0 |
| Malformed / length / timeout | 0 / 0 / 0 |
| Valid empty | 2 |
| Inference cost, USD | 0.003416748 |
| Median latency | 4052.604 ms |
| P95 latency, nearest rank | 5901.353 ms |

All receipts report Alibaba and `finish_reason:stop`. One authentication preflight was performed separately from inference calls. No confirmation batch, repair, truncation, selector rewriting, deduplication or semantic reroll occurred. The pipeline was wrapper → finish → exact JSON.parse → dynamic wire → canonical structure → CVC visibility → blind review freeze → semantic evaluation. Two valid empties remained empty. Reliability is an observation on this targeted batch, not a new provider qualification.

## Blind review

Reviewer: **primary Codex agent, explicitly not human**. Every final strict usable proposal was read against its cited facts, attributed statements and full hidden authority before computing provider semantic outcomes. Candidate validation outcomes were unseen; the reviewer knew the frozen rules and previously validated synthetic input controls. Independence is limited to outcome blindness, not independent personnel or a fresh rubric.

Review SHA-256: `4e801c31eb20d5ef4cb8842231f4d4d8ada932c25368ab5e33decc5b5acb7c64`. Review records include proposal hashes, source witnesses, reasons and the five requested flags. Scoring checks that review and response bytes still match their frozen hashes.

| Classification | Reviewed | Accepted |
|---|---:|---:|
| USEFUL | 22 | 22 |
| NEUTRAL | 0 | 0 |
| REDUNDANT | 0 | 0 |
| MISLEADING | 7 | 0 |
| HARMFUL | 0 | 0 |

The seven misleading proposals were inappropriate same-dimension contrasts or contrasts asserting an absent affection dimension as `none`. One also asserted simultaneous `none` and `high` trust. They do not establish contradictory-extra exposure because their core contrast is independently invalid. The useful proposals preserve grounded attributed synthesis, multi-event trajectories and one simultaneous contrast.

## Event-equivalent

Four input opportunities; three realized eligible syntheses; three useful accepted. `TARGET_EVENT_1:0`, `2:0`, `3:0` cite both exact source events with their typed selectors and authoritative hidden quote records. Request 4 returned valid empty. Four synthetic mismatched-selector controls reject; zero provider invalid-selector proposals. **PASS** (required ≥2).

## Mixed provenance

Four opportunities; three realized eligible syntheses; three useful accepted. `TARGET_MIXED_1:0`, `3:0`, `4:0` cite one direct quote and one exact source event. Request 2 returned valid empty. Four synthetic incorrect-provenance controls reject; zero provider mismatch proposals. **PASS** (required ≥1).

## Corroborating extras

Four opportunities; zero realized eligible proposals; zero eligible useful accepted or rejected. All four useful trajectories cite the three historical changes and omit the independently corroborating snapshot. A snapshot cited in a separate invalid contrast does not corroborate the trajectory proposal. Four local standalone-core controls pass and the input construction checks the supported core with the matching snapshot. **INSUFFICIENT** (required ≥2 realized useful accepted).

## Contradictory extras

Four opportunities; zero realized eligible proposals; zero eligible accepted or rejected. Providers correctly summarize all three changes as `none → low`, mixed direction, three transitions. None asserts the otherwise valid two-change `none → moderate` core while additionally citing the decline. Invalid contrasts receive no contradictory-extra credit. Four local correct-prefix controls pass and four prefix-plus-decline controls reject. **INSUFFICIENT** (required ≥2 realized eligible rejected).

## Historical contrast

Four opportunities; one realized eligible useful contrast accepted: `TARGET_HISTORICAL_CONTRAST_4:0`. It cites all five owned history events, no current snapshot handle; the unique later hidden directional snapshot verifies moderate trust and high wariness. Other requests emit separate trajectories, which receive no contrast credit. Request 3 cites other-dimension history as compatible context, not independent corroboration. Four local current-authority mismatch controls and four stale-authority controls reject; no provider mismatch/stale proposals occurred. **INSUFFICIENT** (required ≥2).

## Environmental synthesis

Four rich input opportunities, zero dispatched, zero realized useful, zero useful accepted. All four local canonical motifs render count-only REDUNDANT meaning despite richer sources. Four local added-psychology-field controls reject. No provider psychology or motive output was generated for F. The frozen schema/renderer capacity ceiling remains unresolved. **INSUFFICIENT** (required ≥2).

## Safety

USEFUL lost: **0**. Factual false admitted: **0**. Stale violations admitted: **0**. Performed-role leakage admitted: **0**. Misleading/harmful escaped: **0**. Neutral collateral: **0**. These figures refer to the 29 reviewed provider proposals, not to fabricated or capacity-control proposals. No harmful or neutral provider proposals were observed, so their zero counts establish no new exposure.

36 local control records comprise eight correct-core positives, four environmental capacity records, and 24 negative controls. Expected positive/negative outcomes all match. They preserve the requested selector, provenance, contradiction, stale/mismatch and environmental psychology controls, while remaining explicitly separate from realized provider exposure.

## Gates

| Cohort | Opportunities | Realized eligible | Useful accepted | Eligible rejected | Gate |
|---|---:|---:|---:|---:|---|
| EVENT | 4 | 3 | 3 | 0 | PASS |
| MIXED | 4 | 3 | 3 | 0 | PASS |
| CORROBORATING | 4 | 0 | 0 | 0 | INSUFFICIENT |
| CONTRADICTORY | 4 | 0 | 0 | 0 | INSUFFICIENT |
| HISTORICAL_CONTRAST | 4 | 1 | 1 | 0 | INSUFFICIENT |
| ENVIRONMENTAL | 4 local | 0 | 0 | 0 | INSUFFICIENT |

**Semantic PASS; Exposure INSUFFICIENT; Reliability STABLE. Production integration authorized: NO. Production changed: NO. D-09: SOAK PENDING.**

Fresh required checks: `npm run typecheck` PASS; `npm test` 1972 passed, zero failures, same four TODOs; `npm run test:playthrough` 25/25, zero failures. Pre-dispatch `*-before.log` files are explicitly copied prior provider-qualification green logs for unchanged frozen sources; the final logs above were freshly executed for this task.

## Limitations

Twenty requests provide limited, correlated provider exposure. Agent source review is not human review. A/B are established only for these exact captures; C/D/E/F remain insufficient. F was not dispatched. Local negative controls are synthetic. Raw artifacts are workspace-local and ignored by git; tracked harness/report files document their generation and verification but do not replace the receipts.

Artifacts under `saves/d09-reflection-targeted-exposure/` retain the manifest with requests/hashes/snapshots/catalogs/wire schemas/command traces, provider raw outputs and receipts, physical ledgers, strict validation, hashed blind review, semantic results, cohort proof, cost/latency, execution and decision freezes, and test logs. No credentials are retained. Verification scans exact credential bytes plus token patterns without printing secrets.

## Next step

No redesign or automatic second soak was performed. The remaining cohorts are C, D, E and F. A future single narrowly targeted soak requires explicit authorization; input design alone cannot guarantee that providers cite extras. Environmental useful meaning cannot be established by further count-only inference under the current frozen contract, so resolve that requirement/expressiveness conflict in a separately authorized scope before spending additional environmental inference budget. Production integration remains pending all six realized exposure gates.
