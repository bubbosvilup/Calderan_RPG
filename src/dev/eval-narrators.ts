import { readFile, writeFile, mkdir, appendFile, readdir } from "node:fs/promises";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import type { GenerationRequest } from "../llm/types.js";
import type { NarratorResult } from "../llm/narrator-provider.js";
import { ProviderError } from "../llm/errors.js";
import { buildTurnContext } from "../turn/context-builder.js";
import type { TurnEvent } from "../turn/turn-types.js";
import { checkBakeoff, type NarrativeFinding } from "./narrative-checks.js";
import { turnFixture } from "./turn-fixture.js";
import { onlineCoordinator, selectedModels, NARRATOR_OUTPUT_TOKENS } from "./turn-services.js";
import type { SourcePair } from "./playthrough-csv.js";
import { ADULT_PROBES, BAKEOFF_REQUEST_POLICY, NARRATOR_CANDIDATES, NARRATOR_SYSTEM_SHA, adultProbeRequest, capturingFetch, classifyOutcome, diagnoseStageB, fingerprint, quantile, settle, stageACases, stageARequest, stageBCases, targetedCases, authorityCases, usageOf, type BakeoffCase } from "./narrator-bakeoff.js";

const usage = `npm run eval:narrators -- [--stage a|adult|targeted|authority|b] [--model <alias|slug>]... [--cases id,id] [--repeats n] [--dry-run] [--resume <run-dir> [--retry-infra [--max-attempts n]]] [--summarize <run-dir>]
  --stage a      narrator-only bake-off (default). No controller call, no campaign mutation.
  --stage adult  optional provider-behavior probe (consenting adults, fictional). Raw text stays under .build only.
  --stage targeted  Phase 1M.1 Kimi-only equipment-precedence and knowledge-isolation checks, Phase 1M vs 1M.1 prompt on identical fixtures.
  --stage authority  Phase 1N Kimi knowledge-authority cases (narrator-only).
  --stage b      full loop Narrator -> DeepSeek -> TurnEvidence -> authorization -> CampaignState for the named finalists.
  --dry-run      offline: build every prompt and print fingerprints; sends nothing.`;
const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const all = (name: string) => args.flatMap((a, i) => a === name && args[i + 1] ? [args[i + 1]!] : []);
if (args.includes("--help")) { console.log(usage); process.exit(0); }

type Row = Record<string, unknown> & { key: string };
const INFRASTRUCTURE = ["http_error", "timeout", "network_error"];
const infrastructureFailure = (r: Row) => INFRASTRUCTURE.includes(String(r.outcome)) || INFRASTRUCTURE.includes(String(r.narrator_outcome));
const retryInfra = args.includes("--retry-infra");
// Default cap 3; a higher cap is an explicit, recorded supplementary pass (attempt numbers stay in each row).
const maxAttempts = Number(flag("--max-attempts") ?? 3);
const readJsonl = async (path: string): Promise<Row[]> => { try { return (await readFile(path, "utf8")).split("\n").filter(Boolean).map(l => JSON.parse(l) as Row); } catch { return []; } };

if (flag("--summarize")) { await summarize(flag("--summarize")!); process.exit(0); }

