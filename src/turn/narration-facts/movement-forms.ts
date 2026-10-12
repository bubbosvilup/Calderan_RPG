import { escapeRegExp as esc } from "../language/text.js";
import { GATES } from "../language/gates.js";
import { type NarrationFrame, spanOf } from "./frame.js";
import { firstNonCompleted, modalityOf, polarityOf } from "./modality.js";
import { type Referent, ambiguityOf, nameRef, pronounRef, refAmbiguity, unresolvedRef, antecedentRef } from "./subjects.js";
import type { EntityArrivedFact, EntityFollowedFact, EntityMovedFact, EntityMovedWithPlayerFact, FactConfidence, FactEntityRef, FactModality, MovementFact } from "./types.js";
import { APPEARS_BELOW, ARRIVE_MANNER, ARRIVE_STOPS, ARRIVE_TAIL, ARRIVE_VERB, ARRIVE_VETO, CARRY, COME_DOWN, DASH_PLACE, DASH_RETRACTS, FOLLOW_TAIL, FOLLOW_VERB, HELD, LEAD_IN, STAIRS, STEP_NOUN, STEP_VERB, TO, WALK } from "./movement-vocabulary.js";

const NOT_DONE = GATES.movement_not_done;
const CLAUSES = /;|,\s*(?:but|while|though|although)\s+|\s+but\s+/;
const HEAD_END = /,|\s*[—–]\s*|…|\s+(?:and|as|while|before|until|then)\s+/;

/**
 * The follow/arrive/walk/carry/lead forms of the original narration (quoted speech blanked), as facts. Every form that matches yields a fact
 * with the modality the prose gives it; nothing is dropped because it is hedged, and nothing here decides whether it is allowed.
 * Facts come out in recognition-priority order (sentence, clause, form), which consumers rely on ("first form that qualifies wins").
 */
export function movementFormFacts(frame: NarrationFrame, movers: readonly Referent[]): MovementFact[] {
  if (!movers.length) return [];
  const names = movers.flatMap(m => m.names).map(esc).join("|");
  const local = movers.filter(m => !m.entrant); // an entrant (elsewhere/off-scene) is never a pronoun referent, a follower or a leaver
  const who = (token: string, subject: boolean): FactEntityRef => {
    const byName = nameRef(movers, token);
    if (byName.candidates.length) return byName;
    return subject && /^he$/i.test(token) ? unresolvedRef(token) : pronounRef(local, token); // subject "he" is usually the player
  };
  const confidence = (ref: FactEntityRef): FactConfidence => ref.resolution === "name" ? "high" : ref.entity_id ? "medium" : "low";
  const patterns: readonly { readonly re: RegExp; readonly mover: number; readonly dest: number; readonly subject: boolean; readonly kind: "entity_moved" | "entity_moved_with_player"; readonly form: "walk_to" | "carried_to" | "led_to" | "held_arrival" | "walk_inside" }[] = [
    { re: new RegExp(`\\b${CARRY}\\s+(${names}|her|him)\\b[^.;]*?\\b${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: false, kind: "entity_moved_with_player", form: "carried_to" },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(?:(?:him|nicco|after him|behind him|back|close behind)\\s+)*${STAIRS}${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: true, kind: "entity_moved", form: "walk_to" },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:is|was)\\s+(?:carried|brought|led)\\s+${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: true, kind: "entity_moved_with_player", form: "led_to" },
    { re: new RegExp(`\\b(?:reach|reaches|reached|arrive at|arrives at|arrived at|enter|enters|entered)\\s+([^,.;]+?),?\\s+(?:with\\s+)?(${names}|her|him)\\s+(?:still\\s+)?${HELD}`, "i"), mover: 2, dest: 1, subject: false, kind: "entity_moved_with_player", form: "held_arrival" },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(?:him\\s+|nicco\\s+)?(inside|in)(?=\\s*(?:[,.;!?…—–]|$|\\s+(?:and|then|after|behind|as|while)\\b))`, "i"), mover: 1, dest: 2, subject: true, kind: "entity_moved", form: "walk_inside" },
  ];
  const bareUp = (re: string) => new RegExp(re, "i");
  const bareRes = [
    bareUp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(up|down)(?:stairs|\\s+the(?:\\s+[a-z]+)?\\s+(?:stairs|steps|staircase))?(?=\\s*(?:[.;!?]|$)|\\s+(?:and|then|as|while)\\b|,\\s+(?:and|then|as|while|[a-z]+ing)\\b)`),
    bareUp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(?:(up|down)stairs)(?=\\s*(?:[.;!?]|$)|\\s+(?:and|then|as|while)\\b|,\\s+(?:and|then|as|while|[a-z]+ing)\\b)`),
  ];
  const out: MovementFact[] = [];
  frame.sentences.forEach((sentence, at) => {
    const plain = frame.prose(at).trim();
    const { antecedent, nicco } = boundedAntecedent(frame.sentences[at - 1], sentence, movers);
    plain.split(CLAUSES).forEach((clause, ci) => {
      const veto = ARRIVE_VETO.test(clause);
      const base = (matched: string, subject: FactEntityRef, modality: FactModality, form: string) => ({
        span: spanOf(frame, at, ci, matched), sentence, subject, modality, polarity: polarityOf(modality), confidence: confidence(subject), ambiguity: refAmbiguity(subject),
        provenance: { extractor: "movement" as const, form },
      });
      for (const p of patterns) {
        const m = clause.match(p.re);
        if (!m) continue;
        const modality = firstNonCompleted(modalityOf(clause.slice(0, m.index! + m[0].length), NOT_DONE), veto ? "habitual" : "completed");
        const subject = who(m[p.mover]!, p.subject), destination = { phrase: m[p.dest]! };
        if (p.kind === "entity_moved") out.push({ ...base(m[0], subject, modality, p.form), kind: "entity_moved", form: p.form as EntityMovedFact["form"], destination, ...(p.form === "walk_inside" ? { inside: true as const } : {}) } as EntityMovedFact);
        else out.push({ ...base(m[0], subject, modality, p.form), kind: "entity_moved_with_player", form: p.form as EntityMovedWithPlayerFact["form"], destination } as EntityMovedWithPlayerFact);
      }
      // A bare vertical direction ("goes upstairs"): the direction only; which place that is, is policy.
      const bare = clause.match(bareRes[0]!) ?? clause.match(bareRes[1]!);
      if (bare) {
        const modality = firstNonCompleted(modalityOf(clause.slice(0, bare.index! + bare[0].length), NOT_DONE), veto ? "habitual" : "completed", ARRIVE_STOPS.test(clause) ? "retracted" : "completed");
        const subject = who(bare[1]!, true);
        out.push({ ...base(bare[0], subject, modality, "bare_vertical"), kind: "entity_moved", form: "bare_vertical", direction: bare[2]!.toLowerCase() === "up" ? "UP" : "DOWN" });
      }
      for (const f of implicitFollowFacts(clause, names, movers, local, antecedent, nicco, veto, (matched, subject, modality, form) => base(matched, subject, modality, form))) out.push(f);
    });
  });
  return out;
}

