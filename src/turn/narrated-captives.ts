import type { CharacterOriginSnapshot, EstablishedClaim } from "../campaign/types.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";
import { GATES } from "./language/gates.js";
import { NUMBER_WORDS, TENS, numberValue } from "./language/numbers.js";
import { escapeRegExp as esc, sentencesOf } from "./language/text.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";

/**
 * Narrator-created people of the current scene (Promotion Pass 1.1, generalized in Persistence Pass 1.2). A person the narrator
 * introduces exists only in delivered narration until play makes them durable. This module derives, deterministically and
 * conservatively, who such people are, who said what (speaker attribution), which proper names were securely established for whom,
 * and which facts were actually established about them. It never decides that anything happens: name-establishment.ts promotes
 * named people, person-transactions.ts handles acquisitions.
 *
 * Conservatism rules:
 * - A proper name counts only when it is established AS a name: introduced by narration or someone's words ("a girl named Maren",
 *   "That's Brenna", "Her name is Maren", "Lysa, a young woman"), a self-introduction attributed to the speaker ("My name is Tomas",
 *   "I'm Tomas", a bare "Tomas." answering "What's your name?"), or — weakly — a quote opening with the name ("Brenna. Thirty-two.")
 *   that narration uses again. Capitalized words, places, titles, numbers and occupations are never names.
 * - A named person is present only if they act or speak in the scene, or narration's own voice introduces them; a name that is only
 *   talked about ("an old woman named Maren runs the apothecary") is not a person in the scene.
 * - A person is a captive only when a sentence about them carries a captivity marker (cage, bars, chains, auction, enslaved…).
 * - Facts come only from sentences about that person. Nothing is inferred from a name (sex, age, species, origin, personality).
 *   Hedged statements ("maybe eighteen, maybe less") establish nothing. Background is kept with its source (seller/self/narration).
 */
export interface NarrationUnit {
  readonly text: string; readonly quoted: boolean; readonly exchange: number;
  /** Quoted: attributed speaker. Narration: sentence subject. A present character ID, `other:<name|noun>`, or undefined. */
  readonly speaker?: string;
}
export interface NameIntroduction {
  readonly name: string; readonly exchange: number;
  /** pattern: introduced as a name; self: the speaker's own name; weak: a quote opening with the name. */
  readonly kind: "pattern" | "self" | "weak";
  readonly noun?: string; readonly speaker?: string; readonly narration_voice: boolean; readonly evidence: string;
}
export interface NarratedPerson {
  /** Scene-stable ephemeral reference (`narrated:<name|noun>`), or the character ID for a present persistent person. */
  readonly ref: string;
  readonly name?: string;
  /** The person noun narration attached to them (woman, girl, boy…), when established. */
  readonly noun?: string;
  /** Narrator-facing label: the name, else "the <noun>". */
  readonly label: string;
  readonly units: readonly NarrationUnit[];
  readonly in_latest: boolean;
  readonly captive: boolean;
  /** Acts or speaks in the scene, self-introduced, or introduced by narration's own voice. */
  readonly present: boolean;
  /** Set for a present persistent character (e.g. promoted by name earlier) whose legal status is not established yet. */
  readonly character_id?: string;
  readonly introductions: readonly NameIntroduction[];
  /** Speaker keys that denote this person. */
  readonly keys: readonly string[];
}
/** Pass 1.1 name, kept for readability at call sites that deal with captives. */
export type NarratedCaptive = NarratedPerson;
/** Pass 1.2: a present persistent character WITHOUT a name who introduced themselves by name. */
export interface LateNaming { readonly character_id: string; readonly name: string; readonly exchange: number; readonly evidence: string }

