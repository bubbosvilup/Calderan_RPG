import { carriedItems } from "../campaign/inventory.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { characterView } from "../campaign/projections.js";
import { relationshipHeadline } from "../campaign/relationship-summary.js";
import { temporalGrounding, type TimeOfDay } from "../turn/temporal-grounding.js";
import { isIdentityNameFact } from "../campaign/identity-knowledge.js";
import { isNpcPlus } from "../campaign/premium-characters.js";
import { describeWeather, environmentAt, weatherWords, type WeatherStatus } from "../world/environment.js";
import { formatCalendarDate, isGreatIlluminationYear, isLeapYear } from "../world/calendar.js";

/**
 * Read-only UI view model. Derived on demand from the authoritative snapshot and the authored canon; it owns no state, is plain
 * JSON, and contains no private canon, narrator-only facts, knowledge edges, reflection notes or evidence. A UI renders this and
 * never the CampaignSnapshot.
 */
export type SessionStatus = "idle" | "running_turn" | "compacting_context" | "closed";
export interface ProviderStatus { readonly mode: "live" | "stub"; readonly configured: boolean; readonly narrator_model?: string; readonly controller_model?: string; readonly reflection_model?: string }
export interface ViewItem { readonly id: string; readonly name: string; readonly description?: string }
export interface ViewEquipped extends ViewItem { readonly slot: string; readonly mode: "worn" | "held" }
export interface ViewHouseholdMember {
  /** Player-safe label for the thin playtest interface; never an unknown canonical self-name. */
  readonly display_name: string;
  readonly id: string; readonly name: string; readonly role?: string; readonly presence: "present" | "away";
  /** Only while present in the player's scene. The engine does not give the player the whereabouts of absent people. */
  readonly location?: { readonly id: string; readonly name: string };
  readonly relationship_to_player?: string; readonly conditions: readonly string[]; readonly presentation?: string;
  readonly legal?: { readonly status: "free" | "enslaved"; readonly holder_name?: string };
  readonly equipment: readonly ViewEquipped[];
  /** Household membership and NPC+ promotion are distinct facts: the Heartstone rite sets both, only membership can later end. */
  readonly household_member: true; readonly npc_plus: boolean;
}
export interface SessionView {
  readonly context_budget?: import("../turn/context-budget.js").ContextBudgetSnapshot;
  readonly context_compaction?: { readonly status: "idle" | "compacting"; readonly trigger?: import("./context-compaction.js").CompactionReason; readonly last_result?: import("./context-compaction.js").CompactionResult };
  readonly session: { readonly campaign_id: string; readonly revision: number; readonly status: SessionStatus; readonly save: { readonly state: "unsaved" | "saved"; readonly last_saved_revision: number | null;
    /** Save/Load v1 compact status: a save in flight, the last save failure (cleared by a successful save), autosave mode, history append failure. */
    readonly saving?: boolean; readonly error?: string; readonly autosave?: "off" | "on" | "stopped"; readonly transcript_error?: true };
    readonly provider: ProviderStatus; readonly dataset_id: string };
  readonly scene: {
    readonly location: { readonly id: string; readonly name: string; readonly summary: string; readonly parent_name?: string };
    readonly exits: readonly { readonly target_id: string; readonly name: string; readonly minutes: number; readonly description: string; readonly kind?: string }[];
    readonly time: { readonly world_minute: number; readonly day: number; readonly minute_of_day: number; readonly time_of_day: TimeOfDay };
    /** Calendar, season, observances and outside weather derived from world_minute (read model for a future calendar/weather UI; display strings only). */
    readonly environment: {
      readonly date_text: string; readonly kind: "regular" | "intercalary"; readonly year: number; readonly is_leap_year: boolean; readonly great_illumination: boolean;
      readonly month_name?: string; readonly day_of_month?: number; readonly weekday_name?: string; readonly season_name?: string; readonly intercalary_name?: string;
      readonly observances: readonly string[];
      /** Authored exposure of this place (not inherited): `outdoor` weather applies here directly; otherwise it is the weather OUTSIDE. */
      readonly exposure: "indoor" | "outdoor" | "sheltered" | "unknown";
      readonly weather: { readonly status: WeatherStatus; readonly summary?: string; readonly condition?: string; readonly temperature?: string; readonly note?: string };
    };
    readonly present: readonly { readonly id: string; readonly name: string }[];
  };
  readonly player: { readonly id: "nicco"; readonly name: string; readonly mana: { readonly current: number; readonly max: number }; readonly gold: number | null;
    readonly equipment: readonly ViewEquipped[]; readonly inventory: readonly ViewItem[] };
  /** Every promoted (NPC+) character, whether or not they still live in the household (promotion is not undone by leaving). Display names only. */
  readonly promoted: readonly { readonly name: string; readonly household_member: boolean }[];
  readonly household: readonly { readonly id: string; readonly name: string; readonly members: readonly ViewHouseholdMember[]; readonly rules: readonly { readonly id: string; readonly text: string }[] }[];
}
export interface ViewContext { readonly status: SessionStatus; readonly last_saved_revision: number | null; readonly provider: ProviderStatus;
  /** Block 7: optional side-store state changed without a semantic revision and is not saved yet. */
  readonly unsaved_optional?: boolean;
  readonly save_status?: { readonly saving: boolean; readonly error?: string; readonly autosave: "off" | "on" | "stopped"; readonly transcript_error?: true } }

