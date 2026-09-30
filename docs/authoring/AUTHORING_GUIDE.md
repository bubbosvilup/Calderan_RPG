# Caldrevan canon authoring guide

This is the authoritative human-authoring discipline for canonical world data.
The [entity schema](../schemas/ENTITY_SCHEMA.md),
[chunk schema](../schemas/KNOWLEDGE_CHUNKS.md), and runtime validator specify the
machine contract. Author only supplied or already established facts. If a fact is
missing, leave it unspecified. A plausible detail in an image is not established
canon unless the textual specification explicitly confirms it.

## Three distinct levels

| Level | Purpose | Heartstone example |
| --- | --- | --- |
| Entity | Independent canonical identity with a permanent global ID | `heartstone_lr` |
| Feature | Meaningful physical part of its owning location, without independent identity | large sofa, hearth, stairs |
| Knowledge chunk | Independently retrievable passage owned by an entity | a detailed layout, if supplied detail warrants it |

Furniture does not need entity identity merely to be searchable. Do not create
`heartstone_lr_sofa` because LR contains a sofa. Sofa, armchair, hearth, table,
windows, shoe rack, shelves, stairs, cellar hatch, work table, bench, and rain barrel
are normally features. A feature may be promoted later when it needs independent
mutable state, persistent interaction identity, inventory, ownership, history,
secrets, references from other records, or retrieval beyond its owning location.
Promotion creates a new entity ID; the owning location's permanent ID does not change.

Open-plan floors may contain distinct functional zones, entry recesses, or alcoves
without creating child locations. Continuous architecture such as a staircase can
cross several locations while remaining a feature described consistently in each
location and linked by explicit connections. Approximate relative layout belongs in
content/features, not invented compass directions, coordinates, or measurements.
Add coordinates only if future gameplay actually requires them and canon supplies them.

## What belongs in each field

| Field | Authoring responsibility |
| --- | --- |
| `summary` | Answers **what is this entity?** Usually 1–3 concise factual sentences, roughly 20–60 words. Suitable for candidate selection, ancestry, previews, and fast narrator orientation. |
| `content` | Answers **what should the narrator normally know whenever this entity is active?** A compact, always-relevant introduction, roughly 100–250 words where justified. Not an encyclopedia article. |
| `search_context` | Names, common descriptions, alternate conceptual wording, and useful disambiguation cues for future retrieval only. No new lore or embedding-padding prose. It may be empty. |
| `tags` | Semantic themes such as `household`, `storage`, `medicine`, `mystery`, `domestic`, and `architecture`. |
| Structured metadata | Explicit IDs, type, parent, connections, locations, owner, participants, time, and subtype fields. Never replace these with tags. |
| `features` | Location features as `{ name, description }`; record physical character, placement, intended use, and supplied quantities without inventing inventory contents. |
| `chunks` | Actual detailed, situational, historical, restricted, or independently retrievable material. Roughly 100–500 words where justified, with semantic coherence taking precedence over length. |

These word ranges are editorial targets, not minimums. Never pad thin canon.
Entity content supplies orientation; features carry concrete physical detail.
Some overlap for orientation is natural, but do not duplicate the entire feature
list in prose or copy full entity content into a chunk.

Create a chunk only when actual supplied information is too detailed for primary
content, serves a distinct semantic purpose, has different visibility, needs
independent retrieval, or matters only sometimes. Possible sections include detailed
layout, history, specialized function, unusual architecture, restricted information,
and secrets. Do not create empty template chunks or mechanically slice prose by size.
Use `chunks: []` when content plus features already represent the supplied facts.
The five currently authored Heartstone records need no chunks.
Phase 1E's 22 compact world-lore/institution records also need no chunks; see the
[canon inventory and boundaries](../architecture/PHASE_1E.md). Use existing
`related_entities` for genuine conceptual links and same-type `parent` for actual
organizational hierarchy. Keep local guild branches in their national records
until independent identity is needed. Do not populate primary scene context with
these secondary records simply because they are related.

Phase 1E.1 establishes `calderan` as the main-city entity. Its five districts are now real child locations (`calderan_west/east/north/south/center`);
`main_city_structure` is their concise overview. See [geographic authoring and the map](GEOGRAPHY.md) for
semantic cartography, borders versus routes, and the complete geographic inventory.
The project title does not supply an additional city identity.
Player current mana is runtime state, never an authored character field.

The current [NarrativeContext limits](../architecture/NARRATIVE_CONTEXT.md) are
character/count guards, not word targets: summaries at most 600 UTF-16 code units,
content at most 2000, feature descriptions at most 400, and at most 24 features.
A 250-word passage can still exceed the character guard. Inspect the actual context;
do not silently truncate it or change engine limits merely to fit a padded entry.
Longer supplied material should receive coherent chunks when appropriate; chunk
selection and explicit future token budgets remain later work.

