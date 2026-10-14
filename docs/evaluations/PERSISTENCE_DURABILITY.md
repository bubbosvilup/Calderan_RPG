# Persistence durability, save-compatible (block B4)

Date: 2026-10-14. Base: main `26fc79f` plus blocks B1 to B3 (uncommitted at the time). Block B4 of the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md), steps P0 to P5 of the [persistence hardening review](NEXT_PERSISTENCE_HARDENING_REVIEW.md), section 6. User decision 3 of 2026-10-14 approved P5 (the two real saves become fixtures). No live provider call, no image generation call.

**Schema numbers and serialized keys are unchanged.** `CURRENT_SAVE_VERSION` is still 8 and `CURRENT_SNAPSHOT_VERSION` still 7: `git diff 26fc79f -- src/persistence/save-migrations.ts` is empty, and the only lines of `src/campaign/snapshot-validation.ts` that changed are two comments whose mojibake dash B3 repaired (no version line). No key was added to, removed from or renamed in the save envelope, the snapshot or the store files; the optional-state markers and their authority rules are unchanged; revision rules are unchanged; no trade offer is pruned. What changed on disk is formatting (compact JSON) and the file layout of `backups/` (each checkpoint gains two store copies beside it).

## Starting assumptions (re-verified)

| # | Assumption | Result |
| --- | --- | --- |
| 1 | Save version 8, snapshot version 7 | True (`save-migrations.ts:5`, `snapshot-validation.ts:23`) |
| 2 | The reader accepts compact and pretty JSON; saves are written pretty | True (`strict-json.ts` is whitespace-agnostic; `serializeSave` and `encodeStore` indented by 2) |
| 3 | Oversize is presented as retryable | True: `serializeSave` threw `invalid_save` (in `FATAL_SAVE`, so autosave stopped for good) and the client said "press Save to retry" for every failure |
| 4 | Stores capped on read, not on write; checkpoints without stores; no media clamp | True: `parseSaveJson` caps every read at 16 MiB, `encodeStore` had no cap, `#checkpoint` copied only the save text, `fromPersistedSnapshot` merged every sprite |
| 5 | Offer ids are highest plus one | True (`trade.ts`, `Math.max(...) + 1`); unchanged (pruning is P6/P7) |

Pre-B4 behavior reproduced on the pre-B4 build before any change: with a sprite drawn after the previous save, loading `previous` failed (`reference_invalid`, the snapshot validator's "sprite does not match visual identity"); with `optional/learning.json` damaged, the current slot, the previous slot and the checkpoint all failed with `optional_state_invalid`.

## P0: measurements

Scale fixture: `tests/support/scale-fixture.ts`, real `data/` world, valid commands only. Shape: 200 characters (40 of them bought people materialized by accepted person offers), 502 facts with one knowledge row each, 100 items (40 from accepted goods offers), 1,000 trade offers (300 person, 700 goods) in negotiations of three or two quotes (each new price supersedes the last), 80 accepted, the rest withdrawn or superseded; 40 person transactions. `npm run measure:save-scale` (offline; the saves go to a temporary directory).

| Measure | Before P2 (pretty) | After P2 (compact) |
| --- | --- | --- |
| `save.json` bytes | 2,297,138 | 1,428,253 |
| Compact bytes of the same content | 1,428,252 | 1,428,252 |
| Pretty-print overhead | 60.8 % | 0 % |
| Side stores (learning / media) | 325 / 336 | 283 / 288 |
| Save, median of 3 (ms) | 755 | 700 |
| Load, median of 3 (ms) | 315 | 210 |
| `prepare` of a one-command batch, median of 5 (ms) | 169 | 220 |
| Building the fixture (s) | 129 | 137 |

Bytes per snapshot key (compact): `trade_offers` 1,137,175 (79.6 % of the file), `facts` 80,990, `characters` 78,654, `knowledge` 52,674, `items` 42,325, `transactions` 10,388, `legal_statuses` 9,441, `runtime` 2,374, everything else under 1 KB; `canon_references` 12,091 outside the snapshot. Average offer: person 1,967 bytes, goods 780 bytes.

Against the review's growth model (section 4): the review estimated 2,858 bytes for a typical person offer and 908 for a one-line goods offer; measured 1,967 and 780 (the fixture's goods offers have one to three lines). The review's illustrative campaign put offers at about 74 % of a 1 MB file; measured 80 % of 1.4 MB. Same order of magnitude everywhere, so no stop condition. Pretty overhead was higher than the measured 38 to 53 % of the small fixtures (60.8 %), because offers nest deeply.

