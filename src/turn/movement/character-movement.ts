import { playerDestination, resolvePlayerTravel } from "./player-travel.js";
import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import type { TurnContext } from "../context-builder.js";
import { reachable, resolveDestination } from "../natural-actions.js";
import { blankQuotes, escapeRegExp as esc, sentencesOf } from "../language/text.js";
import { GATES } from "../language/gates.js";
import { activeNpcPlus } from "../../campaign/premium-characters.js";
import { edgeDirection, routeDirection } from "../../world/vertical-direction.js";
import { findRoute } from "../../world/travel.js";
import { CARRY, HELD, TO } from "../narration-facts/movement-vocabulary.js";

/**
 * Location Continuity Pass 1.3. A campaign (created) character's location changes only when the current turn clearly establishes
 * that THAT character completed movement to a known location. There is no party, follower, companion or proximity model: Nicco
 * moving never moves anyone else; ownership, household membership, affection or earlier presence are never movement.
 *
 * Two sources, both deterministic:
 * - Player-authored carrying (runtime, pre-narration): Nicco physically carries a present campaign character as part of his own
 *   resolved movement ("*picks Maren up and carries her back to Heartstone*"). Transport is the player's own physical act, so the
 *   carried person moves with him to his arrival location, like his own movement. No route, no carry.
 * - Narrated completed movement (evidence for the controller's `move_character`): "Maren follows him into the courtyard", "Nicco
 *   carries her through the tower door", "Tomas walks back to the market", "They reach Heartstone, Maren still in his arms". The
 *   mover must resolve to exactly one movable character, the movement must be completed (no intention, hedge, gaze or plan), and
 *   the destination must resolve to one concrete known location. Anything else changes nothing.
 */
/** `entrant`: not in the scene Nicco is in or leaves (elsewhere or off-scene). Such a character counts only as someone ARRIVING in Nicco's scene, by name. */
export interface MovableCharacter { readonly id: string; readonly names: readonly string[]; readonly sex?: "female" | "male"; readonly entrant?: true }
export interface CharacterMovement { readonly character_id: string; readonly location_id: string; readonly source_sentence: string }

/**
 * Created, living characters currently at one of these locations (the scene Nicco is in or is leaving this turn). NPC+ Pass 1: with
 * `world`, ACTIVE authored NPC+ there too — once an authored character is an active household member, their current location is
 * runtime-authoritative and moves only through the same evidence rules (never automatically, never by request, membership or
 * ownership). Other authored NPCs stay canon-placed.
 */
export function movableCharacters(snapshot: DeepReadonly<CampaignSnapshot>, locations: readonly string[], world?: WorldStore): MovableCharacter[] {
  const created = snapshot.characters.filter(c => c.id !== "nicco" && c.origin.kind === "created" && c.current.status !== "dead" && !!c.current.current_location && locations.includes(c.current.current_location)).flatMap(c => {
    const name = c.profile.name ?? c.origin_snapshot?.label;
    if (!name) return [];
    const sex = /^(?:female|woman)$/i.test(c.profile.sex ?? "") ? "female" as const : /^(?:male|man)$/i.test(c.profile.sex ?? "") ? "male" as const : undefined;
    return [{ id: c.id, names: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(sex ? { sex } : {}) }];
  });
  if (!world) return created;
  const npcPlus = activeNpcPlus(snapshot);
  return [...created, ...persistentCharactersAt(snapshot, world, locations).filter(m => npcPlus.has(m.id) && !created.some(c => c.id === m.id))];
}

/** H5.1: where a persistent character is in a snapshot (created: its record; authored NPC: its runtime location). */
export function characterLocation(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, id: string): string | undefined {
  if (id === "nicco") return snapshot.runtime.scene.player_location;
  const created = snapshot.characters.find(c => c.id === id && c.origin.kind === "created");
  if (created) return created.current.status === "dead" ? undefined : created.current.current_location;
  // Every authored NPC with an established default is in runtime npc_locations (snapshot validation guarantees it).
  // OFF_SCENE has no current location (its last known place is not where the character is).
  return world.getEntity(id)?.type === "character" ? snapshot.runtime.npc_locations.find(n => n.character_id === id)?.current_location : undefined;
}
/**
 * Final movement closure: ACTIVE authored NPC+ whose authoritative location is NOT in these scenes (located elsewhere, or off-scene).
 * They never follow, never leave; they can only be narrated ARRIVING where Nicco is, by name (see narratedMovements).
 */