const corpus = JSON.parse(await readFile("tests/playthrough/curated.json", "utf8")) as { source_sha256: string; fixtures: (SourcePair & { row: number; expected: [] })[] };
const history = JSON.parse(await readFile("tests/playthrough/historical-windows.json", "utf8")) as Record<string, SourcePair[]>;
const resumeDir = flag("--resume");
const prior = resumeDir ? JSON.parse(await readFile(`${resumeDir}/manifest.json`, "utf8")) as { stage: string; models: { alias: string; model: string }[]; case_ids: string[] } : undefined;
const stage = prior?.stage ?? flag("--stage") ?? "a";
if (!["a", "b", "adult", "targeted", "authority"].includes(stage)) throw new Error(usage);
const requested = prior?.models ?? (all("--model").length ? all("--model") : stage === "b" ? [] : stage === "targeted" || stage === "authority" ? ["kimi"] : NARRATOR_CANDIDATES.map(c => c.alias)).map(m => {
  if (typeof m !== "string") return m;
  const known = NARRATOR_CANDIDATES.find(c => c.alias === m || c.model === m);
  return known ? { alias: known.alias, model: known.model } : { alias: m.replace(/[^a-z0-9]+/gi, "-"), model: m };
});
if (!requested.length) throw new Error("Stage B requires explicit --model finalists");
const caseFilter = prior?.case_ids ?? flag("--cases")?.split(",");
const cases = (stage === "a" ? stageACases(corpus.fixtures) : stage === "targeted" ? targetedCases(corpus.fixtures) : stage === "authority" ? authorityCases(corpus.fixtures) : stage === "b" ? stageBCases(corpus.fixtures) : ADULT_PROBES.map(p => ({ id: p.id, input: p.input, ground_garments: false, repeats: 2, failure_modes: ["adult_content_behavior"] })) as BakeoffCase[])
  .filter(c => !caseFilter || caseFilter.includes(c.id))
  // Explicit repeat override for held-out confirmation runs; recorded per case in the manifest.
  .map(c => flag("--repeats") && !prior ? { ...c, repeats: Number(flag("--repeats")) } : c);
const prompts = new Map<string, Awaited<ReturnType<typeof stageARequest>> | { request: GenerationRequest; fingerprint: string }>();
for (const c of cases) prompts.set(c.id, stage === "adult" ? adultProbeRequest(ADULT_PROBES.find(p => p.id === c.id)!) : await stageARequest(c, history));

const runDir = resumeDir ?? `.build/evaluations/phase-1m-stage-${stage}-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}`;
const manifest = { phase: "1M", stage, created_at: new Date().toISOString(), online_paid: !args.includes("--dry-run"), models: requested, case_ids: cases.map(c => c.id),
  cases: cases.map(c => ({ id: c.id, source_row: c.source_row ?? null, repeats: c.repeats, context_mode: c.window ? `historical_window:${c.window}` : "state_only", failure_modes: c.failure_modes, prompt_fingerprint: stage === "b" ? "per-turn (coordinator-built; see records)" : prompts.get(c.id)!.fingerprint })),
  narrator_system_sha: NARRATOR_SYSTEM_SHA, request_policy: BAKEOFF_REQUEST_POLICY, output_budget_tokens: NARRATOR_OUTPUT_TOKENS,
  controller_model: stage === "b" ? selectedModels().controller : null, corpus_source_sha256: corpus.source_sha256,
  historical_window_policy: "Phase 1L.1 method: three preceding exchanges, marked HISTORICAL CONVERSATION CONTEXT, NOT authoritative canon; evaluation-only narrator input, never controller evidence",
  corpus_status: "historical pairs are evaluation evidence, not canonical prose or authoritative state history" };
