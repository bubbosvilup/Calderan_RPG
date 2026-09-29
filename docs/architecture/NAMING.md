# Naming conventions

Entity IDs match `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`: lowercase snake_case,
no spaces, readable, globally unique across all entity types. File names are
`<entity_id>.yaml`; folder names are organizational and do not form identity.

IDs are permanent identities, not descriptions of current state. Valid examples:
`heartstone`, `heartstone_lr`, `heartstone_u1`, `heartstone_cy`,
`heartstone_f1`, `brenna`, `maren`, `root_clan`,
`tsukikage_kodama`. Never use `brenna_angry`, `brenna_after_joining_nicco`, or
`heartstone_destroyed` for changing states. Keep an ID even after renaming,
relocation, destruction, or a change in allegiance. Never reuse retired IDs.

`name` is the canonical human name; `display_name` is the UI label. `aliases` are
alternative lookup names, not replacement IDs. Aliases need not be unique: search
must handle ambiguity. Canonical references always use IDs, not names or aliases.
Prefer canonical names unique within their practical namespace. Ambiguous aliases
return multiple candidates; never silently choose an arbitrary entity.

## Location hierarchy and granularity

```text
heartstone
  heartstone_lr
  heartstone_u1
  heartstone_cy
```

Hierarchical IDs are encouraged where useful. Explicit `parent` is authoritative;
the hierarchy must be acyclic and every non-null parent must resolve. Do not infer
ancestry by splitting IDs. An entity retains its ID even if its parent changes.

A stone fireplace, window alcove, sofa, armchair, or table normally stays a room
feature. Promote a feature only when it needs independent state, history,
retrieval, interaction, inventory, ownership, secrets, or persistent changes.
Features can be described together in a retrievable room chunk without becoming
entities. Future promotion allocates a new entity ID and updates references.

For Heartstone, LR is one open-plan ground-level space; its kitchen is a feature,
not a room/entity. U1 is underground, CY is the courtyard, F1 is the observation
floor, and F2–F6 name future ascending floor records. Root/LR/U1/CY/F1 are authored
now. Do not create competing
`l1`, `ground_floor`, `cellar`, `basement`, or `living_room_floor` IDs; natural names
may be aliases. The [authoring guide](../authoring/AUTHORING_GUIDE.md) records the
explicit replacement of the Phase 0 non-canonical placeholder files. Canonical
identity remains permanent; retired placeholder IDs are not reused.

## Other identifiers

Chunk IDs follow `<entity_id>.<section>`, for example
`heartstone_lr.layout`. Sections use the same snake_case syntax and
are unique within an entity. Use meaningful sections such as `overview`, `layout`,
`features`, or `history`; do not number arbitrary text slices. Chunk IDs remain
stable when wording changes; a split or merge requires retiring old chunk IDs.

Semantic tags use snake_case, for example `resurrection`, `grief`, `ritual`,
`secrecy`, `medicine`, `politics`. Entity types use the literal values in the schema.
Structured references and time never belong only in tags.
