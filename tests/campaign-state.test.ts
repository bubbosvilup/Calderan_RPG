import test from "node:test";
import assert from "node:assert/strict";
import { CampaignState, prepareCampaignChange } from "../src/campaign/campaign-state.js";
import { campaignId } from "../src/campaign/identity.js";
import { CampaignValidationError } from "../src/campaign/validation.js";
import { characterView, characterPossessions, equipmentSlot, itemView, remainingEventMinutes } from "../src/campaign/projections.js";
import type { CampaignCharacter, CampaignCommand, CampaignSnapshot, ItemPosition } from "../src/campaign/types.js";
import { WorldStore } from "../src/world/world-store.js";
import { RuntimeState, WORLD_DAY_MINUTES } from "../src/world/runtime-state.js";
import { loadWorld } from "../src/world/loader.js";
import { buildNarrativeContext } from "../src/scene/narrative-context-builder.js";
import { fixtures, room, garden, location, document } from "./fixtures.js";

const ada = campaignId("character", "ada"), ben = campaignId("character", "ben"), boots = campaignId("item", "boots"), house = campaignId("household", "home"), secret = campaignId("fact", "secret"), raid = campaignId("event", "raid"), goal = campaignId("goal", "prepare");
function setup(minute = 100) {
  const world = new WorldStore(fixtures());
  return { world, campaign: new CampaignState(world, "test_campaign", { player_location: room, world_time: { world_minute: minute } }, { current: 50, max: 100 }) };
}
function created(id = ada): CampaignCharacter { return { id, origin: { kind: "created" }, profile: { name: id === ada ? "Ada" : "Ben" }, current: {} }; }
function apply(campaign: CampaignState, ...commands: CampaignCommand[]) { return campaign.apply({ expected_revision: campaign.revision, commands }); }
function register(campaign: CampaignState) { apply(campaign, { kind: "register_character", character: created() }, { kind: "register_character", character: created(ben) }); }
function item(position: ItemPosition = { kind: "stored", location_id: room }): CampaignCommand {
  return { kind: "register_item", item: { id: boots, origin: { kind: "created" }, name: "Boots", description: "Synthetic test boots", owner_id: ada, position } };
}
function fact(): CampaignCommand { return { kind: "create_fact", fact: { id: secret, content: { kind: "campaign", statement: "A test cache is beneath the floor.", truth: "true" } } }; }
function event(scheduled = 100 + 8 * WORLD_DAY_MINUTES): CampaignCommand { return { kind: "schedule_event", id: raid, title: "Fixture raid", scheduled_world_minute: scheduled, participants: [ada, "brenna"] }; }

test("campaign-only character has stable identity and partial unknown profile", () => {
  const { campaign, world } = setup(); const c = created();
  c.profile.appearance = { height_cm: 171.5, hair: { color: "brown" }, scars: [{ location: "left hand", description: "old pale scar" }] };
  c.profile.age = { kind: "approximate", description: "early adulthood" };
  c.current.current_location = room;
  apply(campaign, { kind: "register_character", character: c });
  c.profile.name = "Mutated input"; c.profile.appearance.hair!.color = "green";
  const view = characterView(campaign.exportSnapshot(), world, ada);
  assert.equal(view.profile.name, "Ada"); assert.equal(view.profile.appearance?.hair?.color, "brown");
  assert.equal(view.current.current_location, room); assert.equal(view.profile.appearance?.weight_kg, undefined);
  assert.equal(view.profile.species, undefined); assert.equal(view.profile.gender, undefined);
  assert.equal(world.getEntity(ada), undefined); assert.equal(campaignId("character", "ada"), ada);
  const clone = structuredClone(campaign.exportSnapshot()) as CampaignSnapshot; assert.deepEqual(clone.characters, campaign.exportSnapshot().characters);
  clone.characters[0]!.profile.name = "Detached"; assert.equal(campaign.exportSnapshot().characters[0]!.profile.name, "Ada");
});

