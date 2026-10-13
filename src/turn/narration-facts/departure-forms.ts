import type { TurnContext } from "../context-builder.js";
import { blankQuotes, escapeRegExp as esc } from "../language/text.js";
import { GATES } from "../language/gates.js";
import { rpgNarration } from "../rpg-dialogue.js";
import { narratorIdentityGate } from "../narrator-identity.js";
import { type NarrationFrame, spanOf } from "./frame.js";
import { firstNonCompleted, modalityOf, polarityOf } from "./modality.js";
import type { EntityDepartedFact, EntityPresentFact, FactEntityRef, FactModality } from "./types.js";
import { BACK_OUT, BROAD_EXIT, DEPART_ACT, LOCAL_ENTRY, EPHEMERAL_EXIT, DOOR_BEHIND, FOLLOWS_NICCO, STAIRS_N, STAIR_EXIT, STAIR_WORD, TRACE_ACT, TRACE_SUBJECT } from "./movement-vocabulary.js";

const NOT_DONE = GATES.departure_not_done;

/**
 * Vertical direction a stair exit states, or undefined when it states none or both. Only stair-specific words count ("up from her chair"
 * says nothing); "starts", "about to" and the like are incomplete and give nothing.
 */
export function stairDirection(sentence: string): "UP" | "DOWN" | undefined {
  const plain = blankQuotes(sentence).replace(/\*/g, " ");
  if (/\b(?:starts?|started|begins?|began|about to|tries|tried|pauses?|paused|stops?|stopped)\s+(?:to\s+)?(?:up|down|descend|ascend|climb|go|head|walk)/i.test(plain)) return undefined;
  const stairNoun = /\b(?:stairs?|steps|staircase|stairway|stairwell|stairhead|landing)\b/i.test(plain);
  const down = stairNoun && /\b(?:went|goes)\s+down\b|\blanding\s+below\b/i.test(plain) || /\b(?:descend\w*|downstairs|(?:staircase|stairs|stairway|stairwell)\s+below|(?:stairs?|staircase|stairway|stairwell)\s+down|down (?:the )?(?:stairs?|steps|staircase|stairway|stairwell))\b/i.test(plain) || /\b(?:footsteps?|steps|tread)\b[^.]*\b(?:fad\w+|reced\w+|retreat\w*)\s+down(?:ward)?\b/i.test(plain);
  const up = stairNoun && /\b(?:went|goes)\s+up\b|\blanding\s+above\b/i.test(plain) || /\b(?:ascend\w*|upstairs|(?:staircase|stairs|stairway|stairwell)\s+above|(?:stairs?|staircase|stairway|stairwell)\s+up|up (?:the )?(?:stairs?|steps|staircase|stairway|stairwell)|as (?:she|he) climb(?:s|ed))\b/i.test(plain) || /\bclimb\w*\b/i.test(plain) && /\b(?:stairs?|steps|staircase|stairway|stairwell|stairhead)\b/i.test(plain) || /\b(?:footsteps?|steps|tread)\b[^.]*\b(?:fad\w+|reced\w+|retreat\w*)\s+(?:up(?:ward)?|overhead)\b/i.test(plain) || /\bclimb\w*\b/i.test(plain) && /\boverhead\b/i.test(plain);
  return down === up ? undefined : down ? "DOWN" : "UP";
}

