import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { parseControllerProposal, CONTROLLER_SCHEMA } from "../src/llm/controller-schema.js";
import { CONTROLLER_POLICY } from "../src/llm/openrouter/state-controller.js";
import { ItemSpriteJobs } from "../src/app/item-sprite-jobs.js";
import { PortraitAssetStore } from "../src/app/portrait-store.js";
import { ITEM_SPRITE_NEGATIVE_PROMPT, itemSpritePrompt } from "../src/campaign/item-sprite-prompt.js";
import { itemVisualView, inventoryVisualView } from "../src/app/item-visual-view.js";
import { narratorItemView } from "../src/turn/item-projection.js";
import { ImageGenerationError, type PortraitImageGenerator, type ImageGenerationRequest } from "../src/llm/image-generator.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { FileCampaignRepository, assetKey } from "../src/persistence/campaign-repository.js";
import { liveAssetReferences, assessPortraitAssets } from "../src/app/portrait-assets.js";
import { GameSession } from "../src/app/game-session.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { mockNarrator, metadata } from "./turn-fixtures.js";

const reviewer = { async review() { return { accepted: true, reasons: [] }; } };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const create: Extract<CampaignCommand, { kind: "create_item" }> = { kind: "create_item", name: "Ivory figurine", description: "A small carved ivory figurine taken from Brenna's counter.",
  visual_description: "Small cream ivory figurine with a worn rectangular base and simple carved face, no paint.", category: "valuable", owner_id: "brenna", position: { kind: "carried", character_id: "nicco" } };
