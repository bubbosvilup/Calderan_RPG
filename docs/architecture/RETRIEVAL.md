# Retrieval and turn context

The world corpus is never loaded wholesale into the model. A future context builder
assembles core instructions, player persona, visibility-checked NarrativeContext,
bounded recent conversation/scene continuity, and selected retrieved passages.
Phase 1C implements only the [primary NarrativeContext](NARRATIVE_CONTEXT.md)
projection. Future model context must use this visibility-checked boundary rather
than pass raw Scene RAM to an LLM. Phase 1F implements deterministic retrieval;
see [Retrieval Foundation](RETRIEVAL_FOUNDATION.md) for actual APIs, limits, and
contracts. Phase 1G adds [weighted lexical search](LEXICAL_SEARCH.md) and a
[measured quality evaluation](LEXICAL_SEARCH_EVALUATION.md). Phase 1H adds
[semantic indexing and hybrid fusion](SEMANTIC_SEARCH.md); real semantic quality
evaluation is pending a production adapter. Model integration and BM25 remain future work.

Primary world context is the current location, current scene state, and NPCs
currently present. Secondary context includes explicitly mentioned entities,
retrieved historical events, and relevant lore. Ancestor summaries may provide
orientation when useful; location hierarchy does not authorize unbounded expansion.

Each component needs a token budget. Even a large current entity must be represented
by a compact record and selected chunks. Keep core instructions and current scene
facts available; trim lower-priority passages and older conversation deliberately.
Initial search defaults are at most 2 calls per user turn, at most 5 results per
search, and around 3000 tokens of retrieved text total across that turn's calls.
These defaults may later be configurable. Other context budgets and summarization
policies remain future work.

## Incremental search path

1. Exact ID lookup establishes identity cheaply.
2. Alias/name lookup resolves mentions; ambiguous aliases return candidates.
3. Structured metadata filters narrow candidates independently of text scoring.
4. Weighted keyword search adds lexical passage ranking (Phase 1G); BM25 is deferred.
5. Cosine similarity adds authorized semantic candidates when a provider is configured.
6. Reciprocal Rank Fusion combines lexical/semantic ranks, protecting exact matches.

Stages 1 through 3 are implemented by Phase 1F, and weighted lexical ranking by
Phase 1G. Phase 1H implements stages 5 and 6 behind an optional embedding adapter;
they are not yet quality-validated or adopted as the developer default. No database,
production embedding model, or ranking library is selected. Entity records and chunks allow each stage
to be added without rewriting canonical content.

## Derived search documents and features

The [authoring guide](../authoring/AUTHORING_GUIDE.md) defines the future indexing
contract. Entity search documents must support ID, names, aliases, type, parent
identity, summary, search_context, content, tags, and every structured feature's
name and description. A sofa query must find `heartstone_lr` without a sofa entity.
Keep structured metadata independently filterable.

Chunk sources include owner ID plus chunk ID, section, summary, search_context,
content, and tags. Owner name/display name may only contribute to a future index
or result when that owner is authorized for the audience. A public chunk of a
hidden owner must never inherit hidden owner search text. Entity hits preserve `entity_id`; chunk hits
preserve both `entity_id` and `chunk_id`, with source provenance. Apply visibility
to the passages and metadata contributing to each result. Indexes are rebuildable
derived artifacts, never canonical `search_text`, vectors, BM25 fields, or scores.
Phase 1G builds separate narrator/player token postings from authorized source
fields, including authorized parent/owner names. Hidden text cannot affect document
frequencies, scores, or debug traces. Entity type remains a structured filter,
not a scored generic word. Search returns at most five projected records in rank
order; scores and full explanations remain developer-only.

## Deferred filter extensions (not the Phase 1F contract)

When required information is absent, the model may call `world_search(query, filters)`.
For example, an eventual event search could use:

```json
{
  "query": "a ritual involving Brenna",
  "filters": {
    "types": ["event"],
    "characters": ["brenna"],
    "location": "heartstone",
    "include_descendants": true
  }
}
```

This is a future proposal, not an executable tool or a claim that such an event exists.
Phase 1F accepts only `entity_ids`, `entity_types`, `parent_ids`, `tags_all`, and
`tags_any`; parent matching is direct. The larger future vocabulary could include `types`, `parent`,
`location`, `characters`, `participants`, `owner`, and `tags`. Future time ranges
use numeric world minutes without requiring a fantasy calendar. Apply fields with AND; within an array
use OR unless an explicit future operator says otherwise. Unknown or incompatible
filter fields must produce a clear validation error, not be silently ignored.

For a location entity, a location filter targets its own ID; for an event it targets
its primary `location`. For a character it uses authoritative runtime location;
for an item it uses physical location resolved from its runtime placement chain.
Authored starting values initialize runtime state but are not competing live values.
An unresolved physical location does not match. Other types do not implicitly match.
Descendant expansion is opt-in and follows location parent links. Without expansion,
location matching is exact. `characters` searches event NPC anchors;
`participants` allows deliberate player-inclusive searches. Metadata filters are
applied through the owning entity when returning chunks only when its metadata is
authorized. Phase 1F filters entities only; it does not implement runtime filters.

Return a bounded list with entity ID, optional chunk ID (entity-only hits have none),
display name, summary or passage, and source/revision provenance. Distinguish no
match from tool failure. Zero matches are not evidence that a fact does not exist;
the model must not invent established canon to fill the gap. Scores, when available,
describe ranking rather than truth.
Deduplicate entity/chunk content already in context and enforce response limits.
Future combined search must respect supplied filters and visibility. Phase 1F
exact resolution and structured filtering are separate APIs, both visibility-aware.

## Agentic use and persistence

The normal target is zero retrieval calls when primary context suffices. A lore-heavy
turn usually needs one small search and zero or one exact `world_get` fetch; two
searches are a ceiling for unusual cases, not a default multi-call loop. Exact fetch
must enforce the same audience policy and source provenance as search. See the
[checkpoint audit](PHASE_1E_2_AUDIT.md) for historical gaps and phase prerequisites;
Phase 1F closes its deterministic retrieval API gaps.

Later tool calling through OpenRouter may support follow-up searches guided by
previous results. The engine should cap calls, total retrieved tokens, and search
depth per turn. Ask for disambiguation when needed; do not fill retrieval gaps with
invented canon. World passages are data, never higher-priority tool instructions.

Search reads accepted world state and cannot mutate it. Committed changes must
invalidate or rebuild affected derived indexes; record source revisions and avoid
serving stale state as current fact. Historical event passages may describe an
earlier state without overriding the current entity record.

Enforce the accepted entity/chunk knowledge policies before supplying passages,
including their summaries and metadata. Narrator access does not imply player or
NPC access. Label hidden narrator context explicitly as secret/non-player knowledge;
do not directly reveal it without narrative justification. Unclassified content
requires classification before runtime use. No complex epistemic inference is planned.
Read-only lexical and optional semantic/hybrid search are implemented. No narrator
agent loop, production embedding adapter, or model tool registration is included.
