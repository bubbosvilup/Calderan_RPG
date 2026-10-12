/**
 * NarrationFacts: the shared, DESCRIPTIVE reading of one narrator candidate.
 *
 * A fact says what the prose asserts (who, what kind of act, where, how sure the prose itself is). It never says whether that is
 * allowed, never mutates anything and is not a second Controller. Authorization and audit both read the SAME facts and each applies
 * its own policy on top:
 *
 *   Narrator candidate -> extraction -> facts -> { authorization policy, audit policy } -> CampaignState prepare/commit
 */

/**
 * How the prose presents the act.
 * - completed: stated as having happened in this scene (the only modality either policy may act on as "it happened")
 * - future: intended, planned, promised, modal or tomorrow ("she will follow", "about to leave")
 * - conditional: hypothetical or conditional ("if she follows", "whether he leaves")
 * - negated: denied or refused ("she does not follow", "refuses to leave")
 * - requested: someone is told or asked to do it ("Nicco tells her to follow"); speech about the act, not the act
 * - habitual: a tendency or another time ("usually follows him", "yesterday")
 * - oriented: begun, attempted, looked or turned toward, or questioned, but not done ("heads toward the door", "tries to leave")
 * - retracted: begun then withdrawn or stopped ("follows him, then stops", "follows - no, she stays")
 * - quoted: said inside dialogue; never narrator prose
 * - unrealised: any other cue the form's own not-done gate rejects
 */
export type FactModality = "completed" | "future" | "conditional" | "negated" | "requested" | "habitual" | "oriented" | "retracted" | "quoted" | "unrealised";

export type FactPolarity = "affirmed" | "negated";
export type FactConfidence = "high" | "medium" | "low";
/** none: the subject resolved to exactly one entity (or is deliberately the player). unresolved: nobody could be named. ambiguous: several could be. */
export type FactAmbiguity = "none" | "unresolved" | "ambiguous";

/** How the subject of a fact was tied to an entity. */
export type SubjectResolution = "name" | "pronoun" | "antecedent" | "descriptor" | "term" | "role" | "player" | "unresolved";

export interface FactEntityRef {
  /** The words in the prose ("Maren", "she", "the woman"). */
  readonly surface: string;
  /** Set only when exactly one entity fits; never guessed. */
  readonly entity_id?: string;
  readonly resolution: SubjectResolution;
  /** Every entity the surface could have meant (one when resolved, several when ambiguous, none when unresolved). */
  readonly candidates: readonly string[];
}

/** Offsets into the narration string the facts were extracted from: `narration.slice(start, end) === text`. */
export interface FactSpan { readonly sentence_index: number; /** Clause inside the sentence (0 when the form is sentence-wide). */ readonly clause_index: number; readonly start: number; readonly end: number; readonly text: string }

export interface FactProvenance { readonly extractor: "movement"; readonly form: string }

/** Another place in the prose a fact leans on (for example the door wording near a destination-less exit). */
export interface SupportingRef { readonly role: string; readonly text: string }

export interface NarrationFactBase<K extends string> {
  readonly kind: K;
  readonly span: FactSpan;
  /** The whole source sentence exactly as sentencesOf yields it (what audit redaction and evidence quotes use). */
  readonly sentence: string;
  readonly subject: FactEntityRef;
  readonly modality: FactModality;
  readonly polarity: FactPolarity;
  readonly confidence: FactConfidence;
  readonly ambiguity: FactAmbiguity;
  readonly provenance: FactProvenance;
  readonly supporting?: readonly SupportingRef[];
}

/** A destination exactly as the prose words it. Resolving it to a known place is policy, not a fact. */
export interface DestinationPhrase { readonly phrase: string }

export type MovementForm =
  | "walk_to" | "carried_to" | "led_to" | "held_arrival" | "walk_inside" | "bare_vertical"
  | "follow_verb" | "follow_steps" | "follow_below" | "arrive_into" | "descend" | "duck_below" | "descent_marked"
  | "exit_act" | "exit_stairs" | "exit_broad" | "exit_noun" | "exit_door_behind" | "exit_trace" | "exit_ephemeral"
  | "arrival_verb" | "player_go" | "player_arrive" | "player_leave" | "player_relative_arrival" | "stay_verb" | "presence_claim" | "location_claim";

