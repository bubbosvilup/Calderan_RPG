# Repository Cleanup B2: evaluation fixture decoupling

Status: block report (historical once written). Date: 2026-10-13. Base: main `feba138` (Repository Cleanup B). Working tree only: **no commit, no push.** No gameplay, production behavior or test assertion changed; only file locations and tool default paths.

**Result in one paragraph.** `docs/evaluations/` is now history only. The 10 files that tests read from it are byte-identical copies under `tests/fixtures/`, organised by domain, with their source and sha256 in `tests/fixtures/provenance.json`; the historical originals are untouched. 49 default output paths in 42 active tools now point at the gitignored `artifacts/local/evaluations/`, so running a tool never writes into the committed history. A new guard, `tests/evaluation-history-isolation.test.ts`, fails if any test, production module or tool uses `docs/evaluations/` as a path, except four historical reproduction tools on a documented allowlist. The full suite also passes with `docs/evaluations/` physically moved away. **REPO-3 is CLOSED**; the archive's weight (1,044 files, about 48 MB, 105 historical `.mjs`) is split into a new P3 item, REPO-13, for Cleanup C.

## 1. Baseline (main `feba138`)

| Item | Value |
| --- | --- |
| HEAD | `feba138` (Repository Cleanup B), equal to `origin/main` |
| `git status` | clean |
| `npm run clean`, `typecheck`, `build` | exit 0 |
| `npm test` | **3679 tests, 3679 pass, 0 fail** |
| `npm run benchmark:modern` | **55/55, 0 known product gaps** |
| `npm run check:architecture` | exit 0: 374 modules, 32 source back edges, 0 runtime back edges, runtime graph sha256 `2b5999a0…d170` |
| `npm run check:docs` | 44 files, 347 links, 0 broken (`--all`: 184 historical, report only) |
| Active consumers of `docs/evaluations/**` | 10 tests read fixtures; 42 active tools (41 in `src/dev` and `scripts`, plus `tests/pass10-ablation.ts`) wrote default output there; 1 dev tool read a fixture; 4 historical tools read evidence (section 2) |

`docs/ui-screenshots/` and `docs/portrait-benchmark-anime/` have no consumer left: Cleanup B moved them, and the only mentions are bare file names in comments.

## 2. Consumer inventory

Found with `git grep` over `tests/`, `src/`, `scripts/` and `package.json` for the three namespaces, both as string paths and as `join("docs", "evaluations", …)`. A line that only cites a report in a comment is HISTORICAL TEXT.

### 2.1 Tests (TEST FIXTURE READ)

| Consumer | Current path (before) | Purpose | R/W | Needed at runtime | Target owner |
| --- | --- | --- | --- | --- | --- |
| `historical-anchors` | `historical_replay/HISTORICAL_TURN_ANCHORS.json` and `.sha256` | validates the frozen replay anchors and their hash | R | test only | `tests/fixtures/historical-replay/` |
| `historical-replay-comparator` | `HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md` | the comparator must implement every MUST_MATCH row of the frozen oracle | R | test only | `tests/fixtures/historical-replay/` |
| `p121-recent-scene-narration`, `p122-canonical-departure`, `player-character-view`, `ui-v1` | `p12-scene-continuity/fixture-world.json` | small authored world | R | test only | `tests/fixtures/scene-continuity/` |
| `follow-recognition-closure` | `pass10/follow-choice-live.jsonl` | recorded raw Narrator drafts replayed offline | R | test only | `tests/fixtures/follow/` |
| `movement-follow-debt-closure` | `movement-follow-closure/{d01,d02-d03,d03-label}-live.jsonl` | recorded live narration for D01-D03 | R | test only | `tests/fixtures/movement/` |
| `west-npc-canon` | `calderan-west-pass1-after.json` | retrieval snapshot the test compares against | R | test only | `tests/fixtures/canon/` |
| `west-everyday-canon` | `calderan-west-npc-pass2a-after.json` | same, after NPC pass 2A | R | test only | `tests/fixtures/canon/` |

HISTORICAL TEXT only (comments citing a report or a recorded run whose text is inlined in the test): `benchmark/scenarios.ts`, `build-discipline` (an assertion message), `h5-1-live-findings`, `historical-replay-regressions`, `live-regression-repair`, `narration-facts-architecture`, `npc-plus-pass-3`.

### 2.2 Tools

