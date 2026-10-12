# Consolidation block 6: core / optional service split (lifecycle only)

Date: 2026-10-12. Base: `main` at `8bb5445` (block 5B). Status: working tree, not committed. Scope: lifecycle and response path only. No domain-event bus, no side-store migration (block 7), no NarrationFacts, no new gameplay, no PER-2/ID-2 redesign, no new LLM subsystem.

Normative companion: [Optional services](../architecture/OPTIONAL_SERVICES.md).

## 1. Baseline and coupling map

Baseline: HEAD `8bb5445`, 3460 tests green, typecheck and build clean.

BEFORE (coupling found):

| Coupling | Where | Effect |
| --- | --- | --- |
| Mannerism bookkeeping and extractor awaited after `turn_completed` | `GameSession#runTurn` `post_turn` status | the turn result and the next input waited for the optional work; the extractor ran every 4th turn |
| Reflection (shadow) awaited the same way | same | same |
| Optional writes mutated CampaignState while the session thought it was between turns | `mannerism-extraction.ts`, `reflection.ts`, `structured-reflection-maintenance.ts` | revision bumps; client clicks went stale |
| Sprite QA mandatory for sprite generation | `item-sprite-jobs.ts` | reviewer failure blocked a sprite |
| Flags scattered (`reflection_mode`, `enable_emergent_mannerisms`, per-provider presence) | `production.ts` | no single place saying what is on |
| Global `portraitBusy` | `game-session.ts` | a portrait batch blocked core turns |
| Reflection notes hidden from the Narrator | `context-builder.ts` | contradicted the decided SOFT-PROMOTED policy |

## 2. Registry and config

`src/app/optional-services.ts`: `OPTIONAL_SERVICE_NAMES`, `OPTIONAL_SERVICE_DEFAULTS`, `resolveOptionalServices` (defaults < environment < legacy options < explicit `optional_services`), `effectiveOptionalServices`, the typed `OFF_CONTRACT`, and `OptionalServiceMonitor`. Runtime config only: never CampaignState, never in the save file (pinned by a test). `createProductionDeps` resolves once and builds providers from the result (`optional_services` is returned in the deps). Environment names: `CALDREVAN_REFLECTION_MODE`, `CALDREVAN_MANNERISM_LEARNING`, `CALDREVAN_PORTRAIT_GENERATION`, `CALDREVAN_ITEM_SPRITES`, `CALDREVAN_SPRITE_QA`, `CALDREVAN_SEMANTIC_RETRIEVAL`.

## 3. Disable semantics

See the OFF table in the normative doc. Summary: producer OFF never calls a provider and never writes new enrichment; existing validated enrichment stays (Reflection notes and promoted mannerisms stay Narrator-visible; media keeps rendering); each service re-enables with its data intact.

## 4. Core turn completion boundary

Core complete = Narrator result, Controller, audit, commit, publication (`turn_completed`), then `status_changed(idle)`. Only after that, `#launchOptional` starts the detached task. It is never awaited, does not own the turn lock, and each CampaignState write is gated (`can_commit`: idle, not suspended, not aborted); a write that loses the race is dropped as `write_deferred_core_priority`. A pending optional task does not reject the next input. `post_turn` is no longer entered (kept in the type only). Still awaited in the turn path: context compaction.

Optional-revision tolerance: a client's `expected_revision` stays valid when all later revisions were optional writes (`#revisionOk`, `#noteOptionalWrite`). Portrait batch commits are deliberately excluded (stale-gallery protection).

## 5. Mannerism

