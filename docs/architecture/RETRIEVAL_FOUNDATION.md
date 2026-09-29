# Phase 1F: Retrieval Foundation

Implemented deterministic, read-only retrieval over loaded canon. Phase 1G now
builds [weighted lexical search](LEXICAL_SEARCH.md) on this foundation; Phase 1H
adds [optional semantic indexing and hybrid fusion](SEMANTIC_SEARCH.md). The Phase 1F
completion evidence below remains historical; exact resolution/fetch contracts
remain unchanged. A production embedding adapter, narrator integration, tool
registration, runtime filtering, persistence, and new canon are not included.

## APIs and intended lifecycle

Load YAML once with `loadWorld("data")`, then construct `new RetrievalService(world)`
from `src/retrieval/retrieval-service.ts`. Reuse it until the canonical dataset
changes. Future indexes consume `retrieval.indexSource()` at startup or rebuild;
no query parses YAML. Retrieval has no RuntimeState dependency.

WorldStore provides `listEntities()`, `listChunks()`, `datasetId`,
`getProvenance(entityId)`, and `getChunkProvenance(chunkId)`. Enumerations are cached,
deeply immutable arrays sorted by canonical ID using code-unit lexical comparison.
Existing type/children accessors retain their previous ordering.

The privileged `RetrievalIndexSource` exposes `datasetId()`, `entities()`, and
`chunks()`. Sources preserve structured canonical fields, including aliases,
search_context, subtype fields, features where applicable, and knowledge policy.
Chunk sources preserve explicit owner identity and their optional policy override;
absent overrides inherit owner policy. No generated search string is added.
These complete sources are engine/index-builder data, never model output.

Every audience-facing method requires `"narrator"` or `"player"`:

| Method | Behavior |
| --- | --- |
| `resolveEntityId(id, audience)` | Literal exact canonical ID |
| `resolveChunkId(id, audience)` | Literal exact chunk ID |
| `resolveCanonicalName(text, audience, page?)` | Exact normalized canonical name |
| `resolveAlias(text, audience, page?)` | Exact normalized alias |
| `resolveEntityReference(text, audience, page?)` | Authorized ID, then name, then alias |
| `filterEntities(filter, audience, page?)` | Structured entity filtering |
| `projectCandidates(references, audience, page?)` | Revalidate hit IDs, reauthorize, deduplicate and project |
| `get(request, audience)` | One bounded exact entity/chunk fetch |

`page` is `{ limit?: number; offset?: number }`. `next_offset` traverses authorized
results without silently dropping ambiguity. An ambiguous match remains ambiguous
on its last page, even if that page contains one candidate. No hidden match counts
or hidden identities are returned. Duplicate aliases on one entity count once.
Candidate projection sorts by ID; it does not preserve hypothetical ranked order.
A future ranking adapter must introduce its own explicit ordering contract.

Names/aliases use only outer whitespace trimming and JavaScript `toLowerCase()`.
There is no accent/punctuation folding, internal whitespace rewriting, fuzzy,
prefix, substring, or display-name lookup. IDs are never normalized. Precedence is
evaluated after authorization, so hidden matches cannot shadow visible matches.

## Provenance and identity

Internal provenance contains `source_kind: "authored_canon"`, `source_path`,
`entity_id`, `schema_version: 1`, and `dataset_id`. Loader paths are relative to
the dataset root with forward slashes, such as `locations/blackwater.yaml`.
Programmatic WorldStore callers can supply a root; without one, relative paths
are normalized and absolute paths retain only their filename. Provenance grants
no filesystem access. Candidate/fetch provenance omits `source_path` entirely.

Identity is SHA-256 of validated documents serialized with sorted object keys,
entities sorted by ID, and each document's chunks sorted by ID. Other arrays
retain authored ordering. Record/policy/schema changes affect identity; source
paths, checkout location, document traversal order, YAML comments/formatting,
object property order, and chunk input order do not. No Git or clock dependency.
This is a compatibility fingerprint, not a save migration policy.

Production fingerprint at completion:
`sha256:db7dbdb9b095977ced0514c1d25f232b3f732676f8b5a7ce482f0780d22de9bf`.

