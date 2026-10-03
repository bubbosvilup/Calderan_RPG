# Caldrevan hardening H2 — turn pipeline decomposition / maintainability

**Date:** 2026-10-01
**Type:** structural implementation pass. Nothing committed or pushed; the working tree is left for human review.
**Inputs:** [health audit](../CALDREVAN_CODEBASE_ARCHITECTURE_HEALTH_AUDIT.md), [gap-to-target audit](../CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.md) (and its JSON), [H1 report](CALDREVAN_HARDENING_H1_DETERMINISTIC_LANGUAGE_INVARIANTS.md).

---

## A. Executive result

H2 is complete against all 25 success criteria.

`TurnCoordinator.runTurn` is now a top-to-bottom orchestrator over **seven cohesive stage modules** in `src/turn/stages/`. Each has typed inputs and outputs, documented sync/async behaviour and a documented failure mapping. No stage holds a `CampaignState`; the single authoritative `campaign.commit` stays in `runTurn`, on the line directly after the final `checkpoint()`.

**The behavioural proof is a golden pipeline trace generated from the pre-H2 code before any source change.** After each of the six extractions, and at the end, the decomposed pipeline reproduces that trace **byte-identically** across five scenarios. The trace covers:

- the event sequence
- every `prepare` and `commit` call, with its command kinds and changed flag
- retrieval calls
- the exact narrator prompts
- the exact controller request
- recent-conversation entries
- the normalized `TurnResult`

**Unintended behaviour changes: 0. Intended behaviour changes: 0.**

| | Before H2 | After H2 |
|---|---:|---:|
| `npm test` | 1040 (1036 pass, 4 todo) | **1065 (1061 pass, 0 fail, 4 todo)** |
| Curated replay | 25/25 | 25/25 |
| `runTurn` characters | 17,708 | **8,538 (−52%)** |
| `runTurn` lines | 181 | 111 |
| Coordinator file lines / characters | 227 / 21,770 | 149 / 11,701 |
| Coordinator import sources | 26 | 19 (7 of them are the stage modules) |
| `let` locals in `runTurn` | 14 | **5** |
| Authoritative commits | 1 | 1 |
| Deterministic turn timing | — | unchanged (within noise) |

---

## B. H1 baseline confirmation

Re-run at the start of H2, before any change: typecheck **pass**; `npm test` **1040 total, 1036 pass, 0 fail, 0 skipped, 4 todo**; `npm run test:playthrough` **25/25**. This matches the H1 report exactly.

The three H1 review changes are treated as **accepted, inherited semantics, not H2 changes**:

1. attempt and epistemic handover language does not authorize a transfer;
2. compound-subject departure pronouns remove nobody;
3. first-time name promotion is skipped when Nicco changes location (`location_changed`).

All three are re-verified at the end of H2 (section Q).

---

## C. Golden pipeline characterization

`tests/turn-pipeline-golden.test.ts` and `tests/golden/turn-pipeline.json` were written and generated **against the untouched pre-H2 coordinator**. The golden file has not been regenerated since. Every extraction step was checked against it.

**Instrumentation (test-only, no production hooks):**

- `campaign.prepare` and `campaign.commit` are wrapped as instance properties to record each call's command kinds and changed flag.
- The retrieval `search` and `get` calls are wrapped.
- The scripted narrator and controller record the exact requests they receive.
- Every coordinator event is recorded in order.

Only wall-clock fields (`coordinator_total_ms`, `controller_tail_ms`, `elapsed_ms`, `retrieval_ms`) are normalized to 0.

| Scenario | What it pins |
|---|---|
| `success_reconciled_handover` | authorized handover plus an uncommitted second handover in the draft → audit → reconciliation call → revision delivered → one changed commit |
| `success_carry_travel` | deterministic carry: carry-prevalidation prepare and projection prepare **before** retrieval, the left-behind narrator note, travel in the result, final prepare, commit |
| `success_retrieval_noop` | lore query → search + fetch → narration → no-op final prepare → commit (`changed: false`) |
| `failure_controller_timeout` | narration then a controller provider error → no final prepare, no commit, a `state_failed` history entry |
| `failure_stale_during_reconciliation` | campaign mutated during the reconciliation call → `stale_turn` **after** final preparation; the turn's receipt never commits |

A sixth test asserts the contractual order directly:

```
turn_started → narrator#0 → controller_started → controller.propose → state_proposed → prepare → narrator#1
→ narration_delta → narration_completed → commit → state_committed → turn_completed
```

