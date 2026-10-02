# Caldrevan engine readiness pass before UI

**Date:** 2026-10-02. **Base:** `main` at e0a8a0a. **Type:** verification only; no engine code, tests, prompts or data changed.

## Verdict

**READY TO FREEZE, with the non-blocking debt already recorded.** Nothing found blocks starting UI work against the current engine.

## Baseline

| Check | Result |
|---|---|
| `npm ci` | clean |
| `npm run typecheck` | clean |
| `npm test` (build + `node --test`) | 1661 tests: **1657 pass, 0 fail, 4 todo, 0 skipped** |

The 4 todo tests are the accepted H1 known gaps (debt D-08), unchanged in count.

## Architecture review

- The [debt register after Pass 10](CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md) lists **no blocking items**; the H6 audit gate (READY WITH NON-BLOCKING DEBT) still stands.
- Runtime import cycles in `turn/`: 0 (type-only cycles, D-21, are erased at compile time).
- `runTurn` stays inside its guarded 164-line ceiling (D-23).
- The surface a UI consumes is `TurnResult` and the `TurnEvent` stream in `src/turn/turn-types.ts`. Each turn delivers `narration`, `base_revision`/`final_revision`, `narration_reconciliation.delivered` (`draft` | `revision` | `redacted`) and `latency`. Everything else is diagnostic and should not be rendered.

## Items the UI contract must respect (not engine fixes)

1. **D-04** A crowded scene (about 7 present NPC+ who all know all shown facts) fails closed with `context_too_large`. The UI must show a retryable turn failure; no state is committed.
2. **D-06** Roughly 1 turn in 100 to 570 can fail with `structured_output_invalid`; same handling, no state change.
3. **D-13** A revision may omit a committed follow move; state is correct, the narration may lack the arrival line. Display state from the snapshot, not from prose.
4. **D-16** `private_memory_refs` has no writer; the UI must not read it.

## Not changed, and why

D-01 to D-03, D-07, D-09, D-10 are "before autonomy" items, not "before UI" items. D-01 and D-09 need paid live probes, which were not run. Test files carry unused imports (`tsc --noUnusedLocals` flags 5, tests only); harmless, left alone to keep this change verification-only.
