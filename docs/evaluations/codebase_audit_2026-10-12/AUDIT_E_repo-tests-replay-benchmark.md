# Audit E: inventory, dead code, dependencies, tests, historical replay, modern benchmark

Repo `/home/user/Calderan_RPG`, main `c0608a6`, read-only. No live calls were made. The offline test suite could NOT be run: `node_modules/` is absent (no `yaml`, `@types/node`), and installing would need the network. `tsc --outDir <scratchpad>/build` did emit, but with TS2688 (missing `@types/node`). Scratch helpers used: `graph.mjs`, `reach.mjs`, `exports.mjs`, `tsconfig.unused.json` (all in the scratchpad dir). Method: import graph (static `from`/`import()`), `.build/...js` string references in package.json and scripts, doc references, export/usage grep.

## 0. Headline facts

| Fact | Value |
|---|---|
| Tracked files | 1,863 (git history is only 50 commits, 2026-10-05..12) |
| By top-level dir | docs 699, saves 310, data 226, src 321, tests 227, scripts 40, 33 root `.md`, plus `city_map`, `playtrough_example`, `longplaytrough_transcript.txt` |
| `docs/CURRENT_STATE.md` says | "never rewritten" for evaluations |
| `docs/evaluations/CALDREVAN_REPOSITORY_CLEANUP.md` (2026-10-03) | Reduced the repo from 1,164 to 667 tracked files and said `scripts/` had 7. Today it is 1,863 and `scripts/` has 40. Cleanup commit `9faa6b8` is not in this history. The hygiene gain has been reversed. |
| src size | 318 `.ts` files; `src/dev` is 91 files, 7.3k LOC; `src/turn` is 91 files, 11.1k LOC |
| Tests | 220 entries in `tests/`: 192 `*.test.ts`, 24 helper/script `.ts`, 4 dirs. About 2,048 `test()` calls, 31.7k LOC |
| Production hygiene | Zero TODO/FIXME/HACK in non-dev src. No stray `console.log`. 5 `console.*` calls, all in the UI server/launcher and one `portrait_log` warn |
| CI / lint / format | No `.github/`, no eslint/prettier, no pre-commit |

## 1. Repository inventory (suspicious groups)

`Ref'd by` means static importers, package.json, scripts, tests and docs. Class key: DEV (dev-only), HIST (historical), TEST (test-only).

