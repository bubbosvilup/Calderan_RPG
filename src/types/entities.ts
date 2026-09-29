/** Plain aliases aid authoring; syntax and reference targets need runtime validation. */
export type EntityId = string;
export type EntityType =
  | "location" | "character" | "event" | "faction"
  | "item" | "concept" | "world_lore";

/** Monotonic internal clock; world_minute must be a safe integer at runtime. */
export interface WorldTime { world_minute: number }

export type LifecycleState = "active" | "inactive" | "destroyed" | "dead" | "retired";

/**
 * Authored ordinary awareness (Phase 1P), a narrator-facing permission source for characters without explicit edges:
 * - public: an ordinary person in the society may plausibly know it (not "everyone knows it perfectly");
 * - local:<location_id>: an ordinary local of that location (by containment) may plausibly know it;
 * - specialized: ordinary people do not get it (trade, guild, court or advanced magical knowledge);
 * - private: never granted by public/local scope.
 * Omitted means unclassified: no ordinary-awareness permission. known_by and campaign edges are unaffected.
 */
export type KnowledgeAwareness = "public" | "specialized" | "private" | `local:${string}`;
export interface KnowledgeAccess {
  visibility: { narrator: boolean; player: boolean };
  known_by: EntityId[];
  awareness?: KnowledgeAwareness;
}

export interface BaseEntity {
  id: EntityId;
  type: EntityType;
  name: string;
  display_name: string;
  parent: EntityId | null;
  aliases: string[];
  summary: string;
  tags: string[];
  search_context: string;
  /** Brief introduction; extended passages belong to knowledge chunks. */
  content: string;
  /** Baseline only; gameplay transitions belong to runtime state. */
  lifecycle?: LifecycleState;
  /** Omission requires classification before runtime use. */
  knowledge?: KnowledgeAccess;
}

export interface LocationEntity extends BaseEntity {
  type: "location";
  features: Array<{ name: string; description: string }>;
  /** Directed traversable edges; hierarchy alone does not imply access. */
  connections: Array<{ target: EntityId; description: string }>;
}

export interface CharacterEntity extends BaseEntity {
  type: "character";
  role: "player" | "npc";
  /** Authored starting location, not live gameplay authority. */
  location?: EntityId | null;
  /** New authored association/default; mutually exclusive with legacy location. Never live state. */
  base_location?: EntityId | null;
  work_location?: EntityId | null;
  home_location?: EntityId | null;
  species?: string | null;
  sex?: "male" | "female" | "intersex" | null;
  age_band?: string | null;
  appearance?: string | null;
  /** Public occupational role; role above remains engine player/npc classification. */
  occupation?: string | null;
  /** Narrator portrayal only, never public knowledge or a runtime goal. */
  purpose?: string | null;
  morality?: string | null;
  private_notes?: string;
  affiliations?: EntityId[];
  traits: string[];
  relationships: Array<{
    target: EntityId;
    kind: string;
    description: string;
  }>;
}

export interface EventEntity extends BaseEntity {
  type: "event";
  location: EntityId | null;
  related_locations?: EntityId[];
  /** Selective NPC retrieval anchors, generally excluding the player. */
  characters: EntityId[];
  /** All known participants, including the player when applicable. */
  participants: EntityId[];
  time: WorldTime | null;
  importance: "minor" | "significant" | "major";
}

export interface FactionEntity extends BaseEntity {
  type: "faction";
  members: EntityId[];
  territory: EntityId[];
  relations: Array<{ target: EntityId; kind: string; description: string }>;
}

/** Exactly one authoritative primary placement. */
export type ItemPlacement =
  | { owner: EntityId; location?: never; container?: never }
  | { location: EntityId; owner?: never; container?: never }
  | { container: EntityId; owner?: never; location?: never };

export type ItemEntity = BaseEntity & ItemPlacement & {
  type: "item";
  /** Authored initial state; runtime consequences are stored separately. */
  state: Record<string, string | number | boolean | null>;
};

export interface ConceptEntity extends BaseEntity {
  type: "concept";
  related_entities: EntityId[];
}

export interface WorldLoreEntity extends BaseEntity {
  type: "world_lore";
  category: "fundamentals" | "history" | "cultures" | "races" | "magic" | "religion";
  related_entities: EntityId[];
}

export type WorldEntity =
  | LocationEntity | CharacterEntity | EventEntity | FactionEntity
  | ItemEntity | ConceptEntity | WorldLoreEntity;