const playerVisible = (entity: DeepReadonly<{ knowledge?: { visibility: { player: boolean } } }> | undefined) => entity?.knowledge?.visibility.player !== false;
export function deriveSessionView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, context: ViewContext): SessionView {
  const name = (id: string): string => { try {
    const record = snapshot.characters.find(c => c.id === id), known = characterView(snapshot, world, id).profile.name;
    // An unnamed person held as a slave is "Slave" until a legitimate introduction gives the name (same entity, same id).
    return known ?? (record?.origin.kind === "created" && snapshot.legal_statuses.some(l => l.character_id === id && l.status === "enslaved") ? "Slave" : record?.origin_snapshot?.label ?? id);
  } catch { return id; } };
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
  const { day, minute_of_day, time_of_day } = temporalGrounding(minute);
  const knownNames = new Set(snapshot.facts.filter(f => isIdentityNameFact(f) && snapshot.knowledge.some(k => k.character_id === "nicco" && k.fact_id === f.id && k.status === "knows")).flatMap(f => f.content.kind === "canonical" ? [f.content.entity_id] : []));
  const safeName = (id: string) => {
    const registered = snapshot.characters.find(c => c.id === id);
    const canonicalId = registered?.origin.kind === "canonical" ? registered.origin.canonical_entity_id : world.getEntity(id)?.type === "character" ? id : undefined;
    if (canonicalId && !knownNames.has(canonicalId)) return "Unfamiliar household member";
    const label = name(id);
    return label === id ? "Household member" : label;
  };
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
      return { id: m.character_id, name: name(m.character_id), display_name: safeName(m.character_id), ...(m.role ? { role: m.role } : {}), presence: here ? "present" : "away",
        ...(here ? { location: { id: location, name: place?.display_name ?? location } } : {}), ...(edge ? { relationship_to_player: relationshipHeadline(edge) } : {}),
        conditions: [...(state.conditions ?? [])], ...(state.presentation ? { presentation: state.presentation } : {}),
        ...(legal ? { legal: { status: legal.status, ...(legal.holder_id ? { holder_name: name(legal.holder_id) } : {}) } } : {}), equipment: equipmentOf(m.character_id), household_member: true, npc_plus: isNpcPlus(snapshot, m.character_id) };
    }),
    rules: (h.rules ?? []).filter(r => r.active).map(r => ({ id: r.id, text: r.text })),
  }));
  // Item lifecycle: inventory = what the character physically carries (authoritative item position, via the one derived query layer).
  // Ownership and ground placement never put an item here; equipped items are listed under `equipment`.
  const carried = carriedItems(snapshot, "nicco").map(i => itemName(i.id));
  return structuredClone({ session: { campaign_id: snapshot.campaign_id, revision: snapshot.revision, status: context.status, dataset_id: snapshot.dataset_id,
      save: { state: context.last_saved_revision === snapshot.revision && !context.unsaved_optional ? "saved" as const : "unsaved" as const, last_saved_revision: context.last_saved_revision, ...(context.save_status ?? {}) }, provider: context.provider },
    scene: { location: { id: location, name: place?.display_name ?? location, summary: place?.summary ?? "", ...(parent ? { parent_name: parent.display_name } : {}) }, exits,
      time: { world_minute: minute, day, minute_of_day, time_of_day }, environment: viewEnvironment(world, snapshot, minute, location), present },
    player: { id: "nicco" as const, name: name("nicco"), mana: { current: snapshot.runtime.mana.current, max: snapshot.runtime.mana.max }, gold, equipment: equipmentOf("nicco"), inventory: carried },
    promoted: snapshot.premium_characters.map(p => ({ name: safeName(p.character_id), household_member: snapshot.households.some(h => h.members.some(m => m.character_id === p.character_id && m.status === "member")) })),
    household: households });
}

function viewEnvironment(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, minute: number, location: string): SessionView["scene"]["environment"] {
  const e = environmentAt(world, snapshot.campaign_id, minute, location), c = e.calendar;
  const weather = e.weather ? { status: e.weather_status, summary: describeWeather(e.weather), condition: weatherWords.condition[e.weather.condition], temperature: weatherWords.temperature[e.weather.temperature] } : { status: e.weather_status, ...(e.weather_status === "needs_climate_zone" ? { note: "Climate zone unresolved" } : e.weather_status === "no_climate" ? { note: "No climate authored for this place" } : {}) };
  return { date_text: formatCalendarDate(c), kind: c.kind, year: c.year, is_leap_year: isLeapYear(c.year), great_illumination: c.kind === "intercalary" && isGreatIlluminationYear(c.year),
    ...(c.kind === "regular" ? { month_name: c.month_name, day_of_month: c.day_of_month, weekday_name: c.weekday_name, season_name: c.season_name } : { intercalary_name: c.intercalary_name }),
    observances: e.observances.map(o => o.name), exposure: e.exposure, weather };
}
