# Repository Cleanup B: documentation namespace normalization

Status: uncommitted working tree on top of main `cc9cb7c` (REPO-12), 2026-10-13. Documentation structure only.

- **Unchanged:** gameplay, `src/` behavior, test behavior, the save schema, NarrationFacts.
- **Not started:** Cleanup B2 (evidence and fixture decoupling).
- **No external calls:** no live call and no image call.

**Result.** The repository root and `docs/` now hold current truth only. Every historical report is preserved byte for byte under `docs/evaluations/`:

- 114 tracked files moved with `git mv`, every one a pure rename (`R100`): 47 markdown reports and 67 screenshots or data files;
- no historical file content changed;
- current documentation has 0 broken internal links, checked by the new read-only `npm run check:docs`.

## 1. Baseline (main `cc9cb7c`)

| Item | Value |
| --- | --- |
| HEAD / `git status` | `cc9cb7c`, clean |
| Tracked files | 2,019 |
| Tracked markdown at the repository root | 32: `README.md` plus 30 milestone reports and the stale `DEBT_REGISTER.md` |
| Files directly under `docs/` | 18 markdown files: 12 current, 6 labelled HISTORICAL / SUPERSEDED |
| Other `docs/` directories | `architecture/` 34 files, 9 of them labelled HISTORICAL; `authoring/` 10; `schemas/` 2; `world/` 1; `ui-screenshots/` 62, including a stray Phase 1A record `RUNTIME_FOUNDATION.md`; `portrait-benchmark-anime/` 6 |
| `docs/evaluations/` | 928 tracked files, 153 directly under it |
| Broken internal links before | current docs (59 files, 438 relative links): **0**; all tracked markdown (295 files): 16, all inside historical evidence (code links to deleted modules `narrated-captives.ts` / `scene-departure.ts`, and the stray `RUNTIME_FOUNDATION.md` pointing at its old siblings) |
| Clean run | typecheck 0, build 0, **3679 tests, 0 fail**, benchmark **55/55, 0 known product gaps**, check:architecture exit 0 (374 modules, **0 runtime back-edges**) |

Code that reads documentation:

- **Tests:**
  - `tests/authoring.test.ts` reads `docs/authoring/AUTHORING_GUIDE.md` and `docs/authoring/templates/`.
  - `tests/historical-replay-comparator.test.ts` reads `docs/evaluations/HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md`.
  - Eleven more tests read machine evidence under `docs/evaluations/` (section 10).
- **Tools:** 43 files in `src/` and `scripts/` read or write `docs/evaluations/` (section 10).
- **Moved reports:** no test or tool reads any file that this block moves. Four are named, by file name only, in comments (section 4).

## 2. Taxonomy

| Class | Meaning | Where it lives now |
| --- | --- | --- |
| CURRENT NORMATIVE | current architecture, contracts, semantics | `docs/ARCHITECTURE.md`, `docs/UI*.md`, `docs/IMAGE_SYSTEM.md`, `docs/HEARTSTONE.md`, `docs/architecture/`, `docs/world/` |
| ACTIVE STATUS | current state, roadmap, debt | `docs/CURRENT_STATE.md`, `docs/ROADMAP.md`, `docs/MASTER_ROADMAP.md`, `docs/MASTER_DEBT_REGISTER.md` |
| GUIDES | running, configuring, testing, authoring, schemas | `README.md`, `docs/CONFIGURATION.md`, `docs/TESTING.md`, `docs/authoring/`, `docs/schemas/` |
| HISTORICAL EVIDENCE | block, phase and pass reports, audits, live certifications, bakeoffs, superseded documents | `docs/evaluations/` (consolidation and repository blocks directly under it, older material in `archive/`, plus the three new collections `reports/`, `phases/` and `superseded/`) |
| MACHINE EVIDENCE | traces, recorded runs, fixtures, screenshots | the run directories under `docs/evaluations/`; screenshots and contact sheets under `docs/evaluations/reports/` |

**Rule:** the repository root and the current namespaces are current truth, and `docs/evaluations/` is history. The historical namespace got exactly three new directories, each named for what it receives: `reports/`, `phases/` and `superseded/`. The existing 928 files under `docs/evaluations/` were not reorganized.