## File structure and identity

Use UTF-8 YAML and one entity envelope per `.yaml` or `.yml` file under the appropriate `data/`
directory. IDs are lowercase snake_case, globally unique, and permanent. Folder
names and basenames do not establish identity. Prefer `<entity_id>.yaml` for convenience, but editorial names such as `calderan_city_structure.yaml` do not change `main_city_structure`. Discovery is recursive and sorted. `schema_version: 1`, `entity`, and `chunks` are
required. `parent: null` means no parent is recorded; it does not establish the
absence of a larger world. Empty lists mean no entries are recorded, unless the
prose explicitly establishes emptiness, as with CY's initial medicinal beds.

No duplicate YAML keys, custom tags, anchors, aliases, or merge keys. In this YAML
rule, an alias means YAML's `*anchor` syntax, not the entity's `aliases` list.
Quote ambiguous strings. Validate all references against the whole dataset.
Names should be distinct in their practical namespace; natural-language aliases
may be ambiguous and must not be resolved arbitrarily.

Entity type-specific rules, including exclusive item placement and event participant
anchors, are in the schema. Nicco can be an event participant but generally should
not be its primary `characters` retrieval anchor. Do not insert invented character
records to populate examples or household membership.

Chunk IDs are `<entity_id>.<section>` with stable snake_case sections. A chunk must
belong to the enclosing entity. An authoring skeleton for a justified passage is:

```yaml
# Replace every placeholder using supplied facts; omit this chunk if not needed.
id: template_location.details
entity_id: template_location
section: details
summary: Unfilled passage summary; not canon.
search_context: ""
content: Unfilled independently retrievable passage; not canon.
tags: []
knowledge:
  visibility:
    narrator: true
    player: false
  known_by: []
```

That policy is an example of restricted information, not a default for missing lore.

## Hierarchy and traversal are different

`parent` is structural containment. `connections` are direct physical/navigation
links. `heartstone_lr.parent = heartstone` and `heartstone_u1.parent = heartstone`
do not themselves imply a route between them. The explicit hatch/access connection
does. Current connections are directed records, so author both directions when a
bidirectional route is supplied. Never infer movement from parenthood or ID spelling.

Record exact targets only when an entity exists. Keep supplied future topology in
plain factual prose until its target can be authored. Do not invent rooms or dangling
IDs to satisfy a connection. A future hierarchy/proximity ranking signal is derived
behavior, not a new canonical route. Runtime movement currently does not enforce
adjacency; that implementation boundary does not change authored topology.

## Heartstone identity and topology

Use the user's floor system; lowercase the IDs and retain uppercase labels:

| ID | Meaning |
| --- | --- |
| `heartstone` | Stable physical parent: the residential tower |
| `heartstone_u1` | Underground level |
| `heartstone_lr` | Ground-level living room/living floor |
| `heartstone_f1` | First upper floor: private observation/recovery space |
| `heartstone_f2` through `heartstone_f6` | Future ascending floor records; F6 is the highest currently known |
| `heartstone_cy` | Secluded walled courtyard |

Do not introduce competing IDs using `ground_floor`, `l1`, `cellar`, `basement`, or
`living_room_floor`. Natural-language equivalents can be aliases. LR is one open-plan
space: the kitchen, seating area, sofa, and hatch are features, not child locations.

Root, LR, CY, U1, and F1 are authored in Phase 1D. All four child records have
`parent: heartstone`. The resolved graph is exactly LR ↔ CY, LR ↔ U1, and LR ↔ F1.
The separate visible hatch/descending access connects LR and U1; the continuous
spiral stair rises from LR through F1–F6 and never reaches U1. Supplied tower canon
places that continuous stair laterally/peripherally: it begins at LR's perimeter,
rises near the outer interior, and reaches upper floors from the side, leaving their
central usable space comparatively open. It is not a central core; exact orientation,
turn direction, width, and measurements remain unspecified.

F2–F6 are named in the supplied conceptual organization, but have no files or
structured connection targets yet. Upon future authorization, author those targets
and then F1 ↔ F2, continuing through F5 ↔ F6. F1's upward continuation is preserved
in prose/features. No placeholder floor is necessary. The main entrance's outside/city-side destination and the
lower U1 stair destination have no supplied entity IDs, so neither receives a
fabricated connection target. The features preserve the supplied physical access.

