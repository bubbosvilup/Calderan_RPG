# Repository Cleanup F: test taxonomy, naming and discoverability

Status: historical record of a completed cleanup (2026-10-13). Baseline main `d94cde9`. Current rules live in [docs/TESTING.md](../TESTING.md#test-taxonomy).

Purpose: the current executable tests describe the behavior, contract or subsystem they protect instead of the milestone that introduced them. Relocation and renaming only: no production semantics, no assertion, no expectation and no test was changed or removed. Production `src/` changed in three comment lines that name a test path, and one test-only corpus moved from `src/dev/support/` to `tests/support/`.

## 1. Baseline

| Item | Value |
|---|---|
| HEAD | `d94cde9` (main = origin/main = `claude/project-thread-gfj7p8`), clean tree |
| Executable test files | 225 `*.test.ts`, **all 225 at the `tests/` root** |
| Test cases | **3694** (`# tests 3694`, pass 3694, fail 0, skipped 0, todo 0) |
| Non-test modules at the `tests/` root | 30 (fixtures, harnesses, 12 runnable historical tools) |
| Subdirectories | `benchmark/`, `fixtures/`, `frozen/` (8 reflection oracle modules), `golden/`, `playthrough/`, `retrieval-eval/` |
| Naming patterns | `npc-plus-pass-N[-x]`, `blockNx-*`, `consolidation-blockN`, `pNN-*`, `dNN-*`, `*-hN`, `*-v1`, `*-repair-1-N`, `calderan-npc-pass-N`, plus plain behavior names |
| `npm test` discovery | `node --test .build/tests/*.test.js` (root only) |
| Validation from an empty `.build` | clean, typecheck, build exit 0; 3694/3694; `benchmark:modern` 55/55, 0 known gaps; `check:architecture` 360 modules, 0 runtime back-edges; `check:docs` 44 files, 354 links, 0 broken |

Milestone vocabulary in `tests/` (TypeScript AST: file names, test titles, comments, other strings; matches of block N, pass N / pass C, phase N, pNN, consolidation, milestone, hotfix, HN, DNN, wave N):

| Class | Before | After |
|---|---|---|
| CASE LABEL (kept) | 156 | 86 |
| CURRENT COMMENT | 227 | 224 |
| CURRENT SUPPORT NAME | 6 | 0 |
| CURRENT TEST NAME | 73 | 0 |
| CURRENT TEST TITLE | 256 | 23 |
| FIXTURE NAME | 1 | 1 |
| FROZEN MATERIAL | 7 | 7 |
| HISTORICAL REPLAY | 93 | 79 |
| HISTORICAL TEXT | 155 | 143 |

CURRENT TEST NAME counts executable test files whose name carries a milestone label (the broad set above, D- and H-labels and `-v1` included; the guard pattern alone, block / pass / phase / pNN / consolidation, matched 58 files). CASE LABEL counts requirement case IDs inside titles (`P1`, `P12`, `D9`) that are traceability labels of a specification, not milestones; they are kept, and the before / after difference is only where a case label shared a file with a milestone prefix. HISTORICAL REPLAY, FROZEN MATERIAL and FIXTURE NAME are intentionally historical. CURRENT COMMENT and HISTORICAL TEXT were not rewritten (comments explain where code came from; strings are data, labels and source provenance).

## 2. Inventory

225 executable test files and 31 non-test modules (30 at the `tests/` root, 1 test-only corpus in `src/dev/support/`) were classified; the complete map with importers, fixture dependencies and risk is section 5. Risk: HIGH 34 (a source-text or hash pin, a self-run or CLI path, an importer outside `tests/`, the npm test pin), MEDIUM 140 (dynamic imports or shared support), LOW 82. Every HIGH item was checked: the source-text pins read `src/` by repository-relative path (unchanged by a test move), the hash pins hash fixtures that did not move, and the four importers outside `tests/` (browser checks, two historical scripts) were rewritten mechanically.

## 3. Taxonomy

Every executable test has one primary type and one primary domain.

| Type | Files | Meaning |
|---|---|---|
| BEHAVIOR | 155 | a domain behavior through its public functions or a scripted turn |
| HISTORICAL_REPLAY | 17 | frozen oracles and historical-replay / bake-off tools whose historical identity is the contract |
| REGRESSION | 15 | pins specific recorded bugs (exact live drafts, replay findings) |
| PROVIDER_CONTRACT | 9 | provider wire, retry, fallback and image client contracts |
| UNIT | 9 | one module in isolation |
| TOOLING | 6 | dev, benchmark and build tooling |
| INTEGRATION | 5 | a whole application path (session host, HTTP, confirmation flow) |
| PERSISTENCE | 5 | save format, repository, restore, migration |
| ARCHITECTURE | 3 | structural guards over the source graph (including the new taxonomy guard) |
| REPOSITORY | 2 | repository layout and dev-tooling boundaries |

Primary domain (the brief's vocabulary):

| Domain | Files |
|---|---|
| world | 32 |
| identity | 23 |
| optional | 22 |
| context | 18 |
| movement | 17 |
| authority | 16 |
| tooling | 15 |
| commerce | 11 |
| images | 11 |
| coordinator | 9 |
| providers | 8 |
| narration-facts | 7 |
| persistence | 7 |
| ui | 7 |
| npc-plus | 6 |
| items | 5 |
| audit | 4 |
| session | 4 |
| repository | 3 |

Folders are derived from the corpus, not from `src/`. 21 folders, one level deep, smallest 3 files (`language/`: the shared text primitives and gates have their own source folder and no better home), largest 24. `canon/` (authored world content) is separate from `world/` (world store, runtime, clock, calendar); `reflection/` is separate from `optional/` (registry, side stores, mannerisms) because it has 15 files of its own. NarrationFacts suites live with the domain whose facts they read, and the NarrationFacts consumer guard lives in `architecture/`. No `misc/`, no milestone folder, no root test.

| Folder | Tests |
|---|---|
| architecture | 5 |
| authority | 19 |
| canon | 18 |
| commerce | 12 |
| context | 18 |
| identity | 24 |
| images | 11 |
| items | 5 |
| language | 3 |
| movement | 19 |
| npc-plus | 6 |
| optional | 9 |
| persistence | 5 |
| providers | 7 |
| reflection | 15 |
| retrieval | 6 |
| session | 4 |
| tooling | 15 |
| turn | 9 |
| ui | 7 |
| world | 9 |

## 4. Naming rules

- A file name answers "what does this protect": `canonical-identity-gating`, `trade-offer-authorization`, `explicit-character-materialization`, `post-commit-guards`, `narrator-length-recovery`.
- Forbidden in current executable test names: `block`, `pass`, `phase`, `pNN`, `consolidation`, `hotfix`, `wave`, `milestone`, `cleanup-x` (enforced, section 12). D- and H-milestone labels, version suffixes and `repair-1-N` were also removed; the frozen oracle tests keep their oracle version (`reflection-v2-oracle` .. `reflection-v23-oracle`).
- Suffixes: `.architecture.test.ts` for structural guards and only under `tests/architecture/`; `.integration.test.ts` for whole application paths; `.regression.test.ts` for suites pinning recorded bugs; plain `.test.ts` otherwise. At most one suffix.
- Already clear names were not renamed: 70 files only moved into their folder, 155 were renamed.
- Titles: only milestone-dependent wording was rewritten (section 5b). Requirement case labels (`A1`, `P12`, `I4`, `D9`), debt IDs (`AUTH-2`, `NARR-1`, `MOV-1`) and short provenance in parentheses (`(Phase 1M.1 replay regression)`, 5 titles) stay: they are traceable without history.

## 5. Move and rename map

All moves are `git mv` (rename detection R100 or R with in-place path edits). "Fixtures" lists the data files a test reads (unchanged locations).

| Current path | Type | Domain | New path | Reason | Importers | Fixtures | Risk |
|---|---|---|---|---|---|---|---|
| `tests/dev-tooling-boundaries.test.ts` | REPOSITORY | repository | `tests/architecture/dev-tooling-boundaries.architecture.test.ts` | name already clear; moved with the architecture family | - | - | LOW |
| `tests/evaluation-history-isolation.test.ts` | REPOSITORY | repository | `tests/architecture/evaluation-history-isolation.architecture.test.ts` | name already clear; moved with the architecture family | - | fixtures/provenance.json | HIGH |
| `tests/narration-facts-architecture.test.ts` | ARCHITECTURE | narration-facts | `tests/architecture/narration-facts-consumers.architecture.test.ts` | one NarrationFactSource per turn; consumers read shared facts | - | - | LOW |
| `tests/npc-plus-pass-10-architecture.test.ts` | ARCHITECTURE | repository | `tests/architecture/runtime-layer-boundaries.architecture.test.ts` | milestone name; guards the whole src runtime import graph: no cycle, layer direction, Reflection off the critical path, NPC+ modules free of diagnostics | - | - | HIGH |
| `tests/npc-plus-pass-4.test.ts` | BEHAVIOR | audit | `tests/authority/absent-participant-audit.test.ts` | milestone name; absent_participant flags participation, not mention; duplicate canon removed | - | - | LOW |
| `tests/turn-hardening.test.ts` | BEHAVIOR | authority | `tests/authority/collective-acceptance-evidence.test.ts` | collective grounded acceptance and participant agreement limits | - | - | MED |
| `tests/existing-subsystem-hardening.test.ts` | BEHAVIOR | authority | `tests/authority/condition-conflict-materialization.test.ts` | condition vocabulary, conflicting commands, new-item materialization, next-scene continuity | - | - | LOW |
| `tests/controller-authorization-hardening.test.ts` | BEHAVIOR | authority | `tests/authority/controller-authorization-pipeline.test.ts` | Controller -> authorization -> prepare -> commit, end to end offline | - | - | MED |
| `tests/evidence-authorization.test.ts` | BEHAVIOR | authority | `tests/authority/evidence-authorization-adversarial.test.ts` | adversarial-controller corpus against evidence authorization | - | - | MED |
| `tests/block5b-auth2.test.ts` | BEHAVIOR | authority | `tests/authority/explicit-character-materialization.test.ts` | milestone name; AUTH-2: narration introduces only PROVISIONAL people, materialization needs explicit authority | - | - | MED |
| `tests/language-call-paths.test.ts` | BEHAVIOR | authority | `tests/authority/language-gate-call-paths.test.ts` | bare-no / no-hesitation fixes proven through every call path | - | - | MED |
| `tests/live-regression-repair-1-2.test.ts` | REGRESSION | authority | `tests/authority/live-controller-premise.regression.test.ts` | milestone name; controller parse diagnostics, dialogue premise, gesture agency | - | - | MED |
| `tests/live-regression-repair-1-1.test.ts` | REGRESSION | authority | `tests/authority/live-npc-evidence.regression.test.ts` | milestone name; exact failing live sentences for evidence handling | - | - | MED |
| `tests/live-regression-repair.test.ts` | REGRESSION | authority | `tests/authority/live-npc-handover.regression.test.ts` | live NPC regression corpus: offers, handovers, guards | - | - | MED |
| `tests/block5a-auth1.test.ts` | INTEGRATION | authority | `tests/authority/manumission-confirmation.integration.test.ts` | milestone name; AUTH-1 'I free X' proposes, only Confirm commits, end to end | - | - | HIGH |
| `tests/narrative-authority.test.ts` | BEHAVIOR | authority | `tests/authority/narrative-knowledge-permissions.test.ts` | who may use which fact in narration | - | - | MED |
| `tests/turn-evidence-1m1.test.ts` | REGRESSION | authority | `tests/authority/offer-acceptance-evidence.regression.test.ts` | milestone name; replay record 115 collective acceptance (pins the Phase 1M.1 replay bug) | - | - | MED |
| `tests/d04-targeted-closure.test.ts` | BEHAVIOR | audit | `tests/authority/paragraph-speaker-attribution.test.ts` | milestone name; delivery attribution and private-knowledge audit scope | - | - | LOW |
| `tests/block5a-pending-foundation.test.ts` | BEHAVIOR | authority | `tests/authority/pending-confirmation-foundation.test.ts` | milestone name; PendingConfirmation records, retention, revalidation | - | - | MED |
| `tests/transfer-intent-binding.test.ts` | BEHAVIOR | authority | `tests/authority/player-transfer-intent-binding.test.ts` | explicit player transfer binds item, recipient and mode | - | - | MED |
| `tests/receipt-corpus.test.ts` | BEHAVIOR | authority | `tests/authority/possession-receipt-corpus.test.ts` | receipt verifier corpus with adversarial negatives | - | - | LOW |
| `tests/knowledge-access.test.ts` | BEHAVIOR | authority | `tests/authority/restricted-canon-knowledge-access.test.ts` | restricted canon reaches only the NPC who knows it | - | retrieval-eval/fixture-embedding-provider.ts | MED |
| `tests/narration-survives-audit.test.ts` | BEHAVIOR | audit | `tests/authority/valid-narration-survives-audit.test.ts` | valid narration corpus is never redacted by the audit | - | - | MED |
| `tests/authored-data.test.ts` | BEHAVIOR | world | `tests/canon/authored-data-discovery.test.ts` | nested editorial paths, recursive yaml discovery, character validation | - | retrieval-eval/fixture-embedding-provider.ts | LOW |
| `tests/calderan-npc-pass-3.test.ts` | BEHAVIOR | world | `tests/canon/calderan-civic-figures-canon.test.ts` | milestone name; civic, guild and district anchors, Ducal Council | - | - | LOW |
| `tests/calderan-four-district-canon.test.ts` | BEHAVIOR | world | `tests/canon/calderan-districts-canon.test.ts` | four districts, anchor locations and canon boundaries | - | - | LOW |
| `tests/calderan-npc-pass-2.test.ts` | BEHAVIOR | world | `tests/canon/calderan-power-figures-canon.test.ts` | milestone name; power figures and East anchors | - | - | LOW |
| `tests/center-east-canon.test.ts` | BEHAVIOR | world | `tests/canon/center-east-canon.test.ts` | name already clear | - | - | LOW |
| `tests/canon-lore-migration.test.ts` | BEHAVIOR | world | `tests/canon/cosmology-layers-canon.test.ts` | public, restricted and deep cosmology layers stay separate | - | - | MED |
| `tests/canon-gap-closure.test.ts` | BEHAVIOR | world | `tests/canon/elemental-incarnations-canon.test.ts` | elements, the Four, Church origin, decline: the closed canon gaps | - | - | LOW |
| `tests/geography.test.ts` | BEHAVIOR | world | `tests/canon/geography.test.ts` | name already clear | - | - | LOW |
| `tests/heartstone-rite.test.ts` | BEHAVIOR | world | `tests/canon/heartstone-charter-rite.test.ts` | Heartstone charter, oath and recognition canon | - | - | MED |
| `tests/authoring.test.ts` | BEHAVIOR | world | `tests/canon/heartstone-locations.test.ts` | Heartstone locations, topology and inspection CLI | - | - | HIGH |
| `tests/aureth-canon.test.ts` | BEHAVIOR | world | `tests/canon/helion-continent-canon.test.ts` | continent is Helion (legacy id kept); myth, forest, oasis, dwarf home | - | - | LOW |
| `tests/world-canon.test.ts` | BEHAVIOR | world | `tests/canon/lore-concepts-canon.test.ts` | lore, concept and faction records | - | - | MED |
| `tests/mythology-secrecy.test.ts` | BEHAVIOR | world | `tests/canon/mythology-secrecy.test.ts` | name already clear | - | retrieval-eval/fixture-embedding-provider.ts | MED |
| `tests/opening-state.test.ts` | BEHAVIOR | world | `tests/canon/opening-campaign.test.ts` | the canonical opening campaign | - | - | LOW |
| `tests/west-canon.test.ts` | BEHAVIOR | world | `tests/canon/west-canon.test.ts` | name already clear | - | - | LOW |
| `tests/west-economy-canon.test.ts` | BEHAVIOR | world | `tests/canon/west-economy-canon.test.ts` | name already clear | - | - | LOW |
| `tests/west-everyday-canon.test.ts` | BEHAVIOR | world | `tests/canon/west-everyday-canon.test.ts` | name already clear | - | fixtures/canon/calderan-west-npc-pass2a-after.json, retrieval-eval/fixture-embedding-provider.ts | LOW |
| `tests/west-npc-canon.test.ts` | BEHAVIOR | world | `tests/canon/west-npc-canon.test.ts` | name already clear | - | fixtures/canon/calderan-west-pass1-after.json | LOW |
| `tests/actual-offer-v1.test.ts` | BEHAVIOR | commerce | `tests/commerce/actual-offer.test.ts` | version suffix dropped: the structured TradeOffer contract | - | - | MED |
| `tests/consolidation-block2.test.ts` | BEHAVIOR | commerce | `tests/commerce/commerce-integrity.test.ts` | milestone name; SELL transfer, shared price grammar, offer identity, pending-offer narration | - | - | MED |
| `tests/narration-facts-commerce.test.ts` | BEHAVIOR | narration-facts | `tests/commerce/commerce-narration-facts.test.ts` | commerce facts and their consumers | - | - | HIGH |
| `tests/p8-economic-baseline.test.ts` | BEHAVIOR | commerce | `tests/commerce/economic-baseline.test.ts` | milestone name; authored anchor table, per-seller price index | - | - | MED |
| `tests/narrated-promotion.test.ts` | BEHAVIOR | commerce | `tests/commerce/narrated-captive-purchase.test.ts` | a narrator-invented captive is promoted and purchased atomically | - | - | MED |
| `tests/person-offer-e2e.test.ts` | REGRESSION | commerce | `tests/commerce/person-offer-playthrough.regression.test.ts` | pins the live playthrough in which no person offer card appeared | - | fixtures/person-offer-playthrough.ts | MED |
| `tests/p8-price-authority-audit.test.ts` | BEHAVIOR | commerce | `tests/commerce/price-authority-audit.test.ts` | milestone name; unsupported prices are rejected | - | - | LOW |
| `tests/historical-replay-regressions.test.ts` | REGRESSION | commerce | `tests/commerce/price-phrase.regression.test.ts` | number and price regressions found by the historical replay | - | - | MED |
| `tests/seller-continuity.test.ts` | BEHAVIOR | commerce | `tests/commerce/seller-continuity.test.ts` | name already clear | - | - | MED |
| `tests/household-runtime.test.ts` | BEHAVIOR | commerce | `tests/commerce/slave-trade-runtime.test.ts` | purchase, manumission and relationship guarantees at domain level | - | - | LOW |
| `tests/household-turns.test.ts` | BEHAVIOR | commerce | `tests/commerce/slave-trade-turns.test.ts` | offer and manumission natural-language evals and an end-to-end turn | - | - | MED |
| `tests/consolidation-block1.test.ts` | BEHAVIOR | commerce | `tests/commerce/trade-offer-authorization.test.ts` | milestone name; TRD-1 ownership on SELL, TRD-2 offers re-checked against delivered text | - | - | LOW |
| `tests/background-grounding.test.ts` | BEHAVIOR | context | `tests/context/background-grounding.test.ts` | name already clear | - | - | MED |
| `tests/p6-p9-scene-audit.test.ts` | BEHAVIOR | context | `tests/context/background-presence-and-waits.test.ts` | milestone name; compact background presence, waits, scheduled events | - | - | LOW |
| `tests/context-budget.test.ts` | BEHAVIOR | context | `tests/context/context-budget.test.ts` | name already clear | - | - | MED |
| `tests/context-compaction.test.ts` | BEHAVIOR | context | `tests/context/context-compaction.test.ts` | name already clear | - | - | MED |
| `tests/context-scale.test.ts` | BEHAVIOR | context | `tests/context/context-relevance-selection.test.ts` | relevance selection before size validation; scene-critical state never dropped | - | - | LOW |
| `tests/p132-history-refs-background.test.ts` | BEHAVIOR | context | `tests/context/history-refs-and-background.test.ts` | milestone name; plain speech history, opaque refs, background roster rule | - | - | MED |
| `tests/lore-grounding.test.ts` | REGRESSION | context | `tests/context/lore-invention.regression.test.ts` | pins observed live canon inventions (the detector must flag each) | - | - | LOW |
| `tests/lossless-context-compaction.test.ts` | BEHAVIOR | context | `tests/context/lossless-context-compaction.test.ts` | name already clear | - | - | MED |
| `tests/p61-narrator-focus.test.ts` | BEHAVIOR | context | `tests/context/narrator-focus.test.ts` | milestone name; foreground focus compresses unrelated background | - | - | LOW |
| `tests/npc-plus-pass-10-context.test.ts` | BEHAVIOR | context | `tests/context/npc-plus-context-headroom.test.ts` | milestone name; NPC+ budget and the context_too_large boundary | - | - | MED |
| `tests/baseline-cleanup.test.ts` | REGRESSION | context | `tests/context/opening-smoke.regression.test.ts` | pins the 2026-09-29 opening smoke run (passer-by attribution, player profile) | - | - | LOW |
| `tests/npc-plus-pass-10-injection.test.ts` | BEHAVIOR | context | `tests/context/prompt-injection-boundary.test.ts` | milestone name; everything besides the system prompt is data | - | - | MED |
| `tests/p121-recent-scene-narration.test.ts` | BEHAVIOR | context | `tests/context/recent-scene-narration.test.ts` | milestone name; recent exchanges survive into the next prepared request | - | fixtures/scene-continuity/fixture-world.json | MED |
| `tests/runtime-continuity-repair-1.test.ts` | REGRESSION | context | `tests/context/recent-window-departure-grounding.regression.test.ts` | milestone name; recent window, temporary departure, player events, grounding guards from live findings | - | - | MED |
| `tests/rpg-format-contract.test.ts` | BEHAVIOR | context | `tests/context/rpg-format-contract.test.ts` | name already clear (source-byte pin inside) | - | - | HIGH |
| `tests/scene-prompt-debt-cleanup.test.ts` | BEHAVIOR | context | `tests/context/scene-projection-silence.test.ts` | narrator-facing state is smaller; every omission is silence | - | - | LOW |
| `tests/scene-state-foundation.test.ts` | BEHAVIOR | context | `tests/context/scene-state-integration-boundary.test.ts` | Scene State Projection as the boundary between subsystems and the narrator | - | - | LOW |
| `tests/scene-state-projection.test.ts` | BEHAVIOR | context | `tests/context/scene-state-projection.test.ts` | name already clear | - | golden/scene-state-ideal.txt | LOW |
| `tests/canonical-casting.test.ts` | BEHAVIOR | identity | `tests/identity/canonical-casting.test.ts` | name already clear | - | - | MED |
| `tests/p31-identity-gating.test.ts` | BEHAVIOR | identity | `tests/identity/canonical-identity-gating.test.ts` | milestone name; null player identity with engine ids intact | - | - | MED |
| `tests/canonical-name-reservation.test.ts` | REGRESSION | identity | `tests/identity/canonical-name-reservation.regression.test.ts` | pins the late-naming-with-a-canonical-handle bug fixed with the reservation policy | - | - | MED |
| `tests/p34-participant-continuity.test.ts` | BEHAVIOR | identity | `tests/identity/canonical-participant-continuity.test.ts` | milestone name; canonical binding across introduction, reload, leave and return | - | - | MED |
| `tests/block5b-lifecycle-repair.test.ts` | BEHAVIOR | identity | `tests/identity/character-lifecycle-repair.test.ts` | milestone name; retire / merge preconditions and atomic application | - | - | LOW |
| `tests/block5b-repair-session.test.ts` | BEHAVIOR | identity | `tests/identity/character-repair-confirmation.test.ts` | milestone name; retire / merge through PendingConfirmation | - | - | MED |
| `tests/p33-p11-live-evidence.test.ts` | BEHAVIOR | identity | `tests/identity/controlled-name-disclosure.test.ts` | milestone name; controlled name disclosure and clock grounding | - | - | MED |
| `tests/created-name-provenance.test.ts` | BEHAVIOR | identity | `tests/identity/created-name-provenance.test.ts` | name already clear | - | - | MED |
| `tests/created-person-identity-binding.test.ts` | BEHAVIOR | identity | `tests/identity/created-person-identity-binding.test.ts` | name already clear | - | - | MED |
| `tests/narrator-persistence.test.ts` | BEHAVIOR | identity | `tests/identity/created-person-persistence.test.ts` | narrator-created person -> campaign character -> household | - | - | MED |
| `tests/current-character-name-projection.test.ts` | BEHAVIOR | identity | `tests/identity/current-character-name-projection.test.ts` | name already clear | - | - | LOW |
| `tests/foreground-canonical-binding.test.ts` | BEHAVIOR | identity | `tests/identity/foreground-canonical-binding.test.ts` | name already clear | - | - | MED |
| `tests/identity-continuity-stress.test.ts` | BEHAVIOR | identity | `tests/identity/identity-continuity-edge-cases.test.ts` | deterministic identity / continuity edge cases | - | - | MED |
| `tests/block5b-scanner.test.ts` | BEHAVIOR | identity | `tests/identity/identity-fork-scanner.test.ts` | milestone name; the read-only identity-fork scanner | - | - | LOW |
| `tests/narration-facts-identity.test.ts` | BEHAVIOR | narration-facts | `tests/identity/identity-narration-facts.test.ts` | speaker / recipient / reference facts | - | - | LOW |
| `tests/identity-objective-vs-known.test.ts` | BEHAVIOR | identity | `tests/identity/identity-objective-vs-known.test.ts` | name already clear | - | fixtures/p35-live-introduction.ts | MED |
| `tests/provisional-keep-track.test.ts` | BEHAVIOR | identity | `tests/identity/keep-track.test.ts` | the explicit Keep track action | - | benchmark/harness.ts | LOW |
| `tests/long-playthrough-continuity-audit.test.ts` | REGRESSION | identity | `tests/identity/long-playthrough-identity.regression.test.ts` | pins the fixed long-playthrough naming defects | - | - | MED |
| `tests/p35-name-knowledge-commit.test.ts` | BEHAVIOR | identity | `tests/identity/name-knowledge-commit.test.ts` | milestone name; canonical name knowledge commits from the production response | - | fixtures/p35-live-introduction.ts | MED |
| `tests/natural-actions.test.ts` | BEHAVIOR | identity | `tests/identity/participant-grammar.test.ts` | participant creation grammar and natural player actions | - | - | MED |
| `tests/partner-identity-subject.test.ts` | REGRESSION | identity | `tests/identity/partner-identity-subject.regression.test.ts` | pins the REPO-12 partner-guard bug (self-introduction subject) | - | - | MED |
| `tests/scene-participants.test.ts` | BEHAVIOR | identity | `tests/identity/scene-participants.test.ts` | name already clear | - | - | MED |
| `tests/p33-naming-final.test.ts` | BEHAVIOR | identity | `tests/identity/self-name-disclosure.test.ts` | milestone name; one truthful self-name, masked others | - | - | MED |
| `tests/p3-player-identity.test.ts` | BEHAVIOR | identity | `tests/identity/unknown-identity-masking.test.ts` | milestone name; unknown canonical NPC identity is not player knowledge | - | - | LOW |
| `tests/anime-portrait-tags.test.ts` | BEHAVIOR | images | `tests/images/anime-portrait-tags.test.ts` | name already clear | - | - | LOW |
| `tests/canon-avatars.test.ts` | BEHAVIOR | images | `tests/images/canon-avatars.test.ts` | name already clear | - | - | HIGH |
| `tests/hf-image-client.test.ts` | PROVIDER_CONTRACT | images | `tests/images/hf-image-client.test.ts` | name already clear | - | - | LOW |
| `tests/item-sprite-prompt.test.ts` | BEHAVIOR | images | `tests/images/item-sprite-prompt.test.ts` | name already clear | - | - | LOW |
| `tests/item-visual.test.ts` | BEHAVIOR | images | `tests/images/item-visual.test.ts` | name already clear | - | - | MED |
| `tests/portrait-image.test.ts` | PROVIDER_CONTRACT | images | `tests/images/openrouter-image-client.test.ts` | the OpenRouter image client in isolation | - | - | LOW |
| `tests/permanent-appearance.test.ts` | BEHAVIOR | images | `tests/images/permanent-appearance.test.ts` | name already clear | - | - | MED |
| `tests/player-visuals-inventory.test.ts` | BEHAVIOR | images | `tests/images/player-visuals.test.ts` | Nicco shares the portrait pipeline; inventory UI foundation | - | - | HIGH |
| `tests/portrait-gallery.test.ts` | BEHAVIOR | images | `tests/images/portrait-gallery.test.ts` | name already clear | - | - | MED |
| `tests/portrait-prompt.test.ts` | BEHAVIOR | images | `tests/images/portrait-prompt.test.ts` | name already clear | - | - | LOW |
| `tests/sprite-quality.test.ts` | BEHAVIOR | images | `tests/images/sprite-quality.test.ts` | name already clear | - | - | LOW |
| `tests/permanent-inventory.test.ts` | BEHAVIOR | items | `tests/items/inventory-queries.test.ts` | derived inventory and predicates | - | - | MED |
| `tests/item-domain.test.ts` | BEHAVIOR | items | `tests/items/item-domain.test.ts` | name already clear | - | - | MED |
| `tests/debt-zero.test.ts` | BEHAVIOR | items | `tests/items/item-intent-and-weather-seam.test.ts` | milestone-ish name; item intent binding, evidence recovery, aliases, weather seam | - | - | LOW |
| `tests/item-lifecycle.test.ts` | BEHAVIOR | items | `tests/items/item-lifecycle.test.ts` | name already clear | - | - | HIGH |
| `tests/transfer-domain.test.ts` | BEHAVIOR | items | `tests/items/transfer-domain.test.ts` | name already clear | - | - | MED |
| `tests/npc-plus-pass-10-gates.test.ts` | BEHAVIOR | narration-facts | `tests/language/invitation-follow-gates.test.ts` | milestone name; shared gates for follow / invitation / absent reference | - | - | LOW |
| `tests/language-gates.test.ts` | BEHAVIOR | narration-facts | `tests/language/language-gates.test.ts` | name already clear | - | - | LOW |
| `tests/language-primitives.test.ts` | UNIT | narration-facts | `tests/language/language-primitives.test.ts` | name already clear | - | - | LOW |
| `tests/p122-canonical-departure.test.ts` | BEHAVIOR | movement | `tests/movement/canonical-departure.test.ts` | milestone name; completed departure commits OFF_SCENE | - | fixtures/scene-continuity/fixture-world.json | MED |
| `tests/final-movement-closure.test.ts` | BEHAVIOR | movement | `tests/movement/character-locations.test.ts` | every persistent character has one authoritative location | - | - | MED |
| `tests/city-travel.test.ts` | BEHAVIOR | movement | `tests/movement/city-travel.test.ts` | name already clear | - | - | MED |
| `tests/consolidation-block3.test.ts` | BEHAVIOR | movement | `tests/movement/escort-and-follow.test.ts` | milestone name; held-person escort and narrated following | - | - | MED |
| `tests/npc-plus-pass-10-follow-grammar.test.ts` | BEHAVIOR | movement | `tests/movement/follow-grammar-adversarial.test.ts` | milestone name; adversarial follow corpus | - | - | MED |
| `tests/follow-recognition-closure.test.ts` | REGRESSION | movement | `tests/movement/follow-recognition.regression.test.ts` | pins the live FOLLOW drafts the grammar missed | - | fixtures/follow/follow-choice-live.jsonl | MED |
| `tests/npc-plus-pass-10-revision.test.ts` | BEHAVIOR | movement | `tests/movement/follow-revision-reconciliation.test.ts` | milestone name; revision / reconciliation x follow | - | - | MED |
| `tests/npc-plus-pass-10-state-matrix.test.ts` | BEHAVIOR | movement | `tests/movement/follow-state-matrix.test.ts` | milestone name; follow oracle across subject / presence / narration | - | - | MED |
| `tests/npc-plus-pass-10-faults.test.ts` | BEHAVIOR | movement | `tests/movement/follow-turn-provider-faults.test.ts` | milestone name; provider faults on the follow turn commit nothing | - | - | MED |
| `tests/npc-plus-pass-9.test.ts` | BEHAVIOR | movement | `tests/movement/household-following.test.ts` | milestone name; invitation is not movement; completed follow moves an NPC+ | - | - | MED |
| `tests/live-movement-regression.test.ts` | REGRESSION | movement | `tests/movement/live-movement.regression.test.ts` | pins verbatim live drafts: door exits, footsteps | - | - | MED |
| `tests/location-continuity.test.ts` | BEHAVIOR | movement | `tests/movement/location-continuity.test.ts` | name already clear | - | - | MED |
| `tests/movement-follow-debt-closure.test.ts` | BEHAVIOR | movement | `tests/movement/movement-follow-addressing.test.ts` | absent addressee, duplicate move proposals, live-draft follow (D-13..D-15) | - | fixtures/movement/ | MED |
| `tests/movement-follow-interaction-matrix.test.ts` | BEHAVIOR | movement | `tests/movement/movement-follow-interaction-matrix.test.ts` | name already clear | - | - | MED |
| `tests/narration-facts-movement.test.ts` | BEHAVIOR | narration-facts | `tests/movement/movement-narration-facts.test.ts` | movement facts and their consumers | - | - | HIGH |
| `tests/npc-plus-pass-10-audit.test.ts` | BEHAVIOR | audit | `tests/movement/movement-not-condition-audit.test.ts` | milestone name; walking destinations are not knockdowns | - | - | MED |
| `tests/h5-1-live-findings.test.ts` | REGRESSION | movement | `tests/movement/movement-phrases.regression.test.ts` | milestone name; pins H5 soak live findings (movement phrases, late naming) | - | - | MED |
| `tests/player-movement-location-consistency.test.ts` | BEHAVIOR | movement | `tests/movement/player-location-consistency.test.ts` | runtime, RAM and projections agree on the player's location | - | - | MED |
| `tests/player-travel-safeswitch.test.ts` | BEHAVIOR | movement | `tests/movement/player-travel-authority.test.ts` | player travel commits once; local stays local | - | - | MED |
| `tests/npc-plus-pass-2.test.ts` | BEHAVIOR | npc-plus | `tests/npc-plus/development-history.test.ts` | milestone name; development entries and stable contracts | - | - | MED |
| `tests/npc-plus-pass-3.test.ts` | BEHAVIOR | npc-plus | `tests/npc-plus/development-rollups.test.ts` | milestone name; long-term consolidation and recall | - | - | MED |
| `tests/explicit-npc-plus-promotion.test.ts` | BEHAVIOR | npc-plus | `tests/npc-plus/explicit-promotion.test.ts` | the Heartstone rite completed by the player | - | - | LOW |
| `tests/npc-plus-pass-10-determinism.test.ts` | BEHAVIOR | npc-plus | `tests/npc-plus/npc-plus-determinism.test.ts` | milestone name; byte-identical outputs across runs and round trips | - | - | MED |
| `tests/npc-plus-pass-1.test.ts` | BEHAVIOR | npc-plus | `tests/npc-plus/npc-plus-foundation.test.ts` | milestone name; premium record, packing, recovery, authored movability | - | - | MED |
| `tests/npc-visual-capability.test.ts` | BEHAVIOR | npc-plus | `tests/npc-plus/npc-tier-capabilities.test.ts` | tier and capabilities derived from the premium record | - | - | LOW |
| `tests/d10-emergent-mannerisms.test.ts` | BEHAVIOR | optional | `tests/optional/emergent-mannerisms.test.ts` | milestone name; extractor boundary and learned cues | - | fixtures/d10-calibrated-extraction.json | HIGH |
| `tests/d26-shadow.test.ts` | BEHAVIOR | optional | `tests/optional/mannerism-epistemic-status.test.ts` | milestone name; mannerism source, recurrence and epistemic status | - | - | MED |
| `tests/d10-mannerisms.test.ts` | BEHAVIOR | optional | `tests/optional/mannerism-seeds.test.ts` | milestone name; curated pool, promotion seed, the four-mannerism cap | - | - | MED |
| `tests/block6-lifecycle.test.ts` | BEHAVIOR | optional | `tests/optional/optional-service-lifecycle.test.ts` | milestone name; core turn returns while optional work is pending | - | - | MED |
| `tests/block6-optional-services.test.ts` | BEHAVIOR | optional | `tests/optional/optional-service-registry.test.ts` | milestone name; defaults, precedence, flags | - | - | MED |
| `tests/block6-sprites-portraits.test.ts` | BEHAVIOR | optional | `tests/optional/optional-sprites-portraits.test.ts` | milestone name; sprite and portrait services ON/OFF | - | - | MED |
| `tests/block7-domains.test.ts` | BEHAVIOR | optional | `tests/optional/optional-store-domains.test.ts` | milestone name; each optional domain reads and writes its side store | - | - | MED |
| `tests/block7-migration.test.ts` | BEHAVIOR | persistence | `tests/optional/optional-store-migration.test.ts` | milestone name; schema 8 split and precedence | - | - | HIGH |
| `tests/block7-store.test.ts` | BEHAVIOR | persistence | `tests/optional/optional-store.test.ts` | milestone name; atomic side-store round trip and failures | - | - | HIGH |
| `tests/campaign-restore.test.ts` | PERSISTENCE | persistence | `tests/persistence/campaign-restore.test.ts` | name already clear | - | - | MED |
| `tests/npc-plus-pass-10-persistence.test.ts` | PERSISTENCE | persistence | `tests/persistence/premium-state-tamper.test.ts` | milestone name; tampered premium / reflection state fails closed | - | - | MED |
| `tests/save-load-v1-persistence.test.ts` | PERSISTENCE | persistence | `tests/persistence/save-format-and-assets.test.ts` | version name; format, migration, canon compatibility, portrait assets | - | - | MED |
| `tests/save-hardening-h4.test.ts` | PERSISTENCE | persistence | `tests/persistence/save-migration-hardening.test.ts` | milestone name; legacy envelopes, compatibility evidence, corrupt holders | - | - | HIGH |
| `tests/persistence.test.ts` | PERSISTENCE | persistence | `tests/persistence/save-repository.test.ts` | filesystem round trip, rotation, corruption, ids | - | - | MED |
| `tests/controller-model-fallback.test.ts` | PROVIDER_CONTRACT | providers | `tests/providers/controller-model-fallback.test.ts` | name already clear | - | - | HIGH |
| `tests/controller-reliability.test.ts` | PROVIDER_CONTRACT | providers | `tests/providers/controller-output-normalization.test.ts` | lossless structural normalization and omission diagnostics | - | - | MED |
| `tests/narrator-alternatives.test.ts` | BEHAVIOR | providers | `tests/providers/narrator-alternatives.test.ts` | name already clear | - | - | HIGH |
| `tests/block4-plumbing.test.ts` | PROVIDER_CONTRACT | providers | `tests/providers/narrator-finish-plumbing.test.ts` | milestone name; caps, finish_reason, usage through the provider result | - | - | MED |
| `tests/llm-provider.test.ts` | PROVIDER_CONTRACT | providers | `tests/providers/openrouter-client.test.ts` | narrator / controller wire contract | - | - | LOW |
| `tests/provider-reliability-contract.test.ts` | PROVIDER_CONTRACT | providers | `tests/providers/provider-reliability-contract.test.ts` | name already clear | - | - | MED |
| `tests/provider-retry-h5.test.ts` | PROVIDER_CONTRACT | providers | `tests/providers/provider-retry.test.ts` | milestone name; retry classification and budgets | - | - | MED |
| `tests/npc-plus-pass-6.test.ts` | BEHAVIOR | optional | `tests/reflection/evidence-cited-reflection.test.ts` | milestone name; bounded evidence-cited reflection | - | - | MED |
| `tests/npc-plus-pass-7.test.ts` | BEHAVIOR | optional | `tests/reflection/post-turn-reflection-maintenance.test.ts` | milestone name; post-turn maintenance cannot alter the completed turn | - | - | HIGH |
| `tests/production-structured-reflection.test.ts` | BEHAVIOR | optional | `tests/reflection/production-structured-reflection.test.ts` | name already clear | - | frozen/reflection/, frozen/reflection/reflection-v23-cvc-e1.ts | MED |
| `tests/reflection-citation-visibility.test.ts` | HISTORICAL_REPLAY | optional | `tests/reflection/reflection-citation-visibility-oracle.test.ts` | frozen CVC oracle | - | frozen/reflection/reflection-v2.ts, frozen/reflection/reflection-v22.ts, frozen/reflection/reflection-v23-cvc.ts, frozen/reflection/reflection-v23.ts, frozen/reflection/reflection-wire-v2-cvc.ts | LOW |
| `tests/npc-plus-pass-10-reflection.test.ts` | BEHAVIOR | optional | `tests/reflection/reflection-development-evidence.test.ts` | milestone name; development sequences feed reflection; unsupported claims rejected | - | - | MED |
| `tests/reflection-environmental-e1.test.ts` | HISTORICAL_REPLAY | optional | `tests/reflection/reflection-environmental-oracle.test.ts` | frozen E1 environmental oracle | - | frozen/reflection/reflection-v2.ts, frozen/reflection/reflection-v23-cvc-e1.ts, frozen/reflection/reflection-v23-cvc.ts | LOW |
| `tests/reflection-consolidation-equivalence.test.ts` | HISTORICAL_REPLAY | optional | `tests/reflection/reflection-oracle-equivalence.test.ts` | production equals the frozen oracle chain | - | frozen/reflection/, frozen/reflection/reflection-v2.ts, frozen/reflection/reflection-v22.ts, frozen/reflection/reflection-v23-cvc-e1.ts, frozen/reflection/reflection-v23-cvc.ts | HIGH |
| `tests/reflection-shadow-mode.test.ts` | BEHAVIOR | optional | `tests/reflection/reflection-shadow-mode.test.ts` | name already clear | - | - | LOW |
| `tests/minor-debt-sweep.test.ts` | BEHAVIOR | optional | `tests/reflection/reflection-trigger-and-deprecated-refs.test.ts` | milestone-ish name; deprecated refs, lifecycle trigger, OFF / SHADOW maintenance (D-16, D-17, D-20) | - | - | MED |
| `tests/reflection-v2.test.ts` | HISTORICAL_REPLAY | optional | `tests/reflection/reflection-v2-oracle.test.ts` | oracle version is the contract identity; suffix marks it as frozen | - | frozen/reflection/reflection-v2.ts | LOW |
| `tests/reflection-v21.test.ts` | HISTORICAL_REPLAY | optional | `tests/reflection/reflection-v21-oracle.test.ts` | oracle version is the contract identity | - | frozen/reflection/reflection-v2.ts, frozen/reflection/reflection-v21.ts | LOW |
| `tests/reflection-v22.test.ts` | HISTORICAL_REPLAY | optional | `tests/reflection/reflection-v22-oracle.test.ts` | oracle version is the contract identity | - | frozen/reflection/reflection-v2.ts, frozen/reflection/reflection-v22.ts | LOW |
| `tests/reflection-v23.test.ts` | HISTORICAL_REPLAY | optional | `tests/reflection/reflection-v23-oracle.test.ts` | oracle version is the contract identity | - | frozen/reflection/reflection-v2.ts, frozen/reflection/reflection-v22.ts, frozen/reflection/reflection-v23.ts | LOW |
| `tests/reflection-wire-domains.test.ts` | BEHAVIOR | optional | `tests/reflection/reflection-wire-domains.test.ts` | name already clear | - | - | LOW |
| `tests/reflection-wire.test.ts` | HISTORICAL_REPLAY | optional | `tests/reflection/reflection-wire-oracle.test.ts` | frozen wire projection and the reflection benchmark gate | - | frozen/reflection/reflection-v23.ts, frozen/reflection/reflection-wire.ts | LOW |
| `tests/lexical-search.test.ts` | UNIT | world | `tests/retrieval/lexical-search.test.ts` | name already clear | - | retrieval-eval/evaluate.ts | MED |
| `tests/retrieval-benchmark-h3.test.ts` | BEHAVIOR | world | `tests/retrieval/retrieval-gates.test.ts` | milestone name; offline retrieval gates on real canon | - | retrieval-eval/fixture-embedding-provider.ts | LOW |
| `tests/retrieval-recall.test.ts` | BEHAVIOR | world | `tests/retrieval/retrieval-recall.test.ts` | name already clear | - | - | LOW |
| `tests/retrieval.test.ts` | UNIT | world | `tests/retrieval/retrieval-service.test.ts` | the retrieval service contract | - | - | HIGH |
| `tests/semantic-search.test.ts` | UNIT | world | `tests/retrieval/semantic-search.test.ts` | name already clear | - | retrieval-eval/evaluate.ts, retrieval-eval/fixture-embedding-provider.ts | MED |
| `tests/voyage-embedding-provider.test.ts` | PROVIDER_CONTRACT | providers | `tests/retrieval/voyage-embedding-provider.test.ts` | name already clear | - | - | MED |
| `tests/application-closure.test.ts` | INTEGRATION | session | `tests/session/application-smoke.integration.test.ts` | application facade end to end | - | - | MED |
| `tests/save-load-v1-session.test.ts` | INTEGRATION | session | `tests/session/campaign-lifecycle.integration.test.ts` | version name; host create / load / save / autosave / shutdown | - | - | HIGH |
| `tests/player-character-profile.test.ts` | BEHAVIOR | session | `tests/session/player-character-profile.test.ts` | name already clear | - | - | HIGH |
| `tests/block4-rev2.test.ts` | BEHAVIOR | session | `tests/session/turn-request-identity.test.ts` | milestone name; REV-2 turn_key / expected_revision HTTP contract | - | - | MED |
| `tests/context-compressor-fake.ts` | TEST_SUPPORT | support | `tests/support/context-compressor-fake.ts` | support module | context-compaction.test.ts | - | LOW |
| `tests/pass10-corpus.ts` | FIXTURE_BUILDER | support | `tests/support/follow-grammar-corpus.ts` | support module | npc-plus-pass-10-follow-grammar.test.ts, pass10-grammar-report.ts | - | LOW |
| `tests/pass10-support.ts` | TEST_SUPPORT | support | `tests/support/follow-household-harness.ts` | support module | final-movement-closure.test.ts, live-movement-regression.test.ts, movement-follow-debt-closure.test.ts, movement-follow-interaction-matrix.test.ts (+15) | - | MED |
| `tests/closure-soak.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/closure-soak.ts` | support module | - | - | MED |
| `tests/diagnostics-benchmark-h4.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/diagnostics-benchmark-h4.ts` | support module | - | - | MED |
| `tests/pass10-ablation.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/pass10-ablation.ts` | support module | - | - | MED |
| `tests/pass10-grammar-report.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/pass10-grammar-report.ts` | support module | - | - | MED |
| `tests/pass10-notes-replay.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/pass10-notes-replay.ts` | support module | - | - | LOW |
| `tests/pass10-perf.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/pass10-perf.ts` | support module | - | - | MED |
| `tests/pass10-probe-audit.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/pass10-probe-audit.ts` | support module | - | - | MED |
| `tests/pass10-probe.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/pass10-probe.ts` | support module | - | - | MED |
| `tests/pass10-prompt-dump.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/pass10-prompt-dump.ts` | support module | - | - | MED |
| `tests/pass10-replay-live.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/pass10-replay-live.ts` | support module | - | - | MED |
| `tests/provider-failure-matrix-h5.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/provider-failure-matrix-h5.ts` | support module | - | - | MED |
| `tests/retry-benchmark-h5.ts` | HISTORICAL_REPLAY_SUPPORT | support | `tests/support/historical/retry-benchmark-h5.ts` | support module | - | - | MED |
| `tests/pass10-deps.ts` | ARCHITECTURE_HELPER | support | `tests/support/import-graph.ts` | support module | npc-plus-pass-10-architecture.test.ts | - | HIGH |
| `tests/movement-readers.ts` | TEST_SUPPORT | support | `tests/support/movement-readers.ts` | support module | h5-1-live-findings.test.ts, identity-continuity-stress.test.ts, language-call-paths.test.ts, location-continuity.test.ts (+3) | - | LOW |
| `tests/pass10-headroom.ts` | TEST_SUPPORT | support | `tests/support/npc-plus-headroom.ts` | support module | npc-plus-pass-10-context.test.ts, npc-plus-pass-10-determinism.test.ts, npc-plus-pass-10-persistence.test.ts | - | HIGH |
| `tests/offer-fixtures.ts` | TEST_SUPPORT | support | `tests/support/offer-fixtures.ts` | support module | background-grounding.test.ts, block5b-auth2.test.ts, h5-1-live-findings.test.ts, historical-replay-regressions.test.ts (+3) | - | LOW |
| `tests/opening-docs.ts` | TEST_SUPPORT | support | `tests/support/opening-docs.ts` | support module | live-regression-repair-1-1.test.ts, live-regression-repair.test.ts | - | LOW |
| `tests/block7-fixtures.ts` | FIXTURE_BUILDER | support | `tests/support/optional-domain-fixtures.ts` | support module | block6-lifecycle.test.ts, block7-domains.test.ts, block7-migration.test.ts, block7-store.test.ts | - | MED |
| `tests/persistence-fixtures.ts` | FIXTURE_BUILDER | support | `tests/support/persistence-fixtures.ts` | support module | campaign-restore.test.ts, persistence.test.ts, save-hardening-h4.test.ts, save-load-v1-persistence.test.ts | - | MED |
| `tests/provider-failure-scripts.ts` | TEST_SUPPORT | support | `tests/support/provider-failure-scripts.ts` | support module | application-closure.test.ts, controller-model-fallback.test.ts, diagnostics-aggregate-h5.test.ts, movement-follow-debt-closure.test.ts (+6) | - | MED |
| `tests/provisional-helper.ts` | TEST_SUPPORT | support | `tests/support/provisional-helper.ts` | support module | created-name-provenance.test.ts, created-person-identity-binding.test.ts, long-playthrough-continuity-audit.test.ts | - | LOW |
| `tests/raw-save.ts` | TEST_SUPPORT | support | `tests/support/raw-save.ts` | support module | scripts/browser/block7-browser-check.mjs, block7-fixtures.ts, persistence.test.ts, portrait-gallery.test.ts | - | HIGH |
| `src/dev/support/receipt-corpus.ts` | FIXTURE_BUILDER | support | `tests/support/receipt-corpus.ts` | support module | receipt-corpus.test.ts | - | LOW |
| `tests/production-reflection-fixtures.ts` | TEST_SUPPORT | support | `tests/support/reflection-fixtures.ts` | support module | block6-lifecycle.test.ts, block7-domains.test.ts, minor-debt-sweep.test.ts, npc-plus-pass-10-determinism.test.ts (+6) | - | LOW |
| `tests/turn-fixtures.ts` | TEST_SUPPORT | support | `tests/support/turn-fixtures.ts` | support module | scripts/browser/turn-reliability-browser-check.mjs, scripts/historical/controller-bakeoff-round-2.mjs, actual-offer-v1.test.ts, application-closure.test.ts (+110) | - | HIGH |
| `tests/turn-http.ts` | TEST_SUPPORT | support | `tests/support/turn-http.ts` | support module | block4-pipe2.test.ts, block4-rev2.test.ts, player-movement-location-consistency.test.ts, player-travel-safeswitch.test.ts (+3) | - | LOW |
| `tests/block4-fixtures.ts` | TEST_SUPPORT | support | `tests/support/turn-reliability-fixtures.ts` | support module | scripts/browser/block5b-browser-check.mjs, scripts/browser/confirmation-browser-check.mjs, scripts/browser/turn-reliability-browser-check.mjs, block4-narr1.test.ts (+7) | - | HIGH |
| `tests/fixtures.ts` | FIXTURE_BUILDER | support | `tests/support/world-fixtures.ts` | support module | authoring.test.ts, campaign-restore.test.ts, campaign-state.test.ts, city-travel.test.ts (+17) | - | LOW |
| `tests/build-discipline.test.ts` | TOOLING | tooling | `tests/tooling/build-discipline.test.ts` | name already clear | - | - | HIGH |
| `tests/d04-compaction-bakeoff.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/compaction-bakeoff.test.ts` | milestone name; the frozen compaction bakeoff scorer | - | - | LOW |
| `tests/controller-bakeoff-metrics.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/controller-bakeoff-metrics.test.ts` | name already clear | - | - | LOW |
| `tests/controller-benchmark.test.ts` | TOOLING | tooling | `tests/tooling/controller-benchmark.test.ts` | name already clear | - | - | LOW |
| `tests/diagnostics-aggregate-h5.test.ts` | TOOLING | tooling | `tests/tooling/diagnostics-aggregate.test.ts` | milestone name; diagnostics percentiles, aggregation, live scenario matrix | - | retrieval-eval/fixture-embedding-provider.ts | MED |
| `tests/evidence-quote.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/evidence-quote.test.ts` | name already clear (frozen quote policy) | - | - | LOW |
| `tests/npc-plus-pass-10-probe.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/follow-choice-probe.test.ts` | milestone name; the paid probe's pure parts | - | - | MED |
| `tests/historical-anchors.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/historical-anchors.test.ts` | historical identity is the contract | - | fixtures/historical-replay/HISTORICAL_TURN_ANCHORS.json, fixtures/historical-replay/HISTORICAL_TURN_ANCHORS.sha256 | HIGH |
| `tests/historical-replay-comparator.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/historical-replay-comparator.test.ts` | historical identity is the contract | - | fixtures/historical-replay/HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md | LOW |
| `tests/live-harness-support.test.ts` | TOOLING | tooling | `tests/tooling/live-harness-support.test.ts` | name already clear | - | - | LOW |
| `tests/d05-live-retry.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/live-retry-transport.test.ts` | milestone name; the frozen live retry transport | - | - | LOW |
| `tests/modern-benchmark.test.ts` | TOOLING | tooling | `tests/tooling/modern-benchmark.test.ts` | name already clear | - | benchmark/runner.ts, benchmark/scenario.ts, benchmark/scenarios.ts | LOW |
| `tests/narrator-bakeoff.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/narrator-bakeoff.test.ts` | name already clear | - | playthrough/curated.json, playthrough/historical-windows.json | MED |
| `tests/npc-plus-pass-8.test.ts` | TOOLING | tooling | `tests/tooling/organic-discovery-observer.test.ts` | milestone name; the evaluation-only discovery observer | - | - | MED |
| `tests/playthrough.test.ts` | HISTORICAL_REPLAY | tooling | `tests/tooling/playthrough-replay.test.ts` | curated playthrough CSV extraction and replay records | - | playthrough/curated.json | MED |
| `tests/core-properties.test.ts` | BEHAVIOR | coordinator | `tests/turn/core-state-properties.test.ts` | property coverage for the deterministic core (revisions, receipts, routes) | - | - | MED |
| `tests/block4-narr1.test.ts` | BEHAVIOR | coordinator | `tests/turn/narrator-length-recovery.test.ts` | milestone name; NARR-1 one recovery for a length stop | - | - | MED |
| `tests/block4-pipe2.test.ts` | BEHAVIOR | coordinator | `tests/turn/post-commit-guards.test.ts` | milestone name; PIPE-2 post-commit failures become warnings | - | - | MED |
| `tests/turn-coordinator.test.ts` | BEHAVIOR | coordinator | `tests/turn/turn-coordinator.test.ts` | name already clear | - | - | MED |
| `tests/turn-diagnostics-h4.test.ts` | BEHAVIOR | coordinator | `tests/turn/turn-diagnostics.test.ts` | milestone name; opt-in diagnostics | - | - | MED |
| `tests/turn-failures.test.ts` | BEHAVIOR | coordinator | `tests/turn/turn-failure-codes.test.ts` | every TurnFailure code | - | - | MED |
| `tests/turn-pipeline-golden.test.ts` | BEHAVIOR | coordinator | `tests/turn/turn-pipeline-golden.test.ts` | name already clear | - | golden/turn-pipeline.json | MED |
| `tests/turn-pipeline-invariants.test.ts` | BEHAVIOR | coordinator | `tests/turn/turn-pipeline-invariants.test.ts` | name already clear | - | - | MED |
| `tests/turn-stages.test.ts` | UNIT | coordinator | `tests/turn/turn-stages.test.ts` | name already clear | - | - | HIGH |
| `tests/actual-offer-ui.test.ts` | BEHAVIOR | ui | `tests/ui/actual-offer-card.test.ts` | the browser offer card | - | - | HIGH |
| `tests/ui-campaigns.test.ts` | BEHAVIOR | ui | `tests/ui/campaign-screens.test.ts` | start screen, create / load, save control | - | - | HIGH |
| `tests/block5a-ui.test.ts` | BEHAVIOR | ui | `tests/ui/confirmation-card.test.ts` | milestone name; the generic confirmation card | - | - | HIGH |
| `tests/inventory-ui.test.ts` | INTEGRATION | ui | `tests/ui/inventory-http.test.ts` | inventory UI over HTTP | - | - | LOW |
| `tests/ui-v1.test.ts` | BEHAVIOR | ui | `tests/ui/play-client.test.ts` | version name; the play client | - | fixtures/scene-continuity/fixture-world.json | HIGH |
| `tests/player-character-view.test.ts` | BEHAVIOR | ui | `tests/ui/player-character-view.test.ts` | name already clear | - | fixtures/scene-continuity/fixture-world.json | LOW |
| `tests/ui-playtest.test.ts` | INTEGRATION | ui | `tests/ui/ui-playtest.test.ts` | name already clear | - | - | HIGH |
| `tests/temporal-environmental.test.ts` | BEHAVIOR | world | `tests/world/calendar-climate-weather.test.ts` | calendar, seasons, climate, weather | - | - | LOW |
| `tests/campaign-state.test.ts` | UNIT | world | `tests/world/campaign-state.test.ts` | name already clear | - | - | MED |
| `tests/mana.test.ts` | UNIT | world | `tests/world/mana.test.ts` | name already clear | - | - | MED |
| `tests/narrative-context.test.ts` | BEHAVIOR | world | `tests/world/narrative-context.test.ts` | name already clear | - | - | MED |
| `tests/runtime.test.ts` | BEHAVIOR | world | `tests/world/runtime-presence.test.ts` | presence derives from runtime locations | - | - | MED |
| `tests/scene-delta.test.ts` | UNIT | world | `tests/world/scene-delta.test.ts` | name already clear | - | - | MED |
| `tests/temporal-action.test.ts` | BEHAVIOR | world | `tests/world/temporal-action.test.ts` | name already clear | - | - | MED |
| `tests/p11-time-foundation.test.ts` | BEHAVIOR | world | `tests/world/world-clock.test.ts` | milestone name; boundaries, rollover, explicit waits | - | - | MED |
| `tests/world.test.ts` | UNIT | world | `tests/world/world-dataset.test.ts` | dataset integrity and validation | - | - | MED |

### 5b. Test titles

282 test titles in 61 files were rewritten (282 in source; they expand to 443 runtime test names because of templated titles). Patterns:

- milestone prefixes removed where the folder and file now carry the context: `block 6 …`, `block 7 …`, `Block 12:`, `P3 …`, `P3.1 …` .. `P12.2 …`, `P8 …`, `P11 …`, `D10 …`, `D10 P2 …`, `D26 …`, `H5 …`;
- prefixes that grouped tests inside one file became words: `P1.2` -> `RPG dialogue:`, `P3.2` -> `opaque refs:`, `P6.2` -> `background rule:`, `P11 V1 boundary` -> `daypart boundary`;
- milestone nouns became the thing they named: "the H3 mixed 30-person scene" -> "the mixed 30-person stress scene", "pass 2 NPCs" -> "the power-figure NPCs", "byte-identical to the pre-H2 trace" -> "byte-identical to the frozen golden trace", "Pass 10 recorded 164" -> "its recorded 164-line baseline", "P1 format" -> "RPG format", "D26 observer" -> "mannerism portrayal observer";
- left as is: requirement case labels, debt IDs, five parenthetical bug provenances, the historical-replay labels in `tests/tooling/live-retry-transport.test.ts` (`D05`) and `tests/tooling/narrator-bakeoff.test.ts` (`Phase 1M.1`), and the oracle versions (`V2` .. `V23`).

The complete before / after list is in the Cleanup F scratch output (`titles-changed.json`, copied to `/mnt/project-files/reports/cleanup-f/`). No title change touched an assertion: every change is inside the first argument of `test()`.

## 6. Architecture tests

`tests/architecture/` holds the structural guards, each one invariant family, none merged:

| File | Invariant family |
|---|---|
| `runtime-layer-boundaries.architecture.test.ts` (was `npc-plus-pass-10-architecture`) | the whole `src/` runtime import graph: no cycle, layer direction, Reflection off the turn's critical path, `runTurn` size baseline, NPC+ modules free of diagnostics, D-21 type back-edges. It covers all of `src/`, not only NPC+, so the name says "runtime layers" |
| `narration-facts-consumers.architecture.test.ts` | one NarrationFactSource per turn; consumers read shared facts; attribution only in the fact layer |
| `dev-tooling-boundaries.architecture.test.ts` | production never imports dev tooling; tests use only supported dev folders; historical tools not npm commands; tool output under `artifacts/local/` |
| `evaluation-history-isolation.architecture.test.ts` | nothing executable reads `docs/evaluations/`; fixture provenance hashes |
| `test-taxonomy.architecture.test.ts` (new) | the test taxonomy itself (section 12) |

Their helper `tests/pass10-deps.ts` became `tests/support/import-graph.ts` (ARCHITECTURE_HELPER), its self-run check `process.argv[1]?.endsWith("import-graph.js")` rewritten with it.

## 7. Regression tests

`.regression.test.ts` marks the 15 suites that pin recorded bugs, each with its origin in the header comment:

| File | Pins |
|---|---|
| `authority/live-controller-premise.regression.test.ts` | controller parse diagnostics, dialogue premise, gesture agency |
| `authority/live-npc-evidence.regression.test.ts` | exact failing live sentences for evidence handling |
| `authority/live-npc-handover.regression.test.ts` | live NPC regression corpus: offers, handovers, guards |
| `authority/offer-acceptance-evidence.regression.test.ts` | replay record 115 collective acceptance (pins the Phase 1M.1 replay bug) |
| `commerce/person-offer-playthrough.regression.test.ts` | pins the live playthrough in which no person offer card appeared |
| `commerce/price-phrase.regression.test.ts` | number and price regressions found by the historical replay |
| `context/lore-invention.regression.test.ts` | pins observed live canon inventions (the detector must flag each) |
| `context/opening-smoke.regression.test.ts` | pins the 2026-09-29 opening smoke run (passer-by attribution, player profile) |
| `context/recent-window-departure-grounding.regression.test.ts` | recent window, temporary departure, player events, grounding guards from live findings |
| `identity/canonical-name-reservation.regression.test.ts` | pins the late-naming-with-a-canonical-handle bug fixed with the reservation policy |
| `identity/long-playthrough-identity.regression.test.ts` | pins the fixed long-playthrough naming defects |
| `identity/partner-identity-subject.regression.test.ts` | pins the REPO-12 partner-guard bug (self-introduction subject) |
| `movement/follow-recognition.regression.test.ts` | pins the live FOLLOW drafts the grammar missed |
| `movement/live-movement.regression.test.ts` | pins verbatim live drafts: door exits, footsteps |
| `movement/movement-phrases.regression.test.ts` | pins H5 soak live findings (movement phrases, late naming) |

Suites that grew out of a debt item but specify a contract (`narrator-length-recovery`, `post-commit-guards`, `turn-request-identity`, `explicit-character-materialization`) are BEHAVIOR, not REGRESSION.

## 8. Historical replay

Historical identity is kept where it is the contract:

- `tests/frozen/reflection/` (8 oracle modules) unchanged; its tests are `tests/reflection/reflection-v2-oracle.test.ts`, `-v21-`, `-v22-`, `-v23-oracle`, `reflection-citation-visibility-oracle`, `reflection-environmental-oracle`, `reflection-wire-oracle` and `reflection-oracle-equivalence` (production equals the oracle).
- `tests/tooling/`: `historical-anchors`, `historical-replay-comparator`, `playthrough-replay`, `controller-bakeoff-metrics`, `compaction-bakeoff`, `live-retry-transport` (the frozen D05 transport), `narrator-bakeoff`, `evidence-quote`, `follow-choice-probe`. Their titles keep the replay labels their frozen artifacts carry.
- Fixture names under `tests/fixtures/` (B2 provenance, for example `calderan-west-pass1-after.json`, `p35-live-introduction.ts`, `d10-calibrated-extraction.json`) were not renamed; `tests/fixtures/provenance.json` only had its `used_by` paths updated (hashes unchanged, guarded).
- The 17 historical modules in the `TEST_HISTORICAL_ALLOWED` list of the dev-tooling guard are still used by these tests; the list did not change.
- All historical-replay tests run in `npm test`, as before.

## 9. Support modules

31 non-test modules: TEST_SUPPORT 13, FIXTURE_BUILDER 5, ARCHITECTURE_HELPER 1, HISTORICAL_REPLAY_SUPPORT 12 (no ORACLE outside `tests/frozen/`). No helper was redesigned; only names and paths changed.

| Was | Now | Class |
|---|---|---|
| `tests/context-compressor-fake.ts` | `tests/support/context-compressor-fake.ts` | TEST_SUPPORT |
| `tests/pass10-corpus.ts` | `tests/support/follow-grammar-corpus.ts` | FIXTURE_BUILDER |
| `tests/pass10-support.ts` | `tests/support/follow-household-harness.ts` | TEST_SUPPORT |
| `tests/closure-soak.ts` | `tests/support/historical/closure-soak.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/diagnostics-benchmark-h4.ts` | `tests/support/historical/diagnostics-benchmark-h4.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-ablation.ts` | `tests/support/historical/pass10-ablation.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-grammar-report.ts` | `tests/support/historical/pass10-grammar-report.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-notes-replay.ts` | `tests/support/historical/pass10-notes-replay.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-perf.ts` | `tests/support/historical/pass10-perf.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-probe-audit.ts` | `tests/support/historical/pass10-probe-audit.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-probe.ts` | `tests/support/historical/pass10-probe.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-prompt-dump.ts` | `tests/support/historical/pass10-prompt-dump.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-replay-live.ts` | `tests/support/historical/pass10-replay-live.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/provider-failure-matrix-h5.ts` | `tests/support/historical/provider-failure-matrix-h5.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/retry-benchmark-h5.ts` | `tests/support/historical/retry-benchmark-h5.ts` | HISTORICAL_REPLAY_SUPPORT |
| `tests/pass10-deps.ts` | `tests/support/import-graph.ts` | ARCHITECTURE_HELPER |
| `tests/movement-readers.ts` | `tests/support/movement-readers.ts` | TEST_SUPPORT |
| `tests/pass10-headroom.ts` | `tests/support/npc-plus-headroom.ts` | TEST_SUPPORT |
| `tests/offer-fixtures.ts` | `tests/support/offer-fixtures.ts` | TEST_SUPPORT |
| `tests/opening-docs.ts` | `tests/support/opening-docs.ts` | TEST_SUPPORT |
| `tests/block7-fixtures.ts` | `tests/support/optional-domain-fixtures.ts` | FIXTURE_BUILDER |
| `tests/persistence-fixtures.ts` | `tests/support/persistence-fixtures.ts` | FIXTURE_BUILDER |
| `tests/provider-failure-scripts.ts` | `tests/support/provider-failure-scripts.ts` | TEST_SUPPORT |
| `tests/provisional-helper.ts` | `tests/support/provisional-helper.ts` | TEST_SUPPORT |
| `tests/raw-save.ts` | `tests/support/raw-save.ts` | TEST_SUPPORT |
| `src/dev/support/receipt-corpus.ts` | `tests/support/receipt-corpus.ts` | FIXTURE_BUILDER |
| `tests/production-reflection-fixtures.ts` | `tests/support/reflection-fixtures.ts` | TEST_SUPPORT |
| `tests/turn-fixtures.ts` | `tests/support/turn-fixtures.ts` | TEST_SUPPORT |
| `tests/turn-http.ts` | `tests/support/turn-http.ts` | TEST_SUPPORT |
| `tests/block4-fixtures.ts` | `tests/support/turn-reliability-fixtures.ts` | TEST_SUPPORT |
| `tests/fixtures.ts` | `tests/support/world-fixtures.ts` | FIXTURE_BUILDER |

The twelve runnable historical tools (`pass10-*`, `closure-soak`, the H4/H5 benchmarks) keep their names because historical reports cite them by name; their documented commands become `node .build/tests/support/historical/<name>.js`. Fixtures and helpers that dev tools also import stay in `src/dev/support/` (13 modules, each imported by dev tools and tests); the one test-only module there, `receipt-corpus.ts`, moved to `tests/support/`.

## 10. Path-sensitive updates

Rewritten mechanically by the Cleanup F mover (from the Cleanup E mover: relative `import` / `export from` / `import()` / `import("…")` types / `new URL(…, import.meta.url)` specifiers, `.build/` specifiers, repository-literal paths, `process.argv[1]?.endsWith(…)` self-run checks; CR/LF preserved byte for byte, checked):

- 225 moved tests and 31 support modules: every relative specifier (for example `../src/` -> `../../src/`, `./turn-fixtures.js` -> `../support/turn-fixtures.js`); `tests/canon/heartstone-locations.test.ts` resolves the inspection CLI through `new URL("../../src/dev/inspect/inspect-context.js", import.meta.url)`.
- `package.json`: `test` -> `npm run build && node --test ".build/tests/**/*.test.js"` (quoted, so Node expands the glob on Windows and Linux; an unquoted `**` would be expanded by `sh` without globstar and miss the root); `test:playthrough` -> `.build/tests/tooling/playthrough-replay.test.js`.
- The npm test pin in `tests/tooling/build-discipline.test.ts` and the comments in `scripts/clean.mjs` follow the new command.
- `scripts/browser/{turn-reliability,confirmation,block5b,block7}-browser-check.mjs` load `tests/support/turn-reliability-fixtures.js`, `tests/support/turn-fixtures.js` and `tests/support/raw-save.js`; `scripts/historical/controller-bakeoff-round-2.mjs` imports `.build/tests/support/turn-fixtures.js`.
- `source:` provenance labels in `src/dev/benchmark/controller-benchmark-cases.ts` and `scripts/historical/controller-bakeoff-round-2-cases.mjs` (data, never asserted against a path) point to the new test paths.
- Production: three doc comments naming a test (`src/turn/language/gates.ts`, `src/turn/optional/reflection.ts`, `src/turn/structured/reflection-validation.ts`).
- Current docs: `README.md`, `docs/TESTING.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_DEBT_REGISTER.md`, `docs/UI_ENGINE_CONTRACT.md` and nine `docs/architecture/*.md` (test paths only). Historical reports under `docs/evaluations/` were not touched. Consequence, accepted: `node scripts/check-doc-links.mjs --all` (historical evidence, report only) goes from 321 to 339 broken links; the 18 new ones are links from six historical reports (10 in `CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.md`, 4 in `D05_LIVE_RETRY_VALIDATION.md`, 4 in older repair and reliability reports) to test files at their old root paths. Section 5 maps every old path to its new one. This report itself has 0 broken links.
- Source-byte and path pins audited: every test that reads `src/` text does so by repository-relative path (unchanged by test moves); hash pins hash fixtures or `src/` files that did not move; no pin needed a new baseline. `check:architecture` reports 359 modules instead of 360 and a new runtime graph hash only because `receipt-corpus.ts` left `src/` (it had no runtime importer in production); 0 runtime back-edges before and after.

Rename-mapped graph proof: the TypeScript import graph of `src/`, `tests/` and `scripts/` before the move, mapped through the rename table, equals the graph after it: 634 modules, 3362 runtime edges and 4524 edges with type imports, 0 missing, 0 extra. The `receipt-corpus.ts` move was checked the same way.

## 11. Discovery proof

|  | Before (`d94cde9`) | After |
|---|---|---|
| Executable test files discovered | 225 | 226 |
| Test cases | 3694 | 3699 |
| Failed / skipped / todo | 0 / 0 / 0 | 0 / 0 / 0 |
| Test files at the `tests/` root | 225 | 0 |
| Milestone-named current executable files (broad / guard pattern) | 73 / 58 | 0 / 0 |
| Non-test modules at the `tests/` root | 30 | 0 |
| Frozen oracle modules executed as tests | 0 | 0 |

Per-file proof (a `node --test` reporter counting every passed case per compiled file): after the moves and before any title change, each of the 225 files had exactly the same case count and the same ordered top-level test names at its new path. After the title rewrites, each file still has the same case count; 443 runtime names differ, exactly the rewritten titles. The only count change is **+5 = `tests/architecture/test-taxonomy.architecture.test.ts`** (the new guard). 0 tests deleted, 0 behavior tests lost. Not discovered, by design and as before: `tests/frozen/` (oracle modules, compiled with the tests and imported by the oracle tests), `tests/support/` (helpers and runnable historical tools), `tests/benchmark/` (run by `benchmark:modern` and by `tests/tooling/modern-benchmark.test.ts`), `tests/retrieval-eval/` (`eval:retrieval`).

## 12. Structural guard

`tests/architecture/test-taxonomy.architecture.test.ts` (5 tests, file names from `git ls-files -co`, so a new untracked test is checked too):

1. every current executable test is `tests/<domain>/<name>.test.ts` with a domain from an explicit list (21 folders); `tests/frozen/`, `tests/fixtures/` and `tests/support/historical/` hold no test;
2. no current executable test name matches block N, pass N, phase N, pNN, consolidation(-block), hotfix, wave N, milestone or cleanup-x (with positive and negative self-checks: `passive-perception.test.ts` passes);
3. `.architecture` is used under `tests/architecture/` and only there, one suffix at most;
4. non-test modules live in `tests/support/`, `tests/fixtures/`, `tests/frozen/`, `tests/benchmark/` or `tests/retrieval-eval/`; current support modules are not milestone-named (historical tools under `tests/support/historical/` are exempt);
5. `npm test` uses the recursive glob and `tsconfig.json` compiles `tests/**/*.ts`.

Mutation check: adding `tests/block9-foo.test.ts`, `tests/identity/p12-thing.test.ts` and `tests/turn-helper.ts` failed guards 1, 2 and 4; removing them restored 5/5. The guard reads no documentation.

## 13. Validation

From an empty `.build`, each step run separately with its exit code:

| Step | Result |
|---|---|
| `npm run clean` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | **3699 tests, 3699 pass, 0 fail** (3694 + 5 guard) |
| `npm run benchmark:modern` | **55/55**, 0 known product gaps |
| `npm run check:architecture` | 359 modules, 28 source back-edges (type imports, unchanged), **0 runtime back-edges** |
| `npm run check:docs` | **0 broken** current links |
| architecture subset (`tests/architecture/`) | 5 files green inside the full run |
| tooling / replay subset (`tests/tooling/`) | 15 files green inside the full run |
| identity subset (`tests/identity/`) | 24 files green inside the full run |
| rename-mapped import graph | identical (section 10) |
| `actual-offer-browser-check.mjs` | exit 0 |
| `block5b-browser-check.mjs` | exit 0 |
| `block6-browser-check.mjs` | exit 0 |
| `block7-browser-check.mjs` | exit 0 |
| `confirmation-browser-check.mjs` | exit 0 |
| `explicit-promotion-browser-check.mjs` | exit 0 |
| `keep-track-browser-check.mjs` | exit 0 |
| `turn-reliability-browser-check.mjs` | exit 0 |

Browser checks were run because four of them load test support from moved paths. No live call, no image call.

## 14. Debt closures

- **TEST-3 CLOSED.** Milestone naming is gone from the current executable suite (73 broad / 58 guard-pattern names before, 0 after; 282 milestone-dependent titles rewritten). Tests importing shared dev support is accepted ownership (REPO-10).
- **REPO-10 CLOSED.** Ownership re-checked module by module: the 13 `src/dev/support/` modules are each shared by dev tools and tests (`turn-fixture.ts`: 24 dev tools, 67 tests), so they stay; the one test-only module moved to `tests/support/`; no helper sits at the `tests/` root (guarded).
- **TEST-2 re-checked, OPEN P3.** 17 test files outside `tests/architecture/` read `src/` text (the UI client suites load the browser source into a VM on purpose; others pin source text). Renames do not change it.
- **TEST-4 OPEN P3.** Stale tests for obsolete architecture (bake-off helpers, Voyage, the OpenRouter image client) are a PRV-7 decision, not a naming issue.
- **TEST-5 re-checked, OPEN P3.** Real wall-clock waits remain in `tests/ui/play-client.test.ts` outside the TEST-1 lifecycle test and in `tests/providers/provider-retry.test.ts`.
- **REPO-5** was already CLOSED (Cleanup C); nothing to change.

## 15. Remaining test debt

TEST-2, TEST-4, TEST-5 (above), TEST-6 / CI-1 (coverage, no CI), TEST-7 / TEST-8 as in the register. The five parenthetical provenances in titles are intentional. `tests/fixtures/p35-live-introduction.ts` keeps its fixture name (B2 provenance).

## 16. Cleanup G handoff

Cleanup G (lifecycle vocabulary) starts from the pushed Cleanup F commit. Test files that will carry the vocabulary it normalizes: `tests/authority/explicit-character-materialization.test.ts`, `tests/identity/keep-track.test.ts`, `tests/identity/created-person-persistence.test.ts`, `tests/identity/character-lifecycle-repair.test.ts`, `tests/npc-plus/explicit-promotion.test.ts`, `tests/commerce/narrated-captive-purchase.test.ts`, `tests/identity/identity-continuity-edge-cases.test.ts` ("nobody is promoted anywhere" describes a provisional person, which is a materialization question) and `tests/turn/turn-stages.test.ts` ("location_changed suppresses new promotions"). Cleanup F did not change any lifecycle wording.
