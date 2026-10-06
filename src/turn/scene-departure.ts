import type { TurnContext } from "./context-builder.js";
import { blankQuotes, escapeRegExp as esc, sentencesOf } from "./language/text.js";
import { GATES } from "./language/gates.js";
import { rpgNarration } from "./rpg-dialogue.js";
import { narratorIdentityGate } from "./narrator-identity.js";

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

export interface CanonicalDepartureClaim extends DepartureEvidence { readonly ambiguous: boolean }
/** Bounded physical traces, not arbitrary possessives (patience, gaze, voice, etc.). */
const TRACE_SUBJECT = /^(?:(?:'s|\u2019s)\s+|(?:his|her)\s+)(?:retreating back|footsteps?|figure)\b/i;
const TRACE_ACT = /\b(?:disappear(?:s|ed)?|vanish(?:es|ed)?|fade(?:s|d)?)\s+(?:away|through|down|around|out)\b/i;
function canonicalActorTerms(context: TurnContext, id: string, name: string): readonly string[] {
  const identity = narratorIdentityGate(context)?.identities.get(id);
  return [name, id, identity?.ref, identity?.observable_label].filter((x): x is string => !!x);
}
function departureSentences(narration: string): readonly { source: string; plain: string }[] {
  const spans = narration.includes("*") ? rpgNarration(narration) : undefined;
  return sentencesOf(narration).filter(source => !spans || spans.some(span => span.includes(source)))
    .map(source => ({ source, plain: blankQuotes(source).replace(/\*/g, "").trim().replace(/^(?:then|finally|at last|a moment later),?\s+/i, "") }));
}
/** Claims are broader than permission: audit must also see ambiguous or contradictory completed exits. */
export function canonicalDepartureClaims(narration: string, context: TurnContext, additional: readonly { readonly id: string; readonly name: string }[] = []): readonly CanonicalDepartureClaim[] {
  const actors = [...context.characters.filter(c => c.id !== "nicco" && c.origin.kind === "canonical" && c.current.status !== "dead"), ...additional.map(c => ({ id: c.id, profile: { name: c.name } }))];
  const terms = (id: string, name: string) => canonicalActorTerms(context, id, name);
  const out: CanonicalDepartureClaim[] = [];
  let previous: readonly string[] = [];
  for (const { source, plain } of departureSentences(narration)) {
    const explicit = actors.filter(c => terms(c.id, c.profile.name ?? c.id).some(t => new RegExp(`^${esc(t)}(?=\\b|'|\u2019)`, "i").test(plain)));
    const pronoun = /^(?:he|she|his|her)\b/i.test(plain);
    const descriptor = plain.match(/^the (?:unfamiliar )?(man|woman)\b/i);
    const ids = explicit.length ? explicit.map(c => c.id) : pronoun ? previous.filter(id => {
      const sex = context.characters.find(c => c.id === id)?.profile.sex;
      return !sex || sex === (/^(?:she|her)\b/i.test(plain) ? "female" : "male");
    }) : descriptor ? context.characters.filter(c => c.id !== "nicco" && (!c.profile.sex || c.profile.sex === (descriptor[1]!.toLowerCase() === "man" ? "male" : "female"))).map(c => c.id) : [];
    const leadTerm = explicit.length ? [...terms(explicit[0]!.id, explicit[0]!.profile.name ?? explicit[0]!.id)].sort((a, b) => b.length - a.length).find(t => plain.toLowerCase().startsWith(t.toLowerCase())) : undefined;
    const tail = leadTerm ? plain.slice(leadTerm.length) : plain;
    const compound = !!leadTerm && /^\s*(?:and|or|,)\s+/i.test(tail);
    if (explicit.length) previous = compound ? [] : ids;
    else if (/^[A-Z][a-z]+\b/.test(plain) && !pronoun) previous = [];
    const physicalTrace = TRACE_SUBJECT.test(plain) || explicit.some(c => terms(c.id, c.profile.name ?? c.id).some(t => TRACE_SUBJECT.test(plain.slice(t.length))));
    const directAct = DEPART_ACT.exec(plain), traceAct = physicalTrace ? TRACE_ACT.exec(plain) : null;
    const act = traceAct && (!directAct || traceAct.index < directAct.index) ? traceAct : directAct;
    if (!act) continue;
    const prefix = plain.slice(0, act.index + act[0].length);
    // Intention/negation/instruction gates apply before the completion cue, not a following "until he is gone".
    if (NOT_DONE.test(prefix) || GATES.past_displacement.test(plain.slice(act.index + act[0].length)) || /\b(?:if|unless|will|would|could|should|might|may)\b/i.test(plain) || /\b(?:had|used to|remembers?|recalls?)\b/i.test(prefix) || /\b(?:tells?|asks?|orders?|urges?|invites?)\b[\s\S]*?\bto\b/i.test(prefix)) continue;
    // Possessive traces are whitelisted; an abstract possession being "gone" is never departure.
    if (explicit.length && /^(?:'s|\u2019s)\s+/.test(tail) && !physicalTrace && !/^(?:'s|\u2019s)\s+(?:long\s+)?gone\b/i.test(tail)) continue;
    const multiple = actors.filter(c => terms(c.id, c.profile.name ?? c.id).some(t => new RegExp(`\\b${esc(t)}\\b`, "i").test(plain))).length > 1;
    const uncertainDescriptor = !explicit.length && !!descriptor && ids.some(id => !context.characters.find(c => c.id === id)?.profile.sex);
    for (const id of ids) if (actors.some(c => c.id === id)) out.push({ character_id: id, source_sentence: source, ambiguous: ids.length !== 1 || compound || multiple || uncertainDescriptor });
  }
  return out;
}
/** No multi-step simulation: any actor-bound return or continued indoor presence blocks departure admission. */
export function canonicalDepartureContradiction(narration: string, context: TurnContext, id: string): boolean {
  return canonicalPresenceClaims(narration, context, id).length > 0;
}
export function canonicalPresenceClaims(narration: string, context: TurnContext, id: string): readonly string[] {
  const actor = context.characters.find(c => c.id === id);
  if (!actor) return [];
  const out: string[] = [];
  let bound = false;
  for (const { source, plain } of departureSentences(narration)) {
    if (canonicalActorTerms(context, id, actor.profile.name ?? id).some(t => new RegExp(`^${esc(t)}\\b`, "i").test(plain))) bound = true;
    else if (!/^(?:he|she|his|her)\b/i.test(plain)) bound = false;
    if (bound && !GATES.movement_not_done.test(plain) && /\b(?:returns?|returned|reenters?|reentered|arrives?|arrived|steps? back inside|speaks? from inside|stops? before|pauses? at|is interrupted|(?:is |stands? |standing )beside Nicco|(?:is |stands? |standing )(?:still )?(?:in|inside) the (?:room|hall))\b/i.test(plain)) out.push(source);
  }
  return out;
}

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
  // Final movement closure (live-observed): leaving by a door without naming where it leads ("stepping through and pulling it shut behind her").
  `\\b(?:steps?|stepped|stepping|goes|went|passes|passed|slips?|slipped|walks?|walked)\\s+(?:out\\s+)?through\\s+(?:it|the (?:door|doorway))\\b(?!\\s+(?:and\\s+)?(?:then\\s+)?(?:back|stops?|stopped|pauses?|paused|returns?|returned)\\b)`,
  `\\b(?:passes|passed|steps|stepped|goes|went)\\s+through\\s+into\\s+the\\s+(?:open air|courtyard|yard|night|street|cold|garden)\\b`,
  `\\b(?:steps?|stepped|stepping|slips?|slipped|slipping)\\s+through(?=\\s*,?\\s*(?:and\\s+)?(?:letting|lets?|leaving|closing|pulling|pulled)\\b)`,
  `\\b(?:pulls?|pulled|pulling|draws?|drew|closes|closed|shuts?)\\s+(?:it|the door)\\s+(?:shut|closed)?\\s*behind (?:her|him)\\b`,
].join("|"), "i");
/**
 * Debt closure D-07 (audit only): a completed descent by the stairs with no destination ("crossed to the stairs and descended", "started down
 * the stairs", "her footsteps receding down", "as she descended"). Used only when Nicco did not change place this turn, so a follower arriving
 * after him is never read as a departure.
 */
