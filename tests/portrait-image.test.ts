import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PORTRAIT_IMAGE_CONFIG, ImageGenerationError, OpenRouterImageClient } from "../src/llm/openrouter/image-client.js";

/** Portrait Image Generation V1: the provider client (fake fetch). No paid calls. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ------------------------------------------------------------------------------------------------ provider client (fake fetch)
const ENDPOINTS = { id: DEFAULT_PORTRAIT_IMAGE_CONFIG.model, endpoints: [{ provider_slug: "seed", supported_parameters: { resolution: { type: "enum", values: ["1K", "2K"] },
  aspect_ratio: { type: "enum", values: ["1:1", "2:3", "3:4"] }, n: { type: "range", min: 1, max: 1 }, input_references: { type: "range", min: 0, max: 14 } }, pricing: [{ billable: "output_image", unit: "image", cost_usd: 0.018 }] }] };
function fakeFetch(reply: (body: any) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; body?: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (url.endsWith("/endpoints")) return new Response(JSON.stringify(ENDPOINTS), { status: 200 });
    return reply(init.body ? JSON.parse(String(init.body)) : undefined);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ok = (data: unknown, cost?: number) => new Response(JSON.stringify({ created: 1, data, ...(cost !== undefined ? { usage: { cost } } : {}) }), { status: 200 });
const client = (f: typeof fetch, key: string | undefined = "test-key", config = DEFAULT_PORTRAIT_IMAGE_CONFIG, timeout_ms = 2000) => new OpenRouterImageClient(config, { fetch: f, api_key: () => key, timeout_ms });

test("client: exact request (prompt unchanged, no negative prompt, validated config), decode, cost, cached capabilities", async () => {
  const { f, calls } = fakeFetch(() => ok([{ b64_json: PNG, media_type: "image/png" }], 0.018));
  const c = client(f), prompt = "Full-body character reference image.\nSubject: one female.";
  const result = await c.generate({ prompt });
  assert.equal(result.media_type, "image/png"); assert.equal(result.cost_usd, 0.018); assert.equal(result.model, "bytedance-seed/seedream-5-0-flash"); assert.ok(result.bytes.length > 8);
  const post = calls.find(x => x.url.endsWith("/images"))!;
  assert.equal(post.url, "https://openrouter.ai/api/v1/images");
  assert.deepEqual(post.body, { model: "bytedance-seed/seedream-5-0-flash", prompt, n: 1, resolution: "1K", aspect_ratio: "2:3" });
  assert.equal((post.init.headers as Record<string, string>).Authorization, "Bearer test-key");
  await c.generate({ prompt, references: [{ media_type: "image/png", bytes: Buffer.from(PNG, "base64") }] });
  const withRef = calls.filter(x => x.url.endsWith("/images")).at(-1)!.body;
  assert.deepEqual(withRef.input_references, [{ type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } }]);
  assert.equal(calls.filter(x => x.url.endsWith("/endpoints")).length, 1, "capabilities fetched once per client");
  // Missing cost stays unknown.
  const plain = await client(fakeFetch(() => ok([{ b64_json: PNG }])).f).generate({ prompt });
  assert.equal(plain.cost_usd, undefined); assert.equal(plain.media_type, "image/png");
});

test("client: n is sent only when an accepting endpoint advertises it (Krea 2 endpoints do not)", async () => {
  const krea = { id: "krea/krea-2-medium", endpoints: [{ provider_slug: "krea", supported_parameters: { resolution: { type: "enum", values: ["1K"] }, aspect_ratio: { type: "enum", values: ["2:3"] },
    input_references: { type: "range", min: 0, max: 1 } }, pricing: [] }] };
  const calls: any[] = [];
  const f = (async (url: string, init: RequestInit) => {
    if (url.endsWith("/endpoints")) return new Response(JSON.stringify(krea), { status: 200 });
    calls.push(JSON.parse(String(init.body))); return ok([{ b64_json: PNG }], 0.03);
  }) as unknown as typeof fetch;
  const result = await client(f, "k", { model: "krea/krea-2-medium", resolution: "1K", aspect_ratio: "2:3", n: 1 }).generate({ prompt: "p" });
  assert.equal(result.cost_usd, 0.03);
  assert.deepEqual(calls[0], { model: "krea/krea-2-medium", prompt: "p", resolution: "1K", aspect_ratio: "2:3" }, "no unadvertised n");
  await assert.rejects(client(f, "k", { model: "krea/krea-2-medium", resolution: "1K", aspect_ratio: "2:3", n: 1 }).generate({ prompt: "p", references: [1, 2].map(() => ({ media_type: "image/png" as const, bytes: Buffer.from(PNG, "base64") })) }),
    (e: unknown) => e instanceof ImageGenerationError && e.code === "unsupported_configuration", "two references exceed Krea's advertised maximum of one");
  assert.equal(calls.length, 1);
});

test("client: failures map to safe codes without bodies; unsupported config and missing key never POST", async () => {
  const expectCode = async (c: OpenRouterImageClient, code: string, status?: number) => {
    await assert.rejects(c.generate({ prompt: "p" }), (e: unknown) => e instanceof ImageGenerationError && e.code === code && (status === undefined || e.status === status) && !/SECRET_BODY|test-key/.test(e.message));
  };
  for (const [status, code] of [[401, "authentication_error"], [402, "insufficient_credits"], [429, "rate_limited"], [500, "provider_unavailable"], [502, "provider_unavailable"], [400, "unsupported_configuration"], [524, "timeout"]] as const)
    await expectCode(client(fakeFetch(() => new Response('{"error":{"message":"SECRET_BODY"}}', { status })).f), code, status);
  await expectCode(client(fakeFetch(() => new Response("not json SECRET_BODY", { status: 200 })).f), "invalid_provider_response");
  await expectCode(client(fakeFetch(() => ok([])).f), "invalid_provider_response");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: PNG }, { b64_json: PNG }])).f), "invalid_provider_response");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: "" }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: "@@not base64@@" }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: Buffer.from("plain text, not an image").toString("base64") }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: PNG, media_type: "image/jpeg" }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: Buffer.from("<svg></svg>").toString("base64"), media_type: "image/svg+xml" }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => new Promise<Response>(() => undefined)).f, "test-key", DEFAULT_PORTRAIT_IMAGE_CONFIG, 30), "timeout");
  const none = fakeFetch(() => ok([{ b64_json: PNG }]));
  await expectCode(new OpenRouterImageClient(DEFAULT_PORTRAIT_IMAGE_CONFIG, { fetch: none.f, api_key: () => undefined }), "configuration_error"); await expectCode(client(none.f, "  "), "configuration_error");
  assert.equal(none.calls.length, 0, "no request without a key");
  const unsupported = fakeFetch(() => ok([{ b64_json: PNG }]));
  await expectCode(client(unsupported.f, "k", { ...DEFAULT_PORTRAIT_IMAGE_CONFIG, resolution: "4K" }), "unsupported_configuration");
  await expectCode(client(unsupported.f, "k", { ...DEFAULT_PORTRAIT_IMAGE_CONFIG, aspect_ratio: "9:21" }), "unsupported_configuration");
  assert.ok(!unsupported.calls.some(x => x.url.endsWith("/images")), "an unsupported configuration never generates");
});

// The session lifecycle (batches, Gallery, roles, delete, reference, asset access, HTTP) lives in tests/portrait-gallery.test.ts.
