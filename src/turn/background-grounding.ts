import type { WorldStore } from "../world/world-store.js";
import type { WorldEntity as RawEntity } from "../types/entities.js";
import type { DeepReadonly } from "../types/readonly.js";
type WorldEntity = DeepReadonly<RawEntity>;
import type { TurnContext } from "./context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { SceneParticipantPlan } from "./scene-participants.js";
import { PERSON_NOUNS } from "./narrated-captives.js";

/**
 * Ephemeral Background Grounding V1. A person the narrator improvises (a captive, a passer-by) has no authored background; it
 * emerges in play, one fact at a time. This module does three deterministic things and never decides a background:
 *  1. backgroundNeed: does this turn ask for a background fact about someone other than Nicco (origin, earlier life, how they were
 *     enslaved, family/home)? Ordinary looking, clothing or injury questions do not.
 *  2. backgroundGrounding: a compact block of canon POSSIBILITIES (named places that exist, regional and slave-source canon, peoples
 *     relevant to the species in play, already-established background as authority). Nothing is assigned to anyone.
 *  3. classifyBackgroundClaim: a narrow proper-name check of one background sentence against WorldStore names, so an invented
 *     named place ("the Marches") is never frozen into a durable character's background.
 * WorldStore stays world truth; a character's background is campaign truth only once established in play and verified.
 */
