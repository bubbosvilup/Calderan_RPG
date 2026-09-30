import test from "node:test";
import assert from "node:assert/strict";
import { OpenRouterClient, type TransportRequest } from "../src/llm/openrouter/client.js";
import { MiniMaxNarratorProvider } from "../src/llm/openrouter/minimax-narrator.js";
import { DeepSeekStateControllerProvider, CONTROLLER_POLICY } from "../src/llm/openrouter/deepseek-controller.js";
import { parseControllerProposal } from "../src/llm/controller-schema.js";
import { ProviderError } from "../src/llm/errors.js";
import { LLM_SCENARIOS } from "../src/dev/llm-scenarios.js";

const fakeKey = "fake-key-never-real";
async function collectEvents<T>(source: AsyncIterable<T>): Promise<T[]> { const result: T[] = []; for await (const event of source) result.push(event); return result; }
const request = { system_prompt: "The user controls Nicco's actions and dialogue.", messages: [{ role: "user" as const, content: "Hello" }, { role: "assistant" as const, content: "Welcome" }] };
const body: TransportRequest = { model: "test-model", messages: [], max_tokens: 20 };
const counts = { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 };
const completion = (content = "Hello", extras = {}) => ({ choices: [{ message: { content }, finish_reason: "stop" }], usage: counts, ...extras });
const event = (content: string, finish_reason: string | null = null) => `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason }] })}\r\n\r\n`;
const ending = event("", "stop") + `data: ${JSON.stringify({ choices: [], usage: counts })}\n\ndata: [DONE]\n\n`;
function sse(chunks: string[], fail = false): Response {
  let index = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (index < chunks.length) controller.enqueue(new TextEncoder().encode(chunks[index++]!));
    else if (fail) controller.error(new Error(`upstream ${fakeKey}`)); else controller.close();
  } }));
}
function client(response: () => Response, inspect?: (url: string, init: RequestInit) => void): OpenRouterClient {
  return new OpenRouterClient({ api_key: () => fakeKey, fetch: (async (url, init) => { inspect?.(String(url), init!); return response(); }) as typeof fetch });
}
async function collect(c: OpenRouterClient, stream = false, signal?: AbortSignal) { return collectEvents(c.request(body, stream, 1000, signal)); }
function isCode(code: string) { return (error: unknown) => error instanceof ProviderError && error.code === code && !JSON.stringify(error).includes(fakeKey) && !error.stack?.includes(fakeKey); }

