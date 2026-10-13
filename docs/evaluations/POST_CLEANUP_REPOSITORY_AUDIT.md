# Post-cleanup repository audit

Date: 2026-10-13. Audited tree: main `7e5e4ea` (Repository Cleanup G), clean working tree. Program baseline: main `861396c` (consolidation block 12, before Repository Cleanup A). Scope: read-only audit of the repository after Repository Cleanups A to G. This audit changed only audit reports, objectively stale current documents (section A5) and the debt register reconciliation (section A9). It changed no product code, no test, no save format and no historical evidence. No live provider call and no image generation call was made.

## Verdict

**GREEN WITH KNOWN PRODUCT DEBT.**

- Every gate is green from an empty `.build`: typecheck, build, 3701 / 3701 tests, modern benchmark 55 / 55 with 0 known product gaps, 0 runtime import cycles, 0 broken current-documentation links, all 8 offline browser checks, the offline playthrough replay (25 / 25) and the lexical retrieval evaluation.
- No import boundary is crossed: production imports nothing from `src/dev`, `tests` or `scripts`; `src/campaign` and `src/persistence` do not depend on `src/turn`; nothing executable depends on `docs/evaluations/`.
- Save schema 8 and snapshot schema 7 are unchanged across the whole cleanup program (0 changed lines in `src/persistence/`).
- The core invariants hold (7 PASS, 2 PASS with a pre-existing concern, recorded as AUD-1 and AUD-2).
- **The remaining debt is product and architecture work, not unfinished cleanup.** The repository cleanup program (Cleanups A to G) is closed. Its only residuals are P3 repository items (REPO-7 image weight, REPO-8 unused values, REPO-13 archive weight, REPO-14 tooling residuals found here), none of which blocks product work.

Evidence files for sections A7, A8 and A9 are in [`post_cleanup_audit/`](post_cleanup_audit/). Their line numbers refer to `7e5e4ea` before this audit's register edits.

## A0. Baseline

Run on `7e5e4ea`, each step separately with its own exit code, never two builds at once, browser checks after the build.

| Step | Result |
| --- | --- |
| `npm run clean` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | 3701 tests, 3701 pass, 0 fail, 0 skipped, 0 todo |
| `npm run benchmark:modern` | 55 scenarios, 55 pass, 0 fail, 0 known product gaps (movement 11, identity 7, keep_track 10, trade 3, person_trade 10, household 2, persistence 2, authority 3, fail_closed 7) |
| `npm run check:architecture` | 359 modules, 28 source-level back-edges (type imports included), 6 source components, **0 runtime back-edges**, runtime graph sha256 `07b6fe39...` |
| `npm run check:docs` | 44 files, 355 relative links, 0 broken |
| `npm run test:playthrough` | 25 / 25 (offline recorded replay) |
| `npm run eval:retrieval` (lexical, embedding variables unset) | exit 0 |
| `node scripts/browser/*-browser-check.mjs` (8 checks) | all exit 0: actual-offer, block5b, block6, block7, confirmation, explicit-promotion, keep-track, turn-reliability |

Not run, by rule: `inspect:turn` and `benchmark:controller` (live, paid), `inspect:narrator`, `inspect:controller`, `bench:llm` (live provider calls), any image generation.

## A1. Structure

| Area | Count on `7e5e4ea` |
| --- | --- |
| Tracked files | 2,039 |
| Repository root | 6 files (`.gitignore`, `README.md`, `longplaytrough_transcript.txt` (REPO-2 residual), `package.json`, `package-lock.json`, `tsconfig.json`) and the folders `city_map/` (1 image), `config/` (`economy.yaml`, read by `src/economy/economy.ts`), `data/` (226 files), `docs/`, `playtrough_example/` (1 csv), `scripts/`, `src/`, `tests/` |
| `src/` | 362 files in 12 folders |
| `src/turn/` | 115 files: 7 root modules (`natural-actions`, `player-intent`, `recent-conversation`, `rpg-dialogue`, `temporal-action`, `temporal-grounding`, `turn-types`) and 13 domain folders |
| `src/dev/` | 95 files: `play.ts` at the root, 6 purpose folders (benchmark 4, historical 50, inspect 13, live 9, maintenance 5, support 13) |
| `scripts/` | 49 files: 3 root tools (`check-doc-links`, `clean`, `minor-debt-cycle-check`), folders browser 8, evaluation 5, historical 32, lib 1 |
| `tests/` | 293 files in 28 folders; 227 executable test files in 21 domain folders; `tests/support/` 31, `tests/fixtures/` 14, `tests/frozen/` 8 |
| `docs/` | 1,100 files: 12 root documents; architecture 25, authoring 10, evaluations 1,050, schemas 2, world 1 |
| Tracked `saves/` | 0 |
| npm scripts | 24 |

