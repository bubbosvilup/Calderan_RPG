# Phase 1J: Manual Persistence & Restore Foundation

## Manual-save policy and ownership

**Phase 1J does not autosave.** CampaignState is the authoritative in-memory
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

> **Current versions (final movement closure):** envelope `schema_version` 4, snapshot `schema_version` 3. Version 3 of the envelope (snapshot 2) migrates by step 3, which only bumps both numbers: every older location is a valid `LOCATED` entry. A runtime character location is now `{ character_id, current_location }` (LOCATED) or `{ character_id, off_scene: { last_known_location, since_revision } }` (OFF_SCENE), exactly one of the two. An old-schema file carrying `off_scene`, a malformed location, both shapes, neither, a non-location place or a future `since_revision` is rejected. The dataset hash does not depend on runtime location state. The interface below is the historical V2 sketch.

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