/** A character, or the player, changed place toward a destination phrase and/or a vertical direction. */
export interface EntityMovedFact extends NarrationFactBase<"entity_moved"> {
  readonly form: "walk_to" | "walk_inside" | "bare_vertical" | "player_go";
  readonly destination?: DestinationPhrase;
  readonly direction?: "UP" | "DOWN";
  /** True for the walk-inside form, where "inside" means wherever the player is now. */
  readonly inside?: true;
}
/** Someone reached or entered a place: a destination phrase, or a bare arrival verb ("reaches the hall floor"). */
export interface EntityArrivedFact extends NarrationFactBase<"entity_arrived"> {
  readonly form: "arrive_into" | "descend" | "duck_below" | "descent_marked" | "arrival_verb" | "player_arrive" | "player_relative_arrival";
  readonly destination?: DestinationPhrase;
  /** The form only makes sense for a proven descent (the "descends the stairs" family). */
  readonly requires_descent: boolean;
}
/** Someone is stated to be here, or back here, after being narrated gone ("returns", "speaks from inside", "stands beside Nicco"). */
export interface EntityPresentFact extends NarrationFactBase<"entity_present"> {
  readonly form: "presence_claim" | "location_claim";
  /** location_claim only: the place wording exactly as the prose has it ("Heartstone", "the market"). */
  readonly location_phrase?: string;
  /** location_claim only: the ONE known concrete location the phrase resolves to. Absent = not resolvable (the claim is then never evidence). */
  readonly location_id?: string;
}
/** Someone left where they were: an exit act, a stairs exit, a door closing behind them, a departure noun, a physical trace. */
export interface EntityDepartedFact extends NarrationFactBase<"entity_departed"> {
  readonly form: "exit_act" | "exit_stairs" | "exit_broad" | "exit_noun" | "exit_door_behind" | "exit_trace" | "exit_ephemeral" | "player_leave";
  /** The place the exit names, when the prose names one ("leaves the inn"). */
  readonly destination?: DestinationPhrase;
  /** Vertical direction a stair exit states (undefined when it states none or both). */
  readonly direction?: "UP" | "DOWN" | undefined;
  /** The sentence mentions the stairs by word. */
  readonly stairs_mentioned: boolean;
  /** A conjoined "follows him" in the same sentence: the exit depends on the player moving. */
  readonly follows_player: boolean;
  /** Place wording found near a destination-less door exit (raw phrases, in order). */
  readonly door_places: readonly string[];
  /** Which subject-reading produced it: the scene reading (present people) or the claim reading (canonical, may be ambiguous). */
  readonly reading: "scene" | "claim";
}
/** Someone follows the player (the destination is the player's own, never stated). */
export interface EntityFollowedFact extends NarrationFactBase<"entity_followed"> {
  readonly form: "follow_verb" | "follow_steps" | "follow_below";
  /** The form only makes sense for a proven descent (the "comes down the stairs" family). */
  readonly requires_descent: boolean;
}
/** Someone stays where they are (stays, remains, waits, lingers, turns back). */
export interface EntityStayedFact extends NarrationFactBase<"entity_stayed"> { readonly form: "stay_verb" }
/** Someone is carried, led or held and so moves with the player. */
export interface EntityMovedWithPlayerFact extends NarrationFactBase<"entity_moved_with_player"> {
  readonly form: "carried_to" | "led_to" | "held_arrival";
  readonly destination?: DestinationPhrase;
}

export type MovementFact = EntityMovedFact | EntityArrivedFact | EntityPresentFact | EntityDepartedFact | EntityFollowedFact | EntityStayedFact | EntityMovedWithPlayerFact;
export type MovementFactKind = MovementFact["kind"];

export interface NarrationFacts {
  readonly narration: string;
  readonly movement: readonly MovementFact[];
}