Default ON; extractor `openai/gpt-6-luna` (`MANNERISM_EXTRACTOR_MODEL`); trigger: finalized turn with an eligible NPC+ present, LLM every 4th turn.
- Critical path: BEFORE awaited after `turn_completed`; AFTER detached.
- OFF: no extractor call, no observation, no promotion, no maintenance; promoted/established mannerisms still reach the Narrator; raw observations and candidates are never a runtime substitute.
- Historical enrichment visible: yes (Narrator and UI).
- Storage: `CampaignSnapshot.mannerism_learning`, `premium_characters[].mannerisms`. Revision impact: yes (bookkeeping every eligible turn, observations every 4th). Failure: recorded in the monitor only (`provider_failed`/`malformed`/`write_deferred_core_priority`); turn unaffected.
- Block 7 need: move the journal, candidates and observation bookkeeping to a side store.

## 6. Reflection

Default OFF (shadow, D-09 deferred); `anthropic/claude-haiku-5.5`; trigger: reflection-due evidence for an NPC+.
- Critical path: BEFORE awaited (`post_turn`); AFTER detached.
- OFF: no provider construction in production, no call, no new note, no maintenance. **SOFT-PROMOTED:** validated persisted notes stay Narrator-visible (`context-builder.ts` now always includes them; the old "never shown to narration" statement is superseded).
- Storage: `premium_reflections`. Revision impact: yes when a note commits. Failure: thrown error, failed summary and stale write map to monitor entries; the turn is unaffected.
- Block 7 need: move BOTH the reflection journal/scheduling/pending bookkeeping AND the validated persisted notes to the learning/enrichment side store. Notes are SOFT-PROMOTED DURABLE ENRICHMENT, not authoritative gameplay state: they stay durable and Narrator-visible with the producer OFF, but they must not remain in semantic CampaignState merely because they are soft-promoted, and after Block 7 they must not bump the semantic revision.

## 7. Image, portrait, sprite

- Portraits: default ON (HF router, fal-ai). Never on the critical path (user-invoked batch). OFF: `generateNpcPortraitBatch` declines with `portrait_generation_failed` and no provider call, no revision change; existing media renders. `portraitBusy` no longer blocks a core turn; it still guards portrait mutations, autosave readiness and campaign switching. Storage: `portraits[]` (versions, gallery, roles) plus asset files. Revision impact: yes (batch commit, role changes). Block 7: gallery metadata and generation history to a side store; selected avatar/full-body stay authoritative.
- Item sprites: default ON; queued between turns, never awaited by a turn. OFF: no job, no pending marker, no revision change; the item is usable at once; an existing sprite keeps rendering. Storage: `items[].sprite` (pending/ready/failed). Revision impact: about 2 per item. Failure: `failed` marker, item intact. Block 7: pending/failed/ready bookkeeping to a side store.
- Sprite QA: default OFF; `anthropic/claude-haiku-5.5` reviewer exists only when on. OFF: zero reviewer calls, the first valid image is accepted deterministically.

## 8. Retrieval and dead wiring

Semantic retrieval stays parked: production builds a semantic index only if the flag is on AND an embedding provider is supplied (dev inspection tools only). Lexical retrieval is the core path; a test pins that default production composition instantiates none of reflection, QA reviewer or semantic index. Nothing was deleted: the legacy OpenRouter image client (`src/llm/openrouter/image-client.ts`) is referenced only by `tests/portrait-image.test.ts` and is documented as dead; Voyage and the compressor composition are reachable from dev tools and opt-in env, so they are kept and documented (no proof of unreachability).

## 9. Service health and failure isolation

`GameSession.getOptionalServices()` and `GET /api/optional-services` return `{service, enabled, running, last_success_at?, last_error?:{at, code}}`. Runtime metadata: reading or recording never changes a revision; codes are sanitized tokens (no provider text). Optional errors never enter the transcript and never cause an unhandled rejection (detached tasks end in `.catch`).

## 10. Disabled-services matrix

Tests: `block6-optional-services.test.ts` (7), `block6-lifecycle.test.ts` (8), `block6-sprites-portraits.test.ts` (5). Compared: turn outcome, the turn's own committed revision delta and committed command kinds, and core state (everything except revision, learning journal, reflections, mannerism rows).

