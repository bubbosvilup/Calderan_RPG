import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { temporalGrounding } from "../src/turn/temporal-grounding.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { createUIPlaytestSession } from "../src/app/ui-playtest.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { createSaveFile, serializeSave, decodeSave } from "../src/persistence/save-format.js";
import { collect, mockController, mockNarrator } from "./turn-fixtures.js";
import { ProviderError } from "../src/llm/errors.js";
import type { GenerationRequest } from "../src/llm/types.js";

const world = await loadWorld("data");
const fresh = (minute = 600) => new CampaignState(world, "p11_foundation", { player_location: "calderan_slave_market", world_time: { world_minute: minute } });
const prompt = (campaign: CampaignState) => buildNarratorPrompt("Hello.", buildTurnContext(world, campaign.exportSnapshot()), [], {}, { candidates: [], runtime: [] });
function grounding(request: GenerationRequest) {
  const content = request.messages[0]!.content;
  const block = content.match(/\[AUTHORITATIVE TIME\]\n([^\n]+)/);
  assert.ok(block, "semantic time block survives prompt construction");
  assert.ok(!block[1]!.includes("actual_time"));
  assert.ok(!/\d{2}:\d{2}/.test(block[1]!));
  return JSON.parse(block[1]!) as { day: number; time_of_day: string };
}
const boundaries = [
  [0, "Midnight"], [59, "Midnight"], [60, "Deep Hours"], [299, "Deep Hours"],
  [300, "Sunrise"], [389, "Sunrise"], [390, "Morning"], [569, "Morning"],
  [570, "Late Morning"], [719, "Late Morning"], [720, "Early Afternoon"], [839, "Early Afternoon"],
  [840, "Afternoon"], [989, "Afternoon"], [990, "Late Afternoon"], [1109, "Late Afternoon"],
  [1110, "Sunset"], [1169, "Sunset"], [1170, "Evening"], [1289, "Evening"],
  [1290, "Late Evening"], [1379, "Late Evening"], [1380, "Night"], [1409, "Night"],
  [1410, "Midnight"], [1439, "Midnight"],
] as const;
for (const [minute, label] of boundaries) test(`P11 V1 boundary ${minute}: ${label}`, () => {
  for (const day of [-1, 0, 1, 7]) {
    const projection = temporalGrounding(day * 1440 + minute);
    assert.equal(projection.day, day);
    assert.equal(projection.minute_of_day, minute);
    assert.equal(projection.time_of_day, label);
  }
});
test("P11 day rollover preserves Midnight while normalized minute and day roll over", () => {
  for (const [minute, day, local] of [[1439, 0, 1439], [1440, 1, 0], [1441, 1, 1]] as const) {
    const projection = temporalGrounding(minute);
    assert.equal(projection.day, day); assert.equal(projection.minute_of_day, local);
    assert.equal(projection.time_of_day, "Midnight");
  }
});

