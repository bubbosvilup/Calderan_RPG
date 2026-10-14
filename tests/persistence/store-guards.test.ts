import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCampaignRepository, assetKey } from "../../src/persistence/campaign-repository.js";
import { decodeStore } from "../../src/persistence/optional-store.js";
import { nodeSaveFileSystem } from "../../src/persistence/filesystem.js";
import { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { WorldStore } from "../../src/world/world-store.js";
import { fixtures, room } from "../support/world-fixtures.js";

/**
 * Block B4 (P3): side-store guards.
 *   N2  a checkpoint carries a copy of each side store and loads with it, so one damaged store no longer blocks every recovery point;
 *       checkpoints written before B4 (no copies) load as before; a copy that is present but damaged is a hard error, never a silent fallback;
 *       rotation removes the copies with their checkpoint, and stray copies from an interrupted checkpoint.
 *   N3  an older slot loaded beside a newer media store drops a ready sprite whose visual identity that slot's item does not have, instead of failing.
 */
const world = new WorldStore(fixtures()), ID = "fixture_campaign", CUP = "campaign_item_cup";
async function temporary(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), "caldrevan-store-guard-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
function campaign(): CampaignState {
  const c = new CampaignState(world, ID, { player_location: room, world_time: { world_minute: 0 } });
  c.apply({ expected_revision: 0, commands: [{ kind: "register_item", item: { id: CUP, origin: { kind: "created" }, name: "Cup", position: { kind: "stored", location_id: room } } }] });
  return c;
}
const apply = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
/** Revision +1: the cup gains its visual identity; then (optional media, no revision) a ready sprite drawn from it. */
function drawCup(c: CampaignState) {
  apply(c, { kind: "enrich_item_visual", item_id: CUP, visual_description: "A dented tin cup." });
  apply(c, { kind: "set_item_sprite", item_id: CUP, sprite: { status: "pending" } });
  apply(c, { kind: "set_item_sprite", item_id: CUP, sprite: { status: "ready", asset_ref: "portrait_cup.png", generated_from_visual_description: "A dented tin cup." } });
}
let clock = Date.parse("2026-10-14T10:00:00.000Z");
const repo = (root: string, options: { max_backups?: number } = {}) => new FileCampaignRepository(world, root, { now: () => new Date(clock += 1000).toISOString(), ...options });
const backups = async (root: string) => (await fs.readdir(join(root, ID, "backups"))).sort();

test("N2: every checkpoint is written with a copy of each side store, bound to the campaign and the checkpoint's revision", async t => {
  const root = await temporary(t), repository = repo(root), c = campaign();
  await repository.saveCampaign(c, { metadata: { save_reason: "manual" } });
  const [checkpoint, ...copies] = (await backups(root)).sort((a, b) => a.length - b.length);
  assert.match(checkpoint!, /^r00000001-\d{8}T\d{9}Z\.json$/);
  assert.deepEqual(copies.sort(), [checkpoint!.replace(".json", ".learning.json"), checkpoint!.replace(".json", ".media.json")]);
  for (const store of ["learning", "media"] as const) assert.equal(decodeStore(await fs.readFile(join(root, ID, "backups", checkpoint!.replace(".json", `.${store}.json`)), "utf8"), store, ID).bound_revision, 1);
  assert.deepEqual(await repository.listBackups(ID), [checkpoint], "the copies are never listed as slots");
});

test("N2: with the campaign's learning store damaged, the current slot refuses but a checkpoint loads with its own copies", async t => {
  const root = await temporary(t), repository = repo(root), c = campaign();
  await repository.saveCampaign(c, { metadata: { save_reason: "manual" } });
  const [checkpoint] = await repository.listBackups(ID);
  await fs.writeFile(join(root, ID, "optional", "learning.json"), "{");
  await assert.rejects(repository.loadCampaign(ID), { code: "optional_state_invalid" });
  const loaded = await repository.loadCampaign(ID, `backup:${checkpoint!}`);
  assert.equal(loaded.campaign.revision, 1); assert.deepEqual(loaded.optional_state_source, { learning: "side_store", media: "side_store" });
  // The next save rewrites the damaged store from the recovered state (the copy is never the campaign's store).
  await repository.saveCampaign(loaded.campaign, { metadata: { save_reason: "manual" } });
  assert.equal((await repository.loadCampaign(ID)).campaign.revision, 1);
});

test("N2: a checkpoint without copies (written before B4) loads with the campaign's store; a damaged copy is a hard error", async t => {
  const root = await temporary(t), repository = repo(root), c = campaign();
  await repository.saveCampaign(c, { metadata: { save_reason: "manual" } });
  const [checkpoint] = await repository.listBackups(ID), copy = (store: string) => join(root, ID, "backups", checkpoint!.replace(".json", `.${store}.json`));
  await fs.unlink(copy("learning")); await fs.unlink(copy("media"));
  assert.equal((await repository.loadCampaign(ID, `backup:${checkpoint!}`)).campaign.revision, 1, "pre-B4 checkpoint: shared store");
  await fs.writeFile(copy("media"), "{");
  await assert.rejects(repository.loadCampaign(ID, `backup:${checkpoint!}`), { code: "optional_state_invalid" }, "a present copy is never skipped");
});

test("N2: rotation removes the copies with their checkpoint, and stray copies of a checkpoint that never completed", async t => {
  const root = await temporary(t), repository = repo(root, { max_backups: 2 }), c = campaign();
  await repository.saveCampaign(c, { metadata: { save_reason: "manual" } });
  await fs.writeFile(join(root, ID, "backups", "r00000000-20260101T000000000Z.learning.json"), "stray");
  for (let i = 0; i < 2; i++) { apply(c, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } }); await repository.saveCampaign(c, { metadata: { save_reason: "manual" } }); }
  const kept = await repository.listBackups(ID);
  assert.equal(kept.length, 2);
  assert.deepEqual(await backups(root), kept.flatMap(k => [k, k.replace(".json", ".learning.json"), k.replace(".json", ".media.json")]).sort());
});

