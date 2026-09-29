import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "./types.js";
import { CampaignIdentityResolver } from "./identity.js";
import { fail, freezeSnapshot } from "./validation.js";

function resolver(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore): CampaignIdentityResolver {
  if (snapshot.dataset_id !== world.datasetId) fail("dataset_id", "projection/canon mismatch");
  return new CampaignIdentityResolver(world, snapshot);
}
/** Rebuild canonical baseline + campaign overrides, without copying authored lore into durable state. */
export function characterView(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, characterId: string) {
  const origin = resolver(snapshot, world).character(characterId);
  const overlay = snapshot.characters.find(c => c.id === characterId);
  const canonical = origin.kind === "canonical" ? world.getEntity(origin.canonical_entity_id) : undefined;
  let location = overlay?.current.current_location;
  if (canonical?.type === "character") location = canonical.role === "player" ? snapshot.runtime.scene.player_location : snapshot.runtime.npc_locations.find(c => c.character_id === characterId)?.current_location;
  return freezeSnapshot(structuredClone({ id: characterId, origin,
    profile: { ...(canonical ? { name: canonical.name, aliases: canonical.aliases } : {}), ...overlay?.profile },
    current: { ...(canonical?.lifecycle && ["active", "inactive", "dead"].includes(canonical.lifecycle) ? { status: canonical.lifecycle } : {}),
      ...overlay?.current, ...(location === undefined ? {} : { current_location: location }) } }));
}
export function itemView(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, itemId: string) {
  resolver(snapshot, world).item(itemId);
  const item = snapshot.items.find(i => i.id === itemId)!;
  const canonical = item.origin.kind === "canonical" ? world.getEntity(item.origin.canonical_entity_id) : undefined;
  return freezeSnapshot(structuredClone({ ...(canonical ? { name: canonical.name, description: canonical.content } : {}), ...item }));
}
export function characterPossessions(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, characterId: string) {
  resolver(snapshot, world).character(characterId);
  return freezeSnapshot({ owned: snapshot.items.filter(i => i.owner_id === characterId),
    carried: snapshot.items.filter(i => i.position.kind === "carried" && i.position.character_id === characterId),
    equipped: snapshot.items.filter(i => i.position.kind === "equipped" && i.position.character_id === characterId),
    stored_owned: snapshot.items.filter(i => i.owner_id === characterId && i.position.kind === "stored") });
}
export function equipmentSlot(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, characterId: string, slot: string) {
  resolver(snapshot, world).character(characterId);
  const item = snapshot.items.find(i => i.position.kind === "equipped" && i.position.character_id === characterId && i.position.slot === slot);
  if (item?.position.kind === "equipped") return Object.freeze({ state: "occupied" as const, item_id: item.id, mode: item.position.mode });
  return Object.freeze({ state: snapshot.characters.find(c => c.id === characterId)?.current.empty_slots?.includes(slot) ? "empty" as const : "unknown" as const });
}
/** Negative means overdue, not implicitly triggered. No mutable countdown or second clock. */
export function remainingEventMinutes(snapshot: DeepReadonly<CampaignSnapshot>, eventId: string): number {
  const event = snapshot.scheduled_events.find(e => e.id === eventId);
  if (!event) fail("event_id", "unknown scheduled event");
  const remaining = event.scheduled_world_minute - snapshot.runtime.scene.world_time.world_minute;
  if (!Number.isSafeInteger(remaining)) fail("remaining_minutes", "time difference exceeds safe-integer arithmetic");
  return remaining;
}
