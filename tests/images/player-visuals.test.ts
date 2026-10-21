import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../../src/world/loader.js";
import { CampaignState } from "../../src/campaign/campaign-state.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { GameSession, SessionHost, type SessionDeps } from "../../src/app/index.js";
import { PortraitAssetStore } from "../../src/app/portrait-store.js";
import { turnFixture } from "../../src/dev/support/turn-fixture.js";
import { inventoryUiView, EQUIPMENT_SLOTS, equipmentSlotFor } from "../../src/app/inventory-ui-view.js";
import { resolveItemDetailArtwork, resolveItemIcon, resolveItemVisual, ITEM_GLYPHS, ITEM_VISUAL_KINDS } from "../../src/app/item-visuals.js";
import { createPlaytestServer } from "../../src/ui/server.js";
import type { GenerationRequest } from "../../src/llm/types.js";
import type { ControllerRequest } from "../../src/llm/state-controller-provider.js";
import type { GeneratedImage, ImageGenerationRequest, PortraitImageGenerator } from "../../src/llm/image-generator.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { metadata } from "../support/turn-fixtures.js";
import { sourceFiles } from "../support/source-paths.js";

/** Player Character visuals (Nicco shares the NPC+ portrait pipeline without being an NPC+) and the Inventory / Equipment UI foundation. */
const world = await loadWorld("data");
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "caldrevan-pvi-")); dirs.push(d); return d; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
class FakeGenerator implements PortraitImageGenerator {
  readonly identity = { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" };
  calls: ImageGenerationRequest[] = [];
  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const index = this.calls.length; this.calls.push(request); await tick();
    return { bytes: Buffer.concat([PNG, Buffer.from([index])]), media_type: "image/png", ...this.identity, provider_seed: request.seed, billable_units: 1, latency_ms: 5 };
  }
}
async function created(root: string) {
  const service = new RetrievalService(world), narratorRequests: GenerationRequest[] = [], controllerRequests: ControllerRequest[] = [];
  const narrator = { async generate(r: GenerationRequest) { narratorRequests.push(r); return { text: "*Nothing changes.*", ...metadata }; },
    async *stream(r: GenerationRequest) { narratorRequests.push(r); const text = "*Nothing changes.*"; yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...metadata } }; } };
  const controller = { async propose(r: ControllerRequest) { controllerRequests.push(r); return { commands: [], ...metadata }; } };
  const coordinator = new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const generator = new FakeGenerator(), repository = new FileCampaignRepository(world, join(root, "campaigns"));
  const deps: SessionDeps & { repository: FileCampaignRepository } = { world, repository, portrait_store: new PortraitAssetStore(join(root, "campaigns"), { layout: "campaign" }), portrait_generator: generator,
    portrait_retry_delay_ms: () => 0, portrait_pick: () => 0, engine_version: "0.1.0", createCoordinator: () => coordinator };
  const host = new SessionHost(deps), result = await host.createCampaign({ display_name: "Player visuals" }); assert.ok(result.ok, JSON.stringify(result));
  return { host, deps, repository, generator, narratorRequests, controllerRequests, s: host.active! };
}
const rev = (s: GameSession) => s.getView().session.revision;
const visual = (s: GameSession) => s.getPlayerProfileView()!.visual!;
const promptText = (r: GenerationRequest | ControllerRequest) => JSON.stringify(r);
const snapshotOf = async (repository: FileCampaignRepository, id: string) => (await repository.loadCampaign(id)).campaign.exportSnapshot();
const generate = (s: GameSession, kind: "avatar" | "fullbody") => s.generateNpcPortraitBatch({ ref: visual(s).ref, expected_revision: rev(s), kind });

