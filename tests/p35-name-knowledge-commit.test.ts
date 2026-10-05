import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { identityNameFactId } from "../src/campaign/identity-knowledge.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { SceneParticipants } from "../src/turn/scene-participants.js";
import { RecentConversation } from "../src/turn/recent-conversation.js";
import { canonicalNameDisclosure, establishedCanonicalDisclosure } from "../src/turn/canonical-name-disclosure.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { projectNarratorFocus } from "../src/turn/narrator-focus.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { prepareNarratorRequest } from "../src/turn/context-budget.js";
import { prepareCommit } from "../src/turn/stages/commit-preparation.js";
import { rpgDialogue } from "../src/turn/rpg-dialogue.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { mockNarrator, mockController, collect } from "./turn-fixtures.js";
import { P35_LIVE_INTRODUCTION } from "./fixtures/p35-live-introduction.js";

const world = await loadWorld("data"), MARKET = "calderan_slave_market";
const INPUT = "name's Nicco, who am i speaking with?";
const REPEAT = "mmh alright then *shacking his hand* u said you are named?";
const intent = { candidates: [], runtime: [] };
function fixture() {
  const campaign = createOpeningCampaign(world, "p35_name_commit");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }] });
  const participants = new SceneParticipants(), recent = new RecentConversation();
  const context = buildTurnContext(world, campaign.exportSnapshot());
  participants.commit(participants.plan("I approach the short compact man.", context), "*The short man nods.*");
  recent.add({ player: "I approach the short compact man.", narration: "*The short man nods.*", status: "finalized", location_id: MARKET, conversation_partner_id: "korvin" });
  return { campaign, participants, recent, context, scene: participants.plan(INPUT, context) };
}
function commitDelivered(f: ReturnType<typeof fixture>, delivered: string) {
  const batches: CampaignCommand[][] = [];
  const revision = f.campaign.revision;
  const prepared = f.campaign.prepare({ expected_revision: revision, commands: [] });
  const plan = prepareCommit({ world, prepare(proposal) { batches.push((proposal as { commands: CampaignCommand[] }).commands); return f.campaign.prepare(proposal); },
    prepared, commands: [], finalized: f.recent.finalized(), player_input: INPUT, delivered, scene: f.scene,
    base_revision: revision, disclosure_intent: intent, location_changed: false, on_skip(reason) { assert.fail(reason); } });
  // Preparing name knowledge is still detached: nothing has been published or learned yet.
  assert.equal(narratorIdentityGate(buildTurnContext(world, f.campaign.exportSnapshot()))!.identities.get("korvin")!.player_known_name, null);
  f.campaign.commit(plan.receipt);
  f.participants.commit(f.scene, delivered);
  f.recent.add({ player: INPUT, narration: delivered, status: "finalized", location_id: MARKET, conversation_partner_id: "korvin" });
  return batches;
}
function assertKnown(campaign: CampaignState) {
  const snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot), gate = narratorIdentityGate(context)!;
  assert.equal(gate.identities.get("korvin")!.player_known_name, "Korvin");
  assert.equal(snapshot.facts.filter(f => f.id === identityNameFactId("korvin")).length, 1);
  const edges = snapshot.knowledge.filter(k => k.character_id === "nicco" && k.fact_id === identityNameFactId("korvin"));
  assert.equal(edges.length, 1); assert.equal(edges[0]!.status, "knows"); assert.equal(edges[0]!.provenance!.source_character_id, "korvin");
  for (const id of ["mistress_elara", "bartolomhew"]) assert.equal(gate.identities.get(id)!.player_known_name, null);
  return context;
}

test("P3.5 exact production RPG response prepares and commits canonical name despite later narration/dialogue", () => {
  const f = fixture(), focus = projectNarratorFocus(f.context, INPUT, f.recent.forPrompt(), intent, f.scene);
  assert.equal(canonicalNameDisclosure(f.context, INPUT, f.recent.forPrompt(), focus.foreground, intent, f.scene)?.internal_id, "korvin");
  assert.deepEqual(rpgDialogue(P35_LIVE_INTRODUCTION), ["Korvin.", "Good hour for it. Auction floor's been busy since first light, so the pens are full.", "What are you after? Labor, household, something specific? Makes a difference where I'd point you."]);
  assert.equal(establishedCanonicalDisclosure(f.context, INPUT, f.recent.finalized(), P35_LIVE_INTRODUCTION, f.scene, intent), "korvin");
  assert.equal(f.scene.focus, "korvin"); assert.equal(f.scene.created, null); assert.deepEqual(f.scene.participants, []);
  const batches = commitDelivered(f, P35_LIVE_INTRODUCTION);
  assert.ok(batches.some(batch => batch.some(c => c.kind === "create_fact" && c.fact.id === identityNameFactId("korvin"))));
  assert.ok(batches.some(batch => batch.some(c => c.kind === "set_knowledge" && c.knowledge.character_id === "nicco" && c.knowledge.fact_id === identityNameFactId("korvin") && c.knowledge.status === "knows")));
  assertKnown(f.campaign); assert.deepEqual(f.participants.active(), []);
});

