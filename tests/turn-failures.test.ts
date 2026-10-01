import test from "node:test";
import assert from "node:assert/strict";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { campaignId } from "../src/campaign/identity.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { WorldStore } from "../src/world/world-store.js";
import { ProviderError } from "../src/llm/errors.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import type { TurnEvent, TurnFailure } from "../src/turn/turn-types.js";
import { collect, metadata, mockController, mockNarrator, setup, transfer } from "./turn-fixtures.js";
import { fixtures, room } from "./fixtures.js";

/**
 * Hardening H1: every TurnFailure code has a direct test. Each failure must leave authoritative state, revision and world time
 * unchanged, commit no command, never treat a failed draft as conversation truth, and (where the cause is transient) be retry-safe:
 * the same input on the same campaign with working providers then commits exactly once. Provider retry itself is H5, not tested here.
 */
const ALL_CODES: readonly TurnFailure[] = ["invalid_input", "context_invalid", "context_too_large", "retrieval_failed", "invalid_runtime_intent", "stale_turn",
  "turn_in_progress", "cancelled", "narrator_failed", "controller_failed", "campaign_validation_failed"];
const covered = new Set<TurnFailure>();

type Setup = ReturnType<typeof setup>;
const minute = (c: CampaignState) => c.exportSnapshot().runtime.scene.world_time.world_minute;
const failure = (events: readonly TurnEvent[]) => { const last = events.at(-1)!; assert.equal(last.type, "turn_failed", JSON.stringify(last).slice(0, 200)); return last as Extract<TurnEvent, { type: "turn_failed" }>; };
function narratorFailing(error: unknown): NarratorProvider { return { async generate() { throw error; }, async *stream() { throw error; } }; }
function narratorYielding(delta: string, completed: string): NarratorProvider {
  return { async generate() { throw new Error("unused"); }, async *stream() { if (delta) yield { type: "text_delta", text: delta }; yield { type: "completed", result: { text: completed, ...metadata } }; } };
}
const controllerFailing = (error: unknown): StateControllerProvider => ({ async propose() { throw error; } });

