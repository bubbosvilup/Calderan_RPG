import type { RetrievalAudience, RetrievalEntitySource } from "./types.js";
import { isVisible } from "./policy.js";

/** Restricted edge prose must never be indexed as a public owner's unflagged
 * evidence. Independently retrievable private facts belong to restricted chunks. */
export function searchableRelationships(entity: RetrievalEntitySource, audience: RetrievalAudience) {
  if (entity.type === "faction") return entity.relations;
  if (entity.type !== "character") return [];
  return entity.relationships.filter(edge => {
    const policy = edge.knowledge ?? entity.knowledge;
    return isVisible(policy, audience) && (!entity.knowledge?.visibility.player || isVisible(policy, "player"));
  });
}
