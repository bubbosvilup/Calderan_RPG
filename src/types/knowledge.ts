import type { EntityId, KnowledgeAccess, WorldEntity } from "./entities.js";

/** Runtime validation must enforce the entity_id and section components. */
export type KnowledgeChunkId = `${string}.${string}`;

export interface KnowledgeChunk {
  id: KnowledgeChunkId;
  entity_id: EntityId;
  section: string;
  summary: string;
  search_context: string;
  content: string;
  tags: string[];
  /** Inherits entity policy if absent; unresolved access is not public. */
  knowledge?: KnowledgeAccess;
}

/** YAML envelope, not a database row or model context payload. */
export interface WorldDocument {
  schema_version: 1;
  entity: WorldEntity;
  chunks: KnowledgeChunk[];
}