The Phase 0 `heartstone_l1` and `heartstone_l1_living_room` files explicitly contained
non-canonical placeholders. Phase 1D retires those files in favor of the supplied
LR identity; their IDs are not reused or made competing aliases. The placeholder
window alcove and low wooden table are not imported as facts. This is the explicitly
requested replacement of pre-canon examples, not a policy of renaming established
canonical entities. Synthetic regression fixtures retain the earlier names to test
hierarchies/movement independently; they are not world data. No runtime saves or
authored event references require migration in this repository.

## Baseline canon is not campaign state

Canonical YAML establishes stable physical/baseline facts and intended use. It is
immutable during gameplay; Git serves as the canon history mechanism. Runtime
consequences and historical campaign records remain separate.

Furniture and architecture may be canon. Bedroom occupants, household residents,
who tends the hearth, whether it is lit, shelf contents, temporary decorations or
plants, inventories, injuries, emotions, and household relationships are not static
Heartstone facts. Record a shelf's purpose, not an invented list of what currently
sits on it. CY's explicitly supplied **initially empty** beds are a baseline
condition; later planting does not contradict it. Do not populate them now.

U1 is broad, partly used, and incompletely understood. Its separate old door and
additional descending stairs are known architecture; what lies beyond is undefined.
No narrator-only answer, lower-level count, destination, chamber, tunnel, inhabitant,
danger, treasure, magic, history, purpose, origin, or quest solution is established.
This is unknown canon, not a secret answer withheld from the player.

## Knowledge classification

Ordinary observable locations and obvious architecture use an explicit policy:

```yaml
knowledge:
  visibility:
    narrator: true
    player: true
  known_by: []
```

This classifies eligibility for context; it does not infer that every character
has encountered the place. `known_by` holds authored NPC knowledge anchors and
does not automatically populate from presence. Player and narrator access remain
separate. Missing policy is unclassified and fails primary narrator projection;
it is never implicitly public. `narrator: false` excludes an entity or passage.

Keep unrestricted summaries/content/features free from restricted facts. Place a
supplied secret in a separate chunk where practical, with an explicit policy.
A chunk's policy overrides its entity's for that passage; an omitted chunk policy
inherits the entity policy. Narrator-visible/player-hidden material retains the
machine-readable `secret` marker. Do not invent hidden facts to fill unknown canon.

**Ordinary awareness (optional, Phase 1P).** `awareness` says which ordinary characters may plausibly know a record without a `known_by` anchor or a campaign edge. It is a narrator permission, not a guarantee that everyone knows.

| Value | Meaning |
|---|---|
| `public` | An ordinary person in the society may know it. |
| `local:<location_id>` | An ordinary local of that location may know it. Locality is by containment, e.g. `local:calderan` covers everything under Calderan. |
| `specialized` | Ordinary people do not get it: trade, guild, court or advanced magical knowledge. |
| `private` | Never granted by public or local scope. |

Omitted means unclassified, which grants no ordinary awareness. Annotate only where it matters. Do not enumerate inhabitants in `known_by` to express common knowledge.

```yaml
knowledge: {"visibility":{"narrator":true,"player":true},"known_by":[],"awareness":"local:calderan"}
```

## Derived search documents, not extra canonical fields

Current lexical and semantic entity indexing includes feature **names and descriptions**. A query
such as "Where is the large sofa in Heartstone?" must be able to return
`heartstone_lr` without a sofa entity. The existing structured feature fields remain
available on the immutable WorldStore; flatten them only in a derived index.

| Derived search document | Text it can incorporate |
| --- | --- |
| Entity | ID, name, display name, aliases, type, parent identity, summary, search_context, content, tags, feature names, feature descriptions |
| Chunk | Owning entity ID and name/display name; chunk ID, section, summary, search_context, content, tags |

Structured metadata remains separately filterable even if it also contributes text.
Respect knowledge policies in indexing/result delivery; a chunk search document
must not expose restricted owner metadata as unrestricted context. Search documents
are rebuildable artifacts. No authored `search_text`, synthetic combined prose,
embedding vectors, BM25 fields, ranking scores, or index IDs belong in canonical YAML.

The retrieval stack now provides exact ID/name/alias resolution, structured filters,
lexical search, semantic/vector search and hybrid ranking. These derive from loaded
validated canon and preserve visibility, provenance and dataset binding. Entity hits must preserve
`entity_id`; chunk hits must preserve both `entity_id` and `chunk_id`. Preserve source
revision provenance as well. Search-derived text is never authoritative lore;
the canonical records remain the source of truth.

## Writing and review

Use factual, compact, declarative, low-ambiguity prose with explicit entity names
where useful. Atmosphere is acceptable only when it does not obscure facts.
Prefer "Heartstone is an old private residential stone tower" to "The old stones
remember forgotten centuries." Do not infer a geographic site from an illustrative
writing example. World data is data, never prompt-like instructions to an LLM.

