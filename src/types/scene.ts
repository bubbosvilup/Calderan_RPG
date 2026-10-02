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
export type CharacterLocationState = LocatedState | OffSceneState;
/** The character is at a known location. */
export interface LocatedState { character_id: EntityId; current_location: EntityId; off_scene?: undefined }
/**
 * The character left for an unknown destination. The same single domain as LocatedState: exactly one of the two shapes, never both.
 * The scene is a projection of co-location with the player, so an off-scene character is simply nowhere in it.
 */
export interface OffSceneState { character_id: EntityId; current_location?: undefined; off_scene: { last_known_location: EntityId; since_revision: number } }
/** The placement a proposal asks for: a known location, or an off-scene departure (the engine fills in last known place and revision). */
export type CharacterPlacement = { character_id: EntityId; current_location: EntityId; off_scene?: undefined } | { character_id: EntityId; off_scene: true; current_location?: undefined };

/** Proposals requiring validation before an atomic runtime commit. */
export interface SceneDelta {
  /** Optional optimistic precondition against the current runtime revision. */
  readonly expected_revision?: number;
  readonly player_location?: EntityId;
  readonly character_movements?: readonly Readonly<CharacterPlacement>[];
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
