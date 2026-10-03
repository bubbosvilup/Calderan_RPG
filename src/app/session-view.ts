import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { characterView } from "../campaign/projections.js";
import { relationshipHeadline } from "../campaign/relationship-summary.js";
import { WORLD_DAY_MINUTES } from "../world/runtime-domain.js";

/**
 * Read-only UI view model. Derived on demand from the authoritative snapshot and the authored canon; it owns no state, is plain
 * JSON, and contains no private canon, narrator-only facts, knowledge edges, reflection notes or evidence. A UI renders this and
 * never the CampaignSnapshot.
 */
export type SessionStatus = "idle" | "running_turn" | "post_turn" | "compacting_context" | "closed";
export interface ProviderStatus { readonly mode: "live" | "stub"; readonly configured: boolean; readonly narrator_model?: string; readonly controller_model?: string; readonly reflection_model?: string }
export interface ViewItem { readonly id: string; readonly name: string; readonly description?: string }
export interface ViewEquipped extends ViewItem { readonly slot: string; readonly mode: "worn" | "held" }
export interface ViewHouseholdMember {
  readonly id: string; readonly name: string; readonly role?: string; readonly presence: "present" | "away";
  /** Only while present in the player's scene. The engine does not give the player the whereabouts of absent people. */
  readonly location?: { readonly id: string; readonly name: string };
  readonly relationship_to_player?: string; readonly conditions: readonly string[]; readonly presentation?: string;
  readonly legal?: { readonly status: "free" | "enslaved"; readonly holder_name?: string };
  readonly equipment: readonly ViewEquipped[];
}
export interface SessionView {
  readonly context_budget?: import("../turn/context-budget.js").ContextBudgetSnapshot;
  readonly context_compaction?: { readonly status: "idle" | "compacting"; readonly trigger?: import("./context-compaction.js").CompactionReason; readonly last_result?: import("./context-compaction.js").CompactionResult };
  readonly session: { readonly campaign_id: string; readonly revision: number; readonly status: SessionStatus; readonly save: { readonly state: "unsaved" | "saved"; readonly last_saved_revision: number | null };
    readonly provider: ProviderStatus; readonly dataset_id: string };
  readonly scene: {
    readonly location: { readonly id: string; readonly name: string; readonly summary: string; readonly parent_name?: string };
    readonly exits: readonly { readonly target_id: string; readonly name: string; readonly minutes: number; readonly description: string; readonly kind?: string }[];
    readonly time: { readonly world_minute: number; readonly day: number; readonly minute_of_day: number };
    readonly present: readonly { readonly id: string; readonly name: string }[];
  };
  readonly player: { readonly id: "nicco"; readonly name: string; readonly mana: { readonly current: number; readonly max: number }; readonly gold: number | null;
    readonly equipment: readonly ViewEquipped[]; readonly inventory: readonly ViewItem[] };
  readonly household: readonly { readonly id: string; readonly name: string; readonly members: readonly ViewHouseholdMember[]; readonly rules: readonly { readonly id: string; readonly text: string }[] }[];
}
export interface ViewContext { readonly status: SessionStatus; readonly last_saved_revision: number | null; readonly provider: ProviderStatus }

