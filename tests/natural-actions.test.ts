import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { SceneParticipants } from "../src/turn/scene-participants.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Exact Phase 1R smoke inputs (unchanged wording). */
const T1A = "*He wears his leather boots and takes a couple of steps in the square, stopping a passerby* Do you like my sandals?";
const T1B = "*he takes out his boots and gift it to the passerby* Take them, you need them more than me";
const T1_BAREFOOT = "*He wears his leather boots and takes a couple of steps in the square, stopping a passerby* It's so painful to walk barefoot, do you think i should wear boots, because right now i'm not";
const T2 = "*He strolls to the pens looking for a slave to purchase, when a guard stops him nearby the pens* Problems?";
const BOOTS: CampaignCommand = { kind: "register_item", item: { id: "campaign_item_leather_boots", origin: { kind: "created" }, name: "pair of leather boots", owner_id: "nicco", position: { kind: "equipped", character_id: "nicco", slot: "feet", mode: "worn" } } };

async function opening(boots = true) {
  const world = await loadWorld("data"), campaign = createOpeningCampaign(world, "p1s");
  if (boots) campaign.apply({ expected_revision: 1, commands: [BOOTS] });
  return { world, campaign };
}
function scripted(narrations: readonly string[], seen: GenerationRequest[], fail = false): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream(request) {
    seen.push(request); const text = narrations[Math.min(i++, narrations.length - 1)]!;
    yield { type: "text_delta", text }; if (fail) throw new Error("boom");
    yield { type: "completed", result: { text, ...metadata } };
  } };
}
const controller = (turns: readonly (readonly CampaignCommand[])[] = []): StateControllerProvider => { let i = 0; return { async propose() { return { commands: [...(turns[i++] ?? [])], ...metadata }; } }; };
function coordinator(world: Awaited<ReturnType<typeof opening>>["world"], narrations: readonly string[], seen: GenerationRequest[], commands: readonly (readonly CampaignCommand[])[] = [], fail = false) {
  const service = new RetrievalService(world);
  return new TurnCoordinator(world, scripted(narrations, seen, fail), controller(commands), { service, search: new HybridSearch(service) });
}
async function turn(c: TurnCoordinator, campaign: Awaited<ReturnType<typeof opening>>["campaign"], input: string) {
  const last = (await collect(c.runTurn({ campaign, player_input: input }))).at(-1)!;
  assert.equal(last.type, "turn_completed", input);
  return last.type === "turn_completed" ? last.result : undefined!;
}
const boots = (campaign: Awaited<ReturnType<typeof opening>>["campaign"]) => campaign.exportSnapshot().items.find(i => i.id === "campaign_item_leather_boots")!;

