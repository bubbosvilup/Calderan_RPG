import type { CampaignCommand, CampaignItem, ItemAcquisition, ItemPosition } from "./types.js";
import type { PreparationContext } from "./preparation.js";
import { characterForUpdate, findRequired, historicalMinute } from "./preparation.js";
import { fail } from "./validation.js";
import { itemHolder, transferCharacterPresent, validTransferMode } from "./item-transfer.js";

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
/**
 * Item Domain V1 identity. `campaign_item_` + 8 digits (the existing created-record prefix) is the engine-owned namespace: only create_item allocates it, from the campaign's
 * next_item_sequence, inside the same draft that persists the item (one atomic transition). Nothing else may register such an ID.
 */
export const ENGINE_ITEM_ID = /^campaign_item_(\d{8})$/;
export const formatItemId = (sequence: number): string => `campaign_item_${String(sequence).padStart(8, "0")}`;
export const engineItemSequence = (id: string): number | undefined => { const m = ENGINE_ITEM_ID.exec(id); return m ? Number(m[1]) : undefined; };
export function prepareItemCommand(context: PreparationContext, command: CampaignCommand): boolean {
  switch (command.kind) {
    case "create_item": {
      // V1 positions only: carried, or lying at a location. Equipment and unknown positions are not creatable (see ITEM_DOMAIN.md).
      if (command.position.kind !== "carried" && command.position.kind !== "stored") fail("position", "create_item supports carried or stored (at location) only");
      if (!command.name.trim()) fail("name", "created item requires a name");
      const sequence = context.draft.next_item_sequence;
      if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 99_999_999) fail("next_item_sequence", "item ID space exhausted");
      const item: CampaignItem = { id: formatItemId(sequence), origin: { kind: "created" }, name: command.name.trim(), description: command.description, visual_description: command.visual_description,
        ...(command.category ? { category: command.category } : {}), ...(command.owner_id !== undefined ? { owner_id: command.owner_id } : {}),
        position: { kind: "unknown" }, created_revision: context.draft.revision + 1 };
      context.refs.registration(item.id, item.origin, "item");
      if (item.owner_id != null) context.refs.character(item.owner_id);
      context.draft.items.push(item); place(item, command.position, context);
      context.draft.next_item_sequence = sequence + 1;
      return true;
    }
    case "register_item": {
      const item = command.item; context.refs.registration(item.id, item.origin, "item");
      if (ENGINE_ITEM_ID.test(item.id)) fail("item.id", "campaign_item_NNNNNNNN IDs are allocated by the engine (create_item) only");
      if (item.created_revision !== undefined) fail("item.created_revision", "set only by create_item");
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
    case "enrich_item_visual": {
      const item = findRequired(context.draft.items, command.item_id, "item_id");
      if (item.visual_description !== undefined) fail("visual_description", "visual identity is already established");
      item.visual_description = command.visual_description; return true;
    }
    case "set_item_sprite": {
      const item = findRequired(context.draft.items, command.item_id, "item_id");
      const previous = item.sprite?.status ?? "none", next = command.sprite.status;
      if (!((previous === "none" || previous === "failed") && next === "pending" || previous === "pending" && (next === "ready" || next === "failed"))) fail("sprite.status", "invalid sprite transition");
      if (next === "ready" && (!item.visual_description || command.sprite.generated_from_visual_description !== item.visual_description)) fail("sprite", "sprite must match stable visual identity");
      item.sprite = command.sprite; return true;
    }
    case "place_item": place(findRequired(context.draft.items, command.item_id, "item_id"), command.position, context); return true;
    case "transfer_item": {
      const item = findRequired(context.draft.items, command.item_id, "item_id");
      if (command.position.kind !== "carried") fail("position", "transfer recipient must receive the item carried");
      const recipient = command.position.character_id, source = itemHolder(item);
      context.refs.character(recipient);
      if (!source) fail("position", "transfer source must carry or equip the item; stored pickup uses place_item");
      context.refs.character(source);
      if (!transferCharacterPresent(context.draft, source) || !transferCharacterPresent(context.draft, recipient)) fail("position", "transfer source and recipient must be present");
      if (!validTransferMode(item, recipient, command.mode)) fail("mode", "invalid transfer source, recipient or ownership authority");
      if (command.acquisition && command.mode !== "gift") fail("acquisition", "only existing gift provenance is supported; other transfers preserve provenance");
      provenance(command.acquisition, context);
      place(item, command.position, context);
      if (command.mode === "gift") {
        item.owner_id = recipient;
        if (command.acquisition === undefined) delete item.acquisition; else item.acquisition = command.acquisition;
      }
      return true;
    }
    default: return false;
  }
}
