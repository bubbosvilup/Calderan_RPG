import test from "node:test";
import assert from "node:assert/strict";
import type { TurnOutcome } from "../../src/app/game-session.js";
import { recordOpenRouterWire, submitWithTransientRetry, TRANSIENT_PROVIDER_CODES, usageTotals } from "../../src/dev/live/support.js";

/** The shared live-certification support (Repository Cleanup E) is exercised offline: fake sessions and a fake fetch, no provider call. */
const failure = (provider_code: string, turn_state_changed: boolean) => ({ ok: false, error: { provider_code, turn_state_changed } }) as unknown as TurnOutcome;
const success = { ok: true } as unknown as TurnOutcome;
const session = (...outcomes: TurnOutcome[]) => {
  const inputs: string[] = [];
  return { inputs, submitPlayerInput: async (input: string) => { inputs.push(input); return outcomes[Math.min(inputs.length - 1, outcomes.length - 1)]!; } };
};

test("live support: one retry, only for a transient provider failure that changed no state", async () => {
  assert.deepEqual([...TRANSIENT_PROVIDER_CODES].sort(), ["network_error", "provider_unavailable", "rate_limited", "timeout"]);
  const ok = session(success);
  assert.equal((await submitWithTransientRetry(ok, "hello")).attempts, 1);
  const retried = session(failure("timeout", false), success);
  const r = await submitWithTransientRetry(retried, "hello");
  assert.equal(r.attempts, 2); assert.equal(r.outcome.ok, true); assert.deepEqual(retried.inputs, ["hello", "hello"]);
  const twice = session(failure("rate_limited", false));
  assert.equal((await submitWithTransientRetry(twice, "x")).attempts, 2, "never a second retry");
  for (const s of [session(failure("timeout", true)), session(failure("invalid_output", false))]) {
    const out = await submitWithTransientRetry(s, "x");
    assert.equal(out.attempts, 1); assert.equal(out.outcome.ok, false);
  }
});

test("live support: usage totals sum every token and cost figure in a trace", () => {
  assert.deepEqual(usageTotals(undefined), { tokens: 0, cost_usd: 0 });
  assert.deepEqual(usageTotals({ narrator: { total_tokens: 10, cost: 0.5 }, controller: [{ total_tokens: 5, cost_usd: 0.25 }] }), { tokens: 15, cost_usd: 0.75 });
});

test("live support: the wire recorder records OpenRouter requests and passes every other request through", async () => {
  const realFetch = globalThis.fetch, seen: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => { seen.push(String(input)); return new Response("{}", { status: 202 }); }) as typeof fetch;
  try {
    const wire = recordOpenRouterWire();
    await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m/one" }) });
    await fetch("https://example.invalid/other", { method: "POST", body: "{}" });
    await fetch("https://openrouter.ai/api/v1/models");
    assert.deepEqual(wire, [{ n: 1, model: "m/one", status: 202 }]);
    assert.equal(seen.length, 3);
  } finally { globalThis.fetch = realFetch; }
});
