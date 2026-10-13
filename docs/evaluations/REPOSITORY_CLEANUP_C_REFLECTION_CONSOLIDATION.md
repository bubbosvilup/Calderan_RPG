# Repository Cleanup C: Reflection consolidation

Status: Historical report, 2026-10-13. Baseline main `4dc4f05` (Repository Cleanup B2). Scope: production Reflection structure only. No gameplay, save schema, NarrationFacts, authority, Keep track, Actual Offer or canonical-name change; no live or image call.

## 1. Summary

Production Reflection was a cumulative version ladder of eight modules in `src/turn/structured/` (V2, V2.1, V2.2, V2.3, V2.3-CVC, E1, the wire and the V2-CVC wire), each wrapping the previous one, and `src/dev/` held near-verbatim copies of all of them plus one wire profile production never used (REPO-5). After Cleanup C:

- production is **four current-purpose modules**: one evidence catalog, one schema, one validation path and one wire path, with no version ladder;
- the nine dev copies moved with `git mv` to `tests/frozen/reflection/`, changing only their import paths, and serve as the **frozen test oracle**;
- `tests/reflection-consolidation-equivalence.test.ts` proves production returns **exactly** what the oracle returns: 61,015 claim validations over seven real campaign histories and every visibility slice, about 8,700 batch evaluations, the wire projection per context, and the schema, prompt and version constants. Every claim family is accepted at least once and 23 distinct rejection reasons occur;
- persisted strings are unchanged: `semantic_version` `V2.3-CVC-E1` and wire versions `WIRE_ALIBABA_V2_CVC_LOCAL` / `WIRE_ALIBABA_V2_CVC_E1_LOCAL`;
- REPO-5 is closed and TEST-4 partly closed.

Reflection stays optional, OFF by default and non-authoritative; nothing in the optional-write path changed.

## 2. C1: the live chain before Cleanup C

| Module (old) | Lines | Role | Wrapped |
| --- | --- | --- | --- |
| `reflection-v2.ts` | 238 | evidence catalog, claim schemas, `V2_SCHEMA`, `V2_SYSTEM`, exact claim-fact validation, rendering | (none) |
| `reflection-v21.ts` | 92 | support / context / contradiction evidence roles | V2 |
| `reflection-v22.ts` | 47 | statement provenance links in the catalog and quote-access validation | V2, V2.1 |
| `reflection-v23.ts` | 41 | current directional relationship-snapshot authority for contrasts | V2.2 |
| `reflection-v23-cvc.ts` | 57 | citation visibility: only refs the request made visible | V2.3 |
| `reflection-v23-cvc-e1.ts` | 76 | `environmental_shared_rule_text` claim; `E1_SCHEMA`, `E1_SYSTEM`, the production entry points | V2.3-CVC |
| `reflection-wire.ts` | 20 | provider schema without `uniqueItems` (`WIRE_ALIBABA_V1`) | V2 |
| `reflection-wire-v2-cvc.ts` | 16 | visibility-scoped enums on the wire | wire |

Total: 587 production lines. Only the E1 layer was entered by production, through three importers:

- `src/turn/structured-reflection-maintenance.ts` (catalog, context, evaluation, visibility check, wire);
- `src/turn/reflection.ts` (types only);
- `src/llm/openrouter/reflection-provider.ts` (the system prompt).

The dev copies (612 lines) differed from production only in import paths plus a one-line header, which the old `tests/production-structured-reflection.test.ts` asserted line by line.

## 3. C2: behavioral freeze

The oracle is the dev chain, moved unchanged to `tests/frozen/reflection/`. `git diff -M` shows only import-path lines changed, and the old production files were those same sources apart from the header and import paths, so the oracle is the pre-cleanup production behavior.

`tests/reflection-consolidation-equivalence.test.ts` (2 tests, deterministic):

- **Corpora.** Seven real campaign histories built with the engine (`turnFixture`):
  - household rules sharing exact segments (uniform and mixed);
  - relationship contrast;
  - relationship trajectory with reversals;
  - character contracts as self-statements;
  - movement, condition episodes, and household leave/rejoin;
  - one combined history.
- **Catalogs.** For each history, `reflectionEvidenceCatalog` and `statementProvenance` must deepEqual the oracle's `structuredReflectionEvidenceE1` and V2.2 `statementProvenance`.
- **Contexts.** Built from full visibility, no visibility, each single ref removed (up to eight), and each evidence type alone. `reflectionContext` must deepEqual `environmentalE1Context`, and `reflectionWire` must deepEqual `citationScopedReflectionWireE1`.
- **Proposals.** For every claim family, plausible proposals are built from the catalog, then mutated one field at a time:
  - refs dropped, added, duplicated, reordered, or unknown;
  - wrong subject, wrong confidence, extra field;
  - every scalar claim value shifted or replaced;
  - arrays shortened or reversed;
  - fields deleted;
  - every claim type swapped;
  - plus malformed inputs.