const ID = "campaign_item_00000001";
const directories: string[] = [];
test.after(async () => { for (const path of directories) await rm(path, { recursive: true, force: true }); });
async function fixture() {
  const f = turnFixture(), root = await mkdtemp(join(tmpdir(), "caldrevan-item-visual-")); directories.push(root);
  const store = new PortraitAssetStore(root, { layout: "campaign" });
  const apply = (...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  const item = () => f.campaign.exportSnapshot().items.find(i => i.id === ID)!;
  return { ...f, root, store, apply, item };
}
class Generator implements PortraitImageGenerator {
  identity = { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" };
  requests: ImageGenerationRequest[] = []; gate?: Promise<void>; fail = false;
  async generate(request: ImageGenerationRequest) {
    this.requests.push(request); await this.gate;
    if (this.fail) throw new ImageGenerationError("auth_error", 401);
    return { bytes: PNG, media_type: "image/png" as const, ...this.identity, latency_ms: 1 };
  }
}
test("Controller creation requires both nonempty descriptions; internal enrichment commands are excluded", () => {
  assert.deepEqual(parseControllerProposal(JSON.stringify({ commands: [create] })), [create]);
  for (const key of ["description", "visual_description"] as const) {
    const omitted = { ...create }; delete (omitted as Partial<typeof create>)[key];
    assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [omitted] })));
    assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [{ ...create, [key]: " " }] })));
  }
  assert.doesNotMatch(JSON.stringify(CONTROLLER_SCHEMA), /enrich_item_visual|set_item_sprite/);
  assert.match(CONTROLLER_POLICY, /stable visible appearance/); assert.match(CONTROLLER_POLICY, /Modest generic visual completion/);
  assert.match(CONTROLLER_POLICY, /no owner, IDs, location, history, temporary state or secret lore/);
});
test("Visual identity and both descriptions persist through stored/carried/equipped and ownership transfer", async () => {
  const f = await fixture(); f.apply(create); const initial = f.item();
  for (const position of [{ kind: "stored", location_id: "test_room" }, { kind: "carried", character_id: "nicco" }, { kind: "equipped", character_id: "nicco", slot: "hand", mode: "held" }] as const) {
    f.apply({ kind: "place_item", item_id: ID, position });
    assert.equal(f.item().description, initial.description); assert.equal(f.item().visual_description, initial.visual_description);
  }
  f.apply({ kind: "transfer_item", mode: "handoff", item_id: ID, position: { kind: "carried", character_id: "maren" } });
  assert.equal(f.item().visual_description, initial.visual_description);
  assert.throws(() => f.apply({ kind: "enrich_item_visual", item_id: ID, visual_description: "Different appearance" }), /already established/);
  assert.doesNotMatch(f.item().visual_description!, /brenna|nicco|test_room|stolen|counter|transaction/i);
});
test("Prompt is deterministic and ignores mutable, secret and transcript fields; player/narrator views omit internal art", async () => {
  const f = await fixture(); f.apply(create);
  const prompt = itemSpritePrompt(create);
  assert.equal(itemSpritePrompt({ ...create, owner_id: "maren", position: { kind: "stored", location_id: "secret_room" }, transcript: "SECRET", biography: "SECRET" } as typeof create), prompt);
  assert.doesNotMatch(prompt, /brenna|nicco|counter|campaign_item|SECRET|test_room/);
  assert.match(prompt, /^Anime illustration of/); assert.match(prompt, /Plain neutral background/); assert.match(prompt, /No hands/);
  for (const projection of [itemVisualView(f.item()), narratorItemView(f.item())]) {
    assert.equal("visual_description" in projection, false); assert.equal("sprite" in projection, false);
    assert.equal(projection.description, create.description);
  }
});
test("One nonblocking job per identity; pending/ready suppress duplicates; movement creates no requests", async () => {
  const f = await fixture(); f.apply(create); const generator = new Generator(); let release!: () => void;
  generator.gate = new Promise(resolve => { release = resolve; });
  const jobs = new ItemSpriteJobs(f.campaign, { reviewer, generator, store: f.store });
  assert.equal(jobs.request(ID), true); assert.equal(f.item().sprite?.status, "pending"); assert.equal(jobs.request(ID), false);
  await Promise.resolve(); assert.equal(generator.requests.length, 1);
  assert.equal(generator.requests[0]!.negative_prompt, ITEM_SPRITE_NEGATIVE_PROMPT);
  f.apply({ kind: "place_item", item_id: ID, position: { kind: "stored", location_id: "test_room" } });
  release(); await jobs.settled(); assert.equal(f.item().sprite?.status, "ready"); assert.equal(jobs.request(ID), false);
  const sprite = f.item().sprite;
  f.apply({ kind: "place_item", item_id: ID, position: { kind: "carried", character_id: "nicco" } });
  f.apply({ kind: "transfer_item", mode: "handoff", item_id: ID, position: { kind: "carried", character_id: "maren" } });
  assert.deepEqual(f.item().sprite, sprite); assert.equal(inventoryVisualView(f.campaign.exportSnapshot(), "maren").find(i => i.id === ID)?.sprite_status, "ready");
  assert.equal(generator.requests.length, 1); assert.equal(f.item().owner_id, "brenna"); assert.equal(f.item().position.kind, "carried");
});
test("Image completions wait for idle; prepared gameplay commits stay valid", async () => {
  const f = await fixture(); f.apply(create); let idle = true; const generator = new Generator();
  const jobs = new ItemSpriteJobs(f.campaign, { reviewer, generator, store: f.store, can_commit: () => idle }); jobs.request(ID);
  idle = false; const before = f.campaign.revision;
  const turn = f.campaign.prepare({ expected_revision: before, commands: [{ kind: "place_item", item_id: ID, position: { kind: "stored", location_id: "test_room" } }] });
  await jobs.settled(); assert.equal(f.campaign.revision, before); assert.equal(f.item().sprite?.status, "pending");
  f.campaign.commit(turn); idle = true; jobs.flush(); assert.equal(f.item().sprite?.status, "ready");
});
test("Provider/configuration failure preserves gameplay and allocator; failed retry reuses identity", async () => {
  const f = await fixture(); f.apply(create); const before = f.item(), sequence = f.campaign.exportSnapshot().next_item_sequence;
  const generator = new Generator(); generator.fail = true;
  const jobs = new ItemSpriteJobs(f.campaign, { reviewer, generator, store: f.store }); jobs.request(ID); await jobs.settled();
  assert.deepEqual(f.item().sprite, { status: "failed", error_code: "auth_error" });
  assert.equal(f.item().owner_id, before.owner_id); assert.deepEqual(f.item().position, before.position); assert.equal(f.campaign.exportSnapshot().next_item_sequence, sequence);
  generator.fail = false; assert.equal(jobs.request(ID), true); await jobs.settled(); assert.equal(f.item().sprite?.status, "ready"); assert.equal(generator.requests.length, 2);
  const g = await fixture(); g.apply(create); const offline = new ItemSpriteJobs(g.campaign, {}); offline.request(ID); await offline.settled();
  assert.deepEqual(g.item().sprite, { status: "failed", error_code: "configuration_error" }); assert.equal(g.item().id, ID);
});
test("Ready asset and visual identity survive schema-6 saves and retained-save orphan protection", async () => {
  const f = await fixture(); f.apply(create); const jobs = new ItemSpriteJobs(f.campaign, { reviewer, generator: new Generator(), store: f.store }); jobs.request(ID); await jobs.settled();
  const snapshot = f.campaign.exportSnapshot(), saved = createSaveFile(snapshot, f.world, "2026-10-09T12:00:00.000Z");
  const loaded = decodeSave(serializeSave(saved, f.world), f.world).snapshot;
  assert.equal(loaded.schema_version, 6); assert.deepEqual(loaded.items, snapshot.items);
  const sprite = f.item().sprite; assert.equal(sprite?.status, "ready"); if (sprite?.status !== "ready") return;
  assert.ok(await f.store.read(snapshot.campaign_id, ID, sprite.asset_ref));
  const repo = new FileCampaignRepository(f.world, f.root); await repo.saveCampaign(f.campaign);
  const retained = await repo.retainedAssetReferences(snapshot.campaign_id);
  assert.ok(retained.references.has(assetKey(ID, sprite.asset_ref))); assert.ok(liveAssetReferences(snapshot).has(assetKey(ID, sprite.asset_ref)));
  const report = await assessPortraitAssets(f.store, snapshot.campaign_id, snapshot, retained); assert.deepEqual(report.orphans, []); assert.deepEqual(report.missing, []);
});
test("Legacy loading makes zero calls; explicit lazy enrichment runs once and can retry missing metadata", async () => {
  const f = await fixture(); const original = f.campaign.exportSnapshot();
  const restored = CampaignState.restore(f.world, decodeSave(serializeSave(createSaveFile(original, f.world, "2026-10-09T12:00:00.000Z"), f.world), f.world).snapshot);
  assert.equal(restored.exportSnapshot().items[0]!.visual_description, undefined); assert.equal(itemVisualView(restored.exportSnapshot().items[0]!).sprite_status, "none");
  const generator = new Generator(); const jobs = new ItemSpriteJobs(restored, { reviewer, generator, store: f.store });
  const oldId = restored.exportSnapshot().items[0]!.id; jobs.request(oldId); await jobs.settled();
  assert.equal(generator.requests.length, 0); assert.equal(restored.exportSnapshot().items[0]!.sprite?.status, "failed");
  let calls = 0;
  const enriched = new ItemSpriteJobs(restored, { reviewer, generator, store: f.store, enrich: async () => { calls++; return "Plain brown leather boots with rounded toes."; } });
  assert.equal(enriched.request(oldId), true); await enriched.settled(); assert.equal(calls, 1); assert.equal(generator.requests.length, 1);
  assert.equal(restored.exportSnapshot().items[0]!.sprite?.status, "ready"); assert.equal(enriched.request(oldId), false);
});
test("Interrupted pending work resumes once; save/load failed states remain retryable", async () => {
  const f = await fixture(); f.apply(create, { kind: "set_item_sprite", item_id: ID, sprite: { status: "pending" } });
  const loaded = CampaignState.restore(f.world, f.campaign.exportSnapshot()), generator = new Generator();
  const jobs = new ItemSpriteJobs(loaded, { reviewer, generator, store: f.store }); jobs.resumeInterrupted(); jobs.resumeInterrupted(); await jobs.settled();
  assert.equal(generator.requests.length, 1); assert.equal(loaded.exportSnapshot().items.find(i => i.id === ID)!.sprite?.status, "ready");
});
test("GameSession production turn seam schedules creation, continues gameplay, and never schedules movement", async () => {
  const f = await fixture(), generator = new Generator(); let release!: () => void;
  generator.gate = new Promise(resolve => { release = resolve; }); let turn = 0;
  const service = new RetrievalService(f.world);
  const co = new TurnCoordinator(f.world, mockNarrator("Nicco takes the ivory figurine from Brenna's counter and pockets it."), {
    async propose() { return { commands: turn++ === 0 ? [create] : [{ kind: "place_item" as const, item_id: ID, position: { kind: "stored" as const, location_id: "test_room" } }], evidence: [turn === 1 ? "Nicco takes the ivory figurine from Brenna's counter and pockets it." : "Nicco leaves the ivory figurine on the table."], ...metadata }; }
  }, { service, search: new HybridSearch(service) });
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, f.root), createCoordinator: () => co, item_sprite_reviewer: reviewer, portrait_generator: generator, portrait_store: f.store }, f.campaign);
  const result = await session.submitPlayerInput("I take the ivory figurine."); assert.equal(result.ok, true); assert.equal(f.item().sprite?.status, "pending");
  assert.equal(session.getInventoryVisuals("nicco").find(i => i.id === ID)?.sprite_status, "pending");
  const second = await session.submitPlayerInput("I look around."); assert.equal(second.ok, true); assert.equal(generator.requests.length, 1);
  release(); await session.itemSpritesSettled(); assert.equal(f.item().sprite?.status, "ready");
  assert.deepEqual((await session.readItemSprite(ID))?.bytes, PNG); assert.equal(await session.readItemSprite("../../secret"), undefined);
  assert.equal(inventoryVisualView(f.campaign.exportSnapshot(), "nicco").find(i => i.id === ID)?.sprite_status, "ready");
});
test("Stale lazy enrichment fails safely without changing established identity", async () => {
  const f = await fixture(); const old = f.campaign.exportSnapshot().items[0]!;
  let idle = true, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const jobs = new ItemSpriteJobs(f.campaign, { reviewer, store: f.store, generator: new Generator(), can_commit: () => idle,
    enrich: async () => { await gate; return "Brown leather boots."; } });
  jobs.request(old.id); await Promise.resolve(); idle = false;
  f.apply({ kind: "enrich_item_visual", item_id: old.id, visual_description: "Black leather boots." });
  release(); await jobs.settled(); idle = true;
  assert.doesNotThrow(() => jobs.flush());
  const item = f.campaign.exportSnapshot().items.find(i => i.id === old.id)!;
  assert.equal(item.visual_description, "Black leather boots."); assert.deepEqual(item.sprite, { status: "failed", error_code: "visual_commit_failed" });
});
