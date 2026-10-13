# Next persistence hardening review

Status: Proposal, read-only review. Written 2026-10-13 against main `7e5e4ea` plus the uncommitted documentation-only audit reconciliation. Nothing in the repository was changed, built or run. No save or migration code is changed by this document, and nothing here is approved work: every step in section 6 needs the user's approval first.

Companions: [Master Technical Debt Register](../MASTER_DEBT_REGISTER.md) (section "Current residual debt", sections 1A.4 and 8), [Master Roadmap](../MASTER_ROADMAP.md) (T-PERSIST), [Persistence architecture](../architecture/PERSISTENCE.md), [A7 persistence audit](post_cleanup_audit/A7_PERSISTENCE.md), [A9 register reconciliation](post_cleanup_audit/A9_REGISTER_RECONCILIATION.md), [Post-cleanup repository audit](POST_CLEANUP_REPOSITORY_AUDIT.md).

## 0. Method and evidence rules

- Sources, in order of authority: code, tests, authored data, current docs, historical evidence. Every behavior claim cites `file:line` on `7e5e4ea`. Line numbers are the current ones; where the register cites an older line, the correction is listed in section 7.
- The code was read with `cat`, `sed`, `grep` and `git log` / `git show`. Save sizes were measured with two small python3 scripts kept in the scratchpad. They only read JSON files under `saves/` (gitignored, local), `docs/evaluations/` and `tests/`, and print sizes. The scripts wrote nothing into the repository.
- Each number is labeled **measured** (read from a file on disk), **estimated** (computed from the schema and representative values, not from a real save) or **inferred** (a behavior read from the code but not confirmed by execution).
- Vocabulary: PROVISIONAL to PERSISTENT is materialization (`buildMaterializedCharacter`, `src/campaign/materialization.ts:35`). Campaign NPC to NPC+ is promotion. `premium_*` is the legacy name of NPC+.

## 1. Summary

1. **The save does not grow per turn. It grows per committed domain act.** In the D09 evidence the authoritative core grew from 4,186 to 4,789 bytes over 16 revisions, about 38 bytes per revision (measured). Dialogue-only turns add nothing to the snapshot. They add a bounded continuity block (at most 20,000 characters) and an unbounded transcript line.
2. **Trade offers are the only fast-growing authoritative domain.** They are never pruned, and each record is 0.6 to 3.8 KB in the saved, pretty-printed form, up to about 17 KB for a heavy person offer (estimated). For a modest campaign of about 1 MB, trade offers would be about 70 percent of the file (estimated). Whether the 5,000-record cap or the 16 MB byte cap is hit first depends on the mix: a goods-only campaign hits the record cap at about 5 MB, while person offers hit the byte cap after about 4,400 typical or 1,000 heavy records (estimated).
3. **PER-1 is confirmed and slightly worse than registered.** An oversized save throws `invalid_save`. That code is fatal for autosave, a manual save fails the same way, and a graceful quit refuses to close unless the player discards changes. Meanwhile the UI tooltip says "press Save to retry" (`src/ui/client.js:1169`).
4. **New: the side stores have a read cap but no write cap.** `learning.json` and `media.json` are written with no size check. They are read through the same 16 MB guard (`filesystem.ts:34`, `optional-store.ts:48`), and a failed read is a hard `optional_state_invalid` error. A media store above 16 MB would therefore be written successfully and then make every slot unloadable (inferred, not confirmed by execution). Reaching it needs very heavy portrait generation (estimated at about 120 characters with full 64-version galleries).
5. **New: one damaged side store blocks every slot.** Every save this build writes declares both stores authoritative (`campaign-repository.ts:56`). The stores are single-generation, and checkpoints copy only the save JSON (`campaign-repository.ts:230`). A missing or corrupt `learning.json` or `media.json` therefore makes current, previous and all five backups fail with `optional_state_invalid`. There is deliberately no fallback (documented in [PERSISTENCE.md](../architecture/PERSISTENCE.md) "hard recovery").
6. **New: an older slot loaded beside a newer media store is not clamped.** The learning store is clamped (`optional-state.ts:133-139`). The media store is not: a ready sprite generated after the slot was written attaches to an item that, in the older slot, has no `visual_description` yet. Snapshot validation then rejects it (`snapshot-validation.ts:84-87`), and that previous slot or backup fails to load (inferred, not confirmed by execution).
7. **New: rolling checkpoints are not deduplicated by revision.** Every `create`, `manual` and `quit` save writes a checkpoint, whatever its revision (`campaign-repository.ts:250-253`). The local fixture `saves/d04-context/lifecycle/turn_fixture/backups/` holds five checkpoints that are all revision 1 (measured), so five manual saves evict every older distinct revision.
8. **I1 / ID-4 is wider than "no uniqueness check".** `ephemeral_ref` takes the forms `scene_npc_<n>` (session-unique, seeded since ID-2), `narrated:<name>` and `narrated:<noun>`. The `narrated:` forms are not unique within a campaign. `tradeOfferInvalidReason` compares refs across the whole campaign with no location (`trade.ts:76`). The counteroffer reuse (`person-offers.ts:337-339`) and Keep track (`keep-track.ts:46-53`) compare with the location. A later unnamed captive that is offered under the same noun with no linked participant could be invalidated at once as `person_unavailable` (inferred, not confirmed by execution).
9. **TRD-12's register wording overstates the cap failure.** At 5,000 offers, only a change that adds an offer fails. A Controller goods offer fails the whole turn at final preparation (inferred), and a person offer is dropped with a skip. Turns without an offer, and Accept, keep working (section 2).
10. **Pruning trade offers needs an allocator first.** Offer IDs are `max(existing) + 1` (`trade.ts:145`). Pruning without a persisted sequence (like `next_item_sequence`) could reuse an offer ID. This ordering constraint drives the roadmap.

## 2. Re-audit of the registered items