| Group | Purpose | Referenced by | Kind | Classification |
|---|---|---|---|---|
| `src/dev/` 23 files with zero importers, zero tests, no package.json entry and no script reference (true orphans, listed below) | One-off live probes/certs | Only prose in `docs/evaluations/*` | DEV/HIST | ARCHIVE (move to `docs/evaluations/_tools/` or delete, history is in git). Names: `aggregate-diagnostics, audit-authored-data, controller-authorization-live, d04-lossless-fixtures, eval-mannerisms, eval-organic-discovery, eval-organic-reflection, existing-subsystem-live, follow-choice-e2e, identity-live-cert, inspect-city, item-lifecycle-live, person-offer-live-cert, probe-final-movement-live, probe-follow-choice-live, probe-follow-choice, probe-movement-closure-live, replay-hardening, replay-organic-discovery, replay-stage-b, review-mannerism-seeds, scene-state-foundation-live, scene-state-live-smoke` |
| `src/dev/` reachable only through tests/scripts (about 37 files): the `d04-*`, `d05-live-retry`, `d10-mannerism-corpus`, `reflection-*` (9), `eval-live-h5`, `retrieval-benchmark-h3`, `turn-retrieval-benchmark`, `mannerism-calibration-replay`, `receipt-corpus`, `organic-discovery`, `passive-response-audit`, `live-eval-scenarios`, `follow-choice-classify/variants`, `historical-*` | Bake-off harnesses that unit tests exercise | tests and scripts | DEV/TEST | KEEP BUT DOCUMENT for what is used by tests. Beyond that, MOVE to `tools/` with its own tsconfig project so `src/` is production-only |
| `src/dev/` with `npm run` entries (`play`, `inspect-*`, `eval-*`, `extract-playthrough`, `review-playthrough`, `shadow-evidence`, `controller-benchmark`) | Supported dev CLIs | package.json (25 scripts) | DEV | KEEP BUT DOCUMENT. `eval:playthrough`, `inspect:turn` (both eval-hardening) and `extract/review:playthrough` are legacy playthrough tooling. Mark them DEPRECATE candidates |
| `src/dev/turn-fixture.ts`, `turn-services.ts`, `scene-state-fixtures.ts` | Shared fixtures (turn-fixture has 54 test importers) | tests | TEST | RENAME/MOVE to `tests/support/`. They are test infrastructure living in `src/` |
| **Duplicate reflection stack**: `src/dev/reflection-{v2,v21,v22,v23,v23-cvc,v23-cvc-e1,wire,wire-v2-cvc}.ts` vs `src/turn/structured/*` | The production files are literal copies ("Production promotion of the frozen dev candidate; import paths only differ"). Verified by diff: 2-8 diff lines per pair, about 1,230 duplicated lines. `dev/reflection-wire-v2.ts` has no production twin | dev copies are imported by dev tools/tests | DEV/TEST | MERGE. Delete the dev copies, repoint tests/benches to `src/turn/structured`. In prod only `v23-cvc-e1` is the entry point (via `structured-reflection-maintenance.ts`). v2/v21/v22/v23/wire are its transitive validator layers (version-stacked, REFACTOR into one `reflection-validator`) |
| `scripts/*.mjs` (40) | Bake-offs, live smokes, D09 ablations. Docs list: 25 are live (OpenRouter/HF) and 15 offline analysers/guards | Each is cited by exactly one evaluation doc. `d09-final-campaign-soak*`, `d09-final-matched-ablation*`, `d09-unique-value-*` have docs=0 | HIST | ARCHIVE. They depend on `.build/src/dev/*.js` paths and on dev duplicates. None is in package.json or run by `npm test` (including `scripts/tests/d09-evidence-artifacts.test.mjs`, which is never run). KEEP: `actual-offer-browser-check.mjs`, `explicit-promotion-browser-check.mjs` (scripted, zero live calls, referenced by docs/TESTING.md), `minor-debt-offline-guard.mjs`. DELETE CANDIDATE after archiving: d09-*-resume/*-analyze, gemini-vertex-rerun, controller-switch-qwen, narrator-bakeoff-1-* |
| 33 root `.md` reports (`P3_*`, `P11_*`, `P12_*`, `*_FIX.md`, `*_AUDIT.md`, `PERMANENT_APPEARANCE_*`, `PORTRAIT_*`, `UI_*`) | Per-pass change reports | Mostly 1 ref (an index/self-mention). Only `DEBT_REGISTER.md` (13 refs) and `README.md` are live | HIST | MOVE all but `README.md` and `DEBT_REGISTER.md` into `docs/evaluations/` (or `docs/history/`). `DEBT_REGISTER.md`: KEEP BUT DOCUMENT; check it against `docs/evaluations/CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md` for staleness |
| `longplaytrough_transcript.txt` (76 KB) | Raw narrator transcript, used by `CREATED_PERSON_IDENTITY_BINDING_FIX.md` as evidence | 1 doc | HIST | ARCHIVE (rename `longplaythrough` typo, move to `docs/evaluations/`) |
| `playtrough_example/*.csv` | Source of the curated 1:1 fixtures in `tests/playthrough/curated.json` | docs only. `tests/playthrough.test.ts` uses the curated JSON and `src/dev/playthrough-csv.ts`, not the CSV | HIST/TEST | ARCHIVE (typo `playtrough`). Keep only if `extract:playthrough` is kept |
| `city_map/city_map.png` (4.2 MB) | Spatial canon reference | docs/authoring spatial canon | DOC | KEEP BUT DOCUMENT. Move to `docs/authoring/`, or convert to WebP/optimise |
| `saves/` (310 tracked files, 11 MB) although `.gitignore` lists `saves/` | D09 ablation evidence (`d09-final-matched-ablation` 108 files, `unique-value-matched-ablation` 110, `final-relationship-ablation` 52, `qualifying-reflection-eligibility` 21, `reflection-utility-review` 19), including 1 MB `test-unit.log` x3 and 17 `.log` files that `*.log` should have ignored. Force-added | ~10 D09 docs cite them. No code reads them | HIST | ARCHIVE then `git rm --cached`; relocate any still-cited evidence to `docs/evaluations/`. At minimum DELETE CANDIDATE the 17 `.log` files (about 3.5 MB) |
| `docs/evaluations/` (570 tracked files, 27 MB: 221 json, 182 md, 101 `.mjs`, 32 jsonl, 16 png) | Reports plus raw data | See sub-rows | HIST | |
| - `historical_replay/` (126 files, 4.1 MB; iterations 00-12 plus probes 90-99) | Replay evidence | `docs/TESTING.md`, comparator | HIST | KEEP BUT DOCUMENT `STATUS.md`, `ORACLE_SHA256.txt`, `HISTORICAL_TURN_ANCHORS.json(.sha256)`, `best_*`. ARCHIVE per-iteration `turns.jsonl` and `probes/` |
| - `d09-reflection/` (92 files, 87 `.mjs`) | D09 ablation scripts stored as docs | D09 reports | HIST | ARCHIVE; they are runnable code outside any build |
| - `archive/` (64 files, 2.6 MB), `item-sprite-*-assets` (about 7 MB of PNG), `portrait-benchmark-anime` (5 MB, outside evaluations), `ui-screenshots` (5.3 MB) | Evidence images | reports | HIST | ARCHIVE or Git LFS / external storage |
| `data/canonNPCAvatar/*.png` | 6 authored avatars, 2.1-2.5 MB each (14 MB total, 93% of `data/`). Served in place by `src/app/canon-avatars.ts`; `tests/canon-avatars.test.ts` reads real files | src, tests | PROD asset | KEEP. Recompress/resize (they are displayed at avatar size) while keeping filenames, since the registry and tests pin them. Not authored text, so it is not a code-review concern |
| `data/{characters,concepts,factions,locations,world}` | YAML canon | loader | PROD | KEEP |
| Tracked generated artifacts | `.build/` and `node_modules/` are correctly ignored. Tracked generated data: `docs/evaluations/CALDREVAN_*AUDIT.json`, `*.summary.json`, `tests/golden/turn-pipeline.json` (2.4k lines, intended golden) | | | KEEP golden; the rest ARCHIVE |

## 2. Dead / obsolete code in production `src`

Exports analysis (1,433 exports outside `src/dev`; 337 have zero external use, the vast majority being types or exports that are only used inside their own file). Real findings:

| Item | Evidence | Classification |
|---|---|---|
| Unused declared values (zero uses anywhere, even in own file or tests) | `natural-actions.ts: resolveMovement, DESTINATION_END`; `world/environment.ts: describeDate, describeClock`; `turn/item-resolution.ts: rivalsOf`; `campaign/permanent-appearance.ts: isOverridden, hasOverrides`; `campaign/promotion.ts: promotedLabel`; `app/player-visual-view.ts: PLAYER_ADULT_ONLY`; `app/ui-playtest.ts: UI_PLAYTEST_LOCATION`; `campaign/heartstone-charter.ts: HEARTSTONE_KEEPER_ACCEPTANCE`; `campaign/portrait-prompt.ts: PORTRAIT_KINDS`; `world/calendar.ts: REVELATION_YEAR`; `app/trade-offer-view.ts: TradeBlock` | DELETE CANDIDATE (verify no docs depend on them) |
| tsc unused locals/params (strict flags not enabled in repo) | Only 58 hits over src+tests, 5 in prod: `game-session.ts:192 #openingText` (private never read), `mannerism-learning.ts:1 MannerismCandidate`, `background-grounding.ts:70 nation`, `person-offers.ts:319 offered`, `structured-reflection-maintenance.ts:9 ReflectionPacing`. Very clean otherwise | REFACTOR (trivial), then enable `noUnusedLocals` |
| Legacy re-export shells | `turn/sentences.ts` ("compatibility re-export", only 1 test imports it); `llm/openrouter/deepseek-controller.ts` (`@deprecated`, aliases `DeepSeekStateControllerProvider`; 7 tests import it, nothing in prod) | DEPRECATE then DELETE; repoint tests to `state-controller.ts` |
| Production-unreachable provider code (reachable only from tests/scripts) | `llm/openrouter/image-client.ts` (OpenRouter portraits, superseded by HF `fal-image-client.ts`); `llm/openrouter/context-compressor.ts` (D04 bake-off); `retrieval/voyage-embedding-provider.ts` plus `semantic-index.ts` (opt-in `embedding_provider` that no launcher passes; `play.ts` never wires it; `VOYAGE_API_KEY` is read only by dev); `campaign/anime-portrait-tags.ts` (benchmark only); `app/mannerism-view.ts` (test only); `turn/mutation-diagnostics.ts` (dev diagnostics only) | UNKNOWN - NEEDS HUMAN DECISION for voyage/semantic retrieval; otherwise MOVE to a `tools`/`experimental` package. Do not delete retrieval silently: `SemanticIndex` is referenced in `production.ts` |
| Misnamed narrator file | `llm/openrouter/minimax-narrator.ts` default is `z-ai/glm-5.2`; it also exports `KIMI_/GEMINI_/MINIMAX_NARRATOR_MODEL` constants used only by tests. `scripts/character-performance-pilot.mjs` and `p8-economy-live.mjs` import it by path | RENAME to `narrator.ts`/`openrouter-narrator.ts`, prune unused model constants |
| Provider integrations / env vars | Real: `OPENROUTER_API_KEY`, `OPENROUTER_NARRATOR_MODEL`, `OPENROUTER_CONTROLLER_MODEL`, `OPENROUTER_CONTROLLER_FALLBACK_MODELS`, `OPENROUTER_REFLECTION_MODEL`, `MANNERISM_EXTRACTOR_MODEL`, `CONTEXT_COMPRESSOR_MODEL`, `CALDREVAN_REFLECTION_MODE`, `HF_TOKEN`. Dev-only: `VOYAGE_API_KEY`, `CALDREVAN_EMBEDDING_ADAPTER` (`src/dev/embedding-configuration.ts` trusted-module dynamic `import()`). `docs/CONFIGURATION.md` should be diffed against this list | KEEP BUT DOCUMENT |
| Semantic settlement / payment machinery after Actual Offer | The settlement authority is the explicit `GameSession.acceptTradeOffer` (`src/app/game-session.ts:362`, `campaign/trade.ts`). `turn/transaction-acts.ts`'s `ACCEPT`/`isTransactionAct` regexes are no longer a settlement path: only `continuesTransaction` is used in prod (`scene-participants.ts`, partner continuity); `isTransactionAct` is used only by the replay harness. `person-offers.ts` (374 lines of price/descriptor regex, `PERSON_FACTS`) remains live as the offer *interpreter*, which is still needed; `person-transactions.ts`, `trade-authorization.ts`, `trade-notes.ts` are live. There are no inert settlement code paths in prod, but the regex surface is large and unproven against new phrasing | KEEP; `isTransactionAct` DEPRECATE with the replay `payment_gap` logic |
| Old Heartstone semantic rite machinery | Already replaced. `heartstone-rite.ts` is 53 lines (eligibility + one `join_household`); `command-authorizer.ts:96` blocks controller-driven joins into Nicco's household; no oath/barefoot matcher exists in `src/turn`. Remaining: `heartstone-charter.ts: HEARTSTONE_KEEPER_ACCEPTANCE` (unused), rite prose in item lore | KEEP; delete the unused constant |
| "premium / NPC+" naming debt | State is still `premium_characters`, `premium_reflections`, `PremiumReflection`, `premium-characters.ts` (40 mentions), `PremiumContractEvidence`, `isNpcPlus`; the UI and docs say NPC+. About 30 production files carry `premium` | RENAME is a schema change (`schema_version` 6 with save-format 5 is pinned by `ui-v1.test.ts` "static guards"). Best path: alias in code now, rename file/type names; keep JSON field names behind a migration. Mark as UNKNOWN - NEEDS HUMAN DECISION |
| Replay-only / compat hacks in prod | None found: no transcript, turn-number or oracle reads outside `src/dev` (enforced by a test per docs/TESTING.md). Legacy save compat is explicit and legitimate (`save-migrations.ts`, legacy `active_version_id` portrait decode, `types.ts:230 @deprecated`, `trust` legacy numeric seed, `ui/server.ts` `legacyMessages` for fixed playtest mode) | KEEP BUT DOCUMENT |
| Commented-out code / TODO / debug logs | None found (regex for commented statements returned nothing in non-dev src) | OK |
| Tracked-but-should-be-ignored | `saves/` (310), 17+ `.log`, `playtrough_example/*.csv`, `docs/evaluations/**/*.jsonl` (32), `.build` is not tracked | see section 1 |
| Duplicated parsers | The quote/sentence splitting was already consolidated into `turn/language/text.ts`. Candidate duplication: `HANDOVER`/`ACCEPT` regex in `src/dev/historical-replay.ts` vs `turn/transaction-acts.ts`; follow/leave grammars in `scene-departure.ts`, `follow-invitation.ts`, `character-movement.ts`, `narrated-captives.ts` (large regexes, each with its own tests in `npc-plus-pass-10-follow-grammar`, `follow-recognition-closure`, `final-movement-closure`) | REFACTOR (research needed; cannot prove duplication without behaviour comparison) |

## 3. Dependencies and toolchain

| Topic | Finding |
|---|---|
| Runtime deps | `yaml ^2.9.1` only, used in `src/world/loader.ts`, `src/economy/economy.ts` and 4 tests. All imports otherwise `node:*`. No unused dependencies, no undeclared ones |
| Dev deps | `typescript ^5.9.3`, `@types/node ^22.20.4`. Used. `engines.node >=22` while types are pinned to the 22 line; fine, but `>=22` lets Node 24+ run unchecked |
| Lockfile | `package-lock.json` v3, 5 entries (root, yaml, typescript, @types/node, undici-types), consistent with package.json |
| Node API assumptions | `fetch` (154 refs, global), `structuredClone` (76), `AbortSignal.timeout`, `Array.prototype.at`, `node:test`, `node --test` glob, `import(pathToFileURL(...))`. All fine for 22 |
| tsconfig | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `forceConsistentCasingInFileNames`, NodeNext, ES2022. Missing: `noUnusedLocals/Parameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `skipLibCheck`, `isolatedModules`, `verbatimModuleSyntax`, source maps. `include` mixes `src` and `tests`, so `npm run build` compiles the tests and all of `src/dev` into `.build` |
| `types: ["node"]` | A fresh checkout without `npm ci` fails with TS2688 and the first error masks the others. Sandbox-relevant: documented install step is required |
| Scripts | `npm test` = build + `node --test .build/tests/*.test.js` (flat glob; does not run `scripts/tests/*.test.mjs`; does not clean `.build`, so stale compiled tests of deleted files would keep running locally). 25 `npm run` scripts, 18 of them dev CLIs. `eval:playthrough` and `inspect:turn` both call `eval-hardening.js` |
| Missing tooling | No lint (ESLint), no formatter, no CI (`.github` absent), no coverage (`c8`), no browser test runner. `docs/TESTING.md`: "There is no automated browser test suite" |

