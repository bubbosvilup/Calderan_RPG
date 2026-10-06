import { findRoute, travelDestination, type TravelRoute } from "../world/travel.js";
import type { WorldStore } from "../world/world-store.js";
/** Shared weighted routing for natural movement and explicit carrying. */
export function reachable(destination: string, here: string, world: WorldStore): { readonly target?: string; readonly via_container?: boolean; readonly route?: TravelRoute } {
  const target = travelDestination(world, destination);
  const route = findRoute(world, here, target);
  return route ? { target, via_container: target !== destination, route } : {};
}