test("profile continuity survives transient condition and location changes", () => {
  const { campaign, world } = setup(); const c = created();
  c.profile.appearance = { build: "slender", eyes: "gray", skin: "freckled", distinguishing_marks: ["birthmark"], distinctive_traits: ["broad smile"], description: "Fixture description", weight_kg: 62 };
  c.profile.voice = "soft"; c.profile.sex = "female"; c.profile.gender = "woman"; c.profile.species = "human";
  apply(campaign, { kind: "register_character", character: c }); const before = campaign.exportSnapshot().characters[0]!.profile;
  apply(campaign, { kind: "set_condition", character_id: ada, conditions: ["injured", "wet"], presentation: "covered in mud", status: "active" }, { kind: "move_character", character_id: ada, location_id: garden });
  const v = characterView(campaign.exportSnapshot(), world, ada);
  assert.deepEqual(v.profile, before); assert.deepEqual(v.current.conditions, ["injured", "wet"]); assert.equal(v.current.current_location, garden);
  apply(campaign, { kind: "set_condition", character_id: ada, conditions: [] });
  assert.equal(characterView(campaign.exportSnapshot(), world, ada).current.presentation, undefined);
});

test("canonical characters resolve without copying lore and location stays in runtime", () => {
  const { campaign, world } = setup();
  assert.equal(characterView(campaign.exportSnapshot(), world, "brenna").current.current_location, room);
  assert.equal(campaign.exportSnapshot().characters.length, 0);
  apply(campaign, { kind: "register_character", character: { id: "brenna", origin: { kind: "canonical", canonical_entity_id: "brenna" }, profile: {}, current: {} } },
    { kind: "set_profile", character_id: "brenna", profile: { aliases: ["Fixture nickname"], appearance: { eyes: "brown" } } },
    { kind: "move_character", character_id: "brenna", location_id: garden }, { kind: "move_character", character_id: "nicco", location_id: garden });
  const s = campaign.exportSnapshot(), v = characterView(s, world, "brenna");
  assert.equal(v.profile.name, "brenna"); assert.equal(s.characters[0]!.profile.name, undefined);
  assert.equal(s.characters[0]!.current.current_location, undefined); assert.equal(v.current.current_location, garden);
  assert.equal(characterView(s, world, "nicco").current.current_location, garden);
  const authored = world.getEntity("brenna"); assert.equal(authored?.type === "character" && authored.location, room);
});

test("origins cannot mix, canonical aliases cannot shadow, registration collisions fail", () => {
  const { campaign } = setup(); register(campaign);
  const invalid = [created(), { ...created(), id: "brenna" }, { ...created(), id: "fake", origin: { kind: "canonical", canonical_entity_id: "brenna" } },
    { ...created(), id: room, origin: { kind: "canonical", canonical_entity_id: room } },
    { ...created(), id: "brenna", origin: { kind: "canonical", canonical_entity_id: "brenna" }, current: { current_location: room } },
    { ...created(), origin: { kind: "created", canonical_entity_id: "brenna" } }];
  for (const character of invalid) assert.throws(() => campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "register_character", character }] }), CampaignValidationError);
});

test("campaign prefix does not permit collisions with a canonical ID", () => {
  const world = new WorldStore([...fixtures(), { source: `${ada}.yaml`, document: document(location(ada)) }]);
  const campaign = new CampaignState(world, "test", { player_location: room, world_time: { world_minute: 0 } });
  assert.throws(() => apply(campaign, { kind: "register_character", character: created() }), /collision/);
});

test("an unnamed created character retains unknown identity facts without placeholders", () => {
  const { campaign, world } = setup();
  apply(campaign, { kind: "register_character", character: { id: ada, origin: { kind: "created" }, profile: {}, current: {} } });
  const view = characterView(campaign.exportSnapshot(), world, ada);
  assert.deepEqual(view.profile, {}); assert.deepEqual(view.current, {}); assert.equal(view.id, ada);
  apply(campaign, { kind: "set_profile", character_id: ada, profile: { name: "Ada", aliases: ["A"] } });
  assert.equal(characterView(campaign.exportSnapshot(), world, ada).id, ada);
});

test("owns boots does not imply wearing, carrying or holding; removal retains ownership", () => {
  const { campaign, world } = setup(); register(campaign); apply(campaign, item());
  let p = characterPossessions(campaign.exportSnapshot(), world, ada);
  assert.equal(p.owned.length, 1); assert.equal(p.stored_owned.length, 1); assert.equal(p.carried.length, 0); assert.equal(p.equipped.length, 0);
  assert.equal(equipmentSlot(campaign.exportSnapshot(), world, ada, "feet").state, "unknown");
  apply(campaign, { kind: "place_item", item_id: boots, position: { kind: "equipped", character_id: ada, slot: "feet", mode: "worn" } });
  assert.deepEqual(equipmentSlot(campaign.exportSnapshot(), world, ada, "feet"), { state: "occupied", item_id: boots, mode: "worn" });
  apply(campaign, { kind: "place_item", item_id: boots, position: { kind: "carried", character_id: ada } });
  p = characterPossessions(campaign.exportSnapshot(), world, ada); assert.equal(p.owned.length, 1); assert.equal(p.carried.length, 1); assert.equal(p.equipped.length, 0);
  assert.equal(equipmentSlot(campaign.exportSnapshot(), world, ada, "feet").state, "empty");
});

