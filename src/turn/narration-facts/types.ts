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

export interface FactProvenance { readonly extractor: "movement" | "commerce"; readonly form: string }

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

// ------------------------------------------------------------------------------------------------ commerce (Block 10)
/** Every commerce fact remembers the exact piece of text (one sentence of one voice) it was read from, so a consumer can tie it to its own unit of text. */
interface CommerceBase<K extends string> extends NarrationFactBase<K> { readonly source_text: string }
/** Who is voicing the text: narrator prose, a character's speech (quoted, or a plain line of the RPG format), or the player's own input. */
export type TextVoice = "narration" | "speech" | "player_input";
/**
 * Who stands behind a stated price. seller_ask / seller_counter: a non-player voice states what it wants (a counter when the wording itself
 * bargains: "I'll go two-sixty", "make it", "last word"). player_counter: the player's own figure. ambiguous_quote: a number the
 * text states but no voice can be put behind.
 */
export type QuoteRole = "seller_ask" | "seller_counter" | "player_counter" | "ambiguous_quote";
/** What the number is: the current price, a past cost ("I paid four for her"), or a group / per-head price ("for the lot", "each"). */
export type QuoteKind = "current" | "past_cost" | "group_or_each";

/** A gold amount the text states as a price (never settlement). The fact subject is the SPEAKER when the text names or implies one. */
export interface PriceQuoteFact extends CommerceBase<"price_quote"> {
  readonly form: "gold_unit" | "for_price" | "bargain" | "addressed" | "price_noun" | "subject_is" | "quoted_bare" | "bare_sentence" | "past_cost";
  readonly amount: number; readonly currency: "gold";
  readonly quote_role: QuoteRole; readonly quote_kind: QuoteKind; readonly voice: TextVoice;
}
/** The text states money the engine does not settle (a non-gold currency, a fraction): no amount is reported. */
export interface UnsupportedMoneyFact extends CommerceBase<"unsupported_money"> { readonly form: "currency" | "fraction"; readonly voice: TextVoice }
/** A standing offer is taken back ("not for sale", "I changed my mind"). */
export interface OfferWithdrawnFact extends CommerceBase<"offer_withdrawn"> { readonly form: "withdrawal"; readonly voice: TextVoice }
/** The prose asserts that money changed hands. */
export interface PaymentClaimFact extends CommerceBase<"payment_claim"> { readonly form: "pay_verb" | "coin_motion" | "hands_changed"; readonly voice: TextVoice }
/** The prose asserts that goods or a person changed owner or holder, or that the papers are done. `object_phrase` is the words after a hand-over verb. */
export interface TransferClaimFact extends CommerceBase<"transfer_claim"> { readonly form: "goods_handover" | "belongs_to_player" | "yours" | "document"; readonly object_phrase?: string; readonly voice: TextVoice }
/** The prose asserts that the deal or sale itself is finished. */
export interface SettlementClaimFact extends CommerceBase<"settlement_claim"> { readonly form: "deal_done"; readonly voice: TextVoice }
export type CommerceFact = PriceQuoteFact | UnsupportedMoneyFact | OfferWithdrawnFact | PaymentClaimFact | TransferClaimFact | SettlementClaimFact;
export type CommerceFactKind = CommerceFact["kind"];

export interface NarrationFacts {
  readonly narration: string;
  readonly movement: readonly MovementFact[];
  /** Commerce facts of the narrator text (price quotes in any voice, withdrawals, payment / transfer / settlement CLAIMS). Descriptive only. */
  readonly commerce: readonly CommerceFact[];
}
