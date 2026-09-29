# Phase 1H: Semantic Retrieval Foundation + Hybrid Search

## Phase 1H.1 update

The production `VoyageEmbeddingProvider` now uses native Node fetch and
`voyage-4`, 1024 floating-point dimensions. Documents use `input_type: document`;
queries use `input_type: query`. The immutable public identity is
`voyage:voyage-4:1024`. Configuration accepts API key, model, dimensions and
timeout (default 10 seconds). The key is read at construction from
`VOYAGE_API_KEY` unless explicitly supplied, stored in a private field, and never
included in public metadata, diagnostics, errors or usage reports.

```powershell
setx VOYAGE_API_KEY "<secret>"
```

Start a new shell/process after `setx`. Do not put the real key in project files.

```text
npm run inspect:embedding -- "church investigators"
npm run eval:retrieval
npm run eval:retrieval -- --paced-voyage
```

The last command supports restricted accounts with 16-document batches and
40-second request spacing. Pacing is evaluation-only; adapter calls have no
automatic retries. Normal evaluation batches each audience corpus once and
batches unique queries using `input_type: query`, then caches those query vectors
only for that process. Large batches are split conservatively by UTF-8 bytes and
count inside the adapter. Truncation is disabled. Semantic indexes remain memory-only.

`eval:retrieval` automatically uses Voyage when the key is present (the existing
explicit trusted adapter-module override remains supported). Missing configuration
reports unavailable; failures cannot count lexical fallback as semantic quality.
The historical `--markdown` option remains lexical-only. Normal tests use fake
keys and injected transports, requiring neither credentials nor network.

See [Phase 1H.1 real evaluation](SEMANTIC_SEARCH_EVALUATION.md) for measured
metrics, threshold observations, representative queries, usage and the decision.
No dependency, canon, narrator, runtime or persistence changes were introduced.

The unchanged 44-case benchmark measured:

| Mode | Top-1 | Recall@5 | MRR@5 | Multi-answer Recall@5 |
| --- | --- | --- | --- | --- |
| Lexical | 30/34 | 87.2% | 0.927 | 53.8% |
| Semantic | 30/34 | 95.7% | 0.926 | 92.3% |
| Hybrid | 31/34 | 97.9% | 0.956 | 92.3% |

**HYBRID RETRIEVAL VALIDATED.** Prefer hybrid with a configured audience index;
retain lexical for offline operation. Identity/alias accuracy stays 8/8, and all
seven required lexical-strength checks retain their first result. One descriptive
geographic query regresses from Ironbound to Center first (Ironbound remains
second); Church/Inquisition hybrid ordering remains imperfect. No RRF retuning:
**k=60** remains. Threshold **0.35** returns a median two candidates (mean 3.5,
range 0–11); it misses Davenport at 0.333 for one labeled query and admits some
unrelated geographic candidates. Hybrid recovers Davenport lexically. Keep the
threshold pending a broader precision/recall study. The real run built 46-document
narrator and player indexes, with seven requests and 18,832 reported tokens total.

## Historical Phase 1H record (before the Voyage evaluation)

Semantic architecture is implemented and tested offline. **Production semantic
quality is not validated:** no real embedding adapter/model is selected, configured,
or benchmarked in this workspace. Synthetic vectors verify mechanics only.
Lexical remains the working developer default. No narrator integration, persistence,
vector database, new dependency, query rewriting, or new lore is included.

## A. Provider boundary, documents, and index lifecycle

`src/retrieval/embedding-provider.ts` defines the vendor-independent contract:

```ts
type EmbeddingVector = readonly number[];
interface EmbeddingCallOptions { readonly signal: AbortSignal }
interface EmbeddingProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly dimension: number;
  readonly purpose: "production" | "test";
  embedDocuments(texts: readonly string[], options?: EmbeddingCallOptions):
    Promise<readonly EmbeddingVector[]>;
  embedQuery(text: string, options?: EmbeddingCallOptions): Promise<EmbeddingVector>;
}
```

Adapters own vendor URLs, credentials, transport, token budgets, and request formats.
Batch responses must preserve input order. A model ID must identify a fixed model/
version and encoding recipe, including any asymmetric query/document prefixes.
Embeddings must depend on the supplied text and that recipe, not unrelated requests
or hidden corpus state. Dimension must be an integer from 1 through 16,384. Arrays
are ordinary dense numeric arrays; adapters convert typed arrays if necessary.
Provider code/configuration is trusted engine code, never model-controlled input.

