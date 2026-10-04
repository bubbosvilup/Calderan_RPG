# D-09 Reflection Validator V2.1

## Root cause and narrow decision

V2 rejected two correct two-increase trust trajectories because its `requireOnly` check treated confirming snapshots and other-dimension changes as invalid support. V2.1 distinguishes proof from compatible context. Historical V2 remains untouched at source hash `2a74c0c184c8be3137199cd765a1130d4cb8b694c51da9b56c2b014912cc84a6`; 118 raw V2 files were hashed before implementation. The preserved selection contains both false negatives, six caught bad claims, four factual-error claims, and all 28 accepted useful claims. Original V2 artifacts were not overwritten.

V2.1 is an evaluation-only wrapper in `src/dev/reflection-v21.ts` around the frozen V2 schema, prompt, collector, renderer, and exact validators. No new claim type, free prose, model choice, cadence, cursor, D-10/D-26, campaign authority, movement, knowledge or retrieval changes. Required proof is selected structurally before the original V2 factual/entitlement checks execute. Invalid refs and subject mismatches are checked before selection so extras cannot hide invalid identity. Same-dimension cited events remain in the checked sequence; they cannot be discarded as context to fix a count.

## Evidence roles and scope

SUPPORTING: exact claim-specific source facts. CORROBORATING: directional snapshot independently matching a trajectory endpoint at/after the endpoint. CONTEXT: known authoritative same-subject evidence that makes no conflicting claim at the scoped revision. CONTRADICTORY: same-endpoint snapshot conflict, stale current comparison, or included events extending a proved sequence beyond its stated count/endpoint. IRRELEVANT: unknown semantic classes; rejected as citation pollution. Completely foreign-subject refs also reject. Known same-subject canon, membership, conditions, movements, legal/transaction facts, statements, aggregates and other dimensions may be contextual but never count as proof of another claim.

| Claim | Required support | Compatible extras | Conflicts still rejected |
| --- | --- | --- | --- |
| relationship_trajectory | Subject-owned target/dimension changes, exact contiguous sequence | Other dimensions; confirming snapshot; same-subject facts | Wrong count/direction/endpoint, missing in-scope changes, snapshot disagreeing at endpoint |
| relationship_parallel | Both owned dimension sequences, equal paths/counts | Other dimensions/snapshots/context | Unequal sequence/count/endpoints or omitted changes |
| relationship_contrast | Matching directional snapshot, or V2's compatible latest two-dimension state changes | Historical transitions and other subject facts | Unsupported dimension/state; same-time conflicts; stale snapshot |
| condition_trajectory | Exact ordered matching condition operations and additions count | Canon, other conditions, subject state context | Wrong operations/episodes or omitted in-scope operations; no healing inference |
| membership_trajectory | Exact household lifecycle operations/counts | Household rules/other subject events | Wrong join/leave/rejoin/migrate/counts or omitted lifecycle operation |
| movement_trajectory | Exact owned contiguous movements | Other subject facts/events | Wrong path/count/missing in-scope move; no psychology fields |
| self_statement_synthesis | Explicit selected contract refs across independent revisions | Canon, membership, movement, relationship facts | Missing/invalid statement refs, insufficient independence, unsafe quote; never performed-role inference |
| environmental_motif | Matching household rule events/count | Other subject/environment facts | Wrong count, no sufficient household event support, non-environmental payload |

Trajectory scope is the revision interval spanning all cited matching supporting events. An uncited later decline does not negate a historical rise. If that decline is cited as another matching transition, the declared interval includes it and exact checks reject wrong count/endpoint/direction. Snapshot corroboration does not turn a historical trajectory into a current-state claim. `relationship_contrast` is a recorded-state comparison and cannot choose an older cited snapshot over a newer authoritative snapshot in the catalog. No new provider scope fields or schema changes.

## Development regression and tests before OOS

Failed V2 OOS is DEVELOPMENT ONLY for V2.1. Exact original typed proposals are replayed, not rewritten. Results: false negatives recovered **2/2**; V2 caught bad retained **6/6**; factual rejections retained **4/4** (including diagnostic malformed response); V2-accepted useful preserved **28/28**. Development gate PASS. Whole-envelope malformation remains rejected separately and is not repaired.

Seven focused V2.1 tests cover supporting+context+snapshot acceptance, counts/direction/endpoints, missing support, included contradictory later decline, uncited historical decline, stale comparison snapshot, same-time contradictory snapshot, conditions/membership/movement with context, statement/environment entitlement, unknown references, foreign subjects, irrelevant semantics and psychology side channels. Existing V2 tests remain unchanged.

Before freeze: typecheck PASS; unit/integration **1,909 passed, zero failed, same four TODOs** (1,913 total); playthrough **25/25**. V2 provider reliability (40 parsed, seven malformed, one invalid length response from 48 calls) remains a separate unresolved issue. V2.1 does not tune prompt/schema, switch model/routing, increase tokens, or repair malformed output.