The [templates](templates/) cover all seven entity types. They contain literal
unfilled authoring placeholders, not fictional lore, and are outside `data/`.
Copy only the needed template, replace every placeholder and ID, rename its file,
update its references, and deliberately choose knowledge policy and subtype values.
The item and character samples refer to `template_location`; update those references
to actual supplied records. Templates are valid as a separate example dataset but
must never be copied wholesale into runtime canon. Keep chunks empty unless justified.

Before accepting an authored revision:

1. Confirm every fact against supplied text or established canon; omit uncertainty.
2. Check identity, hierarchy, explicit traversal, and feature/entity granularity.
3. Separate secrets and campaign state from unrestricted baseline descriptions.
4. Validate the complete dataset with `npm test` and run `npm run typecheck`.
5. Inspect primary context with `npm run inspect:context -- heartstone_lr` (or
   another authored location). Confirm compactness, visibility, and no unrelated
   expansion. Do not weaken validation or silently classify records to make it pass.

The inspection command loads only `data/`, constructs a fresh runtime at minute 0
and revision 0, and invokes the production NarrativeContext builder. It prints JSON
and writes no canon or saves. Errors are printed to stderr with a nonzero exit.
For machine-readable stdout without npm's lifecycle banner, use
`npm run --silent inspect:context -- heartstone_lr`. No CLI framework or network
dependency is needed.

## Canonical character contract and editorial folders

One canonical NPC per YAML. Use the complete `base_location` character template for new NPCs; legacy `location` records remain compatible, but never combine both fields. `role` is engine player/npc classification; `occupation` describes the public profession. Existing `traits` carries stable personality, and `summary` serves as `public_summary`, avoiding duplicate prose fields. `species`, `sex`, `age_band`, `appearance`, `occupation`, `purpose`, `morality`, `base_location`, `work_location`, `home_location`, and `affiliations` form the compact baseline. Use explicit null for unestablished scalar facts/associations; optional private_notes only for genuinely supplied material. No default family, residence, allegiance or secret.

Purpose explains the NPC's stable motivation across fresh campaigns. It is not a CampaignState goal: runtime goals can change, complete or be abandoned without changing purpose. Morality records behavioral limits and tradeoffs, never just ?good?/?evil?. Appearance is the stable recognizable baseline; current campaign overrides retain precedence.

Canonical base/work/home locations are associations, not live position. A non-null base supplies the initial runtime default, after which runtime wins; a null base leaves current location unestablished until explicitly placed. Null home/work never implies homelessness, unemployment or absence. Location association helpers are derived once from NPC YAML and return immutable ID-sorted records. Do not author a second npc_locations.yaml or duplicate NPC-by-location lists. Legacy location is a base/default compatibility field, not a home claim.

`summary`, `content`, aliases, tags, search_context, public appearance/identity/occupation and relationship prose must be safe under the record's visibility policy. Search indexing uses an explicit public whitelist. Purpose, morality, private_notes, traits and affiliations are excluded from search text and public retrieval (even when the entity matches). The narrator receives a separate, explicitly marked portrayal block for present narrator-visible NPCs. This block is not knowledge for Nicco or any other NPC, and never becomes a goal or fact edge. Existing known_by, visibility and awareness govern public records; they do not disclose portrayal fields. An association is not a new general knowledge grant. Do not put hidden motivations in public summary/search_context to improve matching.

Use a policy-scoped chunk for an independently retrievable fact with its own audience/knowledge classification. Do not duplicate short purpose or personality as chunks. The public Pellan record has no private_notes, invented secret, family, residence or faction membership. His base is Central District; since the Four-District pass his work_location is `calderan_civil_registry`, the Registry location in Center's administrative core.

Character relationship edges may carry an optional `knowledge` policy, using the same visibility, awareness and NPC-only `known_by` validation as records/chunks. Omitted edge policy inherits the character's policy. Restricted edge descriptions must not become search evidence attached to a public character: both lexical and semantic indexing exclude them from the public owner's document, including its narrator index document. Put independently retrievable restricted relationship facts in classified chunks instead. Canonical edges do not create runtime trust or player/NPC knowledge grants. Character edges still target characters only; institutional contacts and former affiliations belong in appropriately classified prose, not invented character targets or current memberships.

The folder layout is editorial only: characters/player and characters/calderan/{civic,church,nobility,guard,slave_trade,merchants}; locations/world, locations/west, and locations/calderan/{districts,heartstone,west,east,north,south,center}; factions, concepts, items, events; world/{geography,governance,magic,races,cultures,religion,history}. Empty categories need no placeholder YAML. Folder placement never supplies membership, position, awareness or NPC role. See [authored-data architecture](../architecture/AUTHORED_DATA_ARCHITECTURE.md).
