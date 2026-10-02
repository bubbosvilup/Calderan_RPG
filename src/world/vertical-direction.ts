import type { WorldStore } from "./world-store.js";
import { findRoute } from "./travel.js";

/**
 * NPC+ follow-recognition closure: the vertical direction of Nicco's same-turn move, deterministic and fail-closed.
 *
 * The world schema has no floor index, and adding one to canon would change the dataset identity (every save would then be refused),
 * so direction is read only from what is already structured about the ROUTE Nicco took: each traversed edge, its `kind`, and the
 * authored description OF THAT EDGE (never a location name). An edge is vertical when it is a `stairs` edge or its description names a
 * stair; its direction must be stated by exactly one of two closed word sets; and the reverse edge, when it exists, must state the
 * opposite. Anything else is UNKNOWN. A route is DOWN/UP only when EVERY edge on it is vertical in that one direction (a pure descent
 * or ascent); a route with any non-vertical edge is OTHER. Callers must treat UNKNOWN and OTHER as "not proven" and fail closed.
 */
export type VerticalDirection = "UP" | "DOWN" | "OTHER" | "UNKNOWN";
const STAIR = /\b(?:downstairs|upstairs|stairs?|staircase|stairway|stairwell|ladder|hatch)\b/i;
const DOWN = /\b(?:downstairs|descend\w*|down|downward|below|lower)\b/i;
const UP = /\b(?:upstairs|ascend\w*|rises?|rising|up|upward|above|upper)\b/i;

function edge(world: WorldStore, from: string, to: string) {
  const location = world.getEntity(from);
  return location?.type === "location" ? location.connections.find(c => c.target === to) : undefined;
}
/** Direction of the single edge from → to, cross-checked against the reverse edge. */
export function edgeDirection(world: WorldStore, from: string, to: string): VerticalDirection {
  const e = edge(world, from, to);
  if (!e) return "UNKNOWN";
  const read = (c: { readonly description: string; readonly kind?: string }): VerticalDirection => {
    if (c.kind !== "stairs" && !STAIR.test(c.description)) return "OTHER";
    const down = DOWN.test(c.description), up = UP.test(c.description);
    return down === up ? "UNKNOWN" : down ? "DOWN" : "UP";
  };
  const forward = read(e), back = edge(world, to, from);
  if (!back || forward === "UNKNOWN") return forward;
  const reverse = read(back);
  if (forward === "OTHER") return reverse === "OTHER" ? "OTHER" : "UNKNOWN";
  return reverse === (forward === "DOWN" ? "UP" : "DOWN") ? forward : "UNKNOWN";
}
/** Direction of Nicco's resolved route origin → arrival. Same place: OTHER. No route: UNKNOWN. Mixed or partly lateral: OTHER/UNKNOWN. */
export function routeDirection(world: WorldStore, origin: string, arrival: string): VerticalDirection {
  if (origin === arrival) return "OTHER";
  const route = findRoute(world, origin, arrival);
  if (!route || !route.edges.length) return "UNKNOWN";
  const dirs = route.edges.map(e => edgeDirection(world, e.origin, e.target));
  if (dirs.includes("UNKNOWN")) return "UNKNOWN";
  return dirs.every(d => d === "DOWN") ? "DOWN" : dirs.every(d => d === "UP") ? "UP" : "OTHER";
}