New finding (N7, recorded as PER-13): one `prepare` costs 0.15 to 0.22 s at this scale and a turn runs it up to about five times; building the fixture one batch at a time took about 130 s because each apply validates the whole snapshot. Timings are single runs on the cloud container and only indicative.

## P1: a distinct, non-fatal size code

- `save_too_large` (`src/persistence/errors.ts`) replaces `invalid_save` for an oversized save (`serializeSave`) and an oversized store (`encodeStore`). Its recovery hint and player message say that nothing was written, the last save is intact and progress since then is only in the session; never "invalid" or "damaged".
- The stores are now encoded before any file is touched (`#encodeStores` in `campaign-repository.ts`), so a refusal leaves every slot, store, checkpoint and temp file byte-identical (test).
- The app error is never-retry; it is not in `FATAL_SAVE`. Autosave keeps running but does not retry the same oversized state on a timer: the scheduler gets `retry: false` and waits in `failed` for the next mutation (`src/app/autosave.ts`).
- Quit (`shutdown({ save_reason: "quit" })`) and manual save return `save_too_large`, so the UI tells oversize from corruption.
- Warning threshold `SAVE_WARNING_BYTES` = 12 MiB (75 % of the cap; the register proposed 50 %, but the measured roadmap-scale campaign is at 9 % of the cap, so 50 % would warn on healthy growth): `SavedCampaign.bytes` (largest file written) and `size_warning`, surfaced as `SaveStatus.size_warning`.
- Play UI: the save indicator reads "Save too large"; a banner (`#save-banner`, `role="alert"`) explains it, or warns "close to the 16 MB save limit. It still saves normally." after a large save; an ordinary save clears it.

## P2: compact JSON

The save file and both stores are written as one line plus the trailing newline. The reader already accepted both forms; an older build reads compact files too. Three tests that pinned the pretty form were updated deliberately (`campaign-restore.test.ts` asserts the compact form now; two corruption tests replace keys in compact text). The cap check is unchanged in place, so the same content now has about 38 % more headroom (measured).

## P3: side-store guards

- **N1 (PER-10):** `encodeStore` enforces the read cap at the exact boundary (a store of exactly 16 MiB is written and read; one byte more is `save_too_large`).
- **N2 (PER-11):** each checkpoint is written with a copy of each store, `r<revision>-<timestamp>.learning.json` and `.media.json` beside it (copies first, then the checkpoint, so a checkpoint never exists without them). Loading a checkpoint uses its own copies; one damaged campaign store no longer blocks the checkpoints (test: the current slot refuses, the checkpoint loads, the next save rewrites the damaged store). A checkpoint written before B4 has no copies and loads with the campaign's store, clamped, as before. A copy that exists but is unreadable is `optional_state_invalid`; it is never skipped silently. Rotation deletes the copies with their checkpoint, and stray copies of a checkpoint whose rename never happened (crash-point test). Copies are never listed as slots.
  - Decision taken: a backup loads with its OWN older store, not the current one. The previous slot still reads the campaign's stores (one generation; unchanged).
  - Consequence: asset retention reads each kept checkpoint's media copy, so a deleted Gallery image file stays on disk until every checkpoint that lists it has rotated out (two existing tests updated deliberately to this rule). Before block 7 the save files themselves pinned the gallery the same way.
- **N3 (PER-12):** `fromPersistedSnapshot` drops a ready sprite whose `generated_from_visual_description` is not the slot's item `visual_description` (the failure reproduced above). Gallery versions are not dropped: they carry no revision, and dropping them would orphan paid image files at the next save. A valid save can never hold such a sprite, so no valid save loads differently.

## P4: identity diagnostics at load

`src/campaign/identity-load-diagnostics.ts`, called for every load into `LoadReport.identity_diagnostics` (the browser gets only `identity_warnings`, a count). Warn level, read-only: no repair, no revision, no refusal.

