import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { EVIDENCE_QUOTE_MAX } from "../llm/controller-schema.js";
import type { TurnContext } from "./context-builder.js";
import type { TurnEvidence } from "./turn-evidence.js";
import type { AuthorizationDiagnostic } from "./turn-types.js";
import { authorizeCommands } from "./command-authorizer.js";

/**
 * Phase 1O evidence-backed authorization. A controller evidence quote is necessary for the evidence path and never sufficient:
 * the command must still equal a resolved player intent, pass the existing reference/state validity checks, and survive every
 * deterministic refusal/retraction veto from TurnEvidence. Evidence can only add recall where the grammar found no confirmation.
 * See docs/architecture/EVIDENCE_AUTHORIZATION.md.
 */
export type EvidenceMode = "shadow" | "hybrid";
export interface EvidenceCheck { readonly verified: boolean; readonly check: string }
const QUOTE_MIN = 8;
// Hedge, negation, hypothetical, modal/future, interruption and retraction markers anywhere in the containing sentence(s).
const DISQUALIFY = /\b(?:not|never|no|nor|maybe|perhaps|might|could|would|should|can|cannot|will|shall|may|if|unless|whether|almost|nearly|imagin\w*|consider\w*|pretend\w*|suppos\w*|refus\w*|declin\w*|reject\w*|back|stops?|stopped|hesitat\w*|wants? to|wanted to|about to|going to|intends? to|plans? to|starts? to|started to|begins? to|began to|tries to|tried to|thinks? better|opens? (?:his|her) mouth)\b|n't\b|'ll\b|\?/i;
const RECEIPT = "takes?|took|taking|accepts?|accepted|accepting|receives?|received|receiving|gathers?|gathered|gathering|collects?|collected|collecting|picks? up|picked up|picking up|snatches?|snatched";
const COMMUNICATE = "tells?|told|telling|says?|said|saying|informs?|informed|informing|explains?|explained|explaining|states?|stated|stating|mentions?|mentioned|speaks?|spoke|speaking|reports?|reported|adds|added|replies|replied";
const STOP = new Set(["the", "a", "an", "is", "are", "was", "were", "of", "to", "and", "in", "on", "at", "it", "its", "that", "this", "has", "have", "been", "be"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(w => w && !STOP.has(w));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const quotedSpans = (text: string): [number, number][] => [...text.matchAll(/"[^"\n]*"|“[^”\n]*”/g)].map(m => [m.index, m.index + m[0].length]);
const blankQuotes = (text: string) => text.replace(/"[^"\n]*"|“[^”\n]*”/g, m => " ".repeat(m.length));
const numberWords: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };

/** Start/end of the sentence(s) of the narration that the quote overlaps. */
function sentenceBounds(narration: string, at: number, length: number): [number, number] {
  let start = 0, end = narration.length;
  for (const m of narration.matchAll(/[.!?]["”]?(?=\s)|\n/g)) {
    const stop = m.index + m[0].length;
    if (stop <= at) start = stop;
    else if (stop >= at + length) { end = stop; break; }
  }
  return [start, end];
}
/** Lower-cased first word of the nearest preceding sentence (within 300 chars) that starts with one of the candidate names. */
function precedingNamedSubject(narration: string, at: number, candidates: readonly string[]): string | undefined {
  const before = narration.slice(Math.max(0, at - 300), at).split(/(?<=[.!?]["”]?)\s+|\n+/).map(x => x.trim().replace(/^["“(]/, "")).filter(Boolean).reverse();
  for (const sentence of before) {
    const first = sentence.match(/^([A-Z][a-z]+)\b/)?.[1]?.toLowerCase();
    if (first && candidates.includes(first)) return first;
  }
  return undefined;
}

/** Deterministic, act-level verification of one controller evidence quote against the finalized narration. */
export function verifyEvidence(command: CampaignCommand, quote: string | undefined, rawNarration: string, context: TurnContext, intents: readonly CampaignCommand[]): EvidenceCheck {
  if (quote === undefined) return { verified: false, check: "no_quote" };
  // Typographic whitespace only (paragraph breaks vs spaces): demonstrated necessary in the Phase 1O DeepSeek run. No semantic normalization.
  const narration = rawNarration.replace(/\s+/g, " ");
  const q = quote.trim().replace(/\s+/g, " ");
  if (q.length < QUOTE_MIN || q.length > EVIDENCE_QUOTE_MAX) return { verified: false, check: "quote_length" };
  const at = narration.indexOf(q);
  if (at < 0) return { verified: false, check: "quote_not_verbatim" };
  const [sStart, sEnd] = sentenceBounds(narration, at, q.length);
  // Hedges in the narrated sentence disqualify; hedges inside dialogue belong to the speaker and are checked separately for quoted /tell.
  if (DISQUALIFY.test(blankQuotes(narration.slice(sStart, sEnd)))) return { verified: false, check: "sentence_hedged_negated_or_hypothetical" };
  const people = context.characters.filter(c => c.id !== "nicco");
  const names = (id: string) => [id, context.characters.find(c => c.id === id)?.profile.name].filter((n): n is string => !!n).map(n => n.toLowerCase());
  const allNames = ["nicco", ...people.flatMap(p => names(p.id))];
  const spans = quotedSpans(narration).filter(([s, e]) => at < e && at + q.length > s);
  // head: containing sentence from its start to the end of the quote, dialogue blanked, for subject resolution.
  const head = blankQuotes(narration.slice(sStart, at + q.length));
  const qOutside = blankQuotes(q);
  /**
   * Does `subject` lead `verb` in head with no other named person in between? Any capitalized name in the gap other than the
   * allowed ones (recipient, Nicco) could be the real actor, present or not ("Brenna watches Maren take…"), so it disqualifies.
   */
  const leads = (subjects: readonly string[], verb: string, allowed: readonly string[]): { subject: string; at: number; end: number } | undefined => {
    const ok = new Set(["nicco", ...allowed.flatMap(names)]);
    for (const m of head.matchAll(new RegExp(`\\b(${subjects.map(esc).join("|")})\\b([^.!?;]{0,160}?)\\b(?:${verb})\\b`, "gi"))) {
      if (![...m[2]!.matchAll(/\b[A-Z][a-z]+\b/g)].some(w => !ok.has(w[0].toLowerCase()))) return { subject: m[1]!.toLowerCase(), at: sStart + m.index, end: sStart + m.index + m[0].length };
    }
    return undefined;
  };
  /** A pronoun resolves to the named subject of the nearest sentence before the pronoun's own sentence. */
  const pronounRefersTo = (position: number) => precedingNamedSubject(narration, sentenceBounds(narration, position, 1)[0], allNames);
  /** Capitalized words in the quote that are not sentence-initial and not the recipient or Nicco: possibly another person. */
  const strangerIn = (text: string, recipient: string) => {
    const ok = new Set(["nicco", ...names(recipient)]);
    return [...text.matchAll(/\b[A-Z][a-z]+\b/g)].some(w => !ok.has(w[0].toLowerCase()) && !/(?:^|[.!?]["”]?\s+|["“(]\s*)$/.test(text.slice(0, w.index)));
  };

  if (command.kind === "set_knowledge") {
    const recipient = command.knowledge.character_id, fact = context.facts.find(f => f.id === command.knowledge.fact_id);
    if (!fact) return { verified: false, check: "fact_not_in_context" };
    const content = words(fact.statement);
    const hasContent = (text: string) => content.length > 0 && content.every(w => new RegExp(`\\b${esc(w)}\\b`, "i").test(text));
    if (!hasContent(q)) return { verified: false, check: "fact_content_missing" };
    if (strangerIn(q, recipient) || people.some(p => p.id !== recipient && names(p.id).some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(q)))) return { verified: false, check: "other_character_in_quote" };
    // The quote itself must carry the act: a communication verb outside dialogue, a colon realization, or "<recipient> hears Nicco say".
    const heard = names(recipient).some(n => new RegExp(`\\b${esc(n)}\\b[^.!?]{0,40}\\bhears?\\b[^.!?]{0,20}\\b(?:nicco|him)\\s+(?:say|tell|state)`, "i").test(q));
    if (heard) return { verified: true, check: "heard_nicco_say" };
    // Quoted /tell via the action-beat convention: `Nicco leans toward Brenna. "The eastern bridge is closed."` The quoted sentence
    // has no attribution text at all; the immediately preceding sentence starts with Nicco, addresses the recipient and names no one else.
    // Anchored on the quoted span's own sentence, so the excerpt may or may not include the beat.
    const [qsStart, qsEnd] = spans.length ? sentenceBounds(narration, spans[0]![0], spans[0]![1] - spans[0]![0]) : [0, 0];
    if (spans.length && !/[a-z]/i.test(blankQuotes(narration.slice(qsStart, qsEnd)))) {
      const spoken = spans.map(([s, e]) => narration.slice(s, e)).join(" ");
      const [bStart] = sentenceBounds(narration, Math.max(0, qsStart - 2), 1);
      const beat = narration.slice(bStart, qsStart).trim();
      const beatOk = /^Nicco\b/.test(beat) && names(recipient).some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(beat)) && !strangerIn(beat, recipient) && !DISQUALIFY.test(beat);
      if (beatOk && hasContent(spoken) && !DISQUALIFY.test(spoken) && intents.some(i => isDeepStrictEqual(i, command))) return { verified: true, check: "nicco_quoted_tell_action_beat" };
    }
    if (!new RegExp(`\\b(?:${COMMUNICATE})\\b`, "i").test(qOutside) && !/:\s/.test(qOutside)) return { verified: false, check: "no_communication_act_in_quote" };
    // Nicco (or "he" resolving to Nicco) must be the subject of that act; "Brenna tells Nicco" or "Nicco listens as Maren tells" fail.
    const inversion = head.match(/\b(?:says|said)\s+(nicco|he)\b/i);
    const lead = leads(["nicco", "he"], `${COMMUNICATE}|[a-z']+\\s*:`, [recipient]) ?? (inversion ? { subject: inversion[1]!.toLowerCase(), at: sStart + inversion.index! } : undefined);
    // "he" counts only when the nearest named-subject sentence before the pronoun's sentence is about Nicco.
    const speakerIsNicco = lead?.subject === "nicco" || (lead?.subject === "he" && pronounRefersTo(lead.at) === "nicco");
    if (!speakerIsNicco) return { verified: false, check: "no_nicco_communication_act" };
    if (spans.length) {
      // Quoted /tell (Phase 1O policy): Nicco's own quoted statement of the exact fact, realizing an already-resolved /tell intent.
      const spoken = spans.map(([s, e]) => narration.slice(s, e)).join(" ");
      if (!hasContent(spoken)) return { verified: false, check: "quoted_content_mismatch" };
      if (DISQUALIFY.test(spoken)) return { verified: false, check: "quoted_statement_hedged_or_question" };
      if (!intents.some(i => isDeepStrictEqual(i, command))) return { verified: false, check: "quoted_speech_without_tell_intent" };
      return { verified: true, check: "nicco_quoted_tell" };
    }
    return { verified: true, check: "nicco_communicates_fact" };
  }

  if (command.kind === "transfer_item") {
    const recipient = command.owner_id;
    if (!recipient) return { verified: false, check: "no_recipient" };
    if (strangerIn(q, recipient) || people.some(p => p.id !== recipient && names(p.id).some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(q)))) return { verified: false, check: "other_character_in_quote" };
    const offered = intents.flatMap(i => i.kind === "transfer_item" && i.owner_id === recipient ? [i.item_id] : []);
    const itemName = (id: string) => (context.items.find(i => i.id === id)?.name ?? id).toLowerCase();
    // Receipt is narrated, never spoken: the act and the item reference are read with dialogue blanked.
    const act = `${RECEIPT}|(?:extends?|extended|holds? out|held out|reach(?:es|ed|ing)? out(?: and)?)(?:[\\s,]+[a-z']+){0,3}?[\\s,]+(?:to )?(?:take|takes|took|accept|accepts|accepted)`;
    const listWords = new Set(["the", "a", "an", "then", "and", "finally", "next", "first", "last", "one", "also", ...offered.flatMap(id => itemName(id).split(/[^a-z']+/))]);
    const listOnly = (text: string) => text.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean).every(w => listWords.has(w));
    let evidenceText = qOutside;
    const lead = leads([...names(recipient), "she", "he"], act, [recipient]);
    if (!new RegExp(`\\b(?:${act})\\b`, "i").test(qOutside)) {
      // Elliptical continuation ("…took the cotton shirt, then the fluffy one"): the quote's list part must be pure item-list
      // material, following the recipient's receipt act in the same sentence with only item-list material in between.
      const listPart = qOutside.split(/,\s*(?!(?:then|and|finally|next)\b)/)[0]!;
      const between = lead ? head.slice(lead.end - sStart, at - sStart) : "";
      // Only a true continuation, starting with a coordinator, qualifies; a bare object fragment ("the fluffy shirt") never does.
      const continuation = /^\s*,?\s*(?:and then|and finally|then|and|finally|next)\b/i.test(listPart);
      if (!lead || !continuation || !listOnly(listPart) || !listOnly(between)) return { verified: false, check: "no_receipt_act_in_quote" };
      evidenceText = listPart;
    }
    if (!lead || (["she", "he"].includes(lead.subject) && !names(recipient).includes(pronounRefersTo(lead.at) ?? ""))) return { verified: false, check: "receipt_subject_not_recipient" };
    const ref = evidenceText;
    // Group phrase covering the whole resolved offer; a stated count must equal the offer size.
    const group = ref.toLowerCase().match(/\b(?:them|all of them|all (two|three|four|five)|both|the (two|three|four|five) (?:items|garments|pieces|things)|the (?:clothes|clothing|garments|items|stack|bundle|pile)(?: of [a-z ]+)?)\b/);
    if (group) {
      const count = group[1] ?? group[2] ?? (group[0] === "both" ? "two" : undefined);
      if (!count || numberWords[count] === offered.length) return { verified: true, check: "receipt_of_offered_group" };
    }
    // Otherwise this item must be referenced by a token unique to it among the offered items (sequential lists allowed).
    const own = words(itemName(command.item_id)), others = offered.filter(id => id !== command.item_id).flatMap(id => words(itemName(id)));
    const unique = own.filter(w => !others.includes(w));
    const referenced = unique.length ? unique.some(w => new RegExp(`\\b${esc(w)}\\b`, "i").test(ref)) : ref.toLowerCase().includes(itemName(command.item_id));
    return referenced ? { verified: true, check: "receipt_of_named_item" } : { verified: false, check: "offered_item_not_referenced" };
  }
  return { verified: false, check: "evidence_path_not_supported_for_command" };
}

const MISSING_CONFIRMATION = new Set(["rejected_insufficient_confirmation", "rejected_fact_not_communicated"]);
/**
 * Hybrid policy: authorized if TurnEvidence confirms, OR (hybrid mode) a verified controller quote confirms a command the grammar
 * rejected only for missing confirmation. Refusal/retraction, intent mismatch, invalid references and state validity still
 * reject through the unchanged authorizer. Shadow mode records evidence checks but authorizes exactly as the grammar does.
 */
export function authorizeWithEvidence(proposal: readonly CampaignCommand[], quotes: readonly string[] | undefined, evidence: TurnEvidence, narration: string,
  context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, mode: EvidenceMode): readonly AuthorizationDiagnostic[] {
  const grammar = authorizeCommands(proposal, evidence, context, snapshot);
  const decided = grammar.map((g, i): AuthorizationDiagnostic => {
    const command = proposal[i]!, quote = quotes?.[i];
    const ev = verifyEvidence(command, quote, narration, context, evidence.player_intents);
    const base = { command, grammar: { authorized: g.authorized, reason: g.reason }, evidence: { quote: quote ?? null, verified: ev.verified, check: ev.check } };
    if (g.authorized) return { ...base, authorized: true, reason: g.reason, source: ev.verified ? "both" : "grammar" };
    if (mode === "hybrid" && ev.verified && MISSING_CONFIRMATION.has(g.reason)) {
      const index = evidence.player_intents.findIndex(c => isDeepStrictEqual(c, command));
      const kind = command.kind === "set_knowledge" ? "was_told_fact" as const : "accepted_transfer" as const;
      const withQuote = { ...evidence, narrator_confirmations: [...evidence.narrator_confirmations, { kind, command_indexes: [index], collective: false, source_sentence: quote! }] };
      const d = authorizeCommands([command], withQuote, context, snapshot)[0]!;
      if (d.authorized) return { ...base, authorized: true, reason: "authorized_controller_evidence", source: "evidence" };
      return { ...base, authorized: false, reason: d.reason, source: "rejected" };
    }
    return { ...base, authorized: false, reason: g.reason, source: "rejected" };
  });
  // Atomic offered group: evidence may not produce a partial commit of one offer. If the evidence path authorized part of a
  // multi-item offer to one recipient but not all of it, the evidence-sourced part is withdrawn (grammar-sourced decisions stand).
  const groups = new Map<string, CampaignCommand[]>();
  for (const c of evidence.player_intents) if (c.kind === "transfer_item" && c.owner_id) groups.set(c.owner_id, [...(groups.get(c.owner_id) ?? []), c]);
  const atomic = decided.map(d => {
    if (d.source !== "evidence" || d.command.kind !== "transfer_item" || !d.command.owner_id) return d;
    const members = groups.get(d.command.owner_id) ?? [];
    if (members.length < 2 || members.every(m => decided.some(x => x.authorized && isDeepStrictEqual(x.command, m)))) return d;
    return { ...d, authorized: false, reason: "rejected_evidence_partial_group" as const, source: "rejected" as const };
  });
  // Incomplete proposal for a wholly established group: the narration established every offered item (one confirmation covering the
  // whole offer, or verified group evidence) but the controller proposed only part of it. Proposal-first forbids adding the missing
  // commands, so the group is withheld rather than committed partially. Partial acceptances narrated as partial are unaffected.
  return atomic.map(d => {
    if (!d.authorized || d.command.kind !== "transfer_item" || !d.command.owner_id) return d;
    const members = groups.get(d.command.owner_id) ?? [];
    if (members.length < 2) return d;
    const indexes = members.map(m => evidence.player_intents.findIndex(c => isDeepStrictEqual(c, m)));
    const whole = evidence.narrator_confirmations.some(c => indexes.every(i => c.command_indexes.includes(i))) || atomic.some(x => x.evidence?.verified && x.evidence.check === "receipt_of_offered_group" && members.some(m => isDeepStrictEqual(m, x.command)));
    const complete = members.every(m => atomic.some(x => x.authorized && isDeepStrictEqual(x.command, m)));
    return whole && !complete ? { ...d, authorized: false, reason: "rejected_incomplete_group_proposal" as const, source: "rejected" as const } : d;
  });
}
