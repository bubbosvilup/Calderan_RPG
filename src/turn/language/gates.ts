import { COERCION, CONDITIONAL, EPISTEMIC, HABITUAL, INSTRUCTION, INTENT, MODAL, NEGATION, NEGATIVE_CONTRACTION, OBSERVATION, RECOLLECTION, REFUSAL, RETRACTION, TEMPORAL, TYPED_NEGATIVE_CONTRACTION, cueGate } from "./cues.js";

/**
 * Hardening H1: the policy table of every deterministic "not a completed / asserted act" gate. One entry per call site; each was
 * rebuilt from exactly the cue set of its pre-H1 local regex and is held to that verdict table by tests/language-gates.test.ts
 * (verbatim legacy copies). Gates differ ON PURPOSE — see the locked matrix in that test before changing any entry.
 *
 * Intended verdict changes in H1 (each locked by tests):
 *  1. `disqualify`, `departure_not_done`, `grounding_hedged`, `audit_negated` take the shared NEGATION.no, so "no hesitation" /
 *     "no warning" / "no word" no longer read as negation (player_event_negated already did).
 *  2. `disqualify` scopes RETRACTION.hesitate so "no hesitation" / "without hesitation" are not a hesitation.
 *  3. `disqualify` gains DISQUALIFY_FAILSAFE: the H1 adversarial suite found the firewall AUTHORIZED transfers from "attempts to
 *     take", "seems to take", "probably takes". Fail-safe precedence: these only ever remove an authorization, never add state.
 */
const { not, never, nor, cannot, no, noLonger, notYet, noOne, nobody, without, doesNot } = NEGATION;
const { would, could, should, might, may, can, will, shall, wouldLikeTo } = MODAL;
const C = CONDITIONAL, E = EPISTEMIC, I = INTENT, O = OBSERVATION, T = TEMPORAL, N = NEGATIVE_CONTRACTION, TN = TYPED_NEGATIVE_CONTRACTION, R = RECOLLECTION;

/** H1 change 3: attempted, reached-for and epistemically hedged acts, act-scoped so ordinary prose ("seems pleased") is unaffected. */
export const DISQUALIFY_FAILSAFE = Object.freeze([I.attemptsTo, I.attemptedTo, I.tryingTo, I.reachesFor, I.reachingFor, E.seemsTo, E.seemedTo, E.probably,
  E.possibly]);

