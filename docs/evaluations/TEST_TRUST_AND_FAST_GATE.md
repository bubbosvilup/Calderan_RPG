# Test trust and the fast CI gate (block B2)

Date: 2026-10-14. Base: main `26fc79f` plus the B1 working tree. Block B2 of the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md), with the user decisions of 2026-10-14 (register section 16, D22): GitHub Actions; Linux and Windows; Node 22. No product file changed. No live provider call and no image generation call was made.

## Starting assumptions (re-verified)

| # | Assumption | Result |
| --- | --- | --- |
| 1 | No `.github/` and no CI configuration | True |
| 2 | `confirmation` and `turn-reliability` browser checks print a JSON report and fail only when Playwright throws | True |
| 3 | Playwright is not in `package.json`; the checks load it from `PLAYWRIGHT_MODULE` or `NODE_PATH` | True |
| 4 | `npm test` builds then runs `node --test ".build/tests/**/*.test.js"`; four architecture guards call `git ls-files` | True |
| 5 | A context test writes into `saves/`; three tests assert hard wall-clock limits; scripts are never syntax-checked; `docs/TESTING.md` describes "three checks" | True (`tests/context/context-budget.test.ts`; `tests/world/calendar-climate-weather.test.ts` two limits, `tests/items/item-intent-and-weather-seam.test.ts` one) |

## Changes

- **Timing (TEST-8).** Measured with a per-file reporter and recorded in [Testing](../TESTING.md): `npm test` 212 s wall (190 s for the test run, 422 s of summed test time in 230 files), slowest file `tests/movement/follow-state-matrix.test.ts` 22.7 s; benchmark 36 s with its build (scenario time 16.3 s, slowest P2 1.1 s); typecheck 17 s; browser checks 1.8 s to 5.6 s each.
- **Asserting browser checks (TEST-9).** `scripts/browser/confirmation-browser-check.mjs` now asserts its 9 outcomes (the words only propose; card copy; accessible button labels; cancel; rename keeps the card; confirm frees exactly once with zero provider calls; reload; idempotent replay; request bodies carry only `ref` and `expected_revision`). `scripts/browser/turn-reliability-browser-check.mjs` asserts 5 (no draft prose ever; neutral phase words `Thinking…`/`Narrating…`/`Resolving…` only; final prose exactly once, also after reload; one request with `text`, `turn_key`, `expected_revision`; one commit). Proof of failure (temporary copies, deleted): expecting 2 manumission records gave `FAIL confirm frees exactly once…`, 8/9, exit 1; expecting the final prose twice gave `FAIL the final prose appears exactly once…`, 4/5, exit 1. On current code: 9/9 and 5/5, exit 0.
- **Playwright.** `playwright@1.56.1` is an exact devDependency (the version whose Chromium build 1194 the sandbox carries). The lockfile adds only `playwright`, `playwright-core` and Playwright's optional `fsevents`. Installed with `--ignore-scripts`; Playwright never downloads browsers on install. `scripts/lib/browser-env.mjs` keeps `PLAYWRIGHT_MODULE` and `NODE_PATH` working; all eight checks passed without `NODE_PATH`, resolving the devDependency.
- **Temporary saves.** `tests/context/context-budget.test.ts` writes its saves to an OS temporary directory removed after the file, never to `saves/`.
- **Wall-clock budgets.** The three hard limits were widened with a recorded rationale: `calendarDateAt(±10^12)` plus a far weather lookup 200 ms to 1000 ms; 2000 far-future weather lookups 2 s to 6 s; 20 item-intent resolutions over 400 items plus 2000 weather lookups 4 s to 10 s. What they protect is boundedness: a scan over 10^12 minutes or a quadratic item pass would cost hours or minutes, orders of magnitude above either bound; on the sandbox each whole file runs in 1.7 s to 2.3 s.
- **Script syntax check.** `npm run check:scripts` (`scripts/check-scripts.mjs`) runs `node --check` on all 50 scripts under `scripts/` (0 errors).
- **Docs.** `docs/TESTING.md`: the browser paragraph, the eight checks (no more "three checks" or environment-specific paths), the fast gate, timing, the latest result.
- **FAST workflow.** `.github/workflows/fast.yml`: pull requests and pushes to main; matrix `ubuntu-latest`, `windows-latest`; Node 22 with the npm cache; `core.autocrlf false` before checkout so golden traces and fixtures stay byte-identical on Windows; `npm ci`, typecheck, `check:architecture`, `check:docs`, `check:scripts`, `npm test`. Read-only permissions, no secrets, no browser job, cancel-in-progress per ref.

## Validation (this working tree)

| Step | Exit | Time |
| --- | --- | --- |
| clean / typecheck / build | 0 / 0 / 0 | 0.3 s / 17 s / 20 s |
| `npm test` | 0 | 212 s: 3715 tests, 3715 pass, 0 fail, 0 skipped |
| `npm run benchmark:modern` | 0 | 36 s: 55/55, 0 known gaps |
| `npm run check:architecture` | 0 | 360 modules, 0 runtime back edges |
| `npm run check:docs` | 0 | 0 broken |
| `npm run check:scripts` | 0 | 50 scripts, 0 errors |
| 8 browser checks | all 0 | actual-offer 21/21, block5b, block6, block7, confirmation 9/9, explicit-promotion 13/13, keep-track 15/15, turn-reliability 5/5 |

## Not verified here

The workflow has not run yet: GitHub Actions starts it on the first push or PR that carries the file. The Windows job is the first Windows run of the suite in CI (the user plays on Windows, so the suite is expected to pass there; any failure becomes a B2 follow-up). Pushing a workflow file needs a GitHub token with workflow permission; if the push is refused, the file can be added from the GitHub web UI.
