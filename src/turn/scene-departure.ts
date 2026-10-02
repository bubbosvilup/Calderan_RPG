import type { TurnContext } from "./context-builder.js";
import { blankQuotes, escapeRegExp as esc, sentencesOf } from "./language/text.js";
import { GATES } from "./language/gates.js";

/**
 * Runtime Continuity Repair 1: deterministic departure evidence for temporary (created) characters. A departure is narrated only
 * by a completed exit ("walks out", "leaves the inn", "heads outside", "disappears into the street", "is gone", "the door shuts
 * behind him") whose actor resolves unambiguously to one present created character: its name leads the act with no other
 * character between, or a leading pronoun / "behind him" resolves to the nearest named sentence subject (subject continuity:
 * "Dell glares at Nicco. He leaves." is Dell). Hardening H1 narrows two unsafe cases: a compound subject ("Dell and Bram argue.
 * He walks out.") is ambiguous and records nothing, and a subject of established incompatible sex is never the referent ("Jessa
 * glares at Dell. He walks out." never removes Jessa). Dialogue is ignored
 * (an order or invitation to leave is speech), and threats, intentions, conditionals, negations and movement toward an exit
 * ("turns for the door", "starts toward the door", "looks at the door") are never departures.
 */
export interface DepartureEvidence { readonly character_id: string; readonly source_sentence: string }

const MOVE = "(?:walk|stalk|storm|stomp|stagger|stumbl|stride|strode|shoulder|push|shov|slip|head|go|goes|went|step|lurch|weav|wove|limp|shambl|trudg|march|sway|swagger|ambl|saunter|hurri|hurry)\\w*";
const PLACE = "(?:inn|room|tavern|common room|building|place|bar|premises|house|hall|taproom|door|doorway|front door)";
const LEAVE_TAIL = `(?=\\s+(?:the\\s+)?(?:inn|room|tavern|common room|building|place|bar|premises|house|hall|taproom)\\b|\\s*(?:[.,;!—–-]|$)|\\s+(?:without|with|and|then|into|through|for good|at last|quietly|at once|for the (?:night|evening)))`;
/** Completed exits. The actor phrase precedes the match and is resolved by the caller. */
export const DEPART_ACT = new RegExp([
  `\\b${MOVE}\\s+(?:(?:his|her|their) way\\s+)?(?:[\\w']+\\s+){0,2}?(?:out(?:side)?\\b(?!\\s+(?:a|an|his|her|their|some|coins?|of|from)\\b)|out of the ${PLACE}\\b|through the (?:door|doorway)\\s+(?:and\\s+)?(?:into|out)\\b|into the (?:street|night|dark|darkness|rain|evening|cold|lane|alley)\\b|off into the\\b)`,
  // H5.1: leaving by the stairs is a completed exit from the room ("heads downstairs", "goes down the stairs").
  `\\b${MOVE}\\s+(?:(?:his|her|their) way\\s+)?(?:back\\s+)?(?:downstairs|upstairs|down the stairs|up the stairs)\\b`,
  `\\b(?:makes?|made)\\s+(?:his|her|their) way out\\b`,
  `\\b(?:takes?|took) (?:his|her|their) leave\\b`,
  `\\b(?:leaves|left|departs|departed|exits|exited)\\b${LEAVE_TAIL}`,
  `(?:\\b(?:is|was|had been)\\s+|'s\\s+)(?:long\\s+)?gone\\b(?=\\s*(?:[.,;!—–-]|$)|\\s+(?:from|now|already|for good))`,
  `\\b(?:disappears?|disappeared|vanish(?:es|ed)?)\\s+(?:into|through|out)\\b`,
].join("|"), "i");
/**
 * Debt closure D-07 (audit only): a completed descent by the stairs with no destination ("crossed to the stairs and descended", "started down
 * the stairs", "her footsteps receding down", "as she descended"). Used only when Nicco did not change place this turn, so a follower arriving
 * after him is never read as a departure.
 */
