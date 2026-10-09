import test from "node:test";
import assert from "node:assert/strict";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import type { TurnEvent } from "../src/turn/turn-types.js";
import { ProviderError, type ProviderErrorCode } from "../src/llm/errors.js";
import { DEFAULT_RETRY_POLICY, NO_RETRY_POLICY, RETRYABLE_PROVIDER_CODES, classifyProviderCode, withProviderRetry, ProviderBudget, abortableSleep } from "../src/llm/retry.js";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { MiniMaxNarratorProvider } from "../src/llm/openrouter/minimax-narrator.js";
import { DeepSeekStateControllerProvider } from "../src/llm/openrouter/deepseek-controller.js";
import { setup, collect, transfer } from "./turn-fixtures.js";
import { failOnce, failTwice, fakeRetry, scriptedController, scriptedNarrator, type Step } from "./provider-failure-scripts.js";

const CLEAN = "Brenna accepts boots from Nicco.";
const INPUT = "I give boots to Brenna.";
const ALL_CODES: ProviderErrorCode[] = ["configuration_error", "authentication_error", "rate_limited", "timeout", "cancelled", "provider_unavailable", "invalid_provider_response", "structured_output_invalid", "network_error", "model_refusal"];
const TRANSIENT: ProviderErrorCode[] = ["rate_limited", "timeout", "network_error", "provider_unavailable"];

function rig(narration: Step[] | undefined, controller: Step[] | undefined, retry = fakeRetry(), texts: string[] = [CLEAN], commands = [transfer]) {
  const s = setup(); const narrator = scriptedNarrator(texts, narration), ctl = scriptedController(commands, controller);
  const records: TurnDiagnostics[] = [];
  const co = new TurnCoordinator(s.world, narrator, ctl, s.retrieval, { provider_retry: retry.policy, diagnostics_sink: r => records.push(structuredClone(r) as TurnDiagnostics) });
  return { ...s, narrator, ctl, records, co, retry };
}
const last = (events: readonly TurnEvent[]) => events.at(-1)!;
const owner = (c: ReturnType<typeof setup>["campaign"]) => c.exportSnapshot().items.find(i => i.id === "boots")!.owner_id;

// --------------------------------------------------------------------------------------------------------- classification
test("classification: exactly four provider codes are retryable; every other code is not", () => {
  assert.deepEqual([...RETRYABLE_PROVIDER_CODES].sort(), [...TRANSIENT].sort());
  for (const code of ALL_CODES) assert.equal(classifyProviderCode(code), TRANSIENT.includes(code) ? "retryable" : "non_retryable", code);
});
test("classification: the wire maps to the documented provider codes (429, 500, 502, 503, reset, malformed, 401, 400)", async () => {
  const run = async (respond: () => Response | Promise<Response>) => {
    const client = new OpenRouterClient({ api_key: () => "k", fetch: (async () => respond()) as typeof fetch });
    try { for await (const _ of client.request({ model: "m", messages: [], max_tokens: 5 }, true, 1000)) { /* drain */ } return "none"; } catch (e) { return (e as ProviderError).code; }
  };
  const status = (n: number) => () => new Response("{}", { status: n });
  assert.equal(await run(status(429)), "rate_limited");
  for (const n of [500, 502, 503, 504]) assert.equal(await run(status(n)), "provider_unavailable", String(n));
  assert.equal(await run(() => { throw new Error("ECONNRESET"); }), "network_error");
  assert.equal(await run(() => new Response("not json", { status: 200 })), "invalid_provider_response");
  assert.equal(await run(status(401)), "authentication_error");
  assert.equal(await run(status(400)), "invalid_provider_response");
});

// --------------------------------------------------------------------------------------------------------- happy path
test("happy path: one attempt each, no backoff, full budget as the per-attempt cap, attempts recorded", async () => {
  const r = rig(["ok"], ["ok"]);
  const done = last(await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT })));
  assert.equal(done.type, "turn_completed"); assert.equal(r.narrator.calls(), 1); assert.equal(r.ctl.calls(), 1); assert.deepEqual(r.retry.sleeps, []);
  const a = r.records[0]!.provider_attempts!;
  for (const key of ["narrator", "controller"] as const) assert.deepEqual([a[key]!.attempts, a[key]!.recovered, a[key]!.retry_reasons, a[key]!.final_outcome], [1, false, [], "success"]);
  assert.equal(a.revision_narrator, undefined);
  assert.equal(r.narrator.requests[0]!.timeout_ms, undefined, "an unconstrained attempt sends no clock-dependent value"); assert.equal("timeout_ms" in r.ctl.requests[0]!, false);
});