| Consumer | Path (before) | Class | R/W | Target |
| --- | --- | --- | --- | --- |
| `src/dev/follow-choice-e2e.ts` | `pass10/follow-choice-live.jsonl` | ACTIVE DEV TOOL INPUT | R | the `tests/fixtures/follow/` copy |
| `tests/pass10-ablation.ts` | `pass10/` | ACTIVE DEV TOOL DEFAULT OUTPUT | W | `artifacts/local/evaluations/pass10/` |
| `src/dev/consolidation-block{2,3,4,5a,5b,6,7,8,9,10,11}-live.ts`, `keep-track-live.ts`, `person-offer-live-cert.ts`, `identity-live-cert.ts` | `<block>_live/` | ACTIVE DEV TOOL DEFAULT OUTPUT (live certifications) | W | `artifacts/local/evaluations/<same name>/` |
| `src/dev/historical-replay.ts`, `historical-replay-compare.ts` | `historical_replay/iteration_NN/` | ACTIVE DEV TOOL DEFAULT OUTPUT (the compare reads what the replay wrote, plus `saves/`) | W / R | `artifacts/local/evaluations/historical_replay/iteration_NN/` (both) |
| `src/dev/eval-hardening.ts` (also `npm run inspect:turn` and `eval:playthrough`), `eval-participants.ts` (`eval:participants`), `eval-live-h5.ts`, `eval-organic-reflection.ts`, `eval-organic-discovery.ts`, `replay-hardening.ts`, `replay-stage-b.ts`, `audit-authored-data.ts` | timestamped files and `h5-live/` | ACTIVE DEV TOOL DEFAULT OUTPUT | W | `artifacts/local/evaluations/` |
| `src/dev/probe-final-movement-live.ts`, `probe-movement-closure-live.ts`, `probe-follow-choice.ts`, `probe-follow-choice-live.ts` | `final-movement-closure/`, `movement-follow-closure/`, `pass10/` (the last one defaulted to **the very file the follow test reads**) | ACTIVE DEV TOOL DEFAULT OUTPUT | W | `artifacts/local/evaluations/<same subpath>` |
| `scripts/item-sprite-{live,quality,fidelity}-smoke.mjs`, `item-inventory-live-smoke.mjs`, `transfer-domain-live-smoke.mjs`, `live-controller-reliability-1.mjs`, `gemini-vertex-rerun.mjs`, `narrator-bakeoff-1.mjs`, `long-form-trial-1.mjs`, `controller-bakeoff-round-2.mjs`, `audit-player-travel-authority.mjs` | report files, asset roots, "public" run dirs | ACTIVE DEV TOOL DEFAULT OUTPUT | W | `artifacts/local/evaluations/<same name>` |
| `src/dev/eval-evidence.ts` (`npm run eval:evidence`), `src/dev/shadow-evidence.ts` (`npm run eval:shadow-evidence`) | read `archive/phase-1m*`, `phase-1n-authority-runs`; wrote a timestamped result | HISTORICAL TOOL (input); output ACTIVE | R (W moved) | inputs stay (allowlisted); output to `artifacts/local/evaluations/` |
| `scripts/d09-*.mjs` (10 files) | `d09-reflection/evidence/*` | HISTORICAL TOOL: run, resume and analyze the recorded D09 directories; two read frozen D09 plans | R / W | unchanged, allowlisted |
| `scripts/minor-debt-controller-audit.mjs` | reads D09 receipts, writes `minor-debt-sweep/` | HISTORICAL TOOL | R / W | unchanged, allowlisted |
| `src/dev/eval-narrators.ts:106`, `replay-stage-b.ts:16` | a `human_review` note and an error message that name a historical file | HISTORICAL TEXT (string content, not a path) | none | unchanged |

Production code (`src/` outside `src/dev/`): four comments cite reports (`state-controller.ts`, `commerce-evidence.ts`, `evidence-authorization.ts`, `scene-state-render.ts`). No code reference. `package.json`: none (its scripts name tools, not paths).

Current documentation that described active paths: `docs/TESTING.md` (the oracle and the anchors), `docs/README.md` and `docs/evaluations/README.md` ("some tests and tools still read them"). Updated in section 9 of this report's debt list.

## 3. Fixture ownership decisions

Rule applied: a file that exists so a test can run deterministically belongs under `tests/fixtures/`; one physical file never serves both as evidence and as executable fixture.

