import type { WorldStore } from "../world/world-store.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignSnapshot } from "./types.js";
import { CampaignIdentityResolver, type CampaignIdKind } from "./identity.js";
import { CampaignValidationError, fail, freezeSnapshot, parseCampaignSnapshot } from "./validation.js";

export class SnapshotValidationError extends CampaignValidationError {
  constructor(readonly code: "invalid_save" | "reference_invalid" | "unsupported_version", field: string) { super(field, code); this.name = "SnapshotValidationError"; }
}
export class DatasetCompatibilityError extends CampaignValidationError {
  readonly code = "dataset_mismatch";
  constructor(readonly save_dataset_id: string, readonly current_dataset_id: string) { super("dataset_id", "canonical dataset mismatch"); this.name = "DatasetCompatibilityError"; }
}
export function requireVersionOne(input: unknown): void {
  const descriptor = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "schema_version") : undefined;
  if (descriptor && "value" in descriptor && Number.isSafeInteger(descriptor.value) && descriptor.value !== 1) throw new SnapshotValidationError("unsupported_version", "schema_version");
}
function unique<T>(records: readonly T[], key: (record: T) => string, field: string): void {
  const seen = new Set<string>();
  for (const record of records) { const id = key(record); if (seen.has(id)) fail(field, "duplicate identity"); seen.add(id); }
}
/** Entire graph checks; no command execution, initialization, defaults or historical replay. */
function validateReferences(s: CampaignSnapshot, world: WorldStore): void {
  const refs = new CampaignIdentityResolver(world, s), minute = s.runtime.scene.world_time.world_minute;
  const historical = (time: number | undefined, field: string) => { if (time !== undefined && time > minute) fail(field, "future provenance"); };
  const records = [...s.characters, ...s.items, ...s.households, ...s.facts, ...s.goals, ...s.scheduled_events];
  unique(records, r => r.id, "id");
  const emptyDomains = { characters: [], items: [], households: [], facts: [], knowledge: [], relationships: [], goals: [], scheduled_events: [] };
  const registration = new CampaignIdentityResolver(world, emptyDomains);
  for (const c of s.characters) {
    registration.registration(c.id, c.origin, "character");
    if (c.origin.kind === "canonical" && c.current.current_location !== undefined) fail("current_location", "canonical location must live only in runtime");
    if (c.current.current_location !== undefined) refs.location(c.current.current_location);
  }
  for (const [list, kind] of [[s.households, "household"], [s.facts, "fact"], [s.goals, "goal"], [s.scheduled_events, "event"]] as const) {
    for (const r of list) registration.newId(r.id, kind as CampaignIdKind);
  }
  refs.location(s.runtime.scene.player_location);
  if (s.runtime.mana.current > s.runtime.mana.max) fail("mana", "current exceeds maximum");
  const nicco = world.getEntity("nicco");
  if (nicco && (nicco.type !== "character" || nicco.role !== "player")) fail("runtime", "invalid player identity");
  const npcs = new Set(world.getEntitiesByType("character").filter(c => c.role === "npc").map(c => c.id));
  if (world.getEntitiesByType("character").some(c => c.role === "player" && c.id !== "nicco")) fail("runtime", "unsupported player");
  unique(s.runtime.npc_locations, n => n.character_id, "npc_locations");
  for (const npc of world.getEntitiesByType("character").filter(c => c.role === "npc" && c.base_location !== null)) if (!s.runtime.npc_locations.some(n => n.character_id === npc.id)) fail("npc_locations", "must contain each canonical NPC with an established default exactly once");
  for (const n of s.runtime.npc_locations) { if (!npcs.has(n.character_id)) fail("npc_locations", "not a canonical NPC"); refs.location(n.current_location); }
  const occupied = new Set<string>();
  for (const item of s.items) {
    registration.registration(item.id, item.origin, "item");
    if (item.origin.kind === "created" && !item.name) fail("item.name", "created item requires a name");
    if (item.owner_id != null) refs.character(item.owner_id);
    const p = item.position;
    if (p.kind === "stored") refs.location(p.location_id);
    if (p.kind === "carried" || p.kind === "equipped") refs.character(p.character_id);
    if (p.kind === "equipped") {
      const key = `${p.character_id}:${p.slot}`;
      if (occupied.has(key)) fail("position.slot", "duplicate occupied slot"); occupied.add(key);
      if (s.characters.find(c => c.id === p.character_id)?.current.empty_slots?.includes(p.slot)) fail("position.slot", "occupied slot also marked empty");
    }
    if (item.acquisition) {
      historical(item.acquisition.acquired_at, "acquired_at");
      if (item.acquisition.from_character_id !== undefined) refs.character(item.acquisition.from_character_id);
      if (item.acquisition.event_id !== undefined) refs.event(item.acquisition.event_id);
    }
  }
  for (const h of s.households) {
    unique(h.members, m => m.character_id, "household.members");
    for (const m of h.members) { refs.character(m.character_id); historical(m.joined_at, "joined_at"); }
  }
  for (const f of s.facts) if (f.content.kind === "canonical") {
    refs.canonical(f.content.entity_id);
    if (f.content.chunk_id !== undefined && world.getChunk(f.content.chunk_id)?.entity_id !== f.content.entity_id) fail("fact.chunk_id", "chunk/entity mismatch");
  }
  const factIds = new Set(s.facts.map(f => f.id));
  unique(s.knowledge, k => `${k.character_id}:${k.fact_id}`, "knowledge");
  for (const k of s.knowledge) {
    refs.character(k.character_id); if (!factIds.has(k.fact_id)) fail("knowledge.fact_id", "unknown fact");
    if (k.provenance) {
      historical(k.provenance.learned_at, "learned_at");
      if (k.provenance.source_character_id !== undefined) refs.character(k.provenance.source_character_id);
      if (k.provenance.source_event_id !== undefined) refs.event(k.provenance.source_event_id);
    }
  }
  unique(s.relationships, e => `${e.from_character_id}:${e.to_character_id}`, "relationships");
  for (const e of s.relationships) { refs.character(e.from_character_id); refs.character(e.to_character_id); if (e.from_character_id === e.to_character_id) fail("relationship", "self-edge"); }
  for (const g of s.goals) { refs.character(g.character_id); historical(g.created_at, "created_at"); if (g.target) refs.target(g.target); }
  for (const e of s.scheduled_events) e.participants?.forEach(id => refs.character(id));
}
export function validateCampaignSnapshot(input: unknown, world: WorldStore): DeepReadonly<CampaignSnapshot> {
  requireVersionOne(input);
  let snapshot: CampaignSnapshot;
  try { snapshot = parseCampaignSnapshot(input); }
  catch (error) { throw new SnapshotValidationError("invalid_save", error instanceof CampaignValidationError ? error.field : "snapshot"); }
  if (!/^sha256:[a-f0-9]{64}$/.test(snapshot.dataset_id)) throw new SnapshotValidationError("invalid_save", "dataset_id");
  if (snapshot.dataset_id !== world.datasetId) throw new DatasetCompatibilityError(snapshot.dataset_id, world.datasetId);
  try { validateReferences(snapshot, world); }
  catch (error) { throw new SnapshotValidationError("reference_invalid", error instanceof CampaignValidationError ? error.field : "snapshot"); }
  return freezeSnapshot(snapshot);
}
