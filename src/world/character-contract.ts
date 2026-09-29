import type { CharacterEntity } from "../types/entities.js";
import type { DeepReadonly } from "../types/readonly.js";
/** Public, observable/occupational information only. Null remains unestablished. */
export function characterPublicProfile(e: DeepReadonly<CharacterEntity>) {
  return Object.freeze({ species: e.species ?? null, sex: e.sex ?? null, age_band: e.age_band ?? null, appearance: e.appearance ?? null, occupation: e.occupation ?? null });
}
/** Explicit whitelist: no motivation, morality, temperament, associations or private notes in search. */
export function characterSearchText(e: DeepReadonly<CharacterEntity>): string[] {
  return Object.values(characterPublicProfile(e)).filter((value): value is string => value !== null);
}
/** Narrator-only portrayal, NEVER an NPC/player knowledge grant. Not a retrieval result. */
export function characterPortrayal(e: DeepReadonly<CharacterEntity>) {
  if (!e.knowledge?.visibility.narrator || e.base_location === undefined) return undefined;
  return Object.freeze({ purpose: e.purpose ?? null, morality: e.morality ?? null, personality: e.traits,
    affiliations: e.affiliations ?? [], ...(e.private_notes ? { private_notes: e.private_notes } : {}), authority: "narrator_portrayal_only_not_character_knowledge" as const });
}