test("gift transfers owner and placement atomically; borrowing permits distinct owner/holder", () => {
  const { campaign, world } = setup(); register(campaign); apply(campaign, item({ kind: "equipped", character_id: ada, slot: "feet", mode: "worn" }));
  apply(campaign, { kind: "transfer_item", item_id: boots, owner_id: ben, position: { kind: "carried", character_id: ben }, acquisition: { acquired_at: 100, acquisition_kind: "gift", from_character_id: ada } });
  const s = campaign.exportSnapshot(); assert.equal(s.items[0]!.owner_id, ben); assert.equal(s.items[0]!.acquisition?.from_character_id, ada);
  assert.equal(characterPossessions(s, world, ada).owned.length, 0); assert.equal(characterPossessions(s, world, ben).carried.length, 1);
  assert.equal(equipmentSlot(s, world, ada, "feet").state, "empty");
  apply(campaign, { kind: "place_item", item_id: boots, position: { kind: "carried", character_id: ada } });
  assert.equal(characterPossessions(campaign.exportSnapshot(), world, ben).owned.length, 1);
  assert.equal(characterPossessions(campaign.exportSnapshot(), world, ada).carried.length, 1);
});

test("slot conflicts and contradictory placements reject without partial transfer", () => {
  const { campaign } = setup(); register(campaign); apply(campaign, item({ kind: "equipped", character_id: ada, slot: "feet", mode: "worn" }));
  const before = campaign.exportSnapshot();
  assert.throws(() => apply(campaign, { kind: "register_item", item: { id: campaignId("item", "other"), origin: { kind: "created" }, name: "Other boots", position: { kind: "equipped", character_id: ada, slot: "feet", mode: "worn" } } }), /occupied/);
  assert.throws(() => apply(campaign, { kind: "set_slot_knowledge", character_id: ada, slot: "feet", state: "empty" }), /occupied/);
  assert.throws(() => campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "place_item", item_id: boots, position: { kind: "carried", character_id: ada, location_id: room } }] }), /unknown field/);
  assert.throws(() => apply(campaign, { kind: "transfer_item", item_id: boots, owner_id: ben, position: { kind: "carried", character_id: "missing" } }), /unknown character/);
  assert.equal(campaign.exportSnapshot(), before);
});

test("held differs from worn and explicit empty differs from unknown", () => {
  const { campaign, world } = setup(); register(campaign); apply(campaign, item({ kind: "equipped", character_id: ada, slot: "left_hand", mode: "held" }));
  assert.equal(equipmentSlot(campaign.exportSnapshot(), world, ada, "left_hand").state, "occupied");
  const position = campaign.exportSnapshot().items[0]!.position; assert.equal(position.kind === "equipped" && position.mode, "held");
  apply(campaign, { kind: "set_slot_knowledge", character_id: ada, slot: "feet", state: "empty" });
  assert.equal(equipmentSlot(campaign.exportSnapshot(), world, ada, "feet").state, "empty");
  apply(campaign, { kind: "set_slot_knowledge", character_id: ada, slot: "feet", state: "unknown" });
  assert.equal(equipmentSlot(campaign.exportSnapshot(), world, ada, "feet").state, "unknown");
});

test("canonical item baseline is referenced; authored owner is not equipment", () => {
  const { campaign, world } = setup();
  apply(campaign, { kind: "register_item", item: { id: "bag", origin: { kind: "canonical", canonical_entity_id: "bag" }, position: { kind: "unknown" } } });
  const i = campaign.exportSnapshot().items[0]!; assert.equal(i.name, undefined); assert.equal(i.description, undefined); assert.equal(i.owner_id, "brenna");
  assert.equal(itemView(campaign.exportSnapshot(), world, "bag").name, "bag");
  assert.equal(characterPossessions(campaign.exportSnapshot(), world, "brenna").equipped.length, 0);
  assert.equal(characterPossessions(campaign.exportSnapshot(), world, "brenna").carried.length, 0);
});

