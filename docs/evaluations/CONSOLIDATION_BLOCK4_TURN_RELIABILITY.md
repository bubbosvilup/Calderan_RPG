# Consolidation block 4: turn reliability

Date: 2026-10-12. Base: main `a1b83c7`, branch `claude/project-thread-gfj7p8`. **Nothing is committed or pushed** (working tree only). Scope: PIPE-1, PIPE-2, REV-2, NARR-1, and CTX-2 only for the draft-stream leak. Non-goals untouched: PendingConfirmation, AUTH-1/2, provisional characters, core/optional split, NarrationFacts, Weather UI, Property, currency, merchants, quests, combat.

Goal met: one player turn is a reliable transactional operation. It never exposes unaudited Narrator prose, never reports failure after the authoritative commit, never executes twice because of an HTTP retry, never commits from truncated Narrator output, and no longer loses a recoverable turn to `finish_reason=length`.

## 1. Baseline

| | |
| --- | --- |
| HEAD / branch | `a1b83c7` / `claude/project-thread-gfj7p8` (clean tree at start) |
| Tests | 3334 / 3334 |
| Typecheck, build | clean |

Lifecycle before the block: `TurnCoordinator.runTurn` streamed the buffered Narrator draft to the UI (`narrator_preview`) before controller and audit; `narration_completed` preceded the commit; `recordExchange`, `participants.retire` and result assembly ran after `commit` inside the same `try`, so a throw there became `turn_failed`; `/api/turn` had no request identity; any `finish_reason != stop` was a non-retryable `invalid_provider_response` and `finish_reason` was not recorded; the Narrator cap was 512.

## 2. Plumbing (phase 1)

- `GenerationMetadata`/`NarratorResult` now carry `finish_reason`, `model`, `response_model`, `provider`, `route`, `max_output_tokens`, `generation_id`, `cost_usd`. The adapter returns a `length` ending as a completed result only when the request sets `accept_truncated` (turn layer only); every other caller keeps the strict error.
- `src/turn/narrator-ledger.ts`: `NarratorLedger` with 2 logical generations and 3 physical attempts per turn; one trace record per physical attempt (outcome, finish reason, tokens, cost, model, provider, route). Stored in `TurnDiagnostics.narrator_generation` and `TurnTrace.narrator_generation`. No prompt or prose in it.
- `TurnRequest.turn_key` / `expected_revision` reach the coordinator; `turn_started` echoes the key. `turn_progress {phase}` is a closed vocabulary (`thinking`, `narrating`, `resolving`).
- Tests: `block4-plumbing.test.ts` (7). Result: pass.

## 3. PIPE-1: no unaudited draft to the browser

- Old: draft deltas were forwarded to the browser; the audit protected only the final text.
- New: the draft is buffered. The server writes `{type:"progress", phase}` lines (no text field) and one final `result` line. The client maps `phase` to its own labels (Thinking… / Narrating… / Resolving…) and ignores unknown phases and any text on a progress event. `narrator_preview` / `narration_delta` are removed. The final audited narration appears exactly once, after the commit, in `turn_completed` / `result`. No fake streaming.
- Tests: updated UI/coordinator tests plus `ui-v1` "PIPE-1" server test (the audited-away phrase never appears anywhere in the response; the revised text appears once). Real Chromium (`scripts/turn-reliability-browser-check.mjs`, mock providers): while the turn was gated the page showed only "Narrating…", the audit-rejected draft phrase was never visible in any sample, the final prose occurred once, the same after reload, and the request carried `turn_key` and `expected_revision`.

## 4. PIPE-2: success after commit

- Old: post-commit throws turned a committed turn into `turn_failed`.
- New: `assembleTurnResult` runs before the commit. After `commit`, `publishCommitted` guards every step (diagnostics, history, scene participants); failures become `publication_warning` events and `trace.publication_warnings`. A throw anywhere after `state_committed` yields a warning event, not `turn_failed`. `GameSession` treats a seen `state_committed` as success even if the generator throws (`result_publication`); transcript, item-visuals and diagnostics steps are guarded; a throwing UI callback is ignored; the server falls back to a minimal state when describing the new state fails (`state_view`). `runTurn` is 160 lines (guard ≤164) after extracting `regenerateTruncated`, `publishCommitted`, `failureEvent`.
- Tests (`block4-pipe2.test.ts`, 7): injected failures in `recordExchange`, scene-participant retirement, the diagnostics sink, a coordinator that throws after `state_committed`, and the server state view. Each: exactly one commit, success reported with a warning, no duplicate transcript, the next turn works.

## 5. REV-2: idempotent turns

- Contract: `/api/turn` requires `turn_key` (`[A-Za-z0-9_-]{8,64}`) and `expected_revision`; malformed → 400, zero provider calls. The client creates one key per submission and retries a dropped connection with the same key.
- Check order in `GameSession.submitPlayerInput`: malformed → in-flight join (same fingerprint; a different one is `turn_key_conflict`) → terminal receipt replay → busy (`turn_in_progress`, never queued) → application command → stale revision (`stale_turn`, before any provider) → compaction. Fingerprint = sha256 of `[text, expected_revision]`.
- In-flight registry: runtime memory only. Terminal receipts: success and terminal failure both, bounded to **32**, persisted as the optional save-file block `turn_receipts` (schema stays 5), written in the same atomic rename as the snapshot, never part of `CampaignState` (recording one does not change the semantic revision). Not remembered (request-moment properties): `cancelled`, `stale_turn`, `turn_in_progress`, `invalid_input`, `session_closed`. A failed turn is retried with a NEW key.
- Crash boundary (documented in ARCHITECTURE 2a and PERSISTENCE): receipts are recorded synchronously before the session returns to idle and saves require idle, so a durable snapshot at revision N always contains the receipt of the turn that produced it. A commit that was never saved is lost together with its receipt, so the retry after a restart is a first execution, not a duplicate. Failure receipts make the session dirty so autosave persists them even though no revision changed. Loading is tolerant: malformed receipts, duplicate keys and receipts claiming a future revision are dropped.
- Tests (`block4-rev2.test.ts`, 14): stale rejected with zero calls and not remembered; replay after success and after terminal failure (zero calls, same turn id, no state or transcript change, exactly one commit); concurrent same key runs once; conflict on a different text or revision; a different key while busy → `turn_in_progress`; malformed keys; persistence across reload and restart with zero provider calls; bound of 32 (oldest falls off); revision unaffected; the crash-boundary scenario (unsaved commit and its receipt lost together; retry runs once); tolerant parse; HTTP 400/replay/409.