if (args.includes("--dry-run")) {
  console.log(JSON.stringify({ ...manifest, note: "DRY RUN: no requests sent", prompt_characters: Object.fromEntries([...prompts].map(([id, p]) => [id, p.request.system_prompt.length + p.request.messages.reduce((n, m) => n + m.content.length, 0)])) }, null, 2));
  process.exit(0);
}
if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY is not set");
await mkdir(runDir, { recursive: true });
if (!resumeDir) await writeFile(`${runDir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
const planned = cases.reduce((n, c) => n + c.repeats, 0) * requested.length;
console.log(`\n=== PAID ONLINE EVALUATION (OpenRouter) ===\nPhase 1M stage ${stage}: ${planned} narrator requests${stage === "b" ? " plus one DeepSeek controller request per finalized turn" : ""}.\nModels: ${requested.map(m => m.model).join(", ")}\nOutput: ${runDir}\n`);

// Interleave models per case/repeat so provider drift over wall-clock time is shared across candidates. Sequential: no concurrency confound.
for (const c of cases) for (let rep = 1; rep <= c.repeats; rep++) for (const m of requested) {
  const file = `${runDir}/${m.alias}.jsonl`, key = `${c.id}#${rep}`;
  const attempts = (await readJsonl(file)).filter(r => r.key === key);
  // Infrastructure failures (upstream 429/5xx, timeout, network) may be retried on resume; model behavior such as truncation never is. Every attempt stays recorded.
  if (attempts.length && !(retryInfra && attempts.length < maxAttempts && attempts.every(infrastructureFailure))) continue;
  const record = stage === "b" ? await runFullLoop(c as ReturnType<typeof stageBCases>[number], m) : await runNarratorOnly(c, m);
  const row: Row = { key, stage, alias: m.alias, model: m.model, case_id: c.id, rep, attempt: attempts.length + 1, source_row: c.source_row ?? null, recorded_at: new Date().toISOString(), ...record };
  await appendFile(file, JSON.stringify(row) + "\n");
  console.log(JSON.stringify({ key, model: m.alias, outcome: row.outcome, ttft_ms: (row.latency as { ttft_ms?: number | null } | undefined)?.ttft_ms ?? null, findings: (row.findings as { category: string }[] | undefined)?.map(f => f.category) ?? [], ...(stage === "b" ? { tp: row.true_positive, fp: (row.false_positive_durable as unknown[]).length, fn: row.false_negative } : {}) }));
}
await summarize(runDir);

async function runNarratorOnly(c: BakeoffCase, m: { alias: string; model: string }) {
  const prompt = prompts.get(c.id)!;
  const wire = capturingFetch();
  const narrator = new MiniMaxNarratorProvider(new OpenRouterClient({ fetch: wire.fetch }), { model: m.model, max_output_tokens: BAKEOFF_REQUEST_POLICY.max_output_tokens, disable_reasoning: true, timeout_ms: BAKEOFF_REQUEST_POLICY.timeout_ms });
  let text = "", result: NarratorResult | undefined, error: unknown;
  for await (const event of narrator.stream(prompt.request)) {
    if (event.type === "text_delta") text += event.text;
    else if (event.type === "completed") result = event.result;
    else { error = event.error; text = event.text; }
  }
  await settle(wire.captures[0]);
  const capture = wire.captures[0], outcome = classifyOutcome(error, capture);
  const latency = result?.latency ?? (error instanceof ProviderError ? error.latency : undefined);
  const scored = "context" in prompt ? checkBakeoff(text, c.input, prompt.context, prompt.retrieval.ids, c.relevance) : [];
  return { prompt_fingerprint: prompt.fingerprint, context_mode: c.window ? `historical_window:${c.window}` : "state_only", failure_modes: c.failure_modes, input: c.input,
    outcome, provider_error_code: error instanceof ProviderError ? error.code : null, http_status: capture?.http_status ?? null, provider_error: capture?.error ?? null,
    upstream_provider: capture?.upstream_provider ?? null, finish_reason: capture?.finish_reason ?? null, reasoning_chars_streamed: capture?.reasoning_chars ?? 0,
    narration: text, narration_complete: outcome === "success",
    latency: { headers_ms: latency?.headers_ms ?? null, ttft_ms: latency?.time_to_first_token_ms ?? null, total_ms: latency?.elapsed_total_ms ?? null },
    usage: usageOf(capture), retrieval: "retrieval" in prompt ? prompt.retrieval : null, findings: scored,
    human_review: "pending: see docs/evaluations/archive/PHASE_1M_REVIEW.md (agent-authored review, not human ratification)" };
}

