import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { DeepSeekStateControllerProvider, DEFAULT_CONTROLLER_MODEL } from "../llm/openrouter/deepseek-controller.js";
import type { NarratorProvider } from "../llm/narrator-provider.js";
import type { AuthorizationDiagnostic, TurnEvent } from "../turn/turn-types.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { turnFixture } from "./turn-fixture.js";
import { capturingFetch, settle, usageOf } from "./narrator-bakeoff.js";
import { EVIDENCE_CORPUS as BASE, EVIDENCE_CORPUS_EXTRA, TELL } from "./evidence-corpus.js";
const EVIDENCE_CORPUS = [...BASE, ...EVIDENCE_CORPUS_EXTRA];

/**
 * Phase 1O paid evaluation: scripted narration (corpus + stored Phase 1M–1N traces) through the real TurnCoordinator with the
 * production DeepSeek controller (evidence schema) in hybrid mode, on throwaway fixtures. Compares grammar-only vs hybrid per
 * agent-authored truth label (pending human review). No narrator calls; one controller call per item.
 */
type Truth = "yes" | "no" | "ambiguous";
interface Item { key: string; source: string; input: string; narration: string; truth: Truth; ground: boolean; brenna_knows?: boolean }
const TRACE_LABELS: Record<string, Truth> = {
  "1m:kimi:r115#1": "no", "1m:kimi:r115#2": "yes", "1m:kimi:r115#3": "no", "1m:kimi:knowledge_tell#1": "yes", "1m:kimi:knowledge_tell#2": "yes", "1m:kimi:knowledge_tell#3": "yes",
  "1m:qwen:r115#1": "yes", "1m:qwen:r115#2": "no", "1m:qwen:r115#3": "yes", "1m:qwen:knowledge_tell#1": "ambiguous", "1m:qwen:knowledge_tell#2": "ambiguous", "1m:qwen:knowledge_tell#3": "yes",
  "1m:minimax:r115#1": "no", "1m:minimax:r115#2": "yes", "1m:minimax:r115#3": "yes", "1m:minimax:knowledge_tell#1": "ambiguous", "1m:minimax:knowledge_tell#2": "no", "1m:minimax:knowledge_tell#3": "ambiguous",
  "1m1:kimi:r115#1": "yes", "1m1:kimi:r115#2": "yes", "1m1:kimi:r115#3": "no", "1m1:kimi:knowledge_tell#1": "yes", "1m1:kimi:knowledge_tell#2": "yes", "1m1:kimi:knowledge_tell#3": "yes",
  "conf:kimi:r115#1": "yes", "conf:kimi:r115#2": "yes", "conf:kimi:r115#3": "no", "conf:kimi:r115#4": "yes", "conf:kimi:r115#5": "no",
  "conf:kimi:knowledge_tell#1": "yes", "conf:kimi:knowledge_tell#2": "yes", "conf:kimi:knowledge_tell#3": "ambiguous", "conf:kimi:knowledge_tell#4": "yes", "conf:kimi:knowledge_tell#5": "yes",
  "glm:z-ai-glm-5-2:r115#1": "yes", "glm:z-ai-glm-5-2:r115#2": "yes", "glm:z-ai-glm-5-2:r115#3": "yes", "glm:z-ai-glm-5-2:knowledge_tell#1": "ambiguous", "glm:z-ai-glm-5-2:knowledge_tell#2": "ambiguous", "glm:z-ai-glm-5-2:knowledge_tell#3": "yes",
  "1n-before:tell#1": "yes", "1n-before:tell#2": "yes", "1n-before:tell#3": "yes", "1n-after:tell#1": "yes", "1n-after:tell#2": "yes", "1n-after:tell#3": "yes",
  "1n-stab-dialogue:boots#1": "yes", "1n-stab-dialogue:boots#2": "yes", "1n-stab-fullprose:boots#1": "yes",
};
async function items(): Promise<Item[]> {
  const out: Item[] = EVIDENCE_CORPUS.map(c => ({ key: `corpus:${c.id}`, source: `corpus:${c.category}`, input: c.input, narration: c.narration, truth: c.truth === "positive" ? "yes" : "no", ground: !!c.ground_garments, ...(c.brenna_knows ? { brenna_knows: true } : {}) }));
  const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
  const add = (prefix: string, records: { key: string; alias: string; case_id: string; input: string; narration: string }[]) => {
    for (const r of records.filter(r => r.case_id === "r115" || r.case_id === "knowledge_tell")) {
      const key = `${prefix}:${r.alias}:${r.key}`, truth = TRACE_LABELS[key];
      if (truth) out.push({ key, source: prefix, input: r.input, narration: r.narration, truth, ground: r.case_id === "r115" });
    }
  };
  add("1m", (await json("docs/evaluations/phase-1m-stage-b-20260928T2044.json")).records);
  add("1m1", (await json("docs/evaluations/phase-1m1-stage-b-20260928T2118.json")).records);
  add("conf", (await json("docs/evaluations/phase-1m1-confirmation-20260928T2125.json")).records);
  add("glm", (await json("docs/evaluations/phase-1m2-glm-check-20260928T2146.json")).runs.stage_b.records);
  const runs = (await json("docs/evaluations/phase-1n-authority-runs-20260928.json")).runs as Record<string, { records: { sequence: string; rep: number; turns: { turn: number; input: string; narration: string }[] }[] }>;
  for (const [prefix, run] of [["1n-before", "contamination_before"], ["1n-after", "tell_after"]] as const)
    for (const s of runs[run]!.records.filter(s => s.sequence === "tell_acquisition")) out.push({ key: `${prefix}:tell#${s.rep}`, source: prefix, input: TELL, narration: s.turns[0]!.narration, truth: TRACE_LABELS[`${prefix}:tell#${s.rep}`]!, ground: false });
  for (const [prefix, run] of [["1n-stab-dialogue", "stability_dialogue_focused"], ["1n-stab-fullprose", "stability_full_prose_reference"]] as const)
    for (const s of runs[run]!.records) { const t = s.turns[5]!; out.push({ key: `${prefix}:boots#${s.rep}`, source: prefix, input: t.input, narration: t.narration, truth: TRACE_LABELS[`${prefix}:boots#${s.rep}`]!, ground: false, brenna_knows: true }); }
  return out;
}

