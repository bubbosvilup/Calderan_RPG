# Next test and CI hardening review

Status: Review (planning only). Date: 2026-10-13. Tree: main `7e5e4ea` (Repository Cleanup G) plus the uncommitted post-cleanup documentation reconciliation. Scope: re-evaluate CI-1, TEST-2, TEST-4, TEST-5, TEST-6, TEST-7 and TEST-8, collect the test debt found by the [post-cleanup audit](POST_CLEANUP_REPOSITORY_AUDIT.md), and recommend a CI gate matrix. Nothing was implemented. No CI file was written, no test was changed, and no command that builds, tests or writes into the repository was run. Every claim below comes from reading the current code, tests and scripts, and gives file:line evidence. Run results (3701 tests, benchmark 55/55, 0 runtime cycles, 0 broken links, 8 browser checks) are the ones recorded by the post-cleanup audit (`POST_CLEANUP_REPOSITORY_AUDIT.md:19-32`); this review did not re-run them. Anything not confirmed by reading is marked *inferred*.

External behavior of GitHub Actions, npm, Playwright and the Node.js test runner is taken only from official documentation, with the limits stated in [section 7](#7-external-documentation-consulted). The session's egress policy refused direct fetches of `docs.github.com`, `playwright.dev` and `docs.npmjs.com` (HTTP 403 on CONNECT), so for those sites only search-result excerpts of the official pages were available. `nodejs.org` was reachable and its v22 pages were read in full.

## 1. Summary

| ID | Register | Verdict now | Sev | One line |
| --- | --- | --- | --- | --- |
| CI-1 | OPEN | CONFIRMED OPEN | P2 | No `.github/`, no CI of any kind, no lint, formatter or coverage; every gate exists only as a local command. |
| TEST-2 | OPEN | CONFIRMED OPEN, re-counted | P3 | About 20 test files outside `tests/architecture/` read `src/` text (the register says 17); 7 of them load `src/ui/client.js` into a VM by design; one pins source files by SHA-256. |
| TEST-4 | PARTIAL | CONFIRMED PARTIAL | P3 | The OpenRouter image client is imported only by its own test; Voyage and the bake-off helpers are dev-only. Still waits on the D8 / D13 execution (PRV-7). |
| TEST-5 | OPEN | CONFIRMED OPEN, low risk | P3 | Three real waits (80 ms, 20 ms, 20 ms); none can cause a false failure, one makes an assertion that cannot fail. The larger CI risk is three wall-clock performance budgets (new TEST-12). |
| TEST-6 | PARTIAL | CONFIRMED PARTIAL, re-scoped | P2 | Older-save fixtures, malformed bodies, companion persistence, save-format / movement properties and a performance guard are still missing; the "true concurrent double accept" item needs re-scoping because Accept is synchronous. |
| TEST-7 | OPEN | CONFIRMED OPEN | P3 | No recorded-provider replay layer; `createProductionDeps` is exercised only with fake `fetch` or with credentials removed. |
| TEST-8 | OPEN | CONFIRMED OPEN, re-scoped | P3 | Timing was never measured. The premise "no deps in the sandbox" is obsolete. Measuring is the first step of any CI plan. |

Key findings of this review, beyond the register:

1. **Two of the eight browser checks cannot fail on a wrong result.** `scripts/browser/turn-reliability-browser-check.mjs:35-49` and `scripts/browser/confirmation-browser-check.mjs:27-68` collect their observations into an object and print it as JSON. They set no exit code from those values. They exit non-zero only when Playwright throws (a selector timeout, for example). "All 8 exit 0" therefore proves that these two ran, not that they passed. The other six set `process.exit(fails.length ? 1 : 0)` or `process.exitCode` from their PASS / FAIL list (for example `actual-offer-browser-check.mjs:144`, `block7-browser-check.mjs:151`). This must be fixed before a browser gate means anything (proposed TEST-9).
2. **`npm test` already contains the benchmark and the playthrough replay.** `tests/tooling/modern-benchmark.test.ts:12-30` runs all 55 scenarios as tests, and `tests/tooling/playthrough-replay.test.ts` is inside the `npm test` glob. `npm run benchmark:modern` and `npm run test:playthrough` re-run the same code and each rebuilds first (`package.json`: `npm run build --silent && ...`). A CI job should build once and call the compiled entry points.
3. **`npm test` needs a git work tree.** Four architecture guards call `git ls-files` with no fallback (`tests/architecture/test-taxonomy.architecture.test.ts:12`, `dev-tooling-boundaries.architecture.test.ts:18`, `evaluation-history-isolation.architecture.test.ts:23`, `lifecycle-vocabulary.architecture.test.ts:13`); only `tests/tooling/build-discipline.test.ts:54` skips when git is missing. `npm run check:docs` also uses `git ls-files` (`scripts/check-doc-links.mjs:16`). CI must run on a git checkout, not on a source archive.
4. **A real older-schema save already exists in committed evidence.** `docs/evaluations/item-sprite-smoke-assets/turn_fixture/save.json` and its backup `backups/r00000004-20261009T211218268Z.json` are envelope schema 5 with snapshot schema 6 (current is 8, `src/persistence/save-migrations.ts:5`). `docs/evaluations/consolidation_block7_live/saves_a/turn_fixture/save.json` is a real schema 8 save with its optional side store. With approval, these could be copied into `tests/fixtures/` under the Cleanup B2 provenance rule, which would close the "real older-schema fixture" part of TEST-6 and PER-4 without inventing data.
5. **One test suite writes into the repository's runtime save root.** `tests/context/context-budget.test.ts:23,35,53,61` builds `FileCampaignRepository` on the repo-relative `saves/d04-context/...`; the lifecycle test saves and reloads there (`:58-61`). Every other persistence test uses `mkdtemp` (82 uses). In a fresh CI checkout this is harmless; in a developer checkout it leaves state between runs (a local `saves/d04-context/` exists). Proposed TEST-11.
6. **The test-runner flags that CI would need exist in Node 22**, with one caution: code coverage is still *Experimental* (Stability 1) in the Node 22 documentation, and the suite runs compiled `.build` JavaScript with no source maps (`tsconfig.json` has no `sourceMap`). Coverage should start as a nightly report, never a PR threshold.
7. **Secrets hygiene matters even for offline jobs.** `npm run eval:retrieval` switches to the live Voyage provider when `VOYAGE_API_KEY` is set (`tests/retrieval-eval/evaluate.ts:63-67`). Offline jobs must not receive provider secrets. The official GitHub documentation excerpts say fork pull requests receive no repository secrets except a read-only `GITHUB_TOKEN`.

## 2. Current baseline

### 2.1 What exists today

| Gate | Command | Needs | Fails on | Notes |
| --- | --- | --- | --- | --- |
| Install | `npm ci` (not scripted) | `package-lock.json` (lockfileVersion 3) | lockfile mismatch | Runtime dep `yaml`; dev deps `typescript`, `@types/node` only (`package.json`). |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | `node_modules` | any type error | Covers `src/**/*.ts` and `tests/**/*.ts` (`tsconfig.json:14`); `scripts/**/*.mjs` is not checked. Strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`; no `noUnusedLocals` (REPO-8). |
| Build | `npm run build` | `node_modules` | compile error | Cleans `.build` first (`scripts/clean.mjs`). |
| Unit to integration | `npm test` | build, git work tree, `data/` | any failing test | 227 files in 21 domain folders, 3701 cases (audit). `node --test ".build/tests/**/*.test.js"`. |
| Benchmark | `npm run benchmark:modern` | build | a FAIL verdict (`tests/benchmark/run.ts:9`) | 55 deterministic scenarios; also inside `npm test`. Prints per-scenario ms (`tests/benchmark/runner.ts:25`), no budget. |
| Architecture | `npm run check:architecture` | `typescript` | a runtime import cycle (`scripts/minor-debt-cycle-check.mjs:53-54`) | Reads `src/` relative to cwd; type-only cycles are reported, not fatal (ARCH-3). No build needed. |
| Docs | `npm run check:docs` | git | a broken relative link in current docs | `--all` reports historical links, never fails. Does not check paths written in backticks (see TEST-15). |
| Playthrough | `npm run test:playthrough` | build | failing replay | Duplicate of one file already in `npm test`. |
| Retrieval eval | `npm run eval:retrieval` | build | an exception only | A report: lexical metrics, no threshold. Live Voyage when `VOYAGE_API_KEY` is set. |
| Browser | `node scripts/browser/<name>-browser-check.mjs` | build, Playwright, Chromium | 6 of 8: a failed check; 2 of 8: only a thrown error | Not in `npm test`. Playwright resolved from `PLAYWRIGHT_MODULE` or the `playwright` package (`scripts/lib/browser-env.mjs:26-34`), Chromium from Playwright or `CHROMIUM_PATH` (`:37-40`), launched with `--no-sandbox`. |
| Live | `src/dev/live/*`, `inspect:turn`, `benchmark:controller`, `scripts/evaluation/*-live-smoke.mjs` | provider keys | per harness | Spend credits ([TESTING.md](../TESTING.md), "Tools that can spend credits"). |

There is no `.github/` directory and no other CI configuration (`.gitlab-ci.yml`, CircleCI, Azure, Jenkins), no `.nvmrc`, no ESLint or Prettier configuration and no `.gitattributes` in the tree (verified by listing the root and `git ls-files`).

### 2.2 Environment facts a CI job must reproduce

- **Node.** `engines.node >=22` and `@types/node ^22.20.4` (`package.json`). The sandbox runs v22.22.0. CI should pin Node 22 (the floor). A second, newer major belongs in the nightly tier, and only if the author wants to claim it (decision C2 in section 6).
- **Working directory.** Many tests read repository-relative paths (`readFile("src/ui/client.js")` in `tests/ui/play-client.test.ts:93`, `data/` loaders), and `check:architecture` walks `src` relative to cwd. Running through `npm run` from the root satisfies this.
- **Git.** Required by `npm test` and `check:docs` (finding 3).
- **Playwright.** Not in `package.json` or the lockfile (REPO-14). The sandbox supplies Playwright 1.56.1 from `NODE_PATH=/usr/local/lib/node_modules_global` and browsers from `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (`chromium-1194`, `chromium_headless_shell-1194`), with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. A CI runner has none of this, so the browser tier cannot exist until Playwright is a declared, pinned devDependency.
- **No network guard in `npm test`.** The offline guarantee rests on test design: providers are injected or `fetch` is stubbed, and the credential test removes `OPENROUTER_API_KEY` before it runs (`tests/session/application-smoke.integration.test.ts:252-262`). The existing guard `scripts/evaluation/minor-debt-offline-guard.mjs:6-8` replaces `fetch`, `http.request` and `net.connect` wholesale, so it would also block the loopback HTTP tests (for example `tests/commerce/actual-offer.test.ts:432-450`); it cannot wrap `npm test` as it is (*inferred*). The practical guard in CI is to give offline jobs no provider secrets.
- **One run per checkout.** [TESTING.md](../TESTING.md) says never to run two builds or test runs at the same time in one checkout, because each build deletes `.build`. Inside one CI job the steps must stay sequential. Separate jobs have separate checkouts.

## 3. Register rows re-evaluated

### CI-1 (P2): no CI, lint, formatter, coverage or browser runner

**Verdict: CONFIRMED OPEN.** No workflow exists. Two gates that Cleanup A and B added (`check:architecture`, `check:docs`) are run by hand only (A9 row CI-1, `post_cleanup_audit/A9_REGISTER_RECONCILIATION.md:181`). The "build never cleans" half is closed (CI-2).

What CI-1 should now mean, in order:

1. A FAST PR workflow (section 5) running `npm ci`, typecheck, the two static checks and `npm test` on Node 22, on every pull request and push to `main`.
2. A FULL PR tier adding the readable benchmark report and the browser checks, after TEST-9 and the Playwright dependency (REPO-14).
3. A nightly tier for coverage, timing, repeat runs and the deep suites of TEST-6.
4. A manual live-certification workflow behind a protected environment.

Lint and formatter stay optional, as the register says ("only if wanted"). Adding ESLint or Prettier would be a new dev dependency and a repository-wide reformat. That is a separate decision (C4) and is not needed for CI-1 to close. A cheaper static step is `node --check` over `scripts/**/*.mjs`, because those files are neither type-checked (`tsconfig.json:14`) nor imported by tests. It catches syntax errors only, not the dead field of REPO-14 (`scripts/evaluation/casting-trace.mjs:76`).

### TEST-2 (P3): tests that read source text

**Verdict: CONFIRMED OPEN, count re-derived.** A static grep for tests outside `tests/architecture/` that read `src/` files as text finds about 20 files (the exact number depends on what counts; the register's 17 was not re-derived by A9). They fall into three groups with different CI relevance:

| Group | Files (examples, file:line) | Assessment |
| --- | --- | --- |
| A. Load the browser client into a VM | `tests/ui/play-client.test.ts:93`, `tests/ui/ui-playtest.test.ts:123`, `tests/ui/actual-offer-card.test.ts:39`, `tests/ui/confirmation-card.test.ts:50`, `tests/ui/campaign-screens.test.ts:46`, `tests/providers/narrator-alternatives.test.ts:134`, `tests/session/player-character-profile.test.ts:371` (7 files) | Deliberate: this is how the client is executed without a browser. Not debt. |
| B. Structural pins on source text | `tests/turn/turn-stages.test.ts:129-133`, `tests/movement/movement-narration-facts.test.ts:190-195,257`, `tests/commerce/commerce-narration-facts.test.ts:88-103`, `tests/authority/manumission-confirmation.integration.test.ts:290,363-372`, `tests/authority/explicit-character-materialization.test.ts:148-151`, `tests/items/item-lifecycle.test.ts:135`, `tests/world/calendar-climate-weather.test.ts:108,257`, `tests/optional/optional-store-domains.test.ts:151-162`, `tests/images/canon-avatars.test.ts:92-96`, `tests/images/player-visuals.test.ts:199-214`, `tests/ui/play-client.test.ts:1023`, `tests/reflection/post-turn-reflection-maintenance.test.ts:75`, `tests/identity/keep-track.test.ts:211` | Architecture guards that live outside the guard suite. Deterministic, so no CI flake, but a refactor fails them for reasons unrelated to behavior. Move them into `tests/architecture/` when a block touches them, or replace them with behavioral tests. |
| C. Byte hash pins | `tests/context/rpg-format-contract.test.ts:29-41` pins the SHA-256 of three files: `src/app/provider-config.ts`, the narrator adapter in `src/llm/openrouter/` and `src/llm/openrouter/client.ts` | The strongest form of TEST-2: any edit, including a comment, fails it. It hashes raw bytes, and the repository has no `.gitattributes`, so a Windows checkout with CRLF conversion would fail it (*inferred*, not run). [TESTING.md](../TESTING.md) says the commands work "on Windows and Linux alike", so this matters if a Windows CI job is ever wanted (decision C2). |

Recommendation (unchanged in spirit): group B to the guard suite over time; group C either replaced by a behavioral wire-shape test or protected with an `eol=lf` attribute rule. No CI blocker.

### TEST-4 (P3): stale tests for parked architecture

**Verdict: CONFIRMED PARTIAL.** The files exist: `tests/images/openrouter-image-client.test.ts` (3 tests), `tests/retrieval/voyage-embedding-provider.test.ts` (7), `tests/tooling/compaction-bakeoff.test.ts` (5), `tests/tooling/controller-bakeoff-metrics.test.ts` (7), `tests/tooling/narrator-bakeoff.test.ts` (14). `src/llm/openrouter/image-client.ts` has no importer in `src/`; production builds the image client from `src/llm/huggingface/fal-image-client.ts` (`src/app/production.ts:26`). The Voyage provider is imported only by `src/dev/support/embedding-configuration.ts:2` and `src/dev/inspect/inspect-embedding.ts:1`. The bake-off tests pin `src/dev/historical/` modules. Their CI cost is small and they are offline. The row still waits on the author's execution of D8 / D13 (remove the image client, park Voyage), which A9 lists as an open question. No CI action.

### TEST-5 (P3): real wall-clock waits

**Verdict: CONFIRMED OPEN, low risk.** The three waits the A9 audit found are the only ones in the executable tests:

| Site | Wait | What the assertion needs | Risk |
| --- | --- | --- | --- |
| `tests/persistence/save-format-and-assets.test.ts:186-187` | 80 ms for a lock heartbeat of 20 ms | asserts the new mtime is `>=` the first | The assertion cannot fail: equal mtimes pass. It cannot detect a missing heartbeat. Weak test, not a flake. |
| `tests/session/application-smoke.integration.test.ts:166` | 20 ms before awaiting the turn | nothing after the wait depends on time | Latency only. |
| `tests/session/application-smoke.integration.test.ts:238` | 20 ms, then asserts `running_turn` | `submitPlayerInput` sets `running_turn` synchronously before its first await (`src/app/game-session.ts:990-991`) | Latency only; the wait is unnecessary. |

The more relevant timing risk for CI is three hard wall-clock budgets, which TEST-5 does not list (proposed TEST-12): `tests/world/calendar-climate-weather.test.ts:111` (`< 200` ms), `:206` (`< 2000` ms) and `tests/items/item-intent-and-weather-seam.test.ts:212` (`< 4000` ms). By default `node --test` runs `os.availableParallelism() - 1` test files at once (Node 22 CLI docs), so on a small shared runner the 200 ms budget is the most likely to fail (*inferred*). Recommendation: keep the bounded-work intent, but measure the work (counts of blocks touched) rather than milliseconds, or move the millisecond budgets to the nightly performance report.

### TEST-6 (P2): weak coverage

**Verdict: CONFIRMED PARTIAL, re-scoped item by item.**

| Item | Today (evidence) | Verdict |
| --- | --- | --- |
| True concurrent double Accept | `GameSession.acceptTradeOffer` is synchronous (`src/app/game-session.ts:560-583`), so two accepts in one process cannot interleave. Sequential double Accept is tested in four places: `tests/commerce/person-offer-playthrough.regression.test.ts:114-125`, `tests/commerce/commerce-integrity.test.ts:82`, `tests/commerce/actual-offer.test.ts:103` and over HTTP (second Accept is 422) at `actual-offer.test.ts:432-450`. Concurrent turns and same-key turns are tested (`tests/turn/turn-coordinator.test.ts:147`, `tests/session/turn-request-identity.test.ts:50-55`, `tests/authority/manumission-confirmation.integration.test.ts:346-355`). | Re-scope. What is left is two in-flight HTTP POSTs to `/api/trade/accept` (one 200, one refusal, one debit) and two processes on one save directory, which is covered only at repository level by the lock tests (`tests/persistence/save-format-and-assets.test.ts:161-188`). |
| Accept after loading an older autosave | Accept after save and load is covered (`tests/commerce/actual-offer.test.ts:169-184`, G16). No test loads an older backup slot in which the offer is still active after a later save accepted it (not found by grep). | Open (narrow). The test should state the intended rollback semantics (re-accepting on a rolled-back campaign is a fresh settlement). |
| N companions move and persist across save/load | Benchmark M2 moves two companions; no movement scenario has a `save_reload` step (the four `save_reload` uses are in K3, K4, K9 and S1, `tests/benchmark/scenarios.ts:129-219`). `tests/movement/character-locations.test.ts:27` saves and loads one NPC over 20 turns. | Open. A benchmark scenario (group move, save_reload, move again, no duplicates) fits the existing format. |
| Real older-schema save fixtures | Every legacy save in tests is derived from a current snapshot by stripping fields (`tests/persistence/save-migration-hardening.test.ts:17-23`; `tests/support/raw-save.ts` rewrites into the pre-block-7 shape). `tests/fixtures/` holds no save file. Real v5 / snapshot 6 and v8 saves exist in committed evidence (finding 4). | Open, with a ready source of real data. Copying needs approval and a provenance entry. |
| Real-browser behaviour | Eight offline Playwright checks exist, outside `npm test` and outside any CI; two are report-only (finding 1). | Partial. Needs TEST-9 and REPO-14 before it can be a gate. |
| Malformed POST bodies on `/api/trade/accept` and `/api/location` | The server rejects a wrong content type (415, `src/ui/server.ts:114`), a body over 24,000 bytes (413, `:116-121`), unparseable JSON (400, `:123`), and for `/api/location` a missing or mistyped `target` / `expected_revision` (400, `:143-146`). Only the 415 branch is tested, and only on a confirmation route (`tests/ui/confirmation-card.test.ts:153-154`). Wrong-typed fields on the other routes are tested through stale / unknown refs (for example `tests/identity/keep-track.test.ts:197-198`). | Open. A table-driven matrix (route × {wrong content type, oversize, invalid JSON, `null`, array, string, wrong field types}) asserting status and "no revision change" would cover every POST route at once. Note: the content-type check is an exact string compare, so `application/json; charset=utf-8` is refused with 415 today; the matrix should pin whichever behavior the author intends. |
| Property tests for `save-format` and `character-movement` | Seeded-PRNG property tests exist for the campaign core and routes (`tests/turn/core-state-properties.test.ts:12-16,24-172`; no external dependency, reproducible). No generated test for save decoding (mutated or truncated JSON) or for movement was found. Fixed tamper lists exist (`tests/persistence/premium-state-tamper.test.ts`, `save-migration-hardening.test.ts:95-135`). | Open. Extend the same seeded-PRNG pattern; no new dependency. |
| Performance regression guard | Three wall-clock budgets (TEST-12); the benchmark prints per-scenario ms with no budget; no scale fixture (see section 4.15). | Open. |

### TEST-7 (P3): no recorded-provider layer

**Verdict: CONFIRMED OPEN.** Seven test files import `createProductionDeps` (for example `tests/session/application-smoke.integration.test.ts:255`, `tests/reflection/reflection-shadow-mode.test.ts:20-25`, `tests/optional/optional-service-registry.test.ts:62`); each either stubs `fetch` or runs without credentials and asserts fail-closed behavior. Real prompt wording, provider JSON, streaming and fallback order are checked only against fake `fetch` (`tests/providers/*`). The pieces for an L2 layer exist: `src/dev/live/support.ts:39-42` exports an OpenRouter wire recorder (`recordOpenRouterWire`), and live harness evidence is committed under `docs/evaluations/*live*`. Building L2 (request-hash keyed replay, "re-record" on prompt change, register section 14) is a product of its own, not a CI step. In the gate matrix it would join FULL PR once it exists.

### TEST-8 (P3): test timing not measured

**Verdict: CONFIRMED OPEN, re-scoped.** Dependencies exist now (`node_modules/` holds `typescript`, `@types`, `undici-types`, `yaml`), so the original premise is obsolete (A9 `:187`). This review could not measure because it is read-only. Measuring is the precondition for the FAST / FULL split: if `npm test` is a few minutes on a standard runner, FAST PR runs it whole; if not, it is sharded. The Node 22 runner reports `duration_ms` per test to reporters and has a `junit` reporter, so a nightly job can publish per-file timings without new code (section 7).

### New test debt from the post-cleanup audit

| Item | Source | Test / CI aspect |
| --- | --- | --- |
| REPO-14 (P3), Playwright | `POST_CLEANUP_REPOSITORY_AUDIT.md:123` | The browser tier depends on it. Declaring `playwright` as a pinned devDependency is the smallest step; the official image or `install --with-deps` must use the same version (section 7). |
| REPO-14 (P3), milestone-named scripts | `POST_CLEANUP_REPOSITORY_AUDIT.md:124` | CI job names will cite `block5b-`, `block6-`, `block7-browser-check.mjs` and `minor-debt-cycle-check.mjs`. Renaming them by behavior before CI is written avoids renaming CI steps later. |
| AUD-1 (P2) | register `MASTER_DEBT_REGISTER.md:251` | "Reproduce with a focused test first." Pure test work, offline. Path correction: the plan lives in `src/turn/commerce/person-offers.ts`, not `src/commerce/person-offers.ts`; `claimsReservedHandle` is applied only in `src/turn/identity/name-establishment.ts:47` and `src/turn/identity/keep-track.ts:110`. |
| TEST-5 pointers | A9 `:184,238` | Already corrected in the register (section 1A.4). |

### New items found by this review (proposed IDs, to be assigned at the next register reconciliation)

| Proposed ID | Sev | Finding | Evidence | Action (needs approval) |
| --- | --- | --- | --- | --- |
| TEST-9 | P3, blocks the browser gate | Two browser checks are report-only: they print JSON and never fail on wrong values | `scripts/browser/turn-reliability-browser-check.mjs:35-49`, `scripts/browser/confirmation-browser-check.mjs:27-68` | Turn the printed expectations into PASS / FAIL checks with an exit code, as the other six do. Same offline scripts, no behavior change. |
| TEST-10 | P3 | `npm test` and `check:docs` need a git work tree, and four guards throw without one | finding 3 | Document it in [TESTING.md](../TESTING.md); CI uses a git checkout. |
| TEST-11 | P3 | `tests/context/context-budget.test.ts` writes saves into the repo's `saves/d04-context/` | `:23,35,53,61` | Use `mkdtemp`, as the rest of the suite does. |
| TEST-12 | P3 | Hard wall-clock budgets in three tests | `tests/world/calendar-climate-weather.test.ts:111,206`, `tests/items/item-intent-and-weather-seam.test.ts:212` | Assert bounded work instead of milliseconds, or move the budgets to the nightly report. |
| TEST-13 | P3 | The benchmark format gate caps the scenario count at 60 (55 today) | `tests/tooling/modern-benchmark.test.ts:23` | Raise the cap deliberately or keep scale scenarios in a separate deep set; decide before the 100-turn campaign is added. |
| TEST-14 | P3 | `scripts/**/*.mjs` (49 files) are neither type-checked nor syntax-checked; browser checks import `.build` modules by path (`fromBuild`, `scripts/lib/browser-env.mjs:19`), so a rename in `src/` breaks them silently until someone runs them | `tsconfig.json:14` | `node --check` in FAST PR; the browser checks themselves in FULL PR. |
| TEST-15 | P3 (DOC-15 residual) | [TESTING.md](../TESTING.md) is stale in two places that `check:docs` cannot see, because the paths are in backticks: "Browser QA" says three Playwright checks exist and their paths are environment-specific (eight exist; paths are portable since Cleanup A); "Consolidation block suites" names `tests/reflection-{v2,...,wire-v2,...}.test.ts`, which no longer exist (they are `tests/reflection/reflection-v2-oracle.test.ts` and so on; wire-v2 was deleted in Cleanup E) | `docs/TESTING.md` "Browser QA" and "Consolidation block suites" | Fix the two paragraphs; optionally extend `check:docs` to verify backticked repository paths in current docs (the DOC-15 tripwire). |

## 4. Focus areas

### 4.1 CI pipeline

None exists (CI-1). The recommended shape is four workflows or four job groups of one workflow (section 5). Use a concurrency group with cancel-in-progress for PR runs so that a new push cancels the older run on the same branch; the GitHub excerpts confirm the `concurrency` key with `group` and `cancel-in-progress`, and warn that group names must be unique across workflows (include the workflow name).

### 4.2 npm ci

`npm ci` is the right install: the official npm excerpts say it requires an existing lockfile, fails instead of rewriting when `package.json` and the lockfile disagree, deletes `node_modules` first and never edits the manifests. The lockfile is consistent (register section 13.2). The GitHub excerpts show the standard order: checkout, set up Node, `npm ci`, build, test, with optional npm caching through the setup action. Only three packages are installed today, so caching gains little until Playwright is added; the browsers themselves should not be cached (section 7).

### 4.3 Typecheck

`npm run typecheck` covers `src/` and `tests/`, including `src/dev/historical/` and `tests/frozen/`, which keeps historical tools from rotting silently (REPO-4 note). It is cheap and belongs in FAST PR. `noUnusedLocals` is not on; enabling it first needs REPO-8 (five unused locals in production), so it is not a CI precondition.

### 4.4 Build

`npm run build` cleans and compiles everything to `.build`. `npm test` runs it, so FAST PR should not call build separately. For FULL PR, build once and then run `node --test`, `node .build/tests/benchmark/run.js` and the browser checks against that one build; calling `npm run benchmark:modern` after `npm test` would rebuild and re-run the scenarios a second time.

### 4.5 Test

`npm test` is the main gate. Facts that matter for CI: each test file runs in its own child process and a non-zero exit fails it; up to `availableParallelism() - 1` files run at once; when stdout is not a TTY the default reporter is TAP; `--test-reporter` can be given several times with matching `--test-reporter-destination` (for example spec to stdout and junit to a file); `--test-shard=<i>/<n>` splits the files; `--test-timeout` defaults to Infinity (Node 22 docs, section 7). Changing the reporter or adding a timeout means changing the `test` script or calling `node --test` directly in CI; that is a small `package.json` decision (C3).

### 4.6 Benchmark

The benchmark runs inside `npm test` (55 tests plus 5 format-gate tests, `tests/tooling/modern-benchmark.test.ts:12-30`) and as a report (`tests/benchmark/run.ts`). In CI the `npm test` run is the gate; the report (with per-scenario ms) is an artifact for FULL PR and a timing trend for nightly. The 60-scenario cap (TEST-13) and the absence of a time budget are the open points.

### 4.7 Docs check

`npm run check:docs` is fast, read-only, needs git, and fails on a broken link in current documentation. FAST PR. `--all` never fails and is a nightly report at most. It does not see backticked paths (TEST-15).

### 4.8 Architecture check

`npm run check:architecture` needs only `typescript` and the sources, fails on a runtime cycle, and reports type-only cycles (ARCH-3) without failing. FAST PR. It accepts an optional output path (`scripts/minor-debt-cycle-check.mjs:51`), which a nightly job could use to archive the graph fingerprint.

### 4.9 Browser checks

Eight offline checks with scripted providers and a private temp server. Preconditions before they can gate: TEST-9 (two report-only checks), REPO-14 (pinned Playwright), and a Chromium install in CI. The official Playwright excerpts give two supported ways: `npx playwright install --with-deps` after `npm ci` (Chromium only is enough here, and a headless-shell-only install is possible), or the official Docker image pinned to the same Playwright version as the project, since a version mismatch means Playwright cannot find its browsers. They advise against caching browser binaries. The checks pass `--no-sandbox` (`scripts/lib/browser-env.mjs:40`), which suits container runners. Screenshots go to `artifacts/local/browser/<check>/` and should be uploaded as job artifacts. Tier: FULL PR (required before merge) once the preconditions hold; they need the build, so they run after `npm test` in the same job, never in parallel with another build in that checkout.

### 4.10 Coverage

Not measured today. Node 22 supports `--experimental-test-coverage` with `spec`, `tap` and `lcov` output and, from v22.8.0, `--test-coverage-lines`, `--test-coverage-branches` and `--test-coverage-functions` thresholds that exit with code 1; `--test-coverage-include` and `--test-coverage-exclude` take globs (v22.5.0). All of these are marked Experimental. The suite runs compiled `.build` JavaScript and the build emits no source maps, so line numbers would refer to compiled files; mapping back to TypeScript was not confirmed from the documentation read. Recommendation: a nightly lcov report over `.build/src/**` excluding `.build/src/dev/**` and `.build/tests/**`, no threshold. A PR threshold is a later decision, once the numbers are known and stable.

### 4.11 Fuzzing

There is no fuzzing and no property-testing dependency. The suite already uses a seeded linear congruential PRNG with fixed seeds (`tests/turn/core-state-properties.test.ts:16`), which keeps every run reproducible. The natural next targets are the three trust boundaries: save decoding (mutated, truncated and reordered JSON must fail closed with a typed error and never partially restore), the HTTP POST surface (the malformed-body matrix of TEST-6), and the turn input (seeded player strings through the scripted pipeline must never change state without authority). Small fixed-seed sets belong in `npm test`; large seed counts belong in nightly, where the seed is printed so a failure can be replayed.

### 4.12 Concurrency

In-process concurrency is well covered for turns (same campaign refused, same `turn_key` runs once) and pending confirmations (section 3, TEST-6). Accept is synchronous, so the meaningful remaining tests are two in-flight HTTP requests and two processes on one save directory. The cross-process case needs two Node processes and real file locks; it fits nightly better than `npm test`. Repeat runs under load (for example the whole suite three times at a raised `--test-concurrency`) are also nightly; that is how TEST-1 was finally reproduced (150 focused runs, register TEST-1).

### 4.13 Older-save migration fixtures

Migration logic is tested thoroughly with synthetic inputs (`tests/persistence/save-migration-hardening.test.ts:17-135`, the optional-store matrix in `tests/optional/optional-store-migration.test.ts`). What is missing is a real save written by older code. Two real candidates are in committed evidence (finding 4). Under the Cleanup B2 rule, a fixture is a byte-identical copy into `tests/fixtures/` with its source and SHA-256 in `tests/fixtures/provenance.json`; nothing may read `docs/evaluations/` directly (`tests/architecture/evaluation-history-isolation.architecture.test.ts`). The test would load each fixture through the real repository, assert the migrated schema 8 snapshot, and assert a stable digest of the key domains. This also serves PER-4 (unified migration chain) and should be in `npm test` (small, offline).

### 4.14 Malformed HTTP / body tests

See TEST-6. The server's guard order is clear (`src/ui/server.ts:113-146`): method and route, exact content type, size limit, JSON parse, campaign routes, open session, then per-route field checks. A single table-driven test over every POST route (there are about 20 in the route list at `:113`) asserting the status code and an unchanged revision would cover the whole surface in `npm test`. Origin checks (403) are already tested (`tests/ui/confirmation-card.test.ts:155-156`, `tests/ui/ui-playtest.test.ts:80`).

### 4.15 Scale fixtures

No test builds a campaign near the save cap (`MAX_SAVE_BYTES`, enforced in `src/persistence/filesystem.ts:34-39`; PER-1) or with many accumulated trade offers (TRD-12). The largest generated sets are 160 people in a scene projection (`tests/context/scene-state-projection.test.ts:158`) and 400 items in an intent test (`tests/items/item-intent-and-weather-seam.test.ts:207-208`). A seeded generator for a large campaign (hundreds of characters, items, offers and transcript turns) would serve three purposes: a save-size trend (PER-1), decode and restore time, and the UI visual audit the roadmap asks for (T-UI, "a seeded 20+ character / 300-item campaign"). It belongs in nightly, with its numbers reported, not asserted, until budgets are agreed.

## 5. Recommended CI gate matrix

The tiers follow the brief: FAST PR, FULL PR, NIGHTLY / DEEP (one tier) and LIVE CERTIFICATION. Nothing here is implemented, and each step that changes the repository needs the author's approval first.

| | FAST PR | FULL PR | NIGHTLY / DEEP | LIVE CERTIFICATION |
| --- | --- | --- | --- | --- |
| Trigger | every PR push; push to `main` | before merge (PR ready for review, or a merge-queue / required check), and on `main` | schedule (UTC, default branch) plus manual dispatch | manual dispatch only |
| Secrets | none | none | none | provider keys as environment secrets behind required reviewers |
| Network | npm registry only | npm registry, Playwright browser download (or the official image) | same as FULL | providers |
| Node | 22 | 22 | 22, plus a newer major if the author claims it (C2) | 22 |
| Install | `npm ci` | `npm ci`; Playwright Chromium | as FULL | `npm ci` |
| Static | typecheck, `check:architecture`, `check:docs`, `node --check scripts/**/*.mjs` (TEST-14) | same | same, plus `check:docs --all` report, architecture graph archive | none |
| Tests | `npm test` (includes the 55-scenario benchmark and the playthrough replay); shard only if TEST-8 shows it is needed | `npm test` with a junit report artifact | `npm test` repeated (for example 3 times, raised concurrency) for flake detection | none |
| Benchmark | inside `npm test` | `node .build/tests/benchmark/run.js` report artifact (same build) | timing trend from the report | none |
| Browser | none | the 8 checks after TEST-9 and REPO-14; screenshots as artifacts | same | none |
| Coverage | none | none | `--experimental-test-coverage` lcov report, no threshold | none |
| Deep suites | none | none | large seed counts for property and fuzz tests; cross-process lock test; scale fixtures; older-save fixture matrix if it grows; `eval:retrieval` lexical report with `VOYAGE_API_KEY` unset | none |
| Live | never | never | never | `src/dev/live/*` harnesses, `inspect:turn`, `benchmark:controller`, the `scripts/evaluation/*-live-smoke.mjs` smokes, one attempt each with the single transient retry (`src/dev/live/support.ts:11,21`) |
| Output | pass / fail | junit, benchmark report, screenshots | reports and trends; a failure opens an issue or notifies, it does not block a PR | evidence in `artifacts/local/evaluations/` uploaded as artifacts; copied into `docs/evaluations/` only by a deliberate human step |
| Blocking | required | required for merge | not blocking | not blocking; a certification verdict is a human reading |

Notes per tier:

- **FAST PR.** Everything in it is offline, deterministic and needs no new dependency. It can be written today. The only unknown is its duration (TEST-8). The order is cheapest first: typecheck and the two static checks fail in seconds, `npm test` last.
- **FULL PR.** Blocked on TEST-9 (report-only browser checks) and REPO-14 (Playwright not declared). Before then, FULL PR equals FAST PR plus the benchmark report and the junit artifact. When the TEST-7 recorded-provider layer exists, its replay belongs here, because it is offline and deterministic by design.
- **NIGHTLY / DEEP.** Its purpose is to find what PR gates cannot afford: flakes (repeat runs), slow drift (timing, save size), and rare inputs (large seed counts). Per the GitHub excerpts, scheduled runs use the latest commit on the default branch, run in UTC, and can be delayed under load, and a scheduled workflow can stop running while still enabled, so the nightly job should also be runnable by hand. A Windows job, if wanted, belongs here first (C2; TEST-2 group C).
- **LIVE CERTIFICATION.** Spends credits and calls external models, so it must never run on a PR or a schedule without an explicit decision. The GitHub excerpts say environment secrets are available only to jobs that reference the environment and only after a required reviewer approves, and that required reviewers on the Free, Pro and Team plans are available only for public repositories. If the repository is private on such a plan, the protection falls back to manual dispatch by maintainers with repository secrets, which is weaker (decision C5). Image generation (`HF_TOKEN`) stays out of automated runs entirely.

## 6. Proposed order and decisions

**Order** (each step needs approval; none is implemented here):

1. Measure the suite (TEST-8): `npm test` duration and per-file durations with a spec or junit reporter, the benchmark's per-scenario ms, and the 8 browser checks. This decides whether FAST PR shards.
2. Make the two report-only browser checks assert (TEST-9), and declare Playwright as a pinned devDependency (REPO-14). Optionally rename the milestone-named scripts at the same time (REPO-14), so CI step names are stable.
3. Write FAST PR. Then FULL PR once step 2 is done.
4. Small test fixes that make the gates trustworthy: TEST-11 (temp dir), TEST-12 (wall-clock budgets), TEST-5 (the three waits, and a heartbeat assertion that can fail), TEST-15 (stale TESTING.md paragraphs).
5. TEST-6 in this order, all offline and in `npm test` unless noted: the malformed-body matrix; the real older-save fixtures (copy with provenance); the group-movement save/reload benchmark scenario; the parallel HTTP Accept test; save-format and movement property tests (small seeds in `npm test`, large seeds nightly); the cross-process lock test and the scale fixture (nightly).
6. AUD-1 focused test (P2, product correctness, independent of CI).
7. NIGHTLY / DEEP with coverage, repeat runs and the deep suites as they appear.
8. LIVE CERTIFICATION workflow, last, after decision C5.
9. TEST-7 (recorded-provider layer) and TEST-2 / TEST-4 follow their own product decisions.

**Decisions for the author:**

| ID | Question |
| --- | --- |
| C1 | Which CI host? This review assumes GitHub Actions because the official sources consulted are GitHub's; nothing in the repository requires it. |
| C2 | Which platforms and Node majors does the project claim? `engines` says `>=22`; [TESTING.md](../TESTING.md) says Windows and Linux. A claim should be backed by a job (nightly at least), and Windows needs TEST-2 group C solved first. |
| C3 | May the `test` script change (reporter, timeout), or should CI call `node --test` directly with its own flags? |
| C4 | Lint and formatter: wanted or not (CI-1 says "only if wanted")? |
| C5 | Live certification: which harnesses, how often, what budget per run, and who approves? Is the repository public or private (it changes what environment protection GitHub offers)? |
| C6 | May the real saves in `docs/evaluations/item-sprite-smoke-assets/` and `docs/evaluations/consolidation_block7_live/` be copied into `tests/fixtures/` as older-schema fixtures (B2 provenance rule)? |
| C7 | Should the benchmark's 60-scenario cap (TEST-13) be raised, or should scale scenarios live in a separate deep set? |

## 7. External documentation consulted

Direct fetches of `docs.github.com`, `playwright.dev`, `docs.npmjs.com` and `github.com` were refused by this session's egress policy (HTTP 403 on CONNECT; the fetch tool reported DNS failure). For those sites only the official pages' search-result excerpts were available. Statements in this review that rest on excerpts are limited to what the excerpts said; action versions, image tags and exact option names must be re-read on the live pages before any workflow is written. This review names no action version and no image tag for that reason.

**Read in full (reachable):**

- Node.js v22 test runner: <https://nodejs.org/docs/latest-v22.x/api/test.html> (execution model: one child process per file, exit code decides; coverage, Stability 1 Experimental; reporters `tap`, `spec`, `dot`, `junit`, `lcov`; spec on a TTY, tap otherwise; `duration_ms` in reporter events).
- Node.js v22 CLI: <https://nodejs.org/docs/latest-v22.x/api/cli.html> (`--test-concurrency` default `os.availableParallelism() - 1`; `--test-coverage-lines/branches/functions` added v22.8.0, exit code 1 below threshold; `--test-coverage-include/exclude` added v22.5.0; `--test-shard`; `--test-timeout` default Infinity).

**Excerpts only (search results restricted to the official domain; pages not opened):**

- GitHub, Building and testing Node.js: <https://docs.github.com/actions/guides/building-and-testing-nodejs> (setup-node recommended; checkout, setup-node, `npm ci`, build, test; `cache: 'npm'`).
- GitHub, Dependency caching reference: <https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows> (setup actions create and restore npm caches; manual cache keyed on `package-lock.json`).
- GitHub, Secure use reference: <https://docs.github.com/en/actions/reference/security/secure-use> and Events that trigger workflows: <https://docs.github.com/actions/using-workflows/events-that-trigger-workflows> (no secrets except a read-only `GITHUB_TOKEN` for fork PRs; `pull_request_target` runs with elevated trust and must not run untrusted code).
- GitHub, Events that trigger workflows (current): <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows> and Manually running a workflow: <https://docs.github.com/en/actions/using-workflows/manually-running-a-workflow> (schedule: UTC, latest default-branch commit, may be delayed; `workflow_dispatch` needs the file on the default branch).
- GitHub, Deployments and environments: <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments> and Managing environments: <https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment> (required reviewers; environment secrets only after approval; plan limits for private repositories).
- GitHub, Control the concurrency of workflows and jobs: <https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency> (`concurrency.group`, `cancel-in-progress`, unique group names).
- npm, npm-ci: <https://docs.npmjs.com/cli/v9/commands/npm-ci/> (lockfile required; mismatch fails; `node_modules` removed first; manifests never written). The excerpt came from an older documentation version; re-check the current page.
- Playwright, Continuous Integration: <https://playwright.dev/docs/ci> and Setting up CI: <https://playwright.dev/docs/ci-intro> (`npx playwright install --with-deps` after installing dependencies; container workflows skip `--with-deps`).
- Playwright, Docker: <https://playwright.dev/docs/docker> (pin the image to a specific version; a version different from the project's Playwright cannot locate the browsers).
- Playwright, Browsers: <https://playwright.dev/docs/browsers> and Best Practices: <https://playwright.dev/docs/best-practices> (do not cache browser binaries; install only the browsers used; headless-shell-only option).
- Playwright, Library: <https://playwright.dev/docs/library> (the `playwright` package needs a separate `npx playwright install`; since v1.38 no browser download at npm install).