// --------------------------------------------------------------------------------------------------------- narrator
for (const code of TRANSIENT) test(`narrator ${code} once → one retry, recovered, exactly one commit`, async () => {
  const r = rig(failOnce(code), ["ok"]), base = r.campaign.revision;
  const events = await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }));
  assert.equal(last(events).type, "turn_completed"); assert.equal(events.filter(e => e.type === "state_committed").length, 1);
  assert.equal(r.campaign.revision, base + 1); assert.equal(owner(r.campaign), "nicco");
  assert.equal(r.narrator.calls(), 2); assert.equal(r.ctl.calls(), 1); assert.deepEqual(r.retry.sleeps, [300]);
  const a = r.records[0]!.provider_attempts!.narrator!; assert.deepEqual([a.attempts, a.recovered, a.retry_reasons, a.final_outcome], [2, true, [code], "success"]);
  assert.deepEqual(r.narrator.requests[1]!.messages, r.narrator.requests[0]!.messages, "the retry is the same request");
  assert.equal(r.narrator.requests[1]!.system_prompt, r.narrator.requests[0]!.system_prompt);
});
test("narrator: a discarded partial draft never reaches the controller, history, delivery or the stream counter", async () => {
  const r = rig([{ partial: "DISCARDED_PARTIAL_DRAFT", fail: "timeout" }, "ok"], ["ok"]);
  const events = await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }));
  assert.equal(last(events).type, "turn_completed");
  assert.equal(JSON.stringify(events).includes("DISCARDED_PARTIAL_DRAFT"), false);
  assert.equal(r.ctl.requests[0]!.final_narration, CLEAN);
  assert.equal(JSON.stringify(r.co.recent(r.campaign).entries()).includes("DISCARDED_PARTIAL_DRAFT"), false);
  assert.equal(r.records[0]!.narrator!.streamed_characters, CLEAN.length, "streamed characters count only the successful attempt");
});
test("narrator: an empty completion is retried once and recovers", async () => {
  const r = rig(["empty", "ok"], ["ok"]);
  assert.equal(last(await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }))).type, "turn_completed");
  assert.deepEqual([r.narrator.calls(), r.records[0]!.provider_attempts!.narrator!.retry_reasons], [2, ["empty_or_inconsistent_completion"]]);
});
test("narrator fails twice → turn fails narrator_failed with the provider code; zero commit; state untouched; history clean", async () => {
  const r = rig(failTwice("provider_unavailable"), ["ok"]); const before = r.campaign.exportSnapshot();
  const events = await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }));
  const f = last(events); assert.equal(f.type, "turn_failed");
  if (f.type === "turn_failed") { assert.equal(f.code, "narrator_failed"); assert.equal(f.provider_code, "provider_unavailable"); }
  assert.ok(!events.some(e => e.type === "state_committed")); assert.equal(r.campaign.exportSnapshot(), before); assert.equal(r.ctl.calls(), 0);
  assert.equal(r.narrator.calls(), 2, "bounded: first attempt + one retry, never more");
  const a = r.records[0]!.provider_attempts!.narrator!; assert.deepEqual([a.attempts, a.recovered, a.final_outcome], [2, false, "provider_unavailable"]);
});
for (const code of ["authentication_error", "configuration_error", "invalid_provider_response", "model_refusal", "cancelled"] as const) test(`narrator ${code} is never retried`, async () => {
  const r = rig([{ fail: code }, "ok"], ["ok"]); const rev0 = r.campaign.revision;
  assert.equal(last(await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }))).type, "turn_failed");
  assert.equal(r.narrator.calls(), 1); assert.deepEqual(r.retry.sleeps, []); assert.equal(r.campaign.revision, rev0);
});