**Regeneration policy:** `H2_UPDATE_GOLDEN=1` rewrites the file. Use it only deliberately, and justify the resulting diff in review. The golden pins exact prompt text, so an intended prompt change elsewhere will require it.

---

## D. Original TurnCoordinator anatomy (pre-H2, measured)

- **One `async *runTurn`:** 181 lines and 17,708 characters, inside a 227-line file (the H1 version, which included the `TurnDebugRecord` type).
- **26 import sources**, including 13 low-level domain modules: context-builder, prompt-builder, narrative-authority, player-intent, evidence-authorization (twice), turn-evidence, narration-audit, person-transactions, name-establishment, character-movement, household-evidence, controller-schema, travel; plus `node:util`.
- **14 `let` locals spanning the body:** `text`, `shown`, `recorded`, `owned`, `stage`, `carry`, `tradeCommands`, `tradeNotes`, `promotion`, `projected`, `buffer`, `delivered`, `revisionIssues`, `final`, and others.
- **14 inline responsibilities:** locking, input validation, snapshot capture, base context, participant plan, intent, carry prevalidation, transaction prevalidation, projection, movable/left-behind, retrieval, prompt, streaming, controller request, parse, evidence, authorization, omission debug, acquisition provenance, final prepare, audit, reconciliation, redaction, identity, commit, history, participants, result.
- **4 async phases:** retrieval, narrator stream, controller, conditional reconciliation.
- **11 `checkpoint()` sites**, **5 `prepare` sites**, **3 `buildTurnContext` calls**, **1 commit**.

**Hidden contract found and preserved.** The reassigned `stage` variable decides the failure code of any non-`TurnError` exception, and its value at each line is subtle:

- Prompt composition runs while `stage` is still `retrieval_failed`.
- Parsing the controller output and assembling commands run while it is `controller_failed`.
- Outcome lines run while it is `campaign_validation_failed`.
- The revision call, the revision audit and redaction run while it is `narrator_failed`.

H2 keeps every one of the 7 `stage =` assignments in `runTurn` at the same pipeline position. Each stage module states the code the coordinator holds while it runs.

---

## E. Final stage model

| # | Stage | Module / function | Sync / async |
|---:|---|---|---|
| 1 | TurnInputStage | inline in `runTurn` (6 lines: lock, bound, capture) | sync |
| 2 | IntentResolutionStage | `stages/intent.ts`: `resolveTurnIntent`, then `projectTurnIntent` | sync |
| 3 | RetrievalStage | the existing `retrieveForTurn` (`retrieval-policy.ts`), plus `stages/narration.ts` `composeTurnPrompt` | async (retrieval), then sync |
| 4 | NarrationStage | `stages/narration.ts` `createDraftGenerator` | async |
| 5 | ControllerStage | `stages/controller.ts` `requestControllerProposal` | async |
| 6 | AuthorizationStage | `stages/authorization.ts`: `authorizeTurn`, then `assembleTurnCommands` | sync |
| — | Final preparation | `campaign.prepare(...)`, kept **visible** in `runTurn` | sync |
| 7 | AuditStage | `stages/audit.ts`: `createNarrationAuditor`, `deliverDraft`, `reconcileNarration` | sync; reconciliation async |
| 8 | CommitPreparation | `stages/commit-preparation.ts` `prepareCommit` | sync |
| — | Commit | `checkpoint(); campaign.commit(plan.receipt)`, adjacent in `runTurn` | sync |
| — | Publication | inline history and participant updates, plus the `stages/result.ts` `assembleTurnResult` helper | sync |

**Design decisions:**

- **Intent resolution and projection are one module with two functions.** The gap audit rejected a standalone ProjectionStage, but the failure code switches between them (`context_invalid` → `invalid_runtime_intent`, and only when there are runtime effects). Two functions in one module let that switch stay visible in `runTurn`.
- **Retrieval reuses the existing `retrieveForTurn`.** It was already the stage function; wrapping it would add nothing. Retrieval semantics are untouched (H3 scope).
- **The commit call is not extracted** (brief §20). `prepareCommit` returns a receipt, and `runTurn` commits it on the line after `checkpoint()`.
- **There is no PublicationStage.** Result assembly is formatting, so `assembleTurnResult` is a helper.
- **No framework, registry, middleware, DI container or Result monad.** These are plain functions with plain input and output structs.

---

## F. Stage contracts

Every stage takes one typed input object and returns an immutable typed output. Mutation capabilities are passed as functions, never as objects.