test("household join, role, leave and rejoin persist; duplicate update is a no-op", () => {
  const { campaign } = setup(); register(campaign);
  apply(campaign, { kind: "create_household", id: house }, { kind: "set_membership", household_id: house, membership: { character_id: ada, status: "guest", role: "visitor" } });
  const revision = campaign.revision;
  apply(campaign, { kind: "set_membership", household_id: house, membership: { character_id: ada, status: "guest", role: "visitor" } });
  assert.equal(campaign.revision, revision);
  apply(campaign, { kind: "set_membership", household_id: house, membership: { character_id: ada, status: "member" } });
  apply(campaign, { kind: "set_membership", household_id: house, membership: { character_id: ada, status: "former_member" } });
  const clone = structuredClone(campaign.exportSnapshot()); assert.equal(clone.households[0]!.members[0]!.status, "former_member");
  apply(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 20 } }, { kind: "set_membership", household_id: house, membership: { character_id: ada, status: "member" } });
  assert.equal(campaign.exportSnapshot().households[0]!.members[0]!.joined_at, 120);
  assert.throws(() => apply(campaign, { kind: "set_membership", household_id: house, membership: { character_id: "missing", status: "member" } }), /unknown character/);
});

test("knowledge is sparse and per-character; updates never teach other characters", () => {
  const { campaign } = setup(); register(campaign); apply(campaign, fact());
  assert.equal(campaign.exportSnapshot().knowledge.length, 0);
  apply(campaign, { kind: "set_knowledge", knowledge: { character_id: ada, fact_id: secret, status: "knows", provenance: { learned_at: 100, acquisition_kind: "witnessed" } } });
  assert.equal(campaign.exportSnapshot().knowledge.some(k => k.character_id === ben), false);
  apply(campaign, { kind: "set_knowledge", knowledge: { character_id: ben, fact_id: secret, status: "suspects" } });
  const revision = campaign.revision;
  apply(campaign, { kind: "set_knowledge", knowledge: { character_id: ben, fact_id: secret, status: "suspects" } });
  assert.equal(campaign.revision, revision); assert.equal(campaign.exportSnapshot().knowledge.length, 2);
  apply(campaign, { kind: "set_knowledge", knowledge: { character_id: ben, fact_id: secret, status: "heard_rumor", provenance: { source_character_id: ada, source_event_id: "meeting", acquisition_kind: "told" } } });
  assert.equal(campaign.exportSnapshot().knowledge.find(k => k.character_id === ada)?.status, "knows");
  assert.throws(() => apply(campaign, { kind: "set_knowledge", knowledge: { character_id: ada, fact_id: "missing", status: "believes" } }), /unknown record/);
});

test("canonical facts reference canon; rumor beliefs do not alter world truth", () => {
  const { campaign } = setup(); register(campaign);
  apply(campaign, { kind: "create_fact", fact: { id: secret, content: { kind: "canonical", entity_id: "brenna", chunk_id: "brenna.overview" } } });
  assert.equal(campaign.exportSnapshot().knowledge.length, 0);
  const rumor = campaignId("fact", "rumor");
  apply(campaign, { kind: "create_fact", fact: { id: rumor, content: { kind: "campaign", statement: "An untrue fixture claim", truth: "false" } } }, { kind: "set_knowledge", knowledge: { character_id: ben, fact_id: rumor, status: "believes" } });
  assert.deepEqual(campaign.exportSnapshot().facts.find(f => f.id === rumor)?.content, { kind: "campaign", statement: "An untrue fixture claim", truth: "false" });
  assert.throws(() => apply(campaign, { kind: "create_fact", fact: { id: campaignId("fact", "bad"), content: { kind: "canonical", entity_id: "maren", chunk_id: "brenna.overview" } } }), /must belong/);
});

test("directed sparse trust distinguishes absence from zero and does not imply other axes", () => {
  const { campaign } = setup(); register(campaign); assert.equal(campaign.exportSnapshot().relationships.length, 0);
  apply(campaign, { kind: "seed_relationship", relationship: { from_character_id: ada, to_character_id: ben, trust: 0, seed_context: "explicit neutral introduction" } });
  assert.equal(campaign.exportSnapshot().relationships.length, 1);
  assert.equal(campaign.exportSnapshot().relationships.some(e => e.from_character_id === ben), false);
  apply(campaign, { kind: "seed_relationship", relationship: { from_character_id: ben, to_character_id: ada, trust: -30 } }, { kind: "set_trust", from_character_id: ada, to_character_id: ben, trust: 40 });
  const edges = campaign.exportSnapshot().relationships; assert.equal(edges[0]!.trust, 40); assert.equal(edges[1]!.trust, -30);
  assert.equal("affection" in edges[0]!, false); assert.throws(() => Object.assign(edges[0]!, { trust: 90 }), TypeError);
  assert.throws(() => apply(campaign, { kind: "seed_relationship", relationship: { from_character_id: ada, to_character_id: ben, trust: 0 } }), /already seeded/);
  assert.throws(() => apply(campaign, { kind: "seed_relationship", relationship: { from_character_id: ada, to_character_id: ada, trust: 0 } }), /self-edge/);
});