## Filters, visibility, and bounds

`RetrievalFilter` accepts `entity_types`, `entity_ids`, `parent_ids`, `tags_all`,
and `tags_any` arrays only. Fields combine with AND; values use OR except
`tags_all`, which requires every tag. Empty inclusion/any arrays match nothing;
empty `tags_all` imposes no restriction. Parent means direct canonical parent,
never ancestor. Type uses the actual schema variant, never the source folder.
Tags are exact case-sensitive canonical lowercase snake_case identifiers.
Unknown but syntactically valid IDs/tags simply match nothing. Invalid types,
unknown keys, accessors, nonplain objects, sparse arrays, and oversized inputs
are rejected. Validated filter arrays are copied, deduplicated, sorted, and frozen.

Visibility requires explicit audience permission; unclassified policy denies.
Chunk policy replaces inherited owner policy. A permitted chunk exposes only its
own section/summary/content/tags, chunk ID, owner ID and provenance. It never joins
owner name, type, aliases, summary, search_context, features, or parent description.
Future builders must also exclude unauthorized owner text from matching/ranking:
stripping previews alone cannot prevent hidden terms from influencing results.
Reauthorization in `projectCandidates` is the final projection boundary, not a
substitute for safe index construction. Narrator-only output has `secret: true`.
NPC knowledge inference is deferred.

Previews exclude content/features/relationships. Exact entity fetch adds content,
tags, and location features (empty features for other types); it is an allowlisted
passage view, not serialization of every subtype field. Chunks are fetched separately.
Neither view includes raw policies, aliases, or internal source paths.

| Bound | Maximum |
| --- | ---: |
| Candidate page, default and hard maximum | 5 |
| Query, before trimming | 512 characters |
| ID, name, display name, section, individual tag | 200 characters |
| Summary | 600 characters |
| Exact content | 8,000 characters |
| Features / feature description | 24 / 400 characters |
| Fetch tags / values per filter array | 32 / 64 |
| Serialized projection including wrapper | 20,000 characters |
| Input references to candidate projection | 10,000 |

Character limits use JavaScript string length, not provider token counts. Oversized
authorized text fails explicitly rather than truncating canon. `get` returns
`too_large`; candidate APIs throw `RetrievalProjectionError`. Malformed requests
throw `RetrievalValidationError`, except `get`, which returns `invalid_request`.
Ordinary misses and ambiguity are typed results. `get` distinguishes internal
`not_visible`; future model wrappers must apply `publicGetResult`, which maps it
to `not_found` without identity or policy detail. Visibility is checked before
projection bounds. Validation is a plain-data boundary, not a JavaScript sandbox.

## Future tool contracts

These are the implemented types from `src/retrieval/types.ts`. Phase 1F supplied
the types and validator; Phase 1G implements synchronous `LexicalSearch.search`,
and Phase 1H adds async `HybridSearch.search` using the same request/result types.
Semantic/hybrid diagnostics stay internal, never in candidate previews.
Audience comes from the trusted adapter, never a model-controlled request field.

```ts
interface WorldSearchRequest {
  readonly query: string;
  readonly filters?: RetrievalFilter;
  readonly limit?: number;
}
interface WorldSearchResult {
  readonly candidates: readonly RetrievalCandidate[];
  readonly next_offset: number | null;
}
type WorldGetRequest =
  | { readonly entity_id: string; readonly chunk_id?: never }
  | { readonly entity_id: string; readonly chunk_id: string };
type WorldGetResult =
  | { readonly kind: "found"; readonly record: RetrievalEntity | RetrievalChunk }
  | { readonly kind: "not_found" }
  | { readonly kind: "not_visible" }
  | { readonly kind: "invalid_request"; readonly field: string }
  | { readonly kind: "too_large"; readonly field: string };
```

`RetrievalCandidate` is a discriminated entity/chunk preview union; both retain
stable identity, summary, secret marker, and path-free provenance. Entity previews
add type/name/display_name; chunk previews add chunk_id/section. Fetch records
extend these with the authorized fields described above. Results are immutable.
`next_offset` supports internal deterministic resolver/filter paging. Phase 1G
search returns `next_offset: null` (terminal top-N result, no search pagination).
The request still has no offset; debug tooling can inspect deeper ranked hits.

