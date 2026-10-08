# Phase 1J: Manual Persistence & Restore Foundation

> ## Save/Load v1 (current): persistent campaigns
>
> This section supersedes the Phase 1J "no autosave" policy and the V2/V4 format notes below wherever they conflict. Everything else
> (strict JSON, validation, path safety, two-slot rotation, explicit recovery) still holds. Design: `docs/save_load_v1_design.md`;
> audit: `docs/save_load_audit.md`.
>
> **Campaign root.** The Play UI stores real campaigns under `saves/campaigns/<campaign_id>/`:
>
> ```text
> saves/campaigns/<campaign_id>/
>   save.json              current slot (save format 5, snapshot 5)
>   save.previous.json     the preceding successful save (rotated by every save)
>   backups/               up to 5 rolling checkpoints r<revision>-<timestamp>.json (save JSON only: no images, no transcript)
>   transcript.jsonl       campaign history (narrative, never canonical)
>   portraits/<character token>/portrait_… | reference_…   image files (bytes never in JSON)
>   .lock                  writer lock {pid, token}; a dead holder's lock is recovered
> saves/.deleted/<campaign_id>-<timestamp>/   soft-deleted campaigns (moved, never purged automatically)
> ```
>
> Campaign IDs are engine-generated (`campaign_<yyyymmdd>_<6 hex>`), immutable and never derived from the display name. The
> disposable playtest mode (`npm run play:ui -- --playtest`) keeps the old layout under `saves/ui_playtest/` and never saves.
>
> **Versions (current).** Save format **5**, snapshot **5**. Readers accept older files only through the migration steps below.
> Snapshot 5 (Player Character Profile V1) is described in its own paragraph below.
>
> *History of the format-5 step (Save/Load v1, at which time the snapshot was 4):* format 5 adds optional
> `metadata.display_name`, `metadata.save_reason` (`create | manual | autosave | quit`), `metadata.scenario_id` (e.g.
> `caldrevan.slave_market.v1`), a written `engine_version`, the optional non-authoritative `continuity` block and an optional
> `kind` per canon reference. Snapshot 4 formally adopted the image-generation-v1 portrait fields. Migration `4 → 5` (envelope) /
> `3 → 4` (snapshot) is version-only and lossless; a version-4 file carrying format-5 fields is rejected (`migration_failed`). A
> format-4 file is migrated through both steps (envelope 4 → 5, snapshot 3 → 4 → 5). Rule from now on: every new persisted field, even optional, gets a
> version bump and a migration step, so older builds report `unsupported_version` instead of `invalid_save`. Loading never rewrites a
> file; the first save after a load writes the current version. A newer file is refused with `unsupported_version` and left untouched.
>
> **Snapshot 5 (Player Character Profile V1).** Snapshot 5 adds `player_characters[]`: exactly one bounded profile per authored player
> character (v1: Nicco), holding `character_id`, optional `sex`/`species`/`apparent_age` and a structured `appearance` (the NPC+
> `CharacterAppearance` shape). The envelope stays format 5. Snapshot migration `4 → 5` (`migrateSnapshot4to5`) is the first
> world-aware step: it runs inside `validateSaveFileWithReport` after the envelope steps and adds the deterministic canon default
> (`defaultPlayerCharacters(world)`: canon `sex`, `species`, `age_band` and `traits` only; prose is never parsed). A snapshot-4 file
> that already carries `player_characters` fails with `migration_failed`; the load report carries `snapshot_migrated_from: 4`. As
> always, the source file is not rewritten; the first save writes snapshot 5. After that the profile is campaign-owned: canon edits
> to the player character never overwrite it (canon only seeds new or migrated campaigns). Snapshot validation enforces exactly one
> profile per authored player, no unknown keys, no control characters, field limits (identity 60, text 200, description 1000, 12
> list items) and ≤ 6000 serialized characters, so a save cannot smuggle a large prompt-injection field. See `PLAYER_CHARACTER.md`.
>
> **Canonical vs continuity vs history.**
> - *Canonical state* is the snapshot (all campaign domains, revision, portraits metadata). It is the only authority.
> - *Continuity* (`continuity` in the save) is the bounded recent conversation, ≤ 12 finalized exchanges, marked
>   `"authority": "non_authoritative"`. On load it is added to the narrator's conversation window only when its `revision` equals
>   the saved revision. It is never replayed, never parsed into state, never validated against canon; a malformed block is dropped
>   with a load-report note and never makes a save unloadable.
> - *History* (`transcript.jsonl`) is append-only JSONL (`{i, at, role, text, revision, turn_id?}`), written only after a
>   canonical save succeeded (entries up to the saved revision). A failed append leaves the canonical save valid, is reported as
>   `transcript_error` and retried at the next save. Loading an older slot writes a `{kind:"rollback", revision}` marker before the next
>   append; readers hide abandoned entries. A missing or damaged transcript never blocks a load. Backups never copy it.
> - *Derived* state (Scene RAM, turn context, prompts, views, portrait URLs/tokens, staleness, retrieval indexes) is rebuilt.
>   *Transient* state (temporary scene participants, traces, diagnostics, UI state) is discarded; a load is a scene boundary for
>   temporary participants.
>
> **Canon compatibility tiers** (replacing the all-or-nothing fingerprint check). `compatible`: additions anywhere, label/prose
> edits, edits to records the campaign does not reference. Additive canon never mutates a loaded campaign: a newly authored NPC
> gets no runtime entry, the revision is unchanged and the session stays saved (it remains available through the WorldStore; play
> may place it later through a normal committed change). `compatible_with_warnings`: a referenced record changed non-label
> content (drift, IDs reported), a runtime-only location entry of a removed NPC was dropped (revision + 1), or a legacy strict save
> without fingerprint evidence loads on a changed world (`unverified`). `incompatible`: a referenced record disappeared
> (`reference_invalid`, IDs listed) or changed kind / the reconciled state no longer validates (`dataset_mismatch`). Load stops; the
> save is never modified; no replacement canon is invented. Revision only advances when reconciliation changed state.
>
> **Autosave (deliberate policy).** After committed mutations only (turn commits, NPC+ edits, player profile edits, household/role/portrait changes,
> location correction, a completed portrait batch, load reconciliation); viewing never dirties. A delivered exchange that committed
> no state (most dialogue) also schedules an autosave and a quit-save so its continuity and history reach disk; it does not mark the
> campaign "Unsaved changes" (found in the live validation: such turns were otherwise lost on restart). Debounce 2 s, maximum delay 10 s,
> one save at a time, coalesced; a mutation during a save causes exactly one follow-up. Never during a turn, post-turn step,
> compaction, portrait batch, save, or campaign load/swap. Ordinary failures retry with backoff 2 s / 10 s / 30 s, then wait for the
> next mutation; a corrupt/incompatible slot, a lost lock or an unsafe path STOPS autosave until a successful explicit save. Manual
> Save is immediate. Graceful shutdown (Ctrl+C, campaign switch) saves a dirty campaign with reason `quit` first.
>
> **Backups and recovery.** Every save rotates current → previous as before. A checkpoint is written for `create`/`manual`/`quit`
> saves and at most every 15 minutes of autosaves; 5 are kept. A corrupt or unreadable current slot is never overwritten: loading
> fails; the start screen offers *Load previous save* / *Load latest backup*; the first save of that explicitly recovered session
> moves the corrupt file aside as `save.corrupt-<timestamp>.json` (kept) and writes a fresh current. The load report records the source.
>
> **Image assets.** Saves reference portrait files by bare file name (`asset_file`) per character; the path is rebuilt from the
> campaign root, the campaign ID and a per-character hash. Deleting a Gallery image commits metadata only; the file is removed once
> no retained state (live campaign, `save.json`, `save.previous.json`, any kept backup) references it — protection keeps the file,
> never the Gallery entry. Orphans (files no retained state references) are detected and reported, never removed automatically;
> the explicit cleanup (`removePortraitOrphans({confirm:true})`) stays inside the campaign's portrait tree. A missing image file
> never blocks a load: the record stays, the load report counts it and the UI shows a placeholder.
>
> **Locking.** One writer per campaign: the session host holds `<campaign>/.lock` while a campaign is open; saves by anyone else are
> refused (`campaign_locked`). The holder refreshes the lock's modification time every 30 s; a lock is held only while its PID runs
> AND its heartbeat is younger than 90 s, so a crashed holder frees it at once and a reused PID (seen live on Windows) within 90 s.

