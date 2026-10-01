# Entity schema, version 1

The matching contracts are in [entities.ts](../../src/types/entities.ts) and
[knowledge.ts](../../src/types/knowledge.ts). `WorldEntity` is a discriminated union
on `type`. These are compile-time contracts; Phase 1A adds their runtime validator
in [validation.ts](../../src/world/validation.ts).
Human authoring discipline, prose roles, and templates are defined in the
[authoring guide](../authoring/AUTHORING_GUIDE.md).

## Authoring envelope

Each recursively discovered UTF-8 `.yaml`/`.yml` file contains exactly one envelope. Basenames are editorial; identity comes only from `entity.id`:

```yaml
schema_version: 1
entity: # one entity record, including its subtype fields
  # ...
chunks: [] # zero or more independently retrievable passages
```

Use YAML for readable prose blocks and comments. Use plain mappings, sequences,
strings, numbers, booleans, and explicit nulls. Avoid YAML custom tags, anchors,
merge keys, and duplicate keys. Quote ambiguous scalar strings; world minutes are integers.
The loader rejects duplicate keys and unsupported schema versions.
The envelope keeps authoring convenient without merging entity and chunk models.

## Common fields

All fields below are required. Empty arrays mean no entries are recorded; they do
not prove none exist in the fictional world. Nonempty text is expected except
`search_context`, which may be empty when no extra retrieval cues are needed.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | EntityId (string) | Permanent globally unique ID; see NAMING.md |
| `type` | EntityType | location, character, event, faction, item, concept, world_lore |
| `name` | string | Canonical human name |
| `display_name` | string | UI label, allowed to equal name |
| `parent` | EntityId or null | Structural parent; never a substitute for location or owner |
| `aliases` | string[] | Alternate lookup names; ambiguity is allowed |
| `summary` | string | Short factual description for candidate selection |
| `tags` | string[] | Semantic themes, e.g. grief or politics |
| `search_context` | string | Concise disambiguation cues; no new unsupported facts |
| `content` | string | Brief entity introduction, Markdown text allowed |

For locations, `parent` means physical containment in another location. For other
types it optionally expresses a same-type organizational or conceptual hierarchy.
Use null when no parent is recorded. A null location parent is the end of the
currently recorded hierarchy, not a claim that no larger world exists.

`content` is not a second full copy of chunk bodies. Index a short entity candidate
from metadata and its introduction; retrieve longer passages from chunks. Any
overview chunk should add useful detail instead of duplicating the introduction.

## Subtype fields

Fields shown here are required unless marked optional. Null means unknown or not
assigned, unless a narrower rule is given. References always resolve to IDs.

| Type | Fields and reference targets |
| --- | --- |
| location | `features: {name, description}[]`; `connections: {target, description, minutes, kind?}[]` where target is a location and minutes is a positive safe integer; optional `entrance` location ID for explicit container arrival |
| character | `role: player \| npc`; complete `base_location` contract below (or legacy `location: EntityId \| null`); `traits: string[]`; `relationships: {target, kind, description}[]` (character targets) |
| event | `location: EntityId \| null` (one primary location); optional `related_locations: EntityId[]` (locations); `characters: EntityId[]` (characters); `participants: EntityId[]` (characters or factions); `time: WorldTime \| null`; `importance: minor \| significant \| major` |
| faction | `members: EntityId[]` (characters); `territory: EntityId[]` (locations); `relations: {target, kind, description}[]` (factions) |
| item | Exactly one of `owner: EntityId` (character or faction), `location: EntityId` (location), `container: EntityId` (item); `state: Record<string, string \| number \| boolean \| null>` |
| concept | `related_entities: EntityId[]` (any type) |
| world_lore | `category: fundamentals \| history \| cultures \| races \| magic \| religion`; `related_entities: EntityId[]` (any type) |

Object fields `name`, `description`, and `kind` in the table are strings.
Relationships and connections are directed; reciprocal edges must be explicit.
Containment does not automatically create a traversable connection. Item placement
uses the exclusive `ItemPlacement` union: omit the other two keys, rather than
setting them to null. Containers use the same model; reject self-containment and
cycles. An owned/contained item's physical location is derived through its placement
chain, not independently stored. Unknown placement must be resolved before runtime
acceptance. State keys use snake_case; reserved fields must not be hidden inside
`state`. Equipment slots and encumbrance are deferred.

`WorldTime` is `{ world_minute: number }`. Validation enforces safe integers
on a shared internal timeline; the live clock advances monotonically via
nonnegative integer minute deltas. Unknown event time is null. Display labels and
fantasy calendars are derived and need not be defined for numeric comparisons.
Event importance is editorial: minor for local detail, significant for consequential
changes, major for defining history. It is a ranking hint, not a truth score.

## Event anchors versus participants