Verdicts: CONFIRMED (still exists as described); CONFIRMED, WIDER (exists and is larger than registered); CONFIRMED, NARROWER (exists, smaller than registered); CONFIRMED (PARTIAL) (partly fixed, the rest exists); CONFIRMED, CORRECTED (exists, but the register wording is wrong). The category column uses the four categories of section 5.

| ID | Register status | Verdict | Current evidence | Category |
| --- | --- | --- | --- | --- |
| PER-1 | P2 open | CONFIRMED, WIDER | Cap 16 MB `strict-json.ts:2`. The serializer throws `invalid_save` above it (`save-format.ts:229`). `invalid_save` is in `FATAL_SAVE` (`game-session.ts:159`), so autosave stops (`autosave.ts:64`). Wider: a manual save fails identically; a quit save failure keeps the session open (`game-session.ts:1330-1332`); the UI tells the player to retry (`client.js:1169`). No warning threshold exists (`MAX_SAVE_BYTES` has 4 uses, none a soft limit). The `mannerism_learning` driver left the snapshot in block 7. The remaining drivers are trade offers, pretty-printed JSON and, for the stores, the asymmetric cap (N1). | DURABILITY |
| PER-3 residual | P3 open | CONFIRMED, NARROWER | `active_household_member` is persisted and must equal membership (`validation.ts:203`, `snapshot-validation.ts:173`): derived, redundant. `empty_slots` is persisted and mutated in three places (`items.ts:18-25`, `trade.ts:197-200`, `characters.ts:88-92`; ITM-2). `price_indices` is NOT purely derived: it is generated once and frozen (`legal.ts:26-32`, `opening-state.ts:20-24`). The fallback `generatePriceIndex` is used only when nothing is stored (`context-builder.ts:224-225`). Recomputing it would change values if the generator changed, so persisting it is a deliberate freeze. NPC+ history is bounded (16 developments, capped roll-up, `validation.ts:154,164`). Real derived residue: `active_household_member` and `empty_slots` only. | CLEANUP |
| PER-4 | P2 open | CONFIRMED, WIDER | Three mechanisms, not two: (1) the envelope table `SAVE_MIGRATIONS` 1 to 7 (`save-migrations.ts:8-77`); (2) the snapshot steps 4 to 5, 5 to 6 and 6 to 7, chained by snapshot version in `save-format.ts:164-168`; (3) the schema-8 persisted/composed transform with optional-store markers (`save-format.ts:152-163`, `optional-state.ts:70-126`). The optional stores have their own `store_version` (1) and no migration path; any other version is `optional_state_invalid` (`optional-store.ts:51`). No table couples envelope and snapshot versions, so an envelope 5 to 7 with any snapshot 4 to 7 is accepted (`save-format.ts:165`). Migrated loads start clean (`campaign-session.ts:31`), so the file stays at its old version until the next mutation. No real older-schema save fixture exists under `tests/fixtures/`. Older versions are synthesized in code (`tests/persistence/save-format-and-assets.test.ts:52`, `save-migration-hardening.test.ts:17-21`). One real older file exists on disk: `docs/evaluations/item-sprite-smoke-assets/turn_fixture/save.json`, envelope 5, snapshot 6 (measured). No test reads it. | CORRECTNESS (fixtures), CLEANUP (one chain) |
| PER-5 | P3 partial | CONFIRMED (PARTIAL) | Since save schema 8 (block 7, `56e4f0e`) one additive persisted value arrived without a bump: `origin_snapshot.trigger: "player_kept"` (`validation.ts:109`, commit `861396c`). Before that, inside earlier schemas: `custody` (block 2) and `item_not_owned` (block 1). The parser rejects unknown fields and enum values (`validation.ts:17,54`), so a block-7-to-11 build loading a block-12 save reports `invalid_save`, not `unsupported_version`. On explicit recovery from another slot, the good newer current file is moved to `save.corrupt-<ts>.json`, never deleted (`campaign-repository.ts:196-204`). `metadata.engine_version` is written from `package.json` (`production.ts:100-102`), but it is the constant `0.1.0` and nothing reads it. | CORRECTNESS |
| PER-6 | P3 open | CONFIRMED | Still present: `private_memory_refs` (`validation.ts:202`, checked at `snapshot-validation.ts:198`), portrait `active_version_id` decode (`validation.ts:100-108`), relationship `trust` seed (`validation.ts:127`), `CampaignSaveFileV1/V2` (`save-format.ts:57-58`), `canon_compatibility: "strict"` from migration 1 (`save-migrations.ts:12`), `reference_used` (written nowhere; read only for display, `player-character-view.ts:128`), `premium_*` keys (NAME-1). All are serialized names or decode paths. They stay bundled with the next schema bump (D6). | CLEANUP |
| PER-7 | P3 open | CONFIRMED, WIDER | Soft delete moves the whole folder to `<root>/../.deleted/<id>-<ts>` (`campaign-repository.ts:91,355-366`). Nothing restores or purges it. Wider retention with no purge: quarantined `save.corrupt-<ts>.json` files stay in the campaign folder (`:202-203`), orphan portrait files are reported but never removed (`portrait-assets.ts:12,40`), and the transcript is append-only (`transcript.ts:7`). | SCALABILITY (disk), CLEANUP |
| PER-8 | P3 accepted | CONFIRMED | Save, then transcript append, then deferred asset deletions (`game-session.ts:1197,1205,1206`). A failed append keeps entries pending and is reported (`:1230-1240`). The transcript is non-authoritative, and rollback markers hide entries above the saved revision on the next load (`game-session.ts:312`). By design. | DURABILITY (accepted) |
| PER-9 | P3 open | CONFIRMED | Staleness is mtime-based: heartbeat 30 s, stale at 90 s (`campaign-repository.ts:94,312,317,343`). The lock is checked once before the writes (`:193`), and no generation number is in the file (`grep save_generation`: 0). A paused process that resumes after another process released the lock overwrites the newer save. The newer one survives one rotation as `save.previous.json` (`:220-225`). | DURABILITY |
| TRD-12 | P2 open | CONFIRMED, CORRECTED | `trade_offers: optional(list(tradeOfferRecord, 5000))` (`validation.ts:290`). No code removes a record. Supersede, withdraw and invalidate only change `status` (`trade.ts:144,155,160,239`). Correction: at 5,000 records only a preparation that pushes a new record fails the list bound. A Controller goods offer is part of the final preparation batch, so that turn fails (`turn-coordinator.ts:278-279`, stage `campaign_validation_failed`; inferred). A person offer is dropped with a skip (`commit-preparation.ts:95-99`). Accept and turns without offers are unaffected. Not "every prepare fails". | SCALABILITY, CORRECTNESS at the cap |
| F7 (= I12) | P2 open | CONFIRMED | Reuse of the planned id needs the same `ephemeral_ref` and the same location among non-accepted person offers (`person-offers.ts:336-339`). The ref is `participant?.id ?? subjectPerson.ref` (`:333`). It changes between turns when the linked scene participant appears or disappears (`linkedParticipant` needs exactly one match, `provisional-people.ts:81-84`). A changed ref plans a second id, and `tradeTermsDigest` then sees a different subject (`trade.ts:91-94`). Because at most one offer is active (`snapshot-validation.ts:152`), the fork is between the accepted record and a later materialization of the old ref, not two accepted records. | CORRECTNESS |
| I1 / ID-4 | P2 open | CONFIRMED, WIDER | No uniqueness check on `origin_snapshot.ephemeral_ref` (`snapshot-validation.ts:58-62`; the field is free text up to 8,000 characters, `validation.ts:110`). Wider (finding 8): `narrated:<noun|name>` refs are not campaign-unique, and the three readers disagree on the key. `trade.ts:76` uses ref only. `person-offers.ts:337` uses ref plus location among non-accepted offers. `keepToken` uses campaign plus ref plus location (`keep-track.ts:46-48`), and `keptCharacter` skips retired records (`:51-53`). | CORRECTNESS |
| I6 / ID-9 | P3 open | CONFIRMED, NARROWER | `#focus` is session-only (`scene-participants.ts:141`). `conversation_partner_id` is persisted per continuity exchange (`save-format.ts:32`) and restored into the recent window on load (`game-session.ts:316-322`). Canonical-name disclosure falls back to the last exchange's partner when no focus exists (`canonical-name-disclosure.ts:122`), and the load report says `temporary_participants_reset: true` (`game-session.ts:339`). Residual: focus on a session-local participant is lost; a canonical partner is effectively rebuilt. | CORRECTNESS (minor) |
| ITM-2 | P3 open | CONFIRMED | See PER-3. `empty_slots` silently skips the player, who has no character record (`trade.ts:198-199`). | CLEANUP |
| AUTH-6 | P3 open | CONFIRMED | Load reconciliation increments the revision (`canon-compatibility.ts:97-99`). The session starts dirty for it (`campaign-session.ts:31`). No ledger entry. | CORRECTNESS (audit trail) |
| AUTH-8 | P3 open | CONFIRMED | Person sale in three places. Validation ties only legal transfer to transaction (`snapshot-validation.ts:141`). Offer checks (`:151-163`) do not tie an accepted person offer to its `settlement.transaction_id`. | CORRECTNESS |
| IMG-12 | P3 open | CONFIRMED, WIDER | 64 versions per character (`portraits.ts:19`), no global quota. Combined with N1, a large gallery is also a load risk, not only a disk risk. | SCALABILITY |
| REV-2 residual | P3 by design | CONFIRMED | 32 receipts (`turn-receipts.ts:11`), newest kept (`:63`). Pending confirmations: 32 terminal, 256 active parsed (`pending-confirmations.ts:17,19`). | none |
| PER-2B | P3 accepted | CONFIRMED | Unchanged; listed for completeness. | none |
| TRD-14 | P3 open | CONFIRMED | Offers never expire in world time; this is one reason invalidation is the only exit for an active offer. | SCALABILITY (indirect) |