const waits = [
  ["/wait 10", 10], ["wait 10 minutes", 10], ["wait 1 minute", 1], ["wait 2 hours", 120],
  ["I wait 10 minutes", 10], ["I wait 2 hours", 120], ["I wait an hour", 60], ["I wait one hour", 60],
  ["*waits 10 minutes*", 10], ["*waits 2 hours*", 120], ["wait an hour", 60], ["wait one hour", 60],
  ["I wait 1 hour.", 60], ["  WAIT 2 HOURS  ", 120], ["*he spent 1 hour caring for someone*", 60],
  ["*he spent 10 minutes caring for someone*", 10], ["/wait 1440", 1440], ["wait 24 hours", 1440],
] as const;
for (const [input, minutes] of waits) test(`P11 explicit wait: ${input}`, () => {
  const campaign = fresh(), snapshot = campaign.exportSnapshot();
  const intent = playerIntent(input, buildTurnContext(world, snapshot), snapshot, world);
  assert.deepEqual(intent.runtime, [{ kind: "runtime_delta", delta: { time_advance_minutes: minutes } }]);
  assert.strictEqual(campaign.exportSnapshot(), snapshot, "parsing never mutates authoritative state");
  campaign.apply({ expected_revision: campaign.revision, commands: [...intent.runtime] });
  assert.equal(campaign.exportSnapshot().runtime.scene.world_time.world_minute, 600 + minutes);
});
for (const input of ["wait until evening", "wait until sunset", "wait until midnight", "wait until Korvin arrives", "wait until the next auction lot", "wait until someone knocks", "wait until the shop opens", "*waits*", "I wait", "wait", "wait for a while", "*waits for the next slave lot*", "wait 1.5 hours", "wait half an hour", '"I wait 2 hours"']) {
  test(`P11 unsupported or vague duration remains non-mutating: ${input}`, () => {
    const campaign = fresh(), snapshot = campaign.exportSnapshot();
    assert.deepEqual(playerIntent(input, buildTurnContext(world, snapshot), snapshot, world).runtime, []);
    assert.strictEqual(campaign.exportSnapshot(), snapshot);
  });
}
for (const input of ["/wait 0", "wait 0 minutes", "wait 25 hours", "*waits 1441 minutes*", "wait 999999999999999999999 hours", "/wait 1.5", "/wait 10\n/wait 10"]) {
  test(`P11 invalid explicit wait is rejected atomically: ${input}`, () => {
    const campaign = fresh(), snapshot = campaign.exportSnapshot();
    assert.throws(() => playerIntent(input, buildTurnContext(world, snapshot), snapshot, world));
    assert.strictEqual(campaign.exportSnapshot(), snapshot);
  });
}
function coordinator(inspect?: (request: GenerationRequest) => void) {
  const service = new RetrievalService(world);
  return new TurnCoordinator(world, mockNarrator("*Nicco remains where he is.*", inspect), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
}
test("P11 real UI start, dialogue and numeric wait expose only semantic time", async () => {
  const requests: GenerationRequest[] = [];
  const session = createUIPlaytestSession({ world, repository: new FileCampaignRepository(world), createCoordinator: () => coordinator(request => requests.push(request)) });
  try {
    assert.equal(session.getView().scene.time.world_minute, 600);
    assert.equal((await session.submitPlayerInput("Hello.")).ok, true);
    assert.equal(session.getView().scene.time.world_minute, 600);
    assert.deepEqual(grounding(requests.at(-1)!), { day: 0, time_of_day: "Late Morning" });
    assert.equal((await session.submitPlayerInput("wait 2 hours")).ok, true);
    assert.equal(session.getView().scene.time.world_minute, 720);
    assert.deepEqual(grounding(requests.at(-1)!), { day: 0, time_of_day: "Early Afternoon" });
  } finally { await session.shutdown({ discard_unsaved: true }); }
});
for (const [start, label] of [[600, "Late Morning"], [700, "Early Afternoon"]] as const) {
  test(`P11 routed travel at ${start} changes label only across a boundary`, async () => {
    const campaign = fresh(start), requests: GenerationRequest[] = [];
    const events = await collect(coordinator(request => requests.push(request)).runTurn({ campaign, player_input: "/go heartstone_square" }));
    assert.equal(events.at(-1)!.type, "turn_completed");
    assert.equal(campaign.exportSnapshot().runtime.scene.player_location, "heartstone_square");
    assert.equal(campaign.exportSnapshot().runtime.scene.world_time.world_minute, start + 20);
    assert.deepEqual(grounding(requests.at(-1)!), { day: 0, time_of_day: label });
  });
}
test("P11 save/reload derives label from exact restored clock without persisted daypart", () => {
  const campaign = fresh(2160), saved = createSaveFile(campaign.exportSnapshot(), world, "2026-10-06T12:00:00.000Z");
  const serialized = serializeSave(saved, world), decoded = decodeSave(serialized, world);
  assert.ok(!serialized.includes('"time_of_day"'));
  assert.ok(!serialized.includes('"minute_of_day"'));
  const restored = CampaignState.restore(world, decoded.snapshot);
  assert.deepEqual(restored.exportSnapshot(), campaign.exportSnapshot());
  assert.equal(temporalGrounding(restored.exportSnapshot().runtime.scene.world_time.world_minute).time_of_day, "Early Afternoon");
  assert.deepEqual(grounding(prompt(restored)), { day: 1, time_of_day: "Early Afternoon" });
});
test("P11 failed provider turn does not commit new numeric-wait time", async () => {
  const campaign = fresh(), before = campaign.exportSnapshot(), service = new RetrievalService(world);
  const co = new TurnCoordinator(world, mockNarrator("*Two hours pass.*"), { async propose() { throw new ProviderError("timeout"); } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const events = await collect(co.runTurn({ campaign, player_input: "wait 2 hours" }));
  assert.equal(events.at(-1)!.type, "turn_failed");
  assert.strictEqual(campaign.exportSnapshot(), before);
});
