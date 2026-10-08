import test from "node:test";
import assert from "node:assert/strict";
import { FalImageClient } from "../src/llm/huggingface/fal-image-client.js";
import { ImageGenerationError, recoveryFor } from "../src/llm/image-generator.js";
import { RAENA_IMAGE_STACK, imageStackStatus } from "../src/app/image-stack.js";

/** Image generation v1: the Hugging Face-routed fal-ai client in isolation (fake fetch). No paid calls. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const IMAGE_URL = "https://v3.fal.media/files/abc/portrait.png";
const NEG = "blurry, lowres";
interface Call { url: string; init: RequestInit; body?: any }
function fakeFetch(reply: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const call = { url, init, ...(typeof init.body === "string" ? { body: JSON.parse(init.body) } : {}) };
    calls.push(call);
    if (url === IMAGE_URL) return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
    return reply(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const falOk = (extra: Record<string, unknown> = {}, units: string | null = "1") => new Response(JSON.stringify({ images: [{ url: IMAGE_URL, width: 992, height: 992, content_type: "image/png" }], seed: 4242, has_nsfw_concepts: [false], ...extra }),
  { status: 200, headers: { "content-type": "application/json", ...(units !== null ? { "x-fal-billable-units": units } : {}), "x-inference-provider": "fal-ai" } });
const client = (f: typeof fetch, key: string | undefined = "hf_test_SECRET", timeout_ms = 2000) => new FalImageClient(RAENA_IMAGE_STACK, { fetch: f, api_key: () => key, timeout_ms, download_timeout_ms: timeout_ms });
const avatar = { prompt: "Anime illustration of an adult character.", negative_prompt: NEG, ...RAENA_IMAGE_STACK.avatar_size, seed: 101 };
const fullbody = { prompt: "Anime illustration of an adult character, full body.", negative_prompt: NEG, ...RAENA_IMAGE_STACK.fullbody_size, seed: 202 };

test("hf client: HF_TOKEN bearer, router URL with pinned fal-ai provider, Raena LoRA, size, seed and negative prompt in the exact body", async () => {
  const { f, calls } = fakeFetch(() => falOk());
  const c = client(f);
  const result = await c.generate(avatar);
  const post = calls[0]!;
  assert.equal(post.url, "https://router.huggingface.co/fal-ai/fal-ai/qwen-image", "router + pinned provider (never auto) + fal endpoint");
  assert.equal(post.init.method, "POST");
  assert.equal((post.init.headers as Record<string, string>).Authorization, "Bearer hf_test_SECRET");
  assert.deepEqual(post.body, { prompt: avatar.prompt, negative_prompt: NEG, seed: 101, image_size: { width: 992, height: 992 },
    loras: [{ path: "https://huggingface.co/Raelina/Raena-Qwen-Image/resolve/main/raena_qwen_image_lora_v0.1.safetensors", scale: 1 }] });
  assert.equal(calls[1]!.url, IMAGE_URL); assert.equal((calls[1]!.init.headers as Record<string, string> | undefined)?.Authorization, undefined, "the download never carries the token");
  assert.equal(result.media_type, "image/png"); assert.ok(result.bytes.equals(PNG));
  assert.equal(result.provider, "fal-ai"); assert.equal(result.model, "Qwen/Qwen-Image"); assert.equal(result.style_id, "Raelina/Raena-Qwen-Image");
  assert.equal(result.provider_seed, 4242); assert.equal(result.billable_units, 1); assert.equal(result.cost_usd, undefined, "cost is derived by the caller from units, never invented");
  assert.deepEqual(c.identity, { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" });
  await c.generate(fullbody);
  assert.deepEqual(calls[2]!.body.image_size, { width: 800, height: 1200 }); assert.equal(calls[2]!.body.seed, 202);
  // Units absent → unknown (never invented); an image/* response body is accepted directly.
  const direct = fakeFetch(() => new Response(PNG, { status: 200, headers: { "content-type": "image/png" } }));
  const r2 = await client(direct.f).generate(avatar);
  assert.equal(r2.billable_units, undefined); assert.equal(direct.calls.length, 1);
  assert.equal((await client(fakeFetch(() => falOk({}, null)).f).generate(avatar)).billable_units, undefined);
});

test("hf client: the default credential is HF_TOKEN (not OPENROUTER_API_KEY); a missing token never sends a request", async () => {
  const saved = { hf: process.env.HF_TOKEN, or: process.env.OPENROUTER_API_KEY };
  try {
    process.env.OPENROUTER_API_KEY = "sk-or-should-not-be-used"; delete process.env.HF_TOKEN;
    const none = fakeFetch(() => falOk());
    await assert.rejects(new FalImageClient(RAENA_IMAGE_STACK, { fetch: none.f }).generate(avatar), (e: unknown) => e instanceof ImageGenerationError && e.code === "configuration_error");
    assert.equal(none.calls.length, 0);
    process.env.HF_TOKEN = "hf_env_token";
    const env = fakeFetch(() => falOk());
    await new FalImageClient(RAENA_IMAGE_STACK, { fetch: env.f }).generate(avatar);
    assert.equal((env.calls[0]!.init.headers as Record<string, string>).Authorization, "Bearer hf_env_token");
    assert.equal(imageStackStatus({ HF_TOKEN: "hf_secret_value" }).configured, true);
    assert.ok(!imageStackStatus({ HF_TOKEN: "hf_secret_value" }).message.includes("hf_secret_value"), "status never prints the token");
    assert.equal(imageStackStatus({}).configured, false); assert.match(imageStackStatus({}).message, /HF_TOKEN/);
  } finally {
    if (saved.hf === undefined) delete process.env.HF_TOKEN; else process.env.HF_TOKEN = saved.hf;
    if (saved.or === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = saved.or;
  }
});

test("hf client: typed errors (refusal, transient, auth, invalid, malformed) never carry bodies or the token", async () => {
  const expectCode = async (reply: () => Response | Promise<Response>, code: string, timeout = 2000) => {
    await assert.rejects(client(fakeFetch(reply).f, "hf_test_SECRET", timeout).generate(avatar),
      (e: unknown) => e instanceof ImageGenerationError && e.code === code && !/SECRET|content checker/.test(e.message), code);
  };
  const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-fal-billable-units": "0" } });
  await expectCode(json(422, { detail: [{ loc: ["body"], msg: "Output flagged by the content checker SECRET", type: "content_policy_violation" }] }), "content_refusal");
  await expectCode(json(422, { detail: [{ loc: ["body", "prompt"], msg: "content checker", type: "content_policy_violation" }] }), "content_refusal");
  await expectCode(json(422, { detail: [{ loc: ["body", "loras"], msg: "Failed to load LoRA SECRET", type: "value_error" }] }), "invalid_request");
  await expectCode(() => falOk({ has_nsfw_concepts: [true] }), "content_refusal");
  for (const [status, code] of [[401, "auth_error"], [403, "auth_error"], [402, "insufficient_credits"], [429, "rate_limited"], [400, "invalid_request"], [404, "invalid_request"],
    [500, "provider_error"], [502, "transient_provider_error"], [503, "transient_provider_error"], [504, "transient_provider_error"]] as const)
    await expectCode(json(status, { error: "SECRET_BODY" }), code);
  await expectCode(() => new Response("not json SECRET", { status: 200, headers: { "content-type": "application/json" } }), "malformed_response");
  await expectCode(() => falOk({ images: [] }), "malformed_response");
  await expectCode(() => falOk({ images: [{ url: "http://v3.fal.media/x.png" }] }), "malformed_response");
  await expectCode(() => falOk({ images: [{ url: "https://evil.example.com/x.png" }] }), "malformed_response");
  await expectCode(() => new Response(Buffer.from("not an image"), { status: 200, headers: { "content-type": "image/png" } }), "invalid_image");
  await expectCode(() => new Promise<Response>(() => undefined), "transient_provider_error", 30);
  await expectCode(() => { throw new TypeError("fetch failed SECRET"); }, "transient_provider_error");
  // Invalid local requests are rejected before any call.
  const local = fakeFetch(() => falOk());
  for (const bad of [{ ...avatar, prompt: " " }, { ...avatar, width: 1001 }, { ...avatar, height: 4096 }, { ...avatar, seed: -1 }, { ...avatar, seed: 1.5 }])
    await assert.rejects(client(local.f).generate(bad), (e: unknown) => e instanceof ImageGenerationError && e.code === "invalid_request");
  assert.equal(local.calls.length, 0);
  // The single recovery each code allows.
  assert.equal(recoveryFor("content_refusal"), "reseed"); assert.equal(recoveryFor("transient_provider_error"), "same_seed"); assert.equal(recoveryFor("rate_limited"), "same_seed"); assert.equal(recoveryFor("provider_error"), "same_seed");
  for (const code of ["auth_error", "invalid_request", "insufficient_credits", "malformed_response", "invalid_image", "configuration_error"] as const) assert.equal(recoveryFor(code), "none", code);
});
