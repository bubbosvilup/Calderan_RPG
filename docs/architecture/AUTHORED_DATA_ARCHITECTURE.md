# Authored data architecture

## Pre-migration audit (2026-09-29, before any data move)

`loadWorld` recursively discovers .yaml/.yml with sorted directory entries and a final sorted file list. It rejects symlinks, duplicate YAML keys, aliases/anchors/tags, malformed envelopes and global duplicate IDs. Directories have no runtime semantics. The validator currently requires basename `<entity_id>.yaml`; this is a filename convention, not the identity source, but prevents the requested editorial rename. Remove only that coupling; retain ID syntax, unique IDs and typed references. Both supported YAML extensions will then work consistently.

`WorldStore` keys entities/chunks by authored IDs. `datasetIdentity` hashes validated documents sorted by entity/chunk ID with canonical object keys; it never hashes source paths. Source paths affect engine-only provenance and diagnostic ordering. Public retrieval provenance omits paths. Semantic references and text use stable IDs and explicit entity fields, never filesystem paths. Lexical scoring uses weighted authored fields and stable-ID tiebreaks, never paths. Save compatibility is dataset-ID based: pure moves preserve it; new canon legitimately invalidates old dataset-bound saves and indexes.

One additional ordering issue: WorldStore getChildren/getEntitiesByType iterate the insertion map (source-path order). Use its already ID-sorted immutable entity list so authoring paths cannot alter derived order.

Lexical/semantic documents explicitly whitelist public summary/content/search_context/aliases/tags, visible parent identity, features and authored relation text. Full index source is privileged, not a model API. RetrievalService rechecks audience visibility and fetch projects a whitelist. New portrayal fields must remain outside both public indexes and public fetches; exposure of a matched entity must not reveal private motivations. Narrator portrayal needs a separate marked, visibility-checked projection, not knowledge grants.

Pinned tests: world.test.ts filename rejection; retrieval.test.ts 49 entity count, 20 geography-tagged records and flat blackwater path; authoring.test.ts flat directory reads; geography/world-canon/opening tests Heartstone/Calderan ancestry and old overview prose; lexical-search and semantic-search benchmarks pin relevance/rank. Phase 1R retrieval-recall tests pin 25/25 policy top-1. Changes will be investigated, not silently rebaselined. Phase 1H real-vector quality cannot be measured offline; report unavailable and run its mechanical integration tests separately.

No authored-data load-size guards currently exist beyond YAML alias rejection and downstream projection/semantic-document budgets. Those existing limits will remain unchanged; new character fields receive explicit bounds.


## Adopted architecture

The pre-migration observations above are retained as the audit record. The filename equality check has now been removed; all structural, reference, ID and cycle validation remains. Both supported YAML extensions are accepted independent of basename. `getChildren` and `getEntitiesByType` use the immutable stable-ID-sorted entity list. No folder-to-semantics parser was added.

```text
data/
  characters/player/nicco.yaml
  characters/calderan/civic/pellan.yaml
  characters/calderan/{church,nobility,guard,slave_trade,merchants}/
  locations/world/                 # nations, non-West cities, seas, range
  locations/west/                  # existing other West cities
  locations/calderan/calderan.yaml
  locations/calderan/districts/    # five district locations
  locations/calderan/heartstone/   # tower, existing floors/courtyard, outside square
  locations/calderan/west/         # official market and separate criminal fringe
  locations/calderan/{east,north,south,center}/
  factions/ concepts/ items/ events/
  world/geography/                 # continental_structure; calderan_city_structure
  world/governance/                # west_governance; west_slavery
  world/{magic,races,cultures,religion,history}/
```

Unpopulated editorial categories contain no fabricated placeholder YAML. Folders never establish faction membership, location, awareness or role. Explicit world_lore category values remain schema metadata (the legacy fundamentals value is retained); the new directory names are not category inference.

## Identity, provenance and compatibility

Pure path migration was separately measured before any content addition. All 49 IDs, dataset hash, semantic document texts, lexical scores/ranks and Phase 1R rows remained identical. Engine-only source provenance changed, as expected. Model-facing provenance still omits source_path. Regression tests now relocate/rename records, including arbitrary nested .yml names, and restore the same snapshot against the relocated store.

New content and explicit reference changes legitimately produce a new dataset hash. Stable IDs are necessary for references, but do not bypass the existing dataset compatibility gate: old saves need an explicit future content migration or the old canon version. No silent save migration/rebase or writes to existing saves occurred. Semantic document builder version is now authorized-canon-text-v2 because public character profile fields participate in embedding text. Rebuild indexes on the new dataset/version; raw source paths still do not enter embedding text or identity.