test("P3.5 ordinary turn then exact repeat-name turn expose known Korvin without another disclosure opportunity", () => {
  const f = fixture(); commitDelivered(f, P35_LIVE_INTRODUCTION);
  let context = assertKnown(f.campaign);
  const ordinary = f.participants.plan("Are you the only one seller around here?", context);
  f.participants.commit(ordinary, "*Korvin gestures to the other stalls.*\n\nThere are others.");
  f.recent.add({ player: "Are you the only one seller around here?", narration: "*Korvin gestures to the other stalls.*\n\nThere are others.", status: "finalized", location_id: MARKET, conversation_partner_id: "korvin" });
  context = assertKnown(f.campaign);
  const scene = f.participants.plan(REPEAT, context);
  assert.equal(scene.focus, "korvin"); assert.equal(scene.created, null); assert.deepEqual(scene.participants, []);
  for (const history of [f.recent.forPrompt(), []]) {
    const request = prepareNarratorRequest(buildNarratorPrompt(REPEAT, context, history, {}, intent, {}, scene));
    assert.match(request.messages[0]!.content, /"player_known_name":"Korvin"/);
    assert.match(request.messages[0]!.content, /Character Korvin \(NPC24\)/);
    assert.ok(!request.system_prompt.includes("canonical_name_for_own_spoken_introduction_only"));
    assert.ok(!/Bartolomhew|Elara|The Redemptor/.test(JSON.stringify(request)));
    assert.ok(!request.messages[0]!.content.includes("[SCENE PARTICIPANTS]"));
  }
});

test("P3.5 realistic multi-segment knowledge survives save/reload with no text history", () => {
  const f = fixture(); commitDelivered(f, P35_LIVE_INTRODUCTION);
  const restored = CampaignState.restore(world, JSON.parse(JSON.stringify(f.campaign.exportSnapshot()))), context = assertKnown(restored);
  const participants = new SceneParticipants(), scene = participants.plan("I speak to the short compact man.", context);
  const request = prepareNarratorRequest(buildNarratorPrompt("I speak to the short compact man.", context, [], {}, intent, {}, scene));
  assert.equal(scene.focus, "korvin"); assert.equal(scene.created, null);
  assert.match(request.messages[0]!.content, /"player_known_name":"Korvin"/);
  assert.ok(!request.system_prompt.includes("canonical_name_for_own_spoken_introduction_only"));
});

for (const [label, output] of [
  ["A bare name followed by a separate speech segment", "*He nods.*\n\nKorvin.\n\nWhat are you after?"],
  ["B first-person introduction with later RPG alternation", "*He nods.*\n\nI'm Korvin.\n\n*He points to the pens.*\n\nLooking for labor?"],
  ["bare name without a descriptor or narration", "Korvin."],
  ["inline RPG block and bare speech", "*He nods.* Korvin.\n\n*He gestures.* What are you after?"],
  ["multi-line long action paragraph", "*The short, compact man shifts his weight.\nHe studies Nicco.*\n\nKorvin.\n\n*He nods.*\n\nLooking for labor?"],
  ["I am form", "*He nods.*\n\nI am Korvin!\n\n*He gestures.*\n\nWhat are you after?"],
  ["My name is form", "*He nods.*\n\nMy name is Korvin.\n\n*He gestures.*\n\nWhat are you after?"],
] as const) test(`P3.5 ${label} learns from the bound canonical actor`, () => {
  const f = fixture(); assert.equal(establishedCanonicalDisclosure(f.context, INPUT, f.recent.finalized(), output, f.scene, intent), "korvin");
  commitDelivered(f, output); assertKnown(f.campaign);
});

for (const output of [
  "Korvin owns the stall next door.", "Ask Korvin.", "My brother Korvin works here.", "I know a Korvin.", "Korvin? Never heard of him.",
  "Korvin?", "Korvin. Looking for something particular?", "I'm Korvin Voss.", "I'm Korvin, also called Hargan.", "I'm not Korvin.",
  "Hargan.", "Pell.", "Harl.", "Korra Vell.", "*Korvin looks away.*", "*He nods.*\n\nKorvin works the far pen.",
] as const) test(`P3.5 non-self-name evidence fails closed: ${output}`, () => {
  const f = fixture(); assert.equal(establishedCanonicalDisclosure(f.context, INPUT, f.recent.finalized(), output, f.scene, intent), undefined);
  commitDelivered(f, output);
  assert.equal(narratorIdentityGate(buildTurnContext(world, f.campaign.exportSnapshot()))!.identities.get("korvin")!.player_known_name, null);
});

