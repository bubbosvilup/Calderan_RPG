import { GATES } from "./language/gates.js";
import { QUOTED_SPAN_SOURCE, escapeRegExp as esc } from "./language/text.js";

/**
 * NPC+ Pass 4 — does a sentence make an ABSENT character PARTICIPATE in the current scene, or merely refer to them?
 *
 * Deterministic syntax over the narration (quotes blanked except for attribution). Participation is:
 *  1. the character as the SUBJECT of an act ("Brenna walks into the hall", "Korvin hands Nicco the key", "Nearby, Dell sat hunched");
 *  2. the character as the subject of a presence predicate ("Brenna stands beside Nicco", "Korvin is here", "she is waiting at the door");
 *  3. the character as the attributed speaker of a quote ('"Pay me," Korvin says.', '"Pay me," says Korvin.');
 *  4. the character as the object of a current interaction ("Nicco hands Brenna the boots", "asks Korvin").
 * Not participation (references ABOUT them): stative or habitual description ("Korvin is a slaver", "works at the market", "sells…",
 * "stayed upstairs", "remained above", "did not follow", "left", "had told him"); possessives; recollection or attribution ("Nicco
 * remembers Korvin", "according to Korvin", "used to"); negation and hypotheticals ("Korvin isn't here", "If Korvin were here…") —
 * shared gate `absent_reference` on the clause up to the act; and past displacement right after the act ("said yesterday", "earlier",
 * "ago", "last night") — shared gate `past_displacement`. Pronoun continuations are not resolved (conservative toward allowing).
 */
const ADVERB = "(?:(?:then|also|still|just|now|quietly|slowly|suddenly|finally|already)\\s+|[a-z]+ly\\s+)*";
const STATIVE = new Set(["is", "was", "are", "were", "has", "had", "have", "does", "did", "do", "stay", "stays", "stayed", "remain", "remains", "remained", "lives", "lived", "works", "worked",
  "owns", "owned", "sells", "sold", "trades", "traded", "deals", "dealt", "keeps", "kept", "knows", "knew", "believes", "believed", "likes", "liked", "prefers", "preferred",
  "leaves", "left", "would", "could", "might", "will", "can", "may", "should", "must", "never", "always", "usually", "often", "rarely", "seldom", "sometimes", "isn't", "wasn't",
  "doesn't", "didn't", "won't", "hasn't", "hadn't", "can't", "couldn't", "wouldn't", "needs", "needed", "wants", "wanted", "seems", "seemed", "operates", "specializes", "handles"]);
const IRREGULAR = new Set(["sat", "stood", "came", "went", "said", "took", "gave", "held", "ran", "saw", "made", "got", "put", "set", "knelt", "rose", "fell", "spoke", "told", "drew",
  "threw", "caught", "brought", "led", "met", "sank", "slid", "swung", "shook", "struck", "fought", "bit", "hid", "lay", "felt", "found", "began", "grabbed", "hit", "cut", "let", "spat"]);
const PRESENCE = /^(?:still\s+|now\s+)?(?:here|there|beside|next to|nearby|close by|behind (?:him|nicco)|at (?:the|his|her|nicco's) (?:door|side|shoulder|elbow|table|counter)|in the (?:room|hall|doorway)|with (?:him|nicco)|(?:standing|sitting|waiting|watching|leaning|kneeling|hovering)\b)/i;
const SPEECH = "says|said|asks|asked|replies|replied|adds|added|murmurs|murmured|whispers|whispered|mutters|muttered|answers|answered|calls|called|shouts|shouted|snaps|snapped|growls|growled|grunts|grunted|laughs|laughed";
const INTERACT = "hands?|handed|gives?|gave|passes?|passed|offers?|offered|tosses?|tossed|shows?|showed|touches?|touched|hugs?|hugged|helps?|helped|pulls?|pulled|pushes?|pushed|grabs?|grabbed|leads?|led|tells?|told|asks?|asked|thanks?|thanked|kisses?|kissed";
const WINDOW = 6;
/** The word immediately before the name is a preposition (the name is that preposition's object). */
const PREPOSITION = /\b(?:of|about|from|with|to|for|by|like|than|regarding|toward|towards|at|on|into|upon|over|against|without|beyond|behind|beside|near)\s*$/i;

const outside = (s: string) => s.replace(new RegExp(QUOTED_SPAN_SOURCE, "g"), (q) => " ".repeat(q.length));
const after = (text: string, from: number) => text.slice(from).split(/\s+/).filter(Boolean).slice(0, WINDOW).join(" ");
const verbish = (w: string) => !STATIVE.has(w) && (IRREGULAR.has(w) || /^[a-z]{3,}(?:s|ed)$/.test(w));

/** True when `sentence` makes one of `names` participate in the current scene (see module rules). */
export function participatesInScene(sentence: string, names: readonly string[]): boolean {
  const usable = names.filter(n => n.trim().length >= 3);
  if (!usable.length) return false;
  const name = `(?:${usable.map(esc).join("|")})`;
  // 3. Attributed speaker of a quote in this sentence (attribution is outside the quote; the quote itself must exist).
  if (new RegExp(QUOTED_SPAN_SOURCE).test(sentence)) {
    const plain = outside(sentence);
    const speech = new RegExp(`\\b${name}\\s+${ADVERB}(?:${SPEECH})\\b|\\b(?:${SPEECH})\\s+${name}\\b`, "g");
    for (const m of plain.matchAll(speech)) if (!GATES.absent_reference.test(plain.slice(0, m.index! + m[0].length)) && !GATES.past_displacement.test(after(plain, m.index! + m[0].length))) return true;
  }
  const plain = outside(sentence);
  for (const clause of plain.split(/;|—|–|\s+but\s+|,\s*(?:while|though|although|whereas)\s+/i)) {
    // 1/2. Subject: the name (not possessive), an optional short appositive, optional adverbs, then the predicate.
    for (const m of clause.matchAll(new RegExp(`\\b${name}(?!['’]s\\b)(?:,[^,]{1,40},)?\\s+${ADVERB}([a-z']+)\\b`, "gi"))) {
      // A name right after a preposition is its object, never the clause subject ("What Nicco knows of Korvin comes from…").
      if (PREPOSITION.test(clause.slice(0, m.index!))) continue;
      const word = m[1]!.toLowerCase(), end = m.index! + m[0].length, prefix = clause.slice(0, end);
      if (GATES.absent_reference.test(prefix) || GATES.past_displacement.test(after(clause, end))) continue;
      if ((word === "is" || word === "was" || word === "are" || word === "were") && PRESENCE.test(clause.slice(end).trim())) return true;
      if (verbish(word)) return true;
    }
    // 4. Object of a current interaction ("Nicco hands Brenna the boots", "asks Korvin").
    for (const m of clause.matchAll(new RegExp(`\\b(?:${INTERACT})\\s+${name}\\b(?!['’]s\\b)`, "gi"))) {
      const end = m.index! + m[0].length;
      if (!GATES.absent_reference.test(clause.slice(0, end)) && !GATES.past_displacement.test(after(clause, end))) return true;
    }
  }
  return false;
}
