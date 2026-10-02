import type { CampaignCommand, CharacterCurrentState } from "./types.js";
import type { PreparationContext } from "./preparation.js";
import { characterForUpdate } from "./preparation.js";
import { fail } from "./validation.js";
import { prepareRuntimeDelta, type RuntimeDomainSnapshot } from "../world/runtime-domain.js";

function requireEmptyLocationForCanonical(current: CharacterCurrentState): void {
  if (current.current_location !== undefined) fail("current_location", "canonical locations are authoritative in runtime; use move_character");
}
export function prepareCharacterCommand(context: PreparationContext, command: CampaignCommand): boolean {
  const { draft, refs } = context;
  switch (command.kind) {
    case "register_character": {
      const c = command.character; refs.registration(c.id, c.origin, "character");
      if (c.origin.kind === "canonical") requireEmptyLocationForCanonical(c.current);
      if (c.current.current_location !== undefined) refs.location(c.current.current_location);
      if (c.current.empty_slots) c.current.empty_slots.sort();
      // Promotion Pass 1.1: an origin snapshot is written once, at registration, for a created character promoted in this very
      // revision where it stands. It cannot be backdated, relocated or attached to canon.
      const o = c.origin_snapshot;
      if (o) {
        if (c.origin.kind !== "created") fail("origin_snapshot", "only created characters carry a promotion origin");
        if (o.promoted_revision !== draft.revision + 1) fail("origin_snapshot.promoted_revision", "promotion must be recorded at the revision it commits");
        if (o.promoted_world_minute !== context.draft.runtime.scene.world_time.world_minute) fail("origin_snapshot.promoted_world_minute", "promotion time must be the current world minute");
        refs.location(o.location_id);
        if (c.current.current_location !== o.location_id) fail("origin_snapshot.location_id", "a promoted person stands where they were promoted");
      }
      draft.characters.push(c); return true;
    }
    case "set_profile": {
      const c = characterForUpdate(context, command.character_id);
      c.profile = command.profile; return true;
    }
    case "set_condition": {
      const c = characterForUpdate(context, command.character_id);
      c.current.conditions = command.conditions;
      if (command.presentation === undefined) delete c.current.presentation; else c.current.presentation = command.presentation;
      if (command.status !== undefined) c.current.status = command.status;
      return true;
    }
    case "move_character": {
      const origin = refs.character(command.character_id); refs.location(command.location_id);
      if (origin.kind === "created") characterForUpdate(context, command.character_id).current.current_location = command.location_id;
      else {
        const entity = refs.world.getEntity(origin.canonical_entity_id)!;
        if (entity.type !== "character") fail("character_id", "invalid canonical character");
        const delta = entity.role === "player" ? { player_location: command.location_id } : { character_movements: [{ character_id: entity.id, current_location: command.location_id }] };
        draft.runtime = structuredClone(prepareRuntimeDelta(draft.runtime, delta, refs.world, draft.revision).snapshot) as RuntimeDomainSnapshot;
      }
      return true;
    }
    case "leave_scene": {
      // Runtime Continuity Repair 1: only a created (runtime) character physically in the player's current scene can leave it.
      // Its whereabouts become unestablished (no location); the record, conditions and history stay. Re-entry needs move_character.
      const origin = refs.character(command.character_id);
      if (origin.kind !== "created") {
        // Final movement closure: an ACTIVE authored NPC+ present with Nicco departs for an unknown destination. Her single authoritative
        // location becomes OFF_SCENE(last known place, this revision); nothing else about her changes (relationships, knowledge, history).
        const entity = refs.world.getEntity(origin.canonical_entity_id);
        const placed = draft.runtime.npc_locations.find(n => n.character_id === command.character_id);
        if (entity?.type !== "character" || entity.role !== "npc" || !draft.premium_characters.some(p => p.character_id === command.character_id && p.metadata.active_household_member)) fail("character_id", "only created characters and active household members can leave a scene through leave_scene");
        if (placed?.current_location !== draft.runtime.scene.player_location) fail("character_id", "character is not present in the current scene");
        draft.runtime = structuredClone(prepareRuntimeDelta(draft.runtime, { character_movements: [{ character_id: entity.id, off_scene: true }] }, refs.world, draft.revision).snapshot) as RuntimeDomainSnapshot;
        return true;
      }
      const c = context.draft.characters.find(x => x.id === command.character_id);
      if (!c || c.current.current_location !== draft.runtime.scene.player_location || c.current.status === "dead") fail("character_id", "character is not present in the current scene");
      delete c.current.current_location;
      return true;
    }
    case "set_slot_knowledge": {
      const c = characterForUpdate(context, command.character_id);
      if (draft.items.some(i => i.position.kind === "equipped" && i.position.character_id === c.id && i.position.slot === command.slot)) fail("slot", "occupied slot cannot be marked empty or unknown; move its item first");
      const slots = new Set(c.current.empty_slots ?? []);
      if (command.state === "empty") slots.add(command.slot); else slots.delete(command.slot);
      if (slots.size) c.current.empty_slots = [...slots].sort(); else delete c.current.empty_slots;
      return true;
    }
    default: return false;
  }
}
