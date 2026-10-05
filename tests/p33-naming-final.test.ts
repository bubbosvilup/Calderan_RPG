import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { createOpeningCampaign, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { identityNameFactId, learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, NARRATOR_OPAQUE_REFS, NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import { prepareNarratorRequest } from "../src/turn/context-budget.js";
import { narratorPackOf, renderCandidateRequest } from "../src/turn/narrator-pack.js";
import { canonicalNameDisclosure, establishedCanonicalDisclosure } from "../src/turn/canonical-name-disclosure.js";
import { narratorIdentityGate, registerNarratorIdentities } from "../src/turn/narrator-identity.js";
import { projectNarratorFocus } from "../src/turn/narrator-focus.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { reconcileNarration } from "../src/turn/stages/audit.js";
import type { SceneParticipantPlan } from "../src/turn/scene-participants.js";
import type { PlayerIntent } from "../src/turn/player-intent.js";
import { mockNarrator, mockController, collect, metadata } from "./turn-fixtures.js";

const world = await loadWorld("data");
const LIVE_INPUT = "name's Nicco, who am i speaking with ?";
const recent = [{ player: "I speak to the short compact man.", narration: "*The short man listens.*", status: "finalized" as const, location_id: "calderan_slave_market" }];
const emptyIntent: PlayerIntent = { candidates: [], runtime: [] };
function scene(addressed: readonly string[] = [], focus: string | null = null): SceneParticipantPlan {
  return { turn: 1, participants: [], focus, created: null, addressed, expired: [] };
}
function market(store = world) {
  const campaign = createOpeningCampaign(store, "p33_naming_final");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }] });
  return campaign;
}
function assertKorvinOnly(request: import("../src/llm/types.js").NarratorRequest) {
  assert.match(request.system_prompt, /canonical_name_for_own_spoken_introduction_only":"Korvin"/);
  assert.match(request.system_prompt, /"canonical_name_available_for_disclosure":true,"player_knows_name":false/);
  assert.match(request.system_prompt, /never in descriptive narration, attribution or metadata, exposition, labels, thoughts, summaries or descriptions/);
  assert.match(request.system_prompt, /Do not invent an alternative personal name, surname, alias, title or nickname/);
  assert.match(request.system_prompt, /otherwise they may decline naturally/);
  assert.ok(request.system_prompt.includes(NARRATOR_OPAQUE_REFS));
  for (const name of ["Korvin", "Bartolomhew", "Elara", "The Redemptor"]) assert.ok(!request.messages.some(m => m.content.includes(name)), name);
  for (const name of ["Bartolomhew", "Elara", "The Redemptor"]) assert.ok(!request.system_prompt.includes(name), name);
  assert.ok(!/\b(?:korvin|bartolomhew|mistress_elara)\b/.test(JSON.stringify(request)), "no raw canonical IDs");
}

test("P3.3 exact live input reaches final prepared request with one truthful self-name and masked ordinary identity", () => {
  const campaign = market(), context = buildTurnContext(world, campaign.exportSnapshot()), before = campaign.exportSnapshot();
  assert.deepEqual(context.primary.scene.present_characters.map(c => c.id), ["bartolomhew", "korvin", "mistress_elara"]);
  const focus = projectNarratorFocus(context, LIVE_INPUT, recent, emptyIntent);
  assert.deepEqual([...focus.foreground], ["korvin"]);
  const capability = canonicalNameDisclosure(context, LIVE_INPUT, recent, focus.foreground);
  assert.equal(capability?.internal_id, "korvin"); assert.equal(capability?.canonical_name, "Korvin");
  const built = buildNarratorPrompt(LIVE_INPUT, context, recent, {}, emptyIntent);
  const pack = narratorPackOf(built)!;
  for (const request of [prepareNarratorRequest(built), prepareNarratorRequest(renderCandidateRequest(pack, pack.source.units))]) assertKorvinOnly(request);
  assert.equal(narratorIdentityGate(context)!.identities.get("korvin")!.player_known_name, null);
  assert.deepEqual(campaign.exportSnapshot(), before, "availability is not knowledge or state mutation");
});

test("P3.3 explicit addressed Korvin outranks a multi-NPC foreground and exposes no other seller name", () => {
  const context = buildTurnContext(world, market().exportSnapshot());
  const all = new Set(["korvin", "mistress_elara", "bartolomhew"]);
  const capability = canonicalNameDisclosure(context, "Who am I speaking with?", [], all, emptyIntent, scene(["korvin"]));
  assert.equal(capability?.internal_id, "korvin");
  assertKorvinOnly(prepareNarratorRequest(buildNarratorPrompt("Who am I speaking with?", context, [], {}, emptyIntent, {}, scene(["korvin"]))));
});

test("P3.3 resolved interaction reference and recent partner outrank broad foreground independently", () => {
  const context = buildTurnContext(world, market().exportSnapshot()), all = new Set(["korvin", "mistress_elara", "bartolomhew"]);
  const intent = { ...emptyIntent, resolved_references: [{ phrase: "the short man", ids: ["korvin"], basis: "exact" as const }] };
  assert.equal(canonicalNameDisclosure(context, "Who am I speaking with?", [], all, intent)?.internal_id, "korvin");
  assert.equal(canonicalNameDisclosure(context, "Who am I speaking with?", recent, all)?.internal_id, "korvin");
  assert.equal(canonicalNameDisclosure(context, "Who am I speaking with?", recent, all, { ...intent, resolved_references: [{ phrase: "both sellers", ids: ["korvin", "mistress_elara"], basis: "exact" }] }), undefined);
});

test("P3.3 an explicit observable descriptor selects only its unique canonical match", () => {
  const context = buildTurnContext(world, market().exportSnapshot());
  assertKorvinOnly(buildNarratorPrompt("I speak to the short man. Who am I speaking with?", context, [], {}, emptyIntent));
});

test("P3.3 ambiguous addressees and absent conversational target fail closed", () => {
  const context = buildTurnContext(world, market().exportSnapshot()), all = new Set(["korvin", "mistress_elara"]);
  assert.equal(canonicalNameDisclosure(context, "Who are you?", recent, all, emptyIntent, scene(["korvin", "mistress_elara"])), undefined);
  assert.equal(canonicalNameDisclosure(context, "Who are you?", [], all), undefined);
  const request = buildNarratorPrompt("Who are you?", context, [], {}, emptyIntent, {}, scene(["korvin", "mistress_elara"]));
  assert.equal(request.system_prompt, NARRATOR_SYSTEM);
  assert.equal(canonicalNameDisclosure(context, LIVE_INPUT, [], new Set()), undefined);
});

test("P3.3 a distinct temporary conversation partner blocks stale canonical fallback", () => {
  const context = buildTurnContext(world, market().exportSnapshot());
  const participant = { id: "scene_npc_1", ref: "P1", role: "person", display_name: "Man", standing: "ordinary_local" as const, location_id: "calderan_slave_market", locality: ["calderan_slave_market"], created_turn: 2, last_addressed_turn: 2, departed: false };
  const history = [...recent, { player: "I approach another man.", narration: "*The man waits.*", status: "finalized" as const, location_id: "calderan_slave_market" }];
  for (const plan of [{ ...scene([participant.id], participant.id), turn: 3, participants: [participant] }, { ...scene(), turn: 3, participants: [participant] }]) {
    assert.equal(canonicalNameDisclosure(context, "Who are you?", history, new Set(["korvin"]), emptyIntent, plan), undefined);
  }
});

test("P3.3 introduction without question remains supported only with a safe partner", () => {
  const context = buildTurnContext(world, market().exportSnapshot());
  assert.equal(canonicalNameDisclosure(context, "I'm Nicco.", recent, new Set(["korvin"]))?.canonical_name, "Korvin");
  assert.equal(canonicalNameDisclosure(context, "I'm Nicco.", [], new Set()), undefined);
});

test("P3.3 unique-present fallback and known-name path use existing identities", () => {
  const campaign = market();
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { character_movements: ["bartolomhew", "mistress_elara"].map(character_id => ({ character_id, current_location: OPENING_LOCATION })) } }] });
  let context = buildTurnContext(world, campaign.exportSnapshot());
  assert.equal(canonicalNameDisclosure(context, "Who am I speaking with?", [], new Set())?.canonical_name, "Korvin");
  campaign.apply({ expected_revision: campaign.revision, commands: [...learnCanonicalName(world, campaign.exportSnapshot(), "korvin")] });
  context = buildTurnContext(world, campaign.exportSnapshot());
  assert.equal(canonicalNameDisclosure(context, LIVE_INPUT, recent, new Set(["korvin"])), undefined);
  assert.equal(narratorIdentityGate(context)!.identities.get("korvin")!.player_known_name, "Korvin");
  const request = buildNarratorPrompt("I speak to Korvin.", context, [], {}, emptyIntent);
  assert.equal(request.system_prompt, NARRATOR_SYSTEM); assert.ok(request.messages[0]!.content.includes("Korvin"));
});