| Stage | Input (selected) | Output | Failure mapping (code held by coordinator) | State authority |
|---|---|---|---|---|
| `resolveTurnIntent` | `IntentStageInput` {world, snapshot, base_revision, player_input, `prepare`, `plan`, finalized} | `ResolvedIntent` {base_context, base_plan, intent: `TurnIntent`, promotion} | `context_invalid`, or a raised TurnError | `prepare` for **prevalidation only**; no receipt kept |
| `projectTurnIntent` | `IntentStageInput` + `ResolvedIntent` | `ProjectedTurn` {projected, context, origin, arrival, movable, prompt_intent, scene} | `invalid_runtime_intent` when there are runtime effects, else `context_invalid` | projection receipt detached, **never committed** |
| `composeTurnPrompt` | input, context, recent, retrieved, prompt_intent, options, scene | `TurnPrompt` {recent, prompt} | `retrieval_failed` | none |
| `createDraftGenerator` | narrator, signal, `checkpoint` | `DraftGenerator` → `NarratorDraft` {text, result} | `narrator_failed` + provider code; `context_too_large` over 24k characters | none |
| `requestControllerProposal` | controller, signal, base_revision, context, intent, movable, projected, input, draft | `ControllerProposalOutput` {prior_state, result} | `controller_failed` + provider code | **proposal only** |
| `authorizeTurn` | controller result, intent, draft, context, projected, movable, origin, arrival, world, mode, sink | `AuthorizationOutcome` {proposal, turn_evidence, diagnostics} | `controller_failed` | decisions only (detached) |
| `assembleTurnCommands` | diagnostics, intent, projected | `TurnCommands` {authorized, commands} | `controller_failed` | pure |
| `createNarrationAuditor` | base_revision, context, world, retrieved, input, recent, intent, scene, evidence, diagnostics, authorized, prepared | `NarrationAuditor` {access, check(), outcome()} | `campaign_validation_failed` | pure |
| `reconcileNarration` | auditor, generate, `checkpoint`, prompt, draft, issues, outcome, intent, context | `TurnDelivery` | `narrator_failed` | chooses text only |
| `prepareCommit` | world, `prepare`, prepared, commands, finalized, input, delivered, scene, base_revision, location_changed, on_skip | `CommitPlan` {receipt, identity, identity_skipped?} | `campaign_validation_failed` (identity failures are caught) | re-prepares the **whole** batch; never commits |

**Why there is no TurnWorkingState.** The brief allowed one; I didn't introduce it. Immutable per-stage outputs, destructured in `runTurn`, already make the data flow explicit. A bag would only have hidden the same values behind one name.

---

## G. Extracted modules

| Module | Lines | Exports | Responsibility |
|---|---:|---|---|
| `stages/intent.ts` | 107 | `IntentStageInput`, `TurnIntent`, `ResolvedIntent`, `resolveTurnIntent`, `ProjectedTurn`, `projectTurnIntent` | slash/natural intent, movement/wait/mana, carry, person transactions, prevalidation, projection, left-behind note, scene plan |
| `stages/narration.ts` | 48 | `NarratorRequest`, `TurnPrompt`, `composeTurnPrompt`, `NarratorDraft`, `DraftGenerator`, `createDraftGenerator` | prompt composition; streamed, buffered draft generation |
| `stages/controller.ts` | 31 | `ControllerProposalOutput`, `requestControllerProposal` | prior-state envelope; controller call |
| `stages/authorization.ts` | 73 | `AuthorizationOutcome`, `authorizeTurn`, `TurnCommands`, `assembleTurnCommands` | strict parse; evidence plus narrated movements; authorization; omission debug; acquisition provenance; candidate batch |
| `stages/audit.ts` | 81 | `TurnDelivery`, `NarrationAuditor`, `createNarrationAuditor`, `deliverDraft`, `reconcileNarration` | narration audit (grounding, transfers, purchases, household, conditions, constraints, presence, departures), reconciliation, redaction |
| `stages/commit-preparation.ts` | 42 | `CommitPlan`, `prepareCommit` | identity establishment on delivered narration; whole-batch re-prepare; observable skip |
| `stages/result.ts` | 44 | `assembleTurnResult` | `TurnResult` formatting |

`TurnDebugRecord` moved to `turn-types.ts` (still re-exported from `turn-coordinator.ts`), so stages can type the debug sink without importing the coordinator and creating an import cycle.

---

## H. runTurn before / after

