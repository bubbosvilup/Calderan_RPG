import type { CharacterOriginSnapshot, EstablishedClaim } from "../campaign/types.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";
import { GATES } from "./language/gates.js";
import { NUMBER_WORDS, TENS, numberValue } from "./language/numbers.js";
import { escapeRegExp as esc, sentencesOf } from "./language/text.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";
import { rpgDialogue, rpgNarration } from "./rpg-dialogue.js";

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
 *   "I'm Tomas", a bare "Tomas." answering "What's your name?" or "Name's Nicco, what about you?"), or — weakly — a quote opening
 *   with the name ("Brenna. Thirty-two.") that narration uses again. Capitalized words, places, titles, numbers and occupations are
 *   never names. With `rpg_speech`, plain RPG lines are speech, but self-introductions in them need an attributed speaker.
 * - Canon names are not global keys: an absent canon person's shared first name can belong to one described narrated speaker.
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
  /** Plain RPG speech outside *narration*; its speaker comes only from the immediately preceding narration beat. */
  readonly rpg?: boolean;
}
export interface NameIntroduction {
  readonly name: string; readonly exchange: number;
  /** pattern: introduced as a name; self: the speaker's own name; weak: a quote opening with the name. */
  readonly kind: "pattern" | "self" | "weak";
  /** The attributed speaker of the quote it came from (self: the person themself; pattern: whoever introduced them). */
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
export const CAPTIVE = /\b(?:(?:in|inside|behind|within|against|through|from) (?:the |a |an |her |his |its |their |this |that )?(?:[a-z-]+ ){0,2}?(?:cages?|bars|pens?|iron|irons|cell)|caged|in chains|in irons|chained|shackled|manacled|collared|fettered|enslaved|for sale|debt[- ](?:auction|forfeiture|bond)|auctioned|(?:up )?for auction|(?:on|from) the (?:auction )?block|auction block|write-offs?)\b/i;
const CAPTIVE_G = new RegExp(CAPTIVE.source, "gi");
const HELD_PRONOUN = /^(?:she|he|her|him)$/i;
/**
 * Whom each captivity marker in a unit is about: the nearest person reference before it in the unit, else the first after it.
 * References: a person noun phrase (`noun:<noun>`), a known or introduced name (character ID or `other:<Name>`), or — in narration
 * only — she/he/her/him, resolved to the unit's subject. Quoted pronouns are not resolved (they rarely mean the speaker).
 */
function heldReferences(u: NarrationUnit, nameKey: (token: string) => string | undefined, topic?: (pronoun: string) => string | undefined): string[] {
  const refs = [...u.text.matchAll(new RegExp(`\\b(?:the|a|an|one|that|this|another)\\s+(?:[a-z'-]+\\s+){0,3}?(${SPEAKER_NOUNS})\\b|\\b(she|he|her|him)\\b|\\b([A-Za-z][a-z]{2,})(?:'s|’s)?\\b`, "gi"))]
    .filter(m => !(m[1] && new RegExp(`^\\s+(?:${SPEECH})\\b`).test(u.text.slice(m.index! + m[0].length))))
    .map(m => ({ index: m.index!, key: m[1] ? `noun:${m[1].toLowerCase()}` : m[2] ? (HELD_PRONOUN.test(m[2]) ? (u.quoted ? topic?.(m[2]) : u.speaker) : undefined) : /^[A-Z]/.test(m[3]!) ? nameKey(m[3]!) : undefined }))
    .filter((r): r is { index: number; key: string } => !!r.key);
  // "from the pens" after a gaze or movement ("eyes shift from the pens to Nicco") is where someone looks or walks from, not captivity.
  const ORIGIN = /\b(?:eyes?|gaze|head|glances?|looks?|shifts?|turns?|steps?|comes?|came|emerges?|walks?|moves?|drifts?|swings?|snaps?|darts?|lifts?|pushes? off)\b[^.!?]{0,40}$/i;
  return [...u.text.matchAll(CAPTIVE_G)].filter(m => !(/^from\b/i.test(m[0]) && ORIGIN.test(u.text.slice(0, m.index!)))).flatMap(m => { const end = m.index! + m[0].length, r = refs.filter(x => x.index < m.index!).at(-1) ?? refs.find(x => x.index > m.index! && !/[;—–.!?]|\bbut\b/i.test(u.text.slice(end, x.index))); return r ? [r.key] : []; });
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
const ASK_NAME = /\b(?:your name|who are you|what(?:'s| is| are) you called|what do (?:they|people) call you|what (?:do|should|shall) i call you)\b/i;
/** The player's own name introduction; a reciprocal question after it in the same input asks for the other person's name. */
const OWN_NAME = /\b(?:my name(?:'s|’s| is)|name(?:'s|’s)|i(?:'m|’m| am)|call me|they call me)\s+nicco\b/i;
const RECIPROCAL = /(?:^|[,.;:!?…—–-])\s*(?:(?:and|so|but)\s+)?(?:(?:what|how) about you|and you(?:rs)?|you)\s*[?!.]*\s*$/i;
/**
 * A bounded name question: an explicit one ("What's your name?"), or a reciprocal "what about you?" / "and you?" closing an input
 * in which the player first gave his own name ("Name's Nicco, what about you?"). Reciprocal phrasing alone is never a name question.
 */
export function asksName(player: string): boolean {
  if (ASK_NAME.test(player)) return true;
  const own = OWN_NAME.exec(player);
  return !!own && RECIPROCAL.test(player.slice(own.index + own[0].length));
}
const NAME = "([A-Z][a-z]{2,})";
const words = (s: string) => s.split(/\s+/).filter(t => t.length > 2);

/** Words that can stand as a personal name: not a stop word, a place token or a number. */
export function nameFilter(world: WorldStore): (name: string) => boolean {
  const places = new Set(world.listEntities().filter(e => e.type !== "character" && !e.knowledge?.secrecy).flatMap(e => (e.name ?? "").toLowerCase().split(/\s+/)));
  return n => !STOP.has(n.toLowerCase()) && !places.has(n.toLowerCase()) && numberValue(n) === undefined;
}

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
export function presentPeople(context: TurnContext): Person[] {
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
/** Bodily-action cues of a narrated beat written without asterisks. */
const PLAIN_BEAT = /\b(?:(?:his|her|their)\s+(?:hands?|eyes?|face|jaw|crouch|head|shoulders?|arms?|knees?|lips|breath|weight|thumbs?|fingers?|nose|belt)|(?:watches|studies|reads|shifts|glances|looks|nods|shrugs|scratches|rubs|turns|steps|crouches|stands|leans|exhales|sighs|grunts|pauses|waits|hasn't moved|has not moved))\b/i;
export function narrationUnits(narration: string, exchange: number, people: readonly Person[], others: readonly string[] = [],
  options: { readonly rpg?: boolean; readonly carry?: readonly string[] } = {}): NarrationUnit[] {
  const out: NarrationUnit[] = [];
  const history: string[] = [];
  const rpg = !!options.rpg && rpgNarration(narration).length > 0 && !!rpgDialogue(narration)?.length;
  const otherNames = others.map(esc).join("|") || "(?!)";
  const sexOf = (key: string): Sex | undefined => {
    const p = people.find(x => x.id === key); if (p) return p.sex;
    const k = key.replace(/^other:/, "").toLowerCase();
    return FEMALE_NOUNS.has(k) ? "female" : MALE_NOUNS.has(k) ? "male" : undefined;
  };
  const pronounRef = (word: string): string | null => {
    const w = word.toLowerCase(), want: Sex | undefined = /^(?:he|him|his)$/.test(w) ? "male" : /^(?:she|her)$/.test(w) ? "female" : undefined;
    const found = history.find(h => !want || sexOf(h) === undefined || sexOf(h) === want);
    if (found || !rpg || !want) return found ?? null;
    // RPG beats often open on a pronoun continuing the previous exchange ("*Her eyes stay half-open…*"). Only the single earlier
    // scene subject of that established sex qualifies; none or several attribute nothing.
    const carried = [...new Set(options.carry ?? [])].filter(k => sexOf(k) === want);
    return carried.length === 1 ? carried[0]! : null;
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
  // A subject made of two people ("The woman and the girl look up") or a plural one attributes no following RPG speech.
  const plural = new RegExp(`^(?:they|both|the two|the (?:women|men|girls|boys|children|others)|(?:(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,2}?(?:${SPEAKER_NOUNS})|[A-Z][a-z]+)\\s+(?:and|&)\\s+(?:the|a|an|his|her|their|[A-Z]))\\b`, "i");
  let beat: string | undefined;
  const narrate = (segment: string) => {
    for (const s of segment.split(/(?<=[.!?…])\s+/)) {
      const text = s.replace(/[*_]/g, "").trim();
      if (!/[A-Za-z]{2}/.test(text)) continue;
      const subject = subjectOf(text);
      if (subject) remember(subject);
      if (subject || plural.test(text)) beat = subject && !plural.test(text) ? subject : undefined;
      out.push({ text, quoted: false, exchange, ...(subject ? { speaker: subject } : {}) });
    }
  };
  const paragraph = (text: string) => {
    const quotes = [...text.matchAll(QUOTE)].map(m => ({ start: m.index!, end: m.index! + m[0].length, text: (m[1] ?? m[2])! }));
    let cursor = 0;
    for (const q of quotes) {
      const lead = text.slice(cursor, q.start);
      narrate(lead);
      const tail = after.exec(text.slice(q.end, q.end + 60).replace(/^[*_]+/, "")), head = before.exec(lead.replace(/[*_]/g, ""));
      const clause = tail ? tail[1] ?? tail[2] : head?.[1];
      const speaker = clause !== undefined ? subjectOf(clause) ?? history[0] : history[0];
      out.push({ text: q.text.trim(), quoted: true, exchange, ...(speaker ? { speaker } : {}) });
      cursor = q.end;
    }
    narrate(text.slice(cursor));
  };
  // RPG format (the project's narrator contract, shared with rpg-dialogue.ts): *narration* in single asterisks, spoken dialogue plain
  // outside them. Used only when the narration has complete starred spans and rpgDialogue accepts it; anything else is legacy prose.
  if (rpg) {
    const stars = [...narration.matchAll(/(?<!\\)\*/g)].map(m => m.index!);
    const blocks: { text: string; starred: boolean }[] = [];
    for (let i = 0, start = 0; i <= stars.length; i += 2) {
      blocks.push({ text: narration.slice(start, stars[i] ?? narration.length), starred: false });
      if (i < stars.length) { blocks.push({ text: narration.slice(stars[i]! + 1, stars[i + 1]!), starred: true }); start = stars[i + 1]! + 1; }
    }
    for (const block of blocks) {
      if (block.starred) { beat = undefined; block.text.split(/\n+/).forEach(paragraph); continue; }
      for (const line of block.text.split(/\r?\n/).map(s => s.trim()).filter(s => /[A-Za-z]{2}/.test(s) && s.length <= 400)) {
        if (/["“”]/.test(line) && !/^["“][^"“”]*["”]$/.test(line)) { paragraph(line); continue; } // legacy attributed quote
        // A plain line that is really narration (a person-noun or name subject doing a bodily action, no first/second person) that the
        // narrator forgot to star is a beat, not speech: it must neither be attributed to the previous beat's subject nor hide its own.
        if (!/^(?:he|she|they|his|her|their)\b/i.test(line) && !/\b(?:i|i'm|i've|i'll|i'd|you|you're|you'll|your|my|me|we|us|let's)\b/i.test(line) && PLAIN_BEAT.test(line) && subjectOf(line)) { paragraph(line); continue; }
        // Plain speech belongs to the subject of the immediately preceding narration beat; with none, it is unattributed.
        // A speaker does not talk about themself in the third person: speech using she/her (he/him) is not the beat subject's when that subject is female (male).
        const aboutBeat = !!beat && ((sexOf(beat) === "female" && /\b(?:she|her|hers|herself)\b/i.test(line)) || (sexOf(beat) === "male" && /\b(?:he|him|his|himself)\b/i.test(line)));
        out.push({ text: line.replace(/^["“]([\s\S]*)["”]$/, "$1").trim(), quoted: true, exchange, rpg: true, ...(beat && !aboutBeat ? { speaker: beat } : {}) });
      }
    }
    return out;
  }
  narration.split(/\n+/).forEach(paragraph);
  return out;
}

/** Name introductions found in attributed units. */
/** A speech line that opens with a bare name: "Brenna. Thirty-two." or, with the narrator's tag, "Brenna, the short man says, …". */
const weakName = () => new RegExp(`^${NAME}(?:\\.\\s+\\S|,\\s+(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,3}?(?:${SPEAKER_NOUNS})\\s+(?:${SPEECH})\\b)`);
function introductions(units: readonly NarrationUnit[], scene: readonly RecentExchange[], ok: (n: string) => boolean): NameIntroduction[] {
  const out: NameIntroduction[] = [];
  const add = (i: NameIntroduction) => { if (ok(i.name) && !out.some(o => o.name === i.name && o.exchange === i.exchange && o.kind === i.kind && o.speaker === i.speaker)) out.push(i); };
  for (const u of units) {
    const base = { exchange: u.exchange, narration_voice: !u.quoted, evidence: u.text.slice(0, 240), ...(u.quoted && u.speaker ? { speaker: u.speaker } : {}) };
    for (const m of u.text.matchAll(new RegExp(`\\b(?:a|an|the)\\s+(?:[a-z'-]+\\s+){0,3}?(${PERSON_NOUNS})\\s+(?:named|called)\\s+${NAME}\\b`, "g"))) add({ ...base, name: m[2]!, kind: "pattern", noun: m[1]!.toLowerCase() });
    for (const m of u.text.matchAll(new RegExp(`\\b${NAME},\\s+(?:a|an)\\s+(?:[a-z'-]+\\s+){0,3}?(${PERSON_NOUNS})\\b`, "g"))) add({ ...base, name: m[1]!, kind: "pattern", noun: m[2]!.toLowerCase() });
    for (const m of u.text.matchAll(new RegExp(`(?:^|[.!?]\\s+)(?:[Tt]hat's|[Tt]hat is|[Tt]his is)\\s+(?:her|him)[.:,]?\\s+${NAME}\\b`, "g"))) add({ ...base, name: m[1]!, kind: "pattern" });
    // Third-person naming of someone else ("That's Brenna", "Her name is Maren"); "my name" is a self-introduction below.
    for (const m of u.text.matchAll(new RegExp(`\\b(?:named|called|(?:[Hh]er|[Hh]is|[Tt]heir|[Tt]he (?:girl|boy|woman|man)'s) name(?:'s|’s| is| was)|(?:[Tt]his|[Tt]hat)(?: one)?(?:'s|’s| is))\\s+${NAME}\\b`, "g"))) add({ ...base, name: m[1]!, kind: "pattern" });
    // Unattributed plain RPG speech is nobody's self-introduction, but a speech line that opens with a bare name is still a weak
    // presentation ("Brenna. Thirty-two."); weak names are accepted only when narration also treats the name as a person (readScene).
    if (u.quoted && u.rpg && !u.speaker) { const w = u.text.match(weakName()); if (w) add({ ...base, name: w[1]!, kind: "weak" }); continue; }
    if (!u.quoted) continue;
    const self = u.text.match(new RegExp(`\\b(?:[Mm]y name(?:'s|’s| is)|[Cc]all me|[Tt]hey call me)\\s+${NAME}\\b`)) ?? u.text.match(new RegExp(`(?:^|[.!?,;]\\s+)(?:I'm|I’m|I am)\\s+${NAME}\\b`))
      ?? u.text.match(new RegExp(`^Name(?:'s|’s)\\s+${NAME}\\b`))
      ?? (asksName(scene[u.exchange]?.player ?? "") ? u.text.match(new RegExp(`^${NAME}[.,!]?$`)) : null);
    if (self) add({ ...base, name: self[1]!, kind: "self" });
    const weak = u.text.match(weakName());
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
  /**
   * Read RPG output (*narration*, plain speech) as attributed speech (created-person identity binding). Opt-in: name establishment
   * uses it; purchase/price resolution and narration audits keep their existing projection.
   */
  readonly rpg_speech?: boolean;
}
/**
 * Partner continuity. The narrator renders an unfamiliar canonical person by description ("the short man", "the seller"); the exchange
 * recorded who the player was talking with. When exactly ONE descriptor speaker of a compatible sex appears in that exchange, that
 * descriptor is the recorded present partner, so a price or an ownership claim voiced by "the man" is that person's, not an anonymous
 * counterparty's. Two competing descriptors, an absent partner or an incompatible sex bind nothing (fail closed).
 */
function bindPartnerSpeaker(units: NarrationUnit[], partnerId: string | undefined, people: readonly Person[]): NarrationUnit[] {
  const partner = partnerId && partnerId !== "nicco" ? people.find(p => p.id === partnerId) : undefined;
  if (!partner) return units;
  const compatible = (key: string) => { const noun = key.slice(6).toLowerCase(); return !(partner.sex === "male" && FEMALE_NOUNS.has(noun)) && !(partner.sex === "female" && MALE_NOUNS.has(noun)); };
  const keys = [...new Set(units.flatMap(u => u.speaker && /^other:[a-z-]+$/.test(u.speaker) && new RegExp(`^other:(?:${SPEAKER_NOUNS})$`).test(u.speaker) && compatible(u.speaker) ? [u.speaker] : []))];
  if (keys.length !== 1) return units;
  return units.map(u => u.speaker === keys[0] ? { ...u, speaker: partner.id } : u);
}
/** Narrated people of the current scene who are not present persistent characters, plus present unheld captives and late namings. */
export function readScene(recent: readonly RecentExchange[], context: TurnContext, world: WorldStore, options: ReadOptions = {}): SceneReading {
  const scene = sceneExchanges(recent, context.primary.scene.player_location?.id);
  const people = presentPeople(context);
  const known = new Set(people.flatMap(p => p.names.map(n => n.toLowerCase())));
  // Canon names (each full name with its tokens). Names are not unique, so a canon token is not a global key; see the check below.
  const canon = world.listEntities().filter(e => e.type === "character" && e.name).map(e => ({ full: e.name!, tokens: words(e.name!).map(t => t.toLowerCase()) }));
  const ok = nameFilter(world);
  const others = candidateNames(scene.map(x => x.narration), ok);
  // With rpg_speech, pronouns opening an RPG beat may also continue the scene's single earlier subject of that sex.
  const units: NarrationUnit[] = [];
  // The conversation partner persists until replaced: a turn that addressed nobody ("let's see the northerner first") does not end the seller's presence.
  let partner: string | undefined;
  const partnerAt = new Map<number, string>();
  for (const [i, e] of scene.entries()) {
    partner = e.conversation_partner_id ?? partner;
    if (partner) partnerAt.set(i, partner);
    units.push(...bindPartnerSpeaker(narrationUnits(e.narration, i, people, others, options.rpg_speech ? { rpg: true, carry: units.filter(u => !u.quoted && u.speaker).map(u => u.speaker!) } : {}), partner, people));
  }
  const latest = scene.length - 1;
  const intros = introductions(units, scene, ok);
  const allText = scene.map(e => e.narration).join("\n");
  const sceneText = scene.map(e => `${e.player}\n${e.narration}`).join("\n");
  const nounSpeaker = new RegExp(`^other:(?:${SPEAKER_NOUNS})$`, "i");
  const mention = (name: string) => new RegExp(`\\b${esc(name)}(?:'s|’s)?\\b`);
  const nounPhrase = (noun: string) => new RegExp(`\\b(?:a|an|the|that|this|one|another)\\s+(?:[a-z'-]+\\s+){0,3}?${esc(noun)}\\b`, "i");
  // Who each captivity marker is about (Pass 1.2): being held is attached to the nearest person reference, not to the sentence.
  const introNames = new Set(intros.map(i => i.name));
  // A quoted she/he/her/him ("Picked her up at a debt auction", "She's a write-off") continues the person that exchange presented: one named by a
  // speech line, else the exchange's single narrated girl/woman (boy/man) other than the speaker.
  const topics = new Map<number, string>();
  // Anaphora: the pronoun refers to the girl/woman (boy/man) narration mentioned last before the speech line, other than the speaker.
  const described = (index: number, sex: Sex, except: string | undefined): string | undefined => {
    const exchange = units[index]!.exchange, nouns = (sex === "female" ? [...FEMALE_NOUNS] : [...MALE_NOUNS]).join("|");
    for (let i = index - 1; i >= 0 && units[i]!.exchange === exchange; i--) {
      if (units[i]!.quoted) continue;
      const text = units[i]!.text;
      const found = [...text.matchAll(new RegExp(`\\b(?:the|a|an|one|that|this)\\s+(?:[a-z'-]+\\s+){0,3}?(${nouns})\\b`, "gi"))].filter(m => `other:${m[1]!.toLowerCase()}` !== except).map(m => ({ at: m.index!, key: `noun:${m[1]!.toLowerCase()}` })).at(-1);
      const byName = [...text.matchAll(/\b([A-Z][a-z]{2,})(?:'s|’s)?\b/g)].filter(m => introNames.has(m[1]!)).map(m => ({ at: m.index!, key: `name:${m[1]}` })).at(-1);
      const best = [found, byName].filter((x): x is { at: number; key: string } => !!x).sort((a, b) => b.at - a.at)[0];
      if (best) return best.key;
    }
    return undefined;
  };
  // The one girl/woman (boy/man) narration describes before an introduction unit in its exchange; none or several describe nobody.
  const soleNoun = (intro: NameIntroduction): string | undefined => {
    const index = units.findIndex(x => x.exchange === intro.exchange && x.text.slice(0, 240) === intro.evidence);
    if (index < 0) return undefined;
    const found = (nouns: ReadonlySet<string>) => new Set(units.slice(0, index).filter(x => x.exchange === intro.exchange && !x.quoted)
      .flatMap(x => [...x.text.matchAll(new RegExp(`\\b(?:the|a|an|one|that|this)\\s+(?:[a-z'-]+\\s+){0,3}?(${[...nouns].join("|")})\\b`, "gi"))].map(m => m[1]!.toLowerCase())));
    // The presenting speaker is not the person presented: their own descriptor ("the short man") does not count.
    const speaker = units[index]!.speaker ?? partnerAt.get(intro.exchange), speakerSex = !speaker ? undefined : speaker.startsWith("other:") ? (FEMALE_NOUNS.has(speaker.slice(6).toLowerCase()) ? "female" : MALE_NOUNS.has(speaker.slice(6).toLowerCase()) ? "male" : undefined) : people.find(p => p.id === speaker)?.sex;
    const women = speakerSex === "female" ? new Set<string>() : found(FEMALE_NOUNS), men = speakerSex === "male" ? new Set<string>() : found(MALE_NOUNS);
    return women.size === 1 && !men.size ? [...women][0] : men.size === 1 && !women.size ? [...men][0] : undefined;
  };
  const held = new Map(units.map((u, index) => {
    const presented = intros.find(i => i.exchange === u.exchange && i.kind !== "self" && i.evidence === u.text.slice(0, 240));
    if (presented) topics.set(u.exchange, presented.name);
    const named = u.quoted ? topics.get(u.exchange) : undefined;
    const topic = (pronoun: string): string | undefined => {
      if (named) return people.find(p => p.names.includes(named))?.id ?? (introNames.has(named) ? `other:${named}` : undefined);
      const sex: Sex = /^(?:she|her)$/i.test(pronoun) ? "female" : "male";
      const found = described(index, sex, u.speaker);
      return found?.startsWith("name:") ? (people.find(p => p.names.includes(found.slice(5)))?.id ?? `other:${found.slice(5)}`) : found;
    };
    return [u, heldReferences(u, t => people.find(p => p.names.includes(t))?.id ?? (introNames.has(t) ? `other:${t}` : undefined), u.quoted ? topic : undefined)] as const;
  }));
  const persons: NarratedPerson[] = [], namings: LateNaming[] = [];
  for (const name of [...new Set(intros.map(i => i.name))]) {
    const mine = intros.filter(i => i.name === name);
    const selfSpeakers = [...new Set(mine.filter(i => i.kind === "self" && i.speaker).map(i => i.speaker!))];
    // A present persistent character with no name introducing themselves: late naming of that same character. Checked first: names
    // are not unique, so another Maren elsewhere (or even here) does not stop the girl from being Maren.
    const late = selfSpeakers.filter(s => people.some(p => p.id === s && p.unnamed));
    if (late.length) { if (late.length === 1 && selfSpeakers.length === 1) { const i = mine.find(x => x.speaker === late[0])!; namings.push({ character_id: late[0]!, name, exchange: i.exchange, evidence: i.evidence }); } continue; }
    if (known.has(name.toLowerCase())) continue; // a present persistent person: never a new one
    if (selfSpeakers.some(s => people.some(p => p.id === s))) continue; // a named persistent person cannot claim another name
    if (selfSpeakers.length > 1) continue; // two different speakers claim the name: unresolved
    // Canon nonduplication, actor-bound rather than string-bound. A PRESENT canon bearer of the name is `known` above. An absent canon
    // person still owns: their whole name used as the name (a mononym), and any scene where their full name is spoken or written (the
    // referent may be them). Otherwise a shared first name ("Mira" vs an absent Mira Thorne) belongs to a new person only when one
    // distinct narrated actor (a described woman/man/girl…) introduced themself with it and nothing else introduced it.
    const bearers = canon.filter(c => c.tokens.includes(name.toLowerCase()));
    if (bearers.length) {
      const exact = bearers.some(c => c.full.toLowerCase() === name.toLowerCase());
      const referenced = bearers.some(c => new RegExp(`\\b${esc(c.full)}\\b`, "i").test(sceneText));
      const bound = selfSpeakers.length === 1 && nounSpeaker.test(selfSpeakers[0]!) && mine.every(i => i.kind === "weak" || (i.kind === "self" && i.speaker === selfSpeakers[0]));
      if (exact || referenced || !bound) continue;
    }
    const weakOnly = mine.every(i => i.kind === "weak");
    // A weak quote-opening name ("Brenna. Thirty-two.") counts only if narration also uses it as a person ("Brenna coughs…", "glances down at Brenna"):
    // "Soft. Like it's something to be proud of." is a word, not a name. It never matches an existing campaign character (vocative).
    if (weakOnly && (!units.some(u => !u.quoted && (new RegExp(`^${esc(name)}(?:'s|’s)?\\s+[a-z]`).test(u.text) || new RegExp(`[a-z,]\\s+${esc(name)}(?:'s|’s)?(?![A-Za-z])`).test(u.text))) || allText.split(mention(name)).length <= 2 || options.campaign_names?.has(name.toLowerCase()))) continue;
    const selfNoun = selfSpeakers[0]?.startsWith("other:") && new RegExp(`^(?:${SPEAKER_NOUNS})$`, "i").test(selfSpeakers[0].slice(6)) ? selfSpeakers[0].slice(6).toLowerCase() : undefined;
    // A name presented ("That's Brenna.") in an exchange whose narration so far describes exactly one woman (man) names that person: the
    // description and the name are one identity, not a named person plus an unnamed stand-in.
    const bound = selfNoun ?? (mine.every(i => i.kind !== "self") ? soleNoun(mine[0]!) : undefined);
    const noun = mine.find(i => i.noun)?.noun ?? bound;
    const keys = [`other:${name}`, ...(bound ? [`other:${bound}`] : [])];
    const about = units.filter(u => mention(name).test(u.text) || keys.includes(u.speaker ?? "") || (!!bound && nounPhrase(bound).test(u.text)));
    const midSentence = new RegExp(`[a-z,]\\s+${esc(name)}(?:'s|’s)?(?![A-Za-z])`);
    // A weakly introduced name is present when the latest narration itself refers to her mid-sentence ("glances down at Brenna").
    const present = mine.some(i => i.narration_voice || i.kind === "self") || about.some(u => keys.includes(u.speaker ?? "")) || (mine.every(i => i.kind !== "self") && about.some(u => !u.quoted && u.exchange === latest && (midSentence.test(u.text) || (!!bound && !selfNoun && nounPhrase(bound).test(u.text)))));
    persons.push({ ref: `narrated:${name.toLowerCase()}`, name, ...(noun ? { noun } : {}), label: name, units: about, in_latest: about.some(u => u.exchange === latest),
      captive: units.some(u => keys.some(k => held.get(u)!.includes(k))) || about.some(u => { const h = held.get(u)!; return (!!noun && h.includes(`noun:${noun}`) && mention(name).test(u.text)) || (!!bound && h.includes(`noun:${bound}`)); }),
      present, introductions: mine, keys });
  }
  // Present persistent characters with no legal record yet, narrated as captives (e.g. promoted by name before any sale).
  for (const p of people) {
    if (!options.unheld?.has(p.id)) continue;
    // The person noun narration attached to them when they were promoted ("woman"): later descriptions ("the big woman") are the same person.
    const dn = context.characters.find(c => c.id === p.id)?.established_origin?.descriptor?.toLowerCase();
    const descriptor = dn && new RegExp(`^(?:${PERSON_NOUNS})$`).test(dn) && !persons.some(x => x.keys.includes(`other:${dn}`)) ? dn : undefined;
    const about = units.filter(u => u.speaker === p.id || p.names.some(n => mention(n).test(u.text)) || (!!descriptor && (u.speaker === `other:${descriptor}` || nounPhrase(descriptor).test(u.text))));
    // `unheld` is already restricted by the caller to people promoted while narrated as captives: no new marker is required.
    persons.push({ ref: p.id, name: p.names[0]!, label: p.names[0]!, units: about, in_latest: about.some(u => u.exchange === latest), captive: true, present: true, character_id: p.id, introductions: [], keys: [p.id, ...(descriptor ? [`other:${descriptor}`] : [])] });
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
  // H5.1: the words between the determiner and the noun are modifiers; another determiner ends the phrase, so a simile ("the way a man
  // sizes up a horse") is not a reference to "the man".
  return !person.name && !!person.noun && new RegExp(`\\b(?:the|that|this)\\s+(?:(?!(?:a|an|the|this|that|his|her|their|its|my|your|one)\\b)[a-z'-]+\\s+){0,2}?${esc(person.noun)}\\b`, "i").test(text);
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
const BACKGROUND = /\b(?:debt|auction|forfeit\w*|captured|taken from|sold (?:for|by|to|off)|was an? [a-z]+|worked (?:in|at|as)|came in|brought in|picked (?:her|him|them) (?:off|up)|born|from the [a-z]+ (?:court|pits?|mines?|road)|(?:i'?m|i am|she'?s|he'?s|they'?re|comes?|came|hails?) from|grew up|raised (?:in|on|near|by))\b/i;

/**
 * Facts established about a person in the scene narration, and nothing else. `sellerKey` marks statements attributed to a seller.
 */
/**
 * `keepClaim` (Ephemeral Background Grounding V1): a background sentence it rejects (an unverified named place/culture/faction) is not
 * an established fact. Verbatim `evidence` remains raw provenance and is never projected to the narrator as background.
 */
export function establishedFacts(person: NarratedPerson, sellerKey: string | undefined, nameOf: (id: string) => string, keepClaim?: (text: string) => boolean): { established: CharacterOriginSnapshot["established"]; evidence: string[] } {
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
    if (!BACKGROUND.test(s) || HEDGE.test(s) || background.length >= 6 || (keepClaim && !keepClaim(s))) continue;
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
