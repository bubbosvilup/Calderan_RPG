import type { CampaignSnapshot } from "../campaign/types.js";
import { characterView } from "../campaign/projections.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { temporalGrounding } from "./temporal-grounding.js";

/**
 * Scene State Projection V1 — DERIVATION (see docs/architecture/SCENE_STATE_PROJECTION_V1.md).
 *
 * A pure, per-turn, narrator-oriented consolidation of runtime truth that already has an authoritative owner. It persists nothing,
 * is rebuilt every turn and never mutates its sources. Three separate stages live in three modules:
 *   1. derivation  (this file)           — raw candidate scene truth, every present character and item, no relevance applied;
 *   2. focus       (scene-state-focus.ts)  — deterministic relevance selection over the raw projection (Narrator Focus signals);
 *   3. rendering   (scene-state-render.ts) — compact, id-free, bounded narrator text.
 * Internal entries carry a `source` string ("campaign.item:<id>") for tests and diagnostics; it is NEVER rendered.
 */
export interface SceneLocation {
  /** Null when the location is secret/unestablished for the narrator (existing secret-location policy). */
  readonly name: string | null;
  readonly about: string;
  /** Nearest parent first. */
  readonly within: readonly { readonly name: string; readonly summary: string }[];
  readonly features: readonly { readonly name: string; readonly description: string }[];
  readonly source: string;
}
export interface SceneTime { readonly world_minute: number; readonly day: number; readonly actual_time: string; readonly time_of_day: string }
export interface ScenePresence { readonly id: string; readonly name: string; readonly player: boolean; readonly confidential: boolean; readonly source: string }
export interface SceneCharacterState { readonly character_id: string; readonly name: string; readonly status?: "inactive" | "dead"; readonly conditions: readonly string[]; readonly presentation?: string; readonly source: string }
export type SceneItemPlacement = "carried" | "worn" | "held" | "stored_here";
/** Ownership and possession are independent facts; neither implies how the item came to be where it is. */
export type SceneItemOwner = { readonly kind: "unrecorded" } | { readonly kind: "unowned" } | { readonly kind: "person"; readonly id: string; readonly name: string | null };
export interface SceneItem {
  /** Internal correlation key only (never rendered). */
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly placement: SceneItemPlacement;
  readonly holder_id?: string;
  readonly holder?: string;
  readonly slot?: string;
  readonly owner: SceneItemOwner;
  readonly source: string;
}
export type KnowledgeScope = "knows" | "believes" | "suspects" | "heard_rumor";
export interface SceneKnowledgeEntry {
  readonly fact_id: string;
  readonly statement: string;
  readonly truth: "true" | "false" | "unknown" | undefined;
  readonly holders: readonly { readonly character_id: string; readonly name: string; readonly status: KnowledgeScope }[];
  /** Present characters WITHOUT a recorded edge. A missing edge is not proof of ignorance. */
  readonly unrecorded: readonly { readonly character_id: string; readonly name: string }[];
  readonly source: string;
}
export interface SceneLegal { readonly character_id: string; readonly name: string; readonly status: string; readonly holder?: string; readonly holder_id?: string; readonly papers?: string; readonly provenance?: string }
export interface SceneHousehold { readonly id: string; readonly name: string; readonly keepers: readonly string[]; readonly members: readonly { readonly character_id: string; readonly name: string; readonly present: boolean }[];
  readonly present_non_members: readonly { readonly character_id: string; readonly name: string }[]; readonly rules: readonly string[] }
