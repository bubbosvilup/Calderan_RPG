# Repository Cleanup A: build discipline, generated artifacts, tooling hygiene

Status: uncommitted working tree on top of main `861396c` (Block 12), 2026-10-13. No gameplay, Keep track, NarrationFacts, authority or save-schema change. The only `src/` edits are two output-path strings in `src/dev/` evaluation tools. The runtime import graph fingerprint is identical before and after (`2c33f87b…`). No live provider or image call was made.

## 1. Baseline

| Item | Value |
| --- | --- |
| HEAD | `861396c` (Block 12 on main), `git status` clean |
| Tracked files | 2,009 |
| npm scripts | 27; `build` = `tsc --noEmit false --outDir .build`; `test` = `npm run build && node --test .build/tests/*.test.js`; no clean, no lifecycle hooks, cycle checker not exposed |
| `.gitignore` | `.build/`, `saves/`, secrets, `*.log`, coverage, editor files |
| `.build` | `src/` and `tests/` compiled output (7.4 MB). Some tools also wrote private evidence into it (section 5) |
| Clean run (`.build` deleted first) | typecheck 0, build 0, **3660 tests, 0 fail**, benchmark **55/55, 0 known gaps** |
| Cycle checker | 372 modules, 32 source-level back-edges (type imports included), 6 source components, **0 runtime back-edges** |

## 2. Stale build reproduction

With the old build command, a compiled test whose source no longer exists survives and runs. To show it, I injected `.build/tests/zz-stale-injected.test.js` (a test that throws) and ran the old command `tsc --noEmit false --outDir .build`. The file was still there afterwards, and `node --test` picked it up: `not ok 1 - STALE compiled test whose source was deleted`, `# fail 1`.

I then injected the same file and ran the new `npm test`. The build step deleted it before discovery: **3663 tests, 3663 pass, 0 fail**. The stale test never ran, and the file was gone afterwards.

## 3. Clean command design

`scripts/clean.mjs` uses Node's `fs.rm` with `{recursive, force}` and no shell `rm -rf`, so it works on Windows and Linux.

- **Root.** The repository root comes from the script's own location (`import.meta.url`), never from the shell.
- **Target.** It removes only `<root>/.build` and refuses any target whose last segment is not `.build` or that is not directly inside the root.
- **Idempotent.** Running it when `.build` is absent is fine.
- **Reuse.** It exports `cleanBuild(root)` for the regression test.
- **Dependencies.** None added.

## 4. Authoritative build and test flow

- `npm run clean` → `node scripts/clean.mjs`
- `npm run build` → `node scripts/clean.mjs && tsc --noEmit false --outDir .build`. **Every build starts from an empty `.build`.**
- `npm test`, `npm run benchmark:modern` and every `npm run <tool>` that runs compiled code already began with `npm run build`, so each of them cleans exactly once.
- There are no `pre*` / `post*` hooks, so nothing cleans twice.
- Running tsc without `--incremental` already recompiled everything, so cleaning first costs only the delete.
- Rule (documented in TESTING): never run two builds or test runs at the same time in one checkout.

Regression test `tests/build-discipline.test.ts` (4 tests, offline):

1. `cleanBuild` on a temporary root removes a fake stale `.build/tests/deleted-source.test.js`. It leaves `tests/` and a `.build-notes/` sibling untouched, and running it twice is fine. The fake root is deleted afterwards.
2. The clean script resolves the root from its own location and contains no `rm -rf`, `/home/` or drive-letter path.
3. The `package.json` wiring holds:
   - `build` cleans first;
   - `test` goes through `build` and then discovers tests;
   - the benchmark goes through `build`;
   - `check:architecture` exists;
   - there are no lifecycle hooks;
   - every script that runs `.build/` code builds first.
4. REPO-1 guard: nothing under `saves/` is tracked. The test skips when git is unavailable.

## 5. Scratch and evidence path decision

`.build` ownership audit:

