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
/** Promotion Pass 1.1: a background statement established in play, kept with who asserted it (never objective history by default). */
export interface EstablishedClaim { text: string; source: "narration" | "seller" | "self" | "other"; /** Pass 1.2: who said it, when a named speaker did. */ by?: string }
/**
 * Promotion Pass 1.1: immutable record of what play had established about a narrator-invented (ephemeral) person when they became
 * a persistent created character. Only established facts; anything absent is unknown, not hidden. No command edits it after
 * registration; later systems (e.g. NPC+ initialization) must not contradict it.
 */
export interface CharacterOriginSnapshot {
  source: "narrator_ephemeral";
  /**
   * Why the person became durable (Pass 1.2 model). Production-wired: `name_established` (a proper name was securely established)
   * and `purchase_unnamed_subject` (the one functional exception: an unnamed person the player acquired). `recruitment`, `custody`
   * and `rescue` are reserved for future explicit systems only. There are deliberately no importance or soft-signal triggers.
   */
  trigger: "name_established" | "purchase_unnamed_subject" | "recruitment" | "custody" | "rescue";
  promoted_revision: number; promoted_world_minute: number; location_id: string;
  /** How play referred to the person at promotion: an established name, or a description ("the girl") when no name was given. */
  label: string;
  /** The session-local scene reference the person had before promotion (a narrated name key or a scene participant ID). */
  ephemeral_ref?: string;
  established: {
    name?: string; sex?: string; age?: CharacterProfile["age"]; species?: string; role?: string;
    /** The person noun narration attached to them ("girl", "boy"), when established. */
    descriptor?: string;
    appearance?: string[]; condition?: string[]; background?: EstablishedClaim[];
  };
  /** Verbatim source sentences from delivered narration, bounded. */
  evidence: string[];
}
export interface CampaignCharacter { id: string; origin: CampaignOrigin; profile: CharacterProfile; current: CharacterCurrentState; origin_snapshot?: CharacterOriginSnapshot }
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
/** Household Pass 1: a campaign-authored household rule. Runtime fact, never authored canon. */
export interface HouseholdRule { id: string; text: string; created_revision: number; active: boolean }
export interface HouseholdState { id: string; name?: string; members: HouseholdMembership[]; rules?: HouseholdRule[] }
/** Household Pass 1: tracked money of a character, in gold. Characters without a record have no tracked purse. */
export interface FundsRecord { character_id: string; gold: number }
/** Whether a person transfer is backed by papers. "unestablished" means nobody established either way; never assume clean papers. */
export type TransferDocumentation = "documented" | "undocumented" | "unestablished";
export interface LegalTransferRecord { documentation: TransferDocumentation; from_holder_id?: string; transaction_id?: string; note?: string }
/**
 * Pass 1.2: an anonymous narrator-created transaction counterparty (e.g. "the whittler"). Transaction provenance only, never a
 * character: it is not simulated, has no ID and never appears among campaign characters.
 */
export interface CounterpartySnapshot { label: string; description?: string; location_id: string; authority_evidence: string[] }
/**
 * Household Pass 1: a person's legal status. A person is not an item: no inventory position, no equipment. Enslaved persons have
 * exactly one legal holder; free persons have none. Characters without a record have an unestablished legal status.
 */
export interface PersonLegalState { character_id: string; status: "free" | "enslaved"; holder_id?: string; transfer?: LegalTransferRecord }
export type PersonTransactionKind = "sale" | "gift" | "assignment" | "manumission";
/** Immutable ledger entry for an applied person transaction; its ID makes replay impossible. */
export interface PersonTransaction {
  /** Exactly one of `from_holder_id` (a campaign character) or `from_counterparty` (an anonymous seller, Pass 1.2). */
  id: string; kind: PersonTransactionKind; subject_id: string; from_holder_id?: string; from_counterparty?: CounterpartySnapshot; to_holder_id?: string;
  payer_id?: string; payee_id?: string; gold?: number; documentation: TransferDocumentation; world_minute: number; revision: number;
}
/** Household Pass 1: bounded qualitative relationship dimensions. "romance" requires two established adults. */
export const RELATIONSHIP_DIMENSIONS = ["trust", "wariness", "affection", "protectiveness", "respect", "fear", "hostility", "romance"] as const;
export type RelationshipDimension = (typeof RELATIONSHIP_DIMENSIONS)[number];
export const RELATIONSHIP_LEVELS = ["none", "low", "moderate", "high"] as const;
export type RelationshipLevel = (typeof RELATIONSHIP_LEVELS)[number];
export type FactContent = { kind: "campaign"; statement: string; truth: "true" | "false" | "unknown" }
  | { kind: "canonical"; entity_id: string; chunk_id?: string };
