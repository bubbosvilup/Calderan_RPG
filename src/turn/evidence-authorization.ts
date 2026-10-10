import { EXPLICIT_GIFT, itemHolder, transferRecipient } from "../campaign/item-transfer.js";
import type { EvidenceCheck } from "./evidence-check.js";
import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { EVIDENCE_QUOTE_MAX } from "../llm/controller-schema.js";
import type { TurnContext } from "./context-builder.js";
import type { TurnEvidence } from "./turn-evidence.js";
import type { AuthorizationDiagnostic } from "./turn-types.js";
import { authorizeCommands, isLocationPlacement } from "./command-authorizer.js";
import { CONDITION_TERMS, isPhysicalCondition, type PhysicalCondition } from "./physical-interaction.js";
import { itemTerms } from "./item-reference.js";
import { narratedDepartures } from "./scene-departure.js";
import { detectHouseholdChoices, verifyRelationshipEvidence } from "./household-evidence.js";
import { GATES } from "./language/gates.js";
import { blankQuotes, escapeRegExp as esc, quotedSpans } from "./language/text.js";
import { numberWordValue } from "./language/numbers.js";

/**
 * Phase 1O evidence-backed authorization. A controller evidence quote is necessary for the evidence path and never sufficient:
 * the command must still equal a resolved player intent, pass the existing reference/state validity checks, and survive every
 * deterministic refusal/retraction veto from TurnEvidence. Evidence can only add recall where the grammar found no confirmation.
 * See docs/architecture/EVIDENCE_AUTHORIZATION.md.
 */
