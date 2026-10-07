import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { parseTemporalAction } from "../src/turn/temporal-action.js";
import { daypartStart, temporalGrounding } from "../src/turn/temporal-grounding.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { deriveSessionView } from "../src/app/session-view.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import { mockNarrator, mockController, collect } from "./turn-fixtures.js";

/** Temporal Action Resolver V1: deterministic wait/sleep/nap/rest requests and the elapsed-time narration guard. */
const world = await loadWorld("data");
let serial = 0;
const fresh = (minute = 600, location = "heartstone_lr") => new CampaignState(world, `temporal_${++serial}`, { player_location: location, world_time: { world_minute: minute } });
const delta = (input: string, campaign = fresh()) => {
  const snapshot = campaign.exportSnapshot();
  return playerIntent(input, buildTurnContext(world, snapshot), snapshot, world).runtime;
};
const advances = (input: string, minute = 600) => {
  const runtime = delta(input, fresh(minute));
  return runtime.length === 1 && runtime[0]!.kind === "runtime_delta" ? runtime[0]!.delta.time_advance_minutes : runtime.length ? NaN : 0;
};
function coordinator(narration: string, controller: StateControllerProvider = mockController([])) {
  const service = new RetrievalService(world);
  return new TurnCoordinator(world, mockNarrator(narration), controller, { service, search: new HybridSearch(service) }, { provider_retry: false });
}
async function turn(campaign: CampaignState, input: string, narration: string, controller?: StateControllerProvider) {
  const last = (await collect(coordinator(narration, controller).runTurn({ campaign, player_input: input }))).at(-1)!;
  return last;
}
const session = (c: CampaignState) => deriveSessionView(world, c.exportSnapshot(), { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } }).scene.time;

// ------------------------------------------------------------------------------------------------ vocabulary
test("daypart targets reuse the authoritative grounding table", () => {
  for (const [label, start] of [["Night", 1380], ["Evening", 1170], ["Morning", 390], ["Afternoon", 840], ["Sunset", 1110], ["Sunrise", 300], ["Late Morning", 570], ["Midnight", 1410]] as const) {
    assert.equal(daypartStart(label), start, label);
    assert.equal(temporalGrounding(start).time_of_day, label);
    if (start > 0) assert.notEqual(temporalGrounding(start - 1).time_of_day, label);
  }
});

// ------------------------------------------------------------------------------------------------ durations (A–F and forms)
test("explicit durations across wait/sleep/nap/rest, numbers, articles, at least and wrappers", () => {
  for (const [input, minutes] of [
    ["he sleeps for 5 hours", 300], ["he sleeps for atleast 5 hours", 300], ["he sleeps for at least 5 hours", 300], ["sleep atleast 5 hours", 300], ["I sleep at least 5 hours.", 300],
    ["he naps for 30 minutes", 30], ["he rests for an hour", 60], ["he waits for 20 minutes", 20], ["wait 20 minutes", 20], ["wait for 20 minutes", 20], ["I wait for 20 minutes", 20],
    ["sleep 5 hours", 300], ["I sleep for five hours", 300], ["he rests for two hours", 120], ["rest 2 hours", 120], ["nap for 30 minutes", 30], ["take a nap for 30 minutes", 30],
    ["he takes a nap for an hour", 60], ["lie down and rest for an hour", 60], ["he lies down and rests for two hours", 120], ["go to sleep for eight hours", 480],
    ["*sleeps for twelve hours*", 720], ["Sleep For 3 Hours!", 180], ["wait for a minute", 1], ["wait a minute", 0], ["wait a minute, who are you?", 0], ["rest for half an hour", 30], ["he gets some sleep for six hours", 360],
    ["he sleeps on the sofa for 5 hours", 300], ["he sleeps for 5 hours on the sofa", 300], ["I drink the tea and then sleep for five hours", 300], ["*waits 10 minutes*", 10],
  ] as const) assert.equal(advances(input), minutes, input);
  assert.deepEqual(parseTemporalAction("he sleeps for atleast 5 hours", 600), { kind: "advance", action: "sleep", mode: "duration", minutes: 300, minimum: true });
});