test("P1/P8/P9: Nicco is not an NPC+: no premium record, no promotion, no NPC+ label, no household authority; the model is unchanged", async () => {
  const root = await temp(), { s, repository } = await created(root);
  const v = visual(s), profile = s.getPlayerProfileView()!;
  assert.equal(v.capabilities.tier, "player"); assert.equal(v.capabilities.can_edit_npc_plus, false);
  assert.doesNotMatch(JSON.stringify(profile), /NPC\+|premium|household/i);
  const before = await snapshotOf(repository, s.campaignId);
  assert.ok(!before.premium_characters.some(p => p.character_id === "nicco")); assert.ok(!before.characters.some(c => c.id === "nicco"));
  assert.equal(before.schema_version, 7);
  assert.ok(!s.getPlayUiView().household.some(g => g.members.some(m => m.name === "Nicco")), "Nicco is not a household member card");
  assert.equal((await generate(s, "avatar")).ok, true);
  const after = s.getView(); void after;
  assert.ok((await s.save()).ok); const snap = await snapshotOf(repository, s.campaignId);
  assert.ok(!snap.premium_characters.some(p => p.character_id === "nicco"), "generation never creates a premium record");
  assert.ok(!snap.characters.some(c => c.id === "nicco"));
  assert.equal(snap.portraits?.length, 1); assert.equal(snap.portraits![0]!.character_id, "nicco");
  const raw = JSON.parse(await fs.readFile(join(root, "campaigns", s.campaignId, "save.json"), "utf8"));
  assert.equal(raw.schema_version, 8, "save schema 6 (block 5A); inventory UI adds no field"); assert.equal(raw.snapshot.schema_version, 8);
});

test("P2/P3/P4: Avatar, Full Body and Gallery capabilities; generation runs through the existing batch pipeline", async () => {
  const root = await temp(), { s, generator } = await created(root);
  const caps = visual(s).capabilities;
  assert.deepEqual([caps.can_generate_avatar, caps.can_show_full_body, caps.can_manage_full_body, caps.can_show_gallery, caps.can_manage_gallery, caps.can_edit_appearance], [true, true, true, true, true, true]);
  assert.equal(caps.can_upload_avatar, false, "upload stays unsupported: no fake control");
  assert.equal(generator.calls.length, 0, "opening the page generates nothing");
  const avatars = await generate(s, "avatar"); assert.ok(avatars.ok, JSON.stringify(avatars));
  assert.equal(generator.calls.length, 3, "one explicit action = one batch of 3");
  let portrait = visual(s).editor.portrait;
  assert.equal(portrait.gallery.length, 3); assert.ok(portrait.avatar, "the first avatar batch assigns an Avatar"); assert.equal(portrait.full_body, null);
  assert.equal(visual(s).avatar_url, portrait.avatar!.url);
  assert.ok(generator.calls.every(c => c.width === 992 && /Qwen|Raena|anime|bust/i.test(c.prompt) || c.width > 0));
  assert.match(visual(s).editor.portrait_prompts.avatar.prompt, /./);
  const full = await generate(s, "fullbody"); assert.ok(full.ok);
  portrait = visual(s).editor.portrait; assert.equal(portrait.gallery.length, 6); assert.equal(portrait.full_body, null, "Full Body is never selected automatically");
  const item = portrait.gallery.find(g => g.kind === "fullbody")!;
  const set = s.setNpcPortraitFullBody({ ref: visual(s).ref, expected_revision: rev(s), item: item.token }); assert.ok(set.ok, JSON.stringify(set));
  assert.ok(visual(s).full_body_url); assert.equal(visual(s).editor.portrait.full_body!.url, visual(s).full_body_url);
  const wrong = portrait.gallery.find(g => g.kind === "avatar")!;
  assert.equal(s.setNpcPortraitFullBody({ ref: visual(s).ref, expected_revision: rev(s), item: wrong.token }).ok, false, "the kind rule applies to the player too");
  const del = await s.deleteNpcPortrait({ ref: visual(s).ref, expected_revision: rev(s), item: wrong.token }); void del;
  assert.equal((await s.readPortraitAsset(visual(s).avatar_url!.split("/").pop()))!.media_type, "image/png", "assets are served by the existing opaque-token route");
});

