import { GATES } from "../language/gates.js";
import { numberValue } from "../language/numbers.js";
import { escapeRegExp as esc, sentencesOf } from "../language/text.js";
import { FEMALE_NOUNS, MALE_NOUNS } from "./dialogue-vocabulary.js";
import type { NarratedPerson } from "./scene-identity.js";

/**
 * What the scene's narration ESTABLISHED about one narrated person (sex, age, species, appearance, condition, background), and nothing else. Descriptive:
 * the shape is structurally the CharacterOriginSnapshot `established` record, but the fact layer neither imports nor writes campaign state; the
 * consumer that has authority (a person Actual Offer Accept) decides whether it is ever recorded.
 *
 * Facts come only from sentences about that person. Nothing is inferred from a name (sex, age, species, origin, personality). Hedged statements
 * ("maybe eighteen, maybe less") establish nothing. Background is kept with its source (seller / self / other / narration).
 */
export interface EstablishedClaimFact { text: string; source: "narration" | "seller" | "self" | "other"; by?: string }
export interface EstablishedPersonFacts {
  name?: string; sex?: string; age?: { kind: "exact"; years: number } | { kind: "approximate"; description: string }; species?: string; role?: string;
  descriptor?: string; appearance?: string[]; condition?: string[]; background?: EstablishedClaimFact[];
}

const HEDGE = GATES.captive_fact_hedge;
const APPEARANCE = [
  /\b(?:(?:long|short|matted|tangled|cropped|braided|dark|black|brown|blond|blonde|red|auburn|grey|gray|white|silver|copper|golden|fair)[ -]){1,2}(?:hair|haired)\b/gi,
  /\b(?:grey|gray|blue|green|brown|dark|amber|hazel|black|pale)\s+eyes\b/gi,
  /\b(?:an?\s+)?(?:old\s+|long\s+|thin\s+|jagged\s+|pale\s+)?scars?\s+(?:across|on|over|along|down|through)\s+(?:her|his|their|the)\s+[a-z]+/gi,
  /\b(?:tall|thin|lean|gaunt|slight|slender|wiry|muscular|broad[- ]shouldered|heavyset|stocky|emaciated|skinny)\b/gi,
];
const CONDITION: readonly (readonly [RegExp, string])[] = [
  [/\b(?:fever|feverish|burning with fever|fever-flush\w*)\b/i, "feverish"], [/\b(?:sick|ill)\b/i, "sick"], [/\bwounded\b/i, "wounded"], [/\binjured\b/i, "injured"],
  [/\bbruised\b/i, "bruised"], [/\bbleeding\b/i, "bleeding"], [/\b(?:starving|starved)\b/i, "starving"], [/\bunconscious\b/i, "unconscious"], [/\bexhausted\b/i, "exhausted"],
  [/\bdying\b/i, "dying"], [/\b(?:chained|shackled|manacled|restrained)\b/i, "restrained"], [/\bcough(?:s|ing)\b/i, "coughing"],
];
const SPECIES = /\b(human|elf|elven|dwarf|dwarven|halfling|orc|orcish|beastfolk|half-elf|half-orc|gnome|goblin)\b/i;
const BACKGROUND = /\b(?:debt|auction|forfeit\w*|captured|taken from|sold (?:for|by|to|off)|was an? [a-z]+|worked (?:in|at|as)|came in|brought in|picked (?:her|him|them) (?:off|up)|born|from the [a-z]+ (?:court|pits?|mines?|road)|(?:i'?m|i am|she'?s|he'?s|they'?re|comes?|came|hails?) from|grew up|raised (?:in|on|near|by))\b/i;

/**
 * Facts established about a person in the scene narration. `sellerKey` marks statements attributed to a seller. `keepClaim` (Ephemeral Background
 * Grounding V1): a background sentence it rejects (an unverified named place/culture/faction) is not an established fact. Verbatim `evidence`
 * remains raw provenance and is never projected to the narrator as background.
 */
