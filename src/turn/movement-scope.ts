import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { type MovableCharacter, movableCharacters, npcPlusEntrants, persistentCharactersAt } from "./character-movement.js";
import { playerDestination } from "./player-travel.js";
import { type NarrationFactScope, type Referent, nameFilter } from "./narration-facts/index.js";
import { asksName } from "./identity-request.js";

/**
 * Who the NarrationFacts of a turn (movement, commerce, identity) are read against: ONE set of people for authorization and audit alike (everyone in, or arriving at,
 * the scenes the player is in or leaves), so a pronoun that two people could mean is ambiguous for both. This names people only; who may
 * actually move is decided by the consumers' own policy.
 */
export function movementFactScope(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, context: TurnContext, locations: readonly string[], player_input?: string): NarrationFactScope {
  const people = new Map<string, Referent>();
  const add = (m: MovableCharacter) => {
    const prior = people.get(m.id);
    const sex = prior?.sex ?? m.sex, entrant = prior ? prior.entrant && m.entrant : m.entrant;
    people.set(m.id, { id: m.id, names: [...new Set([...(prior?.names ?? []), ...m.names])], ...(sex ? { sex } : {}), ...(entrant ? { entrant: true as const } : {}) });
  };
  for (const m of movableCharacters(snapshot, locations, world)) add(m);
  for (const m of persistentCharactersAt(snapshot, world, locations)) add(m);
  for (const m of npcPlusEntrants(snapshot, world, locations)) add(m);
  for (const c of context.characters) if (c.id !== "nicco" && c.origin.kind === "canonical") add({ id: c.id, names: [c.profile.name ?? c.id] });
  const present = new Set(context.characters.map(c => c.id));
  const absent = world.getEntitiesByType("character").filter(e => e.role === "npc" && !present.has(e.id) && e.name.length >= 4).map(e => ({ id: e.id, name: e.name }));
  // Complete labels only (id, name, display name, alias): no mention mining and no head-word guessing, so a claim never rests on a fuzzy match.
  const label = (text: string) => text.trim().replace(/[.!]+$/, "").replace(/^the\s+/i, "").toLowerCase();
  const place = (phrase: string) => {
    const known = playerDestination(phrase, world);
    if (known) return known;
    const exact = world.getEntitiesByType("location").filter(e => e.knowledge?.visibility.narrator && e.knowledge.visibility.player && [e.id, e.name, e.display_name, ...e.aliases].some(n => label(n) === label(phrase)));
    return exact.length === 1 ? exact[0]!.id : undefined;
  };
  // Identity facts (Block 11) read names against the same world (places are never names) and know whether the player asked a name this turn.
  return { movers: [...people.values()], context, absent, place, names_ok: nameFilter(world), asks_name: asksName, ...(player_input !== undefined ? { player_input } : {}) };
}
