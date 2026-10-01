import { WorldStore } from "../world/world-store.js";
import { CampaignState } from "../campaign/campaign-state.js";
import type { WorldEntity } from "../types/entities.js";
/**
 * Development scene prose (Phase 1M.1): minimal natural context replacing the old "Synthetic evaluation fixture." placeholder,
 * which narrators echoed as in-world text. Evaluation scaffolding only; not canon, never written under data/.
 */
const FIXTURE_PROSE: Record<string, string> = {
  test_room: "A quiet upstairs room with a narrow bed, a small table and an arched window. Stairs lead down to the main hall.",
  test_hall: "The ground-floor hall, with a long table and a hearth.", test_remote: "Harbor docks, far from here.",
  nicco: "The player character.", brenna: "A tall woman recovering from illness.", gerome: "A stone construct who serves the household.",
  maren: "A young woman staying in the tower.", remote_npc: "A stranger at the docks.",
  boots: "A pair of sturdy boots.", ring: "A plain metal ring.", pink_cotton: "A pink cotton shirt.", pink_fluffy: "A thick, fluffy pink shirt.",
  pink_shorts: "A pair of pink shorts.", brenna_boots: "Brenna's worn leather boots.", ironbound: "A guild of smiths.",
};
/** Noncanonical evaluation world. Never written under data/. */
export function turnFixture(groundGarments = false, options: { readonly brennaKnowsBridge?: boolean; readonly ironboundKnownBy?: readonly string[] } = {}) {
  const base = (id: string, name = id) => ({ id, name, display_name: name, parent: null, aliases: [], summary: FIXTURE_PROSE[id] ?? "", tags: [], search_context: "", content: FIXTURE_PROSE[id] ?? "", knowledge: { visibility: { narrator: true, player: true }, known_by: [] } });
  const entities: WorldEntity[] = [
    { ...base("test_room", "Observation room"), type: "location", features: [], connections: [{ target: "test_hall", description: "Downstairs", minutes: 1 }] },
    { ...base("test_hall", "Main hall"), type: "location", features: [], connections: [{ target: "test_room", description: "Upstairs", minutes: 1 }] },
    { ...base("test_remote", "Remote docks"), type: "location", features: [], connections: [] },
    { ...base("nicco", "Nicco"), type: "character", role: "player", location: null, traits: [], relationships: [] },
    ...["brenna", "gerome", "maren"].map(id => ({ ...base(id, id[0]!.toUpperCase() + id.slice(1)), type: "character" as const, role: "npc" as const, location: "test_room", traits: id === "gerome" ? ["Silent stone construct; does not speak."] : [], relationships: [] })),
    { ...base("remote_npc", "Remote stranger"), type: "character", role: "npc", location: "test_remote", traits: [], relationships: [] },
    { ...base("ironbound", "Ironbound"), type: "faction", content: "Ironbound is a guild of smiths. No other lore about it is established.", members: [], territory: [], relations: [] },
    ...["boots", "ring", "pink_cotton", "pink_fluffy", "pink_shorts", "brenna_boots"].map(id => ({ ...base(id), type: "item" as const, owner: id === "brenna_boots" ? "brenna" : "nicco", state: {} })),
  ];
  // Phase 1N: optional canonical (authored) awareness of the Ironbound lore, for asymmetric retrieval-knowledge checks.
  const ironbound = entities.find(e => e.id === "ironbound")!;
  if (options.ironboundKnownBy) ironbound.knowledge = { ...ironbound.knowledge!, known_by: [...options.ironboundKnownBy] };
  if (groundGarments) for (const entity of entities) {
    if (entity.type === "character" && ["gerome", "maren"].includes(entity.id)) entity.location = "test_hall";
  }
  const garmentNames: Record<string, string> = { pink_cotton: "pink cotton shirt", pink_fluffy: "pink fluffy shirt", pink_shorts: "pink shorts" };
  const world = new WorldStore(entities.map(entity => ({ source: `synthetic/${entity.id}.yaml`, document: { schema_version: 1, entity, chunks: [] } })));
  const campaign = new CampaignState(world, "turn_fixture", { player_location: "test_room", world_time: { world_minute: 100 } });
  campaign.apply({ expected_revision: 0, commands: [
    { kind: "register_character", character: { id: "brenna", origin: { kind: "canonical", canonical_entity_id: "brenna" }, profile: { appearance: { height_cm: 193, build: "muscular", eyes: "grey", hair: { color: "dark" }, scars: [{ description: "Old wrist scars" }] } }, current: { conditions: ["recovering"], presentation: "Seated and alert" } } },
    ...["boots", "ring", "pink_cotton", "pink_fluffy", "pink_shorts"].map(id => ({ kind: "register_item", item: { id, origin: { kind: "canonical", canonical_entity_id: id }, name: groundGarments ? garmentNames[id] ?? id : id, owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } } })),
    { kind: "register_item", item: { id: "brenna_boots", origin: { kind: "canonical", canonical_entity_id: "brenna_boots" }, name: "Brenna's worn boots", owner_id: "brenna", position: { kind: "equipped", character_id: "brenna", slot: "feet", mode: "worn" } } },
    { kind: "create_fact", fact: { id: "campaign_fact_bridge_closed", content: { kind: "campaign", statement: "The eastern bridge is closed.", truth: "true" } } },
    { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: "campaign_fact_bridge_closed", status: "knows" } },
    ...(options.brennaKnowsBridge ? [{ kind: "set_knowledge" as const, knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows" as const } }] : []),
    { kind: "create_fact", fact: { id: "campaign_fact_private_secret", content: { kind: "campaign", statement: "HIDDEN_SECRET_SENTINEL", truth: "true" } } },
    { kind: "set_knowledge", knowledge: { character_id: "maren", fact_id: "campaign_fact_private_secret", status: "knows" } },
  ] });
  return { world, campaign };
}
