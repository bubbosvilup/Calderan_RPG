import type { WorldEntity } from "../types/entities.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CandidateReference, RetrievalEntitySource, RetrievalFilter } from "./types.js";

/** Shared structured semantics; callers establish authorization first. */
export function matchesEntityFilter(e: DeepReadonly<WorldEntity>, f: RetrievalFilter): boolean {
  return (!f.entity_types || f.entity_types.includes(e.type)) &&
    (!f.entity_ids || f.entity_ids.includes(e.id)) &&
    (!f.parent_ids || (e.parent !== null && f.parent_ids.includes(e.parent))) &&
    (!f.tags_all || f.tags_all.every(t => e.tags.includes(t))) &&
    (!f.tags_any || f.tags_any.some(t => e.tags.includes(t)));
}

/** Public chunks may expose owner identity without access to owner filter metadata. */
export function matchesAuthorizedOwner(ref: CandidateReference, owner: RetrievalEntitySource | undefined, filter: RetrievalFilter): boolean {
  if (owner) return matchesEntityFilter(owner, filter);
  return (!filter.entity_ids || filter.entity_ids.includes(ref.entity_id)) &&
    filter.entity_types === undefined && filter.parent_ids === undefined &&
    filter.tags_any === undefined && (!filter.tags_all || filter.tags_all.length === 0);
}