for (const output of ["*The short man gives Nicco a measuring look.*\n\nI'm Korvin.", "*The short man gives Nicco a flat look.*\n\nKorvin.", "*The short man replies.*\nI'm Korvin."]) {
  test(`P3.3 actual RPG disclosure establishes known canonical name and survives reload: ${output.split("\n").at(-1)}`, async () => {
    const campaign = market(), service = new RetrievalService(world), requests: import("../src/llm/types.js").GenerationRequest[] = [];
    const coordinator = new TurnCoordinator(world, mockNarrator(output, request => { requests.push(request); }), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
    coordinator.recent(campaign).add(recent[0]!);
    const completed = (await collect(coordinator.runTurn({ campaign, player_input: LIVE_INPUT }))).find(event => event.type === "turn_completed");
    assert.ok(completed && completed.type === "turn_completed"); assert.equal(completed.result.narration, output);
    assert.equal(requests.length, 1); assertKorvinOnly(requests[0]!);
    const snapshot = campaign.exportSnapshot();
    const edges = snapshot.knowledge.filter(k => k.character_id === "nicco" && k.fact_id === identityNameFactId("korvin"));
    assert.equal(edges.length, 1); assert.equal(edges[0]!.status, "knows"); assert.equal(edges[0]!.provenance!.source_character_id, "korvin");
    assert.equal(snapshot.facts.filter(f => f.id === identityNameFactId("korvin")).length, 1);
    assert.ok(!snapshot.knowledge.some(k => k.fact_id === identityNameFactId("mistress_elara") || k.fact_id === identityNameFactId("bartolomhew")));
    const restored = CampaignState.restore(world, JSON.parse(JSON.stringify(snapshot)));
    const next = buildNarratorPrompt("I speak to Korvin.", buildTurnContext(world, restored.exportSnapshot()), [], {}, emptyIntent);
    assert.equal(next.system_prompt, NARRATOR_SYSTEM); assert.ok(next.messages[0]!.content.includes("Korvin"));
    assert.ok(!/NPC\d+|korvin/.test(output)); assert.deepEqual(learnCanonicalName(world, restored.exportSnapshot(), "korvin"), []);
  });
}

test("P3.3 refusal, invented names, third-party mentions, ambiguous and wrong-speaker attribution grant nothing", () => {
  const context = buildTurnContext(world, market().exportSnapshot());
  for (const speech of ["Doesn't matter.", "You don't need my name.", "Cael.", "Marek.", "Sergen Voss.", "Varen.", "Call me Henk.", "I'm Varek.", "Korvin works nearby.", "His name is Korvin."]) {
    assert.equal(establishedCanonicalDisclosure(context, LIVE_INPUT, recent, `*The short man gives Nicco a look.*\n\n${speech}`, scene()), undefined, speech);
  }
  for (const beat of ["*The man replies.*", "*The elegant woman replies.*", "*Nicco replies.*", "*The short man and the elegant woman reply.*", "*The unfamiliar man [NPC24] replies.*"]) {
    assert.equal(establishedCanonicalDisclosure(context, LIVE_INPUT, recent, `${beat}\n\nKorvin.`, scene()), undefined, beat);
  }
  assert.equal(establishedCanonicalDisclosure(context, LIVE_INPUT, recent, "Korvin.", scene()), undefined);
});

test("P3.3 private visibility and confidential encounters cannot bypass identity gating", () => {
  for (const visibility of [{ narrator: true, player: false }, { narrator: false, player: true }]) {
    const store = new WorldStore(world.listEntities().map(entity => ({ source: `${entity.id}.yaml`, document: { schema_version: 1, entity: entity.id === "korvin" ? { ...entity, knowledge: { ...entity.knowledge!, visibility } } : entity, chunks: world.listChunks().filter(chunk => chunk.entity_id === entity.id) } })));
    const context = buildTurnContext(store, market(store).exportSnapshot());
    assert.equal(canonicalNameDisclosure(context, LIVE_INPUT, recent, new Set(["korvin"])), undefined);
  }
  const campaign = market(), context = buildTurnContext(world, campaign.exportSnapshot());
  const confidential = { ...context, primary: { ...context.primary, scene: { ...context.primary.scene, present_characters: context.primary.scene.present_characters.map(c => c.id === "korvin" ? { ...c, confidential_encounter: true } : c) } } };
  registerNarratorIdentities(confidential, world, campaign.exportSnapshot());
  assert.equal(canonicalNameDisclosure(confidential, LIVE_INPUT, recent, new Set(["korvin"])), undefined);
});

test("P3.3 reconciliation masking preserves controlled self-name while ordinary corrections stay masked", async () => {
  const context = buildTurnContext(world, market().exportSnapshot());
  const request = buildNarratorPrompt(LIVE_INPUT, context, recent, {}, emptyIntent);
  await reconcileNarration({ auditor: { check: () => [], arrivals: () => [], access: narratorPackOf(request)!.access, outcome: () => ({ revision: [], prose: [] }) }, generate: async revision => {
    assertKorvinOnly(prepareNarratorRequest(revision));
    return { text: "*The short man replies.*\n\nKorvin.", result: { text: "*The short man replies.*\n\nKorvin.", ...metadata } };
  }, checkpoint() {}, prompt: request, draft: "*Korvin scratches his neck.*", issues: [], outcome: { revision: ["Korvin must remain unnamed in narration."], prose: [] }, intent: { ...emptyIntent, notes: [], rule_declarations: [] }, context });
});
