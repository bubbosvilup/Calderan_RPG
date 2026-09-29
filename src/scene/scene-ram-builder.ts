import type { SceneRam } from "../types/scene.js";
import type { DeepReadonly } from "../types/readonly.js";
import { RuntimeState } from "../world/runtime-state.js";
import { WorldStore } from "../world/world-store.js";

/** Computes a snapshot only; performs no retrieval or knowledge evaluation. */
export function buildSceneRam(world: WorldStore, runtime: RuntimeState): DeepReadonly<SceneRam> {
  runtime.assertWorld(world);
  const scene = runtime.getSceneState();
  const current_location = world.getEntity(scene.player_location);
  if (!current_location || current_location.type !== "location") throw new Error("Scene player_location must resolve to a location");
  const location_ancestry = world.getAncestors(current_location.id).map(entity => {
    if (entity.type !== "location") throw new Error(`Location ancestor ${entity.id} must be a location`);
    return entity;
  });
  const present_characters = runtime.getNpcLocations()
    .filter(npc => npc.character_id !== "nicco" && npc.current_location === scene.player_location)
    .map(npc => npc.character_id);
  return Object.freeze({
    ...scene,
    current_location,
    location_ancestry: Object.freeze(location_ancestry),
    present_characters: Object.freeze(present_characters),
  });
}
