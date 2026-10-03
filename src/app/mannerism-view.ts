import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { requiredMannerismEvidence } from "../campaign/mannerism-concepts.js";
/** Future UI contract. Candidate details are opt-in developer data, never normal player/narrator context. */
export function mannerismView(snapshot: DeepReadonly<CampaignSnapshot>, character_id: string, developer = false) {
  const p = snapshot.premium_characters.find(p => p.character_id === character_id);
  if (!p) return undefined;
  const entries = (p.mannerisms ?? []).map(m => ({ id: m.id, text: m.text, source: m.source, user_edited: m.user_edited }));
  return { occupied: entries.length, capacity: 4, entries,
    ...(developer ? { candidates: (snapshot.mannerism_learning?.candidates ?? []).filter(c => c.character_id === character_id).map(c => ({ text: c.text, evidence_count: c.evidence.length, required_count: requiredMannerismEvidence(entries.length) })) } : {}) };
}
