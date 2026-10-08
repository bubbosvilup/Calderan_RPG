# Save/load v1 design: persistent campaigns

**Status:** proposal, not implemented. **Based on:** `docs/save_load_audit.md`.

**Principle:** reuse the existing, hardened persistence engine (`src/persistence/`). Add only what the Play UI and the image store are missing. The snapshot stays the single authority, and nothing derived is saved.

## Decisions to approve

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| D1 | Conversation continuity across a load | **Persist** the bounded recent conversation (≤ 12 exchanges / 16k characters) and the display transcript, in a *non-authoritative* `continuity` section of the save. It is never fed into `CampaignState` | Drop it on load and treat the load as a scene boundary (like a manual location correction). The narrator then starts each session without dialogue memory |
| D2 | Canon compatibility | **Tiered:** missing or retyped references fail; newly authored NPCs are reconciled explicitly; content drift loads with a warning | Keep the strict fingerprint policy. Almost any authoring edit to an NPC or location then blocks every save |
| D3 | Autosave | **On**: coalesced after committed changes, only at idle points, plus save on graceful quit. Manual Save stays | Manual only (the current Phase 1J policy) |
| D4 | Storage root | `saves/campaigns/<id>/`, with portraits **inside** the campaign folder | Keep `saves/<id>/` + `saves/portraits/<id>/` |
| D5 | What "New campaign" starts as | The Play UI opening (slave market, minute 600, the one-shot opening text), as an application preset | The engine's canonical opening (Heartstone Square) |

## Save format

**Envelope schema 5**, a superset of 4:

```jsonc
{
  "format": "caldrevan_campaign_save",
  "schema_version": 5,
  "campaign_id": "campaign_20261008_a1b2c3",
  "canonical_dataset_id": "sha256:…",
  "metadata": {
    "saved_at": "2026-10-08T21:04:11.000Z",
    "created_at": "2026-10-08T19:00:00.000Z",
    "engine_version": "0.1.0",                // now actually written (package.json version)
    "display_name": "Nicco in Calderan",      // NEW, optional, ≤ 80 chars, presentation only
    "save_reason": "autosave"                 // NEW: "manual" | "autosave" | "quit"
  },
  "snapshot": { "schema_version": 4, … },     // CampaignSnapshot: the only authority
  "canon_compatibility": "references",
  "canon_references": [{ "id": "mira_thorne", "fingerprint": "sha256:…" }, …],
  "continuity": {                              // NEW, optional, NON-AUTHORITATIVE (D1)
    "revision": 412,                           // must equal snapshot.revision, else ignored
    "recent": [{ "player": "…", "narration": "…", "status": "finalized", "location_id": "…", "conversation_partner_id": "…" }],
    "transcript": [{ "role": "player" | "narrator" | "system", "text": "…" }]
  }
}
```

**Snapshot schema 4** is a *version-only* bump. It formally adopts the optional image v1 portrait fields (`kind`, `pose`, `prompt`, `seed`, `provider_seed`, `provider`, `style_id`, `width`, `height`, `billable_units`). No data changes. From then on, a pre-v1 build reports `unsupported_version` instead of a misleading `invalid_save`.

**Why continuity goes inside the envelope** rather than in a separate file:
- It shares the save's atomic replace and the current/previous slot rotation.
- So it is always paired with the exact snapshot it belongs to.
- No second transaction is needed.

**Continuity bounds and rules:**
- `recent` uses the existing `RecentConversation` bounds.
- `transcript` keeps at most 500 messages and 1 MiB. Older messages are dropped first.
- Strings are bounded.
- It is never validated against world canon and never turned into facts.
- If it is invalid or its revision doesn't match, it is dropped with a load-report note. The campaign still loads.

**Explicitly NOT saved:**
- Scene RAM, turn context, prompts, retrieval indexes;
- `SceneParticipants` (temporary scene people; a load is a scene boundary for them);
- traces, diagnostics, compaction state, narrator alternatives, UI state;
- image bytes, absolute paths.