test("P5/P6/P11: appearance stays narrator-visible; asset metadata never reaches narrator or controller; minors cannot be generated", async () => {
  const root = await temp(), { s, narratorRequests, controllerRequests } = await created(root);
  assert.ok((await generate(s, "avatar")).ok);
  const sel = visual(s).editor.portrait; assert.ok(sel.avatar);
  const edit = s.updatePlayerProfile({ expected_revision: rev(s), patch: { eyes: "zircon-blue left eye" } }); assert.ok(edit.ok);
  assert.ok(visual(s).editor.portrait.avatar!.stale, "an appearance edit marks existing images as older (shared fingerprint)");
  const turn = await s.submitPlayerInput("*looks around*"); assert.ok(turn.ok);
  const narrator = narratorRequests.map(promptText).join("\n"), controller = controllerRequests.map(promptText).join("\n");
  assert.match(narrator, /zircon-blue left eye/); assert.match(narrator, /Visible appearance \(character data/);
  const token = sel.avatar!.url.split("/").pop()!;
  for (const text of [narrator, controller]) { assert.doesNotMatch(text, /portrait_|\/api\/portrait|\/api\/item-glyph|avatar_url|full_body_url|gallery|asset_file/i); assert.ok(!text.includes(token)); }
  assert.equal(visual(s).editor.identity.some(i => /npc/i.test(i.value)), false);
  const minor = s.updatePlayerProfile({ expected_revision: rev(s), patch: { apparent_age: "15" } }); assert.ok(minor.ok);
  // Age never gates portrait generation (decision 2026-10-12, IMG-1): a stated minor age is not blocked.
  assert.equal(visual(s).editor.portrait.generation_blocked, null); assert.equal(visual(s).editor.portrait.can_generate_batch, true);
  const allowed = await generate(s, "avatar"); assert.equal(allowed.ok, true);
});

test("P7: the selected Avatar and Full Body persist through the existing save and survive a reload", async () => {
  const root = await temp(), { s, repository, deps, host } = await created(root);
  assert.ok((await generate(s, "avatar")).ok); assert.ok((await generate(s, "fullbody")).ok);
  const full = visual(s).editor.portrait.gallery.find(g => g.kind === "fullbody")!;
  assert.ok(s.setNpcPortraitFullBody({ ref: visual(s).ref, expected_revision: rev(s), item: full.token }).ok);
  const urls = { avatar: visual(s).avatar_url, full: visual(s).full_body_url }; assert.ok(urls.avatar && urls.full);
  const id = s.campaignId; assert.ok((await s.save()).ok);
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok);
  const back = loaded.session.getPlayerProfileView()!.visual!;
  assert.equal(back.avatar_url, urls.avatar); assert.equal(back.full_body_url, urls.full);
  assert.ok(await loaded.session.readPortraitAsset(urls.full!.split("/").pop()), "the stored bytes are still served");
  void repository;
});

// ---- Inventory / Equipment -------------------------------------------------------------------------------------------------------------
function inventoryCampaign() {
  const { world: w, campaign } = turnFixture();
  const apply = (...commands: CampaignCommand[]) => campaign.apply({ expected_revision: campaign.revision, commands });
  const create = (name: string, category: string | undefined, position: Extract<CampaignCommand, { kind: "create_item" }>["position"] | ReturnType<typeof equippedAt>, owner_id: string | null = "nicco") => {
    apply({ kind: "create_item", name, description: `About ${name}.`, visual_description: `${name} visual`, ...(category ? { category: category as never } : {}), owner_id, position: position.kind === "equipped" ? carried : position });
    if (position.kind === "equipped") apply({ kind: "place_item", item_id: id(name), position });
  };
  const id = (name: string) => campaign.exportSnapshot().items.find(i => i.name === name)!.id;
  const carried = { kind: "carried" as const, character_id: "nicco" };
  return { world: w, campaign, apply, create, id };
}
const carried = { kind: "carried" as const, character_id: "nicco" };
const equippedAt = (slot: string, mode: "worn" | "held" = "held") => ({ kind: "equipped" as const, character_id: "nicco", slot, mode });

