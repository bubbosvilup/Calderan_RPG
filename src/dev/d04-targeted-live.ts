/** Two-call closure follow-up. Does not repeat the earlier A/B/C live suite. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareD04BakeoffCases } from "./d04-compaction-bakeoff.js";
import { runD04Lifecycle } from "./d04-final-live.js";
import { analyzeLosslessLayouts } from "../turn/lossless-context-compaction.js";
import { contextHash, narratorPackOf } from "../turn/narrator-pack.js";
import { LOSSLESS_SCHEMA_VERSION, LOSSLESS_POLICY_VERSION } from "../turn/lossless-knowledge.js";
import { MiniMaxNarratorProvider, NARRATOR_PROVIDER_ROUTING } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { ProviderError } from "../llm/errors.js";
import { selectedModels, contextCompressorModel } from "../app/provider-config.js";
import type { NarratorProvider, NarratorResult } from "../llm/narrator-provider.js";
import { passiveResponseAudit, finishPassiveAudits } from "./passive-response-audit.js";

const OUT = resolve("saves/d04-context/final-targeted"), MODEL = "z-ai/glm-5.2";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const write = (name: string, value: unknown) => writeFile(resolve(OUT, name), JSON.stringify(value, null, 2) + "\n", "utf8");
export const CORRECTED_PRIVACY_PROBE = {
  input: 'I ask Brenna, "What can you tell me about Ironbound?"',
  must: ["Only Maren may use/voice the private Ironbound guild fact; Brenna/Gerome have no grant.", "Holder attribution must be clear; voluntary holder disclosure is allowed."],
  may: ["Maren may choose to reveal the fact to the room in her own words; this is not wrong-holder leakage."],
  must_not: ["Brenna/Gerome/Nicco voice or imply prior knowledge of the private fact.", "Narrator independently discloses it as an omniscient fact or silently treats it as globally known.", "Invent new private lore or dictionary mechanics as world facts; Gerome speaks."],
};
const PROTECTED = ["src/turn/lossless-knowledge.ts", "src/turn/lossless-context-compaction.ts", "src/turn/narrator-pack.ts", "src/turn/context-budget.ts", "src/turn/context-compaction.ts", "src/turn/turn-coordinator.ts", "src/app/game-session.ts", "src/app/production.ts", "src/llm/openrouter/minimax-narrator.ts"];
const FILES = [...PROTECTED, "src/turn/prompt-builder.ts", "src/turn/narration-audit.ts", "src/dev/d04-final-live.ts", "src/dev/d04-targeted-live.ts", "src/dev/d04-compaction-bakeoff.ts", "src/dev/passive-response-audit.ts"];
async function fingerprints() { return Object.fromEntries(await Promise.all(FILES.map(async p => [p, sha(await readFile(p, "utf8"))]))); }
export class TargetedPaidBudget {
  #attempts = 0;
  constructor(attempts = 0) { assert.ok(Number.isSafeInteger(attempts) && attempts >= 0 && attempts <= 3); this.#attempts = attempts; }
  get attempts() { return this.#attempts; }
  start() { if (this.#attempts >= 3) throw new ProviderError("configuration_error"); return ++this.#attempts; }
}
/** One separately frozen clarification of the human-grounded/audit-rejected E2E answer. Never repeats privacy/full-suite probes. */
async function clarify() {
  const raw = await readFile(resolve(OUT, "ambiguity-freeze.json"), "utf8"), frozen = JSON.parse(raw) as Awaited<ReturnType<typeof freeze>>;
  assert.equal(sha(raw), JSON.parse(await readFile(resolve(OUT, "ambiguity-freeze.sha256.json"), "utf8")).sha256);
  assert.deepEqual(await fingerprints(), frozen.fingerprints);
  assert.deepEqual(selectedModels(), { narrator: MODEL, controller: "qwen/qwen3.8-flash" }); assert.equal(contextCompressorModel(), undefined);
  const previousSummary = JSON.parse(await readFile(resolve(OUT, "run-summary.json"), "utf8")); assert.equal(previousSummary.attempts, 2);
  const marker = await open(resolve(OUT, "ambiguity-paid-started.json"), "wx"); await marker.writeFile(JSON.stringify({ at: new Date().toISOString(), freeze_sha256: sha(raw) })); await marker.close();
  const budget = new TargetedPaidBudget(previousSummary.attempts), audits: Promise<void>[] = [];
  const production = new MiniMaxNarratorProvider(new OpenRouterClient({ fetch: async (input, init) => {
    const attempt = budget.start(); await write(`transport-${attempt}-request.json`, JSON.parse(String(init?.body)));
    const response = await fetch(input, init); await write(`transport-${attempt}-status.json`, { status: response.status, ok: response.ok });
    audits.push(passiveResponseAudit(response, text => writeFile(resolve(OUT, `transport-${attempt}-response.txt`), text, "utf8"))); return response;
  } }), { model: MODEL });
  let streamRequests = 0, result: NarratorResult | undefined, error: string | undefined;
  const narrator: NarratorProvider = { generate: production.generate.bind(production), async *stream(request) {
    if (++streamRequests > 1) { yield { type: "error", text: "", incomplete: true, error: new ProviderError("configuration_error") }; return; }
    assert.equal(contextHash({ system_prompt: request.system_prompt, messages: request.messages }), frozen.flow.preflight.next_turn.actual_hash);
    for await (const event of production.stream(request)) {
      if (event.type === "completed") { result = event.result; await write("ambiguity-result.json", { id: "E2E-CLARIFICATION", success: true, result }); }
      if (event.type === "error") { error = event.error.code; await write("ambiguity-result.json", { id: "E2E-CLARIFICATION", success: false, error }); }
      yield event;
    }
  } };
  const flow = await runD04Lifecycle(narrator); await write("ambiguity-live-flow.json", flow); await finishPassiveAudits(audits);
  const summary = { attempts: budget.attempts, retries: 0, semantic_rerolls: 0, clarification_calls: 1, flow_generation_requests: streamRequests, prior_attempts: previousSummary.attempts, prior_reported_cost_usd: previousSummary.reported_cost_usd, reported_cost_usd: previousSummary.reported_cost_usd + (result?.cost_usd ?? 0), reported_cost_calls: previousSummary.reported_cost_calls + (result?.cost_usd === undefined ? 0 : 1), e2e_delivered: flow.next_turn.ok, audit: flow.next_turn.audit, error: error ?? null, frozen_sha256: sha(raw) };
  await write("final-run-summary.json", summary); console.log(JSON.stringify(summary));
}
async function freeze() {
  const prior = JSON.parse(await readFile("saves/d04-context/final-live/freeze.json", "utf8"));
  for (const p of PROTECTED) assert.equal(sha(await readFile(p, "utf8")), prior.fingerprints[p], `Protected D-04 implementation changed: ${p}`);
  const original = (await prepareD04BakeoffCases()).B;
  const privacy = (await prepareD04BakeoffCases({ B: CORRECTED_PRIVACY_PROBE.input })).B;
  assert.deepEqual(privacy.narrator_validation_pack.source.units, original.narrator_validation_pack.source.units);
  const best = analyzeLosslessLayouts(privacy.narrator_validation_pack.request).best!;
  assert.deepEqual(best.request, prior.probes.find((p: { id: string }) => p.id === "B4").request, "Privacy generation request changed; only scoring semantics may change");
  const previousResults = JSON.parse(await readFile("saves/d04-context/final-live/recovered-results.json", "utf8"));
  const text: string = previousResults.find((r: { id: string }) => r.id === "E2E").result.text;
  const metadata = { model: "offline-prior-draft-replay", usage: {}, latency: { request_started_at: "offline", headers_ms: null, time_to_first_token_ms: null, completed_at: "offline", elapsed_total_ms: 0 } };
  const offline: NarratorProvider = { async generate() { return { text, ...metadata }; }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
  const flow = await runD04Lifecycle(offline);
  assert.equal(flow.next_turn.ok, true, "Prior factual draft must now pass actual audit and deliver");
  assert.equal(flow.next_turn.audit?.issue_count, 0); assert.equal(flow.next_turn.narrator_calls, 1);
  assert.equal(flow.next_turn.activated, true); assert.equal(flow.next_turn.source_matches, true);
  assert.equal(flow.next_turn.measured_request_matches, true); assert.equal(flow.next_turn.controller_original_facts, true);
  assert.equal(flow.next_turn.controller_representation_leakage, false); assert.equal(flow.next_turn.state_after_turn_unchanged, true);
  assert.equal(flow.next_turn.actual_hash, prior.flow_preflight.next_turn.actual_hash, "Audit fix must not change narrator prompt/request");
  return { at: new Date().toISOString(), schema: LOSSLESS_SCHEMA_VERSION, policy: LOSSLESS_POLICY_VERSION, model: MODEL, provider: NARRATOR_PROVIDER_ROUTING[MODEL], max_output_tokens: 512,
    fingerprints: await fingerprints(), privacy: { ...CORRECTED_PRIVACY_PROBE, source_hash: narratorPackOf(privacy.narrator_validation_pack.request)!.source_hash, layout: best.candidate.layout, budget: best.budget, request: best.request },
    flow: { input: prior.flow_input, preflight: flow, must: ["Auto compaction succeeds below 65% with zero compressor calls; blocked input and READY recovery.", "Current candidate activated on exact measured actual request; original controller authority inputs.", "Correct Ledger 0 Entry 1 keeper/crates answer; actual audited delivery and safe commit."], must_not: ["False paragraph-attribution private_player_fact issue; wrong-holder use or representation corruption.", "Compaction mutates state, stale activation, unauthorized state commit or paid semantic reroll."] },
    acceptance: { target_paid_calls: 2, absolute_max_paid_calls: 3, extra_call_only_for_genuine_ambiguity: true, transport_retries: 0, semantic_rerolls: 0, privacy_must_pass: true, e2e_must_pass: true, no_new_compaction_specific_semantic_corruption: true, aggregate_9_of_10_gate: false, residual_C1: "Retain prior questionable physical-page placement; not a D-04 blocker without compaction causality evidence." } };
}
async function main() {
  await mkdir(OUT, { recursive: true });
  if (process.argv.includes("--freeze-ambiguity")) {
    const frozen = await freeze(), original = JSON.parse(await readFile(resolve(OUT, "freeze.json"), "utf8"));
    assert.deepEqual(frozen.privacy, original.privacy); assert.deepEqual(frozen.acceptance, original.acceptance);
    assert.deepEqual(frozen.flow.must, original.flow.must); assert.deepEqual(frozen.flow.must_not, original.flow.must_not);
    assert.deepEqual(frozen.flow.preflight.next_turn.actual_request, original.flow.preflight.next_turn.actual_request);
    const previous = JSON.parse(await readFile(resolve(OUT, "results.json"), "utf8"));
    const text: string = previous.find((r: { id: string }) => r.id === "E2E").result.text;
    const metadata = { model: "offline-targeted-draft-replay", usage: {}, latency: { request_started_at: "offline", headers_ms: null, time_to_first_token_ms: null, completed_at: "offline", elapsed_total_ms: 0 } };
    const replay: NarratorProvider = { async generate() { return { text, ...metadata }; }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
    const proof = await runD04Lifecycle(replay); assert.equal(proof.next_turn.ok, true); assert.equal(proof.next_turn.audit?.issue_count, 0);
    await write("ambiguity-offline-replay.json", proof);
    const raw = JSON.stringify(frozen, null, 2) + "\n", file = await open(resolve(OUT, "ambiguity-freeze.json"), "wx"); await file.writeFile(raw, "utf8"); await file.close();
    await write("ambiguity-freeze.sha256.json", { sha256: sha(raw) }); console.log(JSON.stringify({ ambiguity_frozen: true, previous_live_draft_now_delivered: true, sha256: sha(raw), privacy_criteria_unchanged: true, narrator_request_unchanged: true })); return;
  }
  if (process.argv.includes("--clarify")) { await clarify(); return; }
  if (process.argv.includes("--freeze")) {
    const frozen = await freeze(), raw = JSON.stringify(frozen, null, 2) + "\n";
    const file = await open(resolve(OUT, "freeze.json"), "wx"); await file.writeFile(raw, "utf8"); await file.close();
    await write("freeze.sha256.json", { sha256: sha(raw) });
    console.log(JSON.stringify({ frozen: true, sha256: sha(raw), privacy_layout: frozen.privacy.layout, previous_draft_now_delivered: frozen.flow.preflight.next_turn.ok, audit: frozen.flow.preflight.next_turn.audit, before: frozen.flow.preflight.maintenance.before, after: frozen.flow.preflight.maintenance.after })); return;
  }
  if (!process.argv.includes("--live")) throw new Error("Use --freeze or --live; this harness never repeats the full suite");
  const raw = await readFile(resolve(OUT, "freeze.json"), "utf8"), frozen = JSON.parse(raw) as Awaited<ReturnType<typeof freeze>>;
  assert.equal(sha(raw), JSON.parse(await readFile(resolve(OUT, "freeze.sha256.json"), "utf8")).sha256);
  assert.deepEqual(await fingerprints(), frozen.fingerprints);
  assert.deepEqual(selectedModels(), { narrator: MODEL, controller: "qwen/qwen3.8-flash" }); assert.equal(contextCompressorModel(), undefined);
  assert.ok(process.env.OPENROUTER_API_KEY?.trim(), "Narrator key missing");
  const marker = await open(resolve(OUT, "paid-run-started.json"), "wx"); await marker.writeFile(JSON.stringify({ at: new Date().toISOString(), freeze_sha256: sha(raw) })); await marker.close();
  const budget = new TargetedPaidBudget(), audits: Promise<void>[] = [];
  const production = new MiniMaxNarratorProvider(new OpenRouterClient({ fetch: async (input, init) => {
    const attempt = budget.start(); await write(`transport-${attempt}-request.json`, JSON.parse(String(init?.body)));
    const response = await fetch(input, init); await write(`transport-${attempt}-status.json`, { status: response.status, ok: response.ok });
    audits.push(passiveResponseAudit(response, text => writeFile(resolve(OUT, `transport-${attempt}-response.txt`), text, "utf8"))); return response;
  } }), { model: MODEL });
  const results: { id: string; success: boolean; result?: NarratorResult; error?: string; elapsed_ms: number }[] = [];
  let started = performance.now();
  try { results.push({ id: "PRIVACY", success: true, result: await production.generate(frozen.privacy.request), elapsed_ms: performance.now() - started }); }
  catch (error) { results.push({ id: "PRIVACY", success: false, error: error instanceof ProviderError ? error.code : "harness_error", elapsed_ms: performance.now() - started }); }
  await write("results.json", results); console.log(JSON.stringify({ id: "PRIVACY", success: results[0]!.success, attempts: budget.attempts }));
  let flowRequests = 0;
  const monitored: NarratorProvider = { generate: production.generate.bind(production), async *stream(request) {
    // Audit revisions are observed safely, but not paid automatically. Third call requires a separately reviewed ambiguity.
    if (++flowRequests > 1) { yield { type: "error", text: "", incomplete: true, error: new ProviderError("configuration_error") }; return; }
    assert.equal(contextHash({ system_prompt: request.system_prompt, messages: request.messages }), frozen.flow.preflight.next_turn.actual_hash);
    started = performance.now();
    for await (const event of production.stream(request)) {
      if (event.type === "completed") { results.push({ id: "E2E", success: true, result: event.result, elapsed_ms: performance.now() - started }); await write("results.json", results); }
      if (event.type === "error") { results.push({ id: "E2E", success: false, error: event.error.code, elapsed_ms: performance.now() - started }); await write("results.json", results); }
      yield event;
    }
  } };
  const flow = await runD04Lifecycle(monitored); await write("live-flow.json", flow); await finishPassiveAudits(audits);
  const summary = { attempts: budget.attempts, retries: 0, semantic_rerolls: 0, flow_generation_requests: flowRequests, provider_compressor_calls: 0, reported_cost_usd: results.reduce((sum, r) => sum + (r.result?.cost_usd ?? 0), 0), reported_cost_calls: results.filter(r => r.result?.cost_usd !== undefined).length, e2e_delivered: flow.next_turn.ok, audit: flow.next_turn.audit, frozen_sha256: sha(raw), manual_semantic_review_required: true };
  await write("run-summary.json", summary); console.log(JSON.stringify(summary));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