**Before:** 181 lines in which every phase was inlined, including an inline async generator closure, two try/catch prevalidations, a debug-omission loop, acquisition mapping, audit closures, reconciliation with three reassigned locals, the identity try/catch and a 10-field result literal.

**After:** 111 lines that read as the algorithm:

```text
TurnInputStage          lock · bound input · checkpoint · capture snapshot · turn_started · checkpoint
IntentResolutionStage   resolveTurnIntent → [stage=invalid_runtime_intent if runtime] → projectTurnIntent
RetrievalStage          stage=retrieval_failed · await retrieveForTurn · checkpoint · composeTurnPrompt
NarrationStage          stage=narrator_failed · await generate(prompt) → draft · checkpoint · controller_started
ControllerStage         checkpoint · stage=controller_failed · await requestControllerProposal · checkpoint
AuthorizationStage      authorizeTurn · state_proposed (frozen) · checkpoint · assembleTurnCommands
Final preparation       stage=campaign_validation_failed · campaign.prepare(whole batch) · checkpoint
AuditStage              auditor.check(draft) → [if issues: outcome · stage=narrator_failed · await reconcileNarration · stage=campaign_validation_failed]
CommitPreparation       prepareCommit (identity, or observable skip)
Commit                  narration_delta · narration_completed · checkpoint(); campaign.commit(plan.receipt)
Publication             recent.add(finalized) · participants.commit/retire · assembleTurnResult · state_committed · turn_completed
```

**Spanning `let` locals: 14 → 5.**

- `stage`, `shown`, `recorded`, `owned` — required by the failure path and `finally`.
- `delivery` — reassigned only when reconciliation runs.

Every other value is a `const` stage output.

---

## I. Authority preservation

- **CampaignState remains the sole authority.** Stages receive `prepare` as a function. `prepareCommit` re-prepares the whole candidate batch against `base_revision`; no domain is prepared or committed on its own.
- **No stage can commit.** A source-level guard test (`turn-stages.test.ts`) asserts that no stage module imports `CampaignState` or calls `.commit(`, that the coordinator has exactly one `campaign.commit(`, and that the line immediately before it is `checkpoint();`.
- **Proposal ≠ authorization is explicit in the types.** The controller stage returns `ControllerProposalOutput`; only `authorizeTurn` produces decisions, and only `campaign.prepare` validates them.
- **No retained mutable references.** No stage keeps a `CampaignState` or `SceneParticipants`. The `prepare` and `plan` capabilities are lambdas evaluated at call time, so test seams that override `campaign.prepare` still observe every call. The golden trace relies on exactly this.
- **Projection stays detached.** A direct stage test asserts that a projected `/wait 30` is visible in the projected snapshot, with zero commits, revision unchanged, and the base snapshot object identical.

---

## J. Async / stale / cancellation invariants

| Measure | Pre-H2 | Post-H2 |
|---|---|---|
| Semantic async phases | 4: retrieval, narrator, controller, reconciliation | **4, same order** |
| `checkpoint()` sites in total | 11 | **11.** 9 in `runTurn`; 2 moved with their code as the passed `checkpoint` capability: per streamed event in `createDraftGenerator`, and after the revision in `reconcileNarration` |
| Awaits / yields in `runTurn` | 6 / 9 | 5 / 9 (the inner `for await` moved into the generator) |
| New asynchronous work | — | none |

`tests/turn-pipeline-invariants.test.ts` was written **before** the refactor and passed both before and after:

- **Cancellation:**
  - before provider work: no narrator, controller, prepare or commit
  - during narrator streaming
  - after narration, before the controller (controller never called)
  - after the controller, before final preparation (zero prepares)
  - immediately before commit, on a carry turn: no move, no time advance, no finalized history

  In every case there is no delivered unaudited draft and the snapshot object is identical.
- **Staleness** during retrieval, narration, the controller call and reconciliation: `stale_turn`, only the external change commits, and the turn's candidate never commits.

---

## K. Failure mapping

All 11 `TurnFailure` codes and their semantics are unchanged. `tests/turn-failures.test.ts` (H1, 14 tests) passes unchanged, including its coverage assertion. The `stage` mechanism is preserved rather than replaced, because replacing it with per-stage error wrapping would change which code some edge-case exceptions receive. That replacement is listed as optional debt (section R). Distinct errors are not collapsed.

---

## L. Audit / reconciliation ownership

`stages/audit.ts` is the single owner. `TurnDelivery` distinguishes:

- `draft`: the original draft
- `issues`: the audit issues found in it
- whether reconciliation was attempted: `revision` is present
- the reconciliation result: `revision_issues`
- whether redaction was used: `delivered === "redacted"`
- the final delivered `text`

Audit internals are not rewritten. Direct stage tests (`turn-stages.test.ts`) cover:

- clean narration delivered unchanged;
- an issue-bearing draft triggering exactly one reconciliation request;
- a clean revision being delivered;
- a failing revision being deterministically redacted, with the offending sentence removed;
- a stale or cancelled checkpoint after the revision call meaning the revision is never delivered;
- auditing, reconciling and redacting leaving the snapshot identical with zero commits, so a narrated-but-uncommitted ring handover never becomes state.

**The four H1 `todo` cases are not fixed** (brief §17) and remain exactly 4.

---

## M. Identity / promotion preservation

Both H1 coordinator behaviours survive, now owned by `prepareCommit`:

- **`identity_skipped`:** the result field plus the debug-sink `identity_establishment_skipped` record. Verified by the H1 stress test (an injected identity failure; the rest of the turn commits) and by a direct `prepareCommit` test (the receipt stays the final preparation; the skip is reported; no commit).
- **`location_changed`:** passed as `origin !== arrival`. Verified by the H1 stress test (Tomas is not promoted inside Heartstone) and a direct stage test.

---

## N. RecentConversation ordering

These are preserved and asserted in `turn-pipeline-invariants.test.ts`:

- History is empty during provider work and **at the moment of commit**.
- The delivered narration is recorded as `finalized` only after the commit.
- A failed turn's undelivered draft is never retained. When narration existed, the delivered text, or `""`, is kept as a `state_failed` diagnostic and excluded from the prompt.

The golden trace pins the recent entries for all five scenarios.

---

## O. Coupling metrics

| Measure | Before | After |
|---|---:|---:|
| Coordinator import sources | 26 | 19 |
| …of which low-level turn-domain modules | 13 | **1** (`retrieval-policy`, the retrieval stage function) |
| …of which stage modules | 0 | 7 |
| Barrel / re-export modules created | — | 0 |
| Conceptual responsibilities inlined in `runTurn` | ~14 | 0 (orchestration only) |
| `buildTurnContext` calls per turn | 3 | **3, unchanged** |
| `campaign.prepare` call sites | 5 inline | 4 (1 inline final + `prevalidates` helper + projection + identity); calls per turn unchanged, as the golden proves |
| Authoritative commits | 1 | 1 |

The lower import count reflects real cohesion. The coordinator imports stage functions, and each stage imports its own domain modules; nothing is re-exported to hide dependencies.

**The three `buildTurnContext` calls, and why each exists:**

1. **Base context** (`resolveTurnIntent`): intent and participants resolve against the captured snapshot.
2. **Projected context** (`projectTurnIntent`): built only when runtime effects changed the snapshot (`projected !== snapshot`). Otherwise the base context is reused, exactly as before.
3. **Prepared context** (`prepareCommit`): identity establishment must see the post-authorization candidate (for example a just-purchased person).

These are three different snapshots, so none was consolidated.

---

## P. Performance sanity

Full fixture turns with instant mock providers, so only deterministic work is timed. Each figure is 150 iterations after 20 warm-ups, median of 3 runs:

| Turn | Pre-H2 | Post-H2 | Change |
|---|---:|---:|---|
| reconciled handover (fixture world) | 4.62 ms | 4.62 ms | none |
| retrieval lore query (fixture world) | 3.49 ms | 3.18 ms | within noise |
| carry + travel (real Calderan world, includes campaign setup) | 45.0 ms | 45.0 ms | none |

No extra deep copies, serializations, context builds or world scans were introduced; the golden prepare trace confirms an identical prepare sequence.

There is one equivalence-preserving simplification: `TurnResult.context_characters.knowledge_access` measures the auditor's projection instead of recomputing `projectKnowledgeAccess` with identical arguments. The function is pure, and the golden pins the field, so the result is byte-identical.

---

## Q. Regression matrix

