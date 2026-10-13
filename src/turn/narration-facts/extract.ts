import type { TurnContext } from "../context-builder.js";
import { escapeRegExp as esc } from "../language/text.js";
import { GATES } from "../language/gates.js";
import { arrivalContinuationFacts, playerMovementFacts } from "./player-forms.js";
import { claimDepartureFacts, presenceClaimFacts, sceneDepartureFacts } from "./departure-forms.js";
import { type NarrationFrame, frameOf, spanOf } from "./frame.js";
import { commerceFacts, inputCommerceFacts } from "./commerce-forms.js";
import { locationClaimFacts } from "./location-forms.js";
import { movementFormFacts } from "./movement-forms.js";
import { type Person, candidateNames, dialogueUnits, presentPeople } from "./dialogue-forms.js";
import { STOP } from "./dialogue-vocabulary.js";
import { identityFacts } from "./identity-forms.js";
import { numberValue } from "../language/numbers.js";
import { baseFormModality, modalityOf, polarityOf } from "./modality.js";
import { type Referent, nameRef, pronounRef, refAmbiguity, unresolvedRef } from "./subjects.js";
import type { CommerceFact, DialogueUnit, EntityDepartedFact, EntityFollowedFact, EntityStayedFact, FactEntityRef, MovementFact, NarrationFacts } from "./types.js";



/**
 * Who and what the extractor reads against. `movers` are the people narration may move (the scene's, plus arrivals from elsewhere);
 * `context` supplies the people present and their identity terms; `absent` are authored people not in the scene. The scope names the
 * people only: it carries no policy (who MAY move is decided by the consumers).
 */
export interface NarrationFactScope {
  readonly movers: readonly Referent[];
  readonly context: TurnContext;
  readonly absent?: readonly { readonly id: string; readonly name: string }[];
  /** Known concrete location for a place wording ("Heartstone", "the slave market"), or undefined. Policy-free world knowledge; the extractor never invents places. */
  readonly place?: (phrase: string) => string | undefined;
  /** Words that can stand as a personal name (not a place, a stop word or a number). Policy-free world knowledge; default: stop words and numbers only. */
  readonly names_ok?: (name: string) => boolean;
  /** The player's input of this turn, and whether it asks somebody's name (identity-request.ts, injected: the fact layer reads no player intent itself). */
  readonly player_input?: string;
  readonly asks_name?: (player: string) => boolean;
}

/** The people the dialogue of a narration is read against: the present people (Nicco included), then movers arriving from elsewhere. */
export function dialoguePeople(scope: NarrationFactScope): Person[] {
  const people = presentPeople(scope.context);
  for (const m of scope.movers) if (!people.some(p => p.id === m.id)) people.push({ id: m.id, names: m.names, ...(m.sex ? { sex: m.sex } : {}), unnamed: false });
  return people;
}
const defaultNameOk = (n: string) => !STOP.has(n.toLowerCase()) && numberValue(n) === undefined;
/** The one dialogue reading of a narration (RPG format when the text uses it). */
export function dialogueOf(narration: string, scope: NarrationFactScope): readonly DialogueUnit[] {
  return dialogueUnits(narration, 0, dialoguePeople(scope), candidateNames([narration], scope.names_ok ?? defaultNameOk), { rpg: true });
}

/** A person who stays WHERE THEY WERE ("Maren stays behind", "she waits here", "lingers at the door"); staying close to someone is not a place. */
function stayFacts(frame: NarrationFrame, movers: readonly Referent[]): EntityStayedFact[] {
  if (!movers.length) return [];
  const names = movers.flatMap(m => m.names).map(esc).join("|");
  const re = new RegExp(`(?:^|\\band\\s+|\\bthen\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?(?:stays?|stayed|remains?|remained|waits?|waited|lingers?|lingered|holds? back|held back)\\b(?=\\s*(?:[,.;!?…—–]|$)|\\s+(?:behind|here|there|where|put|in place|inside|outside|upstairs|downstairs|in\\s+(?:the|her|his)\\s+\\w+|at\\s+(?:the|her|his)\\s+\\w+|by\\s+the)\\b)`, "i");
  const local = movers.filter(m => !m.entrant), out: EntityStayedFact[] = [];
  frame.sentences.forEach((sentence, at) => frame.prose(at).trim().split(/;|,\s*(?:but|while|though|although)\s+|\s+but\s+/).forEach((clause, ci) => {
    const m = clause.match(re);
    if (!m) return;
    const byName = nameRef(movers, m[1]!), subject: FactEntityRef = byName.candidates.length ? byName : /^he$/i.test(m[1]!) ? unresolvedRef(m[1]!) : pronounRef(local, m[1]!);
    const modality = modalityOf(clause.slice(0, m.index! + m[0].length), GATES.movement_not_done);
    out.push({ kind: "entity_stayed", form: "stay_verb", span: spanOf(frame, at, ci, m[0]), sentence, subject, modality, polarity: polarityOf(modality), confidence: subject.resolution === "name" ? "high" : "medium",
      ambiguity: refAmbiguity(subject), provenance: { extractor: "movement", form: "stay_verb" } });
  }));
  return out;
}

/**
 * The base forms ("follow", "leave") are never a completed statement of THIS scene, so they are recorded only when the prose gives them a
 * non-completed reading: "She will follow tomorrow.", "She does not follow.", "Nicco tells her to follow.", "if she leaves".
 */