Every one of the 10 files is **also genuine historical evidence**: each is either cited by name in a historical report (the P12 audit, the West canon passes, the follow-choice live validation, the historical replay certification and fidelity pass 2, the 2026-10-03 repository cleanup) or is a recorded live run inside an evidence directory next to its `.summary.json`. Moving them would break that evidence. So all 10 are **copied, not moved**: the historical original stays byte for byte, and the copy is the executable fixture. No `git mv` was needed.

Structure, by domain rather than milestone: `tests/fixtures/historical-replay/`, `scene-continuity/`, `follow/`, `movement/`, `canon/`. The historical-replay files keep their historical names because the names are part of the frozen data contract (the `.sha256` file names the anchors file). The existing flat fixtures (`d10-calibrated-extraction.json`, `p35-live-introduction.ts`, `person-offer-playthrough.ts`) were not touched.

## 4. Exact copy map

All copies are byte-identical (the sha256 of the copy equals the sha256 of the original; recorded in `tests/fixtures/provenance.json`).

| New executable fixture (`tests/fixtures/`) | Historical original (`docs/evaluations/`, unchanged) | Bytes | sha256 |
| --- | --- | --- | --- |
| `historical-replay/HISTORICAL_TURN_ANCHORS.json` | `historical_replay/HISTORICAL_TURN_ANCHORS.json` | 11,585 | `59a46539…fb915` |
| `historical-replay/HISTORICAL_TURN_ANCHORS.sha256` | `historical_replay/HISTORICAL_TURN_ANCHORS.sha256` | 95 | `a3b00a94…5497e` |
| `historical-replay/HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md` | `HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md` | 22,281 | `c4321ed3…efb4e` |
| `scene-continuity/fixture-world.json` | `p12-scene-continuity/fixture-world.json` | 3,389 | `af4efc43…15069` |
| `follow/follow-choice-live.jsonl` | `pass10/follow-choice-live.jsonl` | 89,473 | `4a20d4e9…f7ea` |
| `movement/d01-live.jsonl` | `movement-follow-closure/d01-live.jsonl` | 5,898 | `25316ecf…d333` |
| `movement/d02-d03-live.jsonl` | `movement-follow-closure/d02-d03-live.jsonl` | 22,957 | `e23d5b96…29d3` |
| `movement/d03-label-live.jsonl` | `movement-follow-closure/d03-label-live.jsonl` | 29,840 | `a02b8286…3df3` |
| `canon/calderan-west-pass1-after.json` | `calderan-west-pass1-after.json` | 45,290 | `1173e5b1…c7cb7` |
| `canon/calderan-west-npc-pass2a-after.json` | `calderan-west-npc-pass2a-after.json` | 52,389 | `8698ca89…f7b2` |

Plus `tests/fixtures/provenance.json` (new: path, source, sha256, users, purpose). Total duplicated: about 283 KB.

Path edits in 11 consumers, one string each (two in `historical-anchors`): the 10 tests of section 2.1 and `src/dev/follow-choice-e2e.ts`. No assertion changed.

## 5. Hash and integrity handling

| Artifact | What the hash covers | Handling |
| --- | --- | --- |
| `HISTORICAL_TURN_ANCHORS.sha256` | **A, contents only.** `anchorsSha256(text)` is sha256 over the file text; the file name in the `.sha256` line is a label the test ignores (`split(/\s+/)[0]`) | Copied as is; the hash is unchanged and still verified by `historical-anchors` against the copy. Not regenerated. |
| `historical_replay/ORACLE_SHA256.txt` (oracle `oracle-v1`) | **A, contents only** (bare sha256 of the oracle markdown, `c4321ed3…`) | The oracle copy has the same sha256, recorded in `provenance.json` and enforced by the new guard. The historical `ORACLE_SHA256.txt` stays with the original. |
| Recorded live `.jsonl` and canon snapshots | no embedded checksum, no path provenance in the content | Copied; the content hash is now pinned in `provenance.json`. |
| Directory trees (D) | none of the moved fixtures is hashed as a tree | n/a |

No hash embeds a relative or absolute path (B, C), so no new checksum had to be created. Replay ordering and semantics are unchanged because the bytes are unchanged.

## 6. Dev-tool output-path changes

