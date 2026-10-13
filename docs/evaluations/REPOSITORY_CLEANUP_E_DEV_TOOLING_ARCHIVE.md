# Repository Cleanup E: dev tooling, scripts, archive and test reliability

Status: historical evidence (block report). Date: 2026-10-13. Baseline: main `26c2be5`. Reviewed and **accepted by the user on 2026-10-13**; the user's three final decisions (UI-31, REPO-13, CI-3) are applied in this commit and recorded in section 19. Cleanup F was not started.

Scope: classify and regroup `src/dev/` and `scripts/`, define the supported tooling surface, share the live-certification infrastructure, decide orphans, remove the last compatibility shell (REPO-9), decide the request-scoped Reflection wire oracle, fix TEST-1, audit the historical archive (REPO-13), clean `package.json`, add structural guards, reconcile current docs and the debt register. Gameplay, the production runtime graph, save schemas, NarrationFacts, authority, Keep track, Actual Offer, canonical-name reservation, Reflection and optional services are unchanged. No live call and no image call was made.

## 1. Baseline

| Check on `26c2be5` (clean `.build`) | Result |
| --- | --- |
| tracked files | 2,033 |
| `npm test` | 3685 / 3685 |
| `npm run benchmark:modern` | 55 / 55, 0 known gaps |
| `npm run check:architecture` | 360 modules, 28 source back edges, 0 runtime back edges, runtime graph sha256 `da03584d…` |
| `npm run check:docs` | 44 files, 351 links, 0 broken |
| `src/dev/` | 95 files, all at the root |
| `scripts/` | 49 files (47 at the root, `lib/browser-env.mjs`, `tests/d09-evidence-artifacts.test.mjs`) |
| npm scripts | 30 |
| production modules reachable from `src/dev/` or `scripts/` | none |

## 2. src/dev inventory

Every module has exactly one primary category. Columns are measured at the baseline (`Importers` counts static and dynamic imports; `Current docs` counts current documents that name the file; `Output path` lists literal output roots, `dynamic` when the target is computed). Totals: ACTIVE_TEST_SUPPORT 14, ACTIVE_INSPECTION 14 (13 inspectors plus `play.ts`), ACTIVE_BENCHMARK 4, ACTIVE_MAINTENANCE 5, ACTIVE_LIVE_CERTIFICATION 8, HISTORICAL_ONE_SHOT 44, SUPERSEDED 6, FROZEN_ORACLE 0 (the frozen Reflection oracles were already in `tests/frozen/`), UNKNOWN 0.