## Directory structure

```text
saves/
  campaigns/                         # NEW dedicated root (D4); only campaign folders live here
    campaign_20261008_a1b2c3/
      save.json                      # current slot (envelope 5)
      save.previous.json             # previous slot (rotated by every save, as today)
      backups/                       # NEW rolling checkpoints (see Atomic save)
        r00412-20261008T210411Z.json
      portraits/                     # NEW location of this campaign's portrait files
        6000dca4618a3800c02ef589/    # hash(campaign_id, character_id): unchanged scheme
          portrait_1eb720eb418b.png
      .save-<uuid>.tmp               # transient (existing)
  .deleted/                          # NEW soft-deleted campaigns (moved here, never auto-purged in v1)
  ui_playtest/                       # untouched: disposable playtest mode keeps its old layout
  …dev artifacts…                    # untouched; no longer listed as campaigns
```

**Changes:**
- The `FileCampaignRepository` root becomes `saves/campaigns`.
- `PortraitAssetStore` takes the same root and resolves `<root>/<campaign_id>/portraits/<character token>/<file>`. The token hash and file names are unchanged. This is one added path segment.
- A campaign becomes one self-contained folder: export means copy the folder; delete means move it.

## Campaign manifest

- **No separate `campaign.json` in v1.** The envelope's `campaign_id` + `metadata` is the manifest. A second file would duplicate truth and could drift from the save.
- **Listing** (`listSaves`, extended) returns, per campaign and slot:
  - status, revision, saved_at, created_at, display_name, save reason;
  - **safe summary fields** derived during validation: the player location's display name, the world day and time of day, and the number of household members.
- **"Continue"** is the valid campaign with the newest `saved_at`. No "last played" pointer file is needed.
- **Performance:** listing fully validates each slot, as it does today. That is fine for tens of campaigns. If it becomes slow, add a cached summary later.

## Schema version

| | Envelope | Snapshot |
| --- | --- | --- |
| Current | 4 | 3 |
| v1 target | **5** | **4** |
| Migration step | `SAVE_MIGRATIONS[4]`: 4→5. Version-only for the snapshot (3→4). `metadata` and `continuity` stay absent. Lossless; no defaults | Same step |

**Rules from now on:**
1. Any new snapshot or envelope field, *even an optional one*, gets a version bump and a migration step. Older builds then always fail with `unsupported_version`, never with `invalid_save`.
2. Migrations are forward only (n → n+1), pure, and run on detached copies. Strict validation of the target version follows, as today.
3. **Loading never rewrites the file.** The first save after a load writes the new version. The previous slot keeps the old version and stays loadable through migration.
4. A version above what the build supports fails `unsupported_version`. The UI says "This save was made by a newer version of Caldrevan (save schema N; this build supports up to 5)", and the file is never touched.
5. A corrupt save is never "repaired" silently.

## Atomic save algorithm

This is the existing algorithm (`docs/architecture/PERSISTENCE.md` §D), kept as is, plus three additions:

```text
save(reason):
  0. refuse if a turn / post-turn / compaction / portrait batch is running (as today); coalesce with the autosave queue
  1. capture snapshot + continuity synchronously (same revision)
  2. build + fully validate envelope 5 (existing createSaveFile path, plus continuity bounds)
  3. existing: create the campaign folder (no links) → read + validate current; refuse if it is corrupt
  4. existing: exclusive temp (wx, 0600) → write → FileHandle.sync → close
  5. existing: old current bytes → temp → rename over save.previous.json
  6. existing: new temp → rename over save.json → directory sync (non-Windows)
  7. NEW checkpoint: if reason = manual, or ≥ 15 min since the last checkpoint:
       copy the new save.json into backups/r<rev>-<ts>.json (temp + rename); keep the newest 5
  8. NEW asset GC (best effort, never fails the save): see "Image asset references"
  9. return { saved, revision, saved_at }; mark last_saved_revision
```