Runtime-dependent narrowing belongs in a future adapter receiving an explicit
read-only RuntimeState snapshot/revision, separate from canonical index sources.
It must never treat authored initial positions as live state or write to runtime.
Normal dialogue still targets zero retrieval calls. Lore-heavy turns target one
small search plus zero/one fetch; token budgets and turn orchestration are deferred.

## Completion evidence (A-J)

**A. Enumeration:** 46 entities (24 locations, 15 world_lore, 6 factions, 1 concept),
zero production chunks. Both enumerations sort by ID; synthetic chunks are covered.

**B. Provenance:** dataset-relative normalized paths and path-independent validated
record hashing as above. Tests load equivalent YAML from two physical roots and
permute record/key/chunk order; changed content and policies change the fingerprint.

**C. Exact resolution:** narrator production results:

| Input | ID | Matched by |
| --- | --- | --- |
| `blackwater` | `blackwater` | id |
| `Blackwater` | `blackwater` | name |
| `The Unchained Haven` | `blackwater` | alias |
| `The Port of Chains` | `davenport` | alias |
| `The Fortress on the Edge` | `ironbound` | alias |

Synthetic alias `Shared` returns `kind: "ambiguous"`, IDs `[alpha, beta]`;
duplicate aliases do not duplicate candidates. An 11-match fixture remains
ambiguous across pages of 5, 5, and 1. A synthetic district can share the name
West with a nation; no production district was created.

**D. Filters:** complete outputs below concatenate bounded pages:

- `{ entity_types: ["location"], parent_ids: ["west"] }`:
  `blackwater, calderan, davenport, ironbound`.
- `{ entity_types: ["faction"] }`:
  `artisans_guild, church, city_guard, inquisition, learned_arts_guild, merchants_guild`
  (pages 5 + 1).
- `{ tags_all: ["geography"] }`:
  `blackwater, calderan, center, chained_bay, continent, davenport,
  dragons_teeth_mountains, east, frostspire, ironbound, khar_dune, mist_sea,
  sandspear, silent_ocean, skardgard, sorrow_sea, vaelrost, west, zul_rath`
  (pages 5 + 5 + 5 + 4).

**E. Visibility:** synthetic tests deny hidden/unclassified entities, prevent hidden
matches from creating ambiguity, mark narrator secrets, and honor player-only and
chunk override policies. Public chunks of hidden/unclassified owners remain
retrievable without sentinel owner names, aliases, descriptions, or features.
Inherited and more restrictive overrides are tested as well.

**F. Contracts:** final TypeScript shapes and public denial mapping appear above.

**G. Safety:** no YAML edits, search metadata, new lore, or runtime writes. Tests
compare source YAML, canonical snapshots, and runtime revision/location/NPC/time/
mana before and after retrieval. Frozen enumeration, previews, and fetches cannot
mutate the store. Runtime changes do not change canonical dataset identity.

**H. Complexity:** cached enumeration is O(1) to return the array (O(n) to consume).
ID lookup is expected O(1), plus bounded projection. Precomputed name/alias maps
give expected O(1) lookup plus O(k) authorization of matching IDs. Structured
filtering is one O(E * F) in-memory scan, where F is filter/tag comparison work.
Hit projection validates H references then deduplicates and sorts in O(H log H).
Startup hashing serializes canon and sorts IDs/keys; index sources and name/alias
maps are built once. No benchmarks are claimed or filesystem work done per query.

**I. Verification:** `npm test` passes 235 tests; `npm run typecheck` passes.
Coverage includes production smoke, synthetic ambiguity/secrets/chunks, malformed
inputs, defensive bounds, portability, determinism, and mutation isolation.

**J. Phase 1F status: READY FOR LEXICAL SEARCH.** Subsequently implemented in
[Phase 1G](LEXICAL_SEARCH.md); this section records Phase 1F completion.