49 default output paths in 42 files (41 tools in `src/dev` and `scripts`, plus `tests/pass10-ablation.ts`) moved from `docs/evaluations/…` to `artifacts/local/evaluations/…` with the same sub-path (for example `consolidation_block11_live/`, `h5-live/npcplus7.jsonl`, `historical_replay/iteration_NN/`, `ITEM_SPRITE_LIVE_SMOKE.json`). `artifacts/local/` is already gitignored (Cleanup A), and `eval-authority` and `eval-narrators` already wrote to `artifacts/local/evaluations/`. Where a tool relied on `docs/evaluations/` already existing, a `mkdir(…, { recursive: true })` was added (`audit-authored-data`, `eval-evidence`, `shadow-evidence`, `replay-hardening`, `replay-stage-b`, `pass10-ablation`, `item-inventory-live-smoke`, `item-sprite-live-smoke`, `transfer-domain-live-smoke`, `controller-bakeoff-round-2`). The usage comments of the four probes and `eval-live-h5` now show the new `--out` default, and the comparator's header comment names the oracle copy.

**Promotion is deliberate.** A run becomes committed evidence only when someone copies it into `docs/evaluations/` (documented in `docs/TESTING.md` and `docs/evaluations/README.md`). Every `--out` flag still works, so a historical run can still be reproduced into its old location on purpose.

Notable effect: `npm run inspect:turn` and `npm run eval:playthrough` (`eval-hardening`) and `npm run eval:participants` no longer drop a timestamped file into the committed history on every run, and `probe-follow-choice-live` can no longer overwrite the recorded run that a test used to read.

Historical one-shot tools keep their paths only where reading recorded evidence is their purpose (section 7).

## 7. Guard rule and allowlist

`tests/evaluation-history-isolation.test.ts` (4 tests, deterministic):

1. No tracked `.ts/.mts/.js/.mjs/.cjs` file under `src/`, `tests/` (except `tests/fixtures/`) or `scripts/` contains, outside a comment line, a string literal starting with `docs/evaluations` (optionally `./` or `../` prefixed) or a `join("docs", "evaluations", …)` call, unless the file is allowlisted.
2. Production code (`src/` outside `src/dev/`) does not name the evaluations path in code at all; comments citing a report are allowed.
3. The allowlist has at most 4 entries, and each entry still matches a file that still uses the path (stale exceptions fail).
4. Every fixture in `tests/fixtures/provenance.json` still has its recorded sha256.

Allowlist (HISTORICAL REPRODUCTION TOOLS only):

| Entry | Why |
| --- | --- |
| `src/dev/eval-evidence.ts` | Phase 1O: re-scores the recorded Phase 1M/1N runs in `archive/` |
| `src/dev/shadow-evidence.ts` | Phase 1N: re-scores the recorded Phase 1M runs in `archive/` |
| `scripts/d09-*.mjs` | the D09 reflection harnesses run, resume and analyze the recorded D09 directories |
| `scripts/minor-debt-controller-audit.mjs` | audits the controller receipts recorded in the D09 evidence |

The guard does not read `docs/evaluations/` itself.

## 8. Validation

All runs on the Cleanup B2 working tree, started from an empty `.build`. No live calls, no image calls. No browser check consumes a moved fixture, so none was run.

