import { freezeSnapshot } from "../campaign/validation.js";
import { CampaignSaveError } from "./errors.js";
import { niccoHouseholdMembers } from "../campaign/premium-characters.js";

export const CURRENT_SAVE_VERSION = 4;
export type SaveMigration = (input: Readonly<Record<string, unknown>>) => unknown;
/** A key n owns exactly n -> n+1. No implicit defaults or unknown-field removal. */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = Object.freeze({
  1: input => {
    // Legacy v1 has no compatibility evidence. Migration retains strict identity.
    if (Object.hasOwn(input, "canon_compatibility") || Object.hasOwn(input, "canon_references")) throw new CampaignSaveError("migration_failed");
    return { ...input, schema_version: 2, canon_compatibility: "strict" };
  },
  /**
   * NPC+ Pass 1: snapshot schema 1 -> 2 adds the premium_characters domain. Membership is the only NPC+ trigger, so the domain is
   * derived from the save's own households: empty when Nicco keeps no household with other current members, otherwise one record
   * per such member with empty (unknown) stable fields and a `migrated_member` history entry at the saved revision. Nothing else
   * changes; strict validation of the target schema follows in the caller.
   */
  2: input => {
    const snapshot = input.snapshot as Readonly<Record<string, unknown>> | undefined;
    if (!snapshot || typeof snapshot !== "object" || snapshot.schema_version !== 1 || Object.hasOwn(snapshot, "premium_characters") || Object.hasOwn(snapshot, "premium_reflections")) throw new CampaignSaveError("migration_failed");
    const revision = snapshot.revision as number, minute = (snapshot.runtime as { scene: { world_time: { world_minute: number } } }).scene.world_time.world_minute;
    const premium_characters = [...niccoHouseholdMembers(snapshot as unknown as Parameters<typeof niccoHouseholdMembers>[0])].map(([character_id, household_id]) => ({ character_id, stable: {},
      dynamic: { recent_developments: [{ kind: "migrated_member", household_id, revision, world_minute: minute }], private_memory_refs: [] },
      metadata: { created_revision: revision, last_updated_revision: revision, active_household_member: true } }));
    return { ...input, schema_version: 3, snapshot: { ...snapshot, schema_version: 2, premium_characters, premium_reflections: [] } };
  },
  /**
   * Final movement closure: snapshot schema 2 -> 3 lets a runtime character location be OFF_SCENE as well as LOCATED. Every schema-2
   * location is a LOCATED entry, which is already valid in schema 3, so the migration changes only the versions: lossless, no defaults.
   */
  3: input => {
    const snapshot = input.snapshot as Readonly<Record<string, unknown>> | undefined;
    if (!snapshot || typeof snapshot !== "object" || snapshot.schema_version !== 2) throw new CampaignSaveError("migration_failed");
    // Schema 2 cannot express OFF_SCENE; an old-schema file that carries it is malformed, never silently accepted.
    const placed = (snapshot.runtime as { npc_locations?: readonly Record<string, unknown>[] } | undefined)?.npc_locations;
    if (!Array.isArray(placed) || placed.some(n => !n || typeof n !== "object" || Object.hasOwn(n, "off_scene") || typeof n.current_location !== "string")) throw new CampaignSaveError("migration_failed");
    return { ...input, schema_version: 4, snapshot: { ...snapshot, schema_version: 3 } };
  },
});

function version(input: unknown): number {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CampaignSaveError("invalid_save");
  const d = Object.getOwnPropertyDescriptor(input, "schema_version");
  if (!d || !("value" in d) || !Number.isSafeInteger(d.value)) throw new CampaignSaveError("invalid_save");
  return d.value as number;
}
/** Clone data descriptors only: migration input must never invoke accessors. */
function detached(input: unknown, ancestors = new Set<object>(), depth = 0): unknown {
  if (input === null || typeof input === "string" || typeof input === "boolean" || typeof input === "number" && Number.isFinite(input)) return input;
  if (!input || typeof input !== "object" || depth > 64 || ancestors.has(input)) throw new CampaignSaveError("invalid_save");
  const array = Array.isArray(input);
  if (!([Object.prototype, null, ...(array ? [Array.prototype] : [])] as unknown[]).includes(Object.getPrototypeOf(input))) throw new CampaignSaveError("invalid_save");
  ancestors.add(input);
  const output: Record<string, unknown> | unknown[] = array ? [] : Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (array && key === "length") continue;
    if (typeof key !== "string" || array && !/^(0|[1-9][0-9]*)$/.test(key)) throw new CampaignSaveError("invalid_save");
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!("value" in descriptor)) throw new CampaignSaveError("invalid_save");
    Object.defineProperty(output, key, { value: detached(descriptor.value, ancestors, depth + 1), enumerable: true, writable: true, configurable: true });
  }
  if (array && Object.keys(output).length !== input.length) throw new CampaignSaveError("invalid_save");
  ancestors.delete(input); return output;
}
/** Detached, bounded, sequential dispatcher. Validation of the target schema belongs to the caller. */
export function migrateSave(input: unknown, current = CURRENT_SAVE_VERSION, migrations = SAVE_MIGRATIONS): unknown {
  let source = version(input);
  if (!Number.isSafeInteger(current) || current < 1) throw new CampaignSaveError("invalid_save");
  if (source < 1 || source > current) throw new CampaignSaveError("unsupported_version");
  if (source === current) return input;
  let value: unknown;
  value = detached(input);
  while (source < current) {
    const step = Object.hasOwn(migrations, source) ? migrations[source] : undefined;
    if (!step) throw new CampaignSaveError("unsupported_version");
    try {
      value = step(freezeSnapshot(value) as Readonly<Record<string, unknown>>);
      if (version(value) !== source + 1) throw new CampaignSaveError("migration_failed");
      // Detach between steps, including when a migration returns a retained object.
      value = detached(value);
    } catch { throw new CampaignSaveError("migration_failed"); }
    source++;
  }
  return value;
}
