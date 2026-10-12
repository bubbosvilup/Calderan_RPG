import test from "node:test";
import assert from "node:assert/strict";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { MiniMaxNarratorProvider, DEFAULT_NARRATOR_OUTPUT_TOKENS } from "../src/llm/openrouter/minimax-narrator.js";
import { NARRATOR_OUTPUT_TOKENS, NARRATOR_RECOVERY_OUTPUT_TOKENS } from "../src/app/provider-config.js";
import { ProviderError } from "../src/llm/errors.js";
import type { NarratorStreamEvent } from "../src/llm/narrator-provider.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import { TURN_PROGRESS_PHASES } from "../src/turn/turn-types.js";
import { collect } from "./turn-fixtures.js";
import { NARRATION, coordinatorWith, countingController, stepNarrator } from "./block4-fixtures.js";

/** An SSE body the OpenRouter client accepts: one text chunk, one finish chunk, one usage chunk, [DONE]. */
function sse(text: string, finish: string | null, usage = { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }): Response {
  const chunk = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const body = chunk({ id: "gen-abc123", provider: "Z.AI", model: "z-ai/glm-5.2", choices: [{ delta: { content: text } }] })
    + (finish === null ? "" : chunk({ id: "gen-abc123", model: "z-ai/glm-5.2", choices: [{ delta: {}, finish_reason: finish }] }))
    + chunk({ id: "gen-abc123", model: "z-ai/glm-5.2", choices: [], usage: { ...usage, cost: 0.0012 } }) + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
function adapter(respond: (body: Record<string, unknown>) => Response, bodies: Record<string, unknown>[] = []) {
  const client = new OpenRouterClient({ api_key: () => "fixture-key", fetch: async (_url, init) => { const body = JSON.parse(String(init!.body)); bodies.push(body); return respond(body); } });
  return new MiniMaxNarratorProvider(client, { max_output_tokens: NARRATOR_OUTPUT_TOKENS });
}
async function drain(provider: MiniMaxNarratorProvider, request: Parameters<MiniMaxNarratorProvider["stream"]>[0]): Promise<NarratorStreamEvent[]> { return collect(provider.stream(request)); }
const request = { system_prompt: "system", messages: [{ role: "user" as const, content: "hello" }] };

test("PLUMBING: the production Narrator cap is 768 and the recovery cap is 1024", async () => {
  assert.equal(NARRATOR_OUTPUT_TOKENS, 768); assert.equal(DEFAULT_NARRATOR_OUTPUT_TOKENS, 768); assert.equal(NARRATOR_RECOVERY_OUTPUT_TOKENS, 1024);
  const bodies: Record<string, unknown>[] = [];
  await drain(adapter(() => sse("ok.", "stop"), bodies), request);
  await drain(adapter(() => sse("ok.", "stop"), bodies), { ...request, max_output_tokens: NARRATOR_RECOVERY_OUTPUT_TOKENS });
  assert.deepEqual(bodies.map(b => b.max_tokens), [768, 1024]);
});

test("PLUMBING: finish_reason, tokens, model, provider and route are preserved in the provider result", async () => {
  const events = await drain(adapter(() => sse("A complete answer.", "stop")), request);
  const done = events.find(e => e.type === "completed")!;
  assert.equal(done.type, "completed");
  if (done.type !== "completed") return;
  assert.equal(done.result.finish_reason, "stop"); assert.equal(done.result.usage.completion_tokens, 40);
  assert.equal(done.result.model, "z-ai/glm-5.2"); assert.equal(done.result.provider, "Z.AI"); assert.equal(done.result.route, "z-ai/fp8");
  assert.equal(done.result.max_output_tokens, 768); assert.equal(done.result.generation_id, "gen-abc123"); assert.equal(done.result.cost_usd, 0.0012);
});

test("PLUMBING: finish_reason=length is a completed truncation when the turn layer asks for it, and the strict error otherwise", async () => {
  const lenient = await drain(adapter(() => sse("Half a sent", "length")), { ...request, accept_truncated: true });
  const done = lenient.find(e => e.type === "completed");
  assert.ok(done && done.type === "completed"); if (done?.type === "completed") { assert.equal(done.result.finish_reason, "length"); assert.equal(done.result.text, "Half a sent"); }
  const strict = await drain(adapter(() => sse("Half a sent", "length")), request);
  const error = strict.find(e => e.type === "error");
  assert.ok(error && error.type === "error"); if (error?.type === "error") { assert.equal(error.error.code, "invalid_provider_response"); assert.equal(error.error.failure_class, "finish_reason_length"); }
});

test("PLUMBING: refusal, malformed and missing finish reasons are never confused with truncation", async () => {
  const code = async (finish: string | null) => {
    const events = await drain(adapter(() => sse("text", finish)), { ...request, accept_truncated: true });
    const error = events.find(e => e.type === "error"); assert.ok(error && error.type === "error"); return error.type === "error" ? [error.error.code, error.error.failure_class ?? null] : [];
  };
  const refusal = await code("content_filter"); assert.equal(refusal[0], "model_refusal"); assert.notEqual(refusal[1], "finish_reason_length");
  assert.equal((await code("tool_calls"))[0], "invalid_provider_response");
  assert.notEqual((await code("tool_calls"))[1], "finish_reason_length");
  assert.equal((await code(null))[0], "invalid_provider_response"); // no finish reason at all
});

test("PLUMBING: the turn trace records every logical generation and physical attempt with finish reason, tokens, model, provider and route", async () => {
  const records: TurnDiagnostics[] = [];
  const f = coordinatorWith(stepNarrator([{ text: NARRATION, tokens: 33 }]), countingController(), { diagnostics: r => records.push(r as TurnDiagnostics) });
  const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "Hello, Brenna." }));
  assert.equal(events.at(-1)!.type, "turn_completed");
  const g = records.at(-1)!.narrator_generation!;
  assert.equal(g.logical_generations, 1); assert.equal(g.physical_attempts, 1); assert.equal(g.max_physical_attempts, 3); assert.equal(g.max_logical_generations, 2);
  assert.deepEqual(g.truncation, { detected: false, recovery_attempted: false, recovery_result: "not_needed" });
  const a = g.attempts[0]!;
  assert.equal(a.generation, "primary"); assert.equal(a.outcome, "stop"); assert.equal(a.finish_reason, "stop"); assert.equal(a.completion_tokens, 33);
  assert.equal(a.model, "offline-mock"); assert.equal(a.provider, "test-provider"); assert.equal(a.route, "test-route"); assert.equal(a.index, 1);
});

