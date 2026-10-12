# Consolidation Block 7: optional state migration / side stores

Date: 2026-10-12. Baseline: main `865ddbb` (block 6), 3480/3480. Scope: persistence and migration only. No gameplay, NarrationFacts, event bus, PER-2/ID-2 redesign, new LLM subsystem, generic database or automatic identity repair was added.

**Verdict: ARCH-1 CLOSED. Consolidation Gate COMPLETE.** Optional enrichment and media bookkeeping lives in two campaign-bound side stores, becomes authoritative only through an explicit per-domain marker persisted in the save, and never moves the semantic revision.

## 1. Baseline and final migration inventory (Phase 0)

Baseline at start: HEAD `865ddbb`, typecheck and build clean, `npm test` 3480/3480. Final: 3520 tests, typecheck and build clean (section 14).

Classification (every optional-service field found was classified; nothing was left implicit):

| Field (schema path) | Class | Writers (before) | Readers | Revision before -> after | Target | Migration key | Marker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `premium_reflections[]` (journal, `last_reflected_revision`, validated `notes[]`) | MOVE (soft-promoted durable enrichment, NOT gameplay truth) | `record_reflection` via `reflectStructuredAfterTurn` | `npc-plus.ts` (Tier B / deep refs), `validation.ts` | +1 -> none | learning store | `character_id`, note `id` | `optional_state.learning` |
| `mannerism_learning` (`sequence`, `processed_sequence`, `last_turn_id`, `journal[]`, `candidates[]`) | MOVE | `maintainMannerisms` via mannerism extraction | `mannerism-extraction.ts`, `character-repair.ts`, `validateMannerismLearning` | +1 per observation batch -> none (promotion: +1) | learning store | `sequence`, candidate `id`, `canonical_key` | `learning` |
| `items[].sprite` (`pending` / `ready` / `failed` + asset metadata) | MOVE | `set_item_sprite` via `ItemSpriteJobs` | inventory UI, sprite serving, asset retention | +1 -> none | media store | `item_id` | `media` |
| `portraits[].versions[]`, `.reference` (history, prompt / seed / model / cost) | MOVE | `record_portrait_batch`, `delete_portrait_version`, `set_portrait_reference` | portrait views, retention | +1 -> none | media store | `character_id`, `version_id` | `media` |
| `portraits[].avatar_version_id`, `.full_body_version_id` | KEEP AUTHORITATIVE (explicit player selection) | `set_portrait_avatar`, `set_portrait_full_body`, first batch | views, prompts | +1 -> +1 | snapshot `portrait_selections[]` | `character_id` | n/a |
| `premium_characters[].mannerisms` (promoted / established) | KEEP AUTHORITATIVE | promotion, manual add / edit / delete | Narrator context | +1 -> +1 | snapshot | n/a | n/a |
| `active_household_member`, `empty_slots`, `price_indices`, premium history diffs | OUT OF SCOPE (PER-3 remainder, unchanged) | engine | engine | unchanged | snapshot | n/a | n/a |
| `turn_receipts`, `interaction_metadata`, `continuity` | already outside `CampaignState` | | | unchanged | save envelope | n/a | n/a |
| Context compaction | decided CORE (section 10) | | | none | n/a | n/a | n/a |

## 2. Side-store foundation (Phase 1)

Two logical stores under `<campaign>/optional/`: `learning.json` and `media.json` (`src/persistence/optional-store.ts`).

* Layout: `{format:"caldrevan_optional_store", store, store_version, campaign_id, bound_revision, saved_at, content_sha256, data}`. Each store has its OWN version (learning 1, media 1), independent of the save version.
* Campaign binding: `campaign_id` must equal the campaign; `bound_revision` records the snapshot revision it was written beside.
* Atomic write: temp file (`writeNew`: exclusive, flushed, fsynced), rename, directory fsync; a failure removes the temp; the previous store is kept byte for byte. An interrupted temp is never read.
* Integrity: malformed JSON, missing / extra keys, wrong store name, wrong campaign, unsupported version, truncation and a digest mismatch are all `optional_state_invalid` (SHA-256 of canonical data; an integrity check, not a signature).
* Domain-shaped access: `extractOptionalState(snapshot)`, `toPersistedSnapshot`, `fromPersistedSnapshot`, `clampLearning` (`src/campaign/optional-state.ts`); services never touch the files, the repository does.
* Tests (`tests/block7-store.test.ts`, 7): create / rewrite / reload round trip, wrong campaign, wrong store, unsupported version, malformed set, interrupted temp ignored, failed rewrite keeps the previous store, independent stores, partitions, persisted-composed round trip, store write is not a revision.