const QUOTE = /"([^"\n]{1,800})"|“([^”\n]{1,800})”/g;
const SPEECH = "says|said|asks|asked|replies|replied|adds|added|murmurs|murmured|whispers|whispered|mutters|muttered|answers|answered|continues|continued|repeats|repeated|calls|called|shouts|shouted|snaps|snapped|tells|told|insists|insisted|explains|explained|grunts|grunted|drawls|drawled|offers|offered";
export const PERSON_NOUNS = "woman|man|girl|boy|youth|child|lad|lass|elf|dwarf|halfling|orc|beastfolk|captive|prisoner|slave";
/** Nouns that can denote an unnamed speaker (anonymous counterparties included). */
export const SPEAKER_NOUNS = `${PERSON_NOUNS}|whittler|seller|merchant|trader|slaver|guard|keeper|handler|dealer|vendor|stallholder|hawker|stranger|porter|clerk|passer-by|passerby`;
const FEMALE_NOUNS = new Set(["woman", "girl", "lass"]), MALE_NOUNS = new Set(["man", "boy", "lad"]);
/**
 * Captivity markers (Pass 1.2: being HELD, not the mere presence of a cage). "leans on the cage" or "gestures at the cages" is not
 * captivity; "behind the bars", "in the last cage", "chained", "enslaved", "from a debt auction" is. See heldReferences for whom.
 */
export const CAPTIVE = /\b(?:(?:in|inside|behind|within|against|through|from) (?:the |a |an |her |his |its |their |this |that )?(?:[a-z-]+ ){0,2}?(?:cages?|bars|pens?|iron|irons|cell)|caged|in chains|in irons|chained|shackled|manacled|collared|fettered|enslaved|for sale|debt[- ](?:auction|forfeiture|bond)|auction(?:ed)?|write-offs?)\b/i;
const CAPTIVE_G = new RegExp(CAPTIVE.source, "gi");
const HELD_PRONOUN = /^(?:she|he|her|him)$/i;
/**
 * Whom each captivity marker in a unit is about: the nearest person reference before it in the unit, else the first after it.
 * References: a person noun phrase (`noun:<noun>`), a known or introduced name (character ID or `other:<Name>`), or — in narration
 * only — she/he/her/him, resolved to the unit's subject. Quoted pronouns are not resolved (they rarely mean the speaker).
 */
function heldReferences(u: NarrationUnit, nameKey: (token: string) => string | undefined): string[] {
  const refs = [...u.text.matchAll(new RegExp(`\\b(?:the|a|an|one|that|this)\\s+(?:[a-z'-]+\\s+){0,3}?(${SPEAKER_NOUNS})\\b|\\b(she|he|her|him)\\b|\\b([A-Za-z][a-z]{2,})(?:'s|’s)?\\b`, "gi"))]
    .map(m => ({ index: m.index!, key: m[1] ? `noun:${m[1].toLowerCase()}` : m[2] ? (HELD_PRONOUN.test(m[2]) && !u.quoted ? u.speaker : undefined) : /^[A-Z]/.test(m[3]!) ? nameKey(m[3]!) : undefined }))
    .filter((r): r is { index: number; key: string } => !!r.key);
  return [...u.text.matchAll(CAPTIVE_G)].flatMap(m => { const r = refs.filter(x => x.index < m.index!).at(-1) ?? refs.find(x => x.index > m.index!); return r ? [r.key] : []; });
}
const HEDGE = GATES.captive_fact_hedge;
/** Capitalized words that are never names (sentence starters, numbers, pronouns, states, common narration words). */
const STOP = new Set(["the", "a", "an", "he", "she", "they", "it", "his", "her", "their", "its", "i", "you", "we", "my", "your", "our", "this", "that", "these", "those", "there", "here",
  "what", "who", "why", "how", "when", "where", "which", "yes", "no", "not", "now", "done", "deal", "just", "only", "then", "and", "but", "or", "so", "if", "maybe", "perhaps", "look", "listen",
  "something", "nothing", "someone", "nobody", "everyone", "everything", "somewhere", "papers", "sick", "gold", "fine", "good", "well", "right", "sure", "please", "enough",
  "behind", "near", "between", "beyond", "inside", "outside", "above", "below", "after", "before", "again", "still", "even", "never", "always", "every", "each", "both", "all", "some", "any",
  "more", "less", "most", "much", "many", "few", "clean", "free", "take", "pay", "name", "price", "lord", "lady", "sir", "master", "mistress", "sorry", "afraid", "glad", "tired", "busy",
  "okay", "yours", "mine", "home", "back", "late", "new", "old", "ready", "thanks", "thank", "hungry", "cold", "hurt", "nobody", "nothing", "alone", "lost", "leaving", "coming", "going",
  ...NUMBER_WORDS, ...Object.keys(TENS)]);