/** Raw place wording near a destination-less door exit ("the courtyard door", "the door that leads out to the courtyard", "through the door into the walled courtyard"), in recognition order. */
function doorPlaces(frame: NarrationFrame, at: number): readonly string[] {
  const all = frame.sentences.map((_, i) => frame.prose(i)), out: string[] = [];
  for (const x of all.slice(Math.max(0, at - 4), at + 1)) {
    for (const m of x.matchAll(/\b((?:[a-z]+\s+)?[a-z]+)\s+(?:door|doorway|gate|archway)\b/gi)) out.push(m[1]!.replace(/^(?:the|a|an|that|this|her|his|open|opened|heavy|wooden|oak|small|narrow|front|back|side)\s+/i, ""));
    for (const m of x.matchAll(/\b(?:door|doorway|gate|archway|passage)\b[^.;]{0,30}?\b(?:to|onto|into|toward|towards|out to|out onto|out into)\s+(?:the\s+)?((?:[a-z]+\s+){0,2}[a-z]+)/gi)) out.push(m[1]!);
  }
  for (const x of [at > 0 && /\b(?:door|through|steps?|stepp\w+)\b/i.test(all[at - 1]!) ? all[at - 1]! : "", all[at]!]) for (const m of x.matchAll(/\b(?:into|onto|out to|out into|out onto)\s+(?:the\s+)?((?:[a-z]+\s+){0,2}[a-z]+)/gi)) out.push(m[1]!);
  return out;
}

interface Named { readonly id: string; readonly terms: readonly string[]; readonly sex?: "female" | "male" }
/** Established sex only (declared profile or authored pronoun), never inferred from a name; unknown is compatible with any pronoun. */
const namesOf = (context: TurnContext): Named[] => context.characters.map(c => {
  const name = c.profile.name ?? c.id;
  const declared = (c.profile.sex ?? "").toLowerCase(), pronoun = "pronoun" in c ? c.pronoun : undefined;
  const sex = /^(?:female|woman)$/.test(declared) || pronoun === "she" ? "female" as const : /^(?:male|man)$/.test(declared) || pronoun === "he" ? "male" as const : undefined;
  return { id: c.id, terms: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(sex ? { sex } : {}) };
});

const flags = (frame: NarrationFrame, at: number, sentence: string) => ({
  stairs_mentioned: STAIR_WORD.test(sentence), follows_player: FOLLOWS_NICCO.test(sentence), direction: stairDirection(sentence), door_places: doorPlaces(frame, at),
});
const ref = (surface: string, id: string | undefined, resolution: FactEntityRef["resolution"]): FactEntityRef =>
  id ? { surface, entity_id: id, resolution, candidates: [id] } : { surface, resolution: "unresolved", candidates: [] };

/**
 * The SCENE reading of exits: who, among the people present, narration says completed an exit (an exit act, a stair exit, a sound or
 * trace of one, a door closing behind someone). The subject follows the sentence subject ("Dell glares at Nicco. He leaves." is Dell);
 * a compound subject leaves a later pronoun unresolved; an established incompatible sex is never the referent. Dialogue is ignored.
 */