for (const trust of [-101, 101, 1.5, NaN, Infinity]) test(`trust rejects invalid value ${trust}`, () => {
  const { campaign } = setup(); register(campaign);
  assert.throws(() => apply(campaign, { kind: "seed_relationship", relationship: { from_character_id: ada, to_character_id: ben, trust } }), CampaignValidationError);
});

test("goals have stable IDs, absolute creation time and terminal lifecycle", () => {
  const { campaign } = setup(); register(campaign); apply(campaign, event());
  apply(campaign, { kind: "create_goal", id: goal, character_id: ada, description: "Prepare for fixture raid", target: { kind: "event", id: raid } });
  const g = campaign.exportSnapshot().goals[0]!; assert.equal(g.created_at, 100); assert.equal(g.status, "active");
  apply(campaign, { kind: "set_goal_status", goal_id: goal, status: "completed" });
  assert.equal(campaign.exportSnapshot().goals[0]!.id, goal);
  assert.throws(() => apply(campaign, { kind: "set_goal_status", goal_id: goal, status: "active" }), /terminal/);
  const abandoned = campaignId("goal", "abandoned"), failed = campaignId("goal", "failed");
  apply(campaign, { kind: "create_goal", id: abandoned, character_id: ada, description: "Fixture goal" }, { kind: "set_goal_status", goal_id: abandoned, status: "abandoned" }, { kind: "create_goal", id: failed, character_id: ben, description: "Fixture goal" }, { kind: "set_goal_status", goal_id: failed, status: "failed" });
  assert.equal(campaign.exportSnapshot().goals.find(g => g.id === abandoned)?.status, "abandoned");
  assert.equal(campaign.exportSnapshot().goals.find(g => g.id === failed)?.status, "failed");
});

test("scheduled time stays absolute through clock advancement and mana recovery", () => {
  const { campaign } = setup(); register(campaign); apply(campaign, event());
  const target = campaign.exportSnapshot().scheduled_events[0]!.scheduled_world_minute;
  assert.equal(remainingEventMinutes(campaign.exportSnapshot(), raid), 8 * WORLD_DAY_MINUTES);
  apply(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 3 * WORLD_DAY_MINUTES } });
  assert.equal(remainingEventMinutes(campaign.exportSnapshot(), raid), 5 * WORLD_DAY_MINUTES);
  assert.equal(campaign.exportSnapshot().scheduled_events[0]!.scheduled_world_minute, target);
  assert.equal(campaign.exportSnapshot().runtime.mana.current, 100);
  apply(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 6 * WORLD_DAY_MINUTES } });
  assert.equal(remainingEventMinutes(campaign.exportSnapshot(), raid), -WORLD_DAY_MINUTES);
  assert.equal(campaign.exportSnapshot().scheduled_events[0]!.status, "scheduled");
});

test("past schedules, explicit event transitions and terminal reschedule rejection", () => {
  const { campaign } = setup(); register(campaign); apply(campaign, event(-10));
  assert.equal(remainingEventMinutes(campaign.exportSnapshot(), raid), -110);
  assert.throws(() => apply(campaign, { kind: "set_event_status", event_id: raid, status: "completed" }), /lifecycle/);
  apply(campaign, { kind: "reschedule_event", event_id: raid, scheduled_world_minute: 0 }, { kind: "set_event_status", event_id: raid, status: "triggered" }, { kind: "set_event_status", event_id: raid, status: "completed" });
  assert.throws(() => apply(campaign, { kind: "reschedule_event", event_id: raid, scheduled_world_minute: 900 }), /only scheduled/);
  const cancelled = campaignId("event", "cancelled");
  apply(campaign, { kind: "schedule_event", id: cancelled, title: "Cancel fixture", scheduled_world_minute: 200 }, { kind: "set_event_status", event_id: cancelled, status: "cancelled" });
  assert.throws(() => apply(campaign, { kind: "set_event_status", event_id: cancelled, status: "triggered" }), /lifecycle/);
});