export function establishedFacts(person: NarratedPerson, sellerKey: string | undefined, nameOf: (id: string) => string, keepClaim?: (text: string) => boolean): { established: EstablishedPersonFacts; evidence: string[] } {
  const own = person.keys, units = person.units;
  // Physical facts only from sentences ABOUT them: their own narration sentences, their introduction, or (unnamed) the sentences describing them by
  // their noun. A sentence that merely mentions them ("Brenna's grey eyes find Maren") describes someone else.
  const intro = new Set(person.introductions.map(i => i.evidence));
  const factUnits = person.name ? units.filter(u => (!u.quoted && own.includes(u.speaker ?? "")) || intro.has(u.text.slice(0, 240))) : units;
  // Sex: only from a person noun narration attached to them, or unambiguous pronouns in sentences whose subject is them.
  let sex: string | undefined = person.noun && FEMALE_NOUNS.has(person.noun) ? "female" : person.noun && MALE_NOUNS.has(person.noun) ? "male" : undefined;
  if (!sex) {
    const theirs = units.filter(u => !u.quoted && own.includes(u.speaker ?? "")).map(u => u.text).join(" ");
    const f = /\b(?:she|her|herself)\b/i.test(theirs), m = /\b(?:he|him|his|himself)\b/i.test(theirs);
    sex = f && !m ? "female" : m && !f ? "male" : undefined;
  }
  // Age: an explicit unhedged statement, or a naming quote "<Name>. Thirty-two."; "young woman" is a band; girl/boy is nothing.
  let age: EstablishedPersonFacts["age"];
  for (const u of units) {
    if (HEDGE.test(u.text)) continue;
    const explicit = (factUnits.includes(u) ? u.text.match(/\b(\d{1,2}|[a-z]+(?:-[a-z]+)?)[- ]years?[- ]old\b/i) ?? u.text.match(/\baged\s+(\d{1,2}|[a-z]+(?:-[a-z]+)?)\b/i) : null)
      ?? (person.name && u.quoted ? u.text.match(new RegExp(`^${esc(person.name)}[.,]\\s*([A-Za-z]+(?:-[a-z]+)?|\\d{1,2})[.,]`)) : null);
    const years = explicit ? numberValue(explicit[1]!) : undefined;
    if (years !== undefined && years > 0 && years < 120) { age = { kind: "exact", years }; break; }
  }
  if (!age) {
    const text = factUnits.filter(u => !HEDGE.test(u.text)).map(u => u.text).join(" ");
    if (/\b(?:child|little (?:girl|boy)|adolescen\w+|teen(?:age|ager)?)\b/i.test(text)) age = { kind: "approximate", description: "a child or adolescent (minor)" };
    else if (/\byoung (?:woman|man)\b/i.test(text)) age = { kind: "approximate", description: "young adult" };
    else if (/\b(?:old|elderly|middle-aged|grey-haired) (?:woman|man)\b/i.test(text)) age = { kind: "approximate", description: "older adult" };
  }
  const species = factUnits.map(u => u.text.match(SPECIES)?.[1]?.toLowerCase().replace(/^elven$/, "elf").replace(/^dwarven$/, "dwarf").replace(/^orcish$/, "orc")).find(Boolean);
  const appearance = [...new Set(factUnits.filter(u => !HEDGE.test(u.text)).flatMap(u => APPEARANCE.flatMap(r => [...u.text.matchAll(r)].map(m => m[0].toLowerCase().trim()))))].slice(0, 8);
  const condition = [...new Set(factUnits.filter(u => !HEDGE.test(u.text)).flatMap(u => CONDITION.filter(([r]) => r.test(u.text)).map(([, c]) => c)))];
  // Background: sentences with a background marker, kept with who said them. Narration only when unhedged.
  const background: EstablishedClaimFact[] = [];
  for (const u of units) for (const s of sentencesOf(u.text)) {
    if (!BACKGROUND.test(s) || HEDGE.test(s) || background.length >= 6 || (keepClaim && !keepClaim(s))) continue;
    const source: EstablishedClaimFact["source"] = !u.quoted ? "narration" : u.speaker === sellerKey ? "seller" : own.includes(u.speaker ?? "") ? "self" : "other";
    const by = u.quoted && u.speaker && !u.speaker.startsWith("other:") ? nameOf(u.speaker) : undefined;
    if (!background.some(b => b.text === s)) background.push({ text: s.slice(0, 200), source, ...(by ? { by } : {}) });
  }
  const who = (key: string | undefined) => !key ? "Someone" : own.includes(key) ? person.label : key.startsWith("other:") ? `The ${key.slice(6)}` : nameOf(key);
  const evidence = units.slice(0, 8).map(u => (u.quoted ? `${who(u.speaker)}: "${u.text}"` : u.text).slice(0, 240));
  return { established: { ...(person.name ? { name: person.name } : {}), ...(sex ? { sex } : {}), ...(age ? { age } : {}), ...(species ? { species } : {}), ...(person.noun ? { descriptor: person.noun } : {}),
    ...(appearance.length ? { appearance } : {}), ...(condition.length ? { condition } : {}), ...(background.length ? { background } : {}) }, evidence };
}