/** The shared failure contract. `retry` re-runs the handover on the same campaign with working providers. */
async function expectFailure(code: TurnFailure, s: Pick<Setup, "world" | "campaign" | "retrieval">, coordinator: TurnCoordinator, input: string, options: { retry?: boolean; provider_code?: string } = {}) {
  const before = s.campaign.exportSnapshot(), revision = s.campaign.revision, time = minute(s.campaign);
  const events = await collect(coordinator.runTurn({ campaign: s.campaign, player_input: input }));
  const failed = failure(events);
  assert.equal(failed.code, code); covered.add(code);
  if (options.provider_code) assert.equal(failed.provider_code, options.provider_code);
  assert.ok(!events.some(e => e.type === "state_committed"), "no commit event");
  assert.equal(s.campaign.exportSnapshot(), before, "authoritative snapshot is the identical object");
  assert.equal(s.campaign.revision, revision); assert.equal(minute(s.campaign), time);
  assert.equal(failed.final_revision, revision); assert.equal(failed.base_revision, revision);
  assert.ok(coordinator.recent(s.campaign).entries().every(e => e.status !== "finalized"), "a failed turn never records finalized conversation");
  assert.deepEqual(coordinator.recent(s.campaign).forPrompt(), [], "a failed draft never re-enters the prompt as truth");
  if (options.retry) {
    const retry = new TurnCoordinator(s.world, mockNarrator("Brenna accepts boots from Nicco."), mockController([transfer]), s.retrieval);
    const done = (await collect(retry.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna." }))).at(-1)!;
    assert.equal(done.type, "turn_completed", "retry with working providers succeeds");
    assert.equal(s.campaign.revision, revision + 1, "and commits exactly once");
    assert.equal(s.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "brenna");
  }
  return failed;
}

test("invalid_input: blank and oversize input fail before anything else", async () => {
  for (const input of ["", "   \n\t ", "x".repeat(4001)]) { const s = setup(); await expectFailure("invalid_input", s, s.coordinator, input, { retry: true }); }
  const s = setup(); const ok = (await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "x".repeat(4000) }))).at(-1)!;
  assert.notEqual(ok.type === "turn_failed" ? ok.code : "", "invalid_input", "4000 characters is the inclusive bound");
});
test("context_invalid: a campaign from another canonical dataset cannot be narrated against this world", async () => {
  const s = setup(), otherWorld = new WorldStore(fixtures());
  const foreign = new CampaignState(otherWorld, "foreign_campaign", { player_location: room, world_time: { world_minute: 100 } });
  assert.notEqual(foreign.exportSnapshot().dataset_id, s.world.datasetId);
  await expectFailure("context_invalid", { world: s.world, campaign: foreign, retrieval: s.retrieval }, s.coordinator, "Hello.");
});
test("context_too_large: never-drop scene state that cannot fit even after projection fails closed (not retry-safe: it recurs until state changes)", async () => {
  // H3: count caps no longer fail a turn (17 events now project to the soonest 16); only state that may not be dropped can overflow.
  // Items carried by a present person are never dropped, so enough of them genuinely exceeds the serialized budget.
  const s = setup();
  for (let batch = 0; batch < 3; batch++) s.campaign.apply({ expected_revision: s.campaign.revision, commands: Array.from({ length: 100 }, (_, k): CampaignCommand => {
    const n = batch * 100 + k;
    return { kind: "register_item", item: { id: campaignId("item", `h3_load_${n}`), origin: { kind: "created" }, name: `Heavy ledger number ${n}`, description: "A ledger bound in cracked leather.",
      owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } } };
  }) });
  await expectFailure("context_too_large", s, s.coordinator, "Hello.");
  await expectFailure("context_too_large", s, s.coordinator, "Hello.");
});
test("H3: what used to be a fatal count cap (17 scheduled events) now projects the soonest 16 and the turn completes", async () => {
  const s = setup();
  s.campaign.apply({ expected_revision: s.campaign.revision, commands: Array.from({ length: 17 }, (_, n): CampaignCommand =>
    ({ kind: "schedule_event", id: campaignId("event", `h1_cap_${n}`), title: `Cap event ${n}`, scheduled_world_minute: 10_000 + n, participants: ["nicco"] })) });
  const last = (await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "Hello." }))).at(-1)!;
  assert.equal(last.type, "turn_completed");
  assert.equal(s.campaign.exportSnapshot().scheduled_events.length, 17, "selection is not forgetting");
});
test("context_too_large: an over-long narrator draft fails closed and is never delivered", async () => {
  const s = setup(), huge = "Brenna talks. ".repeat(2000);
  await expectFailure("context_too_large", s, new TurnCoordinator(s.world, narratorYielding(huge, huge), mockController([]), s.retrieval), "Hello.", { retry: true });
});
test("retrieval_failed: a required lookup failure stops before narration and leaks no raw error", async () => {
  const s = setup();
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Hi"), mockController([]), { service: s.retrieval.service, search: { async searchWithDiagnostics() { throw new Error("raw provider detail"); } } });
  const failed = await expectFailure("retrieval_failed", s, coordinator, "What do I know about Ironbound?", { retry: true });
  assert.ok(!JSON.stringify(failed).includes("raw provider detail"));
});
test("invalid_runtime_intent: out-of-range deterministic player commands are rejected before narration", async () => {
  for (const input of ["/wait 99999", "/wait 0"]) { const s = setup(); await expectFailure("invalid_runtime_intent", s, s.coordinator, input, { retry: true }); }
});
test("stale_turn: a revision change during the turn rejects it without rebasing", async () => {
  const s = setup(), base = s.campaign.revision;
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Brenna accepts boots from Nicco."), mockController([transfer], () =>
    s.campaign.apply({ expected_revision: base, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] })), s.retrieval);
  const events = await collect(coordinator.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna." }));
  assert.equal(failure(events).code, "stale_turn"); covered.add("stale_turn");
  assert.equal(s.campaign.revision, base + 1, "only the external change landed");
  assert.equal(s.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "nicco", "no turn command committed");
  assert.deepEqual(coordinator.recent(s.campaign).forPrompt(), []);
});
test("turn_in_progress: a second concurrent turn on the same campaign is refused and changes nothing", async () => {
  const s = setup(), before = s.campaign.exportSnapshot();
  const first = s.coordinator.runTurn({ campaign: s.campaign, player_input: "Hello" }); await first.next();
  const second = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "Again" }));
  assert.equal(failure(second).code, "turn_in_progress"); covered.add("turn_in_progress");
  assert.equal(s.campaign.exportSnapshot(), before);
  await first.return(undefined);
  const after = (await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "Hello again" }))).at(-1)!;
  assert.equal(after.type, "turn_completed", "the lock is released once the first turn ends");
});
test("cancelled: an aborted signal fails the turn before any provider call; mid-narration abort also never commits", async () => {
  const s = setup(); const aborted = new AbortController(); aborted.abort(); let called = false;
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Brenna accepts boots from Nicco.", () => { called = true; }), mockController([transfer]), s.retrieval);
  const before = s.campaign.exportSnapshot();
  const events = await collect(coordinator.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna.", signal: aborted.signal }));
  assert.equal(failure(events).code, "cancelled"); covered.add("cancelled"); assert.equal(called, false); assert.equal(s.campaign.exportSnapshot(), before);
  const mid = new AbortController();
  const stopping: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: "Brenna accepts " }; mid.abort(); yield { type: "text_delta", text: "boots from Nicco." }; yield { type: "completed", result: { text: "Brenna accepts boots from Nicco.", ...metadata } }; } };
  const midEvents = await collect(new TurnCoordinator(s.world, stopping, mockController([transfer]), s.retrieval).runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna.", signal: mid.signal }));
  assert.equal(failure(midEvents).code, "cancelled"); assert.equal(s.campaign.exportSnapshot(), before);
});
test("narrator_failed: provider timeout, empty completion and a completion that disagrees with the stream", async () => {
  { const s = setup(); await expectFailure("narrator_failed", s, new TurnCoordinator(s.world, narratorFailing(new ProviderError("timeout")), mockController([transfer]), s.retrieval), "I give boots to Brenna.", { retry: true, provider_code: "timeout" }); }
  { const s = setup(); await expectFailure("narrator_failed", s, new TurnCoordinator(s.world, narratorYielding("", ""), mockController([transfer]), s.retrieval), "I give boots to Brenna.", { retry: true }); }
  { const s = setup(); await expectFailure("narrator_failed", s, new TurnCoordinator(s.world, narratorYielding("Brenna accepts boots.", "Something else entirely."), mockController([transfer]), s.retrieval), "I give boots to Brenna.", { retry: true }); }
});
test("narrator_failed: a failed reconciliation revision discards the prepared (uncommitted) state", async () => {
  const s = setup(); let call = 0;
  // Draft asserts an uncommitted handover (controller proposes nothing) -> audit -> revision call -> the revision provider times out.
  const narrator: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() {
    if (call++ === 0) { const text = "Brenna accepts boots from Nicco."; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; return; }
    throw new ProviderError("timeout"); } };
  await expectFailure("narrator_failed", s, new TurnCoordinator(s.world, narrator, mockController([]), s.retrieval, { provider_retry: false }), "I give boots to Brenna.", { retry: true, provider_code: "timeout" });
  assert.equal(call, 2, "the failure came from the reconciliation call, after preparation (single attempt: H5 retry is pinned off here and tested in provider-retry-h5)");
});
test("controller_failed: a controller provider error fails the turn; the delivered-nothing draft is not conversation truth", async () => {
  for (const code of ["timeout", "rate_limited", "structured_output_invalid"] as const) {
    const s = setup();
    const coordinator = new TurnCoordinator(s.world, mockNarrator("Brenna accepts boots from Nicco."), controllerFailing(new ProviderError(code)), s.retrieval);
    await expectFailure("controller_failed", s, coordinator, "I give boots to Brenna.", { retry: true, provider_code: code });
    assert.ok(coordinator.recent(s.campaign).entries().every(e => e.narration === ""), "the undelivered draft text is never retained");
  }
});
test("campaign_validation_failed: an authorized batch that fails final validation commits nothing, atomically", async () => {
  const equip: CampaignCommand = { kind: "place_item", item_id: "boots", position: { kind: "equipped", character_id: "brenna", slot: "feet", mode: "worn" } };
  const s = setup();
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Brenna accepts boots from Nicco. Brenna equips boots in feet."), mockController([transfer, equip]), s.retrieval);
  await expectFailure("campaign_validation_failed", s, coordinator, "/give boots to brenna\n/equip boots for brenna feet worn", { retry: true });
});
test("coverage: every TurnFailure code has a direct test above", () => {
  assert.deepEqual([...covered].sort(), [...ALL_CODES].sort());
});
