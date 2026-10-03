import test from "node:test";
import assert from "node:assert/strict";
import { ContextBudgetManager, DEFAULT_CONTEXT_POLICY, serializeContextBaseline } from "../src/turn/context-budget.js";
import { GameSession } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { setup } from "./turn-fixtures.js";
const request = (n: number) => ({ system_prompt: "", messages: [{ role: "user" as const, content: "x".repeat(n) }] });
const policy = { ...DEFAULT_CONTEXT_POLICY, request_tokens: 1000, output_tokens: 0, overhead_tokens: 0, safety_tokens: 0 };
test("accounting deterministic, low, warning, below/at auto, hard, invalid configuration", () => {
  const m = new ContextBudgetManager(policy);
  const at = (tokens: number) => request(tokens * 4 - JSON.stringify(request(0).messages).length);
  assert.deepEqual(m.measure(at(430)), m.measure(at(430)));
  assert.equal(m.measure(at(430)).warning, false);
  assert.equal(m.measure(at(800)).warning, true);
  assert.equal(m.measure(at(899)).compaction_required, false);
  assert.equal(m.measure(at(900)).compaction_required, true);
  assert.equal(m.measure(at(900)).hard_limit_reached, false);
  assert.equal(m.measure(at(1000)).hard_limit_reached, true);
  assert.throws(() => new ContextBudgetManager({ ...policy, auto: 0.7 }));
});
test("manual lifecycle blocks overlap and turns, failure retains authority and derived request", async () => {
  const f = setup(); let release!: () => void; const gate = new Promise<void>(r => release = r);
  const s = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, "saves/d04-context/test"), createCoordinator: () => f.coordinator,
    compaction_service: { async compact({ reason }) { assert.equal(reason, "manual"); await gate; throw new Error("failure"); } } }, f.campaign);
  const before = f.campaign.exportSnapshot(), active = f.coordinator.contextRequest(f.campaign);
  const run = s.requestContextCompaction({ reason: "manual" });
  assert.equal(s.status, "compacting_context"); assert.equal(s.getView().context_compaction?.trigger, "manual");
  assert.equal((await s.submitPlayerInput("hello")).ok, false);
  assert.equal((await s.requestContextCompaction({ reason: "manual" })).status, "failed");
  assert.equal((await s.save()).ok, false); release();
  assert.equal((await run).status, "failed"); assert.equal(s.status, "idle");
  assert.deepEqual(f.campaign.exportSnapshot(), before); assert.deepEqual(f.coordinator.contextRequest(f.campaign), active);
});
test("auto preflight starts maintenance before accepting input; unavailable never fakes compression", async () => {
  const f = setup(); const s = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, "saves/d04-context/test"), createCoordinator: () => f.coordinator,
    context_policy: { ...DEFAULT_CONTEXT_POLICY, request_tokens: new ContextBudgetManager().measure(f.coordinator.contextRequest(f.campaign)).fixed_instructions_tokens + 1280 + 1000 } }, f.campaign);
  assert.ok(s.getView().context_budget?.compaction_required);
  const statuses: string[] = []; const before = f.campaign.exportSnapshot();
  assert.equal((await s.submitPlayerInput("hello", { onEvent: e => { if(e.type === "status_changed") statuses.push(e.status); } })).ok, false);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(statuses, ["compacting_context", "idle"]); assert.equal(s.getView().context_compaction?.last_result?.reason, "auto");
  assert.equal(s.getView().context_compaction?.last_result?.status, "unavailable"); assert.deepEqual(f.campaign.exportSnapshot(), before);
});
test("baseline contains exactly filtered narrator request and policy, no source snapshot", () => {
  const f = setup();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_fact", fact: { id: "campaign_fact_hidden_d04", content: { kind: "campaign", statement: "HIDDEN_D04_SENTINEL", truth: "true" } } }] });
  const req = f.coordinator.contextRequest(f.campaign), serialized = serializeContextBaseline(req), data = JSON.parse(serialized);
  assert.ok(!serialized.includes("HIDDEN_D04_SENTINEL"));
  assert.deepEqual(data.request, req); assert.equal(data.campaign, undefined); assert.equal(data.runtime, undefined);
});
test("post-turn auto maintenance is emitted before ready; save/load excludes transient compaction", async () => {
  const f = setup(); let crowded = false;
  const s = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, "saves/d04-context/lifecycle"), context_policy: policy,
    createCoordinator: () => ({ contextRequest: () => request(crowded ? 3800 : 100), async *runTurn(req) { for await (const e of f.coordinator.runTurn(req)) { if(e.type === "turn_completed") crowded = true; yield e; } } }) }, f.campaign);
  const statuses: string[] = [];
  const outcome = await s.submitPlayerInput("I smile.", { onEvent: e => { if(e.type === "status_changed") statuses.push(e.status); } });
  assert.ok(outcome.ok); assert.deepEqual(statuses, ["running_turn", "compacting_context", "idle"]);
  assert.equal(s.getView().context_compaction?.last_result?.reason, "auto");
  const saved = await s.save(); assert.ok(saved.ok);
  assert.ok(!JSON.stringify(saved.saved).includes("context_compaction"));
  const loaded = await GameSession.loadCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, "saves/d04-context/lifecycle"), createCoordinator: () => f.coordinator }, f.campaign.exportSnapshot().campaign_id);
  assert.ok(loaded.ok); assert.equal(loaded.session.status, "idle"); assert.equal(loaded.session.getView().context_compaction?.last_result, undefined);
});
