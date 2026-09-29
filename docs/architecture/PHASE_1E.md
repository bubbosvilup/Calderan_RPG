# Phase 1E: World Canon Foundation + Mana Runtime

Phase 1E adds compact world canon and player-only mana. No entity schema changes,
dependencies, retrieval implementation, UI, spell system, or plot were introduced.
The five existing Heartstone locations retain their identities and physical canon.

## Canon inventory

Each basename below is both a permanent entity ID and a `.yaml` file in the
specified directory. All 22 new records have explicit narrator/player visibility,
empty `known_by`, and `chunks: []`; the supplied material fits coherent compact
records without additional passages. Search context is empty rather than padded.

| Directory | Type | Basenames |
| --- | --- | --- |
| `data/world/magic/` | world_lore | `magic_overview`, `mana`, `elemental_magic`, `light_and_shadow`, `magic_subschools` |
| `data/world/races/` | world_lore | `races_overview`, `humans`, `elves`, `dwarves`, `beastfolk`, `mixed_ancestry` |
| `data/world/fundamentals/` | world_lore | `continental_structure`, `west_governance`, `west_slavery`, `main_city_structure` |
| `data/factions/` | faction | `merchants_guild`, `artisans_guild`, `learned_arts_guild`, `church`, `inquisition`, `city_guard` |
| `data/concepts/` | concept | `city_magistracy` |

Existing `related_entities` provides selective conceptual links. Inquisition uses
the existing same-type organizational parent: `parent: church`. Church is distinct
from the three national guilds; magic is within Learned Arts. Local branches remain
compact prose rather than invented independent factions. Magistracy is a concept
because civic officials need not act as one unified autonomous organization.

## Main city identity and schema boundaries

The following records the initial Phase 1E limitation. Phase 1E.1 subsequently
establishes Calderan and the geographic hierarchy; see
[Geographic authoring](../authoring/GEOGRAPHY.md). The missing-parent blocker is
resolved, while district location entities remain outside that map-authoring step.

At inspection, `data/` contained only Heartstone, LR, CY, U1, and F1. No canonical
main-city location or name was established. The project title is not a city record.
No conflicting city name was found. Under the request's explicit fallback,
`main_city_structure` records the five district themes without asserting a city ID
or creating a parent. All five district location entities are deferred until the
parent city's identity is confirmed. City Guard territory remains an empty recorded
list, not a claim it has no operating area. Heartstone's null parent and unspecified
city/district placement remain unchanged; no West Gate association was found.

Faction territory requires existing location IDs; district parents also require an
existing location. These are the only relevant schema constraints. Existing lore
and organizational links suffice; no general lore-graph extension is needed.

## Player mana authority

`RuntimeState` owns a private immutable `{ current, max }` mana value, separate from
canonical YAML, NPC state, and the minimal location/time `SceneState`. The default
is `{ current: 100, max: 100 }`, independent of whether a Nicco record exists.
The optional third constructor argument explicitly initializes a different pool;
both values must be safe integers and satisfy `0 <= current <= max`. Initialization
copies the values and starts revision at zero. Zero maximum is valid. This is an
initialization mechanism, not save/load or permission for the narrator to set max.

`getPlayerMana()` returns a frozen snapshot. There is no direct setter, NPC mana,
generic stat/resource framework, or current-mana field in authored data.

## Delta order, validation, and recovery

`SceneDelta.mana_delta` is an optional signed safe integer, defaulting to zero.
Positive values restore and negative values spend. Explicit mutation is strict:
the result must be within bounds, otherwise the entire proposal fails. No silent
clamping of explicit narrator proposals occurs.

The deterministic order of a combined commit is:

1. Validate the proposal, references, expected revision, clock arithmetic, and
   explicit mana delta against the current pool. A pending day crossing cannot
   fund an otherwise invalid expenditure or rescue an excessive restoration.
2. Compute the new minute. Crossed boundaries are
   `floor(newMinute / 1440) - floor(oldMinute / 1440)`.
3. Apply explicit mana first, then add 25 per crossed boundary up to maximum.
4. Commit locations, time, mana, and revision together after all preparation succeeds.

**Day transition recovery is deterministic engine behavior.** It is not a narrator
proposal and does not depend on sleep or rest. `advanceTime()` delegates to the same
atomic delta path. Starting at a later minute grants no retrospective recovery;
crossing zero from a negative minute counts as one boundary under the existing
signed clock convention. Calls that stay within one day or advance zero grant none.
There is no independent day marker that could drift or award a boundary twice.

Automatic recovery clamps at maximum. Addition uses only remaining capacity, keeping
safe-integer arithmetic even for unusually large explicitly initialized pools.
Other recovery methods must arise from established gameplay and explicit deltas.
The engine validates the numeric proposal, not its narrative justification; no
specific item, ritual, consumable, location, or technique is established now.

Any actual location/time/mana change increments revision exactly once. A mana-only
zero delta does not; a combined time advance still does even if expenditure and
daily recovery cancel numerically. Stale `expected_revision` rejects everything,
including no-ops. Unguarded proposals retain existing local semantics.

Standalone `validateSceneDelta` accepts current mana as its fifth argument when
validating a supplied `mana_delta`. Without that state it rejects explicit mana
validation. Runtime application always supplies actual state and revalidates;
a validated proposal is never a reusable commit token. The existing movement/time
receipt stays unchanged; mana authority is read through `getPlayerMana()`.

## Compact primary context

`NarrativeContext.scene.player_resources` contains only:

```json
{"mana":{"current":75,"max":100}}
```

The object and pool are frozen snapshots. No spell list, abilities, magic lore,
factions, or related records are pulled into primary context. World lore remains
available by exact WorldStore ID for future selective retrieval. The intended
pattern remains zero searches when primary context suffices, usually one compact
candidate search when needed, and optionally one exact follow-up fetch. No search
or automatic graph traversal was implemented.

## Deliberately undefined

Mana aptitude causes, a fixed spellbook, specific exceptional recovery mechanisms,
complete subschools and elemental matrices remain undefined. Peoples have no racial
stats, genetic rules, fixed homelands, or complete cultures. Center's government and
East's government, religion, peoples, and internal factions remain undefined.
Phase 1E.1 supplies its capital and armed-neutral posture without defining its full
military or foreign policy. Church theology, hierarchy, detailed Inquisition powers, succession,
council procedures, named rulers, criminal groups, detailed slavery law, histories,
extra continents, and district routes/establishments remain unauthored.

Light and Shadow are not morality. Beastfolk inferiority is explicitly West social
prejudice, not biological truth. No mandatory conflict, villain, hero, conspiracy,
guild rivalry, or quest was authored. No contradiction with existing canon was found.
F2 and any subsequent phase require separate authorization.
