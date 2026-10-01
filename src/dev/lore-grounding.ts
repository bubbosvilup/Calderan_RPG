import type { WorldStore } from "../world/world-store.js";
import { escapeRegExp } from "../turn/language/text.js";

/**
 * Phase 1Q dev/eval-only grounding manifest and lore-invention detector. Review-only: it never blocks, edits or patches
 * narration, canon or state, and production turns never call it.
 *
 * A phrase is grounded when it occurs in the narrator's supplied prompt (what the narrator was actually given this turn);
 * "canon, not supplied" when it occurs elsewhere in authored canon; otherwise it is a potential ungrounded canon-bearing claim.
 * Categories: institution/place phrases, unknown proper nouns, public rumor, schedules, routes, meta language.
 */
export type LoreCategory = "ungrounded_institution_or_place" | "unknown_proper_noun" | "public_rumor" | "schedule" | "route" | "meta_language" | "historical_claim" | "permanent_fixture";
/**
 * Phase 1R, review-only. Obvious persistent-history forms; personal experience ("I've never been inside") is not matched.
 * Regex cannot judge history semantically: false positives are expected and documented.
 */
const HISTORY = /[^.!?\n"“]*\b(?:(?:has|have|had)\s+been\s+\w+\s+(?:since|for)\b|(?:was|were)\s+(?:owned|built|founded|abandoned|sealed|shut|closed|empty)\s+(?:by|in|since|for|when|long|years|decades)|used\s+to\s+(?:belong|own|be\s+owned|house|be\s+home)|belong(?:s|ed)\s+to\s+the\s+(?:city|crown|duke|church|guild)|for\s+(?:years|decades|generations|ages)|since\s+(?:I\s+was\s+(?:a\s+)?(?:child|boy|girl|lad|lass|little|young)|before\s+I\s+was\s+born|my\s+(?:grand)?(?:mother|father)'?s?\s+(?:time|day))|(?:long\s+as|as\s+long\s+as)\s+(?:I|anyone)\s+(?:can\s+)?(?:recall|remember)|(?:my|his|her|their)\s+(?:grand)?(?:mother|father|mum|da|parents?)\s+(?:remembers?|remembered|said|told|too)|(?:empty|abandoned)\s+(?:since|for)\b)[^.!?\n"”]*/gi;
const FIXTURE = /\b((?:stone|wooden|iron|old|marble|carved)?\s*(?:drinking\s+)?(?:troughs?|fountains?|statues?|benches|bench|pavilions?|monuments?|wells?|obelisks?|pillories|stocks|gallows|market\s+stalls?))\b/gi;
export interface LoreFinding { readonly category: LoreCategory; readonly excerpt: string }
export interface GroundingInput {
  readonly narration: string; readonly prompt: string; readonly world: WorldStore;
  readonly retrieved_ids?: readonly string[]; readonly facts?: readonly { readonly id: string; readonly statement: string }[];
  readonly participants?: readonly { readonly id: string; readonly ref: string; readonly display_name: string; readonly descriptor?: string }[];
}
export interface GroundingManifest {
  readonly canon_entities_used: readonly string[]; readonly retrieved_canon_used: readonly string[]; readonly state_facts_used: readonly string[];
  readonly participant_facts_used: readonly string[]; readonly canon_not_supplied: readonly string[]; readonly ungrounded: readonly LoreFinding[];
}

