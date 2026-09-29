# Phase 1I: Campaign State Model

Phase 1J now adds [manual save/load persistence](PERSISTENCE.md) and validated
`CampaignState.restore(world, snapshot)` without replay. Session dirty tracking
stays outside campaign truth. The historical Phase 1I scope below predates that
implementation; persistence remains manual and is never part of command commits.

Status: **READY FOR PERSISTENCE FOUNDATION**. This phase implements deterministic
in-memory domains and atomic preparation/commit. It does not implement save/load,
a filesystem repository, database, narrator integration, or campaign retrieval.

## A. Truth and ownership

| Layer | Authority | Contains |
| --- | --- | --- |
| Canonical YAML / WorldStore | Authored immutable baseline | Lore, authored entities, initial facts and locations |
| CampaignState | Durable campaign-specific current truth | Runtime time/locations/mana and typed character, item, household, fact/knowledge, relationship, goal and schedule domains |
| Derived context | Rebuilt, never independently authoritative | Effective profiles, possessions, equipment slots, countdowns and eventually scene/retrieval projections |

`CampaignState` owns one deeply immutable `CampaignSnapshot`. Domain modules only
prepare changes on a detached draft; they are not independently mutable stores.
There are no domain revision counters. One accepted batch that changes final
state increments `revision` once. A no-op preserves both revision and snapshot
identity. Canonical lore is referenced, not copied into campaign profiles/items.

```text
manual command / future model proposal
  -> parse bounded typed commands + expected_revision
  -> prepare on detached campaign snapshot
  -> validate references and domain invariants in command order
  -> owner-issued immutable preparation receipt
  -> synchronous commit of one snapshot pointer
```

Implementation boundaries:

- `src/campaign/types.ts`: typed domains, snapshots and command union.
- `validation.ts`: strict unknown-input parsing; no arbitrary-property patch.
- `identity.ts`: centralized canonical/campaign reference resolution.
- `characters.ts`, `items.ts`, `social.ts`, `agenda.ts`: domain preparation.
- `campaign-state.ts`: pure batch preparation and the only live campaign owner.
- `projections.ts`: immutable effective-state views and derived countdowns.
- `src/world/runtime-domain.ts`: pure legacy-compatible runtime preparation.

No simulator, stat block, inventory grid, AI behavior or random values are added.

## B. Character identity and canonical resolution

Campaign characters use a discriminated origin:

```ts
{ id: "brenna", origin: { kind: "canonical", canonical_entity_id: "brenna" },
  profile: {}, current: {} }

{ id: "campaign_character_ada", origin: { kind: "created" },
  profile: { name: "Ada" }, current: {} }
```

These are synthetic examples, not additions to production canon. A canonical
registration must retain the exact canonical ID and refer to the correct entity
type. It stores only explicit profile overrides/current campaign facts. An empty
override does not copy the character's authored name, description or lore.

Created IDs use `campaign_<domain>_<local_key>` with bounded lowercase snake_case.
`campaignId("character", "ada")` is a deterministic helper, not a name-based ID
generator. The caller chooses an enduring local key independently of the display
name. Rename does not change identity. Domains are character, item, household,
fact, goal and event. No UUIDs, random generation or sequence counters are needed.
Reuse/collision fails, including a collision with an authored entity whose ID
happens to have a campaign prefix. No automatic suffixing or silent shadowing.

The resolver accepts canonical characters without eagerly registering them in
every domain. A campaign-created character must already be registered. Commands
that change a canonical profile/current condition/equipment-slot knowledge may
lazily create its empty overlay. An explicit second registration fails.

Effective character resolution uses the validated origin, never ambiguous name
precedence: authored name/aliases plus explicit campaign profile overrides, or
the created character's profile. Omitted canonical overrides fall back to canon;
an explicitly empty alias list overrides it. No prose is parsed to invent
appearance, personality, species or demographics.

## C. Physical continuity and current state