async function runFullLoop(c: ReturnType<typeof stageBCases>[number], m: { alias: string; model: string }) {
  const { world, campaign } = turnFixture(c.ground_garments);
  const before = campaign.exportSnapshot(), context = buildTurnContext(world, before);
  const narratorWire = capturingFetch(), controllerWire = capturingFetch();
  let narratorRequest: GenerationRequest | undefined;
  const coordinator = await onlineCoordinator(world, false, provider => ({
    generate: request => provider.generate(request), stream: request => { narratorRequest = request; return provider.stream(request); },
  }), { model: m.model, disable_reasoning: true, narrator_client: new OpenRouterClient({ fetch: narratorWire.fetch }), controller_client: new OpenRouterClient({ fetch: controllerWire.fetch }) });
  const events: TurnEvent[] = [];
  for await (const event of coordinator.runTurn({ campaign, player_input: c.input })) events.push(event);
  await settle(narratorWire.captures[0]); await settle(controllerWire.captures[0]);
  const last = events.at(-1)!, result = last.type === "turn_completed" ? last.result : undefined;
  const narration = events.filter(e => e.type === "narration_delta").map(e => (e as { text: string }).text).join("");
  const narratorError = last.type === "turn_failed" && last.code === "narrator_failed" ? new ProviderError(last.provider_code ?? "invalid_provider_response") : undefined;
  const diagnosis = diagnoseStageB(c.expected, result, context, before);
  const after = campaign.exportSnapshot();
  return { input: c.input, expected: c.expected, prompt_fingerprint: narratorRequest ? fingerprint(narratorRequest) : null,
    outcome: result ? "success" : last.type === "turn_failed" ? `turn_failed:${last.code}` : "unknown", narrator_outcome: narratorError ? classifyOutcome(narratorError, narratorWire.captures[0]) : "success",
    provider_error_code: last.type === "turn_failed" ? last.provider_code ?? null : null, upstream_provider: narratorWire.captures[0]?.upstream_provider ?? null, finish_reason: narratorWire.captures[0]?.finish_reason ?? null,
    narration, controller_proposal: result?.controller_proposal ?? null, turn_evidence: result?.turn_evidence ?? null, authorization: result?.authorization ?? null,
    ...diagnosis, findings: checkBakeoff(narration, c.input, context, result?.retrieval.ids ?? []),
    latency: { ttft_ms: result?.latency.narrator_ttft_ms ?? null, narrator_total_ms: result?.latency.narrator_total_ms ?? null, controller_tail_ms: result?.latency.controller_tail_ms ?? null, turn_ms: result?.latency.coordinator_total_ms ?? null },
    usage: { narrator: usageOf(narratorWire.captures[0]), controller: usageOf(controllerWire.captures[0]) },
    final_state: { base_revision: before.revision, revision: after.revision, runtime: after.runtime, items: after.items.map(i => ({ id: i.id, owner_id: i.owner_id, position: i.position })), knowledge: after.knowledge.filter(k => k.fact_id !== "campaign_fact_private_secret") } };
}

