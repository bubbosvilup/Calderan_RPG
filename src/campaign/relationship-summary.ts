import type { RelationshipDimension, RelationshipLevel, RelationshipState } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";

/**
 * Household Pass 1: narrator-facing headline derived from the qualitative dimensions. The headline is a summary only; the
 * dimensions are the state. Order matters: hostility, then fear and wariness, then attachment and trust.
 */
export type RelationshipHeadline = "HOSTILE" | "AFRAID" | "WARY" | "ATTACHED" | "TRUSTING" | "GUARDED" | "NEUTRAL";
const rank = (l: RelationshipLevel | undefined) => ({ none: 0, low: 1, moderate: 2, high: 3 })[l ?? "none"];
export function relationshipHeadline(edge: DeepReadonly<Pick<RelationshipState, "dimensions">>): RelationshipHeadline {
  const d = (k: RelationshipDimension) => rank(edge.dimensions?.[k]);
  if (d("hostility") >= 2) return "HOSTILE";
  if (d("fear") >= 2) return "AFRAID";
  if (d("wariness") >= 2 && d("trust") <= 1) return "WARY";
  if (d("affection") >= 2 && d("trust") >= 2) return "ATTACHED";
  if (d("trust") >= 2) return "TRUSTING";
  if (d("wariness") >= 1 || d("fear") >= 1) return "GUARDED";
  return "NEUTRAL";
}
/** Compact "dimension: level" list of the non-"none" dimensions, in canonical order. */
export function describeDimensions(edge: DeepReadonly<Pick<RelationshipState, "dimensions">>): string {
  const order: RelationshipDimension[] = ["trust", "wariness", "affection", "protectiveness", "respect", "fear", "hostility", "romance"];
  return order.flatMap(k => { const l = edge.dimensions?.[k]; return l && l !== "none" ? [`${k} ${l}`] : []; }).join(", ") || "no established feelings";
}