| Case | Result |
| --- | --- |
| A normal | baseline, extractor really called |
| B Reflection OFF | zero provider calls, no note; ON writes one note after the turn |
| C Mannerism OFF | zero extractor calls, no `mannerism_learning`, seeded mannerisms still in Narrator lines; core state identical to ON |
| D portrait OFF | request declines, zero generator calls, revision unchanged, core turn plays |
| E sprite OFF | no job, no pending marker, revision unchanged, item transferable |
| F QA OFF | zero reviewer calls, sprite ready |
| G ALL OFF | turn and save succeed, every service reported disabled |

Failure matrix: extractor throws, extractor malformed, reflection provider throws, slow extractor (gate held): turn ok, no `turn_failed`, identical core revision and state, monitor holds the error, next turn runs while pending, no unhandled rejection.

Post-maintenance revision divergence: ON ends with a higher total revision than OFF (extra optional bookkeeping revisions, for example the `finalized` source write that follows the turn). The core turn's own commit is identical. This is the known block 7 residual.

## 11. Block 4 / 5A / 5B regressions

Full suite: 3480/3480 (baseline 3460, +20 new tests). Block 4 (turn_key, expected_revision, receipts, narrator recovery), 5A (PendingConfirmation) and 5B (lifecycle, repair) suites pass unchanged. No flaky failure occurred in either full run.

Old tests that encoded the awaited-post_turn contract were updated (application-closure, D-20 shadow, D10 mannerism x2, NPC+ pass-10 reflection, minor-debt-sweep, production-structured-reflection); the 2 genuine regressions found on the way (stale portrait gallery request accepted; autosave during a portrait batch) were fixed in production code, not in tests.

## 12. End-to-end validation

`scripts/block6-browser-check.mjs`, offline, 15/15 PASS: (1) normal turns with optional ON, extractor really called, health exposed; (2) all services OFF, same turns, zero extractor calls, core state matches; (3) a delayed extractor keeps the UI at "Your turn.", the input enabled and the next turn runs; (4) a failing extractor leaves every turn successful; (5) an item exists and a turn runs while its sprite is pending, sprite ready afterwards; (6) an existing sprite is served as an image; (7) the failure is in service health, not in the transcript. Not browser-covered: portrait gallery with the producer OFF (unit-covered).

## 13. Live certification

`src/dev/consolidation-block6-live.ts`, production Narrator `z-ai/glm-5.2`, Controller `openai/gpt-6-luna`, extractor `openai/gpt-6-luna`, one attempt each, no reroll, run on the final production code. Evidence: `docs/evaluations/consolidation_block6_live/result.json`.
- LIVE A (Mannerism ON, 4 turns on the household fixture): all turns ok; session idle at every return; the extractor batch call started at 27691 ms, after `turn_completed` (27681 ms), and ended at 28194 ms, after the 4th turn had returned (27696 ms); monitor: success.
- LIVE B (Mannerism OFF, same turns): all turns ok, zero extractor wire calls, service reported disabled.
- 19 OpenRouter calls in total (A: 9, B: 10; turn 3 and 4 of B each needed a third call). Tokens and cost were not captured by this harness. Note: `B.extractor_calls` in the JSON is the cumulative list; the verdict uses the B-only slice (0).

## 14. Final debt status

- ARCH-1: **phase 1 fixed, phase 2 open (block 7). Not closed.**
- PIPE-3: fixed (response path). Its revision-bump half stays under REV-1.
- REV-1: mitigated (client revisions survive optional-only writes); side store is block 7.
- PER-3: open (block 7).
- New residuals: context compaction still awaited; `post_turn` remains in the `SessionStatus` type; `portraitBusy` still guards autosave and campaign switching.
- No new major feature began. Architecture Consolidation Gate in force.

## 15. Block 7 handoff: migration inventory and protocol