test("compound changes stage purely and commit exactly one revision", () => {
  const { campaign, world } = setup(); register(campaign); apply(campaign, item(), fact());
  const before = campaign.exportSnapshot(), canonicalBefore = structuredClone(world.listEntities());
  const commands: CampaignCommand[] = [
    { kind: "move_character", character_id: ada, location_id: garden },
    { kind: "move_character", character_id: "brenna", location_id: garden },
    { kind: "transfer_item", item_id: boots, owner_id: ben, position: { kind: "carried", character_id: ben } },
    { kind: "set_knowledge", knowledge: { character_id: ada, fact_id: secret, status: "knows" } },
    { kind: "seed_relationship", relationship: { from_character_id: ada, to_character_id: ben, trust: 10 } }, event(),
    { kind: "runtime_delta", delta: { time_advance_minutes: 5, mana_delta: -5 } },
  ];
  const p = campaign.prepare({ expected_revision: before.revision, commands });
  assert.equal(campaign.exportSnapshot(), before); assert.equal(p.next_revision, before.revision + 1);
  assert.equal(p.snapshot.runtime.scene.world_time.world_minute, 105); assert.equal(p.snapshot.runtime.mana.current, 45);
  assert.deepEqual(campaign.commit(p), { revision: before.revision + 1, changed: true });
  assert.equal(campaign.exportSnapshot().scheduled_events.length, 1); assert.deepEqual(world.listEntities(), canonicalBefore);
});

test("late cross-domain failure rolls back clock, mana, moves, items and knowledge", () => {
  const { campaign } = setup(); register(campaign); apply(campaign, item(), fact()); const before = campaign.exportSnapshot();
  assert.throws(() => apply(campaign,
    { kind: "runtime_delta", delta: { time_advance_minutes: WORLD_DAY_MINUTES, mana_delta: -10 } },
    { kind: "move_character", character_id: "brenna", location_id: garden },
    { kind: "transfer_item", item_id: boots, owner_id: ben, position: { kind: "carried", character_id: ben } },
    { kind: "set_knowledge", knowledge: { character_id: ada, fact_id: secret, status: "knows" } },
    { kind: "schedule_event", id: raid, title: "Invalid participant", scheduled_world_minute: 9000, participants: ["missing"] }), /unknown character/);
  assert.equal(campaign.exportSnapshot(), before);
});

test("stale, foreign, forged, altered and reused preparations cannot commit", () => {
  const { campaign, world } = setup(); register(campaign); const input = { expected_revision: campaign.revision, commands: [{ kind: "move_character", character_id: ada, location_id: garden }] };
  const p = campaign.prepare(input); input.commands[0]!.location_id = "missing";
  assert.throws(() => Object.assign(p.snapshot, { revision: 800 }), TypeError);
  assert.throws(() => campaign.commit({ ...p }), /forged/);
  assert.throws(() => campaign.commit(prepareCampaignChange(campaign.exportSnapshot(), world, input)), /unknown canonical location/);
  const other = setup().campaign; assert.throws(() => other.commit(p), /foreign/);
  const pure = prepareCampaignChange(campaign.exportSnapshot(), world, { expected_revision: campaign.revision, commands: [] });
  assert.throws(() => campaign.commit(pure), /forged/);
  campaign.commit(p); assert.throws(() => campaign.commit(p), /consumed/);
  const stale = campaign.prepare({ expected_revision: campaign.revision, commands: [] });
  apply(campaign, { kind: "move_character", character_id: ada, location_id: room });
  assert.throws(() => campaign.commit(stale), /stale/);
  assert.throws(() => campaign.apply({ expected_revision: 0, commands: [] }), /stale/);
});

test("no-op commands preserve snapshot identity and revision", () => {
  const { campaign } = setup(); const before = campaign.exportSnapshot();
  assert.deepEqual(apply(campaign), { revision: 0, changed: false }); assert.equal(campaign.exportSnapshot(), before);
  apply(campaign, { kind: "move_character", character_id: "nicco", location_id: room }, { kind: "runtime_delta", delta: { time_advance_minutes: 0, mana_delta: 0 } });
  assert.equal(campaign.exportSnapshot(), before);
});

test("snapshot contains direct typed state, one revision and dataset identity", () => {
  const { campaign, world } = setup(); register(campaign); apply(campaign, event(), fact(), item());
  const snapshot = campaign.exportSnapshot(); assert.equal(snapshot.dataset_id, world.datasetId); assert.equal(snapshot.schema_version, 2);
  assert.equal("revision" in snapshot.runtime, false); assert.equal("days_remaining" in snapshot.scheduled_events[0]!, false);
  assert.deepEqual(structuredClone(snapshot), snapshot);
  assert.throws(() => (snapshot.characters as CampaignCharacter[]).push(created()), TypeError);
  assert.throws(() => Object.assign(snapshot.characters[0]!.profile, { name: "forged" }), TypeError);
  assert.equal("history" in snapshot, false); assert.equal("narrative_context" in snapshot, false);
});

