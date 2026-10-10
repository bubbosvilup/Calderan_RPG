import { learnCanonicalName } from "../campaign/identity-knowledge.js";
import { WorldStore } from "../world/world-store.js";
import { CampaignState } from "../campaign/campaign-state.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { WorldEntity } from "../types/entities.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { buildNarratorPrompt } from "../turn/prompt-builder.js";
import { playerIntent } from "../turn/player-intent.js";
import type { RecentExchange } from "../turn/recent-conversation.js";

/**
 * Scene State Projection V1 fixtures: a synthetic, public (non-canon) world. Heartstone LR at world minute 1182 (19:42, Evening) with
 * Nicco and the authored residents Brenna, Maren and Gerome (names already learned, so identity masking is the ordinary path).
 * `Pellan` is an authored NPC whose name Nicco has NOT learned (identity-masking checks). Nothing here is written under data/.
 */
export const SCENE_LOCATION = "heartstone_lr", SCENE_ELSEWHERE = "test_cellar";
const prose = (id: string, text: string) => ({ id, name: id, display_name: id, parent: null as string | null, aliases: [] as string[], summary: text, tags: [] as string[], search_context: "", content: text, knowledge: { visibility: { narrator: true, player: true }, known_by: [] as string[] } });
const person = (id: string, name: string, location: string, extra: Record<string, unknown> = {}): WorldEntity => ({ ...prose(id, `${name} is a person.`), name, display_name: name, type: "character", role: "npc", location, traits: [], relationships: [], ...extra }) as WorldEntity;
const lore = (id: string, text: string, knowledge: unknown): WorldEntity => ({ ...prose(id, text), name: id, display_name: id, type: "world_lore", category: "fundamentals", related_entities: [], knowledge }) as unknown as WorldEntity;
export const LORE = Object.freeze({ public: "PUBLIC_LORE_SENTINEL", restricted: "RESTRICTED_LORE_SENTINEL", holder: "HOLDER_ONLY_LORE_SENTINEL", author: "AUTHOR_ONLY_LORE_SENTINEL" });
/** `secrets`: adds public / restricted (known_by Brenna) / holder_only (Brenna) / author_only canon; `secretNpc`: a narrator-only person present in the room (confidential encounter). */
/** `garments`: canonical item entities - `pink_cotton` and `pink_shorts` have a human display_name, `pink_fluffy` only has its machine handle. */
const GARMENTS: Readonly<Record<string, string>> = { pink_cotton: "Pink cotton shirt", pink_shorts: "Pink shorts", pink_fluffy: "pink_fluffy" };
export function sceneWorld(options: { readonly secrets?: boolean; readonly secretNpc?: boolean; readonly garments?: boolean; readonly constraints?: boolean; readonly canon?: boolean } = {}): WorldStore {
  const entities: WorldEntity[] = [
    ...(options.secrets ? [
      lore("lore_public", LORE.public, { visibility: { narrator: true, player: true }, known_by: [] }),
      lore("lore_restricted", LORE.restricted, { visibility: { narrator: true, player: false }, known_by: ["brenna"], awareness: "private" }),
      lore("lore_holder_only", LORE.holder, { visibility: { narrator: false, player: false }, known_by: ["brenna"], secrecy: "holder_only" }),
      lore("lore_author_only", LORE.author, { visibility: { narrator: false, player: false }, known_by: [], secrecy: "author_only" }),
    ] : []),
    ...(options.canon ? [lore("lore_tradition", "Tradition of the Heartstone household: the household sword always hangs above the great hearth, and the hearth is never left without a watcher after nightfall.", { visibility: { narrator: true, player: true }, known_by: [] })] : []),
    ...(options.garments ? Object.entries(GARMENTS).map(([id, display_name]) => ({ ...prose(id, `A ${id.replace(/_/g, " ")}.`), name: id, display_name, type: "item", owner: "nicco", state: {} }) as unknown as WorldEntity) : []),
    ...(options.secretNpc ? [{ ...person("seraph", "Seraph", SCENE_LOCATION), knowledge: { visibility: { narrator: true, player: false }, known_by: [] } } as WorldEntity] : []),
    { ...prose(SCENE_LOCATION, "A broad open living floor."), name: "Heartstone Living Floor", display_name: "Heartstone LR", type: "location", features: [{ name: "hearth", description: "A large stone hearth stands along one side." }], connections: [{ target: SCENE_ELSEWHERE, description: "Down the hatch", minutes: 1 }] } as WorldEntity,
    { ...prose(SCENE_ELSEWHERE, "A cold stone cellar."), name: "Cellar", display_name: "Cellar", type: "location", features: [], connections: [{ target: SCENE_LOCATION, description: "Up the hatch", minutes: 1 }] } as WorldEntity,
    { ...prose("nicco", "The player character."), name: "Nicco", display_name: "Nicco", type: "character", role: "player", location: null, traits: [], relationships: [] } as WorldEntity,
    person("brenna", "Brenna", SCENE_LOCATION), person("maren", "Maren", SCENE_LOCATION), person("gerome", "Gerome", SCENE_LOCATION, options.constraints ? { traits: ["silent construct that never speaks"] } : {}),
    person("pellan", "Pellan", SCENE_LOCATION),
    person("absent_korvin", "Korvin", SCENE_ELSEWHERE),
  ];
  return new WorldStore(entities.map(entity => ({ source: `synthetic/${entity.id}.yaml`, document: { schema_version: 1, entity, chunks: [] } })));
}
export interface SceneOptions { readonly commands?: readonly CampaignCommand[]; readonly learn?: readonly string[]; readonly minute?: number; readonly id?: string; readonly secrets?: boolean; readonly secretNpc?: boolean; readonly garments?: boolean; readonly constraints?: boolean; readonly canon?: boolean }
/** Brenna, Maren and Gerome are named for Nicco; Pellan is not. `commands` run after the base scene. */
export function sceneFixture(options: SceneOptions = {}) {
  const world = sceneWorld(options), campaign = new CampaignState(world, options.id ?? "scene_state", { player_location: SCENE_LOCATION, world_time: { world_minute: options.minute ?? 1182 } });
  campaign.apply({ expected_revision: 0, commands: [
    ...(options.learn ?? ["brenna", "maren", "gerome"]).flatMap(id => learnCanonicalName(world, campaign.exportSnapshot(), id)),
    { kind: "set_funds", character_id: "nicco", gold: 4 },
    ...(options.commands ?? []),
  ] });
  return { world, campaign };
}
export const apply = (campaign: CampaignState, ...commands: CampaignCommand[]) => campaign.apply({ expected_revision: campaign.revision, commands });
export const makeItem = (fields: Partial<Extract<CampaignCommand, { kind: "create_item" }>> & { name: string }): CampaignCommand =>
  ({ kind: "create_item", description: `${fields.name}.`, visual_description: `Plain ${fields.name.toLowerCase()} with no marks. SECRET_VISUAL_SENTINEL`, position: { kind: "carried", character_id: "nicco" }, ...fields }) as CampaignCommand;