test("participant grammar: -ing and other forms create exactly one participant; arbitrary verbs never do", async () => {
  const { world, campaign } = await opening(), context = buildTurnContext(world, campaign.exportSnapshot());
  for (const input of [T1A, "*approaching a passer-by*", "*addressing a guard*", "*turning to a merchant*", "*speaking to a stranger*", "*he stopped a woman*"])
    assert.equal(new SceneParticipants().plan(input, context).participants.length, 1, input);
  for (const input of ["*kicks a passer-by*", "*admires a guard*", "*a passer-by walks past*"]) assert.equal(new SceneParticipants().plan(input, context).participants.length, 0, input);
});
test("NPC-subject scene setup in player text creates a participant; narration never does", async () => {
  const { world, campaign } = await opening(), context = buildTurnContext(world, campaign.exportSnapshot());
  for (const [input, role] of [["*a guard stops him*", "guard"], ["*a merchant calls out to him*", "street_merchant"], ["*a passer-by bumps into him*", "passer_by"]] as const)
    assert.deepEqual(new SceneParticipants().plan(input, context).participants.map(p => p.role), [role], input);
  const sp = new SceneParticipants(), plan = sp.plan("\"Hello?\"", context);
  assert.deepEqual(sp.commit(plan, "A guard stops him. A merchant calls out to him."), [], "narrator-authored people are not created");
});
test("dialogue and hedged actions never resolve state (adversarial set)", async () => {
  const { world, campaign } = await opening(), s = campaign.exportSnapshot(), context = buildTurnContext(world, s);
  for (const input of ["I want to go to the market", "Is the market nearby?", "\"I'm at the market\"", "I gave her my boots yesterday", "*almost takes off his boots*", "*reaches for his boots*",
    "*pretends to remove his boots*", "*he wants to go to the slave market*", "*he takes out his boots*", "I'm barefoot.", "\"I already gave her the boots.\"", "*he thinks about walking to the market*"]) {
    const intent = playerIntent(input, context, s, world);
    assert.deepEqual([intent.runtime, intent.candidates], [[], []], input);
  }
});
test("TEST 1 exact: stopping a passerby creates P1; take-out-then-gift removes the worn boots before narration; the offer to a temporary person cannot become durable", async () => {
  const { world, campaign } = await opening(), seen: GenerationRequest[] = [];
  const c = coordinator(world, ["The passerby glances at Nicco's boots. \"Those are boots, friend.\"", "The passerby shakes his head. \"Keep them.\""], seen);
  const first = await turn(c, campaign, T1A);
  assert.equal(first.scene_participants!.plan.created, "scene_npc_1"); assert.deepEqual(first.authorized_commands, []);
  assert.deepEqual(boots(campaign).position, { kind: "equipped", character_id: "nicco", slot: "feet", mode: "worn" });
  const second = await turn(c, campaign, T1B);
  assert.deepEqual(second.action_resolution!.actions.map(a => [a.kind, a.status]), [["equipment_removal", "resolved"], ["offer", "unsupported_durable_recipient"]]);
  const prompt = seen[1]!.messages[0]!.content;
  assert.match(prompt, /"campaign_item_leather_boots"[^\]]*"position":\{"kind":"carried","character_id":"nicco"\}/, "the narrator sees the projected equipment");
  assert.match(prompt, /Nicco has taken off pair of leather boots/); assert.match(prompt, /A temporary person cannot keep items/);
  assert.equal(second.scene_participants!.plan.focus, "scene_npc_1");
  assert.deepEqual(boots(campaign), { ...boots(campaign), owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } });
  assert.equal(second.final_revision, second.base_revision + 1, "only the player-controlled removal committed");
});
test("TEST 1B exact (hard regression): a spoken barefoot claim never unequips worn boots", async () => {
  const { world, campaign } = await opening(), seen: GenerationRequest[] = [];
  const result = await turn(coordinator(world, ["\"You are wearing boots,\" the passerby says."], seen), campaign, T1_BAREFOOT);
  assert.deepEqual([result.authorized_commands, result.final_revision - result.base_revision], [[], 0]);
  assert.equal(boots(campaign).position.kind, "equipped");
  assert.match(seen[0]!.messages[0]!.content, /"position":\{"kind":"equipped","character_id":"nicco","slot":"feet","mode":"worn"\}/);
});
test("TEST 2 exact: movement to the pens follows the canonical city route; a guard participant exists; intention has no effect", async () => {
  const { world, campaign } = await opening(false), seen: GenerationRequest[] = [];
  const result = await turn(coordinator(world, ["A guard steps into Nicco's path near the square. \"Problems?\""], seen), campaign, T2);
  const actions = result.action_resolution!.actions;
  assert.deepEqual(actions.map(a => [a.kind, a.status]), [["intention", "no_state_effect"], ["movement", "resolved"]]);
  assert.equal(actions[1]!.detail.destination, "calderan_slave_market");
  assert.equal(campaign.exportSnapshot().runtime.scene.player_location, "calderan_slave_market"); assert.equal(result.travel?.minutes, 20);
  assert.deepEqual(result.scene_participants!.plan.participants.map(p => [p.role, p.standing]), [["guard", "ordinary_local"]]);
  const prompt = seen[0]!.messages[0]!.content;
  assert.match(prompt, /Location: Calderan Slave Market/);
  assert.match(prompt, /P1 - Guard \(current conversation partner\)\. Temporary; ordinary local of Calderan West District\. Affiliation unestablished/);
  assert.match(prompt, /P1 Guard \(temporary, ordinary local\): CAN USE/);
});
test("resolved natural movement commits at finalization; the narrator already sees the destination scene", async () => {
  const { world, campaign } = await opening(false), seen: GenerationRequest[] = [];
  const result = await turn(coordinator(world, ["Nicco steps inside."], seen), campaign, "*he goes back inside Heartstone*");
  assert.equal(campaign.exportSnapshot().runtime.scene.player_location, "heartstone_lr"); assert.equal(result.final_revision, result.base_revision + 1);
  assert.match(seen[0]!.messages[0]!.content, /Location: Heartstone LR\./);
});
test("atomicity: a failed turn leaves player-controlled effects uncommitted", async () => {
  const { world, campaign } = await opening(), seen: GenerationRequest[] = [], before = campaign.exportSnapshot();
  const c = coordinator(world, ["The passerby"], seen, [], true);
  assert.equal((await collect(c.runTurn({ campaign, player_input: "*he takes off his boots*" }))).at(-1)!.type, "turn_failed");
  assert.equal(campaign.exportSnapshot(), before);
});
test("compound removal then gift to a persistent NPC: ordered runtime removal + outcome-dependent transfer, committed together only on acceptance", async () => {
  const fixture = turnFixture(true); fixture.campaign.apply({ expected_revision: fixture.campaign.revision, commands: [{ kind: "place_item", item_id: "boots", position: { kind: "equipped", character_id: "nicco", slot: "feet", mode: "worn" } }] });
  const s = fixture.campaign.exportSnapshot(), intent = playerIntent("*he takes off his boots and gives them to Brenna*", buildTurnContext(fixture.world, s), s, fixture.world);
  assert.deepEqual(intent.runtime, [{ kind: "place_item", item_id: "boots", position: { kind: "carried", character_id: "nicco" } }]);
  assert.deepEqual(intent.candidates, [{ kind: "transfer_item", item_id: "boots", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } }]);
  const transfer = intent.candidates[0]!, service = new RetrievalService(fixture.world), seen: GenerationRequest[] = [];
  const c = new TurnCoordinator(fixture.world, scripted(["Nicco takes off his boots and offers them. Brenna takes the boots and tucks them under her arm."], seen), controller([[transfer]]), { service, search: new HybridSearch(service) });
  const result = await turn(c, fixture.campaign, "*he takes off his boots and gives them to Brenna*");
  assert.deepEqual(result.authorized_commands, [intent.runtime[0], transfer]);
  assert.deepEqual(fixture.campaign.exportSnapshot().items.find(i => i.id === "boots")!.position, { kind: "carried", character_id: "brenna" });
});
