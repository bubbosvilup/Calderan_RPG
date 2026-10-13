import type { TurnContext } from "../context-builder.js";
import { rpgDialogue, rpgNarration } from "../rpg-dialogue.js";
import { escapeRegExp as esc } from "../language/text.js";
import { DELIVERY, FIRST_OR_SECOND, HE, NAME, NEUTRAL_BEAT, PERSON_NOUNS, PLAIN_BEAT, POST_HOC_TAG, QUOTE, SHE, SPEAKER_NOUNS, SPEECH, STOP, SUBJECT_NOUNS, type Sex, nounSex } from "./dialogue-vocabulary.js";
import type { DialogueUnit, FactAmbiguity, FactConfidence, SpeakerAttribution, SpeakerMethod, SubjectResolution } from "./types.js";

/**
 * THE dialogue reader (Block 11): who speaks each line of a narration, and who is the subject of each narrated sentence. Before this block the
 * scene reader (narrated-captives.ts), the prompt's recent-conversation projection (prompt-builder.ts) and the commerce facts each attributed
 * speech with their own grammar; they now all read these units.
 *
 * Two formats.
 * - RPG (the Narrator contract): *narration* in single asterisks, speech in plain lines outside them. A plain line belongs to the subject of the
 *   narration beat right before it (adjacent_action_beat); a beat that names a speech act right AFTER it ("*He says it flat.*") tags it post hoc
 *   (explicit_dialogue_tag); across a beat that names nobody who could be speaking, the exchange's speaker continues (continued_speaker).
 * - Legacy prose with quotes: a speech tag ("Maren says", "says Korvin") or the quote's own / previous sentence subject in the same paragraph
 *   (the strict chain the prompt replays), else, for the scene reader only, the most recent narrated subject (recent_subject, weakest).
 *
 * Fail closed: a plural subject, a competing person the line does not exclude, or a contradiction between a beat and a tag attributes nobody.
 * A speaker key is a present character id or a scene-local `other:<Name|noun>` description; it is never a CampaignCharacter and never authority.
 */

export interface Person { readonly id: string; readonly names: readonly string[]; readonly sex?: Sex; readonly unnamed: boolean }
const words = (s: string) => s.split(/\s+/).filter(t => t.length > 2);

/** The present people of a turn context as the dialogue reader sees them (Nicco included, under "Nicco"). */
export function presentPeople(context: TurnContext): Person[] {
  return context.characters.map(c => {
    const n = c.id === "nicco" ? "Nicco" : c.profile.name ?? c.id;
    const declared = (c.profile.sex ?? "").toLowerCase(), pronoun = "pronoun" in c ? c.pronoun : undefined;
    const sex: Sex | undefined = /^(?:female|woman)$/.test(declared) || pronoun === "she" ? "female" : /^(?:male|man)$/.test(declared) || pronoun === "he" ? "male" : undefined;
    return { id: c.id, names: [n, ...words(n).filter(t => /^[A-Z]/.test(t))], ...(sex ? { sex } : {}), unnamed: "unnamed_label" in c && !!c.unnamed_label };
  });
}

/** Candidate name tokens for subject tracking (before attribution): any token a name pattern could introduce. */
export function candidateNames(texts: readonly string[], ok: (n: string) => boolean): string[] {
  const all = texts.join("\n"), found = new Set<string>();
  for (const re of [new RegExp(`\\b(?:named|called|name(?:'s|’s| is| was)|(?:[Tt]his|[Tt]hat)(?: one)?(?:'s|’s| is)|I'm|I am|[Cc]all me)\\s+${NAME}\\b`, "g"),
    new RegExp(`\\b${NAME},\\s+(?:a|an)\\s+(?:[a-z'-]+\\s+){0,3}?(?:${PERSON_NOUNS})\\b`, "g"), new RegExp(`["“]${NAME}[.!,]`, "g")])
    for (const m of all.matchAll(re)) if (ok(m[1]!)) found.add(m[1]!);
  return [...found];
}

