import type { CharacterLocationState, PlayerMana, SceneDeltaResult, SceneState } from "../types/scene.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "./world-store.js";
import { SceneDeltaValidationError, validateSceneDelta } from "../scene/scene-delta.js";

export const WORLD_DAY_MINUTES = 1440;
export const DAILY_MANA_RECOVERY = 25;
/** Revision belongs to the transaction owner, not this domain. */
export interface RuntimeDomainSnapshot {
  scene: SceneState;
  npc_locations: CharacterLocationState[];
  mana: PlayerMana;
}
/** Pure preparation shared by the legacy owner and CampaignState. */
export function prepareRuntimeDelta(current: DeepReadonly<RuntimeDomainSnapshot>, input: unknown, world: WorldStore, revision: number) {
  const delta = validateSceneDelta(input, world, current.scene.world_time.world_minute, revision, current.mana);
  const scene: SceneState = {
    player_location: delta.player_location ?? current.scene.player_location,
    world_time: { world_minute: current.scene.world_time.world_minute + delta.time_advance_minutes },
  };
  const crossedDays = Math.floor(scene.world_time.world_minute / WORLD_DAY_MINUTES) - Math.floor(current.scene.world_time.world_minute / WORLD_DAY_MINUTES);
  const explicitMana = current.mana.current + delta.mana_delta;
  const recovered = Math.min(current.mana.max - explicitMana, crossedDays * DAILY_MANA_RECOVERY);
  const mana = Object.freeze({ current: explicitMana + recovered, max: current.mana.max });
  const locations = new Map<string, CharacterLocationState>(current.npc_locations.map(n => [n.character_id, n as CharacterLocationState]));
  const moved: string[] = [];
  for (const movement of delta.character_movements) {
    const was = locations.get(movement.character_id);
    if (movement.off_scene) {
      // LOCATED(A) -> OFF_SCENE(last known A, since the revision this change commits). Already off-scene: nothing changes.
      if (!was || was.off_scene) continue;
      locations.set(movement.character_id, Object.freeze({ character_id: movement.character_id, off_scene: Object.freeze({ last_known_location: was.current_location!, since_revision: revision + 1 }) }));
      moved.push(movement.character_id);
    } else if (was?.current_location !== movement.current_location) {
      locations.set(movement.character_id, Object.freeze({ character_id: movement.character_id, current_location: movement.current_location })); moved.push(movement.character_id);
    }
  }
  const result: SceneDeltaResult = Object.freeze({ applied: true, player_moved: scene.player_location !== current.scene.player_location,
    moved_characters: Object.freeze(moved.sort()), time_advanced_minutes: delta.time_advance_minutes });
  const changed = result.player_moved || moved.length > 0 || result.time_advanced_minutes > 0 || mana.current !== current.mana.current;
  if (!Number.isSafeInteger(revision + (changed ? 1 : 0))) throw new SceneDeltaValidationError("runtime_revision", "runtime revision exceeds safe-integer arithmetic");
  const snapshot: DeepReadonly<RuntimeDomainSnapshot> = Object.freeze({ scene: Object.freeze({ ...scene, world_time: Object.freeze(scene.world_time) }), mana,
    npc_locations: Object.freeze([...locations].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, state]) => state)) });
  return Object.freeze({ snapshot, result, changed });
}