export const fact = (id: string, statement: string, truth: "true" | "false" | "unknown" = "true"): CampaignCommand => ({ kind: "create_fact", fact: { id, content: { kind: "campaign", statement, truth } } });
export const knows = (character_id: string, fact_id: string, status: "knows" | "believes" | "suspects" | "heard_rumor" = "knows"): CampaignCommand => ({ kind: "set_knowledge", knowledge: { character_id, fact_id, status } });
export function promptFor(world: WorldStore, campaign: CampaignState, input = "", recent: readonly RecentExchange[] = []) {
  const snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot, { input }), intent = playerIntent(input, context, snapshot, world);
  const request = buildNarratorPrompt(input, context, recent, undefined, intent);
  return { context, intent, request, snapshot, text: request.messages[0]!.content };
}
/** The [CURRENT SCENE] block of a prompt (up to the temporal rule that follows it). */
export const sceneBlock = (text: string): string => { const start = text.indexOf("[CURRENT SCENE]"); const end = text.indexOf("TEMPORAL GROUNDING:", start); return text.slice(start, end < 0 ? undefined : end).trimEnd(); };

// ------------------------------------------------------------------------------------------------ the ideal scene + offline scenarios
export const WEST_GATE = "campaign_fact_west_gate";
export const WEST_GATE_TEXT = "The West Gate incident left two guards dead.";
const created = (id: string, name: string, location = SCENE_LOCATION): CampaignCommand => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name }, current: { current_location: location, status: "active" } } });
export const createdPerson = created;
export const itemId = (campaign: CampaignState, name: string): string => campaign.exportSnapshot().items.find(i => i.name === name)!.id;
/**
 * Phase 69 ideal scene: Heartstone LR, 19:42, Nicco / Brenna / Maren (Gerome and Pellan are fixture residents too, so tests that need
 * exactly three people remove them via `alone`), Brenna winded, her Nicco-owned Sword, a stored Letter, Mana 80/100, 4 Gold,
 * the West Gate fact known by Nicco and Brenna with no edge for Maren.
 */
