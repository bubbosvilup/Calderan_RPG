import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { createOpeningCampaign, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { identityNameFactId } from "../src/campaign/identity-knowledge.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { SceneParticipants } from "../src/turn/scene-participants.js";
import { canonicalInteractionTargets } from "../src/turn/canonical-interaction-targets.js";
import { projectNarratorFocus } from "../src/turn/narrator-focus.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { buildNarratorPrompt, dialogueFocused } from "../src/turn/prompt-builder.js";
import { collect, metadata, mockController } from "./turn-fixtures.js";

const world = await loadWorld("data"), MARKET = "calderan_slave_market";
const APPROACH = "I approach the short compact man.";
const INTRO = "name's Nicco, who am i speaking with?";
const ORDINARY = "Are you the only one seller around here?";
const LATER = "mmh alright then *shacking his hand* u said you are named?";
const intent = { candidates: [], runtime: [] };
function market(store = world) {
  const campaign = createOpeningCampaign(store, "p34_continuity");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }] });
  return campaign;
}
function harness(campaign = market()) {
  const requests: GenerationRequest[] = [];
  let output = "*The short man nods.*";
  const service = new RetrievalService(world);
  const narrator = { async generate() { throw new Error("unused"); }, async *stream(request: GenerationRequest) {
    requests.push(request); yield { type: "text_delta" as const, text: output }; yield { type: "completed" as const, result: { text: output, ...metadata } };
  } };
  const coordinator = new TurnCoordinator(world, narrator, mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
  async function run(input: string, narration = "*Korvin nods.*\n\nYes.") {
    output = narration;
    const events = await collect(coordinator.runTurn({ campaign, player_input: input }));
    const done = events.find(e => e.type === "turn_completed");
    assert.ok(done && done.type === "turn_completed", JSON.stringify(events.at(-1)));
    return done.result;
  }
  return { campaign, coordinator, requests, run };
}
async function introduce(h: ReturnType<typeof harness>) {
  await h.run(APPROACH, "*The short man nods.*");
  await h.run(INTRO, "*The short man replies.*\n\nKorvin.");
  assert.ok(h.campaign.exportSnapshot().knowledge.some(k => k.character_id === "nicco" && k.fact_id === identityNameFactId("korvin") && k.status === "knows"));
}
function assertKnownRequest(request: GenerationRequest) {
  const text = request.messages[0]!.content;
  assert.match(text, /Character Korvin \(NPC24\)/);
  assert.match(text, /"player_known_name":"Korvin"/);
  assert.ok(!request.system_prompt.includes("canonical_name_for_own_spoken_introduction_only"));
  assert.ok(!text.includes("[SCENE PARTICIPANTS]"));
  const korvinLine = text.split("\n").find(line => line.startsWith("Character Korvin "))!;
  assert.ok(!korvinLine.includes('"observable_label":"the unfamiliar'), "known Korvin no longer carries an unfamiliar self-label");
  assert.ok(!/the unfamiliar (?:man|woman|person) \[NPC\d+\]/.test(text));
  assert.ok(!/Bartolomhew|Elara|The Redemptor/.test(text));
}

test("P3.4 exact live flow binds canonical Korvin across introduction, ordinary conversation and handshake", async () => {
  const h = harness(); await introduce(h);
  const revision = h.campaign.revision;
  for (const input of [ORDINARY, LATER, "You said?", "What do you mean?"]) {
    const result = await h.run(input);
    assert.equal(result.scene_participants!.plan.focus, "korvin");
    assert.deepEqual(result.scene_participants!.plan.addressed, ["korvin"]);
    assert.equal(result.scene_participants!.plan.created, null);
    assert.deepEqual(h.coordinator.participants(h.campaign).active(), []);
    assert.equal(h.coordinator.recent(h.campaign).finalized().at(-1)!.conversation_partner_id, "korvin");
    assertKnownRequest(h.requests.at(-1)!);
  }
  assert.equal(h.campaign.revision, revision, "conversation creates no persistent characters, premiums or alternate name store");
  assert.equal(h.campaign.exportSnapshot().characters.length, 0);
  assert.equal(h.campaign.exportSnapshot().premium_characters.length, 0);
});

test("P3.4 known name and descriptor binding survive snapshot reload with no conversation history", async () => {
  const h = harness(); await introduce(h);
  const restored = CampaignState.restore(world, JSON.parse(JSON.stringify(h.campaign.exportSnapshot())));
  const reloaded = harness(restored);
  assert.equal(reloaded.coordinator.recent(restored).entries().length, 0);
  const result = await reloaded.run("I speak to the short compact man.");
  assert.equal(result.scene_participants!.plan.focus, "korvin");
  assert.equal(result.scene_participants!.plan.created, null);
  await reloaded.run(LATER);
  assertKnownRequest(reloaded.requests.at(-1)!);
});

test("P3.4 leave and return retain canonical knowledge and create no duplicate", async () => {
  const h = harness(); await introduce(h);
  for (const location of [OPENING_LOCATION, MARKET]) {
    h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: location } }] });
    await h.run("I inspect the surroundings.", "*Nicco surveys the scene.*");
  }
  const result = await h.run("I speak to Korvin.");
  assert.equal(result.scene_participants!.plan.focus, "korvin");
  assert.equal(result.scene_participants!.plan.created, null);
  assertKnownRequest(h.requests.at(-1)!);
});

