import type { CampaignCommand, CampaignFact, CampaignSnapshot, KnowledgeProvenance } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";

/** Name-only knowledge uses existing canonical facts/edges, never a second name store. */
export const identityNameFactId = (characterId: string) => `campaign_fact_identity_name_${characterId}`;
export function isIdentityNameFact(fact: DeepReadonly<CampaignFact>): boolean {
  return fact.content.kind === "canonical" && fact.content.chunk_id === undefined && fact.id === identityNameFactId(fact.content.entity_id);
}
/** For an authoritative host/starting-knowledge grant. Not inferred from arbitrary narrator mentions. */
export function learnCanonicalName(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, characterId: string, provenance?: KnowledgeProvenance): readonly CampaignCommand[] {
  if (world.getEntity(characterId)?.type !== "character") throw new Error("Name discovery requires a canonical character");
  const fact_id = identityNameFactId(characterId), existing = snapshot.facts.find(f => f.id === fact_id);
  if (existing && (!isIdentityNameFact(existing) || existing.content.kind !== "canonical" || existing.content.entity_id !== characterId)) throw new Error("Identity fact collision");
  if (existing && snapshot.knowledge.some(k => k.character_id === "nicco" && k.fact_id === fact_id && k.status === "knows")) return [];
  return [
    ...(existing ? [] : [{ kind: "create_fact" as const, fact: { id: fact_id, content: { kind: "canonical" as const, entity_id: characterId } } }]),
    { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id, status: "knows", ...(provenance ? { provenance } : {}) } },
  ];
}
