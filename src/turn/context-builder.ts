import { registerNarratorIdentities } from "./narrator-identity.js";
import { isIdentityNameFact } from "../campaign/identity-knowledge.js";
import type { CampaignSnapshot, NameSource } from "../campaign/types.js";
import { characterView, itemView } from "../campaign/projections.js";
import { itemsAt } from "./item-projection.js";
import { narratorAppearance, resolvePermanentAppearance } from "../campaign/permanent-appearance.js";
import { buildNarrativeContext } from "../scene/narrative-context-builder.js";
import { RuntimeState } from "../world/runtime-state.js";
import type { WorldStore } from "../world/world-store.js";
import type { DeepReadonly } from "../types/readonly.js";
import { TurnError } from "./turn-types.js";
import { NPC_PLUS_LIMITS, packNpcPlus } from "./npc-plus.js";
import { describeDimensions, relationshipHeadline } from "../campaign/relationship-summary.js";
import { knowledgeGrants } from "./knowledge-grants.js";
import { activePlayerCharacterId, derivePlayerCharacterContext } from "../campaign/player-character.js";
import { REQUEST_RESOURCE_CHARACTERS } from "../types/resource-limits.js";
import { economy, generatePriceIndex } from "../economy/economy.js";
import { registerSceneExtras } from "./scene-state-projection.js";

/**
 * Hardening H3 — context projection order: RAW AUTHORITATIVE STATE → deterministic relevance selection → size validation.
 *
 * Drop safety (see the H3 report for the full table):
 *  A. NEVER DROP — location, time, present people, items they carry/wear, legal status of present people, Nicco's households,
 *     present household members, active household rules, relationships involving Nicco, knowledge edges for shown facts, NPC
 *     known_by grants. No count cap: the independent resource safeguard may reject excessive input, never drop it.
 *  B. SELECT — Nicco-known facts (relevance-ranked), scheduled events (soonest first), non-present household members, relationships
 *     between two NPCs. Selection is not forgetting: CampaignState keeps everything; `projection` reports what was omitted.
 * D-04: narrator capacity is checked on the final request in tokens; this builder enforces transport-scale resource bounds only.
 */
/** Narrator-facing name provenance of a created character: a fixed, bounded sentence per source. */
export const NAME_PROVENANCE: Readonly<Record<NameSource, string>> = Object.freeze({
  self_disclosed: "They told Nicco this name themselves; Nicco did not give it.",
  narrator_introduced: "Narration introduced them by this name; not self-disclosed, not given by Nicco.",
  introduced_by_other: "Another speaker introduced them by this name; not self-disclosed, not given by Nicco.",
});
export const CONTEXT_LIMITS = Object.freeze({
  /** Resource safeguard, derived from the transport envelope; narrator capacity is measured in tokens. */
  serialized_characters: REQUEST_RESOURCE_CHARACTERS,
  /** Retain the existing optional NPC+ flavour quality/headroom policy; no longer a hard context gate. */
  npc_plus_soft_characters: 32_000,
  /** Facts shown when Nicco knows more than this (pre-H3 this many was a fatal count cap). */
  facts: 32,
  /** Scheduled events shown when more are pending (pre-H3 this many was a fatal count cap). */
  scheduled_events: 16,
  /** NPC+ Pass 1: serialized reserve for the npc_plus envelope (key, array syntax, diagnostics) when computing its headroom. */
  npc_plus_reserve: 600,
  /** NPC+ Pass 1: JSON growth of rendered NPC+ lines (quotes, escapes) allowed for when converting headroom into a line budget. */
  npc_plus_escape_factor: 1.1,
});
/** Optional relevance signals for selection: the player's input and recent finalized conversation. */
export interface ContextRelevance { readonly input?: string; readonly recent_text?: string; /** Developer baseline hook: already-filtered derived context, including rejected oversized packs. */ readonly inspect_serialized?: (context: string) => void }
const serializedSizes = new WeakMap<object, number>();
const factTruth = new WeakMap<object, "true" | "false" | "unknown">();
/** Narrator compaction metadata only; never added to the controller's legacy context envelope. */
export const narratorFactTruth = (fact: object) => factTruth.get(fact);
/** Reuse the size already measured for H3's budget check; no second serialization for diagnostics. */
export const contextSerializedCharacters = (context: TurnContext): number => serializedSizes.get(context) ?? JSON.stringify(context).length;

