# D-09 citation visibility contract — V2.3-CVC

Evaluation candidate reviewed 2026-10-04, Europe/Rome. **Semantic development PASS; citation visibility PASS; request-scoped wire local PASS.** New inference/API/web calls: **0**. Production unchanged. D-09 SOAK PENDING. Frozen V2/V2.1/V2.2/V2.3 sources and artifacts, and all six files from the failed wire experiment, are preserved. This is a local development replay, not new independent semantic OOS or provider qualification.

## CURRENT CONTRACT BUG

V2.3 treats existence in the full authoritative catalog as sufficient reference eligibility. It can therefore accept a model-supplied hidden snapshot or hidden historical context reference even though the provider never received that handle. Hidden authority remains valid for deterministic checks; it does not grant a citation right.

The candidate adds a visibility rejection before an object can be accepted. It calls the unchanged V2.3 validator with the full captured authoritative catalog, preserves its diagnostics/current-authority logic, and retains the original batch rendering and duplicate-claim checks. No schema, prompt, source facts, provenance relation or reflection claim family is expanded.

An important correction to the earlier [failed wire report](STRUCTURED_REFLECTION_WIRE_V2.md): a record omitted from `request.evidence` is not necessarily a hidden **handle**. The frozen requests already expose some quote handles through exact typed `provenance.statement_ref` and `payload.authoritative_statement.statement_ref`. The earlier generator examined only root `evidence[].ref` and incorrectly excluded those exposed selectors. That historical report and its failure artifacts remain unchanged; this report records the new, more precise finding.

## VISIBLE VS AUTHORITATIVE

| Classification | Provider may supply | Validator may consult |
| --- | --- | --- |
| PROVIDER_VISIBLE_AND_CITABLE | Exact same-subject, uniquely authoritative root handles; exact statement handles already exposed in verified typed statement metadata | Full authoritative facts and existing proof checks |
| HIDDEN_VALIDATION_AUTHORITY | No unexposed handle as a direct citation/statement selector | Current truth, contradiction, freshness/closedness and existing provenance linkage |
| VISIBLE_PROVENANCE_TO_HIDDEN_AUTHORITY | Visible exact source-event ref plus a received exact typed statement selector; or appropriate visible relationship histories | Exact linked quote record or directional current snapshot, without rewriting model refs |

`reflectionCitationContext` captures the request and full catalog separately. Root eligibility checks exact identity, subject, owner, revision, type, event ID and authoritative payload fields. Embedded quote selectors are recognized only at the two existing typed fields above, and must match an existing unique `statementProvenance` link. Existing authoritative_statement exposure also checks the exact quote. Unrelated text mentioning an ID, partial matches, guessed names and invented metadata grant no eligibility.

Every model evidence ref must be in the captured citable domain; every statement ref must be a received, verified statement handle. Rejection reasons are `citation_not_visible` and `statement_selector_not_visible`. The candidate never exposes missing identifiers, removes hidden authority from validation, performs fuzzy matching or invents a free-text field.

## IMPOSSIBLE-CITATION AUDIT

Audited 324 unique reviewed objects: 108 V2.2-development objects inherited from V2.1 provider outputs, 100 V2.2 OOS objects also replayed for V2.3 development, and 116 V2.3 OOS objects. The reused 100-object development set is counted once. Actual-provider origin was verified against archived attempt text/parsed objects; fixture versus scripted engine describes the **input**, not whether the output was synthetically manufactured.

| Reviewed objects violating citation visibility | Count |
| --- | ---: |
| Total | 35 |
| Useful | 0 |
| Neutral | 0 |
| Redundant | 0 |
| Misleading | 35 |
| Harmful | 0 |
| Actual provider outputs | 35 |
| Synthetic/unverified reviewed outputs | 0 |
| Citations to an existing truly hidden authoritative entry | 0 |

All 35 occur in V2.3 OOS and were already rejected: altered prefixes, paths, generic labels, foreign-looking IDs and prose are not valid received citation handles. There is no reviewed useful hidden-handle loss to preserve.

One useful event-equivalent V2.3 output is absent from root-handle lists but **not impossible**: `V23_OOS_fixture_self_statement_synthesis_2_1:0` cites visible events and selects `npcmem:brenna:contract:0` / `npcmem:brenna:contract:1`; those exact quote selectors were already transmitted in typed event metadata. It remains accepted without adding any hidden field to the request.

Separately, 15 unreviewed objects from archived invalid/retry attempts violate visibility. They are real provider-attempt diagnostics, not members of reviewed U/N/R/M acceptance denominators; no quality class is assigned retroactively. Together these give 50 actual provider proposal occurrences with visibility violations, across reviewed and unreviewed strata.

The prior 29,415 generated local wire samples are evaluation-only confidence/context/provenance variants. CVC excludes 951 variants with truly unexposed evidence refs (hidden snapshots and hidden history events). They have no independent U/N/R/M labels and were not provider outputs. The earlier accepted hidden snapshot counterexample was constructed by adding hidden context offline, not discovered as a reviewed useful model output. These 951 synthetic exclusions are reported separately from the 50 provider occurrences; the combined count is 1,001 heterogeneous occurrences, not a semantic quality denominator.

Full request IDs, exact paths/values, provider-origin checks, proposals and classification strata: `saves/d09-reflection-citation-visibility/impossible-citation-audit.json` and `synthetic-wire-citation-audit.json`.

## CLAIM-FAMILY EFFECTS

Relationship trajectory/parallel/contrast retain their original proof and current-state policies. Hidden snapshots are no longer optional model citations. Compatible **visible** context remains permitted. Appropriate visible history is still required for historical support.