// --------------------------------------------------------------------------------------------------------- controller
for (const code of TRANSIENT) test(`controller ${code} once → one retry, recovered, exactly one commit, no duplicate command`, async () => {
  const r = rig(["ok"], failOnce(code)), base = r.campaign.revision;
  const events = await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }));
  assert.equal(last(events).type, "turn_completed"); assert.equal(events.filter(e => e.type === "state_committed").length, 1);
  assert.equal(r.campaign.revision, base + 1); assert.equal(r.narrator.calls(), 1, "the narrator is not re-run for a controller retry");
  assert.equal(r.ctl.calls(), 2); assert.deepEqual(r.ctl.requests[1]!.prior_state, r.ctl.requests[0]!.prior_state); assert.equal(r.ctl.requests[1]!.final_narration, r.ctl.requests[0]!.final_narration);
  const done = last(events); if (done.type === "turn_completed") assert.deepEqual(done.result.authorized_commands, [transfer]);
  const a = r.records[0]!.provider_attempts!.controller!; assert.deepEqual([a.attempts, a.recovered, a.retry_reasons], [2, true, [code]]);
});
test("controller twice-transient → controller_failed, zero commit; malformed structured output is NOT retried (policy: deferred)", async () => {
  const r = rig(["ok"], failTwice("rate_limited")); const rev = r.campaign.revision;
  const f = last(await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT })));
  assert.equal(f.type, "turn_failed"); if (f.type === "turn_failed") assert.equal(f.code, "controller_failed");
  assert.equal(r.ctl.calls(), 2); assert.equal(r.campaign.revision, rev);
  const m = rig(["ok"], ["malformed", "ok"]); const mrev = m.campaign.revision;
  const mf = last(await collect(m.co.runTurn({ campaign: m.campaign, player_input: INPUT })));
  assert.equal(mf.type, "turn_failed"); if (mf.type === "turn_failed") assert.equal(mf.provider_code, "structured_output_invalid");
  assert.equal(m.ctl.calls(), 1); assert.equal(m.campaign.revision, mrev);
});

// --------------------------------------------------------------------------------------------------------- reconciliation
test("reconciliation retry: the revision call fails transiently once, recovers, exactly one commit", async () => {
  // Draft asserts an uncommitted handover (controller proposes nothing) → audit issue → revision.
  const r = rig(["ok", { fail: "rate_limited" }, "ok"], ["ok"], fakeRetry(), [CLEAN, "Brenna looks at the boots and hesitates."], []), base = r.campaign.revision;
  const events = await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }));
  assert.equal(last(events).type, "turn_completed", JSON.stringify(last(events)).slice(0, 300));
  assert.equal(events.filter(e => e.type === "state_committed").length, 1); assert.equal(r.campaign.revision, base, "an empty authorized batch commits once without advancing the revision"); assert.equal(owner(r.campaign), "nicco");
  assert.equal(r.narrator.calls(), 3);
  const a = r.records[0]!.provider_attempts!; assert.equal(a.narrator!.attempts, 1); assert.deepEqual([a.revision_narrator!.attempts, a.revision_narrator!.recovered], [2, true]);
  assert.equal(r.records[0]!.audit!.reconciliation_attempted, true);
});
test("reconciliation fails twice → turn fails, zero commit", async () => {
  const r = rig(["ok", { fail: "timeout" }], ["ok"], fakeRetry(), [CLEAN], []); const before = r.campaign.exportSnapshot();
  const f = last(await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT })));
  assert.equal(f.type, "turn_failed"); assert.equal(r.campaign.exportSnapshot(), before); assert.equal(r.narrator.calls(), 3);
  assert.deepEqual(r.records[0]!.provider_attempts!.revision_narrator!.final_outcome, "timeout");
});

// --------------------------------------------------------------------------------------------------------- cancel / stale
test("cancellation during backoff stops the retry immediately: no second call, zero commit", async () => {
  const abort = new AbortController(); const retry = fakeRetry({}, () => abort.abort());
  const r = rig(failOnce("timeout"), ["ok"], retry); const before = r.campaign.exportSnapshot();
  const events = await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT, signal: abort.signal }));
  const f = last(events); assert.equal(f.type, "turn_failed"); if (f.type === "turn_failed") assert.equal(f.code, "cancelled");
  assert.equal(r.narrator.calls(), 1); assert.equal(r.ctl.calls(), 0); assert.ok(!events.some(e => e.type === "state_committed")); assert.equal(r.campaign.exportSnapshot(), before);
  assert.equal(r.records[0]!.provider_attempts!.narrator!.final_outcome, "cancelled");
});
test("stale revision during backoff stops the retry: no second call, the turn commits nothing", async () => {
  const s = setup(); const narrator = scriptedNarrator([CLEAN], failOnce("rate_limited")), ctl = scriptedController([transfer]);
  const retry = fakeRetry({}, () => { s.campaign.apply({ expected_revision: s.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }); });
  const co = new TurnCoordinator(s.world, narrator, ctl, s.retrieval, { provider_retry: retry.policy }); const base = s.campaign.revision;
  const events = await collect(co.runTurn({ campaign: s.campaign, player_input: INPUT }));
  const f = last(events); assert.equal(f.type, "turn_failed"); if (f.type === "turn_failed") assert.equal(f.code, "stale_turn");
  assert.equal(narrator.calls(), 1); assert.equal(ctl.calls(), 0); assert.ok(!events.some(e => e.type === "state_committed"));
  assert.equal(s.campaign.revision, base + 1, "only the external mutation advanced the revision"); assert.equal(owner(s.campaign), "nicco");
});
test("a signal that is already aborted never starts a retry (real abortableSleep resolves immediately)", async () => {
  const c = new AbortController(); c.abort(); const t = performance.now(); await abortableSleep(5000, c.signal); assert.ok(performance.now() - t < 100);
});

