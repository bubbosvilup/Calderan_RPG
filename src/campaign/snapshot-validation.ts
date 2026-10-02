import type { WorldStore } from "../world/world-store.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignSnapshot } from "./types.js";
import { CampaignIdentityResolver, type CampaignIdKind } from "./identity.js";
import { CampaignValidationError, fail, freezeSnapshot, parseCampaignSnapshot } from "./validation.js";
import { ageStatus } from "./age.js";
import { niccoHouseholdMembers, validateReflectionNotes } from "./premium-characters.js";

export class SnapshotValidationError extends CampaignValidationError {
  constructor(readonly code: "invalid_save" | "reference_invalid" | "unsupported_version", field: string) { super(field, code); this.name = "SnapshotValidationError"; }
}
export class DatasetCompatibilityError extends CampaignValidationError {
  readonly code = "dataset_mismatch";
  constructor(readonly save_dataset_id: string, readonly current_dataset_id: string) { super("dataset_id", "canonical dataset mismatch"); this.name = "DatasetCompatibilityError"; }
}
/** NPC+ Pass 1: the current snapshot schema is 2 (premium_characters). Older snapshots reach it only through save migration. */
export const CURRENT_SNAPSHOT_VERSION = 2;
export function requireCurrentSnapshotVersion(input: unknown): void {
  const descriptor = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "schema_version") : undefined;
  if (descriptor && "value" in descriptor && Number.isSafeInteger(descriptor.value) && descriptor.value !== CURRENT_SNAPSHOT_VERSION) throw new SnapshotValidationError("unsupported_version", "schema_version");
}
function unique<T>(records: readonly T[], key: (record: T) => string, field: string): void {
  const seen = new Set<string>();
  for (const record of records) { const id = key(record); if (seen.has(id)) fail(field, "duplicate identity"); seen.add(id); }
}
/** Entire graph checks; no command execution, initialization, defaults or historical replay. */
function validateReferences(s: CampaignSnapshot, world: WorldStore): void {
  const refs = new CampaignIdentityResolver(world, s), minute = s.runtime.scene.world_time.world_minute;
  const historical = (time: number | undefined, field: string) => { if (time !== undefined && time > minute) fail(field, "future provenance"); };
  const records = [...s.characters, ...s.items, ...s.households, ...s.facts, ...s.goals, ...s.scheduled_events, ...s.transactions];
  unique(records, r => r.id, "id");
  const emptyDomains = { characters: [], items: [], households: [], facts: [], knowledge: [], relationships: [], goals: [], scheduled_events: [], funds: [], legal_statuses: [], transactions: [], premium_characters: [], premium_reflections: [] };
  const registration = new CampaignIdentityResolver(world, emptyDomains);
  for (const c of s.characters) {
    registration.registration(c.id, c.origin, "character");
    if (c.origin.kind === "canonical" && c.current.current_location !== undefined) fail("current_location", "canonical location must live only in runtime");
    if (c.current.current_location !== undefined) refs.location(c.current.current_location);
    // Promotion Pass 1.1: origin snapshots belong to created characters, never to canon, and never postdate the snapshot.
    if (c.origin_snapshot) {
      if (c.origin.kind !== "created") fail("origin_snapshot", "only created characters carry a promotion origin");
      if (c.origin_snapshot.promoted_revision > s.revision) fail("origin_snapshot.promoted_revision", "promotion cannot postdate the snapshot");
      refs.location(c.origin_snapshot.location_id);
    }
  }
  for (const [list, kind] of [[s.households, "household"], [s.facts, "fact"], [s.goals, "goal"], [s.scheduled_events, "event"], [s.transactions, "transaction"]] as const) {
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
  // Household Pass 1 domains.
  for (const h of s.households) unique(h.rules ?? [], r => r.id, "household.rules");
  for (const e of s.relationships) if (e.dimensions?.romance && e.dimensions.romance !== "none" && (ageStatus(world, s, e.from_character_id) !== "adult" || ageStatus(world, s, e.to_character_id) !== "adult")) fail("relationship.romance", "romance requires two established adults");
  unique(s.funds, f => f.character_id, "funds");
  for (const f of s.funds) refs.character(f.character_id);
  unique(s.legal_statuses, l => l.character_id, "legal_statuses");
  for (const l of s.legal_statuses) {
    refs.character(l.character_id);
    if (l.status === "enslaved") { if (!l.holder_id || l.holder_id === l.character_id) fail("legal_statuses.holder_id", "enslaved person needs another legal holder"); refs.character(l.holder_id); }
    else if (l.holder_id !== undefined) fail("legal_statuses.holder_id", "free person has no holder");
    if (l.transfer?.from_holder_id !== undefined) refs.character(l.transfer.from_holder_id);
    if (l.transfer?.transaction_id !== undefined && !s.transactions.some(x => x.id === l.transfer!.transaction_id)) fail("legal_statuses.transfer", "unknown transaction");
  }
  for (const x of s.transactions) {
    for (const id of [x.subject_id, x.from_holder_id, x.to_holder_id, x.payer_id, x.payee_id]) if (id !== undefined) refs.character(id);
    // Pass 1.2: exactly one seller side — a campaign character, or an anonymous counterparty snapshot (sales only).
    if ((x.from_holder_id === undefined) === (x.from_counterparty === undefined)) fail("transactions.from_holder_id", "a transaction has exactly one seller side");
    if (x.from_counterparty) { if (x.kind !== "sale") fail("transactions.from_counterparty", "an anonymous counterparty can only sell"); refs.location(x.from_counterparty.location_id); }
    historical(x.world_minute, "transactions.world_minute"); if (x.revision > s.revision) fail("transactions.revision", "future transaction");
  }
  for (const g of s.goals) { refs.character(g.character_id); historical(g.created_at, "created_at"); if (g.target) refs.target(g.target); }
  for (const e of s.scheduled_events) e.participants?.forEach(id => refs.character(id));
  // NPC+ Pass 1: premium state belongs to real characters other than Nicco, is active exactly while they are a current member of a
  // household Nicco keeps (membership is the authority), and every such member has it.
  unique(s.premium_characters, p => p.character_id, "premium_characters");
  const members = niccoHouseholdMembers(s), householdIds = new Set(s.households.map(h => h.id));
  for (const p of s.premium_characters) {
    if (p.character_id === "nicco") fail("premium_characters", "Nicco is never NPC+");
    refs.character(p.character_id);
    if (p.metadata.active_household_member !== members.has(p.character_id)) fail("premium_characters.metadata.active_household_member", "must match household membership");
    if (p.metadata.created_revision > p.metadata.last_updated_revision || p.metadata.last_updated_revision > s.revision) fail("premium_characters.metadata", "invalid revisions");
    if (!p.dynamic.recent_developments.length) fail("premium_characters.dynamic.recent_developments", "lifecycle history required");
    for (const e of p.dynamic.recent_developments) {
      if ("household_id" in e && !householdIds.has(e.household_id)) fail("premium_characters.household_id", "unknown household");
      if (e.kind === "relationship_changed") { refs.character(e.actor_id); refs.character(e.other_id); }
      if (e.kind === "legal_status_changed" && e.holder_id !== undefined) refs.character(e.holder_id);
      if (e.kind === "person_transaction" && !s.transactions.some(t => t.id === e.transaction_id)) fail("premium_characters.transaction_id", "unknown transaction");
      if (e.kind === "moved") { if (e.from !== undefined) refs.location(e.from); if (e.to !== undefined) refs.location(e.to); }
      historical(e.world_minute, "premium_characters.world_minute"); if (e.revision > s.revision) fail("premium_characters.revision", "future history");
    }
    for (const c of p.stable.contract_evidence ?? []) if (c.revision > s.revision) fail("premium_characters.contract_evidence", "future contract");
    const r = p.dynamic.long_term;
    if (r) {
      if (r.first_revision > r.last_revision || r.last_revision > s.revision || !r.entries) fail("premium_characters.long_term", "invalid roll-up");
      for (const x of r.relationships) { refs.character(x.actor_id); refs.character(x.other_id); if (x.first_revision > x.last_revision || x.last_revision > s.revision) fail("premium_characters.long_term.relationships", "invalid revisions"); }
      unique(r.relationships, x => `${x.actor_id}>${x.other_id}:${x.dimension}`, "premium_characters.long_term.relationships");
      unique(r.conditions, x => x.condition, "premium_characters.long_term.conditions");
    }
    for (const f of p.dynamic.private_memory_refs) if (!factIds.has(f)) fail("premium_characters.private_memory_refs", "unknown fact");
  }
  for (const id of members.keys()) if (!s.premium_characters.some(p => p.character_id === id)) fail("premium_characters", "household member without premium state");
  // NPC+ Pass 6: reflection belongs to an NPC+, is bounded per kind, and cites only well-formed evidence handles of that character.
  unique(s.premium_reflections, r => r.character_id, "premium_reflections");
  for (const r of s.premium_reflections) {
    if (!s.premium_characters.some(p => p.character_id === r.character_id)) fail("premium_reflections", "reflection without NPC+ state");
    validateReflectionNotes(r.character_id, r.notes, s.revision);
    if (r.last_reflected_revision > s.revision) fail("premium_reflections.last_reflected_revision", "future reflection");
  }
}
export function validateCampaignSnapshot(input: unknown, world: WorldStore): DeepReadonly<CampaignSnapshot> {
  requireCurrentSnapshotVersion(input);
  let snapshot: CampaignSnapshot;
  try { snapshot = parseCampaignSnapshot(input); }
  catch (error) { throw new SnapshotValidationError("invalid_save", error instanceof CampaignValidationError ? error.field : "snapshot"); }
  if (!/^sha256:[a-f0-9]{64}$/.test(snapshot.dataset_id)) throw new SnapshotValidationError("invalid_save", "dataset_id");
  if (snapshot.dataset_id !== world.datasetId) throw new DatasetCompatibilityError(snapshot.dataset_id, world.datasetId);
  try { validateReferences(snapshot, world); }
  catch (error) { throw new SnapshotValidationError("reference_invalid", error instanceof CampaignValidationError ? error.field : "snapshot"); }
  return freezeSnapshot(snapshot);
}
