import type { TurnContext } from "../turn/context-builder.js";
import { hardCharacterConstraints } from "../turn/prompt-builder.js";
export interface NarrativeFinding { category: string; excerpt: string }
/** Development diagnostics for closed evaluation fixtures. Never authorizes or rewrites prose. */
export function checkNarrative(text: string, input: string, context: TurnContext, retrievedIds: readonly string[] = [], closedFixture = false): NarrativeFinding[] {
  const findings: NarrativeFinding[] = [];
  const check = (category: string, pattern: RegExp) => { const match = text.replace(/\\n/g, "\n").match(pattern); if (match) findings.push({ category, excerpt: match[0] }); };
  if (hardCharacterConstraints(context).some(c => /Gerome/i.test(c))) {
    check("silent_character_speaking", /Gerome(?:[^.!?\n]{0,45})\b(?:says|asks|replies|speaks|mutters|whispers|rumbles|answers)\b/i);
    check("silent_character_speaking", /["?][, ]*Gerome (?:says|asks|replies|answers)/i);
  }
  const boots = context.items.some(i => i.position.kind === "equipped" && i.position.character_id === "brenna" && i.position.slot === "feet");
  if (boots && !/remove|take.*off/i.test(input)) check("equipment_contradiction", /Brenna[^!?\n]{0,170}\b(?:barefoot|bare feet|puts on (?:her |the )?boots|receives (?:her |the )?boots)/i);
  check("speaker_label", /^(?:BRENNA|GEROME|MAREN|NICCO)\s*:/im);
  if (!/reaches?|walks?|says?|agrees?|attacks?|casts?|reveals?|go |give|tell/i.test(input)) check("player_deliberate_takeover", /\b(?:Nicco|You) (?:reaches?|walks?|says?|agrees?|attacks?|casts?|reveals?|decides? to|sat down|steps?|strides?|looked up)\b/i);
  if (retrievedIds.some(id => /ironbound/i.test(id))) check("retrieved_lore_denial", /(?:no|little|nothing|not any) (?:accessible |available |known |established )?(?:information|detail|lore)|(?:know|knows) nothing|nothing (?:is known|concrete)|no established[^.]{0,80}\blore/i);
  if (closedFixture) {
    // These are known omissions of this synthetic fixture, not universal forbidden nouns.
    check("unestablished_accessory", /Maren[^.!?\n]{0,50}\b(?:glasses|spectacles)\b/i);
    check("unestablished_object", /\b(?:axe|staff|cart|medical device|machinery|device|thermometer|cupboard|pouch)\b/i);
    check("unestablished_architecture", /\b(?:metal (?:walls?|chairs?)|obsidian floor|laboratory|steel chamber|marble floor)\b/i);
  }
  return findings;
}
/** Case-specific evidence that the reply engaged the actual player turn. Absence is a review prompt, not a grade. */
export type RelevanceSignal = { readonly label: string; readonly pattern: RegExp };
/**
 * Phase 1M bake-off diagnostics: the Phase 1L.1 checks plus narrow, grounded additions.
 * Candidate findings (suffix `_candidate`) always require human confirmation; regex cannot detect hallucination in general.
 */
export function checkBakeoff(text: string, input: string, context: TurnContext, retrievedIds: readonly string[] = [], relevance?: RelevanceSignal): NarrativeFinding[] {
  const findings = checkNarrative(text, input, context, retrievedIds, true);
  const check = (category: string, pattern: RegExp) => { const match = text.match(pattern); if (match) findings.push({ category, excerpt: match[0] }); };
  if (hardCharacterConstraints(context).some(c => /Gerome/i.test(c))) check("silent_character_speaking", /Gerome's (?:voice|words)\b|\b(?:says|said|asks|asked|replies|replied) Gerome\b/i);
  check("metadata_echo", /\[Status\]|\bMoney:\s*\d+\s*gold|\bHousehold:\s*\d|\[(?:ROLE|HARD RULES|CURRENT AUTHORITATIVE[A-Z ]*|CURRENT EQUIPMENT|HARD CHARACTER CONSTRAINTS|RETRIEVED CANON[^\]]*|UNESTABLISHED DETAILS|RECENT CONVERSATION[^\]]*|PLAYER ACTION[^\]]*|NARRATION TASK)\]|HISTORICAL CONVERSATION CONTEXT|\{\s*"\w+"\s*:|\b(?:pink_cotton|pink_fluffy|pink_shorts|brenna_boots|campaign_fact_\w+|test_room|test_hall|canonical_awareness|world_minute)\b|\bWorld minute:|\bPlayer mana:|\b(?:synthetic )?evaluation (?:fixture|world)\b/i);
  check("prompt_vocabulary_echo", /\b(?:canonical (?:constraints?|awareness)|hard (?:character )?constraints?|structured state|(?:is|are|remains?) unestablished|necessitates? establishment|knowledge edges?|player agency|narration task)\b/i);
  // Literal backslash-n escapes or a JSON object tail inside prose: the model emitted serialized text, not narration.
  check("serialization_artifact", /\\n|"\s*,\s*"\w+"\s*:|\}\s*$/);
  check("reasoning_leak", /<\/?think>|<\/?reasoning>/i);
  // Controlled-fixture diagnostic: a paragraph naming a present NPC with no knowledge edge together with a known fact's subject noun.
  for (const fact of context.facts) {
    const noun = fact.statement.toLowerCase().match(/\b(\w+) (?:is|are|was|were)\b/)?.[1];
    if (!noun) continue;
    for (const npc of context.characters.filter(c => c.id !== "nicco" && !context.knowledge.some(k => k.character_id === c.id && k.fact_id === fact.id))) {
      const paragraph = text.split(/\n+/).find(p => new RegExp(`\\b${npc.profile.name}\\b`, "i").test(p) && new RegExp(`\\b${noun}\\b`, "i").test(p));
      if (paragraph) findings.push({ category: "npc_knowledge_leak_candidate", excerpt: `${npc.profile.name}: ${paragraph.slice(0, 160)}` });
    }
  }
  check("secret_leak", /HIDDEN_SECRET_SENTINEL/);
  check("player_speech_candidate", /\b(?:Nicco|you)\s+(?:say|says|said|ask|asks|asked|reply|replies|replied|answer|answers|murmur|murmurs|whisper|whispers|add|adds|laugh|laughs)\b(?!\s+nothing)/i);
  // Only an explicit query about the retrieved entity makes an unused fact a finding; incidental retrieval (e.g. "magic") is not a lore question.
  if (retrievedIds.some(id => /ironbound/i.test(id)) && /ironbound/i.test(input) && !/\bsmith/i.test(text)) findings.push({ category: "retrieved_fact_unused_candidate", excerpt: "no mention of the supplied smiths fact" });
  if (relevance && !relevance.pattern.test(text)) findings.push({ category: "relevance_signal_absent_candidate", excerpt: `no ${relevance.label}` });
  if (/\b(?:I|I'm|I am) (?:sorry|unable|not able|not comfortable)\b[^.]{0,80}\b(?:continue|write|generate|assist|help|provide)\b|\bas an AI\b|\bcontent (?:policy|guidelines)\b|\bI can(?:'|no)t (?:continue|write|generate|help with|assist with|engage)\b/i.test(text)) findings.push({ category: "refusal_language_candidate", excerpt: text.match(/\b(?:I|I'm|I am) (?:sorry|unable|not able|not comfortable)[^.]{0,120}|as an AI[^.]{0,80}|content (?:policy|guidelines)[^.]{0,80}|I can(?:'|no)t (?:continue|write|generate|help with|assist with|engage)[^.]{0,80}/i)?.[0] ?? "refusal" });
  return findings;
}

/**
 * Phase 1P evaluation-only candidates (never used by production turns). Regex flags for manual review, not verdicts:
 * narrator-owned player mental state, invented routes/landmarks, invented rumor/public talk, and non-canon institutions.
 */
export const PLAYER_MENTAL_STATE = /\b(?:Nicco|he)\s+(?:now\s+)?(?:knows|realizes|realises|remembers|decides|suspects|understands|intends|wonders|thinks|feels)\b/i;
export function checkEphemeralAuthority(text: string): NarrativeFinding[] {
  const findings: NarrativeFinding[] = [];
  const check = (category: string, pattern: RegExp) => { const match = text.match(pattern); if (match) findings.push({ category, excerpt: match[0] }); };
  check("player_internal_state_candidate", /[^.!?\n]*\b(?:Nicco|he)\s+(?:now\s+)?(?:knows|realizes|realises|remembers|decides|suspects|understands|intends)\b[^.!?\n]*/i);
  check("invented_route_candidate", /[^.!?\n"“]*\b(?:\w+ streets? (?:that|this) way|turn (?:left|right)|(?:western|eastern|northern|southern|main|city) gate|main (?:way|road|street)|follow the \w+|past the \w+|(?:two|three|four|five) (?:streets|blocks|turns))\b[^.!?\n"”]*/i);
  check("rumor_or_public_talk_candidate", /[^.!?\n"“]*\b(?:rumou?rs?|everyone (?:knows|says)|people (?:say|talk|have heard)|word is|heard talk|folk say)\b[^.!?\n"”]*/i);
  check("non_canon_institution_candidate", /\b(?:Constabulary|constables?|workhouses?|sheriff|police|town watch|watch-house)\b/i);
  return findings;
}
