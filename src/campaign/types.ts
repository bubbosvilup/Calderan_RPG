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
/**
 * NPC+ premium development history. Each entry is a STRUCTURED record of a committed authoritative change involving that character,
 * derived by diffing the domains a revision changed (NPC+ Pass 2). History, never current truth: the owning domain stays
 * authoritative and wins on any difference. Never generated prose.
 */
type Stamp = { revision: number; world_minute: number };
export type PremiumHistoryEntry = Stamp & (
  | { kind: "joined_household" | "left_household" | "rejoined_household" | "migrated_member"; household_id: string }
  | { kind: "relationship_changed"; actor_id: string; other_id: string; dimension: RelationshipDimension; from: RelationshipLevel; to: RelationshipLevel }
  | { kind: "condition_added" | "condition_removed"; condition: string }
  | { kind: "legal_status_changed"; from: "free" | "enslaved" | "unestablished"; to: "free" | "enslaved" | "unestablished"; holder_id?: string }
  | { kind: "person_transaction"; transaction_id: string; transaction_kind: PersonTransactionKind }
  | { kind: "household_rule_added"; household_id: string; rule_id: string }
  | { kind: "moved"; from?: string; to?: string }
  | { kind: "contract_established"; field: PremiumContractField }
);
/**
 * NPC+ Pass 3: consolidated history. Developments leaving the recent window are FOLDED into these bounded counters; nothing is
 * interpreted, summarized or inferred, and no current value is implied (the owning domain stays the truth). Row tables are capped:
 * when full, the least recently changed row is evicted into the matching `other_*` counter (deterministic).
 */
export interface PremiumRollup {
  first_revision: number; last_revision: number; entries: number;
  lifecycle: { joined: number; left: number; rejoined: number; migrated: number };
  relationships: { actor_id: string; other_id: string; dimension: RelationshipDimension; raises: number; lowers: number; first_revision: number; last_revision: number }[];
  other_relationship_changes: number;
  conditions: { condition: string; added: number; removed: number; last_revision: number }[];
  other_condition_changes: number;
  legal_changes: number;
  transactions: { sale: number; gift: number; assignment: number; manumission: number };
  moves: number; rules_added: number; contracts: number;
}
/** NPC+ Pass 2: the stable contract fields that explicit evidence may establish (moral boundaries accumulate; the rest are set once). */
export type PremiumContractField = "personality" | "voice" | "moral_boundary" | "social_style";
/** NPC+ Pass 2: where a campaign contract came from (the verbatim self-description and the revision it committed in). */
export interface PremiumContractEvidence { field: PremiumContractField; revision: number; quote: string }
/** Small observable cue; the owning NPC+ record supplies character_id. No psychological inference or scores. */
export interface MannerismDefinition {
  canonical_key: string; text: string;
  requires_item_id?: string; requires_entity_id?: string;
}
export type MannerismEpistemicState = "emergent" | "observed" | "established";
export interface CharacterMannerism extends MannerismDefinition {
  id: string; source: "seeded" | "emergent" | "user"; created_revision: number; user_edited: boolean;
  /** Optional on legacy saves; conservative effective defaults are derived without fabricating history. */
  epistemic_state?: MannerismEpistemicState; known_by_character_ids?: string[];
}
/**
 * NPC+ Pass 1: persistent premium character state, keyed by character ID. A character is NPC+ because they are, or have been, a
 * member of a household Nicco keeps; origin (authored or created) is irrelevant and Nicco never is. It REFERENCES the authoritative
 * domains and never shadows them: legal status, location, membership (including its `role`), relationships, conditions, inventory
 * and canon biography stay where they are. Absent fields are unknown — never inferred from name, sex, species, profession or looks.
 */