type Base = (matched: string, subject: FactEntityRef, modality: FactModality, form: string) => Omit<EntityFollowedFact, "kind" | "form" | "requires_descent">;

function implicitFollowFacts(clause: string, names: string, movers: readonly Referent[], local: readonly Referent[], antecedent: Referent | undefined, niccoNamed: boolean, veto: boolean, base: Base): MovementFact[] {
  const out: MovementFact[] = [];
  const pronoun = (token: string): FactEntityRef => {
    const hit = /^he$/i.test(token) ? unresolvedRef(token) : pronounRef(local, token), want = /^(?:her|she)$/i.test(token) ? "female" : /^(?:him|he|his)$/i.test(token) ? "male" : undefined;
    if (hit.entity_id || !antecedent || !want || (antecedent.sex && antecedent.sex !== want) || (want === "male" && niccoNamed)) return hit;
    return antecedentRef(token, antecedent);
  };
  const lead = new RegExp(`(?:^${LEAD_IN}|^|\\band\\s+|\\bthen\\s+|\\bas\\s+)(${names}|she|he)\\s+(?:(?:[a-z']+,?\\s+){1,3}?(?:and|then|and then)\\s+)?(?:\\w+ly\\s+)?${FOLLOW_VERB}\\b(.*)$`, "i");
  const steps = new RegExp(`(?:^${LEAD_IN}|^|\\band\\s+|\\bthen\\s+)(${names}|her|his)(?:'s)?\\s+(?:[a-z]+\\s+){0,2}?${STEP_NOUN}\\s+${STEP_VERB}\\b(.*)$`, "i");
  const below = new RegExp(`(?:^${LEAD_IN}|^|\\band\\s+|\\bthen\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?(?:${COME_DOWN}|${APPEARS_BELOW})\\b(.*)$`, "i");
  const start = `(?:^${LEAD_IN}|^|\\band\\s+|\\bthen\\s+)`;
  const arrives = new RegExp(`${start}(${names})\\s+${ARRIVE_MANNER}${ARRIVE_VERB}\\s+(?:down\\s+(?:the\\s+(?:stairs?|steps|staircase|stairwell)\\s+)?)?(?:in)?to\\s+(.*)$`, "i");
  const descends = new RegExp(`${start}(${names})\\s+(?:\\w+ly\\s+)?(?:descends|descended)\\s+(?:the\\s+(?:stairs?|steps|staircase|stairwell))?(.*)$`, "i");
  const ducks = new RegExp(`${start}(${names})\\s+(?:ducks?|ducked)\\s+(?:\\w+ly\\s+)?(?:through|under)\\s+the\\s+\\w+\\s+at\\s+the\\s+(?:base|bottom|foot)\\s+of\\s+the\\s+(?:stairs?|steps|staircase|stairwell)(.*)$`, "i");
  const marked = new RegExp(`\\b(?:footfalls|footsteps|tread|treads|steps)\\s+marked\\s+(${names})'s\\s+(descent)\\b(.*)$`, "i");
  const arrival = (matched: string, subject: FactEntityRef, modality: FactModality, form: EntityArrivedFact["form"], destination?: string, requires_descent = false) =>
    out.push({ ...base(matched, subject, modality, form), kind: "entity_arrived", form, ...(destination !== undefined ? { destination: { phrase: destination } } : {}), requires_descent } as EntityArrivedFact);

  {
    const m = clause.match(arrives);
    if (m) {
      const head = m[2]!.split(HEAD_END)[0]!.replace(/[.!…"”'\s]+$/, ""), rest = m[2]!.slice(head.length), place = head.replace(ARRIVE_TAIL, "");
      const modality = firstNonCompleted(veto ? "habitual" : "completed", ARRIVE_STOPS.test(rest) ? "retracted" : "completed", modalityOf(rest, GATES.disqualify), modalityOf(clause, GATES.follow_not_done),
        modalityOf(clause.slice(0, m.index! + m[0].length - m[2]!.length + place.length), NOT_DONE));
      arrival(m[0], nameRef(local, m[1]!), modality, "arrive_into", place);
    }
  }
  for (const [re, form] of [[descends, "descend"], [ducks, "duck_below"], [marked, "descent_marked"]] as const) {
    const m = clause.match(re);
    if (!m) continue;
    const after = re === marked ? m[3]! : m[2]!, head = after.split(HEAD_END)[0]!.replace(/[.!…"”'\s]+$/, "");
    if (re !== ducks && !FOLLOW_TAIL.test(head.replace(ARRIVE_TAIL, "")) && head.trim()) continue;
    const modality = firstNonCompleted(veto ? "habitual" : "completed", ARRIVE_STOPS.test(after.slice(head.length)) ? "retracted" : "completed",
      DASH_PLACE.test(after.split(/\s*[—–]\s*|…/).slice(1).join(" ")) ? "retracted" : "completed", modalityOf(after, GATES.disqualify), modalityOf(clause, GATES.follow_not_done));
    arrival(m[0], nameRef(local, m[1]!), modality, form, undefined, true);
  }
  for (const [re, form] of [[lead, "follow_verb"], [steps, "follow_steps"], [below, "follow_below"]] as const) {
    const m = clause.match(re);
    if (!m) continue;
    const head = m[2]!.split(HEAD_END)[0]!, tail = head.replace(/[.!…"”'\s]+$/, "");
    // What trails the follow-manner words must not retract or stop it; only a dash or ellipsis is additionally held to "no other destination".
    const rest = m[2]!.slice(head.length);
    const afterDash = re === below ? (/^\s*(?:[—–]|…)/.test(rest) ? rest.replace(/^\s*(?:[—–]|…)\s*/, "").split(/,|\s*[—–]\s*|…/)[0]! : "") : m[2]!.split(/\s*[—–]\s*|…/).slice(1).join(" ");
    if (!FOLLOW_TAIL.test(tail)) continue;
    const modality = firstNonCompleted(DASH_PLACE.test(afterDash) ? "retracted" : "completed", DASH_RETRACTS.test(rest) ? "retracted" : "completed", modalityOf(rest, GATES.disqualify), modalityOf(clause, GATES.follow_not_done));
    const token = /^his$/i.test(m[1]!) ? "him" : m[1]!;
    const byName = nameRef(local, token);
    const subject = byName.candidates.length ? byName : pronoun(token);
    out.push({ ...base(m[0], subject, modality, form), kind: "entity_followed", form, requires_descent: re === below } as EntityFollowedFact);
  }
  return out;
}

/**
 * Bounded pronoun antecedent. A pronoun-led follow ("She came down after him") resolves to the ONE referent named in the previous sentence
 * or earlier in the same sentence (quotes included, so an addressee counts as a competitor), and only when the previous sentence is not
 * itself a refusal, stay or hesitation. Two referents in that window leave the pronoun unresolved; "he" additionally fails when the
 * player is named in the window. No general coreference.
 */
export function boundedAntecedent(previous: string | undefined, current: string, movers: readonly Referent[]): { antecedent?: Referent; nicco: boolean } {
  const scope = `${previous ?? ""} ${current}`, named = (n: string) => new RegExp(`\\b${esc(n)}(?:'s)?\\b`, "i").test(scope);
  const hits = movers.filter(m => m.names.some(named)), nicco = named("Nicco");
  if (hits.length !== 1 || (previous && (DASH_RETRACTS.test(previous) || /\b(?:refus\w+|declin\w+|hesitat\w+|shook (?:her|his) head)\b/i.test(previous)))) return { nicco };
  return { antecedent: hits[0]!, nicco };
}
export { ambiguityOf };