const STOP = new Set(["the", "and", "that", "this", "with", "from", "have", "been", "were", "what", "about", "your", "you", "know", "told", "tell", "said", "nicco"]);
/** Content tokens: words of 4+ letters, or any token containing a digit ("050", "3rd"), which is usually the distinctive part. */
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/).filter(w => (w.length >= 4 || /\d/.test(w) && w.length >= 2) && !STOP.has(w)));
/** Deterministic top-`limit` by descending score, ties by original order; returns the kept items in ORIGINAL order. */
function selectTop<T>(items: readonly T[], limit: number, score: (item: T) => number): T[] {
  if (items.length <= limit) return [...items];
  const keep = new Set(items.map((item, index) => ({ index, s: score(item) })).sort((a, b) => b.s - a.s || a.index - b.index).slice(0, limit).map(x => x.index));
  return items.filter((_, index) => keep.has(index));
}

export function buildTurnContext(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, relevance: ContextRelevance = {}) {
  if (snapshot.dataset_id !== world.datasetId) throw new TurnError("context_invalid");
  // Detached compatibility projection; never replay commands into the authoritative campaign.
  const runtime = new RuntimeState(world, structuredClone(snapshot.runtime.scene), snapshot.runtime.mana);
  runtime.applySceneDelta({ character_movements: snapshot.runtime.npc_locations.map(n => n.off_scene ? { character_id: n.character_id, off_scene: true as const } : { character_id: n.character_id, current_location: n.current_location! }) });
  const projected = buildNarrativeContext(world, runtime);
  // Stronger player-output policy: omit narrator-only secret places. Repair 1 confidential encounter: a protected (narrator-only)
  // character physically present in runtime IS projected for this turn, marked confidential, so the narrator can portray them.
  // This grants no retrieval/player visibility and publishes no identity: the flag carries the non-disclosure contract.
  const primary = { runtime_revision: snapshot.revision, scene: { ...projected.scene,
    player_location: projected.scene.player_location?.secret ? null : projected.scene.player_location,
    location_ancestry: projected.scene.location_ancestry.filter(e => !e.secret),
    present_characters: projected.scene.present_characters.map(e => e.secret ? { ...e, confidential_encounter: true as const } : e),
  } };
  // Current production canon may have no authored player/NPC records yet. Runtime still projects player location/mana.
  const present = [...(world.getEntity("nicco")?.type === "character" ? ["nicco"] : []), ...primary.scene.present_characters.map(c => c.id), ...snapshot.characters.filter(c => c.origin.kind === "created" && c.current.current_location === snapshot.runtime.scene.player_location && c.current.status !== "dead").map(c => c.id)];
  const here = new Set(present);
  // A: every item a present person carries or wears (no count cap).
  const visibleItem = (item: DeepReadonly<CampaignSnapshot>["items"][number]) => item.origin.kind === "created" || !!world.getEntity(item.origin.canonical_entity_id)?.knowledge?.visibility.player && !!world.getEntity(item.origin.canonical_entity_id)?.knowledge?.visibility.narrator;
  const items = snapshot.items.filter(i => (i.position.kind === "carried" || i.position.kind === "equipped") && here.has(i.position.character_id) && visibleItem(i)).map(i => itemView(snapshot, world, i.id));
  const niccoKnows = new Set(snapshot.knowledge.filter(k => k.character_id === "nicco").map(k => k.fact_id));
  const allFacts = snapshot.facts.filter(f => niccoKnows.has(f.id) && !isIdentityNameFact(f)).flatMap(f => {
    if (f.content.kind === "campaign") { const fact = { id: f.id, statement: f.content.statement }; factTruth.set(fact, f.content.truth); return [fact]; }
    const owner = world.getEntity(f.content.entity_id), chunk = f.content.chunk_id ? world.getChunk(f.content.chunk_id) : undefined;
    const policy = chunk?.knowledge ?? owner?.knowledge;
    return policy?.visibility.player && policy.visibility.narrator ? [{ id: f.id, statement: chunk?.content ?? owner!.content }] : [];
  });
  // Authored home locality (canonical characters only): the basis for local:<location> awareness. Presence alone is not residency.
  const home = (id: string) => { const e = world.getEntity(id); return e?.type === "character" && (e.base_location ?? e.location) ? [e.base_location ?? e.location!, ...world.getAncestors((e.base_location ?? e.location)!).map(a => a.id)] : []; };
  // Repair 1: a pronoun from authored sex only (never inferred from a name), used to disambiguate "he"/"she" in evidence.
  const pronoun = (id: string) => { const e = world.getEntity(id); return e?.type === "character" && e.sex === "male" ? { pronoun: "he" as const } : e?.type === "character" && e.sex === "female" ? { pronoun: "she" as const } : {}; };
  // Promotion Pass 1.1: a promoted person keeps their established identity without the old transcript: an unnamed one is shown by
  // the promotion label ("the girl"; never an invented name), and established background travels with its source.
  // Name provenance (created characters): one fixed sentence from profile.name_source, so how the name was learned outlives the
  // recent transcript. Unknown provenance says nothing.
  const promoted = (id: string) => { const record = snapshot.characters.find(c => c.id === id), o = record?.origin_snapshot, source = record?.profile.name ? record.profile.name_source : undefined;
    return o ? { label: o.label, ...(source ? { name_provenance: NAME_PROVENANCE[source] } : {}), ...(o.established.role ? { role: o.established.role } : {}), ...(o.established.descriptor ? { descriptor: o.established.descriptor } : {}),
    ...(o.established.background?.length ? { background: o.established.background.map(b => `${b.text} (${b.by ? `stated by ${b.by}` : b.source === "seller" ? "stated by the seller" : b.source === "self" ? "stated by them" : b.source === "narration" ? "narrated" : "stated by someone present"})`) } : {}) } : undefined; };
  const labelled = (id: string) => {
    const full = characterView(snapshot, world, id), o = promoted(id);
    const { name_source: _source, ...profile } = full.profile, view = { ...full, profile }; // narrated once, via name_provenance
    return o && !view.profile.name ? { ...view, profile: { ...view.profile, name: o.label }, unnamed_label: true as const } : view;
  };
  // Hardening H3: authored known_by grants from one cached index per immutable world (no per-character world scan). Public grants
  // keep their pre-H3 order and are no longer silently cut at 24.
  const grants = knowledgeGrants(world);
  // Permanent Appearance V1: a character with campaign appearance values is narrated from the one resolved contract (values plus the
  // effective description), not from separate raw profile and authored blocks. Without campaign values nothing changes.
  const permanent = (id: string) => snapshot.characters.find(c => c.id === id)?.profile.appearance
    ? { permanent_appearance: narratorAppearance(resolvePermanentAppearance(world, snapshot, id, { canonical: true, overrides: true })) } : {};
  const characters = present.map(id => ({ ...labelled(id), established_origin: promoted(id), ...permanent(id), locality: home(id), ...pronoun(id),
    canonical_awareness: [...(grants.public.get(id) ?? [])],
  }));
  // Hardening H3: restricted (narrator-only) canon a PRESENT character is authored to know. Narrator access for that character
  // only: rendered solely in the NPC-private knowledge section, never as player knowledge, never in the controller envelope.
  const npc_private_canon = present.filter(id => id !== "nicco").flatMap(id => (grants.restricted.get(id) ?? []).map(g => ({ character_id: id, ...g })));
  // B: facts, relevance-ranked when Nicco knows more than the limit. Rank: referenced by the input (id or wording) > by recent
  // conversation > mentions a present person or the location > known by another present person > the rest (stable order).
  const input = (relevance.input ?? "").toLowerCase(), inputTokens = tokens(relevance.input ?? ""), recentTokens = tokens(relevance.recent_text ?? "");
  const sceneTokens = tokens([...characters.map(c => c.profile.name ?? ""), primary.scene.player_location?.display_name ?? ""].join(" "));
  const knownByOthers = new Set(snapshot.knowledge.filter(k => k.character_id !== "nicco" && here.has(k.character_id)).map(k => k.fact_id));
  const overlap = (f: { id: string; statement: string }, set: Set<string>) => (set.has(f.id.toLowerCase()) ? 1 : 0) + [...tokens(f.statement)].filter(w => set.has(w)).length;
  // Score bands keep the rank order explicit; within a band, more matched words (the distinctive ones) win, then original order.
  const facts = selectTop(allFacts, CONTEXT_LIMITS.facts, f => (input.includes(f.id.toLowerCase()) || input.includes(f.statement.toLowerCase().replace(/[.!]$/, "")) ? 1e6 : 0)
    + overlap(f, inputTokens) * 1e4 + overlap(f, recentTokens) * 1e2 + (overlap(f, sceneTokens) ? 10 : 0) + (knownByOthers.has(f.id) ? 1 : 0));
  const shownFacts = new Set(facts.map(f => f.id));
  // A: every knowledge edge of a present person about a shown fact (permissions are never dropped).
  const knowledge = snapshot.knowledge.filter(k => here.has(k.character_id) && shownFacts.has(k.fact_id));
  // B: Nicco's pending scheduled events, soonest first when more than the limit (ties by id).
  const allEvents = snapshot.scheduled_events.filter(e => e.participants?.includes("nicco") && e.status === "scheduled");
  const latest = Math.max(0, ...allEvents.map(e => e.scheduled_world_minute)) + 1;
  const events = selectTop(allEvents, CONTEXT_LIMITS.scheduled_events, e => latest - e.scheduled_world_minute);
  // Narrator-facing truth about the player character (canonical baseline + current household roles); never NPC knowledge.
  // Player Character Profile V1: the ACTIVE player character (v1 always Nicco) through the one canonical projection.
  const player = world.getEntity(activePlayerCharacterId(snapshot) ?? "nicco");
  const visible = derivePlayerCharacterContext(world, snapshot);
  const player_profile = player?.type === "character" && player.role === "player" && player.knowledge?.visibility.narrator ? {
    // Nicco's authored `content` prose (origin, arrival, ownership history, magic) stays private authored canon: it is never sent
    // automatically. Narrator-visible player truth is the structured profile below plus controlled facts with access lists.
    name: player.name,
    // Repair 1 + Player Character Profile V1: what others can perceive comes from the campaign profile (structured, editable,
    // always present), kept apart from narrator-only canon prose. Never NPC knowledge, never retrieval-dependent.
    ...(visible ? { visible } : {}),
    households: snapshot.households.flatMap(h => h.members.filter(m => m.character_id === "nicco" && m.status !== "former_member").map(m => ({ id: h.id, name: h.name ?? h.id, status: m.status, ...(m.role ? { role: m.role } : {}),
      // Household knowledge policy: only fellow current members may use Nicco's membership; ownership is not public.
      member_ids: h.members.filter(x => x.status !== "former_member").map(x => x.character_id) }))),
  } : null;
  const { social, omitted: socialOmitted } = socialProjection(world, snapshot, present);
  // Non-silent selection: reported only when something was actually left out of this turn's context.
  const projection = {
    ...(facts.length < allFacts.length ? { facts: { total: allFacts.length, shown: facts.length } } : {}),
    ...(events.length < allEvents.length ? { scheduled_events: { total: allEvents.length, shown: events.length } } : {}),
    ...socialOmitted,
  };
  // Item Domain V1: materialized items lying at the current location, with stable IDs for the controller (omitted when none, so
  // ordinary contexts are unchanged). The narrator prompt does not render this field.
  const here_items = primary.scene.player_location ? itemsAt(snapshot, primary.scene.player_location.id).filter(visibleItem).map(i => itemView(snapshot, world, i.id)) : [];
  const authority = { primary, characters, items, ...(here_items.length ? { items_here: here_items } : {}), facts, knowledge, scheduled_events: events, player_profile, social,
    ...(npc_private_canon.length ? { npc_private_canon } : {}), ...(Object.keys(projection).length ? { projection } : {}) };
  // NPC+ Pass 1: retain its established soft flavour/headroom policy, independent of the D-04 hard token capacity check.
  // Packing uses the smaller of its own quality limit and the old soft headroom (minus JSON reserve). NPC+ flavour
  // therefore degrades toward Tier D and never causes context_too_large by itself; authority is never traded for it.
  const headroom = CONTEXT_LIMITS.npc_plus_soft_characters - JSON.stringify(authority).length - CONTEXT_LIMITS.npc_plus_reserve;
  // D-09 deferred: omit reflection text and labels before budget selection, including shadow notes.
  const npc_plus = packNpcPlus(world, snapshot, new Set(present), relevance.input ?? "", Math.max(0, Math.min(NPC_PLUS_LIMITS.budget_characters, Math.floor(headroom / CONTEXT_LIMITS.npc_plus_escape_factor))), { include_reflections: false });
  const result = { ...authority, ...(npc_plus ? { npc_plus } : {}) };
  const serializedCharacters = JSON.stringify(result).length;
  relevance.inspect_serialized?.(JSON.stringify(result));
  if (serializedCharacters > CONTEXT_LIMITS.serialized_characters) throw new TurnError("context_too_large");
  registerNarratorIdentities(result, world, snapshot);
  // Scene State Projection V1: names of absent item owners / event participants and validated recent developments, kept beside the
  // context (never inside it), so the Controller envelope and its measured size are unchanged.
  registerSceneExtras(result, world, snapshot, present, [...new Set([...items, ...here_items].flatMap(i => typeof i.owner_id === "string" ? [i.owner_id] : []).concat(events.flatMap(e => e.participants ?? [])))],
    new Map(facts.flatMap(f => { const truth = narratorFactTruth(f); return truth ? [[f.id, truth] as const] : []; })), [...items, ...here_items].map(i => i.id));
  serializedSizes.set(result, serializedCharacters);
  return result;
}
export type TurnContext = ReturnType<typeof buildTurnContext>;