`CharacterProfile` supports optional name, aliases, exact age in years or an
approximate age description, established sex, gender, species and voice.
Structured appearance supports height in cm, weight in kg, build, hair color/
texture/description, eyes, skin, located scars, distinguishing marks, persistent
traits and descriptive detail. Measurements must be finite and positive; exact
age is a nonnegative safe integer. Unknown fields remain absent, not fabricated.
Age is an established profile fact, not an automatically incrementing second clock.

`current` separately holds active/inactive/dead status when established,
conditions, temporary presentation and explicit empty equipment slots. Current
injury, wetness or mud does not alter stable hair, height or old scars. These
current facts remain until an explicit command changes them; no automatic healing
or expiry simulation is implied. Status does not automatically move characters,
transfer possessions, or prevent all manual corrections.

Created characters may have an unknown location until explicitly placed.
Canonical player/NPC locations have exactly one authority: the runtime domain.
Canonical overlays cannot contain `current_location`; `move_character` routes
their moves through the existing runtime rules. Created character locations live
in their own current state and must reference an existing canonical location.
Dynamic campaign locations are deferred.

`set_profile` explicitly replaces the campaign profile/override, not a generic
patch. Even a created character's name may be unknown; the stable ID identifies
them without inserting a placeholder name. Removing an optional field
makes it unestablished (or falls back to canon for authored fields). `set_condition`
replaces conditions/presentation; omitted presentation clears it, while omitted
status preserves established status. Stable profile data survives these changes.

## D. Items and equipment

Meaningful items get stable IDs and a canonical or created origin. Created items
require a name; description is optional when not established. Canonical name and
description are resolved at read time unless explicitly overridden. Canonical
authored ownership may initialize campaign ownership; it never implies carrying
or wearing. Initial physical placement must be supplied explicitly. Existing
canonical container placement is not silently interpreted as character equipment.

There is one `owner_id` (absent = unknown, null = explicitly unowned), independent
of exactly one tagged position:

| Position | Meaning |
| --- | --- |
| unknown | Physical placement has not been established |
| carried + character_id | In that character's possessions, not equipped |
| equipped + character_id + slot + worn/held | Explicitly worn or held in a named slot |
| stored + location_id | Placed/stored at a canonical location |

A borrower can carry another character's property. This is valid, not two owners.
Contradictory simultaneous positions and two items in one character's slot fail.
Slot keys such as `feet`, `outerwear` or `left_hand` are extensible snake_case;
no fixed anatomy, compatibility table, weight capacity or inventory grid exists.

Equipment truth lives on item position. Character records only track explicitly
empty slots. An unoccupied, unclassified slot is unknown. Equipping clears an
empty marker; removing an item marks its former slot empty. An occupied slot
cannot simultaneously be marked empty/unknown. Views derive equipment and
possession lists; no second authoritative inventory list can drift.

`place_item` changes placement without changing ownership. `transfer_item`
atomically specifies the new owner and placement, with optional acquisition
provenance: absolute acquired_at, gift/purchase/loot/found/created, source character
and source event. Omitted transfer provenance clears the previous acquisition;
older acquisition history belongs in the future history domain. Provenance dates
cannot be in the future relative to the staged campaign clock.

Nested containers, stack splitting, economics and automatic object extraction
from narration are deferred. Not every mentioned object becomes a record.

## E. Household

A household has an ID, optional name and sparse memberships keyed by character.
Membership status is guest, member or former_member, with optional role and
absolute joined_at. `set_membership` is a deterministic upsert; repeating identical
data is a no-op. Joining defaults joined_at to the current staged world minute.
Leaving retains the existing join time; rejoining starts a new interval unless
an explicit valid past time is supplied. Prior intervals belong in future history.
Leaving an unknown membership is rejected. Unknown characters are rejected.

Households can overlap; this foundation does not impose a universal one-household
rule. Membership does not infer affection, ownership, obedience or knowledge.
Membership survives detached snapshot cloning/export.

## F. Facts and character knowledge

A `CampaignFact` is an identified proposition with either campaign-specific
statement and explicit true/false/unknown truth, or a canonical entity/chunk
reference. A chunk must belong to the referenced entity. Canonical content is
not copied. A reference is a scoped knowledge target, not permission to infer
knowledge of all related records.

