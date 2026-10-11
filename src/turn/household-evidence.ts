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
const JOIN = /\b(?:(?:decide[sd]?|chose|choose[sn]?|wants?|wish(?:es|ed)?|swears?|vows?|sworn|vowed) to (?:stay and (?:to )?)?(?:become|join)\b[^.!?]{0,50}\b(?:member|resident|household|family|heartstone)|(?:become|join) (?:a |the )?(?:member|resident)s? of\b|I want to stay here\b|this is my home\b|I choose (?:to stay|this (?:household|home|family))|I(?:'m| am) joining (?:the |this |your )?(?:household|family))/i;
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

/**
 * Heartstone household RITE (promotion event). A join into the household Nicco keeps is not a casual choice: it is the completed, accepted
 * rite. Narration evidence required for ONE candidate (all of it, in the draft the Controller saw):
 *   voluntary  the candidate's own unconditional oath/declaration (detectHouseholdChoices) and no coercion anywhere in a sentence about them;
 *   barefoot   a sentence about the candidate states bare feet / barefoot (the engine separately requires NO equipped footwear);
 *   stone      a sentence about the candidate puts bare feet, a palm or a hand directly on the stone (floor, wall, hearthstone);
 *   keeper     Nicco, the Keeper, accepts them in the narration (a narrated acceptance or Nicco's own accepting words), not negated.
 * Location inside Heartstone and absence of worn footwear are state facts checked by authorization. Nothing here mutates anything.
 */
export interface HouseholdRite { readonly character_id: string; readonly complete: boolean; readonly missing: readonly string[]; readonly source_sentence: string }
const COERCION = /\b(?:forc(?:e|es|ed|ing)|compel(?:s|led|ling)?|coerc\w*|against (?:her|his|their|its) will|unconscious|asleep|sedated|drugged|stupefied|enthrall\w*|bewitch\w*|mind[- ]control\w*|magical(?:ly)? (?:compulsion|compelled|bound)|under (?:a )?(?:compulsion|duress|a spell|the influence)|puts? words (?:in|into)|speaks? for (?:her|him|them)|made (?:her|him|them) (?:say|swear|speak)|threat\w*|at (?:knife|sword)point|bound and|gagged)\b/i;
const BAREFOOT = /\b(?:barefoot|bare[- ]?foot(?:ed)?|bare (?:feet|soles|foot)|shoeless|bootless|feet (?:are )?bare|soles? bare)\b/i;
const STONE_CONTACT = /\b(?:bare (?:feet|soles|foot)|barefoot|feet|soles?|palms?|hands?|fingers?|fingertips|forehead)\b[^.!?]{0,70}\b(?:on|against|upon|to|onto|flat on|pressed (?:to|against|on)|touch(?:es|ing)?|resting on)\b[^.!?]{0,40}\b(?:stone|flagstones?|hearthstone|stone (?:floor|wall|hearth)|tower(?:'s)? (?:floor|wall)|cold stone)\b/i;
const KEEPER_ACCEPT = [
  /\bNicco\b[^.!?]{0,80}\b(?:accepts?|accepted|welcomes?|welcomed|admits?|admitted|receives?|received|takes? (?:her|him|them) in|names? (?:her|him|them))\b/i,
  /\b(?:the )?Keeper\b[^.!?]{0,80}\b(?:accepts?|accepted|welcomes?|welcomed|admits?|admitted)\b/i,
  /\bNicco\b[^"“”]{0,60}["“][^"”]{0,140}\b(?:I accept|accepted|welcome (?:to|home|you)|you (?:are|belong)|one of us|this house accepts|the household accepts)\b/i,
];
const KEEPER_NEGATED = /\b(?:not|never|refus\w*|declin\w*|hesitat\w*|without|cannot|can't|won't|will not|doesn't|does not|didn't|did not|might|may|would|could)\b/i;
/** The candidate's own spoken lines (all of them, in order) from the draft. */
function speechOf(narration: string, context: TurnContext, id: string): string[] {
  const name = context.characters.find(c => c.id === id)?.profile.name ?? id;
  return (dialogueFocused([{ player: "", narration, status: "finalized" }], context)[0]?.npc_dialogue ?? []).flatMap(line => { const m = line.match(/^(.+?): "(.*)"$/s); return m && m[1] === name ? [m[2]!] : []; });
}
/**
 * The ESSENTIAL MEANINGS of the canonical oath, matched semantically over everything the candidate says (never byte equality). All five must be
 * present; vague affection ("I like it here", "you are like family", "I'll help you") has none of them and any hedge makes the whole speech an
 * ambiguous one (false negatives are preferred).
 */
const OATH_PARTS: readonly (readonly [string, RegExp])[] = [
  ["personal_choice", /\bI\b[^.!?]{0,60}\b(?:choose|chose|decide|decided|want to|wish to|swear|vow|pledge|will)\b/i],
  ["stay_and_join", /\b(?:stay|remain|join|become)\b[^.!?]{0,80}\b(?:heartstone|household|family|here|member|part)\b/i],
  ["family_membership", /\b(?:member|part|one)\s+of\b[^.!?]{0,40}\b(?:heartstone|household|family)\b|\bjoin\b[^.!?]{0,30}\b(?:heartstone|household|family)\b/i],
  ["protect_family", /\bprotect\b[^.!?]{0,50}\b(?:family|household|heartstone)\b|\b(?:family|household)\b[^.!?]{0,50}\bprotect/i],
  ["beside_keeper", /\b(?:stand|stay|walk|serve|follow|be)\b[^.!?]{0,40}\b(?:beside|by|alongside|with|behind|next to)\b[^.!?]{0,30}\b(?:the )?keeper\b|\b(?:loyal|faithful\w*|true)\b[^.!?]{0,60}\bkeeper\b|\bkeeper\b[^.!?]{0,40}\b(?:loyal|faithful\w*)\b/i],
];
const OATH_HEDGE = /\b(?:if|maybe|perhaps|might|may|could|would|someday|one day|for now|tonight|for a while|until|don'?t know|not sure|probably)\b|\?/i;
export function oathMissing(speech: readonly string[]): readonly string[] {
  const text = speech.join(" ").replace(/\s+/g, " ");
  if (!text.trim()) return ["oath"];
  const missing = OATH_PARTS.filter(([, r]) => !r.test(text)).map(([k]) => k);
  if (OATH_HEDGE.test(text.replace(/\bmay I\b/gi, " "))) missing.push("oath_hedged");
  return missing;
}
export function detectHouseholdRite(narration: string, context: TurnContext, choices: readonly HouseholdChoice[]): readonly HouseholdRite[] {
  const sentences = sentencesOf(narration.replace(/\s+/g, " "));
  // Candidates: anyone who voiced a join choice, plus any other present character whose own words go as far as swearing or choosing.
  const swearing = context.characters.filter(c => c.id !== "nicco" && speechOf(narration, context, c.id).some(l => /\b(?:swear|vow|pledge|choose|decide|stay|member of)\b/i.test(l))).map(c => c.id);
  const ids = [...new Set([...choices.filter(c => c.choice === "join").map(c => c.character_id), ...swearing])];
  return ids.map(id => {
    const name = context.characters.find(c => c.id === id)?.profile.name ?? id;
    const tokens = [name, ...name.split(/\s+/).filter(t => t.length > 2)].map(esc), named = new RegExp(`\\b(?:${tokens.join("|")})\\b`, "i");
    // Sentences about the candidate: those naming them, plus a pronoun-led sentence right after one that does.
    const about = sentences.filter((x, n) => named.test(x) || n > 0 && /^[*_\s]*(?:he|she|they|his|her|their)\b/i.test(x) && named.test(sentences[n - 1]!));
    const missing: string[] = [];
    if (about.some(x => COERCION.test(x)) || sentences.some(x => COERCION.test(x) && /\b(?:oath|rite|household|swear|vow)\b/i.test(x))) missing.push("voluntary");
    missing.push(...oathMissing(speechOf(narration, context, id)));
    if (!about.some(x => BAREFOOT.test(blankQuotes(x)) || BAREFOOT.test(x))) missing.push("barefoot");
    if (!about.some(x => STONE_CONTACT.test(blankQuotes(x)))) missing.push("stone_contact");
    // A spoken acceptance may follow its attribution in the next sentence ('Nicco nods. "I accept you as a member of the Heartstone."'): test singles and adjacent pairs.
    const acceptWindows = sentences.flatMap((x, n) => n > 0 ? [x, `${sentences[n - 1]} ${x}`] : [x]);
    if (!acceptWindows.some(x => KEEPER_ACCEPT.some(r => r.test(x)) && !KEEPER_NEGATED.test(blankQuotes(x).replace(/["“][^"”]*["”]/g, " ")))) missing.push("keeper_acceptance");
    const choice = choices.find(c => c.character_id === id && c.choice === "join");
    return { character_id: id, complete: missing.length === 0, missing, source_sentence: choice?.source_sentence ?? about[0] ?? "" };
  });
}
