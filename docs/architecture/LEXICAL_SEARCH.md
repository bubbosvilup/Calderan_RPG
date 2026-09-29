# Phase 1G: Lexical Search Foundation & Evaluation

Phase 1H now adds [optional semantic retrieval and hybrid fusion](SEMANTIC_SEARCH.md).
The Phase 1G tokenizer, weights, benchmark cases, exact fetch, and synchronous
lexical APIs remain unchanged. Lexical is still the developer default while real
semantic quality evaluation is pending. The results and decisions below record
Phase 1G completion; `eval:retrieval` now also reports semantic/hybrid availability.

The engine now implements deterministic, read-only lexical search through
`LexicalSearch.search(request, audience)`. It consumes the Phase 1F source adapter
and reuses its request validation, visibility policy, filters and candidate
projection. No LLM tool is registered. Exact resolution and `world_get` are unchanged.

## Lifecycle and API

```ts
const world = await loadWorld("data");
const retrieval = new RetrievalService(world);
const search = new LexicalSearch(retrieval); // builds both audience indexes once
const result = search.search({ query: "border fortress", limit: 5 }, "narrator");
// Optional exact detail: retrieval.get({ entity_id: "ironbound" }, "narrator")
```

The engine adapter supplies the audience, never the model request. Reuse the search
instance. Construction binds the index to `RetrievalIndexSource.datasetId()`;
an optional separately built `LexicalIndex` is rejected if its dataset differs
from the RetrievalService. Identical datasets with reordered sources remain compatible.
Changing canon requires reconstruction. No hot reload, disk index, workers,
network, runtime dependency, YAML parsing per query, or index rebuilding per query.

The existing `WorldSearchRequest` and `WorldSearchResult` remain intact. Default
and hard maximum are five candidates. Search has no pagination and returns
`next_offset: null`, meaning the result is terminal, not that every lexical match
fit in it. Invalid requests throw the existing `RetrievalValidationError`; oversized
canonical previews throw `RetrievalProjectionError` instead of truncating canon.
Punctuation-only queries have no tokens and return no results. No-match means no
lexical evidence, not proof that a fact is absent.

`searchDebug(request, audience)` returns all authorized matching hits, independent
of the public limit. It includes stable record references, matched tokens, strongest
matching field per token, document frequency, inverse frequency, contribution,
coverage bonus, exact bonus/field, and total score. It is an internal development
API, not model context. Its output is immutable and carries no authored passages
or filesystem paths. Public candidates carry no scores or verbose traces.

## A. Index design and visibility

Two private in-memory corpora are derived, one for narrator and one for player.
Each has field token sets, whole-field token sequences for eligible bonuses,
stable entity/chunk references, authorized filter metadata, and token-to-record
postings. Production has 46 entity documents and zero chunks per audience; tests
cover synthetic chunks. Each index retains the canonical dataset fingerprint.

Entity fields: ID, canonical name, display name, aliases, summary, search_context,
content, tags, location feature names/descriptions, direct parent ID/name/display
name only when that parent is visible, and the entity's own authored character/
faction relationship kind/description. No graph traversal or target metadata join.
Generic type labels and lifecycle/runtime positions are not scored. Type remains
a structured filter. Features are not promoted to entities.

Chunk fields: chunk ID, section, summary, search_context, content, tags, and owner
ID/name/display name only when the owner is visible. Chunk policy overrides owner
policy; missing policy denies. Public chunks of hidden/unclassified owners retain
only their own text and their permitted identity, never hidden owner prose,
aliases, tags, type or features. Chunk IDs inherently contain the permitted owner
ID; this does not authorize any other owner information.

Hidden documents never enter an audience corpus, postings, corpus size, term
frequencies, ranking, deduplication, or debug trace. Changing hidden prose or
adding fully hidden records cannot change visible scores/rankings. The global
dataset fingerprint can still change, as designed in Phase 1F.

Structured filters use the unchanged Phase 1F semantics before scoring. Entity
parent means direct parent, never ancestry. Chunk filters use authorized owner
metadata, preserving the entity-filter vocabulary. For a public chunk with a
hidden owner, `entity_ids` is permitted; nontrivial type/parent/tag filters cannot
match unavailable owner metadata. Empty `tags_all` remains unrestricted. Chunk
tags contribute to chunk text scoring but do not silently replace owner tag-filter
semantics. Projection rechecks authorization against the bound WorldStore after
ranking, using the Phase 1F projector one hit at a time to retain rank order.