Condition, membership, movement and environmental families were audited and replayed. No accepted reviewed claim in these families requires an unexposed supporting handle. Hidden arbitrary context is not legitimized, and no new hidden-support resolution is added. Movement wire locations remain literal endpoints of eligible visible movement evidence; repeated locations remain legal. Environmental evidence stays household context, never NPC authorship.

## SELF-STATEMENT PROVENANCE

V2.2 resolves each `claim.statement_refs` value by exact `statement_ref`; its source event may substitute only in `evidence_refs`. An event ID is **not** already a statement selector. That existing distinction remains unchanged.

A quote record may be omitted while its exact statement selector is exposed on a linked visible event. The provider can select that received handle; the validator resolves the existing event/statement/revision/field identity to the retained quote authority. Both direct and event-equivalent forms continue to pass where the received selectors and unchanged provenance checks support them. Root evidence citation of an embedded exact quote handle is legal because that handle was actually received; the quote record itself need not be present.

If a visible event contains no quote selector at either existing typed field, the model cannot legally guess the hidden statement handle. That direct hidden selector is rejected. No reviewed legitimate claim needs an unexposed selector. A future event-only presentation that deliberately removes both selector fields would need a separately reviewed smallest change: explicitly allow a visible event selector in `statement_refs`, uniquely resolve it through the existing provenance identity, and enforce quote-identity uniqueness. This task does not implement that extension, rewrite claims or infer selectors. No new field or schema adjustment is needed for the captured corpus.

## RELATIONSHIP CURRENT AUTHORITY

Visible owned history for both dimensions still permits V2.3's comparison against an uncited hidden current directional snapshot. The full catalog remains available, the verified authority_ref remains diagnostic only, and original model references remain unchanged.

Matching hidden current authority passes. Mismatch, missing/ambiguous/foreign authority, relevant events newer than the snapshot and stale cited snapshots retain rejection. A hidden current snapshot directly cited by the model fails visibility; the same handle explicitly present in the request is legal subject to unchanged freshness/truth checks.

## REGRESSION

All 116 reviewed V2.3 OOS objects were replayed in their original request batches. Review labels and provider receipts were not changed.

| Requirement | Result |
| --- | ---: |
| Previously useful accepted | 35 |
| Preserved | 35/35 |
| Misleading admitted | 0/63 |
| Factual false admitted | 0 |
| Neutral collateral | 0 |
| Stale violations | 0 |

The 100 V2.2 OOS/V2.3 development objects and 108 earlier V2.2-development objects are also archived in the replay. Seven focused repository tests cover visible citations, direct hidden/foreign/unrelated rejection, matching and mismatching hidden relationship authority, freshness/ambiguity, exposed exact event-to-quote provenance, true guessed hidden selectors, forged metadata, batch duplicates and canonical uniqueness. Historical semantic sources remain byte-for-byte unchanged.

## WIRE LOCAL EQUIVALENCE

After semantic development PASS, the same 40 frozen requests and representative generated samples were rechecked. The new equivalence domain is: canonical-structural-valid, citation-contract-valid outputs accepted by V2.3-CVC. Arbitrary catalog-derived hidden citations are excluded from that domain explicitly.

`reflection-wire-v2-cvc.ts` retains the original provider wire design: clone V1, omit provider-unsupported uniqueItems, add exact request-domain enums for evidence refs, statement refs and movement endpoints, retain all other bounds/closed structures, and omit impossible empty-domain families. It uses finalized CVC domains, including already-visible typed quote selectors; the old failed generator is preserved unchanged. No additional finite ID fields or provider keyword experiments were added.

| Metric | Result |
| --- | ---: |
| Frozen requests | 40 |
| Accepted representative samples | 28,464 |
| Excluded by citation contract | 951 |
| Wire false rejections | 0 |
| Safety negatives | 205 passed |
| Wire local gate | PASS |

All eight claim families remain represented. Schema byte min/median/max: 3,973 / 4,310 / 5,140 UTF-8 bytes. No provider grammar/token burden is inferred. See [local wire recheck](STRUCTURED_REFLECTION_WIRE_V2_LOCAL_RECHECK.md) for coverage and the exact next paid screen.

## DECISION

**V2.3-CVC semantic/citation development PASS. WIRE_ALIBABA_V2_CVC_LOCAL contextual gate PASS.** These are local-only qualifications. Alibaba enum enforcement and provider reliability remain unmeasured; no inference, authentication, endpoint metadata or web call occurred. Production unchanged; D-09 SOAK PENDING.

Reproduce locally with `npm run build --silent` and `node docs/evaluations/d09-reflection/citation-visibility-audit.mjs`. Artifacts and candidate hashes are in `saves/d09-reflection-citation-visibility/`; frozen historical artifacts and failed wire artifacts are hash-verified unchanged. The audit contains no dispatch path.

Next step, requiring a separate task authorizing paid calls: one 24-request Alibaba reliability screen with the captured CVC request domains, frozen prompt/model/routing/token/timeout settings and V3 pacing. Do not dispatch from this task or silently reuse the failed candidate's runner.

Verification: `npm run typecheck` PASS; `npm test` 1,972 passed, zero failures, same four TODOs; `npm run test:playthrough` 25/25. `citation-visibility-verify.mjs` checks preserved historical/source hashes, candidate hashes, regression and wire gates, test logs, zero dispatch and credential absence. The prior failed wire candidate and this local CVC candidate are recorded in separate commits; raw saves remain ignored and local.
