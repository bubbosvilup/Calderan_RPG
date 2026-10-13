import { readPrices } from "../commerce/trade-price.js";
import { GATES } from "../language/gates.js";
import { QUOTED_SPAN_SOURCE, blankQuotes, sentencesOf } from "../language/text.js";
import { type NarrationFrame, spanOf } from "./frame.js";
import { modalityOf, polarityOf } from "./modality.js";
import { type Referent, nameRef, playerRef, refAmbiguity, unresolvedRef } from "./subjects.js";
import { numberPhraseValue } from "../language/numbers.js";
import { BELONGS_TO_PLAYER, COIN_HAND, COIN_MOTION, COUNTER_WORDING, DEAL_DONE, DOCUMENT, GROUP_OR_EACH, HANDOVER, HANDS_CHANGED, PAST_COST, PAY_VERB, QUOTE_NOT_ACTUAL, WITHDRAWAL, YOURS } from "./commerce-vocabulary.js";
import type { CommerceFact, DialogueUnit, FactEntityRef, FactModality, PriceQuoteFact, QuoteRole, TextVoice } from "./types.js";

/**
 * COMMERCE FACTS: what a text SAYS about prices, withdrawals and finished deals. Descriptive only: a quote is not an offer, a claim is not a
 * settlement, and nothing here knows about funds, ownership or the standing offer. Policy (which quote is actionable, which claim contradicts
 * the state) lives in commerce-evidence.ts.
 *
 * Voices. In the Narrator's RPG format the starred paragraphs are narration and the plain paragraphs are SPEECH; in a text with no starred
 * paragraph, quoted spans are speech and the rest is narration. A price may be stated in speech (a character quotes it) or in narration
 * ("Korvin names a price of 300 gold"); money changing hands is only ever a CLAIM of narration, never of speech (a seller's "I'll take
 * ninety gold" is a bargaining line, not a payment), while "she's yours" / "that's your bill of sale" / "the deal is done" count in either voice.
 */
export interface CommerceScope {
  readonly people: readonly Referent[];
  /** The shared dialogue units of the same text (who speaks each line). */
  readonly units: readonly DialogueUnit[];
  /** Words naming the goods a quote is about: "the halberd is fifteen" prices the halberd only when the subject is named. */
  readonly subjects?: readonly string[];
}

interface Part { readonly text: string; readonly voice: TextVoice; readonly at: number; readonly index: number; readonly prev?: string; readonly next?: string; readonly speaker: FactEntityRef }

/** Paragraph ranges of the narration; a paragraph is a run of lines ended by a blank line. */
function paragraphs(narration: string): { start: number; end: number; starred: boolean }[] {
  return [...narration.matchAll(/[^\n]+(?:\n(?!\n)[^\n]*)*/g)].map(m => ({ start: m.index!, end: m.index! + m[0].length, starred: /^\s*\*/.test(m[0]) }));
}