const playerVisible = (entity: DeepReadonly<{ knowledge?: { visibility: { player: boolean } } }> | undefined) => entity?.knowledge?.visibility.player !== false;
export function deriveSessionView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, context: ViewContext): SessionView {
  const name = (id: string): string => { try { return characterView(snapshot, world, id).profile.name ?? snapshot.characters.find(c => c.id === id)?.origin_snapshot?.label ?? id; } catch { return id; } };
  const itemName = (id: string): ViewItem => {
    const item = snapshot.items.find(i => i.id === id)!;
    const canonical = item.origin.kind === "canonical" ? world.getEntity(item.origin.canonical_entity_id) : undefined;
    const label = item.name ?? canonical?.display_name ?? id, description = item.description ?? (canonical?.summary || undefined);
    return { id, name: label, ...(description ? { description } : {}) };
  };
  const equipmentOf = (characterId: string): ViewEquipped[] => snapshot.items.flatMap(i => i.position.kind === "equipped" && i.position.character_id === characterId
    ? [{ ...itemName(i.id), slot: i.position.slot, mode: i.position.mode }] : []).sort((a, b) => a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0);
  const location = snapshot.runtime.scene.player_location, place = world.getEntity(location);
  const minute = snapshot.runtime.scene.world_time.world_minute;
  const parent = place?.parent ? world.getEntity(place.parent) : undefined;
  const exits = place?.type === "location" ? place.connections.filter(c => playerVisible(world.getEntity(c.target))).map(c => ({ target_id: c.target, name: world.getEntity(c.target)?.display_name ?? c.target, minutes: c.minutes, description: c.description, ...(c.kind ? { kind: c.kind } : {}) })) : [];
  const inScene = (id: string): boolean => { try { const c = characterView(snapshot, world, id).current; return c.current_location === location && c.status !== "dead" && c.status !== "inactive"; } catch { return false; } };
  const canonicalNpcs = snapshot.runtime.npc_locations.filter(n => n.character_id !== "nicco" && world.getEntity(n.character_id)?.type === "character" && playerVisible(world.getEntity(n.character_id))).map(n => n.character_id);
  const created = snapshot.characters.filter(c => c.origin.kind === "created").map(c => c.id);
  const present = [...new Set([...canonicalNpcs, ...created])].filter(inScene).sort().map(id => ({ id, name: name(id) }));
  const gold = snapshot.funds.find(f => f.character_id === "nicco")?.gold ?? null;
  const households = snapshot.households.filter(h => h.members.some(m => m.character_id === "nicco" && m.status === "member")).map(h => ({
    id: h.id, name: h.name ?? h.id,
    members: h.members.filter(m => m.status === "member" && m.character_id !== "nicco" && m.role !== "owner").map((m): ViewHouseholdMember => {
      const here = inScene(m.character_id), legal = snapshot.legal_statuses.find(l => l.character_id === m.character_id);
      const edge = snapshot.relationships.find(e => e.from_character_id === m.character_id && e.to_character_id === "nicco" && e.dimensions);
      const state = characterView(snapshot, world, m.character_id).current;
      return { id: m.character_id, name: name(m.character_id), ...(m.role ? { role: m.role } : {}), presence: here ? "present" : "away",
        ...(here ? { location: { id: location, name: place?.display_name ?? location } } : {}), ...(edge ? { relationship_to_player: relationshipHeadline(edge) } : {}),
        conditions: [...(state.conditions ?? [])], ...(state.presentation ? { presentation: state.presentation } : {}),
        ...(legal ? { legal: { status: legal.status, ...(legal.holder_id ? { holder_name: name(legal.holder_id) } : {}) } } : {}), equipment: equipmentOf(m.character_id) };
    }),
    rules: (h.rules ?? []).filter(r => r.active).map(r => ({ id: r.id, text: r.text })),
  }));
  const carried = snapshot.items.filter(i => i.position.kind === "carried" && i.position.character_id === "nicco" || i.owner_id === "nicco" && i.position.kind === "stored").map(i => itemName(i.id));
  return structuredClone({ session: { campaign_id: snapshot.campaign_id, revision: snapshot.revision, status: context.status, dataset_id: snapshot.dataset_id,
      save: { state: context.last_saved_revision === snapshot.revision ? "saved" as const : "unsaved" as const, last_saved_revision: context.last_saved_revision }, provider: context.provider },
    scene: { location: { id: location, name: place?.display_name ?? location, summary: place?.summary ?? "", ...(parent ? { parent_name: parent.display_name } : {}) }, exits,
      time: { world_minute: minute, day: Math.floor(minute / WORLD_DAY_MINUTES), minute_of_day: minute % WORLD_DAY_MINUTES }, present },
    player: { id: "nicco" as const, name: name("nicco"), mana: { current: snapshot.runtime.mana.current, max: snapshot.runtime.mana.max }, gold, equipment: equipmentOf("nicco"), inventory: carried },
    household: households });
}