- **Comparisons.** Every proposal in every context is compared with deepEqual: `validateReflectionClaim` against `validateStructuredClaimE1`, and `citationVisibilityViolations` against the oracle. Mixed batches with duplicates compare `evaluateReflectionOutput` against `evaluateStructuredOutputE1`, notes and rendered text included.
- **Constants.** `REFLECTION_SCHEMA` must deepEqual `E1_SCHEMA` and the stored copy `STORED_REFLECTION_SCHEMA`, with an identical sha256. `BASE_PROPOSAL_SCHEMA`, `CLAIM_SCHEMAS`, `REFLECTION_SYSTEM`, `REFLECTION_SEMANTIC_VERSION` and `schemaMatches` must equal the oracle's.
- **Non-vacuity guards.** The test requires more than 20,000 validations, more than 100 accepted, at least 20 distinct reasons, and every claim family accepted. Measured: 61,015 validations, 1,946 accepted, 23 reasons, all 9 families accepted.
- **Sensitivity.** Each perturbation was applied to the built production module and then restored byte-identical:
  - raising the shared-segment minimum length from 12 to 30 fails the test;
  - disabling the movement transition-count check fails the test.

## 4. C3: design

| Module | Lines | Owns |
| --- | --- | --- |
| `reflection-evidence.ts` | 58 | the structured evidence catalog with statement provenance (`reflectionEvidenceCatalog`, `statementProvenance`) |
| `reflection-schema.ts` | 68 | claim schemas, `BASE_PROPOSAL_SCHEMA`, `REFLECTION_SCHEMA` (base plus the environmental branch), `REFLECTION_SYSTEM`, `REFLECTION_SEMANTIC_VERSION`, `schemaMatches`, rendering |
| `reflection-validation.ts` | 359 | the one validation path, as named stages in one file, plus batch evaluation and the request context |
| `reflection-wire.ts` | 30 | the one provider-facing projection |

Total: 515 lines. Dependencies run one way only: evidence → schema → validation → wire (validation also reads evidence). There are no barrels.

## 5. C4: consolidation

The stages keep their exact order and logic. Each is a named function that owns one rule family:

1. `validateClaimFacts` (formerly V2);
2. `validateEvidenceRoles` (V2.1);
3. `validateStatementProvenance` (V2.2);
4. `validateRelationshipAuthority` (V2.3);
5. `validateCitationVisibility` (V2.3-CVC);
6. `validateReflectionClaim` (E1), the entry point.

Version-named identifiers became purpose names:

| Before | After |
| --- | --- |
| `E1_SCHEMA` / `E1_SYSTEM` / `E1_VERSION` | `REFLECTION_SCHEMA` / `REFLECTION_SYSTEM` / `REFLECTION_SEMANTIC_VERSION` |
| `V2_SCHEMA` | `BASE_PROPOSAL_SCHEMA` |
| `E1_CLAIM_SCHEMA` | `ENVIRONMENTAL_RULE_CLAIM_SCHEMA` |
| `structuredReflectionEvidenceE1` | `reflectionEvidenceCatalog` |
| `environmentalE1Context` / `E1Context` | `reflectionContext` / `ReflectionContext` |
| `validateStructuredClaimE1` / `evaluateStructuredOutputE1` | `validateReflectionClaim` / `evaluateReflectionOutput` |
| `citationScopedReflectionWireE1` | `reflectionWire` |
| `renderStructuredClaim` / `renderEnvironmentalE1` | `renderReflectionClaim` / `renderEnvironmentalRuleClaim` |
| `V23Diagnostic` / `V21Diagnostic` | `ReflectionClaimDiagnostic` / `EvidenceRoleDiagnostic` |

Dropped from production as unreachable from any production entry point; they remain in the oracle:

- `legacyComparisonProposal`, `parseStructuredOutput` and `evaluateStructuredOutput` (V2);
- `evaluateStructuredOutputV21` and `evaluateStructuredOutputV22`;
- the per-version reason-code lists and the evidence/provenance model version exports;
- `validateReflectionWire` and the unused wire-profile parameter.

Persisted and observable values are unchanged:

- `semantic_version` stays `V2.3-CVC-E1`, with the `structured.format_version` 1 note shape;
- the wire version strings are unchanged;
- the stored schema copy in `src/campaign` is unchanged and still deepEquals production;
- the system prompt is byte-identical.

