import { escapeRegExp as esc } from "../language/text.js";
import { NAME, PERSON_NOUNS, SPEAKER_NOUNS, SPEECH, SUBJECT_NOUNS, nounSex } from "./dialogue-vocabulary.js";
import type { Person } from "./dialogue-forms.js";
import { type NarrationFrame, spanOf } from "./frame.js";
import { playerRef, unresolvedRef } from "./subjects.js";
import type { DialogueUnit, FactEntityRef, IdentityFact, NameDisclosureFact, RecipientAttributionFact, ReferenceFact, SelfIntroductionFact, SpeakerAttributionFact } from "./types.js";

/**
 * IDENTITY FACTS (Block 11): who gives their own name, who is named by someone else, who is addressed, who a reference can mean. ONE grammar for
 * names: the scene reader's introductions, the canonical-partner guard and the canonical disclosure all read these forms, and none keeps its own
 * "I'm X" / "my name is X" pattern any more.
 *
 * Descriptive only. A self-introduction is what somebody SAYS; whether it names a provisional person, renames a persistent one, conflicts with a
 * canonical identity or is ignored is policy (scene-identity.ts / name-establishment.ts / partner-identity-guard.ts). Names never create, persist or
 * merge anyone, and two people with the same name are never the same person because of it.
 */

/** One name form found in one unit of text (the shared grammar every identity reader uses). */
export interface IdentityForm {
  /** self: the speaker's own name. pattern: a name given to someone (else). weak: a spoken line that only opens with a bare name. */
  readonly kind: "self" | "pattern" | "weak";
  readonly form: SelfIntroductionFact["form"] | NameDisclosureFact["form"];
  /** The name token ("Maren"). */
  readonly name: string;
  /** The whole capitalized name as given ("Tomas Reed"), when it is longer than the token. */
  readonly full_name?: string;
  readonly noun?: string;
  /** A line that is only the name. */
  readonly bare?: true;
  /** The introduction is a whole sentence or line of its own ("I'm Korvin."), not a clause of a longer one. */
  readonly standalone: boolean;
  readonly matched: string;
}

const SELF = new RegExp(`\\b(?:([Mm]y name(?:'s|’s| is))|([Cc]all me|[Tt]hey call me))\\s+${NAME}((?:\\s+[A-Z][a-z]+){0,2})\\b`);
const I_AM = new RegExp(`(?:^|[.!?,;]\\s+)(?:I'm|I’m|I am)\\s+${NAME}((?:\\s+[A-Z][a-z]+){0,2})\\b`);
const NAME_IS = new RegExp(`^Name(?:'s|’s)\\s+${NAME}((?:\\s+[A-Z][a-z]+){0,2})\\b`);
const BARE = new RegExp(`^${NAME}[.,!]?$`);
const FIRST = new RegExp(`^${NAME}[.!]\\s+\\S`);
/** A speech line that opens with a bare name: "Brenna. Thirty-two." or, with the narrator's tag, "Brenna, the short man says, …". */
const WEAK = new RegExp(`^${NAME}(?:\\.\\s+\\S|,\\s+(?:the|a|an)\\s+(?:[a-z'-]+\\s+){0,3}?(?:${SPEAKER_NOUNS})\\s+(?:${SPEECH})\\b)`);
const STANDALONE = /^(?:["“])?(?:I'm|I’m|I am|My name is|My name's|My name’s|Call me|They call me|Name's|Name’s)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}[.!]?(?:["”])?$/;

/**
 * Every name form in a unit. `asked`: the player asked a name in this exchange (a bare "Lira." then answers it). Self-introductions are read only
 * in spoken lines; name patterns in any voice. Attribution is NOT applied here: an unattributed "I'm Erdan" is still a self-introduction form.
 */