## 3. Main save schema and markers (Phase 2)

Save file schema **8** (`CURRENT_SAVE_VERSION`), persisted snapshot schema 8; the in-memory composed `CampaignSnapshot` stays schema 7-shaped. Envelope field `optional_state: {learning?: {version, completed: true}, media?: {...}}`. Migration `7 -> 8` is version-only (it refuses a v7 file that already carries `optional_state`). Markers are per domain; a marker newer than supported is `unsupported_version`; a malformed marker is `invalid_save`. A persisted snapshot with a migrated store has the store's fields removed and gains `portrait_selections`. One leniency, deliberate: a COMPOSED schema-7 snapshot inside a schema-8 envelope is accepted only while no marker is present (an in-memory file round trip, as `createSaveFile` returns); with any marker the snapshot must be the schema-8 persisted shape.

Precedence (pinned by tests): marker absent -> snapshot wins (even if a different store exists); marker present + valid store -> store wins, stray inline copies ignored; marker present + missing / corrupt / foreign / wrong-version store -> hard `optional_state_invalid`, with no fallback to the snapshot, another slot or a backup; the existence, revision, timestamp or save version of a store is never used to infer completion.

## 4. Migration runner and crash boundaries (Phase 3)

Implemented inside `FileCampaignRepository.saveCampaign` (idempotent; no dual-writer period):

1. Not migrated on disk (new campaign, schema <= 7 save, or only one marker): MIGRATION ORDER. Build the complete stores (deterministic), write and fsync both (atomic), persist the schema-8 snapshot carrying the markers in the usual atomic rename. Only that rename flips authority.
2. Migrated: STEADY ORDER. Snapshot first, then the stores whose content digest changed. A crash leaves a store BEHIND the snapshot, never ahead.

Crash injection through the `SaveFileSystem` seam (`faultFs`, `tests/block7-migration.test.ts`), each on a real v7 file:

| Point | Failure injected | Marker after crash | Authority on reload | Rerun |
| --- | --- | --- | --- | --- |
| A | before any store write | absent | snapshot (file byte-identical) | safe |
| B | after the temp write, before the store rename | absent | snapshot | safe |
| C | after the store rename, before its fsync / the marker | absent | snapshot | safe |
| D | after both stores durable, before the snapshot save | absent | snapshot | safe |
| E | during the snapshot save, before the atomic rename | absent | snapshot | safe |
| F | after the marker persisted | present | side store | complete |

After every case a healthy rerun produced identical state, no duplicate rows (one reflection note, one journal row, one candidate, three gallery versions, three sprites), valid stores, and an unchanged store digest on a further save (idempotency). Steady-state crash: an authoritative change plus an optional change saved with the store write failing leaves the authoritative change durable and the store merely older; the next save catches up. A store newer than its snapshot (an older slot beside the current store) is clamped (`clampLearning`).

## 5. Reflection (Phase 4)

| | |
| --- | --- |
| Legacy path | `snapshot.premium_reflections` |
| New store path | `optional/learning.json` -> `data.premium_reflections` |
| Marker | `optional_state.learning` |
| Algorithm | migration order above; notes, `last_reflected_revision` and scheduling move together, byte for byte |
| Authority before / after marker | snapshot / learning store |
| Crash | A-E snapshot wins, F store wins (section 4) |
| Revision before -> after | each record +1 -> none (notes are stamped with the revision they were derived from; `source_revision <= updated_revision`; the old `+1` stamp and "future revision" assumption were removed) |
| OFF behavior | producer OFF = zero calls and no write; historical notes remain durable and Narrator-visible, read from the learning store (browser point 2b, `tests/block7-domains.test.ts`) |
| Rollback / failure | marker + bad store = hard error; clamp drops notes that postdate an older snapshot |
| Legacy writer removal | the production writer still issues the `record_reflection` command on the composed view, which `corePartition` classifies as optional-only; persistence never writes it into the snapshot. `expected_revision` staleness and the optional-revision tolerance are gone |

Tests: ON writes the learning store only (snapshot carries no note, `premium_reflections` absent, store has the note), revision unchanged, the client's `expected_revision` valid across the background write; OFF historical note visible; ON vs OFF final revision and authoritative state equal.

## 6. Mannerism learning (Phase 5)