export interface CampaignFact { id: string; content: FactContent }
export interface KnowledgeProvenance { learned_at?: number; source_character_id?: string; source_event_id?: string; acquisition_kind?: "witnessed" | "told" | "inferred" | "rumor" }
export interface CharacterKnowledge { character_id: string; fact_id: string; status: "knows" | "believes" | "suspects" | "heard_rumor"; provenance?: KnowledgeProvenance }
/**
 * Directed and sparse; trust is not affection, obedience, attraction, consent or loyalty. `trust` is the legacy numeric seed
 * (-100..100); Household Pass 1 adds qualitative `dimensions`, which are what narration and play use.
 */
export interface RelationshipState { from_character_id: string; to_character_id: string; trust?: number; dimensions?: Partial<Record<RelationshipDimension, RelationshipLevel>>; seed_context?: string }
export type GoalTarget = { kind: "canonical" | "character" | "item" | "event"; id: string };
export interface CharacterGoal { id: string; character_id: string; description: string; status: "active" | "completed" | "abandoned" | "failed"; created_at: number; target?: GoalTarget }
export interface ScheduledEvent { id: string; title: string; description?: string; scheduled_world_minute: number; status: "scheduled" | "triggered" | "completed" | "cancelled"; participants?: string[] }
export interface CampaignDomains {
  characters: CampaignCharacter[]; items: CampaignItem[]; households: HouseholdState[]; facts: CampaignFact[];
  knowledge: CharacterKnowledge[]; relationships: RelationshipState[]; goals: CharacterGoal[]; scheduled_events: ScheduledEvent[];
  /** Household Pass 1 domains. */
  funds: FundsRecord[]; legal_statuses: PersonLegalState[]; transactions: PersonTransaction[];
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
  /** Runtime Continuity Repair 1: a present created (runtime) character leaves the current scene; the record is kept. */
  | { kind: "leave_scene"; character_id: string }
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
  | { kind: "runtime_delta"; delta: SceneDelta }
  // Household Pass 1: money, person legal status, atomic person transactions, household membership/rules, relationship deltas.
  | { kind: "set_funds"; character_id: string; gold: number }
  | { kind: "set_legal_status"; character_id: string; status: "free" | "enslaved"; holder_id?: string; documentation?: TransferDocumentation; note?: string }
  /**
   * Pass 1.2: exactly one of `from_holder_id` (the current legal holder) or `from_counterparty` (an anonymous seller: sale only, of a
   * person with no legal record; the coin leaves the tracked economy, so there is no payee).
   */
  | { kind: "transfer_person"; transaction_id: string; transaction_kind: "sale" | "gift" | "assignment"; character_id: string; from_holder_id?: string; from_counterparty?: CounterpartySnapshot; to_holder_id: string;
      payment?: { payer_id: string; payee_id?: string; gold: number }; documentation: TransferDocumentation; note?: string }
  | { kind: "manumit"; transaction_id: string; character_id: string; by_holder_id: string; documentation: TransferDocumentation; note?: string }
  | { kind: "join_household"; household_id: string; character_id: string }
  | { kind: "leave_household"; household_id: string; character_id: string }
  | { kind: "add_household_rule"; household_id: string; text: string }
  | { kind: "set_household_rule_active"; household_id: string; rule_id: string; active: boolean }
  | { kind: "adjust_relationship"; from_character_id: string; to_character_id: string; dimension: RelationshipDimension; direction: "raise" | "lower" };
export interface CampaignProposal { expected_revision: number; commands: CampaignCommand[] }
