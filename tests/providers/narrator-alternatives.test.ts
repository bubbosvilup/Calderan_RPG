import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ALTERNATE_NARRATOR_MODELS, NarratorAlternatives, observePreparedNarrator } from "../../src/app/narrator-alternatives.js";
import { MiniMaxNarratorProvider, DEFAULT_NARRATOR_MODEL, NARRATOR_PROVIDER_ROUTING } from "../../src/llm/openrouter/minimax-narrator.js";
import { OpenRouterClient } from "../../src/llm/openrouter/client.js";
import { NARRATOR_OUTPUT_TOKENS } from "../../src/app/provider-config.js";
import type { GenerationRequest } from "../../src/llm/types.js";
import { mockNarrator } from "../support/turn-fixtures.js";
import { sourceFiles } from "../support/source-paths.js";

test("comparison allowlist contains exactly the six explicit models", () => {
  assert.deepEqual(ALTERNATE_NARRATOR_MODELS, [
    { label: "MiMo-V2.6-Flash", id: "xiaomi/mimo-v2.6-flash" },
    { label: "Space Bunny Alpha", id: "stealth/space-bunny-alpha" },
    { label: "GPT-5.6 Sol", id: "openai/gpt-5.6-sol" },
    { label: "DeepSeek V4 Flash 0731", id: "deepseek/deepseek-v4-flash-0731" },
    { label: "Hy4 preview", id: "tencent/hy4-preview" },
    { label: "GLM 5.3 Flash", id: "z-ai/glm-5.3-flash" },
  ]);
});

test("frozen prepared requests survive later inputs; alternatives coexist, replace, fail safely and retry once", async () => {
  const requests: GenerationRequest[] = [], models: string[] = [];
  let fail = false;
  const comparisons = new NarratorAlternatives(model => ({ generate: async request => {
    models.push(model); requests.push(request);
    if (fail) throw new Error("PRIVATE_API_KEY_AND_REQUEST");
    return { ...(await mockNarrator(`Alternative ${requests.length}`).generate(request)), model, provider: "mock-provider" };
  } }));
  const original = { system_prompt: "P1/P3/P6 exact\n*format*", messages: [{ role: "assistant" as const, content: '"Historic speech."' }, { role: "user" as const, content: "Original action, opaque ref n001" }], max_output_tokens: NARRATOR_OUTPUT_TOKENS };
  const expected = structuredClone(original);
  comparisons.begin(); comparisons.capture(original); assert.equal(comparisons.finalize("turn-1"), true);
  original.messages[1]!.content = "Later state";
  comparisons.capture({ system_prompt: "later", messages: [] }); comparisons.finalize("turn-2");
  const first = ALTERNATE_NARRATOR_MODELS[0]!.id, second = ALTERNATE_NARRATOR_MODELS[5]!.id;
  assert.equal((await comparisons.regenerate("turn-1", "arbitrary/model")).ok, false);
  assert.equal((await comparisons.regenerate("opening", first)).ok, false);
  assert.equal(requests.length, 0);
  await comparisons.regenerate("turn-1", first); await comparisons.regenerate("turn-1", second);
  assert.deepEqual(comparisons.results("turn-1").map(result => result.model), [first, second]);
  await comparisons.regenerate("turn-1", first);
  assert.equal(comparisons.results("turn-1").length, 2);
  assert.equal(comparisons.results("turn-1")[0]!.text, "Alternative 3");
  fail = true;
  const before = comparisons.results("turn-1");
  const failed = await comparisons.regenerate("turn-1", first);
  assert.equal(failed.ok, false); assert.ok(!JSON.stringify(failed).includes("PRIVATE"));
  assert.deepEqual(comparisons.results("turn-1"), before);
  fail = false; await comparisons.regenerate("turn-1", first);
  assert.equal(requests.length, 5); assert.deepEqual(models, [first, second, first, first, first]);
  for (const request of requests) { assert.deepEqual(request, expected); assert.ok(Object.isFrozen(request)); assert.ok(Object.isFrozen(request.messages)); }
});

test("bounded retention and duplicate in-flight regeneration never multiply calls", async () => {
  let release!: () => void, calls = 0;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const comparisons = new NarratorAlternatives(() => ({ generate: async request => { calls++; await wait; return mockNarrator("mock").generate(request); } }), 1);
  comparisons.capture({ system_prompt: "s", messages: [] }); comparisons.finalize("one");
  const model = ALTERNATE_NARRATOR_MODELS[0]!.id;
  const pending = comparisons.regenerate("one", model);
  assert.equal((await comparisons.regenerate("one", model)).ok, false); assert.equal(calls, 1);
  release(); await pending;
  comparisons.begin(); assert.equal(comparisons.finalize("failed"), false);
  comparisons.capture({ system_prompt: "next", messages: [] }); comparisons.finalize("two");
  assert.equal(comparisons.has("one"), false); assert.deepEqual(comparisons.results("one"), []);
});