const STAIRS_N = "(?:stairs?|staircase|stairwell|steps|stairhead|landing)";
export const STAIR_EXIT = new RegExp([
  `\\b(?:crosse[sd]?|goe?s|went|heads?|headed|walks?|walked|moves?|moved)\\s+(?:(?:the|across the)\\s+(?:room|floor)\\s+)?(?:to|toward|towards)\\s+the\\s+${STAIRS_N}\\s+and\\s+(?:descend\\w*|starts? down|started down|goes? down|went down|heads? down|headed down)\\b`,
  `\\b(?:descends|descended|descending)\\s+(?:the\\s+${STAIRS_N}|out of (?:sight|view)|into the (?:main )?hall)\\b`,
  `\\b(?:starts|started)\\s+down\\s+(?:the\\s+)?${STAIRS_N}\\b`,
  `\\b(?:footsteps?|steps?|tread)\\s+(?:descend(?:s|ed|ing)?\\b|(?:reced(?:e|es|ed|ing)|fad(?:es|ed|ing)|retreat(?:s|ed|ing)?)\\s+(?:down|as (?:she|he|they) descend\\w*))`,
  `\\bas (?:she|he) descend(?:s|ed)\\b`,
].join("|"), "i");
/** The door closing behind a person: the pronoun resolves to the nearest named subject. */
const DOOR_BEHIND = /\bdoor\b[^.!?]{0,40}\b(?:shut|closed|closes|shuts|bang\w*|slam\w*|swung|swings|thud\w*)\b[^.!?]{0,20}\bbehind (?:him|her)\b/i;
/** Hedges, negation, modality, intention and instruction frames: no completed departure (H1: "no word", "no warning" are not negation). */
const NOT_DONE = GATES.departure_not_done;

interface Named { readonly id: string; readonly terms: readonly string[]; readonly sex?: "female" | "male" }
const namesOf = (context: TurnContext): Named[] => context.characters.map(c => {
  const name = c.profile.name ?? c.id;
  // Established sex only (declared profile or authored pronoun), never inferred from a name; unknown is compatible with any pronoun.
  const declared = (c.profile.sex ?? "").toLowerCase(), pronoun = "pronoun" in c ? c.pronoun : undefined;
  const sex = /^(?:female|woman)$/.test(declared) || pronoun === "she" ? "female" as const : /^(?:male|man)$/.test(declared) || pronoun === "he" ? "male" as const : undefined;
  return { id: c.id, terms: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(sex ? { sex } : {}) };
});
/** Present created characters: the only ones a departure can remove from the scene through leave_scene. */
export function departureCandidates(context: TurnContext): readonly string[] {
  return context.characters.filter(c => c.id !== "nicco" && c.origin.kind === "created" && c.current.status !== "dead").map(c => c.id);
}
/**
 * Narrated departures of present created characters, in narration order (at most one per character). H5.1: `scope: "persistent"`
 * also detects present authored NPCs — for the narration audit only (an authored NPC cannot leave_scene, so narrating one gone is
 * an unrecorded departure); authorization evidence keeps the default created-only scope. `every` (audit only, D-07): one entry per narrated sentence, so redaction removes every departure sentence. `stairs` (audit only, D-07): also reads a destination-less completed descent as a departure.
 */
