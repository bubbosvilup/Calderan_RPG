import type { RecentExchange } from "./recent-conversation.js";
import { GATES } from "./language/gates.js";
import { CARDINAL_WORD_ALTERNATION, numberWordValue } from "./language/numbers.js";

/**
 * Runtime Continuity Repair 1: narrow grounding guards for unsupported micro-facts that survived delivery in the long-form trial.
 * Each check targets one construction and prefers false negatives over damaging ordinary dialogue:
 * - exact prices (a number + a currency word) not supplied by canon, state, retrieval or the player's input;
 * - fabricated prior events (already paid/booked, "we agreed", "you told me", "I told you", "you've already") that neither the
 *   player's words nor the delivered recent conversation support;
 * - strong legal/procedural assertions (formal charges, complaints, cells, sentences, detention thresholds) absent from canon.
 * Guesses, questions, negations and hypotheticals are not assertions. See docs/architecture/TURN_COORDINATOR.md.
 */
export interface GroundingInput { readonly sentences: readonly string[]; readonly player_input: string; readonly recent: readonly RecentExchange[]; readonly authoritative_text: string;
  /** Household Pass 1: an active person-trade negotiation (a present enslaved person held by a present seller). Asking prices
   * then emerge through narration; the engine owns only the agreed amount, so gold amounts are not flagged as invented. */
  readonly trade_negotiation?: boolean }
export interface GroundingIssue { readonly kind: "invented_price" | "fabricated_prior_event" | "invented_procedure"; readonly sentence: string; readonly correction: string }