### New findings (not in the register)

| # | Finding | Evidence | Category |
| --- | --- | --- | --- |
| N1 | Side stores have no write size cap but a 16 MB read cap. A store above it is written, then fails every full load with `optional_state_invalid`. | write: `optional-store.ts:38-41,71-81`; read: `filesystem.ts:34`, `optional-store.ts:48`; mapping: `campaign-repository.ts:157-160` | DURABILITY |
| N2 | A single damaged or lost side store blocks every slot and backup; checkpoints do not copy the stores. | `campaign-repository.ts:56,137-138,230`; [PERSISTENCE.md](../architecture/PERSISTENCE.md) "single-generation" | DURABILITY |
| N3 | The media store is not clamped to an older slot. A ready sprite can attach to an item whose older state has no `visual_description` yet, and validation then rejects the slot. | `optional-state.ts:106-112` (media merge, no clamp) vs `:133-139` (learning clamp); `items.ts:68-71` (visual identity set once); `snapshot-validation.ts:84-87` | DURABILITY (recovery) |
| N4 | Checkpoints are not deduplicated by revision. Repeated manual saves rotate out every older distinct revision. | `campaign-repository.ts:250-257`; measured: five backups, all `r00000001` | DURABILITY |
| N5 | `narrated:` refs are not campaign-unique, and the three ref readers use different keys. | `scene-identity.ts:236,262`, `person-offers.ts:169,333`; `trade.ts:76` vs `person-offers.ts:337` vs `keep-track.ts:46-53` | CORRECTNESS |
| N6 | Offer IDs come from `max(existing)+1`. Any pruning without a persisted allocator can reuse an offer ID. | `trade.ts:145` | CORRECTNESS (a precondition for TRD-12) |
| N7 | Each save validates the full snapshot several times and also fully decodes the previous current file. | `campaign-repository.ts:191,197,211,212`; `save-format.ts:212,216-218,226` | SCALABILITY |
| N8 | The oversize state is presented as retryable. | `client.js:1169`; `game-session.ts:1330-1332` | DURABILITY (UX of PER-1) |

## 3. Persistence map

### 3.1 Save schema version