/** A speech tag after a quote (`"…," Maren says`) or before it (`Maren says:`), for a given subject grammar. */
export const speechTagAfter = (subject: string) => new RegExp(`^\\s*,?\\s*(?:(${subject})\\s+(?:${SPEECH})|(?:${SPEECH})\\s+(${subject}))\\b`, "i");
export const speechTagBefore = (subject: string) => new RegExp(`(${subject})\\s+(?:${SPEECH})\\b[^"“”.!?]{0,40}[,:]\\s*$`, "i");
/**
 * Every explicit "X <speech verb>" / "<speech verb> X" tag in a text, with the subject words as written (names or descriptor phrases). `exact`: the
 * subject grammar is case-sensitive (a capitalized-name pattern must not swallow "then says"); the verbs are the shared SPEECH list either way.
 */
export function speechTags(text: string, subject: string, exact = false): readonly string[] {
  return [...text.matchAll(new RegExp(`\\b(${subject})\\s+(?:[a-z]+ly\\s+)?(?:${SPEECH}|speaks?|spoke|introduces?|introduced)\\b|\\b(?:${SPEECH})\\s+(${subject})\\b`, exact ? "g" : "gi"))].map(m => (m[1] ?? m[2])!);
}

type Key = string;
/**
 * The present person a text OPENS with: a whole name first (longest wins; an unnamed person's label in any case), then a single name token only when
 * exactly one person carries it ("Jessa" for Jessa Rook; never "Person" shared by "D04 Person 0" and "D04 Person 1").
 */