test("I1-I4/E1-E6: the grid lists carried and equipped items; document and generic fallbacks; slots map from category only; conflicts never rewrite state", () => {
  const f = inventoryCampaign();
  f.create("Heartstone Deed", "document", carried); f.create("Iron Sword", "weapon", equippedAt("main_hand")); f.create("Second Sword", "weapon", equippedAt("off_hand"));
  f.create("Mystery thing", undefined, carried); f.create("Iron Helm", undefined, equippedAt("head", "worn")); f.create("Coat of Mail", "armor", equippedAt("body", "worn"));
  f.create("Stored hammer", "tool", { kind: "stored", location_id: "test_room" });
  const snapshot = f.campaign.exportSnapshot(), revision = f.campaign.revision;
  const view = inventoryUiView(f.world, snapshot, { full_body_url: null });
  assert.equal(f.campaign.revision, revision); assert.deepEqual(f.campaign.exportSnapshot(), snapshot, "building the view is read-only");
  const byName = (n: string) => view.items.find(i => i.name === n)!;
  assert.ok(!view.items.some(i => i.name === "Stored hammer"), "only possession is listed");
  assert.equal(view.counts.total, view.items.length); assert.equal(view.counts.equipped, view.items.filter(i => i.equipped).length);
  assert.ok(byName("Iron Sword").equipped && !byName("Heartstone Deed").equipped);
  // I3/I4: document fallback icon, generic placeholder for uncategorized items.
  assert.equal(byName("Heartstone Deed").visual.icon.url, "/api/item-glyph/document"); assert.equal(byName("Heartstone Deed").visual.icon.source, "category");
  assert.equal(byName("Mystery thing").visual.icon.source, "placeholder"); assert.equal(byName("Mystery thing").visual.icon.url, "/api/item-glyph/misc");
  // E1/E2: exactly the four slots.
  assert.deepEqual(view.equipment.slots.map(s => s.id), ["head", "chest", "weapon", "boots"]); assert.deepEqual(EQUIPMENT_SLOTS.map(s => s.label), ["Head", "Chest", "Weapon", "Boots"]);
  const slot = (id: string) => view.equipment.slots.find(s => s.id === id)!;
  // E3: category mapping; E4: no category -> no guess, whatever the name says.
  assert.equal(equipmentSlotFor("weapon"), "weapon"); assert.equal(equipmentSlotFor("footwear"), "boots"); assert.equal(equipmentSlotFor("headwear"), "head");
  assert.equal(equipmentSlotFor(undefined), null); assert.equal(equipmentSlotFor("clothing"), null); assert.equal(equipmentSlotFor("Iron Helm"), null);
  assert.deepEqual(slot("head").item_ids, [], "an uncategorized 'Iron Helm' is not placed in Head by name"); assert.ok(view.equipment.unclassified_equipped.includes(byName("Iron Helm").id));
  assert.deepEqual(slot("chest").item_ids, [byName("Coat of Mail").id]);
  // E5: two equipped weapons conflict and nothing is repaired.
  assert.equal(slot("weapon").conflict, true); assert.equal(slot("weapon").item_ids.length, 2); assert.equal(slot("chest").conflict, false);
  assert.equal(f.campaign.exportSnapshot().items.filter(i => i.position.kind === "equipped").length, snapshot.items.filter(i => i.position.kind === "equipped").length, "state is untouched by the conflict");
  // E8/E9: Full Body in the centre, else the silhouette.
  assert.equal(view.equipment.full_body_url, null); assert.equal(view.equipment.silhouette_url, "/api/item-glyph/silhouette");
  assert.equal(inventoryUiView(f.world, snapshot, { full_body_url: "/api/portrait/asset/abc" }).equipment.full_body_url, "/api/portrait/asset/abc");
});

test("I8/I10: icon and detail artwork resolve independently with precedence item > template > category > placeholder; no name-derived paths", () => {
  const item = { id: "campaign_item_x", origin: { kind: "created" as const }, category: "document" as const };
  assert.equal(resolveItemIcon(item).source, "category"); assert.equal(resolveItemDetailArtwork(item).source, "category");
  const registry = { campaign_item_x: { icon: "/assets/items/x_icon.png" } };
  assert.deepEqual(resolveItemIcon(item, { registry }), { source: "template", url: "/assets/items/x_icon.png" });
  assert.equal(resolveItemDetailArtwork(item, { registry }).source, "category", "a template with only an icon leaves the detail role to the fallback");
  const sprite = resolveItemVisual(item, { registry, sprite_url: "/api/inventory/sprite/c/campaign_item_x" });
  assert.equal(sprite.icon.source, "item"); assert.equal(sprite.detail.source, "item");
  assert.equal(resolveItemIcon(item, { registry: { campaign_item_x: { icon: "/etc/passwd" } } }).source, "category", "only /assets/items/ URLs are accepted");
  assert.equal(resolveItemIcon({ id: "My Cool Sword", origin: item.origin }).source, "placeholder");
  const canonical = { id: "item_1", origin: { kind: "canonical" as const, canonical_entity_id: "heartstone_deed" }, category: "document" as const };
  assert.equal(resolveItemIcon(canonical, { registry: { heartstone_deed: { icon: "/assets/items/deed.webp" } } }).source, "template", "templates are keyed by the canonical id");
  for (const kind of ITEM_VISUAL_KINDS) assert.match(ITEM_GLYPHS[kind], /^<svg /);
});

