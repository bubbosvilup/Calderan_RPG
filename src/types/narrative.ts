import type { EntityId, WorldTime } from "./entities.js";
import type { PlayerMana, SceneDelta } from "./scene.js";

/** Every projected entity is narrator-visible. secret mirrors !visibility.player. */
export interface NarrativeEntitySummary {
  readonly id: EntityId;
  readonly name: string;
  readonly display_name: string;
  readonly summary: string;
  readonly secret: boolean;
}

export type NarrativeLocationSummary = NarrativeEntitySummary;

export interface NarrativeLocation extends NarrativeLocationSummary {
  readonly content: string;
  readonly features: readonly { readonly name: string; readonly description: string }[];
}

export interface NarrativeCharacter extends NarrativeEntitySummary {
  readonly portrayal?: ReturnType<typeof import("../world/character-contract.js").characterPortrayal>;
  readonly appearance?: string;
  readonly content: string;
  readonly traits: readonly string[];
}

/** Primary context only; never contains raw canon, chunks, or internal SceneRam. */
export interface NarrativeContext {
  readonly runtime_revision: number;
  readonly scene: {
    /** null when the current location is explicitly hidden from the narrator. */
    readonly player_location: NarrativeLocation | null;
    readonly location_ancestry: readonly NarrativeLocationSummary[];
    readonly world_time: Readonly<WorldTime>;
    readonly player_resources: { readonly mana: PlayerMana };
    readonly present_characters: readonly NarrativeCharacter[];
  };
}

export interface NarratorTurnInput {
  readonly context: NarrativeContext;
  readonly user_message: string;
}

/** Proposed changes still require SceneDelta validation; text never mutates state. */
export interface NarratorTurnOutput {
  readonly text: string;
  readonly scene_delta?: SceneDelta;
}

export interface Narrator {
  narrate(input: NarratorTurnInput): NarratorTurnOutput | Promise<NarratorTurnOutput>;
}