Legacy path `snapshot.mannerism_learning`; new path `learning.json` -> `data.mannerism_learning`; marker `learning`. Observations, candidates, journal, `sequence` and `processed_sequence` move; **promoted mannerisms stay in `premium_characters[].mannerisms`**. Observation and journal operations are optional-only (no revision); an actual promotion changes the authoritative partition and bumps the revision exactly once (`created_revision` is `revision + 1`, consistent).

Promotion boundary: the learning store determines the candidate; the authoritative commit is idempotent through the stable canonical key; no side-store revision number is stored in `CampaignState`. Steady order persists the snapshot (with the promotion) before the learning store. Crash test: after the promoted mannerism is durable and the learning store is still behind (candidate not yet acknowledged), the next observation pass drops the stale candidate by canonical key, promotes nothing (`mannerisms_promoted == 0`), keeps the revision and leaves exactly one promoted mannerism. OFF: zero extractor calls, no `mannerism_learning`, promoted mannerisms still reach the Narrator.

## 7. Item sprites (Phase 6)

Legacy `items[].sprite`; new `media.json` -> `data.item_sprites[{item_id, sprite}]`; marker `media`. Views compose item + media at load. pending / ready / failed transitions are optional-only (no revision churn, `stateVersion` advances so autosave and the unsaved indicator still work). A media entry for a nonexistent item is dropped, never resurrected. A missing asset file degrades the media only; the item is untouched. Retention: `retainedAssetReferences` also reads the media store.

## 8. Portraits and Gallery (Phase 7)

Legacy `portraits[]`; new `media.json` -> `data.portraits[{character_id, versions, reference}]` plus authoritative `snapshot.portrait_selections[{character_id, avatar_version_id?, full_body_version_id?}]`. A new batch that selects nothing and deleting an unselected version are media-only; selecting an avatar or full body changes the revision exactly once; deleting a version holding a role fails (`a version holding a role cannot be deleted`); a selection whose Gallery version is missing is KEPT (the record survives with an empty gallery; rendering degrades; no other version is chosen). `validatePortraitRecords` no longer requires a role to name a gallery version for exactly that reason. Product consequence recorded: backups and the previous slot pin selections, not Gallery files; the media store is single-generation, so a deleted Gallery file is released once a save persists the deletion.

## 9. Legacy writer / reader removal (Phase 8)

Removed: the Block 6 `#optionalRevisions` / `#noteOptionalWrite` revision tolerance (`#revisionOk` is a strict equality with `campaign.revision`); the `wrote()` callbacks in mannerism extraction and structured Reflection; the `post_turn` member of `SessionStatus` (the `post_turn_completed` event stays and now means "detached optional work finished"); the "gallery must name a version" validation; the raw inline persistence of migrated fields (the snapshot decoder ignores stray copies once a marker exists).

Retained deliberately, and documented: (1) migration-only legacy reads of the inline fields (a v7 file and an unmarked schema-8 file); (2) the in-memory composed `CampaignSnapshot` type still carries the four migrated fields so that readers and validators (npc-plus, character-repair, inventory) are unchanged. These fields are never persisted into the snapshot of a migrated campaign. The source-level audit is pinned in `tests/block7-domains.test.ts` (repository holds no reflection / mannerism field names; no tolerance; no `post_turn`; strict equality). Also added: `view.session.save.state` and `hasUnsavedChanges` now account for unsaved optional state (`CampaignState.stateVersion`), so an optional-only change is still saved and autosaved.

## 10. Context compaction decision (Phase 9)

**CORE.** Compaction is derived and non-authoritative (it transforms a `NarratorRequest` and has no path to `CampaignState` or to any store), but the next turn is rejected with `context_too_large` while `compaction_required` is set, so it is a turn-path availability concern, not an enrichment. It stays awaited after the commit (a failure is an ignored warning, not a turn failure) and stays outside the optional-service registry. Not redesigned. Recorded in ARCHITECTURE, OPTIONAL_SERVICES and CURRENT_STATE; an invariant test asserts the module imports no campaign-state / persistence / store and that `GameSession#compact` performs no campaign write.

## 11. Legacy-save migration matrix A-K (Phase 10)

`tests/block7-migration.test.ts`; every case asserts load result, authority source, revision stability, authoritative-state equality, save / reload stability, no duplicates and no silent fallback. Cases: A all optional populated; B Reflection only; C Mannerism only; D sprites pending / ready / failed; E portraits multi-version + selected; F none; G already migrated; H interrupted (store exists, marker absent); I marker + valid store; J marker + corrupt store (hard error); K partial temp store. All pass. Fixtures are produced deterministically by `populated(parts)` and `legacyCampaign` (a real save rewritten into the exact pre-block-7 shape), not hand-written JSON.

