import type { WorldStore } from "../../world/world-store.js";
import { routeDirection } from "../../world/vertical-direction.js";
import { findRoute } from "../../world/travel.js";
import type { TurnContext } from "../context/context-builder.js";
import { type CharacterMovement, type MovableCharacter, concreteDestination, uniqueVerticalNeighbour } from "./character-movement.js";
import type { EntityArrivedFact, EntityDepartedFact, EntityFollowedFact, EntityMovedFact, EntityMovedWithPlayerFact, EntityPresentFact, MovementFact, NarrationFacts } from "../narration-facts/index.js";

/**
 * Movement POLICY over shared NarrationFacts. The facts say what the prose asserts; this module decides what that is worth as
 * evidence: who may move, where a destination phrase leads, whether a route exists, who may follow, and which exits count.
 * Only COMPLETED, narrator-prose facts are ever evidence. Nothing here reads text.
 */

export interface MovementWhere {
  readonly origin: string; readonly arrival: string; readonly locate?: (id: string) => string | undefined;
  /** Audit only (D-24): `arrival` is where the NARRATION says the player went but state did not take them. Reads the dependent follow forms, route-free and direction-agnostic. */
  readonly hypothetical?: boolean;
}

type ClauseFact = EntityMovedFact | EntityMovedWithPlayerFact | EntityArrivedFact | EntityFollowedFact;
const WALK_FORMS = new Set(["walk_to", "walk_inside", "carried_to", "led_to", "held_arrival"]);
const IMPLICIT_ARRIVALS = new Set(["arrive_into", "descend", "duck_below", "descent_marked"]);

/** The movement-form facts, grouped by the clause they were read from, in recognition order. */
function byClause(facts: NarrationFacts): ClauseFact[][] {
  const groups: ClauseFact[][] = []; let key = "";
  for (const f of facts.movement) {
    const isForm = (f.kind === "entity_moved" && (f.form === "walk_to" || f.form === "walk_inside" || f.form === "bare_vertical")) || f.kind === "entity_moved_with_player"
      || (f.kind === "entity_arrived" && IMPLICIT_ARRIVALS.has(f.form)) || (f.kind === "entity_followed");
    if (!isForm || f.modality === "quoted") continue;
    const k = `${f.span.sentence_index}:${f.span.clause_index}`;
    if (k !== key) { groups.push([]); key = k; }
    groups.at(-1)!.push(f as ClauseFact);
  }
  return groups;
}

/**
 * Completed movements of movable characters narrated this turn (at most one per character, first wins). `followers`: active NPC+ and
 * other follow candidates eligible for implicit-destination following, only when the player moved.
 */
export function characterMovementsFromFacts(facts: NarrationFacts, movable: readonly MovableCharacter[], where: MovementWhere, context: TurnContext, world: WorldStore, followers: ReadonlySet<string> = new Set()): CharacterMovement[] {
  if (!movable.length) return [];
  const ids = new Set(movable.map(m => m.id)), entrants = new Set(movable.filter(m => m.entrant).map(m => m.id)), localIds = new Set(movable.filter(m => !m.entrant).map(m => m.id));
  const placeOf = (id: string) => where.locate ? where.locate(id) : where.origin;
  const entrantOk = (id: string, location: string) => !entrants.has(id) || location === where.arrival;
  /** Never invent geography: a mover whose own location is known needs a structured route to the destination. */
  const routed = (id: string, location: string) => { if (where.hypothetical) return true; const here = placeOf(id); return !here || here === location || !!findRoute(world, here, location); };
  const out: CharacterMovement[] = [];
  // DOWN-only follow forms need the player's same-turn route to be a proven descent (UNKNOWN/OTHER fail closed).
  const descent = where.origin !== where.arrival && followers.size > 0 && (where.hypothetical || routeDirection(world, where.origin, where.arrival) === "DOWN");
  const isArrival = (phrase: string) => !!phrase.trim() && concreteDestination(phrase, where.arrival, where.origin, context, world) === where.arrival;
  for (const clause of byClause(facts)) {
    for (const f of clause) {
      if (f.modality !== "completed") continue;
      if (f.kind === "entity_moved_with_player" || (f.kind === "entity_moved" && WALK_FORMS.has(f.form))) {
        const id = f.subject.entity_id, phrase = f.destination!.phrase;
        if (!id || !ids.has(id)) continue;
        const location = concreteDestination(phrase, where.arrival, where.origin, context, world) ?? (entrants.has(id) && /^(?:inside|in)$/i.test(phrase.trim()) ? where.arrival : undefined);
        if (location && entrantOk(id, location) && routed(id, location) && !out.some(o => o.character_id === id)) out.push({ character_id: id, location_id: location, source_sentence: f.sentence });
      } else if (f.kind === "entity_moved" && f.form === "bare_vertical") {
        // A bare vertical direction ("goes upstairs"): only the unique structured neighbour in that direction, from the mover's OWN location.
        const id = f.subject.entity_id, here = id ? placeOf(id) : undefined;
        const location = id && ids.has(id) && here ? uniqueVerticalNeighbour(world, here, f.direction!) : undefined;
        if (id && location && entrantOk(id, location) && !out.some(o => o.character_id === id)) out.push({ character_id: id, location_id: location, source_sentence: f.sentence });
      }
    }
    if (where.origin === where.arrival || !followers.size) continue;
    const follower = implicitFollower(clause, descent, isArrival, localIds);
    if (follower && followers.has(follower) && (where.hypothetical || !context.characters.some(c => c.id === follower)) && !out.some(o => o.character_id === follower))
      out.push({ character_id: follower, location_id: where.arrival, source_sentence: clause.find(f => f.subject.entity_id === follower)?.sentence ?? clause[0]!.sentence });
  }
  // A completed LOCATION CLAIM supports an eligible follower only: someone the engine's own follow policy already lets move with the player
  // (`followers`), placed by the prose at the player's arrival. The claim is evidence for that authority, never the authority itself.
  if (!where.hypothetical && where.origin !== where.arrival && followers.size)
    for (const c of locationClaimsFromFacts(facts))
      if (followers.has(c.character_id) && localIds.has(c.character_id) && (c.location_id === where.arrival || world.getAncestors(where.arrival).some(a => a.id === c.location_id))
        && !context.characters.some(x => x.id === c.character_id) && !out.some(o => o.character_id === c.character_id))
        out.push({ character_id: c.character_id, location_id: where.arrival, source_sentence: c.source_sentence });
  return out;
}