test("narrator preserves system prompt/order, explicit bound, endpoint/auth and usage", async () => {
  const c = client(() => sse([event("Hello"), ending]), (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${fakeKey}`);
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.model, "z-ai/glm-5.2"); assert.equal(payload.max_tokens, 512); assert.deepEqual(payload.reasoning, { enabled: false });
    assert.deepEqual(payload.provider, { order: ["z-ai/fp8"], allow_fallbacks: false });
    assert.deepEqual(payload.messages, [{ role: "system", content: request.system_prompt }, ...request.messages]);
    assert.equal(payload.tools, undefined); assert.equal(payload.response_format, undefined);
  });
  const result = await new MiniMaxNarratorProvider(c).generate(request);
  assert.equal(result.text, "Hello"); assert.deepEqual(result.usage, counts);
  assert.ok(result.latency.elapsed_total_ms >= result.latency.time_to_first_token_ms!);
  assert.ok(result.latency.headers_ms !== null); assert.ok(Date.parse(result.latency.completed_at));
});
test("fragmented SSE, multiple events, comments, empty events, UTF-8 and done", async () => {
  const source = ": ping\r\n\r\nevent: ping\n\n" + event("hé") + event("llo") + ending;
  const bytes = new TextEncoder().encode(source);
  const response = () => new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); } }));
  const events = await collectEvents(new MiniMaxNarratorProvider(client(response)).stream(request));
  const text = events.filter(e => e.type === "text_delta").map(e => e.text).join("");
  assert.equal(text, "héllo"); const last = events.at(-1)!;
  assert.equal(last.type, "completed"); if (last.type === "completed") assert.equal(last.result.text, text);
});
for (const [status, code] of [[401, "authentication_error"], [403, "authentication_error"], [429, "rate_limited"], [500, "provider_unavailable"], [503, "provider_unavailable"], [400, "invalid_provider_response"]] as const) {
  test(`HTTP ${status} sanitized and not retried`, async () => {
    let calls = 0;
    await assert.rejects(collect(client(() => { calls++; return new Response(`Authorization: ${fakeKey}`, { status }); })), isCode(code));
    assert.equal(calls, 1);
  });
}
test("missing runtime credential is typed and never fetches", async () => {
  await assert.rejects(collect(new OpenRouterClient({ api_key: () => undefined, fetch: async () => { assert.fail("network"); } })), isCode("configuration_error"));
});
test("malformed JSON and malformed SSE are sanitized", async () => {
  await assert.rejects(collect(client(() => new Response(fakeKey))), isCode("invalid_provider_response"));
  await assert.rejects(collect(client(() => sse([`data: ${fakeKey}\n\n`])), true), isCode("invalid_provider_response"));
});
test("network exception retains no raw cause", async () => {
  const c = new OpenRouterClient({ api_key: () => fakeKey, fetch: async () => { throw new Error(fakeKey); } });
  await assert.rejects(collect(c), isCode("network_error"));
});
for (const cancellation of [false, true]) test(cancellation ? "cancellation aborts fetch distinctly" : "timeout aborts fetch", async () => {
  let aborted = false;
  const c = new OpenRouterClient({ api_key: () => fakeKey, fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => { aborted = true; reject(new Error(fakeKey)); });
  }) });
  const signal = new AbortController();
  const pending = collectEvents(c.request(body, false, cancellation ? 1000 : 10, signal.signal));
  if (cancellation) signal.abort();
  await assert.rejects(pending, isCode(cancellation ? "cancelled" : "timeout")); assert.equal(aborted, true);
});
test("pre-cancelled request avoids network", async () => {
  await assert.rejects(collect(client(() => { assert.fail("network"); }), false, AbortSignal.abort()), isCode("cancelled"));
});
test("timeout remains active while reading response body", async () => {
  const c = new OpenRouterClient({ api_key: () => fakeKey, fetch: async (_url, init) => new Response(new ReadableStream({ start(controller) {
    init!.signal!.addEventListener("abort", () => controller.error(new Error(fakeKey)));
  } })) });
  await assert.rejects(collectEvents(c.request(body, true, 10)), isCode("timeout"));
});
test("partial connection failure reports incomplete text, never completed", async () => {
  const events = await collectEvents(new MiniMaxNarratorProvider(client(() => sse([event("Partial")], true))).stream(request));
  assert.equal(events[0]!.type, "text_delta"); const last = events.at(-1)!;
  assert.equal(last.type, "error"); if (last.type === "error") { assert.equal(last.text, "Partial"); assert.equal(last.incomplete, true); assert.equal(last.error.code, "network_error"); }
});
for (const [name, chunks] of [["missing done", [event("Partial"), event("", "stop")]], ["missing finish", [event("Partial"), "data: [DONE]\n\n"]], ["token truncation", [event("Partial"), event("", "length"), "data: [DONE]\n\n"]]] as const) {
  test(name, async () => { await assert.rejects(collect(client(() => sse([...chunks])), true), isCode("invalid_provider_response")); });
}
test("breaking stream cancels reader and network", async () => {
  let cancelled = false; let signal: AbortSignal | undefined;
  const c = client(() => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(event("Hello"))); }, cancel() { cancelled = true; } })), (_u, init) => { signal = init.signal!; });
  for await (const _event of c.request(body, true, 1000)) break;
  assert.equal(cancelled, true); assert.equal(signal?.aborted, true);
});
test("refusals and empty content are not valid generations", async () => {
  await assert.rejects(collect(client(() => Response.json(completion("", { choices: [{ message: { refusal: "no" }, finish_reason: "stop" }] })))), isCode("model_refusal"));
  await assert.rejects(collect(client(() => Response.json(completion("")))), isCode("invalid_provider_response"));
});
test("usage absent/invalid counts are omitted", async () => {
  const events = await collect(client(() => Response.json(completion("Hi", { usage: { prompt_tokens: -1, completion_tokens: 2, total_tokens: "secret" } }))));
  const last = events.at(-1)!; if (last.type === "completed") assert.deepEqual(last.metadata.usage, { completion_tokens: 2 }); else assert.fail();
});
test("configurable models, bounds and roleplay context stay adapter-local", async () => {
  await new MiniMaxNarratorProvider(client(() => sse([event("Hi"), ending]), (_url, init) => {
    const payload = JSON.parse(String(init.body)); assert.equal(payload.model, "other/narrator"); assert.equal(payload.max_tokens, 100);
    assert.equal(payload.messages[1].role, "sample_message_ai");
  }), { model: "other/narrator", roleplay_context: [{ role: "sample_message_ai", content: "Example" }] }).generate({ ...request, max_output_tokens: 100 });
  await assert.rejects(new MiniMaxNarratorProvider(client(() => { assert.fail(); })).generate({ ...request, max_output_tokens: 2049 }), isCode("configuration_error"));
  const c = new OpenRouterClient({ api_key: () => fakeKey, max_request_characters: 1, fetch: async () => { assert.fail(); } });
  await assert.rejects(collect(c), isCode("configuration_error"));
});
for (const scenario of LLM_SCENARIOS) test(`controller fixture: ${scenario.name}`, async () => {
  const result = await new DeepSeekStateControllerProvider(client(() => Response.json(completion(JSON.stringify({ commands: scenario.expected }))), (_url, init) => {
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.model, "deepseek/deepseek-v4-flash-0731:nitro"); assert.equal(payload.max_tokens, 512);
    assert.equal(payload.response_format.type, "json_schema"); assert.equal(payload.response_format.json_schema.strict, true);
    assert.equal(payload.provider.require_parameters, true); assert.equal(payload.reasoning.exclude, true);
    assert.equal(payload.messages[0].content, CONTROLLER_POLICY);
    assert.equal(JSON.parse(payload.messages[1].content).final_narration, scenario.narration);
    assert.match(CONTROLLER_POLICY, /untrusted data/);
  })).propose({ player_action: scenario.action, prior_state: scenario.state, final_narration: scenario.narration });
  assert.deepEqual(result.commands, scenario.expected); assert.deepEqual(result.usage, counts); assert.ok(result.latency.headers_ms !== null);
});
for (const invalid of ["not JSON", '{"commands":[],"extra":true}', '{"commands":[{"kind":"set_trust","from_character_id":"a","to_character_id":"b","trust":100}]}',
  JSON.stringify({ commands: [{ kind: "place_item", item_id: "Bad ID", position: { kind: "carried", character_id: "test_player" } }] }),
  JSON.stringify({ commands: [{ ...LLM_SCENARIOS[1]!.expected[0], extra: true }] }),
  JSON.stringify({ commands: Array(9).fill(LLM_SCENARIOS[1]!.expected[0]) }),
]) test(`strict proposal rejects ${invalid.slice(0, 60)}`, () => { assert.throws(() => parseControllerProposal(invalid), isCode("structured_output_invalid")); });
test("controller rejects invalid commands after provider claims successful completion", async () => {
  await assert.rejects(new DeepSeekStateControllerProvider(client(() => Response.json(completion('{"commands":[{"kind":"unknown"}]}')))).propose({ player_action: "", prior_state: "", final_narration: "" }), isCode("structured_output_invalid"));
});
test("controller model and budget overrides preserve schema protocol", async () => {
  await new DeepSeekStateControllerProvider(client(() => Response.json(completion('{"commands":[]}')), (_url, init) => {
    const payload = JSON.parse(String(init.body)); assert.equal(payload.model, "compatible/controller"); assert.equal(payload.max_tokens, 128);
    assert.equal(payload.reasoning.effort, "low"); assert.equal(payload.reasoning.exclude, true);
  }), { model: "compatible/controller", max_output_tokens: 128, reasoning_effort: "low" }).propose({ player_action: "greet", prior_state: "{}", final_narration: "Hello." });
});
test("stream in-band provider errors preserve partial text and failure telemetry", async () => {
  const events = await collectEvents(new MiniMaxNarratorProvider(client(() => sse([event("Hi"), `data: ${JSON.stringify({ error: { code: 503, message: fakeKey } })}\n\n`]))).stream(request));
  const last = events.at(-1)!; assert.equal(last.type, "error");
  if (last.type === "error") { assert.equal(last.text, "Hi"); assert.equal(last.error.code, "provider_unavailable"); assert.ok(last.error.latency!.time_to_first_token_ms !== null); assert.ok(!JSON.stringify(last.error).includes(fakeKey)); }
});
test("cancellation during streaming preserves deltas and closes connection", async () => {
  const signal = new AbortController();
  const events = [];
  for await (const e of new MiniMaxNarratorProvider(client(() => sse([event("Hi"), ending]))).stream({ ...request, signal: signal.signal })) {
    events.push(e); if (e.type === "text_delta") signal.abort();
  }
  const last = events.at(-1)!; assert.equal(last.type, "error");
  if (last.type === "error") { assert.equal(last.error.code, "cancelled"); assert.equal(last.text, "Hi"); }
});
test("invalid URL configuration is sanitized", async () => {
  await assert.rejects(collect(new OpenRouterClient({ api_key: () => fakeKey, base_url: `invalid-${fakeKey}` })), isCode("configuration_error"));
});