## Manual-save policy and ownership

**Phase 1J did not autosave** (superseded by Save/Load v1 above for the Play UI; CLI and tests still save only explicitly). CampaignState is the authoritative in-memory
truth between saves. Unsaved changes may be lost when the process exits. No
timers, per-command/per-turn saves, exit handlers or implicit save-before-load
exist. Saving is an explicit engine operation for a future Save button.

WorldStore remains immutable authored canon. CampaignState owns current campaign
truth and its revision. The repository owns serialization/storage; CampaignSession
owns dirty tracking. No gameplay command imports or calls filesystem persistence.

## A. APIs and files

`src/persistence/campaign-repository.ts` defines `CampaignSaveRepository` and its
Node filesystem implementation, `FileCampaignRepository`. `filesystem.ts` is a
small injectable adapter for fault tests. `save-format.ts` owns the V2 envelope,
`strict-json.ts` bounded strict JSON parsing, `errors.ts` public typed failures,
and `campaign-session.ts` manual-save session metadata.

```ts
const repository = new FileCampaignRepository(world); // default root: ./saves
const session = new CampaignSession(campaign, repository);

session.hasUnsavedChanges;       // initially true
await session.save();            // only an explicit call writes a save
session.last_saved_revision;    // captured revision of the successful save

const loaded = await repository.loadCampaign("my_campaign");
const resumed = CampaignSession.fromLoaded(loaded, repository);
// Explicit recovery, never an automatic fallback:
const previous = await repository.loadCampaign("my_campaign", "previous");
const listing = await repository.listSaves();
```