// ------------------------------------------------------------------------------------------------ targets (G–K)
test("targets resolve to the strictly next occurrence using authoritative starts, noon, midnight, clock times and tomorrow", () => {
  for (const [input, now, minutes] of [
    ["he sleeps until night", 600, 1380 - 600], ["he rests until evening", 600, 1170 - 600], ["he sleeps until 3 pm", 600, 900 - 600], ["sleep until 3 pm", 960, 1440 + 900 - 960],
    ["sleep until tomorrow morning", 600, 1440 + 390 - 600], ["nap until noon", 600, 120], ["nap until noon", 800, 1440 + 720 - 800], ["wait until midnight", 600, 840],
    ["sleep until morning", 1300, 1440 + 390 - 1300], ["rest until 15:00", 840, 60], ["rest until 15:00", 960, 1380], ["wait until 8:30 AM", 400, 110], ["sleep until 8 am", 1000, 1440 + 480 - 1000],
    ["rest until 3:30 pm", 900, 30], ["sleep until the evening", 600, 570], ["he sleeps until tomorrow 8 am", 1200, 1440 + 480 - 1200], ["sleep until tomorrow night", 1420, 1440 + 1380 - 1420],
  ] as const) assert.equal(advances(input, now), minutes, `${input} @${now}`);
  // Already inside Night: "until night" still advances, to the next day's start; never zero.
  assert.equal(advances("sleep until night", 1390), 1430);
  assert.equal(advances("sleep until midnight", 0), 1440);
  // Duration and target that agree are accepted; conflicting ones are not guessed.
  assert.equal(advances("sleep for 13 hours until night", 600), 780);
  assert.equal(advances("sleep for five hours until night", 600), 0);
});

// ------------------------------------------------------------------------------------------------ negatives
test("vague, hypothetical, future, instructed, NPC and bare forms advance nothing", () => {
  for (const input of ["rest for a while", "sleep for a few hours", "sleep for several hours", "wait some time", "rest for ages", "maybe I'll sleep for five hours", "I should rest for two hours",
    "if I sleep for five hours...", "I will sleep for five hours later.", "I might nap until evening.", "Mira sleeps for five hours", "mira sleeps for five hours", "tell Mira to sleep for five hours",
    "She should sleep for five hours.", "Mira can rest until night.", "try to sleep", "rest", "wait", "sleep", "he lies down", "he sits and relaxes", "sleep until later",
    "sleep until he arrives", "sleep until tomorrow", "sleep until tomorrow midnight", "wait until 3", "I sleep for five hours, then wait another two hours", '"I sleep for five hours"',
    "the woman rests for two hours", "*Mira naps for an hour*", "he decides to sleep for five hours", "sure i will sleep but not right now"]) assert.equal(advances(input), 0, input);
  // "go to bed" is not a temporal action; the pre-existing movement rule already rejects it as an unresolved destination.
  assert.equal(parseTemporalAction("go to bed", 600), undefined);
  assert.throws(() => delta("go to bed"), /invalid_runtime_intent/);
});

test("invalid matched requests are rejected atomically; travel combined with a temporal request is not double-charged", () => {
  for (const input of ["sleep for 0 hours", "wait 0 minutes", "sleep for 25 hours", "nap for 1441 minutes", "sleep until 25:00", "sleep until 13 pm", "rest until 3:75 pm", "sleep until tomorrow noon"]) {
    const campaign = fresh(), before = campaign.exportSnapshot();
    assert.throws(() => delta(input, campaign), /invalid_runtime_intent/, input);
    assert.strictEqual(campaign.exportSnapshot(), before);
  }
  assert.throws(() => delta("walk to the heartstone tower and sleep for 5 hours", fresh(600, "calderan_slave_market")), /invalid_runtime_intent/);
  assert.equal(parseTemporalAction("walk for five hours to Heartstone", 600), undefined);
});

