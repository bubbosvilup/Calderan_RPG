import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WorldStore } from "../src/world/world-store.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { canonicalDepartureClaims, canonicalDepartureContradiction } from "../src/turn/scene-departure.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { collect, mockNarrator, mockController } from "./turn-fixtures.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { authorizeWithEvidence } from "../src/turn/evidence-authorization.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";

const docs = JSON.parse(await readFile("docs/evaluations/p12-scene-continuity/fixture-world.json", "utf8"));
const world = new WorldStore(docs);
function fixture(draft: string, commands: readonly CampaignCommand[] = [], known = true) {
  const campaign = new CampaignState(world, "p122", { player_location: "audit_room", world_time: { world_minute: 600 } });
  if (known) campaign.apply({ expected_revision: campaign.revision, commands: [...learnCanonicalName(world, campaign.exportSnapshot(), "korvin")] });
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, mockNarrator(draft), mockController(commands), { service, search: new HybridSearch(service) }, { provider_retry: false });
  return { campaign, coordinator };
}
async function run(f: ReturnType<typeof fixture>, input = "*looks around*") {
  const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: input }));
  const last = events.at(-1);
  assert.equal(last?.type, "turn_completed");
  assert.ok(last && last.type === "turn_completed");
  return last.result;
}
const placement = (f: ReturnType<typeof fixture>) => f.campaign.exportSnapshot().runtime.npc_locations.find(n => n.character_id === "korvin")!;

for (const narration of [
  "*Korvin leaves the room.*",
  "*Korvin gives Nicco a short nod, turns away, and walks out through the doorway. His footsteps fade down the path until he is gone.*",
  "*Korvin's retreating back is halfway down the path before he disappears around the corner. A moment later, he is gone.*",
  "*Korvin's retreating back is halfway down the path, then he is gone.*",
  "*Korvin's retreating back disappears through the doorway and his footsteps fade away.*",
  "*Korvin's footsteps fade down the street.*",
  "*Korvin's figure vanishes around the corner.*",
  "*Korvin turns and exits through the door, leaving Nicco alone.*",
]) test(`P12.2 completed departure commits existing OFF_SCENE: ${narration}`, async () => {
  const f = fixture(narration), before = f.campaign.exportSnapshot();
  const result = await run(f);
  assert.deepEqual(result.authorized_commands, [{ kind: "leave_scene", character_id: "korvin" }]);
  assert.equal(result.narration, narration);
  assert.deepEqual(placement(f).off_scene, { last_known_location: "audit_room", since_revision: result.final_revision });
  assert.equal(placement(f).current_location, undefined);
  const after = f.campaign.exportSnapshot(), context = buildTurnContext(world, after);
  assert.equal(context.characters.some(c => c.id === "korvin"), false);
  assert.equal(context.primary.scene.present_characters.some(c => c.id === "korvin"), false);
  assert.deepEqual(after.knowledge, before.knowledge);
  assert.deepEqual(after.relationships, before.relationships);
  assert.deepEqual(after.runtime.scene.world_time, before.runtime.scene.world_time);
  const prompt = f.coordinator.contextRequest(f.campaign).messages[0]!.content;
  assert.ok(prompt.includes("[RECENT SCENE NARRATION]"));
  assert.ok(prompt.includes(narration));
  assert.equal(prompt.includes("Character Korvin"), false);
  assert.equal(prompt.slice(prompt.indexOf("[PRESENT AND ABLE TO REACT]"), prompt.indexOf("[CURRENT EQUIPMENT]")).includes("Korvin"), false);
  const restored = CampaignState.restore(world, JSON.parse(JSON.stringify(after)));
  assert.deepEqual(restored.exportSnapshot(), after);
});