- **Failure semantics** are unchanged (H4 table). A failure after step 6 is "uncertain completion" and is reported as such.
- **Lock:** a per-campaign `.lock` file holding the PID gives a one-process-per-campaign guard. It is cleared when stale. This covers two Play UI processes.

## Load algorithm

```text
load(campaign_id, slot = "current"):
  1. existing: bounded read → strict JSON → migrate (1…4→5) → envelope check → snapshot parse
  2. NEW tiered canon compatibility (D2), replacing the all-or-nothing fingerprint check:
       a. every referenced ID must still exist with the same entity type        → else reference_invalid (hard fail)
       b. world reconciliation, explicit and reported:
          - canonical NPC with a base location missing from runtime.npc_locations → add LOCATED at its base location
          - runtime.npc_locations entry for an NPC no longer in the world, and referenced nowhere else → drop
          - anything else the graph validator rejects                            → hard fail (dataset_mismatch)
       c. fingerprint drift on surviving references → allowed; listed in the load report (ids only)
       If (b) changed anything: revision + 1 ("world reconciliation") and the session starts dirty.
  3. existing: rebind the dataset ID → validateCampaignSnapshot → CampaignState.restore
  4. NEW continuity: accepted only if continuity.revision == the loaded revision (before reconciliation) and bounds hold;
       restore RecentConversation into the new coordinator and the transcript into the session. Otherwise drop + note.
  5. NEW asset check: stat every referenced portrait/reference file → missing ones listed in the load report.
  6. return { session, report: { slot, migrated_from?, reconciled[], canon_drift[], missing_assets[], continuity: "restored" | "dropped" } }
```

- **`strict` compatibility** (migrated v1 saves) keeps its current meaning. A developer flag `CALDREVAN_STRICT_CANON=1` restores the old all-or-nothing behaviour for testing.
- **No automatic fallback to the previous slot.** If current fails, the UI shows the error and offers "Load previous save" and the backups. The rule "a corrupt current blocks saving" stays. The UI offers to load previous or a backup, and the next save then **quarantines** the corrupt current as `save.corrupt-<ts>.json` before writing. That is an explicit user action, so no evidence is destroyed.
- **The narrator's first turn after a load** gets the restored recent conversation. Scene participants start empty, which is the same as a scene boundary.

## Autosave triggers

**Trigger:** "the committed revision advanced, the session is idle, and that revision isn't saved yet." This covers all of:

| Event | Covered by |
| --- | --- |
| Player turn (narration + commit + post-turn maintenance/reflection) | revision change; waits until status returns to `idle` after post-turn |
| NPC+ appearance edit, role assignment, image delete, reference change | revision change |
| Portrait batch commit | revision change (shrinks the orphan window to about a second) |
| Location override, household or legal changes | revision change |
| Pure UI events (tabs, modals, lightbox, pose selection) | **never**: no revision change |

**Coalescing:**
- **Debounce:** 2 s after the last committed change, with a 10 s maximum wait.
- **Single flight:** one save at a time. A change during a write schedules exactly one follow-up.
- **Never** during `running_turn`, `post_turn`, `compacting_context` or a portrait batch. Saves wait for idle. This reuses `GameSession`'s idle waiters.
- **Manual Save** flushes immediately, with reason `manual`, and also creates a checkpoint.
- **Graceful quit** (SIGINT, SIGTERM, or switching campaign) does `shutdown` → flush save (reason `quit`) → close. If that save fails, the user is told and the process does not silently discard.

**Failures:**
- The status shows `save_failed: <code>`. The next trigger retries, with backoff of 2, 10 and 30 s.
- `save_in_progress` is retried.
- A **corrupt current** stops autosave and shows the recovery choice.

`docs/architecture/PERSISTENCE.md` and `docs/UI_ENGINE_CONTRACT.md` must be updated, because they currently state "no autosave".

## Image asset references