## A2. Imports

Graph built from the TypeScript sources of `src/`, `tests/` and `scripts/` (627 modules in the src-centred view, 3,362 runtime edges, 4,524 edges with type-only imports).

| Boundary | Runtime edges | Type-only edges |
| --- | --- | --- |
| Production `src/` (outside `src/dev`) to `src/dev` | 0 | 0 |
| Production `src/` to `tests/` | 0 | 0 |
| Production `src/` to `scripts/` | 0 | 0 |
| `src/campaign` or `src/persistence` to `src/turn` | 0 | 0 |
| Anything executable to `docs/evaluations/` (as a module) | 0 | 0 |
| Runtime import cycles in `src/` | **0** | |

The optional / core boundary (`tests/architecture/runtime-layer-boundaries.architecture.test.ts`) and the NarrationFacts consumer boundary (`tests/architecture/narration-facts-consumers.architecture.test.ts`) pass in the full run. Path uses of `docs/evaluations/` are limited to the four allowlisted historical reproduction tools (`tests/architecture/evaluation-history-isolation.architecture.test.ts`).

**Type-only back-edges, reported separately.** When type-only imports count, `src/` has 6 strongly connected components. None is a runtime cycle.

| Size | Modules |
| --- | --- |
| 43 | one `src/turn` component across identity (11), narration-facts (10), movement (6), context (5), authorization (5) and smaller groups (audit, commerce, coordinator) |
| 4 | `optional/reflection.ts`, `optional/reflection-diagnostics.ts`, `structured/reflection-evidence.ts`, `structured/reflection-schema.ts` |
| 2 | `app/game-session.ts`, `app/optional-services.ts` |
| 2 | `turn/context/context-budget.ts`, `turn/context/context-compaction.ts` |
| 2 | `campaign/mannerism-concepts.ts`, `campaign/types.ts` |
| 2 | `llm/controller-schema.ts`, `llm/errors.ts` |

They predate the cleanups (Cleanup D moved files without changing edges) and are recorded as ARCH-3 (P3 architecture).

## A3. Reachability

Production modules not reachable from the two entrypoints (`src/ui/play.ts`, `src/ui/server.ts`), classified. Nothing was deleted.

| Module | Class | Why |
| --- | --- | --- |
| `src/app/mannerism-view.ts` | DEAD CANDIDATE | used only by tests; described as a future UI contract |
| `src/images/anime-portrait-tags.ts` | HISTORICAL | frozen benchmark dialects kept under an active namespace |
| `src/turn/identity/identity-fork-scanner.ts` | DEV TOOL | used by the identity-fork scanner in `src/dev/` |
| `src/turn/context/context-compressor.ts` | HISTORICAL / DEAD CANDIDATE | D04 historical benchmark only |
| `src/llm/openrouter/image-client.ts` | DEAD CANDIDATE | PRV-7 / IMG-10, user decision D8 / D9 pending execution |
| `src/retrieval/voyage-embedding-provider.ts` | INTENTIONAL ENTRYPOINT (optional) | opt-in provider, reached through dev configuration and `inspect:embedding` |
| `src/turn/coordinator/mutation-diagnostics.ts` | DEV TOOL (support) | development diagnostics |

`structured/reflection-validation.ts`, `reflection-wire.ts` and the structured maintenance module are reachable through a dynamic import in `src/turn/optional/reflection.ts`; a static edge scan misses them, so they are not dead.

All of `src/dev/` is DEV TOOL or HISTORICAL by folder (`tests/architecture/dev-tooling-boundaries.architecture.test.ts`); `tests/support/` is TEST SUPPORT; `tests/frozen/` and `tests/support/historical/` are HISTORICAL by rule.

## A4. Tests

- 227 executable test files, 3701 test cases, all under 21 domain folders: architecture 6, authority 19, canon 18, commerce 12, context 18, identity 24, images 11, items 5, language 3, movement 19, npc-plus 6, optional 9, persistence 5, providers 7, reflection 15, retrieval 6, session 4, tooling 15, turn 9, ui 7, world 9.
- Suffixes: `.architecture` 6 (only under `tests/architecture/`), `.integration` 3, `.regression` 15. No milestone-named test file (enforced by `tests/architecture/test-taxonomy.architecture.test.ts`).
- Six structural guards: dev-tooling boundaries, evaluation-history isolation, lifecycle vocabulary, NarrationFacts consumers, runtime-layer boundaries, test taxonomy.
- Focused suites inside the full run: identity (24 files), Actual Offer (commerce 12), Keep track and explicit promotion (identity, npc-plus, and the browser checks), persistence (5), NarrationFacts (consumer guard and the movement / commerce / identity behavior files), optional services (9). All green.
- Open test debt: TEST-2 (tests coupled to private helpers), TEST-4 (partial, stale tests for parked architecture), TEST-5 (two real wall-clock waits, pointers corrected here), TEST-6 (partial, missing concurrency / older-save / fuzz tests), TEST-7, TEST-8 (timing never measured).