/** Household Pass 1 context budget for the SELECTABLE parts of the social projection (never-drop parts are uncapped). */
export const SOCIAL_LIMITS = Object.freeze({ edges: 12, members: 15, rules: 12 });
/**
 * Household Pass 1: compact authoritative social projection for the turn. Money is Nicco's tracked purse. Legal status is shown
 * only for people in the scene. Households are those Nicco keeps or belongs to: keeper(s), current members, active rules, and
 * present people who are NOT members (e.g. a purchased person staying there). Relationship edges: both ends in the scene.
 * Hardening H3: present members, active rules and Nicco's own relationship edges are never dropped; only non-present members and
 * NPC–NPC edges are selected beyond the limits (stable order), and every omission is reported.
 */
function socialProjection(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, present: readonly string[]) {
  const name = (id: string) => { try { return characterView(snapshot, world, id).profile.name ?? snapshot.characters.find(c => c.id === id)?.origin_snapshot?.label ?? id; } catch { return id; } };
  const here = new Set(present);
  const legal = snapshot.legal_statuses.filter(l => here.has(l.character_id) && l.character_id !== "nicco").map(l => ({
    character_id: l.character_id, name: name(l.character_id), status: l.status, ...(l.holder_id ? { holder: name(l.holder_id), holder_id: l.holder_id } : {}),
    ...(l.transfer ? { papers: l.transfer.documentation, ...(l.transfer.note ? { provenance: l.transfer.note } : {}) } : {}) }));
  let membersOmitted = 0;
  const households = snapshot.households.filter(h => h.members.some(m => m.character_id === "nicco" && m.status === "member")).map(h => {
    const keepers = h.members.filter(m => m.status === "member" && m.role === "owner").map(m => name(m.character_id));
    const all = h.members.filter(m => m.status === "member" && m.role !== "owner");
    const presentCount = all.filter(m => here.has(m.character_id)).length;
    const members = selectTop(all, Math.max(SOCIAL_LIMITS.members, presentCount), m => here.has(m.character_id) ? 1 : 0);
    membersOmitted += all.length - members.length;
    const memberIds = new Set(h.members.filter(m => m.status === "member").map(m => m.character_id));
    return { id: h.id, name: h.name ?? h.id, keepers, members: members.map(m => ({ character_id: m.character_id, name: name(m.character_id), present: here.has(m.character_id) })),
      present_non_members: present.filter(id => id !== "nicco" && !memberIds.has(id)).map(id => ({ character_id: id, name: name(id) })),
      rules: (h.rules ?? []).filter(r => r.active).map(r => r.text) };
  });
  const edges = snapshot.relationships.filter(e => e.dimensions && here.has(e.from_character_id) && here.has(e.to_character_id));
  const withNicco = edges.filter(e => e.from_character_id === "nicco" || e.to_character_id === "nicco").length;
  const kept = selectTop(edges, Math.max(SOCIAL_LIMITS.edges, withNicco), e => e.from_character_id === "nicco" || e.to_character_id === "nicco" ? 1 : 0);
  const relationships = kept.map(e => ({ from: name(e.from_character_id), to: name(e.to_character_id), headline: relationshipHeadline(e), dimensions: describeDimensions(e) }));
  const omitted = { ...(membersOmitted ? { household_members_not_present: { omitted: membersOmitted } } : {}), ...(kept.length < edges.length ? { relationships: { total: edges.length, shown: kept.length } } : {}) };
  // P8: present price-setters' persisted index. A pre-P8 save lacks the record; the same deterministic campaign derivation
  // gives a stable value there, so nothing ever rerolls.
  const setters = new Set(economy().price_setters);
  const price_indices = present.filter(id => id !== "nicco" && (snapshot.price_indices?.some(p => p.character_id === id) || setters.has(id) && !snapshot.characters.some(c => c.id === id)))
    .map(id => ({ character_id: id, name: name(id), percent: snapshot.price_indices?.find(p => p.character_id === id)?.percent ?? generatePriceIndex(snapshot.campaign_id, id) }));
  return { social: { nicco_gold: snapshot.funds.find(f => f.character_id === "nicco")?.gold ?? null, legal, households, relationships, ...(price_indices.length ? { price_indices } : {}) }, omitted };
}