`deriveSemanticDocuments(source, audience)` builds deterministic, immutable texts
only from authorized canon: name, distinct display name, deduplicated aliases,
type, summary, search_context, content, location features, the record's own
character/faction relation prose, and an authorized direct parent's name. Labels
such as `Name:`, `Summary:` and `Feature:` structure existing facts; no LLM creates
text or inserts synonyms. IDs stay in record references rather than embedding prose.

Chunks embed their own section, summary, search_context, content, and the owner's
name only when that owner is authorized. They never inherit owner aliases,
features, summary, or content. Hidden/unclassified owner metadata is omitted before
calling the provider. Missing policy denies; chunk overrides replace owner policy.
Each audience gets its own documents, calls, and vectors. There is no secret global
corpus searched and filtered afterward. Safe parent/owner labels are descriptive
context, not graph traversal or semantic relationship inference.

Derived text is limited to 20,000 JavaScript characters per document. Oversized
authorized documents fail index construction; they are not silently truncated.
Adapters must enforce their model's actual token limit separately. Hidden oversized
documents do not affect an audience build. This budget never changes canonical YAML.

```ts
const world = await loadWorld("data");
const retrieval = new RetrievalService(world);
const lexical = new LexicalSearch(retrieval); // still synchronous and independent
const narratorIndex = await SemanticIndex.build(
  retrieval.indexSource(), provider, "narrator",
  { batch_size: 32, timeout_ms: 10000, minimum_similarity: 0.35 }
);
const search = new HybridSearch(retrieval, [narratorIndex], lexical);
const result = await search.search({ query: "church investigators" }, "narrator");
// Optional detail stays exact: retrieval.get({ entity_id: "inquisition" }, "narrator")
```

Build once per dataset/model/audience and reuse. Batches default to 32 documents
(allowed 1–128); production narrator canon needs two batches, 32 + 14. Player
index construction is a separate explicit call. Construction is atomic: a failed
batch never publishes a partially built index. Empty authorized corpora need no
embedding calls; their declared dimension remains known.

Index identity includes dataset ID, provider ID, model ID, dimension, purpose,
audience, and document recipe `authorized-canon-text-v1`. It is distinct from the
canonical dataset fingerprint. Dataset changes require rebuilding; changed models
or encoding recipes require new model IDs and rebuilding. No hot reload or index
serialization. Hybrid construction rejects dataset/model/dimension mismatches,
duplicate audience indexes, and a lexical index from another dataset. Direct
semantic queries reject the wrong audience. Provider identity is rechecked around
async calls to prevent model drift from silently mixing vectors.

## B. Vectors, cosine, and thresholds

Every provider batch count and vector is validated: dense ordinary arrays, data
properties only, correct dimension, finite numeric values, and nonzero norm.
Sparse arrays, accessors, array subclasses, extra fields, NaN, Infinity, wrong
dimensions, and zero vectors fail. Provider arrays are copied and stored frozen;
retaining and mutating a provider response cannot alter the index.

Vectors normalize at build time; query vectors normalize once per query. Divide
first by the largest absolute component, then by the scaled Euclidean norm. This
avoids overflow/underflow for extreme finite inputs. Cosine is the dot product of
the unit vectors, clamped to [-1, 1] for floating-point roundoff. Given the same
validated vectors and request, ranking and explanations are deterministic; the
provider is responsible for reproducible embeddings for its fixed model.

Minimum similarity defaults to **0.35**, configurable internally in (0, 1]. Scores
at the threshold are included; negative/zero/weak similarities are excluded. This
is an **uncalibrated starting parameter**, not a demonstrated relevance boundary.
No quality claims or probability interpretation attach to cosine scores. A real
provider must be evaluated and its threshold calibrated before adopting hybrid.

Structured filters apply to authorized document metadata before cosine scoring.
Semantics match Phase 1G: direct parent only; AND between fields; chunk filters use
visible owner metadata. Public chunks of hidden owners can match allowed owner
identity but cannot match unavailable type/parent/tag metadata. Empty `tags_all`
remains unrestricted. A filter producing no eligible documents skips query embedding.

`SemanticIndex.searchDebug(request, audience)` returns immutable references,
`semantic_score`, `dataset_id`, and `audience`, never vectors or full embedding text.
It scans eligible vectors, sorts by cosine descending then full record ID ascending,
and applies the existing same-owner identical summary/content duplicate policy.