export interface SceneRelationship { readonly from: string; readonly to: string; readonly headline: string; readonly dimensions: string }
export interface SceneSocial { readonly legal: readonly SceneLegal[]; readonly households: readonly SceneHousehold[]; readonly relationships: readonly SceneRelationship[] }
export interface SceneEvent { readonly event_id: string; readonly title: string; readonly description?: string; readonly world_minute: number; readonly participant_ids: readonly string[]; readonly participants: readonly string[] }
export interface SceneDevelopment { readonly character_id: string; readonly name: string; readonly text: string; readonly revision: number; readonly world_minute: number; readonly source: string }
export interface SceneStateProjection {
  readonly location: SceneLocation;
  readonly time: SceneTime;
  readonly present: readonly ScenePresence[];
  readonly character_state: readonly SceneCharacterState[];
  readonly items: readonly SceneItem[];
  readonly player: { readonly mana: { readonly current: number; readonly max: number }; readonly gold: number | null };
  readonly knowledge: readonly SceneKnowledgeEntry[];
  readonly social: SceneSocial;
  readonly scheduled: readonly SceneEvent[];
  readonly developments: readonly SceneDevelopment[];
}

// ------------------------------------------------------------------------------------------------ snapshot-only extras
/**
 * What TurnContext does not carry but the snapshot does: names for people who are not in the scene (item owners, event participants)
 * and already-validated recent structured developments. Held beside the context (like the narrator identity gate), never serialized
 * into it, so the Controller envelope and its size accounting are byte-identical to before.
 */
export interface ScenePerson { readonly name: string; readonly kind: "player" | "created" | "authored" }
export interface SceneExtras { readonly people: ReadonlyMap<string, ScenePerson>; readonly developments: readonly Omit<SceneDevelopment, "name">[]; /** Narrator fact truth, captured by the context builder (it owns that metadata). */ readonly fact_truth: ReadonlyMap<string, "true" | "false" | "unknown">;
  /** Item id -> authoritative human-readable label, ONLY where the existing item/canonical data holds one that is not a machine handle. */
  readonly item_labels: ReadonlyMap<string, string> }
/**
 * Runtime-attached derived metadata, scoped to the identity of the TurnContext object: not serialized, and cloning a TurnContext alone
 * does NOT carry it over. It exists so the Controller context stays byte-identical; a future NarratorContext may replace this pattern.
 */
const extras = new WeakMap<object, SceneExtras>();
export const sceneExtrasOf = (context: object): SceneExtras | undefined => extras.get(context);
type Snapshot = DeepReadonly<CampaignSnapshot>;
const DEVELOPMENT_WINDOW_MINUTES = 1_440, DEVELOPMENTS_PER_CHARACTER = 2;
const level = (l: string) => l;

/** A snake_case handle (`pink_cotton`): a stable authored key, not a display label. It is rejected as a label, never "prettified". */
export const isMachineHandle = (value: string): boolean => /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(value.trim());
/**
 * Narrator-facing item label from EXISTING authoritative data only, in the order the app's session view already uses
 * (item.name, then the canonical entity's display_name, then its name). A candidate that is empty, equals an id, or is a machine
 * handle is skipped. When nothing qualifies this returns undefined and the caller keeps the source name (documented gap).
 */
function itemLabel(world: WorldStore, snapshot: Snapshot, itemId: string): string | undefined {
  const item = snapshot.items.find(i => i.id === itemId);
  if (!item) return undefined;
  const canonical = item.origin.kind === "canonical" ? world.getEntity(item.origin.canonical_entity_id) : undefined;
  const handles = new Set([item.id, item.origin.kind === "canonical" ? item.origin.canonical_entity_id : ""]);
  return [item.name, canonical?.display_name, canonical?.name].map(c => clean(c ?? "")).find(c => c && !handles.has(c) && !isMachineHandle(c));
}
export function registerSceneExtras(context: object, world: WorldStore, snapshot: Snapshot, present: readonly string[], referenced: readonly string[], fact_truth: ReadonlyMap<string, "true" | "false" | "unknown">, item_ids: readonly string[] = []): void {
  const people = new Map<string, ScenePerson>();
  for (const id of referenced) {
    if (people.has(id)) continue;
    const entity = world.getEntity(id), created = snapshot.characters.find(c => c.id === id);
    if (entity?.type === "character") people.set(id, { name: entity.name, kind: entity.role === "player" ? "player" : "authored" });
    else if (created) people.set(id, { name: created.profile.name ?? created.origin_snapshot?.label ?? "", kind: "created" });
  }
  const item_labels = new Map<string, string>();
  for (const id of item_ids) { const label = itemLabel(world, snapshot, id); if (label) item_labels.set(id, label); }
  extras.set(context, { people, developments: recentDevelopments(world, snapshot, present), fact_truth, item_labels });
}
/**
 * Structured NPC+ developments of PRESENT characters, filtered to those still consistent with current authoritative state
 * (current state always beats history: a "moved" entry or a condition that has since cleared is never projected).
 */
