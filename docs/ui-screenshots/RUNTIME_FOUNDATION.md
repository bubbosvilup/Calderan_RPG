# Phase 1A: World Runtime Foundation

Phase 1I adds [CampaignState](CAMPAIGN_STATE.md) as the owner of runtime plus typed
durable campaign domains. The standalone RuntimeState API and revision semantics
remain compatible. Both use `runtime-domain.ts` for pure transition preparation;
`RuntimeState.exportSnapshot()` exposes immutable direct current state. The
campaign owner has one revision and no separately mutable nested runtime owner.
The historical Phase 1A scope below predates these additional domains.

Phase 1A implements YAML loading, full-dataset validation, an immutable in-memory
world store, isolated runtime locations/time, and derived Scene RAM. It does not
implement persistence, model calls, searches, or a frontend. Phase 1C adds a separate
[primary narrative context projection](NARRATIVE_CONTEXT.md).

## Authored canon and runtime state

Authored YAML under `data/` remains the immutable gameplay baseline. Git is the
planned canon history system; this implementation does not initialize a repository.
The store clones and recursively freezes validated records, and its public types
are deeply read-only. Callers cannot mutate nested canon or change it through a
retained input object. No runtime operation writes to files or canonical entities.

Runtime state holds NPC current locations, authoritative scene state
(`player_location` and `world_time: { world_minute }`), and player-only mana added
in [Phase 1E](PHASE_1E.md). Relationships, inventories,
lifecycle transitions, generated events, and save files remain future work.

## Loader and validation lifecycle

`loadWorld(directory)` in [loader.ts](../../src/world/loader.ts):

1. Recursively discover YAML files in deterministic source-path order. Folders
   organize files; identity comes only from `entity.id`. Non-YAML files are ignored.
   Symlinks are rejected so loading never silently follows another data tree.
2. Parse the complete dataset before resolving references. Reject syntax errors,
   duplicate mapping keys, multiple YAML documents per file, aliases, anchors,
   explicit tags, and merge keys. Only lowercase `.yaml` filenames matching IDs
   are accepted; `.yml` and differently cased extensions fail filename validation.
3. Check envelope version, all required fields, subtype shapes, unknown fields,
   scalar types, naming, chunk ownership, and exactly one item placement.
4. Build the complete entity/chunk identity sets, rejecting duplicates. Resolve
   references and constrained target types across all files. Check unique reference
   lists, event anchor subsets, and NPC `known_by` references. Ambiguous aliases
   remain valid and are never arbitrarily resolved.
5. Check parent and item-container graphs for cycles, then construct the store.

The validator in [validation.ts](../../src/world/validation.ts) fails without repair
or partial publication. `WorldValidationError` exposes `source`, `entityId` when
available, `field`, and a human-readable message. Errors are deterministic for the
same dataset: parsing precedes shape validation; local shapes precede global
uniqueness, references, and graph validation. The first failure is reported.
YAML parser failures use `$` plus parser line/column information where available.

`new WorldStore(sources)` also validates programmatically supplied authoring
envelopes; it cannot bypass validation. These must be plain data objects and dense
arrays: accessors, hidden/symbol record properties, and sparse or extended arrays
are rejected. This is a data boundary, not a sandbox for executable JavaScript.
Empty datasets form an empty store, but
cannot initialize a scene without a valid location. No semantic secret evaluation
occurs: optional knowledge policies are shape/reference checked only.

## WorldStore responsibility

[world-store.ts](../../src/world/world-store.ts) owns private ID maps and offers:

| Method | Behavior |
| --- | --- |
| `getEntity(id)` | Frozen entity or undefined |
| `hasEntity(id)` | Exact identity membership |
| `getChunk(id)` | Frozen chunk or undefined |
| `getChildren(parentId)` | Entities whose explicit parent equals the ID; empty if none |
| `getAncestors(entityId)` | Immediate parent through root, excluding the entity itself |
| `getEntitiesByType(type)` | Narrowed immutable records of the requested type |

Ancestry follows `parent` links, never ID prefixes. Unknown starting IDs, broken
references, or impossible cycles raise errors defensively. Returned collections
are frozen. Collection order follows validated source order; NPC presence is sorted
by canonical ID for a stable Scene RAM projection.

## RuntimeState responsibility

