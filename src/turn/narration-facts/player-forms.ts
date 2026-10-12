import type { TurnContext } from "../context-builder.js";
import { escapeRegExp as esc } from "../language/text.js";
import { GATES } from "../language/gates.js";
import { type NarrationFrame, spanOf } from "./frame.js";
import { firstNonCompleted, modalityOf, polarityOf } from "./modality.js";
import { type Referent, playerRef, unresolvedRef } from "./subjects.js";
import type { EntityArrivedFact, EntityDepartedFact, EntityMovedFact, FactEntityRef, FactModality, MovementFact } from "./types.js";
import { ARRIVAL, NICCO_ARRIVE, NICCO_GO, NICCO_LEAVE, PLACE_END } from "./movement-vocabulary.js";

const CLAUSES = /;|,\s*(?:but|while|though|although)\s+|\s+but\s+/;
const RELATIVE = /^(?:(?:He|They|We)\s+(?:enters?|entered|reach(?:es)?|reached|arrives? (?:at|in)|arrived (?:at|in))\s+(.+?)|The journey ends at\s+(.+?)|The door opens into\s+(.+?))[.!]*$/i;

const base = (frame: NarrationFrame, at: number, ci: number, matched: string, sentence: string, subject: FactEntityRef, modality: FactModality, form: string, confidence: "high" | "medium" | "low") => ({
  span: spanOf(frame, at, ci, matched), sentence, subject, modality, polarity: polarityOf(modality), confidence, ambiguity: subject.entity_id ? "none" as const : "unresolved" as const,
  provenance: { extractor: "movement" as const, form },
});

/**
 * The player's own movement as narration states it ("Nicco reaches the hall", "Nicco leaves the inn") and the player-relative arrival forms
 * ("He enters the hall", "The door opens into the hall"). Descriptive: where Nicco really is, and whether the frame is the player's, is policy.
 */
export function playerMovementFacts(frame: NarrationFrame): MovementFact[] {
  const out: MovementFact[] = [];
  frame.sentences.forEach((sentence, at) => {
    const plainArrival = frame.prose(at).trim();
    const relative = plainArrival.match(RELATIVE);
    if (relative) {
      const phrase = (relative[1] ?? relative[2] ?? relative[3]!).replace(PLACE_END, "").replace(/['’]s\s+(?:(?:massive|wooden)\s+)*door[.!]*$/i, "").replace(/[.!]+$/, "").trim();
      const modality = firstNonCompleted(modalityOf(plainArrival, GATES.player_movement_not_done), /\b(?:yesterday|ago|last night|earlier|according to|describes?|remembers?|recalls?)\b/i.test(plainArrival) ? "habitual" : "completed");
      const surface = plainArrival.match(/^(He|They|We)\b/i)?.[1] ?? "";
      out.push({ ...base(frame, at, 0, relative[0], sentence, unresolvedRef(surface), modality, "player_relative_arrival", "low"), kind: "entity_arrived", form: "player_relative_arrival", destination: { phrase }, requires_descent: false } as EntityArrivedFact);
    }
    frame.prose(at).split(CLAUSES).forEach((clause, ci) => {
      for (const [re, form] of [[NICCO_GO, "player_go"], [NICCO_ARRIVE, "player_arrive"], [NICCO_LEAVE, "player_leave"]] as const) {
        const m = clause.match(re);
        if (!m) continue;
        const modality = modalityOf(clause.slice(0, m.index! + m[0].length), GATES.movement_not_done), destination = { phrase: m[1]!.replace(PLACE_END, "").trim() }, subject = playerRef("Nicco");
        if (form === "player_go") out.push({ ...base(frame, at, ci, m[0], sentence, subject, modality, form, "high"), kind: "entity_moved", form, destination } as EntityMovedFact);
        else if (form === "player_arrive") out.push({ ...base(frame, at, ci, m[0], sentence, subject, modality, form, "high"), kind: "entity_arrived", form, destination, requires_descent: false } as EntityArrivedFact);
        else out.push({ ...base(frame, at, ci, m[0], sentence, subject, modality, form, "high"), kind: "entity_departed", form, destination, stairs_mentioned: false, follows_player: false, door_places: [], reading: "scene" } as EntityDepartedFact);
      }
    });
  });
  return out;
}

/**
 * A pronoun-led arrival verb ("She reaches the hall floor") whose pronoun follows a sentence led by exactly one referent, with nobody else
 * named in it. Only the pronoun continuation is read: a name-led arrival has the subject in its own words.
 */
export function arrivalContinuationFacts(frame: NarrationFrame, movers: readonly Referent[], context: TurnContext): EntityArrivedFact[] {
  const out: EntityArrivedFact[] = [];
  const known = [...movers.flatMap(m => m.names), ...context.characters.filter(c => c.id !== "nicco").map(c => c.profile.name ?? c.id)];
  const leads = (plain: string, names: readonly string[]) => names.some(n => new RegExp(`^\\W*${esc(n)}(?:'s)?\\b`, "i").test(plain));
  const mentions = (plain: string, names: readonly string[]) => names.some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(plain));
  let previous: Referent | undefined;
  frame.sentences.forEach((sentence, at) => {
    const plain = frame.prose(at).trim(), pronoun = /^\W*(?:she|he|it)\b/i.test(plain);
    if (pronoun && ARRIVAL.test(plain)) {
      const m = ARRIVAL.exec(plain)!, token = plain.match(/^\W*(she|he|it)\b/i)![1]!;
      const modality = modalityOf(plain, GATES.movement_not_done);
      const subject: FactEntityRef = previous ? { surface: token, entity_id: previous.id, resolution: "antecedent", candidates: [previous.id] } : unresolvedRef(token);
      out.push({ ...base(frame, at, 0, m[0], sentence, subject, modality, "arrival_verb", "medium"), kind: "entity_arrived", form: "arrival_verb", requires_descent: false });
    }
    if (!pronoun) {
      const lead = movers.filter(m => leads(plain, m.names)), named = movers.filter(m => mentions(plain, m.names));
      const others = known.filter(n => !lead[0]?.names.includes(n));
      previous = lead.length === 1 && named.length === 1 && !others.some(n => mentions(plain, [n])) ? lead[0] : undefined;
    }
  });
  return out;
}