for (const output of [
  "*The platinum-blonde woman replies.*\n\nKorvin.",
  "*The short man and the woman reply.*\n\nKorvin.",
  "*Another man replies.*\n\nKorvin.",
  "*He nods. The platinum-blonde woman replies.*\n\nKorvin.",
  "*The short man nods. The platinum-blonde woman replies.*\n\nKorvin.",
  "*The short man nods. Garran replies.*\n\nKorvin.",
  "*Nearby, the platinum-blonde woman replies.*\n\nKorvin.",
  "*Nearby, Garran replies.*\n\nKorvin.",
  "*She answers.*\n\nKorvin.",
  "*They reply.*\n\nKorvin.",
  "*Nicco replies.*\n\nKorvin.",
  "*Garran replies.*\n\nKorvin.",
  "*The unfamiliar man [NPC24] replies.*\n\nKorvin.",
  "*He nods.\n\nKorvin.",
  "**He nods.**\n\nKorvin.",
] as const) test(`P3.5 competing/uncertain speaker or malformed RPG boundary fails closed: ${output}`, () => {
  const f = fixture(); assert.equal(establishedCanonicalDisclosure(f.context, INPUT, f.recent.finalized(), output, f.scene, intent), undefined);
});

test("P3.5 engine partner binding is required for descriptor-free speech; descriptor evidence still works independently", () => {
  const f = fixture(), empty = { turn: 2, participants: [], focus: null, created: null, addressed: [], expired: [] };
  const noMetadata = f.recent.finalized().map(({ conversation_partner_id: _id, ...e }) => e);
  assert.equal(establishedCanonicalDisclosure(f.context, INPUT, noMetadata, "*He nods.*\n\nKorvin.", empty, intent), undefined);
  assert.equal(establishedCanonicalDisclosure(f.context, INPUT, f.recent.finalized(), "*He nods.*\n\nKorvin.", empty, intent), "korvin");
  assert.equal(establishedCanonicalDisclosure(f.context, INPUT, noMetadata, "*The short, compact man shifts his weight.*\n\nKorvin.\n\n*He nods.*\n\nWhat are you after?", empty, intent), "korvin");
  assert.equal(establishedCanonicalDisclosure(f.context, INPUT, noMetadata, "Korvin.", { ...f.scene, addressed: ["korvin", "bartolomhew"] }, intent), undefined);
});

test("P3.5 bounded repeat-name variants recognize a safe actor without revealing other names", () => {
  const f = fixture();
  for (const input of [REPEAT, "u said you are named?", "you said you are named?", "what did you say your name was?", "you said your name was?", "what was your name again?", "remind me your name?", "your name again?"]) {
    assert.equal(canonicalNameDisclosure(f.context, input, f.recent.forPrompt(), new Set(["korvin"]), intent, f.scene)?.canonical_name, "Korvin", input);
  }
  assert.equal(canonicalNameDisclosure(f.context, "you said the pen is full?", [], new Set(["korvin"]), intent, f.scene), undefined);
  assert.equal(canonicalNameDisclosure(f.context, REPEAT, [], new Set(["korvin", "bartolomhew"]), intent, { ...f.scene, focus: null, addressed: ["korvin", "bartolomhew"] }), undefined);
  commitDelivered(f, P35_LIVE_INTRODUCTION);
  assert.equal(canonicalNameDisclosure(assertKnown(f.campaign), REPEAT, [], new Set(["korvin"]), intent, f.scene), undefined, "known names use normal projection");
});

test("P3.5 reciprocal bare self-name requires the existing controlled opportunity and a bound partner", () => {
  const f = fixture();
  assert.equal(establishedCanonicalDisclosure(f.context, "I'm Nicco.", f.recent.finalized(), "*He nods.*\n\nKorvin.", f.scene, intent), "korvin");
  assert.equal(establishedCanonicalDisclosure(f.context, "How's business?", f.recent.finalized(), "*He nods.*\n\nKorvin.", f.scene, intent), undefined);
});

test("P3.5 real coordinator commits a bound pronoun-attributed multi-segment introduction", async () => {
  const f = fixture(), service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, mockNarrator("*He nods.*\n\nKorvin.\n\n*He gestures toward the pens.*\n\nWhat are you after?"), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
  const approach = coordinator.participants(f.campaign).plan("I approach the short compact man.", f.context);
  coordinator.participants(f.campaign).commit(approach, "*The short man nods.*");
  coordinator.recent(f.campaign).add(f.recent.finalized()[0]!);
  const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: INPUT }));
  assert.ok(events.some(e => e.type === "turn_completed")); assertKnown(f.campaign);
  assert.deepEqual(coordinator.participants(f.campaign).active(), []);
});

test("P3.5 failed controller turn cannot commit drafted name knowledge", async () => {
  const f = fixture(), before = f.campaign.exportSnapshot(), service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, mockNarrator("*He nods.*\n\nKorvin."), { async propose() { throw new Error("offline controller failure"); } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  coordinator.participants(f.campaign).commit(coordinator.participants(f.campaign).plan("I approach the short compact man.", f.context), "*The short man nods.*");
  coordinator.recent(f.campaign).add(f.recent.finalized()[0]!);
  const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: INPUT }));
  assert.ok(events.some(e => e.type === "turn_failed"));
  assert.deepEqual(f.campaign.exportSnapshot(), before);
});
