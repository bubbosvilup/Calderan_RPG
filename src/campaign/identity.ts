import type { WorldStore } from "../world/world-store.js";
import type { CampaignDomains, CampaignOrigin, GoalTarget } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { fail, validateId } from "./validation.js";

export type CampaignIdKind = "character" | "item" | "household" | "fact" | "goal" | "event" | "transaction";
/** Caller supplies a stable local key. No randomness, names-as-identity or hidden counters. */
export function campaignId(kind: CampaignIdKind, localKey: string): string {
  if (!["character", "item", "household", "fact", "goal", "event", "transaction"].includes(kind)) fail("id", "unknown identity domain");
  return validateId(`campaign_${kind}_${validateId(localKey)}`);
}
export class CampaignIdentityResolver {
  constructor(readonly world: WorldStore, readonly domains: DeepReadonly<CampaignDomains>) {}
  character(id: string) {
    const campaign = this.domains.characters.find(c => c.id === id);
    if (campaign) return campaign.origin;
    const canonical = this.world.getEntity(id);
    if (canonical?.type === "character") return { kind: "canonical" as const, canonical_entity_id: id };
    return fail("character_id", "unknown character");
  }
  location(id: string): void { if (this.world.getEntity(id)?.type !== "location") fail("location_id", "unknown canonical location"); }
  item(id: string): void { if (!this.domains.items.some(i => i.id === id)) fail("item_id", "item must be registered in campaign state"); }
  event(id: string): void { if (!this.domains.scheduled_events.some(e => e.id === id) && this.world.getEntity(id)?.type !== "event") fail("event_id", "unknown event"); }
  canonical(id: string): void { if (!this.world.hasEntity(id)) fail("entity_id", "unknown canonical entity"); }
  target(target: GoalTarget): void {
    switch (target.kind) {
      case "canonical": this.canonical(target.id); break;
      case "character": this.character(target.id); break;
      case "item": this.item(target.id); break;
      case "event": this.event(target.id); break;
    }
  }
  newId(id: string, kind: CampaignIdKind): void {
    validateId(id);
    if (!id.startsWith(`campaign_${kind}_`)) fail("id", "created record must use its campaign domain prefix");
    if (this.world.hasEntity(id) || this.world.getChunk(id) || [this.domains.characters, this.domains.items, this.domains.households, this.domains.facts, this.domains.goals, this.domains.scheduled_events, this.domains.transactions].some(list => list.some(record => record.id === id))) fail("id", "identity collision");
  }
  registration(id: string, origin: CampaignOrigin, type: "character" | "item"): void {
    const list = type === "character" ? this.domains.characters : this.domains.items;
    if (list.some(record => record.id === id)) fail("id", "already registered");
    if (origin.kind === "created") this.newId(id, type);
    else if (id !== origin.canonical_entity_id || this.world.getEntity(id)?.type !== type) fail("origin", "canonical registration must retain the canonical ID and type");
  }
}
