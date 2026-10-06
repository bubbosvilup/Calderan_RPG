import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { temporalGrounding } from "../src/turn/temporal-grounding.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, NARRATOR_SYSTEM, NARRATOR_OPAQUE_REFS } from "../src/turn/prompt-builder.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { establishedCanonicalDisclosure } from "../src/turn/canonical-name-disclosure.js";
import { narratorPackOf, renderCandidateRequest } from "../src/turn/narrator-pack.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { mockNarrator, mockController, collect } from "./turn-fixtures.js";
import { identityNameFactId } from "../src/campaign/identity-knowledge.js";
import { ProviderError } from "../src/llm/errors.js";

const world = await loadWorld("data");
const recent = [{ player: "I speak to the short compact man.", narration: "*The short, compact man waits.*", status: "finalized" as const, location_id: "calderan_slave_market" }];
const input = "nice to meet you anyway, i'm Nicco";
function market() {
  const campaign = createOpeningCampaign(world, "p33_p11");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market", time_advance_minutes: 600 } }] });
  return campaign;
}
const prompt = (campaign: CampaignState, action: string, history = recent) => buildNarratorPrompt(action, buildTurnContext(world, campaign.exportSnapshot()), history, {}, { candidates: [], runtime: [] });

for (const [minute, day, clock] of [[-1440, -1, "00:00"], [-1, -1, "23:59"], [0, 0, "00:00"], [359, 0, "05:59"], [600, 0, "10:00"], [1080, 0, "18:00"], [1439, 0, "23:59"], [1440, 1, "00:00"], [2041, 1, "10:01"]] as const) {
  test(`P11 authoritative minute ${minute} projects to day ${day} ${clock}`, () => {
    const projection = temporalGrounding(minute);
    assert.deepEqual({ world_minute: projection.world_minute, day: projection.day, actual_time: projection.actual_time }, { world_minute: minute, day, actual_time: clock });
  });
}
test("P11 prompt/compaction grounding stays stable across conversation and changes only with runtime clock", () => {
  const campaign = market(), before = campaign.exportSnapshot();
  const first = prompt(campaign, "Hello."), next = prompt(campaign, "What do you sell?");
  for (const request of [first, next, renderCandidateRequest(narratorPackOf(next)!, [])]) {
    assert.match(request.messages[0]!.content, /"time_of_day":"Late Morning"/);
    assert.ok(!request.messages[0]!.content.includes('"actual_time"'));
    assert.match(request.messages[0]!.content, /unchanged clock means unchanged time of day/);
  }
  assert.deepEqual(campaign.exportSnapshot(), before);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 480 } }] });
  assert.match(prompt(campaign, "Hello.").messages[0]!.content, /"time_of_day":"Late Afternoon"/);
});
test("P3.3 unknown identities retain correlation but explicitly forbid opaque ref rendering", () => {
  const campaign = market(), request = prompt(campaign, "I speak to the short compact man."), gate = narratorIdentityGate(buildTurnContext(world, campaign.exportSnapshot()))!;
  assert.ok(request.system_prompt.includes(NARRATOR_OPAQUE_REFS));
  assert.match(NARRATOR_OPAQUE_REFS, /NEVER render, speak, expose, paraphrase or explain/);
  assert.ok(request.messages[0]!.content.includes(`"ref":"${gate.identities.get("korvin")!.ref}"`));
  assert.ok(!request.messages[0]!.content.includes("Korvin")); assert.ok(!request.messages[0]!.content.includes("korvin"));
  assert.equal(gate.identities.get("korvin")!.player_known_name, null);
});
test("P3.3 name is available only to one current partner's controlled spoken disclosure, including compaction", () => {
  const request = prompt(market(), input);
  assert.match(request.system_prompt, /canonical_name_for_own_spoken_introduction_only":"Korvin"/);
  assert.match(request.system_prompt, /never in descriptive narration, attribution or metadata/);
  assert.ok(!request.messages[0]!.content.includes("Korvin")); assert.ok(!request.system_prompt.includes("The Redemptor"));
  assert.equal(renderCandidateRequest(narratorPackOf(request)!, []).system_prompt, request.system_prompt);
  assert.equal(prompt(market(), "I watch the auction.").system_prompt, NARRATOR_SYSTEM);
  assert.equal(prompt(market(), input, []).system_prompt, NARRATOR_SYSTEM, "no inferred addressee");
});
test("P3.3 name establishment requires supported exact-name speech with a unique adjacent observable attribution", () => {
  const context = buildTurnContext(world, market().exportSnapshot());
  const scene = { participants: [], addressed: [] } as unknown as import("../src/turn/scene-participants.js").SceneParticipantPlan;
  assert.equal(establishedCanonicalDisclosure(context, input, recent, "*The short, compact man replies.*\n\nI'm Korvin.", scene), "korvin");
  for (const output of ["*Korvin smiles.*", "*The short, compact man replies.*\n\nI'm Henk.", "I'm Korvin.", "*The man replies.*\n\nI'm Korvin.", "*Nicco smiles.*\n\nI'm Korvin.", "*The short, compact man replies.*\n\nHe is Korvin."]) {
    assert.equal(establishedCanonicalDisclosure(context, input, recent, output, scene), undefined, output);
  }
});
test("P3.3 canonical disclosure commits name-only knowledge, survives reload, and continues through known naming", async () => {
  const campaign = market(), service = new RetrievalService(world);
  let calls = 0;
  const requests: import("../src/llm/types.js").GenerationRequest[] = [];
  const base = mockNarrator("unused");
  const narrator = { ...base, async *stream(request: import("../src/llm/types.js").GenerationRequest) {
    requests.push(request); calls++;
    yield* mockNarrator(calls === 1 ? "*The short, compact man waits.*" : "*The short, compact man replies.*\n\nI'm Korvin.").stream(request);
  } };
  const coordinator = new TurnCoordinator(world, narrator, mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
  const initial = (await collect(coordinator.runTurn({ campaign, player_input: recent[0]!.player }))).find(event => event.type === "turn_completed");
  assert.ok(initial && initial.type === "turn_completed");
  assert.ok(!/Korvin|korvin|NPC24/.test(initial.result.narration));
  assert.ok((await collect(coordinator.runTurn({ campaign, player_input: input }))).some(event => event.type === "turn_completed"));
  assert.equal(calls, 2); assert.match(requests[1]!.system_prompt, /canonical_name_for_own_spoken_introduction_only":"Korvin"/);
  const snapshot = campaign.exportSnapshot();
  assert.ok(snapshot.knowledge.some(edge => edge.character_id === "nicco" && edge.fact_id === identityNameFactId("korvin") && edge.status === "knows"));
  assert.equal(snapshot.runtime.scene.world_time.world_minute, 600);
  assert.equal(snapshot.characters.filter(character => character.profile.name === "Korvin").length, 0, "no duplicate/promoted replacement NPC");
  assert.ok(!snapshot.knowledge.some(edge => edge.fact_id === identityNameFactId("bartolomhew")));
  const restored = CampaignState.restore(world, JSON.parse(JSON.stringify(snapshot)));
  const known = narratorIdentityGate(buildTurnContext(world, restored.exportSnapshot()))!.identities.get("korvin")!;
  assert.equal(known.player_known_name, "Korvin"); assert.deepEqual(known.player_known_aliases, []);
  assert.ok(prompt(restored, "I speak to Korvin.").messages[0]!.content.includes("Korvin"));
});
test("P10 clarifies agency, allows observable action elaboration and does not change pacing", () => {
  assert.match(NARRATOR_SYSTEM, /preferences, intentions, feelings, thoughts and speech belong to the player/);
  assert.match(NARRATOR_SYSTEM, /has begun to think of somewhere as home/);
  assert.match(NARRATOR_SYSTEM, /Observable elaboration of a player-supplied physical action is allowed/);
  assert.match(NARRATOR_SYSTEM, /without inventing its cause, motivation, internal state, an earlier journey or a new decision/);
  assert.ok(!/every reply must advance|always end with a question|increase event frequency/i.test(NARRATOR_SYSTEM));
});

test("P3.3 controlled name disclosure never unlocks aliases or private titles", () => {
  const request = prompt(market(), "I speak to bartolomhew. What is your name?", []);
  assert.match(request.system_prompt, /canonical_name_for_own_spoken_introduction_only":"Bartolomhew"/);
  assert.ok(!JSON.stringify(request).includes("The Redemptor"));
  assert.match(request.system_prompt, /does not.*disclose aliases, titles, roles, affiliations or private history/);
});

test("P3.3 a draft self-introduction on a failed controller turn grants no name knowledge", async () => {
  const campaign = market(), service = new RetrievalService(world), before = campaign.exportSnapshot();
  const coordinator = new TurnCoordinator(world, mockNarrator("*The short, compact man replies.*\n\nI'm Korvin."), { async propose() { throw new ProviderError("timeout"); } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const events = await collect(coordinator.runTurn({ campaign, player_input: "I speak to the short compact man. What is your name?" }));
  assert.ok(events.some(event => event.type === "turn_failed")); assert.deepEqual(campaign.exportSnapshot(), before);
});
