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
  assert.deepEqual([s.characters, s.items, s.relationships, s.goals, s.scheduled_events, s.runtime.npc_locations], [[], [], [], [], [], [{ character_id: "pellan", current_location: "calderan_center" }]]);
  const context = buildTurnContext(world, s);
  assert.deepEqual(context.characters.map(c => c.id), ["nicco"]); assert.equal(context.primary.scene.player_location!.id, OPENING_LOCATION);
  assert.match(renderKnowledgeAccess(projectKnowledgeAccess(context, [])), /Narration and Nicco \(player\): F1, F2/);
  assert.deepEqual(CampaignState.restore(world, JSON.parse(JSON.stringify(s))).exportSnapshot(), s);
});