export function leadingPerson(text: string, people: readonly Person[]): Person | undefined {
  const at = (n: string, unnamed: boolean) => new RegExp(`^${esc(n)}(?:'s|’s)?\\b`, unnamed ? "i" : "").test(text);
  const whole = people.filter(p => at(p.names[0]!, p.unnamed)).sort((a, b) => b.names[0]!.length - a.names[0]!.length)[0];
  if (whole) return whole;
  const owners = (token: string) => people.filter(p => p.names.slice(1).includes(token)).length;
  return people.find(p => p.names.slice(1).some(n => owners(n) === 1 && at(n, p.unnamed)));
}
const normNoun = (noun: string) => noun.toLowerCase().replace(/^passerby$/, "passer-by");
/** The subject words a sentence opens with (a descriptor, a capitalized name of up to two words, a pronoun or possessive), to read what follows them. */
const LEADING_SUBJECT = /^(?:(?:[Tt]he|[Aa]n?|[Oo]ne)\s+(?:[a-z'-]+\s+){0,2}?[a-z-]+|[A-Z][a-z'’-]*(?:\s+[A-Z][a-z'’-]*)?|[Hh]e|[Ss]he|[Tt]hey|[Hh]is|[Hh]er|[Tt]heir)(?:'s|’s)?\s+/;
const NOUN_SUBJECT = new RegExp(`^(?:the|a|an|one)\\s+(?:[a-z'-]+\\s+){0,2}?(${SUBJECT_NOUNS})\\b`, "i");

export interface DialogueOptions {
  /** Read the Narrator's RPG format (plain lines are speech). Off: every line is prose and only quotes are speech (legacy reading). */
  readonly rpg?: boolean;
  /** Subjects of earlier exchanges of the same scene (the scene reading passes them): an RPG beat opening on a pronoun may continue the single earlier subject of that sex. */
  readonly carry?: readonly string[];
  /**
   * Present people the scene's EARLIER narration already showed (by name; an unnamed person by their descriptor noun). When nothing is carried, an
   * exchange that opens on a pronoun continues the one such person of that sex. Only the scene reading knows the earlier narration.
   */
  readonly on_stage?: readonly string[];
}

const attribution = (surface: string, speaker: Key | undefined, method: SpeakerMethod | undefined, resolution: SubjectResolution, confidence: FactConfidence, candidates: readonly string[] = speaker ? [speaker] : [], extra: { post_hoc?: true } = {}): SpeakerAttribution => {
  const ambiguity: FactAmbiguity = speaker ? "none" : candidates.length > 1 ? "ambiguous" : "unresolved";
  return { surface, ...(speaker ? { entity_id: speaker } : {}), resolution: speaker ? resolution : "unresolved", candidates: speaker ? [speaker] : candidates, ...(speaker && method ? { method } : {}), ambiguity, confidence: speaker ? confidence : "low", ...extra };
};

/**
 * Sentences and spoken lines of one narration, each with its subject (narrated sentence) or attributed speaker (spoken line). Pronouns resolve to
 * the most recent subject of a compatible established sex ("He swallows" skips a woman who spoke last); unknown sex is compatible.
 */
export function dialogueUnits(narration: string, exchange: number, people: readonly Person[], others: readonly string[] = [], options: DialogueOptions = {}): DialogueUnit[] {
  const out: DialogueUnit[] = [];
  const history: Key[] = [];
  const rpg = !!options.rpg && rpgNarration(narration).length > 0 && !!rpgDialogue(narration)?.length;
  const otherNames = others.map(esc).join("|") || "(?!)";
  const sexOf = (key: Key): Sex | undefined => {
    const p = people.find(x => x.id === key); if (p) return p.sex;
    return nounSex(key.replace(/^other:/, ""));
  };
  let pronounVia: SubjectResolution = "pronoun";
  const pronounRef = (word: string): Key | null => {
    const w = word.toLowerCase(), want: Sex | undefined = /^(?:he|him|his)$/.test(w) ? "male" : /^(?:she|her)$/.test(w) ? "female" : undefined;
    const found = history.find(h => !want || sexOf(h) === undefined || sexOf(h) === want);
    pronounVia = "pronoun";
    if (found || !rpg || !want) return found ?? null;
    // RPG beats often open on a pronoun continuing the previous exchange ("*Her eyes stay half-open…*"). Only the single earlier scene subject of
    // that established sex qualifies; none or several attribute nothing.
    const carried = [...new Set(options.carry ?? [])].filter(k => sexOf(k) === want);
    pronounVia = "antecedent";
    if (carried.length || !options.on_stage || out.length || history.length) return carried.length === 1 ? carried[0]! : null;
    // The scene had no earlier subject of that sex and the exchange OPENS on the pronoun ("*She looks up from the dirt.*" answering the name question
    // to the woman just bought): the one present person of that sex the scene's narration has already put on stage is meant. A background person
    // the narration never showed is no antecedent; several (or none) attribute nothing.
    const staged = people.filter(p => p.id !== "nicco" && p.sex === want && options.on_stage!.includes(p.id));
    return staged.length === 1 ? staged[0]!.id : null;
  };
  const remember = (key: Key) => { const i = history.indexOf(key); if (i >= 0) history.splice(i, 1); history.unshift(key); };
  /** The scene reader's subject grammar: present people, pronouns, introduced names, an unknown capitalized word acting ("Erdan nods"), a person noun. */
  const subjectOf = (raw: string): Key | null => {
    const t = raw.replace(/^[\s*_([,;:—–-]+/, "");
    const person = leadingPerson(t, people);
    if (person) return person.id;
    const pronoun = t.match(/^(he|she|they|his|her|their)\b/i);
    if (pronoun) return pronounRef(pronoun[1]!);
    const named = t.match(new RegExp(`^(${otherNames})(?:'s|’s)?\\b`));
    if (named) return `other:${named[1]}`;
    const verbish = t.match(/^([A-Z][a-z]{2,})(?:'s|’s)?\s+([a-z]+)/);
    if (verbish && !STOP.has(verbish[1]!.toLowerCase()) && /(?:s|ed)$/.test(verbish[2]!)) return `other:${verbish[1]}`;
    const noun = t.match(NOUN_SUBJECT);
    if (noun) return `other:${normNoun(noun[1]!)}`;
    return null;
  };
  const resolutionOf = (raw: string): SubjectResolution => {
    const t = raw.replace(/^[\s*_([,;:—–-]+/, "");
    return /^(?:he|she|they|his|her|their)\b/i.test(t) ? pronounVia : NOUN_SUBJECT.test(t) ? "descriptor" : "name";
  };
  const allNames = people.flatMap(p => p.names).map(esc).join("|") || "(?!)";
  const clauseSubject = `(?:${allNames}|${otherNames}|he|she|they|(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,2}?[a-z-]+)`;
  const after = speechTagAfter(clauseSubject), before = speechTagBefore(clauseSubject);
  // The strict chain only knows people and person nouns (a tag naming the wind is no tag).
  const strictSubject = `(?:${allNames}|he|she|they|(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,2}?(?:${SUBJECT_NOUNS}))`;
  const strictAfter = speechTagAfter(strictSubject), strictBefore = speechTagBefore(strictSubject);
  // A subject made of two people ("The woman and the girl look up") or a plural one attributes no following RPG speech.
  const plural = new RegExp(`^(?:they|both|the two|the (?:women|men|girls|boys|children|others)|(?:(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,2}?(?:${SUBJECT_NOUNS})|[A-Z][a-z]+)\\s+(?:and|&)\\s+(?:the|a|an|his|her|their|[A-Z][a-z]*))\\b`, "i");
  /** Keys a plural subject names ("The woman and Korvin": other:woman, korvin): the candidates of an ambiguous speaker. */
  const pluralKeys = (text: string): Key[] => [...new Set(text.split(/\s+(?:and|&)\s+/).slice(0, 4).map(part => subjectOf(part)).filter((k): k is Key => !!k))];

  // ---- strict chain (legacy prose): ported from the prompt's recent-conversation projection, unchanged in behaviour.
  type Strict = { speaker?: Key; method?: SpeakerMethod; resolution: SubjectResolution; surface: string };
  type StrictSubject = { key: Key } | "pronoun" | undefined;
  const strictOf = (text: string): StrictSubject => {
    const t = text.trimStart();
    const person = leadingPerson(t, people);
    if (person) return { key: person.id };
    if (/^(?:he|she|they|his|her|their)\b/i.test(t)) return "pronoun";
    const m = t.match(new RegExp(`^(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,2}?(${SUBJECT_NOUNS})\\b`, "i"));
    return m ? { key: `other:${normNoun(m[1]!)}` } : undefined;
  };
  let continuation: Key | undefined;
  /** Strict attribution of every quote of one paragraph, by the quote's offset in the paragraph. */
  const strictPass = (paragraph: string): Map<number, Strict> => {
    const result = new Map<number, Strict>();
    const quotes = [...paragraph.matchAll(QUOTE)].map(m => ({ start: m.index!, end: m.index! + m[0].length, text: (m[1] ?? m[2])! }));
    // Only an adjacent leading quotation can inherit a known NPC's explicit delivery beat.
    const inherited = quotes[0]?.start === paragraph.length - paragraph.trimStart().length ? continuation : undefined;
    continuation = undefined;
    let blanked = paragraph;
    for (const q of quotes) blanked = blanked.slice(0, q.start + 1) + "x".repeat(q.end - q.start - 2) + blanked.slice(q.end - 1);
    const bounds = new Set<number>([0]);
    for (const m of blanked.matchAll(/[.!?…]["”')\]]*\s+/g)) bounds.add(m.index! + m[0].length);
    for (const q of quotes) if (/[.!?…]\s*$/.test(q.text) && /^\s+[A-Z]/.test(paragraph.slice(q.end)) && !strictAfter.test(paragraph.slice(q.end, q.end + 60))) bounds.add(q.end);
    const starts = [...bounds].sort((a, b) => a - b);
    let lastSubject: Key | undefined = inherited, previousSentence: Key | undefined = inherited, previousInherited = !!inherited;
    const resolve = (s: StrictSubject): Key | undefined => s === "pronoun" ? lastSubject : s?.key;
    for (const [i, start] of starts.entries()) {
      const end = starts[i + 1] ?? paragraph.length, sentence = blanked.slice(start, end);
      const leadsWithQuote = /^\s*["“]/.test(sentence), lead = start + (sentence.length - sentence.trimStart().length);
      let sentenceSubject = leadsWithQuote ? undefined : resolve(strictOf(sentence));
      if (sentenceSubject) lastSubject = sentenceSubject;
      for (const q of quotes.filter(q => q.start >= start && q.start < end)) {
        const tail = strictAfter.exec(paragraph.slice(q.end, q.end + 60)), head = strictBefore.exec(blanked.slice(start, q.start));
        const clause = tail ? tail[1] ?? tail[2]! : head?.[1];
        const explicit = clause === undefined ? undefined : strictOf(clause);
        const speaker = clause !== undefined ? resolve(explicit) : q.start > lead ? sentenceSubject : previousSentence;
        const method: SpeakerMethod | undefined = !speaker ? undefined : clause !== undefined ? "explicit_dialogue_tag" : q.start > lead || !previousInherited ? "adjacent_action_beat" : "continued_speaker";
        result.set(q.start, { ...(speaker ? { speaker } : {}), ...(method ? { method } : {}), resolution: explicit === "pronoun" ? "pronoun" : clause !== undefined && explicit?.key.startsWith("other:") ? "descriptor" : clause !== undefined ? "name" : "antecedent", surface: clause ?? "" });
        if (leadsWithQuote && q.start === lead) { sentenceSubject = speaker; if (speaker) lastSubject = speaker; }
      }
      const neutral = NEUTRAL_BEAT.test(sentence.trim());
      if (!neutral || sentenceSubject) previousInherited = false;
      previousSentence = sentenceSubject ?? (neutral ? previousSentence : undefined);
    }
    const leading = strictOf(paragraph);
    const label = leading && leading !== "pronoun" ? leading.key : undefined;
    const person = label ? people.find(p => p.id === label) : undefined;
    if (!quotes.length && person && label !== "nicco" && previousSentence === label
      && new RegExp(`(?:^(?:${person.names.map(esc).join("|")})\\s+|[;,]\\s*(?:then\\s+)?|\\band\\s+|\\b(?:he|she|they)\\s+)(?:[a-z]+ly\\s+)*(?:${DELIVERY})\\b`, "i").test(paragraph)
      && !/\b(?:not|never|no|cannot|can't|doesn't|didn't|won't|wouldn't)\b/i.test(paragraph)
      && !people.some(p => p.id !== label && p.names.some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(paragraph)))
      && !new RegExp(`\\b(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,2}?(?:${SUBJECT_NOUNS})\\b`, "i").test(paragraph)) continuation = label;
    return result;
  };

  // ---- units
  let beat: Key | undefined, beatVia = "name" as SubjectResolution, beatPlural: Key[] | undefined;
  let paragraphIndex = 0;
  const narrate = (segment: string) => {
    for (const s of segment.split(/(?<=[.!?…])\s+/)) {
      const text = s.replace(/[*_]/g, "").trim();
      if (!/[A-Za-z]{2}/.test(text)) continue;
      const subject = subjectOf(text);
      if (subject) remember(subject);
      if (subject || plural.test(text)) { beat = subject && !plural.test(text) ? subject : undefined; beatVia = subject ? resolutionOf(text) : "unresolved"; beatPlural = plural.test(text) ? pluralKeys(text) : undefined; }
      out.push({ text, quoted: false, exchange, paragraph: paragraphIndex, ...(subject ? { speaker: subject } : {}) });
    }
  };
  const paragraph = (text: string) => {
    const strict = strictPass(text);
    const quotes = [...text.matchAll(QUOTE)].map(m => ({ start: m.index!, end: m.index! + m[0].length, text: (m[1] ?? m[2])! }));
    let cursor = 0;
    for (const q of quotes) {
      const lead = text.slice(cursor, q.start);
      narrate(lead);
      const tail = after.exec(text.slice(q.end, q.end + 60).replace(/^[*_]+/, "")), head = before.exec(lead.replace(/[*_]/g, ""));
      const clause = tail ? tail[1] ?? tail[2] : head?.[1];
      const fallback = clause !== undefined ? subjectOf(clause) ?? history[0] : history[0];
      const s = strict.get(q.start);
      const speaker = s?.speaker ?? fallback;
      const a = s?.speaker ? attribution(s.surface, s.speaker, s.method, s.resolution, s.method === "explicit_dialogue_tag" ? "high" : "medium")
        : attribution(clause ?? "", fallback ?? undefined, "recent_subject", "antecedent", "low");
      out.push({ text: q.text.trim(), quoted: true, exchange, paragraph: paragraphIndex, ...(speaker ? { speaker } : {}), attribution: a });
      cursor = q.end;
    }
    narrate(text.slice(cursor));
    paragraphIndex++;
  };
  // Legacy prose (or the legacy reading of RPG text): every paragraph by the quote rules.
  if (!rpg) { narration.split(/\n+/).forEach(paragraph); return out; }

  // ---- RPG format (the project's narrator contract, shared with rpg-dialogue.ts)
  const stars = [...narration.matchAll(/(?<!\\)\*/g)].map(m => m.index!);
  const blocks: { text: string; starred: boolean }[] = [];
  for (let i = 0, start = 0; i <= stars.length; i += 2) {
    blocks.push({ text: narration.slice(start, stars[i] ?? narration.length), starred: false });
    if (i < stars.length) { blocks.push({ text: narration.slice(stars[i]! + 1, stars[i + 1]!), starred: true }); start = stars[i + 1]! + 1; }
  }
  /** Persons narration put on stage, in order, for the continued-speaker rule: subjects and described people (names, person nouns). */
  const staged: { key: Key; subject: boolean; plural?: true }[] = [];
  /** The sentence shows its subject DOING something (a verb within the next words), not a bare description ("A dying woman one floor above."). */
  const acts = (text: string) => /^(?:\S+\s+){0,5}?(?:[a-z]+(?:s|ed)|is|was|are|were|sat|stood|knelt|lay|stays|stay|holds|held|keeps|kept|says|said|speaks|spoke|leans|leaned)\b/.test(text.replace(LEADING_SUBJECT, ""));
  const stage = (from: number) => {
    for (const u of out.slice(from)) {
      if (u.quoted) continue;
      if (plural.test(u.text)) { staged.push({ key: "", subject: true, plural: true }); continue; }
      if (u.speaker) staged.push({ key: u.speaker, subject: acts(u.text) });
      for (const m of u.text.matchAll(new RegExp(`\\b(?:the|a|an|one|that|this|another)\\s+(?:[a-z'-]+\\s+){0,3}?(${SUBJECT_NOUNS})\\b`, "gi"))) { const key = `other:${normNoun(m[1]!)}`; if (key !== u.speaker) staged.push({ key, subject: false }); }
      for (const p of people) if (p.id !== u.speaker && p.names.some(n => new RegExp(`[a-z,]\\s+${esc(n)}(?:'s|’s)?\\b`).test(u.text))) staged.push({ key: p.id, subject: false });
    }
  };
  /** The line itself rules the person out as its speaker: it speaks of them in the third person, or names / describes them. */
  const excludedBy = (line: string, key: Key): boolean => {
    const sex = sexOf(key), noun = key.startsWith("other:") ? key.slice(6) : undefined, person = people.find(p => p.id === key);
    return (sex === "female" && SHE.test(line)) || (sex === "male" && HE.test(line))
      || (!!noun && new RegExp(`\\b(?:the|that|this)\\s+(?:[a-z'-]+\\s+){0,2}?${esc(noun)}\\b`, "i").test(line))
      || (!!person && person.names.some(n => new RegExp(`\\b${esc(n)}\\b`).test(line)));
  };
  /** continued_speaker: the most recent earlier subject the line does not exclude, when everyone staged after them is excluded. */
  const continued = (line: string): Key | undefined => {
    let i = staged.length - 1;
    for (; i >= 0; i--) { const s = staged[i]!; if (s.plural) return undefined; if (s.subject && s.key !== "nicco" && !excludedBy(line, s.key)) break; }
    if (i < 0) return undefined;
    const p = staged[i]!.key;
    return staged.slice(i + 1).every(x => x.key === p || x.key === "nicco" || excludedBy(line, x.key)) ? p : undefined;
  };
  let run: number[] = [], staging = 0;
  for (const block of blocks) {
    if (block.starred) {
      beat = undefined; beatPlural = undefined;
      const from = out.length;
      block.text.split(/\n+/).forEach(paragraph);
      // Post-hoc tag: the beat right after a run of spoken lines opens "He says it flat" / "Korvin says this…": the run is that subject's.
      const first = out[from];
      if (first && !first.quoted && run.length && first.speaker && !plural.test(first.text) && POST_HOC_TAG.test(first.text.replace(LEADING_SUBJECT, ""))) {
        const x = first.speaker;
        for (const i of run) {
          const u = out[i]!;
          if (u.speaker && u.speaker !== x) { const { speaker: _drop, ...rest } = u; out[i] = { ...rest, attribution: attribution(u.attribution?.surface ?? "", undefined, undefined, "unresolved", "low", [u.speaker, x]) }; continue; }
          out[i] = { ...u, speaker: x, attribution: attribution(first.text.split(/\s+/).slice(0, 3).join(" "), x, "explicit_dialogue_tag", resolutionOf(first.text), "high", [x], { post_hoc: true }) };
        }
      }
      run = [];
      continue;
    }
    stage(staging); staging = out.length;
    for (const line of block.text.split(/\r?\n/).map(s => s.trim()).filter(s => /[A-Za-z]{2}/.test(s) && s.length <= 400)) {
      // A plain line with quotes inside: a legacy attributed quote ('"Fine," Korvin says.') is read by the quote rules; a line that is itself somebody
      // talking and only REPORTS other words ('I told her "go home" and she didn't.') stays one spoken line of the beat's speaker (nested quote).
      if (/["“”]/.test(line) && !/^["“][^"“”]*["”]$/.test(line)) {
        const inner = [...line.matchAll(QUOTE)], tagged = inner.some(q => after.test(line.slice(q.index! + q[0].length, q.index! + q[0].length + 60)) || before.test(line.slice(0, q.index!)));
        if (tagged || !FIRST_OR_SECOND.test(line.replace(new RegExp(QUOTE.source, "g"), " "))) { paragraph(line); stage(staging); staging = out.length; continue; }
      }
      // A plain line that is really narration (a person-noun or name subject doing a bodily action, no first/second person) that the narrator
      // forgot to star is a beat, not speech: it must neither be attributed to the previous beat's subject nor hide its own.
      if (!/^(?:he|she|they|his|her|their)\b/i.test(line) && !FIRST_OR_SECOND.test(line) && PLAIN_BEAT.test(line) && subjectOf(line)) { paragraph(line); stage(staging); staging = out.length; continue; }
      const text = line.replace(/^["“]([\s\S]*)["”]$/, "$1").trim();
      // direct_name: the line is labelled with its speaker ("Korvin: Three hundred.").
      const label = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):\s+(\S[\s\S]*)$/);
      const labelled = label ? people.find(p => p.names.includes(label[1]!))?.id ?? (others.includes(label[1]!) ? `other:${label[1]}` : undefined) : undefined;
      if (labelled) { out.push({ text: label![2]!.trim(), quoted: true, exchange, rpg: true, paragraph: paragraphIndex, speaker: labelled, attribution: attribution(label![1]!, labelled, "direct_name", "name", "high") }); run.push(out.length - 1); continue; }
      // A speaker does not talk about themself in the third person: speech using she/her (he/him) is not the beat subject's when that subject is female (male).
      const aboutBeat = !!beat && ((sexOf(beat) === "female" && SHE.test(line)) || (sexOf(beat) === "male" && HE.test(line)));
      let a: SpeakerAttribution;
      if (beat && !aboutBeat) a = attribution("", beat, beatVia === "antecedent" ? "deterministic_context" : "adjacent_action_beat", beatVia, beatVia === "name" ? "medium" : "low");
      else {
        // A status / label line ("Household: 0") is formatting, never somebody's speech by continuation.
      const c = beatPlural || /^[A-Z][A-Za-z ]{1,24}:\s*[\w.%/-]{0,12}$/.test(text) ? undefined : continued(line);
        a = c ? attribution("", c, "continued_speaker", "antecedent", "medium") : attribution("", undefined, undefined, "unresolved", "low", beatPlural ?? []);
      }
      out.push({ text, quoted: true, exchange, rpg: true, paragraph: paragraphIndex, ...(a.entity_id ? { speaker: a.entity_id } : {}), attribution: a });
      run.push(out.length - 1);
    }
    paragraphIndex++;
  }
  return out;
}

/**
 * The descriptor phrase a sentence opens with ("The short man", "A thin, wiry stranger"), up to four modifiers before a speaker noun. The canonical-partner
 * checks resolve it against authored appearance; it is the same speaker-noun vocabulary every dialogue reader uses.
 */
export function leadingDescriptor(text: string): { readonly phrase: string; readonly determiner: string; readonly rest: string } | undefined {
  const t = text.trim(), m = t.match(new RegExp(`^(the|a|an|another|that|this)\\s+(?:[a-z][a-z',-]*\\s+){0,4}?(?:${SPEAKER_NOUNS})\\b`, "i"));
  return m ? { phrase: m[0], determiner: m[1]!.toLowerCase(), rest: t.slice(m[0].length) } : undefined;
}
