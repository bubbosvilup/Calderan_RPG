# Accepted Phase 1 decisions

Status: accepted architectural decisions. **Phase 1A: World Runtime Foundation**
and **Phase 1B: Scene Delta Engine**, plus **Phase 1C: Narrative Context Foundation**,
have been explicitly authorized and implemented
within these boundaries. See [runtime foundation](RUNTIME_FOUNDATION.md) and
[scene deltas](SCENE_DELTA_ENGINE.md) and [narrative context](NARRATIVE_CONTEXT.md).
Phase 1D now adds the [canon authoring foundation](../authoring/AUTHORING_GUIDE.md)
and the supplied Heartstone root/LR/CY/U1 records, followed by the authorized LR
layout refinement and F1 observation floor. Phase 1E added lore and mana; Phase
1E.1 added continental geography. The [Phase 1E.2 audit](PHASE_1E_2_AUDIT.md) records
the current checkpoint. F2 and the turn coordinator remain unimplemented.

## 1. Authored canon versus runtime state

Files under `data/` are immutable baseline canon during gameplay. The LLM and
runtime must never directly rewrite authored locations, characters, factions,
items, concepts, lore, or historical events.

Runtime consequences are stored separately: current entity locations, scene state,
mutable entity state, relationships, inventories, and generated historical events.
Authored mutable fields provide initial values, not independent gameplay authorities.

> Canon defines what exists. Runtime state defines what has happened to it.

Git will serve as the initial canon revision/history system. Do not create a custom
canon revision database. This decision does not initialize a Git repository.
Runtime save storage remains an implementation choice, separate from `data/`.

## 2. Location and NPC presence authority

Each character has one authoritative current location in runtime state. Example:

```text
brenna -> heartstone_lr
maren -> heartstone_cy
```

Normally derive `present_characters` from
`character.current_location == player.current_location`. Scene RAM may compute
or cache presence, but must not maintain a second authoritative copy. Nicco is
the player and is excluded.

In the minimal contracts, `SceneState.player_location` is the player's sole
location; `player.current_location` conceptually refers to that same value.
NPC location records exclude the player to avoid duplicating that authority.

## 3. Minimal Scene RAM

The authoritative minimal scene state has only `player_location` and `world_time`.
Present characters derive from runtime character locations, ancestry from entity
parents, and current location data from world entities. `SceneRam` is the computed
context projection of `SceneState`, with derived `present_characters`.

## 4. World time

Use a monotonic numeric internal clock, initially an integer `world_minute`.
The contracts represent `world_time` as `{ world_minute: number }`; validation
enforces safe integers. Advance by nonnegative integer minute deltas:
`world_minute += 5`.

Day/hour/minute and future fantasy calendar labels are derived display values.
Human strings such as "Tuesday evening" are never authoritative time.
The initial world calendar can remain undefined. Event times use the same internal
timeline, with null for unknown historical time. Choosing a campaign origin does
not require designing a fantasy calendar.

## 5. Knowledge visibility

Distinguish narrator, player, and individual NPC knowledge. The minimal reusable
policy is nested under `knowledge` on entities or chunks:

```yaml
knowledge:
  visibility:
    narrator: true
    player: false
  known_by:
    - brenna
```

The narrator may receive hidden information required to portray characters and
world behavior. Explicitly mark such context as secret/non-player knowledge; do not
directly reveal it without narrative justification. Player and NPC knowledge remain
separate. `known_by` holds NPC IDs; Nicco's knowledge uses `visibility.player`.
Narrator access does not imply either player or NPC access.

A chunk's explicit policy overrides the entity policy for that passage. Keep shared
entity metadata and summaries free of secrets restricted to a chunk. An omitted
chunk policy inherits its entity policy. If neither supplies a policy, knowledge
is unclassified, not implicitly public: classify it before runtime use. Optional
fields allow incomplete authoring and structural fixtures. Production canon is
explicitly classified. Knowledge changes during gameplay
belong to runtime state. Do not implement complex epistemic inference.

## 6. Entity lifecycle

Canonical IDs are permanent. Do not delete entities merely because they are dead,
destroyed, abandoned, or no longer active. Use lifecycle states such as `active`,
`inactive`, `destroyed`, `dead`, and `retired`. Baseline lifecycle may be authored;
gameplay transitions belong to runtime state. Historical events must continue to
resolve old IDs. The future validator rejects invalid transitions.

## 7. Aliases

Exact canonical IDs resolve uniquely. Prefer unique canonical names within their
practical namespace. Aliases may be ambiguous: return multiple candidates for
retrieval/disambiguation, never silently choose an arbitrary entity.

## 8. Inventory semantics

An item initially has exactly one primary placement: `owner`, `location`, or
`container`. These are mutually exclusive authoritative placements. Owners are
characters or factions, locations are location entities, and containers are items.

Containers use the same model, allowing later nesting. Resolve physical location
through ownership/container chains rather than storing a second placement. Reject
self-containment and container cycles. Resolve an unknown placement before accepting
an item into the initial world; do not encode it with multiple null placement
fields. Do not implement advanced equipment slots or encumbrance.

## 9. Events

Events have one primary `location` (null when unknown), optionally supplemented by
`related_locations: []`. Do not make `location` an array. Nicco may appear under
`participants`, but generally not as a primary `characters` retrieval anchor.
Generated historical events are runtime records, separate from authored events.

## 10. Future world_search limits

Initial defaults, later configurable:

- Maximum 2 `world_search` calls per user turn.
- Maximum 5 results per search.
- Bounded retrieved text budget, initially around 3000 tokens total per user turn
  across both calls.
- Searches may return zero results.
- Zero results are not evidence that a fact does not exist.
- The model must not invent established canon because retrieval returned no match.

These limits document intended behavior; no retrieval implementation begins here.

## 11. Mutation authority

Model-generated state changes are proposals/deltas, never arbitrary direct writes.
The runtime validates before committing: movement references valid locations,
entity IDs exist, an NPC has only one authoritative location, and time/mana arithmetic
is valid. Lifecycle transitions remain future work and require their own validation.
Recompute derived presence after accepted movements.

## Remaining implementation choices

Phase 1E is now implemented as documented in [World Canon and Mana](PHASE_1E.md).
It adds player-only current/max mana outside the minimal location/time SceneState,
strict atomic `mana_delta` validation, capped +25 recovery per crossed 1440-minute
day, and compact mana projection. The canon gains 22 lore/institution records.
Phase 1E initially had no canonical main-city entity. Phase 1E.1 now establishes
Calderan and the continent/nation/city hierarchy, retaining the district model as
lore in that step; see [Geographic authoring](../authoring/GEOGRAPHY.md).
No retrieval implementation,
plot, general stats framework, or subsequent phase is authorized by this change.

No unresolved architectural ambiguity blocks beginning Phase 1 when explicitly
authorized. Storage format, campaign time origin, concrete lifecycle transitions,
save/recovery mechanics, and validation errors can be selected during implementation.
Initial placements and knowledge classifications must be supplied before those
records are used in a running game. A fantasy calendar, complex epistemic inference,
database, embeddings, and frontend are not prerequisites.
