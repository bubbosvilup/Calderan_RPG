import type { CampaignCommand, CampaignSnapshot, PremiumContractField } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { TurnContext } from "./context-builder.js";
import { activeNpcPlus, contractSet } from "../campaign/premium-characters.js";
import { narrationUnits, presentPeople } from "./narrated-captives.js";
import { sentencesOf } from "./language/text.js";
import { GATES } from "./language/gates.js";

/**
 * NPC+ Pass 2 — explicit stable contracts. A present ACTIVE NPC+ establishes a campaign contract only by an explicit, unhedged, quoted
 * FIRST-PERSON self-description attributed to them in the DELIVERED narration ("I will never hurt children.", "I always speak plainly.",
 * "I don't like crowds.", "I've always been stubborn."). Deterministic and conservative: false negatives over invented personality.
 *
 * Never a contract: behaviour ("she hesitates"), one reaction ("he shouts"), a situational promise ("I won't hurt you"), questions,
 * conditionals or hedges, another speaker's claim about them, narration's own voice, profession, species, appearance, interaction
 * counts, or any model guess. Authored canon is rendered from canon and never copied. Set-once fields are never rewritten: an already
 * established field is skipped (contradiction does not change it); moral boundaries accumulate.
 */
const VERB = "hurt|harm|kill|strike|beat|abuse|betray|steal from|lie to|abandon|sell|torture";
const OBJECT = "(?!(?:you|him|her|them|it|this|that|me|us)\\b)([a-z][a-z' -]{1,40})";
const PATTERNS: readonly (readonly [PremiumContractField, RegExp, (m: RegExpMatchArray) => string])[] = [
  ["moral_boundary", new RegExp(`^I(?:\\s+(?:will|would|shall)\\s+(?:never|not)|'d\\s+never|\\s+won'?t(?:\\s+ever)?|\\s+never)\\s+(${VERB})\\s+${OBJECT}$`, "i"), m => `never ${m[1]!.toLowerCase()} ${m[2]!.toLowerCase().trim()}`],
  ["voice", /^I\s+(?:always\s+)?speak\s+(plainly|frankly|bluntly|softly|quietly|honestly|my mind)$/i, m => `speaks ${m[1]!.toLowerCase()}`],
  ["voice", /^I\s+(?:don'?t|do not)\s+mince\s+words$/i, () => "speaks plainly"],
  ["social_style", /^I\s+(?:don'?t|do not|never)\s+(like|trust|care for)\s+(crowds|strangers|nobles|soldiers|mages|noise|company|people)$/i,
    m => `${m[1]!.toLowerCase() === "trust" ? "distrusts" : "dislikes"} ${m[2]!.toLowerCase()}`],
  ["personality", /^I(?:'ve|\s+have)\s+always\s+been\s+([a-z]+(?:,?\s+(?:and\s+)?[a-z]+)?)$/i, m => m[1]!.toLowerCase().replace(/,?\s+and\s+|,\s*/g, ", ")],
];
/** Contract commands for this turn's delivered narration (one per set-once field and character; no already-established field). */
export function contractCommands(narration: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>): readonly CampaignCommand[] {
  const active = activeNpcPlus(snapshot), present = new Set(context.characters.map(c => c.id).filter(id => active.has(id)));
  if (!present.size) return [];
  const out: Extract<CampaignCommand, { kind: "establish_character_contract" }>[] = [];
  for (const u of narrationUnits(narration, 0, presentPeople(context))) {
    if (!u.quoted || !u.speaker || !present.has(u.speaker)) continue;
    const premium = snapshot.premium_characters.find(p => p.character_id === u.speaker)!;
    for (const sentence of sentencesOf(u.text)) {
      const plain = sentence.trim().replace(/[.,!;:…]+$/, "");
      if (/\?/.test(sentence) || GATES.audit_hypothetical.test(plain.replace(/^I(?:'d|\s+would)\s+never\b/i, "")) || GATES.captive_fact_hedge.test(plain)) continue;
      for (const [field, re, render] of PATTERNS) {
        const m = plain.match(re);
        if (!m) continue;
        const text = render(m);
        if (contractSet(premium, field, text) || out.some(c => c.character_id === u.speaker && c.field === field && (field !== "moral_boundary" || c.text === text))) continue;
        out.push({ kind: "establish_character_contract", character_id: u.speaker, field, text, quote: sentence.trim().slice(0, 240) });
      }
    }
  }
  return out;
}