## C. Hybrid ranking and exact-hit protection

`HybridSearch.search(request, audience)` implements the unchanged compact search
contract asynchronously. Explicit construction with semantic indexes opts into
hybrid mechanics; this is not automatic production adoption. Its third argument
is a developer-only `lexical | semantic | hybrid` mode. Mode and audience are not
accepted inside untrusted `WorldSearchRequest` objects.

Lexical and semantic ranks combine with equal-weight Reciprocal Rank Fusion:

```text
RRF(record) = sum 1 / (60 + one-based channel rank)
```

The constant 60 is fixed and has not been tuned to the evaluation cases. Each
channel contributes at most once per record. Raw lexical and cosine scores are
never added. Internal full ranked lists contribute, not just their first five.
Fusion sorts by RRF descending, then full entity/chunk ID ascending. For example,
lexical rank 1 plus semantic rank 4 contributes `1/61 + 1/64`, beating a candidate
present only at semantic rank 1 with `1/61`.

In hybrid mode, the existing Phase 1F resolver runs independently of embeddings.
Authorized exact ID/name/alias hits satisfying filters are pinned before fused
neighbors. ID > name > alias precedence remains unchanged. All matches in an
ambiguous selected class remain protected in canonical ID order; debug evidence
marks them ambiguous, never inventing uniqueness. The separate resolver remains
the authoritative ambiguity API. Filters can exclude an exact hit; pinning never
overrides authorization or filters. Semantic-only development mode intentionally
shows raw semantic ranking for evaluation, not protected hybrid behavior.

Each result identifies an actual canonical record. Same-owner identical normalized
summary/content passages collapse to the highest-ranked representation after
fusion/pinning; distinct entity/chunk passages can both appear. No near-duplicate
semantic clustering or generated combined records. Only five previews, by default
and hard maximum, pass through Phase 1F policy rechecks and bounded projection.
`next_offset` stays null; there is no public search pagination.

`searchDebug` returns channel ranks/raw scores, RRF score, exact-match evidence and
semantic/fallback status. `searchWithDiagnostics` returns that plus compact output
using **one** query embedding, for evaluation/inspection. Neither debug API returns
vectors, source paths or authored hidden text. Model-facing `search` returns only
the existing previews. `world_get` and synchronous exact/lexical APIs are unchanged.

## D. Visibility evidence

Synthetic tests inspect actual provider input batches. Replacing hidden owner/
parent names, aliases, content and inherited chunks with query terms, or adding
fully hidden records, leaves authorized embedding texts byte-for-byte identical.
Cosine scores, result identities, hybrid ranks and debug evidence remain identical.
Global canonical dataset fingerprints can change, as required by Phase 1F.
Public chunks remain retrievable through their own authorized passage without
owner names/types/features or hidden metadata influencing filters. Separate tests
cover missing policy, inherited policy, restrictive overrides, narrator-only and
player-only content. Trusted adapters must preserve this isolation and must not
use corpus-dependent hidden state to produce vectors.

## E-F. Provider and evaluation status

| Fact | Status |
| --- | --- |
| Provider-independent interface / vector validation | Implemented |
| Synthetic deterministic test adapter | Implemented in tests only |
| Real production embedding adapter | Not implemented/bundled |
| Real provider configured in this workspace | No |
| Real semantic/hybrid quality or latency benchmark | Not performed |

Optional developer setup: set `CALDREVAN_EMBEDDING_ADAPTER` to the path of a trusted
local JavaScript module exporting async/sync `createEmbeddingProvider()`. It must
return the interface above with `purpose: "production"`. It owns all vendor setup
and obtains any credentials outside source/canon. This hook supports future local
or remote adapters without changing the engine; it is not an HTTP adapter itself.
Synthetic adapters are rejected by the quality-evaluation configuration loader.
No adapter is loaded or network call made by default.

`npm run eval:retrieval` uses **all the same 44 Phase 1G cases** and metric formulas.
It always reports lexical metrics. If a production adapter is configured, it
builds one narrator semantic index and evaluates lexical, semantic, and hybrid
modes separately. Each semantic/hybrid case makes one query embedding; a fallback
or failed query marks that mode unavailable rather than publishing a misleading
quality score. Build/configuration failure does not stop lexical evaluation.
`-- --markdown` intentionally remains the historical lexical-only report format.

