import test from "node:test";
import assert from "node:assert/strict";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { OpenRouterStateControllerProvider, DEFAULT_CONTROLLER_MODEL, DEFAULT_CONTROLLER_FALLBACK_MODELS, controllerModelFallback } from "../src/llm/openrouter/state-controller.js";
import { ProviderError } from "../src/llm/errors.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import type { TurnEvent } from "../src/turn/turn-types.js";
import { controllerFallbackModels, readProviderStatus } from "../src/app/production.js";
import { selectedModels, mannerismExtractorModel } from "../src/app/provider-config.js";
import { createHash } from "node:crypto";
import { DEFAULT_NARRATOR_MODEL, NARRATOR_PROVIDER_ROUTING } from "../src/llm/openrouter/minimax-narrator.js";
import { DEFAULT_MANNERISM_EXTRACTOR_MODEL } from "../src/llm/openrouter/mannerism-extractor.js";
import { DEFAULT_REFLECTION_MODEL } from "../src/llm/openrouter/reflection-provider.js";
import { CONTROLLER_POLICY } from "../src/llm/openrouter/state-controller.js";
import { CONTROLLER_EVIDENCE_SCHEMA } from "../src/llm/controller-schema.js";
import { MANNERISM_EXTRACTOR_SYSTEM, MANNERISM_EXTRACTOR_TASK, MANNERISM_EXTRACTION_SCHEMA } from "../src/turn/mannerism-extraction.js";
import { E1_SCHEMA, E1_SYSTEM } from "../src/turn/structured/reflection-v23-cvc-e1.js";
import { setup, collect, transfer, mockNarrator } from "./turn-fixtures.js";
import { fakeRetry } from "./provider-failure-scripts.js";

/**
 * Controller production routing — OpenRouter native `models` fallback (GPT-6 Luna primary, Claude Haiku 5.5 fallback). The fake fetch below
 * emulates OpenRouter's documented routing for the `models` array: models are tried in order; rate limiting and downtime move to
 * the next model; the answer carries the `model` that served it. Everything after the transport is the real client, provider,
 * coordinator, authorization and CampaignState.
 */
