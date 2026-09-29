import type { CampaignCommand, CampaignItem, ItemAcquisition, ItemPosition } from "./types.js";
import type { PreparationContext } from "./preparation.js";
import { characterForUpdate, findRequired, historicalMinute } from "./preparation.js";
import { fail } from "./validation.js";

function provenance(value: ItemAcquisition | undefined, context: PreparationContext): void {
  if (!value) return;
  historicalMinute(value.acquired_at, context, "acquired_at");
  if (value.from_character_id !== undefined) context.refs.character(value.from_character_id);
  if (value.event_id !== undefined) context.refs.event(value.event_id);
}
function place(item: CampaignItem, next: ItemPosition, context: PreparationContext): void {
  if (next.kind === "stored") context.refs.location(next.location_id);
  if (next.kind === "carried" || next.kind === "equipped") context.refs.character(next.character_id);
  if (next.kind === "equipped" && context.draft.items.some(i => i.id !== item.id && i.position.kind === "equipped" && i.position.character_id === next.character_id && i.position.slot === next.slot)) fail("position.slot", "equipment slot already occupied");
  const previous = item.position;
  if (previous.kind === "equipped" && !(next.kind === "equipped" && next.character_id === previous.character_id && next.slot === previous.slot)) {
    const c = characterForUpdate(context, previous.character_id);
    c.current.empty_slots = [...new Set([...(c.current.empty_slots ?? []), previous.slot])].sort();
  }
  if (next.kind === "equipped") {
    const c = characterForUpdate(context, next.character_id);
    const empty = c.current.empty_slots?.filter(slot => slot !== next.slot);
    if (empty?.length) c.current.empty_slots = empty; else delete c.current.empty_slots;
  }
  item.position = next;
}
export function prepareItemCommand(context: PreparationContext, command: CampaignCommand): boolean {
  switch (command.kind) {
    case "register_item": {
      const item = command.item; context.refs.registration(item.id, item.origin, "item");
      if (item.origin.kind === "created" && !item.name) fail("item.name", "created item requires a name");
      // Canonical ownership is not evidence of being carried or equipped.
      if (item.origin.kind === "canonical" && item.owner_id === undefined) {
        const baseline = context.refs.world.getEntity(item.id)!;
        if (baseline.type === "item" && baseline.owner !== undefined) item.owner_id = baseline.owner;
      }
      if (item.owner_id != null) context.refs.character(item.owner_id);
      provenance(item.acquisition, context);
      const next = item.position; item.position = { kind: "unknown" };
      context.draft.items.push(item); place(item, next, context); return true;
    }
    case "place_item": place(findRequired(context.draft.items, command.item_id, "item_id"), command.position, context); return true;
    case "transfer_item": {
      const item = findRequired(context.draft.items, command.item_id, "item_id");
      if (command.owner_id !== null) context.refs.character(command.owner_id);
      provenance(command.acquisition, context);
      place(item, command.position, context); item.owner_id = command.owner_id;
      if (command.acquisition === undefined) delete item.acquisition; else item.acquisition = command.acquisition;
      return true;
    }
    default: return false;
  }
}