export function npcPlusEntrants(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, locations: readonly string[]): MovableCharacter[] {
  const npcPlus = activeNpcPlus(snapshot), inScope = new Set(movableCharacters(snapshot, locations, world).map(m => m.id));
  return world.getEntitiesByType("character").filter(e => e.role === "npc" && npcPlus.has(e.id) && !inScope.has(e.id) && !!e.knowledge?.visibility.narrator
    && !snapshot.characters.some(c => c.id === e.id && c.origin.kind === "created")).map(e => {
    const name = e.display_name ?? e.name ?? e.id;
    return { id: e.id, names: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(e.sex === "female" || e.sex === "male" ? { sex: e.sex } : {}), entrant: true as const };
  });
}
/**
 * The ONE location a bare vertical direction ("goes upstairs") can mean for someone standing at `from`: the single directly connected
 * location whose edge is read as that direction by the structured world graph. Zero or several candidates, or a container: undefined.
 */
export function uniqueVerticalNeighbour(world: WorldStore, from: string, direction: "UP" | "DOWN"): string | undefined {
  const place = world.getEntity(from);
  if (place?.type !== "location") return undefined;
  const hits = [...new Set(place.connections.map(c => c.target))].filter(t => edgeDirection(world, from, t) === direction);
  const only = hits.length === 1 ? hits[0]! : undefined;
  return only && !world.getChildren(only).some(e => e.type === "location") ? only : undefined;
}
/**
 * Final movement closure (live batch 3): a completed exit through a door whose own sentence names no place ("steps through and pulls it shut
 * behind her") goes to the ONE known place the draft's nearby door wording names ("the courtyard door", "the door that leads out to the
 * courtyard", "through the door into the walled courtyard"), only when that place is directly connected to where she is. The exit's facts
 * carry that wording (`door_places`); zero or several candidates, a container, or a place with no direct connection: undefined (the
 * departure stays destination-less, i.e. OFF_SCENE).
 */
export function doorDestinationFromPlaces(places: readonly string[], from: string, context: TurnContext, world: WorldStore): string | undefined {
  const found = new Set<string>();
  for (const phrase of places) {
    const words = (phrase ?? "").trim().split(/\s+/).filter(Boolean);
    search: for (let len = words.length; len > 0; len--) for (let start = 0; start + len <= words.length; start++) {
      const hit = resolveDestination(words.slice(start, start + len).join(" "), context, world);
      if (hit && hit !== from) { found.add(hit); break search; }
    }
  }
  const place = world.getEntity(from);
  const [only] = found.size === 1 ? [...found] : [];
  return only && only !== from && place?.type === "location" && place.connections.some(c => c.target === only) && !world.getChildren(only).some(e => e.type === "location") ? only : undefined;
}

/**
 * H5.1: every persistent character (created or authored NPC) at one of these locations, by name. Used by the narration audit's
 * movement backstop only: authored NPCs are never movers for authorization (their whereabouts stay canon-owned), but narration that
 * moves them must still be detected. Authored names come from canon; sex only from a declared profile or authored sex.
 */
export function persistentCharactersAt(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, locations: readonly string[]): MovableCharacter[] {
  const created = movableCharacters(snapshot, locations);
  const authored = world.getEntitiesByType("character").filter(e => e.role === "npc" && !created.some(c => c.id === e.id)).flatMap(e => {
    const where = characterLocation(snapshot, world, e.id);
    if (!where || !locations.includes(where) || !e.knowledge?.visibility.narrator) return [];
    const name = e.display_name ?? e.name ?? e.id;
    return [{ id: e.id, names: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(e.sex === "female" || e.sex === "male" ? { sex: e.sex } : {}) }];
  });
  return [...created, ...authored];
}

/** Not a completed movement: modality, intention, plans, negation, gaze, questions. */
const NOT_DONE = GATES.movement_not_done;

/** A pronoun resolves only when exactly one movable character is compatible with it (two women: "she" resolves to nobody). */
function byPronoun(movable: readonly MovableCharacter[], pronoun: string): string | undefined {
  const want = /^(?:her|she)$/i.test(pronoun) ? "female" : /^(?:him|he)$/i.test(pronoun) ? "male" : undefined;
  if (!want) return undefined;
  const fits = movable.filter(m => !m.sex || m.sex === want);
  return fits.length === 1 ? fits[0]!.id : undefined;
}
function byName(movable: readonly MovableCharacter[], token: string): string | undefined {
  const hits = movable.filter(m => m.names.some(n => n.toLowerCase() === token.toLowerCase()));
  return hits.length === 1 ? hits[0]!.id : undefined;
}
/**
 * One concrete known location for a destination phrase. A container ("Heartstone") or an entry phrase ("the tower door", "inside",
 * "home") resolves to where Nicco arrived this turn when that lies inside it; otherwise only a location with no sub-locations counts.
 */
