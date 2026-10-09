import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import { BENCHMARK_CASES } from "../src/dev/controller-benchmark-cases.js";
import { prepareCase, replay, scoreCell, sameCommand, percentiles, staleRevisionInvariant, liveCell, aggregate, type PreparedCase } from "../src/dev/controller-benchmark.js";
import { DEFAULT_CONTROLLER_MODEL } from "../src/llm/openrouter/state-controller.js";

/** Offline checks for the State Controller benchmark harness (no network; live runs use `npm run benchmark:controller`). */
const transfer = (item_id: string): CampaignCommand => ({ kind: "transfer_item", item_id, owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } });

test("benchmark set: ≥60 unique cases across every scoring group, with adult prose only as a small robustness subset", () => {
  assert.ok(BENCHMARK_CASES.length >= 60);
  assert.equal(new Set(BENCHMARK_CASES.map(c => c.id)).size, BENCHMARK_CASES.length);
  for (const g of ["items", "ownership", "economy", "relationships", "knowledge", "conditions", "movement_time", "household_legal", "ambiguous_language", "multi_mutation", "no_op"])
    assert.ok(BENCHMARK_CASES.some(c => c.group === g), g);
  assert.ok(BENCHMARK_CASES.filter(c => c.adult_prose).length <= 5);
});
test("every gold proposal is authorized by the real engine and replays deterministically", async () => {
  for (const c of BENCHMARK_CASES) {
    const p = await prepareCase(c);
    assert.equal(p.request_hash.length, 64);
    // Controller input never carries NPC-private canon.
    assert.ok(!(await replay(c, { model: "x", usage: {}, latency: { request_started_at: "", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "", elapsed_total_ms: 0 }, commands: [] })).request.prior_state.includes("HIDDEN_SECRET_SENTINEL"), c.id);
  }
});
test("stale expected_revision stays rejected regardless of the answering model", async () => { assert.equal(await staleRevisionInvariant(), true); });
test("scoring: exact, optional, false-positive and rejected proposals are classified against the frozen case", async () => {
  const c = BENCHMARK_CASES.find(x => x.id === "r2_x04_subset_items")!, p = await prepareCase(c);
  const correct = await replay(c, { model: "m", usage: {}, latency: { request_started_at: "", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "", elapsed_total_ms: 0 }, commands: [transfer("boots")], evidence: ["Brenna takes the boots from Nicco."] });
  const s = scoreCell(p, [transfer("boots")], correct);
  assert.deepEqual([s.proposed_tp, s.proposed_fp, s.accepted_tp, s.fn, s.state_match], [1, 0, 1, 0, true]);
  const extra = [transfer("boots"), transfer("ring")];
  const wrong = await replay(c, { model: "m", usage: {}, latency: { request_started_at: "", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "", elapsed_total_ms: 0 }, commands: extra, evidence: ["Brenna takes the boots from Nicco.", "Maren studies the ring in Nicco's hand."] });
  const w = scoreCell(p, extra, wrong);
  assert.equal(w.proposed_fp, 1); assert.equal(w.decisions.find(d => d.class === "fp")!.authorized, false); assert.ok(w.rejected >= 1);
  const none = scoreCell(p, [], await replay(c, { model: "m", usage: {}, latency: { request_started_at: "", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "", elapsed_total_ms: 0 }, commands: [] }));
  assert.deepEqual([none.fn, none.state_match], [1, false]);
  assert.ok(sameCommand({ kind: "set_condition", character_id: "a", conditions: ["winded", "dazed"] }, { kind: "set_condition", character_id: "a", conditions: ["dazed", "winded"] }));
  assert.deepEqual(percentiles([5, 1, 3, 2, 4]), { n: 5, min: 1, p50: 3, p90: 5, p95: 5, max: 5 });
});
test("live cell: direct single-model request (no fallback list), safe 429 diagnostics, no key or prompt in the cell", async () => {
  const c = BENCHMARK_CASES.find(x => x.id === "r2_a01_quiet")!, p: PreparedCase = await prepareCase(c);
  const original = globalThis.fetch, key = process.env.OPENROUTER_API_KEY, bodies: Record<string, unknown>[] = [];
  process.env.OPENROUTER_API_KEY = "sk-or-test-key-not-real";
  let n = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init!.body)));
    if (n++ === 0) return Response.json({ error: { code: 429, message: "secret upstream text", metadata: { raw: "PRIVATE raw", provider_name: "Alibaba", limit_source: "upstream_provider_shared_pool" } } }, { status: 429, headers: { "retry-after": "3" } });
    return Response.json({ id: "gen-1", model: DEFAULT_CONTROLLER_MODEL, provider: "Alibaba", choices: [{ message: { content: '{"commands":[]}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, cost: 0.001 } });
  }) as typeof fetch;
  try {
    const cell = await liveCell(DEFAULT_CONTROLLER_MODEL, c, p, 1);
    assert.equal(cell.call_ok, true); assert.equal(cell.state_match, true); assert.deepEqual(cell.attempts.map(a => a.http_status), [429, 200]);
    assert.deepEqual(cell.attempts[0]!.error, { code: 429, limit_source: "upstream_provider_shared_pool", provider_name: "Alibaba", retry_after: "3" });
    for (const b of bodies) { assert.equal(b.model, DEFAULT_CONTROLLER_MODEL); assert.equal("models" in b, false); assert.deepEqual(b.provider, { require_parameters: true, allow_fallbacks: true }); }
    const text = JSON.stringify(cell);
    for (const secret of ["sk-or-test-key-not-real", "secret upstream text", "PRIVATE raw", c.narration]) assert.equal(text.includes(secret), false, secret);
    const a = aggregate([cell]);
    assert.deepEqual([a.http_429, a.retries, a.cost_usd, a.full_case_accuracy_pct], [1, 1, 0.001, 100]);
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = key; }
});