async function summarize(dir: string) {
  const files = (await readdir(dir)).filter(f => f.endsWith(".jsonl"));
  const summary: Record<string, unknown> = {};
  for (const file of files) {
    const rows = await readJsonl(`${dir}/${file}`);
    const ok = rows.filter(r => r.outcome === "success");
    const lat = (k: string) => ok.map(r => (r.latency as Record<string, number | null>)[k]).filter((v): v is number => typeof v === "number");
    const stats = (k: string) => { const v = lat(k); return { n: v.length, p25: quantile(v, 0.25), median: quantile(v, 0.5), p75: quantile(v, 0.75) }; };
    // Findings only on responses that produced text (complete or truncated); empty infrastructure failures are not narrative evidence.
    const texted = rows.filter(r => typeof r.narration === "string" && r.narration.trim());
    const count = (list: { category: string }[][]) => list.flat().reduce<Record<string, number>>((n, f) => ({ ...n, [f.category]: (n[f.category] ?? 0) + 1 }), {});
    const findings = count(texted.map(r => (r.findings as { category: string }[] | undefined) ?? []));
    const rescored = rows[0]?.stage === "a" ? await rescore(texted) : undefined;
    const outcomes: Record<string, number> = {};
    for (const r of rows) outcomes[String(r.outcome)] = (outcomes[String(r.outcome)] ?? 0) + 1;
    const sum = (pick: (r: Row) => number | null | undefined) => rows.reduce((n, r) => n + (pick(r) ?? 0), 0);
    type U = { prompt_tokens: number | null; completion_tokens: number | null; provider_reported_cost_usd: number | null };
    const narratorUsage = (r: Row) => ((r.usage as { narrator?: U }).narrator ?? r.usage) as U;
    summary[file.replace(/\.jsonl$/, "")] = { model: rows[0]?.model, attempts: rows.length, keys: new Set(rows.map(r => r.key)).size, keys_with_success: new Set(ok.map(r => r.key)).size, responses_with_text: texted.length, outcomes_all_attempts: outcomes,
      deterministic_finding_counts_at_run_time: findings, ...(rescored ? { deterministic_finding_counts_final_checker: count([...rescored.values()]), final_checker_findings_by_attempt: Object.fromEntries([...rescored].map(([k, v]) => [k, v.map(f => `${f.category}: ${f.excerpt.slice(0, 80)}`)])) } : {}),
      latency_ms: rows[0]?.stage === "b" ? { ttft: stats("ttft_ms"), narrator_total: stats("narrator_total_ms"), controller_tail: stats("controller_tail_ms"), turn: stats("turn_ms") } : { headers: stats("headers_ms"), ttft: stats("ttft_ms"), total: stats("total_ms") },
      narrator_tokens: { prompt: sum(r => narratorUsage(r).prompt_tokens), completion: sum(r => narratorUsage(r).completion_tokens) },
      provider_reported_cost_usd: { narrator: Math.round(sum(r => narratorUsage(r).provider_reported_cost_usd) * 1e6) / 1e6, ...(rows[0]?.stage === "b" ? { controller: Math.round(sum(r => (r.usage as { controller: U }).controller.provider_reported_cost_usd) * 1e6) / 1e6 } : {}) },
      upstream_providers: [...new Set(rows.map(r => r.upstream_provider).filter(Boolean))],
      ...(rows[0]?.stage === "b" ? { tp: sum(r => r.true_positive as number), fp_durable: sum(r => (r.false_positive_durable as unknown[]).length), fn: sum(r => r.false_negative as number),
        expected_diagnoses: rows.flatMap(r => (r.per_expected as { diagnosis: string }[])).reduce<Record<string, number>>((n, p) => ({ ...n, [p.diagnosis]: (n[p.diagnosis] ?? 0) + 1 }), {}),
        controller_incorrect_proposals: sum(r => (r.controller_incorrect_proposals as unknown[]).length) } : {}) };
  }
  await writeFile(`${dir}/summary.json`, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ summary_written: `${dir}/summary.json`, summary }, null, 2));
}
/** Re-applies the final Phase 1M checker to stored Stage A text (same prompt contexts, rebuilt offline). Disclosed separately from run-time findings. */
async function rescore(rows: Row[]) {
  const corpus = JSON.parse(await readFile("tests/playthrough/curated.json", "utf8")) as { fixtures: (SourcePair & { row: number; expected: [] })[] };
  const history = JSON.parse(await readFile("tests/playthrough/historical-windows.json", "utf8")) as Record<string, SourcePair[]>;
  const byId = new Map(stageACases(corpus.fixtures).map(c => [c.id, c]));
  const contexts = new Map<string, Awaited<ReturnType<typeof stageARequest>>>();
  const result = new Map<string, NarrativeFinding[]>();
  for (const r of rows) {
    const c = byId.get(String(r.case_id));
    if (!c) continue;
    if (!contexts.has(c.id)) contexts.set(c.id, await stageARequest(c, history));
    const built = contexts.get(c.id)!;
    result.set(`${r.key}@${String(r.attempt ?? 1)}`, checkBakeoff(String(r.narration), c.input, built.context, built.retrieval.ids, c.relevance));
  }
  return result;
}