test("P3.4 same scene cannot carry a canonical partner to a different location or after an attention shift", () => {
  const campaign = market(), sp = new SceneParticipants();
  let context = buildTurnContext(world, campaign.exportSnapshot());
  sp.commit(sp.plan(APPROACH, context), "*The short man nods.*");
  assert.equal(sp.plan("You there?", context).focus, "korvin");
  sp.commit(sp.plan("I look at the loading area.", context), "*The loading area is quiet.*");
  assert.equal(sp.plan("You there?", context).focus, null);
  sp.commit(sp.plan(APPROACH, context), "*The short man nods.*");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: OPENING_LOCATION } }] });
  context = buildTurnContext(world, campaign.exportSnapshot());
  assert.equal(sp.plan("You there?", context).focus, null);
});

test("P3.4 explicit other canonical actor replaces partner without cross-name knowledge", async () => {
  const h = harness(); await introduce(h);
  const result = await h.run("I speak to the platinum-blonde woman.", "*The platinum-blonde woman nods.*");
  assert.equal(result.scene_participants!.plan.focus, "mistress_elara");
  assert.equal(result.scene_participants!.plan.created, null);
  assert.equal(narratorIdentityGate(buildTurnContext(world, h.campaign.exportSnapshot()))!.identities.get("mistress_elara")!.player_known_name, null);
  assert.equal(narratorIdentityGate(buildTurnContext(world, h.campaign.exportSnapshot()))!.identities.get("bartolomhew")!.player_known_name, null);
  assert.equal(narratorIdentityGate(buildTurnContext(world, h.campaign.exportSnapshot()))!.identities.get("korvin")!.player_known_name, "Korvin");
});

test("P3.4 legitimate new unnamed person takes continuation without canonical auto-merge", async () => {
  const h = harness(); await introduce(h);
  const result = await h.run("I approach another man.", "*The man waits.*");
  assert.equal(result.scene_participants!.plan.created, "scene_npc_1");
  assert.equal(result.scene_participants!.plan.focus, "scene_npc_1");
  const continued = await h.run("Who are you?", "*The man shrugs.*\n\nDoesn't matter.");
  assert.equal(continued.scene_participants!.plan.focus, "scene_npc_1");
  assert.equal(projectNarratorFocus(buildTurnContext(world, h.campaign.exportSnapshot()), "Who are you?", h.coordinator.recent(h.campaign).forPrompt(), intent, continued.scene_participants!.plan).foreground.size, 0);
  assert.equal(h.coordinator.recent(h.campaign).finalized().at(-1)!.conversation_partner_id, undefined);
});

test("P3.4 ambiguous overlapping appearances never select or merge either canonical actor", () => {
  const store = new WorldStore(world.listEntities().map(entity => ({ source: `${entity.id}.yaml`, document: { schema_version: 1,
    entity: entity.id === "bartolomhew" ? { ...entity, appearance: world.getEntitiesByType("character").find(c => c.id === "korvin")!.appearance } : entity,
    chunks: world.listChunks().filter(chunk => chunk.entity_id === entity.id) } })));
  const context = buildTurnContext(store, market(store).exportSnapshot()), sp = new SceneParticipants();
  assert.equal(canonicalInteractionTargets(context, APPROACH).size, 0);
  const plan = sp.plan(APPROACH, context);
  assert.equal(plan.created, "scene_npc_1"); assert.equal(plan.focus, "scene_npc_1");
  assert.deepEqual(plan.addressed, []);
  assert.equal(sp.plan("I speak to Korvin and Bartolomhew.", context).focus, null);
});

test("P3.4 explicit canonical binding beats an older temporary generic participant", () => {
  const context = buildTurnContext(world, market().exportSnapshot()), sp = new SceneParticipants();
  sp.commit(sp.plan("I approach another man.", context), "*The man waits.*");
  const plan = sp.plan("I speak to the short compact man.", context);
  assert.equal(plan.focus, "korvin"); assert.deepEqual(plan.addressed, ["korvin"]); assert.equal(plan.created, null);
  sp.commit(plan, "*The short man nods.*");
  const continued = sp.plan("Are you the seller?", context);
  assert.equal(continued.focus, "korvin"); assert.deepEqual(continued.addressed, ["korvin"]);
  assert.deepEqual(continued.participants, [], "unaddressed older temporary actor expires without unsafe merging");
});

test("P3.4 finalized canonical partner metadata keeps focus after approach text eviction; RPG speech remains verbatim", async () => {
  const h = harness(); await introduce(h); await h.run(ORDINARY);
  const context = buildTurnContext(world, h.campaign.exportSnapshot());
  const recent = h.coordinator.recent(h.campaign).forPrompt().slice(-1);
  assert.equal(recent[0]!.conversation_partner_id, "korvin");
  assert.deepEqual([...projectNarratorFocus(context, LATER, recent, intent).foreground], ["korvin"]);
  const replay = dialogueFocused(h.coordinator.recent(h.campaign).forPrompt(), context);
  assert.deepEqual(replay[1]!.npc_dialogue, ["Korvin."]);
  const request = buildNarratorPrompt(LATER, context, recent, {}, intent);
  assert.match(request.messages[0]!.content, /"player_known_name":"Korvin"/);
  assert.ok(!request.messages[0]!.content.includes("conversation_partner_id"), "engine history metadata is not a raw ID in narrator prose");
});

test("P3.4 refs remain separate from observable labels; NPC12 is canonical Dren, not a temporary actor", () => {
  const gate = narratorIdentityGate(buildTurnContext(world, market().exportSnapshot()))!;
  assert.equal([...gate.identities.values()].find(i => i.ref === "NPC12")!.internal_id, "dren");
  assert.equal(gate.identities.get("korvin")!.ref, "NPC24");
  for (const identity of gate.identities.values()) assert.ok(!/NPC\d+|\[/.test(identity.observable_label));
});