Current measured lexical results remain:

| Metric | Lexical | Semantic | Hybrid |
| --- | ---: | --- | --- |
| Top-1 | 30/34 (88.2%) | Unavailable | Unavailable |
| Recall@5 | 87.2% | Unavailable | Unavailable |
| MRR@5 | 0.927 | Unavailable | Unavailable |
| Multi-answer recall@5 | 53.8% | Unavailable | Unavailable |

There is **no evidence yet** that hybrid improves semantic-gap cases. Production
adoption remains gated on measured improvement, no significant identity/factual
regression, and passing visibility/output-budget tests. Synthetic vector tests
demonstrate geometry, rank fusion, resilience and exact pinning only; they are
never presented as semantic retrieval quality.

## G. Example searches in the current unconfigured environment

These are explicitly **lexical fallback** results, not semantic improvements:

| Query | Actual leading IDs |
| --- | --- |
| magic specializations | elemental_magic, magic_overview, magic_subschools, learned_arts_guild, mana |
| church investigators | church, inquisition, calderan, city_guard, light_and_shadow |
| pirate city | blackwater, city_guard, city_magistracy, main_city_structure, ironbound |
| places where pirates operate | inquisition, learned_arts_guild, main_city_structure |
| legendary rare magic | magic_overview, light_and_shadow, learned_arts_guild, inquisition, elemental_magic |
| border fortress | ironbound, center, east, west, continent |

The natural pirate question remains poor and the earlier semantic/vocabulary gaps
remain unresolved. A configured real provider must revisit these cases; the
architecture does not manufacture successful answers in its absence.

```text
npm run inspect:search -- --mode lexical "church investigators"
npm run inspect:search -- --mode semantic "church investigators"
npm run inspect:search -- --mode hybrid --debug "border fortress"
npm run eval:retrieval
```

Without configuration, semantic inspection reports unavailable/pending. Hybrid
inspection explicitly reports `used_mode: lexical` and the fallback reason. The
default command remains lexical and works without loading any provider adapter.

## H. Resilience and critical path

Embedding calls default to a 10-second deadline (configurable 1–60,000 ms). The
engine aborts and rejects on deadline even if an adapter ignores cancellation;
adapters should honor AbortSignal to stop underlying work. Late results cannot
modify an index. Provider exceptions are sanitized, not copied into debug output.
Malformed output never becomes a zero vector. A failed build returns no index.

Hybrid with a missing audience index or a query failure falls back to lexical,
with internal status/reason. Pure semantic mode fails explicitly. Dataset/model/
audience incompatibility is a hard configuration error, never silently fused.
Caller setup can omit an index after a failed build, keeping lexical operational;
the developer inspector implements this behavior. Failed searches do not mutate
accepted vectors; later successful calls can use the intact index.

Normal scene turns still perform zero retrieval. Requested hybrid retrieval adds
at most one query embedding call, then a local cosine scan/fusion and optionally
one exact fetch. No query cache is added; batching applies to startup documents.
Remote latency is unmeasured. Local/remote providers and a future bounded cache
fit the same interface. Exact resolution, WorldStore and RuntimeState stay synchronous.

For D authorized records and vector dimension V, semantic vector storage is O(DV)
and a query's cosine work is O(filtered D * V), plus O(M log M) ranking for surviving
matches. Text derivation/grouping occurs at construction; embeddings are generated
once per build in batches. Fusion is O(L + S + U log U) for lexical/semantic list
lengths and their union. Only bounded final projections reach callers. No ANN,
background worker, index persistence, or timing claims.

## I-K. Canon safety, verification, and decision

No YAML changes, SEO synonyms, new lore, runtime writes, or NarrativeContext
expansion. Tests compare all production YAML, immutable store snapshots, revision,
player/NPC locations, time, mana, and primary NarrativeContext before/after semantic
and hybrid operations. Runtime changes do not invalidate canonical embeddings.
World growth increases index size, not the normal NarrativeContext or five-result cap.

`npm test`: **264 passing tests**, including all prior 249.
`npm run typecheck`: **passes**. Existing lexical metrics remain unchanged.
Developer evaluation/inspection commands were verified with absent configuration:
lexical remains available; semantic/hybrid quality is explicitly unavailable.
No dependencies were added.

**SEMANTIC ARCHITECTURE READY — QUALITY EVALUATION PENDING**

No OpenRouter narrator integration, persistence, or subsequent phase has begun.