## 6. C5: oracle classification (nothing deleted)

| Frozen file | Used by | Class |
| --- | --- | --- |
| `reflection-v23-cvc-e1.ts` | equivalence test, `production-structured-reflection`, `reflection-environmental-e1`, five D09 analysis scripts | KEEP AS TEST ORACLE |
| `reflection-v23-cvc.ts`, `reflection-v22.ts`, `reflection-v2.ts` | equivalence test, stage tests, oracle chain, D09 scripts | KEEP AS TEST ORACLE |
| `reflection-v21.ts`, `reflection-v23.ts`, `reflection-wire.ts`, `reflection-wire-v2-cvc.ts` | oracle chain (dependencies of E1) and their own stage tests | KEEP AS TEST ORACLE |
| `reflection-wire-v2.ts` | only `tests/reflection-wire-v2.test.ts`; a wire profile production never used | DELETE CANDIDATE (with its test; not deleted) |

Stage tests `tests/reflection-{v2,v21,v22,v23,wire,wire-v2,citation-visibility,environmental-e1}.test.ts` now pin the oracle. The oracle pins production through the equivalence test. KEEP.

`src/dev/reflection-benchmark.ts` is a credential preflight for live tools, not part of the chain; it stays.

`tests/frozen/` compiles with the tests, but `npm test` runs only top-level test files, so the oracle is never run as a suite. The D09 historical scripts now import the oracle from `.build/tests/frozen/reflection/`.

## 7. Invariants checked

| Invariant | Evidence |
| --- | --- |
| Reflection behavior identical | equivalence test (section 3) |
| Save schema unchanged | `STORED_REFLECTION_SCHEMA` deepEqual; no `src/campaign` or `src/persistence` change |
| Optional, non-authoritative, optional writes never bump revision | `structured-reflection-maintenance.ts`: identifier renames only; block 6/7 suites green |
| No production import cycles; production does not import `src/dev`, `scripts`, `tests` | `npm run check:architecture` (section 8) |
| `campaign` and `persistence` do not import `turn` | unchanged; architecture check |
| Historical evidence not rewritten | no file under `docs/evaluations/` changed except this new report |

## 8. Validation

From an empty `.build` (`npm run clean`, then `typecheck`, `build`, `test`, `benchmark:modern`, `check:architecture`, `check:docs`); no live or image call.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | **3685 tests, 0 failed** (3683 at `4dc4f05`; +2 = the equivalence test). In the final run the known flaky `generation lifecycle (npc, avatar)` failed alone and passed on the one allowed rerun (3685/3685); the run before it was 3685/3685 without a rerun |
| `npm run benchmark:modern` | 55 scenarios, 55 PASS, 0 known product gaps, 0 FAIL |
| `npm run check:architecture` | exit 0: 361 modules (374 before: 9 dev copies left `src/`, 8 ladder modules became 4), 28 source back edges (32 before; the 4 that disappeared were type-only edges through the removed or moved Reflection modules), **0 runtime back edges**, runtime graph sha256 `f5929f18…8519dfc` (changed because the module set changed) |
| `npm run check:docs` | 44 files, 0 broken after this report exists |
| Equivalence corpus | 61,015 validations, 1,946 accepted, 23 reasons, 9 of 9 claim families accepted; two production perturbations each fail it |

## 9. Files

- **Added:**
  - `src/turn/structured/reflection-{evidence,schema,validation}.ts`;
  - `tests/reflection-consolidation-equivalence.test.ts`;
  - this report.
- **Rewritten:** `src/turn/structured/reflection-wire.ts`.
- **Removed:** `src/turn/structured/reflection-{v2,v21,v22,v23,v23-cvc,v23-cvc-e1,wire-v2-cvc}.ts`.
- **Moved:** `src/dev/reflection-{v2,v21,v22,v23,v23-cvc,v23-cvc-e1,wire,wire-v2,wire-v2-cvc}.ts` → `tests/frozen/reflection/` (import paths only).
- **Repointed:**
  - three production importers;
  - nine reflection tests and `tests/controller-model-fallback.test.ts`;
  - six `scripts/d09-*.mjs` (oracle import path only);
  - `tests/production-structured-reflection.test.ts` now pins the four-module layout instead of the old source-copy comparison.
- **Docs:** debt register (REPO-5, TEST-4, D10, D11, residual list), `docs/TESTING.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_ROADMAP.md`.

## 10. Not done (out of scope)

- No archive pruning (REPO-13).
- No deletion of the delete candidate.
- No lifecycle vocabulary or test taxonomy change.
- No live run.