| Writer | Class | Decision |
| --- | --- | --- |
| `tsc` | A, compiled output | stays; disposable |
| `tests/authored-data.test.ts` (`mkdtemp` under `.build`, removed in `finally`) | B, temporary scratch | stays: created and deleted within one test run |
| `scripts/gemini-vertex-rerun.mjs`, `scripts/live-controller-reliability-1.mjs`, `scripts/narrator-bakeoff-1.mjs` (`privateDir`) | C, private evaluation evidence | moved to `artifacts/local/<run>` |
| `src/dev/eval-authority.ts`, `src/dev/eval-narrators.ts` (`.build/evaluations/…`, including `--resume` runs) | C | moved to `artifacts/local/evaluations/<run>` |

**One location for local, private output: `artifacts/local/`**, which is gitignored. Raw provider responses, private evaluation runs, browser screenshots and the casting trace all go there. Committed evidence stays under `docs/evaluations/`.

## 6. Browser-path portability

New helper `scripts/lib/browser-env.mjs`:

- `ROOT`, `BUILD` and `DATA` are derived from the file's own location.
- `fromBuild("src/…")` imports through `pathToFileURL`, which Windows needs for absolute paths.
- Playwright loads from `PLAYWRIGHT_MODULE`, or else from the `playwright` package (`NODE_PATH` works).
- `CHROMIUM_PATH` optionally names the browser executable.
- `shotsDir(check)` returns `artifacts/local/browser/<check>/`.

The eight checks now use the helper, with no file renamed: actual-offer, explicit-promotion, confirmation, turn-reliability, block5b, block6, block7 and keep-track. They no longer contain `/home/user/Calderan_RPG`, `/opt/…`, `/tmp/claude-0/…` or `createRequire("/opt/node-tools/")`.

| Check | Result |
| --- | --- |
| block5b | 13/13 PASS |
| block6 | 15/15 PASS |
| block7 | 19/19 PASS |
| confirmation | PASS (exit 0) |
| explicit-promotion | 13/13 PASS |
| keep-track | 15/15 PASS |
| turn-reliability | PASS (exit 0) |
| **actual-offer** | **FAIL at D1, PRE-EXISTING**: A1-C2 pass, then D1 times out. The unmodified script fails at the same line on main `861396c`, and an offline reproduction gives the identical result on `a6d1bcd` (block 11) and `7345549` (block 10), so it is not caused by this cleanup. The captive's line `The woman lifts her head from the straw. "My name is Brenna," she whispers.` is delivered as its first sentence only, and the audit reports `canonical_name_conflict`: with Korvin as the conversation partner, the partner identity guard treats the self-introduction as the partner's. Recorded as **REPO-12 (P2)**. It needs a decision: guard false positive or stale expectation. No gameplay change in this block. |

## 7. casting-trace decision

**REPAIRED.** `scripts/casting-trace.mjs` (canonical NPC casting vs ephemeral duplication audit) still has value: it traces eleven offline cases through the real `TurnCoordinator`.

- Its only broken dependency was `readScene` from the deleted `narrated-captives.js`; it now imports `readScene` from `narration-facts/index.js` (same signature).
- The output file argument is now optional (default `artifacts/local/casting-trace.json`).
- It runs offline: all 11 cases are traced.

A repository-wide check of every `.build/{src,tests}/…js` reference in `scripts/`, `src/` and `tests/` against an existing source finds no other import of a deleted module.

## 8. Cycle-check integration

- `npm run check:architecture` runs `scripts/minor-debt-cycle-check.mjs`.
- No rule changed. One addition: the process exit code is 1 when there is a **runtime** import cycle, so the entry point works as a gate. Source-level (type-only) back-edges are still reported but are not fatal.
- Result: 372 modules, 32 source-level back-edges, 6 source components, 0 runtime back-edges, 0 runtime components. The runtime graph sha256 is `2c33f87b…`, the same as the baseline.

## 9. D09 evidence migration