## 6. NARR-1: truncation recovery

- Normal cap 512 → **768** (`NARRATOR_OUTPUT_TOKENS`); model, route (`z-ai/fp8`, no fallbacks), reasoning and Controller unchanged (source-hash pins in `rpg-format-contract.test.ts` were re-baselined for exactly these files).
- `finish_reason=length` is incomplete: never delivered, never sent to the Controller, never audited as final, never committed. Exactly **one** regeneration: cap **1024**, same base revision and context, a short recovery instruction appended to the system prompt, not a continuation, nothing stitched.
- Budget per turn: **max 2 logical** Narrator generations (primary + recovery, or primary + audit revision) and a hard **max 3 physical** provider attempts shared by infrastructure retries and regeneration. A recovery that is itself audited has no revision left: the complete draft is redacted deterministically. **Controller: at most once, only after a complete narration.** Only `length` triggers recovery; refusal and malformed output follow their own policies. A failed recovery (second `length`, provider failure, no budget) is the terminal `narrator_truncated`, stored under the same `turn_key`.
- Tests (`block4-narr1.test.ts`, 15): normal stop; length → one regeneration with the partial absent from every event, history and Controller input; same context, 1024 cap, minimal instruction; double length; failed recovery; refusal/malformed → no recovery; budget scenarios A to E (never a 4th physical attempt); recovery needing an audit revision → redaction; ordinary revision and truncated revision; stale between generations; next turn works after `narrator_truncated`. Adapter caps 768/1024 asserted against the real adapter with a fake fetch (`block4-plumbing`, `provider-reliability-contract`).

## 7. End-to-end validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run build` | clean |
| `npm test` | **3377 / 3377** (baseline 3334; +43 new tests, existing tests adapted) |
| Adapted existing tests | cap 768 expectations and a compaction budget constant; event order; golden pipeline traces regenerated (the diff contains only progress events, removed `narration_delta`, and `state_committed` carrying the narration); cancellation invariant now cancels at the last event before the commit; source-hash pins; the `runTurn` size guards (160 ≤ 164); the length-retry test (recovery request differs by design) |
| Real browser | see section 3 |

## 8. Live certification (production model, no reroll loops)

Harness `src/dev/consolidation-block4-live.ts` (global fetch wrapper records every OpenRouter request; for B it lowers `max_tokens` of the FIRST Narrator request only, to 24, so the provider itself ends with `finish_reason=length`). Raw evidence: `docs/evaluations/consolidation_block4_live/run.json`.

- **A (normal turn):** one Narrator request with `max_tokens=768`, one Controller request, progress events `thinking, narrating, resolving` only, one logical / one physical attempt, `finish_reason=stop` in the trace; the identical `turn_key` replayed with the same narration and turn id and **zero** provider calls. The turn was a conversational no-op, so the revision did not change (a commit with no changes never bumps it).
- **B (forced truncation):** first Narrator request capped at 24 → provider returned `length` (24 completion tokens, model `z-ai/glm-5.2`, provider Z.AI, route `z-ai/fp8`); exactly one recovery request with `max_tokens=1024` carrying the recovery notice → `stop` (224 tokens); one Controller request; turn completed with a full-length narration; 2 logical / 2 physical attempts; the partial never appeared.
- Tokens and cost: final run 23,103 tokens, 5 provider requests (3 Narrator, 2 Controller); Narrator cost of scenario B about 0.0036 USD from the trace (the proxy reports no total). An earlier identical run (harness verdict bug: it treated a no-op turn as "not committed") added 5 requests and about 23k tokens, so the total was **10 requests, about 46k tokens**.
- Exact final code: production code is the code the suite passed on; only `src/dev` harness and docs changed afterwards, and the second run used the corrected harness on that tree.

## 9. Final debt status

| Item | Status |
| --- | --- |
| PIPE-1 | FIXED, live and browser certified |
| PIPE-2 | FIXED offline (fault injection at every post-commit point) |
| REV-2 | FIXED; replay live-certified; persistence, bound and crash boundary tested |
| NARR-1 | FIXED, live-certified on the production model (forced truncation) |
| CTX-2 | PARTIAL: only the draft-stream leak is closed; the output-side leak check on the final text and prompt-side secrecy remain open |

## 10. Remaining risks

- The truncation rate is still unmeasured in real play; the trace now records `finish_reason` and every attempt, but there is no aggregate tool. 768 may still truncate long scenes; a failed recovery still loses the turn (`narrator_truncated`, honest, nothing committed).
- Receipts are a bounded window (32); a key older than that, or lost in a crash before a save, re-executes. Acceptable by design; no durable queue.
- A different-key submission while a turn runs is still rejected, not queued.
- Replay returns the stored terminal result, not a re-rendering of the current view.
- The client retries a dropped connection up to twice; a server restart between attempts relies on the saved receipt.
- Sealed canon never appears in this report.
