import type { WorldStore } from "../../world/world-store.js";
import type { TurnContext } from "../context/context-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import { numberValue } from "../language/numbers.js";
import { escapeRegExp as esc } from "../language/text.js";
import { CAPTIVE, FEMALE_NOUNS, MALE_NOUNS, PERSON_NOUNS, SPEAKER_NOUNS, SPEECH, STOP, type Sex, nounSex } from "./dialogue-vocabulary.js";
import { type Person, candidateNames, dialogueUnits, presentPeople } from "./dialogue-forms.js";
import { type NameIntroduction, introductions } from "./identity-forms.js";
import type { DialogueUnit } from "./types.js";

/**
 * THE SCENE READING of narrator-created people (Promotion Pass 1.1 / Persistence Pass 1.2, moved into NarrationFacts in Block 11). A person the
 * narrator introduces exists only in delivered narration until play makes them durable. This derives, deterministically and conservatively, who such
 * people are, who said what (from the shared dialogue units), which proper names were securely established for whom (from the shared identity forms),
 * and who is held. It never decides that anything happens: name-establishment.ts reports provisional people, person-offers.ts handles acquisitions.
 *
 * Conservatism rules:
 * - A proper name counts only when it is established AS a name: introduced by narration or someone's words ("a girl named Maren", "That's Brenna",
 *   "Her name is Maren", "Lysa, a young woman"), a self-introduction attributed to the speaker ("My name is Tomas", "I'm Tomas", a bare "Tomas."
 *   answering "What's your name?"), or — weakly — a quote opening with the name ("Brenna. Thirty-two.") that narration uses again. Capitalized
 *   words, places, titles, numbers and occupations are never names.
 * - Canon names are not global keys: an absent canon person's shared first name can belong to one described narrated speaker.
 * - A named person is present only if they act or speak in the scene, or narration's own voice introduces them; a name that is only talked about
 *   ("an old woman named Maren runs the apothecary") is not a person in the scene.
 * - A person is a captive only when a sentence about them carries a captivity marker (cage, bars, chains, auction, enslaved…).
 * - Names never merge people: the same name in two places is two readings, and nothing here creates or persists a character.
 */
export type NarrationUnit = DialogueUnit;
export type { NameIntroduction };
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

const CAPTIVE_G = new RegExp(CAPTIVE.source, "gi");
const HELD_PRONOUN = /^(?:she|he|her|him)$/i;
/**
 * Whom each captivity marker in a unit is about: the nearest person reference before it in the unit, else the first after it. References: a person
 * noun phrase (`noun:<noun>`), a known or introduced name (character ID or `other:<Name>`), or — in narration only — she/he/her/him, resolved to the
 * unit's subject. Quoted pronouns are resolved only through `topic` (the person the exchange presented).
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
const words = (s: string) => s.split(/\s+/).filter(t => t.length > 2);

/** Words that can stand as a personal name: not a stop word, a place token or a number. */
export function nameFilter(world: WorldStore): (name: string) => boolean {
  const places = new Set(world.listEntities().filter(e => e.type !== "character" && !e.knowledge?.secrecy).flatMap(e => (e.name ?? "").toLowerCase().split(/\s+/)));
  return n => !STOP.has(n.toLowerCase()) && !places.has(n.toLowerCase()) && numberValue(n) === undefined;
}

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
   * Read RPG output (*narration*, plain speech) as attributed speech (created-person identity binding). Opt-in: name establishment and the person
   * offer use it; the audit's negotiation check keeps the legacy projection.
   */
  readonly rpg_speech?: boolean;
  /** Did the player ask a name in this input? (identity-request.ts `asksName`, injected so the fact layer reads no player intent itself). */
  readonly asks_name?: (player: string) => boolean;
}
/**
 * Partner continuity (deterministic_context). The narrator renders an unfamiliar canonical person by description ("the short man", "the seller"); the
 * exchange recorded who the player was talking with. When exactly ONE descriptor speaker of a compatible sex appears in that exchange, that descriptor
 * is the recorded present partner, so a price or an ownership claim voiced by "the man" is that person's, not an anonymous counterparty's. Two
 * competing descriptors, an absent partner or an incompatible sex bind nothing (fail closed).
 */