const LUNA = DEFAULT_CONTROLLER_MODEL, HAIKU = DEFAULT_CONTROLLER_FALLBACK_MODELS[0]!;
const fakeKey = "sk-or-fake-key-never-real";
const secretPrompt = "PRIVATE-PROMPT-SENTINEL";
const input = "I give boots to Brenna.", text = "Brenna accepts boots from Nicco.";
const valid = JSON.stringify({ commands: [{ command: transfer, evidence_quote: text }] });
type Behaviour = { status: 200; content: string } | { status: 429 | 500 | 502 | 503 | 400 };
interface Wire { readonly fetch: typeof fetch; readonly bodies: Record<string, unknown>[]; readonly served: string[]; calls(): number }
function openRouter(behaviour: Readonly<Record<string, Behaviour>>, hook?: (model: string) => void): Wire {
  const bodies: Record<string, unknown>[] = [], served: string[] = [];
  const error = (status: number, model: string) => Response.json({ error: { code: status, message: `Provider returned error ${fakeKey} ${secretPrompt}`, metadata: {
    raw: `${model} is temporarily rate-limited upstream ${secretPrompt}`, provider_name: model === LUNA ? "OpenAI" : "Azure", is_byok: false,
    limit_source: "upstream_provider_shared_pool", error_type: "rate_limit_exceeded" } }, user_id: "user_secret" },
    { status, headers: { "retry-after": "7", "x-generation-id": "gen-1791-failed" } });
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    bodies.push(body);
    const models = (body.models as string[] | undefined) ?? [body.model as string];
    let last = 0;
    for (const model of models) {
      served.push(model);
      const b = behaviour[model] ?? { status: 503 };
      if (b.status === 200) { hook?.(model); return Response.json({ id: "gen-1791-ok", model, provider: model === LUNA ? "OpenAI" : "Azure", choices: [{ message: { content: b.content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }); }
      last = b.status;
      // A malformed request is not a provider fault: no model can serve it.
      if (b.status === 400) break;
    }
    return error(last, models.at(-1)!);
  }) as typeof fetch;
  return { fetch: fetchImpl, bodies, served, calls: () => bodies.length };
}
const controller = (wire: Wire, fallback_models: readonly string[] = DEFAULT_CONTROLLER_FALLBACK_MODELS) =>
  new OpenRouterStateControllerProvider(new OpenRouterClient({ api_key: () => fakeKey, fetch: wire.fetch }), { fallback_models });
async function play(wire: Wire, narration = text, player_input = input, options: { fallback_models?: readonly string[] } = {}) {
  const f = setup(), before = f.campaign.exportSnapshot(), base = f.campaign.revision, diagnostics: TurnDiagnostics[] = [], retry = fakeRetry();
  const co = new TurnCoordinator(f.world, mockNarrator(narration), controller(wire, options.fallback_models), f.retrieval, { provider_retry: retry.policy, diagnostics_sink: record => { diagnostics.push(structuredClone(record) as TurnDiagnostics); } });
  const events: TurnEvent[] = await collect(co.runTurn({ campaign: f.campaign, player_input }));
  return { f, before, base, events, last: events.at(-1)!, diagnostics: diagnostics.at(-1)!, boots: () => f.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id };
}

test("1. Luna success: Haiku is never served, one request, no fallback flagged", async () => {
  const wire = openRouter({ [LUNA]: { status: 200, content: valid }, [HAIKU]: { status: 200, content: valid } });
  const r = await play(wire);
  assert.equal(r.last.type, "turn_completed"); assert.equal(wire.calls(), 1); assert.deepEqual(wire.served, [LUNA]);
  assert.equal(r.diagnostics.controller!.model, LUNA); assert.equal(r.diagnostics.controller!.response_model, LUNA); assert.equal(r.diagnostics.controller!.model_fallback, false);
  assert.deepEqual(r.diagnostics.controller!.requested_models, ["openai/gpt-6-luna", "anthropic/claude-haiku-5.5"]); assert.equal(r.diagnostics.controller!.provider, "OpenAI");
  assert.equal(r.boots(), "nicco");
});
test("2. Luna 429: Haiku answers in the same request, commit proceeds", async () => {
  const wire = openRouter({ [LUNA]: { status: 429 }, [HAIKU]: { status: 200, content: valid } });
  const r = await play(wire);
  assert.equal(r.last.type, "turn_completed"); assert.equal(wire.calls(), 1); assert.deepEqual(wire.served, [LUNA, HAIKU]);
  assert.equal(r.diagnostics.controller!.model_fallback, true); assert.equal(r.diagnostics.controller!.response_model, "anthropic/claude-haiku-5.5");
  assert.equal(r.diagnostics.provider_attempts!.controller!.final_outcome, "success");
  assert.equal(r.diagnostics.provider_attempts!.controller!.attempts, 1); assert.equal(r.boots(), "nicco"); assert.equal(r.f.campaign.revision, r.base + 1);
});
for (const status of [500, 502, 503] as const) test(`3. Luna ${status}: OpenRouter-eligible downtime falls back to Haiku`, async () => {
  const wire = openRouter({ [LUNA]: { status }, [HAIKU]: { status: 200, content: valid } });
  const r = await play(wire);
  assert.equal(r.last.type, "turn_completed"); assert.deepEqual(wire.served, [LUNA, HAIKU]); assert.equal(r.diagnostics.controller!.model_fallback, true);
});
test("4. malformed request (400): no model fallback, no transport retry, no state change", async () => {
  const wire = openRouter({ [LUNA]: { status: 400 }, [HAIKU]: { status: 200, content: valid } });
  const r = await play(wire);
  assert.equal(r.last.type, "turn_failed"); assert.equal(wire.calls(), 1); assert.deepEqual(wire.served, [LUNA]);
  assert.equal(r.diagnostics.provider_attempts!.controller!.attempts, 1); assert.equal(r.f.campaign.exportSnapshot(), r.before);
});
test("4b. the fallback list is bounded and validated before any network call", async () => {
  for (const fallback_models of [["a/1", "b/2", "c/3"]]) {
    const wire = openRouter({});
    await assert.rejects(controller(wire, fallback_models).propose({ player_action: "", prior_state: "{}", final_narration: "x" }), (e: unknown) => e instanceof ProviderError && e.code === "configuration_error");
    assert.equal(wire.calls(), 0);
  }
  const client = new OpenRouterClient({ api_key: () => fakeKey, fetch: (async () => assert.fail("network")) as typeof fetch });
  for (const models of [["other/model", "b/2"], [LUNA, LUNA], [LUNA, "b/2", "c/3", "d/4"], [LUNA, "bad model"]]) {
    await assert.rejects((async () => { for await (const _ of client.request({ model: LUNA, models, messages: [], max_tokens: 10 }, false, 1000)) { /* drain */ } })(), (e: unknown) => e instanceof ProviderError && e.code === "configuration_error");
  }
});
test("4c. both models rate-limited: bounded transport retry, then a controlled failure with no mutation", async () => {
  const wire = openRouter({ [LUNA]: { status: 429 }, [HAIKU]: { status: 429 } });
  const r = await play(wire);
  assert.equal(r.last.type, "turn_failed"); assert.equal(wire.calls(), 2); assert.equal(r.f.campaign.exportSnapshot(), r.before);
  const attempts = r.diagnostics.provider_attempts!.controller!;
  assert.deepEqual(attempts.retry_reasons, ["rate_limited"]); assert.equal(attempts.final_outcome, "rate_limited");
  assert.deepEqual(attempts.http_failures!.map(h => h.attempt), [1, 2]);
  assert.deepEqual(attempts.http_failures![0], { status: 429, error_type: "rate_limit_exceeded", provider_name: "Azure", limit_source: "upstream_provider_shared_pool", is_byok: false, retry_after_s: 7, generation_id: "gen-1791-failed", requested_models: [LUNA, HAIKU], attempt: 1 });
});
test("5. a valid fallback proposal follows the normal authorization and atomic commit path", async () => {
  const wire = openRouter({ [LUNA]: { status: 429 }, [HAIKU]: { status: 200, content: valid } });
  const r = await play(wire);
  assert.equal(r.events.filter(e => e.type === "state_committed").length, 1);
  assert.deepEqual(r.diagnostics.authorization!.decisions.map(d => [d.kind, d.authorized]), [["transfer_item", true]]);
  assert.equal(r.diagnostics.commit.succeeded, true); assert.equal(r.boots(), "nicco");
});
for (const content of ["not JSON {", JSON.stringify({ commands: [{ command: { kind: "unknown" }, evidence_quote: text }] })]) test(`6. invalid fallback output (${content.slice(0, 12)}) fails exactly like the same primary output: no state change`, async () => {
  const viaFallback = await play(openRouter({ [LUNA]: { status: 429 }, [HAIKU]: { status: 200, content } }));
  const viaPrimary = await play(openRouter({ [LUNA]: { status: 200, content } }));
  for (const r of [viaFallback, viaPrimary]) { assert.equal(r.last.type, "turn_failed"); assert.equal(r.f.campaign.exportSnapshot(), r.before); assert.equal(r.events.some(e => e.type === "state_committed"), false); }
  assert.deepEqual(viaFallback.events.map(e => e.type), viaPrimary.events.map(e => e.type));
  assert.equal((viaFallback.last as { code: string }).code, (viaPrimary.last as { code: string }).code);
});
test("7. schema-valid but unauthorized fallback commands are rejected exactly like primary ones", async () => {
  // Narration never shows the hand-over; the proposal cites text that is not in it.
  const runs = await Promise.all([openRouter({ [LUNA]: { status: 429 }, [HAIKU]: { status: 200, content: valid } }), openRouter({ [LUNA]: { status: 200, content: valid } })]
    .map(wire => play(wire, "Brenna smiles and looks at the window.", "I wave.")));
  for (const r of runs) {
    assert.equal(r.boots(), "nicco");
    assert.deepEqual(r.diagnostics.authorization!.decisions.map(d => [d.kind, d.authorized]), [["transfer_item", false]]);
  }
  assert.deepEqual(runs[0]!.diagnostics.authorization, runs[1]!.diagnostics.authorization);
  assert.equal(runs[0]!.diagnostics.controller!.model_fallback, true);
});
test("8. a stale expected revision during the fallback answer is still rejected; nothing commits", async () => {
  let f: ReturnType<typeof setup> | undefined;
  const wire = openRouter({ [LUNA]: { status: 429 }, [HAIKU]: { status: 200, content: valid } }, () => f!.campaign.apply({ expected_revision: f!.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }));
  f = setup();
  const co = new TurnCoordinator(f.world, mockNarrator(text), controller(wire), f.retrieval, { provider_retry: fakeRetry().policy });
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: input }));
  assert.equal(events.at(-1)!.type, "turn_failed"); assert.equal((events.at(-1) as { code: string }).code, "stale_turn");
  assert.equal(f.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "nicco");
});
test("9. request fields: documented models array (no model field), require_parameters, unchanged schema/reasoning/max_tokens", async () => {
  const wire = openRouter({ [LUNA]: { status: 200, content: valid } });
  await play(wire);
  const body = wire.bodies[0]!;
  assert.deepEqual(body.models, [LUNA, HAIKU]); assert.equal("model" in body, false);
  assert.deepEqual(body.provider, { require_parameters: true, allow_fallbacks: true });
  assert.deepEqual(body.reasoning, { exclude: true, enabled: false }); assert.equal(body.max_tokens, 512); assert.equal(body.stream, false);
  assert.equal((body.response_format as { json_schema: { strict: boolean; name: string } }).json_schema.strict, true);
  assert.deepEqual(Object.keys(body).sort(), ["max_tokens", "messages", "models", "provider", "reasoning", "response_format", "stream"]);
  // Without a configured fallback the single-model request is unchanged.
  const single = openRouter({ [LUNA]: { status: 200, content: valid } });
  await play(single, text, input, { fallback_models: [] });
  assert.equal(single.bodies[0]!.model, LUNA); assert.equal("models" in single.bodies[0]!, false);
});
test("10. API key, error message, provider raw text and prompts never enter diagnostics or errors", async () => {
  const r = await play(openRouter({ [LUNA]: { status: 429 }, [HAIKU]: { status: 429 } }));
  const serialized = JSON.stringify(r.diagnostics) + JSON.stringify(r.events);
  for (const secret of [fakeKey, secretPrompt, "user_secret", "temporarily rate-limited", "Bearer"]) assert.equal(serialized.includes(secret), false, secret);
  assert.ok(serialized.includes("upstream_provider_shared_pool"));
  let thrown: unknown;
  try { await controller(openRouter({ [LUNA]: { status: 429 }, [HAIKU]: { status: 503 } })).propose({ player_action: secretPrompt, prior_state: "{}", final_narration: secretPrompt }); } catch (error) { thrown = error; }
  assert.ok(thrown instanceof ProviderError && thrown.http?.status === 503);
  assert.equal(JSON.stringify({ ...(thrown as ProviderError), message: (thrown as Error).message }).includes(fakeKey), false);
  assert.equal(JSON.stringify(thrown).includes(secretPrompt), false);
});
test("11. the actual response model, generation id and provider are recorded", async () => {
  const r = await play(openRouter({ [LUNA]: { status: 503 }, [HAIKU]: { status: 200, content: valid } }));
  const c = r.diagnostics.controller!;
  assert.equal(c.model, LUNA); assert.equal(c.response_model, HAIKU); assert.deepEqual(c.requested_models, [LUNA, HAIKU]);
  assert.equal(c.model_fallback, true); assert.equal(c.generation_id, "gen-1791-ok"); assert.equal(c.provider, "Azure");
  assert.equal(controllerModelFallback(LUNA, `${LUNA}-20260901`), false); assert.equal(controllerModelFallback(LUNA, undefined), undefined);
});
test("production defaults: GPT-6 Luna primary, Claude Haiku 5.5 fallback, no Qwen/DeepSeek on the controller route", () => {
  assert.equal(DEFAULT_CONTROLLER_MODEL, "openai/gpt-6-luna");
  assert.deepEqual(DEFAULT_CONTROLLER_FALLBACK_MODELS, ["anthropic/claude-haiku-5.5"]);
  const saved = process.env.OPENROUTER_CONTROLLER_MODEL; delete process.env.OPENROUTER_CONTROLLER_MODEL;
  try {
    assert.equal(selectedModels().controller, "openai/gpt-6-luna"); assert.equal(readProviderStatus({}).controller_model, "openai/gpt-6-luna");
    for (const model of [selectedModels().controller, ...controllerFallbackModels({})]) assert.doesNotMatch(model, /qwen|deepseek/i);
  } finally { if (saved === undefined) delete process.env.OPENROUTER_CONTROLLER_MODEL; else process.env.OPENROUTER_CONTROLLER_MODEL = saved; }
});
test("env overrides: OPENROUTER_CONTROLLER_MODEL and OPENROUTER_CONTROLLER_FALLBACK_MODELS (explicit list or none)", async () => {
  assert.deepEqual(controllerFallbackModels({}), [HAIKU]);
  assert.deepEqual(controllerFallbackModels({ OPENROUTER_CONTROLLER_FALLBACK_MODELS: "none" }), []);
  assert.deepEqual(controllerFallbackModels({ OPENROUTER_CONTROLLER_FALLBACK_MODELS: " a/b , c/d " }), ["a/b", "c/d"]);
  const saved = process.env.OPENROUTER_CONTROLLER_MODEL; process.env.OPENROUTER_CONTROLLER_MODEL = "custom/controller";
  try { assert.equal(selectedModels().controller, "custom/controller"); } finally { if (saved === undefined) delete process.env.OPENROUTER_CONTROLLER_MODEL; else process.env.OPENROUTER_CONTROLLER_MODEL = saved; }
  // The production construction (createProductionDeps): selected model + resolved fallback list.
  for (const [env, expected] of [[{}, [LUNA, HAIKU]], [{ OPENROUTER_CONTROLLER_FALLBACK_MODELS: "none" }, null]] as const) {
    const wire = openRouter({ [LUNA]: { status: 200, content: valid } });
    await new OpenRouterStateControllerProvider(new OpenRouterClient({ api_key: () => fakeKey, fetch: wire.fetch }), { model: DEFAULT_CONTROLLER_MODEL, fallback_models: controllerFallbackModels(env) })
      .propose({ player_action: input, prior_state: "{}", final_narration: text });
    if (expected) { assert.deepEqual(wire.bodies[0]!.models, expected); assert.equal("model" in wire.bodies[0]!, false); }
    else { assert.equal(wire.bodies[0]!.model, LUNA); assert.equal("models" in wire.bodies[0]!, false); }
  }
});