| # | Regression | Covered by | Result |
|---|---|---|---|
| A | Maren purchase + carry, Slave Market → Heartstone | `location-continuity` (Regression A); golden `success_carry_travel` | pass |
| B | seller stays behind | `location-continuity` (A, same-turn purchase + carry) | pass |
| C | Tomas stays behind when Nicco travels | `location-continuity` (B); `identity-continuity-stress` | pass |
| D | Tomas resurfaces on return | `location-continuity` (B); `identity-continuity-stress` | pass |
| E | same character survives late naming | `identity-continuity-stress` (late naming after a scene change, save/load) | pass |
| F | same-name characters remain distinct | `narrated-promotion:150`, `narrator-persistence:91-105` | pass |
| G | purchase does not imply household | `location-continuity`, `household-turns` | pass |
| H | household does not imply following | `location-continuity` (controller path) | pass |
| I | failed route does not move or advance time | `city-travel:136`; core route properties | pass |
| J | stale turn does not commit | `turn-failures`; `turn-pipeline-invariants` (4 phases); golden stale scenario | pass |
| K | narrator failure does not commit | `turn-failures` (4 variants) | pass |
| L | invalid controller output does not commit | `turn-failures` (`structured_output_invalid`, timeout, rate limit); golden | pass |
| M | reconciliation fallback does not commit twice | `turn-pipeline-invariants` (revision **and** redaction: 1 commit each) | pass |
| N | identity skip still lets unrelated state commit | `identity-continuity-stress`; `turn-stages` | pass |
| O | naming during movement stays `location_changed` | `identity-continuity-stress`; `turn-stages` | pass |
| P | "Dell and Bram argue. He leaves." stays ambiguous | `identity-continuity-stress` | pass |
| Q | "Dell glares at Bram. He leaves." keeps subject continuity | `identity-continuity-stress` | pass |

Focused suites re-run: turn-coordinator, turn-failures, language-gates, language-call-paths, core-properties, narration-survives-audit, identity-continuity-stress, narrator-persistence, location-continuity, evidence-authorization, controller-reliability, runtime-continuity-repair-1, live-regression-repair, household-turns, narrated-promotion, persistence, city-travel, retrieval, lexical and semantic search. All green.

**Scope confirmation:** no change to retrieval semantics, context caps, the save format, provider policy (no retry, fallback or timeout changes), gameplay features, the command surface or language gates, and no NPC+ code.

---

## R. Remaining H2 debt

1. **`stage` is still a mutable failure-mapping variable.** It is preserved deliberately for exact code semantics. A future pass could give each stage its own error mapping, but that must prove identical codes for every non-`TurnError` path.
2. **Stage inputs are wide.** For example, `assembleTurnResult` takes 24 fields and `createNarrationAuditor` takes 12. They are explicit and typed, but wide; they could narrow once H4 defines `TurnDiagnostics`.
3. **`runTurn` is 111 lines,** mostly because of the codebase's long-line style. The structure, not the line count, is what changed.
4. **No per-stage timings were added.** H4 owns diagnostics. Stage boundaries now make timing them trivial.
5. **The three subject/pronoun resolvers are not consolidated.** Their semantics differ (H1, section C); a behaviour-preserving merger was not demonstrable.
6. **The golden file (178 KB) pins exact prompt text.** That is intended, but any deliberate prompt change elsewhere needs a reviewed `H2_UPDATE_GOLDEN=1` regeneration.
7. **The four H1 `todo` over-redaction cases remain.** They are now cleanly owned by `stages/audit.ts` and `narration-audit.ts`.

**Score projection (JUDGEMENT, not an official rescore; H6 owns that):**

| Dimension | Projected change | Basis |
|---|---|---|
| Architectural clarity | +4 to +6 | the 14 inline responsibilities are now 7 owned stages, with an explicit authority boundary |
| Maintainability | +5 to +8 | `runTurn` characters −52%, spanning locals 14 → 5, low-level coordinator imports 13 → 1 |
| Extensibility | +4 to +7 | NPC+ turn behaviour can extend one stage instead of editing the generator |
| Test coverage | +1 to +2 | golden pipeline, invariants and direct stage contracts (+25 tests) |

---

## S. H3 readiness

**Ready.** The H3 targets now each have one clear owner:

- **`known_by` / narrator knowledge projection:** `createNarrationAuditor` (`projectKnowledgeAccess`) and `composeTurnPrompt`, both reading `narrative-authority.ts`.
- **Context-cap tiering:** the two `buildTurnContext` calls in `stages/intent.ts` and the one in `prepareCommit` — all three are documented above.
- **Retrieval metrics and policy:** the retrieval stage (`retrieveForTurn`), unchanged and isolated.

The golden trace and invariants will flag any H3 change that unintentionally reorders stages or alters prompts. An H3 change that *intends* to alter prompts or context should regenerate the golden deliberately and review the diff.

CALDREVAN HARDENING H2 COMPLETE
