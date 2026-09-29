# Knowledge chunks

Contract: [knowledge.ts](../../src/types/knowledge.ts).
One entity may own zero or many chunks; a chunk has exactly one owning entity.
Chunks are co-located in the authoring envelope but remain separate retrieval units.

An optional `knowledge: KnowledgeAccess` policy contains `visibility` with separate
`narrator`/`player` booleans and `known_by` NPC IDs. It overrides the owning entity's
policy for this passage; omission inherits the entity policy. If neither exists,
classify the passage before runtime use rather than treating it as public. Mark
hidden narrator context secret/non-player; do not directly reveal it without
narrative justification. Summaries and search cues carry the same restrictions as
the passage. This is a contract only, without epistemic inference.

| Required field | Type | Meaning |
| --- | --- | --- |
| `id` | KnowledgeChunkId | Exactly `<entity_id>.<section>` |
| `entity_id` | EntityId | Must equal the enclosing entity's ID |
| `section` | string | Stable snake_case semantic section |
| `summary` | string | Short description of this passage |
| `search_context` | string | Disambiguating names and cues; may be empty |
| `content` | string | Nonempty authoritative passage, Markdown allowed |
| `tags` | string[] | Passage-specific semantic themes |

Use coherent semantic units. A living room might have `overview`, `layout`,
`features`, and `history` chunks, but create only sections with useful supplied
content. Do not manufacture history to fill a template or slice every N characters.
If a passage grows too broad, divide it by meaning and retire replaced IDs.

Chunk summaries and search cues derive from content, not speculative enrichment.
Tags are passage-specific; retrieval may derive a union with entity tags, without
copying that union back into the source. Type, location, event characters, time,
parent, and owner remain on the entity and are joined when filtering chunks.

Resolve identity and structured metadata through the entity record. Cite passages
using both entity and chunk IDs. Avoid repeated passages in entity `content` and
chunks, and deduplicate retrieved passages before context assembly.

The five authored Heartstone locations use `chunks: []`: entity content and
structured features already cover the supplied facts. Their feature names and
descriptions must contribute to future derived entity search documents without
duplicating them into a chunk. When supplied detail justifies a passage, keep it
consistent with structured fields in the same Git revision. See the authoritative
[authoring guide](../authoring/AUTHORING_GUIDE.md).

Embeddings, token limits, ranking scores, index IDs, and cache versions are derived
implementation concerns and are not part of this canonical schema. Future indexes
must track source revisions so stale passages cannot silently supersede changes.
