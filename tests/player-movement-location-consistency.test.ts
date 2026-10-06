import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { resolveDestination, reachable } from "../src/turn/natural-actions.js";
import { entityMentions } from "../src/turn/retrieval-policy.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { GameSession } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { buildSceneRam } from "../src/scene/scene-ram-builder.js";
import { buildNarrativeContext } from "../src/scene/narrative-context-builder.js";
import { collect, metadata, mockController } from "./turn-fixtures.js";

const world = await loadWorld("data");
const market = "calderan_slave_market";
let serial = 0;
function fixture(draft = "Nicco approaches the nearby seller. The man leans on the post.") {
  const campaign = createOpeningCampaign(world, `movement_location_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: market } }] });
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream() {
    yield { type: "text_delta", text: draft }; yield { type: "completed", result: { text: draft, ...metadata } };
  } }, mockController([]), { service, search: new HybridSearch(service) });
  coordinator.recent(campaign).add({ player: "*looks at the licensed private sellers*", narration: "A seller waits nearby. Another man leans on the post.", status: "finalized", location_id: market });
  return { campaign, coordinator };
}

test("local people and objects never mine incidental location nouns; canonical travel is preserved", () => {
  const { campaign } = fixture(), snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot);
  assert.deepEqual([...entityMentions("the man leaning on the post", context, world)].filter(([id]) => world.getEntity(id)?.type === "location"), [], "no exact/near-name evidence: the old fallback alone selected post");
  for (const phrase of ["the man leaning on the post", "the woman by the table", "the seller near the pens", "the guard beside the gate", "the man by the stall", "the person near the wagon", "the man at West Guard Post", "the woman at Heartstone Tower", "the table by the bridge", ...["square", "tower", "market", "hall", "temple", "dock"].map(n => `the man beside the ${n}`)]) {
    assert.equal(resolveDestination(phrase, context, world), undefined, phrase);
    assert.deepEqual(playerIntent(`*goes to ${phrase}* Hello`, context, snapshot, world).runtime, [], phrase);
  }
  for (const input of ["goes to the man leaning on the post Hello", "walks to the woman by the table", "approaches the seller near the pens", "goes over to the guard beside the gate", "walks toward the man by the stall", "moves to the person near the wagon"])
    assert.deepEqual(playerIntent(input, context, snapshot, world).runtime, [], input);
  for (const phrase of ["West Guard Post", "Heartstone Tower", "Slave Market", "Heartstone", "Heartstone Living Floor", "West Gate"] ) {
    const destination = resolveDestination(phrase, context, world); assert.ok(destination, phrase);
    const route = reachable(destination, market, world); assert.ok(route.target, phrase);
    const intent = playerIntent(`*goes to ${phrase}*`, context, snapshot, world);
    assert.deepEqual(intent.runtime, route.target === market ? [] : [{ kind: "runtime_delta", delta: { player_location: route.target, time_advance_minutes: route.route!.minutes } }], phrase);
  }
});

test("real post regression stays at licensed sellers through finalized narration and projections", async () => {
  for (const input of ["goes to the man leaning on the post Hello", "*goes to the man leaning on the post* Hello"]) {
    const { campaign, coordinator } = fixture();
    const last = (await collect(coordinator.runTurn({ campaign, player_input: input }))).at(-1)!;
    assert.equal(last.type, "turn_completed");
    const snapshot = campaign.exportSnapshot(), runtime = new RuntimeState(world, snapshot.runtime.scene);
    assert.equal(snapshot.runtime.scene.player_location, market);
    assert.equal(buildSceneRam(world, runtime).player_location, market);
    assert.equal(buildNarrativeContext(world, runtime).scene.player_location?.id, market);
  }
});

test("Heartstone return converges runtime, RAM, context, session and final NDJSON", async t => {
  const { campaign, coordinator } = fixture("Nicco enters Heartstone Tower.");
  const session = GameSession.fromCampaign({ world, repository: new FileCampaignRepository(world), createCoordinator: () => coordinator }, campaign);
  const server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { await session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/turn`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ text: "*goes back to Heartstone*" }) });
  const lines = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
  const final = lines.at(-1); assert.equal(final.ok, true, JSON.stringify(final));
  const snapshot = campaign.exportSnapshot(), runtime = new RuntimeState(world, snapshot.runtime.scene);
  assert.equal(snapshot.runtime.scene.player_location, "heartstone_lr");
  assert.equal(buildSceneRam(world, runtime).player_location, "heartstone_lr");
  assert.equal(buildNarrativeContext(world, runtime).scene.player_location?.id, "heartstone_lr");
  assert.equal(session.getView().scene.location.id, "heartstone_lr");
  assert.equal(final.scene.location, session.getView().scene.location.name);
  assert.ok(lines.filter(e => e.type === "draft").every(e => !e.scene));
});

test("uncommitted canonical arrival and unsupported home entry cannot survive revision/redaction", async () => {
  for (const [input, draft] of [["*enters home*", "Nicco enters Heartstone Tower."], ["*enters home*", "Nicco enters home."], ["*goes to a nonexistent place*", "Nicco enters Heartstone Tower."]] ) {
    const { campaign, coordinator } = fixture(draft);
    const last = (await collect(coordinator.runTurn({ campaign, player_input: input! }))).at(-1)!;
    assert.equal(last.type, "turn_completed", JSON.stringify({ input, last }));
    if (last.type === "turn_completed") assert.ok(!last.result.narration.includes(draft!), last.result.narration);
    assert.equal(campaign.exportSnapshot().runtime.scene.player_location, market);
  }
});