export function concreteDestination(phrase: string, arrival: string, origin: string, context: TurnContext, world: WorldStore): string | undefined {
  const cleaned = phrase.replace(/\s+(?:with|while|as|and|where|before|after|still)\b.*$/i, "").trim();
  const dest = cleaned ? resolveDestination(cleaned, context, world) : undefined;
  if (dest) {
    if (dest === arrival || world.getAncestors(arrival).some(a => a.id === dest)) return arrival;
    return world.getChildren(dest).some(e => e.type === "location") ? undefined : dest;
  }
  return arrival !== origin && /^(?:the\s+)?(?:(?:tower|main|front|heavy|oak|wooden)\s+)?(?:door|doorway|threshold|inside|in|home|house|tower|room|hall)\b(?!\s+(?:of|to|at|into|from|next|beyond|across|near|by|on|under|behind\s+(?!him\b|them\b)|in\s+the)\b)/i.test(cleaned) ? arrival : undefined;
}

/**
 * Player-authored carrying. `natural` is the turn's already-resolved runtime (player movement); the carry clause may also carry its
 * own destination ("carries her back to Heartstone"), resolved through the same route rule as ordinary movement (no teleport).
 */
export function resolvePlayerCarry(input: string, snapshot: DeepReadonly<CampaignSnapshot>, context: TurnContext, world: WorldStore, natural: readonly CampaignCommand[]):
  { readonly runtime: readonly CampaignCommand[]; readonly notes: readonly string[]; readonly carried?: string } {
  const here = snapshot.runtime.scene.player_location;
  if (resolvePlayerTravel(input, here, context, world).actions.some(a => a.status === "ambiguous")) return { runtime: [], notes: [] };
  // H5.1: an authored NPC present in the scene can be carried too (the player's own physical act; CampaignState moves authored NPCs
  // through runtime locations). Who may move by *narration* is unchanged: authorization still accepts only created characters.
  const movable = persistentCharactersAt(snapshot, world, [here]).filter(m => context.characters.some(c => c.id === m.id));
  if (!movable.length) return { runtime: [], notes: [] };
  const names = movable.flatMap(m => m.names).map(esc).join("|");
  const flat = input.replace(/\*/g, " . ");
  const clauses = flat.split(/(?<=[.!?;])\s+|\s+(?:and then|then)\s+/);
  let consumed = 0;
  for (const clause of clauses) {
    const start = flat.indexOf(clause, consumed); consumed = start < 0 ? consumed : start + clause.length;
    const m = clause.match(new RegExp(`\\b(?:picks?|picked|pick)\\s+(${names}|her|him)\\s+up\\b|\\b${CARRY}\\s+(${names}|her|him)\\b|\\b(${names}|her|him)\\s+${HELD}`, "i"));
    if (!m || NOT_DONE.test(clause.slice(0, m.index! + m[0].length))) continue;
    const token = (m[1] ?? m[2] ?? m[3])!;
    // H5.1: a pronoun with no unique compatible person resolves to the one movable person the player named before it ("Maren has
    // twisted her ankle. I lift her…"); two different names before it resolve nobody.
    const before = flat.slice(0, Math.max(0, start) + m.index!);
    const named = [...new Set(movable.filter(p => p.names.some(n => new RegExp(`\\b${esc(n)}\\b`).test(before))).map(p => p.id))];
    const antecedent = /^(?:her|him)$/i.test(token) && named.length === 1 && byPronoun(movable.filter(p => p.id === named[0]), token) ? named[0] : undefined;
    const who = byName(movable, token) ?? byPronoun(movable, token) ?? antecedent;
    if (!who) continue;
    const moved = natural.find((c): c is Extract<CampaignCommand, { kind: "runtime_delta" }> => c.kind === "runtime_delta" && !!c.delta.player_location);
    if (moved) return { runtime: [{ kind: "move_character", character_id: who, location_id: moved.delta.player_location! }], notes: [], carried: who };
    // The carry clause itself names where he takes them.
    const rest = flat.slice(Math.max(0, start) + m.index!);
    const dest = rest.match(new RegExp(`\\b${TO}\\s+([^.;,!?*]+)`, "i"));
    if (!dest) continue;
    const target = playerDestination(dest[2]!.trim(), world);
    if (!target) continue;
    const route = reachable(target, here, world);
    const name = movable.find(x => x.id === who)!.names[0]!;
    if (!route.target) return { runtime: [], notes: [`Nicco sets out carrying ${name} toward ${world.getEntity(target)?.display_name ?? target}, but no route there from ${world.getEntity(here)?.display_name ?? here} is established yet: neither of them has arrived; both are still at ${world.getEntity(here)?.display_name ?? here}.`] };
    return { runtime: [{ kind: "runtime_delta", delta: { player_location: route.target, time_advance_minutes: route.route!.minutes } }, { kind: "move_character", character_id: who, location_id: route.target }], notes: [], carried: who };
  }
  return { runtime: [], notes: [] };
}
