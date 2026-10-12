import { escapeRegExp as esc } from "../language/text.js";
import { GATES } from "../language/gates.js";
import { type NarrationFrame, spanOf } from "./frame.js";
import { boundedAntecedent } from "./movement-forms.js";
import { firstNonCompleted, modalityOf, polarityOf } from "./modality.js";
import { type Referent, nameRef, playerRef, pronounRef, refAmbiguity, unresolvedRef } from "./subjects.js";
import type { EntityPresentFact, FactEntityRef } from "./types.js";
import type { NarrationFactScope } from "./extract.js";

/**
 * LOCATION CLAIMS: prose that puts someone in a concrete known place WITHOUT a motion verb ("Inside, Heartstone smells of old stone.",
 * "Lira stands just inside the entrance.", "Back at the market, Korvin is waiting."). The fact is descriptive: it names the subject and the
 * ONE known location the wording resolves to (through the scope's own world knowledge; places are never invented from prose). It moves
 * nothing and authorizes nothing. Narrator prose only: quoted speech is blanked by the frame, so testimony ("'She's at Heartstone.'") never
 * becomes a claim, and a future/conditional/negated wording is recorded with that modality, never as completed.
 */
const STATE = "(?:is|are|was|were|(?:is|are|was|were)n['\u2019]t|will be|would be|'ll be|stands?|stood|standing|sits?|sat|waits?|waited|kneels?|knelt|lies|lay|rests?|rested|remains?|remained|stays?|stayed|lingers?|lingered|sleeps?|slept)";
const PLACE_WORDS = /^(?:the\s+)?([\w'’-]+(?:\s+[\w'’-]+){0,4})/;
/** Wordings that name "the scene here", not a place of their own: resolved only against a place the same narration establishes. */
const RELATIVE = /^(?:the\s+)?(?:entrance|door|doorway|threshold|room|hall|house|tower|building|inside)$/i;