## Character contract

New NPCs use the complete base_location form defined in ENTITY_SCHEMA and template_character. Legacy location-only records remain accepted without invented defaults; location and base_location cannot coexist. The complete form requires explicit null for unestablished scalars/associations. Existing summary serves public_summary; traits serves personality; role is engine player/npc, occupation is the human public role. Species, sex, age band and appearance are stable recognizable baseline; purpose is cross-campaign motivation; morality describes ethical boundaries and tradeoffs. No canonical purpose is converted to a CampaignState goal.

Base is an association and fresh-campaign default, not current runtime authority. Non-null base seeds the existing runtime NPC-location domain once; subsequent runtime placement wins. Null base leaves position unestablished, and restore accepts an omitted position only for that explicitly unestablished default. Established-default NPCs must still have one position, with unique canonical character IDs and location-typed targets. Work/home null never means unemployed/homeless/absent. Work and home do not create scene presence.

WorldStore builds immutable, ID-ordered base/work/home association buckets at load time. `charactersBasedAt`, `charactersWorkingAt`, `charactersLivingAt` read those buckets; runtime movements do not alter them. No duplicate location catalog or new persistent state exists.

## Indexing versus exposure

| Field/concept | Lexical and embedding text | Public entity get (either audience) | Present narrator scene | NPC/player awareness |
| --- | --- | --- | --- | --- |
| id/name/aliases/summary/content/tags/search_context, relationship prose | Existing audience-authorized whitelist | Existing bounded public projection | Existing permitted baseline | Existing visibility, known_by, awareness/edges; not automatically all NPCs |
| species/sex/age_band/appearance/occupation | Explicit public character whitelist | character public profile | Appearance plus public summary/content | No new knowledge edge or universal permission |
| traits/personality | Excluded | Excluded | Existing traits and marked portrayal | Never automatically knowledge |
| purpose/morality/private_notes | Excluded for both audiences | Excluded even if NPC matches query | Explicit narrator_portrayal_only_not_character_knowledge block, only with narrator visibility | Never facts, knowledge edges or goals |
| affiliations | Excluded | Excluded | Marked narrator portrayal | Membership is not a knowledge grant |
| base/work/home associations | No flattened private location prose | Excluded from character fetch | Current position comes from runtime; existing explicit local-awareness policy may use base locality | Association helper alone grants nothing |

Full WorldStore, indexSource and semantic builder filter_owner metadata remain privileged engine objects. Only document.text goes to the embedding provider. Tests inspect actual captured provider text, ranked search, public fetch and the character-knowledge projection with distinct sentinel values. A raw internal object serialization is not a public API. Public summary/content/search_context must not contain secrets: per-field separation cannot undo author misclassification.

Private portrayal is intended to guide a narrator, not to be recited to a player. This phase verifies deterministic projection boundaries, not perfect LLM obedience; no paid narrator run was required for the additive bounded scene block. Independently retrievable restricted facts belong in policy-scoped chunks. Short baseline personality/purpose does not need duplicated chunks.

## Geography and pilot

Five district IDs are real locations parented to calderan. Heartstone and its outside square are separate children of calderan_west; U1/LR/F1/CY remain structurally under heartstone. Official market and criminal fringe are distinct West children. Parent expresses containment only: existing eight directed tower/entrance edges remain unchanged and no new district routes are authored.

Pellan is the only new NPC. His public profile and narrator baseline follow the supplied contract, including fainting under severe shocks. Base is calderan_center. Exact Civil Registry work_location is null because no workplace entity exists; the public occupation still names the Registry and Archive. Home, family, private history, secrets and allegiances were not invented. No Civil Registry building was needed solely to satisfy the schema.

## Verification and reproduction

`npm test`, `npm run test:playthrough`, `npm run typecheck`, and `npm run eval:retrieval -- --markdown` run offline. `node .build/src/dev/audit-authored-data.js <new-stage-name>` emits an exclusive before/after artifact: counts/types/IDs, source provenance, seven exact ranked-score probes, lexical suite, authorized semantic text and the production Phase 1R benchmark. It makes no paid calls. The Phase 1H evaluation entry point was also run with production credentials/adapters cleared: real semantic/hybrid quality is explicitly unavailable, while its synthetic integration tests pass. Never report fallback or synthetic vectors as real semantic quality.

Full evidence and ranking investigation: [Calderan data foundation review](../evaluations/CALDERAN_DATA_FOUNDATION_REVIEW.md). Future work is limited to separately authorized cast/content and any explicit save/vector refresh; no gameplay subsystem or additional cast was begun here.