`CharacterKnowledge` is separately keyed by character and fact, with status
knows, believes, suspects or heard_rumor. Optional provenance records learned_at,
source character, source canonical/scheduled event, and witnessed/told/inferred/
rumor acquisition. Updating one character never teaches anyone else. Repeating
the same update is a no-op; a later explicit update replaces that edge, including
its optional provenance. No automatic promotion from rumor to knowledge.

Absence means no knowledge attribution is recorded, not proof that the character
could never know. Knowledge status does not modify proposition truth; this is a
storage foundation, not an epistemic consistency/reasoning engine. False beliefs
can be recorded. Canon visibility and authored `known_by` remain separate systems:
neither canon presence nor narration automatically populates campaign knowledge.

These are internal state views, not audience-safe external projections. Future
scene/retrieval integration must explicitly filter truth and character knowledge;
the full snapshot must not be sent wholesale to a player or narrator provider.

## G. Relationship foundation

Relationships are sparse directed A -> B edges. Trust is an integer in [-100,100].
A -> B and B -> A are independent; no self-edge is allowed. Missing edge differs
from explicit trust=0. `seed_relationship` creates one edge from validated explicit
initial trust with optional seed_context; duplicate seeding fails. `set_trust`
requires an existing edge and replaces only trust.

Trust is **not affection, obedience, attraction, consent or loyalty**. None of
those axes is inferred or implemented. Initial contexts/templates have a place
in seed_context, but there is no seed table, random initial value, progression
balance, trust-event table or automatic reaction. Future templates should produce
defined deterministic seeds before entering this same validation path.

## H. Personal goals

Goals have stable ID, character, description, absolute created_at (assigned from
the staged world clock), status, and optional typed target: canonical entity,
character, registered campaign item, or canonical/scheduled event. References
must exist. Creation starts active; explicit transitions allow completed,
abandoned or failed. Terminal goals cannot reopen; repeating the same status is
a no-op. No numeric progress or AI execution is added. A passing thought remains
narration until an explicit goal command is accepted.

## I. Scheduled events and authoritative time

Events have stable ID, title, optional description/participants, an absolute
`scheduled_world_minute`, and scheduled/triggered/completed/cancelled status.
Participants must resolve as characters. There is no second clock or stored
days_remaining. `remainingEventMinutes(snapshot, id)` subtracts the runtime
world_minute and checks safe-integer arithmetic. Negative means overdue.

Past schedules are allowed for deliberate late entry/correction. Time advance
does not automatically trigger anything. Scheduled -> triggered/cancelled and
triggered -> completed/cancelled are allowed; terminal states cannot reopen.
Triggering is an explicit engine command, including an early trigger if intended.
Only a scheduled event can be rescheduled. Execution policy and effects are deferred.

All absolute timestamps use the existing signed safe-integer world-minute
timeline. Eight days is `8 * WORLD_DAY_MINUTES`; advancing three days changes the
derived remaining duration from eight to five days without changing the target.
Existing daily mana recovery remains in the shared runtime preparation function.

## J. Revision, atomicity and future persistence

The legacy `RuntimeState` remains a standalone compatibility owner. Its revision,
SceneDelta contract, movement, clock and mana semantics are unchanged. Its new
`exportSnapshot()` provides direct immutable current state. Pure runtime transition
logic was extracted, not duplicated.

A new `CampaignState` initializes a runtime domain from the same startup rules,
then owns that domain directly. It does not expose a mutable RuntimeState instance.
There is one campaign revision and no nested runtime revision. Current consumers
of standalone RuntimeState remain unchanged; do not run a legacy owner and a
campaign owner as two live authorities for the same campaign. Future narrator/
coordinator integration should consume campaign runtime views and submit campaign
commands. Live adoption/migration from an existing runtime is not a restore API
in this phase; Phase 1J must preserve imported revision and state explicitly.

