import type { TurnContext } from "./context-builder.js";
import { actionSegments, sceneDirection } from "./natural-actions.js";
import type { PhysicalCondition } from "./physical-interaction.js";
import { DEPART_ACT } from "./scene-departure.js";
import { GATES } from "./language/gates.js";
import { escapeRegExp as esc } from "./language/text.js";

/**
 * Runtime Continuity Repair 1: PlayerAuthoredEventEvidence. Physical/social facts the player explicitly asserts in the CURRENT
 * input's action text (*asterisks*, or an all third-person scene direction). Not persistent state and not a semantic event
 * engine: a bounded clause grammar for the families the narration audit needs (grab/restraint, shove, strike, explicit injury,
 * spill/knock-over, departure). Each event authorizes only the authored fact itself, never an escalated consequence.
 *
 * Actor resolution: a clause subject (a present character's name, "Nicco"/"I", "the man"/"the woman" when exactly one present
 * non-Nicco character has that sex, or a pronoun/verb-led clause continuing the previous subject in the same sentence).
 * Target resolution: when someone other than Nicco acts, "him"/"his"/"Nicco" is Nicco (the player writes Nicco in the third
 * person); when Nicco acts, a pronoun is the single present character of that sex. Unresolved references stay undefined.
 * Negated, hedged, conditional, intended or threatened acts are recorded with negated: true and authorize nothing.
 */
export type PlayerEventClass = "grab" | "shove" | "strike" | "injury" | "spill" | "departure";
/** Severe outcomes are never implied by another class; they count only when the player writes them. */
export type SevereOutcome = "broken_bone" | "unconscious" | "death" | "severed";
export interface PlayerAuthoredEvent {
  readonly actor_id?: string; readonly target_id?: string; readonly action_class: PlayerEventClass;
  readonly evidence_quote: string; readonly negated: boolean;
  /** injury only: the recorded-condition vocabulary tag, or a severe outcome, the player explicitly wrote. */
  readonly condition?: PhysicalCondition; readonly severe?: SevereOutcome;
}

const NEGATED = GATES.player_event_negated;
const CLASS_VERBS: readonly (readonly [PlayerEventClass, RegExp])[] = [
  ["grab", /\b(?:grab(?:s|bed|bing)?|seiz(?:es|ed|ing|e)|grip(?:s|ped|ping)?|clutch(?:es|ed|ing)?|takes? hold of|took hold of|yank(?:s|ed|ing)?|catch(?:es)? (?:him|her|hold)|caught (?:him|her|hold))\b/i],
  ["shove", /\b(?:shov(?:es|ed|ing|e)|push(?:es|ed|ing)?|thrust(?:s|ing)?|barges? into|slams? into|shoulders? (?:him|her|nicco))\b/i],
  ["strike", /\b(?:punch(?:es|ed|ing)?|hits?|hitting|strik(?:es|ing|e)|struck|slap(?:s|ped|ping)?|kick(?:s|ed|ing)?|headbutt\w*|elbow(?:s|ed)|kne(?:es|ed)|smack(?:s|ed)?|swings? at|swung at)\b/i],
  ["injury", /\b(?:cut(?:s|ting)?|slash\w*|gash\w*|stab(?:s|bed|bing)?|bloodie[sd]|bloody|bleed\w*|bled|bruis\w*|splits? (?:his|her|their) (?:lip|brow)|break(?:s|ing)?|broke|snap(?:s|ped)?|fractur\w*|knock(?:s|ed)? (?:\w+ )?(?:down|out|unconscious|off (?:his|her) feet)|wind(?:s|ed)? (?:him|her)|kill(?:s|ed)?|sever(?:s|ed)?|daz(?:es|ed))\b/i],
  ["spill", /\b(?:spill(?:s|ed|ing)?|spilt|knock(?:s|ed|ing)? (?:over )?(?:the |his |her |a |nicco's |their )?(?:[\w']+ )?(?:cup|mug|drink|glass|tankard|bowl|jug|bottle|plate|ale|stool|chair)|upend\w*|tips? over|tipped over|overturn\w*)\b/i],
];
const CONDITION_OF: readonly (readonly [PhysicalCondition, RegExp])[] = [
  ["minor_injury", /\b(?:cut|slash|gash|stab|bloodie|bloody|bleed|bled|bruis|split)\w*/i],
  ["knocked_down", /\bknock\w* (?:\w+ )?(?:down|off (?:his|her) feet)\b|\b(?:falls?|fell)\b/i],
  ["winded", /\bwind(?:s|ed)? (?:him|her)\b|\bwinded\b/i],
  ["dazed", /\bdaz(?:es|ed)\b/i],
];
export const SEVERE_TERMS: Readonly<Record<SevereOutcome, RegExp>> = {
  broken_bone: /\b(?:(?:break|breaks|broke|broken|snaps?|snapped|cracks?|cracked|fractur\w*|shatter\w*)\b[^.!?]{0,30}\b(?:bone|wrist|arm|ribs?|leg|jaw|nose|fingers?|hand|collarbone|skull|neck|ankle|shoulder)s?\b|(?:bone|wrist|arm|ribs?|leg|jaw|fingers?|collarbone|skull|neck|ankle)s?\b[^.!?]{0,20}\b(?:breaks|broke|broken|snaps|snapped|cracks|cracked|fractur\w*|shatter\w*))\b/i,
  unconscious: /\b(?:unconscious|senseless|knock\w* (?:\w+ )?out\b(?! of)|out cold|passes out|passed out|blacks? out|blacked out|lights go out)\b/i,
  death: /\b(?:dies|died|dead|kill(?:s|ed)|lifeless|breathes his last|stops breathing)\b/i,
  severed: /\b(?:sever(?:s|ed)?|cut off|lopped off|amputat\w*|permanent(?:ly)? (?:damage|injur\w*|crippl\w*|lame)|crippl\w*|paralys\w*|paralyz\w*|nerve damage)\b/i,
};
const SEVERE_ORDER = Object.keys(SEVERE_TERMS) as SevereOutcome[];

