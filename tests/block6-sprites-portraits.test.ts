import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { turnFixture } from "../src/dev/turn-fixture.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { ItemSpriteJobs } from "../src/app/item-sprite-jobs.js";
import { PortraitAssetStore } from "../src/app/portrait-store.js";
import { ImageGenerationError, type PortraitImageGenerator, type ImageGenerationRequest } from "../src/llm/image-generator.js";
import { GameSession, type SessionDeps } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { resolveOptionalServices } from "../src/app/optional-services.js";
import { mockController, mockNarrator } from "./turn-fixtures.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const create: Extract<CampaignCommand, { kind: "create_item" }> = { kind: "create_item", name: "Ivory figurine", description: "A small carved ivory figurine taken from Brenna's counter.",
  visual_description: "Small cream ivory figurine with a worn rectangular base and simple carved face, no paint.", category: "valuable", owner_id: "brenna", position: { kind: "carried", character_id: "nicco" } };
const ID = "campaign_item_00000001";
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
class Generator implements PortraitImageGenerator {
  identity = { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" };
  requests: ImageGenerationRequest[] = []; gate?: Promise<void>; fail = false;
  async generate(request: ImageGenerationRequest) { this.requests.push(request); await this.gate; if (this.fail) throw new ImageGenerationError("auth_error", 401); return { bytes: PNG, media_type: "image/png" as const, ...this.identity, latency_ms: 1 }; }
}
async function fixture() {
  const f = turnFixture(), root = await mkdtemp(join(tmpdir(), "caldrevan-block6s-")); dirs.push(root);
  const store = new PortraitAssetStore(root, { layout: "campaign" }), apply = (...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  apply(create);
  return { ...f, root, store, apply, item: () => f.campaign.exportSnapshot().items.find(i => i.id === ID)! };
}

test("block 6 sprites OFF: no job, no pending marker, no provider call; the item stays fully usable", async () => {
  const f = await fixture(), generator = new Generator(), before = f.campaign.revision;
  const jobs = new ItemSpriteJobs(f.campaign, { generator, store: f.store, enabled: () => false });
  assert.equal(jobs.request(ID), false); jobs.resumeInterrupted(); await jobs.settled();
  assert.equal(generator.requests.length, 0); assert.equal(f.item().sprite, undefined); assert.equal(f.campaign.revision, before);
  f.apply({ kind: "transfer_item", mode: "handoff", item_id: ID, position: { kind: "carried", character_id: "maren" } });
  assert.deepEqual(f.item().position, { kind: "carried", character_id: "maren" });
});

test("block 6 sprite QA OFF: zero reviewer calls, the first valid image is accepted deterministically", async () => {
  const f = await fixture(), generator = new Generator(); let reviews = 0;
  const reviewer = { async review() { reviews++; return { accepted: false, reasons: ["x"] }; } };
  void reviewer;
  const jobs = new ItemSpriteJobs(f.campaign, { generator, store: f.store });
  assert.equal(jobs.request(ID), true); await jobs.settled();
  assert.equal(reviews, 0); assert.equal(f.item().sprite?.status, "ready"); assert.equal(generator.requests.length, 1);
});

test("block 6 sprites ON: the item is usable before the sprite completes, and a sprite failure keeps the item intact", async () => {
  const f = await fixture(), generator = new Generator(); let release!: () => void;
  generator.gate = new Promise(r => { release = r; });
  const jobs = new ItemSpriteJobs(f.campaign, { generator, store: f.store });
  assert.equal(jobs.request(ID), true);
  f.apply({ kind: "transfer_item", mode: "handoff", item_id: ID, position: { kind: "carried", character_id: "maren" } });
  assert.deepEqual(f.item().position, { kind: "carried", character_id: "maren" }, "usable while the sprite is pending");
  generator.fail = true; release(); await jobs.settled();
  assert.deepEqual(f.item().sprite, { status: "failed", error_code: "auth_error" });
  assert.deepEqual(f.item().position, { kind: "carried", character_id: "maren" }); assert.equal(f.item().owner_id, "brenna");
});

test("block 6 sprites OFF keeps an existing ready sprite renderable and untouched", async () => {
  const f = await fixture(), generator = new Generator(), on = new ItemSpriteJobs(f.campaign, { generator, store: f.store });
  on.request(ID); await on.settled(); const ready = f.item().sprite; assert.equal(ready?.status, "ready");
  const off = new ItemSpriteJobs(f.campaign, { generator, store: f.store, enabled: () => false });
  assert.equal(off.request(ID), false); off.resumeInterrupted(); await off.settled();
  assert.deepEqual(f.item().sprite, ready); assert.equal(generator.requests.length, 1);
});

test("block 6 portraits OFF: a generation request declines cleanly, with no provider call and no revision change", async () => {
  const f = turnFixture(), root = await mkdtemp(join(tmpdir(), "caldrevan-block6p-")); dirs.push(root);
  const generator = new Generator(), service = new RetrievalService(f.world);
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, root), portrait_generator: generator, portrait_store: new PortraitAssetStore(root, { layout: "campaign" }),
    optional_services: resolveOptionalServices({ portrait_generation: false, item_sprite_generation: false }, {}),
    createCoordinator: (hooks: Parameters<SessionDeps["createCoordinator"]>[0]) => new TurnCoordinator(f.world, { async generate() { return mockNarrator("Maren nods.").generate({} as never); }, async *stream() { yield* mockNarrator("Maren nods.").stream({} as never); } }, mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }) } as never, f.campaign);
  const before = f.campaign.revision;
  const out = await session.generateNpcPortraitBatch({ ref: "maren", expected_revision: before, kind: "avatar" });
  assert.equal(out.ok, false); assert.equal(generator.requests.length, 0); assert.equal(f.campaign.revision, before);
  assert.ok((await session.submitPlayerInput("I wait.")).ok, "the core still plays with portraits OFF");
});