## 3. Before / after counts

| Location | Before | After |
| --- | --- | --- |
| Tracked markdown at the repository root | 32 | **1** (`README.md`) |
| Files directly under `docs/` | 18 (6 historical) | **12** (all current) |
| `docs/architecture/` | 34 (9 historical) | **25** (all current; the mixed documents LLM_PROVIDER, PERSISTENCE and TURN_COORDINATOR are current with historical sections already marked inside them) |
| `docs/ui-screenshots/`, `docs/portrait-benchmark-anime/` | 62 + 6 | removed (moved) |
| `docs/evaluations/` | 928 | **1,044** (+114 moved, +2 new: `README.md` and this report) |
| Tracked files | 2,019 | 2,022 (+3 new: this report, `docs/evaluations/README.md`, `scripts/check-doc-links.mjs`) |
| Current-doc relative links (checker) | 59 files, 438 links, 0 broken | **44 files, 347 links, 0 broken** (15 historical files left the namespace) |

## 4. Exact move table

Every row is a `git mv`, and `git diff --cached -M` shows 114 × `R100`. Inbound links are counted on `cc9cb7c`. "Current" links come from current documentation and were repaired. "Historical" links come from other historical files and were left as written.

| Current path | New path | Class | Reason | Inbound links (current / historical) | Test/tool consumers | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/architecture/PHASE_1E.md` | `docs/evaluations/phases/PHASE_1E.md` | HISTORICAL EVIDENCE | Phase 1 record (labelled HISTORICAL) inside a current namespace | 4 / 2 | none | low: current links repaired |
| `docs/architecture/PHASE_1E_2_AUDIT.md` | `docs/evaluations/phases/PHASE_1E_2_AUDIT.md` | HISTORICAL EVIDENCE | Phase 1 record (labelled HISTORICAL) inside a current namespace | 2 / 1 | none | low: current links repaired |
| `docs/architecture/PHASE_1_DECISIONS.md` | `docs/evaluations/phases/PHASE_1_DECISIONS.md` | HISTORICAL EVIDENCE | Phase 1 record (labelled HISTORICAL) inside a current namespace | 3 / 0 | none | low: current links repaired |
| `docs/architecture/RETRIEVAL_FOUNDATION.md` | `docs/evaluations/phases/RETRIEVAL_FOUNDATION.md` | HISTORICAL EVIDENCE | Phase 1 record (labelled HISTORICAL) inside a current namespace | 2 / 0 | none | low: current links repaired |
| `docs/ui-screenshots/RUNTIME_FOUNDATION.md` | `docs/evaluations/phases/RUNTIME_FOUNDATION.md` | HISTORICAL EVIDENCE | Phase 1 record (labelled HISTORICAL) inside a current namespace | 0 / 0 | none | none |
| `docs/architecture/SCENE_DELTA_ENGINE.md` | `docs/evaluations/phases/SCENE_DELTA_ENGINE.md` | HISTORICAL EVIDENCE | Phase 1 record (labelled HISTORICAL) inside a current namespace | 3 / 1 | none | low: current links repaired |
| `ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md` | `docs/evaluations/reports/ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | comments in `scripts/anime-portrait-benchmark*.mjs`, `src/campaign/anime-portrait-tags.ts` (file name only) | low: name-only comment, still unique |
| `CANONICAL_NPC_CASTING_EPHEMERAL_DUPLICATION_AUDIT_FIX.md` | `docs/evaluations/reports/CANONICAL_NPC_CASTING_EPHEMERAL_DUPLICATION_AUDIT_FIX.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 1 | none | low: current links repaired |
| `CHARACTER_PERFORMANCE_CONTRACT_PILOT.md` | `docs/evaluations/reports/CHARACTER_PERFORMANCE_CONTRACT_PILOT.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 1 | none | low: current links repaired |
| `CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md` | `docs/evaluations/reports/CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | comment in `tests/long-playthrough-continuity-audit.test.ts` (file name only) | low: name-only comment, still unique |
| `CREATED_PERSON_IDENTITY_BINDING_FIX.md` | `docs/evaluations/reports/CREATED_PERSON_IDENTITY_BINDING_FIX.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | comment in `tests/long-playthrough-continuity-audit.test.ts` (file name only) | low: name-only comment, still unique |
| `CURRENT_CHARACTER_NAME_PROJECTION_FIX.md` | `docs/evaluations/reports/CURRENT_CHARACTER_NAME_PROJECTION_FIX.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `HOUSEHOLD_UI_AND_NPCPLUS_APPEARANCE_EDITOR_AUDIT.md` | `docs/evaluations/reports/HOUSEHOLD_UI_AND_NPCPLUS_APPEARANCE_EDITOR_AUDIT.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `docs/architecture/LEXICAL_SEARCH_EVALUATION.md` | `docs/evaluations/reports/LEXICAL_SEARCH_EVALUATION.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 3 / 0 | none | low: current links repaired |
| `LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md` | `docs/evaluations/reports/LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `P11_KISS_TIME_OF_DAY_FOUNDATION.md` | `docs/evaluations/reports/P11_KISS_TIME_OF_DAY_FOUNDATION.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 1 | none | low: current links repaired |
| `P11_TEMPORAL_SYSTEM_AUDIT.md` | `docs/evaluations/reports/P11_TEMPORAL_SYSTEM_AUDIT.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 2 | none | low: current links repaired |
| `P12_1_BOUNDED_RECENT_SCENE_NARRATION.md` | `docs/evaluations/reports/P12_1_BOUNDED_RECENT_SCENE_NARRATION.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 2 / 1 | none | low: current links repaired |
| `P12_2_CANONICAL_DEPARTURE_RECONCILIATION.md` | `docs/evaluations/reports/P12_2_CANONICAL_DEPARTURE_RECONCILIATION.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 1 | none | low: current links repaired |
| `P12_IMMEDIATE_SCENE_CONTINUITY_AUDIT.md` | `docs/evaluations/reports/P12_IMMEDIATE_SCENE_CONTINUITY_AUDIT.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 2 | none | low: current links repaired |
| `P3_3_CANONICAL_NAME_DISCLOSURE_FINAL.md` | `docs/evaluations/reports/P3_3_CANONICAL_NAME_DISCLOSURE_FINAL.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 1 | none | low: current links repaired |
| `P3_3_P10_P11_REGENERATION_FIX.md` | `docs/evaluations/reports/P3_3_P10_P11_REGENERATION_FIX.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 2 | none | low: current links repaired |
| `P3_4_CANONICAL_PARTICIPANT_CONTINUITY.md` | `docs/evaluations/reports/P3_4_CANONICAL_PARTICIPANT_CONTINUITY.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 1 | none | low: current links repaired |
| `P3_5_CANONICAL_NAME_KNOWLEDGE_COMMIT.md` | `docs/evaluations/reports/P3_5_CANONICAL_NAME_KNOWLEDGE_COMMIT.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 1 | none | low: current links repaired |
| `P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md` | `docs/evaluations/reports/P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 1 | none | low: current links repaired |
| `PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md` | `docs/evaluations/reports/PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `PERMANENT_APPEARANCE_V1.md` | `docs/evaluations/reports/PERMANENT_APPEARANCE_V1.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `PLAYER_CHARACTER_PROJECTION_AUDIT.md` | `docs/evaluations/reports/PLAYER_CHARACTER_PROJECTION_AUDIT.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `PLAYER_MOVEMENT_LOCATION_CONSISTENCY_AUDIT_FIX.md` | `docs/evaluations/reports/PLAYER_MOVEMENT_LOCATION_CONSISTENCY_AUDIT_FIX.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `PLAYER_TRAVEL_AUTHORITY_AND_LOCATION_SAFESWITCH_IMPLEMENTATION.md` | `docs/evaluations/reports/PLAYER_TRAVEL_AUTHORITY_AND_LOCATION_SAFESWITCH_IMPLEMENTATION.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `PLAYER_TRAVEL_AUTHORITY_FULL_AUDIT_AND_PLAN.md` | `docs/evaluations/reports/PLAYER_TRAVEL_AUTHORITY_FULL_AUDIT_AND_PLAN.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `PORTRAIT_GALLERY_AND_ROLES_V2.md` | `docs/evaluations/reports/PORTRAIT_GALLERY_AND_ROLES_V2.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `PORTRAIT_IMAGE_GENERATION_V1.md` | `docs/evaluations/reports/PORTRAIT_IMAGE_GENERATION_V1.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `PORTRAIT_PROMPT_BUILDER_V1.md` | `docs/evaluations/reports/PORTRAIT_PROMPT_BUILDER_V1.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `docs/architecture/SEMANTIC_SEARCH_EVALUATION.md` | `docs/evaluations/reports/SEMANTIC_SEARCH_EVALUATION.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 2 / 0 | none | low: current links repaired |
| `docs/architecture/SPRITE_FIDELITY_HARDENING.md` | `docs/evaluations/reports/SPRITE_FIDELITY_HARDENING.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `docs/architecture/SPRITE_QUALITY_V2.md` | `docs/evaluations/reports/SPRITE_QUALITY_V2.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `TEMPORAL_ACTION_RESOLVER_V1.md` | `docs/evaluations/reports/TEMPORAL_ACTION_RESOLVER_V1.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | comment in `tests/long-playthrough-continuity-audit.test.ts` (file name only) | low: name-only comment, still unique |
| `UI_PLAYSCREEN_CHARACTER_CARD_REBUILD.md` | `docs/evaluations/reports/UI_PLAYSCREEN_CHARACTER_CARD_REBUILD.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `UI_V1_IMMERSIVE_PLAYTEST_INTERFACE.md` | `docs/evaluations/reports/UI_V1_IMMERSIVE_PLAYTEST_INTERFACE.md` | HISTORICAL EVIDENCE | milestone report or one-time evaluation outside the historical namespace | 1 / 0 | none | low: current links repaired |
| `DEBT_REGISTER.md` | `docs/evaluations/superseded/DEBT_REGISTER.md` | SUPERSEDED | replaced document still in a current namespace | 1 / 1 | none | low: current links repaired |
| `docs/ENGINE_CAPABILITIES_PRE_UI.md` | `docs/evaluations/superseded/ENGINE_CAPABILITIES_PRE_UI.md` | SUPERSEDED | replaced document still in a current namespace | 1 / 0 | none | low: current links repaired |
| `docs/ENGINE_FREEZE_PRE_UI.md` | `docs/evaluations/superseded/ENGINE_FREEZE_PRE_UI.md` | SUPERSEDED | replaced document still in a current namespace | 1 / 0 | none | low: current links repaired |
| `docs/image_system_audit.md` | `docs/evaluations/superseded/image_system_audit.md` | SUPERSEDED | replaced document still in a current namespace | 1 / 0 | none | low: current links repaired |
| `docs/image_system_v1_gap_analysis.md` | `docs/evaluations/superseded/image_system_v1_gap_analysis.md` | SUPERSEDED | replaced document still in a current namespace | 1 / 0 | none | low: current links repaired |
| `docs/save_load_audit.md` | `docs/evaluations/superseded/save_load_audit.md` | SUPERSEDED | replaced document still in a current namespace | 1 / 0 | none | low: current links repaired |
| `docs/save_load_v1_design.md` | `docs/evaluations/superseded/save_load_v1_design.md` | SUPERSEDED | replaced document still in a current namespace | 1 / 0 | none | low: current links repaired |
| `docs/ui-screenshots/` (all 61 image/data files) | `docs/evaluations/reports/ui-screenshots/` | MACHINE EVIDENCE | screenshots / contact sheets of historical reports, beside current docs | 0 / 8 | none | none |
| `docs/portrait-benchmark-anime/` (all 6 image/data files) | `docs/evaluations/reports/portrait-benchmark-anime/` | MACHINE EVIDENCE | screenshots / contact sheets of historical reports, beside current docs | 0 / 0 | none | none |