const sexOf = (c: TurnContext["characters"][number]) => { const p = (c as { pronoun?: string }).pronoun; return (c.profile.sex ?? (p === "he" ? "male" : p === "she" ? "female" : undefined))?.toLowerCase(); };

export function playerAuthoredEvents(input: string, context: TurnContext): readonly PlayerAuthoredEvent[] {
  const segments = [...actionSegments(input), ...(actionSegments(input).length ? [] : sceneDirection(input, context))];
  if (!segments.length) return [];
  const npcs = context.characters.filter(c => c.id !== "nicco");
  const bySex = (sex: string) => { const found = npcs.filter(c => sexOf(c) === sex); return found.length === 1 ? found[0]!.id : undefined; };
  const names = npcs.map(c => ({ id: c.id, re: new RegExp(`^(?:${[c.profile.name ?? c.id, ...(c.profile.name ?? "").split(/\s+/).filter(t => t.length > 2)].map(esc).join("|")})(?:'s)?\\b`, "i") }));
  const subjectOf = (clause: string): { id?: string; rest: string } | undefined => {
    const c = clause.replace(/^(?:then|suddenly|finally|also)\s+/i, "");
    const named = names.find(n => n.re.test(c));
    if (named) return { id: named.id, rest: c.replace(named.re, "").trim() };
    let m: RegExpMatchArray | null;
    if ((m = c.match(/^(?:nicco|i)\b\s*/i))) return { id: "nicco", rest: c.slice(m[0].length) };
    if ((m = c.match(/^(?:the|that|this)\s+(?:[\w'-]+\s+){0,2}?(man|woman|guy|fellow|lady|patron|drunk|dockworker|stranger|officer|captain|guard)\b\s*/i))) {
      const noun = m[1]!.toLowerCase();
      const id = /^(?:man|guy|fellow)$/.test(noun) ? bySex("male") : /^(?:woman|lady)$/.test(noun) ? bySex("female")
        : (() => { const found = npcs.filter(x => new RegExp(`\\b${noun}\\b`, "i").test(`${x.profile.name ?? ""} ${x.profile.appearance?.description ?? ""} ${x.current.presentation ?? ""}`)); return found.length === 1 ? found[0]!.id : undefined; })();
      return { ...(id ? { id } : {}), rest: c.slice(m[0].length) };
    }
    if ((m = c.match(/^(?:he|she|they)\b\s*/i))) return { rest: c.slice(m[0].length) }; // continues the current subject
    if ((m = c.match(/^(?:the|a|an|his|her|its)\s+(?:[\w'-]+\s+){0,2}?(?:blade|knife|dagger|sword|fist|bottle|mug|cup|chair|stool|club|blow|punch|shove)\b\s*/i))) return { rest: c.slice(m[0].length), id: "__thing__" };
    return undefined;
  };
  /** The object phrase right after the matched verb ("grabs | his arm", "catches him |", "shoves | him in the chest"). */
  const targetOf = (verbMatch: string, after: string, actor: string | undefined): string | undefined => {
    const t = `${/\b(him|her|nicco)$/i.exec(verbMatch)?.[1] ?? ""} ${after}`.trim().replace(/^(?:(?:into|at|against|on|onto|of)\s+)+/i, "");
    const named = names.find(n => n.re.test(t)); if (named) return named.id;
    if (/^(?:nicco|me)\b/i.test(t)) return "nicco";
    if (/^(?:him|his)\b/i.test(t)) return actor && actor !== "nicco" ? "nicco" : actor === "nicco" ? bySex("male") : "nicco";
    if (/^(?:her)\b/i.test(t)) return actor === "nicco" ? bySex("female") : bySex("female");
    if (/^(?:the|that)\s+(?:man|guy|fellow)\b/i.test(t)) return bySex("male");
    return undefined;
  };
  const events: PlayerAuthoredEvent[] = [];
  for (const segment of segments) for (const sentence of segment.split(/(?<=[.!?])\s+/)) {
    let subject: string | undefined = "nicco";
    for (const raw of sentence.split(/,\s*(?:and\s+then\s+|and\s+|then\s+)?|;\s*|\s+(?:and then|then|and|before|after)\s+|^when\s+|\s+when\s+/i).map(c => c.trim()).filter(Boolean)) {
      const clause = raw.replace(/^(?:when|as|while|once)\s+/i, "");
      const s = subjectOf(clause);
      if (s?.id) subject = s.id === "__thing__" ? undefined : s.id;
      const actor = subject, rest = s ? s.rest : clause;
      const negated = NEGATED.test(clause);
      for (const [action_class, verb] of CLASS_VERBS) {
        const m = verb.exec(rest); if (!m) continue;
        const target = action_class === "spill" ? undefined : targetOf(m[0], rest.slice(m.index + m[0].length), actor) ?? (action_class === "injury" && actor !== "nicco" && /\b(?:his|him)\b/i.test(rest) ? "nicco" : undefined);
        const condition = action_class === "injury" || action_class === "strike" ? CONDITION_OF.find(([, r]) => r.test(rest))?.[0] : undefined;
        const severe = SEVERE_ORDER.find(k => SEVERE_TERMS[k].test(rest));
        events.push({ ...(actor && actor !== "__thing__" ? { actor_id: actor } : {}), ...(target ? { target_id: target } : {}), action_class, evidence_quote: clause, negated,
          ...(condition ? { condition } : {}), ...(severe && action_class === "injury" ? { severe } : {}) });
      }
      if (DEPART_ACT.test(rest) && actor && actor !== "nicco") events.push({ actor_id: actor, action_class: "departure", evidence_quote: clause, negated: negated || /\b(?:toward|towards|for the door)\b/i.test(clause) });
    }
  }
  return Object.freeze(events.map(e => Object.freeze(e)));
}
/** Non-negated authored events of these classes on a target (the audit's first authority). */
export function authoredOn(events: readonly PlayerAuthoredEvent[], target: string, classes: readonly PlayerEventClass[]): readonly PlayerAuthoredEvent[] {
  return events.filter(e => !e.negated && e.target_id === target && classes.includes(e.action_class));
}