const normText = (s: string) => s.replace(/[*"“”]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
/**
 * The speaker of a spoken piece of text, from the SHARED dialogue units (Block 11): commerce keeps no speaker grammar of its own. The player counts as the
 * speaker only on real evidence (a tag naming him, a line labelled with his name, the beat right before the line); the weakest legacy reading
 * (`recent_subject`) never turns a price into the player's counter.
 */
function speakerOf(text: string, units: readonly DialogueUnit[], people: readonly Referent[]): FactEntityRef {
  const t = normText(text);
  const u = t ? units.find(x => x.quoted && (normText(x.text) === t || normText(x.text).includes(t) || t.includes(normText(x.text)))) : undefined;
  const key = u?.attribution?.method && u.attribution.method !== "recent_subject" ? u.speaker : undefined;
  if (!key) return unresolvedRef("");
  if (key === "nicco") return playerRef(u!.attribution?.surface || "Nicco");
  const person = people.find(p => p.id === key);
  return person ? nameRef(people, person.names[0]!) : { surface: key.replace(/^other:/, ""), entity_id: key, resolution: "descriptor", candidates: [key] };
}

/** True for every character inside a *…* pair of its paragraph (the asterisks themselves included): the narrator's own voice in the RPG format. */
function starMask(narration: string, paras: readonly { start: number; end: number }[]): boolean[] {
  const mask: boolean[] = new Array(narration.length).fill(false);
  for (const p of paras) { let on = false; for (let i = p.start; i < p.end; i++) { if (narration[i] === "*") { on = !on; mask[i] = true; } else mask[i] = on; } }
  return mask;
}

function partsOf(frame: NarrationFrame, people: readonly Referent[], units: readonly DialogueUnit[]): Part[] {
  const paras = paragraphs(frame.narration), rpg = paras.some(p => p.starred), mask = starMask(frame.narration, paras);
  const paraAt = (at: number) => paras.findIndex(p => (frame.starts[at] ?? 0) >= p.start && (frame.starts[at] ?? 0) < p.end);
  const sameBlock = (a: number, b: number) => b >= 0 && b < frame.sentences.length && paraAt(a) === paraAt(b);
  const parts: Part[] = [];
  frame.sentences.forEach((sentence, at) => {
    const neighbour = (to: number) => sameBlock(at, to) ? frame.prose(to).trim() : undefined;
    const prev = neighbour(at - 1), next = neighbour(at + 1);
    // The sentence in runs of one voice: asterisk-wrapped runs are narration; in the RPG format the plain runs are speech.
    const from = frame.starts[at] ?? 0, runs: { text: string; narrator: boolean }[] = [];
    for (let i = from; i < from + sentence.length; ) {
      let j = i; while (j < from + sentence.length && mask[j] === mask[i]) j++;
      runs.push({ text: frame.narration.slice(i, j).replace(/\*/g, ""), narrator: !!mask[i] || !rpg }); i = j;
    }
    for (const run of runs) {
      const quoted = [...run.text.matchAll(new RegExp(QUOTED_SPAN_SOURCE, "g"))].map(m => m[0].slice(1, -1).trim()).filter(Boolean);
      for (const inner of quoted) { const subs = sentencesOf(inner), speaker = speakerOf(inner, units, people); subs.forEach((sub, k) => parts.push({ text: sub, voice: "speech", at, index: parts.length, ...(subs[k - 1] ? { prev: subs[k - 1]! } : {}), ...(subs[k + 1] ? { next: subs[k + 1]! } : {}), speaker })); }
      const rest = blankQuotes(run.text).trim();
      if (rest) parts.push({ text: rest, voice: run.narrator ? "narration" : "speech", at, index: parts.length, ...(prev ? { prev } : {}), ...(next ? { next } : {}), speaker: run.narrator ? unresolvedRef("") : speakerOf(rest, units, people) });
    }
  });
  return parts;
}

const base = (frame: NarrationFrame, part: Part, matched: string, subject: FactEntityRef, modality: FactModality, form: string, confidence: "high" | "medium" | "low" = "medium") => ({
  span: spanOf(frame, part.at, part.index, matched), sentence: frame.sentences[part.at]!, subject, modality, polarity: polarityOf(modality), confidence, ambiguity: refAmbiguity(subject),
  provenance: { extractor: "commerce" as const, form }, source_text: part.text,
});

/** A bargaining phrase must not turn its own "'ll" into a future: the gate reads the text without it. */
// Bargaining idiom that is not a negation of the price: "I'll go ninety" is no future; "not a coin less" is an emphatic floor.
const withoutBargain = (text: string) => text.replace(/\b(?:i'?ll|i will|we'?ll)\s+(?=go|do|take|say|sell|let)/gi, "I ")
  .replace(/\b(?:and )?not (?:a|one) (?:single )?(?:coin|copper|penny|piece|gold)\s+(?:less|lower|under|short)\b/gi, "firm");

export function commerceFacts(frame: NarrationFrame, scope: CommerceScope): CommerceFact[] {
  const out: CommerceFact[] = [];
  for (const part of partsOf(frame, scope.people, scope.units)) {
    const text = part.text, speech = part.voice === "speech";
    // --- prices
    const reading = readPrices(text, { concrete: true, prev: part.prev, next: part.next, ...(scope.subjects ? { subjects: scope.subjects } : {}) });
    if (reading.unsupported) out.push({ ...base(frame, part, text, part.speaker, "completed", reading.unsupported), kind: "unsupported_money", form: reading.unsupported, voice: part.voice });
    // "He paid ninety-five gold" (narration) states a PAYMENT, not a price: the payment claim below describes it.
    const paymentProse = !speech && part.voice === "narration" && (PAY_VERB.test(text) || COIN_HAND.test(text));
    for (const st of paymentProse ? [] : reading.statements) {
      const modality = modalityOf(withoutBargain(text), QUOTE_NOT_ACTUAL);
      const quote_kind = PAST_COST.test(text) ? "past_cost" : GROUP_OR_EACH.test(text) ? "group_or_each" : "current";
      const quote_role: QuoteRole = part.speaker.resolution === "player" ? "player_counter" : COUNTER_WORDING.test(`${text} ${part.next ?? ""}`) ? "seller_counter" : "seller_ask";
      out.push({ ...base(frame, part, st.span, part.speaker, modality, st.form), kind: "price_quote", form: st.form, amount: st.amount, currency: "gold", quote_role, quote_kind, voice: part.voice } as PriceQuoteFact);
    }
    // A cost the speaker paid ("I paid four for her") is a figure of the past, not of the sale: kept as a non-current quote so no reader mistakes the unit for a clean offer.
    for (const pc of text.matchAll(new RegExp(PAST_COST.source, "gi"))) { const amount = numberPhraseValue(pc[1]!);
      if (amount !== undefined) out.push({ ...base(frame, part, pc[0], part.speaker, "completed", "past_cost"), kind: "price_quote", form: "past_cost", amount, currency: "gold", quote_role: "ambiguous_quote", quote_kind: "past_cost", voice: part.voice } as PriceQuoteFact); }
    // --- withdrawal
    const w = WITHDRAWAL.exec(text);
    if (w) { const modality = modalityOf(text.replace(WITHDRAWAL, " "), GATES.audit_denied); out.push({ ...base(frame, part, w[0], part.speaker, modality, "withdrawal"), kind: "offer_withdrawn", form: "withdrawal", voice: part.voice }); }
    // --- claims. Narration only for money; any voice for ownership and finished deals.
    /** The not-actual reading of the CLAUSE the claim sits in ("Keep it or don't, the sale's done" denies nothing about the sale). */
    const clauseOf = (m: RegExpExecArray) => { const before = text.slice(0, m.index), cut = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf(":"), before.lastIndexOf("\u2014")); return text.slice(cut + 1).split(/[,;:\u2014]/)[0] ?? text; };
    const denied = modalityOf(text, GATES.audit_denied);
    // "You walk her out that gate, she's yours": ownership promised on a condition is not ownership claimed.
    const CONDITION_BEFORE = /\b(?:once|when|whenever|if|after|as soon as|the moment)\b|(?:^|[.!?]\s*)you (?:walk|carry|take|bring|lead|pay|hand|give|get|haul|march|drag|show|sign|put|leave)\b[^.!?]*,\s*$/i;
    const gated = (m: RegExpExecArray) => CONDITION_BEFORE.test(text.slice(0, m.index)) ? "conditional" as const : modalityOf(clauseOf(m), GATES.audit_denied);
    const claim = (re: RegExp, make: (m: RegExpExecArray) => CommerceFact) => { const m = re.exec(text); if (m) out.push(make(m)); };
    if (!speech) {
      claim(PAY_VERB, m => ({ ...base(frame, part, m[0], unresolvedRef(""), denied, "pay_verb"), kind: "payment_claim", form: "pay_verb", voice: part.voice }));
      if (!PAY_VERB.test(text)) claim(COIN_HAND, m => ({ ...base(frame, part, m[0], unresolvedRef(""), denied, "coin_motion"), kind: "payment_claim", form: "coin_motion", voice: part.voice }));
      for (const re of COIN_MOTION) { const m = re.exec(text); if (m) { out.push({ ...base(frame, part, m[0], unresolvedRef(""), denied, "coin_motion"), kind: "payment_claim", form: "coin_motion", voice: part.voice }); break; } }
      claim(HANDS_CHANGED, m => ({ ...base(frame, part, m[0], unresolvedRef(""), denied, "hands_changed"), kind: "payment_claim", form: "hands_changed", voice: part.voice }));
      for (const m of text.matchAll(HANDOVER)) out.push({ ...base(frame, part, m[0], unresolvedRef(""), denied, "goods_handover"), kind: "transfer_claim", form: "goods_handover", object_phrase: m[1]!, voice: part.voice });
    }
    claim(BELONGS_TO_PLAYER, m => ({ ...base(frame, part, m[0], unresolvedRef(""), gated(m), "belongs_to_player"), kind: "transfer_claim", form: "belongs_to_player", voice: part.voice }));
    claim(YOURS, m => ({ ...base(frame, part, m[0], unresolvedRef(""), gated(m), "yours"), kind: "transfer_claim", form: "yours", voice: part.voice }));
    claim(DOCUMENT, m => ({ ...base(frame, part, m[0], unresolvedRef(""), gated(m), "document"), kind: "transfer_claim", form: "document", voice: part.voice }));
    for (const re of DEAL_DONE) { const m = re.exec(text); if (m) { out.push({ ...base(frame, part, m[0], unresolvedRef(""), gated(m), "deal_done"), kind: "settlement_claim", form: "deal_done", voice: part.voice }); break; } }
  }
  return out;
}

/** The player's own words: every figure is the PLAYER's (a counter, never the seller's price). */
export function inputCommerceFacts(frame: NarrationFrame): CommerceFact[] {
  const out: CommerceFact[] = [];
  frame.sentences.forEach((sentence, at) => {
    const text = frame.prose(at).trim();
    if (!text) return;
    const part: Part = { text, voice: "player_input", at, index: out.length, speaker: playerRef("Nicco") };
    const sub = (i: number) => (i >= 0 && i < frame.sentences.length ? frame.prose(i).trim() : undefined);
    const reading = readPrices(text, { concrete: true, prev: sub(at - 1), next: sub(at + 1) });
    if (reading.unsupported) out.push({ ...base(frame, part, text, part.speaker, "completed", reading.unsupported), kind: "unsupported_money", form: reading.unsupported, voice: "player_input" });
    for (const st of reading.statements) {
      const modality = modalityOf(withoutBargain(text), QUOTE_NOT_ACTUAL);
      out.push({ ...base(frame, part, st.span, part.speaker, modality, st.form), kind: "price_quote", form: st.form, amount: st.amount, currency: "gold", quote_role: "player_counter",
        quote_kind: PAST_COST.test(text) ? "past_cost" : GROUP_OR_EACH.test(text) ? "group_or_each" : "current", voice: "player_input" } as PriceQuoteFact);
    }
  });
  return out;
}