Totals: 47 markdown files (34 to `reports/`: 30 root reports plus 4 one-time evaluations from `docs/architecture/`; 6 to `phases/`; 7 to `superseded/`) plus 67 image and data files. Inbound links: 59 from current documentation, all repaired; 28 from historical files, left as written.

## 5. Root cleanup

All 31 non-README root markdown files are historical. The 30 P-numbered passes, fixes, audits, portrait and UI milestones and the character-performance pilot went to `docs/evaluations/reports/`. The stale root `DEBT_REGISTER.md` (REPO-11), superseded by the Master Technical Debt Register, went to `docs/evaluations/superseded/`. Nothing was deleted.

`README.md` is the only root markdown file. The typo-named source transcripts `longplaytrough_transcript.txt` and `playtrough_example/` are not markdown. Reports and tools cite them, so they stay at the root (REPO-2 residual).

## 6. Docs root cleanup

Six files moved to `docs/evaluations/superseded/`. Each one's own status line already said HISTORICAL or SUPERSEDED:

- `ENGINE_CAPABILITIES_PRE_UI.md` and `ENGINE_FREEZE_PRE_UI.md` (2026-10-02 pre-UI snapshots);
- `image_system_audit.md` and `image_system_v1_gap_analysis.md` (superseded by `IMAGE_SYSTEM.md`);
- `save_load_audit.md` and `save_load_v1_design.md` (superseded by `architecture/PERSISTENCE.md`).

