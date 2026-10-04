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