export function sceneDepartureFacts(frame: NarrationFrame, context: TurnContext): EntityDepartedFact[] {
  const candidates = context.characters.filter(c => c.id !== "nicco" && c.current.status !== "dead").map(c => c.id);
  if (!candidates.length) return [];
  const people = namesOf(context);
  const anyName = new RegExp(`\\b(${people.flatMap(p => p.terms).map(esc).join("|") || "(?!)"})\\b`, "g");
  const out: EntityDepartedFact[] = [];
  let lastSubject: Named | undefined;
  /** Every candidate named so far: when exactly one is compatible with the pronoun, a door closing "behind her" is theirs even when no sentence led with their name. */
  const named_ = new Set<string>();
  const onlyNamed = (pronoun: string) => { const want = /^her$/i.test(pronoun) ? "female" : "male"; const ids = [...named_].filter(id => { const p = people.find(q => q.id === id); return p && (!p.sex || p.sex === want); }); return ids.length === 1 ? ids[0] : undefined; };
  const antecedent = (pronoun: string) => {
    const want = /^(?:she|her)$/i.test(pronoun) ? "female" : "male";
    return lastSubject && (!lastSubject.sex || lastSubject.sex === want) ? lastSubject.id : undefined;
  };
  frame.sentences.forEach((sentence, at) => {
    const plain = frame.prose(at).trim().replace(/^(?:then|finally|at last),?\s+/i, "");
    // "Maren's gaze moved…" — a possessive body-part or expression subject is still that person ("Dell's patience is gone" stays excluded).
    const lead = people.find(p => new RegExp(`^(?:${p.terms.map(esc).join("|")})(?:\\b(?!'s\\s+(?!gone\\b))|'s\\s+(?:gaze|eyes|face|expression|hand|hands|voice|head|attention|mouth|brow|shoulders?)\\b)`).test(plain));
    const pronounLead = plain.match(/^(he|she)\b/i);
    const subject = lead?.id ?? (pronounLead ? antecedent(pronounLead[1]!) : undefined);
    for (const m of plain.matchAll(anyName)) { const who = people.find(p => p.terms.includes(m[1]!)); if (who && candidates.includes(who.id)) named_.add(who.id); }
    plain.split(/;|,\s*(?:but|while|as|though|although)\s+|\s+but\s+/).forEach((clause, ci) => {
      const emit = (id: string | undefined, surface: string, resolution: FactEntityRef["resolution"], form: EntityDepartedFact["form"], matched: string, modality: FactModality, destination?: string) => {
        const subjectRef = ref(surface, id, resolution);
        out.push({ kind: "entity_departed", form, span: spanOf(frame, at, ci, matched), sentence, subject: subjectRef, modality, polarity: polarityOf(modality), confidence: form === "exit_broad" || form === "exit_door_behind" ? "low" : resolution === "name" ? "high" : "medium",
          ambiguity: id ? "none" : "unresolved", provenance: { extractor: "movement", form }, ...(destination ? { destination: { phrase: destination } } : {}), ...flags(frame, at, sentence), reading: "scene" });
      };
      const act = DEPART_ACT.exec(clause);
      const stairX = STAIR_EXIT.exec(clause), broadX = stairX ? null : BROAD_EXIT.exec(clause), stair = stairX ?? broadX;
      if (stair) {
        // "moved toward the stairs and descended": the second verb is the completed act, so only it is held to the not-done gate.
        const stairGate = stair[0].slice(Math.max(0, stair[0].search(/\band\s+(?:descend|ascend|climb)/i))).replace(/\b(?:until|till)\b[^]*$/i, "");
        const modality = modalityOf(stairGate, NOT_DONE), form = stairX ? "exit_stairs" as const : "exit_broad" as const;
        const before = clause.slice(0, stair.index), named = [...before.matchAll(anyName)].at(-1), gap = named ? before.slice(named.index + named[0].length) : before;
        const sound = /^(?:footsteps?|steps?|tread|passage)/i.test(stair[0]);
        const idOf = (t: string) => people.find(p => p.terms.includes(t))?.id;
        if (sound && named && /^'s\s+(?:\w+\s+){0,2}$/.test(gap)) emit(idOf(named[1]!), named[1]!, "name", form, stair[0], modality);
        else if (sound && /(?:,|\band)\s*(?:her|his)\s+(?:\w+\s+){0,2}$/i.test(before) && subject) emit(subject, "subject", "antecedent", form, stair[0], modality);
        else if (sound && /\b(?:her|his)\s+(?:\w+\s+){0,2}$/i.test(before)) { const id = named && !/\b[A-Z][a-z]+\b/.test(gap) ? idOf(named[1]!) : antecedent(/\bher\b/i.test(before) ? "her" : "him"); emit(id, named?.[1] ?? "her", named && !/\b[A-Z][a-z]+\b/.test(gap) ? "name" : "antecedent", form, stair[0], modality); }
        else if (!sound && named && !/^'s\s+\w/.test(gap) && !/\b[A-Z][a-z]+\b/.test(gap)) emit(idOf(named[1]!), named[1]!, "name", form, stair[0], modality);
        else if (!sound && named && /^'s\s+\w/.test(gap) && pronounLead) emit(subject, pronounLead[1]!, "antecedent", form, stair[0], modality);
        else if (!sound && !named && /\b(?:he|she)\b/i.test(before)) emit(subject ?? antecedent(/\bshe\b/i.test(before) ? "she" : "he"), /\bshe\b/i.test(before) ? "she" : "he", "pronoun", form, stair[0], modality);
        else if (!sound && !named && /,\s*(?:her|his)\s+(?:\w+\s+){0,2}$/i.test(before)) emit(subject, "subject", "antecedent", form, stair[0], modality);
        else if (!sound && !named && /^\s*(?:her|his)\s+(?:footsteps?|steps?|tread)\b/i.test(before)) emit(antecedent(/^\s*her\b/i.test(before) ? "her" : "him"), /^\s*her\b/i.test(before) ? "her" : "his", "antecedent", form, stair[0], modality);
      }
      const noun = !act && !stair ? clause.match(/\b([A-Z][\w-]*)'s\s+(?:departure|exit)\b/) : null;
      if (noun) emit(people.find(p => p.terms.includes(noun[1]!))?.id, noun[1]!, "name", "exit_noun", noun[0], modalityOf(clause.slice(0, noun.index! + noun[0].length), NOT_DONE));
      if (act && !localReturn(frame, at, act, plain.slice(0, plain.indexOf(clause)) + clause.slice(0, act.index))) {
        const modality = modalityOf(clause.slice(0, act.index + act[0].length), NOT_DONE);
        const before = clause.slice(0, act.index), named = [...before.matchAll(anyName)].at(-1), gap = named ? before.slice(named.index + named[0].length) : before;
        // Actor: the last name before the act, not possessive ("Dell's patience is gone"), with no other capitalized name or instruction frame in between.
        if (named && !/^'s\s+\w/.test(gap) && !/\b[A-Z][a-z]+\b/.test(gap)) emit(people.find(p => p.terms.includes(named[1]!))?.id, named[1]!, "name", "exit_act", act[0], modality);
        else if (named && /^'s\s+\w/.test(gap) && pronounLead) emit(subject, pronounLead[1]!, "antecedent", "exit_act", act[0], modality);
        else if (!named && /^\s*(?:he|she)\b/i.test(before)) emit(subject, before.trim().split(/\s+/)[0]!, "antecedent", "exit_act", act[0], modality);
        else if (!named && /\b(he|she)\s+(?:\w+\s+){0,4}$/i.test(before)) { const p = before.match(/\b(he|she)\s+(?:\w+\s+){0,4}$/i)![1]!; emit(antecedent(p), p, "pronoun", "exit_act", act[0], modality); }
      }
      const door = clause.match(DOOR_BEHIND);
      // A leading name that is not a present character ("Maren steps inside and pulls the door shut behind her") is that person, never the last present subject.
      const unknownLead = !lead && !pronounLead && /^(?!(?:The|Then|Behind|Without|With|From|After|Before|Her|His|Their|There|Outside|Inside|Nicco)\b)[A-Z][a-z]{2,}\s+(?:\w+ly\s+)?(?:steps?|stepped|walks?|walked|comes?|came|enters?|entered|pushes|pushed|slips?|slipped|returns?|returned|arrives?|arrived|pulls?|pulled|closes|closed|shuts?)\b/.test(plain);
      // "steps inside, letting the door fall shut behind her" is an arrival, not an exit.
      const entering = door ? /\b(?:steps?|stepped|comes?|came|walks?|walked|slips?|slipped|enters?|entered|moves?|moved|ducks?|ducked)\s+(?:back\s+)?(?:inside\b|in\b(?!to)|into the (?:room|hall)\b)/i.test(clause.slice(0, door.index)) : false;
      if (door && !unknownLead && !entering) {
        const pr = door[0].endsWith("her") ? "her" : "him", a = antecedent(pr);
        emit(subject ?? (a && candidates.includes(a) ? a : onlyNamed(pr)), pr, subject ? "antecedent" : "pronoun", "exit_door_behind", door[0], modalityOf(clause, NOT_DONE));
      }
    });
    // A compound subject ("Dell and Bram …", "Dell, Bram and …") has no single referent for a later pronoun.
    if (lead) lastSubject = new RegExp(`^(?:${lead.terms.map(esc).join("|")})(?:,\\s*|\\s+(?:and|or)\\s+)(?:the\\s+)?${anyName.source}`, "i").test(plain) ? undefined : lead;
  });
  return out;
}

const canonicalActorTerms = (context: TurnContext, id: string, name: string): readonly string[] => {
  const identity = narratorIdentityGate(context)?.identities.get(id);
  return [name, id, identity?.ref, identity?.observable_label].filter((x): x is string => !!x);
};
/** "steps back out" right after the same beat stepped into a pen / cage / gate (this sentence or the previous one): a local return, not an exit. */
function localReturn(frame: NarrationFrame, at: number, act: RegExpExecArray, before: string): boolean {
  return BACK_OUT.test(act[0]) && (LOCAL_ENTRY.test(before) || (at > 0 && LOCAL_ENTRY.test(frame.prose(at - 1))));
}
function departureSentences(frame: NarrationFrame): readonly { source: string; plain: string; at: number }[] {
  const spans = frame.narration.includes("*") ? rpgNarration(frame.narration) : undefined;
  return frame.sentences.flatMap((source, at) => !spans || spans.some(span => span.includes(source))
    ? [{ source, at, plain: blankQuotes(source).replace(/\*/g, "").trim().replace(/^(?:then|finally|at last|a moment later),?\s+/i, "") }] : []);
}

/**
 * The CLAIM reading of exits: broader than the scene reading on purpose (an audit must also see ambiguous or contradictory completed exits
 * by canonical people, by an identity term or description, or by an absent authored person). A claim names every person the sentence could
 * mean and says whether it is ambiguous.
 */
export function claimDepartureFacts(frame: NarrationFrame, context: TurnContext, absent: readonly { readonly id: string; readonly name: string }[]): EntityDepartedFact[] {
  const actors = [...context.characters.filter(c => c.id !== "nicco" && c.origin.kind === "canonical" && c.current.status !== "dead"), ...absent.map(c => ({ id: c.id, profile: { name: c.name } }))];
  const terms = (id: string, name: string) => canonicalActorTerms(context, id, name);
  const out: EntityDepartedFact[] = [];
  let previous: readonly string[] = [];
  for (const { source, plain, at } of departureSentences(frame)) {
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
    if (!act || localReturn(frame, at, act, plain.slice(0, act.index))) continue;
    const prefix = plain.slice(0, act.index + act[0].length);
    // Possessive traces are whitelisted; an abstract possession being "gone" is never departure.
    if (explicit.length && /^(?:'s|\u2019s)\s+/.test(tail) && !physicalTrace && !/^(?:'s|\u2019s)\s+(?:long\s+)?gone\b/i.test(tail)) continue;
    // Intention/negation/instruction gates apply before the completion cue, not a following "until he is gone".
    const modality = firstNonCompleted(modalityOf(prefix, NOT_DONE), modalityOf(plain.slice(act.index + act[0].length), GATES.past_displacement),
      modalityOf(plain, /\b(?:if|unless|will|would|could|should|might|may)\b/i), /\b(?:had|used to|remembers?|recalls?)\b/i.test(prefix) ? "habitual" : "completed",
      /\b(?:tells?|asks?|orders?|urges?|invites?)\b[\s\S]*?\bto\b/i.test(prefix) ? "requested" : "completed");
    const multiple = actors.filter(c => terms(c.id, c.profile.name ?? c.id).some(t => new RegExp(`\\b${esc(t)}\\b`, "i").test(plain))).length > 1;
    const uncertainDescriptor = !explicit.length && !!descriptor && ids.some(id => !context.characters.find(c => c.id === id)?.profile.sex);
    const ambiguous = ids.length !== 1 || compound || multiple || uncertainDescriptor;
    for (const id of ids) if (actors.some(c => c.id === id)) {
      const surface = explicit.length ? leadTerm ?? id : pronoun ? plain.match(/^\w+/)![0] : descriptor![0];
      out.push({ kind: "entity_departed", form: act === traceAct ? "exit_trace" : "exit_act", span: spanOf(frame, at, 0, act[0]), sentence: source,
        subject: { surface, entity_id: id, resolution: explicit.length ? "term" : pronoun ? "antecedent" : "descriptor", candidates: ids },
        modality, polarity: polarityOf(modality), confidence: ambiguous ? "low" : "medium", ambiguity: ambiguous ? "ambiguous" : "none", provenance: { extractor: "movement", form: act === traceAct ? "exit_trace" : "exit_act" },
        ...flags(frame, at, source), reading: "claim" });
    }
  }
  return out;
}

/** Presence after an exit: an actor-bound sentence that returns, re-enters, speaks from inside, interrupts, or stands beside the player / in the room. */
export function presenceClaimFacts(frame: NarrationFrame, context: TurnContext): EntityPresentFact[] {
  const out: EntityPresentFact[] = [];
  const presence = /\b(?:returns?|returned|reenters?|reentered|arrives?|arrived|steps? back inside|speaks? from inside|stops? before|pauses? at|is interrupted|(?:is |stands? |standing )beside Nicco|(?:is |stands? |standing )(?:still )?(?:in|inside) the (?:room|hall))\b/i;
  for (const actor of context.characters.filter(c => c.id !== "nicco")) {
    let bound = false;
    for (const { source, plain, at } of departureSentences(frame)) {
      const lead = canonicalActorTerms(context, actor.id, actor.profile.name ?? actor.id).find(t => new RegExp(`^${esc(t)}\\b`, "i").test(plain));
      if (lead) bound = true;
      else if (!/^(?:he|she|his|her)\b/i.test(plain)) bound = false;
      const m = presence.exec(plain);
      if (bound && m) {
        const modality = modalityOf(plain, GATES.movement_not_done);
        out.push({ kind: "entity_present", form: "presence_claim", span: spanOf(frame, at, 0, m[0]), sentence: source, subject: { surface: lead ?? plain.match(/^\w+/)![0], entity_id: actor.id, resolution: lead ? "term" : "antecedent", candidates: [actor.id] },
          modality, polarity: polarityOf(modality), confidence: "medium", ambiguity: "none", provenance: { extractor: "movement", form: "presence_claim" } });
      }
    }
  }
  return out;
}
export { STAIRS_N };

/**
 * Exits of TEMPORARY participants (unnamed people the scene invented, never saved): "the woman hurries away", "she walks off". The
 * participants are named by role noun or by a pronoun that, in the registry's single-focus reading, means the focus participant.
 */
export function ephemeralDepartureFacts(frame: NarrationFrame, participants: readonly { readonly id: string; readonly nouns: readonly string[] }[]): EntityDepartedFact[] {
  const out: EntityDepartedFact[] = [];
  for (const p of participants) {
    const subject = new RegExp(`\\b(?:she|he|they|the\\s+(?:${p.nouns.join("|")}))\\b`, "i");
    frame.sentences.forEach((sentence, at) => {
      const plain = frame.prose(at), m = EPHEMERAL_EXIT.exec(plain);
      if (!m) return;
      const lead = plain.slice(0, m.index + 1).match(subject);
      if (!lead) return;
      const modality = modalityOf(plain.slice(0, m.index + m[0].length), NOT_DONE);
      out.push({ kind: "entity_departed", form: "exit_ephemeral", span: spanOf(frame, at, 0, m[0]), sentence, subject: { surface: lead[0], entity_id: p.id, resolution: "role", candidates: [p.id] },
        modality, polarity: polarityOf(modality), confidence: "low", ambiguity: "none", provenance: { extractor: "movement", form: "exit_ephemeral" },
        stairs_mentioned: false, follows_player: false, door_places: [], reading: "scene" });
    });
  }
  return out;
}