export function identityForms(u: DialogueUnit, asked: boolean): IdentityForm[] {
  const out: IdentityForm[] = [], text = u.text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const standalone = (matched: string) => sentences.some(s => s.includes(matched.trim()) && STANDALONE.test(s.trim()));
  for (const m of text.matchAll(new RegExp(`\\b(?:a|an|the)\\s+(?:[a-z'-]+\\s+){0,3}?(${PERSON_NOUNS})\\s+(?:named|called)\\s+${NAME}\\b`, "g"))) out.push({ kind: "pattern", form: "named_noun", name: m[2]!, noun: m[1]!.toLowerCase(), standalone: false, matched: m[0] });
  for (const m of text.matchAll(new RegExp(`\\b${NAME},\\s+(?:a|an)\\s+(?:[a-z'-]+\\s+){0,3}?(${PERSON_NOUNS})\\b`, "g"))) out.push({ kind: "pattern", form: "appositive", name: m[1]!, noun: m[2]!.toLowerCase(), standalone: false, matched: m[0] });
  for (const m of text.matchAll(new RegExp(`(?:^|[.!?]\\s+)(?:[Tt]hat's|[Tt]hat is|[Tt]his is)\\s+(?:her|him)[.:,]?\\s+${NAME}\\b`, "g"))) out.push({ kind: "pattern", form: "presented", name: m[1]!, standalone: false, matched: m[0] });
  // Third-person naming of someone else ("That's Brenna", "Her name is Maren"); "my name" is a self-introduction below.
  for (const m of text.matchAll(new RegExp(`\\b(?:named|called|(?:[Hh]er|[Hh]is|[Tt]heir|[Tt]he (?:girl|boy|woman|man)'s) name(?:'s|’s| is| was)|(?:[Tt]his|[Tt]hat)(?: one)?(?:'s|’s| is))\\s+${NAME}\\b`, "g"))) out.push({ kind: "pattern", form: /^(?:[Tt]his|[Tt]hat)/.test(m[0]) ? "presented" : "third_person", name: m[1]!, standalone: false, matched: m[0] });
  if (!u.quoted) return out;
  const self = SELF.exec(text), iam = I_AM.exec(text), nameIs = NAME_IS.exec(text);
  const full = (token: string, rest: string | undefined) => rest?.trim() ? { full_name: `${token}${rest}` } : {};
  if (self) out.push({ kind: "self", form: self[1] ? "my_name_is" : "call_me", name: self[3]!, ...full(self[3]!, self[4]), standalone: standalone(self[0]), matched: self[0] });
  else if (iam) out.push({ kind: "self", form: "i_am", name: iam[1]!, ...full(iam[1]!, iam[2]), standalone: standalone(iam[0].replace(/^[.!?,;]\s+/, "")), matched: iam[0] });
  else if (nameIs) out.push({ kind: "self", form: "name_is", name: nameIs[1]!, ...full(nameIs[1]!, nameIs[2]), standalone: standalone(nameIs[0]), matched: nameIs[0] });
  const bare = BARE.exec(text);
  if (bare) out.push({ kind: "self", form: "bare_name", name: bare[1]!, bare: true, standalone: true, matched: bare[0] });
  // Answering a direct name question, a line may open with the name as its first sentence ("Maren. If it doesn't matter.").
  const first = asked && !bare ? FIRST.exec(text) : null;
  if (first) out.push({ kind: "self", form: "name_first", name: first[1]!, standalone: true, matched: first[0] });
  const weak = WEAK.exec(text);
  if (weak) out.push({ kind: "weak", form: "weak_opening", name: weak[1]!, standalone: false, matched: weak[0] });
  return out;
}

export interface NameIntroduction {
  readonly name: string; readonly exchange: number;
  /** pattern: introduced as a name; self: the speaker's own name; weak: a quote opening with the name. */
  readonly kind: "pattern" | "self" | "weak";
  /** A speech line that is only a name, answering a direct name question. */
  readonly bare?: boolean;
  /** The attributed speaker of the quote it came from (self: the person themself; pattern: whoever introduced them). */
  readonly noun?: string; readonly speaker?: string; readonly narration_voice: boolean; readonly evidence: string;
}