const STAIRS_N = "(?:stairs?|staircase|stairwell|steps|stairhead|landing)";
export const STAIR_EXIT = new RegExp([
  `\\b(?:crosse[sd]?|goe?s|went|heads?|headed|walks?|walked|moves?|moved)\\s+(?:(?:the|across the)\\s+(?:[a-z]+\\s+)?(?:room|floor|hall)\\s+)?(?:to|toward|towards)\\s+the\\s+${STAIRS_N}(?:\\s+without\\s+(?:\\w+\\s+){0,2}\\w+)?,?\\s+and\\s+(?:descend\\w*|ascend\\w*|climb\\w*|starts? down|started down|goes? down|went down|heads? down|headed down)\\b`,
  `\\b(?:descends|descended|descending|ascends|ascended|ascending|climbs|climbed|climbing)\\s+(?:the\\s+(?:[a-z]+\\s+)?${STAIRS_N}|out of (?:sight|view)|into the (?:main )?hall)\\b`,
  `\\b(?:starts|started)\\s+(?:up|down)\\s+(?:the\\s+)?${STAIRS_N}\\b`,
  `\\b(?:starts|started)\\s+(?:up|down)\\b(?!\\s+(?:from|with|at|on|in|a|an|the)\\b)`,
  `\\b(?:footsteps?|steps?|tread)\\s+(?:descend(?:s|ed|ing)?\\b|ascend(?:s|ed|ing)?\\b|(?:reced(?:e|es|ed|ing)|fad(?:e|es|ed|ing)|retreat(?:s|ed|ing)?)\\s+(?:down(?:ward)?|up(?:ward)?|overhead|as (?:she|he|they) (?:descend|ascend|climb)\\w*))`,
  `\\bas (?:she|he) (?:descend|ascend|climb)(?:s|ed)\\b`,
  `\\b(?:footsteps?|steps?|tread)\\s+(?:were|was|are|is)\\s+(?:\\w+\\s+){0,2}?on the ${STAIRS_N}\\s+(?:down|up)\\b`,
  `\\b(?:footsteps?|steps?|tread)\\s+(?:were|was|are|is)\\s+(?:\\w+\\s+){0,2}?(?:going|heading|moving)\\s+(?:down|up)\\s+the\\s+(?:[a-z]+\\s+)?${STAIRS_N}\\b`,
  `\\bdisappear\\w*\\s+(?:around|up|down|beyond)\\s+(?:the\\s+\\w+\\s+of\\s+)?the\\s+(?:[a-z]+\\s+)?${STAIRS_N}(?:\\s+(?:above|below))?\\b`,
  `\\breach(?:es|ed)\\s+the\\s+(?:landing|top|bottom)\\s+(?:above|below)\\b`,
  `(?<=\\b(?:she|he)\\s)(?:went|goes)\\s+(?:up|down)\\b(?=\\s+(?:without|and|then)\\b|\\s*[.,;!])`,
  `\\bpassage\\s+(?:up|down)\\s+the\\s+${STAIRS_N}\\b`,
  `(?<=\\b(?:she|he)\\s)(?:climbs|climbed|ascends|ascended|descends|descended)\\s*,\\s*(?:her|his)\\s+(?:footsteps?|steps?)\\b`,
].join("|"), "i");
/**
 * Audit-only backstop (live batches 9 to 11): a sound or gesture that says someone went up or down by the stairs or out through a door, in any
 * wording ("her footsteps faded into the murmur of the hall below", "went down the stairs", "climbing them out of view", "the door opened and
 * closed"). It never produces a movement: an exit it detects that no committed move or leave_scene explains is withdrawn like any other.
 */
