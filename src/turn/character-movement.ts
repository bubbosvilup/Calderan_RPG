import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { reachable, resolveDestination } from "./natural-actions.js";
import { blankQuotes, escapeRegExp as esc, sentencesOf } from "./language/text.js";
import { GATES } from "./language/gates.js";

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
export interface MovableCharacter { readonly id: string; readonly names: readonly string[]; readonly sex?: "female" | "male" }
export interface CharacterMovement { readonly character_id: string; readonly location_id: string; readonly source_sentence: string }

/** Created, living characters currently at one of these locations (the scene Nicco is in or is leaving this turn). */
export function movableCharacters(snapshot: DeepReadonly<CampaignSnapshot>, locations: readonly string[]): MovableCharacter[] {
  return snapshot.characters.filter(c => c.id !== "nicco" && c.origin.kind === "created" && c.current.status !== "dead" && !!c.current.current_location && locations.includes(c.current.current_location)).flatMap(c => {
    const name = c.profile.name ?? c.origin_snapshot?.label;
    if (!name) return [];
    const sex = /^(?:female|woman)$/i.test(c.profile.sex ?? "") ? "female" as const : /^(?:male|man)$/i.test(c.profile.sex ?? "") ? "male" as const : undefined;
    return [{ id: c.id, names: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(sex ? { sex } : {}) }];
  });
}

/** Not a completed movement: modality, intention, plans, negation, gaze, questions. */
const NOT_DONE = GATES.movement_not_done;
const CARRY = "(?:carries|carried|carrying|carry|lifts|lifted|hauls|hauled|bears|bore)";
const WALK = "(?:follows|followed|walks|walked|goes|went|heads|headed|returns|returned|limps|limped|runs|ran|hurries|hurried|steps|stepped|trails|trailed|shuffles|shuffled|staggers|staggered|slips|slipped)";
const TO = "(into|inside|through|to|back to|up to|out to|onto|in through)";
const HELD = "(?:in his arms|on his back|over his shoulder|against his (?:chest|shoulder)|slung over his shoulder)";

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
  return arrival !== origin && /^(?:the\s+)?(?:(?:tower|main|front|heavy|oak|wooden)\s+)?(?:door|doorway|threshold|inside|in|home|house|tower|room|hall)\b/i.test(cleaned) ? arrival : undefined;
}

/**
 * Player-authored carrying. `natural` is the turn's already-resolved runtime (player movement); the carry clause may also carry its
 * own destination ("carries her back to Heartstone"), resolved through the same route rule as ordinary movement (no teleport).
 */
export function resolvePlayerCarry(input: string, snapshot: DeepReadonly<CampaignSnapshot>, context: TurnContext, world: WorldStore, natural: readonly CampaignCommand[]):
  { readonly runtime: readonly CampaignCommand[]; readonly notes: readonly string[]; readonly carried?: string } {
  const here = snapshot.runtime.scene.player_location;
  const movable = movableCharacters(snapshot, [here]);
  if (!movable.length) return { runtime: [], notes: [] };
  const names = movable.flatMap(m => m.names).map(esc).join("|");
  const clauses = input.replace(/\*/g, " . ").split(/(?<=[.!?;])\s+|\s+(?:and then|then)\s+/);
  for (const clause of clauses) {
    const m = clause.match(new RegExp(`\\b(?:picks?|picked)\\s+(${names}|her|him)\\s+up\\b|\\b${CARRY}\\s+(${names}|her|him)\\b|\\b(${names}|her|him)\\s+${HELD}`, "i"));
    if (!m || NOT_DONE.test(clause.slice(0, m.index! + m[0].length))) continue;
    const token = (m[1] ?? m[2] ?? m[3])!;
    const who = byName(movable, token) ?? byPronoun(movable, token);
    if (!who) continue;
    const moved = natural.find((c): c is Extract<CampaignCommand, { kind: "runtime_delta" }> => c.kind === "runtime_delta" && !!c.delta.player_location);
    if (moved) return { runtime: [{ kind: "move_character", character_id: who, location_id: moved.delta.player_location! }], notes: [], carried: who };
    // The carry clause itself names where he takes them.
    const rest = input.replace(/\*/g, " ").slice(input.replace(/\*/g, " ").search(new RegExp(esc(token), "i")));
    const dest = rest.match(new RegExp(`\\b${TO}\\s+([^.;,!?*]+)`, "i"));
    if (!dest) continue;
    const target = resolveDestination(dest[2]!.trim(), context, world);
    if (!target) continue;
    const route = reachable(target, here, world);
    const name = movable.find(x => x.id === who)!.names[0]!;
    if (!route.target) return { runtime: [], notes: [`Nicco sets out carrying ${name} toward ${world.getEntity(target)?.display_name ?? target}, but no route there from ${world.getEntity(here)?.display_name ?? here} is established yet: neither of them has arrived; both are still at ${world.getEntity(here)?.display_name ?? here}.`] };
    return { runtime: [{ kind: "runtime_delta", delta: { player_location: route.target, time_advance_minutes: route.route!.minutes } }, { kind: "move_character", character_id: who, location_id: route.target }], notes: [], carried: who };
  }
  return { runtime: [], notes: [] };
}

/** Completed movements of movable characters narrated this turn (at most one per character, first wins). */
export function narratedMovements(narration: string, movable: readonly MovableCharacter[], where: { readonly origin: string; readonly arrival: string }, context: TurnContext, world: WorldStore): CharacterMovement[] {
  if (!movable.length) return [];
  const names = movable.flatMap(m => m.names).map(esc).join("|");
  const who = (token: string, subject: boolean) => byName(movable, token) ?? (subject && /^he$/i.test(token) ? undefined : byPronoun(movable, token)); // subject "he" is usually Nicco
  const patterns: readonly { readonly re: RegExp; readonly mover: number; readonly dest: number; readonly subject: boolean }[] = [
    { re: new RegExp(`\\b${CARRY}\\s+(${names}|her|him)\\b[^.;]*?\\b${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: false },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(?:(?:him|nicco|after him|behind him|back|close behind)\\s+)*${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: true },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:is|was)\\s+(?:carried|brought|led)\\s+${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: true },
    { re: new RegExp(`\\b(?:reach|reaches|reached|arrive at|arrives at|arrived at|enter|enters|entered)\\s+([^,.;]+?),?\\s+(?:with\\s+)?(${names}|her|him)\\s+(?:still\\s+)?${HELD}`, "i"), mover: 2, dest: 1, subject: false },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(?:him\\s+|nicco\\s+)?(inside|in)\\b`, "i"), mover: 1, dest: 2, subject: true },
  ];
  const out: CharacterMovement[] = [];
  for (const sentence of sentencesOf(narration)) {
    const plain = blankQuotes(sentence).trim();
    for (const clause of plain.split(/;|,\s*(?:but|while|though|although)\s+|\s+but\s+/)) {
      for (const p of patterns) {
        const m = clause.match(p.re);
        if (!m || NOT_DONE.test(clause.slice(0, m.index! + m[0].length))) continue;
        const id = who(m[p.mover]!, p.subject);
        const location = id ? concreteDestination(m[p.dest]!, where.arrival, where.origin, context, world) : undefined;
        if (id && location && !out.some(o => o.character_id === id)) out.push({ character_id: id, location_id: location, source_sentence: sentence });
      }
    }
  }
  return out;
}
