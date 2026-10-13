# Naming conventions

Status: ACTIVE reference. Last reconciled: 2026-10-13 (labelled; where it disagrees with the code, the code and [Current state](../CURRENT_STATE.md) win). Source of truth: `src/`. Overall status: [Current state](../CURRENT_STATE.md).

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

**Reserved canonical handles (2026-10-13, REPO-12 decision).** Canonical character names, display names and aliases are reserved identity
handles. A non-canonical person, provisional or persistent, never acquires an exact canonical name or alias through self-introduction or name
disclosure; the whole name a self-introduction gives counts ("My name is Doran Hale" claims the alias "Doran Hale"). The collision fails closed
for the name establishment only: the person keeps the same id and stays unnamed, nothing merges, the canonical character is not renamed, nothing
is created, and nobody infers that the speaker "must really be" the canonical character. A canonical character's own name is never a
collision. One rule (`src/world/canonical-names.ts`, applied by `src/turn/canonical-name-reservation.ts`) covers both sides of
materialization: the provisional reading and Keep track before it, late naming of a persistent record after it (skip reason
`canonical_name_reserved`; Keep track block `canonical_name`). A shared first name ("Mira" vs Mira Thorne) is not an exact handle.

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

## Person identity and lifecycle (block 5B)

A person a Narrator merely names is **provisional**: the scene-local reference (`narrated:<name|noun>` or an ephemeral participant id) is not a campaign identity and is never saved. A **persistent** campaign character id is allocated only when an explicitly authorized action materializes that same subject (today the person Actual Offer Accept), and an id is never reused or reassigned. A **retired** character keeps its id forever (history and references stay valid); a merge retires the duplicate with `merged_into` pointing at the kept id. A name is not an identity: two people may share a name, and the scanner never treats a shared name alone as evidence of a fork.