- **References:** the save keeps only `asset_file` names (already true). The resolved path is `saves/campaigns/<id>/portraits/<hash(id, character)>/<file>`. There are no absolute paths and no base64.
- **Garbage collection (GC):** a file is **live** if it is referenced by the in-memory snapshot, `save.json`, `save.previous.json`, or any kept backup. GC removes files in the campaign's `portraits/` tree that are not live, plus `.tmp-` files older than 1 h. GC runs after each successful save and on demand.
- **Deferred deletion:** `deleteNpcPortrait` and reference replacement **stop removing files immediately**. They only commit the metadata. The file disappears at the next GC, once no slot or backup references it anymore. This fixes "deleted, then crashed or loaded previous, then the file is missing".
- **Orphan detection** reports, without deleting:
  1. files under a campaign that no live set references (normally collected by GC);
  2. campaign folders in `saves/campaigns/` without a valid save;
  3. legacy trees outside the root, for example `saves/ui_playtest/portraits/**`.

  An explicit "Clean up" action deletes category 1, and only with user confirmation in v1.
- **Campaign delete:** the whole campaign folder is moved to `saves/.deleted/<id>-<ts>/`. Saves and images move together. Purging is manual.
- **Export later:** copy the campaign folder. Nothing in it is absolute.

## Missing asset behaviour

- **Load never fails** because of an image. Missing files are listed in the load report.
- **Projection:** gallery items and role slots carry `asset_missing: true`, checked once at load and refreshed after GC.
- **UI:** a neutral "Image file missing" placeholder with a Delete action. Deleting a version whose file is gone succeeds. A role holder still shows the placeholder, and the user reassigns it.
- **Records are never auto-dropped** because a file is missing. The metadata stays authoritative until the user acts.

## Campaign identity

- **ID:** engine-generated at creation, `campaign_<yyyymmdd>_<6 random hex>`. It is valid snake_case and immutable. It is never derived from user text, so there are no collisions and no unsafe names.
- **Display name:** `metadata.display_name`. Rename changes only that field and is written at the next save. The default is "Nicco (8 Oct 2026)".
- **Operations:**
  - `createCampaign(preset, display_name)` builds the opening preset (D5), then saves immediately, so it is listed at once.
  - `listCampaigns()`: the extended `listSaves`.
  - `loadCampaign(id, slot | backup)`.
  - `renameCampaign(id, name)`.
  - `deleteCampaign(id)`: a soft delete.
- **One live session per process** (unchanged). Switching does shutdown + flush save, then loads the other campaign.
- **The `ui_playtest` playtest mode** stays available behind `npm run play:ui -- --playtest`, with exactly today's behaviour and layout. The default `play:ui` starts with campaign selection.
- **Existing files** under `saves/ui_playtest/portraits/ui_playtest/…` (3 images) have no surviving metadata, so they **cannot be attached** to a persistent campaign. Their folder hash is also bound to `ui_playtest`. They are left in place and reported as orphans. Removing them is the user's choice.

## Compatibility strategy

| Identifier | Purpose |
| --- | --- |
| `canonical_dataset_id` | Exact world identity at save time. Informational once references exist |
| `canon_references[]` | Which authored records the campaign depends on, with fingerprints. Used for tier (a) existence/type checks and the tier (c) drift report |
| `metadata.engine_version` | Diagnostics only; never used to gate loading |
| `schema_version` (envelope/snapshot) | Format compatibility; the only gate besides canon checks |

**World authoring changes:**

| Change | Result |
| --- | --- |
| Label or prose edits | Load silently (as today) |
| Content or structure edits to a referenced record | Load with a drift warning |
| New NPC | Reconciled to its base location |
| Removed NPC or location still referenced by campaign state | Explicit failure naming the IDs |

That last failure needs a migration or authoring fix; it is never guessed. NPC+ data for a canonical NPC whose canon changed is fine: campaign overrides win, as today.

## Migration strategy

