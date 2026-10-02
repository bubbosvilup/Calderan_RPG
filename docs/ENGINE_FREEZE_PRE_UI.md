# Engine freeze register (pre-UI)

Date: 2026-10-02. Basis: `docs/evaluations/CALDREVAN_ENGINE_CLOSURE_PRE_UI.md`. Verdict: ENGINE_READY_FOR_UI_WITH_NON_BLOCKING_DEBT.

## Frozen subsystems

Do not change without meeting the unfreeze rules below:

- Scene delta / revision model and `CampaignState` authority (single commit per turn).
- Persistence format, snapshot schema 2, two-slot atomic save.
- Retrieval architecture (lexical + optional semantic, never lore truncation).
- Narrator / controller split, authorization, audit and one-revision reconciliation.
- Household, legal, relationship, funds and transaction domains.
- NPC+ (history, contracts, follow, reflection).
- `runTurn` (≤ 164 lines, guarded), the H2 golden prompt, language gates.
- The application seam `src/app` (`GameSession`, `SessionView`, `AppError`, `TurnTrace`) is now part of the contract; additive changes only, documented in `UI_ENGINE_CONTRACT.md`.

## Known non-blocking debt

Carried from `CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md` (unchanged): D-01..D-03 follow-choice measurement, D-04 context ceiling (now a clean `context_too_large` result), D-05 retry never exercised live, D-06 occasional `structured_output_invalid` (~1 in 100-570 turns, retryable by the user), D-07 destination-less departure, D-08 four H1 TODOs, D-09 reflection usefulness, D-10 recurring-behaviour representation, D-11/D-12 follow grammar gaps, D-13..D-17, D-19 over-redaction rates, D-20 reflection delay, D-21 type-only import cycles, D-22 semantic retrieval live-untested, D-23 `runTurn` ceiling.

New in this pass (all non-blocking):

- C-01 `src/dev/play.ts` is still a developer harness with its own copy of the session glue. The application seam is `src/app`; migrate or retire `play.ts` when the UI lands.
- C-02 `getView()` costs about 45 ms at 500 characters / 200 NPC+ (per-character identity resolution). The UI should call it once per event, not per frame. Optimise only if it shows up in play.
- C-03 No token streaming: audited text arrives as one chunk by design.
- C-04 Traces are an in-memory ring of 200; a crash loses them. Persist only if human playtests need it.
- C-05 No cost estimate in traces (token usage only).
- C-06 Reflection cannot be cancelled; `shutdown()` waits for it (≤ 20 s).
- C-07 Narrator-invented, never-named scene participants are session-local and absent from `view.scene.present`.
- C-08 One shared coordinator per process: `createProductionDeps` supports one live session at a time.

## UI-blocking items fixed in this pass

1. No application seam existed: the start, load, save, quit, busy and reflection ordering lived only in `src/dev/play.ts`. Added `GameSession`.
2. No UI-readable error vocabulary (raw `turn_failed` codes and thrown `CampaignSaveError`). Added `AppError {code, retryable, turn_state_changed}` over the existing codes.
3. No view model (UI would have read `CampaignSnapshot`). Added `SessionView`, derived and secret-free.
4. No quotable turn id or debug export. Added `turn_id` and safe `exportTurnDebug`.
5. Application commands (`/save`, `/load`, ...) shared the player-input path. They are now rejected before the narrator.
6. The reflection model ignored `OPENROUTER_CONTROLLER_MODEL` in the dev loop. Production wiring reads `OPENROUTER_REFLECTION_MODEL`, defaulting to the controller model.
7. The production composition root lived under `src/dev` (forbidden by the dependency-direction guard). Shared constants moved to `src/app/provider-config.ts`; dev re-exports them.

## Unsupported features

Combat, crafting, quests, shops and item prices, quantities/weight/containers, NPC autonomy and goals, party system, calendar/dates, autosave, multiplayer, cloud saves, settings UI. See `ENGINE_CAPABILITIES_PRE_UI.md`.

## Rules for unfreezing engine code

Allowed only for:

- a bug reproduced in human play (cite the debug-export `turn_id`),
- a UI integration blocker,
- a state-correctness or security/secret-leak issue,
- a necessary missing application seam.

Not allowed: "we could make this smarter", quality tuning without a reproduced failure, new gameplay domains, refactors for taste. Every unfreeze needs a failing test first, a narrow change, a negative test, and an unchanged baseline (typecheck, 0 failures, same 4 TODOs, replay 25/25, golden byte-identical, `runTurn` ≤ 164).