export function idealScene(options: SceneOptions & { readonly extra?: readonly CampaignCommand[] } = {}) {
  const f = sceneFixture({ ...options, commands: [...alone, ...(options.commands ?? [])] });
  apply(f.campaign,
    { kind: "set_condition", character_id: "brenna", conditions: ["winded"] },
    { kind: "runtime_delta", delta: { mana_delta: -20 } },
    makeItem({ name: "Sword", description: "A plain iron sword.", owner_id: "nicco", position: { kind: "carried", character_id: "brenna" } }),
    makeItem({ name: "Letter", description: "A sealed letter.", owner_id: "nicco", position: { kind: "stored", location_id: SCENE_LOCATION } }),
    fact(WEST_GATE, WEST_GATE_TEXT), knows("nicco", WEST_GATE), knows("brenna", WEST_GATE), ...(options.extra ?? []));
  return f;
}
/** Make the room exactly Nicco, Brenna and Maren (Gerome and Pellan leave). */
export const alone: CampaignCommand[] = [{ kind: "move_character", character_id: "gerome", location_id: SCENE_ELSEWHERE }, { kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }];
export interface Scenario { readonly name: string; readonly input: string; readonly recent: readonly RecentExchange[]; readonly world: WorldStore; readonly campaign: CampaignState }
export function scenarios(): Scenario[] {
  const ex = (player: string, narration: string): RecentExchange => ({ player, narration, status: "finalized" });
  // A: simple conversation, nothing item-related is relevant.
  const a = sceneFixture({ id: "scenario_a", commands: alone });
  // B: item transfer aftermath: Nicco's sword was handed to Brenna; ownership and possession are reported as two facts.
  const b = sceneFixture({ id: "scenario_b", commands: alone });
  apply(b.campaign, makeItem({ name: "Sword", description: "A plain iron sword.", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } }));
  apply(b.campaign, { kind: "transfer_item", item_id: itemId(b.campaign, "Sword"), mode: "handoff", position: { kind: "carried", character_id: "brenna" } });
  // C: knowledge-sensitive: four scopes of the same fact across the room.
  const c = sceneFixture({ id: "scenario_c", commands: alone });
  apply(c.campaign, fact(WEST_GATE, WEST_GATE_TEXT), knows("nicco", WEST_GATE), knows("brenna", WEST_GATE), knows("maren", WEST_GATE, "heard_rumor"),
    fact("campaign_fact_bridge", "The eastern bridge is closed.", "false"), knows("nicco", "campaign_fact_bridge"), knows("maren", "campaign_fact_bridge", "believes"), knows("brenna", "campaign_fact_bridge", "suspects"));
  // D: stored-item interaction.
  const d = sceneFixture({ id: "scenario_d", commands: alone });
  apply(d.campaign, makeItem({ name: "Letter", description: "A sealed letter.", owner_id: "nicco", position: { kind: "stored", location_id: SCENE_LOCATION } }),
    makeItem({ name: "Silver knife", description: "A small silver knife.", position: { kind: "stored", location_id: SCENE_LOCATION } }),
    makeItem({ name: "Cellar key", position: { kind: "stored", location_id: SCENE_ELSEWHERE } }));
  // E: an NPC with a recorded condition while the player talks to someone else (Brenna becomes background).
  const e = sceneFixture({ id: "scenario_e", commands: alone });
  apply(e.campaign, { kind: "set_condition", character_id: "brenna", conditions: ["winded", "recovering"], presentation: "Leaning on the wall" }, { kind: "set_condition", character_id: "maren", conditions: ["minor_injury"] });
  // F: a larger household scene: members present and away, rules, relationships, owned and carried items, near events.
  const f = sceneFixture({ id: "scenario_f", commands: [{ kind: "create_household", id: "campaign_household_f", name: "Heartstone" }, { kind: "set_membership", household_id: "campaign_household_f", membership: { character_id: "nicco", status: "member", role: "owner" } }] });
  apply(f.campaign, createdPerson("campaign_character_ida", "Ida"), createdPerson("campaign_character_joss", "Joss", SCENE_ELSEWHERE),
    { kind: "join_household", household_id: "campaign_household_f", character_id: "brenna" }, { kind: "join_household", household_id: "campaign_household_f", character_id: "maren" },
    { kind: "join_household", household_id: "campaign_household_f", character_id: "campaign_character_joss" },
    { kind: "add_household_rule", household_id: "campaign_household_f", text: "No weapons at the table." },
    { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" },
    { kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "wariness", direction: "raise" },
    { kind: "set_condition", character_id: "maren", conditions: ["dazed"] },
    makeItem({ name: "Sword", owner_id: "nicco", position: { kind: "carried", character_id: "brenna" } }), makeItem({ name: "Satchel", position: { kind: "carried", character_id: "nicco" } }),
    makeItem({ name: "Lantern", position: { kind: "stored", location_id: SCENE_LOCATION } }),
    { kind: "schedule_event", id: "campaign_event_supper", title: "Supper with the household", scheduled_world_minute: 1260, participants: ["nicco", "brenna", "maren"] },
    { kind: "schedule_event", id: "campaign_event_far", title: "Harvest fair", scheduled_world_minute: 9000, participants: ["nicco"] });
  return [
    { name: "A simple conversation", input: "Good evening, Brenna.", recent: [], ...a },
    { name: "B transfer aftermath", input: "Brenna, how does the sword feel in your hand?", recent: [ex("*hands Brenna the sword*", "*Brenna takes the sword and tests its weight.*")], ...b },
    { name: "C knowledge-sensitive conversation", input: "Brenna, tell me about the West Gate incident.", recent: [], ...c },
    { name: "D stored item interaction", input: "*picks up the letter from where I left it*", recent: [], ...d },
    { name: "E NPC with a condition", input: "Maren, are you hurt?", recent: [], ...e },
    { name: "F large household scene", input: "Ida, is supper ready?", recent: [], ...f },
  ];
}