test("PLUMBING: turn_key and expected_revision reach the turn layer; a stale expected_revision is rejected before any provider call", async () => {
  const records: TurnDiagnostics[] = [], n = stepNarrator([{ text: NARRATION }]), c = countingController();
  const f = coordinatorWith(n, c, { diagnostics: r => records.push(r as TurnDiagnostics) });
  const ok = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "Hello, Brenna.", turn_key: "key_plumbing_001", expected_revision: f.campaign.revision }));
  assert.deepEqual(ok[0], { type: "turn_started", base_revision: f.campaign.revision, turn_key: "key_plumbing_001" });
  assert.equal(records.at(-1)!.turn_key, "key_plumbing_001");
  const before = f.campaign.exportSnapshot(), calls = [n.calls(), c.calls()];
  const stale = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "Hello again.", turn_key: "key_plumbing_002", expected_revision: f.campaign.revision + 7 }));
  const last = stale.at(-1)!; assert.equal(last.type, "turn_failed"); if (last.type === "turn_failed") assert.equal(last.code, "stale_turn");
  assert.deepEqual([n.calls(), c.calls()], calls, "zero Narrator and zero Controller calls"); assert.equal(f.campaign.exportSnapshot(), before);
});

test("PLUMBING: progress events are a closed status vocabulary and never carry Narrator prose", async () => {
  const f = coordinatorWith(stepNarrator([{ text: NARRATION }]));
  const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "Hello, Brenna." }));
  const progress = events.filter(e => e.type === "turn_progress");
  assert.deepEqual(progress.map(e => (e as { phase: string }).phase), [...TURN_PROGRESS_PHASES]);
  for (const e of progress) assert.deepEqual(Object.keys(e).sort(), ["phase", "type"]);
  assert.ok(!JSON.stringify(progress).includes("Brenna"));
  // Prose appears in exactly one event, after the commit.
  const withProse = events.map((e, i) => [e, i] as const).filter(([e]) => JSON.stringify(e).includes(NARRATION));
  assert.deepEqual(withProse.map(([e]) => e.type).sort(), ["narration_completed", "state_committed", "turn_completed"].sort());
  assert.ok(events.findIndex(e => e.type === "state_committed") < events.findIndex(e => e.type === "narration_completed"));
});
void ProviderError;
