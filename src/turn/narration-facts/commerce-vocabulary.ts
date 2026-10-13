import { NUMBER_PHRASE_SOURCE } from "../language/numbers.js";
import { CONDITIONAL, EPISTEMIC, MODAL, NEGATION, REFUSAL, TEMPORAL, cueGate } from "../language/cues.js";

/**
 * The commerce wording the facts read. Moved here from person-offers.ts, trade-authorization.ts and the household audit (Block 10): this file is
 * the only owner of what counts as a past cost, a withdrawal, a payment, a hand-over or a finished deal. The numeric grammar itself stays in
 * trade-price.ts (one low-level price reader).
 */
const NUM = `(${NUMBER_PHRASE_SOURCE})`;

/** Not an actual price statement: hypothetical, conditional, negated, refused, questioned or set in another time. "I'll go X" is NOT a future: `will` is deliberately absent. */
export const QUOTE_NOT_ACTUAL: RegExp = cueGate({ cues: [MODAL.would, MODAL.could, MODAL.should, MODAL.might, CONDITIONAL.if, CONDITIONAL.unless, CONDITIONAL.whether,
  CONDITIONAL.suppose, CONDITIONAL.supposeAny, EPISTEMIC.maybe, EPISTEMIC.perhaps, NEGATION.not, NEGATION.never, NEGATION.noLonger, NEGATION.notYet, NEGATION.nor, NEGATION.cannot,
  ...Object.values(REFUSAL), TEMPORAL.tomorrow, TEMPORAL.someday, "haggl\\w*", "negotiat\\w*", "how much", "what(?:'s| is) (?:the|your) price", "name your price", "supposing"], contraction: true, question: true });

/** A past cost or a group / per-head price: a number that is not THE price of this person now. */
export const PAST_COST = new RegExp(`\\b(?:paid|cost me|charged me|was for)\\s+${NUM}`, "i");
export const GROUP_OR_EACH = /\bfor (?:the lot|both|all|them all|the (?:two|three|four|five) of them)\b|\beach\b/i;

/** A seller who bargains in the wording itself (a counter), as opposed to a first ask. */
export const COUNTER_WORDING = /\b(?:i'?ll go|i will go|make it|let'?s say|call it|down to|settle (?:on|for|at)|lowest i'?ll go|best i can do|last (?:price|word|offer)|my (?:floor|last)|final)\b/i;

export const WITHDRAWAL = /\b(?:withdraws?|withdrew|refuses?|refused|no longer|not for sale|changes? (?:his|her|their|my) mind|changed (?:his|her|their|my) mind|takes? (?:it|them) back|off the table|won'?t sell|will not sell|not selling|sold (?:it|them) (?:to|already)|offer (?:is )?(?:gone|off|withdrawn)|pulls? (?:it|them) back|put[s]? (?:it|them) away)\b/i;

// ---- claims that money / goods / a person changed hands, or that the deal is finished (narration cannot settle a trade; these only DESCRIBE the claim)
const GIVE = "(?:hands?|handed|gives?|gave|slides?|slid|slips?|slipped|drops?|dropped|presses|pressed|tosses?|tossed|passes|passed|counts?|counted|pays?|paid|pockets?|pocketed|takes?|took)";
/** pay_verb: the narrow paying wording. */
export const PAY_VERB = /\b(?:pays?|paid|hands? over|counts? out|pockets?|takes?) (?:him |her |them |korvin |the )?(?:[\w-]+ ){0,2}?(?:gold|coins?)\b/i;
/** coin_motion: any hand-over verb moving coins. */
export const COIN_HAND = new RegExp(`\\b${GIVE}\\s+(?:over\\s+)?(?:him |her |them |korvin |the \\w+ )?(?:\\w+ ){0,3}?(?:gold|coins?)\\b`, "i");
export const COIN_MOTION: readonly RegExp[] = [
  /\b(?:gold|coins?|payment|purse)\b[^.!?]{0,50}\b(?:disappears?|vanish\w*|lands?|landed|slips?|slipped|clinks?|goes into|changes? hands)\b/i,
  /\b(?:pulls?|pulled|fishes?|fished|draws?|drew|produces?|produced|digs?)\b[^.!?]{0,40}\b(?:gold|coins?)\b/i,
  /\b(?:drops?|dropped|places?|placed|sets?|presses|pressed|lays?|laid|slaps?|counts?|counted)\b[^.!?]{0,40}\b(?:gold|coins?)\b/i,
  /\b(?:gold|coins?)\b[^.!?]{0,40}\b(?:palm|outstretched hand)\b/i,
  /\bclos(?:e|es|ed|ing)\s+(?:around|over)\s+(?:the |those |his |her )?(?:\w+ )?(?:coins?|gold|payment)\b/i,
  /\b(?:weighs?|weighed|counts?|counted|pockets?|pocketed|tucks?|tucked|pouches|accepts?|accepted)\b[^.!?]{0,40}\b(?:coins?|gold|payment)\b/i,
];
export const HANDS_CHANGED = /\b(?:changes?|changed) hands\b/i;
export const DEAL_DONE: readonly RegExp[] = [
  /\bthe (?:sale|purchase|deal|bargain) (?:is|was) (?:done|complete|made|struck|sealed)\b/i,
  /\b(?:transaction|sale|purchase|trade|deal|bargain|exchange)\b[^.!?]{0,40}\b(?:closed|done|complete\w*|settled|finished|sealed|made|struck|concluded)\b/i,
  /\b(?:closed|settled|sealed|struck|concluded)\b[^.!?]{0,20}\b(?:the |this )?(?:transaction|sale|deal|bargain)\b/i,
];
export const BELONGS_TO_PLAYER = /\bnow (?:belongs|belonged) to (?:nicco|you)\b/i;
/** The person (or goods) is declared the player's: "She's yours." A price or a condition in the same sentence makes it an offer, not a transfer. */
export const YOURS = /\b(?:she|he|they|it)(?:'s|’s| is| are)\s+(?:now\s+)?yours\b(?!\s+(?:for|if|when|once|after|at|unless)\b)|\bnow yours\b/i;
export const DOCUMENT = /\b(?:that'?s|this is|here'?s|here is|there'?s|there is)\s+(?:your|the)\s+(?:bill of sale|deed|papers?|receipt|copy)\b|\b(?:registered|signed over|transferred) to (?:you|nicco)\b/i;
/** goods_handover: a hand-over verb and the words that follow it (the policy side checks them against the standing offer). */
export const HANDOVER = /\b(?:hands?|handed|passes|passed|gives?|gave|slides?|slid|tosses?|tossed|presses|pressed)\s+(?:you |nicco |him |her )?(?:the |a |an |it |over )?((?:\w+ ){0,2}\w+)/gi;