## B. Tokenization and scoring

Queries and fields lowercase and split into Unicode letter/mark/number runs.
Whitespace and punctuation separate tokens, including straight/curly apostrophes,
hyphens/dashes, underscores and dots. Thus `Zul-Rath` becomes `zul`, `rath`, and
`Dragon's` becomes `dragon`, `s`. Accent marks remain; there is no Unicode
normalization beyond lowercase. No stemming, fuzzy/prefix/substring matching,
synonyms, stop-word list, translation, or query interpretation. Corpus and query
vocabulary are assumed primarily English. Exact Phase 1F resolution is stricter
and remains a separate API.

| Field | Weight |
| --- | ---: |
| ID | 14 |
| Canonical name / alias | 12 |
| Display name | 10 |
| Feature name / chunk section | 8 |
| Summary | 6 |
| search_context | 5 |
| Tags | 4 |
| Content / feature description / safe parent / safe owner / relationship prose | 2 |

For each **distinct matched query token** t, use the highest matching field weight
w(t), not a sum over duplicate fields or occurrences. Let N be document count in
the authorized corpus and df(t) the number of authorized documents containing t:

```text
idf(t) = ln(1 + N / df(t))
term contribution(t) = w(t) * idf(t)
coverage bonus = 2 * (sum idf(t) over distinct matched tokens)^2
score = sum term contributions + coverage bonus + best exact-field bonus
```

No all-token requirement. Additional distinct matches increase coverage, weighted
by rarity; common function words have less influence without a stop-word system.
Repeated words and duplicate aliases do not multiply term scores. Frequency is
effectively capped at one strongest-field occurrence per token. There is no BM25
term saturation or document-length normalization. Frequency statistics use the
entire audience corpus, independent of request filters.

Whole-field equality after tokenization gives at most one bonus: ID 300, name 240,
alias 220, display name 200, feature name or section 60. A multiword feature such as
`capital of Center` therefore receives a transparent phrase bonus. No arbitrary
substring phrase bonus or phrase parser exists; words from separate aliases or
features cannot combine into a whole-field bonus. Quoted aliases work because
quotes are punctuation. Scores descend; exact ties use full entity/chunk ID in
ascending code-unit order. Scores mean relative lexical relevance within the same
query/corpus, never probability, confidence, truth, or a cross-query scale.

Entity and chunk hits compete independently. After ranking, suppress same-owner
records with identical normalized **summary and content**, retaining the highest
ranked hit. Distinct passages remain independent; different owners are never
merged. This is exact duplicate suppression, not fuzzy near-duplicate detection.
All results still identify actual canonical records.

## C. Representative output

Top candidate IDs, in rank order (full projected previews remain Phase 1F-bounded):

| Query | Top results |
| --- | --- |
| border fortress | ironbound, center, east, west, continent |
| pirate city | blackwater, city_guard, city_magistracy, main_city_structure, ironbound |
| iron coal mining | frostspire, ironbound |
| legendary rare magic | magic_overview, light_and_shadow, learned_arts_guild, inquisition, elemental_magic |
| beastfolk slavery west | west_slavery, beastfolk, west, main_city_structure, races_overview |
| food storage cellar | heartstone_u1, heartstone_lr, heartstone_cy, heartstone_f1, davenport |

These outputs expose real limitations: pirate-city recall misses Sandspear, and
the magic overview outranks Light and Shadow. No result is interpreted as an
answer or new canonical fact by this subsystem.

## D. Evaluation and quality limits

Expectations live in `tests/retrieval-eval/cases.ts`, separate from canon.
`npm run eval:retrieval` prints metrics and per-query results; adding `-- --markdown`
prints the report table. The checked-in [quality report](LEXICAL_SEARCH_EVALUATION.md)
lists every query, expected IDs, actual top five, outcome, and failure reason.

44 cases: 34 single-target, six multi-answer, four negative diagnostics.
Final top-1 is **30/34 (88.2%)**, micro recall@5 **41/47 (87.2%)**, MRR@5 **0.927**,
and multi-answer recall@5 **7/13 (53.8%)**. All eight direct identity/alias cases
rank correctly first. Diagnostic cases do not inflate relevance metrics.
This is a development evaluation, not a held-out benchmark or broad quality claim.