test("N2: asset references held only by a checkpoint's media copy are retained", async t => {
  const root = await temporary(t), repository = repo(root), c = campaign();
  drawCup(c);
  await repository.saveCampaign(c, { metadata: { save_reason: "manual" } });
  // Drop the sprite from the campaign's own media store (as a newer gallery would) without a new checkpoint.
  const media = join(root, ID, "optional", "media.json"), store = JSON.parse(await fs.readFile(media, "utf8"));
  assert.equal(store.data.item_sprites.length, 1);
  await fs.unlink(media);
  const refs = await repository.retainedAssetReferences(ID);
  assert.equal(refs.references.has(assetKey(CUP, "portrait_cup.png")), true);
});

test("N3: an older slot beside a newer media store loads, dropping the sprite its item cannot carry; the current slot keeps it", async t => {
  const root = await temporary(t), repository = repo(root), c = campaign();
  await repository.saveCampaign(c, { metadata: { save_reason: "autosave" } });
  drawCup(c);
  await repository.saveCampaign(c, { metadata: { save_reason: "autosave" } });
  const current = await repository.loadCampaign(ID), older = await repository.loadCampaign(ID, "previous");
  assert.equal(current.campaign.exportSnapshot().items.find(i => i.id === CUP)?.sprite?.status, "ready");
  const cup = older.campaign.exportSnapshot().items.find(i => i.id === CUP);
  assert.equal(older.campaign.revision, 1); assert.equal(cup?.visual_description, undefined); assert.equal(cup?.sprite, undefined, "the newer sprite is not merged into the older item");
});

test("N2 crash point: the checkpoint rename fails after its copies were written; the save stands, and the stray copies go at the next rotation", async t => {
  const root = await temporary(t), c = campaign();
  let fail = true;
  const filesystem = { ...nodeSaveFileSystem, async rename(from: string, to: string) { if (fail && /backups[\\/]r\d+-\d{8}T\d{9}Z\.json$/.test(to)) throw Object.assign(new Error("crash"), { code: "EIO" }); return nodeSaveFileSystem.rename(from, to); } };
  const broken = new FileCampaignRepository(world, root, { filesystem, now: () => new Date(clock += 1000).toISOString() });
  const saved = await broken.saveCampaign(c, { metadata: { save_reason: "manual" } });
  assert.equal(saved.checkpoint_failed, true); assert.equal((await broken.loadCampaign(ID)).campaign.revision, 1);
  assert.deepEqual(await broken.listBackups(ID), []);
  assert.equal((await backups(root)).filter(n => /\.(learning|media)\.json$/.test(n)).length, 2, "the copies of the failed checkpoint are left behind");
  fail = false; apply(c, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } });
  await broken.saveCampaign(c, { metadata: { save_reason: "manual" } });
  const [kept] = await broken.listBackups(ID);
  assert.deepEqual(await backups(root), [kept!, kept!.replace(".json", ".learning.json"), kept!.replace(".json", ".media.json")].sort());
});