for (const narration of [
  "*Korvin looks toward the door.*", "*Korvin starts toward the door.*", "*Korvin seems ready to leave.*",
  "*Korvin turns as if to go.*", "*Korvin takes a step toward the exit.*", "*Korvin may leave after this.*",
  "*Korvin turns toward the door as if preparing to leave.*", "I'll leave in a minute.",
  "*Korvin says he'll leave soon.*", "*Korvin's patience is gone.*", "*Korvin leaves if Nicco agrees.*",
  "*Korvin tells Nicco to leave the room.*",
]) test(`P12.2 non-completed/abstract/instruction cannot move canonical actor: ${narration}`, async () => {
  const f = fixture(narration, [{ kind: "leave_scene", character_id: "korvin" }]);
  const result = await run(f);
  assert.equal(result.authorized_commands.some(c => c.kind === "leave_scene"), false);
  assert.equal(placement(f).current_location, "audit_room");
});

test("P12.2 unknown identity uses existing descriptor binding without learning a name", async () => {
  const f = fixture("", [], false), context = buildTurnContext(world, f.campaign.exportSnapshot());
  const gate = narratorIdentityGate(context)!;
  const label = gate.identities.get("korvin")!.observable_label;
  const claims = canonicalDepartureClaims(`*${label} leaves the room.*`, context);
  assert.equal(claims[0]?.character_id, "korvin");
  assert.equal(claims[0]?.ambiguous, false);
  assert.equal(gate.identities.get("korvin")!.player_known_name, null);
});

test("P12.2 ambiguous man departure is rejected and withdrawn", async () => {
  const f = fixture("*The man leaves.*", [{ kind: "leave_scene", character_id: "korvin" }]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_character", character: { id: "campaign_character_dell", origin: { kind: "created" }, profile: { name: "Dell", sex: "male" }, current: { current_location: "audit_room" } } }] });
  const result = await run(f);
  assert.equal(placement(f).current_location, "audit_room");
  assert.equal(result.narration.includes("The man leaves"), false);
  assert.ok(result.narration_reconciliation?.issues.some(i => i.kind === "uncommitted_departure"));
});

for (const narration of [
  "*Korvin leaves the room. Korvin returns to the room.*",
  "*Korvin leaves, then he stands beside Nicco.*",
  "*Korvin walks out, but he stops before the threshold.*",
  "*Korvin leaves the room. He speaks from inside the room.*",
]) test(`P12.2 contradictory/interrupted departure fails closed and history is repaired: ${narration}`, async () => {
  const f = fixture(narration, [{ kind: "leave_scene", character_id: "korvin" }]);
  const result = await run(f);
  assert.equal(placement(f).current_location, "audit_room");
  assert.equal(result.authorized_commands.some(c => c.kind === "leave_scene"), false);
  assert.ok(result.narration_reconciliation?.issues.some(i => i.kind === "uncommitted_departure"));
  assert.equal(canonicalDepartureClaims(result.narration, buildTurnContext(world, f.campaign.exportSnapshot())).length, 0);
  assert.equal(f.coordinator.recent(f.campaign).entries()[0]!.narration, result.narration);
  assert.equal(f.coordinator.contextRequest(f.campaign).messages[0]!.content.includes("*Korvin leaves"), false);
});

test("P12.2 unsupported quoted controller evidence cannot bypass same-turn contradiction", () => {
  const f = fixture(""), context = buildTurnContext(world, f.campaign.exportSnapshot());
  const narration = "Korvin leaves the room. Korvin returns to the room.";
  const evidence = deriveTurnEvidence({ candidates: [], runtime: [] }, narration, context);
  const [d] = authorizeWithEvidence([{ kind: "leave_scene", character_id: "korvin" }], ["Korvin leaves the room."], evidence, narration, context, f.campaign.exportSnapshot(), "hybrid");
  assert.equal(d!.authorized, false);
});

test("P12.2 absent/double departure does not reset since_revision", async () => {
  const f = fixture("*Korvin leaves the room.*", [{ kind: "leave_scene", character_id: "korvin" }]);
  await run(f); const off = placement(f).off_scene;
  const second = await run(f);
  assert.deepEqual(placement(f).off_scene, off);
  assert.equal(second.authorized_commands.some(c => c.kind === "leave_scene"), false);
  assert.equal(second.narration.includes("Korvin leaves the room"), false);
});

test("P12.2 typed canonical reentry retains existing move_character semantics", async () => {
  const f = fixture("*Korvin leaves the room.*"); await run(f);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "korvin", location_id: "audit_room" }] });
  assert.equal(placement(f).current_location, "audit_room");
  assert.equal(placement(f).off_scene, undefined);
  assert.ok(buildTurnContext(world, f.campaign.exportSnapshot()).characters.some(c => c.id === "korvin"));
});