function bindPartnerSpeaker(units: NarrationUnit[], partnerId: string | undefined, people: readonly Person[]): NarrationUnit[] {
  const partner = partnerId && partnerId !== "nicco" ? people.find(p => p.id === partnerId) : undefined;
  if (!partner) return units;
  const compatible = (key: string) => { const noun = key.slice(6).toLowerCase(); return !(partner.sex === "male" && FEMALE_NOUNS.has(noun)) && !(partner.sex === "female" && MALE_NOUNS.has(noun)); };
  const keys = [...new Set(units.flatMap(u => u.speaker && /^other:[a-z-]+$/.test(u.speaker) && new RegExp(`^other:(?:${SPEAKER_NOUNS})$`).test(u.speaker) && compatible(u.speaker) ? [u.speaker] : []))];
  if (keys.length !== 1) return units;
  return units.map(u => u.speaker !== keys[0] ? u : { ...u, speaker: partner.id,
    ...(u.attribution ? { attribution: { ...u.attribution, entity_id: partner.id, candidates: [partner.id], method: "deterministic_context" as const, resolution: "role" as const, ambiguity: "none" as const } } : {}) });
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
  const units: NarrationUnit[] = [];
  // The conversation partner persists until replaced: a turn that addressed nobody ("let's see the northerner first") does not end the seller's presence.
  let partner: string | undefined;
  const partnerAt = new Map<number, string>();
  // Who the earlier narration of the scene already showed: a named person by a name, an unnamed one by their descriptor noun (singular or plural).
  const shownIn = (text: string) => people.filter(p => p.id !== "nicco" && (p.unnamed
    ? ((noun: string) => !!noun && new RegExp(`\\b${esc(noun).replace(/man$/, "m[ae]n")}s?\\b`, "i").test(text))(p.names[0]!.split(/\s+/).at(-1) ?? "")
    : p.names.some(n => new RegExp(`\\b${esc(n)}\\b`).test(text)))).map(p => p.id);
  for (const [i, e] of scene.entries()) {
    partner = e.conversation_partner_id ?? partner;
    if (partner) partnerAt.set(i, partner);
    const reading = options.rpg_speech ? { rpg: true, carry: units.filter(u => !u.quoted && u.speaker).map(u => u.speaker!), on_stage: shownIn(scene.slice(0, i).map(x => x.narration).join("\n")) } : {};
    units.push(...bindPartnerSpeaker(dialogueUnits(e.narration, i, people, others, reading), partner, people));
  }
  const latest = scene.length - 1;
  const asked = (exchange: number) => !!options.asks_name?.(scene[exchange]?.player ?? "");
  const intros = introductions(units, asked, ok);
  const allText = scene.map(e => e.narration).join("\n");
  const sceneText = scene.map(e => `${e.player}\n${e.narration}`).join("\n");
  const nounSpeaker = new RegExp(`^other:(?:${SPEAKER_NOUNS})$`, "i");
  const mention = (name: string) => new RegExp(`\\b${esc(name)}(?:'s|’s)?\\b`);
  const nounPhrase = (noun: string) => new RegExp(`\\b(?:a|an|the|that|this|one|another)\\s+(?:[a-z'-]+\\s+){0,3}?${esc(noun)}\\b`, "i");
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
    const speaker = units[index]!.speaker ?? partnerAt.get(intro.exchange), speakerSex = !speaker ? undefined : speaker.startsWith("other:") ? nounSex(speaker.slice(6)) : people.find(p => p.id === speaker)?.sex;
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
    // Block 12: narration that already calls the speaker by the very name they introduce ("*Hollis tips his cap.* "My name is Hollis."") is that same
    // person speaking, not a second claimant beside the porter who introduced himself earlier.
    const selfSpeakers = [...new Set(mine.filter(i => i.kind === "self" && i.speaker && i.speaker !== `other:${name}`).map(i => i.speaker!))];
    // A present persistent character with no name introducing themselves: late naming of that same character. Checked first: names are not
    // unique, so another Maren elsewhere (or even here) does not stop the girl from being Maren. An unattributed bare-name answer to a direct name
    // question ("Lira.") names the scene's one present unnamed persistent person.
    const soleUnnamed = people.filter(p => p.unnamed);
    const sameSex = (s: string) => !s.startsWith("other:") || !soleUnnamed[0]?.sex || !(soleUnnamed[0]!.sex === "female" ? MALE_NOUNS : FEMALE_NOUNS).has(s.slice(6).toLowerCase());
    const bareAnswer = selfSpeakers.every(sameSex) && mine.some(i => i.bare) && soleUnnamed.length === 1 && !known.has(name.toLowerCase());
    const late = bareAnswer ? [soleUnnamed[0]!.id] : selfSpeakers.filter(s => people.some(p => p.id === s && p.unnamed));
    if (late.length) { if (late.length === 1 && (bareAnswer || selfSpeakers.length === 1)) { const i = bareAnswer ? mine.find(x => x.bare)! : mine.find(x => x.speaker === late[0])!; namings.push({ character_id: late[0]!, name, exchange: i.exchange, evidence: i.evidence }); } continue; }
    if (known.has(name.toLowerCase())) continue; // a present persistent person: never a new one
    if (selfSpeakers.some(s => people.some(p => p.id === s))) continue; // a named persistent person cannot claim another name
    if (selfSpeakers.length > 1) continue; // two different speakers claim the name: unresolved
    // Canon nonduplication, actor-bound rather than string-bound. A PRESENT canon bearer of the name is `known` above. An absent canon person still
    // owns: their whole name used as the name (a mononym), and any scene where their full name is spoken or written (the referent may be them).
    // Otherwise a shared first name ("Mira" vs an absent Mira Thorne) belongs to a new person only when one distinct narrated actor (a described
    // woman/man/girl…) introduced themself with it and nothing else introduced it.
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
    // A name presented ("That's Brenna.") in an exchange whose narration so far describes exactly one woman (man) names that person: the description
    // and the name are one identity, not a named person plus an unnamed stand-in.
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
    // Skip a description that is a present persistent person's label, one a named person introduced themselves under, or one that only ever
    // appears together with the name narration attached it to ("a young woman named Lysa").
    const withNoun = units.filter(u => nounPhrase(noun).test(u.text));
    const namedWith = [...new Set(intros.filter(i => i.noun === noun).map(i => i.name))];
    if (labels.has(noun) || persons.some(p => p.keys.includes(`other:${noun}`)) || namedWith.some(name => withNoun.every(u => mention(name).test(u.text)))) continue;
    const about = units.filter(u => nounPhrase(noun).test(u.text) || u.speaker === `other:${noun}`);
    persons.push({ ref: `narrated:${noun}`, noun, label: `the ${noun}`, units: about, in_latest: about.some(u => u.exchange === latest), captive: true, present: true, introductions: [], keys: [`other:${noun}`] });
  }
  return { units, persons, captives: persons.filter(p => p.captive && (p.present || !!p.character_id)), namings, people, latest, exchanges: scene };
}

/** Reference resolution for a narrated person: does this text refer to them by name or (for an unnamed person) by their description? */
export function refersTo(person: NarratedPerson, text: string): boolean {
  if (person.name && new RegExp(`\\b${esc(person.name)}(?:'s|’s)?\\b`, "i").test(text)) return true;
  // H5.1: the words between the determiner and the noun are modifiers; another determiner ends the phrase, so a simile ("the way a man sizes up a
  // horse") is not a reference to "the man".
  return !person.name && !!person.noun && new RegExp(`\\b(?:the|that|this)\\s+(?:(?!(?:a|an|the|this|that|his|her|their|its|my|your|one)\\b)[a-z'-]+\\s+){0,2}?${esc(person.noun)}\\b`, "i").test(text);
}