## A5. Documentation

The eight current documents were read against the code. Objectively stale lines fixed in this audit:

| Document | Fix |
| --- | --- |
| `README.md` | latest offline run 3679 to 3701; states that the cleanup program is closed and links this report |
| `docs/TESTING.md` | allowlisted D09 tools are `scripts/historical/d09-*.mjs`, not `scripts/d09-*.mjs` (matches the guard) |
| `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md` | status lines name Cleanups F and G and this audit |
| `docs/MASTER_ROADMAP.md` | the REPO-10 fixture move and the pass-numbered test renames are marked done (Cleanup F); T-REPO says the cleanup program is closed |
| `docs/MASTER_DEBT_REGISTER.md` | section A9 |

`docs/ROADMAP.md` describes product limits and was not stale. `npm run check:docs` reports 0 broken links in the current namespace. Historical documents under `docs/evaluations/` were not edited; links inside them to paths moved by Cleanups B to F stay broken by design (historical text).

## A6. Tooling

- 24 npm scripts. Offline and certification: `clean`, `typecheck`, `build`, `test`, `benchmark:modern`, `check:architecture`, `check:docs`, `test:playthrough`, `eval:retrieval` (lexical without embedding variables). Inspection: `inspect:save`, `inspect:time`, `inspect:scene`, `inspect:context`, `inspect:search`, `inspect:embedding`. Live (provider calls): `inspect:narrator`, `inspect:controller`, `bench:llm`, `inspect:turn`, `benchmark:controller`. Play: `play`, `play:ui`. Maintenance: `extract:playthrough`, `review:playthrough`.
- `npm run build` always starts from an empty `.build` (Cleanup A).
- The 8 browser checks need Playwright from `NODE_PATH` or `PLAYWRIGHT_MODULE`; Playwright is not a declared devDependency (REPO-14).
- Residuals recorded as REPO-14: `scripts/evaluation/casting-trace.mjs:76` reads a removed `identity.promoted` field; `scripts/historical/audit-player-travel-authority.mjs` is stale with no owner; four current scripts keep milestone names (`minor-debt-cycle-check.mjs`, `block5b-`, `block6-`, `block7-browser-check.mjs`); the dev-tooling guard allowlist holds 14 entries where the Cleanup E report says 17.

## A7. Persistence

**PASS, 0 findings** ([evidence](post_cleanup_audit/A7_PERSISTENCE.md)). From `861396c` to `7e5e4ea`, `src/persistence/` has 0 changed lines; `CURRENT_SAVE_VERSION = 8` and `CURRENT_SNAPSHOT_VERSION = 7` are unchanged; the migration chain, serialized field names, revision rules and the optional side stores (`learning.json`, `media.json`) are unchanged. The changes next to persisted data in `src/campaign/` are comments, validation message text and the Cleanup G symbol renames. Kept serialized names include `origin_snapshot.promoted_revision` and `promoted_world_minute`.

## A8. Invariants

**7 PASS, 2 PASS with concern** ([evidence](post_cleanup_audit/A8_INVARIANTS.md)). No invariant is broken by the cleanups.

| Invariant | Result |
| --- | --- |
| The LLM interprets and proposes; the engine owns truth | PASS |
| The Narrator cannot mutate campaign state | PASS |
| The Controller cannot mutate the campaign directly | PASS |
| NarrationFacts describe, policies decide | PASS |
| CampaignState owns truth (prepare / commit, expected revision) | PASS |
| The audit verifies against the same facts | PASS with concern: commit preparation re-reads names without the shared facts (AUD-2, P3, pre-existing) |
| Explicit authority mechanisms (Keep track, Accept, Promote, PendingConfirmation) | PASS |
| Canonical names and aliases are reserved handles | PASS with concern: the person Actual Offer plan does not apply the reserved-handle rule (AUD-1, P2, static read, not confirmed by execution, pre-existing since `cc9cb7c`) |
| No fuzzy identity merging | PASS |

