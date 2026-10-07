import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext, NAME_PROVENANCE } from "../src/turn/context-builder.js";
import { establishNames } from "../src/turn/name-establishment.js";
import { RecentConversation, type RecentExchange } from "../src/turn/recent-conversation.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { deriveSessionView } from "../src/app/session-view.js";
import { derivePlayUiView } from "../src/app/play-ui-view.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { mockNarrator, mockController, collect } from "./turn-fixtures.js";

// Audit characterization, not a replay of the live transcript. The identity cases below were converted to acceptance expectations
// by the created-person identity binding fix (CREATED_PERSON_IDENTITY_BINDING_FIX.md) and the provenance case by
// CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md; the sleep cases still assert today's deferred behavior.
const world = await loadWorld("data");
const fresh = () => new CampaignState(world, "long_continuity_audit", { player_location: "heartstone_lr", world_time: { world_minute: 600 } });
const input1 = "name's nicco, i'm the keeper of the heartstone, what about you?";
const input2 = "so your name is Mira?";
const exchange = (player: string, narration: string): RecentExchange => ({ player, narration, status: "finalized", location_id: "heartstone_lr" });
function names(campaign: CampaignState, recent: readonly RecentExchange[]) {
  return establishNames(recent, buildTurnContext(world, campaign.exportSnapshot()), world, campaign.exportSnapshot(), [], campaign.revision);
}
function view(campaign: CampaignState) {
  const snapshot = campaign.exportSnapshot();
  return derivePlayUiView(world, snapshot, deriveSessionView(world, snapshot, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } }));
}

test("audit (fixed): non-colliding quoted self-name answers the reciprocal introduction and promotes a durable scene member once", () => {
  const campaign = fresh(), first = exchange(input1, '"Sovela." the woman says.');
  const resolution = names(campaign, [first]);
  assert.equal(resolution.promoted[0]?.name, "Sovela");
  campaign.apply({ expected_revision: campaign.revision, commands: [...resolution.commands] });
  assert.deepEqual(names(campaign, [first, exchange("so your name is Sovela?", '"Sovela." the woman says.')]).commands, []);
  const person = campaign.exportSnapshot().characters.find(c => c.profile.name === "Sovela")!;
  assert.equal(person.current.current_location, "heartstone_lr");
  assert.equal(person.current.status, "active");
  assert.ok(person.origin_snapshot?.evidence.some(e => e.includes('"Sovela."')));
  assert.equal(campaign.exportSnapshot().premium_characters.length, 0);
  assert.equal(campaign.exportSnapshot().households.length, 0);
  assert.ok(view(campaign).participants.some(p => p.name === "Sovela"));
});

test("audit (fixed): an absent canonical Mira Thorne no longer blocks a distinct woman's explicit Mira self-introduction", () => {
  assert.equal(world.getEntity("mira_thorne")?.name, "Mira Thorne");
  for (const narration of ['"Mira." the woman says.', '"My name is Mira," the woman says.']) {
    const campaign = fresh();
    assert.ok(!buildTurnContext(world, campaign.exportSnapshot()).characters.some(c => c.id === "mira_thorne"));
    const resolution = names(campaign, [exchange(input2, narration)]);
    assert.deepEqual(resolution.promoted.map(p => p.name), ["Mira"], narration);
    campaign.apply({ expected_revision: campaign.revision, commands: [...resolution.commands] });
    assert.deepEqual(view(campaign).participants.map(p => p.name).sort(), ["Mira", "Nicco"]);
  }
});

for (const name of ["Mira", "Sovela"]) test(`audit (fixed): unquoted RPG ${name} self-answer promotes on the reciprocal turn; confirmation does not duplicate`, () => {
  const campaign = fresh(), first = exchange(input1, `*The woman looks at Nicco.*\n${name}.`), second = exchange(`so your name is ${name}?`, `*The woman nods.*\n${name}.`);
  const resolution = names(campaign, [first]);
  assert.deepEqual(resolution.promoted.map(p => p.name), [name]);
  campaign.apply({ expected_revision: campaign.revision, commands: [...resolution.commands] });
  assert.deepEqual(names(campaign, [first, second]).commands, []);
  assert.deepEqual(view(campaign).participants.map(p => p.name).sort(), [name, "Nicco"].sort());
  const history = new RecentConversation(); [first, second].forEach(e => history.add(e));
  assert.ok(history.forPrompt().some(e => e.narration.includes(`${name}.`)));
});

test("audit (fixed): promotion keeps attributed evidence and narrator context keeps the self-disclosure source after history eviction", () => {
  const campaign = fresh(), introduction = exchange("What's your name?", '"My name is Sovela," the woman says.');
  campaign.apply({ expected_revision: campaign.revision, commands: [...names(campaign, [introduction]).commands] });
  const person = campaign.exportSnapshot().characters.find(c => c.profile.name === "Sovela")!;
  assert.ok(person.origin_snapshot?.evidence.some(e => e.includes("My name is Sovela")));
  assert.equal(campaign.exportSnapshot().knowledge.length, 0, "created names do not use canonical identity-name edges");
  const recent = new RecentConversation(); recent.add(introduction);
  for (let i = 0; i < 13; i++) recent.add(exchange("Hello.", "*Sovela nods.*"));
  const context = buildTurnContext(world, campaign.exportSnapshot());
  const prompt = buildNarratorPrompt("Hello.", context, recent.forPrompt(), {}, { candidates: [], runtime: [] });
  assert.ok(context.characters.some(c => c.profile.name === "Sovela"));
  // The raw quote stays out of the prompt; a fixed provenance sentence (CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md) carries the source.
  assert.doesNotMatch(JSON.stringify(prompt), /My name is Sovela|name_source|self_disclosed/);
  assert.ok(JSON.stringify(prompt).includes(NAME_PROVENANCE.self_disclosed));
  assert.ok(view(campaign).participants.some(p => p.name === "Sovela"));
});

for (const input of ["he sleeps for atleast 5 hours", "he sleeps for at least 5 hours", "he sleeps until night"]) {
  test(`audit: unsupported sleep commits zero elapsed minutes despite a successful elapsed-time narration: ${input}`, async () => {
    const campaign = fresh(), snapshot = campaign.exportSnapshot();
    assert.deepEqual(playerIntent(input, buildTurnContext(world, snapshot), snapshot, world).runtime, []);
    const service = new RetrievalService(world), narration = "*Five hours pass. Daylight disappears and night arrives.*";
    const coordinator = new TurnCoordinator(world, mockNarrator(narration), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
    const events = await collect(coordinator.runTurn({ campaign, player_input: input }));
    const completed = events.at(-1)!;
    assert.equal(completed.type, "turn_completed", JSON.stringify(completed));
    assert.equal(campaign.exportSnapshot().runtime.scene.world_time.world_minute, 600);
    if (completed.type === "turn_completed") assert.equal(completed.result.narration, narration);
    const session = deriveSessionView(world, campaign.exportSnapshot(), { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
    assert.equal(session.scene.time.time_of_day, "Late Morning");
    assert.equal(session.scene.time.day, 0);
  });
}