/** H1: cardinals come from the canonical table (language/numbers.ts); these phrase-level amounts are this parser's own extensions. */
const PHRASE_AMOUNTS: Readonly<Record<string, number>> = { "a dozen": 12, "a hundred": 100, "half a": 0.5 };
const NUM = `(\\d+|a dozen|a hundred|half a|${CARDINAL_WORD_ALTERNATION})`;
/** Denominations only: "coins" alone is a count of objects, not a price. A bare metal word must end the phrase ("two copper."). */
const PRICE = new RegExp(`\\b${NUM}[\\s-]+(?:(?:good|round|whole|more|extra|small)\\s+)?((?:copper|silver|gold)\\s+(?:bits?|pieces?|coins?|pennies|penny|marks?|crowns?)|coppers|silvers|crowns?|marks?|pennies|pence|shillings?|ducats?|florins?|sovereigns?|(?:copper|silver|gold)(?=\\s*(?:[.,;!?"”—–-]|$|\\s+(?:for|each|apiece|a|an|per|and|or|to|then|now|flat|total)\\b)))\\b`, "gi");
const SINGLE_PRICE = /\ba (copper|silver|gold (?:piece|coin)|crown|mark|penny|shilling)\b(?=\s*(?:for|each|apiece|a (?:bowl|night|mug|cup|plate|room|meal)|per|[.,;!?"”]))/gi;
const root = (currency: string) => currency.toLowerCase().replace(/\s+(?:bits?|pieces?|coins?)$/, "").replace(/(?:ies|s)$/, m => m === "ies" ? "y" : "").replace(/^pence$/, "penny");
function amounts(text: string): { readonly value: number; readonly currency: string; readonly phrase: string }[] {
  const out: { value: number; currency: string; phrase: string }[] = [];
  for (const m of text.matchAll(PRICE)) out.push({ value: /^\d+$/.test(m[1]!) ? Number(m[1]) : PHRASE_AMOUNTS[m[1]!.toLowerCase()] ?? numberWordValue(m[1]!) ?? NaN, currency: root(m[2]!), phrase: m[0] });
  for (const m of text.matchAll(SINGLE_PRICE)) out.push({ value: 1, currency: root(m[1]!), phrase: m[0] });
  return out;
}

const HEDGED = GATES.grounding_hedged;
const STOP = new Set(["that", "this", "with", "have", "from", "they", "them", "then", "than", "what", "when", "your", "you're", "about", "there", "their", "were", "been", "just", "into", "here", "tonight", "today", "said", "told", "asked", "mentioned", "earlier", "before", "already", "last", "time", "like", "well", "still", "will", "would", "could", "should", "really", "some", "much", "more", "only", "also"]);
const content = (s: string) => [...new Set(s.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.replace(/'s$/, "")))];
/** [claim, support family]. A payment/booking claim needs the same act in the player's words or the recent conversation. */
const PRIOR: readonly (readonly [string, RegExp, RegExp | "player_overlap" | "narration_overlap"])[] = [
  ["an earlier payment or booking", /\b(?:(?:already|been)\s+(?:paid|prepaid|settled|covered|booked|reserved|arranged)|(?:paid|prepaid|booked|reserved)\s+(?:through|up|until|in full|in advance|for the (?:night|week))|(?:is|'s|are|was) paid for)\b/i, /\b(?:pa(?:y|id|ying|yment)|prepa\w*|book\w*|reserv\w*|rent\w*|coins?|money)\b/i],
  ["an earlier agreement or promise", /\b(?:we (?:agreed|had a deal|made a deal|shook on it|settled on)|as (?:we|you) agreed|you (?:agreed|promised)|i promised you|your promise|our (?:deal|agreement|arrangement))\b/i, /\b(?:agree\w*|deal|promis\w*|arrang\w*|shake|shook|stands?)\b/i],
  ["something Nicco said earlier", /\b(?:you (?:told|said to) (?:me|us)|you (?:said|mentioned|asked)\b[^.!?"]{0,40}\b(?:earlier|before|already|last time)|like you said|as you said)\b/i, "player_overlap"],
  ["something said to Nicco earlier", /\b(?:i told you|like i said|as i said|as i told you)\b/i, "narration_overlap"],
  ["an earlier act by Nicco", /\byou(?:'ve| have) already\b/i, "player_overlap"],
];
const PROCEDURE = /\b(?:drunk and disorderly|disorderly conduct|breach of the peace|disturbing the peace|(?:minor|simple|aggravated|common|petty) (?:assault|theft|larceny)|misdemeanou?r|felony|battery charges?|file (?:a |an )?(?:formal )?(?:complaint|charge|grievance)|press(?:ing)? charges|lodge (?:a |an )?(?:formal )?complaint|holding cells?|(?:a |the )?cells? at the (?:post|station|barracks|watch-?house)|\w+ nights? in (?:a |the )?cells?|sentenc\w* (?:to|of)|the law (?:says|requires|demands|allows|forbids|states|is clear)|by law|under (?:city |the )?law|(?:it's|it is) (?:the )?law|legally|(?:the )?guard (?:does not|doesn't|won't|will not|only)\b[^.!?"]{0,60}\bunless\b|unless (?:there(?:'s| is) )?blood (?:is )?drawn)\b/i;

export function groundingIssues(input: GroundingInput): GroundingIssue[] {
  const { sentences, player_input, recent, authoritative_text } = input;
  const issues: GroundingIssue[] = [];
  const supportedAmounts = amounts(`${authoritative_text}\n${player_input}`);
  const playerText = [...recent.map(r => r.player), player_input].join("\n");
  const narrationText = recent.map(r => r.narration).join("\n");
  const allText = `${playerText}\n${narrationText}`;
  const authority = authoritative_text.toLowerCase();
  for (const sentence of sentences) {
    // 1. Exact prices.
    const invented = amounts(sentence).find(a => !supportedAmounts.some(s => s.value === a.value && s.currency === a.currency) && !(input.trade_negotiation && a.currency === "gold"));
    if (invented) issues.push({ kind: "invented_price", sentence, correction: `No exact price is established ("${invented.phrase}"). Say it qualitatively (cheap, modest, fair, more than usual) and never name a number of coins.` });
    // 2. Fabricated prior events: judged per clause of the sentence (a guess, question or denial is not an assertion).
    for (const [label, claim, support] of PRIOR) {
      const part = sentence.split(/(?<=[.!?,;—])\s+/).find(p => claim.test(p) && !HEDGED.test(p.replace(claim, " ")));
      if (!part) continue;
      const words = content(part.replace(claim, " "));
      const supported = support === "player_overlap" ? words.length ? words.some(w => playerText.toLowerCase().includes(w)) : recent.length > 0
        : support === "narration_overlap" ? words.length ? words.some(w => narrationText.toLowerCase().includes(w)) : recent.length > 0
        : allText.split(/(?<=[.!?])\s+|\n+/).some(s => support.test(s) && (!words.length || words.some(w => s.toLowerCase().includes(w))));
      if (!supported) issues.push({ kind: "fabricated_prior_event", sentence, correction: `Nothing establishes ${label} ("${part.trim().slice(0, 80)}"). Nobody may state a previous payment, booking, agreement, promise or conversation that the player's words and the recent conversation do not show. Remove it.` });
    }
    // 3. Legal or procedural assertions, unless the authoritative context supplies the same phrase.
    const procedure = PROCEDURE.exec(sentence);
    if (procedure && !authority.includes(procedure[0].toLowerCase()) && !/\b(?:if|whether|maybe|perhaps)\b|\?/i.test(sentence.slice(Math.max(0, procedure.index - 40), procedure.index + procedure[0].length)))
      issues.push({ kind: "invented_procedure", sentence, correction: `No law, charge, complaint process, cell or detention rule is established ("${procedure[0]}"). Characters may judge plainly ("that's enough to bring the Guard into it", "he's done here tonight", "I can remove him from the inn") but must not name formal crimes, procedures, penalties or legal thresholds.` });
  }
  return issues;
}