/**
 * The scene reader's name introductions (unchanged rules over the shared forms). A self-introduction counts only in an ATTRIBUTED spoken line, or in a
 * legacy quote; unattributed plain RPG speech is nobody's self-introduction, but a line that opens with, or is only, a name (answering a name
 * question) is still a weak presentation, accepted only when narration also treats the name as a person (readScene).
 */
export function introductions(units: readonly DialogueUnit[], asked: (exchange: number) => boolean, ok: (n: string) => boolean): NameIntroduction[] {
  const out: NameIntroduction[] = [];
  const add = (i: NameIntroduction) => { if (ok(i.name) && !out.some(o => o.name === i.name && o.exchange === i.exchange && o.kind === i.kind && o.speaker === i.speaker)) out.push(i); };
  for (const u of units) {
    const base = { exchange: u.exchange, narration_voice: !u.quoted, evidence: u.text.slice(0, 240), ...(u.quoted && u.speaker ? { speaker: u.speaker } : {}) };
    const forms = identityForms(u, asked(u.exchange));
    for (const f of forms.filter(f => f.kind === "pattern")) add({ ...base, name: f.name, kind: "pattern", ...(f.noun ? { noun: f.noun } : {}) });
    if (!u.quoted) continue;
    if (u.rpg && !u.speaker) {
      const bare = asked(u.exchange) ? forms.find(f => f.form === "bare_name") : undefined;
      if (bare) add({ ...base, bare: true, name: bare.name, kind: "weak" });
      const w = forms.find(f => f.kind === "weak"); if (w) add({ ...base, name: w.name, kind: "weak" });
      continue;
    }
    const own = forms.find(f => f.kind === "self" && (f.form !== "bare_name" || asked(u.exchange)) && (f.form !== "name_first" || !!u.speaker));
    if (own) add({ ...base, ...(own.form === "bare_name" ? { bare: true } : {}), name: own.name, kind: "self" });
    const weak = forms.find(f => f.kind === "weak");
    if (weak) add({ ...base, name: weak.name, kind: "weak" });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ facts of one narration
export interface IdentityScope {
  readonly people: readonly Person[];
  /** The player asked a name this turn (a bare "Lira." then answers it). */
  readonly asked?: boolean;
  /** Descriptor nouns of present people who have no name ("woman" for "the woman"), by character id. */
  readonly descriptors?: ReadonlyMap<string, string>;
}

/** Where a unit's words are in the narration (first occurrence at or after `from`). */
function locate(frame: NarrationFrame, text: string, from: number): { index: number; at: number } {
  const probe = text.slice(0, 60);
  let at = probe ? frame.narration.indexOf(probe, from) : -1;
  if (at < 0 && probe) at = frame.narration.indexOf(probe);
  let index = 0;
  for (let i = 0; i < frame.starts.length; i++) if ((frame.starts[i] ?? 0) <= Math.max(0, at)) index = i;
  return { index, at };
}

const keyRef = (people: readonly Person[], key: string | undefined, surface = ""): FactEntityRef => !key ? unresolvedRef(surface)
  : key === "nicco" ? playerRef(surface || "Nicco") : { surface: surface || (people.find(p => p.id === key)?.names[0] ?? key.replace(/^other:/, "")), entity_id: key, resolution: key.startsWith("other:") && !/^other:[A-Z]/.test(key) ? "descriptor" : "name", candidates: [key] };

/** A person token (a present person's name, Nicco, a pronoun or a descriptor) to the people it can mean. */
function personRef(token: string, people: readonly Person[], scope: IdentityScope, exclude?: string): FactEntityRef {
  const t = token.trim();
  if (/^nicco$/i.test(t)) return playerRef(t);
  const named = people.filter(p => p.id !== "nicco" && p.names.some(n => n.toLowerCase() === t.toLowerCase())).map(p => p.id);
  if (named.length) return { surface: t, ...(named.length === 1 ? { entity_id: named[0]! } : {}), resolution: "name", candidates: named };
  const pronoun = t.match(/^(her|him|she|he)$/i);
  if (pronoun) {
    const want = /^(?:her|she)$/i.test(t) ? "female" : "male";
    const fits = people.filter(p => p.id !== "nicco" && p.id !== exclude && p.sex === want).map(p => p.id);
    return { surface: t, ...(fits.length === 1 ? { entity_id: fits[0]! } : {}), resolution: fits.length ? "pronoun" : "unresolved", candidates: fits };
  }
  const noun = t.match(new RegExp(`^(?:the|that|this)\\s+(?:[a-z'-]+\\s+){0,2}?(${SUBJECT_NOUNS})$`, "i"))?.[1]?.toLowerCase();
  if (noun) {
    const fits = [...(scope.descriptors ?? new Map<string, string>())].filter(([id, d]) => d === noun && id !== exclude).map(([id]) => id);
    const ids = fits.length ? fits : [`other:${noun}`];
    return { surface: t, ...(ids.length === 1 ? { entity_id: ids[0]! } : {}), resolution: "descriptor", candidates: ids };
  }
  return unresolvedRef(t);
}

/**
 * The identity facts of one narration, read from its dialogue units: speaker of every spoken line, self-introductions, name disclosures, the
 * recipient a line is addressed to, and the people each narrated sentence refers to.
 */
export function identityFacts(frame: NarrationFrame, units: readonly DialogueUnit[], scope: IdentityScope): IdentityFact[] {
  const out: IdentityFact[] = [], people = scope.people;
  const names = [...new Set(people.flatMap(p => p.names))].sort((a, b) => b.length - a.length).map(esc);
  const target = `(?:${[...names, "him", "her"].join("|")}|(?:the|that|this)\\s+(?:[a-z'-]+\\s+){0,2}?(?:${SUBJECT_NOUNS}))`;
  const SAYS_TO = new RegExp(`\\b(?:${SPEECH})\\s+(?:[a-z]+ly\\s+)?(?:to|at)\\s+(${target})\\b`, "i");
  const ADDRESSED = new RegExp(`\\b(?:tells?|told|asks?|asked|turns? to|turned to|addresses|addressed)\\s+(${target})\\b`, "i");
  const VOCATIVE_HEAD = new RegExp(`^(${names.join("|") || "(?!)"}),\\s+\\S`), VOCATIVE_TAIL = new RegExp(`,\\s+(${names.join("|") || "(?!)"})[.!?]*$`);
  let cursor = 0;
  units.forEach((u, k) => {
    const { index, at } = locate(frame, u.text, cursor);
    if (at >= 0) cursor = at;
    const sentence = frame.sentences[index] ?? u.text, span = spanOf(frame, index, 0, u.text);
    const base = { span, sentence, modality: "completed" as const, polarity: "affirmed" as const, source_text: u.text, voice: u.quoted ? "speech" as const : "narration" as const };
    const speaker = keyRef(people, u.quoted ? u.speaker : undefined, u.attribution?.surface);
    if (u.quoted) {
      const a = u.attribution ?? { ...unresolvedRef(""), ambiguity: "unresolved" as const, confidence: "low" as const };
      const subject: FactEntityRef = u.speaker ? { ...speaker, candidates: a.candidates.length ? a.candidates : [u.speaker] } : { surface: a.surface, resolution: "unresolved", candidates: a.candidates };
      out.push({ ...base, kind: "speaker_attribution", form: a.method ?? "unattributed", attribution: a, subject, confidence: a.confidence, ambiguity: a.ambiguity,
        provenance: { extractor: "identity", form: a.method ?? "unattributed" }, ...(a.post_hoc ? { post_hoc: true as const } : {}) } as SpeakerAttributionFact);
      // Recipient: a vocative inside the line, or an explicit "says to X" / "tells X" in the narration right before or after it.
      const vocative = VOCATIVE_HEAD.exec(u.text) ?? VOCATIVE_TAIL.exec(u.text);
      const near = [units[k - 1], units[k + 1]].filter((x): x is DialogueUnit => !!x && !x.quoted && x.exchange === u.exchange && (x.speaker === undefined || x.speaker === u.speaker));
      const tag = near.map(x => SAYS_TO.exec(x.text) ? { m: SAYS_TO.exec(x.text)!, form: "says_to" as const } : ADDRESSED.exec(x.text) ? { m: ADDRESSED.exec(x.text)!, form: "addressed_verb" as const } : undefined).find(Boolean);
      const hit = vocative ? { token: vocative[1]!, form: "vocative" as const } : tag ? { token: tag.m[1]!, form: tag.form } : undefined;
      if (hit) {
        const recipient = personRef(hit.token, people, scope, u.speaker);
        out.push({ ...base, kind: "recipient_attribution", form: hit.form, recipient, subject: speaker, confidence: recipient.entity_id ? "medium" : "low", ambiguity: recipient.entity_id ? "none" : recipient.candidates.length > 1 ? "ambiguous" : "unresolved",
          provenance: { extractor: "identity", form: hit.form } } as RecipientAttributionFact);
      }
    }
    // Names: self-introductions and disclosures (the same forms the scene reader uses).
    for (const f of identityForms(u, !!scope.asked)) {
      if (f.kind === "self") out.push({ ...base, kind: "self_introduction", form: f.form as SelfIntroductionFact["form"], name: f.name, ...(f.full_name ? { full_name: f.full_name } : {}), standalone: f.standalone, subject: speaker,
        confidence: u.speaker ? "high" : "low", ambiguity: u.speaker ? "none" : (u.attribution?.ambiguity ?? "unresolved"), provenance: { extractor: "identity", form: f.form } } as SelfIntroductionFact);
      else out.push({ ...base, kind: "name_disclosure", form: f.form as NameDisclosureFact["form"], name: f.name, named: f.noun ? { surface: `the ${f.noun}`, entity_id: `other:${f.noun}`, resolution: "descriptor", candidates: [`other:${f.noun}`] } : unresolvedRef(f.name),
        ...(f.noun ? { noun: f.noun } : {}), subject: u.quoted ? speaker : unresolvedRef(""), confidence: f.kind === "weak" ? "low" : "medium", ambiguity: "none", provenance: { extractor: "identity", form: f.form } } as NameDisclosureFact);
    }
    // References in narrated sentences: names, an opening third-person pronoun, descriptors; "another man" introduces somebody new.
    if (!u.quoted) {
      const refs: { token: string; form: ReferenceFact["form"]; fresh?: true }[] = [];
      for (const n of names) for (const m of u.text.matchAll(new RegExp(`\\b(${n})(?:'s|’s)?\\b`, "g"))) refs.push({ token: m[1]!, form: "name" });
      const pronoun = u.text.match(/^(she|he)\b/i); if (pronoun) refs.push({ token: pronoun[1]!, form: "pronoun" });
      for (const m of u.text.matchAll(new RegExp(`\\b(another|(?:a|the) (?:second|third|new|different|other))\\s+(?:[a-z'-]+\\s+){0,2}?(${SUBJECT_NOUNS})\\b`, "gi"))) refs.push({ token: m[0], form: "descriptor", fresh: true });
      for (const m of u.text.matchAll(new RegExp(`\\b(?:the|that|this)\\s+(?:[a-z'-]+\\s+){0,2}?(${SUBJECT_NOUNS})\\b`, "gi"))) if (!refs.some(r => r.fresh && r.token.includes(m[0]))) refs.push({ token: m[0], form: "descriptor" });
      for (const r of refs) {
        const subject = r.fresh ? unresolvedRef(r.token) : personRef(r.token, people, scope);
        const sex = r.form === "descriptor" ? nounSex(r.token.split(/\s+/).at(-1) ?? "") : undefined;
        out.push({ ...base, kind: "reference", form: r.form, subject, confidence: subject.entity_id ? "high" : "low", ambiguity: subject.entity_id ? "none" : subject.candidates.length > 1 ? "ambiguous" : "unresolved",
          provenance: { extractor: "identity", form: r.fresh ? "introduces_new" : sex ? `${r.form}_${sex}` : r.form }, ...(r.fresh ? { introduces_new: true as const } : {}) } as ReferenceFact);
      }
    }
  });
  return out;
}