test("campaign and legacy runtime share clock, mana and movement semantics", () => {
  const { campaign, world } = setup();
  const runtime = new RuntimeState(world, { player_location: room, world_time: { world_minute: 100 } }, { current: 50, max: 100 });
  const delta = { player_location: garden, character_movements: [{ character_id: "brenna", current_location: garden }], time_advance_minutes: 2 * WORLD_DAY_MINUTES, mana_delta: -25 };
  runtime.applySceneDelta(delta); apply(campaign, { kind: "runtime_delta", delta });
  const { revision, ...snapshot } = runtime.exportSnapshot(); assert.equal(revision, campaign.revision); assert.deepEqual(snapshot, campaign.exportSnapshot().runtime);
  runtime.advanceTime(1); assert.equal(campaign.exportSnapshot().runtime.scene.world_time.world_minute, 2980);
});

test("safe integer clock and countdown overflow are rejected without partial state", () => {
  const { campaign } = setup(Number.MAX_SAFE_INTEGER); const before = campaign.exportSnapshot();
  assert.throws(() => apply(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } }), /safe-integer/); assert.equal(campaign.exportSnapshot(), before);
  apply(campaign, { kind: "schedule_event", id: raid, title: "Past", scheduled_world_minute: Number.MIN_SAFE_INTEGER });
  assert.throws(() => remainingEventMinutes(campaign.exportSnapshot(), raid), /safe-integer/);
});

test("pure preparation rejects incompatible dataset and revision overflow", () => {
  const { campaign, world } = setup(); const original = campaign.exportSnapshot();
  const wrong = structuredClone(original) as CampaignSnapshot; wrong.dataset_id = "wrong";
  assert.throws(() => prepareCampaignChange(wrong, world, { expected_revision: 0, commands: [] }), /mismatch/);
  const full = structuredClone(original) as CampaignSnapshot; full.revision = Number.MAX_SAFE_INTEGER;
  assert.throws(() => prepareCampaignChange(full, world, { expected_revision: full.revision, commands: [{ kind: "register_character", character: created() }] }), /overflow/);
});

test("untrusted commands reject accessors, inherited fields, cycles, holes and extra state", () => {
  const { campaign } = setup(); let invoked = false;
  const getter = { expected_revision: 0, get commands() { invoked = true; return []; } };
  const entry = Object.defineProperty({}, "kind", { get() { invoked = true; return "runtime_delta"; } });
  const nested = Object.defineProperty({ ...created() }, "profile", { get() { invoked = true; return {}; } });
  const indexed = Object.defineProperty([], "0", { get() { invoked = true; return {}; } });
  const circular: Record<string, unknown> = {}; circular.kind = "created"; circular.origin = circular;
  const invalid: unknown[] = [getter, Object.create({ expected_revision: 0, commands: [] }), { expected_revision: 0, commands: new Array(1) },
    { expected_revision: 0, commands: indexed }, { expected_revision: 0, commands: [entry] },
    { expected_revision: 0, commands: [{ kind: "register_character", character: nested }] },
    { expected_revision: 0, commands: [{ kind: "register_character", character: { ...created(), origin: circular } }] },
    { expected_revision: 0, commands: [], revision: 99 }, { expected_revision: 0, commands: [], [Symbol("extra")]: true },
    { expected_revision: 0, commands: Object.assign([], { extra: 1 }) },
    { expected_revision: 0, commands: [{ kind: "register_character", character: { ...created(), profile: { appearance: { height_cm: NaN } } } }] },
    { expected_revision: 0, commands: [{ kind: "register_character", character: { ...created(), profile: { name: "Ada", age: { kind: "exact", years: -1 } } } }] },
    { expected_revision: 0, commands: [{ kind: "register_character", character: { ...created(), current: { status: "zombie" } } }] },
    { expected_revision: 0, commands: [{ kind: "patch", path: "runtime.mana.current", value: 1000 }] },
    { expected_revision: 0, commands: Array(129).fill({ kind: "runtime_delta", delta: {} }) },
    { expected_revision: 0, commands: [{ kind: "create_household", id: "__proto__" }] },
    { expected_revision: 0, commands: [{ kind: "register_character", character: { ...created(), profile: { name: "Ada", aliases: ["A", "A"] } } }] },
  ];
  const before = campaign.exportSnapshot();
  for (const input of invalid) { assert.throws(() => campaign.apply(input), CampaignValidationError); assert.equal(campaign.exportSnapshot(), before); }
  assert.equal(invoked, false);
});

