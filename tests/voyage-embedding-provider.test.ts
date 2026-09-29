import test from "node:test";
import assert from "node:assert/strict";
import { VoyageEmbeddingProvider } from "../src/retrieval/voyage-embedding-provider.js";
import { SemanticIndex } from "../src/retrieval/semantic-index.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { WorldStore } from "../src/world/world-store.js";
import { document, location } from "./fixtures.js";
const vector = (n = 1024) => Array.from({ length: n }, (_, i) => i === 0 ? 1 : 0);
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const provider = (fetch: typeof globalThis.fetch, timeoutMs = 1000) => new VoyageEmbeddingProvider({ apiKey: "fake-test-key", fetch, timeoutMs });
test("Voyage request recipe, ordered response and safe usage metadata", async () => {
  const kinds: string[] = [];
  const p = provider(async (url, init) => {
    assert.equal(url, "https://api.voyageai.com/v1/embeddings");
    assert.equal(init?.method, "POST"); assert.ok(new Headers(init?.headers).has("Authorization"));
    const body = JSON.parse(init?.body as string); kinds.push(body.input_type);
    assert.equal(body.model, "voyage-4"); assert.equal(body.output_dimension, 1024); assert.equal(body.output_dtype, "float"); assert.equal(body.truncation, false);
    return response({ data: body.input.map((_: string, index: number) => ({ index, embedding: vector().map(v => index ? -v : v) })).reverse(), usage: { total_tokens: 12 } });
  });
  const docs = await p.embedDocuments(["a", "b"]); assert.equal(docs[0]![0], 1); assert.equal(docs[1]![0], -1);
  await p.embedQuery("query"); await p.embedQueries(["first", "second"]); assert.deepEqual(kinds, ["document", "query", "query"]);
  assert.deepEqual(p.usage, { requests: 3, input_texts: 5, total_tokens: 36, responses_with_usage: 3 });
  assert.ok(!JSON.stringify(p).includes("fake-test-key"));
});
for (const [name, payload] of Object.entries({ missing: {}, count: { data: [] }, duplicate: { data: [{ index: 1, embedding: vector() }] }, dimension: { data: [{ index: 0, embedding: vector(3) }] }, zero: { data: [{ index: 0, embedding: Array(1024).fill(0) }] }, nonfinite: { data: [{ index: 0, embedding: Array(1024).fill(null) }] }, error: { error: "fake-test-key" } })) {
  test(`Voyage rejects ${name}`, async () => { await assert.rejects(provider(async () => response(payload)).embedQuery("q"), error => error instanceof Error && !error.message.includes("fake-test-key")); });
}
for (const [status, code] of [[401, "authentication"], [403, "authentication"], [429, "rate_limit"], [503, "provider_unavailable"], [400, "provider_error"]] as const) {
  test(`Voyage HTTP ${status}`, async () => { await assert.rejects(provider(async () => response({ error: "fake-test-key" }, status)).embedQuery("q"), { code }); });
}
test("Voyage invalid JSON and transport errors are sanitized", async () => {
  await assert.rejects(provider(async () => new Response("not JSON")).embedQuery("q"), { code: "malformed_response" });
  await assert.rejects(provider(async () => { throw new Error("fake-test-key"); }).embedQuery("q"), { code: "provider_unavailable" });
});
test("Voyage deadline bounds even an unresponsive transport", async () => {
  await assert.rejects(provider(async () => new Promise(() => {}), 5).embedQuery("q"), { code: "timeout" });
});
test("Voyage cancellation and empty/oversized inputs", async () => {
  const p = provider(async () => { assert.fail("unexpected network"); });
  assert.deepEqual(await p.embedDocuments([]), []);
  await assert.rejects(p.embedQuery("q", { signal: AbortSignal.abort() }), { code: "cancelled" });
  await assert.rejects(p.embedQuery("a".repeat(32000)), { code: "document_too_large" });
  assert.throws(() => new VoyageEmbeddingProvider({ apiKey: "" }), /VOYAGE_API_KEY is required/);
});
test("Voyage batches deterministically within byte and count budgets", async () => {
  const sizes: number[] = [];
  const p = provider(async (_url, init) => {
    const { input } = JSON.parse(init?.body as string); sizes.push(input.length);
    return response({ data: input.map((_: string, index: number) => ({ index, embedding: vector() })) });
  });
  assert.equal((await p.embedDocuments(Array(130).fill("a"))).length, 130); assert.deepEqual(sizes, [128, 2]);
  sizes.length = 0;
  await p.embedDocuments(Array(5).fill("a".repeat(30000))); assert.deepEqual(sizes, [3, 2]);
});
test("Voyage midflight cancellation rejects even if transport ignores abort", async () => {
  const controller = new AbortController();
  const pending = provider(async () => new Promise(() => {})).embedQuery("q", { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { code: "cancelled" });
});
test("Voyage HTTP inputs exclude player-hidden entities and parent names", async () => {
  const hidden = location("hidden"), visible = location("visible");
  Object.assign(hidden, { name: "PRIVATE_SENTINEL", display_name: "PRIVATE_SENTINEL", content: "PRIVATE_SENTINEL", knowledge: { visibility: { narrator: true, player: false }, known_by: [] } });
  Object.assign(visible, { parent: "hidden", knowledge: { visibility: { narrator: true, player: true }, known_by: [] } });
  const retrieval = new RetrievalService(new WorldStore([hidden, visible].map(e => ({ source: `fixtures/${e.id}.yaml`, document: document(e) }))));
  const inputs: string[][] = [];
  const p = provider(async (_url, init) => {
    const { input } = JSON.parse(init?.body as string); inputs.push(input);
    return response({ data: input.map((_: string, index: number) => ({ index, embedding: vector() })) });
  });
  await SemanticIndex.build(retrieval.indexSource(), p, "player");
  assert.equal(inputs[0]!.length, 1); assert.ok(!JSON.stringify(inputs).includes("PRIVATE_SENTINEL"));
  await SemanticIndex.build(retrieval.indexSource(), p, "narrator");
  assert.equal(inputs[1]!.length, 2); assert.ok(JSON.stringify(inputs[1]).includes("PRIVATE_SENTINEL"));
});
