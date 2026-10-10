import type { CampaignCommand } from "../campaign/types.js";
import type { PlayerIntent } from "./player-intent.js";
import { headNoun } from "./item-reference.js";
import { escapeRegExp } from "./language/text.js";
import type { SceneCharacterState, SceneDevelopment, SceneEvent, SceneItem, SceneKnowledgeEntry, SceneLocation, SceneSocial, SceneStateProjection } from "./scene-state-projection.js";

/**
 * Scene State Projection V1 — SELECTION (stage 2). Narrator Focus classifies people (foreground / background); this module only
 * decides which already-derived entries of the raw projection matter for THIS turn. It is deterministic, uses no model and authors no
 * fact: every selected entry is a verbatim entry of the raw projection. Dropping an entry never changes any other entry.
 */
export const SCENE_FOCUS_LIMITS = Object.freeze({
  /** Stored-at-location items shown unless the turn references them (referenced items always survive). */
  stored_items: 6,
  /** Carried (not worn/held) items listed per holder; items the turn references always survive. Worn/held items are never capped. */
  carried_per_holder: 8, carried_per_background_holder: 4,
  knowledge_facts: 5,
  scheduled_events: 4,
  relationships: 8,
  developments: 3,
  /** Pending events this far ahead (minutes) count as "soon"; an overdue pending event stays visible this long. */
  soon_minutes: 360, overdue_minutes: 720, scheduled_with_people_minutes: 1_440,
});
export interface Ranked<T> { readonly value: T; /** Higher survives longer under a size budget. */ readonly score: number; /** Never dropped by the size budget. */ readonly required: boolean }
export interface FocusedItem extends Ranked<SceneItem> { /** Narrative description shown only for items the turn is about. */ readonly detail: boolean }
export interface FocusedSceneState {
  readonly now: number;
  readonly location: SceneLocation;
  readonly time: SceneStateProjection["time"];
  readonly present: SceneStateProjection["present"];
  readonly character_state: readonly Ranked<SceneCharacterState>[];
  readonly items: readonly FocusedItem[];
  /** Carried items of background people / stored items not listed (count only; the items stay in their domains). */
  readonly carried_not_listed: number;
  readonly stored_not_listed: number;
  readonly player: SceneStateProjection["player"];
  readonly knowledge: readonly Ranked<SceneKnowledgeEntry>[];
  readonly social: { readonly legal: Ranked<SceneSocial["legal"][number]>[]; readonly households: Ranked<SceneSocial["households"][number]>[]; readonly relationships: Ranked<SceneSocial["relationships"][number]>[] };
  readonly scheduled: readonly Ranked<SceneEvent>[];
  readonly developments: readonly Ranked<SceneDevelopment>[];
}
/** Turn signals already computed by the narrator pipeline (Narrator Focus, intent, input); nothing here is new authority. */
export interface SceneFocusInput {
  readonly background: ReadonlySet<string>;
  readonly foreground: ReadonlySet<string>;
  readonly input: string;
  readonly recent_text?: string;
  readonly item_ids?: ReadonlySet<string>;
  readonly fact_ids?: ReadonlySet<string>;
  readonly event_ids?: ReadonlySet<string>;
  /** Existing background-actor lore filter applied to authored location text. */
  readonly lore?: (text: string) => string;
}
/** Membership / household / rule questions: the household block is then relevant by itself. */
const HOUSEHOLD_TOPIC = /\b(household|houses?|members?|membership|rules?|belongs?|belonging|keeper|join(?:s|ed|ing)?|expel(?:s|led)?|banish(?:es|ed)?|kicks?|allowed|forbidden|permitted)\b/i;
const STOP = new Set(["the", "and", "that", "this", "with", "from", "have", "been", "were", "what", "about", "your", "you", "know", "told", "tell", "said", "nicco", "there", "where", "which"]);
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/).filter(w => (w.length >= 4 || /\d/.test(w) && w.length >= 2) && !STOP.has(w)));
const overlap = (text: string, set: ReadonlySet<string>) => [...tokens(text)].filter(w => set.has(w)).length;
const wordIn = (word: string, text: string) => !!word && new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}(?![\\p{L}\\p{N}_])`, "iu").test(text);

/** Ids of items, facts and events the player's intent already points at (transfers, placements, knowledge, scheduling). */
export function intentSceneSignals(intent: PlayerIntent): { item_ids: Set<string>; fact_ids: Set<string>; event_ids: Set<string> } {
  const item_ids = new Set<string>(), fact_ids = new Set<string>(), event_ids = new Set<string>();
  for (const command of [...intent.candidates, ...intent.runtime] as readonly CampaignCommand[]) {
    if ("item_id" in command) item_ids.add(command.item_id);
    if (command.kind === "set_knowledge") fact_ids.add(command.knowledge.fact_id);
    if (command.kind === "schedule_event") event_ids.add(command.id);
    if ("event_id" in command) event_ids.add(command.event_id);
  }
  for (const ref of intent.resolved_references ?? []) for (const id of ref.ids) item_ids.add(id);
  for (const p of intent.natural?.physical ?? []) { const m = p as unknown as { item_id?: string }; if (m.item_id) item_ids.add(m.item_id); }
  return { item_ids, fact_ids, event_ids };
}

const minutesUntil = (event: SceneEvent, now: number) => event.world_minute - now;

/** Stage 2: deterministic relevance over the raw projection. */
export function focusedSceneStateProjection(projection: SceneStateProjection, focus: SceneFocusInput): FocusedSceneState {
  const L = SCENE_FOCUS_LIMITS, now = projection.time.world_minute;
  const foreground = (id: string) => !focus.background.has(id);
  const input = focus.input.toLowerCase(), inputTokens = tokens(focus.input), recentTokens = tokens(focus.recent_text ?? "");
  const lore = focus.lore ?? ((t: string) => t);
  const others = projection.present.filter(p => !p.player);

  // ---- location: authored text through the existing background-actor lore filter
  const location: SceneLocation = { ...projection.location, about: lore(projection.location.about),
    within: projection.location.within.map(a => ({ ...a, summary: lore(a.summary) })), features: projection.location.features.map(f => ({ ...f, description: lore(f.description) })) };

  // ---- character state: everyone present keeps their recorded state; background people simply rank lower under a budget
  const character_state = projection.character_state.map(s => ({ value: s, score: foreground(s.character_id) ? 100 : 10, required: foreground(s.character_id) }));

  // ---- items
  const referenced = (item: SceneItem) => !!focus.item_ids?.has(item.key) || wordIn(item.name.replace(/^(?:a|an|the)\s+/i, ""), input) || wordIn(headNoun({ id: item.key, name: item.name }), input);
  const worn = projection.items.filter(i => i.placement === "worn" || i.placement === "held");
  const carried = projection.items.filter(i => i.placement === "carried");
  const stored = projection.items.filter(i => i.placement === "stored_here");
  const holderIsPlayerOrFocused = (i: SceneItem) => i.holder_id !== undefined && foreground(i.holder_id);
  const chosen: FocusedItem[] = [];
  for (const i of worn) { const r = referenced(i); chosen.push({ value: i, detail: r, score: r ? 100 : holderIsPlayerOrFocused(i) ? 40 : 5, required: holderIsPlayerOrFocused(i) || r }); }
  let carriedNotListed = 0;
  for (const holder of new Set(carried.map(i => i.holder_id!))) {
    const mine = carried.map((value, index) => ({ value, index, r: referenced(value) })).filter(x => x.value.holder_id === holder).sort((a, b) => Number(b.r) - Number(a.r) || a.index - b.index);
    const limit = Math.max(mine.filter(x => x.r).length, foreground(holder) ? L.carried_per_holder : L.carried_per_background_holder);
    for (const [n, x] of mine.entries()) {
      if (n >= limit) { carriedNotListed++; continue; }
      chosen.push({ value: x.value, detail: x.r, score: x.r ? 100 : foreground(holder) ? 60 : 3, required: x.r });
    }
  }
  const storedRanked = stored.map((i, index) => ({ i, index, r: referenced(i) })).sort((a, b) => Number(b.r) - Number(a.r) || a.index - b.index);
  const keepStored = storedRanked.filter(x => x.r).length + Math.max(0, L.stored_items - storedRanked.filter(x => x.r).length);
  const storedKept = new Set(storedRanked.slice(0, keepStored).map(x => x.i.key));
  for (const x of storedRanked) if (storedKept.has(x.i.key)) chosen.push({ value: x.i, detail: x.r, score: x.r ? 100 : 10, required: x.r });
  const order = new Map(projection.items.map((i, index) => [i.key, index]));
  chosen.sort((a, b) => order.get(a.value.key)! - order.get(b.value.key)!);

  // ---- knowledge: facts the turn references, or that a focused present person holds; ranked like the narrator's fact selection
  const knowledge = projection.knowledge.map((entry, index) => {
    const id = entry.fact_id.toLowerCase(), statement = entry.statement.toLowerCase().replace(/[.!]$/, "");
    const referencedScore = (focus.fact_ids?.has(entry.fact_id) || input.includes(id) || (statement.length > 3 && input.includes(statement)) ? 1e6 : 0)
      + overlap(entry.statement, inputTokens) * 1e4 + overlap(entry.statement, recentTokens) * 1e2;
    const heldByFocused = entry.holders.some(h => h.character_id !== "nicco" && foreground(h.character_id)), heldByOther = entry.holders.some(h => h.character_id !== "nicco");
    // A fact every present person holds in the same way says nothing that differs between them; [CHARACTER KNOWLEDGE ACCESS] already lists it.
    const differentiated = entry.unrecorded.length > 0 || new Set(entry.holders.map(h => h.status)).size > 1;
    return { entry, index, score: referencedScore + (heldByFocused ? 10 : 0) + (heldByOther ? 1 : 0), eligible: differentiated && (referencedScore > 0 || heldByFocused) };
  }).filter(x => x.eligible).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, L.knowledge_facts);
  const knowledgeRanked = knowledge.map(x => ({ value: x.entry, score: x.score, required: false }));

  // ---- social
  const social = projection.social;
  // Households are shown only when the turn is about them (deterministic relevance; the household domain itself is unchanged):
  // a present household member (other than the player), a present owned or held person who is not a member, a household or member named in the input, a membership / household / rule
  // question, or an action touching a rule. Away members and rules are never repeated on unrelated turns merely because Nicco belongs.
  const referencedItemNames = projection.items.filter(referenced).map(i => i.name);
  const householdTopic = HOUSEHOLD_TOPIC.test(focus.input);
  const households = social.households.flatMap(h => {
    const presentMember = h.members.some(m => m.present && m.character_id !== "nicco");
    // A present person who is legally tied to someone (owned, held) but is NOT a member is exactly what the narrator must not call a member.
    const legalNonMember = h.present_non_members.some(p => social.legal.some(l => l.character_id === p.character_id));
    const named = wordIn(h.name, input) || h.members.some(m => m.character_id !== "nicco" && wordIn(m.name, input));
    const ruleHit = (rule: string) => householdTopic || overlap(rule, inputTokens) > 0 || referencedItemNames.some(n => overlap(rule, tokens(n)) > 0);
    const rules = h.rules.filter(ruleHit);
    if (!(presentMember || legalNonMember || named || householdTopic || rules.length > 0)) return [];
    return [{ value: { ...h, rules }, score: 50, required: true }];
  });
  const legal = social.legal.map(l => ({ value: l, score: foreground(l.character_id) ? 100 : 60, required: true }));
  const nameWords = (name: string) => wordIn(name, input);
  const relationships = social.relationships.map((r, index) => ({ r, index, withNicco: r.from === "Nicco" || r.to === "Nicco" }))
    .map(x => ({ ...x, mentioned: nameWords(x.r.from) || nameWords(x.r.to) }))
    .filter(x => x.withNicco || x.mentioned)
    .sort((a, b) => Number(b.mentioned) - Number(a.mentioned) || Number(b.withNicco) - Number(a.withNicco) || a.index - b.index).slice(0, L.relationships)
    .map(x => ({ value: x.r, score: x.mentioned ? 80 : 40, required: false }));

  // ---- scheduled events: soon, overdue-but-pending, involving a present person, or referenced by the turn
  const presentIds = new Set(others.map(p => p.id));
  const scheduled = projection.scheduled.map(e => {
    const remaining = minutesUntil(e, now);
    const involved = e.participant_ids.some(id => presentIds.has(id)), asked = !!focus.event_ids?.has(e.event_id) || (e.title.length > 3 && overlap(e.title, inputTokens) > 0);
    const soon = remaining <= L.soon_minutes && remaining >= -L.overdue_minutes, withPeople = involved && remaining <= L.scheduled_with_people_minutes && remaining >= -L.overdue_minutes;
    return { e, remaining, relevant: asked || soon || withPeople, score: (asked ? 100 : 0) + (involved ? 20 : 0) + Math.max(0, 10 - Math.floor(Math.abs(remaining) / 60)) };
  }).filter(x => x.relevant).sort((a, b) => a.e.world_minute - b.e.world_minute || (a.e.event_id < b.e.event_id ? -1 : 1)).slice(0, L.scheduled_events).map(x => ({ value: x.e, score: x.score, required: false }));

  // ---- recent structured developments: optional, foreground people first, newest first
  const developments = projection.developments.map((d, index) => ({ d, index })).sort((a, b) => Number(foreground(b.d.character_id)) - Number(foreground(a.d.character_id)) || b.d.revision - a.d.revision || a.index - b.index)
    .slice(0, L.developments).map(x => ({ value: x.d, score: foreground(x.d.character_id) ? 20 : 5, required: false }));

  return { now, location, time: projection.time, present: projection.present, character_state, items: chosen, carried_not_listed: carriedNotListed, stored_not_listed: stored.length - storedKept.size,
    player: projection.player, knowledge: knowledgeRanked, social: { legal, households, relationships }, scheduled, developments };
}
