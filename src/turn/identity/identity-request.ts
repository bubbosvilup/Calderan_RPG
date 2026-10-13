/**
 * Direct identity requests and self-introductions in the player's own words. Shared by canonical name disclosure (who may truthfully
 * introduce themselves) and canonical casting (a weak description is enough to cast the one canonical candidate it fits, but ONLY
 * when the player is asking who that person is).
 */
export const NAME_REQUEST = /\b(?:who am i (?:speaking|talking) (?:with|to)|who are you|your name|introduce yourself|what (?:are you called|should i call you)|(?:u|you) said you are named)\b/i;
export const SELF_INTRODUCTION = /\b(?:my name(?:['’]s| is)|(?:name['’]s|i(?:['’]m| am))\s+Nicco)\b/i;
export const isIdentityRequest = (text: string): boolean => NAME_REQUEST.test(text) || SELF_INTRODUCTION.test(text);

/**
 * The scene reader's narrower name question (Block 11: moved here from narrated-captives.ts so every PLAYER-input identity reader lives in one module;
 * the fact layer receives it injected and never reads player intent itself). Unlike NAME_REQUEST it also accepts "what do people call you" and the
 * reciprocal form: "what about you?" / "and you?" closing an input in which the player first gave his own name ("Name's Nicco, what about you?").
 * Reciprocal phrasing alone is never a name question. Both readers are kept because their consumers are tuned to them: NAME_REQUEST gates the
 * canonical disclosure capability, asksName decides whether a bare "Lira." answers a question.
 */
const ASK_NAME = /\b(?:your name|who are you|what(?:'s| is| are) you called|what do (?:they|people) call you|what (?:do|should|shall) i call you)\b/i;
/** The player's own name introduction; a reciprocal question after it in the same input asks for the other person's name. */
const OWN_NAME = /\b(?:my name(?:'s|’s| is)|name(?:'s|’s)|i(?:'m|’m| am)|call me|they call me)\s+nicco\b/i;
const RECIPROCAL = /(?:^|[,.;:!?…—–-])\s*(?:(?:and|so|but)\s+)?(?:(?:what|how) about you|and you(?:rs)?|you)\s*[?!.]*\s*$/i;
/**
 * The narrated (indirect) question, Block 11 live B: "I ask the apple seller what her name is", "I ask her name", "I ask him for his name". The asked
 * person is a pronoun or a lowercase noun phrase without a preposition, and a pronoun must agree with the possessive: "I ask the man beside her what
 * her name is" and "I ask Korvin what her name is" ask somebody ELSE's name and are not a name question to the one who answers.
 */
const INDIRECT_ASK = /\b[Aa]sk(?:s|ed)?\s+(her|him|them|(?:the|this|that)(?:\s+(?!(?:beside|next|behind|with|near|by|of|to|at|about|what|for|her|his|their)\b)[a-z'-]+){1,3})\s+(?:what\s+|for\s+)?(her|his|their)\s+name\b/;
const AGREES: Readonly<Record<string, string>> = { her: "her", him: "his", them: "their" };
/** "I ask her name" / "I ask for his name": the possessive is the asked person's own. */
const ASK_POSSESSIVE = /\b[Aa]sk(?:s|ed)?\s+(?:for\s+)?(?:her|his|their)\s+name\b/;
export function asksName(player: string): boolean {
  if (ASK_NAME.test(player) || ASK_POSSESSIVE.test(player)) return true;
  const indirect = INDIRECT_ASK.exec(player);
  if (indirect && (!(indirect[1]! in AGREES) || AGREES[indirect[1]!] === indirect[2])) return true;
  const own = OWN_NAME.exec(player);
  return !!own && RECIPROCAL.test(player.slice(own.index + own[0].length));
}