An explicit root can be passed to the repository constructor. A trusted `now`
function and filesystem adapter can be injected for testing. All save/load/list
methods either return a small typed result or reject with `CampaignSaveError`.
Load constructs a new campaign; it does not replace an existing live session or
decide whether unsaved changes should be discarded. That decision belongs to UI.

`npm run inspect:save -- <campaign-id>` reads the default root and prints only
supported schema, ID, slot availability, validation status and safe metadata.
It does not create directories, load a live campaign or print character state.

## B. Current V2 format

> **Historical versions (final movement closure; superseded by Save/Load v1 above):** envelope `schema_version` 4, snapshot `schema_version` 3. Version 3 of the envelope (snapshot 2) migrates by step 3, which only bumps both numbers: every older location is a valid `LOCATED` entry. A runtime character location is now `{ character_id, current_location }` (LOCATED) or `{ character_id, off_scene: { last_known_location, since_revision } }` (OFF_SCENE), exactly one of the two. An old-schema file carrying `off_scene`, a malformed location, both shapes, neither, a non-location place or a future `since_revision` is rejected. The dataset hash does not depend on runtime location state. The interface below is the historical V2 sketch.

```ts
interface CampaignSaveFile {
  format: "caldrevan_campaign_save";
  schema_version: 2;
  campaign_id: string;
  canonical_dataset_id: string;
  metadata: {
    saved_at: string;       // canonical UTC ISO timestamp
    created_at?: string;
    engine_version?: string;
  };
  snapshot: CampaignSnapshot; // snapshot schema stays v1
  canon_compatibility: "strict" | "references";
  canon_references?: readonly { id: string; fingerprint: string }[];
}
```

`snapshot.revision` is the only saved revision field. The envelope campaign ID
and dataset ID must equal their snapshot counterparts. The file's directory ID
must also match. Metadata is informational: it never changes revision, world
minute, mana, locations, relationships or countdowns. The first save establishes
created_at; later saves preserve it. No engine-version metadata is synthesized.

The snapshot includes schema/campaign/dataset identity, revision, runtime
scene/time/NPC locations/mana, character origins/profile overrides/current state,
items/ownership/placement/provenance, households, facts, per-character knowledge,
directed trust, goals and absolute scheduled events. See
[CampaignState](CAMPAIGN_STATE.md) for the domain definitions.

Only allowlisted plain data is serialized. No WorldStore copies, source paths,
NarrativeContext, SceneRam, indexes, embeddings, retrieval caches, preparation
receipts, environment variables, credentials, equipment views or countdowns are
included. Saves are independent of repository installation paths. User-authored
descriptive strings are preserved; the serializer does not infer or inject
machine/provider metadata.

JSON is UTF-8, two-space indented, with sorted object keys and a trailing newline.
Array order is preserved, including meaningful alias/description ordering. Engine
snapshots already keep map-like records deterministically ordered. Loading does
not depend on JSON object property order. Restored map-like array order alone
does not turn a subsequent no-op command into a revision increment.

## C. Session and unsaved changes

`CampaignSession.last_saved_revision` begins as null for a new session. After a
successful save it becomes the revision captured when that save was requested.
`hasUnsavedChanges` compares the current campaign revision with this value. Failed
saves never advance it. A session created from an explicit loaded result begins
clean relative to that selected slot, including when recovering previous.

Saving does not change campaign revision. **Unchanged Save rewrites** the file
with updated saved_at and rotates the former current into previous. Thus previous
means the preceding successful manual save, not necessarily a different revision.

