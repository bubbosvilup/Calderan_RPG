import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { ItemSpriteJobs } from "../src/app/item-sprite-jobs.js";
import { PortraitAssetStore } from "../src/app/portrait-store.js";
import { validateSpriteQuality, type SpriteQualityResult } from "../src/llm/sprite-quality.js";
import { OpenRouterSpriteQualityReviewer } from "../src/llm/openrouter/sprite-quality-reviewer.js";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { itemSpriteRetryPrompt } from "../src/campaign/item-sprite-prompt.js";
import type { ImageGenerationRequest } from "../src/llm/image-generator.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const accept: SpriteQualityResult = { accepted: true, reasons: [] };
const reject: SpriteQualityResult = { accepted: false, reasons: ["text_leakage"] };
for (const [name, results, expected, count] of [
  ["first accepted", [accept], "ready", 1],
  ["text rejected then accepted", [reject, accept], "ready", 2],
  ["both rejected, no third attempt", [reject, reject], "quality_rejected", 2],
  ["review outage, no regeneration", [new Error("secret provider body")], "review_failed", 1],
  ["second review outage", [reject, new Error("secret")], "review_failed", 2],
  ["malformed acceptance", [{ accepted: true, reasons: ["text_leakage"] }], "review_failed", 1],
] as const) test(`sprite quality cycle: ${name}`, async () => {
  const root = await mkdtemp(join(tmpdir(), "sprite-qa-"));
  try {
    const { campaign } = turnFixture();
    campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "create_item", name: "Knife", category: "weapon", owner_id: "brenna", description: "Narrative identity.", visual_description: "Plain silver knife.", position: { kind: "carried", character_id: "nicco" } }] });
    const initial = campaign.exportSnapshot().items.find(i => i.name === "Knife")!;
    const store = new PortraitAssetStore(root, { layout: "campaign" });
    let stages = 0, reviews = 0; const requests: ImageGenerationRequest[] = [];
    const originalStage = store.stage.bind(store);
    store.stage = async (...args) => { stages++; return originalStage(...args); };
    const jobs = new ItemSpriteJobs(campaign, { store,
      generator: { identity: { provider: "fake", model: "fake" }, async generate(request) {
        requests.push(request); assert.equal(campaign.exportSnapshot().items.find(i => i.name === "Knife")?.sprite?.status, "pending");
        return { bytes: PNG, media_type: "image/png", provider: "fake", model: "fake", latency_ms: 0 };
      } }, reviewer: { async review(input) {
        assert.deepEqual(Object.keys(input).sort(), ["category", "image", "name", "visual_description"]);
        assert.equal(input.visual_description, initial.visual_description); assert.equal(stages, 0);
        const r = results[reviews++]; if (r instanceof Error) throw r; return r as SpriteQualityResult;
      } },
    });
    assert.equal(jobs.request(initial.id), true); assert.equal(jobs.request(initial.id), false);
    await jobs.settled();
    const final = campaign.exportSnapshot().items.find(i => i.name === "Knife")!;
    assert.equal(requests.length, count); assert.equal(reviews, count);
    assert.equal(final.sprite?.status, expected === "ready" ? "ready" : "failed");
    if (final.sprite?.status === "failed") assert.equal(final.sprite.error_code, expected);
    assert.equal(stages, expected === "ready" ? 1 : 0);
    assert.deepEqual({ ...final, sprite: undefined }, { ...initial, sprite: undefined });
    if (count === 2) { assert.match(requests[1]!.prompt, /Previous rendering was rejected/); assert.ok(requests[1]!.prompt.includes(initial.visual_description!)); }
    if (final.sprite?.status === "ready") {
      assert.equal(await store.exists(campaign.exportSnapshot().campaign_id, final.id, final.sprite.asset_ref), true);
      campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "place_item", item_id: final.id, position: { kind: "stored", location_id: "test_hall" } }, { kind: "place_item", item_id: final.id, position: { kind: "carried", character_id: "nicco" } }, { kind: "transfer_item", mode: "handoff", item_id: final.id, position: { kind: "carried", character_id: "brenna" } }] });
      jobs.resumeInterrupted(); assert.equal(jobs.request(final.id), false); await jobs.settled();
      assert.equal(reviews, count); assert.equal(requests.length, count);
    } else if (expected === "quality_rejected") {
      assert.equal(jobs.request(final.id), true); await jobs.settled();
      assert.equal(requests.length, 3, "explicit retry starts fresh; missing fake review fails immediately");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("quality result rejects inconsistent, unknown or verbose output", () => {
  for (const bad of [null, {}, { accepted: true, reasons: ["text_leakage"] }, { accepted: false, reasons: [] }, { accepted: false, reasons: ["unknown"] }, { ...accept, notes: "prose" }, { accepted: false, reasons: ["text_leakage", "text_leakage"] }]) assert.throws(() => validateSpriteQuality(bad));
  assert.deepEqual(validateSpriteQuality(accept), accept);
});
test("retry prompt preserves exact visual authority and excludes other input fields", () => {
  const item = { name: "Knife", visual_description: "  Plain silver knife.\nNo engraving.  ", owner_id: "SECRET_OWNER", description: "SECRET_DESCRIPTION" };
  assert.ok(itemSpriteRetryPrompt(item).includes(item.visual_description)); assert.doesNotMatch(itemSpriteRetryPrompt(item), /SECRET_/);
});
test("vision adapter uses one image request, strict JSON and a visual-only projection", async () => {
  let calls = 0;
  const client = new OpenRouterClient({ api_key: () => "fake", fetch: async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "anthropic/claude-haiku-5.5"); assert.equal(body.models, undefined);
    assert.equal(body.messages[1].content[1].type, "image_url");
    assert.doesNotMatch(String(init?.body), /SECRET_/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(accept) }, finish_reason: "stop" }] }));
  } });
  const reviewer = new OpenRouterSpriteQualityReviewer(client);
  assert.deepEqual(await reviewer.review({ name: "Knife", visual_description: "Plain silver knife", image: { bytes: PNG, media_type: "image/png" }, ...{ owner_id: "SECRET_OWNER", description: "SECRET_DESCRIPTION" } }), accept);
  assert.equal(calls, 1);
});
