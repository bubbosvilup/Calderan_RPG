import { createHash } from "node:crypto";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { SessionView } from "./session-view.js";
import { isIdentityNameFact } from "../campaign/identity-knowledge.js";

/** Public play-screen whitelist. Never serialize raw character projections to the browser. */
export function derivePlayUiView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, view: SessionView) {
  const known = new Set(snapshot.facts.filter(f => isIdentityNameFact(f) && snapshot.knowledge.some(k => k.character_id === "nicco" && k.fact_id === f.id && k.status === "knows")).flatMap(f => f.content.kind === "canonical" ? [f.content.entity_id] : []));
  const householdIds = new Set(view.household.flatMap(h => h.members.map(m => m.id)));
  const participants = [{ ref: "player", name: view.player.name, category: "You", household: false, npc_plus: false, card: null }, ...view.scene.present.map(p => {
    const record = snapshot.characters.find(c => c.id === p.id);
    const canonicalId = record?.origin.kind === "canonical" ? record.origin.canonical_entity_id : p.id;
    const entity = world.getEntity(canonicalId);
    const created = record?.origin.kind === "created";
    const named = created ? record.origin_snapshot ? !!record.origin_snapshot.established.name : !!record.profile.name : known.has(canonicalId);
    const name = named ? p.name : created ? record.origin_snapshot?.label ?? "Unfamiliar person" : "Unfamiliar person";
    const household = householdIds.has(p.id);
    const npc_plus = snapshot.premium_characters.some(c => c.character_id === p.id);
    const ref = createHash("sha256").update(`${snapshot.campaign_id}:${p.id}`).digest("hex").slice(0, 24);
    const publicCanon = entity?.type === "character" && entity.knowledge?.visibility.player === true;
    const appearance = created ? record.origin_snapshot?.established.appearance?.join(" ") : named && publicCanon ? entity.appearance ?? undefined : undefined;
    const role = created ? record.origin_snapshot?.established.role : named && publicCanon ? entity.occupation ?? undefined : undefined;
    return { ref, name, name_known: named, category: !named ? created ? "Met this campaign · name unknown" : "Name unknown" : [household ? "Household" : created ? "Met this campaign" : "Canonical NPC", npc_plus ? "NPC+" : ""].filter(Boolean).join(" · "), household, npc_plus,
      card: { name, household, npc_plus, role: role ?? "Not known", relationship: "Not recorded", state: "Not recorded", where: `Here, in ${view.scene.location.name}`, appearance: appearance ?? "No known appearance recorded.", affiliations: [] as string[] } };
  })];
  return { participants, gold: view.player.gold, day: view.scene.time.day };
}