| Layer | Version | Where |
| --- | --- | --- |
| Save envelope (`format: "caldrevan_campaign_save"`) | 8 | `save-migrations.ts:5`; envelope parser `integer(8, 8)` at `save-format.ts:81` |
| Persisted snapshot inside a v8 envelope | 8 (fields of migrated stores removed, `portrait_selections` added) | `optional-state.ts:70-81` |
| Composed in-memory snapshot | 7 | `snapshot-validation.ts:23`; `validation.ts:286`; `optional-state.ts:125`; `campaign-state.ts:57,105` |
| Optional stores (`caldrevan_optional_store`) | `learning: 1`, `media: 1`, each independent | `optional-store.ts:21-22` |
| Optional-store markers in the envelope | `{version, completed: true}` per store; a newer marker is `unsupported_version` | `save-format.ts:106-120` |
| Turn receipts, interaction metadata, continuity | no version; tolerant parse, dropped when malformed | `turn-receipts.ts:53-65`, `pending-confirmations.ts:102`, `save-format.ts:86-103` |
| Transcript | no version; per-line tolerant | `transcript.ts:14,31-45` |

A newer envelope is refused as `unsupported_version` twice: by `peekOptionalMarkers` (`save-format.ts:126`) and by `migrateSave` (`save-migrations.ts:107`).

### 3.2 Migration paths

```
envelope  1 ──1→2 (canon "strict")──▶ 2 ──2→3 (snapshot 1→2: premium domains)──▶ 3 ──3→4 (snapshot 2→3)──▶ 4
          4 ──4→5 (snapshot 3→4)──▶ 5 ──5→6 (interaction_metadata allowed)──▶ 6 ──6→7──▶ 7 ──7→8 (markers allowed)──▶ 8
snapshot  4 ──4→5 (player_characters, world-aware)──▶ 5 ──5→6 (next_item_sequence)──▶ 6 ──6→7 (retirement allowed)──▶ 7
schema 8  persisted snapshot ──fromPersistedSnapshot(markers, side stores)──▶ composed 7
```

- The envelope chain is detached, sequential and checks each step's output version (`save-migrations.ts:104-123`). Each step refuses input that already carries its target fields (`:11,22,38,49-50,59,74`).
- The snapshot chain runs after the envelope chain because 4 to 5 needs the world (`save-format.ts:164-168`). The register's PER-4 lines `:102-106` are now `:10,148-149` per A9, and `:164-168` for the steps themselves.
- Lazy migration: loading never rewrites a file. The first save writes schema 8. A v7 file is migrated to stores in "migration order": both stores first, then the marker-carrying save (`campaign-repository.ts:213-218`). After that, saves use "steady order": snapshot first, then changed stores (`:229`).
- Each step is tested on synthesized input (`tests/persistence/save-migration-hardening.test.ts`, `tests/optional/optional-store-migration.test.ts:18-147`, `tests/items/item-domain.test.ts:105`). There is no per-version matrix on real files.

### 3.3 Additive-field behavior

- The snapshot parser is closed: unknown fields fail (`validation.ts:17`), unknown enum values fail (`validation.ts:54`), and the envelope parser is closed as well (`save-format.ts:81-84`). An additive field or enum value is therefore backward-incompatible for older builds, whatever its intent.
- The protection is a version bump. Bumps were done for `interaction_metadata` (5 to 6), `retirement` (6 to 7) and the markers (7 to 8). Bumps were not done for `player_kept` (after 8), nor earlier for `custody`, `item_not_owned`, `price_indices`, `portraits`, `trade_offers` and `mannerism_learning` (PER-5).
- Tolerant blocks (continuity, receipts, interaction metadata) drop malformed content instead of failing the load. That makes them safe to extend.
- Downgrade outcome today: an older build gives `invalid_save`, and the start screen offers an older slot. Recovering from that slot quarantines (moves) the newer file (`campaign-repository.ts:196-204`).

### 3.4 Save-size growth

Measured and estimated in section 4. In short: core state grows per domain act; offers, items, materialized characters and transactions are never removed; pretty-printing adds 38 to 53 percent on the measured fixtures; the continuity block is bounded; the transcript and media store sit outside the 16 MB file but have their own limits.

### 3.5 Trade offer retention

| Aspect | Current behavior | Evidence |
| --- | --- | --- |
| Creation | One record per distinct terms. Identical re-quotes are deduplicated by `tradeTermsDigest`. | `trade.ts:100-106,142-143` |
| Supersession | The previous active offer becomes `superseded`, and the new record is pushed. Every price change in a negotiation is a new record. | `trade.ts:144-149` |
| Exit states | `accepted` (with `settlement`), `superseded`, `withdrawn`, `invalidated` (with reason). All are terminal and kept. | `validation.ts:227-229`; `trade.ts:155,160,223,239` |
| Bound | 5,000 records in the schema, then the 16 MB byte cap. No pruning or archive. | `validation.ts:290` |
| Readers of closed offers | Counteroffer id reuse scans all non-accepted person offers (`person-offers.ts:337`); `nextParticipantSeed` scans all person-offer plans (`scene-participants.ts:128-131`); Keep track scans active offers (`keep-track.ts:95`); accepted settlements are the only goods-trade audit trail (TRD-11). | as cited |
| ID allocation | `max(existing sequence) + 1`, capped at 99,999,999. | `trade.ts:145-146` |

Consequence: closed offers have two real uses today. They are the goods audit trail (until a ledger exists, TRD-11) and the ID-2 seed source (participant refs in plans). Pruning has to preserve both, plus the ID allocator (N6).

### 3.6 Optional and derived state