The repository captures an immutable snapshot synchronously before its first
filesystem await. Gameplay may continue while writing. If gameplay advances, the
captured revision is saved and the newer in-memory revision remains dirty.

Overlapping saves to the same normalized root/campaign path reject with
`save_in_progress`, including across repository instances in this process.
The session also guards its own in-flight call. Reads may observe old or new
complete files during replacement; they never use temporary files. No distributed
or multi-process locking is implemented.

## D. Layout and exact write strategy

```text
saves/
  <campaign_id>/
    save.json
    save.previous.json
    .save-<internally-generated-uuid>.tmp   # transient; ignored by reads
```

The default root is git-ignored and separate from authored `data/`. Roots inside
the current project's `data/` are rejected. Explicit roots must likewise be kept
separate from any relocated canonical authoring tree.

The save sequence is:

1. Capture and validate the snapshot/envelope before filesystem creation.
2. Check/create the root and campaign directory without following links/junctions.
3. If current exists, read and fully validate it. Refuse to save over corrupt,
   incompatible or unsupported current files; never rotate them into previous.
4. Exclusively create a fresh campaign-local temp (`wx`, restrictive file mode),
   write the new JSON, call FileHandle.sync(), and close it.
5. If a valid current exists, write its validated original bytes to a separate
   exclusive temp, sync and close it, then rename that temp over previous.
6. Rename the new temp over current in the same directory. **Never unlink or move
   current away before this replacement.**
7. Sync directory metadata on platforms where supported, then return `saved`.
8. On failure, perform best-effort cleanup of this attempt's remaining temps.

