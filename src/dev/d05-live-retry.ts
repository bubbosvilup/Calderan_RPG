/** One pre-dispatch 429, then one production controller dispatch. No retry-policy overrides. */
import assert from "node:assert/strict";
import { mkdir, open, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { turnFixture } from "./turn-fixture.js";
import { passiveResponseAudit, finishPassiveAudits } from "./passive-response-audit.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { ProviderError } from "../llm/errors.js";
import { DEFAULT_RETRY_POLICY } from "../llm/retry.js";
import { selectedModels } from "../app/provider-config.js";
import type { ControllerResult, StateControllerProvider } from "../llm/state-controller-provider.js";
import type { NarratorProvider } from "../llm/narrator-provider.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import type { TurnEvent } from "../turn/turn-types.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
export const INPUT = '/tell campaign_fact_bridge_closed to brenna';
export const NARRATION = 'Nicco tells Brenna that the eastern bridge is closed.';
export const COMMAND = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } } as const;
const metadata = { model: "frozen-script", usage: {}, latency: { request_started_at: "2026-10-03T00:00:00Z", completed_at: "2026-10-03T00:00:00Z", headers_ms: 0, time_to_first_token_ms: 0, elapsed_total_ms: 0 } };
const narrator: NarratorProvider = { async generate() { return { text: NARRATION, ...metadata }; }, async *stream() { yield { type: "text_delta", text: NARRATION }; yield { type: "completed", result: { text: NARRATION, ...metadata } }; } };
function coordinator(f: ReturnType<typeof turnFixture>, controller: StateControllerProvider, records: TurnDiagnostics[]) {
  const service = new RetrievalService(f.world);
  return new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { diagnostics_sink: r => records.push(structuredClone(r) as TurnDiagnostics) });
}
export async function runRetryCase(downstream: typeof fetch, api_key?: () => string | undefined) {
  const f = turnFixture(), before = f.campaign.exportSnapshot(), records: TurnDiagnostics[] = [], events: TurnEvent[] = [];
  let transport_attempts = 0, dispatches = 0, commits = 0, successful_commits = 0, accepted: ControllerResult | undefined;
  const bodies: string[] = [], attempts: { attempt: number; started_ms: number; elapsed_ms: number; outcome: string }[] = [];
  const failed_states: unknown[] = [], started = performance.now();
  const originalCommit = f.campaign.commit.bind(f.campaign);
  f.campaign.commit = receipt => { commits++; const result = originalCommit(receipt); successful_commits++; return result; };
  const client = new OpenRouterClient({ ...(api_key ? { api_key } : {}), fetch: async (input, init) => {
    transport_attempts++; bodies.push(String(init?.body));
    assert.equal(transport_attempts <= 2, true);
    assert.deepEqual(f.campaign.exportSnapshot(), before, "provider attempts must not mutate authoritative state");
    assert.equal(commits, 0);
    if (transport_attempts === 1) return new Response('{"error":{"code":429,"message":"D05 controlled pre-dispatch transient"}}', { status: 429 });
    assert.equal(bodies[1], bodies[0], "retry retains exact production prompt/schema/body");
    dispatches++;
    return downstream(input, init);
  } });
  const production = new OpenRouterStateControllerProvider(client);
  const controller: StateControllerProvider = { async propose(request) {
    const start = performance.now(), attempt = attempts.length + 1;
    try { const result = await production.propose(request); accepted = result; attempts.push({ attempt, started_ms: start - started, elapsed_ms: performance.now() - start, outcome: "success" }); return result; }
    catch (e) { failed_states.push(f.campaign.exportSnapshot()); attempts.push({ attempt, started_ms: start - started, elapsed_ms: performance.now() - start, outcome: e instanceof ProviderError ? e.code : "local_error" }); throw e; }
  } };
  for await (const event of coordinator(f, controller, records).runTurn({ campaign: f.campaign, player_input: INPUT })) events.push(event);
  const elapsed_ms = performance.now() - started, after = f.campaign.exportSnapshot();
  const summary = { transport_attempts, dispatches, attempts, observed_backoff_ms: attempts[1] ? attempts[1].started_ms - attempts[0]!.started_ms - attempts[0]!.elapsed_ms : null,
    elapsed_ms, accepted, authorization_passes: events.filter(e => e.type === "state_proposed").length, commits, successful_commits, before, after, failed_states, records, events, bodies };
  return summary;
}
export async function verifyCase(s: Awaited<ReturnType<typeof runRetryCase>>) {
  assert.equal(s.events.at(-1)?.type, "turn_completed");
  assert.deepEqual(s.attempts.map(a => a.outcome), ["rate_limited", "success"]);
  assert.deepEqual([s.transport_attempts, s.dispatches, s.authorization_passes, s.commits, s.successful_commits], [2, 1, 1, 1, 1]);
  assert.equal(s.accepted?.commands.length, 1);
  assert.equal(s.accepted?.commands[0]?.kind, "set_knowledge");
  const command = s.accepted!.commands[0]!;
  assert.ok(command.kind === "set_knowledge");
  assert.equal(command.knowledge.character_id, "brenna"); assert.equal(command.knowledge.fact_id, "campaign_fact_bridge_closed"); assert.equal(command.knowledge.status, "knows");
  const done = s.events.at(-1)!;
  assert.ok(done.type === "turn_completed"); assert.equal(done.result.authorized_commands.length, 1);
  assert.equal(s.after.revision, s.before.revision + 1);
  assert.equal(s.after.knowledge.length, s.before.knowledge.length + 1);
  const edges = s.after.knowledge.filter(k => k.character_id === "brenna" && k.fact_id === "campaign_fact_bridge_closed");
  assert.equal(edges.length, 1); assert.equal(edges[0]!.status, "knows");
  for (const failed of s.failed_states) assert.deepEqual(failed, s.before);
  const control = turnFixture(), controlRecords: TurnDiagnostics[] = [];
  for await (const _ of coordinator(control, { async propose() { return s.accepted!; } }, controlRecords).runTurn({ campaign: control.campaign, player_input: INPUT })) { /* offline replay of the one accepted response */ }
  assert.deepEqual(s.after, control.campaign.exportSnapshot(), "retried state equals single-success control including provenance");
  return { duplicate_effects: 0, single_success_control_equal: true };
}
async function main() {
  assert.deepEqual(selectedModels(), { narrator: "z-ai/glm-5.2", controller: "qwen/qwen3.8-flash" });
  const out = resolve("saves/d05-retry"); await mkdir(out, { recursive: true });
  const write = (name: string, value: unknown) => writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  const protectedFiles = ["src/llm/retry.ts", "src/llm/openrouter/client.ts", "src/llm/openrouter/state-controller.ts", "src/turn/turn-coordinator.ts", "src/turn/stages/controller.ts"];
  const freeze = { input: INPUT, narration: NARRATION, expected_command: COMMAND, before: turnFixture().campaign.exportSnapshot(), retry_policy: DEFAULT_RETRY_POLICY,
    production_controller: "qwen/qwen3.8-flash", production_narrator: "z-ai/glm-5.2", sources: Object.fromEntries(await Promise.all(protectedFiles.map(async p => [p, await readFile(p, "utf8")]))), expected: { revision_delta: 1, edges_added: 1, commits: 1, duplicate_effects: 0 } };
  const marker = await open(resolve(out, "paid-started.json"), "wx"); await marker.writeFile(JSON.stringify({ at: new Date().toISOString() })); await marker.close();
  await write("ground-truth.json", freeze);
  const audits: Promise<void>[] = [];
  const summary = await runRetryCase(async (input, init) => {
    await write("live-request.json", JSON.parse(String(init?.body)));
    const response = await fetch(input, init); await write("live-status.json", { status: response.status });
    audits.push(passiveResponseAudit(response, raw => writeFile(resolve(out, "live-response.txt"), raw, "utf8"))); return response;
  });
  await write("run-summary.json", summary); await finishPassiveAudits(audits);
  const verdict = await verifyCase(summary); await write("verdict.json", verdict);
  console.log(JSON.stringify({ ...verdict, attempts: summary.attempts, dispatches: summary.dispatches, observed_backoff_ms: summary.observed_backoff_ms, elapsed_ms: summary.elapsed_ms, accepted: summary.accepted, before_revision: summary.before.revision, after_revision: summary.after.revision }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
