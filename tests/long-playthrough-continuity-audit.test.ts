import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
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

// Audit-only characterization of current behavior, not proposed fixes or a replay of the unavailable live transcript.
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

test("audit: non-colliding quoted self-name misses reciprocal introduction but explicit confirmation promotes a durable scene member", () => {
  const campaign = fresh(), first = exchange(input1, '"Sovela." the woman says.');
  assert.deepEqual(names(campaign, [first]).promoted, []);
  const resolution = names(campaign, [first, exchange("so your name is Sovela?", '"Sovela." the woman says.')]);
  assert.equal(resolution.promoted[0]?.name, "Sovela");
  campaign.apply({ expected_revision: campaign.revision, commands: [...resolution.commands] });
  const person = campaign.exportSnapshot().characters.find(c => c.profile.name === "Sovela")!;
  assert.equal(person.current.current_location, "heartstone_lr");
  assert.equal(person.current.status, "active");
  assert.ok(person.origin_snapshot?.evidence.some(e => e.includes('"Sovela."')));
  assert.equal(campaign.exportSnapshot().premium_characters.length, 0);
  assert.equal(campaign.exportSnapshot().households.length, 0);
  assert.ok(view(campaign).participants.some(p => p.name === "Sovela"));
});

test("audit: an absent canonical Mira Thorne blocks a distinct woman's explicit Mira self-introduction before promotion", () => {
  const campaign = fresh();
  assert.equal(world.getEntity("mira_thorne")?.name, "Mira Thorne");
  assert.ok(!buildTurnContext(world, campaign.exportSnapshot()).characters.some(c => c.id === "mira_thorne"));
  for (const narration of ['"Mira." the woman says.', '"My name is Mira," the woman says.']) {
    assert.deepEqual(names(campaign, [exchange(input2, narration)]).commands, []);
  }
  assert.equal(view(campaign).participants.length, 1);
});

for (const name of ["Mira", "Sovela"]) test(`audit: unquoted RPG ${name} self-answer is not understood by created-person promotion, even on explicit confirmation`, () => {
  const campaign = fresh(), recent = [exchange(input1, `*The woman looks at Nicco.*\n${name}.`), exchange(`so your name is ${name}?`, `*The woman nods.*\n${name}.`)];
  const before = campaign.exportSnapshot();
  assert.deepEqual(names(campaign, recent).commands, []);
  assert.strictEqual(campaign.exportSnapshot(), before);
  assert.equal(view(campaign).participants.length, 1);
  const history = new RecentConversation(); recent.forEach(e => history.add(e));
  assert.ok(history.forPrompt().some(e => e.narration.includes(`${name}.`)));
});

test("audit: promotion keeps attributed evidence but narrator context drops name-disclosure source after history eviction", () => {
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
  assert.doesNotMatch(JSON.stringify(prompt), /My name is Sovela|name_source|self_disclosed/);
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
