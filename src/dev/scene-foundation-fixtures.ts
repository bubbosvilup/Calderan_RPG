import { CampaignState } from "../campaign/campaign-state.js";
import type { CampaignCommand } from "../campaign/types.js";
import { apply, createdPerson, fact, itemId, knows, makeItem, SCENE_ELSEWHERE, SCENE_LOCATION, sceneFixture, type SceneOptions } from "./scene-state-fixtures.js";

/**
 * Foundation-certification fixtures (synthetic, public): ONE scene in which independent authoritative subsystems all contribute.
 * Heartstone LR 19:42; Nicco, Brenna (winded), Maren (minor injury), Gerome (silent construct) present; Pellan away and unlearned;
 * NOTE: TurnContext only carries facts Nicco knows, so every knowledge fact here has a Nicco edge. Korvin away and unlearned (owns an item, appears in an event and a relationship).
 */
export const RICH = Object.freeze({
  factA: "campaign_fact_west_gate", factB: "campaign_fact_bridge", factC: "campaign_fact_tax",
  textA: "The West Gate incident left two guards dead.", textB: "The eastern bridge is closed.", textC: "The grain tax will double at harvest.",
  household: "campaign_household_heartstone", rule: "No weapons at the table.", supper: "campaign_event_supper", fair: "campaign_event_fair",
});
const PELLAN_AWAY: CampaignCommand = { kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE };
export function richScene(options: SceneOptions = {}) {
  const f = sceneFixture({ id: "rich_scene", constraints: true, ...options, commands: [PELLAN_AWAY, ...(options.commands ?? [])] } as SceneOptions);
  const c = f.campaign;
  apply(c,
    { kind: "set_condition", character_id: "brenna", conditions: ["winded"] },
    { kind: "set_condition", character_id: "maren", conditions: ["minor_injury"] },
    { kind: "runtime_delta", delta: { mana_delta: -20 } },
    makeItem({ name: "Sword", description: "A plain iron sword.", owner_id: "nicco", position: { kind: "carried", character_id: "brenna" } }),
    makeItem({ name: "Wool cloak", owner_id: "nicco" }),
    makeItem({ name: "Brass compass", owner_id: "nicco" }),
    ...Array.from({ length: 12 }, (_, i) => makeItem({ name: `Trinket${i}`, owner_id: "nicco" })),
    makeItem({ name: "Letter", description: "A sealed letter.", owner_id: "nicco", position: { kind: "stored", location_id: SCENE_LOCATION } }),
    makeItem({ name: "Cellar key", position: { kind: "stored", location_id: SCENE_ELSEWHERE } }));
  apply(c, { kind: "place_item", item_id: itemId(c, "Wool cloak"), position: { kind: "equipped", character_id: "nicco", slot: "back", mode: "worn" } });
  apply(c,
    fact(RICH.factA, RICH.textA), knows("nicco", RICH.factA), knows("brenna", RICH.factA),
    fact(RICH.factB, RICH.textB, "false"), knows("nicco", RICH.factB), knows("maren", RICH.factB, "believes"),
    fact(RICH.factC, RICH.textC, "unknown"), knows("nicco", RICH.factC), knows("brenna", RICH.factC, "heard_rumor"),
    { kind: "create_household", id: RICH.household, name: "Heartstone" },
    { kind: "set_membership", household_id: RICH.household, membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: RICH.household, character_id: "brenna" },
    { kind: "join_household", household_id: RICH.household, character_id: "maren" },
    { kind: "add_household_rule", household_id: RICH.household, text: RICH.rule },
    { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" },
    { kind: "adjust_relationship", from_character_id: "absent_korvin", to_character_id: "pellan", dimension: "wariness", direction: "raise" },
    { kind: "schedule_event", id: RICH.supper, title: "Supper with the household", scheduled_world_minute: 1260, participants: ["nicco", "brenna"] },
    { kind: "schedule_event", id: RICH.fair, title: "Harvest fair", scheduled_world_minute: 9000, participants: ["nicco"] });
  // A development that has since been undone: it must never survive into the scene.
  apply(c, { kind: "set_condition", character_id: "maren", conditions: ["dazed", "minor_injury"] });
  apply(c, { kind: "set_condition", character_id: "maren", conditions: ["minor_injury"] });
  return f;
}
/** Budget stress: a crowd, large inventories, many relationships / households / facts / events / developments, plus the rich scene's required truths. */
export interface LargeSizes { readonly present: number; readonly packs: number; readonly stored: number; readonly households: number; readonly relationships: number; readonly facts: number; readonly events: number }
export const LARGE_DEFAULT: LargeSizes = { present: 20, packs: 30, stored: 40, households: 4, relationships: 30, facts: 30, events: 10 };
export function largeScene(sizes: Partial<LargeSizes> = {}) {
  const n = { ...LARGE_DEFAULT, ...sizes };
  const f = richScene({ id: "large_scene", secrets: true, secretNpc: true });
  const c = f.campaign, people = Array.from({ length: n.present + 20 }, (_, i) => `campaign_character_crowd_${i}`);
  const chunk = (commands: CampaignCommand[]) => { for (let i = 0; i < commands.length; i += 25) apply(c, ...commands.slice(i, i + 25)); };
  chunk(people.map((id, i) => createdPerson(id, `Crowd${i}`, i < n.present ? SCENE_LOCATION : SCENE_ELSEWHERE)));
  chunk(people.slice(0, n.present).flatMap((id, i) => [makeItem({ name: `Bundle${i}`, position: { kind: "carried", character_id: id } }), ...(i % 2 === 0 ? [{ kind: "set_condition", character_id: id, conditions: ["winded"] } as CampaignCommand] : [])]));
  chunk(Array.from({ length: n.packs }, (_, i) => makeItem({ name: `Pack${i}` })));
  chunk(Array.from({ length: n.stored }, (_, i) => makeItem({ name: `Crate${i}`, position: { kind: "stored", location_id: SCENE_LOCATION } })));
  chunk(Array.from({ length: n.households }, (_, h) => [{ kind: "create_household", id: `campaign_household_x${h}`, name: `House${h}` } as CampaignCommand,
    { kind: "set_membership", household_id: `campaign_household_x${h}`, membership: { character_id: "nicco", status: "member", role: "owner" } } as CampaignCommand,
    ...people.slice(h * 5, h * 5 + 5).map(id => ({ kind: "join_household", household_id: `campaign_household_x${h}`, character_id: id }) as CampaignCommand),
    { kind: "add_household_rule", household_id: `campaign_household_x${h}`, text: `Rule number ${h} applies to all.` } as CampaignCommand]).flat());
  chunk(people.slice(0, n.relationships).map(id => ({ kind: "adjust_relationship", from_character_id: id, to_character_id: "nicco", dimension: "trust", direction: "raise" }) as CampaignCommand));
  chunk(Array.from({ length: n.facts }, (_, i) => [fact(`campaign_fact_big_${i}`, `Public rumor number ${i} circulates.`), knows("nicco", `campaign_fact_big_${i}`), knows(people[i % n.present]!, `campaign_fact_big_${i}`, "heard_rumor")]).flat());
  chunk(Array.from({ length: n.events }, (_, i) => ({ kind: "schedule_event", id: `campaign_event_big_${i}`, title: `Gathering ${i}`, scheduled_world_minute: 1200 + i * 30, participants: ["nicco", people[i]!] }) as CampaignCommand));
  return f;
}
export { CampaignState, createdPerson };