## Freeze and subsequent OOS

Candidate source, compiled source, immutable V2 dependency, schema, prompt, evidence version and reason codes are recorded in `v21-freeze.json` before OOS construction. Schema/prompt remain byte-identical serialized values to V2. Evidence version remains 2. The reason set adds only `contradictory_evidence` and `irrelevant_evidence`. Candidate is committed before corpus construction; no source changes during scored validation. OOS results and production decision will be recorded below.

| Freeze | SHA-256 |
| --- | --- |
| Candidate source | `158f5977f2e500def47d1a5477aff4c56168a58605a307e82cdad84391437072` |
| Compiled candidate | `f433b772c7a5b6e679c0a17dfa49749cbf46068aae8b135fc6e86dd434d127bd` |
| Schema, identical to V2 | `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba` |
| Prompt, identical to V2 | `fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09` |
| Reason code set | `01d826ff8cb12bcf1a57f3ac231e371de7f12dcfc2da561efd9ee2ac806d789a` |
| New OOS manifest | `a4ce459d6d7925ad8237b31714bca1ad91ddf201becb326cc0ac8045c757ee07` |
| Blind semantic review | `2ed31cf7cc2ea488a83539dc553bbe80ae7e5aee3e2896648c10d6cd6b3d157e` |

Candidate commit: `3771828` (`eval: fix reflection supporting evidence semantics`), before corpus construction. All hashes were verified again after scoring. V2 source and all 118 preserved historical raw files remain unchanged.

## New independent OOS

48 new request bodies: **24 deterministic fixtures and 24 scripted current-engine checkpoints; zero organic gameplay**. All 48 request hashes are unique and none matches V2 OOS. Inputs span the same eight closed claim families, with changed conditions, quoted statements, relationship targets, household IDs, paths and timelines. They include clean trajectories, compatible subject/dimension/household context, snapshots, later declines, multiple episodes/lifecycle loops, and empty-appropriate states. Scripted checkpoints result from actual engine operations; they are not campaign soak evidence. Request bodies, catalogs, source/opportunity categories, protocol and manifest were frozen before dispatch. Expected wording was not preregistered.

Protocol unchanged: `deepseek/deepseek-v4-flash-0731:nitro`, `max_tokens=600`, timeout 20,000 ms, provider `require_parameters=true`, reasoning `enabled=false, exclude=true`. **48 logical/physical calls, zero retries, zero rerolls**. All 48 receipts report Baidu. Known total cost **$0.035475864**, zero unknown costs. Successful-call latency (47 available measurements): median 1,693 ms, p95 4,690 ms, range 847–6,528 ms. The invalid response has a receipt/cost but no successful completion latency metadata.

**39 parsed envelopes (81.25%); eight malformed (16.67%); one `invalid_provider_response` with finish reason `length` (2.08%)**. Combined unusable envelopes: 9/48 (18.75%). Four parsed envelopes were empty. 84 complete proposals in valid envelopes; 24 additional complete objects extracted solely for diagnostic semantic review, including the first complete envelope within the invalid length response. Balanced-object extraction never repairs an envelope for acceptance. All 108 complete objects were reviewed, no unreviewable complete object remained.

Blind semantic judgments were finalized and hashed before first candidate-outcome computation. Reviewer: primary Codex agent, **not human and not independent**, with validator definitions known but candidate outcomes hidden. Review files contain per-object hash, reason, USEFUL/NEUTRAL/REDUNDANT/MISLEADING/HARMFUL, SHOULD_REACH_NARRATOR and separate FACTUAL_ERROR. Only USEFUL is marked narrator YES. The reviewer did not label a true attributed statement misleading merely because its outer/nested citation lists differ.

## Semantic result and comparison limitation

| Classification | All reviewed | Valid-envelope objects | Old diagnostic bridge accepted | V2.1 accepted |
| --- | ---: | ---: | ---: | ---: |
| USEFUL | 50 | 36 | 23 | 34 |
| NEUTRAL | 8 | 8 | 8 | 8 |
| REDUNDANT | 46 | 36 | 15 | 8 |
| MISLEADING | 4 | 4 | 4 | 0 |
| HARMFUL | 0 | 0 | 0 | 0 |

Old comparison uses the frozen V2 `legacyComparisonProposal` deterministic renderer and unchanged production validator over each complete valid-envelope batch, preserving batch duplicate suppression. Native old acceptance is zero because typed proposals do not match old free-prose schema. This compares validation behavior over the **same typed provider output**, not native old generation quality. Rendering already removes many old psychology-leakage opportunities; bridge labels are claim types and may suppress otherwise useful same-type proposals. Thirteen useful proposals are newly accepted relative to this bridge, while two old-bridge useful proposals are lost; 23 − 2 + 13 = 34. These counts must not be presented as general model-quality gains.