## 4. Test suite audit

### 4.1 Inventory by type (heuristic, by filename and imports)

| Type | Approx. files | Examples |
|---|---|---|
| Unit / domain | about 95 | `campaign-state`, `item-domain`, `calendar`/`weather` (`temporal-*`, `p11-*`), `lexical-search`, `language-*`, `persistence`, `world*`, canon tests (`west-*`, `aureth-canon`, `center-east-canon`, ...) |
| Integration through `TurnCoordinator` with scripted narrator/controller | about 45 | `turn-*`, `person-offer-e2e`, `household-turns`, `movement-follow-*`, `npc-plus-pass-*` (21), `live-regression-repair*` |
| UI / server (fake DOM via `vm.runInNewContext` of `src/ui/client.js`, plus `createPlaytestServer`) | 10 | `ui-v1` (1,006 lines, 58+ tests), `ui-playtest`, `ui-campaigns`, `actual-offer-ui`, `inventory-ui`, `portrait-gallery` (782 lines) |
| Deterministic scenario / golden | about 6 | `turn-pipeline-golden` (golden JSON 2,402 lines), `scene-state-foundation` (golden text), `playthrough.test.ts` (curated.json fixtures), `long-playthrough-continuity-audit` |
| Historical-replay unit tests | 4 | `historical-anchors`, `historical-replay-comparator`, `historical-replay-regressions`, `playthrough` |
| Bake-off / benchmark unit tests (fake providers) | about 25 | `controller-benchmark`, `controller-bakeoff-metrics`, `narrator-bakeoff`, `d04-*`, `d05-live-retry`, `reflection-*` (6), `retrieval-benchmark-h3`, `retrieval-eval/*`, `h5-1-live-findings`, `d26-shadow`, `d10-*` |
| Live cert | 0 tests need keys. The 6 files touching `OPENROUTER_API_KEY` only set a dummy key and mock `fetch` | The live part lives in `src/dev/*-live*.ts` and `scripts/` |
| Helpers (not tests) | 24 `.ts` | `turn-fixtures` (100 importers), `fixtures`, `pass10-support`, `pass10-*` CLIs (11, importers 0), `closure-soak`, `retry-benchmark-h5`, `diagnostics-benchmark-h4`, `provider-failure-matrix-h5` (CLIs, not run by `npm test`) |
| Fixtures | `tests/fixtures/*`, `tests/golden/*`, `tests/playthrough/{curated,historical-windows}.json` | |