Production producers of `register_character`: AUTH-5 `characterForUpdate` (`src/campaign/preparation.ts:11-20`), the person Actual Offer plan (`src/turn/commerce/person-offers.ts`), Keep track (`src/turn/identity/keep-track.ts`). AUD-1 and AUD-2 were recorded, not fixed: fixing them is product work.

## A9. Debt register reconciliation

Every row of `docs/MASTER_DEBT_REGISTER.md` was classified against `7e5e4ea` ([evidence](post_cleanup_audit/A9_REGISTER_RECONCILIATION.md)): 170 verdicts.

| Verdict | Count |
| --- | --- |
| CONFIRMED OPEN | 130 (about 15 by design or accepted) |
| PARTIAL | 9: TRD-7, F2, PRV-1, PRV-6, IMG-6, PER-5, UI-6 / REV-3, TEST-4, TEST-6 |
| NEEDS HUMAN DECISION | 7: ID-8 / D5, NPC-1, NPC-2, ECO-1, TRD-11, IMG-10, DOC-13 |
| CLOSED BY A-G but still named as open | 6 |
| OBSOLETE | 3: F1, F3 / I11, PIPE-5 |
| DUPLICATE | 15 |

Applied in the register (new section 1A.4): TEST-3, REPO-10, DOC-16 and a duplicated DOC-15 removed from the residual list; REPO-1 struck from the top-20; the AUTH-5 caller list completed with `set_slot_knowledge`; TEST-5 pointers corrected; the REPO-5 and §13.2 rows updated; the duplicates line corrected; new rows AUD-1, AUD-2, VOC-1 (`established_at_promotion` prompt key), REPO-14 and ARCH-3. Detail rows that keep audit-time wording (missing closure markers on REV-2, PIPE-1, PIPE-2, TRD-2, IMG-1, ID-1, F1, F3, I11, MOV-4; about 18 audit-time severities) are named in section 1A.4, which says the residual list and the top-20 win. The register no longer claims any cleanup debt that A to G closed.

**Stale paths in detail rows** (not verdict changes; the code moved, the finding did not):

| Register cite | Current location |
| --- | --- |
| `narrated-captives.ts` (F1, F4, I2, I10) | deleted; reading in `turn/narration-facts/scene-identity.ts`, policy in `turn/identity/name-establishment.ts` |
| `scene-departure.ts` (§5) | deleted; `turn/narration-facts/departure-forms.ts` |
| `src/campaign/followers.ts` (§5) | never created; `src/turn/movement/follow-candidates.ts` |
| `game-session.ts:356` (NPC-6), `:314` (UI-5), `:733-736` (REV-3) | `src/app/game-session.ts:421`, `:379`, `:982` and `:799` |
| `trade-authorization.ts:26` (TRD-8) | `src/turn/narration-facts/commerce-vocabulary.ts:23` |
| `person-offers.ts:349-355` (F7 / I12) | `src/turn/commerce/person-offers.ts:333-341` |
| `prompt-builder.ts:302` (CTX-1) | `src/turn/context/prompt-builder.ts:138` |
| `save-format.ts:102-106` (PER-4) | `src/persistence/save-format.ts:10,148-149` |
| `city_map.png` (REPO-7) | `city_map/city_map.png` |

The full table is in the A9 evidence file.

**Decisions only the author can make** (unchanged questions, now in one place): D5 with AUTH-5 (can a canonical NPC get a campaign record or NPC+); D4 (inactive NPC+ who leaves the household); D3 / ECO-1 (integer silver or gold-only anchors), then TRD-11; D9 / IMG-10 (reference-image upload); DOC-13 (author-only canon section); AUTH-7 (gate `/api/location`); execution of D8 / D13 (remove the image client, park Voyage), which would also unblock TEST-4.

## A10. Scorecard: Repository Cleanups A to G