Classification (all legacy fields currently bump the revision when written, all are in `CampaignSnapshot`):

| Field | Schema location | Writers | Readers | Class / target store |
| --- | --- | --- | --- | --- |
| Reflection journal, scheduling and validated notes | `premium_reflections[]` (`notes`, `last_reflected_revision`); `record_reflection` | `reflection.ts`, `structured-reflection-maintenance.ts` via CampaignState | `context-builder.ts`/`npc-plus.ts` (soft-promoted), recovery refs | MOVE TO SIDE STORE: the journal/scheduling/pending bookkeeping AND the validated persisted notes (soft-promoted durable narrative enrichment, NOT authoritative gameplay truth; durable and Narrator-visible with the producer OFF; no semantic revision bump after Block 7). Target: learning/enrichment side store |
| Mannerism observations, candidates, journal | `mannerism_learning` (`sequence`, `processed_sequence`, `journal[]`, `candidates[]`) | `maintainMannerisms` (`mannerism-extraction.ts`) | `mannerism-view.ts` (developer view), the extractor request | MOVE TO SIDE STORE. Target: learning side store |
| Promoted/established mannerisms | `premium_characters[].mannerisms[]` | promotion in `mannerism-learning.ts`, user edits | `npc-plus.ts`, Narrator | KEEP AUTHORITATIVE |
| Item sprite bookkeeping | `items[].sprite` (`pending`/`ready`/`failed`, asset ref) | `item-sprite-jobs.ts` via `set_item_sprite` | `item-visual-view.ts`, inventory UI | MOVE TO SIDE STORE (media). Target: media side store |
| Portrait gallery and generation history | `portraits[].versions[]` (prompt, seed, model, cost), `reference` | `record_portrait_batch`, `delete_portrait_version`, `set_portrait_reference` | portrait views, `portrait-assets.ts` | MOVE history/gallery metadata. Target: media side store |
| Selected avatar / full body | `portraits[].avatar_version_id`, `full_body_version_id` | `set_portrait_avatar`, `set_portrait_full_body` | UI, Narrator-adjacent views | KEEP AUTHORITATIVE |
| Other generation bookkeeping | `price_indices`, derived `active_household_member`, `empty_slots` (PER-3) | various | various | evaluate case by case; not part of the optional services |
| Core gameplay truth | everything else | n/a | n/a | KEEP AUTHORITATIVE |

Protocol (write the side store idempotently, fsync, write a migration-complete marker into the snapshot, persist the snapshot atomically, authority flips):
- marker absent: the snapshot wins.
- side store exists with marker absent: migration incomplete, rerun idempotently, snapshot wins.
- marker present: the side store wins.
- marker present with a corrupt or incomplete side store: hard recovery error, no silent fallback.

Block 7 also needs: schema bump with migration, removal of the optional-revision tolerance once optional writes no longer touch the revision stream, retiring `post_turn` from the type, and a decision on compaction.

## Files

Modified: `src/app/game-session.ts`, `src/app/item-sprite-jobs.ts`, `src/app/production.ts`, `src/dev/mannerism-calibration-replay.ts`, `src/turn/context-builder.ts`, `src/turn/mannerism-extraction.ts`, `src/turn/reflection.ts`, `src/turn/structured-reflection-maintenance.ts`, `src/ui/server.ts`, six existing tests. New: `src/app/optional-services.ts`, `src/dev/consolidation-block6-live.ts`, `scripts/block6-browser-check.mjs`, three `tests/block6-*.test.ts`, `docs/architecture/OPTIONAL_SERVICES.md`, this report, `docs/evaluations/consolidation_block6_live/`. Docs updated: MASTER_DEBT_REGISTER, MASTER_ROADMAP, ROADMAP, ARCHITECTURE, CURRENT_STATE, TESTING, CONFIGURATION, UI_ENGINE_CONTRACT, IMAGE_SYSTEM, LLM_PROVIDER, README index.
