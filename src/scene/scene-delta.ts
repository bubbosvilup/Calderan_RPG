import type { CharacterLocationState, PlayerMana, SceneDelta } from "../types/scene.js";
import type { WorldStore } from "../world/world-store.js";

export class SceneDeltaValidationError extends Error {
  constructor(
    public readonly field: string,
    reason: string,
    public readonly entityId?: string,
  ) {
    super(`${field}${entityId === undefined ? "" : ` [${entityId}]`}: ${reason}`);
    this.name = "SceneDeltaValidationError";
  }
}

/** A detached proposal, validated against a particular clock value, not a commit token. */
interface ValidatedSceneDelta extends SceneDelta {
  readonly character_movements: readonly Readonly<CharacterLocationState>[];
  readonly time_advance_minutes: number;
  readonly mana_delta: number;
}

function record(input: unknown, field: string, allowed: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new SceneDeltaValidationError(field, "expected a plain object");
  }
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input).sort((a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)) {
    const path = field === "$" ? String(key) : `${field}.${String(key)}`;
    if (typeof key !== "string" || !allowed.includes(key)) throw new SceneDeltaValidationError(path, "unknown field");
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!("value" in descriptor)) throw new SceneDeltaValidationError(path, "expected a data property, not an accessor");
    copy[key] = descriptor.value as unknown;
  }
  return copy;
}

function id(input: unknown, field: string): string {
  if (typeof input !== "string" || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(input)) {
    throw new SceneDeltaValidationError(field, "expected a canonical lowercase snake_case ID", typeof input === "string" ? input : undefined);
  }
  return input;
}

/** No mutation: validate unknown input, references, duplicates, and clock arithmetic. */
export function validateSceneDelta(input: unknown, world: WorldStore, worldMinute: number, runtimeRevision?: number, mana?: PlayerMana): ValidatedSceneDelta {
  const delta = record(input, "$", ["expected_revision", "player_location", "character_movements", "time_advance_minutes", "mana_delta"]);
  let expectedRevision: number | undefined;
  if (Object.hasOwn(delta, "expected_revision")) {
    const value = delta.expected_revision;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new SceneDeltaValidationError("expected_revision", "expected a nonnegative safe integer");
    }
    if (value !== runtimeRevision) throw new SceneDeltaValidationError("expected_revision", "stale proposal: expected revision must equal the current runtime revision");
    expectedRevision = value;
  }
  const location = (value: unknown, field: string): string => {
    const target = id(value, field);
    const entity = world.getEntity(target);
    if (!entity || entity.type !== "location") throw new SceneDeltaValidationError(field, "target must exist and have type location", target);
    return target;
  };
  let player: string | undefined;
  if (Object.hasOwn(delta, "player_location")) player = location(delta.player_location, "player_location");
  const movements: Readonly<CharacterLocationState>[] = [];
  if (Object.hasOwn(delta, "character_movements")) {
    const inputMovements = delta.character_movements;
    if (!Array.isArray(inputMovements)) throw new SceneDeltaValidationError("character_movements", "expected an array");
    for (const key of Reflect.ownKeys(inputMovements)) {
      if (key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= inputMovements.length)) {
        throw new SceneDeltaValidationError(`character_movements.${String(key)}`, "unknown array field");
      }
    }
    const seen = new Set<string>();
    for (let i = 0; i < inputMovements.length; i++) {
      const path = `character_movements[${i}]`;
      const descriptor = Object.getOwnPropertyDescriptor(inputMovements, String(i));
      if (!descriptor || !("value" in descriptor)) throw new SceneDeltaValidationError(path, "expected a movement data entry; holes and accessors are invalid");
      const entry = record(descriptor.value, path, ["character_id", "current_location"]);
      const characterId = id(entry.character_id, `${path}.character_id`);
      const character = world.getEntity(characterId);
      if (characterId === "nicco" || !character || character.type !== "character" || character.role !== "npc") {
        throw new SceneDeltaValidationError(`${path}.character_id`, "character must exist and be an NPC; the player cannot appear here", characterId);
      }
      if (seen.has(characterId)) throw new SceneDeltaValidationError(`${path}.character_id`, "duplicate NPC movement", characterId);
      seen.add(characterId);
      const target = location(entry.current_location, `${path}.current_location`);
      movements.push(Object.freeze({ character_id: characterId, current_location: target }));
    }
  }
  let minutes = 0;
  if (Object.hasOwn(delta, "time_advance_minutes")) {
    const value = delta.time_advance_minutes;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new SceneDeltaValidationError("time_advance_minutes", "time advance must be a nonnegative safe integer");
    }
    minutes = value === 0 ? 0 : value;
  }
  if (!Number.isSafeInteger(worldMinute) || !Number.isSafeInteger(worldMinute + minutes)) {
    throw new SceneDeltaValidationError("time_advance_minutes", "time advance exceeds safe-integer arithmetic");
  }
  let manaDelta = 0;
  if (Object.hasOwn(delta, "mana_delta")) {
    const value = delta.mana_delta;
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw new SceneDeltaValidationError("mana_delta", "expected a signed safe integer");
    }
    if (!mana || !Number.isSafeInteger(mana.current) || !Number.isSafeInteger(mana.max) ||
        mana.max < 0 || mana.current < 0 || mana.current > mana.max) {
      throw new SceneDeltaValidationError("mana_delta", "requires valid current player mana for validation");
    }
    if (value < -mana.current || value > mana.max - mana.current) {
      throw new SceneDeltaValidationError("mana_delta", "explicit change must leave mana between zero and maximum, before daily recovery");
    }
    manaDelta = value === 0 ? 0 : value;
  }
  return Object.freeze({
    ...(expectedRevision === undefined ? {} : { expected_revision: expectedRevision }),
    ...(player === undefined ? {} : { player_location: player }),
    character_movements: Object.freeze(movements),
    time_advance_minutes: minutes,
    mana_delta: manaDelta,
  });
}