function baseFormFacts(frame: NarrationFrame, movers: readonly Referent[], context: TurnContext): MovementFact[] {
  const names = [...movers.flatMap(m => m.names), ...context.characters.filter(c => c.id !== "nicco").map(c => c.profile.name ?? c.id)].map(esc);
  const who = new RegExp(`\\b(${[...names, "she", "he", "her", "him", "they", "them"].join("|")})\\b`, "gi");
  const verb = /\b(follow|come after|leave|depart)\b/i;
  const local = movers.filter(m => !m.entrant), out: MovementFact[] = [];
  frame.sentences.forEach((sentence, at) => frame.prose(at).trim().split(/;|,\s*(?:but|while|though|although)\s+|\s+but\s+/).forEach((clause, ci) => {
    const v = verb.exec(clause);
    if (!v) return;
    const prefix = clause.slice(0, v.index + v[0].length), modality = baseFormModality(prefix);
    if (!modality) return;
    const token = [...prefix.matchAll(who)].at(-1)?.[1];
    if (!token) return;
    const byName = nameRef(movers, token), subject: FactEntityRef = byName.candidates.length ? byName : pronounRef(local, token);
    const common = { span: spanOf(frame, at, ci, v[0]), sentence, subject, modality, polarity: polarityOf(modality), confidence: "low" as const, ambiguity: refAmbiguity(subject) };
    if (/^(?:follow|come after)$/i.test(v[1]!)) out.push({ ...common, kind: "entity_followed", form: "follow_verb", requires_descent: false, provenance: { extractor: "movement", form: "follow_base" } } as EntityFollowedFact);
    else out.push({ ...common, kind: "entity_departed", form: "exit_act", stairs_mentioned: false, follows_player: false, door_places: [], reading: "scene", provenance: { extractor: "movement", form: "exit_base" } } as EntityDepartedFact);
  }));
  return out;
}

/**
 * The same readings applied to what people SAY. A quoted fact carries modality `quoted`, only keeps a subject the words name outright,
 * and is never narrator prose: consumers that act on narration ignore it, and so does the audit.
 */
function quotedFacts(frame: NarrationFrame, scope: NarrationFactScope): MovementFact[] {
  const out: MovementFact[] = [];
  frame.sentences.forEach((sentence, at) => {
    for (const inner of frame.speech(at)) {
      const sub = frameOf(inner);
      const found: MovementFact[] = [...movementFormFacts(sub, scope.movers), ...sceneDepartureFacts(sub, scope.context)];
      for (const f of found) {
        const subject: FactEntityRef = f.subject.resolution === "name" || f.subject.resolution === "term" ? f.subject : unresolvedRef(f.subject.surface);
        out.push({ ...f, subject, modality: "quoted", polarity: "affirmed", confidence: "low", ambiguity: refAmbiguity(subject), span: spanOf(frame, at, 0, f.span.text), sentence } as MovementFact);
      }
    }
  });
  return out;
}

/** Extract every movement fact the narration states. Pure: no input is changed and nothing outside the returned value is touched. */
export function extractNarrationFacts(narration: string, scope: NarrationFactScope): NarrationFacts {
  const frame = frameOf(narration);
  const movement: MovementFact[] = [
    ...movementFormFacts(frame, scope.movers),
    ...stayFacts(frame, scope.movers),
    ...baseFormFacts(frame, scope.movers, scope.context),
    ...sceneDepartureFacts(frame, scope.context),
    ...claimDepartureFacts(frame, scope.context, scope.absent ?? []),
    ...presenceClaimFacts(frame, scope.context),
    ...locationClaimFacts(frame, scope),
    ...playerMovementFacts(frame),
    ...arrivalContinuationFacts(frame, scope.movers, scope.context),
    ...(narration.includes("\"") || narration.includes("“") ? quotedFacts(frame, scope) : []),
  ];
  const dialogue = dialogueOf(narration, scope);
  const commerce = commerceFacts(frame, { people: commercePeople(scope), units: dialogue });
  const descriptors = new Map(scope.context.characters.flatMap(c => { const d = ("unnamed_label" in c && c.unnamed_label ? String(c.unnamed_label) : c.established_origin?.descriptor ?? "").toLowerCase().replace(/^(?:the|a|an)\s+/, "").split(/\s+/).at(-1); return !c.profile.name && d ? [[c.id, d] as const] : []; }));
  const identity = identityFacts(frame, dialogue, { people: dialoguePeople(scope), asked: !!scope.player_input && !!scope.asks_name?.(scope.player_input), descriptors });
  return Object.freeze({ narration, movement: Object.freeze(movement), commerce: Object.freeze(commerce), dialogue: Object.freeze(dialogue), identity: Object.freeze(identity) });
}

/** The people commerce text may name (the scene's movers and everyone in the context), as plain referents. */
function commercePeople(scope: NarrationFactScope): Referent[] {
  const pool: Referent[] = [...scope.movers];
  for (const c of scope.context.characters) if (c.id !== "nicco" && !pool.some(p => p.id === c.id)) pool.push({ id: c.id, names: [c.profile.name ?? c.id, ...(c.profile.aliases ?? [])] });
  return pool;
}
/** Commerce facts of the PLAYER's own input: every figure is a player counter. */
export function extractInputCommerceFacts(input: string): readonly CommerceFact[] {
  return Object.freeze(inputCommerceFacts(frameOf(input)));
}
/** Commerce facts of a verbatim QUOTE of the delivered text, read with the goods words the quote is about ("the halberd is fifteen"). */
export function extractQuoteCommerceFacts(quote: string, scope: NarrationFactScope, subjects: readonly string[]): readonly CommerceFact[] {
  return Object.freeze(commerceFacts(frameOf(quote), { people: commercePeople(scope), units: dialogueOf(quote, scope), subjects }));
}