| Cleanup | Commit(s) | What it did | Closed | Residual |
| --- | --- | --- | --- | --- |
| A, build discipline | `845d778` | `npm run clean`; build starts from an empty `.build`; `artifacts/local/`; tracked `saves/` evidence moved to `docs/evaluations/d09-reflection/evidence/`; portable browser checks | CI-2, UI-30, REPO-1 | none |
| REPO-12 fix | `cc9cb7c` | diagnosed the Actual Offer browser check failure; completed the canonical-name reservation policy | REPO-12 | AUD-1 (offer plan not covered, found by this audit) |
| B, documentation namespace | `feba138` | 114 pure moves; root keeps only `README.md`; docs index; `npm run check:docs` | REPO-11, DOC-14, DOC-16; REPO-2 and DOC-15 partly | DOC-15 staleness tripwire; REPO-2 root transcript |
| B2, fixture decoupling | `4dc4f05` | executable fixtures copied to `tests/fixtures/` with provenance; tools write to `artifacts/local/evaluations/`; isolation guard | REPO-3 | REPO-13 opened (archive weight) |
| C, Reflection consolidation | `057ee3b` | production Reflection in four modules; dev copies frozen as the oracle; equivalence test | REPO-5; TEST-4 partly | TEST-4 |
| D, `src/turn` domain folders | `f49a5c9`, `c785b9a`, `a0ee7a0`, `2a0e242`, `bd4981c`, `47e254b`, `26c2be5` | relocation only, 13 domain folders, edge sets identical per phase; `turn/sentences.ts` removed | REPO-9 partly | ARCH-3 (type-only components, large modules) |
| E, dev tooling and scripts | `d94cde9` | `src/dev/` and `scripts/` purpose folders; shared live support; deepseek shim removed; npm scripts 30 to 24; TEST-1 fixed in the test | REPO-4, REPO-6, REPO-9, TEST-1, CI-3; REPO-10 and TEST-4 partly | UI-31 opened (user decision); REPO-13 audited, kept open |
| F, test taxonomy | `9d27f81` | tests in 21 domain folders named by behavior; helpers in `tests/support/`; taxonomy guard | TEST-3, REPO-10 | TEST-2, TEST-5 |
| G, lifecycle vocabulary | `7e5e4ea` | `campaign/materialization.ts`, `buildMaterializedCharacter`; materialization and NPC+ promotion no longer share a name; vocabulary guard | lifecycle vocabulary residual | NAME-1, PER-6 (schema-bound, D6); VOC-1 (prompt key) |

Every cleanup kept the runtime graph free of cycles, kept save schema 8, and was validated with the full suite and the benchmark before its push.

## A11. Before and after

Measured on `861396c` (before Cleanup A) and `7e5e4ea`. Both columns were counted with the same commands; nothing is estimated.

| Measure | `861396c` | `7e5e4ea` |
| --- | --- | --- |
| Tracked files | 2,009 | 2,039 |
| Entries at the repository root | 46 | 14 |
| Markdown files at the root | 32 | 1 |
| Root modules in `src/turn/` | 80 | 7 |
| Root modules in `src/dev/` (purpose folders) | 104 (0) | 1 (6) |
| Root scripts in `scripts/` (folders) | 45 (1) | 3 (4) |
| Test files at the `tests/` root | 218 | 0 |
| Helper modules at the `tests/` root | 30 | 0 |
| Executable test files | 218 | 227 |
| Test cases | 3,660 | 3,701 |
| Root documents in `docs/` | 18 | 12 |
| Files in `docs/evaluations/` | 615 | 1,050 |
| npm scripts | 27 | 24 |
| Tracked files under `saves/` | 310 | 0 |
| Runtime import cycles | 0 | 0 |
| Modern benchmark | 55 / 55 | 55 / 55 |

`docs/evaluations/` grew because Cleanups A and B moved root reports, `saves/` evidence and superseded documents into the historical namespace. Tracked files grew by 30 for the same reason plus the new reports and guards; the repository root shrank from 46 entries to 14.

## A12. Certification

- Verdict: **GREEN WITH KNOWN PRODUCT DEBT.**
- The repository cleanup program, Cleanups A to G, is **CLOSED**. No cleanup phase is left unfinished.
- The open debt is product correctness (AUTH-5 / D5, AUD-1, commerce and identity rows), architecture (ARCH-2 residuals with PIPE-6 / PIPE-7, CTX, ARCH-3), persistence hardening (PER-4, PER-5, NAME-1 / PER-6 with the next schema bump), UI, test and CI hardening (TEST-2, TEST-5, TEST-6, CI-1), and low-priority repository and archive items (REPO-7, REPO-8, REPO-13, REPO-14).
- No live provider call and no image generation call was made by the audit or by Cleanups F and G. F and G changed no gameplay behavior and no save schema. No historical evidence was rewritten.

**Final validation** (on `7e5e4ea` with this audit's documentation changes, from an empty `.build`, each step separately): clean, typecheck and build exit 0; `npm test` 3701 / 3701, 0 fail, 0 skipped; `npm run benchmark:modern` 55 / 55, 0 known product gaps; `npm run check:architecture` 359 modules, 0 runtime back-edges, runtime graph sha256 unchanged (`07b6fe39...`); `npm run check:docs` 44 files, 361 links, 0 broken; all 8 browser checks exit 0. The focused identity, Actual Offer, Keep track, explicit promotion, persistence, NarrationFacts and optional-service suites are part of the full run, and the Actual Offer, Keep track and explicit promotion browser checks passed.
