# Save/load audit

**Baseline:** working tree after image generation v1 (repo `3123656` plus the uncommitted image v1 work), audited 2026-10-08. **Mode:** read, trace and document only. No code, save folders or assets were changed.

The companion design is `docs/save_load_v1_design.md`.

## Summary

Caldrevan already has a careful, well-tested persistence engine (Phase 1J, hardened in H4): a versioned save format, migrations, two save slots (current and previous), atomic writes, strict validation and canon compatibility checks. The **Play UI simply never uses it**. It runs a hardcoded, disposable campaign (`ui_playtest`), has no load or save route, and its Save button is a disabled placeholder.

Six things block "persistent campaigns" in practice, and all are outside the save codec itself:

1. **No UI lifecycle.** Nothing chooses, creates, loads or saves a campaign in the Play UI.
2. **Conversation continuity is in memory only.** It is deliberately session-local, so a reloaded campaign would make the narrator lose the last 12 exchanges.
3. **The transcript is in memory only.** The visible chat lives only in `server.ts`.
4. **Images and the save are two stores with no lifecycle between them.** This creates orphans and missing files.
5. **The canon compatibility policy is very strict.** Almost any authoring edit to an NPC or location makes every existing save unloadable.
6. **The save root is shared** with dev artifacts and with the portrait folder. Its name space collides.

## Existing persistence

There are three independent mechanisms.

### 1. Campaign saves (`src/persistence/`)

| Module | Role |
| --- | --- |
| `campaign-repository.ts` | `FileCampaignRepository`: `saveCampaign`, `loadCampaign(id, "current" \| "previous")`, `listSaves`. Path containment, link/junction rejection, an in-process write lock (`save_in_progress`) |
| `save-format.ts` | Envelope `caldrevan_campaign_save` (schema 4): `createSaveFile`, `validateSaveFile`, `decodeSave`, `serializeSave` (sorted keys, 2-space indent, trailing newline, 16 MiB cap) |
| `save-migrations.ts` | Sequential migrations, each step strictly n → n+1, on detached copies. Versions above current fail `unsupported_version`; a failing step fails `migration_failed` |
| `canon-compatibility.ts` | `canon_references`: the ID and SHA-256 fingerprint of every authored record the snapshot mentions |
| `strict-json.ts` | A bounded strict JSON parser (rejects duplicate keys, depth over 64, trailing content) |
| `filesystem.ts` | An injectable filesystem seam: exclusive temp creation, `FileHandle.sync`, rename, directory sync (skipped on Windows) |
| `campaign-session.ts` | Dirty tracking (`last_saved_revision`, `hasUnsavedChanges`) and an in-flight save guard |
| `errors.ts` | Typed `SaveErrorCode`s with safe recovery hints |

**Full flow.**
- **Save:** `CampaignState.exportSnapshot()` is captured synchronously → `createSaveFile` validates the whole graph and computes canon references → `serializeSave` → an exclusive temp file (`wx`, mode 0600, `sync`) → the old current is copied to `save.previous.json` via its own temp and rename → the new temp is renamed over `save.json` → the directory is synced (except on Windows).
- **Load:** a bounded read → `parseSaveJson` → `migrateSave` → envelope check → `requireCurrentSnapshotVersion` → `parseCampaignSnapshot` → compatibility (`references` or `strict`) → the snapshot is rebound to the current dataset ID → `validateCampaignSnapshot` → `CampaignState.restore`. No replay, no defaults, no re-seeding.
- **Users:** `GameSession.createCampaign` / `loadCampaign` / `save` / `listSaves`, the CLI (`src/dev/play.ts`: `/new`, `/load`, `/save`), `npm run inspect:save`, and many tests.
- **Docs:** the whole policy is documented in `docs/architecture/PERSISTENCE.md`.

### 2. Portrait asset store (`src/app/portrait-store.ts`)

- **Layout:** `<root>/<campaign_id>/<sha256("portrait-store:"+campaign+":"+character)[0:24]>/<portrait_|reference_…>.<png|jpg|webp>`.
- **Root:** `join(save_dir, "portraits")`, set in `production.ts`.
- **Writes:** `stage` (a `.tmp-` file, `wx`) → `finalize` (rename, never overwrites) → `remove` (best effort) → `read` (15 MB cap). No fsync.
- **Separate from saves:** it has no link to the save repository. Image bytes are written immediately; the metadata becomes durable only when the campaign is saved.

### 3. UI-local state (`src/ui/server.ts`, `src/app/ui-playtest.ts`, `src/ui/play.ts`)