/** The longest leading run of words in `text` that the scope resolves to one known location (a possessive "Heartstone's" names the place). `rest` is what follows it. */
function placeAt(text: string, scope: NarrationFactScope): { phrase: string; id?: string; relative?: true; rest: string } | undefined {
  const lead = text.match(/^(?:the\s+)?/i)![0].length, run = text.slice(lead).match(/^[\w'\u2019-]+(?:[ \t]+[\w'\u2019-]+){0,4}/)?.[0] ?? "", tokens = [...run.matchAll(/[\w'\u2019-]+/g)];
  if (!tokens.length || tokens[0]!.index !== 0) return undefined;
  const end = (n: number) => lead + tokens[n - 1]!.index! + tokens[n - 1]![0].length;
  for (let n = tokens.length; n >= 1; n--) {
    const phrase = tokens.slice(0, n).map(t => t[0]).join(" ").replace(/['\u2019]s$/i, ""), id = scope.place?.(phrase);
    if (id) return { phrase, id, rest: text.slice(end(n)).replace(/^['\u2019]s\b/i, "") };
  }
  const first = text.slice(lead).match(/^[\w'\u2019-]+/)![0];
  return RELATIVE.test(first) ? { phrase: first, relative: true, rest: text.slice(lead + first.length) } : undefined;
}
/** After a place used as the SUBJECT of a sentence: interior parts and sensory description say the viewpoint is inside it ("Heartstone's stone walls hold…", "Heartstone smells of…"). */
const INTERIOR = /^\s*(?:(?:\w+\s+){0,2}?(?:walls?|floors?|interior|rooms?|air|halls?|quiet|silence|stillness|ceilings?|windows?|hearth|stairs?|stairwell|shadows?)\b|(?:smells?|feels?|echoes|creaks|hums|holds)\b)/i;

export function locationClaimFacts(frame: NarrationFrame, scope: NarrationFactScope): EntityPresentFact[] {
  const pool: Referent[] = [...scope.movers];
  for (const c of scope.context.characters) if (c.id !== "nicco" && !pool.some(p => p.id === c.id)) pool.push({ id: c.id, names: [c.profile.name ?? c.id, ...(c.profile.aliases ?? [])], ...(c.profile.sex ? { sex: c.profile.sex as "female" | "male" } : {}) });
  const names = [...new Set([...pool.flatMap(p => p.names), "Nicco"])].filter(Boolean).sort((a, b) => b.length - a.length).map(esc);
  const NAME = names.join("|");
  const one = `(?:${NAME})`, list = `${one}(?:\\s*(?:,|and)\\s*${one})*`;
  const local = pool.filter(p => !p.entrant);
  const predicate = new RegExp(`(?:^|[,;]\\s*|\\band\\s+|\\b(?:if|when|once|unless|whether|as)\\s+)(${list}|she|he|they|I)\\s+(?:\\w+ly\\s+)?${STATE}\\s+(?:(?:not|never|no longer)\\s+)?(?:just\\s+|right\\s+|still\\s+)?(?:inside|within|in|at)\\b(?:\\s+(.*))?$`, "i");
  const lead = /^(?:back\s+)?(inside|within|in|at)\b\s*(.*)$/i;
  const out: EntityPresentFact[] = [];
  const subjectsOf = (token: string, previous: string | undefined, current: string): FactEntityRef[] => {
    if (/^(?:nicco|i)$/i.test(token)) return [playerRef(token)];
    if (/^they$/i.test(token)) return [unresolvedRef(token)];
    if (/^(?:she|he)$/i.test(token)) {
      const { antecedent } = boundedAntecedent(previous, current, pool);
      if (antecedent && (!antecedent.sex || antecedent.sex === (/^she$/i.test(token) ? "female" : "male"))) return [{ surface: token, entity_id: antecedent.id, resolution: "antecedent", candidates: [antecedent.id] }];
      return [/^he$/i.test(token) ? unresolvedRef(token) : pronounRef(local, token)];
    }
    return token.split(/\s*(?:,|\band\b)\s*/i).filter(Boolean).map(t => /^nicco$/i.test(t) ? playerRef(t) : nameRef(pool, t));
  };
  const record = (at: number, ci: number, matched: string, clause: string, ref: FactEntityRef, place: { phrase: string; id?: string; relative?: true }, form: string, confidence: EntityPresentFact["confidence"]) => {
    const modality = firstNonCompleted(modalityOf(clause, GATES.movement_not_done), "completed");
    out.push({ kind: "entity_present", form: "location_claim", span: spanOf(frame, at, ci, matched), sentence: frame.sentences[at]!, subject: ref, modality, polarity: polarityOf(modality), confidence, ambiguity: refAmbiguity(ref),
      provenance: { extractor: "movement", form }, location_phrase: place.phrase, ...(place.id ? { location_id: place.id } : {}), ...(place.relative ? { relative: true } : {}) } as EntityPresentFact);
  };
  frame.sentences.forEach((sentence, at) => frame.prose(at).trim().split(/;/).forEach((clause, ci) => {
    const text = clause.trim(), previous = frame.sentences[at - 1];
    // "Inside, Heartstone smells of old stone." / "Back at the market, Korvin is waiting." / "Inside Heartstone, Nicco closes the door."
    const l = text.match(lead);
    if (l) {
      const afterComma = l[2]!.replace(/^,\s*/, "");
      const bare = /^(?:inside|within)$/i.test(l[1]!) && /^,/.test(l[2]!);
      const place = placeAt(bare ? afterComma : l[2]!, scope);
      if (place?.id) {
        if (bare) record(at, ci, text.slice(0, text.length), text, playerRef("Nicco"), place, "scene_location", "medium");
        else {
          const rest = l[2]!.slice(l[2]!.toLowerCase().indexOf(place.phrase.toLowerCase()) + place.phrase.length).replace(/^\s*,\s*/, "");
          const s = rest.match(new RegExp(`^(${list}|she|he|they|I)\\b`, "i"));
          if (s) for (const ref of subjectsOf(s[1]!, previous, sentence)) record(at, ci, text, text, ref, place, "adverbial_lead", ref.resolution === "name" || ref.resolution === "player" ? "high" : "medium");
          else if (/^back\b/i.test(text)) record(at, ci, text, text, playerRef("Nicco"), place, "scene_location", "medium");
        }
      }
    }
    // "Heartstone's stone walls hold a different kind of quiet." / "Heartstone smells of old stone.": the place is the subject of an interior description.
    const d = !l && !/^(?:inside|within)\b/i.test(text) ? placeAt(text, scope) : undefined;
    if (d?.id && INTERIOR.test(d.rest)) record(at, ci, text, text, playerRef("Nicco"), d, "scene_place_subject", "low");
    // "Lira stands just inside the entrance." / "Nicco and Tessa are inside Heartstone."
    const p = text.match(predicate);
    if (p) {
      const place = placeAt(p[2] ?? "", scope) ?? (/^$/.test((p[2] ?? "").trim()) ? { phrase: "inside", relative: true as const } : undefined);
      if (place) for (const ref of subjectsOf(p[1]!, previous, sentence)) record(at, ci, p[0].trim(), text, ref, place, "predicate", ref.resolution === "name" || ref.resolution === "player" ? "high" : "medium");
    }
  }));
  // A relative wording ("just inside the entrance") means the scene the SAME narration establishes: exactly one distinct explicit place, else unresolved.
  const explicit = [...new Set(out.flatMap(f => f.location_id && !(f as { relative?: boolean }).relative ? [f.location_id] : []))];
  return out.map(f => {
    const { relative, ...rest } = f as EntityPresentFact & { relative?: boolean };
    if (!relative) return rest as EntityPresentFact;
    return (explicit.length === 1 ? { ...rest, location_id: explicit[0]!, confidence: "low" } : rest) as EntityPresentFact;
  });
}
