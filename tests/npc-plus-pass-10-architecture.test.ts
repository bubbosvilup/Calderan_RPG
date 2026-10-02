import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { graph, cycles } from "./pass10-deps.js";

/**
 * NPC+ Pass 10 — structural guards over the static import graph (src/, relative to the repository root where `npm test` runs).
 * `import type` is excluded: the compiler erases it, and the type-only cycles in turn/ are documented debt, not runtime coupling.
 */
const g = graph("src", true);
const layer = (f: string) => f.split("/")[1]!;
const edges = [...g].flatMap(([f, ds]) => ds.map(d => [f, d] as const));

test("no runtime import cycle exists anywhere in src/", () => assert.deepEqual(cycles(g), []));
test("dependency direction: domain layers never import the turn pipeline, persistence or dev tooling", () => {
  for (const [f, d] of edges) {
    if (["campaign", "world", "scene", "retrieval", "types", "persistence"].includes(layer(f))) assert.notEqual(layer(d), "turn", `${f} -> ${d}`);
    if (layer(f) !== "dev") assert.notEqual(layer(d), "dev", `production code imports dev tooling: ${f} -> ${d}`);
    if (layer(f) === "turn") assert.notEqual(layer(d), "persistence", `${f} -> ${d}`);
    if (["campaign", "world", "scene", "retrieval", "types"].includes(layer(f))) assert.notEqual(layer(d), "llm", `${f} -> ${d}`);
  }
});
test("reflection stays outside the turn's critical path: the coordinator and the turn stages never import it", () => {
  for (const [f, d] of edges) if (d === "src/turn/reflection.ts") assert.ok(!f.startsWith("src/turn/stages/") && f !== "src/turn/turn-coordinator.ts" && f !== "src/turn/prompt-builder.ts" && f !== "src/turn/context-builder.ts", `${f} imports reflection`);
});
test("runTurn stays at or below 164 lines (Pass 10 recorded 164)", () => {
  const text = readFileSync("src/turn/turn-coordinator.ts", "utf8").split("\n"), start = text.findIndex(l => /async \*runTurn\(/.test(l));
  const end = text.findIndex((l, i) => i > start && l === "  }");
  assert.ok(start >= 0 && end > start);
  assert.ok(end - start + 1 <= 164, `runTurn is ${end - start + 1} lines`);
});
test("the NPC+ domain modules do not depend on diagnostics or evaluation code", () => {
  for (const [f, d] of edges) if (/^src\/(?:campaign\/premium-characters|turn\/npc-plus|turn\/reflection|turn\/follow-invitation|turn\/character-movement)\.ts$/.test(f)) assert.ok(!/\/(?:dev|diagnostics)|turn-diagnostics|reflection-diagnostics/.test(d) || f === "src/turn/reflection.ts", `${f} -> ${d}`);
});