The twelve current files stay where they are: README, ARCHITECTURE, CONFIGURATION, CURRENT_STATE, HEARTSTONE, IMAGE_SYSTEM, MASTER_DEBT_REGISTER, MASTER_ROADMAP, ROADMAP, TESTING, UI and UI_ENGINE_CONTRACT. Every one carries a "Status: Current" or "ACTIVE" line.

The two image directories also moved: `docs/ui-screenshots/` (historical captures, plus a stray Phase 1A record) and `docs/portrait-benchmark-anime/` (benchmark contact sheets). They now sit under `docs/evaluations/reports/`, beside the reports that show them.

## 7. Architecture cleanup

Nine files labelled HISTORICAL left `docs/architecture/`:

- **To `docs/evaluations/phases/`:** `PHASE_1E.md`, `PHASE_1E_2_AUDIT.md`, `PHASE_1_DECISIONS.md`, `RETRIEVAL_FOUNDATION.md` (Phase 1F) and `SCENE_DELTA_ENGINE.md` (Phase 1B), joined by the stray `RUNTIME_FOUNDATION.md` (Phase 1A).
- **To `docs/evaluations/reports/`:** `LEXICAL_SEARCH_EVALUATION.md`, `SEMANTIC_SEARCH_EVALUATION.md`, `SPRITE_FIDELITY_HARDENING.md` and `SPRITE_QUALITY_V2.md`.