export const BROAD_EXIT = new RegExp([
  `\\b(?:footsteps?|steps|tread)\\b[^.]{0,100}?\\b(?:fad\\w+|reced\\w+|trail\\w*|died|dies|echo\\w*|diminish\\w*)\\b`,
  `\\b(?:went|goes|climbs?|climbed|climbing|descends?|descended|descending|ascends?|ascended|ascending)\\s+(?:down|up)\\s+the\\s+(?:[a-z]+\\s+)?${STAIRS_N}\\b`,
  `\\b(?:climbs?|climbed|climbing|descends?|descended|descending)\\s+(?:them|it)\\s+(?:out of|into)\\b`,
  `\\bopened and closed\\b|\\bopens and closes\\b`,
].join("|"), "i");
/** The door closing behind a person: the pronoun resolves to the nearest named subject. */
const DOOR_BEHIND = /\bdoor\b[^.!?]{0,110}\b(?:shut|closed|closes|closing|shuts|bang\w*|slam\w*|swung|swings|thud\w*)\b[^.!?]{0,20}\bbehind (?:him|her)\b|\blatch\s+click\w*\s+behind (?:him|her)\b|\b(?:swung|swings|fell|falls|fall|click\w*)\s+(?:shut|closed)\s+behind (?:him|her)\b/i;
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
export function narratedDepartures(narration: string, context: TurnContext, scope: "created" | "persistent" = "created", options: { readonly every?: boolean; readonly stairs?: boolean; readonly broad?: boolean } = {}): readonly DepartureEvidence[] {
  const every = options.every ?? false;
  const candidates = scope === "created" ? departureCandidates(context) : context.characters.filter(c => c.id !== "nicco" && c.current.status !== "dead").map(c => c.id);
  if (!candidates.length) return [];
  const people = namesOf(context);
  const anyName = new RegExp(`\\b(${people.flatMap(p => p.terms).map(esc).join("|") || "(?!)"})\\b`, "g");
  const out: DepartureEvidence[] = [];
  let lastSubject: Named | undefined;
  /** Every candidate named so far in the draft: when exactly one is compatible with the pronoun, a door closing "behind her" is theirs even when no sentence led with their name. */
  const named_ = new Set<string>();
  const onlyNamed = (pronoun: string) => { const want = /^her$/i.test(pronoun) ? "female" : "male"; const ids = [...named_].filter(id => { const p = people.find(q => q.id === id); return p && (!p.sex || p.sex === want); }); return ids.length === 1 ? ids[0] : undefined; };
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
    for (const m of plain.matchAll(anyName)) { const who = people.find(p => p.terms.includes(m[1]!)); if (who && candidates.includes(who.id)) named_.add(who.id); }
    const record = (id: string | undefined) => { if (id && candidates.includes(id) && (every ? !out.some(o => o.character_id === id && o.source_sentence === sentence) : !out.some(o => o.character_id === id))) out.push({ character_id: id, source_sentence: sentence }); };
    // The exit must be completed in its own clause.
    for (const clause of plain.split(/;|,\s*(?:but|while|as|though|although)\s+|\s+but\s+/)) {
      const act = DEPART_ACT.exec(clause);
      const stair = options.stairs ? STAIR_EXIT.exec(clause) ?? (options.broad ? BROAD_EXIT.exec(clause) : null) : null;
      // "moved toward the stairs and descended": the second verb is the completed act, so only it is held to the not-done gate.
      const stairGate = stair ? stair[0].slice(Math.max(0, stair[0].search(/\band\s+(?:descend|ascend|climb)/i))).replace(/\b(?:until|till)\b[^]*$/i, "") : "";
      if (stair && !NOT_DONE.test(stairGate)) {
        const before = clause.slice(0, stair.index), named = [...before.matchAll(anyName)].at(-1), gap = named ? before.slice(named.index + named[0].length) : before;
        const sound = /^(?:footsteps?|steps?|tread|passage)/i.test(stair[0]);
        if (sound && named && /^'s\s+(?:\w+\s+){0,2}$/.test(gap)) record(people.find(p => p.terms.includes(named[1]!))?.id);
        else if (sound && /(?:,|\band)\s*(?:her|his)\s+(?:\w+\s+){0,2}$/i.test(before) && subject) record(subject);
        else if (sound && /\b(?:her|his)\s+(?:\w+\s+){0,2}$/i.test(before)) record(named && !/\b[A-Z][a-z]+\b/.test(gap) ? people.find(p => p.terms.includes(named[1]!))?.id : antecedent(/\bher\b/i.test(before) ? "her" : "him"));
        else if (!sound && named && !/^'s\s+\w/.test(gap) && !/\b[A-Z][a-z]+\b/.test(gap)) record(people.find(p => p.terms.includes(named[1]!))?.id);
        else if (!sound && named && /^'s\s+\w/.test(gap) && pronounLead) record(subject);
        else if (!sound && !named && /\b(?:he|she)\b/i.test(before)) record(subject ?? antecedent(/\bshe\b/i.test(before) ? "she" : "he"));
        else if (!sound && !named && /,\s*(?:her|his)\s+(?:\w+\s+){0,2}$/i.test(before)) record(subject);
        else if (!sound && !named && /^\s*(?:her|his)\s+(?:footsteps?|steps?|tread)\b/i.test(before)) record(antecedent(/^\s*her\b/i.test(before) ? "her" : "him"));
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
        else if (named && /^'s\s+\w/.test(gap) && pronounLead) record(subject);
        else if (!named && /^\s*(?:he|she)\b/i.test(before)) record(subject);
        else if (!named && /\b(he|she)\s+(?:\w+\s+){0,4}$/i.test(before)) record(antecedent(before.match(/\b(he|she)\s+(?:\w+\s+){0,4}$/i)![1]!));
      }
      const door = clause.match(DOOR_BEHIND);
      // A leading name that is not a present character ("Maren steps inside and pulls the door shut behind her") is that person, never the last present subject.
      const unknownLead = !lead && !pronounLead && /^(?!(?:The|Then|Behind|Without|With|From|After|Before|Her|His|Their|There|Outside|Inside|Nicco)\b)[A-Z][a-z]{2,}\s+(?:\w+ly\s+)?(?:steps?|stepped|walks?|walked|comes?|came|enters?|entered|pushes|pushed|slips?|slipped|returns?|returned|arrives?|arrived|pulls?|pulled|closes|closed|shuts?)\b/.test(plain);
      // "steps inside, letting the door fall shut behind her" is an arrival, not an exit.
      const entering = door ? /\b(?:steps?|stepped|comes?|came|walks?|walked|slips?|slipped|enters?|entered|moves?|moved|ducks?|ducked)\s+(?:back\s+)?(?:inside\b|in\b(?!to)|into the (?:room|hall)\b)/i.test(clause.slice(0, door.index)) : false;
      if (door && !NOT_DONE.test(clause) && !unknownLead && !entering) { const pr = door[0].endsWith("her") ? "her" : "him"; const a = antecedent(pr); record(subject ?? (a && candidates.includes(a) ? a : onlyNamed(pr))); }
    }
    // H1: "Dell and Bram …" / "Dell, Bram and …" is a compound subject: no single referent for a later pronoun.
    if (lead) lastSubject = new RegExp(`^(?:${lead.terms.map(esc).join("|")})(?:,\\s*|\\s+(?:and|or)\\s+)(?:the\\s+)?${anyName.source}`, "i").test(plain) ? undefined : lead;
  }
  return out;
}

/**
 * Final movement closure: the vertical direction a completed stair exit states, or undefined when it states none or both. Only stair-specific
 * words count ("up from her chair" or "climbed onto the bed" say nothing); "starts", "about to" and the like are incomplete and give nothing.
 */
/** A conjoined "followed him" form: an exit that depends on Nicco's own (uncommitted) departure. */
export const FOLLOWS_NICCO = /\b(?:follow(?:s|ed)?|trail(?:s|ed)?)\s+(?:him|nicco|after)\b|\b(?:comes?|came|goes?|went)\s+after\s+(?:him|nicco)\b|\b(?:falls?|fell)\s+into\s+step\b/i;
export function stairDirection(sentence: string): "UP" | "DOWN" | undefined {
  const plain = blankQuotes(sentence);
  if (/\b(?:starts?|started|begins?|began|about to|tries|tried|pauses?|paused|stops?|stopped)\s+(?:to\s+)?(?:up|down|descend|ascend|climb|go|head|walk)/i.test(plain)) return undefined;
  const stairNoun = /\b(?:stairs?|steps|staircase|stairway|stairwell|stairhead|landing)\b/i.test(plain);
  const down = stairNoun && /\b(?:went|goes)\s+down\b|\blanding\s+below\b/i.test(plain) || /\b(?:descend\w*|downstairs|(?:staircase|stairs|stairway|stairwell)\s+below|(?:stairs?|staircase|stairway|stairwell)\s+down|down (?:the )?(?:stairs?|steps|staircase|stairway|stairwell))\b/i.test(plain) || /\b(?:footsteps?|steps|tread)\b[^.]*\b(?:fad\w+|reced\w+|retreat\w*)\s+down(?:ward)?\b/i.test(plain);
  const up = stairNoun && /\b(?:went|goes)\s+up\b|\blanding\s+above\b/i.test(plain) || /\b(?:ascend\w*|upstairs|(?:staircase|stairs|stairway|stairwell)\s+above|(?:stairs?|staircase|stairway|stairwell)\s+up|up (?:the )?(?:stairs?|steps|staircase|stairway|stairwell)|as (?:she|he) climb(?:s|ed))\b/i.test(plain) || /\bclimb\w*\b/i.test(plain) && /\b(?:stairs?|steps|staircase|stairway|stairwell|stairhead)\b/i.test(plain) || /\b(?:footsteps?|steps|tread)\b[^.]*\b(?:fad\w+|reced\w+|retreat\w*)\s+(?:up(?:ward)?|overhead)\b/i.test(plain) || /\bclimb\w*\b/i.test(plain) && /\boverhead\b/i.test(plain);
  return down === up ? undefined : down ? "DOWN" : "UP";
}
