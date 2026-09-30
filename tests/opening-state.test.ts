import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { createOpeningCampaign, OPENING_FACTS, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { projectKnowledgeAccess, renderKnowledgeAccess } from "../src/turn/narrative-authority.js";

test("canon defines Nicco as the single player and connects the square outside Heartstone both ways", async () => {
  const world = await loadWorld("data"), nicco = world.getEntity("nicco");
  assert.equal(nicco?.type, "character"); assert.equal(nicco.type === "character" && nicco.role, "player");
  assert.deepEqual(world.getEntitiesByType("character").filter(c => c.role === "player").map(c => c.id), ["nicco"]);
  assert.deepEqual(nicco.knowledge?.known_by, []);
  const square = world.getEntity(OPENING_LOCATION), lr = world.getEntity("heartstone_lr");
  assert.ok(square?.type === "location" && square.connections.some(c => c.target === "heartstone_lr"));
  assert.ok(lr?.type === "location" && lr.connections.some(c => c.target === OPENING_LOCATION));
});
test("opening campaign: Nicco outside Heartstone, sole household owner, private self-facts, nothing else", async () => {
  const world = await loadWorld("data"), campaign = createOpeningCampaign(world, "opening"), s = campaign.exportSnapshot();
  assert.equal(s.runtime.scene.player_location, OPENING_LOCATION); assert.equal(s.revision, 1);
  assert.deepEqual(s.households, [{ id: OPENING_HOUSEHOLD, name: "Heartstone", members: [{ character_id: "nicco", status: "member", role: "owner", joined_at: 0 }] }]);
  assert.deepEqual(s.facts.map(f => f.id).sort(), OPENING_FACTS.map(f => f.id).sort());
  assert.ok(s.knowledge.every(k => k.character_id === "nicco")); assert.equal(s.knowledge.length, OPENING_FACTS.length);
  assert.deepEqual([s.characters, s.items, s.relationships, s.goals, s.scheduled_events, s.runtime.npc_locations], [[], [], [], [], [], [{ character_id: "arwen_woodsigner", current_location: "the_bent_bough" }, { character_id: "bartolomhew", current_location: "calderan_slave_market" }, { character_id: "bram_kessel", current_location: "the_daily_grind" }, { character_id: "brother_aven", current_location: "open_hand_chapel" }, { character_id: "brunna_keld", current_location: "house_of_making" }, { character_id: "captain_doran_hale", current_location: "west_guard_post" }, { character_id: "cassian_valerius", current_location: "cathedral_of_the_bladed_sun" }, { character_id: "dunrig_iron_hands", current_location: "calderan_east" }, { character_id: "gaston", current_location: "calderan_east" }, { character_id: "hadrik_voss", current_location: "blackiron_repairs_and_arms" }, { character_id: "halden_cross", current_location: "imperial_gate" }, { character_id: "helbrecht", current_location: "bastion_of_vigilance" }, { character_id: "jessa_rook", current_location: "gatherers_inn" }, { character_id: "korvin", current_location: "calderan_slave_market" }, { character_id: "livia_marr", current_location: "livias_needles" }, { character_id: "lysandra_vell", current_location: "spire_academy" }, { character_id: "marta_pell", current_location: "wayfarers_rest" }, { character_id: "matthias_eld", current_location: "the_collegium" }, { character_id: "mira_thorne", current_location: "mudlarks_herbs" }, { character_id: "mistress_elara", current_location: "calderan_slave_market" }, { character_id: "niles_vanner", current_location: "second_chance_pawn" }, { character_id: "odelia_crane", current_location: "the_collegium" }, { character_id: "oren_quarn", current_location: "high_courts_of_calderan" }, { character_id: "orla_fen", current_location: "the_white_basin" }, { character_id: "pellan", current_location: "calderan_center" }, { character_id: "rufus_tern", current_location: "the_long_yard" }, { character_id: "severan_krauss", current_location: "bastion_of_vigilance" }, { character_id: "sister_mereth", current_location: "saint_orra_house" }, { character_id: "sister_veyra", current_location: "saint_caldus_house" }, { character_id: "tavian_merrow", current_location: "house_of_scales" }, { character_id: "uther_calderan", current_location: "ducal_citadel" }, { character_id: "vaelen_vael", current_location: "ducal_citadel" }]]);
  const context = buildTurnContext(world, s);
  assert.deepEqual(context.characters.map(c => c.id), ["nicco"]); assert.equal(context.primary.scene.player_location!.id, OPENING_LOCATION);
  assert.match(renderKnowledgeAccess(projectKnowledgeAccess(context, [])), /Narration and Nicco \(player\): F1, F2/);
  assert.deepEqual(CampaignState.restore(world, JSON.parse(JSON.stringify(s))).exportSnapshot(), s);
});