| State | Where persisted | Authority | Revision effect |
| --- | --- | --- | --- |
| Reflection journal and notes, mannerism learning | `optional/learning.json` | side store (marker) | none (optional-only) |
| Item sprites, portrait gallery, reference image | `optional/media.json` | side store (marker) | none |
| Portrait selections (avatar, full body) | snapshot `portrait_selections` | authoritative | +1 |
| Promoted mannerisms | snapshot `premium_characters[].mannerisms` | authoritative | +1 |
| `active_household_member` | snapshot | derived and validated equal to membership | follows membership |
| `empty_slots` | snapshot | partly derived, mutated in three places | +1 |
| `price_indices` | snapshot | generated once and frozen (deliberate) | +1 at creation |
| Continuity (12 exchanges) | envelope | non-authoritative | none |
| Turn receipts, pending confirmations | envelope | metadata | none |
| Scene participants, focus | memory only | session | none |

The semantic revision follows `corePartition` only (`campaign-state.ts:84-86`, `optional-state.ts:59-63`). `stateVersion` counts every change, but it is memory-only (`campaign-state.ts:95`) and drives "unsaved" (`campaign-session.ts:37`).

### 3.7 Deleted and retired entity retention

| Entity | Retention | Evidence |
| --- | --- | --- |
| Retired or merged characters | Kept forever as history: inactive, no location, with `origin_snapshot` evidence | `snapshot-validation.ts:51-57` |
| Items sold to an anonymous buyer | Kept forever: `position: unknown`, `owner_id: null` (TRD-1b keeps item identity) | `trade.ts:203` |
| Items in general | No delete command exists in the command set | `validation.ts:232-282` |
| Trade offers, transactions | Never removed | section 3.5; `validation.ts:297` |
| Former household members, their NPC+ records | Kept (`former_member`, `active_household_member: false`) | `validation.ts:122,203` |
| Portrait versions | Removed from the gallery on delete; files deleted later when no retained save or store references them | `game-session.ts:894,919,1242-1253` |
| Orphan portrait files | Reported, never removed | `portrait-assets.ts:12,40` |
| Soft-deleted campaigns | Moved to `.deleted/`, never purged or restored (PER-7) | `campaign-repository.ts:355-366` |
| Quarantined current files | Kept in the campaign folder, never listed or rotated | `campaign-repository.ts:202-203` |
| Transcript | Append-only; reads only the last 8 MB | `transcript.ts:14`; `campaign-repository.ts:382` |

### 3.8 Autosave behavior

- Policy: debounce 2 s, max wait 10 s, retries at 2 s, 10 s and 30 s, then `failed` until the next mutation; fatal codes stop autosave (`autosave.ts:24,64-67`). With autosave on, nearly every committed turn produces a save within 10 s.
- Dirty means: revision or state version changed, delivered history not yet appended, unsaved receipts, or unsaved confirmations (`game-session.ts:272`). Dialogue-only turns therefore trigger saves at an unchanged revision (measured: 230 transcript lines, all at revision 1, in the local fixture).
- Each save writes `save.json` and `save.previous.json` (twice the file size), plus a checkpoint for create, manual or quit, or for autosave when the newest checkpoint is 15 minutes old. Five checkpoints are kept (`campaign-repository.ts:92,244-259`).
- Fatal codes: `invalid_json`, `invalid_save`, `unsupported_version`, `migration_failed`, `dataset_mismatch`, `reference_invalid`, `unsafe_path`, `campaign_locked`, `invalid_id`, `session_closed` (`game-session.ts:159`). The size cap shares `invalid_save` with genuine corruption, so oversize cannot be told apart from it.
- A loaded or migrated campaign starts clean (`campaign-session.ts:31`), except after canon reconciliation.

### 3.9 Generation counters

| Counter | Persisted | Monotonic across reloads | Notes |
| --- | --- | --- | --- |
| `revision` (semantic) | yes | yes within one branch; loading an older slot rewinds it | `campaign-state.ts:86` |
| `stateVersion` | no | per session | `campaign-state.ts:95` |
| `next_item_sequence` | yes | yes (persisted allocator) | `validation.ts:286`; `snapshot-validation.ts:93` |
| Trade offer sequence | no (derived max + 1) | only while no record is removed | `trade.ts:145` |
| Scene participant `scene_npc_<n>` | no (seeded from refs in the snapshot) | yes since ID-2 | `scene-participants.ts:128-131` |
| Character IDs `r<revision>_<slug>` | via revision | revision-scoped; reusable after a rewind to an older slot | `materialization.ts:32-34` |
| Transaction IDs | via base revision and subject | same as characters | `person-offers.ts:50` |
| Mannerism `sequence` | yes (learning store) | clamped or reset with an older slot | `optional-state.ts:133-139` |
| Transcript index `i` | yes (file) | yes | `game-session.ts:1224` |
| Save generation | **does not exist** (PER-9) | | `grep save_generation`: 0 |

### 3.10 Identity key uniqueness

Enforced at load: campaign record IDs across characters, items, households, facts, goals, events and transactions (`snapshot-validation.ts:41-42`); trade offer IDs (`:151`); one active offer (`:152`); NPC locations, funds, legal statuses, knowledge pairs, relationship pairs, household members, rules, NPC+ records and reflection records (`:73,111,119,128,131,133,135,168,202`).

Not enforced: `origin_snapshot.ephemeral_ref` (I1 / ID-4), duplicate unnamed twins at one location (ID-4), `settlement.transaction_id` against the transaction table (AUTH-8), and offer IDs across a pruning boundary (N6). The `narrated:` ref family is not unique by construction (N5).

## 4. Save sizes from current fixtures

### 4.1 Fixtures found

A scan of `saves/`, `docs/evaluations/` and `tests/` for JSON objects with `format: "caldrevan_campaign_save"`, `format: "caldrevan_optional_store"` or a snapshot shape found 11 save files, 4 store files and 103 embedded snapshots (measured). No tracked file holds a non-empty `trade_offers`, and no test fixture is a save file. All tracked saves are short evaluation runs. Large tracked JSON files (up to 760 KB) are traces and ledgers, not saves.

