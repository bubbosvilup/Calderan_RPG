import type { LocationEntity } from "../types/entities.js";
import type { CharacterLocationState, PlayerMana, SceneDeltaResult, SceneState } from "../types/scene.js";
import { prepareRuntimeDelta, type RuntimeDomainSnapshot } from "./runtime-domain.js";
import type { DeepReadonly } from "../types/readonly.js";
import { WorldStore } from "./world-store.js";

export { WORLD_DAY_MINUTES, DAILY_MANA_RECOVERY } from "./runtime-domain.js";

/** Separate in-memory state. All exposed values are immutable snapshots. */
export class RuntimeState {
  #world: WorldStore;
  #npcLocations = new Map<string, string>();
  #scene: SceneState;
  #revision = 0;
  #mana: PlayerMana;

  /** Runtime metadata, separate from the authoritative scene's location and clock. */
  get revision(): number { return this.#revision; }

  constructor(world: WorldStore, initialScene: SceneState, initialMana: PlayerMana = { current: 100, max: 100 }) {
    this.#world = world;
    this.requireLocation(initialScene.player_location);
    if (!Number.isSafeInteger(initialScene.world_time.world_minute)) throw new Error("world_time.world_minute must be a safe integer");
    if (!Number.isSafeInteger(initialMana.current) || !Number.isSafeInteger(initialMana.max) ||
        initialMana.max < 0 || initialMana.current < 0 || initialMana.current > initialMana.max) {
      throw new Error("player mana must be safe integers with 0 <= current <= max");
    }
    this.#mana = Object.freeze({ current: initialMana.current, max: initialMana.max });
    this.#scene = {
      player_location: initialScene.player_location,
      world_time: { world_minute: initialScene.world_time.world_minute },
    };
    const nicco = world.getEntity("nicco");
    if (nicco && (nicco.type !== "character" || nicco.role !== "player")) throw new Error("nicco must be a character with role player");
    for (const character of world.getEntitiesByType("character")) {
      if (character.role === "player") {
        if (character.id !== "nicco") throw new Error(`Unsupported player ${character.id}; the player is nicco`);
        continue;
      }
      const startingLocation = character.base_location !== undefined ? character.base_location : character.location;
      if (character.base_location === null) continue; // Unestablished, not absent or homeless.
      if (startingLocation == null) throw new Error(`NPC ${character.id} requires a starting location`);
      this.requireLocation(startingLocation);
      this.#npcLocations.set(character.id, startingLocation);
    }
  }

  private requireLocation(id: string): DeepReadonly<LocationEntity> {
    const entity = this.#world.getEntity(id);
    if (!entity || entity.type !== "location") throw new Error(`Location ${id} must exist and have type location`);
    return entity;
  }

  /** Prevent accidental projection against a different world's canonical records. */
  assertWorld(world: WorldStore): void {
    if (world !== this.#world) throw new Error("RuntimeState belongs to a different WorldStore");
  }

  getSceneState(): DeepReadonly<SceneState> {
    return Object.freeze({
      player_location: this.#scene.player_location,
      world_time: Object.freeze({ ...this.#scene.world_time }),
    });
  }

  getNpcLocations(): readonly DeepReadonly<CharacterLocationState>[] {
    return Object.freeze([...this.#npcLocations].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([character_id, current_location]) => Object.freeze({ character_id, current_location })));
  }

  getPlayerMana(): PlayerMana { return this.#mana; }

  /** Detached direct state export; no replay or derived context. */
  exportSnapshot(): DeepReadonly<RuntimeDomainSnapshot & { revision: number }> {
    return Object.freeze({ revision: this.#revision, scene: this.getSceneState(), npc_locations: this.getNpcLocations(), mana: this.#mana });
  }

  moveCharacter(characterId: string, locationId: string): void {
    this.applySceneDelta({ character_movements: [{ character_id: characterId, current_location: locationId }] });
  }

  movePlayer(locationId: string): void {
    this.applySceneDelta({ player_location: locationId });
  }

  advanceTime(minutes: number): void {
    this.applySceneDelta({ time_advance_minutes: minutes });
  }

  /** Validate fully, prepare detached changes, then commit synchronously without callbacks. */
  applySceneDelta(input: unknown): SceneDeltaResult {
    const prepared = prepareRuntimeDelta(this.exportSnapshot(), input, this.#world, this.#revision);
    const nextScene = structuredClone(prepared.snapshot.scene);
    const nextLocations = new Map(prepared.snapshot.npc_locations.map(n => [n.character_id, n.current_location]));
    this.#scene = nextScene;
    this.#npcLocations = nextLocations;
    this.#mana = prepared.snapshot.mana;
    this.#revision += prepared.changed ? 1 : 0;
    return prepared.result;
  }
}