The 25 remaining files are the current subsystem contracts. Three of them (LLM_PROVIDER, PERSISTENCE, TURN_COORDINATOR) contain explicitly marked historical sections and stay: their current parts are the reference, and splitting them would rewrite content. `PHYSICAL_INTERACTION.md` is an accepted design whose class B is built, so it is current.

## 8. Evaluation namespace result

`docs/evaluations/` is the single historical root.

- **New collections:** `reports/` (34 reports with `ui-screenshots/` and `portrait-benchmark-anime/`), `phases/` (6) and `superseded/` (7).
- **New index:** [`docs/evaluations/README.md`](README.md) describes the collections without listing every file. It states that reports are evidence of their own date, and that the relative links inside a moved report resolve from its **original** location (this move table).
- **Untouched:** the 153 files directly under `docs/evaluations/`, `archive/` and every run directory.

## 9. Link repairs

**Current documentation: 59 link targets, link targets only.**

| File | Links repaired |
| --- | --- |
| `docs/README.md` | 46 (then rewritten as the index, section 9.1) |
| `docs/MASTER_ROADMAP.md` | 3 |
| `docs/architecture/RETRIEVAL.md` | 3 |
| `docs/architecture/SCENE_RAM.md` | 2 |
| `docs/architecture/LEXICAL_SEARCH.md`, `NARRATIVE_AUTHORITY.md`, `NARRATIVE_CONTEXT.md`, `SEMANTIC_SEARCH.md` | 1 each |
| `docs/authoring/AUTHORING_GUIDE.md` | 1 |

**Textual navigation references in current docs, turned into working links:**

- `IMAGE_SYSTEM.md`: its "superseded by this document" pair;
- `TESTING.md`: the screenshots path;
- `UI_ENGINE_CONTRACT.md`: the pre-UI capabilities pointer;
- `architecture/PERSISTENCE.md`: the save/load design and audit;
- `MASTER_ROADMAP.md`: the reconstruction note;
- `MASTER_DEBT_REGISTER.md`: the old root register pointer, and the rows of section 12.

