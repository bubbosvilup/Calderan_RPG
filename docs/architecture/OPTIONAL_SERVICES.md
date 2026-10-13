# Core engine and optional services

Status: Current. Introduced by consolidation block 6 (2026-10-12); re-checked 2026-10-13 after block 11 (no optional-service change). Source of truth: `src/app/optional-services.ts`, `src/app/game-session.ts` (`#launchOptional`), `src/app/production.ts`, `src/app/item-sprite-jobs.ts`, `src/turn/optional/mannerism-extraction.ts`, `src/turn/optional/reflection.ts`. Report: `docs/evaluations/CONSOLIDATION_BLOCK6_CORE_OPTIONAL_SPLIT.md`.

## 1. The boundary

**Core engine** (inside the correctness boundary): CampaignState and its prepare/commit with `expected_revision`, persistence, the turn authority path (Narrator, Controller, audit, commit, publication), identity and lifecycle, movement, items, trade, legal state, household and NPC+ state, PendingConfirmation, turn idempotency.

**Optional services** (outside it): Reflection, Mannerism learning, portrait generation, item sprite generation, sprite QA, semantic retrieval.

**OPTIONAL SERVICE INVARIANT.** An optional service may add enrichment or media. It can never be required for a valid turn, a save or load, or an authoritative output. Disabling it means "feature absent", never "engine degraded". An optional failure never fails a turn, never blocks the next turn and never reaches the player as narration.

## 2. Registry and configuration

`resolveOptionalServices(overrides, env)` is the one canonical resolution: **defaults < environment < explicit `optional_services`** (`createProductionDeps` also maps the legacy `reflection_mode` and `enable_emergent_mannerisms` options). It is runtime configuration only: it is never CampaignState, never saved, and no domain module reads a provider feature flag. `createProductionDeps` builds providers from the resolved flags (no reflection provider when Reflection is off, no sprite reviewer when QA is off, no semantic index unless explicitly enabled and given a provider). `GameSession` computes its effective set with `effectiveOptionalServices`: a flag can switch a *wired* service OFF but never invent a provider.

| Service | Default | Environment | Provider / model |
| --- | --- | --- | --- |
| Reflection | OFF (shadow, D-09 deferred) | `CALDREVAN_REFLECTION_MODE` (`off`/`shadow`) | `anthropic/claude-haiku-5.5` |
| Mannerism learning | ON | `CALDREVAN_MANNERISM_LEARNING` | extractor, default `openai/gpt-6-luna` |
| Portrait generation | ON | `CALDREVAN_PORTRAIT_GENERATION` | Hugging Face router, fal-ai pinned |
| Item sprite generation | ON | `CALDREVAN_ITEM_SPRITES` | same image stack |
| Sprite QA | OFF | `CALDREVAN_SPRITE_QA` | `anthropic/claude-haiku-5.5` reviewer |
| Semantic retrieval | OFF (parked) | `CALDREVAN_SEMANTIC_RETRIEVAL` | opt-in dev embedding provider |

Values: `on|true|1|yes|shadow` and `off|false|0|no|none`; anything else throws.

## 3. OFF semantics (normative; typed as `OFF_CONTRACT`)

| Service | OFF: new work | Existing enrichment | Narrator sees existing | UI shows existing |
| --- | --- | --- | --- | --- |
| Reflection | no call, no new note, no maintenance | validated persisted notes are **SOFT-PROMOTED**: kept and Narrator-visible | yes | yes |
| Mannerism learning | no extractor call, no observation, no promotion, no maintenance | promoted/established mannerisms still reach the Narrator; raw observations and candidates are **never** a runtime substitute | yes | yes |
| Portrait generation | no new generation; the request declines cleanly | generated media, selected avatar and full body keep rendering | no | yes |
| Item sprite generation | no automatic job, not even a pending marker | existing sprites render; items work without a sprite | no | yes |
| Sprite QA | zero reviewer calls; generation still accepts its first valid image deterministically | accepted sprites stay usable | no | yes |
| Semantic retrieval | no embedding or model call | n/a | no | no |

Every service can be switched on again later with its stored enrichment intact.

## 4. Core completion boundary

A core turn is complete after the Narrator result, Controller, audit, commit and publication (`turn_completed`, then `status_changed(idle)`). Optional post-turn work is **launched after that**, detached, and never awaited by the caller:

- The optional task does not own the turn lock; the session is `idle` while it runs and the next turn can start. `post_turn` is no longer a session status in practice.
- Provider work runs without any lock. Every legacy CampaignState write it makes is gated by `can_commit` (idle, not suspended, not aborted); a write that loses the race is dropped and recorded as `write_deferred_core_priority`.
- Optional failures are recorded in the service monitor only (`GameSession.getOptionalServices()`, `GET /api/optional-services`). They never appear in the transcript, never fail a turn and never produce an unhandled rejection.
- Optional legacy writes still bump the revision (ARCH-1 phase 2). A client's `expected_revision` stays valid when every later revision was an optional write. Portrait batch commits are **not** treated as optional (stale-gallery protection).
- Still awaited in the turn path: context compaction. `portraitBusy` still guards portrait mutations, autosave readiness and campaign switching, but no longer blocks a core turn.

## 5. Service health

`OptionalServiceMonitor` keeps `{service, enabled, running, last_success_at, last_error:{at, code}}` per service. It is runtime metadata, not CampaignState: reading or recording it never changes a revision. The error code is a sanitized snake_case token; provider text never leaks.

## 6. Architecture Consolidation Gate (historical, satisfied by block 7)

**NO NEW MAJOR GAMEPLAY/DOMAIN SYSTEMS BEFORE BLOCK 7 COMPLETES.** (Block 7 completed; see section 8.)

Blocked: Property, Heartstone expansion beyond the existing rite, quests, combat, new NPC subsystems, new LLM subsystems, new semantic-act grammars.
Allowed: bug fixes, test infrastructure, documentation, UI over existing stable domains, Weather UI.

## 7. Storage and revision separation (Block 7, DONE)

**Reflection classification.** Reflection notes are SOFT-PROMOTED DURABLE ENRICHMENT, not authoritative gameplay state. Both the reflection journal/scheduling/pending bookkeeping and the validated persisted notes live in the **learning** side store: durable, Narrator-visible with the producer OFF, never revision-bearing. "Soft-promoted" means trusted durable narrative enrichment, not gameplay truth. Promoted/established mannerisms and selected avatar/full-body references stay authoritative in the snapshot; mannerism observations/candidates/journal live in the learning store; item sprite bookkeeping and the portrait Gallery live in the **media** store.

**ARCH-1 is CLOSED** (phase 1 lifecycle in block 6, phase 2 storage and revision separation in block 7). Optional writes land in the composed view, are routed by the persistence layer to the side stores and never bump the semantic revision, so the block 6 optional-revision tolerance is gone and `expected_revision` is a strict equality. Storage layout, markers, precedence and the migration protocol: [Persistence](PERSISTENCE.md#optional-side-stores-block-7-save-file-and-persisted-snapshot-schema-8).

**Context compaction is CORE, not optional.** It is derived and non-authoritative (it reads a `NarratorRequest` and never touches `CampaignState` or any store), but the next turn is rejected with `context_too_large` while `compaction_required`, so it is a turn-path availability concern. It stays awaited after the commit in `GameSession` (failure is an ignored warning, not a turn failure) and is deliberately outside the optional-service registry. Pinned by `tests/optional/optional-store-domains.test.ts`.

## 8. Architecture Consolidation Gate

Block 7 passed: the gate is COMPLETE. Blocks 8-12 of the consolidation roadmap remain recommended, not started.
