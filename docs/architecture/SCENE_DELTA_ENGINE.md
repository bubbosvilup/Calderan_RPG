# Phase 1B: Scene Delta Engine

Phase 1I's [CampaignState](CAMPAIGN_STATE.md) can stage an existing SceneDelta as a
`runtime_delta` command alongside typed campaign-domain commands, then commit one
campaign revision. SceneDelta itself has not been expanded. Standalone RuntimeState
still exposes the same API; both owners use shared pure runtime preparation.

A `SceneDelta` is a proposal to change player location, NPC locations, and/or world
time, plus player mana in [Phase 1E](PHASE_1E.md). It is not authoritative state and grants no direct access to runtime fields.
The runtime validates every proposal before committing any part of it.

## Contract and entry point

Types live in [scene.ts](../../src/types/scene.ts). Call
`runtime.applySceneDelta(input)` with a plain data object:

```ts
const result = runtime.applySceneDelta({
  player_location: "heartstone_cy",
  character_movements: [
    { character_id: "brenna", current_location: "heartstone_cy" },
  ],
  time_advance_minutes: 5,
});
```

CY is authored; the NPC in this example remains illustrative, not household canon.
All movement/time fields are optional. Phase 1C also supports optional
`expected_revision`, checked against `runtime.revision`. Omitted fields leave state
unchanged. Empty movement arrays and zero minutes are valid. An empty proposal,
or movements to already-current locations, succeeds without reporting movement.

The public entry point accepts `unknown` deliberately: TypeScript annotations do
not establish the validity of future external/model input. Callers can use
`satisfies SceneDelta` for authoring checks, but runtime validation always runs.
Explicit `undefined`, null field values, unknown fields, non-data properties,
non-plain records, and sparse movement arrays are rejected, not silently repaired.
The boundary processes data; it is not a sandbox for executing arbitrary JavaScript.

## Validation before commit

[scene-delta.ts](../../src/scene/scene-delta.ts) validates without modifying state:

1. Check the top-level object and its allowed fields. If supplied, check that
   `expected_revision` is a nonnegative safe integer matching the runtime revision.
2. If supplied, resolve `player_location` to an existing location by canonical ID.
3. Validate movement entries in input order. Each must contain exactly
   `character_id` and `current_location`. The character must exist, have type
   `character` and role `npc`, and must not be Nicco. The target must be a location.
4. Reject every repeated NPC ID, even identical proposals or repeated no-op moves.
   Conflicting targets are never resolved by choosing one.
5. Validate nonnegative safe-integer minutes and safe addition to the current clock.
6. Validate optional signed safe-integer `mana_delta` against the current pool,
   rejecting explicit results outside zero through maximum before daily recovery.

The validator returns a detached, frozen proposal copy, defaulting omitted movement
and time/mana fields to an empty list and zero. It does not default player location or
retain mutable input objects. A separately validated proposal is not a commit token:
`applySceneDelta` always revalidates against the current runtime clock and revision.

`SceneDeltaValidationError` extends `Error` and exposes `field`, optional `entityId`,
and a concise reason in `message`. For example:

```text
character_movements[1].current_location [missing]: target must exist and have type location
```

The first failure follows the order above, with object keys checked in sorted order.
The same input against the same world/clock/revision yields the same failure. Semantic messages
contain no implementation stack trace. No partial result is returned on rejection.

## Atomic application and authority

[RuntimeState](../../src/world/runtime-state.ts) first validates the whole proposal,
then prepares the next scene, NPC locations, and immutable result locally. Only
after those steps succeed does it replace its private scene and NPC map. The commit
is synchronous, with no callbacks or asynchronous work between assignments.

The temporary map is a preparation copy, not another persistent authority. Applying
a delta changes only:

- `SceneState.player_location`;
- existing authoritative NPC current locations;
- `SceneState.world_time.world_minute`;
- player mana, after strict explicit mutation and capped automatic daily recovery.

Phase 1C adds runtime revision metadata: any actual state change increments it once
in the same commit; a no-op does not. Overflow rejects the entire commit.

A valid player move followed by an invalid NPC move or overflowing time therefore
changes nothing: player location, every NPC location, and time all remain intact.
Canon is never modified, and no YAML is rewritten. There is no writable presence
list, duplicate player record, or second authoritative clock.

The Phase 1A methods `movePlayer`, `moveCharacter`, and `advanceTime` remain available
and return `void` as before. Each delegates to this same delta path, including the
dedicated error type. Initialization retains its separate starting-state checks.

## Result semantics

Successful application returns a frozen `SceneDeltaResult`:

```json
{
  "applied": true,
  "player_moved": true,
  "moved_characters": ["brenna"],
  "time_advanced_minutes": 5
}
```

`player_moved` compares the committed location to the preceding location.
`moved_characters` contains only NPCs whose locations actually changed, sorted by
canonical ID independently of proposal order. Its array is frozen too.
`time_advanced_minutes` is the accepted increment, zero when absent or zero.

For a no-op, the result is `applied: true`, `player_moved: false`,
`moved_characters: []`, and `time_advanced_minutes: 0`. Since Phase 1E, a mana-only
change has those same receipt fields: this receipt alone cannot determine whether
the transaction changed state. Read revision and `getPlayerMana()` for that purpose.
The result is a movement/time receipt,
not authoritative state, an event, prose, or an instruction to update presence.

## Scene RAM and snapshot isolation

After acceptance, `buildSceneRam(world, runtime)` uses the new authoritative
locations and time. Exact location equality recomputes presence naturally. No
delta code updates or stores `present_characters`; the Phase 1A builder is unchanged.
Characters in parent/adjacent locations remain absent.

Earlier scene snapshots, NPC-location snapshots, Scene RAM snapshots, and results
remain frozen and unchanged after later commits. Input proposals are not retained.
Test coverage includes combined commits, entry/exit/player movements, rejected
combinations, duplicate NPCs, wrong types, invalid/overflowing time, no-ops,
actual-change receipts, snapshot isolation, and canonical object/YAML isolation.

## Scope and next step

This boundary can later accept model-proposed data after integration is explicitly
authorized. Phase 1B implements no LLM calls, prose-to-delta generation, tool calling,
retrieval, persistence, events, memories, relationships, inventory/lifecycle mutation,
frontend, calendars, pathfinding, adjacency, or movement permissions.

Phase 1C rejects stale proposals when `expected_revision` is supplied. Unguarded
proposals retain local behavior: five minutes advances another five minutes even if
movements are already satisfied. There is no duplicate-request ledger. Atomicity
means synchronous in-memory validation and commit, not durable transactions or
cross-process locking. See [Narrative Context](NARRATIVE_CONTEXT.md) for revision
semantics and the future narrator boundary.