### 4.2 Domain coverage check

| Domain | Coverage (by test titles) | Gap |
|---|---|---|
| Actual Offer accept: idempotency, stale revision, supersession, save/load | G9, G10, G16, P19-P21; `POST /api/trade/accept` 200/409/422; schema additive; identity masking P8-P15 | Strong. Missing: true concurrent double-accept (two in-flight requests), accept after load of an older autosave, offer + movement (scene change closes the offer is tested only as a one-liner), offers for items the player later equips |
| Explicit NPC+ promotion | P1-P20, automatic-rite negatives, stale 409, save/load | Strong. Missing: promotion then Controller edits household rules in the same revision window; browser-level confirm dialog (client tested only via fake DOM) |
| Movement/follow, group movement | `movement-follow-*`, `npc-plus-pass-10-follow-grammar/state-matrix`, `final-movement-closure`, `player-travel-safeswitch`, `city-travel` | Many tests, but most assert grammar detections on regex; few are end-to-end "N companions move and persist across save/load". `scene-departure` and `character-movement` have no property tests |
| Save/load | `save-load-v1-*`, `save-hardening-h4`, `persistence`, `campaign-restore` | OK. Missing a cross-version fixture (real older-schema save files checked in), only synthetic |
| UI | fake DOM only; no real browser run in CI (two scripted browser-check mjs are manual) | Browser behaviour (CSS, focus, timers) untested; this is the cause of the flaky tests below |
| Failure/negative paths | `turn-failures`, `provider-failure-*`, `controller-authorization-hardening`, injection tests | Good |
| Performance | none in `npm test` (`pass10-perf`, `closure-soak` are manual) | no regression guard |