| Check | Result |
| --- | --- |
| `npm run clean`, `typecheck`, `build` | exit 0 |
| `npm test` | **3683 tests, 3683 pass, 0 fail** (3679 + the 4 guard tests; the known flaky test did not fail) |
| `npm run benchmark:modern` | **55/55, 0 known product gaps** |
| `npm run check:architecture` | exit 0: 374 modules, 32 source back edges, **0 runtime back edges**, runtime graph sha256 `2b5999a0…d170` (unchanged) |
| `npm run check:docs` | **44 files, 347 relative links, 0 broken**, exit 0 |
| `npm run check:docs -- --all` | 299 files, 990 links, 185 broken, report only: the 184 historical links of Cleanup B plus 1 inside the oracle copy (`tests/fixtures/historical-replay/…EXPECTED_FINAL_STATUS.md` line 4 links `historical_replay/TRANSCRIPT_LEDGER.md`, which resolves from the original's location; the copy must stay byte-identical) |
| Tests whose fixture path changed, the historical replay tests, the hash tests and the docs consumers (`evaluation-history-isolation`, `historical-anchors`, `historical-replay-comparator`, `historical-replay-regressions`, `ui-v1`, `player-character-view`, `p122`, `p121`, `follow-recognition-closure`, `movement-follow-debt-closure`, `west-npc-canon`, `west-everyday-canon`, `authoring`, `build-discipline`) | **315 tests, 315 pass** |
| `node --test scripts/tests/d09-evidence-artifacts.test.mjs` | **7/7** (D09 paths unchanged) |
| **Whole suite with `docs/evaluations/` physically moved away** (`node --test .build/tests/*.test.js`, then restored) | **3683 tests, 3683 pass, 0 fail**: no test depends on the history directory |
| `node .build/src/dev/follow-choice-e2e.js` (input path changed) | runs offline on the fixture copy, output written |
| `node .build/tests/pass10-ablation.js` (output path changed) | writes `artifacts/local/evaluations/pass10/` |
| `node .build/src/dev/audit-authored-data.js cleanup-check` (output path changed) | writes `artifacts/local/evaluations/calderan-data-cleanup-check.json` (deleted after the check) |
| `node scripts/audit-player-travel-authority.mjs` | **fails at its own line-86 assertion, before the changed lines**: stale historical audit (section 10), not caused by B2 |
| `git status` after the hidden run | the history directory was restored; tracked files under it are unchanged except `docs/evaluations/README.md` (the index update) |

The live and image tools whose output path changed were not run (they need live calls); their change is one default path each, verified by typecheck and by the guard.

## 9. Debt closures

- **REPO-3: CLOSED.** All four conditions of the closure test hold: no current test reads `docs/evaluations/` (proved by the suite passing with the directory moved away), production code has zero code reference, no active reusable tool reads or writes it, and the remaining uses are the four allowlisted historical reproduction tools. Cleanup B had already separated the reports from the current docs.
- **REPO-13: OPENED (P3, ARCHIVE).** The rest of the original REPO-3 text, the weight of the archive: 1,044 tracked files, about 48 MB, 105 runnable historical `.mjs` scripts beside their evidence. Nothing executable depends on them now. Moved to Cleanup C.
- **D10** updated: REPO-1 (A), docs namespace (B), REPO-3 (B2) done; REPO-13 is Cleanup C.
- Current docs updated: `docs/TESTING.md` (where files belong, the oracle and anchors copies, replay output), `docs/CURRENT_STATE.md`, `docs/README.md`, `docs/evaluations/README.md` (the index section "Nothing executable reads this directory"), `docs/MASTER_DEBT_REGISTER.md` (header, closed-recently line, residual table, REPO-3, REPO-13, D10), `docs/MASTER_ROADMAP.md` (T-REPO line).

Not claimed: REPO-4/REPO-6/REPO-10 (`src/dev` and `scripts` organization), TEST-3 (milestone-named tests), REPO-2 residual (typo transcripts), DOC-15 residual (staleness tripwire).

## 10. Remaining coupling

- **Allowlisted historical tools** (section 7) still read and, for the D09 harnesses, write `docs/evaluations/`. That is their reproducibility contract.
- **Historical text** in code comments and test comments cites reports by path (section 2). Not a dependency.
- **Duplicated bytes:** about 283 KB exist twice, by design (evidence plus executable copy). The guard pins the copies' hashes; the originals are protected by being history.
- **The 105 historical `.mjs` inside `docs/evaluations/`** are not run by anything (REPO-13).
- **`scripts/audit-player-travel-authority.mjs` is stale independently of B2:** it stops at its own assertion "document current plural gap" (line 86), which records a pre-fix behavior from baseline `cad4d57` that the engine no longer has. It fails before reaching the changed write lines, so its new output path was verified by reading the code, not by running it. Not fixed here (a historical audit; out of scope).

## 11. Cleanup C handoff

**Goal:** decide the archive's long-term shape (REPO-13) and finish the repository hygiene items.

**Suggested order:**

1. REPO-13: decide whether the 105 historical `.mjs` stay beside their evidence (with a one-line "historical, not run" header in `docs/evaluations/README.md`) or leave the tree into a release tarball, and whether clone size (about 48 MB) matters.
2. REPO-4 / REPO-10: split `src/dev` into test support (for example `turn-fixture.ts`, 54 test importers) and tools; the B2 guard already keeps both away from history.
3. REPO-6: classify `scripts/` (live, offline, browser, historical); the D09 harnesses are the natural first "historical" group, matching the allowlist.
4. REPO-2 residual: move `longplaytrough_transcript.txt` and `playtrough_example/` with their consumers.
5. DOC-15 residual: a staleness tripwire for `CURRENT_STATE.md` / `TESTING.md` counts.
6. Retire or refresh `audit-player-travel-authority.mjs` (section 10).

Invariants to keep: tests read only `tests/fixtures/`; tools write to `artifacts/local/`; history is copied in on purpose; the allowlist stays at 4 or fewer.