The public command envelope requires expected_revision. Commands execute against
the staged state in listed order; earlier creations can be referenced by later
commands. A later unresolved reference fails the entire batch. Manual commands
and future model proposals share this path. Schema/reference validity does not
establish narrative authorization; a future coordinator remains responsible for
deciding which valid proposals are allowed.

`prepare` does not publish changes. It returns a frozen receipt and candidate
snapshot; `commit` accepts only that owner's live receipt against the unchanged
base snapshot. Forged, foreign, consumed or stale receipts fail. The pure exported
preparation function is for trusted engine snapshots, not untrusted save loading,
and its return value alone cannot be committed. All exposed state is deeply
immutable; input records are copied and strict schemas reject unknown fields,
accessors, unsupported prototypes, sparse arrays, malformed IDs and unsafe numbers.
Commands are bounded to 128 per batch; collections within a command to 256 entries;
text fields to 8000 characters and IDs to 120 characters.

A future versioned save must contain these direct current-state domains:

```text
schema_version, campaign_id, canonical dataset_id, authoritative revision
runtime:
  scene.player_location
  scene.world_time.world_minute
  npc_locations
  mana.current / mana.max
characters: origin + profile overrides/created profile + current state
items: origin + overrides/created identity + ownership + position + provenance
households: memberships
facts: campaign propositions or canonical references
knowledge: per-character edges + provenance
relationships: directed trust + optional seed context
goals: owner, target, creation time, current lifecycle
scheduled_events: absolute targets, participants, current lifecycle
```

`exportSnapshot()` is a direct in-memory snapshot; `structuredClone` can make an
independent data copy. There is no file writing, serializer/repository, restore
entry point, atomic rename, backup slot or database. Future restore must validate
all domains and references, enforce dataset/schema compatibility and assign direct
state. It must not replay movements, re-award mana recovery, reset revision or
depend on history. Phase 1J must coordinate durable write failure with publication;
the present commit is deliberately in-memory only.

## Future overlays, history and projections

Persistent changes to canon-owned places/features need a future typed overlay
domain keyed by canonical_entity_id, with discriminated operations for actual
supported changes. Stable feature identities must be established before durable
feature references; feature display names/array positions are not durable IDs.
No arbitrary property paths, record copies, generic JSON patch, room modifications
or inferred object state are introduced now.

Campaign events, character memories and relationship history can become separate
typed explanatory records. Their future IDs can extend the central resolver.
Current provenance can reference canonical/scheduled events; unknown historical
IDs are rejected rather than accepted as dangling references. Current state must
remain reconstructible without replaying those future records.

Future retrieval should use an additional campaign source/projection with stable
origin-aware IDs; WorldStore stays immutable. Future scene projection should use
canonical profile plus campaign profile/current state, with explicit knowledge/
audience filtering and output bounds. This phase does not index new records,
expand NarrativeContext, call any provider or alter narrator behavior.

| Narrative occurrence | State treatment |
| --- | --- |
| Scratches nose | Ephemeral narration |
| Sits on sofa | Usually scene continuity, not a campaign profile fact |
| Receives boots | Explicit durable item/ownership change |
| Equips/removes boots | Explicit mutable item placement |
| Learns a secret | Explicit per-character knowledge edge |
| Raid scheduled | Absolute scheduled event |
| Joins household | Explicit durable membership |

Do not persist every sentence. Store established continuity through commands.

## K-L. Verification and completion

`npm test`: **318 passing tests**, including 35 new campaign tests. The prior 283
tests remain passing. `npm run typecheck`: **passes**.
Synthetic tests cover created/canonical identity, profile continuity, ownership
versus equipment, gifts and borrowers, empty/unknown slots, household transitions,
knowledge isolation/provenance, directed trust, goals, event timelines, pure
preparation, late-failure rollback, receipt integrity, immutable snapshots,
reference validation and hostile input shapes. Existing runtime tests preserve
legacy revision behavior; a production-world regression verifies canon and
current NarrativeContext remain unchanged.

No production lore, dependency, filesystem persistence, database, retrieval work,
narrator integration, giant SceneDelta expansion or Phase 1J implementation.

**READY FOR PERSISTENCE FOUNDATION**
