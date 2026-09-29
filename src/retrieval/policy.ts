import type { KnowledgeAccess } from "../types/entities.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { RetrievalAudience, WorldGetResult } from "./types.js";

/** Missing policy is unclassified, never public. No NPC knowledge inference. */
export function isVisible(policy: DeepReadonly<KnowledgeAccess> | undefined, audience: RetrievalAudience): boolean {
  return policy?.visibility[audience] === true;
}

/** A future external wrapper must conceal existence of denied/unclassified records. */
export function publicGetResult(result: WorldGetResult): Exclude<WorldGetResult, { kind: "not_visible" }> {
  return result.kind === "not_visible" ? Object.freeze({ kind: "not_found" }) : result;
}
