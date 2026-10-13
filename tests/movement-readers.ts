import type { TurnContext } from "../src/turn/context/context-builder.js";
import type { WorldStore } from "../src/world/world-store.js";
import type { CharacterMovement, MovableCharacter } from "../src/turn/movement/character-movement.js";
import { characterMovementsFromFacts, departureClaimsFromFacts, departuresFromFacts, presenceClaimsFromFacts, type MovementWhere } from "../src/turn/movement/movement-evidence.js";
import { extractNarrationFacts } from "../src/turn/narration-facts/index.js";

/**
 * Test readers: the production path (extract NarrationFacts once, then apply the consumer policy) behind the narrow shapes the movement
 * suites assert on. They hold no grammar of their own.
 */
export function narratedMovements(narration: string, movable: readonly MovableCharacter[], where: MovementWhere, context: TurnContext, world: WorldStore, followers: ReadonlySet<string> = new Set()): CharacterMovement[] {
  return characterMovementsFromFacts(extractNarrationFacts(narration, { movers: movable, context }), movable, where, context, world, followers);
}
export function narratedDepartures(narration: string, context: TurnContext, scope: "created" | "persistent" = "created", options: { readonly every?: boolean; readonly stairs?: boolean; readonly broad?: boolean } = {}) {
  return departuresFromFacts(extractNarrationFacts(narration, { movers: [], context }), context, scope, options).map(d => ({ character_id: d.character_id, source_sentence: d.source_sentence }));
}
export function canonicalDepartureClaims(narration: string, context: TurnContext, additional: readonly { readonly id: string; readonly name: string }[] = []) {
  return departureClaimsFromFacts(extractNarrationFacts(narration, { movers: [], context, absent: additional })).map(d => ({ character_id: d.character_id, source_sentence: d.source_sentence, ambiguous: d.ambiguous }));
}
export function canonicalPresenceClaims(narration: string, context: TurnContext, id: string): readonly string[] {
  return presenceClaimsFromFacts(extractNarrationFacts(narration, { movers: [], context }), id);
}
export const canonicalDepartureContradiction = (narration: string, context: TurnContext, id: string): boolean => canonicalPresenceClaims(narration, context, id).length > 0;
