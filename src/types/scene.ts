import type { EntityId, LocationEntity, WorldTime } from "./entities.js";

/** Player-only resource; independent of authored character records. */
export interface PlayerMana {
  readonly current: number;
  readonly max: number;
}

/** Minimal authoritative runtime scene state. */
export interface SceneState {
  player_location: EntityId;
  world_time: WorldTime;
}

/** Computed context projection; presence is never independently writable. */
export interface SceneRam extends SceneState {
  current_location: LocationEntity;
  /** Immediate parent first, root last; excludes current_location itself. */
  location_ancestry: LocationEntity[];
  present_characters: EntityId[];
}

/** NPC authority; the player's sole location is SceneState.player_location. */
export interface CharacterLocationState {
  character_id: EntityId;
  current_location: EntityId;
}

/** Proposals requiring validation before an atomic runtime commit. */
export interface SceneDelta {
  /** Optional optimistic precondition against the current runtime revision. */
  readonly expected_revision?: number;
  readonly player_location?: EntityId;
  readonly character_movements?: readonly Readonly<CharacterLocationState>[];
  /** Nonnegative safe integer minutes. */
  readonly time_advance_minutes?: number;
  /** Signed safe integer; explicit changes must stay within the mana bounds. */
  readonly mana_delta?: number;
}

/** Immutable receipt of actual changes; never an authoritative state record. */
export interface SceneDeltaResult {
  readonly applied: true;
  readonly player_moved: boolean;
  readonly moved_characters: readonly EntityId[];
  readonly time_advanced_minutes: number;
}