## 12. Optional ON / OFF matrix (Phase 11)

The block 6 matrix A-G re-run with the STRONGER invariant: identical authoritative state AND identical semantic revision, with no divergence caveat. Mannerism ON vs OFF (`block6-lifecycle`): equal committed-revision delta, equal command kinds, equal `coreOf` state, **equal final revision**, while the ON side demonstrably did optional work (`stateVersion` higher). Reflection ON vs OFF: equal final revision and state. Portrait / sprite OFF and ALL OFF unchanged and passing. The block 6 caveat ("ON ends with a higher revision") is removed from the tests; the block 6 report remains a historical record.

## 13. Block 4 / 5A / 5B / 6 regressions (Phase 12)

The full historical suite passes unchanged in intent: turn_key / expected_revision / receipts / narrator recovery (4), PendingConfirmation and manumission (5A), lifecycle / retire / merge (5B), registry / lifecycle / OFF semantics (6). 41 tests needed mechanical adaptation (schema 8, reading a save together with its stores, the new `optional/` directory, Gallery-growth tests that previously expected a revision bump, Reflection stamps); none asserted a gameplay behavior that changed. Three expectations changed semantically and are called out: (1) a backup no longer pins a deleted Gallery file; (2) a Gallery batch that selects nothing is no longer a revision; (3) a selection naming a missing version is kept instead of invalid.

## 14. End-to-end validation (Phase 13)

* Typecheck clean, build clean. Final suite: **3520 tests (baseline 3480, +40 new)**; one run had 3519 pass and only the known flaky `generation lifecycle (player, fullbody)` failed (untouched, as ordered); its family re-run once passed 14/14.
* Browser (offline, `scripts/block7-browser-check.mjs`, 19/19 checks, 0 provider calls): a real pre-block-7 save loads, loading marks nothing unsaved, the first save migrates (schema 8, markers, fields left the snapshot, revision unchanged) and the UI is unchanged after a reload; a historical Reflection note and a promoted mannerism reach the Narrator request with Reflection OFF; an item sprite appears after gated background generation with no revision change; a second Gallery batch grows the gallery without a revision change; selecting an avatar changes the revision exactly once; a reload reads the side-store state; `expected_revision` stays valid across a turn and its background optional work (two consecutive `/api/turn` requests).

## 15. Live certification (Phase 14)

`src/dev/consolidation-block7-live.ts`, one attempt, no reroll, production GameSession -> TurnCoordinator path, evidence in `docs/evaluations/consolidation_block7_live/`. LIVE A (Mannerism ON): 5 turns, all ok; 11 wire calls (5 Narrator, 5 Controller, 1 extractor); the extractor was detached; revision at turn return equals revision after the detached work settled on every turn; a client's `expected_revision` was accepted afterwards; the saved snapshot carries no `mannerism_learning` (schema 8, markers present) and the learning store holds the journal (sequence 5, processed 4, journal 5). Cost and token totals were not recorded by the harness (11 short calls). LIVE B (Reflection) was not run live: the producer is OFF by default and not safely enabled for a paid run; it is certified deterministically (section 5). The exact final production code was live-run (no production change after it).

## 16. Final debt status

* **ARCH-1: CLOSED** (lifecycle in block 6, storage and revision separation in block 7).
* **REV-1:** the optional-write stale-revision component is closed; the "TRADE COMPLETED" revision-count heuristic is a separate remainder.
* **PER-3:** only the optional-state portion is closed; `active_household_member`, `empty_slots`, `price_indices`, premium history diffs remain.
* **PIPE-3:** stays closed. Remaining optional-state debt: the composed in-memory view still carries the migrated fields (decision: deliberate, documented); the media store is single-generation, so old backups do not carry Gallery history; the learning clamp is conservative (drops, never invents).
* **Consolidation Gate: COMPLETE.** Blocks 8-12 remain the recommended roadmap and are not started.

## 17. Block 8 handoff

Unchanged invariants Block 8 must keep: `CampaignState.prepare/commit` with strict `expected_revision`; turn_key idempotency; PendingConfirmation; lifecycle states; registry OFF semantics; markers decide authority, never store existence; optional writes never bump the semantic revision. New commands that write optional state must be classified in `corePartition` (an optional field added to the snapshot without a partition decision would bump the revision). Fixtures: `tests/block7-fixtures.ts` (`populated`, `legacyCampaign`, `faultFs`) and `tests/raw-save.ts` are the intended entry points for any future migration test.