- **Transcript:** `messages[]` in `server.ts` memory, seeded with `UI_PLAYTEST_OPENING`.
- **Narrator alternatives:** `NarratorAlternatives` comparisons, in memory.
- Nothing here is written to disk.

### Not persisted anywhere (by design)

- `TurnCoordinator`: `RecentConversation` (12 exchanges / 16k characters), `#lastInput`, `SceneParticipants` (temporary scene people, focus).
- `GameSession`: `TurnTrace` ring (200), diagnostics, compaction status.
- Lossless compactor caches.
- Retrieval / semantic indexes. These are rebuilt from `data/`.

`docs/architecture/NARRATIVE_AUTHORITY.md` states that conversational continuity "is not persisted".

## Existing snapshot format

- **Versions:** envelope `schema_version: 4`; snapshot `schema_version: 3` (`CURRENT_SNAPSHOT_VERSION`).
- **Envelope fields:** `format`, `campaign_id`, `canonical_dataset_id` (the sha256 of authored documents), `metadata { saved_at, created_at?, engine_version? }`, `snapshot`, `canon_compatibility: "strict" | "references"`, `canon_references[]`.

**`CampaignSnapshot`** (`src/campaign/types.ts`):

| Field | Content |
| --- | --- |
| identity | `schema_version`, `campaign_id`, `dataset_id`, `revision` |
| `runtime` | `scene { player_location, world_time.world_minute }`, `npc_locations[]` (LOCATED or OFF_SCENE for every canonical NPC that has a base location), `mana` |
| `characters[]` | origin (canonical or created), profile overrides (including appearance), `current` (location for created characters only, status, conditions, presentation, empty slots), `origin_snapshot` |
| `items[]` | Items |
| `households[]` | members, roles, rules |
| facts and knowledge | `facts[]`, `knowledge[]` |
| `relationships[]` | Directed relationship edges |
| agenda | `goals[]`, `scheduled_events[]` |
| economy and legal | `funds[]`, `legal_statuses[]`, `transactions[]` |
| NPC+ | `premium_characters[]` (contracts, developments, rollups, mannerisms), `premium_reflections[]` |
| optional extensions | `mannerism_learning?`, `price_indices?`, `portraits?` |

**Sizes:** a fresh opening snapshot is about 4 KB of JSON; the cap is 16 MiB.

**Strictness and versioning:** parsers reject unknown fields. The image v1 portrait fields were added as *optional fields within snapshot schema 3*, without a version bump. So a pre-v1 build reading a v1-written save fails with `invalid_save` ("unknown field"), not with `unsupported_version`.

## Campaign identity

- **Where `ui_playtest` comes from:** `createUIPlaytestSession` (`src/app/ui-playtest.ts`) calls `createOpeningCampaign(deps.world, "ui_playtest")`, moves the player to `calderan_slave_market`, advances 600 minutes, and wraps it with `GameSession.fromCampaign`. `play.ts` passes `save_dir: "saves/ui_playtest"`.
- **The ID is domain-level.** `snapshot.campaign_id` is validated as lowercase snake_case, at most 120 characters, and not a Windows device name. It is used in:
  - the save directory (`<root>/<id>/save.json`) and the envelope;
  - the portrait directory (`<portrait root>/<id>/…`);
  - the per-character portrait folder hash (`hash(campaign_id, character_id)`);
  - opaque browser tokens (`/api/portrait/asset/<hash(campaign, character, file)>`, Gallery item tokens, character `ref` = `hash(campaign_id:id)`);
  - turn IDs (`<campaign>:r<rev>:t<seq>`).
- **Can it become persistent?** Yes. It is already treated as durable identity everywhere.
- **Can it change?** Not safely after creation. Renaming would change every portrait folder hash, every opaque token and the save folder. Display names must be separate from the ID; there is no display name field yet.
- **Are multiple campaigns possible?** Structurally yes: one repository root holds many `<id>/` folders, `listSaves` enumerates them, and `GameSession` supports one session at a time. Only the UI is hardwired to one ID.
- **Root collisions:**
  - Production defaults use `save_dir: "saves"`, so saves go to `saves/<id>/` and portraits to `saves/portraits/<id>/`. A campaign with the valid ID `portraits` would collide with the portrait root.
  - `saves/` also holds about 60 dev artifacts. `listSaves` would show `ui_playtest`, `portrait_probe` and `portrait_benchmark_anime` as broken campaigns, because their names are valid IDs.
  - The Play UI's `saves/ui_playtest/` nests a second root, giving `saves/ui_playtest/ui_playtest/save.json` if it ever saved.

## Runtime state

