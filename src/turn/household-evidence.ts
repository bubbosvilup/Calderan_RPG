import type { CampaignCommand, RelationshipDimension } from "../campaign/types.js";
import type { TurnContext } from "./context-builder.js";
import { dialogueFocused } from "./prompt-builder.js";
import { blankQuotes, escapeRegExp as esc, sentencesOf } from "./language/text.js";
import { GATES } from "./language/gates.js";
import type { EvidenceCheck } from "./evidence-check.js";

/**
 * Household Pass 1 evidence grammar.
 * - Household choices: a household join or departure is voluntary and belongs to the character. It is evidenced only by that
 *   character's own attributed dialogue expressing the choice ("I, Maren, decide to stay and become a member…", "I want to stay
 *   here. This is my home."). Nicco's words ("You can stay here tonight", "Welcome", "I bought you") never establish consent,
 *   and hedged, conditional or temporary phrasing ("for now", "tonight", "maybe") is not a choice.
 * - Household rules: only the player's own explicit rule declaration ("House rule: …", "Rule number 2: …") can become a rule.
 * - Relationship changes: a verbatim narration quote in which the character whose feeling changes (never Nicco) acts or speaks
 *   in a way matching the dimension and direction. The player's acts (buying, gifting, healing, "we are family") are not the
 *   other person's feelings and never qualify on their own.
 */