test("a finalized revised narration retains its last prepared request and failed turns cannot reuse a stale capture", async () => {
  let reused: GenerationRequest | undefined;
  const comparisons = new NarratorAlternatives(() => mockNarrator("comparison", request => { reused = request; }));
  comparisons.begin(); comparisons.capture({ system_prompt: "contract", messages: [{ role: "user", content: "initial" }], max_output_tokens: 640 });
  const revision = { system_prompt: "contract", messages: [{ role: "user" as const, content: "revision with identity masking already applied" }], max_output_tokens: 640 };
  comparisons.capture(revision); comparisons.finalize("revision-turn");
  await comparisons.regenerate("revision-turn", ALTERNATE_NARRATOR_MODELS[0]!.id);
  assert.deepEqual(reused, revision);
  comparisons.capture({ system_prompt: "failed draft", messages: [] });
  comparisons.begin(); assert.equal(comparisons.finalize("no-generated-request"), false);
});

test("an alternate provider rejection is sanitized with no automatic parameter changes or retries", async () => {
  let calls = 0;
  const client = new OpenRouterClient({ api_key: () => "PRIVATE_KEY", fetch: async () => {
    calls++; return new Response('{"error":{"message":"PRIVATE_KEY unsupported parameter"}}', { status: 400 });
  } });
  const comparisons = new NarratorAlternatives(model => new MiniMaxNarratorProvider(client, { model, provider: null }));
  comparisons.capture({ system_prompt: "PRIVATE_REQUEST", messages: [], max_output_tokens: 640 }); comparisons.finalize("turn");
  const result = await comparisons.regenerate("turn", ALTERNATE_NARRATOR_MODELS[0]!.id);
  assert.equal(result.ok, false); assert.equal(calls, 1); assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  if (!result.ok) { assert.equal(result.failure_code, "invalid_provider_response"); assert.equal(result.failure_class, "http_nonretryable"); }
});

test("actual adapter preserves prompt/budget/reasoning; only model and routing differ, with backend-only key", async () => {
  const bodies: any[] = [], headers: Headers[] = [];
  const client = new OpenRouterClient({ api_key: () => "SERVER_ONLY_KEY", fetch: async (_url, init) => {
    bodies.push(JSON.parse(String(init!.body))); headers.push(new Headers(init!.headers));
    return new Response('data: {"model":"mock-actual","provider":"mock-provider","choices":[{"delta":{"content":"Story"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
  } });
  let captured: GenerationRequest | undefined;
  const request = { system_prompt: "Exact P1/P3/P6\n", messages: [{ role: "user" as const, content: "Original action" }] };
  await observePreparedNarrator(new MiniMaxNarratorProvider(client, { max_output_tokens: NARRATOR_OUTPUT_TOKENS }), envelope => { captured = envelope; }, NARRATOR_OUTPUT_TOKENS).generate(request);
  assert.equal(DEFAULT_NARRATOR_MODEL, "z-ai/glm-5.2");
  assert.deepEqual(bodies[0].provider, { order: ["z-ai/fp8"], allow_fallbacks: false });
  assert.deepEqual(NARRATOR_PROVIDER_ROUTING[DEFAULT_NARRATOR_MODEL], bodies[0].provider);
  for (const model of ALTERNATE_NARRATOR_MODELS) await new MiniMaxNarratorProvider(client, { model: model.id, provider: null, disable_reasoning: true }).generate(captured!);
  const { model: productionModel, provider: pinned, ...production } = bodies[0];
  for (const [index, body] of bodies.slice(1).entries()) {
    const { model, ...rest } = body;
    assert.equal(model, ALTERNATE_NARRATOR_MODELS[index]!.id); assert.deepEqual(rest, production);
    assert.ok(!JSON.stringify(body).includes("SERVER_ONLY_KEY"));
  }
  assert.equal(bodies.length, 7);
  for (const header of headers) assert.equal(header.get("Authorization"), "Bearer SERVER_ONLY_KEY");
  // The browser bundle's sources hold no key, prompt or provider address; comparisons go through the local server route only.
  for (const file of sourceFiles("src/ui-client", f => /\.(ts|tsx)$/.test(f) && !/\.test\.|vite\.config|node_modules/.test(f))) {
    assert.ok(!/process\.env|system_prompt|Authorization|openrouter\.ai/.test(await readFile(file, "utf8")), file);
  }
});