| State | Where | Persisted? |
| --- | --- | --- |
| Player location, world minute, mana | `snapshot.runtime` | Yes |
| NPC locations (located / off-scene) | `snapshot.runtime.npc_locations` | Yes |
| Revision | `snapshot.revision` | Yes. It restores exactly (87 stays 87; the next change becomes 88) |
| Scene RAM (current location entity, ancestry, present characters) | Computed by `buildTurnContext` and Scene RAM from runtime + world | No; derived |
| Recent conversation, last input | `TurnCoordinator` WeakMaps | No |
| Temporary scene participants | `SceneParticipants` | No (scene-local by design) |
| Context compaction result | `GameSession` | No |
| Turn traces and diagnostics | `GameSession` ring | No |

## NPC and household persistence

- **NPC existence and promotion:** `characters[]` (canonical overrides or created people with `origin_snapshot`); promotion is a committed command.
- **NPC+:** `premium_characters[]` is synced with household membership in the same revision. Mannerisms, contracts, developments, rollups and reflections are all in the snapshot.
- **Appearance and NPC+ editor changes:** `characters[].profile.appearance` (a `set_profile` commit). Canonical appearance stays in `data/`; only overrides are saved.
- **Household:** `households[]` (members, roles, rules), `funds[]`, `legal_statuses[]`, `transactions[]`, `relationships[]`, `knowledge[]`.
- **Locations:** canonical NPCs live only in `runtime.npc_locations`; created characters live in `characters[].current.current_location`.

**Verdict:** everything canonical about NPCs and households is already in the snapshot and round-trips. Tests cover it: `campaign-restore`, `household-runtime`, `npc-plus-pass-1`, `narrated-promotion`, `narrator-persistence`, `final-movement-closure`, `portrait-gallery`, and others.

## Portrait/image persistence

**Metadata** (`snapshot.portraits[]`), per character:
- `avatar_version_id?`, `full_body_version_id?`, `reference?`;
- `versions[]` (64 at most), each with `asset_file` (a bare file name, never a path), `prompt_fingerprint` (an appearance fingerprint), `kind`, `pose`, `prompt`, `seed`, `provider`, `style_id`, `width`, `height`, `billable_units`, `cost_usd`;
- legacy `active_version_id` decodes as the Avatar.

**Files:** under the portrait store root (above). The save holds no absolute or relative paths, only file names. Paths are rebuilt from (root, campaign ID, character ID, file).

**Lifecycle gaps:**

| Event | What happens now | Problem |
| --- | --- | --- |
| Batch generated | Files are finalized, then the metadata is committed in memory | If the process dies before a save, the files are **orphans** |
| Image deleted | Metadata is committed, then the file is removed **immediately** | `save.json` and `save.previous.json` still reference it until the next save. A crash or a restore from previous gives **missing files** |
| Reference replaced or removed | The old file is removed immediately | Same as delete |
| Campaign deleted | No API | Folders are left behind |
| Load | Nothing checks that files exist | `readPortraitAsset` returns `undefined` → the browser gets a 404 / broken image. No crash, but no placeholder and no report |
| Play UI restart | The in-memory campaign is lost | Every file becomes an orphan |

**Current orphans:**
- `saves/ui_playtest/portraits/ui_playtest/6000dca4618a3800c02ef589/` holds 3 avatar PNGs (Mira Thorne, from the live validation run).
- Their metadata exists only in the still-running scratch validation server. Once it stops, the files are unrecoverable orphans: the folder hash is bound to `ui_playtest` plus `mira_thorne`, and no record remains.
- Nothing else is in that tree.

## Derived vs canonical state

| Component | Class | Notes |
| --- | --- | --- |
| `CampaignSnapshot` (all domains above, including `portraits`, `price_indices`, `mannerism_learning`) | **Canonical** | The single authority. Already serialized |
| Revision | **Canonical** | In the snapshot |
| Authored world (`data/`) | **External canonical** | Never copied. Referenced by dataset ID and canon references |
| Scene RAM, turn context, prompts | **Derived** | Rebuilt from snapshot + world |
| NPC+ projections, player views, editor views, staleness flags | **Derived** | Projections |
| Portrait URLs and tokens | **Derived** | Hashes of (campaign, character, file) |
| Retrieval / semantic indexes, embeddings | **Derived** | Rebuilt from `data/` |
| Canon references | **Derived at save time** | Compatibility evidence, stored in the envelope |
| Recent conversation (12 exchanges) | **Session continuity**: not authoritative, *not derivable* | Lost on reload today. See design decision D1 |
| UI transcript | **Session continuity / presentation** | Not derivable. Lost on reload |
| Scene participants (temporary people) | **Transient** | Scene-local by design. Dropping them at load equals a scene boundary |
| Turn traces, diagnostics, compaction status, narrator alternatives | **Transient** | Debug only |
| Modals, tabs, busy flags, HTTP errors, editor drafts | **Transient UI** | Never serialize |
| Image bytes | **External canonical assets** | Files, referenced by name |