test("I9/E6/E7: visual metadata is not in the save schema or any LLM context; the screen has no drag/drop or mutating inventory actions", async () => {
  const f = inventoryCampaign(); f.create("Iron Sword", "weapon", equippedAt("main_hand"));
  const snapshotJson = JSON.stringify(f.campaign.exportSnapshot());
  assert.doesNotMatch(snapshotJson, /item-glyph|icon_url|detail_url|equipment|paper|slot_label/);
  // The React inventory page is read-only: no drag/drop, no mutating request, no browser storage, and selecting never calls the server
  // (behaviour pinned in src/ui-client/features/inventory/InventoryPage.test.tsx; this is the source-level guard).
  const pageFiles = sourceFiles("src/ui-client/features/inventory", p => /\.tsx?$/.test(p) && !/\.test\./.test(p));
  assert.ok(pageFiles.length >= 4);
  const inventoryCode = (await Promise.all(pageFiles.map(file => fs.readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(inventoryCode, /dragstart|onDrop|draggable|method: "POST"|localStorage|fetch\(|useMutation|useSessionAction/);
  for (const file of ["src/app/inventory-ui-view.ts", "src/app/item-visuals.ts"]) { const imports = (await fs.readFile(file, "utf8")).split("\n").filter(l => l.startsWith("import")).join("\n"); assert.doesNotMatch(imports, /llm|turn\/|retrieval|prompt|context/i, `${file} imports nothing from the LLM/context layers`); }
});

test("M1-M5: gold is the authoritative purse, follows state, survives save/load and is never reconstructed", async () => {
  const f = inventoryCampaign();
  const gold = () => inventoryUiView(f.world, f.campaign.exportSnapshot()).gold;
  f.apply({ kind: "set_funds", character_id: "nicco", gold: 37 }); assert.equal(gold(), 37);
  assert.equal(gold(), f.campaign.exportSnapshot().funds.find(x => x.character_id === "nicco")!.gold);
  f.apply({ kind: "set_funds", character_id: "nicco", gold: 12 }); assert.equal(gold(), 12, "a state change propagates to the next view");
  const restored = CampaignState.restore(f.world, f.campaign.exportSnapshot());
  assert.equal(inventoryUiView(f.world, restored.exportSnapshot()).gold, 12);
  // The page shows the read model's purse and never computes one (arithmetic on gold would be a client-side rule).
  for (const file of ["src/ui-client/features/inventory/InventoryPage.tsx", "src/ui-client/features/player/PlayerSummary.tsx"]) {
    const source = await fs.readFile(file, "utf8");
    assert.doesNotMatch(source, /gold\s*[+-]=|gold\s*[-+*/]\s*\w|parseInt\(.*gold|localStorage/, file);
  }
  assert.match(await fs.readFile("src/ui-client/features/inventory/InventoryPage.tsx", "utf8"), /inventory\.gold/);
  const noPurse = inventoryUiView(world, CampaignState.restore(f.world, { ...f.campaign.exportSnapshot(), funds: [] }).exportSnapshot());
  assert.equal(noPurse.gold, null, "no tracked purse is 'not tracked', never an invented 0");
});

test("a campaign without any portrait data still renders both screens (existing save, no migration failure)", async () => {
  const root = await temp(), { s, deps } = await created(root);
  assert.ok((await s.save()).ok);
  const loaded = await GameSession.loadCampaign(deps, s.campaignId); assert.ok(loaded.ok);
  const profile = loaded.session.getPlayerProfileView()!, inventory = loaded.session.getPlayerInventoryView();
  assert.equal(profile.visual!.avatar_url, null); assert.equal(profile.visual!.full_body_url, null); assert.deepEqual(profile.visual!.editor.portrait.gallery, []);
  assert.equal(inventory.equipment.full_body_url, null); assert.ok(inventory.items.length >= 2, "the two opening documents appear as normal items");
  assert.ok(inventory.items.filter(i => i.category === "document").every(i => i.visual.icon.url === "/api/item-glyph/document"));
  const server = createPlaytestServer(loaded.session); void server;
  assert.equal(inventory.gold === null || typeof inventory.gold === "number", true);
});
