import { CATEGORIES, runScenario, type Category, type Scenario, type ScenarioResult } from "./scenario.js";

export interface Summary {
  readonly total: number; readonly passed: number; readonly failed: number; readonly known_gaps: number;
  readonly by_category: Record<string, { total: number; passed: number; failed: number; known_gaps: number }>;
  readonly failing_ids: readonly string[]; readonly gap_ids: readonly string[]; readonly results: readonly ScenarioResult[];
}
/** Runs the given scenarios one after the other, each in its own private rig. Deterministic scenarios only. */
export async function runAll(scenarios: readonly Scenario[], only?: readonly string[]): Promise<Summary> {
  const selected = scenarios.filter(s => s.mode === "deterministic" && (!only?.length || only.includes(s.id)));
  const results: ScenarioResult[] = [];
  for (const s of selected) results.push(await runScenario(s));
  const by_category: Summary["by_category"] = Object.fromEntries(CATEGORIES.map((c: Category) => [c, { total: 0, passed: 0, failed: 0, known_gaps: 0 }]));
  for (const r of results) {
    const c = by_category[r.category]!; c.total++;
    if (r.verdict === "PASS") c.passed++; else if (r.verdict === "FAIL") c.failed++; else c.known_gaps++;
  }
  return { total: results.length, passed: results.filter(r => r.verdict === "PASS").length, failed: results.filter(r => r.verdict === "FAIL").length,
    known_gaps: results.filter(r => r.verdict === "KNOWN PRODUCT GAP").length, by_category,
    failing_ids: results.filter(r => r.verdict === "FAIL").map(r => r.id), gap_ids: results.filter(r => r.verdict === "KNOWN PRODUCT GAP").map(r => r.id), results };
}
export function render(summary: Summary, verbose = false): string {
  const lines: string[] = ["Caldrevan modern regression benchmark", ""];
  for (const r of summary.results) {
    lines.push(`${r.verdict.padEnd(18)} ${r.id.padEnd(4)} ${r.category.padEnd(13)} ${String(r.ms).padStart(5)} ms`);
    if (r.verdict === "FAIL" || verbose) for (const f of r.failures) lines.push(`    ${f}`);
    if (r.verdict === "KNOWN PRODUCT GAP") { lines.push(`    gap: ${r.gap}`); if (verbose) for (const f of r.failures) lines.push(`    (desired behavior not met) ${f}`); }
  }
  lines.push("", `total ${summary.total}   passed ${summary.passed}   failed ${summary.failed}   known product gaps ${summary.known_gaps}`);
  for (const [c, v] of Object.entries(summary.by_category)) if (v.total) lines.push(`  ${c.padEnd(13)} ${v.passed}/${v.total} pass${v.failed ? `, ${v.failed} FAIL` : ""}${v.known_gaps ? `, ${v.known_gaps} gap` : ""}`);
  lines.push(`failing: ${summary.failing_ids.length ? summary.failing_ids.join(", ") : "none"}`, `known gaps: ${summary.gap_ids.length ? summary.gap_ids.join(", ") : "none"}`);
  return lines.join("\n");
}