test("P12.2 known destination remains outside ordinary canonical narrative authority", async () => {
  const f = fixture("*Korvin leaves the room and walks into Path.*", [{ kind: "move_character", character_id: "korvin", location_id: "audit_path" }]);
  const result = await run(f);
  assert.equal(placement(f).current_location, "audit_room");
  assert.equal(result.authorized_commands.length, 0);
  assert.equal(result.narration.includes("Korvin leaves"), false);
});

test("P12.2 player prose alone grants no departure authority", async () => {
  const f = fixture("*Korvin watches the room.*", [{ kind: "leave_scene", character_id: "korvin" }]);
  const result = await run(f, "*Korvin leaves.*");
  assert.equal(placement(f).current_location, "audit_room");
  assert.equal(result.authorized_commands.some(c => c.kind === "leave_scene"), false);
});

test("P12.2 created character departure remains supported", async () => {
  const f = fixture("Dell leaves the room.", [{ kind: "leave_scene", character_id: "campaign_character_dell" }]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_character", character: { id: "campaign_character_dell", origin: { kind: "created" }, profile: { name: "Dell", sex: "male" }, current: { current_location: "audit_room" } } }] });
  const result = await run(f);
  assert.ok(result.authorized_commands.some(c => c.kind === "leave_scene" && c.character_id === "campaign_character_dell"));
  assert.equal(f.campaign.exportSnapshot().characters.find(c => c.id === "campaign_character_dell")!.current.current_location, undefined);
});

test("P12.2 departure from another location is rejected and withdrawn", async () => {
  const f = fixture("*Korvin's footsteps fade down the street.*", [{ kind: "leave_scene", character_id: "korvin" }]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "korvin", location_id: "audit_path" }] });
  const result = await run(f);
  assert.equal(placement(f).current_location, "audit_path");
  assert.equal(result.authorized_commands.length, 0);
  assert.equal(result.narration.includes("footsteps fade"), false);
});

test("P12.2 whole unsupported departure and its indirect continuation are withdrawn after failed revision", async () => {
  const draft = "*Korvin gives Nicco a short nod, turns away, and walks out through the doorway. His footsteps fade down the path until he is gone. Korvin returns to the room.*";
  const f = fixture(draft, [{ kind: "leave_scene", character_id: "korvin" }]);
  const result = await run(f);
  assert.equal(placement(f).current_location, "audit_room");
  assert.equal(result.narration_reconciliation?.delivered, "redacted");
  assert.equal(result.narration.includes("walks out"), false);
  assert.equal(result.narration.includes("footsteps fade"), false);
  assert.equal(result.narration.includes("gone"), false);
});

test("P12.2 historical absence reference does not imply another departure", async () => {
  const f = fixture("*Korvin left the room yesterday.*", [{ kind: "leave_scene", character_id: "korvin" }]);
  await run(f);
  assert.equal(placement(f).current_location, "audit_room");
});

test("P12.2 NPC reference and observable descriptor cannot hide a same-turn return", () => {
  const f = fixture("", [], false), context = buildTurnContext(world, f.campaign.exportSnapshot());
  const gate = narratorIdentityGate(context)!;
  for (const term of [gate.identities.get("korvin")!.ref, gate.identities.get("korvin")!.observable_label]) {
    const claims = canonicalDepartureClaims(`*${term}'s patience is gone.*`, context);
    assert.deepEqual(claims, []);
    assert.equal(canonicalDepartureContradiction(`*${term} leaves. ${term} returns.*`, context, "korvin"), true);
  }
});
