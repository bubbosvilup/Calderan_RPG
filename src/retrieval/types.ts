import type { EntityType, WorldEntity } from "../types/entities.js";
import type { KnowledgeChunk } from "../types/knowledge.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CanonicalProvenance } from "../world/provenance.js";

export type RetrievalAudience = "narrator" | "player";
export type RetrievalEntitySource = DeepReadonly<WorldEntity> & { readonly entity_id: string; readonly provenance: CanonicalProvenance };
export type RetrievalChunkSource = DeepReadonly<KnowledgeChunk> & { readonly chunk_id: string; readonly provenance: CanonicalProvenance };
/** Trusted full-canon source for index construction, not a tool result. */
export interface RetrievalIndexSource {
  datasetId(): string;
  entities(): readonly RetrievalEntitySource[];
  chunks(): readonly RetrievalChunkSource[];
}

export interface RetrievalFilter {
  readonly entity_types?: readonly EntityType[];
  readonly entity_ids?: readonly string[];
  readonly parent_ids?: readonly string[];
  readonly tags_all?: readonly string[];
  readonly tags_any?: readonly string[];
}
export interface RetrievalPage { readonly limit?: number; readonly offset?: number }
/** Path-free traceability for future model wrappers. */
export type RetrievalProvenance = Omit<CanonicalProvenance, "source_path">;
interface CandidateBase {
  readonly entity_id: string;
  readonly summary: string;
  readonly secret: boolean;
  readonly provenance: RetrievalProvenance;
}
export interface EntityCandidate extends CandidateBase {
  readonly kind: "entity";
  readonly type: EntityType;
  readonly name: string;
  readonly display_name: string;
}
/** Owner identity only; no owner names, types, summaries or other metadata. */
export interface ChunkCandidate extends CandidateBase {
  readonly kind: "chunk";
  readonly chunk_id: string;
  readonly section: string;
}
export type RetrievalCandidate = EntityCandidate | ChunkCandidate;
export interface WorldSearchResult {
  readonly candidates: readonly RetrievalCandidate[];
  readonly next_offset: number | null;
}
export interface WorldSearchRequest {
  readonly query: string;
  readonly filters?: RetrievalFilter;
  readonly limit?: number;
}
export type WorldGetRequest =
  | { readonly entity_id: string; readonly chunk_id?: never }
  | { readonly entity_id: string; readonly chunk_id: string };
export interface RetrievalEntity extends EntityCandidate {
  readonly character?: ReturnType<typeof import("../world/character-contract.js").characterPublicProfile>;
  readonly content: string;
  readonly features: readonly { readonly name: string; readonly description: string }[];
  readonly tags: readonly string[];
}
export interface RetrievalChunk extends ChunkCandidate {
  readonly content: string;
  readonly tags: readonly string[];
}
/** Internal outcome. Future model-safe mapping conceals not_visible as not_found. */
export type WorldGetResult =
  | { readonly kind: "found"; readonly record: RetrievalEntity | RetrievalChunk }
  | { readonly kind: "not_found" }
  | { readonly kind: "not_visible" }
  | { readonly kind: "invalid_request"; readonly field: string }
  | { readonly kind: "too_large"; readonly field: string };
export type ResolutionResult =
  | { readonly kind: "not_found" }
  | { readonly kind: "found"; readonly matched_by: "id" | "name" | "alias"; readonly candidate: RetrievalCandidate }
  | { readonly kind: "ambiguous"; readonly matched_by: "name" | "alias"; readonly candidates: readonly RetrievalCandidate[]; readonly next_offset: number | null };

/** Validated reference to a potential future index hit, not a raw index document. */
export type CandidateReference = WorldGetRequest;