**Historical files: none changed.**

- The 47 moved reports are byte-identical. Their relative links refer to their original location. 173 links inside them do not resolve from the new path: 167 because of the move, and 6 that were already broken before it (5 in `RUNTIME_FOUNDATION.md`, 1 in the P8 price-anchors report).
- One older evaluation, `D09_DEFERRED_SHADOW_POLICY.md`, links to the old root `DEBT_REGISTER.md`.
- All of these are classified **HISTORICAL TEXT**, explained once in the evaluations index and resolvable through the move table. Rewriting them would modify the evidence.
- Bare file-name mentions in code comments (`tests/long-playthrough-continuity-audit.test.ts`, `scripts/anime-portrait-benchmark*.mjs`, `src/campaign/anime-portrait-tags.ts`) still name a unique file and were left unchanged (no source edit).

### 9.1 Docs index and root README

`docs/README.md` is rewritten as the entry point, with four sections:

1. **Current / normative:** a question-to-document table answering "where is the architecture / persistence / NarrationFacts / UI contract / trade / naming / images / time / Heartstone", plus the subsystem references.
2. **Active status:** current state, roadmap, debt register, master roadmap.
3. **Guides:** README, configuration, testing, authoring, schemas.
4. **Historical evidence:** links to the collections (blocks, `reports/`, `phases/`, `superseded/`, the codebase audit, machine evidence), not to individual files.

No answer requires a block number.

`README.md` got three small changes:

- the documentation bullets now say current vs historical, with the historical link going to the evaluations index;
- the `npm run check:docs` command was added;
- the stale "Latest offline run: 3660" was updated to 3679.

Every README link resolves, and none points at a moved file.

## 10. Remaining `docs/evaluations` fixture coupling (for Cleanup B2)

Nothing here was changed. These still read evidence from `docs/evaluations/`, and none of the paths moved.

**Tests that read evidence:**

| Test | Evidence read |
| --- | --- |
| `p121-recent-scene-narration`, `p122-canonical-departure`, `player-character-view`, `ui-v1` | `p12-scene-continuity/fixture-world.json` |
| `follow-recognition-closure` | `pass10/follow-choice-live.jsonl` |
| `historical-anchors` | `historical_replay/HISTORICAL_TURN_ANCHORS.json` and `.sha256` |
| `historical-replay-comparator` | `HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md` |
| `movement-follow-debt-closure` | `movement-follow-closure/*` |
| `west-everyday-canon` | `calderan-west-npc-pass2a-after.json` |
| `west-npc-canon` | `calderan-west-pass1-after.json` |
| `tests/pass10-ablation.ts` | writes `pass10/` by default |

Comment-only mentions in tests: benchmark scenarios, build-discipline, h5-1-live-findings, historical-replay-regressions, live-regression-repair, narration-facts-architecture, npc-plus-pass-3.

**Tools (43 files):**

- `src/dev/`: `eval-evidence`, `shadow-evidence`, `follow-choice-e2e` and `historical-replay-compare` read evidence. `eval-*`, `probe-*`, `replay-*` and `audit-authored-data` write their outputs there.
- `scripts/`: the `d09-*` harnesses and `minor-debt-controller-audit` read and write `d09-reflection/evidence/` and `minor-debt-sweep/`. The live smokes, bakeoffs and `audit-player-travel-authority` write there.
- Production comments: four source comments (`state-controller.ts`, `commerce-evidence.ts`, `evidence-authorization.ts` and `scene-state-render.ts`) cite reports by path. They are comments only, and the paths are unchanged.

## 11. Validation

All runs are on the Cleanup B working tree, started from an empty `.build` (`npm run clean`). No live calls, no image calls. No browser check reads a moved file, so none was run.

