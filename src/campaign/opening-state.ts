import type { WorldStore } from "../world/world-store.js";
import { CampaignState } from "./campaign-state.js";
import { economy, generatePriceIndex } from "../economy/economy.js";

/**
 * Canonical opening of a new playthrough: about one day after Nicco's arrival in this world. He owns Heartstone Tower,
 * which has no other household members, and stands in the public square directly outside it. Only Nicco-private facts
 * about himself are seeded; no NPC knows them and they are not public. No later-playthrough residents, items or events.
 */
export const OPENING_LOCATION = "heartstone_square";
export const OPENING_HOUSEHOLD = "campaign_household_heartstone";
/** Household Pass 1: Nicco's starting purse in gold, taken from the historical playthrough reference. Runtime state, not canon. */
export const OPENING_FUNDS = 500;
export const OPENING_FACTS = [
  { id: "campaign_fact_nicco_light_mage", statement: "Nicco is a Light mage." },
  { id: "campaign_fact_nicco_otherworlder", statement: "Nicco came to this world from another world." },
] as const;

/** P8: one Personal Price Index per authored price-setter present in canon, generated once for this campaign and persisted. */
export function openingPriceIndices(world: WorldStore, campaignId: string) {
  return economy().price_setters.filter(id => world.getEntity(id)?.type === "character")
    .map(id => ({ kind: "set_price_index" as const, character_id: id, percent: generatePriceIndex(campaignId, id) }));
}
export function createOpeningCampaign(world: WorldStore, campaignId: string): CampaignState {
  const campaign = new CampaignState(world, campaignId, { player_location: OPENING_LOCATION, world_time: { world_minute: 0 } });
  campaign.apply({ expected_revision: 0, commands: [
    { kind: "create_household", id: OPENING_HOUSEHOLD, name: "Heartstone" },
    { kind: "set_membership", household_id: OPENING_HOUSEHOLD, membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "set_funds", character_id: "nicco", gold: OPENING_FUNDS },
    ...openingPriceIndices(world, campaignId),
    ...OPENING_FACTS.flatMap(f => [
      { kind: "create_fact" as const, fact: { id: f.id, content: { kind: "campaign" as const, statement: f.statement, truth: "true" as const } } },
      { kind: "set_knowledge" as const, knowledge: { character_id: "nicco", fact_id: f.id, status: "knows" as const } },
    ]),
  ] });
  return campaign;
}