// --------------------------------------------------------------------------------------------------------- bounds
test("bounded: backoff ≤ 500 ms; at most one retry per call; worst case = 2 attempts + one backoff per provider call", async () => {
  const r = rig(failTwice("network_error"), failTwice("network_error"), fakeRetry({ backoff_ms: 250, max_backoff_ms: 500, random: () => 1 }));
  await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }));
  assert.deepEqual(r.retry.sleeps, [500]); assert.equal(r.narrator.calls(), 2);
});
test("budget: an attempt timeout is capped by the remaining per-turn budget, and no retry starts without a minimum window", async () => {
  const retry = fakeRetry({ turn_budget_ms: 10_000, min_retry_window_ms: 5_000 });
  const budget = new ProviderBudget(retry.policy); const timeouts: (number | undefined)[] = []; let n = 0;
  await assert.rejects(withProviderRetry({ policy: retry.policy, budget, signal: new AbortController().signal, checkpoint: () => {}, record: () => {},
    run: async (_a, timeout) => { timeouts.push(timeout); retry.advance(7_000); n++; throw new ProviderError("timeout"); } }), (e: unknown) => e instanceof ProviderError && e.code === "timeout");
  assert.deepEqual(timeouts, [10_000]); assert.equal(n, 1, "3 s left < 5 s window: the retry is skipped");
  const second = rig(["ok"], ["ok"], fakeRetry({ turn_budget_ms: 50_000 })); await collect(second.co.runTurn({ campaign: second.campaign, player_input: INPUT }));
  assert.equal(second.narrator.requests[0]!.timeout_ms, 50_000);
  assert.equal(second.ctl.requests[0]!.timeout_ms, 50_000);
});
test("a retry after a TIMEOUT is capped (default 30 s); a retry after a fast failure keeps the remaining budget", async () => {
  const seen: (number | undefined)[][] = [];
  for (const code of ["timeout", "rate_limited"] as const) {
    const retry = fakeRetry({ turn_budget_ms: 120_000 }); const timeouts: (number | undefined)[] = [];
    await withProviderRetry({ policy: retry.policy, budget: new ProviderBudget(retry.policy), signal: new AbortController().signal, checkpoint: () => {}, record: () => {},
      run: async (attempt, timeout) => { timeouts.push(timeout); if (attempt === 1) throw new ProviderError(code); return 1; } });
    seen.push(timeouts);
  }
  assert.deepEqual(seen[0], [undefined, 30_000]); assert.deepEqual(seen[1], [undefined, undefined], "after a fast failure the retry keeps the (unconstraining) remaining budget");
});
test("worst case: every provider call times out at its own limit — the whole turn is bounded by the budget, not by the sum of attempts", async () => {
  // narrator 60 s timeout → retry capped at 30 s → fails: 90.3 s; the controller is never reached with a full window.
  const retry = fakeRetry(); const budget = new ProviderBudget(retry.policy); let spent = 0;
  const call = (limit: number) => withProviderRetry({ policy: retry.policy, budget, signal: new AbortController().signal, checkpoint: () => {}, record: () => {},
    run: async (_a, timeout) => { const t = Math.min(limit, timeout ?? Infinity); retry.advance(t); spent += t; throw new ProviderError("timeout"); } });
  await assert.rejects(call(60_000)); await assert.rejects(call(20_000)); await assert.rejects(call(60_000));
  assert.ok(retry.clock() <= 120_000 + 3 * 500, `total ${retry.clock()} ms`); assert.ok(retry.clock() < 140_000);
});
test("budget exhausted before a call → timeout without contacting the provider", async () => {
  const retry = fakeRetry({ turn_budget_ms: 1000 }); const budget = new ProviderBudget(retry.policy); retry.advance(2000); let called = false;
  await assert.rejects(withProviderRetry({ policy: retry.policy, budget, signal: new AbortController().signal, checkpoint: () => {}, record: () => {}, run: async () => { called = true; return 1; } }), (e: unknown) => e instanceof ProviderError && e.code === "timeout");
  assert.equal(called, false);
});
test("retry disabled (false / NO_RETRY_POLICY): a transient failure is a single attempt, exactly as before H5", async () => {
  for (const policy of [false as const, NO_RETRY_POLICY]) {
    const s = setup(); const narrator = scriptedNarrator([CLEAN], failOnce("rate_limited"));
    const co = new TurnCoordinator(s.world, narrator, scriptedController([transfer]), s.retrieval, { provider_retry: policy });
    assert.equal(last(await collect(co.runTurn({ campaign: s.campaign, player_input: INPUT }))).type, "turn_failed"); assert.equal(narrator.calls(), 1);
  }
});