| File | Envelope / snapshot | Revision | Compact bytes | Saved (pretty) bytes | Pretty overhead |
| --- | --- | --- | --- | --- | --- |
| `docs/evaluations/consolidation_block7_live/saves_a/turn_fixture/save.json` | 8 / 8 | 6 | 11,466 | 15,883 | 38.5 % |
| `docs/evaluations/item-sprite-smoke-assets/turn_fixture/save.json` | 5 / 6 | 7 | 6,542 | 9,733 | 48.8 % |
| `saves/d04-context/lifecycle/turn_fixture/save.json` (gitignored, local) | 8 / 8 | 1 | 5,390 | 8,236 | 52.8 % |
| `docs/evaluations/d09-reflection/evidence/d09-final-matched-ablation/final-state.json` (snapshot only, pre-store shape) | – / 3 | 18 | 8,648 | 12,768 | 47.6 % |
| block 7 `optional/learning.json` (2 NPC+) | store 1 | 6 | 2,611 | 4,572 | 75.1 % |
| block 7 `optional/media.json` (empty gallery) | store 1 | 6 | 283 | 332 | 17 % |

All figures in this table are measured.

### 4.2 Breakdown by top-level key (measured, compact bytes)

Block 7 live save (the most representative current-schema save):

| Key | Bytes | Share of file | Count |
| --- | --- | --- | --- |
| `continuity` | 4,397 | 38.3 % | 5 exchanges (about 880 bytes each) |
| `snapshot` | 4,997 | 43.6 % | |
| of which `items` | 1,424 | | 8 |
| of which `premium_characters` | 1,090 | | 2 |
| of which `facts` / `knowledge` | 637 / 525 | | 6 / 6 |
| of which `runtime` | 359 | | |
| of which `characters` | 296 | | 1 |
| `canon_references` | 1,596 | 13.9 % | |
| `metadata`, markers, IDs | about 310 | 2.7 % | |

D09 final state (snapshot only, revision 18, written before the side stores existed): `mannerism_learning` 2,789 (32.3 %), `runtime` 2,366 (27.4 %, many canonical NPC locations), `premium_reflections` 1,025, `premium_characters` 881, `households` 562. In current saves, the first and third now live in `learning.json`.

Growth per revision in D09 (measured, compact): total 4,211 to 8,657 bytes over 16 revisions, of which the authoritative core went from 4,186 to 4,789. About 90 percent of that growth was optional learning state, which block 7 moved out of the save.

### 4.3 Per-record sizes

| Record | Compact | Saved (pretty) | Basis |
| --- | --- | --- | --- |
| Canonical or simple item | about 180 | about 260 | measured (1,424 / 8; 1,083 / 6) |
| Item with sprite metadata (pre-store) | about 290 | about 430 | measured (2,333 / 8) |
| Created item with description and visual description | 675 | 755 | estimated |
| Fact / knowledge row | 106 / 88 | about 150 / 130 | measured |
| NPC+ record | about 545 | about 800 | measured (1,090 / 2); bounded by retention |
| Person transaction | 254 to 731 | 300 to 812 | measured (254, purchase-capability fixture); estimated 731 with anonymous counterparty evidence |
| Materialized character | 1,540 (typical) to 6,037 (12 evidence lines of 240) | 1,807 to 6,681 | estimated from `materialization.ts:35-46` |
| Goods offer, 1 line / 3 lines | 908 / 1,778 | 1,042 / 2,020 | estimated |
| Items SELL offer, accepted | 611 | 778 | estimated |
| Person offer, typical (anonymous seller, 4 evidence lines) | 2,858 | 3,814 | estimated |
| Person offer, heavy (named seller registered too, full evidence) | 13,673 | 16,688 | estimated |
| Continuity block, full | at most 20,000 characters of exchanges | about 21 KB | bound `save-format.ts:34`; measured about 880 bytes per exchange |
| Transcript, per exchange | about 1,010 | (JSONL) | measured (block 7 live: player 150, narrator 861 bytes) |
| Portrait version | about 600 without prompt, up to about 4,600 with a 4,000-character prompt | | estimated (`validation.ts:88-94`) |

### 4.4 Main growth drivers (ranked, estimated)

1. **Trade offers.** Every distinct quote is a permanent record of 1 to 4 KB, and person offers duplicate a full materialization plan (character, legal status, transfer) inside the record. For an illustrative campaign of about 1 MB (40 materialized people, 300 items, 400 offers of which 30 % person offers, 200 facts and knowledge rows, 30 transactions), offers are about 740 KB of the file (estimated).
2. **Items that never leave.** Bought goods create items; sold items stay as `unknown`/`null` records. Expect about 0.3 to 0.7 KB per trade.
3. **Materialized characters.** 1.5 to 6 KB each, including retired and merged ones.
4. **Pretty-printing.** 38 to 53 percent on the measured fixtures; about 15 to 33 percent on text-heavy records.
5. **Continuity.** Bounded at about 21 KB; it is large only relative to a small save.
6. **Canon references and NPC locations.** Proportional to the canon the campaign touches (1.6 KB and up to 2.4 KB measured); bounded by the authored world.

Bounded and not drivers: NPC+ records (16 developments, roll-up caps), receipts (32), pending confirmations, learning store (8 candidates per NPC+, 16 journal turns, 18 notes per NPC+: `mannerism-concepts.ts:9`, `validation.ts:195`).

### 4.5 Pathological growth mechanisms

| Mechanism | What grows | Reach (estimated) |
| --- | --- | --- |
| Haggling churn (each new price supersedes the previous offer) | `trade_offers` | 5,000 records: about 5 MB for goods offers, or 16 MB after about 4,400 typical or about 1,000 heavy person offers |
| Several offer variants in one negotiation (the digest normalizes only articles, casing and whitespace) | `trade_offers` | as above, faster |
| Repeated manual saves at one revision | backups rotate to identical copies (N4) | measured: 5 of 5 backups at revision 1 |
| Portrait regeneration | `media.json` (64 versions per character, no global quota) | 16 MB read cap at about 120 characters with full galleries and long prompts (N1) |
| Long play | `transcript.jsonl` | about 1 KB per exchange; 10,000 turns is about 10 MB, and reads see only the last 8 MB |
| Soft deletes, quarantines, orphans | disk outside the save | unbounded |
| Per-save I/O | each save writes about 2 times the file, plus a checkpoint | at 5 MB, about 10 MB written per autosaved turn |

