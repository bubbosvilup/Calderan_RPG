# Scene RAM

The [accepted decisions](PHASE_1_DECISIONS.md) distinguish authoritative scene
state from computed context. Contracts: [scene.ts](../../src/types/scene.ts).
The Phase 1A [runtime foundation](RUNTIME_FOUNDATION.md) implements derivation and
safe movement/time primitives. Phase 1B implements the validated, atomic
[Scene Delta Engine](SCENE_DELTA_ENGINE.md) described below.

The minimal authoritative `SceneState` is:

```json
{
  "player_location": "heartstone_lr",
  "world_time": { "world_minute": 600 }
}
```

`world_minute` is a monotonic safe integer advanced by nonnegative integer deltas.
Calendar and human-readable labels are display concerns. Unknown historical event
time may be null; the running scene must have a valid clock.

## Derived presence and location context

Each NPC has one runtime `current_location`. The player's sole location is
`SceneState.player_location`; do not duplicate it in an NPC location record.
`SceneRam` extends scene state with computed/cached `present_characters`: NPC IDs
whose locations equal the player's. Exclude Nicco. Recompute/invalidate after
accepted movement; never edit this list independently. Mentions, alliances, and
historical participation do not establish presence.
The derived snapshot also exposes `current_location` and `location_ancestry`
(immediate parent first), sharing immutable canonical records.
This internal projection is not sent directly to a narrator. Phase 1C derives
[NarrativeContext](NARRATIVE_CONTEXT.md) with compact, visibility-checked records.
Phase 1E stores player mana separately in RuntimeState; NarrativeContext projects
that frozen resource snapshot directly. Scene RAM has no duplicate mana authority.

Follow `parent` links for ancestry:
`heartstone_lr` -> `heartstone` -> null.
Reject missing references and cycles; never parse IDs for ancestry. Resolve current
location data from world entities, without duplicating it in authoritative scene
state or expanding all sibling/descendant content into model context.

## Delta updates

```json
{
  "player_location": "heartstone_cy",
  "character_movements": [
    { "character_id": "brenna", "current_location": "heartstone_cy" }
  ],
  "time_advance_minutes": 2
}
```

This illustrates Nicco and Brenna moving together into CY; NPC records remain
test-only fixtures, not authored household membership. Omitted values stay unchanged; an empty movement array does
nothing. Each movement sets the NPC's authoritative location. Maren's location
stays unchanged, so she is absent from the new scene unless already in CY.
`entered`/`left` may describe a derived difference, but are no longer writable
presence fields in the delta contract.

Validate the proposal before an atomic runtime commit: valid entity IDs and location
types, no player in NPC movements, no duplicate/conflicting movement records,
nonnegative integer time advances, and safe clock arithmetic. Recompute presence
after acceptance. Movement never silently transports other characters.

The LLM proposes; the runtime validates and commits separately from immutable
authored canon. Future save/recovery and stale/replayed delta handling must preserve
one authoritative scene and clock. Restore accepted state on restart, not a new
scene inferred from prose. The delta engine now supports optional `expected_revision`
checks against the runtime's monotonic revision. Persistence and request-level
replay protection remain future work.