// --------------------------------------------------------------------------------------------------------- recovery rate
test("injected transient failures: 100% of single transient failures are recovered, one commit each (target ≥ 90%)", async () => {
  let total = 0, recovered = 0;
  for (const code of TRANSIENT) for (const where of ["narrator", "controller", "both"] as const) for (const empty of [false, true]) {
    if (empty && where !== "narrator") continue;
    const r = rig(where !== "controller" ? (empty ? ["empty", "ok"] : failOnce(code)) : ["ok"], where !== "narrator" ? failOnce(code) : ["ok"]); const base = r.campaign.revision;
    const done = last(await collect(r.co.runTurn({ campaign: r.campaign, player_input: INPUT }))); total++;
    if (done.type === "turn_completed" && r.campaign.revision === base + 1) recovered++;
  }
  assert.equal(recovered, total); assert.ok(total >= 12);
});

// --------------------------------------------------------------------------------------------------------- real adapters through the retry
test("real OpenRouter narrator + controller adapters: 503 then 429 are recovered through the coordinator (one commit)", async () => {
  const s = setup(); let narratorCalls = 0, controllerCalls = 0;
  const counts = { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 };
  const sse = (text: string) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "stop" }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: counts })}\n\ndata: [DONE]\n\n`);
  const narratorClient = new OpenRouterClient({ api_key: () => "k", fetch: (async () => (narratorCalls++ === 0 ? new Response("{}", { status: 503 }) : sse(CLEAN))) as typeof fetch });
  const controllerBody = JSON.stringify({ choices: [{ message: { content: JSON.stringify({ commands: [{ command: transfer, evidence_quote: CLEAN }] }) }, finish_reason: "stop" }], usage: counts });
  const controllerClient = new OpenRouterClient({ api_key: () => "k", fetch: (async () => (controllerCalls++ === 0 ? new Response("{}", { status: 429 }) : new Response(controllerBody))) as typeof fetch });
  const retry = fakeRetry(); const base = s.campaign.revision;
  const co = new TurnCoordinator(s.world, new MiniMaxNarratorProvider(narratorClient), new DeepSeekStateControllerProvider(controllerClient), s.retrieval, { provider_retry: retry.policy });
  const done = last(await collect(co.runTurn({ campaign: s.campaign, player_input: INPUT })));
  assert.equal(done.type, "turn_completed", JSON.stringify(done).slice(0, 300)); assert.equal(s.campaign.revision, base + 1);
  assert.deepEqual([narratorCalls, controllerCalls, retry.sleeps], [2, 2, [300, 300]]);
});
test("provider requests are byte-identical with retry enabled and disabled on an unconstrained turn (retry never perturbs the request)", async () => {
  const requests: string[] = [];
  for (const policy of [false as const, DEFAULT_RETRY_POLICY]) {
    const s = setup(); const narrator = scriptedNarrator([CLEAN]), ctl = scriptedController([transfer]);
    const co = new TurnCoordinator(s.world, narrator, ctl, s.retrieval, { provider_retry: policy });
    await collect(co.runTurn({ campaign: s.campaign, player_input: INPUT }));
    requests.push(JSON.stringify([narrator.requests.map(({ signal: _s, ...r }) => r), ctl.requests.map(({ signal: _s, ...r }) => r)]));
  }
  assert.equal(requests[0], requests[1]);
});
