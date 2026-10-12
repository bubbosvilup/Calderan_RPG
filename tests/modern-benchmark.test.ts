import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, runScenario, type Scenario, type ScenarioResult } from "./benchmark/scenario.js";
import { runAll, render } from "./benchmark/runner.js";
import { SCENARIOS } from "./benchmark/scenarios.js";

/**
 * Consolidation block 8: the modern regression benchmark runs under `npm test` (and, with a report, under `npm run benchmark:modern`). Every scenario is
 * its own test; a scenario FAILS the suite, a KNOWN PRODUCT GAP does not. The tests at the end are the gate of the benchmark format itself.
 */
const first = await runAll(SCENARIOS);
const byId = new Map<string, ScenarioResult>(first.results.map(r => [r.id, r]));

for (const s of SCENARIOS) {
  test(`benchmark ${s.id} [${s.category}]: ${s.purpose}`, () => {
    const r = byId.get(s.id)!;
    assert.notEqual(r.verdict, "FAIL", `${s.id}\n${r.failures.join("\n")}`);
    if (s.known_gap) assert.equal(r.verdict, "KNOWN PRODUCT GAP", `${s.id} is declared a known gap`);
    else assert.equal(r.verdict, "PASS");
  });
}

test("benchmark format: 17-20 scenarios, unique ids, every category covered, all deterministic and offline", () => {
  assert.ok(SCENARIOS.length >= 17 && SCENARIOS.length <= 20, String(SCENARIOS.length));
  assert.equal(new Set(SCENARIOS.map(s => s.id)).size, SCENARIOS.length);
  for (const c of CATEGORIES) assert.ok(SCENARIOS.some(s => s.category === c), `category ${c}`);
  assert.ok(SCENARIOS.every(s => s.mode === "deterministic"));
  assert.equal(first.total, SCENARIOS.length);
  assert.deepEqual(first.failing_ids, [], render(first, true));
});
test("gate: one scenario runs independently and gives the same verdict as inside the full run", async () => {
  for (const id of ["P1", "S1", "A2"]) {
    const alone = await runAll(SCENARIOS, [id]);
    assert.equal(alone.total, 1);
    assert.equal(alone.results[0]!.verdict, byId.get(id)!.verdict, id);
  }
});
test("gate: a failure names the scenario id and prints expected vs actual", async () => {
  const wrong: Scenario = { ...SCENARIOS.find(s => s.id === "T1")!, id: "T1-wrong", expect: { gold: 999 } };
  const r = await runScenario(wrong);
  assert.equal(r.verdict, "FAIL");
  const text = r.failures.join("\n");
  assert.match(text, /T1-wrong final: gold/); assert.match(text, /expected 999/); assert.match(text, /actual   (?:485|500)/);
  const stepWrong = await runScenario({ ...wrong, id: "T1-step", expect: {}, steps: wrong.steps.map((st, i) => i === 1 ? { ...st, expect: { offers_active: ["buy:goods:99"] } } : st) });
  assert.match(stepWrong.failures.join("\n"), /T1-step step 2 \(turn\): offers_active\n\s+expected \["buy:goods:99"\]\n\s+actual\s+\["buy:goods:15"\]/);
});
test("gate: a known product gap reports KNOWN PRODUCT GAP, and FAILS the day it unexpectedly passes (the benchmark never bends to go green)", async () => {
  const gap = SCENARIOS.find(s => s.known_gap)!;
  assert.equal(byId.get(gap.id)!.verdict, "KNOWN PRODUCT GAP");
  const closed = await runScenario({ ...gap, id: "gap-closed", expect: { revision_delta: 0 } });
  assert.equal(closed.verdict, "FAIL"); assert.match(closed.failures.join("\n"), /now PASSES/);
});
test("gate: fixture setup does not leak between scenarios (each run has its own campaign and directory; repeated runs give identical observations)", async () => {
  const a = await runScenario(SCENARIOS.find(s => s.id === "P1")!), b = await runScenario(SCENARIOS.find(s => s.id === "P1")!);
  assert.deepEqual([a.verdict, a.failures], [b.verdict, b.failures]);
  const second = await runAll(SCENARIOS);
  assert.deepEqual(second.results.map(r => [r.id, r.verdict, r.failures]), first.results.map(r => [r.id, r.verdict, r.failures]), "two full runs are identical");
});