### 4.3 Quality issues

| Issue | Evidence | Action |
|---|---|---|
| Tests asserting source text / implementation, not behaviour | 14 files `readFile("src/...")`: `ui-v1` (7), `canon-avatars` (2), `narrator-alternatives` (2), `player-visuals-inventory` (2), `ui-playtest` (2), `turn-stages` (2), `actual-offer-ui`, `npc-plus-pass-7`, `ui-campaigns`, `player-character-profile`, `item-lifecycle`, `npc-plus-pass-10-architecture`, `temporal-environmental`, `production-structured-reflection`. E.g. `ui-v1` asserts `schema_version: 6;` appears in `types.ts` | REFACTOR into behavioural schema tests, or keep as an explicit "architecture guard" suite |
| Implementation-coupled to the dev harness | 85 of 192 test files import `src/dev/*` (mostly `turn-fixture`); 33 refs in `temporal-action.test.ts` | MOVE fixtures to `tests/support`, then dev code can be pruned freely |
| Pass-numbered test names (`npc-plus-pass-1..10`, `p3x`, `p6..p13`, `live-regression-repair-1-2`) | 40 of 192 files named after delivery passes, not domains | RENAME by domain, MERGE pass-10 siblings |
| Stale/obsolete architecture | `reflection-v2/v21/v22/v23/wire*` tests exercise 8 version-stacked validators and copies; `d04-compaction-bakeoff`, `d05-live-retry`, `narrator-bakeoff`, `controller-bakeoff-metrics` test bake-off helpers; `voyage-embedding-provider`, `semantic-search`, `hf-image-client` and `portrait-image` (OpenRouter image client unused in prod) | MERGE/ARCHIVE after decisions in section 2 |
| Real timers | `wait(1150)` etc. in about 20 files (grep for wait/sleep/setTimeout hits are mostly text, not timers). The wall-clock waits are in `ui-v1` and the abort/sleep retry tests (`provider-retry-h5`) | REFACTOR with fake timers / injected clock |
| Expensive | Could not time (no `node_modules`). Estimated heavy: `ui-v1` (each of 8 lifecycle tests waits 1.15 s real time: about 4.6 s serial just in waits), `world`-loading tests (every file calls `loadWorld("data")` that parses YAML), `context-scale`, `core-properties`, `retrieval-recall`. `node --test` runs files in parallel, so wall time is probably dominated by compilation (tsc about 18 s here) | MEASURE with `node --test --test-reporter=spec` once deps exist |
| Missing negative tests | No test for malformed UI POST bodies on `/api/trade/accept` and `/api/location` beyond schema checks; no oversize body test; no property test for `save-format` fuzzing | add |
| Deterministic tests that do not cover production wiring | Tests use `turn-fixtures` (`mockNarrator`/`mockController`) and `src/dev/turn-services.ts`; real `createProductionDeps` is exercised only in `application-closure` and the manual live scripts. Prompt wording, provider JSON, streaming and fallback ordering are covered by fake `fetch` only | add recorded-LLM replays (section 6) |
| Live-only behaviours (never checked offline) | Narrator voice/continuity, Controller schema compliance on new models, portrait generation, name-leak in real prose, `provider routing` pins | recorded corpora + periodic live cert |

### 4.4 Flaky tests: `generation lifecycle (player|npc, fullbody)`

Location: `tests/ui-v1.test.ts:957`, driving `src/ui/client.js:289-312` (`portraitStage`, `renderPortraitProgress`, `startPortraitProgress`).

Cause (by reading; not reproduced because `node_modules` is missing):

