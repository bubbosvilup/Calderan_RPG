import type { CharacterEntity, LocationEntity, WorldEntity } from "../src/types/entities.js";
import type { WorldDocument } from "../src/types/knowledge.js";

// Synthetic Phase 0 regression fixtures, not authored Heartstone canon.
// Their legacy IDs deliberately exercise a deeper hierarchy and separate rooms.
export const room = "heartstone_l1_living_room";
export const kitchen = "heartstone_l1_kitchen";
export const garden = "heartstone_garden";

export function base(id: string) {
  return { id, name: id, display_name: id, parent: null, aliases: [], summary: "Test fixture only.", tags: [], search_context: "", content: "Test fixture, not canon." };
}
export function location(id: string, parent: string | null = null): LocationEntity {
  return { ...base(id), type: "location", parent, features: [], connections: [] };
}
export function character(id: string, at: string | null, role: "player" | "npc" = "npc"): CharacterEntity {
  return { ...base(id), type: "character", role, location: at, traits: [], relationships: [] };
}
export function document(entity: WorldEntity): WorldDocument {
  return { schema_version: 1, entity, chunks: [] };
}
export function fixtures(): { source: string; document: WorldDocument }[] {
  const entities: WorldEntity[] = [
    location("heartstone"), location("heartstone_l1", "heartstone"),
    location(room, "heartstone_l1"), location(kitchen, "heartstone_l1"),
    location(garden, "heartstone"),
    character("nicco", garden, "player"), character("brenna", room), character("maren", garden),
    { ...base("clan"), type: "faction", members: ["brenna"], territory: [garden], relations: [] },
    { ...base("bag"), type: "item", owner: "brenna", state: { open: true } },
    { ...base("coin"), type: "item", container: "bag", state: {} },
    { ...base("meeting"), type: "event", location: room, related_locations: [garden], characters: ["brenna", "maren"], participants: ["nicco", "brenna", "maren", "clan"], time: { world_minute: -10 }, importance: "minor" },
    { ...base("ritual"), type: "concept", related_entities: ["meeting"] },
    { ...base("history"), type: "world_lore", category: "history", related_entities: ["ritual"] },
  ];
  const sources = entities.map(entity => ({ source: `fixtures/${entity.id}.yaml`, document: document(entity) }));
  const brenna = sources.find(s => s.document.entity.id === "brenna")!.document;
  brenna.entity.knowledge = { visibility: { narrator: true, player: false }, known_by: ["brenna"] };
  brenna.chunks.push({ id: "brenna.overview", entity_id: "brenna", section: "overview", summary: "Test passage", search_context: "", content: "Fixture passage", tags: [], knowledge: { visibility: { narrator: true, player: true }, known_by: [] } });
  return sources;
}
export function find(sources: ReturnType<typeof fixtures>, id: string): WorldDocument {
  return sources.find(s => s.document.entity.id === id)!.document;
}