function recentDevelopments(world: WorldStore, snapshot: Snapshot, present: readonly string[]): SceneExtras["developments"] {
  const now = snapshot.runtime.scene.world_time.world_minute, out: Omit<SceneDevelopment, "name">[] = [];
  const nameOf = (id: string) => { try { return characterView(snapshot, world, id).profile.name ?? snapshot.characters.find(c => c.id === id)?.origin_snapshot?.label ?? id; } catch { return id; } };
  for (const id of present) {
    const premium = snapshot.premium_characters.find(p => p.character_id === id && p.metadata.active_household_member);
    if (!premium) continue;
    let conditions: readonly string[] = [];
    try { conditions = characterView(snapshot, world, id).current.conditions ?? []; } catch { /* unknown character: no condition history */ }
    const kept: Omit<SceneDevelopment, "name">[] = [];
    for (const e of [...premium.dynamic.recent_developments].reverse()) {
      if (e.world_minute < now - DEVELOPMENT_WINDOW_MINUTES) continue;
      let text: string | undefined;
      switch (e.kind) {
        case "condition_added": if (conditions.includes(e.condition)) text = `${nameOf(id)} gained the condition "${e.condition}"`; break;
        case "condition_removed": if (!conditions.includes(e.condition)) text = `${nameOf(id)} no longer has the condition "${e.condition}"`; break;
        case "relationship_changed": {
          const edge = snapshot.relationships.find(r => r.from_character_id === e.actor_id && r.to_character_id === e.other_id)?.dimensions?.[e.dimension];
          if (edge === e.to) text = `${nameOf(e.actor_id)} toward ${nameOf(e.other_id)}: ${e.dimension} moved from ${level(e.from)} to ${level(e.to)}`;
          break;
        }
        // Household membership has its own authoritative block ([Social]); a join/leave is never repeated here.
        case "legal_status_changed": if (snapshot.legal_statuses.find(l => l.character_id === id)?.status === e.to) text = `${nameOf(id)}'s recorded legal status changed from ${e.from} to ${e.to}`; break;
        case "person_transaction": text = `A recorded ${e.transaction_kind.replace("manumission", "manumission (freeing)")} concerned ${nameOf(id)}`; break;
        default: break; // moved / rules / contracts / migration: current state or other blocks own these
      }
      if (text) kept.push({ character_id: id, text, revision: e.revision, world_minute: e.world_minute, source: `npc_plus.history:${id}:r${e.revision}` });
      if (kept.length >= DEVELOPMENTS_PER_CHARACTER) break;
    }
    out.push(...kept);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ derivation
const clean = (text: string | undefined) => (text ?? "").trim();
/**
 * Narrator-safe display name for a character IN the scene, reusing the established identity-disclosure gate: a known or non-gated
 * (player/created) character shows their name; an authored NPC whose name Nicco has not learned shows the head of the observable label
 * ("the unfamiliar woman"), never the hidden name. Duplicates are numbered so every later line points at one person.
 */
export function sceneDisplayNames(context: TurnContext): ReadonlyMap<string, string> {
  const gate = narratorIdentityGate(context), seen = new Map<string, number>(), out = new Map<string, string>();
  for (const c of context.characters) {
    const identity = gate?.identities.get(c.id);
    const base = clean(identity ? identity.player_known_name ?? gate!.mask(identity.observable_label.split(":")[0]!) : c.profile.name) || "an unnamed person";
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    out.set(c.id, n === 1 ? base : `${base} (${n})`);
  }
  return out;
}
/** Known name for a person who may be absent: presence names win; absent authored NPCs only by a name Nicco has learned. */
function externalName(context: TurnContext, names: ReadonlyMap<string, string>, id: string): string | null {
  const here = names.get(id);
  if (here) return here;
  const person = sceneExtrasOf(context)?.people.get(id);
  if (!person) return null;
  if (person.kind === "authored") return narratorIdentityGate(context)?.identities.get(id)?.player_known_name ?? null;
  return clean(person.name) || null;
}

function deriveLocation(context: TurnContext): SceneLocation {
  const scene = context.primary.scene, place = scene.player_location;
  return { name: place ? place.display_name : null, about: place ? clean(place.content) : "",
    within: scene.location_ancestry.map(a => ({ name: a.display_name, summary: clean(a.summary) })),
    features: (place?.features ?? []).map(f => ({ name: clean(f.name), description: clean(f.description) })),
    source: `runtime.player_location:${place?.id ?? "unestablished"}` };
}
function deriveTime(context: TurnContext): SceneTime {
  const t = temporalGrounding(context.primary.scene.world_time.world_minute);
  return { world_minute: t.world_minute, day: t.day, actual_time: t.actual_time, time_of_day: t.time_of_day };
}
function derivePresence(context: TurnContext, names: ReadonlyMap<string, string>): ScenePresence[] {
  const confidential = new Set(context.primary.scene.present_characters.filter(p => "confidential_encounter" in p).map(p => p.id));
  return context.characters.map(c => ({ id: c.id, name: names.get(c.id)!, player: c.id === "nicco", confidential: confidential.has(c.id), source: `runtime.presence:${c.id}` }));
}
function deriveCharacterState(context: TurnContext, names: ReadonlyMap<string, string>): SceneCharacterState[] {
  return context.characters.flatMap(c => {
    const current = c.current as { readonly status?: string; readonly conditions?: readonly string[]; readonly presentation?: string };
    const status = current.status === "dead" || current.status === "inactive" ? current.status : undefined;
    const conditions = [...new Set((current.conditions ?? []).map(clean).filter(Boolean))], presentation = clean(current.presentation);
    if (!status && !conditions.length && !presentation) return [];
    return [{ character_id: c.id, name: names.get(c.id)!, ...(status ? { status } : {}), conditions, ...(presentation ? { presentation } : {}), source: `campaign.character.current:${c.id}` }];
  });
}
type ViewItem = TurnContext["items"][number];
function deriveItems(context: TurnContext, names: ReadonlyMap<string, string>): SceneItem[] {
  const labels = sceneExtrasOf(context)?.item_labels;
  const owner = (item: ViewItem): SceneItemOwner => item.owner_id === undefined ? { kind: "unrecorded" } : item.owner_id === null ? { kind: "unowned" } : { kind: "person", id: item.owner_id, name: externalName(context, names, item.owner_id) };
  const base = (item: ViewItem) => ({ key: item.id, name: labels?.get(item.id) ?? (clean(item.name) || "an unnamed item"), ...(clean(item.description) ? { description: clean(item.description) } : {}), owner: owner(item), source: `campaign.item:${item.id}` });
  const carried = context.items.flatMap((item): SceneItem[] => {
    const p = item.position;
    if (p.kind === "equipped") return [{ ...base(item), placement: p.mode === "worn" ? "worn" : "held", holder_id: p.character_id, holder: names.get(p.character_id) ?? "someone", slot: p.slot }];
    if (p.kind === "carried") return [{ ...base(item), placement: "carried", holder_id: p.character_id, holder: names.get(p.character_id) ?? "someone" }];
    return [];
  });
  const here = (context.items_here ?? []).map((item): SceneItem => ({ ...base(item as ViewItem), placement: "stored_here" }));
  return [...carried, ...here];
}
function deriveKnowledge(context: TurnContext, names: ReadonlyMap<string, string>): SceneKnowledgeEntry[] {
  const present = context.characters.map(c => c.id);
  return context.facts.map(f => {
    const edges = context.knowledge.filter(k => k.fact_id === f.id);
    const holders = present.flatMap(id => { const e = edges.find(k => k.character_id === id); return e ? [{ character_id: id, name: names.get(id)!, status: e.status as KnowledgeScope }] : []; });
    const unrecorded = present.filter(id => !holders.some(h => h.character_id === id)).map(id => ({ character_id: id, name: names.get(id)! }));
    return { fact_id: f.id, statement: clean(f.statement), truth: sceneExtrasOf(context)?.fact_truth.get(f.id), holders, unrecorded, source: `campaign.fact:${f.id}` };
  });
}
function deriveSocial(context: TurnContext, names: ReadonlyMap<string, string>): SceneSocial {
  const s = context.social;
  // Social sources carry plain names. Present people are renamed to their narrator-safe display name (exact, unambiguous matches only),
  // so a person Nicco has not met by name is never repeated under a long masked label or their hidden name.
  const byName = new Map<string, string | null>();
  for (const c of context.characters) { const real = c.profile.name; if (real) byName.set(real, byName.has(real) ? null : names.get(c.id)!); }
  const shown = (name: string) => byName.get(name) ?? name;
  return { legal: s.legal.map(l => ({ character_id: l.character_id, name: names.get(l.character_id) ?? shown(l.name), status: l.status,
      ...(l.holder ? { holder: ("holder_id" in l && l.holder_id ? names.get(l.holder_id as string) : undefined) ?? shown(l.holder) } : {}), ...("holder_id" in l && l.holder_id ? { holder_id: l.holder_id as string } : {}),
      ...("papers" in l && l.papers ? { papers: l.papers as string } : {}), ...("provenance" in l && l.provenance ? { provenance: l.provenance as string } : {}) })),
    households: s.households.map(h => ({ id: h.id, name: h.name, keepers: h.keepers.map(shown), members: h.members.map(m => ({ ...m, name: names.get(m.character_id) ?? shown(m.name) })),
      present_non_members: h.present_non_members.map(m => ({ ...m, name: names.get(m.character_id) ?? shown(m.name) })), rules: [...h.rules] })),
    relationships: s.relationships.map(r => ({ ...r, from: shown(r.from), to: shown(r.to) })) };
}
function deriveScheduled(context: TurnContext, names: ReadonlyMap<string, string>): SceneEvent[] {
  return context.scheduled_events.map(e => ({ event_id: e.id, title: clean(e.title), ...(clean(e.description) ? { description: clean(e.description) } : {}), world_minute: e.scheduled_world_minute,
    participant_ids: [...(e.participants ?? [])], participants: (e.participants ?? []).flatMap(id => { const n = externalName(context, names, id); return n ? [n] : []; }) }));
}
function deriveDevelopments(context: TurnContext, names: ReadonlyMap<string, string>): SceneDevelopment[] {
  const present = new Set(context.characters.map(c => c.id));
  return (sceneExtrasOf(context)?.developments ?? []).filter(d => present.has(d.character_id)).map(d => ({ ...d, name: names.get(d.character_id)! }));
}

/** Stage 1: the raw projection. Pure and total over a TurnContext; every present character and item is a candidate. */
export function buildSceneStateProjection(context: TurnContext): SceneStateProjection {
  const names = sceneDisplayNames(context), resources = context.primary.scene.player_resources.mana;
  return Object.freeze({
    location: deriveLocation(context), time: deriveTime(context), present: derivePresence(context, names), character_state: deriveCharacterState(context, names),
    items: deriveItems(context, names), player: { mana: { current: resources.current, max: resources.max }, gold: context.social.nicco_gold }, knowledge: deriveKnowledge(context, names),
    social: deriveSocial(context, names), scheduled: deriveScheduled(context, names), developments: deriveDevelopments(context, names),
  });
}