export interface PremiumCharacterState {
  character_id: string;
  /** Additive optional schema-3 field: absent in older saves means zero slots; never seeded during restore. */
  mannerisms?: CharacterMannerism[];
  /** Campaign-established contracts only (overrides of canon). Pass 1 writes none: authored canon is rendered from canon itself. */
  stable: { personality_contract?: string; voice_contract?: string; moral_boundaries?: string[]; baseline_social_style?: string; contract_evidence?: PremiumContractEvidence[] };
  dynamic: {
    /** Bounded structured developments, newest last (lifecycle events in Pass 1). */
    recent_developments: PremiumHistoryEntry[];
    /** NPC+ Pass 3: deterministic structured roll-up of developments that left the recent window (counts only; never prose). */
    long_term?: PremiumRollup;
    /** Campaign memory references (fact IDs) curated for this character; derived recovery never requires them. */
    private_memory_refs: string[];
  };
  metadata: {
    created_revision: number; last_updated_revision: number;
    /** Lifecycle marker, validated against household membership (the authority): true exactly while a current member. */
    active_household_member: boolean;
    initial_mannerism?: "seeded" | "candidate" | "seed_pool_exhausted";
  };
}
/**
 * NPC+ Pass 6: reflection is INTERPRETATION, never authority. Each note cites existing evidence handles (developments, roll-ups,
 * contract evidence, public canon, relationship state); no domain is ever changed by it, and current authoritative state always wins.
 */
export type ReflectionKind = "stance" | "signature_pattern" | "shared_motif" | "emerging_role" | "unresolved_tension";
export interface ReflectionNote {
  id: string; kind: ReflectionKind;
  /** Short snake_case token for compact rendering ("cautious_trust"). */
  label: string;
  text: string; evidence_refs: string[]; confidence: "low" | "medium" | "high";
  created_revision: number; updated_revision: number;
}
export interface PremiumReflection { character_id: string; notes: ReflectionNote[]; last_reflected_revision: number }
export interface CampaignDomains {
  characters: CampaignCharacter[]; items: CampaignItem[]; households: HouseholdState[]; facts: CampaignFact[];
  knowledge: CharacterKnowledge[]; relationships: RelationshipState[]; goals: CharacterGoal[]; scheduled_events: ScheduledEvent[];
  /** Household Pass 1 domains. */
  funds: FundsRecord[]; legal_statuses: PersonLegalState[]; transactions: PersonTransaction[];
  /** NPC+ Pass 1 domain (snapshot schema 2). */
  premium_characters: PremiumCharacterState[];
  /** NPC+ Pass 6 domain (snapshot schema 2): non-authoritative, evidence-cited reflection notes. */
  premium_reflections: PremiumReflection[];
}
export interface CampaignSnapshot extends CampaignDomains {
  schema_version: 3; campaign_id: string; dataset_id: string; revision: number; runtime: RuntimeDomainSnapshot;
  /** Bounded derived evidence only; never narrator/controller context. Optional additive persistence extension. */
  mannerism_learning?: MannerismLearning;
}
export interface MannerismEvidence {
  sequence: number; revision: number; event_id: string; narration_hash: string; span_start: number; span_end: number;
}
export interface MannerismCandidate extends MannerismDefinition {
  id: string; character_id: string; action: import("./mannerism-concepts.js").MannerismAction; trigger: import("./mannerism-concepts.js").MannerismTrigger;
  evidence: MannerismEvidence[]; first_observed_sequence: number; last_observed_sequence: number;
}
export interface MannerismFinalizedSource {
  sequence: number; revision: number; event_id: string; narration_hash: string; narration_length: number;
  character_ids: string[]; available_items: { character_id: string; item_id: string; worn: boolean }[];
}
export interface MannerismLearning {
  sequence: number; processed_sequence: number; last_turn_id: string;
  journal: MannerismFinalizedSource[]; candidates: MannerismCandidate[];
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
  | { kind: "adjust_relationship"; from_character_id: string; to_character_id: string; dimension: RelationshipDimension; direction: "raise" | "lower" }
  /** NPC+ Pass 2: an active NPC+'s explicit self-description becomes a campaign contract (set-once fields; moral boundaries accumulate). */
  | { kind: "establish_character_contract"; character_id: string; field: PremiumContractField; text: string; quote: string }
  /** NPC+ Pass 6: replace one active NPC+'s validated reflection notes (interpretation only; never touches another domain). */
  | { kind: "record_reflection"; character_id: string; notes: ReflectionNote[]; reflected_revision: number };
export interface CampaignProposal { expected_revision: number; commands: CampaignCommand[] }
