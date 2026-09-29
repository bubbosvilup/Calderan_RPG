import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { WorldStore } from "../src/world/world-store.js";
import { fixtures, garden, room } from "./fixtures.js";
export const a = "campaign_character_a", b = "campaign_character_b", c = "campaign_character_c";
export const boots = "campaign_item_boots", stored = "campaign_item_stored", fact = "campaign_fact_secret", event = "campaign_event_raid", goal = "campaign_goal_ready", household = "campaign_household_home";
export function change(campaign: CampaignState, ...commands: CampaignCommand[]) { return campaign.apply({ expected_revision: campaign.revision, commands }); }
export function richCampaign() {
  const world = new WorldStore(fixtures());
  const campaign = new CampaignState(world, "fixture_campaign", { player_location: room, world_time: { world_minute: 100 } }, { current: 15, max: 100 });
  change(campaign,
    { kind: "runtime_delta", delta: { time_advance_minutes: 3000, mana_delta: -5, player_location: garden, character_movements: [{ character_id: "brenna", current_location: garden }] } },
    { kind: "register_character", character: { id: "brenna", origin: { kind: "canonical", canonical_entity_id: "brenna" }, profile: { aliases: ["Fixture nickname"], appearance: { eyes: "gray" } }, current: {} } },
    { kind: "register_character", character: { id: "maren", origin: { kind: "canonical", canonical_entity_id: "maren" }, profile: {}, current: {} } },
    { kind: "register_character", character: { id: a, origin: { kind: "created" }, profile: { name: "Fixture A", aliases: ["Second", "First"], appearance: { hair: { color: "brown" }, scars: [{ description: "old scar" }] } }, current: { current_location: room, conditions: ["wet", "tired"] } } },
    { kind: "register_character", character: { id: b, origin: { kind: "created" }, profile: { name: "Fixture B" }, current: { current_location: garden } } },
    { kind: "register_character", character: { id: c, origin: { kind: "created" }, profile: {}, current: {} } },
    { kind: "set_slot_knowledge", character_id: a, slot: "head", state: "empty" },
    { kind: "register_item", item: { id: boots, origin: { kind: "created" }, name: "Boots", owner_id: a, position: { kind: "equipped", character_id: a, slot: "feet", mode: "worn" }, acquisition: { acquisition_kind: "gift", from_character_id: b, acquired_at: 3100, event_id: "meeting" } } },
    { kind: "register_item", item: { id: stored, origin: { kind: "created" }, name: "Spare boots", owner_id: a, position: { kind: "stored", location_id: room } } },
    { kind: "register_item", item: { id: "bag", origin: { kind: "canonical", canonical_entity_id: "bag" }, position: { kind: "unknown" } } },
    { kind: "create_household", id: household, name: "Fixture home" },
    { kind: "set_membership", household_id: household, membership: { character_id: a, status: "member", role: "resident" } },
    { kind: "set_membership", household_id: household, membership: { character_id: b, status: "guest", role: "visitor" } },
    { kind: "set_membership", household_id: household, membership: { character_id: b, status: "former_member", role: "visitor" } },
    { kind: "create_fact", fact: { id: fact, content: { kind: "campaign", statement: "Fixture secret", truth: "true" } } },
    { kind: "create_fact", fact: { id: "campaign_fact_canon", content: { kind: "canonical", entity_id: "brenna", chunk_id: "brenna.overview" } } },
    { kind: "set_knowledge", knowledge: { character_id: a, fact_id: fact, status: "knows", provenance: { source_character_id: "brenna", source_event_id: "meeting", learned_at: 3000, acquisition_kind: "told" } } },
    { kind: "set_knowledge", knowledge: { character_id: b, fact_id: fact, status: "suspects" } },
    { kind: "seed_relationship", relationship: { from_character_id: a, to_character_id: b, trust: 35, seed_context: "fixture explicit seed" } },
    { kind: "schedule_event", id: event, title: "Fixture raid", scheduled_world_minute: 3100 + 8 * 1440, participants: [a, b] },
    { kind: "create_goal", id: goal, character_id: a, description: "Fixture preparation", target: { kind: "event", id: event } },
    { kind: "set_goal_status", goal_id: goal, status: "completed" });
  change(campaign, { kind: "runtime_delta", delta: { mana_delta: -47 } });
  return { world, campaign };
}