export interface HouseholdChoice { readonly character_id: string; readonly choice: "join" | "leave"; readonly source_sentence: string }
const JOIN = /\b(?:(?:decide|choose|want|wish|swear|vow)s? to (?:stay and (?:to )?)?(?:become|join)\b[^.!?]{0,50}\b(?:member|resident|household|family|heartstone)|(?:become|join) (?:a |the )?(?:member|resident)s? of\b|I want to stay here\b|this is my home\b|I choose (?:to stay|this (?:household|home|family))|I(?:'m| am) joining (?:the |this |your )?(?:household|family))/i;
const LEAVE = /\b(?:I(?:'m| am) leaving (?:the |this |your )?(?:household|family)|I (?:no longer|don't) want to be (?:a )?(?:member|part) of (?:the |this |your )?(?:household|family)|I renounce (?:my place|the household|this family))/i;
const NOT_A_CHOICE = GATES.household_not_a_choice;

export function detectHouseholdChoices(narration: string, context: TurnContext): readonly HouseholdChoice[] {
  const byName = new Map(context.characters.filter(c => c.id !== "nicco").map(c => [c.profile.name ?? c.id, c.id]));
  const out: HouseholdChoice[] = [];
  for (const line of dialogueFocused([{ player: "", narration, status: "finalized" }], context)[0]?.npc_dialogue ?? []) {
    const m = line.match(/^(.+?): "(.*)"$/s); if (!m) continue;
    const id = byName.get(m[1]!); if (!id) continue;
    for (const part of m[2]!.split(/(?<=[.!?])\s+/)) {
      const choice = JOIN.test(part) ? "join" : LEAVE.test(part) ? "leave" : undefined;
      if (!choice || NOT_A_CHOICE.test(part.replace(/\bnever (?:leave|abandon)\b/gi, " "))) continue;
      if (!out.some(o => o.character_id === id && o.choice === choice)) out.push({ character_id: id, choice, source_sentence: sentencesOf(narration).find(s => s.includes(part.slice(0, 40))) ?? part });
    }
  }
  return out;
}

const RULE = /(?:house(?:hold)? rule|new rule|the rule is|rule(?:\s+(?:number|no\.?|#))?\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))\s*[:–-]\s*(.+?)(?=\s*(?:house(?:hold)? rule|new rule|rule(?:\s+(?:number|no\.?|#))?\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))\s*[:–-]|\s*["”*]?\s*$)/gis;
/** The player's explicit rule declarations, in order. Ordinary requests ("don't steal my porridge") are not rules. */
export function extractRuleDeclarations(input: string): readonly string[] {
  return [...input.replace(/\*/g, " ").matchAll(RULE)].map(m => m[1]!.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "")).filter(t => t.length >= 3 && t.length <= 300);
}
const words = (s: string) => s.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
/** A proposed rule text matches a declaration when one contains the other or most content words agree. */
export function ruleMatchesDeclaration(text: string, declarations: readonly string[]): boolean {
  const a = text.toLowerCase().trim().replace(/[.!]+$/, "");
  return declarations.some(d => {
    const b = d.toLowerCase();
    if (a === b || a.includes(b) || b.includes(a)) return true;
    const wa = words(a), wb = new Set(words(b));
    return wa.length > 0 && wa.filter(w => wb.has(w)).length / wa.length >= 0.6;
  });
}

const FAMILIES: Readonly<Record<RelationshipDimension, { readonly raise?: RegExp; readonly lower?: RegExp }>> = {
  trust: { raise: /\b(?:I trust you|trusts? (?:him|her|them|you)|lets? (?:him|her|them) (?:help|hold|carry|touch|near)|accepts? (?:his|her|their) (?:hand|help|offer)|leans? on (?:him|her|them)|confides? in|tells? (?:him|her|them) (?:the truth|about (?:her|his|their) past|(?:her|his|their) (?:real )?name)|opens? up to)\b/i,
    lower: /\b(?:you lied|he lied|she lied|lied to (?:her|him|them|me)|betray\w*|deceiv\w*|broke (?:his|her|their|your) promise|I can'?t trust you)\b/i },
  wariness: { raise: /\b(?:flinch\w*|recoil\w*|backs? away|eyes? (?:him|her|them) warily|keeps? (?:her|his|their) distance|stiffens?|watches? (?:him|her|them) (?:carefully|warily))\b/i,
    lower: /\b(?:relax\w* (?:around|beside|near)|lets? (?:her|his|their) guard down|no longer flinch\w*)\b/i },
  affection: { raise: /\b(?:hugs?|hugged|embrac\w*|holds? (?:his|her|their) hand|leans? into|rests? (?:her|his|their) head on|I care about you|I love you|fond of)\b/i,
    lower: /\b(?:pulls? away from|shoves? (?:him|her|them) away|turns? (?:her|his|their) back on)\b/i },
  protectiveness: { raise: /\b(?:protect\w*|defend\w*|steps? (?:in front of|between)|shield\w*|stands? (?:guard over|between)|won'?t let (?:anyone|them|him|her) (?:hurt|touch))\b/i },
  respect: { raise: /\b(?:respect\w*|admir\w*|impressed by|bows? (?:her|his|their) head to|acknowledges? (?:his|her|their) (?:skill|competence|courage))\b/i },
  fear: { raise: /\b(?:afraid of|terrified of|trembl\w* (?:before|at|when)|cowers?|shrinks? (?:back|away) from)\b/i,
    lower: /\b(?:no longer afraid|not afraid of (?:him|her|them|you) anymore|stops? trembling)\b/i },
  hostility: { raise: /\b(?:strikes?|hits?|punch\w*|attacks?|spits? at|curses? (?:him|her|them)|threatens?|I hate you)\b/i,
    lower: /\b(?:forgiv\w*|apologi\w*|makes? peace|reconcil\w*)\b/i },
  romance: { raise: /\b(?:kiss\w*|I love you|confess\w* (?:her|his|their) (?:love|feelings))\b/i },
};
const HEDGED = GATES.relationship_hedged;

/** Relationship evidence: the quote's sentence is the feeling character's own act or speech, matching the dimension and direction. */
export function verifyRelationshipEvidence(command: Extract<CampaignCommand, { kind: "adjust_relationship" }>, quote: string | undefined, narration: string, context: TurnContext): EvidenceCheck {
  if (!quote || quote.trim().length < 8) return { verified: false, check: "no_quote" };
  const flat = narration.replace(/\s+/g, " "), q = quote.trim().replace(/\s+/g, " ");
  if (!flat.includes(q)) return { verified: false, check: "quote_not_verbatim" };
  const pattern = FAMILIES[command.dimension][command.direction];
  if (!pattern || !pattern.test(q)) return { verified: false, check: "quote_does_not_evidence_this_change" };
  const sentence = sentencesOf(narration).map(s => s.replace(/\s+/g, " ")).find(s => s.includes(q) || q.includes(s));
  if (!sentence || HEDGED.test(blankQuotes(sentence))) return { verified: false, check: "sentence_hedged_or_missing" };
  const names = (id: string) => { const n = context.characters.find(c => c.id === id)?.profile.name ?? id; return [n, ...n.split(/\s+/).filter(t => t.length > 2)]; };
  // The feeling character must be the actor: the sentence is led by their name (or a pronoun right after their named sentence),
  // or the quote is their attributed dialogue. Nicco leading the sentence never evidences another person's feeling.
  const lead = blankQuotes(sentence).trim();
  if (/^nicco\b/i.test(lead)) return { verified: false, check: "actor_is_nicco" };
  const fromLead = names(command.from_character_id).some(n => new RegExp(`^${esc(n)}(?:'s)?\\b`, "i").test(lead));
  const said = (dialogueFocused([{ player: "", narration, status: "finalized" }], context)[0]?.npc_dialogue ?? [])
    .some(line => names(command.from_character_id).some(n => line.startsWith(`${n}: "`)) && line.includes(q.replace(/^["“]|["”]$/g, "").slice(0, 30)));
  if (!fromLead && !said) return { verified: false, check: "actor_not_from_character" };
  const target = command.to_character_id === "nicco" ? ["Nicco", "him", "you"] : names(command.to_character_id);
  if (!target.some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(sentence)) && !/\b(?:him|her|them|you)\b/i.test(sentence)) return { verified: false, check: "target_not_referenced" };
  return { verified: true, check: `relationship_${command.dimension}_${command.direction}` };
}