1. **Save files:** the 4→5 step (version-only for the snapshot, as described above). Tested against fixtures of every historical version (1–4).
2. **Storage root:** nothing is migrated automatically.
   - `saves/<id>/save.json` folders made by the CLI or tests are *not* moved.
   - `listCampaigns` ignores them.
   - A one-off explicit `npm run import:save -- <path-to-campaign-dir>` copies a legacy save folder (and, if present, `saves/portraits/<id>/**`) into `saves/campaigns/<id>/`. The source stays intact.
3. **`saves/ui_playtest`:** untouched (see Campaign identity).
4. **Policy document updates** in the same pass: `PERSISTENCE.md` (autosave, continuity, root, GC) and `UI_ENGINE_CONTRACT.md` (campaign lifecycle API).

## Testing strategy

**Approach:**
- Offline only. Use temporary roots, the injectable `SaveFileSystem` for fault injection, an injectable clock and scheduler for debounce, and a fake image generator.
- One end-to-end Play UI check with headless Edge (no paid calls; images come from the fake generator through a test launcher), plus one real restart of the production server.

| # | Test | Level | Notes |
| --- | --- | --- | --- |
| 1 | Create campaign | session | Engine-generated ID, display name, immediate first save, listed |
| 2 | Save | repository | Envelope 5, sorted JSON, continuity bounded, `save_reason` |
| 3 | Process restart simulation | session | New deps/repository/session objects over the same root |
| 4 | Load | session | Load report shape (`migrated_from`, `reconciled`, `canon_drift`, `missing_assets`, `continuity`) |
| 5 | Location restored | session | `runtime.scene.player_location` |
| 6 | Time restored | session | `world_minute`, daypart in view |
| 7 | Revision restored | session | Exact, and the next change is +1 |
| 8 | NPC+ edits restored | session | `set_profile` appearance overrides, mannerisms, contracts |
| 9 | Household restored | session | Members, roles, rules, funds, legal |
| 10 | Portrait gallery restored | session | Versions + all v1 metadata fields |
| 11 | Avatar/full-body roles restored | session | Including legacy kind-less role holders |
| 12 | Image paths resolve | session/store | Tokens serve bytes after restart; the path is under `campaigns/<id>/portraits` |
| 13 | Missing image does not crash load | session | `asset_missing`, placeholder, delete works |
| 14 | Old save migrates | format | Fixtures v1, v2, v3, v4 → 5; the source file is unchanged on disk |
| 15 | Unsupported future save | format | Schema 6 → `unsupported_version`, file untouched, clear message |
| 16 | Atomic write survives failure | repository | Inject failures at each step (temp write, sync, backup rename, current rename); current stays valid |
| 17 | Autosave debounce | session | Fake clock: N commits within 2 s → 1 save; max wait 10 s; never during `running_turn` or a portrait batch; change during write → exactly one follow-up |
| 18 | Multiple campaigns isolated | repository/session | Two IDs: separate saves, portraits and listings |
| 19 | No cross-campaign portrait leakage | session | Campaign B's tokens never resolve campaign A's files; the same character in both gets different hash folders |
| 20 | Orphan detection | store | Unreferenced files are found; files referenced by previous or backups are kept; `.tmp` age rule; legacy `ui_playtest` tree reported, not deleted |
| 21 | Derived Scene RAM rebuilt | session | `buildTurnContext` after load equals before save (present characters, ancestry) |
| 22 | `expected_revision` coherent after load | session/HTTP | The editor opened before a load is refused `stale_turn` afterwards; a fresh view works |
| 23 | World data mismatch handled explicitly | format | Removed referenced NPC → `reference_invalid` naming IDs; new NPC → reconciled (+1 revision, dirty); drift → report |
| 24 | Corrupted save keeps the backup | repository | Corrupt `save.json` → load error; previous and backups load; the next save quarantines the corrupt file and never overwrites previous with it |
| 25 | Continuity restore | session | Recent conversation is present in the first post-load narrator request; a revision mismatch drops it with a note |
| 26 | Deferred deletion | session/store | Delete → file kept while previous references it → gone after the next two saves |
| 27 | Graceful quit saves | session | `shutdown` flushes with reason `quit`; a failure is surfaced |
| 28 | Lock | repository | A second process/session on the same campaign is refused; a stale lock is recovered |
| 29 | Corrupt current blocks autosave | session | Autosave stops, status shown, explicit recovery path |
| 30 | Playtest mode unchanged | UI | `--playtest` keeps today's disposable behaviour and paths |