export type BackgroundTopic = "origin" | "prior_life" | "enslavement" | "family_home";
/** Auditable question classes. All address another person (you/she/he/they), so Nicco's own past never triggers grounding. */
const TOPICS: readonly (readonly [BackgroundTopic, RegExp])[] = [
  ["origin", /\bwhere\b(?:(?!\b(?:i|we)\b)[^.?!]){0,40}?\b(?:from|born|grow(?:s|n)? up|grew up|raised|hail)\b|\b(?:your|her|his|their) (?:homeland|home ?town|home village|village|people|origins?|birthplace)\b|\bwhere(?:'s| is| was) (?:your|her|his|their) home\b/i],
  ["prior_life", /\bwhat (?:did|do|were|was) (?:you|she|he|they) (?:do|doing|work)\b|\bwhat (?:you|she|he|they) (?:did|used to do|were doing|was doing)\b|\bbefore (?:you|she|he|they) (?:ended up|came|got|were|was|became)\b|\bbefore (?:this|that|all this|you were|she was|he was|they were|being|the (?:market|cage|pens?|chains|auction))\b|\b(?:your|her|his|their) (?:old |former |previous |past )?(?:life|trade|work|job|occupation|craft|profession)\b|\bused to (?:do|work|be)\b/i],
  ["enslavement", /\bhow (?:did|do|were|was|come) (?:you|she|he|they)\b[^.?!]{0,40}?\b(?:end up|get|got|come|came|become|became|wind up|wound up|here|enslaved|captured|sold|taken)\b|\b(?:why|how)\b[^.?!]{0,40}?\b(?:enslaved|captured|sold|taken|in chains|in (?:the |that |this )?(?:cage|pens?))\b|\bwho (?:sold|captured|took|enslaved)\b/i],
  ["family_home", /\b(?:your|her|his|their) (?:family|parents|mother|father|kin|siblings?|brothers?|sisters?|children|husband|wife|home)\b|\bany(?:one| family)\b[^.?!]{0,20}\b(?:waiting|left|back home)\b/i],
];
export function backgroundTopics(input: string): BackgroundTopic[] { return TOPICS.filter(([, r]) => r.test(input)).map(([t]) => t); }
const PERSON_IN_NARRATION = new RegExp(`\\b(?:${PERSON_NOUNS})s?\\b`, "i");
/** A topic is asked AND there is someone it can be about: a present non-player character, a scene participant, or a person in the latest narration. */
export function backgroundNeed(input: string, context: TurnContext, recent: readonly RecentExchange[], scene?: Pick<SceneParticipantPlan, "participants">): BackgroundTopic[] {
  const topics = backgroundTopics(input);
  if (!topics.length) return [];
  const someone = context.characters.some(c => c.id !== "nicco") || !!scene?.participants.length || PERSON_IN_NARRATION.test(recent.at(-1)?.narration ?? "");
  return someone ? topics : [];
}

const SPECIES_WORDS: readonly (readonly [string, RegExp])[] = [
  ["elves", /\b(?:elf|elves|elven|half-elf|pointed ears)\b/i], ["dwarves", /\b(?:dwarf|dwarves|dwarven)\b/i],
  ["beastfolk", /\b(?:beastfolk|beast-folk|furred|tail|muzzle|feline|canine|vulpine|lupine)\b/i], ["humans", /\bhuman\b/i],
];
const firstSentence = (text: string, max = 170) => { const s = text.replace(/\s+/g, " ").trim().split(/(?<=[.;])\s/)[0] ?? ""; return s.length > max ? `${s.slice(0, max - 1)}…` : s; };
const sentencesMatching = (text: string, pattern: RegExp, max = 2) => text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(s => pattern.test(s)).slice(0, max);
/** Grounding reads PUBLIC canon only (narrator- and player-visible); restricted and sealed canon never enter the block. */
const isPublic = (e: WorldEntity) => !!e.knowledge?.visibility.narrator && e.knowledge.visibility.player;
const provisional = (e: Pick<WorldEntity, "display_name">) => /provisional/i.test(e.display_name);
/** How a place may be named: provisional placeholders are described, never offered as proper names. */
const placeLabel = (e: WorldEntity) => provisional(e) ? `${e.name.toLowerCase()} (descriptive label; proper name not established)` : e.name;

export interface BackgroundGrounding { readonly topics: readonly BackgroundTopic[]; readonly block: string; readonly entity_ids: readonly string[] }
/**
 * Deterministic background canon for this turn, or undefined when no background fact is being asked for. Sources: the scene's own
 * location ancestry (slave-source categories), West slavery canon, every named settlement/region under the continent (names only,
 * so no place is privileged), one-line notes for the scene nation and slave-flow places, and peoples canon for species in play.
 */
export function backgroundGrounding(world: WorldStore, context: TurnContext, input: string, recent: readonly RecentExchange[], scene?: Pick<SceneParticipantPlan, "participants">): BackgroundGrounding | undefined {
  const topics = backgroundNeed(input, context, recent, scene);
  if (!topics.length) return undefined;
  const ids = new Set<string>(), get = (id: string) => { const e = world.hasEntity(id) ? world.getEntity(id) : undefined; if (e && isPublic(e)) { ids.add(id); return e; } return undefined; };
  const lines: string[] = [];
  // 1. Established background is authority, listed first.
  const established = context.characters.filter(c => c.id !== "nicco" && c.established_origin?.background?.length)
    .map(c => `- ${c.established_origin!.label}: ${c.established_origin!.background!.join(" | ")}`);
  if (established.length) lines.push("Already established (authoritative; never offer alternatives to these):", ...established);
  // 2. Scene: the nation the scene is in and the location's own source canon (e.g. the slave market's possible sources).
  const ancestry = context.primary.scene.location_ancestry.map(a => a.id), here = context.primary.scene.player_location?.id;
  const nation = ancestry.find(id => ["west", "center", "east"].includes(id));
  const sourceSentence = [here, ...ancestry].flatMap(id => id ? sentencesMatching(get(id)?.content ?? "", /\bsources? (?:may )?include\b/i, 1) : []).at(0);
  if (sourceSentence) lines.push(`Possible sources of enslaved people here (no dominant origin): ${sourceSentence.replace(/^No dominant origin or percentages:\s*/i, "")}`);
  const slavery = topics.some(t => t === "enslavement" || t === "origin") || scene?.participants.some(p => p.role === "slave") ? get("west_slavery") : undefined;
  if (slavery) lines.push(`Slavery canon: ${firstSentence(slavery.summary)} ${sentencesMatching(slavery.content, /\b(?:frontier raids|not every enslaved|kidnapping)\b/i, 3).join(" ")}`);
  // 3. Named places that exist (names only, grouped by nation; provisional names are described, not named).
  const continent = get("continent");
  const nations = ["west", "center", "east"].map(get).filter((e): e is WorldEntity => !!e);
  const placeList = nations.map(n => `${n.name}: ${world.getChildren(n.id).filter(c => c.type === "location" && isPublic(c)).map(c => { ids.add(c.id); return placeLabel(c); }).join(", ")}`);
  const regions = world.getChildren("continent").filter(c => c.type === "location" && isPublic(c) && !["west", "center", "east"].includes(c.id)).map(c => { ids.add(c.id); return placeLabel(c); });
  lines.push(`Named places that exist on ${continent?.name ?? "the continent"} (the only valid named origins; otherwise stay unnamed or vague): ${placeList.join("; ")}; regions: ${regions.join(", ")}.`);
  // 4. One-line notes for canonical slave-flow places outside the scene ancestry (already in the prompt). Context, not picks.
  const noteIds = (slavery && "related_entities" in slavery ? slavery.related_entities : []).filter(id => world.getEntity(id)?.type === "location" && !ancestry.includes(id) && id !== here);
  const notes = noteIds.map(get).filter((e): e is WorldEntity => !!e).map(e => `- ${placeLabel(e)}: ${firstSentence(e.summary, 150)}`);
  if (notes.length) lines.push("Regional notes:", ...notes);
  // 5. Peoples in play: species named in the input, the latest narration, or present characters' profiles. Unknown species: overview only.
  const speciesText = [input, recent.at(-1)?.narration ?? "", ...context.characters.map(c => c.profile.species ?? "")].join(" ");
  const species = SPECIES_WORDS.filter(([, r]) => r.test(speciesText)).map(([id]) => id);
  const peoples = (species.length ? species : ["races_overview"]).map(get).filter((e): e is WorldEntity => !!e);
  for (const p of peoples) {
    const related = "related_entities" in p ? p.related_entities.map(id => world.hasEntity(id) ? world.getEntity(id) : undefined).filter((e): e is WorldEntity => !!e && e.type === "location" && isPublic(e)) : [];
    related.forEach(r => ids.add(r.id));
    lines.push(`People: ${p.name}: ${firstSentence(p.summary)} ${sentencesMatching(p.content, /\b(?:homeland|population cent|enslaved|origin|varies|vary)\b/i, 2).join(" ")}${related.length ? ` Related places (possible, never assumed for an individual): ${related.map(placeLabel).join(", ")}.` : ""}`.trim());
  }
  const block = [
    `[BACKGROUND GROUNDING ? ${topics.join(", ")}]`,
    "Canon below defines valid named places, peoples, regional conditions and slave-source possibilities. Use it as constraints, not as a selection list; it assigns nothing to anyone.",
    "Rules: do not invent named cities, regions, nations, cultures or factions as established facts; unnamed generic places (a village, a farm, a coast) are fine if they do not contradict canon; if canon does not support a precise named origin, keep it vague. Reveal only what this exchange naturally asks for, usually one fact, never the whole life story. The person may answer partly, vaguely, falsely or refuse. Facts already established stay authoritative; anything else may stay unknown.",
    ...lines,
  ].join("\n");
  return { topics, block, entity_ids: [...ids].sort() };
}
/** Prompt-option form for the coordinator: present only when grounding applies, so ordinary turns are unchanged. */
export const backgroundGroundingOption = (...args: Parameters<typeof backgroundGrounding>): { background_grounding?: string } => {
  const g = backgroundGrounding(...args);
  return g ? { background_grounding: g.block } : {};
};

// ------------------------------------------------------------------------------------------------ named-entity guardrail
export type BackgroundClaimStatus = "verified" | "generic" | "unverified";
export interface BackgroundClaimCheck { readonly status: BackgroundClaimStatus; readonly entity_ids: readonly string[]; readonly unresolved: readonly string[] }
const NAME = String.raw`[A-Z][\w'’-]*(?:\s+(?:of\s+)?[A-Z][\w'’-]*){0,3}`;
/** Proper-name-like phrases in place position: after a place preposition, or "the <Capitalized>" mid-sentence. Person agents ("sold by X") are out of scope. */
const PLACE_PREP = new RegExp(String.raw`\b(?:[Ff]rom|[Ii]n|[Nn]ear|[Oo]utside|[Aa]round|[Bb]eyond|[Pp]ast|[Tt]owards?|[Aa]cross|[Aa]t|[Ii]nto|(?:[Nn]orth|[Ss]outh|[Ee]ast|[Ww]est)\s+of)\s+(?:the\s+)?(${NAME})`, "g");
const THE_NAME = new RegExp(String.raw`(?<=\S\s+)the\s+(${NAME})`, "g");
/** Titles and honorifics are not places; directions alone are generic. */
const NOT_PLACE = /^(?:Duke|Duchess|Lord|Lady|King|Queen|Emperor|Sun Emperor|Captain|Master|Mistress|Sir|Dame|Prince|Princess|Baron|Count|Countess|Magistrate|Guard|Gods?|Light|Shadow|I|North|South|East|West|Northern|Southern|Eastern|Western)$/;
const DIRECTION = /^(?:North|South|East|West|Northern|Southern|Eastern|Western|Upper|Lower|Outer|Inner|Old|New)\s+/;
const PLACE_SUFFIX = /\s+(?:Docks?|Road|Gate|Market|Harbou?r|Quarter|District|Walls?|Port|Bay|Coast|Hills|Plains|Fields|Mines?|Pits?|Frontier|Border|Desert|Forest|Mountains|Sea|River|Pens|Square)$/;
const norm = (s: string) => s.toLowerCase().replace(/[’]/g, "'").replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
/** Every WorldStore name, display name and alias except sealed canon (which must not even verify a claim), normalized; built once per world. */
const NAME_INDEX = new WeakMap<WorldStore, ReadonlyMap<string, string>>();
function nameIndex(world: WorldStore): ReadonlyMap<string, string> {
  let index = NAME_INDEX.get(world);
  if (!index) {
    const m = new Map<string, string>();
    for (const e of world.listEntities()) if (!e.knowledge?.secrecy) for (const n of [e.name, e.display_name.replace(/\s*\(provisional name\)$/i, ""), ...e.aliases]) if (n && !m.has(norm(n))) m.set(norm(n), e.id);
    NAME_INDEX.set(world, index = m);
  }
  return index;
}
function resolve(phrase: string, index: ReadonlyMap<string, string>): string | undefined {
  let p = phrase.trim();
  for (let i = 0; i < 3; i++) {
    const key = norm(p);
    if (index.has(key)) return index.get(key);
    // A canonical name inside a longer canonical name ("Dragon's Teeth" in "The Dragon's Teeth Mountains").
    for (const [name, id] of index) if (key.length >= 4 && new RegExp(`(?:^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(name)) return id;
    const next = p.replace(DIRECTION, "").replace(PLACE_SUFFIX, "");
    if (next === p) break; p = next;
  }
  return undefined;
}
/** Narrow V1 check of one background sentence. No full fact-checking: only whether its named places/cultures/factions exist in canon. */
export function classifyBackgroundClaim(text: string, world: WorldStore): BackgroundClaimCheck {
  const index = nameIndex(world), candidates = new Set<string>();
  for (const re of [PLACE_PREP, THE_NAME]) for (const m of text.matchAll(re)) { const c = m[1]!.replace(/[’']s$/, "").trim(); if (!NOT_PLACE.test(c)) candidates.add(c); }
  if (!candidates.size) return { status: "generic", entity_ids: [], unresolved: [] };
  const entity_ids: string[] = [], unresolved: string[] = [];
  for (const c of candidates) { const id = resolve(c, index); if (id) entity_ids.push(id); else unresolved.push(c); }
  return { status: unresolved.length ? "unverified" : "verified", entity_ids: [...new Set(entity_ids)], unresolved };
}