export const GATES = Object.freeze({
  /** evidence-authorization.ts — the authorization firewall: richest veto; refusal, retraction and instruction frames included. */
  disqualify: cueGate({ cues: [not, never, no, nor, cannot, E.maybe, E.perhaps, might, could, would, should, can, will, shall, may, C.if, C.unless, C.whether,
    I.almost, I.nearly, E.imagineAny, I.considerAny, I.pretendAny, C.supposeAny, ...Object.values(REFUSAL), ...Object.values(RETRACTION), INSTRUCTION.toldTo,
    I.wantsTo, I.wantedTo, I.aboutTo, I.goingTo, I.intendsTo, I.plansTo, I.startsTo, I.startedTo, I.beginsTo, I.beganTo, I.triesTo, I.triedTo,
    ...DISQUALIFY_FAILSAFE], contraction: true, future: true, question: true }),
  /** evidence-authorization.ts — clause-scoped transfer receipts: any refusal word still vetoes the whole sentence. */
  refusal: cueGate({ cues: Object.values(REFUSAL) }),
  /** character-movement.ts — narrated character movement and player carry: plans, looks and orientation are not movement. */
  movement_not_done: cueGate({ cues: [could, would, should, might, may, can, will, N.wont, shall, I.plans, I.planning, I.planned, I.intends, I.wants, I.wanted, I.goingTo,
    I.aboutTo, I.readyTo, I.triesTo, I.triedTo, T.later, T.someday, E.maybe, E.perhaps, C.if, C.unless, C.whether, O.toward, O.towards, O.looks, O.looked, O.looking,
    O.glances, O.glanced, O.stares, E.imagines, I.thinks, I.promises, I.saysHell, not, never, noLonger], contraction: true, question: true }),
  /** scene-departure.ts — completed exits: threats, starts, orientation and instruction-to-leave are not departures. */
  departure_not_done: cueGate({ cues: [not, never, no, nor, N.wont, will, would, could, should, might, may, can, cannot, C.if, C.unless, C.until, C.whether, I.threaten,
    I.aboutTo, I.goingTo, I.readyTo, I.startsTo, I.startedTo, I.beginsTo, I.beganTo, I.triesTo, I.triedTo, I.wantsTo, I.wantedTo, I.meansTo, I.intendsTo, I.almost,
    I.nearly, O.toward, O.towards, O.forTheDoor, O.toGo, E.asIf, E.asThough], contraction: true, question: true }),
  /** grounding-audit.ts — a guessed, questioned, denied or conditional prior-event claim is not an assertion. */
  grounding_hedged: cueGate({ cues: [C.if, would, could, might, E.maybe, E.perhaps, C.suppose, C.unless, C.whether, not, never, no, N.havent, N.hasnt, N.didnt, N.dont, N.wont],
    contraction: true, question: true }),
  /** household-evidence.ts — a household join/leave must be a present, unconditional choice ("for now", "tonight" are not). */
  household_not_a_choice: cueGate({ cues: [C.if, E.maybe, E.perhaps, would, could, might, not, never, "don'?t know", T.forNow, T.tonight, T.forAWhile, C.until, T.someday, T.oneDay],
    question: true }),
  /** household-evidence.ts — relationship evidence: hedged, pretended or attempted behaviour is not evidence. */
  relationship_hedged: cueGate({ cues: [C.if, E.maybe, E.perhaps, would, could, might, I.almost, I.nearly, I.pretendAny, I.aboutTo, I.wantsTo, I.triesTo], question: true }),
  /** narrated-captives.ts — promotion facts: descriptive uncertainty and approximation only (negation is a fact, not a hedge). */
  captive_fact_hedge: cueGate({ cues: [E.maybe, E.perhaps, E.probably, E.possibly, might, E.seems, E.seemed, E.asIf, E.impossibleToTell, E.hardToTell, E.orSo, E.orLess, E.orMore, E.guess] }),
  /** narration-audit.ts — conditions/constraints narrated on someone: negated or unrealised claims are not established. */
  audit_negated: cueGate({ cues: [not, never, no, nor, without, I.almost, I.nearly, would, could, might, will, C.if], contraction: true }),
  /** narration-audit.ts citesSource — a denial or condition in the 28 characters before a cited rumour source. */
  audit_source_denial: cueGate({ cues: [C.if, C.whether, not, never, noOne, nobody, N.havent, N.hasnt, N.dont, N.didnt, N.wont, N.cant, nor, without], contraction: "at_end" }),
  /** narration-audit.ts — hypothetical frames inside dialogue that would otherwise presuppose a completed gift. */
  audit_hypothetical: cueGate({ cues: [C.if, would, could, C.suppose, E.imagine, C.wereTo, C.unless, might] }),
  /** narration-audit.ts — household-membership and purchase claims: denied, conditional or questioned claims are not asserted. */
  audit_denied: cueGate({ cues: [not, never, noLonger, notYet, N.isnt, N.wasnt, N.wont, C.if, C.whether, would, might, could, E.maybe], contraction: true, question: true }),
  /** natural-actions.ts — player-typed natural actions: wanting, trying, imagining or past/future framing is not this turn's act. */
  natural_action_hedge: cueGate({ cues: [I.almost, I.nearly, I.pretends, I.pretending, I.considers, I.considering, I.thinksAbout, I.wantsTo, I.wantingTo, wouldLikeTo, I.plansTo,
    I.aboutTo, I.triesTo, I.tryingTo, I.startsTo, I.beginsTo, I.reachesFor, I.reachingFor, E.imagines, I.dreamsOf, TN.doesnt, doesNot, TN.didnt, never, TN.wont, will, would,
    could, might, should, C.if, T.someday, E.maybe, T.yesterday, T.earlier] }),
  /**
   * player-intent.ts (H5.1) — unmarked first-person player movement ("I go down to the hall"): negation, modality, intention, plans,
   * hypotheticals, questions and other-day framing are not this turn's movement. A new gate (no pre-H1 legacy): typed contractions
   * ("dont"), "n't" and future "'ll" included because it reads player-typed text.
   */
  player_movement_not_done: cueGate({ cues: [not, never, nor, cannot, TN.dont, TN.doesnt, TN.didnt, TN.wont, would, could, should, might, may, can, will, shall, wouldLikeTo,
    I.almost, I.nearly, I.pretends, I.pretending, I.considers, I.considering, I.thinksAbout, I.thinking, I.wantsTo, I.wantingTo, I.plansTo, I.plans, I.planning, I.intendsTo,
    I.aboutTo, I.goingTo, I.triesTo, I.tryingTo, I.startsTo, I.beginsTo, I.dreamsOf, E.imagines, E.maybe, E.perhaps, C.if, C.unless, C.whether, C.suppose,
    T.someday, T.oneDay, T.later, T.tomorrow, T.tonight, T.yesterday, T.earlier], contraction: true, future: true, question: true }),
  /**
   * scene-participation.ts (NPC+ Pass 4) — an absent character's act in a clause is NOT current participation when it is negated,
   * hypothetical, imagined, remembered, attributed ("according to") or habitual-past ("used to"). Tested on the clause up to the act.
   */
  absent_reference: cueGate({ cues: [not, never, no, nor, without, cannot, I.almost, I.nearly, would, could, might, C.if, C.unless, C.wereTo, C.suppose, E.imagine, E.imagines,
    R.remember, R.recall, R.accordingTo, R.usedTo, R.thinksOf], contraction: true }),
  /** scene-participation.ts (NPC+ Pass 4) — words right after the act that place it in an earlier time ("said yesterday", "two days ago"). */
  past_displacement: cueGate({ cues: [T.yesterday, T.earlier, T.ago, T.lastNight] }),
  /**
   * character-movement.ts (NPC+ Pass 9) — implicit-destination following ("Maren follows him"), tested on the whole clause. The
   * movement_not_done cues minus `later` ("a moment later, Maren follows" is this turn), plus almost/nearly, refusal, recollection and
   * other-day framing: a follow resolved to Nicco's same-turn arrival must be a completed act of this turn. Pass 10 adds HABITUAL cues
   * ("usually follows him" is a tendency; the adverb slot of the follow grammar accepted any -ly word).
   */
  follow_not_done: cueGate({ cues: [could, would, should, might, may, can, will, N.wont, shall, I.plans, I.planning, I.planned, I.intends, I.wants, I.wanted, I.goingTo,
    I.aboutTo, I.readyTo, I.triesTo, I.triedTo, T.someday, E.maybe, E.perhaps, C.if, C.unless, C.whether, O.toward, O.towards, O.looks, O.looked, O.looking,
    O.glances, O.glanced, O.stares, E.imagines, I.thinks, I.promises, I.saysHell, not, never, noLonger, I.almost, I.nearly, ...Object.values(REFUSAL),
    T.yesterday, T.earlier, T.ago, T.lastNight, T.tomorrow, R.remember, R.recall, R.usedTo, ...Object.values(HABITUAL)], contraction: true, question: true }),
  /**
   * follow-invitation.ts (NPC+ Pass 9) — a player sentence that is NOT an invitation to come along: negated, conditional, imagined,
   * remembered, other-day, threatening or coercive. Modal requests ("would you come with me?") and questions remain invitations. Pass 10:
   * it reads player-TYPED text, so apostrophe-less "dont / doesnt / didnt / wont" veto like their apostrophed forms ("Maren, dont come with me").
   */
  invitation_not_offered: cueGate({ cues: [not, never, C.if, C.unless, C.wereTo, C.supposeAny, E.imagineAny, T.yesterday, T.earlier, T.ago, T.lastNight, T.tomorrow,
    T.someday, T.oneDay, R.remember, R.recall, R.usedTo, I.threaten, ...Object.values(COERCION), TN.dont, TN.doesnt, TN.didnt, TN.wont], contraction: true }),
  /** person-transactions.ts — a purchase acceptance must be unhedged; price questions and deliberation are not acceptance. */
  transaction_hedge: cueGate({ cues: [C.if, E.maybe, E.perhaps, would, could, should, might, not, never, TN.dont, TN.wont, "how much", "let me (?:look|see|think)", I.thinking, I.considerAny],
    question: true }),
  /** player-authored-events.ts — player-authored physical events: threatened, attempted or reached-for contact did not happen. */
  player_event_negated: cueGate({ cues: [not, never, no, nor, I.almost, I.nearly, I.pretends, I.pretending, I.threaten, I.triesTo, I.triedTo, I.tryingTo, I.attemptsTo, I.wantsTo,
    I.wantedTo, I.aboutTo, I.goingTo, I.startsTo, I.startedTo, I.beginsTo, I.reachesFor, would, could, might, will, should, C.if, C.unless, without], contraction: true }),
});
export type GateId = keyof typeof GATES;