| Kind | Register | Rule |
| --- | --- | --- |
| `duplicate_narrated_ref` | ID-4, N5 | two active materialized characters with the same `ephemeral_ref` at the same materialization location (the one key the review proposes; the three readers keep their own keys, that change is behavior and belongs to P6) |
| `unnamed_twin` | ID-4 | two active unnamed materialized characters with the same label at the same place |
| `counteroffer_subject_changed` | F7 | a superseded person quote and the quote that superseded it (same place, same counterparty, created in the revision that resolved it) plan different subjects |
| `accepted_offer_transaction_missing` | AUTH-8 | an accepted person offer whose settlement names no transaction, or one not recorded |

The scale fixture and both legacy fixtures report no warning.

## P5: the two real saves as fixtures

Copied byte for byte into `tests/fixtures/legacy-saves/`, each with a provenance entry (source, sha256, purpose, user decision) in `tests/fixtures/provenance.json`; the existing architecture test re-checks every hash. Portrait image files and the transcript were not copied (not needed to load).

| Fixture | Source | Content |
| --- | --- | --- |
| `save5-snapshot6/turn_fixture/` | `item-sprite-smoke-assets/turn_fixture/` | envelope 5 / snapshot 6: current r7, previous r4, one checkpoint r4; two ready sprites, optional state inline |
| `save8-stores/turn_fixture/` | `consolidation_block7_live/saves_a/turn_fixture/` | envelope 8, r6, both markers, learning and media stores, two NPC+, continuity |

Finding: neither save loads against `data/` (`reference_invalid` on twelve ids such as `test_room` and `pink_fluffy`). Both were written against the offline turn fixture world (`src/dev/support/turn-fixture.ts`, dataset `sha256:fe4bc97e…`), against which they load with no canon drift; the tests use that world and pin its dataset id. Tests (`tests/persistence/legacy-save-fixtures.test.ts`): every slot of the old save loads (migrated from 5 / 6, counts and sprites as recorded); its first save by this build is compact, carries the markers and reloads to the identical snapshot, and the legacy previous slot stays loadable; the envelope-8 save loads with its stores and round-trips.

## Tests added

| File | Tests |
| --- | --- |
| `tests/persistence/save-size-guard.test.ts` | 8: store cap at the exact boundary; compact files; oversized save leaves every file byte-identical; warning threshold; player message; autosave `retry: false`; session manual save, autosave and quit report the size; session warning status |
| `tests/persistence/store-guards.test.ts` | 7: checkpoint copies; recovery from a damaged store; pre-B4 checkpoint and damaged copy; rotation; asset retention through a copy; N3 older slot; checkpoint crash point |
| `tests/persistence/identity-load-diagnostics.test.ts` | 6 |
| `tests/persistence/legacy-save-fixtures.test.ts` | 6 |
| `tests/persistence/save-scale-fixture.test.ts` | 1 (a tenth of the shape) |
| `tests/ui/campaign-screens.test.ts` | 1 new: "Save too large" and the banner, the warning, the clear |

Tests changed deliberately: `campaign-restore.test.ts` (compact form), `save-repository.test.ts` and `optional-store-migration.test.ts` (key replacement in compact text), `save-format-and-assets.test.ts` and `campaign-lifecycle.integration.test.ts` (a deleted Gallery file is released once the checkpoints listing it rotate out).

## Known limits

- The current and previous slots still share one generation of each store; only checkpoints carry their own.
- `save_too_large` on read: an oversized file found on disk is still reported `invalid_save` (unchanged reader; this build cannot write one).
- Growth itself is untouched (TRD-12 offers stay unpruned; P6/P7 need the schema-9 bump).
- The P4 diagnostics are not shown to the player and nothing acts on them.
- Disk: each checkpoint now adds the two store files (a few hundred bytes for a typical campaign; media metadata grows with the Gallery).

## Validation

Sequential run from a clean `.build` on the B1 to B4 working tree: typecheck and build exit 0; `npm test` **3750 tests, 3750 pass, 0 fail** (+29 over B3); `npm run benchmark:modern` 55/55, 0 known gaps; `npm run check:architecture` 361 modules, 0 runtime back edges; documentation links 0 broken; 51 scripts, 0 syntax errors; all nine browser checks exit 0. No live provider call, no image generation.