const ASK_NAME = /\b(?:your name|who are you|what(?:'s| is| are) you called|what do (?:they|people) call you)\b/i;
const NAME = "([A-Z][a-z]{2,})";
const words = (s: string) => s.split(/\s+/).filter(t => t.length > 2);

/** Number words up to ninety-nine ("Thirty-two"), or digits: the canonical parser (language/numbers.ts). */
export { numberValue };

/** Trailing finalized exchanges in the current scene (a recorded different location ends the scene; unrecorded counts as same). */
export function sceneExchanges(recent: readonly RecentExchange[], locationId: string | undefined): readonly RecentExchange[] {
  const out: RecentExchange[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const e = recent[i]!;
    if (e.status !== "finalized") continue;
    if (e.location_id !== undefined && locationId !== undefined && e.location_id !== locationId) break;
    out.unshift(e);
  }
  return out;
}

type Sex = "female" | "male";
export interface Person { readonly id: string; readonly names: readonly string[]; readonly sex?: Sex; readonly unnamed: boolean }
function presentPeople(context: TurnContext): Person[] {
  return context.characters.map(c => {
    const n = c.id === "nicco" ? "Nicco" : c.profile.name ?? c.id;
    const declared = (c.profile.sex ?? "").toLowerCase(), pronoun = "pronoun" in c ? c.pronoun : undefined;
    const sex: Sex | undefined = /^(?:female|woman)$/.test(declared) || pronoun === "she" ? "female" : /^(?:male|man)$/.test(declared) || pronoun === "he" ? "male" : undefined;
    return { id: c.id, names: [n, ...words(n).filter(t => /^[A-Z]/.test(t))], ...(sex ? { sex } : {}), unnamed: "unnamed_label" in c && !!c.unnamed_label };
  });
}

/** Candidate name tokens for subject tracking (before attribution): any token a name pattern could introduce. */
function candidateNames(texts: readonly string[], ok: (n: string) => boolean): string[] {
  const all = texts.join("\n"), found = new Set<string>();
  for (const re of [new RegExp(`\\b(?:named|called|name(?:'s|’s| is| was)|(?:[Tt]his|[Tt]hat)(?: one)?(?:'s|’s| is)|I'm|I am|[Cc]all me)\\s+${NAME}\\b`, "g"),
    new RegExp(`\\b${NAME},\\s+(?:a|an)\\s+(?:[a-z'-]+\\s+){0,3}?(?:${PERSON_NOUNS})\\b`, "g"), new RegExp(`["“]${NAME}[.!,]`, "g")])
    for (const m of all.matchAll(re)) if (ok(m[1]!)) found.add(m[1]!);
  return [...found];
}

/**
 * Sentences and quotes of one narration, each with its attributed speaker (quotes) or subject (sentences). Pronouns resolve to the
 * most recent subject of a compatible established sex ("He swallows" skips a woman who spoke last); unknown sex is compatible.
 */
export function narrationUnits(narration: string, exchange: number, people: readonly Person[], others: readonly string[] = []): NarrationUnit[] {
  const out: NarrationUnit[] = [];
  const history: string[] = [];
  const otherNames = others.map(esc).join("|") || "(?!)";
  const sexOf = (key: string): Sex | undefined => {
    const p = people.find(x => x.id === key); if (p) return p.sex;
    const k = key.replace(/^other:/, "").toLowerCase();
    return FEMALE_NOUNS.has(k) ? "female" : MALE_NOUNS.has(k) ? "male" : undefined;
  };
  const pronounRef = (word: string): string | null => {
    const w = word.toLowerCase(), want: Sex | undefined = /^(?:he|him|his)$/.test(w) ? "male" : /^(?:she|her)$/.test(w) ? "female" : undefined;
    return history.find(h => !want || sexOf(h) === undefined || sexOf(h) === want) ?? null;
  };
  const remember = (key: string) => { const i = history.indexOf(key); if (i >= 0) history.splice(i, 1); history.unshift(key); };
  const subjectOf = (raw: string): string | null => {
    const t = raw.replace(/^[\s*_([,;:—–-]+/, "");
    for (const p of people) if (p.names.some(n => new RegExp(`^${esc(n)}(?:'s|’s)?\\b`, p.unnamed ? "i" : "").test(t))) return p.id;
    const pronoun = t.match(/^(he|she|they|his|her|their)\b/i);
    if (pronoun) return pronounRef(pronoun[1]!);
    const named = t.match(new RegExp(`^(${otherNames})(?:'s|’s)?\\b`));
    if (named) return `other:${named[1]}`;
    const verbish = t.match(/^([A-Z][a-z]{2,})(?:'s|’s)?\s+([a-z]+)/);
    if (verbish && !STOP.has(verbish[1]!.toLowerCase()) && /(?:s|ed)$/.test(verbish[2]!)) return `other:${verbish[1]}`;
    const noun = t.match(new RegExp(`^(?:the|a|an|one)\\s+(?:[a-z'-]+\\s+){0,2}?(${SPEAKER_NOUNS})\\b`, "i"));
    if (noun) return `other:${noun[1]!.toLowerCase().replace(/^passerby$/, "passer-by")}`;
    return null;
  };
  const clauseSubject = `(?:${people.flatMap(p => p.names).map(esc).join("|") || "(?!)"}|${otherNames}|he|she|they|(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,2}?[a-z-]+)`;
  const after = new RegExp(`^\\s*,?\\s*(?:(${clauseSubject})\\s+(?:${SPEECH})|(?:${SPEECH})\\s+(${clauseSubject}))\\b`, "i");
  const before = new RegExp(`(${clauseSubject})\\s+(?:${SPEECH})\\b[^"“”.!?]{0,40}[,:]\\s*$`, "i");
  const narrate = (segment: string) => {
    for (const s of segment.split(/(?<=[.!?…])\s+/)) {
      const text = s.replace(/[*_]/g, "").trim();
      if (!/[A-Za-z]{2}/.test(text)) continue;
      const subject = subjectOf(text);
      if (subject) remember(subject);
      out.push({ text, quoted: false, exchange, ...(subject ? { speaker: subject } : {}) });
    }
  };
  for (const paragraph of narration.split(/\n+/)) {
    const quotes = [...paragraph.matchAll(QUOTE)].map(m => ({ start: m.index!, end: m.index! + m[0].length, text: (m[1] ?? m[2])! }));
    let cursor = 0;
    for (const q of quotes) {
      const lead = paragraph.slice(cursor, q.start);
      narrate(lead);
      const tail = after.exec(paragraph.slice(q.end, q.end + 60).replace(/^[*_]+/, "")), head = before.exec(lead.replace(/[*_]/g, ""));
      const clause = tail ? tail[1] ?? tail[2] : head?.[1];
      const speaker = clause !== undefined ? subjectOf(clause) ?? history[0] : history[0];
      out.push({ text: q.text.trim(), quoted: true, exchange, ...(speaker ? { speaker } : {}) });
      cursor = q.end;
    }
    narrate(paragraph.slice(cursor));
  }
  return out;
}

/** Name introductions found in attributed units. */
function introductions(units: readonly NarrationUnit[], scene: readonly RecentExchange[], ok: (n: string) => boolean): NameIntroduction[] {
  const out: NameIntroduction[] = [];
  const add = (i: NameIntroduction) => { if (ok(i.name) && !out.some(o => o.name === i.name && o.exchange === i.exchange && o.kind === i.kind && o.speaker === i.speaker)) out.push(i); };
  for (const u of units) {
    const base = { exchange: u.exchange, narration_voice: !u.quoted, evidence: u.text.slice(0, 240) };
    for (const m of u.text.matchAll(new RegExp(`\\b(?:a|an|the)\\s+(?:[a-z'-]+\\s+){0,3}?(${PERSON_NOUNS})\\s+(?:named|called)\\s+${NAME}\\b`, "g"))) add({ ...base, name: m[2]!, kind: "pattern", noun: m[1]!.toLowerCase() });
    for (const m of u.text.matchAll(new RegExp(`\\b${NAME},\\s+(?:a|an)\\s+(?:[a-z'-]+\\s+){0,3}?(${PERSON_NOUNS})\\b`, "g"))) add({ ...base, name: m[1]!, kind: "pattern", noun: m[2]!.toLowerCase() });
    // Third-person naming of someone else ("That's Brenna", "Her name is Maren"); "my name" is a self-introduction below.
    for (const m of u.text.matchAll(new RegExp(`\\b(?:named|called|(?:[Hh]er|[Hh]is|[Tt]heir|[Tt]he (?:girl|boy|woman|man)'s) name(?:'s|’s| is| was)|(?:[Tt]his|[Tt]hat)(?: one)?(?:'s|’s| is))\\s+${NAME}\\b`, "g"))) add({ ...base, name: m[1]!, kind: "pattern" });
    if (!u.quoted) continue;
    const self = u.text.match(new RegExp(`\\b(?:[Mm]y name(?:'s|’s| is)|[Cc]all me|[Tt]hey call me)\\s+${NAME}\\b`)) ?? u.text.match(new RegExp(`(?:^|[.!?,;]\\s+)(?:I'm|I’m|I am)\\s+${NAME}\\b`))
      ?? u.text.match(new RegExp(`^Name(?:'s|’s)\\s+${NAME}\\b`))
      ?? (ASK_NAME.test(scene[u.exchange]?.player ?? "") ? u.text.match(new RegExp(`^${NAME}[.,!]?$`)) : null);
    if (self) add({ ...base, name: self[1]!, kind: "self", ...(u.speaker ? { speaker: u.speaker } : {}) });
    const weak = u.text.match(new RegExp(`^${NAME}\\.\\s+\\S`));
    if (weak) add({ ...base, name: weak[1]!, kind: "weak" });
  }
  return out;
}

export interface SceneReading {
  readonly units: readonly NarrationUnit[]; readonly persons: readonly NarratedPerson[]; readonly captives: readonly NarratedPerson[];
  readonly namings: readonly LateNaming[]; readonly people: readonly Person[]; readonly latest: number; readonly exchanges: readonly RecentExchange[];
}
export interface ReadOptions {
  /** Present persistent characters promoted while narrated as captives whose legal status is still unestablished (purchasable). */
  readonly unheld?: ReadonlySet<string>;
  /** Names of existing campaign characters anywhere (weak quote-opening names matching them are ignored). */
  readonly campaign_names?: ReadonlySet<string>;
}
/** Narrated people of the current scene who are not present persistent characters, plus present unheld captives and late namings. */
export function readScene(recent: readonly RecentExchange[], context: TurnContext, world: WorldStore, options: ReadOptions = {}): SceneReading {
  const scene = sceneExchanges(recent, context.primary.scene.player_location?.id);
  const people = presentPeople(context);
  const places = new Set(world.listEntities().filter(e => e.type !== "character").flatMap(e => (e.name ?? "").toLowerCase().split(/\s+/)));
  const known = new Set(people.flatMap(p => p.names.map(n => n.toLowerCase())));
  // A canon character's name is that canon person, never a new narrator-created one; if they are not present, the name is ambiguous.
  const canon = new Set(world.listEntities().filter(e => e.type === "character").flatMap(e => words(e.name ?? "").map(t => t.toLowerCase())));
  const ok = (n: string) => !STOP.has(n.toLowerCase()) && !places.has(n.toLowerCase()) && numberValue(n) === undefined;
  const units = scene.flatMap((e, i) => narrationUnits(e.narration, i, people, candidateNames(scene.map(x => x.narration), ok)));
  const latest = scene.length - 1;
  const intros = introductions(units, scene, ok);
  const allText = scene.map(e => e.narration).join("\n");
  const mention = (name: string) => new RegExp(`\\b${esc(name)}(?:'s|’s)?\\b`);
  const nounPhrase = (noun: string) => new RegExp(`\\b(?:a|an|the|that|this|one)\\s+(?:[a-z'-]+\\s+){0,3}?${esc(noun)}\\b`, "i");
  // Who each captivity marker is about (Pass 1.2): being held is attached to the nearest person reference, not to the sentence.
  const introNames = new Set(intros.map(i => i.name));
  const held = new Map(units.map(u => [u, heldReferences(u, t => people.find(p => p.names.includes(t))?.id ?? (introNames.has(t) ? `other:${t}` : undefined))] as const));
  const persons: NarratedPerson[] = [], namings: LateNaming[] = [];
  for (const name of [...new Set(intros.map(i => i.name))]) {
    const mine = intros.filter(i => i.name === name);
    const selfSpeakers = [...new Set(mine.filter(i => i.kind === "self" && i.speaker).map(i => i.speaker!))];
    // A present persistent character with no name introducing themselves: late naming of that same character. Checked first: names
    // are not unique, so another Maren elsewhere (or even here) does not stop the girl from being Maren.
    const late = selfSpeakers.filter(s => people.some(p => p.id === s && p.unnamed));
    if (late.length) { if (late.length === 1 && selfSpeakers.length === 1) { const i = mine.find(x => x.speaker === late[0])!; namings.push({ character_id: late[0]!, name, exchange: i.exchange, evidence: i.evidence }); } continue; }
    if (known.has(name.toLowerCase())) continue; // a present persistent person: never a new one
    if (canon.has(name.toLowerCase())) continue; // canon identity: never duplicated by a narrator-created person
    if (selfSpeakers.some(s => people.some(p => p.id === s))) continue; // a named persistent person cannot claim another name
    if (selfSpeakers.length > 1) continue; // two different speakers claim the name: unresolved
    const weakOnly = mine.every(i => i.kind === "weak");
    // A weak quote-opening name ("Brenna. Thirty-two.") counts only if narration also uses it as an acting person ("Brenna coughs…"):
    // "Soft. Like it's something to be proud of." is a word, not a name. It never matches an existing campaign character (vocative).
    if (weakOnly && (!units.some(u => !u.quoted && new RegExp(`^${esc(name)}(?:'s|’s)?\\s+[a-z]`).test(u.text)) || allText.split(mention(name)).length <= 2 || options.campaign_names?.has(name.toLowerCase()))) continue;
    const selfNoun = selfSpeakers[0]?.startsWith("other:") && new RegExp(`^(?:${SPEAKER_NOUNS})$`, "i").test(selfSpeakers[0].slice(6)) ? selfSpeakers[0].slice(6).toLowerCase() : undefined;
    const noun = mine.find(i => i.noun)?.noun ?? selfNoun;
    const keys = [`other:${name}`, ...(selfNoun ? [`other:${selfNoun}`] : [])];
    const about = units.filter(u => mention(name).test(u.text) || keys.includes(u.speaker ?? "") || (!!selfNoun && nounPhrase(selfNoun).test(u.text)));
    const present = mine.some(i => i.narration_voice || i.kind === "self") || about.some(u => keys.includes(u.speaker ?? ""));
    persons.push({ ref: `narrated:${name.toLowerCase()}`, name, ...(noun ? { noun } : {}), label: name, units: about, in_latest: about.some(u => u.exchange === latest),
      captive: about.some(u => { const h = held.get(u)!; return keys.some(k => h.includes(k)) || (!!noun && h.includes(`noun:${noun}`) && mention(name).test(u.text)) || (!!selfNoun && h.includes(`noun:${selfNoun}`)); }),
      present, introductions: mine, keys });
  }
  // Present persistent characters with no legal record yet, narrated as captives (e.g. promoted by name before any sale).
  for (const p of people) {
    if (!options.unheld?.has(p.id)) continue;
    const about = units.filter(u => u.speaker === p.id || p.names.some(n => mention(n).test(u.text)));
    // `unheld` is already restricted by the caller to people promoted while narrated as captives: no new marker is required.
    persons.push({ ref: p.id, name: p.names[0]!, label: p.names[0]!, units: about, in_latest: about.some(u => u.exchange === latest), captive: true, present: true, character_id: p.id, introductions: [], keys: [p.id] });
  }
  // Unnamed captives: "a/the <adjectives> <person noun>" in a sentence with a captivity marker. Used for ambiguity and descriptions.
  const labels = new Set(people.map(p => p.names[0]!.toLowerCase().replace(/^(?:the|a|an)\s+/, "")));
  const nouns = new Set<string>();
  const personNoun = new RegExp(`^(?:${PERSON_NOUNS})$`);
  for (const h of held.values()) for (const k of h) { const n = k.replace(/^(?:noun|other):/, ""); if (k !== n && personNoun.test(n)) nouns.add(n); }
  for (const noun of nouns) {
    // Skip a description that is a present persistent person's label, one a named person introduced themselves under, or one that
    // only ever appears together with the name narration attached it to ("a young woman named Lysa").
    const withNoun = units.filter(u => nounPhrase(noun).test(u.text));
    const namedWith = [...new Set(intros.filter(i => i.noun === noun).map(i => i.name))];
    if (labels.has(noun) || persons.some(p => p.keys.includes(`other:${noun}`)) || namedWith.some(name => withNoun.every(u => mention(name).test(u.text)))) continue;
    const about = units.filter(u => nounPhrase(noun).test(u.text) || u.speaker === `other:${noun}`);
    persons.push({ ref: `narrated:${noun}`, noun, label: `the ${noun}`, units: about, in_latest: about.some(u => u.exchange === latest), captive: true, present: true, introductions: [], keys: [`other:${noun}`] });
  }
  return { units, persons, captives: persons.filter(p => p.captive && (p.present || !!p.character_id)), namings, people, latest, exchanges: scene };
}

/** Does this text refer to the person by name or (for an unnamed person) by their description? */
export function refersTo(person: NarratedPerson, text: string): boolean {
  if (person.name && new RegExp(`\\b${esc(person.name)}(?:'s|’s)?\\b`, "i").test(text)) return true;
  return !person.name && !!person.noun && new RegExp(`\\b(?:the|that|this)\\s+(?:[a-z'-]+\\s+){0,2}?${esc(person.noun)}\\b`, "i").test(text);
}

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
const BACKGROUND = /\b(?:debt|auction|forfeit\w*|captured|taken from|sold (?:for|by|to|off)|was an? [a-z]+|worked (?:in|at|as)|came in|brought in|picked (?:her|him|them) (?:off|up)|born|from the [a-z]+ (?:court|pits?|mines?|road))\b/i;

/**
 * Facts established about a person in the scene narration, and nothing else. `sellerKey` marks statements attributed to a seller.
 */
export function establishedFacts(person: NarratedPerson, sellerKey: string | undefined, nameOf: (id: string) => string): { established: CharacterOriginSnapshot["established"]; evidence: string[] } {
  const own = person.keys, units = person.units;
  // Physical facts only from sentences ABOUT them: their own narration sentences, their introduction, or (unnamed) the sentences
  // describing them by their noun. A sentence that merely mentions them ("Brenna's grey eyes find Maren") describes someone else.
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
  let age: CharacterOriginSnapshot["established"]["age"];
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
  const background: EstablishedClaim[] = [];
  for (const u of units) for (const s of sentencesOf(u.text)) {
    if (!BACKGROUND.test(s) || HEDGE.test(s) || background.length >= 6) continue;
    const source: EstablishedClaim["source"] = !u.quoted ? "narration" : u.speaker === sellerKey ? "seller" : own.includes(u.speaker ?? "") ? "self" : "other";
    const by = u.quoted && u.speaker && !u.speaker.startsWith("other:") ? nameOf(u.speaker) : undefined;
    if (!background.some(b => b.text === s)) background.push({ text: s.slice(0, 200), source, ...(by ? { by } : {}) });
  }
  const who = (key: string | undefined) => !key ? "Someone" : own.includes(key) ? person.label : key.startsWith("other:") ? `The ${key.slice(6)}` : nameOf(key);
  const evidence = units.slice(0, 8).map(u => (u.quoted ? `${who(u.speaker)}: "${u.text}"` : u.text).slice(0, 240));
  return { established: { ...(person.name ? { name: person.name } : {}), ...(sex ? { sex } : {}), ...(age ? { age } : {}), ...(species ? { species } : {}), ...(person.noun ? { descriptor: person.noun } : {}),
    ...(appearance.length ? { appearance } : {}), ...(condition.length ? { condition } : {}), ...(background.length ? { background } : {}) }, evidence };
}

/** The one player-introduced scene participant ("the slave", "the boy") this person already was, if any. */
export function linkedParticipant(person: NarratedPerson, participants: readonly EphemeralSceneParticipant[]): EphemeralSceneParticipant | undefined {
  const matches = participants.filter(p => (person.captive && p.role === "slave") || (!!person.noun && (p.display_name.toLowerCase() === person.noun || p.descriptor?.split(/\s+/).at(-1) === person.noun)));
  return matches.length === 1 ? matches[0] : undefined;
}