test("all reference-bearing domains validate identities and provenance", () => {
  const { campaign } = setup(); register(campaign); apply(campaign, item(), fact(), { kind: "create_household", id: house });
  const bad: CampaignCommand[] = [
    { kind: "move_character", character_id: ada, location_id: "brenna" },
    { kind: "place_item", item_id: boots, position: { kind: "stored", location_id: "missing" } },
    { kind: "transfer_item", item_id: boots, owner_id: "missing", position: { kind: "unknown" } },
    { kind: "transfer_item", item_id: boots, owner_id: ada, position: { kind: "unknown" }, acquisition: { from_character_id: "missing" } },
    { kind: "transfer_item", item_id: boots, owner_id: ada, position: { kind: "unknown" }, acquisition: { event_id: "missing" } },
    { kind: "transfer_item", item_id: boots, owner_id: ada, position: { kind: "unknown" }, acquisition: { acquired_at: 101 } },
    { kind: "set_membership", household_id: house, membership: { character_id: ada, status: "member", joined_at: 101 } },
    { kind: "set_membership", household_id: house, membership: { character_id: ben, status: "former_member" } },
    { kind: "set_knowledge", knowledge: { character_id: "missing", fact_id: secret, status: "knows" } },
    { kind: "set_knowledge", knowledge: { character_id: ada, fact_id: secret, status: "knows", provenance: { source_character_id: "missing" } } },
    { kind: "set_knowledge", knowledge: { character_id: ada, fact_id: secret, status: "knows", provenance: { source_event_id: "missing" } } },
    { kind: "set_knowledge", knowledge: { character_id: ada, fact_id: secret, status: "knows", provenance: { learned_at: 101 } } },
    { kind: "seed_relationship", relationship: { from_character_id: ada, to_character_id: "missing", trust: 0 } },
    { kind: "set_trust", from_character_id: ada, to_character_id: ben, trust: 50 },
    { kind: "create_goal", id: goal, character_id: "missing", description: "Invalid" },
    ...(["canonical", "character", "item", "event"] as const).map(kind => ({ kind: "create_goal" as const, id: goal, character_id: ada, description: "Bad target", target: { kind, id: "missing" } })),
    { kind: "schedule_event", id: raid, title: "Bad participant", scheduled_world_minute: 500, participants: ["missing"] },
    { kind: "register_item", item: { id: campaignId("item", "bad"), origin: { kind: "created" }, name: "Bad owner", owner_id: room, position: { kind: "unknown" } } },
  ];
  const before = campaign.exportSnapshot();
  for (const command of bad) { assert.throws(() => apply(campaign, command), CampaignValidationError); assert.equal(campaign.exportSnapshot(), before); }
});

test("ordered commands can refer to earlier creations, never unresolved later creations", () => {
  const { campaign } = setup();
  const knowledge: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: ada, fact_id: secret, status: "knows" } };
  assert.throws(() => apply(campaign, knowledge, fact(), { kind: "register_character", character: created() }), /unknown character/);
  apply(campaign, { kind: "register_character", character: created() }, fact(), knowledge);
  assert.equal(campaign.revision, 1); assert.equal(campaign.exportSnapshot().knowledge.length, 1);
});

test("production canon and current narrative projection remain unchanged", async () => {
  const world = await loadWorld("data"), canonical = structuredClone(world.listEntities());
  const runtime = new RuntimeState(world, { player_location: "heartstone_lr", world_time: { world_minute: 0 } });
  const before = buildNarrativeContext(world, runtime);
  const campaign = new CampaignState(world, "synthetic_campaign", { player_location: "heartstone_lr", world_time: { world_minute: 0 } });
  apply(campaign, { kind: "register_character", character: created() }, { kind: "move_character", character_id: ada, location_id: "heartstone_f1" },
    { kind: "runtime_delta", delta: { time_advance_minutes: WORLD_DAY_MINUTES, player_location: "calderan" } });
  assert.deepEqual(world.listEntities(), canonical); assert.deepEqual(buildNarrativeContext(world, runtime), before);
  assert.equal(world.getEntity(ada), undefined);
});
