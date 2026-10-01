import type { WorldStore } from "./world-store.js";

export interface TravelRoute {
  readonly origin: string;
  readonly destination: string;
  readonly nodes: readonly string[];
  readonly edges: readonly { readonly origin: string; readonly target: string; readonly minutes: number; readonly kind?: string }[];
  readonly minutes: number;
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Dijkstra: positive integer costs; equal costs use the full node-ID sequence (code-point order). */
export function findRoute(world: WorldStore, origin: string, destination: string): TravelRoute | undefined {
  if (world.getEntity(origin)?.type !== "location" || world.getEntity(destination)?.type !== "location") return undefined;
  const pending: TravelRoute[] = [{ origin, destination: origin, nodes: [origin], edges: [], minutes: 0 }];
  const visited = new Set<string>();
  while (pending.length) {
    pending.sort((a, b) => a.minutes - b.minutes || compare(a.nodes.join("\0"), b.nodes.join("\0")));
    const route = pending.shift()!;
    const id = route.destination;
    if (visited.has(id)) continue;
    visited.add(id);
    if (id === destination) return route;
    const location = world.getEntity(id);
    if (location?.type !== "location") continue;
    for (const edge of location.connections) {
      if (visited.has(edge.target) || !Number.isSafeInteger(edge.minutes) || edge.minutes <= 0) continue;
      const minutes = route.minutes + edge.minutes;
      if (!Number.isSafeInteger(minutes)) continue;
      pending.push({ origin, destination: edge.target, nodes: [...route.nodes, edge.target],
        edges: [...route.edges, { origin: id, target: edge.target, minutes: edge.minutes, ...(edge.kind ? { kind: edge.kind } : {}) }], minutes });
    }
  }
  return undefined;
}

/** Only explicitly authored entrances resolve containers. Containment never creates a travel edge. */
export function travelDestination(world: WorldStore, destination: string): string {
  const entity = world.getEntity(destination);
  return entity?.type === "location" ? entity.entrance ?? destination : destination;
}
