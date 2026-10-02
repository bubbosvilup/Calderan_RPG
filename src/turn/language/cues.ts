/**
 * Hardening H1: the shared lexical cue vocabulary. Each entry is a regex fragment matched as a whole word inside `\b(?:…)\b`.
 *
 * Shared lexical interpretation + caller-specific policy: this file says what a cue IS (which words express negation, refusal,
 * uncertainty…); gates.ts says which cues each classifier treats as "not a completed, asserted act". Categories are kept apart on
 * purpose — refusal is not negation, an epistemic hedge ("probably") is not an attempt ("tries to") — so a gate opts into each
 * concept explicitly instead of inheriting a universal veto. Adding a word here changes no gate until a gate lists it.
 */

/** A. Negation of the act itself. */
export const NEGATION = Object.freeze({
  not: "not", never: "never", nor: "nor", cannot: "cannot", doesNot: "does not",
  /** H1 (intended fix): "no hesitation", "no warning", "no word" describe HOW an act happens; they do not negate it. */
  no: "no(?! (?:warning|hesitation|word))",
  noLonger: "no longer", notYet: "not yet", noOne: "no one", nobody: "nobody", without: "without",
});
/** Negative contractions as written in narration (apostrophe required). Gates using the `n't` marker do not need these. */
export const NEGATIVE_CONTRACTION = Object.freeze({
  wont: "won't", dont: "don't", didnt: "didn't", havent: "haven't", hasnt: "hasn't", isnt: "isn't", wasnt: "wasn't", cant: "can't",
});
/** Negative contractions as a player may TYPE them (apostrophe optional: "dont", "wont"). Player-input classifiers only. */
export const TYPED_NEGATIVE_CONTRACTION = Object.freeze({ doesnt: "doesn'?t", didnt: "didn'?t", dont: "don'?t", wont: "won'?t" });

/** B1. Refusal: the act is declined. */
export const REFUSAL = Object.freeze({ refuse: "refus\\w*", decline: "declin\\w*", reject: "reject\\w*" });
/** B2. Retraction / interruption: the act is begun, then withdrawn, stopped or reversed. */
export const RETRACTION = Object.freeze({
  instead: "instead", stepBack: "steps? back", steppedBack: "stepped back", steppingBack: "stepping back",
  backAway: "backs? away", backedAway: "backed away", backingAway: "backing away", drawBack: "draws? back", drewBack: "drew back",
  pullBack: "pulls? back", pulledBack: "pulled back",
  givesBack: "(?:hands?|handed|gives?|gave|pushes?|pushed|returns?|returned|holds?|held)(?: \\w+){0,4} back",
  stop: "stops?", stopped: "stopped",
  /** H1 (intended fix): hesitating retracts an act; "no hesitation" / "without hesitation" asserts the opposite. */
  hesitate: "(?<!\\b(?:no|without) )hesitat\\w*",
  thinksBetter: "thinks? better", opensMouth: "opens? (?:his|her) mouth",
});
/** B3. Reported instruction: someone is TOLD/ASKED to do the act; it is speech about an act, not the act. */
export const INSTRUCTION = Object.freeze({
  toldTo: "(?:tells?|told|asks?|asked|urges?|urged|orders?|ordered|invites?|invited) (?:him|her|them|nicco|\\w+) to",
});

/** C1. Modal verbs: possibility, ability, obligation or future rather than a completed act. */
export const MODAL = Object.freeze({
  would: "would", could: "could", should: "should", might: "might", may: "may", can: "can", will: "will", shall: "shall",
  wouldLikeTo: "would like to",
});
/** C2. Conditional / hypothetical frames. */
export const CONDITIONAL = Object.freeze({
  if: "if", unless: "unless", whether: "whether", until: "until", wereTo: "were to", suppose: "suppose", supposeAny: "suppos\\w*",
});
/** C3. Epistemic uncertainty and approximation: the narrator or a speaker is not asserting it as known. */
export const EPISTEMIC = Object.freeze({
  maybe: "maybe", perhaps: "perhaps", probably: "probably", possibly: "possibly", seems: "seems?", seemed: "seemed",
  asIf: "as if", asThough: "as though", guess: "guess", impossibleToTell: "impossible to tell", hardToTell: "hard to tell",
  orSo: "or so", orLess: "or less", orMore: "or more", imagine: "imagine", imagines: "imagines?", imagineAny: "imagin\\w*",
  /** Act-scoped seeming ("seems to take"), distinct from seeming an emotion ("seems pleased"), which asserts nothing about an act. */
  seemsTo: "seems? to", seemedTo: "seemed to",
});