test("mannerism defaults to Luna, reflection to Haiku 5.5 (both single-model, no Alibaba pin); narrator/controller unchanged; no active Qwen default; contracts unchanged", () => {
  assert.equal(DEFAULT_MANNERISM_EXTRACTOR_MODEL, "openai/gpt-6-luna"); assert.equal(mannerismExtractorModel({}), "openai/gpt-6-luna");
  // Reflection uses Haiku: its wire schema keeps string minLength/maxLength, which OpenAI strict outputs (Luna) reject.
  assert.equal(DEFAULT_REFLECTION_MODEL, "anthropic/claude-haiku-5.5");
  assert.equal(DEFAULT_NARRATOR_MODEL, "z-ai/glm-5.2"); assert.deepEqual(NARRATOR_PROVIDER_ROUTING[DEFAULT_NARRATOR_MODEL], { order: ["z-ai/fp8"], allow_fallbacks: false });
  assert.equal(DEFAULT_CONTROLLER_MODEL, "openai/gpt-6-luna"); assert.deepEqual(DEFAULT_CONTROLLER_FALLBACK_MODELS, ["anthropic/claude-haiku-5.5"]);
  const saved = { c: process.env.OPENROUTER_CONTROLLER_MODEL, r: process.env.OPENROUTER_REFLECTION_MODEL }; delete process.env.OPENROUTER_CONTROLLER_MODEL; delete process.env.OPENROUTER_REFLECTION_MODEL;
  try {
    const status = readProviderStatus({});
    assert.equal(status.reflection_model, "anthropic/claude-haiku-5.5");
    for (const model of [status.narrator_model!, status.controller_model!, status.reflection_model!, ...controllerFallbackModels({}), mannerismExtractorModel({})]) assert.doesNotMatch(model, /qwen|deepseek|alibaba/i);
  } finally { for (const [k, v] of [["OPENROUTER_CONTROLLER_MODEL", saved.c], ["OPENROUTER_REFLECTION_MODEL", saved.r]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const h = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
  assert.deepEqual({ policy: h(CONTROLLER_POLICY), schema: h(CONTROLLER_EVIDENCE_SCHEMA), m_system: h(MANNERISM_EXTRACTOR_SYSTEM), m_task: h(MANNERISM_EXTRACTOR_TASK), m_schema: h(MANNERISM_EXTRACTION_SCHEMA), r_system: h(E1_SYSTEM), r_schema: h(E1_SCHEMA) }, {
    policy: "1f55b50c3ff993c2c7305b486ae9126d394e49a48e8d0e4ee20be0548e94448d", schema: "80673964b00c963df8402b4907ed65cfc236ea17a45aa35824054456cc4a9ca4", // Pass C: explicit-intent transfer binding sentence added deliberately; other provider prompts/models remain frozen
    m_system: "b4a5ec309fc1ab8d09d8a4c53e0cc416492ef74e9aabba8b0bab3a8bbc41ec32", m_task: "51f5a734eb644f3c592f1d5b5b776cce1deca34aa7e62871c6ac5f68b0d1ac04", m_schema: "301a552e4b04f7668e5f571431d00afdb3ec5a4e7d93fb8fa7872ce0d5c4dc9f",
    r_system: "fc6fbaaae4a85f8eeb85d952a8f99cbdf6fda9701b087eb5e27d7e34352472f4", r_schema: "a2dec6b343d8b8c97cdf33eed0ad9523ae62701cf98c702d60c4f48f6d328efe" });
});

/** Runs with exactly these provider env vars (others removed), restoring process.env afterwards. */
function withEnv<T>(vars: Readonly<Record<string, string>>, run: (env: Record<string, string | undefined>) => T): T {
  const keys = ["OPENROUTER_CONTROLLER_MODEL", "OPENROUTER_CONTROLLER_FALLBACK_MODELS", "OPENROUTER_REFLECTION_MODEL", "MANNERISM_EXTRACTOR_MODEL", "OPENROUTER_NARRATOR_MODEL"] as const;
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, vars);
  try { return run({ ...vars }); } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
test("model resolution matrix: reflection never inherits the controller model; every subsystem resolves independently", () => {
  // A. No overrides.
  withEnv({}, env => { const s = readProviderStatus(env); assert.deepEqual([s.narrator_model, s.controller_model, s.reflection_model], ["z-ai/glm-5.2", "openai/gpt-6-luna", "anthropic/claude-haiku-5.5"]); });
  // B. Controller override only: reflection keeps its own default.
  withEnv({ OPENROUTER_CONTROLLER_MODEL: "custom/controller" }, env => { const s = readProviderStatus(env); assert.equal(s.controller_model, "custom/controller"); assert.equal(s.reflection_model, "anthropic/claude-haiku-5.5"); });
  // C. Reflection override only.
  withEnv({ OPENROUTER_REFLECTION_MODEL: "custom/reflection" }, env => { const s = readProviderStatus(env); assert.equal(s.reflection_model, "custom/reflection"); assert.equal(s.controller_model, "openai/gpt-6-luna"); });
  // D. Both, different: each gets its own; a blank reflection override falls back to the reflection default, never the controller.
  withEnv({ OPENROUTER_CONTROLLER_MODEL: "custom/controller", OPENROUTER_REFLECTION_MODEL: "custom/reflection" }, env => { const s = readProviderStatus(env); assert.deepEqual([s.controller_model, s.reflection_model], ["custom/controller", "custom/reflection"]); });
  withEnv({ OPENROUTER_CONTROLLER_MODEL: "custom/controller", OPENROUTER_REFLECTION_MODEL: "   " }, env => { assert.equal(readProviderStatus(env).reflection_model, "anthropic/claude-haiku-5.5"); });
  // E. Controller fallback env handling unchanged and independent of the reflection setting.
  withEnv({ OPENROUTER_REFLECTION_MODEL: "custom/reflection" }, env => { assert.deepEqual(controllerFallbackModels(env), ["anthropic/claude-haiku-5.5"]); });
  assert.deepEqual(controllerFallbackModels({ OPENROUTER_CONTROLLER_FALLBACK_MODELS: "none" }), []); assert.deepEqual(controllerFallbackModels({ OPENROUTER_CONTROLLER_FALLBACK_MODELS: "a/b,c/d" }), ["a/b", "c/d"]);
  // F. Mannerism default/override unchanged and independent of controller/reflection.
  assert.equal(mannerismExtractorModel({ OPENROUTER_CONTROLLER_MODEL: "custom/controller", OPENROUTER_REFLECTION_MODEL: "custom/reflection" }), "openai/gpt-6-luna");
  assert.equal(mannerismExtractorModel({ MANNERISM_EXTRACTOR_MODEL: "custom/extractor" }), "custom/extractor");
  // G. Narrator unchanged by every other override.
  withEnv({ OPENROUTER_CONTROLLER_MODEL: "custom/controller", OPENROUTER_REFLECTION_MODEL: "custom/reflection", MANNERISM_EXTRACTOR_MODEL: "custom/extractor" }, env => { assert.equal(readProviderStatus(env).narrator_model, "z-ai/glm-5.2"); });
});
