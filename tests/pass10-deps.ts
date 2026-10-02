import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
/** Static import graph of src/ (type-only imports included: they still couple modules). Used by the architecture test and the report. */
export function graph(root = "src", runtimeOnly = false): Map<string, string[]> {
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") && files.push(p); } };
  walk(root);
  const g = new Map<string, string[]>();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const deps = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'"\n]*?\s+from\s+)?["'](\.[^"']+)["']/g)].filter(m => !(runtimeOnly && m[1])).map(m => relative(".", resolve(dirname(f), m[2]!.replace(/\.js$/, ".ts"))).replaceAll("\\", "/"));
    g.set(f.replaceAll("\\", "/"), [...new Set(deps)].filter(d => d.endsWith(".ts")));
  }
  return g;
}
export function cycles(g: Map<string, string[]>): string[][] {
  const out: string[][] = [], state = new Map<string, 0 | 1 | 2>(), stack: string[] = [];
  const dfs = (n: string) => {
    state.set(n, 1); stack.push(n);
    for (const d of g.get(n) ?? []) {
      if (state.get(d) === 1) out.push([...stack.slice(stack.indexOf(d)), d]);
      else if (!state.get(d)) dfs(d);
    }
    stack.pop(); state.set(n, 2);
  };
  for (const n of g.keys()) if (!state.get(n)) dfs(n);
  return out;
}
const layer = (f: string) => f.split("/")[1]!;
if (process.argv[1]?.endsWith("pass10-deps.js")) {
  const gAll = graph(); console.log("type-or-runtime cycles:", cycles(gAll).length, "(import type cycles are erased by the compiler)");
  const g = graph("src", true);
  console.log("modules", g.size, "edges", [...g.values()].reduce((n, d) => n + d.length, 0));
  console.log("cycles", JSON.stringify(cycles(g)));
  const edges = new Map<string, number>();
  for (const [f, ds] of g) for (const d of ds) if (layer(f) !== layer(d)) edges.set(`${layer(f)} -> ${layer(d)}`, (edges.get(`${layer(f)} -> ${layer(d)}`) ?? 0) + 1);
  console.log([...edges].sort().map(([k, v]) => `${k}: ${v}`).join("\n"));
  for (const [f, ds] of g) for (const d of ds) {
    if (layer(f) === "campaign" && layer(d) === "turn") console.log("VIOLATION campaign->turn", f, d);
    if (layer(f) !== "dev" && layer(d) === "dev") console.log("VIOLATION prod->dev", f, d);
    if (layer(f) === "turn" && layer(d) === "persistence") console.log("VIOLATION turn->persistence", f, d);
    if ((layer(f) === "world" || layer(f) === "scene" || layer(f) === "retrieval") && layer(d) === "turn") console.log("VIOLATION lower->turn", f, d);
    if (layer(f) === "llm" && (layer(d) === "turn" || layer(d) === "campaign")) console.log("NOTE llm->", f, d);
  }
  const co = g.get("src/turn/turn-coordinator.ts") ?? []; console.log("coordinator imports reflection:", co.some(d => d.endsWith("turn/reflection.ts")));
  const reflectImporters = [...g].filter(([, ds]) => ds.includes("src/turn/reflection.ts")).map(([f]) => f); console.log("importers of reflection.ts:", reflectImporters.join(", "));
}
