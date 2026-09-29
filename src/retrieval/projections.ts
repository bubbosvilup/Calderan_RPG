import { characterPublicProfile } from "../world/character-contract.js";
import type { WorldEntity } from "../types/entities.js";
import type { KnowledgeChunk } from "../types/knowledge.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CanonicalProvenance } from "../world/provenance.js";
import type { ChunkCandidate, EntityCandidate, RetrievalChunk, RetrievalEntity, RetrievalProvenance } from "./types.js";
import { RETRIEVAL_LIMITS as limits } from "./validation.js";

export class RetrievalProjectionError extends Error {
  constructor(public readonly field: string) { super(`Retrieval projection exceeds bound: ${field}`); this.name = "RetrievalProjectionError"; }
}
function text(value: string, max: number, field: string): string {
  if (value.length > max) throw new RetrievalProjectionError(field);
  return value;
}
export function bounded<T>(value: T): T {
  if (JSON.stringify(value).length > limits.projection_characters) throw new RetrievalProjectionError("total_characters");
  return Object.freeze(value);
}
function provenance(p: CanonicalProvenance): RetrievalProvenance {
  return Object.freeze({ source_kind: p.source_kind, dataset_id: p.dataset_id, entity_id: text(p.entity_id, limits.id, "entity_id"), schema_version: p.schema_version });
}
/** Call only after the service has established visibility. */
export function entityCandidate(e: DeepReadonly<WorldEntity>, p: CanonicalProvenance): EntityCandidate {
  return bounded({ kind: "entity", entity_id: text(e.id, limits.id, "entity_id"), type: e.type,
    name: text(e.name, limits.name, "name"), display_name: text(e.display_name, limits.name, "display_name"),
    summary: text(e.summary, limits.summary, "summary"), secret: !e.knowledge!.visibility.player, provenance: provenance(p) });
}
export function chunkCandidate(c: DeepReadonly<KnowledgeChunk>, p: CanonicalProvenance, secret: boolean): ChunkCandidate {
  return bounded({ kind: "chunk", entity_id: text(c.entity_id, limits.id, "entity_id"),
    chunk_id: text(c.id, limits.id, "chunk_id"), section: text(c.section, limits.id, "section"),
    summary: text(c.summary, limits.summary, "summary"), secret, provenance: provenance(p) });
}
function tags(values: readonly string[]): readonly string[] {
  if (values.length > limits.tags) throw new RetrievalProjectionError("tags");
  return Object.freeze(values.map(t => text(t, limits.id, "tags")));
}
export function entityFetch(e: DeepReadonly<WorldEntity>, p: CanonicalProvenance): RetrievalEntity {
  const features = e.type === "location" ? e.features : [];
  if (features.length > limits.features) throw new RetrievalProjectionError("features");
  return bounded({ ...entityCandidate(e, p), ...(e.type === "character" && e.base_location !== undefined ? { character: characterPublicProfile(e) } : {}), content: text(e.content, limits.content, "content"), tags: tags(e.tags),
    features: Object.freeze(features.map(f => Object.freeze({ name: text(f.name, limits.name, "feature.name"), description: text(f.description, limits.feature_description, "feature.description") }))) });
}
export function chunkFetch(c: DeepReadonly<KnowledgeChunk>, p: CanonicalProvenance, secret: boolean): RetrievalChunk {
  return bounded({ ...chunkCandidate(c, p, secret), content: text(c.content, limits.content, "content"), tags: tags(c.tags) });
}