### 4.6 Per-save and per-turn work (inferred from the code, not measured)

- One save: `createSaveFile` twice (`campaign-repository.ts:191,211`). Each call runs `validateCampaignSnapshot` and a full `validateSaveFile` (decompose, compose, parse, canon assessment and a second `validateCampaignSnapshot`; `save-format.ts:212,216-218`). Then `serializeSave` validates again and stringifies with a sorting replacer (`:226-228`). The previous current file is read and fully decoded in core mode (`campaign-repository.ts:197`) with the character-level JSON reader (`strict-json.ts:5-53`). That makes about six full validations, one custom parse and two fsynced writes per save.
- One turn: `campaign.prepare` runs up to about five times (intent dry runs, final preparation, commit preparation; `turn-coordinator.ts:214,279,312`, `commit-preparation.ts:64,78,84,96`). Each run does two `structuredClone`s, four sorted `JSON.stringify` passes and one full validation (`campaign-state.ts:60,79-87`). Validation has a few O(n·m) scans (`snapshot-validation.ts:102,141,180`).
- The start screen decodes the current and previous files of every campaign (`campaign-repository.ts:287-302`).

All of these scale linearly with the save, so trade offer growth also slows every turn. None of it has been timed. The register's planned scale fixture (Master Roadmap: 200 characters, 500 facts, 100 items) would be the first measurement.

## 5. Findings by category

### 5.1 CORRECTNESS

| Item | Severity (current / proposed) | Summary |
| --- | --- | --- |
| I1 / ID-4 with N5 | P2 / P2 | `ephemeral_ref` is neither unique nor consistently keyed. Three readers use three different keys. |
| F7 | P2 / P2 | A changed ref across counteroffers plans a second identity. |
| N6 | – / P2 when pruning starts, otherwise none | Offer ID reuse after any pruning. |
| PER-5 | P3 / P3 | Additive enum or field without a bump; an older build reports corruption instead of "newer version". |
| PER-4 (fixtures part) | P2 / P2 | No real older-schema fixture per version; envelope and snapshot versions are not coupled. |
| TRD-12 at the cap | P2 / P2 | At 5,000 records an offer-proposing turn fails. |
| AUTH-8 | P3 / P3 | Accepted person offer not tied to its transaction. |
| AUTH-6 | P3 / P3 | Load reconciliation bumps the revision without a record. |
| I6 / ID-9 | P3 / P3 (narrower) | Only session-participant focus is lost. |

### 5.2 DURABILITY

| Item | Severity (current / proposed) | Summary |
| --- | --- | --- |
| PER-1 with N8 | P2 / P2 | Oversize stops autosave, manual save and quit-save, under a "retry" message. |
| N1 | – / P2 | A side store above 16 MB is written but cannot be read; every slot then fails. |
| N2 | – / P2 | One damaged side store blocks all slots; backups do not include the stores. |
| N3 | – / P3 | An older slot plus a newer media store can fail validation (sprite before visual identity). |
| N4 | – / P3 | Same-revision checkpoints rotate out older recovery points. |
| PER-9 | P3 / P3 | Time-based lock; no save generation; a resumed process can overwrite a newer save. |
| PER-8 | P3 accepted | Transcript append after the save. |

### 5.3 SCALABILITY

| Item | Severity (current / proposed) | Summary |
| --- | --- | --- |
| TRD-12 | P2 / P2 | Unpruned offers; the main growth driver. |
| N7 | – / P3 | Repeated full validation per save and per turn; linear in save size, untimed. |
| IMG-12 | P3 / P3 | No gallery quota; linked to N1. |
| PER-7 (disk part) | P3 / P3 | Deleted campaigns, quarantines, orphans and the transcript are never purged. |
| Pretty-printed save | part of PER-1 | 38 to 53 percent of the file on measured saves. |

### 5.4 CLEANUP

| Item | Severity | Summary |
| --- | --- | --- |
| PER-4 (one chain) | P2 | Fold the three mechanisms into one ordered chain keyed by version pair. |
| PER-3 residual, ITM-2 | P3 | Stop persisting `active_household_member` and `empty_slots`. Reclassify `price_indices` as deliberately frozen, not derived. |
| PER-6, NAME-1 | P3 | Legacy names and decode paths; bundled with the next schema bump (D6). |

Repository cleanup is closed. The P3 repository residuals REPO-7, REPO-8, REPO-13 and REPO-14 are unaffected by this review and stay low priority.

## 6. Dependency-aware persistence roadmap

This is a proposed order for the user to approve, change or reject. No step has been approved, and none is implemented. Steps marked "save-compatible" need no schema bump. Steps marked "bump" belong together in one schema-9 change, because each bump is a forward-compatibility event for older builds (PER-5).

```
P0 measure ─┬─▶ P1 size guard (non-fatal) ─▶ P2 compact JSON ─┐
            │                                                 ├─▶ P6 schema 9 (offer allocator + archive,
            ├─▶ P3 store guards (N1, N2, N3) ─────────────────┤        derived-field removal, PER-6/NAME-1,
            ├─▶ P4 identity diagnostics (ID-4/N5, F7, AUTH-8) ┤        version-pair chain, bump rule)
            └─▶ P5 real fixture matrix (PER-4) ───────────────┘            │
                                                                           ├─▶ P7 offer pruning (TRD-12)
                                    P8 checkpoint dedupe (N4), PER-9 ──────┘   P9 retention (PER-7)
```