1. The test holds the mocked POST open and does `await wait(1150)` with a real `setTimeout`, then asserts `portrait-progress-stage` is `/^Generating…$/` and `portrait-progress-elapsed` is `/^[1-9] s$/`.
2. The client only refreshes that text from its own `setTimeout(tick, 1000)` chain started by `startPortraitProgress` at click time. `portraitStage()` returns `"Request sent"` while `Date.now() - startedAt < 1000`, and the elapsed text is `Math.floor(elapsed / 1000)`.
3. Node's `setTimeout(1000)` can fire when the wall clock has advanced only 999 ms (libuv loop time versus `Date.now()` rounding, and any timer drift). The 2nd tick then renders `elapsed = 999` as "Request sent" / "0 s", and the next refresh would be at about 2000 ms, after the assertion at 1150 ms. The test fails.
4. Under CPU contention (`node --test` runs 190+ files in parallel) the margin is only about 150 ms between the client's timer and the test's own timer, so an early/late tick or a delayed timer-callback turn makes the order or the value wrong.
5. The `fullbody` variants are the second test in each mode loop and always run right after the avatar test; both variants are equally exposed (same code path). Failures appearing only on `fullbody` are therefore incidental to ordering/load, not a defect in fullbody logic.
6. A secondary smell: the "slow request" test never covers `PORTRAIT_SLOW_MS` and the client's unref'd timer is tested against the real clock.

Fix direction (do not apply): inject a clock and timer into `client.js` (or stub `Date`/`setTimeout` in the vm context), or assert on `elapsed >= 1` only after advancing a fake clock; never assert exact second boundaries against real time.

## 5. Historical replay audit

Files: `src/dev/historical-replay.ts` (177 lines), `historical-replay-compare.ts` (168), `historical-anchors.ts` (86), `historical-context.ts` (9); tests `historical-anchors`, `historical-replay-comparator`, `historical-replay-regressions` (+ `playthrough`, `long-playthrough-continuity-audit`); `tests/playthrough/historical-windows.json`; docs `docs/TESTING.md`, `evaluations/HISTORICAL_*`, `evaluations/historical_replay/*` (STATUS: pass 2 finished, best 22/32 MUST_MATCH on iteration 09, 4.1 MB of data).

| Aspect | Verdict |
|---|---|
| Authority model | Transcript-only: it feeds the 421 historical *player* messages through live `GameSession.submitPlayerInput` against live models, with no explicit actions. It cannot call `acceptTradeOffer`, `completeHeartstoneRite`/promote, save/load mid-run (only `session.save()` every 10 turns), or location confirm, except `overridePlayerLocation` "assists" |
| Conflicts with explicit UI actions | Yes. The oracle expects a person sale inside a turn (`B-02 exactly one sale of Brenna for 5 gold`), household/NPC+ from prose (`B-04, C-04`). Today Actual Offer settles only on Accept, and promotion only on the explicit action. docs/TESTING.md and `ACTUAL_OFFER_V1.md:102` already say "HISTORICAL ONLY (not run; needs adaptation)". A replay now would fail A-02/B-02/B-04/C-02/C-04 by construction, regardless of quality |
| `payment_gap` / `handover_gap` | OBSOLETE. `payment_gap` fires when `isTransactionAct(text)` and no `transfer_person` committed in that turn. With Actual Offer, payment never commits in the same turn. This diagnostic would flag every sale. DEPRECATE with `isTransactionAct` once the harness is retired. `handover_gap` has the same dependency |
| Anchors | Useful idea (premise constraints for the narrator, schema forbids state), but implemented as a hash-pinned oracle-specific JSON with 19 anchors and a narrator wrapper. KEEP as concept; re-derive per scenario |
| Comparator | 32 MUST_MATCH checks against a frozen final status (`ORACLE_SHA256`). Final-state comparison is valuable; the check set is mostly not applicable now (A-02 funds band, B-0x household rite). `ids` unused var at `historical-replay-compare.ts:49` |
| Writes into repo | It writes `docs/evaluations/historical_replay/iteration_NN/` and `saves/historical_replay/` inside the repo. The `user_messages.txt` input is not in the repo (external), so the replay cannot be re-run from a checkout |
| Cost / safety | Live, 421 turns x 2 provider calls, about 1 h; uses `NODE_USE_ENV_PROXY` hack. Not part of `npm test` |
| Keep as regression tooling | `summarizeSnapshot`/`turnState` (compact snapshot digest, ideal for state-delta assertions), `parseHistoricalMessages`, resume/progress logic, `historical-anchors` validator, `playthrough.test.ts` curated 1:1 fixtures (these are good: transcript response + expected commands; they are narrator-text-only, so unaffected by explicit actions), `tests/playthrough/historical-windows.json` |
| Obsolete | `payment_gap`/`handover_gap`/`isTransactionAct` dependency, the 32-check oracle as a gate, `location_assists.json` (assist workaround for the old travel contract), `iteration_*`/`probes` data, `replay-hardening.ts`, `replay-organic-discovery.ts`, `replay-stage-b.ts`, `eval-hardening.ts` (orphans or legacy) |
| Classification | `historical-replay*.ts`: DEPRECATE as a certification gate; ARCHIVE after extracting `summarizeSnapshot`/`turnState` to a shared benchmark library. Frozen oracle and report docs: KEEP (history). Data: ARCHIVE |

## 6. Requirements for a MODERN BENCHMARK

Goal: certify the CURRENT architecture (Narrator draft -> Controller proposal -> authorization -> audit -> revision commit, plus explicit domain actions) offline and cheaply, with a thin live layer. This extends the recommendation in `docs/TESTING.md` ("scripted action log", about 100 turns; not built).