| Check | Result |
| --- | --- |
| `npm run clean` | `.build` removed |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | **3679 tests, 3679 pass, 0 fail** (the same count as main `cc9cb7c`; the known flaky test did not fail) |
| `npm run benchmark:modern` | **55/55 passed, 0 known product gaps** |
| `npm run check:architecture` | exit 0: 374 modules, 32 source back edges, 6 source components, **0 runtime back edges**, 0 runtime components, runtime graph sha256 `2b5999a0…d170` |
| `npm run check:docs` | **44 files, 347 relative links, 0 broken**, exit 0 |
| `node scripts/check-doc-links.mjs --all` | 297 files, 988 links, 184 broken, all HISTORICAL TEXT (section 13); report only |
| Docs-consuming tests (`authoring`, `historical-replay-comparator`, `historical-anchors`, `p121`, `build-discipline`) | **52 tests, 52 pass** |
| `node --test scripts/tests/d09-evidence-artifacts.test.mjs` | **7 tests, 7 pass**. (A first `node --test scripts/tests/` call failed because Node 22 does not accept a bare directory argument; the file run is the real check.) |
| `node scripts/anime-portrait-benchmark-scores.mjs` (its comment names a moved report; it reads no file) | exit 0, tables printed |
| `git diff --cached -M --stat` on the moves | 114 × `R100`, 0 content changes in moved files |

## 12. Debt closures (current debt docs only)

**Register:**

- **REPO-11: CLOSED.** The stale root register was moved, unchanged, to `evaluations/superseded/`.
- **DOC-14: CLOSED** (the same file).
- **DOC-16: CLOSED** for the namespace: the root and `docs/` hold current truth, and history has an index. Evidence beside reports inside `docs/evaluations/` remains, as REPO-3 (Cleanup B2).
- **REPO-2: PARTLY CLOSED.** The markdown part is done; the typo-named root transcripts remain.
- **DOC-15: PARTLY CLOSED.** `npm run check:docs` exists; the staleness tripwire is still open.
- **D10:** updated.

**Roadmap:** the T-REPO note and the reconstruction note updated. CURRENT_STATE, TESTING and README updated.

**Not claimed:**

- B2 fixture coupling (REPO-3);
- `src/dev` and `scripts` organization (REPO-4, REPO-6, REPO-10);
- milestone-named tests (TEST-3);
- reflection consolidation.

## 13. Remaining documentation debt

- **Fixture coupling:** tests and tools still consume `docs/evaluations/` (section 10). That is REPO-3, for Cleanup B2.
- **Links inside moved reports:** the 47 moved reports keep links that are relative to their original location (HISTORICAL TEXT).
- **Older evidence:** 16 links were already broken on `cc9cb7c` and are unchanged: 10 in `CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.md` point at the deleted `narrated-captives.ts` and `scene-departure.ts`, 5 in `RUNTIME_FOUNDATION.md`, 1 in the P8 price-anchors report. `--all` now reports 184 = 16 pre-existing + 167 original-location links in moved reports + 1 inbound in `D09_DEFERRED_SHADOW_POLICY.md`, all HISTORICAL TEXT.
- **Typo-named transcripts:** `longplaytrough_transcript.txt` and `playtrough_example/` remain at the root (REPO-2 residual).
- **Staleness:** there is no staleness tripwire (DOC-15 residual).
- **Labels:** `docs/README.md` labels some ACTIVE documents (the "labelled" 2026-10-11 family) that were last fully reconciled before the consolidation. Re-auditing their content is out of scope for a structure-only block.
- **Open decisions:** DOC-12 (ACTUAL_OFFER self-contradiction) and DOC-13 (author-only canon section) are unchanged.

## 14. Cleanup B2 handoff

**Goal:** stop tests and tools reading `docs/evaluations/`.

**Suggested order:**

1. Copy the four readers of `p12-scene-continuity/fixture-world.json` and the other test inputs (section 10) to `tests/fixtures/`, and point the tests there. The historical copies stay where they are.
2. Make `historical_replay/` anchors and the oracle test inputs explicit fixtures, keeping the sha256 freeze.
3. Point the evidence-writing tools (`src/dev/eval-*`, `probe-*`, the live scripts) at `artifacts/local/` by default, publishing into `docs/evaluations/` only on purpose.
4. Then add a test that nothing under `tests/` or `src/` reads `docs/evaluations/`, the way `build-discipline` guards `saves/`.

`npm run check:docs` already guards the current namespace during that work.