const PLACE_NOUN = "temples?|wards?|guilds?|constabulary|workhouses?|barracks|gates?|markets?|quarters?|districts?|offices?|halls?|courts?|prisons?|jails?|gaols?|academy|academies|church(?:es)?|chapels?|shrines?|garrisons?|watch|bridges?|roads?|streets?|squares?|cathedrals?|monastery|monasteries|abbey|palaces?|towers?|harbou?rs?|docks?|inns?|taverns?";
/** Either-case first letter, so the pattern needs no "i" flag (which would let "the"/"three" pass as a proper-name modifier). */
const ci = (alternatives: string) => alternatives.split("|").map(a => `[${a[0]!.toUpperCase()}${a[0]!.toLowerCase()}]${a.slice(1)}`).join("|");
const MODIFIER = `(?!(?:The|A|An|That|This|These|Those|Your|My|His|Her|Their|Its|Our|Some|Any|Every|No|One|Two|Three)\\b)[A-Z][a-z'’-]+|${ci("old|new|lower|upper|main|city|royal|great|grand|high|eastern|western|northern|southern|east|west|north|south|central|public|local|holy|sacred|light|shadow")}`;
const PLACE = new RegExp(`\\b((?:${MODIFIER})\\s+(?:${ci(PLACE_NOUN)}))\\b`, "g");
const INVENTED_BARE = /\b(constabulary|constables?|workhouses?|sheriffs?|police|bailiffs?|watch-house|town watch|debtors'? prison)\b/gi;
const RUMOR = /[^.!?\n"“]*\b(?:rumou?rs?|rumou?red|people (?:say|said|talk|whisper)|everyone (?:knows|says|said)|some (?:say|said|claim)|folk (?:say|said)|word is|they say|heard (?:talk|tell)|it'?s said|is said to|talk is)\b[^.!?\n"”]*/gi;
const SCHEDULE = /[^.!?\n"“]*\b(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|twelfth|\d{1,2}(?:st|nd|rd|th)?)\s+(?:hour|bell)|o'?clock|(?:every|each)\s+(?:morning|evening|day|week|dawn|dusk|night|\w+day)|market[- ]days?|opens?\s+at|closes?\s+at|(?:hours?|days?)\s+after\s+(?:midday|noon|dawn|dusk)|auctions?\s+(?:start|begin|run|are held|happen|take place)\w*\s+(?:at|around|on|every|in the)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?)\b[^.!?\n"”]*/gi;
const ROUTE = /[^.!?\n"“]*\b(?:turn(?:s|ing)?\s+(?:left|right)|(?:\w+|two|three|four|five|a few|couple of)\s+(?:streets?|blocks?|turnings?)\s+(?:that way|this way|down|up|over|past|from here|along|west|east|north|south)|(?:follow|take)\s+the\s+(?:\w+\s+)?(?:road|way|street|lane|path|avenue)|(?:past|beside|behind|across from|next to)\s+the\s+(?:\w+\s+)?(?:fountain|statue|temple|church|inn|tavern|well|bridge|gate|shrine|mill|stall|arch))\b[^.!?\n"”]*/gi;
const META = /[^.!?\n"“]*\b(?:canon(?:ical)?|the state (?:does|says|establishes|shows)|(?:not |un)established|no (?:data|information) (?:is )?available|permissions?|transactions? to complete|no transaction|nothing (?:in (?:his|her|their) (?:manner|expression|face|bearing) )?suggests (?:he|she|they) (?:knows?|recogni[sz]es)|DO NOT USE|CAN USE|scene participant|conversation partner|retriev(?:ed|al))\b[^.!?\n"”]*/gi;
const STOP = new Set(["the", "and", "that", "this", "with", "from", "into", "have", "been", "were", "what", "your", "their", "there", "they", "them", "then", "than", "nicco", "came"]);
const words = (s: string) => s.toLowerCase().match(/[a-z]{4,}/g)?.filter(w => !STOP.has(w)) ?? [];
const contains = (hay: string, phrase: string) => new RegExp(`\\b${escapeRegExp(phrase.toLowerCase()).replace(/\s+/g, "\\s+")}\\b`).test(hay);

export function groundingManifest(input: GroundingInput): GroundingManifest {
  // Recent-conversation replay is continuity, not canon: an earlier invention echoed back must not ground itself.
  const { narration, world } = input, supplied = input.prompt.replace(/\[(?:RECENT|EARLIER) CONVERSATION[^\]]*\]\n[\s\S]*?(?=\n\n\[|$)/g, "").toLowerCase();
  const canonText = world.listEntities().map(e => [e.name, e.display_name, ...e.aliases, e.summary, e.content, ...("features" in e ? e.features.flatMap(f => [f.name, f.description]) : [])].join(" ")).join(" ").toLowerCase();
  const names = (e: { name: string; display_name: string; aliases: readonly string[] }) => [e.name, e.display_name, ...e.aliases].filter(n => n.length >= 4);
  const canon_entities_used = world.listEntities().filter(e => names(e).some(n => contains(narration.toLowerCase(), n))).map(e => e.id);
  const retrieved_canon_used = (input.retrieved_ids ?? []).filter(id => {
    const e = world.getEntity(id); if (!e) return false;
    const phrases = [...names(e), ...("features" in e ? e.features.map(f => f.name) : []), ...(e.content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) ?? [])];
    return phrases.some(p => contains(narration.toLowerCase(), p));
  });
  const state_facts_used = (input.facts ?? []).filter(f => { const w = words(f.statement); return w.length > 0 && w.filter(x => narration.toLowerCase().includes(x)).length / w.length >= 0.6; }).map(f => f.id);
  const participant_facts_used = (input.participants ?? []).filter(p => contains(narration.toLowerCase(), p.display_name) || (p.descriptor ? contains(narration.toLowerCase(), p.descriptor) : false)).map(p => p.ref);
  const ungrounded: LoreFinding[] = [], canon_not_supplied: string[] = [];
  const judge = (category: LoreCategory, phrase: string, excerpt = phrase) => {
    if (contains(supplied, phrase)) return;
    if (contains(canonText, phrase)) { canon_not_supplied.push(phrase); return; }
    if (!ungrounded.some(f => f.category === category && f.excerpt === excerpt.trim())) ungrounded.push({ category, excerpt: excerpt.trim() });
  };
  for (const m of narration.matchAll(PLACE)) judge("ungrounded_institution_or_place", m[1]!);
  for (const m of narration.matchAll(INVENTED_BARE)) judge("ungrounded_institution_or_place", m[1]!);
  // Mid-sentence capitalized words (not after sentence start or an opening quote) that no supplied or authored text contains.
  const known = new Set(["i", "nicco", ...(input.participants ?? []).flatMap(p => p.display_name.toLowerCase().split(/\s+/))]);
  for (const m of narration.matchAll(/(?<![.!?"“—:]\s*|^)(?<=[a-z,;'’]\s+)([A-Z][a-z'’]+(?:\s+[A-Z][a-z'’]+)*)/g)) {
    const phrase = m[1]!.replace(/['’](?:s|d|ve|ll|m|re)$/, "");
    if (!phrase.split(/\s+/).every(w => known.has(w.toLowerCase()))) judge("unknown_proper_noun", phrase);
  }
  // Fixed public fixtures imply scene architecture: flagged unless the supplied prompt already contains them.
  for (const m of narration.matchAll(FIXTURE)) judge("permanent_fixture", m[1]!.trim());
  for (const [category, pattern] of [["public_rumor", RUMOR], ["schedule", SCHEDULE], ["route", ROUTE], ["meta_language", META], ["historical_claim", HISTORY]] as const)
    for (const m of narration.matchAll(pattern)) { const e = m[0].trim(); if (!ungrounded.some(f => f.category === category && f.excerpt === e)) ungrounded.push({ category, excerpt: e }); }
  return { canon_entities_used, retrieved_canon_used, state_facts_used, participant_facts_used, canon_not_supplied: [...new Set(canon_not_supplied)], ungrounded };
}
