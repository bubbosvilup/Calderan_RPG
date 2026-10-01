import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { SemanticIndex } from "../src/retrieval/semantic-index.js";
import { EmbeddingError } from "../src/retrieval/embedding-provider.js";
import { FixtureEmbeddingProvider } from "./retrieval-eval/fixture-embedding-provider.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { aggregate, parseJsonl, percentiles, renderMarkdown, type EvalRecord } from "../src/dev/diagnostics-aggregate.js";
import { LIVE_SCENARIOS, buildScenario } from "../src/dev/live-eval-scenarios.js";
import { collect, mockController, mockNarrator, transfer } from "./turn-fixtures.js";
import { failOnce, failTwice, fakeRetry, scriptedController, scriptedNarrator } from "./provider-failure-scripts.js";

const INPUT = "I give boots to Brenna.";
async function run(narrator: ReturnType<typeof scriptedNarrator>, controller: ReturnType<typeof scriptedController>, scenario: string, n = 1): Promise<EvalRecord> {
  const f = turnFixture(); const service = new RetrievalService(f.world); const records: TurnDiagnostics[] = [];
  const co = new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { diagnostics_sink: r => records.push(structuredClone(r) as TurnDiagnostics), provider_retry: fakeRetry().policy });
  await collect(co.runTurn({ campaign: f.campaign, player_input: INPUT }));
  return { scenario_id: scenario, run: n, diagnostics: records[0]! };
}

test("percentiles use nearest rank and are honest on tiny samples", () => {
  assert.deepEqual(percentiles([]), { n: 0, p50: null, p95: null, p99: null, max: null, mean: null });
  const p = percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); assert.deepEqual([p.p50, p.p95, p.p99, p.max, p.mean], [5, 10, 10, 10, 5.5]);
});
test("aggregation over injected provider outcomes: success, recovered retry, unrecovered failure, reconciliation", async () => {
  const records = [
    await run(scriptedNarrator(["Brenna accepts boots from Nicco."]), scriptedController([transfer]), "ok"),
    await run(scriptedNarrator(["Brenna accepts boots from Nicco."], failOnce("rate_limited")), scriptedController([transfer]), "retry_n"),
    await run(scriptedNarrator(["Brenna accepts boots from Nicco."]), scriptedController([transfer], failOnce("timeout")), "retry_c"),
    await run(scriptedNarrator(["x"], failTwice("provider_unavailable")), scriptedController([]), "fail_n"),
    await run(scriptedNarrator(["Brenna accepts boots from Nicco."]), scriptedController([transfer], ["malformed"]), "fail_parse"),
    await run(scriptedNarrator(["Brenna accepts boots from Nicco.", "Brenna looks at the boots and hesitates."]), scriptedController([]), "reconciled"),
  ];
  const a = aggregate(records);
  assert.equal(a.turns, 6); assert.equal(a.outcome.success, 4); assert.equal(a.outcome.failure, 2);
  assert.deepEqual(a.outcome.failure_codes, { narrator_failed: 1, controller_failed: 1 }); assert.deepEqual(a.outcome.provider_codes, { provider_unavailable: 1, structured_output_invalid: 1 });
  assert.equal(a.retry.turns_with_retry, 3); assert.equal(a.retry.recovered_calls, 2); assert.equal(a.retry.unrecovered_retried_calls, 1); assert.equal(a.retry.first_attempt_success, 2);
  assert.deepEqual(a.retry.retry_reasons, { rate_limited: 1, timeout: 1, provider_unavailable: 1 });
  assert.equal(a.controller.structured_output_invalid, 1); assert.ok(a.controller.parse_success_rate! < 1);
  assert.equal(a.audit.reconciliation_attempted, 1); assert.equal(a.audit.reconciliation_clean, 1); assert.equal(a.audit.redaction_used, 0);
  assert.equal(a.estimated_cost_usd, null, "no prices supplied → no invented cost");
  const priced = aggregate(records, { narrator_input: 1, narrator_output: 2, controller_input: 3, controller_output: 4 }); assert.ok(priced.estimated_cost_usd! > 0);
  assert.equal(a.by_scenario["fail_n"]!.success, 0);
  const md = renderMarkdown(a); assert.match(md, /narrator_failed: 1/); assert.match(md, /Latency/);
  assert.equal(JSON.stringify(a).includes("Brenna"), false, "aggregates carry no narration");
  assert.deepEqual(parseJsonl(records.map(r => JSON.stringify(r)).join("\n") + "\n" + JSON.stringify({ kind: "header" })).length, 6);
  assert.deepEqual(parseJsonl(JSON.stringify(records[0]!.diagnostics))[0]!.diagnostics.turn_id, records[0]!.diagnostics.turn_id, "bare TurnDiagnostics lines are accepted");
});
test("live scenario matrix: A–T all present, unique, every fixture builds, critical set is non-empty", async () => {
  const ids = LIVE_SCENARIOS.map(s => s.id); assert.equal(new Set(ids).size, ids.length);
  for (const letter of "ABCDEFGHIJKLMNOPQRST") assert.ok(ids.some(id => id.startsWith(letter + "_")), letter);
  assert.ok(LIVE_SCENARIOS.length >= 20); assert.ok(LIVE_SCENARIOS.some(s => s.critical));
  for (const s of LIVE_SCENARIOS) { const b = await buildScenario(s, 1); assert.ok(b.campaign.revision >= 1, s.id); assert.ok(s.turns.length >= 1 && s.turns.every(t => t.trim() && t.length <= 4000)); }
});
test("live harness refuses without a key (BLOCKED, exit 3, no network) and refuses an oversized plan (exit 2)", () => {
  const env = { ...process.env }; delete env.OPENROUTER_API_KEY; delete env.VOYAGE_API_KEY;
  const blocked = spawnSync(process.execPath, [".build/src/dev/eval-live-h5.js", "--runs", "1"], { env, encoding: "utf8" });
  assert.equal(blocked.status, 3); assert.match(blocked.stderr, /BLOCKED/);
  const refused = spawnSync(process.execPath, [".build/src/dev/eval-live-h5.js", "--dry", "--runs", "50", "--out", "/dev/null"], { env, encoding: "utf8" });
  assert.equal(refused.status, 2); assert.match(refused.stderr, /REFUSED/);
});
test("embedding transient failure never fails a turn: lexical fallback is used and recorded", async () => {
  const f = turnFixture(); const service = new RetrievalService(f.world); const provider = new FixtureEmbeddingProvider();
  const index = await SemanticIndex.build(service.indexSource(), provider, "narrator");
  for (const failure of [new Error("SECRET_PROVIDER_BODY"), new EmbeddingError("rate_limit"), new EmbeddingError("malformed_response"), new EmbeddingError("timeout"), new EmbeddingError("provider_unavailable")]) {
    provider.embedQuery = async () => { throw failure; };
    const records: TurnDiagnostics[] = []; const g = turnFixture();
    const co = new TurnCoordinator(g.world, mockNarrator("Ironbound is a guild of smiths."), mockController([]), { service: new RetrievalService(g.world), search: new HybridSearch(service, [index]) }, { diagnostics_sink: r => records.push(structuredClone(r) as TurnDiagnostics) });
    const events = await collect(co.runTurn({ campaign: g.campaign, player_input: "What do I know about Ironbound?" }));
    assert.equal(events.at(-1)!.type, "turn_completed", String(failure));
    assert.equal(records[0]!.retrieval!.fallback_to_lexical, true); assert.equal(records[0]!.retrieval!.lexical_used, true);
    assert.equal(JSON.stringify(records[0]).includes("SECRET_PROVIDER_BODY"), false);
  }
});