[runtime-state.ts](../../src/world/runtime-state.ts) accepts a store and an explicit
initial scene. The initial player location must resolve to a location, and the
initial world minute must be a safe integer. Scene initialization copies only the
two authoritative fields and does not retain the caller's mutable objects.

NPC locations initialize from authored character `location` fields. A null authored
location remains valid incomplete canon, but runtime initialization rejects it for
an NPC instead of choosing a location. Provide starting locations before running
such a dataset. There is no override or guessed spawn system in Phase 1A.

Nicco's sole live location is `scene.player_location`. His authored character record
is optional so the existing location-only examples can run. If present, `nicco`
must be a character with role `player`; other player-role characters are rejected.
Nicco's authored starting location does not override the explicit initial scene,
and he never gets an NPC-location record.

Operations validate before mutation:

- `moveCharacter(id, locationId)` requires an existing NPC and target location.
- `movePlayer(locationId)` changes only the player's authoritative location.
- `advanceTime(minutes)` requires a nonnegative safe integer and rejects overflow.
  Zero is a valid no-op; movement time is not inferred. Phase 1E awards capped
  player mana recovery for actual 1440-minute day boundaries crossed.

`getSceneState()`, `getNpcLocations()`, and `getPlayerMana()` return frozen snapshots. Failed operations
leave state unchanged. Each runtime instance is bound to its original store.
Phase 1B routes these primitives through the shared atomic
[Scene Delta Engine](SCENE_DELTA_ENGINE.md). There is no automatic delta generation,
follower behavior, pathfinding, adjacency enforcement, or permission evaluation.

## Scene RAM derivation

[scene-ram-builder.ts](../../src/scene/scene-ram-builder.ts) implements
`buildSceneRam(world, runtime)`. It obtains the authoritative scene from runtime
instead of accepting a second, potentially inconsistent scene argument. The result
includes player location, numeric time, the current location entity, its ancestry,
and NPC IDs whose runtime locations exactly equal the player's location.

For the authored LR, ancestry is `[heartstone]`. Nearby locations,
parents, aliases, relationships, and historical participants do not imply presence.
Moving an NPC or player changes the next projection without maintaining an editable
presence list. Existing snapshots remain unchanged. Current location and ancestor
entities safely share frozen canon; none is a second authoritative state copy.

This is an internal scene snapshot, not player-facing context. Knowledge policies
are not evaluated by Scene RAM, and canonical records may be unclassified or secret.
The Phase 1C NarrativeContext layer enforces narrator visibility before projecting
selected fields. Scene RAM itself must not be sent to a player/model.

## Running and checking

Use Node.js 22 or later. From the project root:

```text
npm ci
npm test
npm run typecheck
```

`npm test` compiles source/tests to ignored `.build/` and runs Node's built-in test
runner. `npm run build` also produces importable JavaScript. `yaml` is the sole
runtime dependency; TypeScript and Node type declarations are development tools.

Example usage from a TypeScript file in the project root (after compilation, the
same relative imports resolve within `.build/`):

```ts
import { loadWorld } from "./src/world/loader.js";
import { RuntimeState } from "./src/world/runtime-state.js";
import { buildSceneRam } from "./src/scene/scene-ram-builder.js";

const world = await loadWorld("data");
const runtime = new RuntimeState(world, {
  player_location: "heartstone_lr",
  world_time: { world_minute: 0 },
});
runtime.advanceTime(5);
const scene = buildSceneRam(world, runtime);
// scene.present_characters is [] for the existing location-only canon.
```

Tests keep Brenna, Maren, Nicco, and the older synthetic kitchen/garden layout in
fixtures, separately from Phase 1D's authored LR/CY/U1. Coverage includes all seven entity types, invalid
YAML and references, graph cycles, immutable records, presence/movement, rejected
operations, snapshot isolation, and safe clock arithmetic.

## Boundaries and smallest next step

The nullable authored NPC location and optional Nicco record are resolved through
the initialization rules above. Optional knowledge remains acceptable for internal
foundation tests; its classification is required before future context delivery.
No remaining contract contradiction blocks this foundation.

Phase 1B implements the [Scene Delta Engine](SCENE_DELTA_ENGINE.md), following the
authorized scope. Persistence/save/load remains deferred. Further phases require
separate authorization.