- **What moved:** 310 files in five directories, from `saves/d09-*` to `docs/evaluations/d09-reflection/evidence/d09-*`, with `git mv`.
- **No content changed:** every file is a 100% rename (`R100`), including the 17 `.log` files, which are evidence.
- **What was updated:** the active D09 harnesses (`scripts/d09-*.mjs`, `scripts/minor-debt-controller-audit.mjs`) now read and write the new location. The never-committed `d09-final-campaign-soak` directory maps there too.
- **What was not rewritten:** paths recorded inside the evidence (freezes, runner copies, hashes) and in the D09 reports describe the pre-cleanup commit and were left as they are.
- **New file:** `docs/evaluations/d09-reflection/evidence/README.md` maps each directory to its report and states the location history.
- **Unchanged:** the D09 store unit test `scripts/tests/d09-evidence-artifacts.test.mjs` passes (7/7).

## 10. `.gitignore` result

- `.build/`: compiled output, disposable, never evidence.
- `saves/`: the runtime save root. Nothing under it is tracked any more, and a test guards that.
- `artifacts/local/`: new, for local private output.
- Unchanged: `*.log`, secrets, coverage and editor files.
- `docs/evaluations/` is not ignored; `git check-ignore` confirms the new evidence README is tracked normally.

## 11. Validation

| Step | Result |
| --- | --- |
| Stale injection + `npm test` | the injected stale test was removed before discovery; 3663 tests, 0 fail |
| `npm run clean` | `.build` absent afterwards |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | **3664 tests, 3664 pass, 0 fail** (+4 `build-discipline`) |
| `npm run benchmark:modern` | **55/55 PASS, 0 FAIL, 0 known product gaps** |
| `npm run check:architecture` | exit 0, 0 runtime back-edges |
| Modified browser checks | 7 of 8 green; actual-offer red at D1, pre-existing (section 6) |
| `node scripts/casting-trace.mjs` | runs, 11 cases |
| D09 store test | 7/7 |

## 12. Debt closures

- **CI-2 CLOSED:** `.build` is cleaned by every build, and `npm run clean` exists.
- **UI-30 CLOSED:** browser checks no longer hard-code paths. Residual: Playwright is still not a devDependency (REPO-6).
- **REPO-1 CLOSED:** D09 evidence moved out of `saves/`, and a test forbids tracked files there.
- Cycle checker exposed (part of REPO-6).
- Broken casting trace repaired (it was not a numbered item).
- **New: REPO-12 (P2)**, the actual-offer D1 failure.

## 13. Remaining structural debt

Not touched in this block, by design: REPO-2 to REPO-11 (root pollution, evidence mixed with reports, orphan `src/dev` files, script sprawl, large binaries, unused exports, compatibility shells, fixtures in `src/dev`, the stale root register), TEST-3 (tests named by delivery pass), DOC-16 (docs taxonomy), CI-1 (no CI), NAME-1 (`premium_*`). Also left alone: module moves, lifecycle renames such as `buildPromotedCharacter`, and reflection consolidation.

Tool path audit (section 10 of the brief):

- No active file under `scripts/`, `src/` or `tests/` contains `/home/user/Calderan_RPG` any more. The remaining hits are historical audit evidence and the register's own UI-30 text.
- The `C:\` hits are test fixtures for path validation.
- `../.build/src/…` imports in scripts are relative and portable; they assume a prior `npm run build`, as documented.

## 14. Cleanup B handoff

- `npm run build` is now trustworthy, `artifacts/local/` is the single local output root, and `npm run check:architecture` can host more checks (for example "nothing tracked under `saves/`" is already a test).
- Suggested next: decide REPO-12 first, since it is a possible gameplay false positive.
- Then archive or retire the one-off live scripts (REPO-6) and move test fixtures out of `src/dev` (REPO-10).
- Then rename tests by domain (TEST-3) and apply the docs taxonomy (DOC-16).
- Each of those should be a separate green commit.