Existing persistence tests (`campaign-restore`, `household-runtime`, `npc-plus-pass-1`, `narrator-persistence`, `final-movement-closure`, `portrait-gallery`, …) must keep passing. Their fixtures move to envelope 5 through migration, not by editing.

## Feature table

| FEATURE | CURRENT | REQUIRED V1 | PROPOSED CHANGE | RISK |
| --- | --- | --- | --- | --- |
| Save codec | Envelope 4 / snapshot 3, strict, migrations 1→4 | Same, versioned for image v1 | Envelope 5 / snapshot 4, version-only step | Low |
| Atomic write + previous slot | Yes (temp, sync, rename, rotation) | Yes | Keep; add rolling checkpoints | Low |
| Campaign identity | Domain ID; UI hardcodes `ui_playtest` | Persistent, many campaigns | Generated immutable ID + `display_name` | Low |
| Storage root | `saves/<id>/`, portraits `saves/portraits/<id>/`; dev clutter | Isolated, self-contained campaigns | `saves/campaigns/<id>/{save, portraits, backups}` | Medium (path change touches the store and tests) |
| Listing | Slot status, revision, saved_at | Name, place, day, status | Extended listing summary | Low |
| Manual save in UI | Button disabled; no route | Save button + status | `POST /api/save`, header indicator | Low |
| Load in UI | None | Start screen: continue / new / load | Session host + routes + small start screen | Medium (server owns a swappable session) |
| Autosave | None (policy forbids) | Coalesced idle autosave + save on quit | Scheduler in `GameSession`; policy docs updated | Medium (interaction with turns and batches) |
| Narrator continuity | Lost on load | Resume conversation | Non-authoritative `continuity` section (D1) | Medium (authority boundary must hold) |
| Transcript | `server.ts` memory | Restored on load | Moves into session continuity | Low |
| Canon compatibility | Any non-label edit to ~35 NPCs / ~27 locations blocks every save | Survive normal authoring | Tiered checks + reconciliation + load report (D2) | **High** (semantics of a safety boundary) |
| New authored NPC | Load fails | Load works | Reconcile to base location, +1 revision | Medium |
| Portrait files vs save | Independent; orphans; immediate delete | Consistent lifecycle | Deferred deletion + GC over live ∪ slots ∪ backups | Medium |
| Missing image | Silent 404 | Graceful | `asset_missing` + placeholder + report | Low |
| Orphan detection | None | Detectable | Report + confirmed cleanup | Low |
| Campaign delete | None | Possible | Soft delete to `saves/.deleted/` | Low |
| Multi-process safety | In-process lock only | One writer per campaign | PID lock file | Low |
| Future-version saves | `invalid_save` for new optional fields | Clear refusal | Always bump versions; clear message | Low |
| Existing `ui_playtest` assets | Orphans | Not lost by accident | Untouched; reported; manual removal | Low |

## Implementation passes (proposed)

1. **Persistence core:** envelope 5 / snapshot 4 and migration; continuity section; campaign root and layout; display name, listing summary, checkpoints, lock, quarantine; tiered compatibility, reconciliation and load report; portrait store root; GC, deferred deletion, missing-asset check, orphan report. With tests 2, 3–16, 18–20, 23–24, 26, 28.
2. **Application:** `GameSession` campaign lifecycle (create / load / rename / delete); continuity export and import (coordinator `RecentConversation` restore seam); autosave scheduler; save on quit; a session host replacing the fixed session in `server.ts`; routes. With tests 1, 17, 21–22, 25, 27, 29.
3. **UI:** start screen (continue / new / load list with recovery options), header Save button with status, load-report notice, missing-image placeholder, `--playtest` flag. With test 30 and a headless browser pass.