| Step | Content | Save impact | Depends on | Unblocks |
| --- | --- | --- | --- | --- |
| P0 | Measure first. Build a scale fixture: the roadmap's 200 / 500 / 100 shape plus 1,000 offers with a realistic mix. Time save, load and `prepare`, and record bytes per key. Use a dev script or test, never live calls. | none | none | sizing for P1, P2, P7 |
| P1 | PER-1 and N8: a distinct size code (for example `save_too_large`), non-fatal for autosave, with a visible banner and a warning threshold below the cap. Quit can then distinguish oversize from corruption. | save-compatible (new error code only) | P0 for the threshold | safe operation during P6 and P7 |
| P2 | Compact JSON in the save file and the stores. The reader already accepts both forms (`strict-json.ts`). | save-compatible for newer builds; older builds read compact JSON too | P1 | 30 to 50 percent headroom (measured overhead) |
| P3 | Side-store guards. N1: the same cap on write as on read, mapped to the P1 code. N2: copy the stores into checkpoints, or keep one previous generation of each store, and decide whether a backup may load with an older store. N3: clamp the media merge to the slot (drop sprites for items without the matching `visual_description`, drop versions newer than the slot). | save-compatible (file layout only; markers unchanged) | P1 | reliable recovery for P6 and P7 |
| P4 | Identity diagnostics, warn-level, no repair. ID-4/N5: report duplicate `ephemeral_ref` values and unnamed twins at load, and settle on one key (ref plus location) for all three readers. F7: report or derive a stable subject key across counteroffers. AUTH-8: check that an accepted person offer names an existing transaction. | save-compatible (diagnostics); the reader key change is behavior only | none | the uniqueness rule P6 may enforce |
| P5 | PER-4 fixtures: one real file per historical version (the on-disk envelope 5 / snapshot 6 save is a candidate) and a load-older-save test per version (TEST-6 overlap). | none | none | a safe P6 |
| P6 | One schema-9 bump: (a) a persisted `next_trade_offer_sequence` (N6, like `next_item_sequence`); (b) a compact closed-offer archive or ledger shape, which should wait for the D3 / ECO-1 decision because TRD-11 needs the same ledger type; (c) remove `active_household_member` and `empty_slots` (PER-3, ITM-2) with a recompute path; (d) PER-6 and NAME-1 key renames (D6); (e) one migration chain keyed by (envelope, snapshot) pairs with a coupling table (PER-4); (f) the rule "every persisted field or enum addition bumps", optionally with a read-only minimum engine version (PER-5). | **bump** to 9 | P1, P2, P4, P5; decisions D3 (ledger units) and D6 (rename) | P7; the product ledgers |
| P7 | TRD-12: prune terminal offers into the archive, keeping what the ID-2 seed, Keep track and the counteroffer reuse read (refs and planned IDs). The allocator from P6 prevents ID reuse. | save-compatible after P6 | P6 | bounded offer growth |
| P8 | N4: skip a checkpoint whose revision equals the newest checkpoint's revision, or keep at least one per distinct revision. PER-9: a monotonic `save_generation` in the envelope, checked against the file on disk before the rename. | N4 save-compatible; PER-9 is additive, so it belongs in P6's bump | P6 for PER-9 | |
| P9 | PER-7: retention and restore for `.deleted/`, quarantines and orphans; transcript rotation; a gallery quota (IMG-12). | none | P3 for the media quota | disk bounds |

Relation to the product roadmap (ownership, possession and item localization; robust transfers; economy and transaction history; world event ledger; knowledge and rumors; NPC routines):

- Economy history and the world event ledger are append-only domains. Without the archive pattern from P6 and P7 they would repeat TRD-12's growth curve in the authoritative snapshot. P6 should therefore define one archive or ledger mechanism that trade offers use first and later ledgers reuse.
- Robust transfers and item localization add item and position records. ITM-4 (stable item key, quantity) is a schema change and fits the same schema-9 bump if it is ready in time; otherwise it causes a second bump.
- Property and Heartstone depend on PER-3 per the Master Roadmap. Only the `empty_slots` and `active_household_member` residue remains, and it fits P6.
- Weather UI does not touch persistence.

Open decisions that gate steps: D3 (currency unit, the ECO-1 ledger shape in P6b), D6 (the NAME-1 / PER-6 rename in P6d), D5 (canonical NPC campaign records). D5 affects which records the ID-4 diagnostics in P4 treat as legitimate.

## 7. Proposed register corrections (not applied)

| Row | Proposed correction |
| --- | --- |
| TRD-12 | Line `validation.ts:287` is now `:290`. "Beyond it every prepare fails" should read "beyond it any change that adds an offer fails; a turn whose final batch carries a goods offer fails (inferred), a person offer is skipped". Add: pruning requires a persisted offer-ID allocator (N6). |
| PER-1 | Add: manual save and quit-save fail the same way, and the UI calls the state retryable. Drivers: `mannerism_learning` left the snapshot in block 7; add the side-store read cap (N1). |
| PER-3 | Residual is `active_household_member` and `empty_slots`. `price_indices` is a deliberate freeze, not derived state. NPC+ history diffs are bounded. |
| PER-4 | Three mechanisms (envelope table, snapshot steps, schema-8 store composition); lines `save-format.ts:10,164-168`. |
| PER-5 | Since schema 8, `player_kept` is the only additive value. `engine_version` is the constant `0.1.0` and is not read. |
| I1 / ID-4 | Add N5: `narrated:` refs are not unique, and the three readers use different keys (`trade.ts:76`, `person-offers.ts:337`, `keep-track.ts:46`). |
| I6 / ID-9 | Narrow to session-participant focus; a canonical partner is rebuilt from continuity (`canonical-name-disclosure.ts:122`). |
| PER-7 | Add quarantined files, orphan portrait files and the transcript to the retention scope. |
| New | N1 to N4 (durability), N6 (allocator precondition), N7 (per-save and per-turn work). |

## 8. Not verified

- No timing was measured. Section 4.6 is a code reading.
- The turn failure at the offer cap (TRD-12), the N3 slot failure, the N1 unreadable store and the N5 immediate invalidation are inferred from the code and not reproduced. Each should first become a failing test if the user approves P1, P3 or P4.
- No tracked save contains trade offers. All offer and character sizes are estimates built from the schema shapes with representative text lengths.
- The local `saves/` directory is gitignored. Its contents (one campaign, revision 1) may differ on other machines.