| Path (before) | Category | Importers | npm | Current docs | Network | Writes | Output path | Prod | Test | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `aggregate-diagnostics.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | no | yes | dynamic | no | no | ARCHIVE to `historical/aggregate-diagnostics.ts` |
| `audit-authored-data.ts` | ACTIVE_INSPECTION | 0 (0 tests) | - | 1 | no | yes | artifacts/local/evaluations, artifacts/local/evaluations/cal | no | no | MOVE to `inspect/audit-authored-data.ts` |
| `campaign-status.ts` | ACTIVE_TEST_SUPPORT | 5 (4 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/campaign-status.ts` |
| `consolidation-block10-live.ts` | ACTIVE_LIVE_CERTIFICATION | 0 (0 tests) | - | 1 | yes | yes | dynamic | no | no | MOVE to `live/narration-facts-commerce-live.ts` |
| `consolidation-block11-live.ts` | ACTIVE_LIVE_CERTIFICATION | 0 (0 tests) | - | 1 | yes | yes | dynamic | no | no | MOVE to `live/narration-facts-identity-live.ts` |
| `consolidation-block2-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | saves | no | no | ARCHIVE to `historical/consolidation-block2-live.ts` |
| `consolidation-block3-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | saves | no | no | ARCHIVE to `historical/consolidation-block3-live.ts` |
| `consolidation-block4-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 1 | yes | yes | saves | no | no | ARCHIVE to `historical/consolidation-block4-live.ts` |
| `consolidation-block5a-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 1 | yes | yes | saves | no | no | ARCHIVE to `historical/consolidation-block5a-live.ts` |
| `consolidation-block5b-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 1 | yes | yes | saves | no | no | ARCHIVE to `historical/consolidation-block5b-live.ts` |
| `consolidation-block6-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | saves_${label} | no | no | ARCHIVE to `historical/consolidation-block6-live.ts` |
| `consolidation-block7-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 1 | yes | yes | saves_a | no | no | ARCHIVE to `historical/consolidation-block7-live.ts` |
| `consolidation-block8-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 1 | yes | yes | dynamic | no | no | ARCHIVE to `historical/consolidation-block8-live.ts` |
| `consolidation-block9-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 1 | yes | yes | dynamic | no | no | ARCHIVE to `historical/consolidation-block9-live.ts` |
| `controller-authorization-diagnostics.ts` | ACTIVE_INSPECTION | 5 (4 tests) | - | 0 | yes | no | - | no | yes | MOVE to `inspect/controller-authorization-diagnostics.ts` |
| `controller-authorization-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | dynamic | no | no | ARCHIVE to `historical/controller-authorization-live.ts` |
| `controller-bakeoff-metrics.ts` | HISTORICAL_ONE_SHOT | 2 (1 tests) | - | 0 | no | no | - | no | yes | ARCHIVE to `historical/controller-bakeoff-metrics.ts` |
| `controller-benchmark-cases.ts` | ACTIVE_BENCHMARK | 2 (1 tests) | - | 0 | no | no | - | no | yes | MOVE to `benchmark/controller-benchmark-cases.ts` |
| `controller-benchmark.ts` | ACTIVE_BENCHMARK | 1 (1 tests) | benchmark:controller | 0 | yes | yes | saves/controller-benchmark/default | no | yes | MOVE to `benchmark/controller-benchmark.ts` |
| `d04-compaction-bakeoff.ts` | HISTORICAL_ONE_SHOT | 7 (3 tests) | - | 0 | no | yes | saves/d04-context/bakeoff, saves/d04-context/bakeoff/case-${ | no | yes | ARCHIVE to `historical/d04-compaction-bakeoff.ts` |
| `d04-compressor-benchmark.ts` | HISTORICAL_ONE_SHOT | 2 (1 tests) | - | 0 | yes | yes | saves/d04-context/bakeoff-results, saves/d04-context/bakeoff | no | yes | ARCHIVE to `historical/d04-compressor-benchmark.ts` |
| `d04-context-baseline.ts` | HISTORICAL_ONE_SHOT | 4 (2 tests) | - | 0 | no | yes | saves/d04-context, saves/d04-context/baseline.json, saves/d0 | no | yes | ARCHIVE to `historical/d04-context-baseline.ts` |
| `d04-final-live.ts` | HISTORICAL_ONE_SHOT | 2 (1 tests) | - | 0 | yes | yes | saves/d04-context/bakeoff-v2/case-${probe.case}.json, saves/ | no | yes | ARCHIVE to `historical/d04-final-live.ts` |
| `d04-lossless-fixtures.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | no | yes | saves/d04-context/bakeoff-v2, saves/d04-context/bakeoff/case | no | no | ARCHIVE to `historical/d04-lossless-fixtures.ts` |
| `d04-targeted-live.ts` | HISTORICAL_ONE_SHOT | 1 (1 tests) | - | 0 | yes | yes | saves/d04-context/final-live/freeze.json, saves/d04-context/ | no | yes | ARCHIVE to `historical/d04-targeted-live.ts` |
| `d05-live-retry.ts` | HISTORICAL_ONE_SHOT | 1 (1 tests) | - | 0 | yes | yes | saves/d05-retry | no | yes | ARCHIVE to `historical/d05-live-retry.ts` |
| `d10-mannerism-corpus.ts` | ACTIVE_TEST_SUPPORT | 9 (5 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/d10-mannerism-corpus.ts` |
| `diagnostics-aggregate.ts` | ACTIVE_INSPECTION | 4 (2 tests) | - | 0 | no | no | - | no | yes | MOVE to `inspect/diagnostics-aggregate.ts` |
| `embedding-configuration.ts` | ACTIVE_TEST_SUPPORT | 3 (1 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/embedding-configuration.ts` |
| `eval-authority.ts` | SUPERSEDED | 0 (0 tests) | eval:authority | 0 | yes | yes | artifacts/local/evaluations/phase-1n-${mode}-${label}-${new  | no | no | ARCHIVE to `historical/eval-authority.ts` |
| `eval-evidence.ts` | SUPERSEDED | 0 (0 tests) | eval:evidence | 1 | yes | yes | artifacts/local/evaluations, artifacts/local/evaluations/pha | no | no | ARCHIVE to `historical/eval-evidence.ts` |
| `eval-hardening.ts` | ACTIVE_LIVE_CERTIFICATION | 0 (0 tests) | eval:playthrough, inspect:turn | 1 | yes | yes | artifacts/local/evaluations, artifacts/local/evaluations/pha | no | no | MOVE to `live/eval-hardening.ts` |
| `eval-live-h5.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/h5-live/${label}-${new Date().to | no | no | ARCHIVE to `historical/eval-live-h5.ts` |
| `eval-mannerisms.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | saves/d10-mannerisms/pass2, saves/d10-mannerisms/pass2/froze | no | no | ARCHIVE to `historical/eval-mannerisms.ts` |
| `eval-narrators.ts` | SUPERSEDED | 0 (0 tests) | eval:narrators | 0 | yes | yes | artifacts/local/evaluations/phase-1m-stage-${stage}-${new Da | no | no | ARCHIVE to `historical/eval-narrators.ts` |
| `eval-organic-discovery.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/h5-live/npcplus8${dry ?  | no | no | ARCHIVE to `historical/eval-organic-discovery.ts` |
| `eval-organic-reflection.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/h5-live/npcplus7${dry ?  | no | no | ARCHIVE to `historical/eval-organic-reflection.ts` |
| `eval-participants.ts` | SUPERSEDED | 0 (0 tests) | eval:participants | 0 | yes | yes | artifacts/local/evaluations, artifacts/local/evaluations/pha | no | no | ARCHIVE to `historical/eval-participants.ts` |
| `evidence-corpus.ts` | ACTIVE_TEST_SUPPORT | 5 (2 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/evidence-corpus.ts` |
| `evidence-quote.ts` | SUPERSEDED | 2 (1 tests) | - | 0 | no | no | - | no | yes | ARCHIVE to `historical/evidence-quote.ts` |
| `existing-subsystem-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | dynamic | no | no | ARCHIVE to `historical/existing-subsystem-live.ts` |
| `extract-playthrough.ts` | ACTIVE_MAINTENANCE | 0 (0 tests) | extract:playthrough | 0 | no | yes | dynamic | no | no | MOVE to `maintenance/extract-playthrough.ts` |
| `follow-choice-classify.ts` | HISTORICAL_ONE_SHOT | 2 (1 tests) | - | 0 | no | no | - | no | yes | ARCHIVE to `historical/follow-choice-classify.ts` |
| `follow-choice-e2e.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | no | yes | dynamic | no | no | ARCHIVE to `historical/follow-choice-e2e.ts` |
| `follow-choice-variants.ts` | HISTORICAL_ONE_SHOT | 3 (2 tests) | - | 0 | no | no | - | no | yes | ARCHIVE to `historical/follow-choice-variants.ts` |
| `historical-anchors.ts` | HISTORICAL_ONE_SHOT | 2 (1 tests) | - | 0 | no | no | - | no | yes | ARCHIVE to `historical/historical-anchors.ts` |
| `historical-context.ts` | ACTIVE_TEST_SUPPORT | 4 (2 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/historical-context.ts` |
| `historical-replay-compare.ts` | HISTORICAL_ONE_SHOT | 1 (1 tests) | - | 1 | no | yes | saves | no | yes | ARCHIVE to `historical/historical-replay-compare.ts` |
| `historical-replay.ts` | HISTORICAL_ONE_SHOT | 2 (1 tests) | - | 1 | no | yes | saves | no | yes | ARCHIVE to `historical/historical-replay.ts` |
| `identity-live-cert.ts` | ACTIVE_LIVE_CERTIFICATION | 0 (0 tests) | - | 1 | no | yes | saves | no | no | MOVE to `live/identity-live-cert.ts` |
| `inspect-city.ts` | ACTIVE_INSPECTION | 0 (0 tests) | - | 2 | no | no | - | no | no | MOVE to `inspect/inspect-city.ts` |
| `inspect-context.ts` | ACTIVE_INSPECTION | 1 (1 tests) | inspect:context | 0 | no | no | - | no | yes | MOVE to `inspect/inspect-context.ts` |
| `inspect-embedding.ts` | ACTIVE_INSPECTION | 0 (0 tests) | inspect:embedding | 0 | no | no | - | no | no | MOVE to `inspect/inspect-embedding.ts` |
| `inspect-llm.ts` | ACTIVE_INSPECTION | 0 (0 tests) | bench:llm, inspect:controller, inspect:narrator | 0 | yes | no | - | no | no | MOVE to `inspect/inspect-llm.ts` |
| `inspect-save.ts` | ACTIVE_INSPECTION | 0 (0 tests) | inspect:save | 0 | no | no | - | no | no | MOVE to `inspect/inspect-save.ts` |
| `inspect-scene-state.ts` | ACTIVE_INSPECTION | 0 (0 tests) | inspect:scene | 0 | no | no | - | no | no | MOVE to `inspect/inspect-scene-state.ts` |
| `inspect-search.ts` | ACTIVE_INSPECTION | 0 (0 tests) | inspect:search | 0 | no | no | - | no | no | MOVE to `inspect/inspect-search.ts` |
| `inspect-time.ts` | ACTIVE_INSPECTION | 0 (0 tests) | inspect:time | 0 | no | no | - | no | no | MOVE to `inspect/inspect-time.ts` |
| `item-lifecycle-inspector.ts` | ACTIVE_INSPECTION | 3 (2 tests) | - | 0 | no | no | - | no | yes | MOVE to `inspect/item-lifecycle-inspector.ts` |
| `item-lifecycle-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | dynamic | no | no | ARCHIVE to `historical/item-lifecycle-live.ts` |
| `keep-track-live.ts` | ACTIVE_LIVE_CERTIFICATION | 0 (0 tests) | - | 1 | yes | yes | dynamic | no | no | MOVE to `live/keep-track-live.ts` |
| `live-eval-scenarios.ts` | HISTORICAL_ONE_SHOT | 2 (1 tests) | - | 0 | no | no | - | no | yes | ARCHIVE to `historical/live-eval-scenarios.ts` |
| `llm-scenarios.ts` | ACTIVE_INSPECTION | 2 (1 tests) | - | 0 | no | no | - | no | yes | MOVE to `inspect/llm-scenarios.ts` |
| `lore-grounding.ts` | ACTIVE_TEST_SUPPORT | 3 (2 tests) | - | 1 | no | no | - | no | yes | MOVE to `support/lore-grounding.ts` |
| `mannerism-calibration-replay.ts` | HISTORICAL_ONE_SHOT | 1 (1 tests) | - | 0 | no | no | saves/d10-mannerisms/pass2b/replay-not-written | no | yes | ARCHIVE to `historical/mannerism-calibration-replay.ts` |
| `narrative-checks.ts` | ACTIVE_TEST_SUPPORT | 9 (3 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/narrative-checks.ts` |
| `narrator-bakeoff.ts` | HISTORICAL_ONE_SHOT | 11 (1 tests) | - | 0 | yes | no | - | no | yes | ARCHIVE to `historical/narrator-bakeoff.ts` |
| `organic-discovery.ts` | HISTORICAL_ONE_SHOT | 3 (1 tests) | - | 1 | no | no | - | no | yes | ARCHIVE to `historical/organic-discovery.ts` |
| `passive-response-audit.ts` | ACTIVE_TEST_SUPPORT | 6 (2 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/passive-response-audit.ts` |
| `person-offer-live-cert.ts` | ACTIVE_LIVE_CERTIFICATION | 0 (0 tests) | - | 1 | no | yes | saves | no | no | MOVE to `live/person-offer-live-cert.ts` |
| `play-turn.ts` | ACTIVE_TEST_SUPPORT | 5 (2 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/play-turn.ts` |
| `play.ts` | ACTIVE_INSPECTION | 0 (0 tests) | play | 4 | yes | no | - | no | no | KEEP |
| `playthrough-csv.ts` | ACTIVE_MAINTENANCE | 6 (1 tests) | - | 1 | no | no | - | no | yes | MOVE to `maintenance/playthrough-csv.ts` |
| `playthrough-manifest.ts` | ACTIVE_MAINTENANCE | 3 (1 tests) | - | 0 | no | no | - | no | yes | MOVE to `maintenance/playthrough-manifest.ts` |
| `probe-final-movement-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/final-movement-closure/live.json | no | no | ARCHIVE to `historical/probe-final-movement-live.ts` |
| `probe-follow-choice-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/pass10/follow-choice-live.jsonl | no | no | ARCHIVE to `historical/probe-follow-choice-live.ts` |
| `probe-follow-choice.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/pass10/probe-follow-choice.jsonl | no | no | ARCHIVE to `historical/probe-follow-choice.ts` |
| `probe-movement-closure-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/movement-follow-closure/${scenar | no | no | ARCHIVE to `historical/probe-movement-closure-live.ts` |
| `receipt-corpus.ts` | ACTIVE_TEST_SUPPORT | 1 (1 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/receipt-corpus.ts` |
| `reflection-benchmark.ts` | ACTIVE_LIVE_CERTIFICATION | 12 (1 tests) | - | 0 | yes | no | - | no | yes | MOVE to `live/reflection-benchmark.ts` |
| `replay-hardening.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 2 | no | yes | artifacts/local/evaluations, artifacts/local/evaluations/pha | no | no | ARCHIVE to `historical/replay-hardening.ts` |
| `replay-organic-discovery.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 1 | no | yes | dynamic | no | no | ARCHIVE to `historical/replay-organic-discovery.ts` |
| `replay-stage-b.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 1 | no | yes | artifacts/local/evaluations, artifacts/local/evaluations/pha | no | no | ARCHIVE to `historical/replay-stage-b.ts` |
| `retrieval-benchmark-h3.ts` | ACTIVE_BENCHMARK | 1 (1 tests) | - | 0 | no | no | - | no | yes | MOVE to `benchmark/retrieval-benchmark-h3.ts` |
| `review-mannerism-seeds.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | no | no | - | no | no | ARCHIVE to `historical/review-mannerism-seeds.ts` |
| `review-playthrough.ts` | ACTIVE_MAINTENANCE | 0 (0 tests) | review:playthrough | 0 | no | no | - | no | no | MOVE to `maintenance/review-playthrough.ts` |
| `scan-identity-forks.ts` | ACTIVE_MAINTENANCE | 0 (0 tests) | - | 2 | no | yes | dynamic | no | no | MOVE to `maintenance/scan-identity-forks.ts` |
| `scene-foundation-fixtures.ts` | ACTIVE_TEST_SUPPORT | 3 (2 tests) | - | 0 | no | no | - | no | yes | MOVE to `support/scene-foundation-fixtures.ts` |
| `scene-state-fixtures.ts` | ACTIVE_TEST_SUPPORT | 11 (4 tests) | - | 2 | no | no | - | no | yes | MOVE to `support/scene-state-fixtures.ts` |
| `scene-state-foundation-live.ts` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | dynamic | no | no | ARCHIVE to `historical/scene-state-foundation-live.ts` |
| `scene-state-live-smoke.ts` | ACTIVE_LIVE_CERTIFICATION | 0 (0 tests) | - | 1 | yes | yes | dynamic | no | no | MOVE to `live/scene-state-live-smoke.ts` |
| `shadow-evidence.ts` | SUPERSEDED | 0 (0 tests) | eval:shadow-evidence | 1 | yes | yes | artifacts/local/evaluations, artifacts/local/evaluations/pha | no | no | ARCHIVE to `historical/shadow-evidence.ts` |
| `turn-fixture.ts` | ACTIVE_TEST_SUPPORT | 95 (67 tests) | - | 1 | no | no | - | no | yes | MOVE to `support/turn-fixture.ts` |
| `turn-retrieval-benchmark.ts` | ACTIVE_BENCHMARK | 3 (2 tests) | - | 0 | no | no | - | no | yes | MOVE to `benchmark/turn-retrieval-benchmark.ts` |
| `turn-services.ts` | ACTIVE_TEST_SUPPORT | 17 (1 tests) | - | 1 | yes | no | - | no | yes | MOVE to `support/turn-services.ts` |
## 3. scripts inventory

Totals: ACTIVE_BUILD_SUPPORT 2 (`clean.mjs`, `lib/browser-env.mjs`), ACTIVE_ARCHITECTURE_CHECK 2 (`check-doc-links.mjs`, `minor-debt-cycle-check.mjs`), ACTIVE_BROWSER_CHECK 8, ACTIVE_EVALUATION 5, HISTORICAL_REPRODUCTION 14, HISTORICAL_ONE_SHOT 17, SUPERSEDED 1 (`audit-player-travel-authority.mjs`, which fails its own assertion on current code, known since Cleanup B2), UNKNOWN 0. No script was in `package.json` except the three command scripts.

| Path (before) | Category | Importers | npm | Current docs | Network | Writes | Output path | Prod | Test | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `actual-offer-browser-check.mjs` | ACTIVE_BROWSER_CHECK | 0 (0 tests) | - | 3 | yes | no | - | no | no | MOVE to `browser/actual-offer-browser-check.mjs` |
| `anime-portrait-benchmark-scores.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | no | - | no | no | ARCHIVE to `historical/anime-portrait-benchmark-scores.mjs` |
| `anime-portrait-benchmark-sheets.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | saves/portrait_benchmark_anime | no | no | ARCHIVE to `historical/anime-portrait-benchmark-sheets.mjs` |
| `anime-portrait-benchmark.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | saves/portrait_benchmark_anime | no | no | ARCHIVE to `historical/anime-portrait-benchmark.mjs` |
| `audit-player-travel-authority.mjs` | SUPERSEDED | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/player-travel-authority, artifac | no | no | ARCHIVE to `historical/audit-player-travel-authority.mjs` |
| `block5b-browser-check.mjs` | ACTIVE_BROWSER_CHECK | 0 (0 tests) | - | 1 | yes | no | - | no | no | MOVE to `browser/block5b-browser-check.mjs` |
| `block6-browser-check.mjs` | ACTIVE_BROWSER_CHECK | 0 (0 tests) | - | 1 | yes | no | - | no | no | MOVE to `browser/block6-browser-check.mjs` |
| `block7-browser-check.mjs` | ACTIVE_BROWSER_CHECK | 0 (0 tests) | - | 1 | yes | no | - | no | no | MOVE to `browser/block7-browser-check.mjs` |
| `casting-trace.mjs` | ACTIVE_EVALUATION | 0 (0 tests) | - | 0 | no | yes | artifacts/local/casting-trace.json | no | no | MOVE to `evaluation/casting-trace.mjs` |
| `character-performance-pilot.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | dynamic | no | no | ARCHIVE to `historical/character-performance-pilot.mjs` |
| `check-doc-links.mjs` | ACTIVE_ARCHITECTURE_CHECK | 0 (0 tests) | check:docs | 2 | no | no | - | no | no | KEEP |
| `clean.mjs` | ACTIVE_BUILD_SUPPORT | 0 (0 tests) | build, clean | 2 | no | no | .build | no | no | KEEP |
| `confirmation-browser-check.mjs` | ACTIVE_BROWSER_CHECK | 0 (0 tests) | - | 1 | yes | yes | dynamic | no | no | MOVE to `browser/confirmation-browser-check.mjs` |
| `controller-bakeoff-round-2-cases.mjs` | HISTORICAL_ONE_SHOT | 1 (0 tests) | - | 0 | no | no | - | no | no | ARCHIVE to `historical/controller-bakeoff-round-2-cases.mjs` |
| `controller-bakeoff-round-2.mjs` | HISTORICAL_ONE_SHOT | 1 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations, artifacts/local/evaluations/con | no | no | ARCHIVE to `historical/controller-bakeoff-round-2.mjs` |
| `controller-switch-qwen.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | no | no | - | no | no | ARCHIVE to `historical/controller-switch-qwen.mjs` |
| `d09-eligibility-checkpoint.mjs` | HISTORICAL_REPRODUCTION | 2 (0 tests) | - | 0 | no | no | - | no | no | ARCHIVE to `historical/d09-eligibility-checkpoint.mjs` |
| `d09-evidence-artifacts.mjs` | HISTORICAL_REPRODUCTION | 4 (0 tests) | - | 0 | no | yes | dynamic | no | no | ARCHIVE to `historical/d09-evidence-artifacts.mjs` |
| `d09-final-campaign-soak-analyze.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | no | yes | docs/evaluations/d09-reflection/evidence/d09-final-campaign- | no | no | ARCHIVE to `historical/d09-final-campaign-soak-analyze.mjs` |
| `d09-final-campaign-soak.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | yes | yes | docs/evaluations/d09-reflection/evidence/d09-final-campaign- | no | no | ARCHIVE to `historical/d09-final-campaign-soak.mjs` |
| `d09-final-matched-ablation-analyze.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | no | yes | docs/evaluations/d09-reflection/evidence/d09-final-matched-a | no | no | ARCHIVE to `historical/d09-final-matched-ablation-analyze.mjs` |
| `d09-final-matched-ablation.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | yes | yes | docs/evaluations/d09-reflection/evidence/d09-final-matched-a | no | no | ARCHIVE to `historical/d09-final-matched-ablation.mjs` |
| `d09-final-relationship-ablation.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | yes | yes | docs/evaluations/d09-reflection/evidence/d09-final-relations | no | no | ARCHIVE to `historical/d09-final-relationship-ablation.mjs` |
| `d09-qualifying-reflection-eligibility.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | no | yes | docs/evaluations/d09-reflection/evidence/d09-qualifying-refl | no | no | ARCHIVE to `historical/d09-qualifying-reflection-eligibility.mjs` |
| `d09-reflection-packing-review.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | no | yes | docs/evaluations/d09-reflection/evidence/d09-final-matched-a | no | no | ARCHIVE to `historical/d09-reflection-packing-review.mjs` |
| `d09-unique-value-matched-ablation-analyze.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | no | yes | docs/evaluations/d09-reflection/evidence/d09-unique-value-ma | no | no | ARCHIVE to `historical/d09-unique-value-matched-ablation-analyze.mjs` |
| `d09-unique-value-matched-ablation-resume.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | yes | yes | docs/evaluations/d09-reflection/evidence/d09-unique-value-ma | no | no | ARCHIVE to `historical/d09-unique-value-matched-ablation-resume.mjs` |
| `d09-unique-value-matched-ablation.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | yes | yes | docs/evaluations/d09-reflection/evidence/d09-unique-value-ma | no | no | ARCHIVE to `historical/d09-unique-value-matched-ablation.mjs` |
| `explicit-promotion-browser-check.mjs` | ACTIVE_BROWSER_CHECK | 0 (0 tests) | - | 2 | no | no | - | no | no | MOVE to `browser/explicit-promotion-browser-check.mjs` |
| `gemini-vertex-rerun.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/gemini-vertex-rerun-${stamp}, ar | no | no | ARCHIVE to `historical/gemini-vertex-rerun.mjs` |
| `item-inventory-live-smoke.mjs` | ACTIVE_EVALUATION | 0 (0 tests) | - | 1 | yes | yes | artifacts/local/evaluations, artifacts/local/evaluations/ITE | no | no | MOVE to `evaluation/item-inventory-live-smoke.mjs` |
| `item-sprite-fidelity-smoke.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/ITEM_SPRITE_FIDELITY_SMOKE.json, | no | no | ARCHIVE to `historical/item-sprite-fidelity-smoke.mjs` |
| `item-sprite-live-smoke.mjs` | ACTIVE_EVALUATION | 0 (0 tests) | - | 1 | yes | yes | artifacts/local/evaluations, artifacts/local/evaluations/ITE | no | no | MOVE to `evaluation/item-sprite-live-smoke.mjs` |
| `item-sprite-quality-smoke.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/ITEM_SPRITE_QUALITY_SMOKE.json,  | no | no | ARCHIVE to `historical/item-sprite-quality-smoke.mjs` |
| `keep-track-browser-check.mjs` | ACTIVE_BROWSER_CHECK | 0 (0 tests) | - | 1 | no | yes | dynamic | no | no | MOVE to `browser/keep-track-browser-check.mjs` |
| `lib/browser-env.mjs` | ACTIVE_BUILD_SUPPORT | 8 (0 tests) | - | 2 | no | yes | .build, artifacts/local/browser/<check>/ | no | no | KEEP |
| `live-controller-reliability-1.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/controller-reliability-1-${stamp}, artifacts | no | no | ARCHIVE to `historical/live-controller-reliability-1.mjs` |
| `long-form-trial-1.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/long-form-narrator-trial-1-${sta | no | no | ARCHIVE to `historical/long-form-trial-1.mjs` |
| `minor-debt-controller-audit.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 1 | no | yes | docs/evaluations/d09-reflection/evidence/d09-final-campaign- | no | no | ARCHIVE to `historical/minor-debt-controller-audit.mjs` |
| `minor-debt-cycle-check.mjs` | ACTIVE_ARCHITECTURE_CHECK | 0 (0 tests) | check:architecture | 1 | no | yes | dynamic | no | no | KEEP |
| `minor-debt-offline-guard.mjs` | ACTIVE_EVALUATION | 0 (0 tests) | - | 1 | no | no | - | no | no | MOVE to `evaluation/minor-debt-offline-guard.mjs` |
| `narrator-bakeoff-1-analyze.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | no | yes | dynamic | no | no | ARCHIVE to `historical/narrator-bakeoff-1-analyze.mjs` |
| `narrator-bakeoff-1-dump.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | no | no | - | no | no | ARCHIVE to `historical/narrator-bakeoff-1-dump.mjs` |
| `narrator-bakeoff-1-preflight.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | dynamic | no | no | ARCHIVE to `historical/narrator-bakeoff-1-preflight.mjs` |
| `narrator-bakeoff-1.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | artifacts/local/evaluations/narrator-bakeoff-1-${stamp}, art | no | no | ARCHIVE to `historical/narrator-bakeoff-1.mjs` |
| `p8-economy-live.mjs` | HISTORICAL_ONE_SHOT | 0 (0 tests) | - | 0 | yes | yes | dynamic | no | no | ARCHIVE to `historical/p8-economy-live.mjs` |
| `tests/d09-evidence-artifacts.test.mjs` | HISTORICAL_REPRODUCTION | 0 (0 tests) | - | 0 | no | yes | dynamic | no | no | ARCHIVE to `historical/d09-evidence-artifacts.test.mjs` |
| `transfer-domain-live-smoke.mjs` | ACTIVE_EVALUATION | 0 (0 tests) | - | 1 | yes | yes | artifacts/local/evaluations, artifacts/local/evaluations/TRA | no | no | MOVE to `evaluation/transfer-domain-live-smoke.mjs` |
| `turn-reliability-browser-check.mjs` | ACTIVE_BROWSER_CHECK | 0 (0 tests) | - | 1 | no | no | - | no | no | MOVE to `browser/turn-reliability-browser-check.mjs` |
## 4. Supported tooling surface

A tool is **active** only if an npm script exposes it, a current document tells the reader to run it, a current test imports it as support, an active tool imports it, or it belongs to a current certification. Everything else is historical. Applied to the 144 files: 63 active (all with at least one of those links after the docs update; 0 active orphans), 82 historical. The one active-to-historical import found by the consistency check (`eval-hardening.ts` importing `historical-context.ts`, the evaluation-only narrator decoration behind the documented `eval:playthrough -- --narrative`) was resolved by classifying `historical-context.ts` as support: it is imported by `eval-hardening.ts` and by `tests/turn-hardening.test.ts`.

| Area | Supported tools |
| --- | --- |
| commands | `clean`, `build`, `typecheck`, `test`, `benchmark:modern`, `check:architecture`, `check:docs`, `test:playthrough`, `eval:retrieval` |
| play | `play` (`src/dev/play.ts`), `play:ui` |
| inspection | `inspect:time`, `inspect:scene`, `inspect:context`, `inspect:search`, `inspect:save`, `inspect:embedding` (Voyage), `inspect:narrator` / `inspect:controller` / `bench:llm` (live), plus `audit-authored-data`, `inspect-city`, `item-lifecycle-inspector`, `controller-authorization-diagnostics`, `diagnostics-aggregate` |
| benchmarks | `benchmark:controller` (live), the retrieval benchmarks |
| maintenance | `extract:playthrough`, `review:playthrough`, `scan-identity-forks` |
| live certification | `keep-track-live`, `identity-live-cert`, `person-offer-live-cert`, `narration-facts-commerce-live`, `narration-facts-identity-live`, `scene-state-live-smoke`, `inspect:turn` (`eval-hardening --smoke`; its curated modes, formerly `eval:playthrough`, are deprecated and run only directly), `reflection-benchmark` (credential preflight library) |
| browser | the eight `scripts/browser/*-browser-check.mjs` (offline) |
| evaluation scripts | `casting-trace.mjs`, `minor-debt-offline-guard.mjs` (offline); `item-inventory-live-smoke.mjs`, `item-sprite-live-smoke.mjs`, `transfer-domain-live-smoke.mjs` (live) |

## 5. src/dev moves

All moves are `git mv` plus mechanical rewrites of relative import specifiers, `.build/src/dev/...` paths in `package.json`, and literal path mentions in current docs and code comments (historical reports under `docs/evaluations/` are not rewritten). The mover preserves CRLF files byte for byte (CR counts checked on every staged rename). No barrel, no `misc/` or `utils/`.

| Folder | Files | Content |
| --- | --- | --- |
| `src/dev/` root | 1 | `play.ts` (the CLI play loop; not moved just to empty the root) |
| `support/` | 14 | `turn-fixture`, `turn-services`, scene fixtures, corpora, `narrative-checks`, `play-turn`, `historical-context`, ... |
| `inspect/` | 13 | the `inspect:*` targets and offline inspectors |
| `benchmark/` | 4 | `controller-benchmark` (+ cases), the two retrieval benchmarks |
| `maintenance/` | 5 | playthrough corpus tools, `scan-identity-forks` |
| `live/` | 9 | eight live tools plus the new `support.ts` |
| `historical/` | 50 | 44 one-shot harnesses and bake-offs, 6 superseded Phase 1M-1P evaluations |

Two active tools got a behavior name with their move because they were refactored in E6 anyway: `consolidation-block10-live.ts` → `live/narration-facts-commerce-live.ts`, `consolidation-block11-live.ts` → `live/narration-facts-identity-live.ts` (their campaign ids, which seed weather, are unchanged). No other file was renamed. Proof: the rename-mapped static and runtime edge sets over `src/`, `tests/` and `scripts/` (TypeScript AST, 632 modules, 3,357 runtime and 4,522 total edges) are **identical** before and after the moves; the `.mjs` import inventory (which resolves `.build/` imports back to source) is identical too (0 differences); no production module is reachable from `src/dev/` or `scripts/`. `check:architecture` reports the same 360 modules and 0 runtime back edges; its runtime graph hash changed (`da03584d…` → `deb724e9…`) only because module paths under `src/dev/` changed and `deepseek-controller.ts` (section 9) was replaced by `live/support.ts` in the module set.

Frozen test-only oracles: none were left in `src/dev/` (the Reflection chain moved to `tests/frozen/` in Cleanup C). The 17 historical modules that tests still import are harnesses with unit-tested pure parts, not oracles; moving them belongs to the test taxonomy (Cleanup F).

## 6. scripts moves

| Folder | Files |
| --- | --- |
| `scripts/` root | `clean.mjs`, `check-doc-links.mjs`, `minor-debt-cycle-check.mjs` (unchanged paths; `tests/build-discipline.test.ts` pins them) |
| `scripts/lib/` | `browser-env.mjs` (unchanged; it derives the repository root from its own location) |
| `scripts/browser/` | the 8 offline browser checks |
| `scripts/evaluation/` | 5 (2 offline, 3 live smokes) |
| `scripts/historical/` | 32: the D09 harnesses and analyzers with `d09-evidence-artifacts.test.mjs`, bake-off, pilot and portrait-benchmark runners, `minor-debt-controller-audit.mjs`, `audit-player-travel-authority.mjs` |

Every moved script imports compiled code through a relative `../../.build/...` specifier or `fromBuild(...)`; both were rewritten mechanically and checked (section 14, guard 8). No script computes paths from `import.meta.url` except `browser-env.mjs`, which did not move. Renaming `minor-debt-cycle-check.mjs` to a behavior name is left as a human decision (historical reports cite the path). The B2 allowlist in `tests/evaluation-history-isolation.test.ts` was repointed to the four historical tools' new paths (still four entries).

## 7. Live harness consolidation

Compared across the live harnesses: bootstrap, provider setup, trace capture, retry, output, environment, fixtures and cleanup. Byte-identical or semantically identical code existed in many copies: the OpenRouter wire recorder (9 files, 6 variants), the `TRANSIENT` provider-code set (9 files), the one-retry loop (5 current certifications, plus historical copies), the usage token/cost summation (3), and the production-deps setup that drops the portrait generator, sprite reviewer and autosave (5).

New `src/dev/live/support.ts` (one small module, no scenario logic): `TRANSIENT_PROVIDER_CODES`, `liveSessionDeps(save_dir, observer?)`, `submitWithTransientRetry(session, input)` (one retry, only for a transient code that left the turn state unchanged), `usageTotals(usage)` and `recordOpenRouterWire()`. It is used by the five current certifications (`keep-track-live`, `identity-live-cert`, `person-offer-live-cert`, `narration-facts-commerce-live`, `narration-facts-identity-live`); scenario steps, verdicts and output shapes stay in each harness. `identity-live-cert` counts retries as `attempts - 1`, which is what its loop counted. Outputs: `identity-live-cert` and `person-offer-live-cert` kept scratch saves under `saves/`; they now keep them under their `artifacts/local/evaluations/<harness>/saves` output directory; the two renamed harnesses write to `artifacts/local/evaluations/narration_facts_{commerce,identity}_live/`. `tests/live-harness-support.test.ts` (3 tests) exercises the module offline with fake sessions and a fake `fetch`. The historical block 2-9 harnesses were archived unchanged. No harness was run live.

## 8. Orphan and archive decisions

42 files had no importer, caller, npm script, current document or test path at the baseline (18 in `src/dev/`, 24 in `scripts/`). Each was decided individually:

- **A, historically valuable (ARCHIVE): 41.** 36 are named in historical reports; the other 5 are four D09 runners and analyzers, which copy themselves into their evidence directories, and `aggregate-diagnostics.ts`, the CLI of the active diagnostics aggregator, recorded in the D09 source freeze. They moved to `src/dev/historical/` or `scripts/historical/` unchanged and still compile.
- **Active once documented: 1.** `scripts/evaluation/casting-trace.mjs` (offline, deterministic) is now documented in Testing and was run in section 15.
- **B, obsolete: kept as ARCHIVE.** `audit-player-travel-authority.mjs` (stale) and the Phase 1M-1P evaluations stay as historical evidence of superseded designs.
- **C, dead: 0.** No tool imports a module that no longer exists; nothing met the deletion conditions.

**Deleted in this block: 3 files, each decided individually:** `src/llm/openrouter/deepseek-controller.ts` (section 9), `tests/frozen/reflection/reflection-wire-v2.ts` and `tests/reflection-wire-v2.test.ts` (section 10). No mass deletion, no historical evidence deleted.

## 9. REPO-9 decisions

`src/llm/openrouter/deepseek-controller.ts` was a three-line `@deprecated` re-export of `state-controller.ts` (`OpenRouterStateControllerProvider as DeepSeekStateControllerProvider`, `CONTROLLER_POLICY`, `DEFAULT_CONTROLLER_MODEL`). Production never imported it; only seven tests did; no current document names it; DeepSeek is not the controller (the production controller is GPT-6 Luna with a Claude Haiku 5.5 fallback, and `tests/controller-model-fallback.test.ts` asserts no DeepSeek on the controller route). DeepSeek survives only as one selectable *narrator* alternative in `src/app/narrator-alternatives.ts`, which is unrelated. The seven tests now import `state-controller.ts` and use `OpenRouterStateControllerProvider` (the same class), and the shim is deleted. Historical scripts under `docs/evaluations/` that name the shim (18) are not rewritten. **REPO-9 is closed.**

## 10. Reflection oracle decision

`tests/frozen/reflection/reflection-wire-v2.ts` (`requestScopedReflectionWire`, version `WIRE_ALIBABA_V2`) is the pre-CVC request-scoped wire. It was never on the production path and is not part of the frozen chain that `tests/reflection-consolidation-equivalence.test.ts` pins to production (`reflection-v23-cvc-e1` imports `reflection-wire-v2-cvc`, not this file). Its only importer, `tests/reflection-wire-v2.test.ts`, tested it against other frozen modules, so it could not catch any production regression. Its three properties were checked against the production wire first (offline probe): repeated movement endpoints stay expressible while duplicate references are rejected only by the canonical schema; location enums come from visible movement only; altered visible evidence gets no enum authority (production fails closed with empty domains and `citation_not_visible` instead of throwing). **Decision: DELETE** the oracle and its test, and pin the three properties on production in `tests/reflection-wire-domains.test.ts` (3 tests). No Reflection production code changed. The other eight frozen modules stay.

## 11. TEST-1 root cause and fix

Reproduced, then traced. `tests/ui-v1.test.ts` runs `src/ui/client.js` in a `vm` context that receives the host `setTimeout` but has its own `Date`. `startPortraitProgress` stamps `startedAt = Date.now()` and re-renders from a `setTimeout(tick, 1000)` chain; `portraitStage(elapsed)` stays "Request sent" below 1000 ms. Node timers run on the monotonic event-loop clock, `Date.now()` on the wall clock, with different sub-millisecond phases: a probe with 400 concurrent 1000 ms timers saw `Date.now()` elapsed = 999 ms for 2, 5 and 3 of 400 timers (about 1%). When that happens the stage stays "Request sent" until the 2 s tick, and the test asserts at 1150 ms. In isolation the old test passed 60 of 60 runs: the race needs that sub-millisecond phase, which is why it showed up mostly in the full suite.

**Classification: C (both)**, with the production part cosmetic only: in about 1% of portrait generations the progress label changes one second late. No state, request, save or gameplay effect, so per the brief production was not changed; it is recorded as **UI-31** with an optional patch (render from `max(Date.now() - startedAt, ticks * 1000)`, or count ticks) for later UI polish (section 19).

**Fix (test only):** `manualClock()` in `tests/ui-v1.test.ts` gives the client one controlled clock for `Date` and `setTimeout`/`clearTimeout`; `advance(ms)` runs each due timer in order at its exact due time and then settles microtasks. The hold test advances 1150 ms instead of sleeping. Assertions are unchanged; no sleep, retry, timeout or weakened assertion was added. Proof: 100 consecutive focused runs (0 failures), 50 under four CPU burners (0), 60 on the final tree (0), and three full suites green (section 15).

## 12. REPO-13 archive audit

Measured on every tracked file under `docs/evaluations/` before this report was added (1,047 files, 48,518,348 bytes; unique content 45,538,502 bytes):

| Class | Files | Bytes | Not referenced by name |
| --- | --- | --- | --- |
| SCREENSHOT | 82 | 22,614,487 | 79 |
| MACHINE EVIDENCE | 535 | 16,332,694 | 446 |
| TRACE | 66 | 4,692,413 | 52 |
| REPORT | 256 | 4,131,014 | 79 |
| HISTORICAL SCRIPT | 103 | 692,227 | 68 |
| RUNNER COPY | 4 | 55,418 | 4 |
| OTHER | 1 | 95 | 0 |
| SOURCE COPY, CACHE/ACCIDENTAL | 0 | 0 | - |

"Not referenced" means no tracked file names the path or file name; most such files are members of a run directory that its report cites as a whole, so it does not mean unused. Largest files: two 1.4 MB portrait-benchmark sheets, three 1.0 MB `test-unit.log` captures in the D09 evidence, and 0.7-0.9 MB item-sprite PNGs. **Exact duplicates: 13 groups, 14 extra files, 2,979,846 bytes**, 99% of it four item-sprite PNGs saved twice (`debug_N.png` beside the save's `portraits/.../portrait_item_*.png`). Every duplicate is either referenced by its run's evidence JSON (`ITEM_SPRITE_QUALITY_SMOKE.json`, `ITEM_SPRITE_STRICT_REGENERATION.json` name both copies) or a distinct checkpoint that happens to be identical (D09 checkpoints, typecheck logs). Removing either copy would break a manifest or change evidence, so **no safe cleanup exists** under the brief's rules (no report rewrites, no blanket compression, no deleting unique provider output, referenced screenshots or manifests). No cache or accidental file is tracked anywhere in the repository. **REPO-13 stays OPEN (audited):** reducing the weight means re-encoding the screenshots (47% of the archive) or moving image evidence out of git, which is a human decision.

## 13. package.json cleanup

| Script | Decision |
| --- | --- |
| `eval:narrators`, `eval:authority`, `eval:shadow-evidence`, `eval:evidence`, `eval:participants` | **REMOVE** (Phase 1M-1P paid evaluations of superseded models; the tools remain in `src/dev/historical/`, runnable with `node .build/src/dev/historical/<name>.js`) |
| `eval:playthrough` | **REMOVE** (deprecated by user decision, section 19; the implementation stays in `src/dev/live/eval-hardening.ts`, which `inspect:turn` also runs) |
| the other 24 | **KEEP**, paths updated; no rename |

30 scripts before, 24 after. `inspect:turn` stays as the supported live diagnostic (`--smoke`, five synthetic cases). `benchmark:controller` stays and is documented. No current tool has a milestone-number npm name. README and Testing list the same commands.

## 14. Structural guards

`tests/dev-tooling-boundaries.test.ts` (6 tests) parses every tracked source file with the TypeScript compiler and resolves imports as paths, including `.build/` specifiers and `fromBuild(...)`:

| # | Guard | Mutation that made it fail |
| --- | --- | --- |
| 1 | production imports nothing from `src/dev/` | `src/app/scenarios.ts` importing `../dev/support/turn-fixture.js` |
| 2 | production imports nothing from `scripts/` | (same test as 1) |
| 3 | tests import dev code only from `support/`, `inspect/`, `benchmark/`, `maintenance/`, two import-safe `live/` modules, and a frozen list of 17 historical modules that may shrink, never grow | a test importing `historical/eval-mannerisms.js` |
| 4 | no npm script runs a historical tool, every npm script names an existing tool, and no active tool imports a historical one | an `x:hist` script; `inspect-time.ts` importing a historical module |
| 5 | every statically known write target of an active tool is under `artifacts/local/` or the OS temp dir (one listed exception: `extract:playthrough` regenerates `tests/playthrough/curated.json`) | `writeFile(join(dir, ...))` with `const dir = join("saves", ...)` |
| 6 | no active tool writes into `docs/evaluations/` (with the B2 isolation test, which also forbids reading it) | (same mechanism as 5) |
| 7 | no source names an absolute checkout path | a `/home/user/Calderan_RPG/...` literal |
| 8 | no active script imports a compiled module whose source is gone | `fromBuild("src/turn/gone-module.js")` |

Write targets the guard cannot resolve (operator arguments, environment) are treated as operator-supplied, which is how `scan-identity-forks --out`, the browser `shotsDir` and the casting-trace output argument work.

## 15. Validation

All on the final working tree, each step logged with its exit code, never two builds at once:

| Step | Result |
| --- | --- |
| `npm run clean`, `typecheck`, `build` | exit 0 |
| `npm test` (clean `.build`) | **3694 / 3694** (3685 − 3 wire-v2 tests + 3 production wire tests + 3 live-support tests + 6 boundary tests) |
| `npm run benchmark:modern` | **55 / 55**, 0 known gaps |
| `npm run check:architecture` | 360 modules, 28 source back edges, **0 runtime back edges** |
| `npm run check:docs` | 0 broken links |
| browser checks (offline, real Chromium) | all 8 exit 0: actual-offer 21/21, block5b 13/13, block6 15/15, block7 19/19, explicit-promotion 13/13, keep-track 15/15, confirmation and turn-reliability (assertion scripts) |
| offline inspectors | `inspect-time`, `inspect-scene-state`, `inspect-context heartstone_lr`, `inspect-search`, `inspect-city`, `item-lifecycle-inspector`, `review-playthrough`, `scan-identity-forks` (empty input) all exit 0 |
| playthrough and retrieval | `node --test .build/tests/playthrough.test.js` and `tests/retrieval-eval/evaluate.js` exit 0 |
| casting trace | `scripts/evaluation/casting-trace.mjs` exit 0 (output in `artifacts/local/`) |
| offline historical tests | `scripts/evaluation/minor-debt-offline-guard.mjs` and `node --test scripts/historical/d09-evidence-artifacts.test.mjs` exit 0 |
| TEST-1 proof | 100 + 50 (under load) + 60 (final tree) focused runs, 0 failures; after the user's acceptance, 200 more on the commit, 0 failures |
| writes during the tool runs | only under `artifacts/local/` (checked with a timestamp sweep of the checkout) |
| `check-doc-links.mjs --all` (historical, never fails) | 24 more broken links than on `26c2be5` (321 vs 297), all in historical reports that link to a moved tool (`src/dev/...`, `scripts/...`) or the deleted shim; no link was fixed and none disappeared. Historical reports are not rewritten; sections 2 and 3 map every old path to its new one |

No live harness, live smoke or image tool was executed.

## 16. Debt closures

| Item | Outcome |
| --- | --- |
| REPO-4 | **CLOSED**: every `src/dev` module classified and grouped; 0 active orphans; guards in place |
| REPO-5 | already closed (Cleanup C) |
| REPO-6 | **CLOSED**: scripts grouped; residual "Playwright is not a devDependency" stays under UI-30 |
| REPO-7 | open, out of scope (avatar PNG weight) |
| REPO-8 | open, out of scope (zero-use exports in production) |
| REPO-9 | **CLOSED** (`deepseek-controller.ts` deleted) |
| REPO-10 | **PARTLY CLOSED**: fixtures grouped in `src/dev/support/`; the move to `tests/support/` goes with the test taxonomy (Cleanup F, TEST-3) |
| REPO-13 | **OPEN, P3, audited** (section 12): no safe reduction; kept as is by user decision |
| TEST-1 | **CLOSED** (test only); production side recorded as UI-31 |
| TEST-4 | **PARTLY CLOSED**: wire-v2 oracle replaced by production assertions; bake-off helpers, Voyage and the OpenRouter image client remain (PRV-7) |
| CI-3 | **CLOSED**: historical npm aliases removed; `eval:playthrough` deprecated and removed from npm; `inspect:turn` supported |
| UI-31 | **OPENED, P3** (cosmetic; deferred to UI polish) |

Not touched by design: TEST-3 (Cleanup F), the lifecycle vocabulary (Cleanup G), AUTH-5, Weather UI, Property.

## 17. Remaining repository debt

REPO-2 residual (typo-named root transcript files), REPO-7, REPO-8, REPO-10 (to `tests/support/`), REPO-13 (archive weight), CI-1 (no CI), TEST-3 (pass- and block-numbered test names, Cleanup F), TEST-4 remainder, UI-30 residual (Playwright dependency), UI-31, DOC-15 (staleness tripwire), and the 17 historical modules still pinned by tests (frozen allowlist in guard 3). Still open for a later decision: rename `minor-debt-cycle-check.mjs` and the `block5b/6/7-browser-check.mjs` files to behavior names.

## 18. Cleanup F handoff

- **Test taxonomy (TEST-3):** rename pass- and block-numbered tests by domain; move `src/dev/support/` to `tests/support/` (REPO-10), which also needs the live tools that import those fixtures repointed.
- **Historical modules under test:** the 17 entries in `TEST_HISTORICAL_ALLOWED` (`tests/dev-tooling-boundaries.test.ts`). For each, keep the unit-tested pure part (move it to support or `tests/`) or archive the test with its harness; the list may only shrink.
- **`tests/pass10-*.ts`:** 12 non-test helper scripts at the `tests/` root that are dev tools in all but location.
- **Guards to keep green:** `tests/dev-tooling-boundaries.test.ts`, `tests/evaluation-history-isolation.test.ts`, `tests/build-discipline.test.ts`.
- The working tree of this block is staged, not committed.

## 19. User decisions (2026-10-13, applied before the commit)

1. **UI-31 stays OPEN, P3.** The proposed patch is not applied. It is a purely cosmetic delay of the portrait progress label, not a production state error; it goes to future UI/polish work.
2. **REPO-13 stays OPEN, P3.** No image re-encoding, no evidence moved out of git, no deletion of duplicates that historical provenance cites. The Cleanup E audit found no safe reduction.
3. **CI-3: `eval:playthrough` is deprecated and `inspect:turn` stays supported.** The `eval:playthrough` npm script is removed (24 scripts). Its implementation is useful and shared, so it is preserved in place: `src/dev/live/eval-hardening.ts` runs `inspect:turn` with `--smoke`, and its deprecated curated-fixture and narrative modes still run directly (`node .build/src/dev/live/eval-hardening.js [--count n | --narrative]`). `docs/architecture/TURN_COORDINATOR.md`, Testing, README and the debt register say the same. CI-3 is closed.
