import test from "node:test";
import assert from "node:assert/strict";
import { COMMAND, NARRATION, runRetryCase, verifyCase } from "../src/dev/d05-live-retry.js";

test("D05 production transport: pre-dispatch 429, unchanged DEFAULT policy, one knowledge effect equal to single-success control", async () => {
  const result = await runRetryCase(async () => new Response(JSON.stringify({ model: "qwen/qwen3.8-flash", choices: [{ message: { content: JSON.stringify({ commands: [{ command: COMMAND, evidence_quote: NARRATION }] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 } })), () => "offline-key");
  assert.deepEqual(await verifyCase(result), { duplicate_effects: 0, single_success_control_equal: true });
  assert.equal(result.records[0]!.provider_attempts!.controller!.recovered, true);
});

test("D05 production transport: retry exhaustion has no authorization or authoritative effects", async () => {
  const result = await runRetryCase(async () => new Response("{}", { status: 503 }), () => "offline-key");
  assert.deepEqual(result.attempts.map(a => a.outcome), ["rate_limited", "provider_unavailable"]);
  assert.deepEqual(result.after, result.before);
  assert.deepEqual([result.authorization_passes, result.commits, result.successful_commits], [0, 0, 0]);
  assert.equal(result.events.at(-1)?.type, "turn_failed");
});