Node FileHandle.sync requests flushing file data to storage; its implementation
depends on the OS/device. Node's rename uses platform replacement semantics;
libuv's Windows implementation uses MoveFileExW with replacement enabled. All
temp files are on the destination filesystem. Windows sharing/permission failures
surface as errors; there is no delete-and-retry replacement fallback.
[Node filesystem documentation](https://nodejs.org/download/release/latest-jod/docs/api/fs.html#filehandlesync),
[libuv Windows implementation](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c).

Directory fsync is used off Windows, including after directory creation and each
replacement. Windows directory fsync is not portably available through these Node
primitives, so it is skipped there; file contents are still flushed before rename.
This is same-directory replacement with durable file-data flush, not a promise of
transactional metadata survival after power loss on every filesystem/device.

## E-H. Restore, compatibility and recovery

Load reads only the requested current/previous filename, with a 16 MiB byte limit
and fatal UTF-8 decoding. Strict JSON rejects malformed syntax, trailing content,
duplicate decoded keys and nesting beyond 64 levels. Parsing yields data, never
executable objects. The envelope schema rejects unknown keys and invalid metadata.

`CampaignState.restore(world, unknownSnapshot)` is a dedicated validated path.
It directly assigns a detached, deeply immutable current snapshot with fresh
receipt ownership. It does not construct a startup RuntimeState, replay commands,
re-award mana, repopulate NPC locations from authored starting positions, fill
unknown character locations, or reopen terminal goals/events.

`src/campaign/snapshot-validation.ts` validates the entire state graph. The
record schemas are shared with command parsing, and whole-snapshot validation
also runs before publishing changing command batches. Checks cover:

- Schema, IDs, string/collection bounds, signed safe-integer world minute,
  nonnegative safe-integer revision and valid mana bounds.
- Every canonical NPC exactly once in live runtime locations; no player/created
  character masquerading as a canonical NPC. All live locations must exist.
- Origins, global identity collisions, owners/holders, stored locations and
  acquisition references; one occupant per equipment slot and no occupied/empty
  contradiction.
- Household/knowledge/relationship key uniqueness, character/fact/chunk/event
  references, sparse directed trust, goal targets and scheduled participants.
- Provenance/creation timestamps not beyond the restored world clock. Scheduled
  target times may be past or future under the Phase 1I rules.
- Plain record/array shapes, no accessors, unsupported prototypes, symbols,
  sparse arrays, functions, Maps, Sets or cycles.

Missing optional values remain missing. Sparse knowledge/relationship edges
remain absent. Ownership does not become equipment. Canonical empty profile
overrides still fall back to canon. Revision 87 restores as 87, a no-op stays 87,
and the next changing command becomes 88.

Envelope versions 1 and 2 are supported. `save-migrations.ts` runs the explicit
v1 -> v2 step before strict current validation. The required persisted canon
compatibility policy and reference manifest justify v2; the snapshot stays v1.
Migration preserves unknown legacy fields for strict rejection, never silently
removes them. Unsupported versions and invalid/throwing chains fail before restore.

Migrated v1 saves use `strict` full-dataset identity because old files contain no
reference evidence. New saves use `references`: IDs and SHA-256 fingerprints for
a conservative superset of authored references in the snapshot, plus Nicco.
Fingerprints omit only top-level name, display_name, summary, description and
aliases. All other fields, including authored content, visibility, connections,
and defaults remain conservative. Unrelated additions/graph changes and these
label edits can load. Missing references fail `reference_invalid`; changed
referenced structure fails `dataset_mismatch`. Adding an NPC requiring a new
runtime location still fails graph validation rather than inventing campaign state.

After compatibility, detached snapshot identity is rebound to the current dataset
and the complete existing runtime reference validator runs. Direct
`CampaignState.restore` still requires strict identity; use `decodeSave` for
versioned compatibility. Saving never manufactures evidence for a snapshot bound
to a different world. Loading never writes either slot or mutates authored canon.

See [H4 report](../evaluations/archive/CALDREVAN_HARDENING_H4_PERSISTENCE_DIAGNOSTICS.md)
for the policy comparison, matrices and current verification.

| Failure stage | Current | Previous | Session tracking |
| --- | --- | --- | --- |
| Validation / new-temp write / backup-temp write | Original current untouched | Original previous untouched | Unchanged |
| Backup replacement fails | Original current untouched | Existing previous remains on ordinary failed rename | Unchanged |
| New-current replacement fails after backup succeeds | Original current untouched | Valid copy of original current | Unchanged |
| Error after current replacement, e.g. directory sync | New complete current may already be visible | Valid old current | Unchanged; call reports failure |
| First save fails before replacement | No current | No backup | Remains null |

Current and previous are **not a single multi-file atomic transaction**. A crash
between their replacements can leave both containing the old current; this is
safe redundancy, not an incomplete JSON backup. Sudden power-loss guarantees
remain bounded by platform/filesystem behavior. Post-replacement errors are
uncertain completion, not grounds for pretending the save definitely did not
reach disk. A read can inspect the resulting state; a later explicit save retries.

`loadCampaign(id)` never falls back. `loadCampaign(id, "previous")` is explicit
recovery and returns the selected slot. Loading previous does not repair current.
If current is corrupt, saving remains blocked to preserve evidence and backups;
deliberate external quarantine/removal of the corrupt current is required before
a new first-current save. No automatic repair/deletion feature is included.

Listing validates files without constructing CampaignState instances and returns
only per-slot availability, validity/error status, revision, saved_at and dataset
ID where valid. Broken entries are distinguishable. Unknown temp files are ignored.

## I. Path and error boundaries

Campaign IDs use the existing bounded lowercase snake_case rules, plus rejection
of Windows reserved device names such as con/nul/com1. Display names and filenames
never determine campaign identity. No user filename or slot path is accepted.
Directory/file paths are joined under the configured root and checked for lexical
containment. Existing ancestor, root and campaign directory links/junctions are
rejected; existing save files must be regular, non-hard-linked files.

These checks defend against crafted IDs and pre-existing filesystem redirection.
The save directory must be controlled by the current user. They are not an OS
sandbox against another process maliciously swapping directories between checks;
multi-process writers and network-filesystem guarantees are outside this phase.

Public errors contain a stable code and safe message, not raw Node errors or
stack traces: `not_found`, `invalid_json`, `invalid_save`, `unsupported_version`,
`migration_failed`, `dataset_mismatch`, `reference_invalid`, `invalid_id`, `unsafe_path`,
`save_in_progress`, `io_error`. The inspector prints safe messages/metadata only.

## J-L. Original Phase 1J verification and scope (historical)

**378 offline tests pass; typecheck passes.** The 60 new tests include rich exact
snapshot round trips, revision preservation/no replay, all campaign domains,
malicious input and reference failures, real Windows filesystem rotation,
write/rename/sync/cleanup fault injection, explicit previous recovery, in-flight
dirty tracking, concurrency exclusion, linked-path rejection and portability
across save roots and canonical source paths. Tests create isolated temporary
directories and check their cleanup targets before recursive removal.

The read-only inspector was run against a missing save and created no save root.
No real campaign save or production lore was created as demonstration data.
No dependencies were added. No autosave, database, UI, narrator/provider changes,
retrieval work, event sourcing, migration, named slots, cloud sync, history browser,
or next-phase implementation is included.

**READY FOR NARRATOR PROVIDER**