An event involving Nicco, Brenna, and Maren can record:

```yaml
characters: [brenna, maren]
participants: [nicco, brenna, maren]
```

`characters` is a selective retrieval anchor list, normally excluding the player
Nicco because he occurs in too many events. `participants` retains all known
historical participants. Every anchor must also occur in participants. Explicit
player anchors should require an editorial reason; this is not a ban on recording
the player in history. These illustrative IDs need actual character records before
such an event becomes a loadable world file.

## Filtering and validation boundaries

Location, characters, participants, time, parent, owner, and type are structured
metadata. Tags such as `medicine` and `ritual` supplement those fields; they cannot
replace them. Future chunk searches join the owning entity's metadata for filters.

The Phase 1A loader validates required fields, literal types, ID syntax, unique
entity/chunk IDs, valid envelopes and stable explicit IDs, valid reference targets,
acyclic parents, no duplicate IDs within reference lists, and event anchor subsets.
Type aliases are strings for simple authoring and cannot enforce these rules.
Validate the full dataset before publishing a revision, not one file in isolation.

## Baseline canon, lifecycle, and knowledge

The YAML files are immutable baseline canon during gameplay, initially versioned
with Git. Authored character locations, relationships, item placements/state, and
lifecycle describe starting values. Runtime locations, relationships, inventories,
state changes, scene state, and generated events are stored separately. The LLM
only proposes deltas; the runtime validates supported operations before committing them.

Every entity optionally supports `lifecycle: LifecycleState`, one of `active`,
`inactive`, `destroyed`, `dead`, or `retired`. Omission leaves baseline status
unspecified. Gameplay transitions never delete canonical IDs; historical references
must still resolve. Transition validation is future runtime work.

Every entity optionally supports `knowledge: KnowledgeAccess`, containing required
`visibility: { narrator: boolean; player: boolean }` and `known_by: EntityId[]`
(NPCs). Player knowledge uses the player flag, not Nicco in `known_by`. Narrator
knowledge does not imply player/NPC knowledge. Unclassified records require a policy
before runtime use; omission never means public. A chunk can override the policy
for its own passage. Shared entity metadata must not leak secrets held only in a
restricted chunk. Hidden narrator context must be explicitly marked secret/non-player
and cannot be directly revealed without narrative justification.

Derived indexes remain rebuildable from accepted canon and separate runtime state.
Shape, reference, and graph validation is implemented. Persistence, lifecycle
transitions, and knowledge inference remain unimplemented. Optional policy is not
evaluated by the internal scene projection; see the runtime foundation's boundaries.


## Complete canonical character contract (additive version 1)

New characters use `base_location` instead of legacy `location` (both together are invalid). In that complete form the following keys are required, with explicit null for unknown scalar values:

| Field | Shape and bound | Exposure |
| --- | --- | --- |
| species, age_band, occupation | nonempty string up to 200 characters or null | Public identity/profession under record visibility |
| sex | male, female, intersex, or null | Public profile under visibility |
| appearance | nonempty string up to 800 characters or null | Public physical baseline |
| traits | up to 24 nonempty strings, each up to 200 characters | Stable narrator personality; not search text |
| purpose, morality | nonempty string up to 800 characters or null | Narrator portrayal only, not knowledge or runtime goals |
| base_location, work_location, home_location | existing location ID or null | Canonical associations/default, never current position |
| affiliations | up to 24 unique existing faction/concept IDs | Explicit authored associations; no path inference |
| private_notes | optional nonempty string up to 1600 characters | Narrator portrayal only; never public retrieval/index text |

`role: player|npc`, `relationships` (character-target edges), identity/retrieval fields and explicit `knowledge` policy remain required. `summary` is the public_summary concept; no redundant public_summary field is stored. `traits` is the personality concept; no competing personality field. `occupation` supplements engine role. Work/home may be unestablished by explicit null. Legacy location-only records retain the old shape; extra complete-contract fields without base_location are rejected. Existing same-type containment/cycle checks, knowledge known_by/awareness validation, ID uniqueness and projection limits remain intact.

Appearance and occupation join the public search whitelist and public fetch profile. Purpose/morality/private_notes/traits/affiliations do not participate in lexical or semantic text. Full WorldStore/indexSource is privileged; only whitelisted retrieval projections are model-facing. Narrator portrayal is a separate visibility-checked scene projection and never grants player/NPC awareness. Extended content with independent access uses knowledge chunks, not duplicate NPC files.

A fresh runtime can seed a non-null base; subsequent runtime placement is authoritative. A new-contract null base creates no position entry until explicitly placed, and restore validates that distinction. Existing canonical NPCs with established defaults must still have exactly one runtime position. Array uniqueness and typed targets remain enforced. Content changes invalidate dataset-bound saves; pure path moves do not.