Initial unweighted document-frequency baseline had top-1 27/34, recall@5 83.0%,
MRR@5 0.877, and multi-answer recall@5 46.2%. Audience-local IDF plus the generic
full-feature/section bonus improved capital and mana ranking and brought Blackwater
to first for `pirate city`. No query-specific boosts or canonical prose changes.

Remaining failures are recorded without loosening expectations:

- **Vocabulary/tokenization limits:** pirate/pirates/piracy/corsair are distinct;
  merchant/merchants and market/markets are distinct. `church investigators` lacks
  the word investigators in Inquisition. `slave trade West` favors documents with
  literal trade over the legal-market wording in West Slavery and Calderan.
- **Semantic gap:** `magic specializations` has no meaningful specialization token
  in its target, which uses subschools/styles/branches. It lands third from generic
  magic, not conceptual understanding.
- **Ambiguity/negation:** `legendary rare magic` also matches the overview's wording
  about magic being neither impossible nor legendary. `dragon ruler` retrieves
  Center (whose ruler is undefined) and partially matches Dragon's Teeth. Lexical
  scores cannot establish a dragon ruler or understand the denial.
- **Broad query coverage:** `slave market border` retrieves Khar-Dune fifth but
  misses Ironbound, which does not say market; several wider West records have
  stronger literal coverage. `where do pirates operate?` produces irrelevant
  common-word matches. It remains a failed natural-language case.

## E-G. Safety, complexity, and scope

Synthetic regressions replace hidden owner/parent names, aliases, summary, content,
features, tags and inherited chunk text with visible query terms, and add another
hidden document. Visible result IDs, scores, df/IDF and explanations stay identical
for both audiences. Separate tests cover player-only/narrator-only, unclassified,
inherited and restrictive chunk policies, hidden-owner filter leakage, and dataset
mismatch. Previews remain immutable and cannot expose full body/features/debug data.

Let T be total indexed text/token work, D documents, P total lengths of the query
postings, M documents in their union, Q distinct query tokens, and F the small fixed
field count. Building each corpus costs O(T + D log D), with O(T + D) derived
storage. Query work is O(P + M log M + M * Q * F), plus structured filter comparisons
on candidate metadata. Only matching documents' field sets are consulted; full
text is not scanned per query. Deduplication is a linear pass over ranked hits.
At most five Phase 1F projections follow. No latency benchmarks were performed.

No YAML changes, search fields in canon, new lore, schema changes, runtime mutation,
or dependencies. Tests compare all production YAML before/after and verify runtime
revision, player/NPC positions, time and mana remain unchanged. The production
dataset fingerprint remains the Phase 1F value. NarrativeContext is untouched:
world growth increases index size, not normal scene context or the five-candidate cap.

## H-K. Validation and decisions

`npm test`: 249 passing tests. `npm run typecheck`: passes.

**BM25 NOT CURRENTLY NEEDED.** The measured IDF adjustment addresses demonstrated
common-word noise. Outstanding failures are mostly absent token forms, broad
query intent, and negation; none demonstrates a need for BM25 frequency/length
normalization. Current lexical search is useful for identities and straightforward
facts, but its multi-answer/natural-question quality is not sufficient to claim
general semantic retrieval. Reconsider BM25 only with evidence addressing its strengths.

**SEMANTIC RETRIEVAL LIKELY NEEDED LATER.** Specializations/subschools, investigators/
Inquisition, and pirate/corsair questions expose conceptual or vocabulary gaps.
Some morphological gaps could be addressed by a separately approved preprocessing
phase; negation still requires careful grounded reading even with semantic search.
No embeddings, synonyms, rewriting, or semantic engine are implemented here.

**READY FOR NEXT RETRIEVAL STEP.** Foundation and safety gates pass; the quality
report gives explicit limitations for the next decision. No next phase started.

Developer commands (read-only; compilation only writes normal `.build/` artifacts):

```text
npm run inspect:search -- "pirate city"
npm run inspect:search -- --debug "iron coal mining"
npm run inspect:search -- "legendary rare magic"
npm run inspect:search -- "food storage cellar"
npm run eval:retrieval
```