const all = await items();
if (process.argv.includes("--list")) { for (const i of all) console.log(i.key, i.truth); console.log(all.length); process.exit(0); }
if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY is not set");
console.log(`\n=== PAID ONLINE EVALUATION (OpenRouter) ===\nPhase 1O evidence: ${all.length} DeepSeek controller calls (${DEFAULT_CONTROLLER_MODEL}), scripted narration, throwaway fixtures, hybrid mode\n`);
const metadata = { model: "scripted-narration", usage: {}, latency: { request_started_at: "scripted", headers_ms: null, time_to_first_token_ms: null, completed_at: "scripted", elapsed_total_ms: 0 } };
type Row = Item & { turn: string; intents: number; controller_proposal: unknown; authorization: readonly AuthorizationDiagnostic[] | null; grammar_outcome: string; hybrid_outcome: string; extra_authorized: unknown[]; revision: { before: number; after: number }; controller_ms: number | null; usage: ReturnType<typeof usageOf> };
const rows: Row[] = [];
for (const item of all) {
  const f = turnFixture(item.ground, item.brenna_knows ? { brennaKnowsBridge: true } : {}), service = new RetrievalService(f.world), wire = capturingFetch();
  const narrator: NarratorProvider = { async generate() { return { text: item.narration, ...metadata }; }, async *stream() { yield { type: "text_delta", text: item.narration }; yield { type: "completed", result: { text: item.narration, ...metadata } }; } };
  const coordinator = new TurnCoordinator(f.world, narrator, new DeepSeekStateControllerProvider(new OpenRouterClient({ fetch: wire.fetch }), { model: DEFAULT_CONTROLLER_MODEL }), { service, search: new HybridSearch(service) }, { evidence_authorization: "hybrid" });
  const before = f.campaign.exportSnapshot(), events: TurnEvent[] = [];
  for await (const e of coordinator.runTurn({ campaign: f.campaign, player_input: item.input })) events.push(e);
  await settle(wire.captures[0]);
  const last = events.at(-1)!, result = last.type === "turn_completed" ? last.result : undefined;
  const intents = result?.turn_evidence.player_intents ?? [];
  const decisions = intents.map(c => result!.authorization.find(d => isDeepStrictEqual(d.command, c)));
  const outcome = (pick: (d: NonNullable<(typeof decisions)[number]>) => boolean) => { const v = decisions.map(d => !!d && pick(d)); return v.length && v.every(Boolean) ? "all" : v.some(Boolean) ? "partial" : "none"; };
  const row = { ...item, turn: result ? "completed" : last.type === "turn_failed" ? `failed:${last.code}` : "unknown", intents: intents.length,
    controller_proposal: result?.controller_proposal ?? null, authorization: result?.authorization ?? null,
    grammar_outcome: outcome(d => !!d.grammar?.authorized), hybrid_outcome: outcome(d => d.authorized),
    extra_authorized: (result?.authorized_commands ?? []).filter(c => !intents.some(i => isDeepStrictEqual(i, c)) && c.kind !== "runtime_delta"),
    revision: { before: before.revision, after: f.campaign.revision }, controller_ms: result?.latency.controller_total_ms ?? null, usage: usageOf(wire.captures[0]) };
  rows.push(row);
  console.log(JSON.stringify({ key: item.key, truth: item.truth, grammar: row.grammar_outcome, hybrid: row.hybrid_outcome, checks: row.authorization?.map(d => `${d.source}:${d.evidence?.check}`), rev: `${row.revision.before}->${row.revision.after}`, extra: row.extra_authorized.length }));
}
const score = (field: "grammar_outcome" | "hybrid_outcome") => {
  const s = { yes_all: 0, yes_partial: 0, yes_none: 0, no_none: 0, no_any_FALSE_POSITIVE: 0, ambiguous_accepted: 0, ambiguous_rejected: 0 };
  for (const r of rows) {
    const o = r[field];
    if (r.truth === "yes") { if (o === "all") s.yes_all++; else if (o === "partial") s.yes_partial++; else s.yes_none++; }
    else if (r.truth === "no") { if (o === "none") s.no_none++; else s.no_any_FALSE_POSITIVE++; }
    else if (o === "none") s.ambiguous_rejected++; else s.ambiguous_accepted++;
  }
  return s;
};
const q = (v: number[], p: number) => { const x = [...v].sort((a, b) => a - b); if (!x.length) return null; const i = (x.length - 1) * p, l = Math.floor(i), h = Math.ceil(i); return Math.round(x[l]! + (x[h]! - x[l]!) * (i - l)); };
const summary = { items: rows.length, truth: { yes: rows.filter(r => r.truth === "yes").length, no: rows.filter(r => r.truth === "no").length, ambiguous: rows.filter(r => r.truth === "ambiguous").length },
  grammar_only: score("grammar_outcome"), hybrid: score("hybrid_outcome"), extra_authorized_outside_intent: rows.reduce((n, r) => n + r.extra_authorized.length, 0), turn_failures: rows.filter(r => r.turn !== "completed").length,
  controller_ms: { median: q(rows.flatMap(r => r.controller_ms ?? []), 0.5), p75: q(rows.flatMap(r => r.controller_ms ?? []), 0.75) },
  controller_tokens: { prompt: rows.reduce((n, r) => n + (r.usage.prompt_tokens ?? 0), 0), completion: rows.reduce((n, r) => n + (r.usage.completion_tokens ?? 0), 0), completion_median: q(rows.flatMap(r => r.usage.completion_tokens ?? []), 0.5) },
  cost_usd: Math.round(rows.reduce((n, r) => n + (r.usage.provider_reported_cost_usd ?? 0), 0) * 1e6) / 1e6 };
const out = `docs/evaluations/phase-1o-evidence-eval-${Date.now()}.json`;
await writeFile(out, JSON.stringify({ purpose: "Phase 1O: grammar-only vs hybrid evidence authorization with the real DeepSeek controller on scripted narration. Truth labels agent-authored, pending human review.", summary, rows }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output: out, summary }, null, 2));