/** D. Intent, attempt, plan or incompleteness: the act is wanted, tried, started, threatened or nearly done — not done. */
export const INTENT = Object.freeze({
  triesTo: "tries to", triedTo: "tried to", tryingTo: "trying to", attemptsTo: "attempts? to", attemptedTo: "attempted to",
  wantsTo: "wants? to", wantedTo: "wanted to", wantingTo: "wanting to", wants: "wants?", wanted: "wanted",
  aboutTo: "about to", goingTo: "going to", readyTo: "ready to", startsTo: "starts? to", startedTo: "started to",
  beginsTo: "begins? to", beganTo: "began to", intendsTo: "intends? to", intends: "intends?", plansTo: "plans? to", plans: "plans?",
  planning: "planning", planned: "planned", meansTo: "means? to", reachesFor: "reaches? for", reachingFor: "reaching for",
  almost: "almost", nearly: "nearly", pretends: "pretends?", pretending: "pretending", pretendAny: "pretend\\w*", threaten: "threaten\\w*",
  considers: "considers?", considering: "considering", considerAny: "consider\\w*", thinksAbout: "thinks? about", thinks: "thinks?",
  thinking: "thinking", dreamsOf: "dreams? of", promises: "promises?", saysHell: "says he'?ll",
});
/** E. Observation / orientation: looking at, or turning toward, a goal is not reaching it. */
export const OBSERVATION = Object.freeze({
  looks: "looks?", looked: "looked", looking: "looking", glances: "glances?", glanced: "glanced", stares: "stares?",
  toward: "toward", towards: "towards", forTheDoor: "for the door", toGo: "to (?:leave|go|walk|get out|head|step)",
});
/** F. Temporal displacement: the act belongs to another time than this turn. */
export const TEMPORAL = Object.freeze({
  later: "later", someday: "someday", oneDay: "one day", forNow: "for now", tonight: "tonight", forAWhile: "for a while",
  yesterday: "yesterday", earlier: "earlier",
  /** H5.1: player movement framed for a later day is not this turn's movement. */
  tomorrow: "tomorrow",
  /** NPC+ Pass 4: past displacement of an act ("said it two days ago", "told him last night"). */
  ago: "ago", lastNight: "last night",
});
/** G. Recollection and attribution (NPC+ Pass 4): the act is remembered, attributed or habitual, not happening in this scene. */
export const RECOLLECTION = Object.freeze({
  remember: "remember\\w*", recall: "recall\\w*", accordingTo: "according to", usedTo: "used to", thinksOf: "(?:thinks?|thought) of",
});

/** H. Coercion (NPC+ Pass 9): a compelled act is an order, not an invitation the other person may decline. */
export const COERCION = Object.freeze({
  must: "must", haveTo: "(?:have|has) to", orElse: "or else", order: "order\\w*", command: "command\\w*",
});

/** I. Habit (NPC+ Pass 10): "Maren usually follows him" is a tendency, not this turn's act. */
export const HABITUAL = Object.freeze({
  usually: "usually", normally: "normally", typically: "typically", generally: "generally", habitually: "habitually", frequently: "frequently", invariably: "invariably",
  regularly: "regularly", routinely: "routinely", customarily: "customarily", ordinarily: "ordinarily", always: "always", often: "often", sometimes: "sometimes",
  occasionally: "occasionally", asUsual: "as usual", whenever: "whenever", everyTime: "every time", eachTime: "each time",
});

/** Markers that live outside the whole-word group. */
export interface CueGateSpec {
  readonly cues: readonly string[];
  /** `true`: any negative contraction ("isn't", "won't"). `"at_end"`: a contraction ending the text (a look-behind window). */
  readonly contraction?: true | "at_end";
  /** A future contraction ("she'll", "I'll"). */
  readonly future?: true;
  /** A question mark anywhere: a question is not an assertion. */
  readonly question?: true;
}
/** Compile a case-insensitive, non-global gate (safe for repeated `.test`). Cue order is irrelevant to `.test` results. */
export function cueGate(spec: CueGateSpec): RegExp {
  const parts = [`\\b(?:${[...new Set(spec.cues)].join("|")})\\b`];
  if (spec.contraction === true) parts.push("n't\\b"); else if (spec.contraction === "at_end") parts.push("n't\\s*$");
  if (spec.future) parts.push("'ll\\b");
  if (spec.question) parts.push("\\?");
  return new RegExp(parts.join("|"), "i");
}