/** A completed, resolved location claim about one known entity (descriptive evidence: it names who the prose puts where, never who may move). */
export interface LocationClaim { readonly character_id: string; readonly location_id: string; readonly source_sentence: string; readonly fact: EntityPresentFact }
export function locationClaimsFromFacts(facts: NarrationFacts): readonly LocationClaim[] {
  return facts.movement.flatMap(f => f.kind === "entity_present" && f.form === "location_claim" && f.modality === "completed" && f.ambiguity === "none" && f.subject.entity_id && f.location_id
    ? [{ character_id: f.subject.entity_id, location_id: f.location_id, source_sentence: f.sentence, fact: f }] : []);
}

/**
 * Who a clause says followed the player to his arrival, from its follow/arrive facts: a named arrival at the arrival place, a named descent
 * (proven descents only), then the first completed follow form. A completed follow form decides the clause even when its subject is unresolved.
 */
function implicitFollower(clause: readonly ClauseFact[], descent: boolean, isArrival: (phrase: string) => boolean, localIds: ReadonlySet<string>): string | undefined {
  const done = clause.filter(f => f.modality === "completed");
  for (const f of done) if (f.kind === "entity_arrived" && f.form === "arrive_into" && isArrival(f.destination?.phrase ?? "")) { const id = f.subject.entity_id; if (id && localIds.has(id)) return id; }
  if (descent) for (const f of done) if (f.kind === "entity_arrived" && (f.form === "descend" || f.form === "duck_below" || f.form === "descent_marked")) { const id = f.subject.entity_id; if (id && localIds.has(id)) return id; }
  for (const f of done) if (f.kind === "entity_followed" && (!f.requires_descent || descent)) { const id = f.subject.entity_id; return id && localIds.has(id) ? id : undefined; }
  return undefined;
}

export interface DepartureEvidence { readonly character_id: string; readonly source_sentence: string }
/** A departure with the fact it was read from (direction, stairs wording, door wording, conjoined follow). */
export interface NarratedDeparture extends DepartureEvidence { readonly fact: EntityDepartedFact }
export interface CanonicalDepartureClaim extends NarratedDeparture { readonly ambiguous: boolean }

/**
 * Narrated departures of present people, in narration order (at most one per character). `scope: "created"` keeps campaign-created people,
 * `"persistent"` every living person present (authored NPCs too). `every`: one entry per narrated sentence. `stairs`: also destination-less
 * stair exits and "X's departure" nouns; `broad`: also sound-of-exit wording.
 */
export function departuresFromFacts(facts: NarrationFacts, context: TurnContext, scope: "created" | "persistent" = "created", options: { readonly every?: boolean; readonly stairs?: boolean; readonly broad?: boolean } = {}): readonly NarratedDeparture[] {
  const candidates = scope === "created" ? context.characters.filter(c => c.id !== "nicco" && c.origin.kind === "created" && c.current.status !== "dead").map(c => c.id) : context.characters.filter(c => c.id !== "nicco" && c.current.status !== "dead").map(c => c.id);
  const out: NarratedDeparture[] = [];
  for (const f of facts.movement) {
    if (f.kind !== "entity_departed" || f.reading !== "scene" || f.modality !== "completed" || f.form === "player_leave") continue;
    if ((f.form === "exit_stairs" || f.form === "exit_noun") && !options.stairs) continue;
    if (f.form === "exit_broad" && !(options.stairs && options.broad)) continue;
    const id = f.subject.entity_id;
    if (!id || !candidates.includes(id)) continue;
    if (options.every ? out.some(o => o.character_id === id && o.source_sentence === f.sentence) : out.some(o => o.character_id === id)) continue;
    out.push({ character_id: id, source_sentence: f.sentence, fact: f });
  }
  return out;
}

/** Claims are broader than permission: audit must also see ambiguous or contradictory completed exits. `only` limits to one person. */
export function departureClaimsFromFacts(facts: NarrationFacts, only?: string, among?: ReadonlySet<string>): readonly CanonicalDepartureClaim[] {
  return facts.movement.filter((f): f is EntityDepartedFact => f.kind === "entity_departed" && f.reading === "claim" && f.modality === "completed" && (!only || f.subject.entity_id === only) && (!among || among.has(f.subject.entity_id!)))
    .map(f => ({ character_id: f.subject.entity_id!, source_sentence: f.sentence, ambiguous: f.ambiguity !== "none", fact: f }));
}

/** Sentences that put `id` back in the scene after an exit (return, continued indoor presence). */
export function presenceClaimsFromFacts(facts: NarrationFacts, id: string): readonly string[] {
  return facts.movement.filter((f): f is EntityPresentFact => f.kind === "entity_present" && f.form === "presence_claim" && f.modality === "completed" && f.subject.entity_id === id).map(f => f.sentence);
}
export type { MovementFact };
