import type { RuntimeDomainSnapshot } from "../world/runtime-domain.js";
import type { SceneDelta } from "../types/scene.js";

export type CampaignOrigin = { kind: "canonical"; canonical_entity_id: string } | { kind: "created" };
export interface CharacterAppearance {
  height_cm?: number; weight_kg?: number; build?: string;
  hair?: { color?: string; texture?: string; description?: string };
  eyes?: string; skin?: string;
  scars?: { location?: string; description: string }[];
  distinguishing_marks?: string[]; distinctive_traits?: string[]; description?: string;
}
/** Missing values mean unestablished; canonical records store only explicit overrides. */
export interface CharacterProfile {
  name?: string; aliases?: string[];
  age?: { kind: "exact"; years: number } | { kind: "approximate"; description: string };
  sex?: string; gender?: string; species?: string; appearance?: CharacterAppearance; voice?: string;
}
export interface CharacterCurrentState {
  /** Created characters only. Canonical character locations remain in runtime. */
  current_location?: string;
  status?: "active" | "inactive" | "dead";
  conditions?: string[];
  presentation?: string;
  /** Occupied slots derive from items; absent unoccupied slots are unknown. */
  empty_slots?: string[];
}
export interface CampaignCharacter { id: string; origin: CampaignOrigin; profile: CharacterProfile; current: CharacterCurrentState }
export type ItemPosition =
  | { kind: "unknown" }
  | { kind: "carried"; character_id: string }
  | { kind: "equipped"; character_id: string; slot: string; mode: "worn" | "held" }
  | { kind: "stored"; location_id: string };
export interface ItemAcquisition {
  acquired_at?: number; acquisition_kind?: "gift" | "purchase" | "loot" | "found" | "created";
  from_character_id?: string; event_id?: string;
}
export interface CampaignItem {
  id: string; origin: CampaignOrigin; name?: string; description?: string;
  /** Omission: unknown. null: explicitly unowned. Independent of position. */
  owner_id?: string | null; position: ItemPosition; acquisition?: ItemAcquisition;
}
export interface HouseholdMembership { character_id: string; status: "guest" | "member" | "former_member"; joined_at?: number; role?: string }
export interface HouseholdState { id: string; name?: string; members: HouseholdMembership[] }
export type FactContent = { kind: "campaign"; statement: string; truth: "true" | "false" | "unknown" }
  | { kind: "canonical"; entity_id: string; chunk_id?: string };
export interface CampaignFact { id: string; content: FactContent }
export interface KnowledgeProvenance { learned_at?: number; source_character_id?: string; source_event_id?: string; acquisition_kind?: "witnessed" | "told" | "inferred" | "rumor" }
export interface CharacterKnowledge { character_id: string; fact_id: string; status: "knows" | "believes" | "suspects" | "heard_rumor"; provenance?: KnowledgeProvenance }
/** Directed and sparse; trust is not affection, obedience, attraction, consent or loyalty. */
export interface RelationshipState { from_character_id: string; to_character_id: string; trust: number; seed_context?: string }
export type GoalTarget = { kind: "canonical" | "character" | "item" | "event"; id: string };
export interface CharacterGoal { id: string; character_id: string; description: string; status: "active" | "completed" | "abandoned" | "failed"; created_at: number; target?: GoalTarget }
export interface ScheduledEvent { id: string; title: string; description?: string; scheduled_world_minute: number; status: "scheduled" | "triggered" | "completed" | "cancelled"; participants?: string[] }
export interface CampaignDomains {
  characters: CampaignCharacter[]; items: CampaignItem[]; households: HouseholdState[]; facts: CampaignFact[];
  knowledge: CharacterKnowledge[]; relationships: RelationshipState[]; goals: CharacterGoal[]; scheduled_events: ScheduledEvent[];
}
export interface CampaignSnapshot extends CampaignDomains {
  schema_version: 1; campaign_id: string; dataset_id: string; revision: number; runtime: RuntimeDomainSnapshot;
}
/** Commands are shared by future manual and model proposals, never raw mutable state. */
export type CampaignCommand =
  | { kind: "register_character"; character: CampaignCharacter }
  | { kind: "set_profile"; character_id: string; profile: CharacterProfile }
  | { kind: "set_condition"; character_id: string; conditions: string[]; presentation?: string; status?: NonNullable<CharacterCurrentState["status"]> }
  | { kind: "move_character"; character_id: string; location_id: string }
  | { kind: "set_slot_knowledge"; character_id: string; slot: string; state: "empty" | "unknown" }
  | { kind: "register_item"; item: CampaignItem }
  | { kind: "place_item"; item_id: string; position: ItemPosition }
  | { kind: "transfer_item"; item_id: string; owner_id: string | null; position: ItemPosition; acquisition?: ItemAcquisition }
  | { kind: "create_household"; id: string; name?: string }
  | { kind: "set_membership"; household_id: string; membership: HouseholdMembership }
  | { kind: "create_fact"; fact: CampaignFact }
  | { kind: "set_knowledge"; knowledge: CharacterKnowledge }
  | { kind: "seed_relationship"; relationship: RelationshipState }
  | { kind: "set_trust"; from_character_id: string; to_character_id: string; trust: number }
  | { kind: "create_goal"; id: string; character_id: string; description: string; target?: GoalTarget }
  | { kind: "set_goal_status"; goal_id: string; status: CharacterGoal["status"] }
  | { kind: "schedule_event"; id: string; title: string; description?: string; scheduled_world_minute: number; participants?: string[] }
  | { kind: "set_event_status"; event_id: string; status: ScheduledEvent["status"] }
  | { kind: "reschedule_event"; event_id: string; scheduled_world_minute: number }
  | { kind: "runtime_delta"; delta: SceneDelta };
export interface CampaignProposal { expected_revision: number; commands: CampaignCommand[] }