### 6.1 Principles

1. Every step is an *event* of one of three kinds: `player_message`, `ui_action` (the real `GameSession` method or HTTP route), or `system` (save/load, clock). No hidden state injection. The scenario never writes campaign state; it only drives inputs and asserts outputs.
2. Provider outputs are *data*: for each `player_message` the scenario carries `narrator` and `controller` outputs (recorded or authored). In offline mode they are replayed through `mockNarrator`/`mockController`-style providers; in live mode they are ignored (or compared) and real providers are used.
3. Expected state deltas are structural (ids, counts, revisions, gold, possession, legal status, household membership, NPC+ set, location, knowledge flags), not prose.
4. Explicit actions are first-class: `accept_trade_offer {ref|ref_from:"offer#1", expected_revision}`, `promote_npc_plus {character}`, `override_location {target}`, `save`, `load`, `appearance_patch`, `portrait_generate` (fake generator), `alternative_narration` (`/api/alternative`).
5. Every scenario can assert both the positive outcome and the explicit negatives (e.g. perfect rite prose + Controller join -> no change until the UI action).
6. Determinism: fixed seeds, fixed clock/world minute, `loadWorld("data")` hashed (canon fingerprint in the scenario header), no wall-clock.
7. Cost/runtime budget: offline target < 30 s for the full benchmark on a laptop; no network.
8. Redaction safety: all outputs checked through the view layer (what the browser sees), including identity masking and technical-id leakage.

### 6.2 Coverage matrix (what the scenarios must exercise)

| Area | Required assertions |
|---|---|
| Player messages | Intent classification (travel, give, buy, follow, rename, question); ambiguous/hedged messages produce no commands |
| Narrator output | Fixed text carrying: price offers (G/N/P forms), narrated captives, name introductions, departures, "I'm at the market" non-actions, rite prose; audit/rewrite path (`revision_required`) |
| Controller output | Schema-valid and schema-invalid proposals; forbidden command kinds (person in trade, join_household, accept); evidence-less proposals; stale `expected_revision` |
| Explicit UI/domain actions | `acceptTradeOffer` (double, stale, unaffordable, superseded, withdrawn, after load), `promote` (eligible/ineligible/stale), `override location`, appearance edits, portrait select/delete |
| Expected state deltas | per-step: revision +0/+1, funds, items (created, removed, owner, position), legal status, transactions ledger, households (members, rules), NPC+ set and tier, character location, knowledge/facts, offers ledger |
| Save/load points | Save at N steps, reload from file, assert full snapshot equality (`summarizeSnapshot` digest plus revision) and that actions after load behave identically; also load a frozen older-schema save |
| Trade accepts | goods BUY/SELL, bundle, person offer for a hidden canonical vs narrated captive, "one active offer" supersession |
| NPC+ promotion | Same character id, one revision, membership + premium state, capability tier, authored avatar fallback, no re-promotion, leaves household yet stays NPC+ |
| Movement / group | Player travel authority (safe switch), single follower, multi-follower, follow invitation accept/decline, departure reconciliation, followers persisting across save/load, no duplicate characters, location consistency between narration and state |
| Identity disclosure and masking | Unknown slave never shows name/id/avatar/lore in `SessionView`; reveal on name knowledge commit; rename of the same entity; partner identity guard |
| Items | Pickup, drop, give, placement, equip slots, no auto-equip, sprite status in the view, sale removes item |
| Household | Join/leave, rules, owner-only rite eligibility, recognition warmth derivation |
| Canonical characters | Casting without ephemeral duplicates, authored avatar registry, canon NPC with campaign record promotes as the same identity |
| Negative / security | Prompt injection in player text and narrator text, oversized input, forged ref/price in POST, invalid JSON, provider failures (timeout, 429, malformed) leave state unchanged |

### 6.3 Proposed scenario file format (`tests/bench/*.scenario.json`; JSON for tooling, YAML optional)

```jsonc
{
  "schema": "caldrevan-bench/1",
  "id": "market-buy-brenna-promote",
  "world": { "dir": "data", "fingerprint": "sha256:<canon hash>" },       // fails fast if canon drifts
  "start": { "scenario": "SLAVE_MARKET_V1" | { "save": "fixtures/saves/v5-market.json" }, "seed": 7, "clock": "fixed" },
  "providers": { "narrator": "recorded", "controller": "recorded", "image": "fake" },  // recorded | live | hybrid
  "steps": [
    { "id": "s1", "kind": "player_message", "text": "...",
      "narrator": { "ref": "rec/market/s1.narrator.json" },               // or inline "text"
      "controller": { "ref": "rec/market/s1.controller.json" },           // proposed commands
      "expect": {
        "turn": { "ok": true, "committed": ["create_character"], "rejected": [], "audit": [], "revision_delta": 1 },
        "delta": { "characters_added": [{"origin":"created","name":null,"location":"@here"}], "funds": {} },
        "view": { "offers": [{"kind":"person","price":260,"label":"Slave","name_visible":false}] },
        "forbidden_in_view": ["canon:brenna", "<technical ids>"]
      } },
    { "id": "s2", "kind": "ui_action", "action": "accept_trade_offer",
      "args": { "offer": "@offer(s1)", "expected_revision": "@rev(s1)" },
      "expect": { "ok": true, "revision_delta": 1,
                  "delta": { "funds": {"nicco": -260}, "transactions_added": 1, "characters_promoted_to_campaign": 1 } } },
    { "id": "s3", "kind": "ui_action", "action": "accept_trade_offer", "args": { "offer": "@offer(s1)", "expected_revision": "@rev(s2)" },
      "expect": { "ok": false, "error": "stale_offer", "revision_delta": 0 } },
    { "id": "s4", "kind": "system", "action": "save_and_reload", "expect": { "snapshot_equal": true } },
    { "id": "s5", "kind": "ui_action", "action": "promote_npc_plus", "args": { "character": "@char(s2)" },
      "expect": { "ok": false, "error": "not_at_heartstone", "revision_delta": 0 } },
    { "id": "s6", "kind": "player_message", "text": "...", "group_movement": true,
      "narrator": {"ref": "..."}, "controller": {"ref": "..."},
      "expect": { "delta": { "locations": { "@char(s2)": "heartstone_lr", "nicco": "heartstone_lr" } } } }
  ],
  "final": { "digest": "sha256:<summarizeSnapshot digest>", "assertions": ["nicco_not_npc_plus", "one_household_owner", "no_duplicate_character_names"] }
}
```