export type EvidenceMode = "shadow" | "hybrid";
export type { EvidenceCheck } from "./evidence-check.js";
const QUOTE_MIN = 8;
/** Titles never identify an absent owner by themselves ("Lord" alone is not Lord Pellan). */
const HONORIFIC = new Set(["lord", "lady", "sir", "dame", "duke", "duchess", "master", "mistress", "captain", "brother", "sister", "father", "mother", "the"]);
// Hedge, negation, hypothetical, modal/future, interruption and retraction markers anywhere in the containing sentence(s).
// Repair 1: a bare "back" no longer disqualifies ("takes the boots back", "accepts them back" are receipts). Retreats, handing an
// item back, instructions to someone else ("tells him to take them") and "instead" still do.
const DISQUALIFY = GATES.disqualify;
const RECEIPT = "takes?|took|taking|accepts?|accepted|accepting|receives?|received|receiving|gathers?|gathered|gathering|collects?|collected|collecting|picks? up|picked up|picking up|snatches?|snatched|steals?|stole|stolen|filches?|filched|reclaims?|reclaimed";
const COMMUNICATE = "tells?|told|telling|says?|said|saying|informs?|informed|informing|explains?|explained|explaining|states?|stated|stating|mentions?|mentioned|speaks?|spoke|speaking|reports?|reported|adds|added|replies|replied";
const STOP = new Set(["the", "a", "an", "is", "are", "was", "were", "of", "to", "and", "in", "on", "at", "it", "its", "that", "this", "has", "have", "been", "be"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(w => w && !STOP.has(w));

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
  const before = narration.slice(Math.max(0, at - 300), at).split(/(?<=[.!?]["”]?)\s+|\n+/).map(x => x.trim().replace(/^[*_"“(\s]+/, "")).filter(Boolean).reverse(); // Pass B: the narrator wraps action prose in *italic* markers
  for (const sentence of before) {
    const first = sentence.match(/^([A-Z][a-z]+)\b/)?.[1]?.toLowerCase();
    if (first && candidates.includes(first)) return first;
  }
  return undefined;
}

/** Deterministic, act-level verification of one controller evidence quote against the finalized narration. */
export function verifyEvidence(command: CampaignCommand, quote: string | undefined, rawNarration: string, context: TurnContext, intents: readonly CampaignCommand[], ownerNames?: (id: string) => readonly string[]): EvidenceCheck {
  if (quote === undefined) return { verified: false, check: "no_quote" };
  // Typographic whitespace only (paragraph breaks vs spaces): demonstrated necessary in the Phase 1O DeepSeek run. No semantic normalization.
  const narration = rawNarration.replace(/\s+/g, " ");
  const q = quote.trim().replace(/\s+/g, " ");
  if (q.length < QUOTE_MIN || q.length > EVIDENCE_QUOTE_MAX) return { verified: false, check: "quote_length" };
  const at = narration.indexOf(q);
  if (at < 0) return { verified: false, check: "quote_not_verbatim" };
  const [sStart, sEnd] = sentenceBounds(narration, at, q.length);
  // Hedges in the narrated sentence disqualify; hedges inside dialogue belong to the speaker and are checked separately for quoted /tell.
  // Repair 1: the idiom "a smile that doesn't reach her eyes" is not a negated act.
  const sentenceText = blankQuotes(narration.slice(sStart, sEnd)).replace(/\b(?:does not|doesn't|did not|didn't|never|not)\s+(?:quite\s+|fully\s+|ever\s+)?reach(?:es|ed)?\s+(?:her|his|their|the)\s+eyes\b/gi, " ");
  const negatedSentence = DISQUALIFY.test(sentenceText);
  // Inbound receipts scope negation to their own clause (below): "She doesn't wait for thanks as Nicco takes the boots."
  if (negatedSentence && !(command.kind === "transfer_item" && transferRecipient(command) === "nicco")) return { verified: false, check: "sentence_hedged_negated_or_hypothetical" };
  const people = context.characters.filter(c => c.id !== "nicco");
  // Multi-word names ("Sister Mereth") contribute each token, so their own words are never "another person".
  const names = (id: string) => [id, context.characters.find(c => c.id === id)?.profile.name].filter((n): n is string => !!n).map(n => n.toLowerCase()).flatMap(n => [n, ...n.split(/[\s_]+/).filter(t => t.length > 2)]);
  const allNames = ["nicco", ...people.flatMap(p => names(p.id))];
  const spans = quotedSpans(narration).filter(([s, e]) => at < e && at + q.length > s);
  // head: containing sentence from its start to the end of the quote, dialogue blanked, for subject resolution.
  const head = blankQuotes(narration.slice(sStart, at + q.length));
  const qOutside = blankQuotes(q);
  if (command.kind === "transfer_item" && /\b(?:fails?|failed|unsuccessful|attempts? to|attempted to|tries? to|tried to)\b/i.test(sentenceText))
    return { verified: false, check: "transfer_not_completed" };
  if (command.kind === "transfer_item" && command.mode === "gift"
    && !intents.some(i => i.kind === "transfer_item" && i.mode === "gift" && i.item_id === command.item_id && transferRecipient(i) === transferRecipient(command))
    && !EXPLICIT_GIFT.test(q)) return { verified: false, check: "gift_permanence_not_established" };
  /**
   * Does `subject` lead `verb` in head with no other named person in between? Any capitalized name in the gap other than the
   * allowed ones (recipient, Nicco) could be the real actor, present or not ("Brenna watches Maren take…"), so it disqualifies.
   */
  const leads = (subjects: readonly string[], verb: string, allowed: readonly string[]): { subject: string; at: number; end: number } | undefined => {
    const ok = new Set(["nicco", ...allowed.flatMap(names), ...allowed.flatMap(a => context.characters.find(c => c.id === a)?.profile.name?.split(/\s+/) ?? []).map(t => t.toLowerCase())]);
    for (const m of head.matchAll(new RegExp(`\\b(${subjects.map(esc).join("|")})\\b([^.!?;]{0,160}?)\\b(?:${verb})\\b`, "gi"))) {
      if (![...m[2]!.matchAll(/\b[A-Z][a-z]+\b/g)].some(w => !ok.has(w[0].toLowerCase()))) return { subject: m[1]!.toLowerCase(), at: sStart + m.index, end: sStart + m.index + m[0].length };
    }
    return undefined;
  };
  /** A pronoun resolves to the named subject of the nearest sentence before the pronoun's own sentence. */
  const pronounRefersTo = (position: number) => precedingNamedSubject(narration, sentenceBounds(narration, position, 1)[0], allNames);
  /** Capitalized words in the quote that are not sentence-initial and not the recipient or Nicco: possibly another person. */
  const strangerIn = (text: string, recipient: string, object?: ReadonlySet<string>) => {
    const ok = new Set(["nicco", ...names(recipient)]);
    return [...text.matchAll(/\b[A-Z][a-z]+\b/g)].some(w => !ok.has(w[0].toLowerCase()) && !object?.has(w[0].toLowerCase()) && !/(?:^|[.!?]["”]?\s+|["“(]\s*)$/.test(text.slice(0, w.index)));
  };
  /**
   * Pass B: a capitalized word that is part of the NAME of the item under evidence ("Sword", "Cellar key") is the object, not a possible
   * actor. Never exempts a word that is also a present character's name; named people are still caught by the name checks below.
   */
  const objectWords = (itemId: string): ReadonlySet<string> => new Set(words([...context.items, ...(context.items_here ?? [])].find(i => i.id === itemId)?.name ?? "").filter(w => w.length >= 3 && !allNames.includes(w)));

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

  if (command.kind === "transfer_item" && transferRecipient(command) !== "nicco") {
    const held = context.items.find(i => i.id === command.item_id), giver = held && itemHolder(held), recipient = transferRecipient(command);
    if (held && giver && giver !== "nicco" && recipient) {
      // NPC-to-NPC uses the same physical act: no per-character-class transfer implementation.
      const noun = itemTerms(held, context.items);
      if (!new RegExp(`\\b(?:${noun})\\b`, "i").test(qOutside)) return { verified: false, check: "offered_item_not_referenced" };
      const give = "gives?|gave|hands?|handed|passes?|passed|lends?|lent|returns?|returned";
      const receipt = leads(names(recipient), RECEIPT, [giver, recipient]);
      const handover = leads(names(giver), give, [giver, recipient]);
      const toRecipient = names(recipient).some(n => new RegExp(`\\b(?:to|into) (?:${esc(n)})(?:'s)?\\b`, "i").test(qOutside))
        || names(recipient).some(n => new RegExp(`\\b(?:${give}) ${esc(n)}\\b`, "i").test(qOutside));
      return receipt || handover && toRecipient ? { verified: true, check: "character_to_character_receipt" } : { verified: false, check: "no_handover_or_receipt" };
    }
  }
  if (command.kind === "transfer_item" && transferRecipient(command) === "nicco") {
    // Repair 1 inbound: the holder hands the item to Nicco, or Nicco takes/accepts it. Nobody else may be named in the quote.
    const held = context.items.find(i => i.id === command.item_id);
    const giver = held && (held.position.kind === "carried" || held.position.kind === "equipped") ? held.position.character_id : undefined;
    if (!giver || giver === "nicco") return { verified: false, check: "no_giver" };
    if (strangerIn(q, giver, objectWords(command.item_id)) || people.some(p => p.id !== giver && names(p.id).some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(q)))) return { verified: false, check: "other_character_in_quote" };
    // Repair 1.1: the item's head noun, or a category word unique to it among items in the scene ("footwear").
    const noun = itemTerms(held!, context.items);
    if (!new RegExp(`\\b(?:${noun}|them|it|the pair)\\b`, "i").test(qOutside)) return { verified: false, check: "offered_item_not_referenced" };
    const give = "gives?|gave|giving|hands?|handed|handing|passes?|passed|passing|presses?|pressed|pressing|shoves?|shoved|shoving|tosses?|tossed|tossing|places?|placed|placing|puts?|putting|drops?|dropped|dropping|slides?|slid|sliding|thrusts?|thrusting|returns?|returned|returning|lends?|lent|lending";
    // Negation is scoped to the clause carrying the act when the sentence negates something else; any refusal word still vetoes.
    const clauseClean = (absolute: number) => {
      if (!negatedSentence) return true;
      if (GATES.refusal.test(sentenceText)) return false;
      const rel = absolute - sStart, cuts = [...sentenceText.matchAll(/,|;|\s(?:as|while|when|and|but)\s/gi)].map(m => m.index);
      const from = Math.max(0, ...cuts.filter(c => c < rel)), to = Math.min(sentenceText.length, ...cuts.filter(c => c > rel));
      return !DISQUALIFY.test(sentenceText.slice(from, to).replace(/^[,;]/, ""));
    };
    // "Does not release them until Nicco's hands close around the leather": a completed handover idiom.
    if (/\b(?:does|did) not (?:release|let go of|let go)\b[^.!?]{0,40}?\buntil (?:nicco's|his) hands? (?:close|closes|closed|grip|grips|gripped|take|takes|took|settle|settles|settled)\b/i.test(sentenceText) && leads([...names(giver), "she", "he"], "does|did", [giver]))
      return { verified: true, check: "handover_release_until" };
    const byGiver = leads([...names(giver), "she", "he"], give, [giver]);
    // A completed handover reaches Nicco ("to Nicco", "into his hands", "hands them over", "gives him the boots"); "toward Nicco" does not.
    const after = head.slice(byGiver ? byGiver.end - sStart : 0);
    if (byGiver && clauseClean(byGiver.end - 1) && (!["she", "he"].includes(byGiver.subject) || names(giver).includes(pronounRefersTo(byGiver.at) ?? "")) && (/\b(?:to (?:nicco|him)\b|into (?:nicco's|nicco|his) (?:hands?|arms|grasp|grip|palms?)|(?:nicco's|his) (?:hands?|grasp|grip)\b|over\b)/i.test(after) || /^\s*(?:nicco(?!['\u2019]s\b)|him)\b/i.test(after))) return { verified: true, check: "handover_to_nicco" };
    // Item-subject handover: "The boots pass into Nicco's hands."
    const passes = new RegExp(`\\b(?:${noun}|pair|them)\\b (?:(?:are|is|were|was|get|gets|got) )?(?:pass(?:es)?|passed|go|goes|went|change hands|changed hands|transfers?|transferred)\\b[^,;]*\\b(?:to|into) (?:nicco|nicco's|his)\\b`, "i").exec(qOutside);
    if (passes && clauseClean(at + passes.index)) return { verified: true, check: "item_passes_to_nicco" };
    // A pronoun is Nicco when it resolves to him, or when its gender excludes the giver and only Nicco and the giver are present.
    const giverPronoun = context.characters.find(c => c.id === giver)?.pronoun;
    const pronounIsNicco = (subject: string, position: number) => pronounRefersTo(position) === "nicco" || !!giverPronoun && subject !== giverPronoun && people.length === 1;
    const byNicco = leads(["nicco"], RECEIPT, [giver]) ?? leads(["he", "she"], RECEIPT, [giver]);
    if (byNicco && clauseClean(byNicco.end - 1) && (byNicco.subject === "nicco" || pronounIsNicco(byNicco.subject, byNicco.at))) return { verified: true, check: "receipt_by_nicco" };
    return { verified: false, check: negatedSentence ? "sentence_hedged_negated_or_hypothetical" : "no_handover_or_receipt" };
  }

  if (command.kind === "set_condition") {
    const target = command.character_id;
    const current = context.characters.find(c => c.id === target)?.current.conditions ?? [];
    const added = command.conditions.filter(c => !current.includes(c));
    if (!added.length || !added.every(isPhysicalCondition)) return { verified: false, check: "condition_not_in_vocabulary" };
    // The containing sentence must be about the character (name, or a pronoun resolving to it) and carry every added tag's term.
    const sentence = blankQuotes(narration.slice(sStart, sEnd));
    const aboutTarget = names(target).some(n => new RegExp(`\\b${esc(n)}(?:'s)?\\b`, "i").test(sentence)) || /^\s*(?:his|her|she|he)\b/i.test(sentence) && names(target).includes(pronounRefersTo(sStart) ?? "");
    if (!aboutTarget) return { verified: false, check: "condition_subject_not_character" };
    if (!added.every(tag => CONDITION_TERMS[tag as PhysicalCondition].test(sentence))) return { verified: false, check: "condition_term_missing" };
    return { verified: true, check: "physical_condition_narrated" };
  }

  if (command.kind === "place_item" && (command.position.kind === "stored" || context.items_here?.some(i => i.id === command.item_id))) {
    // Permanent Inventory V1: putting an existing item down here / picking it up. The verbatim, unhedged quote must name that item
    // (one distinctive word of its name). Whether the act happened is the controller's semantic reading; no verb grammar here.
    const target = [...context.items, ...(context.items_here ?? [])].find(i => i.id === command.item_id);
    const nameWords = words(target?.name ?? "").filter(w => w.length >= 3);
    return nameWords.some(w => new RegExp(`\\b${esc(w)}(?:e?s)?\\b`, "i").test(q)) ? { verified: true, check: "placed_item_named" } : { verified: false, check: "placed_item_not_named" };
  }
  if (command.kind === "create_item") {
    // Item Domain V1: the verbatim, unhedged quote must name the object (one distinctive word of the proposed name). Whether the
    // object needs persistent identity is the controller's semantic decision; there is deliberately no verb grammar here.
    const nameWords = words(command.name).filter(w => w.length >= 3);
    const named = nameWords.some(w => new RegExp(`\\b${esc(w)}(?:e?s)?\\b`, "i").test(q));
    if (!named) return { verified: false, check: "materialized_object_not_named" };
    // Ownership need not be physically present, but an ABSENT owner is never inferred: the quoted sentence must name them
    // ("Lord Pellan's signet ring"), so "a signet ring lies on the desk" cannot assign Pellan. Present owners are unchanged.
    if (typeof command.owner_id === "string" && !context.characters.some(c => c.id === command.owner_id)) {
      const tokens = (ownerNames?.(command.owner_id) ?? []).flatMap(n => n.split(/[\s_]+/)).map(t => t.toLowerCase()).filter(t => t.length >= 3 && !HONORIFIC.has(t));
      const sentence = narration.slice(sStart, sEnd);
      if (!tokens.some(t => new RegExp(`\\b${esc(t)}(?:['’]s)?\\b`, "i").test(sentence))) return { verified: false, check: "absent_owner_not_named" };
      return { verified: true, check: "materialized_object_named_absent_owner_named" };
    }
    return { verified: true, check: "materialized_object_named" };
  }
  if (command.kind === "adjust_relationship") return verifyRelationshipEvidence(command, quote, rawNarration, context);
  if (command.kind === "join_household" || command.kind === "leave_household") {
    const choice = command.kind === "join_household" ? "join" : "leave";
    const found = detectHouseholdChoices(rawNarration, context).find(c => c.character_id === command.character_id && c.choice === choice);
    return found && found.source_sentence.replace(/\s+/g, " ").includes(q) ? { verified: true, check: `household_${choice}_voiced` } : { verified: false, check: "no_voiced_household_choice" };
  }
  if (command.kind === "leave_scene") {
    // The quote must lie within a sentence the deterministic departure grammar reads as this character's completed exit.
    const departed = narratedDepartures(narration.slice(sStart, sEnd), context, "persistent").some(d => d.character_id === command.character_id) || narratedDepartures(narration, context, "persistent").some(d => d.character_id === command.character_id && d.source_sentence.replace(/\s+/g, " ").includes(q));
    return departed ? { verified: true, check: "departure_narrated" } : { verified: false, check: "no_completed_departure" };
  }

  if (command.kind === "transfer_item") {
    const recipient = transferRecipient(command);
    if (!recipient) return { verified: false, check: "no_recipient" };
    if (strangerIn(q, recipient, objectWords(command.item_id)) || people.some(p => p.id !== recipient && names(p.id).some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(q)))) return { verified: false, check: "other_character_in_quote" };
    const offered = intents.flatMap(i => i.kind === "transfer_item" && transferRecipient(i) === recipient ? [i.item_id] : []);
    const itemName = (id: string) => (context.items.find(i => i.id === id)?.name ?? id).toLowerCase();
    // Pass C receipt corpus: two bounded constructions that establish a change of possession only when Nicco is the current holder. Bare
    // "grips"/"touches"/"fingers close around the hilt" stay unproven (already-held or merely touching); see docs/evaluations/EXISTING_SUBSYSTEM_HARDENING.md.
    const heldItem = context.items.find(i => i.id === command.item_id), holds = heldItem?.position.kind === "carried" && heldItem.position.character_id === "nicco";
    const NICCO_SOURCED = "(?:lifts?|lifted|plucks?|plucked|pulls?|pulled|draws?|drew)(?=[^.!?;]{0,60}?\\bfrom (?:nicco's|his)\\s+(?:hand|hands|grasp|grip|fingers|palm)\\b)"
      + "|(?:closes?|closed|curls?|curled|wraps?|wrapped)\\s+(?:her|his|their)\\s+(?:fingers|hands?)\\s+(?:around|over)(?=[^.!?;]{0,80}?\\b(?:offered|extended|held out|proffered)\\s+(?:by|from)\\s+(?:nicco|him)\\b)";
    // Receipt is narrated, never spoken: the act and the item reference are read with dialogue blanked.
    const act = `${RECEIPT}|(?:extends?|extended|holds? out|held out|reach(?:es|ed|ing)? out(?: and)?)(?:[\\s,]+[a-z']+){0,3}?[\\s,]+(?:to )?(?:take|takes|took|accept|accepts|accepted)` + (holds ? `|${NICCO_SOURCED}` : "");
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
    // A bare anaphor ("them") refers back to what its clause names. When the clause explicitly names an item outside this offer
    // ("Brenna takes the boots … sets them by her chair", checked as a hypothetical ring offer), "them" is that item, not the offer,
    // and must not verify a phantom transfer. Explicit counts and collective nouns keep their existing meaning.
    const anaphor = !!group && /^(?:them|all of them)$/.test(group[0]);
    const namesOtherItem = anaphor && context.items.some(it => !offered.includes(it.id) && new RegExp(`\\b(?:${itemTerms(it, context.items)})\\b`, "i").test(ref));
    if (group && !namesOtherItem) {
      const count = group[1] ?? group[2] ?? (group[0] === "both" ? "two" : undefined);
      if (!count || numberWordValue(count) === offered.length) return { verified: true, check: "receipt_of_offered_group" };
    }
    // Otherwise this item must be referenced by a token unique to it among the offered items (sequential lists allowed).
    const own = words(itemName(command.item_id)), others = offered.filter(id => id !== command.item_id).flatMap(id => words(itemName(id)));
    const unique = own.filter(w => !others.includes(w));
    const self = context.items.find(i => i.id === command.item_id);
    const category = self ? itemTerms(self, context.items).split("|").slice(1) : [];
    const referenced = (unique.length ? unique.some(w => new RegExp(`\\b${esc(w)}\\b`, "i").test(ref)) : ref.toLowerCase().includes(itemName(command.item_id)))
      || category.some(w => new RegExp(`\\b${w}\\b`, "i").test(ref)); // Repair 1.1: unique category word ("the footwear")
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
  context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, mode: EvidenceMode, world?: WorldStore): readonly AuthorizationDiagnostic[] {
  const grammar = authorizeCommands(proposal, evidence, context, snapshot, world);
  // Item Domain V1: display names of a possibly absent owner (authored canon, or a campaign character's established name).
  const ownerNames = (id: string): readonly string[] => { const e = world?.getEntity(id); const c = snapshot.characters.find(x => x.id === id);
    return [...(e?.type === "character" ? [e.name, ...e.aliases] : []), ...(c?.profile.name ? [c.profile.name] : []), ...(world ? [] : [id])]; };
  const decided = grammar.map((g, i): AuthorizationDiagnostic => {
    const command = proposal[i]!, quote = quotes?.[i];
    const ev = verifyEvidence(command, quote, narration, context, evidence.player_intents, ownerNames);
    const base = { command, grammar: { authorized: g.authorized, reason: g.reason }, evidence: { quote: quote ?? null, verified: ev.verified, check: ev.check } };
    if (g.authorized) return { ...base, authorized: true, reason: g.reason, source: ev.verified ? "both" : "grammar" };
    // Repair 1: conditions have no grammar path. Validity was already checked by authorizeCommands; verified evidence completes it.
    if (command.kind === "transfer_item" || command.kind === "create_item" || isLocationPlacement(command, snapshot) || command.kind === "set_condition" || command.kind === "leave_scene" || command.kind === "adjust_relationship" || command.kind === "join_household" || command.kind === "leave_household") return mode === "hybrid" && ev.verified && g.reason === "rejected_insufficient_confirmation" ? { ...base, authorized: true, reason: "authorized_controller_evidence", source: "evidence" } : { ...base, authorized: false, reason: g.reason, source: "rejected" };
    if (mode === "hybrid" && ev.verified && MISSING_CONFIRMATION.has(g.reason)) {
      const index = evidence.player_intents.findIndex(c => isDeepStrictEqual(c, command));
      const kind = command.kind === "set_knowledge" ? "was_told_fact" as const : "accepted_transfer" as const;
      const withQuote = { ...evidence, narrator_confirmations: [...evidence.narrator_confirmations, { kind, command_indexes: [index], collective: false, source_sentence: quote! }] };
      const d = authorizeCommands([command], withQuote, context, snapshot, world)[0]!;
      if (d.authorized) return { ...base, authorized: true, reason: "authorized_controller_evidence", source: "evidence" };
      return { ...base, authorized: false, reason: d.reason, source: "rejected" };
    }
    return { ...base, authorized: false, reason: g.reason, source: "rejected" };
  });
  // Atomic offered group: evidence may not produce a partial commit of one offer. If the evidence path authorized part of a
  // multi-item offer to one recipient but not all of it, the evidence-sourced part is withdrawn (grammar-sourced decisions stand).
  const groups = new Map<string, CampaignCommand[]>();
  for (const c of evidence.player_intents) if (c.kind === "transfer_item" && transferRecipient(c)) groups.set(transferRecipient(c)!, [...(groups.get(transferRecipient(c)!) ?? []), c]);
  const atomic = decided.map(d => {
    if (d.source !== "evidence" || d.command.kind !== "transfer_item" || !transferRecipient(d.command)) return d;
    const members = groups.get(transferRecipient(d.command)!) ?? [];
    if (members.length < 2 || members.every(m => decided.some(x => x.authorized && isDeepStrictEqual(x.command, m)))) return d;
    return { ...d, authorized: false, reason: "rejected_evidence_partial_group" as const, source: "rejected" as const };
  });
  // Incomplete proposal for a wholly established group: the narration established every offered item (one confirmation covering the
  // whole offer, or verified group evidence) but the controller proposed only part of it. Proposal-first forbids adding the missing
  // commands, so the group is withheld rather than committed partially. Partial acceptances narrated as partial are unaffected.
  return atomic.map(d => {
    if (!d.authorized || d.command.kind !== "transfer_item" || !transferRecipient(d.command)) return d;
    const members = groups.get(transferRecipient(d.command)!) ?? [];
    if (members.length < 2) return d;
    const indexes = members.map(m => evidence.player_intents.findIndex(c => isDeepStrictEqual(c, m)));
    const whole = evidence.narrator_confirmations.some(c => indexes.every(i => c.command_indexes.includes(i))) || atomic.some(x => x.evidence?.verified && x.evidence.check === "receipt_of_offered_group" && members.some(m => isDeepStrictEqual(m, x.command)));
    const complete = members.every(m => atomic.some(x => x.authorized && isDeepStrictEqual(x.command, m)));
    return whole && !complete ? { ...d, authorized: false, reason: "rejected_incomplete_group_proposal" as const, source: "rejected" as const } : d;
  });
}