// ------------------------------------------------------------------------------------------------ commit, day crossing, mana, UI
test("cross-day sleep increments the day and reuses the existing day-boundary mana recovery", async () => {
  const campaign = fresh(1300);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { mana_delta: -30 } }] });
  const mana = campaign.exportSnapshot().runtime.mana;
  const last = await turn(campaign, "sleep until tomorrow morning", "*He sleeps. Morning light wakes him.*");
  assert.equal(last.type, "turn_completed", JSON.stringify(last));
  const after = campaign.exportSnapshot().runtime;
  assert.equal(after.scene.world_time.world_minute, 1440 + 390);
  assert.equal(after.mana.current, Math.min(mana.max, mana.current + 25));
  assert.deepEqual([session(campaign).day, session(campaign).time_of_day], [1, "Morning"]);
  // A same-day sleep crosses no boundary: no mana.
  const sameDay = fresh(600);
  sameDay.apply({ expected_revision: sameDay.revision, commands: [{ kind: "runtime_delta", delta: { mana_delta: -30 } }] });
  const before = sameDay.exportSnapshot().runtime.mana.current;
  await turn(sameDay, "he sleeps for 5 hours", "*He sleeps.*");
  assert.equal(sameDay.exportSnapshot().runtime.mana.current, before);
});

test("failed temporal turns commit no time, mana or daypart", async () => {
  const campaign = fresh(), before = campaign.exportSnapshot();
  const failing: StateControllerProvider = { async propose() { throw new Error("controller down"); } };
  const last = await turn(campaign, "he sleeps for 5 hours", "*He sleeps.*", failing);
  assert.equal(last.type, "turn_failed");
  assert.deepEqual([campaign.exportSnapshot().runtime, campaign.revision], [before.runtime, before.revision]);
  assert.equal(session(campaign).time_of_day, "Late Morning");
});

// ------------------------------------------------------------------------------------------------ narration guard
test("with zero elapsed time, completed elapsed-time narration is not delivered unchanged; plans and feelings are", async () => {
  for (const narration of ["*Five hours later, Nicco wakes.*", "*Night has fallen by the time he wakes.*", "*The afternoon passes into evening.*", "*He sleeps until sunset.*",
    "*When he wakes the next morning, the fire is out.*", "*By the time he wakes, it is night.*", "*Hours pass.*", "*A few hours later he stirs.*"]) {
    const campaign = fresh(), last = await turn(campaign, "he lies down", narration);
    assert.equal(last.type, "turn_completed", narration);
    assert.equal(campaign.exportSnapshot().runtime.scene.world_time.world_minute, 600);
    if (last.type === "turn_completed") assert.notEqual(last.result.narration, narration, narration);
  }
  for (const narration of ["*He considers sleeping for five hours.*", "*It feels as if he has been awake for hours.*", "*He could sleep for five hours.*", "*If he sleeps until night, the fire will die.*",
    "*He plans to sleep until evening.*", "Five hours would probably help.", "*The room was dark five hours ago.*", "*It feels like hours.*", "*He lies down on the sofa.*"]) {
    const campaign = fresh(), last = await turn(campaign, "he lies down", narration);
    assert.equal(last.type, "turn_completed", narration);
    if (last.type === "turn_completed") assert.equal(last.result.narration, narration, narration);
  }
});

test("a recognized request grounds the narrator in projected time; a contradicting exact duration is not delivered", async () => {
  const grounded = fresh(), ok = "*Five hours pass. He wakes to afternoon light.*";
  const last = await turn(grounded, "he sleeps for 5 hours", ok);
  assert.ok(last.type === "turn_completed" && last.result.narration === ok);
  assert.deepEqual([grounded.exportSnapshot().runtime.scene.world_time.world_minute, session(grounded).time_of_day], [900, "Afternoon"]);
  const wrong = fresh(), bad = "*Eight hours later, he wakes.*";
  const mismatch = await turn(wrong, "he sleeps for 5 hours", bad);
  assert.ok(mismatch.type === "turn_completed" && mismatch.result.narration !== bad);
  assert.equal(wrong.exportSnapshot().runtime.scene.world_time.world_minute, 900);
});