Notes: `@offer(sN)`, `@rev(sN)`, `@char(sN)` are late-bound references resolved from earlier results, so recordings never hard-code ids. `expect.delta` is compared against a snapshot diff computed by the runner (`summarizeSnapshot`/`turnState` style digests, no prose). A step without `expect` is an error (no unasserted steps). `kind: "system"` also covers `inject_provider_failure` and `advance_time`.

### 6.4 Layering with offline recorded LLM outputs

| Layer | Providers | Purpose | Cost / cadence |
|---|---|---|---|
| L0 Pure domain | none | `CampaignState` commands, schema/migration, golden snapshots | seconds, every commit |
| L1 Scripted scenarios | authored narrator/controller outputs | Deterministic proof of rules, explicit actions, negatives (this benchmark) | < 30 s, `npm test` |
| L2 Recorded replay | recordings captured from live runs (request hash -> response), stored under `tests/bench/rec/` with request prompt hash, model id, timestamp, token usage | Regression of the *interaction* between real model prose and the audit/intent regexes; a recording is invalidated when the prompt hash changes, so failures say "re-record", not "bug" | seconds, every commit; refresh monthly |
| L3 Hybrid / differential | real narrator, scripted controller (or the reverse) | Isolate which model change causes a regression; compare against the L2 baseline | minutes, on demand |
| L4 Live certification | both real, explicit-action scripts drive the same scenario files with `providers: live` | Model/provider upgrades, pre-release; asserts only invariants (no state assertions that depend on prose), plus the same `expect.view/forbidden` checks | tens of minutes, manual, never in `npm test` |

Recording mechanics: wrap the provider boundary (`GenerationRequest` -> result) with a `RecordingProvider` that stores `{request_hash, model, response, usage}`; the runner in L2 looks up by step id first and request hash second, and fails with a clear "stale recording" message. Keep recordings small by storing only the final assembled responses (not streams), and keep prompts out of the repo unless `--dump-prompts` is requested (the old harness already has the hook).

### 6.5 Delivery plan (suggested)

1. Extract `summarizeSnapshot`/`turnState`/`parseHistoricalMessages` from `src/dev/historical-replay.ts` into `tests/bench/support/`.
2. Build the runner around `GameSession` (not `TurnCoordinator`) so UI actions and persistence are the real ones; reuse `tests/turn-fixtures.ts` providers.
3. Port the current unit stories (Actual Offer P1-P21, explicit promotion P1-P20, travel safe-switch, follow matrix) as the first 10 scenarios, then add a 100-turn "market to Heartstone" campaign mirroring the old oracle's goals (Brenna purchase, Maren, rite, household end state) but with Accept/Promote as explicit steps.
4. Add the L2 recorder to the existing live dev scripts so every live run yields recordings for free.
5. Retire `historical-replay*.ts` once the 100-turn scenario passes; archive iteration data.

## 7. Prioritised recommendations

| # | Action | Class |
|---|---|---|
| 1 | `git rm --cached -r saves/` (after moving cited evidence) and `.log` files; add a CI check that nothing under `saves/` is tracked | ARCHIVE / DELETE CANDIDATE |
| 2 | Delete the 8 duplicated `src/dev/reflection-*` copies; collapse the version stack in `src/turn/structured` | MERGE |
| 3 | Move 33 root reports to `docs/history/`; keep `README.md`, `DEBT_REGISTER.md` | MOVE |
| 4 | Split `src/dev` into `tests/support` (fixtures), `tools/` (live and bench), and delete 23 orphans | MOVE / ARCHIVE |
| 5 | Add CI (typecheck, build, `npm test` with `npm ci`), `noUnusedLocals`, a clean step for `.build` | tooling |
| 6 | Fix the flaky `ui-v1` timer tests with an injected clock | REFACTOR |
| 7 | Decide the fate of Voyage/semantic retrieval, OpenRouter image client, `deepseek-controller` alias, `minimax-narrator.ts` name | UNKNOWN - NEEDS HUMAN DECISION |
| 8 | Optimise `data/canonNPCAvatar` and `city_map.png` (18 MB) | KEEP BUT DOCUMENT |
| 9 | Build the modern benchmark (section 6); retire the transcript-only replay and `payment_gap` | REFACTOR / DEPRECATE |
| 10 | Plan the `premium_*` to `npc_plus` rename as a schema migration | UNKNOWN - NEEDS HUMAN DECISION |