## Schema/versioning

| Item | Current |
| --- | --- |
| Envelope | 4. Migrations 1→2 (compatibility policy), 2→3 (NPC+ domain), 3→4 (off-scene locations) |
| Snapshot | 3. Optional additive extensions since then: `mannerism_learning`, `price_indices`, `portraits` (including the image v1 fields) |
| Forward compatibility | A version above current fails `unsupported_version`. Unknown fields fail `invalid_save`. So new optional fields break older builds with a misleading code |
| Backward compatibility | Explicit, lossless, tested migrations. No silent defaults |
| Engine version | `metadata.engine_version` exists but is never written |
| World version | `canonical_dataset_id` (a hash of all documents) plus per-reference fingerprints |

## UI lifecycle

**Startup** (`npm run play:ui`):
- `createProductionDeps({ save_dir: "saves/ui_playtest" })` → `createUIPlaytestSession`. It always creates a new campaign; nothing is loaded.
- `server.ts` serves `/api/session`, turn, location, appearance and portrait routes. There is no create, list, load or save route.
- The Save button in `index.html` is `disabled` ("not available yet").

**Shutdown:** `session.shutdown({ discard_unsaved: true })` discards everything.

**First-turn injection:** `UI_PLAYTEST_OPENING` is injected as a one-shot assistant message on the first narrator request, and also shown as the first transcript message.

**Unsaved indicator:** `view.session.save.state` already exists; the UI doesn't show it.

`docs/UI_ENGINE_CONTRACT.md` and `docs/architecture/PERSISTENCE.md` explicitly state **"there is no autosave"**. Adding it is a deliberate policy change.

## Risks

1. **The canon compatibility policy blocks authoring.**
   - **References:** `canonReferences` includes every authored ID string in the snapshot. Because every canonical NPC with a base location is in `runtime.npc_locations`, a **fresh** save already references 35 of 48 characters and 27 of 96 locations.
   - **Fingerprints:** they cover every field except name, display name, summary, description and aliases.
   - **Effect:** editing the personality, appearance, base location or connections of almost any NPC or location makes **every** existing save fail `dataset_mismatch`.
   - **New NPCs:** adding a canonical NPC with a base location fails graph validation ("must contain each canonical NPC").
   - **Severity:** with world authoring still active, this is the most likely way persistent campaigns break.
2. **Narrator continuity loss on load.** Without recent conversation, the first turn after a load has no dialogue memory: names just spoken, promises and tone are gone. Durable facts survive; conversational texture does not.
3. **Asset/save divergence:** orphans after a crash, and missing files after a delete followed by a crash, or after recovering the previous slot.
4. **Silent previous-slot drift:** previous means "the save before the last save". With autosave it would be one autosave old, not a meaningful checkpoint.
5. **Save-root collisions:** a `portraits` campaign ID, and dev directories listed as broken campaigns.
6. **Misleading errors for future fields:** a newer save on an older build gives `invalid_save`, not `unsupported_version`.
7. **A corrupt current save blocks all saving** (by design, to preserve evidence). With autosave, this needs a clear UI state and an explicit recovery action.
8. **Windows durability:** directory fsync is skipped on Windows, and portrait writes are never fsynced (photos are re-generable, so this is acceptable).
9. **Single-process lock only:** two Play UI processes on the same campaign could interleave saves.
10. **Turn IDs repeat across sessions:** the `t<seq>` counter resets per session. This only matters for bug reports.

## Missing pieces

- A campaign lifecycle in the Play UI: create, list, load, save, switch, and a start screen or "continue".
- Display names and campaign metadata for listing (last played, revision, location, time).
- Persistence of session continuity (recent conversation and transcript), or an explicit decision not to.
- An asset lifecycle: deferred deletion, orphan detection, missing-file reporting, campaign deletion.
- A dedicated campaign root, and portraits inside the campaign folder (for export and delete).
- A compatibility tiering that tolerates authoring changes, and reconciliation for newly added NPCs.
- An explicit snapshot version bump for the image v1 fields.
- Autosave policy and scheduling. Changes to the shutdown flow (save on quit).
- A load report surfaced to the UI (migrations applied, canon drift, missing assets).
- Campaign deletion and rename (display name only).