export function narratedDepartures(narration: string, context: TurnContext, scope: "created" | "persistent" = "created", options: { readonly every?: boolean; readonly stairs?: boolean } = {}): readonly DepartureEvidence[] {
  const every = options.every ?? false;
  const candidates = scope === "created" ? departureCandidates(context) : context.characters.filter(c => c.id !== "nicco" && c.current.status !== "dead").map(c => c.id);
  if (!candidates.length) return [];
  const people = namesOf(context);
  const anyName = new RegExp(`\\b(${people.flatMap(p => p.terms).map(esc).join("|") || "(?!)"})\\b`, "g");
  const out: DepartureEvidence[] = [];
  let lastSubject: Named | undefined;
  /** H1: the last subject is a pronoun's referent only if its established sex (when known) agrees with the pronoun. */
  const antecedent = (pronoun: string) => {
    const want = /^(?:she|her)$/i.test(pronoun) ? "female" : "male";
    return lastSubject && (!lastSubject.sex || lastSubject.sex === want) ? lastSubject.id : undefined;
  };
  for (const sentence of sentencesOf(narration)) {
    const plain = blankQuotes(sentence).trim().replace(/^(?:then|finally|at last),?\s+/i, "");
    // D-07: "Maren's gaze moved…" — a possessive body-part or expression subject is still that person ("Dell's patience is gone" stays excluded).
    const lead = people.find(p => new RegExp(`^(?:${p.terms.map(esc).join("|")})(?:\\b(?!'s\\s+(?!gone\\b))|'s\\s+(?:gaze|eyes|face|expression|hand|hands|voice|head|attention|mouth|brow|shoulders?)\\b)`).test(plain));
    const pronounLead = plain.match(/^(he|she)\b/i);
    const subject = lead?.id ?? (pronounLead ? antecedent(pronounLead[1]!) : undefined);
    const record = (id: string | undefined) => { if (id && candidates.includes(id) && (every ? !out.some(o => o.character_id === id && o.source_sentence === sentence) : !out.some(o => o.character_id === id))) out.push({ character_id: id, source_sentence: sentence }); };
    // The exit must be completed in its own clause.
    for (const clause of plain.split(/;|,\s*(?:but|while|as|though|although)\s+|\s+but\s+/)) {
      const act = DEPART_ACT.exec(clause);
      const stair = options.stairs && !act ? STAIR_EXIT.exec(clause) : null;
      if (stair && !NOT_DONE.test(clause.slice(stair.index, stair.index + stair[0].length))) {
        const before = clause.slice(0, stair.index), named = [...before.matchAll(anyName)].at(-1), gap = named ? before.slice(named.index + named[0].length) : before;
        const sound = /^(?:footsteps?|steps?|tread)/i.test(stair[0]);
        if (sound && named && /^'s\s+(?:\w+\s+){0,2}$/.test(gap)) record(people.find(p => p.terms.includes(named[1]!))?.id);
        else if (sound && /\b(?:her|his)\s+(?:\w+\s+){0,2}$/i.test(before)) record(named && !/\b[A-Z][a-z]+\b/.test(gap) ? people.find(p => p.terms.includes(named[1]!))?.id : antecedent(/\bher\b/i.test(before) ? "her" : "him"));
        else if (!sound && named && !/^'s\s+\w/.test(gap) && !/\b[A-Z][a-z]+\b/.test(gap)) record(people.find(p => p.terms.includes(named[1]!))?.id);
        else if (!sound && !named && /\b(?:he|she)\b/i.test(before)) record(subject ?? antecedent(/\bshe\b/i.test(before) ? "she" : "he"));
        else if (!sound && !named && /,\s*(?:her|his)\s+(?:\w+\s+){0,2}$/i.test(before)) record(subject);
      }
      const noun = options.stairs && !act && !stair ? clause.match(/\b([A-Z][\w-]*)'s\s+(?:departure|exit)\b/) : null;
      if (noun && !NOT_DONE.test(clause.slice(0, noun.index! + noun[0].length))) record(people.find(p => p.terms.includes(noun[1]!))?.id);
      if (act && !NOT_DONE.test(clause.slice(0, act.index + act[0].length))) {
        const before = clause.slice(0, act.index);
        const named = [...before.matchAll(anyName)].at(-1);
        const gap = named ? before.slice(named.index + named[0].length) : before;
        // Actor: the last name before the act, not possessive ("Dell's patience is gone"), with no other capitalized name or
        // instruction frame in between ("tells Dell to walk out" is excluded above).
        if (named && !/^'s\s+\w/.test(gap) && !/\b[A-Z][a-z]+\b/.test(gap)) record(people.find(p => p.terms.includes(named[1]!))?.id);
        else if (!named && /^\s*(?:he|she)\b/i.test(before)) record(subject);
      }
      const door = clause.match(DOOR_BEHIND);
      if (door && !NOT_DONE.test(clause)) record(antecedent(door[0].endsWith("her") ? "her" : "him"));
    }
    // H1: "Dell and Bram …" / "Dell, Bram and …" is a compound subject: no single referent for a later pronoun.
    if (lead) lastSubject = new RegExp(`^(?:${lead.terms.map(esc).join("|")})(?:,\\s*|\\s+(?:and|or)\\s+)(?:the\\s+)?${anyName.source}`, "i").test(plain) ? undefined : lead;
  }
  return out;
}
