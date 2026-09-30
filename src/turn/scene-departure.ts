import type { TurnContext } from "./context-builder.js";
import { blankQuotes, sentencesOf } from "./sentences.js";

/**
 * Runtime Continuity Repair 1: deterministic departure evidence for temporary (created) characters. A departure is narrated only
 * by a completed exit ("walks out", "leaves the inn", "heads outside", "disappears into the street", "is gone", "the door shuts
 * behind him") whose actor resolves unambiguously to one present created character: its name leads the act with no other
 * character between, or a leading pronoun / "behind him" resolves to the nearest named sentence subject. Dialogue is ignored
 * (an order or invitation to leave is speech), and threats, intentions, conditionals, negations and movement toward an exit
 * ("turns for the door", "starts toward the door", "looks at the door") are never departures.
 */
export interface DepartureEvidence { readonly character_id: string; readonly source_sentence: string }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MOVE = "(?:walk|stalk|storm|stomp|stagger|stumbl|stride|strode|shoulder|push|shov|slip|head|go|goes|went|step|lurch|weav|wove|limp|shambl|trudg|march|sway|swagger|ambl|saunter|hurri|hurry)\\w*";
const PLACE = "(?:inn|room|tavern|common room|building|place|bar|premises|house|hall|taproom|door|doorway|front door)";
const LEAVE_TAIL = `(?=\\s+(?:the\\s+)?(?:inn|room|tavern|common room|building|place|bar|premises|house|hall|taproom)\\b|\\s*(?:[.,;!—–-]|$)|\\s+(?:without|with|and|then|into|through|for good|at last|quietly|at once|for the (?:night|evening)))`;
/** Completed exits. The actor phrase precedes the match and is resolved by the caller. */
export const DEPART_ACT = new RegExp([
  `\\b${MOVE}\\s+(?:(?:his|her|their) way\\s+)?(?:[\\w']+\\s+){0,2}?(?:out(?:side)?\\b(?!\\s+(?:a|an|his|her|their|some|coins?|of|from)\\b)|out of the ${PLACE}\\b|through the (?:door|doorway)\\s+(?:and\\s+)?(?:into|out)\\b|into the (?:street|night|dark|darkness|rain|evening|cold|lane|alley)\\b|off into the\\b)`,
  `\\b(?:makes?|made)\\s+(?:his|her|their) way out\\b`,
  `\\b(?:takes?|took) (?:his|her|their) leave\\b`,
  `\\b(?:leaves|left|departs|departed|exits|exited)\\b${LEAVE_TAIL}`,
  `(?:\\b(?:is|was|had been)\\s+|'s\\s+)(?:long\\s+)?gone\\b(?=\\s*(?:[.,;!—–-]|$)|\\s+(?:from|now|already|for good))`,
  `\\b(?:disappears?|disappeared|vanish(?:es|ed)?)\\s+(?:into|through|out)\\b`,
].join("|"), "i");
/** The door closing behind a person: the pronoun resolves to the nearest named subject. */
const DOOR_BEHIND = /\bdoor\b[^.!?]{0,40}\b(?:shut|closed|closes|shuts|bang\w*|slam\w*|swung|swings|thud\w*)\b[^.!?]{0,20}\bbehind (?:him|her)\b/i;
/** Hedges, negation, modality, intention and instruction frames: no completed departure. */
const NOT_DONE = /\b(?:not|never|no|nor|won't|will|would|could|should|might|may|can|cannot|if|unless|until|whether|threaten\w*|about to|going to|ready to|starts? to|started to|begins? to|began to|tries to|tried to|wants? to|wanted to|means? to|intends? to|almost|nearly|toward|towards|for the door|to (?:leave|go|walk|get out|head|step)|as if|as though)\b|n't\b|\?/i;

interface Named { readonly id: string; readonly terms: readonly string[] }
const namesOf = (context: TurnContext): Named[] => context.characters.map(c => {
  const name = c.profile.name ?? c.id;
  return { id: c.id, terms: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))] };
});
/** Present created characters: the only ones a departure can remove from the scene through leave_scene. */
export function departureCandidates(context: TurnContext): readonly string[] {
  return context.characters.filter(c => c.id !== "nicco" && c.origin.kind === "created" && c.current.status !== "dead").map(c => c.id);
}
/** Narrated departures of present created characters, in narration order (at most one per character). */
export function narratedDepartures(narration: string, context: TurnContext): readonly DepartureEvidence[] {
  const candidates = departureCandidates(context);
  if (!candidates.length) return [];
  const people = namesOf(context);
  const anyName = new RegExp(`\\b(${people.flatMap(p => p.terms).map(esc).join("|") || "(?!)"})\\b`, "g");
  const out: DepartureEvidence[] = [];
  let lastSubject: string | undefined;
  for (const sentence of sentencesOf(narration)) {
    const plain = blankQuotes(sentence).trim().replace(/^(?:then|finally|at last),?\s+/i, "");
    const lead = people.find(p => new RegExp(`^(?:${p.terms.map(esc).join("|")})\\b(?!'s\\s+(?!gone\\b))`).test(plain));
    const pronounLead = /^(?:he|she)\b/i.test(plain);
    const subject = lead?.id ?? (pronounLead ? lastSubject : undefined);
    const record = (id: string | undefined) => { if (id && candidates.includes(id) && !out.some(o => o.character_id === id)) out.push({ character_id: id, source_sentence: sentence }); };
    // The exit must be completed in its own clause.
    for (const clause of plain.split(/;|,\s*(?:but|while|as|though|although)\s+|\s+but\s+/)) {
      const act = DEPART_ACT.exec(clause);
      if (act && !NOT_DONE.test(clause.slice(0, act.index + act[0].length))) {
        const before = clause.slice(0, act.index);
        const named = [...before.matchAll(anyName)].at(-1);
        const gap = named ? before.slice(named.index + named[0].length) : before;
        // Actor: the last name before the act, not possessive ("Dell's patience is gone"), with no other capitalized name or
        // instruction frame in between ("tells Dell to walk out" is excluded above).
        if (named && !/^'s\s+\w/.test(gap) && !/\b[A-Z][a-z]+\b/.test(gap)) record(people.find(p => p.terms.includes(named[1]!))?.id);
        else if (!named && /^\s*(?:he|she)\b/i.test(before)) record(subject);
      }
      if (DOOR_BEHIND.test(clause) && !NOT_DONE.test(clause)) record(lastSubject);
    }
    if (lead) lastSubject = lead.id;
  }
  return out;
}