All four old-bridge accepted misleading claims are rejected (**100%, 4/4**): identical-dimension pseudo-parallel, membership operations substituted as movement locations, three respect transitions counted as two, and a discontiguous movement path with wrong endpoint. The last three are independently disprovable FACTUAL_ERROR claims; **3/3 rejected, zero admitted**. Eight old-accepted neutrals are retained, zero neutral collateral. Seven old-accepted redundant restatements are rejected. No factual/count/direction/ownership/entitlement checks were loosened.

### Two useful losses

Both are valid-envelope scripted self-statement outputs:

- `V21_engine_state_self_statement_1_1:0`: selected contract 0 and 1 correctly quote meal recordkeeping and reporting. Outer refs cite revision 6/8 contract-established history events instead of the quote handles.
- `V21_engine_state_self_statement_1_3:0`: selected contract 0 and 2 correctly quote meal recordkeeping and marking loaned tools on day 2. Outer refs cite the four matching contract-established events, while the nested selectors resolve to two actual quoted contracts.

These are accurately attributed stated commitments, not demonstrated performance or invented roles. The quotes exist and the nested reference handles resolve. Unlike V2's previously misleading statement selections, they are not nonexistent event-ID handles. V2.1 selects proof only from `evidence_refs ∩ statement_refs`, so both receive `missing_positive_evidence` and `claim_state_mismatch`. The semantic reviewer classified them USEFUL before decisions were computed; no labels were changed after reveal. A mechanical citation-contract mismatch remains real and requires a separately designed policy; it does not justify retrospectively calling the meaning false to obtain a passing gate.

## Extra-evidence result

Primary extra-evidence cohort requires a **valid envelope and support-only acceptance under unchanged V2 exact factual AND entitlement checks**, with the full catalog retained. This prevents wrong counts, fake parallel dimensions, or insufficient proof from being counted as otherwise supported extras. Cohorts can overlap.

| Otherwise supported claim plus extras | Accepted | Rejected | Interpretation |
| --- | ---: | ---: | --- |
| CORROBORATING | 0 | 0 | No eligible provider exposure; not a pass |
| Compatible CONTEXT | 1 | 0 | A supported two-rule environmental motif with membership context |
| CONTRADICTORY | 0 | 0 | No eligible provider exposure; not a pass |

Provider proposals containing corroborating snapshots were single-transition authority restatements or an invalid identical-dimension parallel claim; none was an independently entitled synthesis. The one scored compatible-context case is REDUNDANT by semantic review despite meeting structural environmental entitlement. Thus **zero fresh useful synthesis proposals with eligible extras** were observed. Several inputs offered the desired opportunities, but the unchanged provider generally cited exact proof only. Later trust declines were mostly represented correctly as mixed trajectories, rather than producing a fully supported prefix plus a conflicting extra. Wrong counts/paths were caught by exact checks, but they do not establish coverage of contradictory extras. Diagnostic malformed objects include one more supported environmental/context claim; it remains unaccepted because its envelope is invalid. Unit controls and development recovery support the implementation but cannot substitute for new OOS exposure. No extra calls or prompt tuning were performed to improve this result.

## Hard gate and production status

**HARD GATE FAIL**: useful lost **2**, required zero. Bad caught **4/4 (100%)**, bad escaped **0**, factual falsehood admitted **0**, neutral lost **0**. There is also insufficient fresh corroboration/contradiction exposure for the core role-specific claim. Development PASS did not carry over to an independent OOS PASS.

**Production candidate NO; production changed NO.** No V2.2/V3 tuning, migration, persisted-note envelope changes, pipeline integration, packing/retrieval changes or source changes after freeze. D-09 remains **SOAK PENDING**; this evaluation does not close it. D-04/D-05/D-10 remain closed; D-26 remains open for shadow collection. Cursor behavior remains unresolved separately.

## Artifacts, verification and next step

Ignored raw namespace: `saves/d09-reflection-v21/`. It retains historical preservation hashes, development replay, candidate freeze, frozen manifest/request/catalogs, raw outputs/receipts, physical-call ledger, diagnostic extraction, blind review/hash, batch old-bridge and V2.1 decisions, collateral rows, evidence roles/scopes, tests and final artifact hashes. Credential audit reads the local key privately and verifies zero artifact matches; no credential is stored in tracked artifacts. Tracked harness files support reproducibility without turning saved requests into new scored calls.

Checks passed before candidate freeze: typecheck; 1,909 unit/integration passes, zero failures, unchanged four TODOs; 25/25 playthrough. Candidate source, compiled artifact and V2 dependency remain frozen through final audit; post-freeze changes are evaluation harness/report only.

Next step: obtain an independent semantic review of the two preserved self-statement losses and explicitly decide the relationship between outer `evidence_refs`, nested `statement_refs`, and matching statement-event provenance before authorizing a successor task. Any successor needs a new freeze and genuinely new scored requests with enough realized useful corroboration/context and scoped contradiction exposure. Provider malformation remains a separate work item. No further tuning or production work is performed here.
