import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { CampaignSession } from "../src/persistence/campaign-session.js";
import { nodeSaveFileSystem, type SaveFileSystem } from "../src/persistence/filesystem.js";
import { CampaignSaveError } from "../src/persistence/errors.js";
import { decodeSave, validateSaveId } from "../src/persistence/save-format.js";
import { MAX_SAVE_BYTES } from "../src/persistence/strict-json.js";
import { WorldStore } from "../src/world/world-store.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { change, richCampaign } from "./persistence-fixtures.js";
import { fixtures, room } from "./fixtures.js";

async function temporary(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), "caldrevan-save-test-"));
  t.after(async () => {
    const target = resolve(root);
    assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith("caldrevan-save-test-"));
    await fs.rm(target, { recursive: true, force: true });
  });
  return root;
}
const ioFailure = () => Object.assign(new Error("simulated filesystem failure with private path"), { code: "EIO" });
const tick = (campaign: CampaignState) => change(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } });
const current = (root: string) => join(root, "fixture_campaign", "save.json");
const previous = (root: string) => join(root, "fixture_campaign", "save.previous.json");

test("real filesystem rich round trip, first save, session dirty tracking and unchanged rewrite", async t => {
  const root = join(await temporary(t), "saves"), { world, campaign } = richCampaign();
  let time = "2026-09-27T10:00:00.000Z";
  const repository = new FileCampaignRepository(world, root, { now: () => time }), session = new CampaignSession(campaign, repository);
  assert.equal(session.hasUnsavedChanges, true); assert.equal(session.last_saved_revision, null);
  const snapshot = campaign.exportSnapshot(), saved = await session.save();
  assert.equal(saved.status, "saved"); assert.equal(saved.revision, snapshot.revision); assert.equal(campaign.exportSnapshot(), snapshot);
  assert.equal(session.hasUnsavedChanges, false); assert.equal(session.last_saved_revision, snapshot.revision);
  await assert.rejects(fs.stat(previous(root)), { code: "ENOENT" });
  const loaded = await repository.loadCampaign("fixture_campaign"); assert.deepEqual(loaded.campaign.exportSnapshot(), snapshot);
  assert.equal(CampaignSession.fromLoaded(loaded, repository).hasUnsavedChanges, false);
  const text = await fs.readFile(current(root), "utf8");
  for (const excluded of ["last_saved_revision", "saved_revision", "Authorization", "VOYAGE_API_KEY", "embedding", "source_path", "NarrativeContext", "SceneRam", "preparation_receipt"]) assert.equal(text.includes(excluded), false);
  assert.equal(text.includes(root.replaceAll("\\", "\\\\")), false);
  time = "2026-09-27T11:00:00.000Z"; await session.save();
  assert.equal(campaign.revision, snapshot.revision);
  const rewritten = decodeSave(await fs.readFile(current(root), "utf8"), world);
  assert.equal(rewritten.metadata.saved_at, time); assert.equal(rewritten.metadata.created_at, "2026-09-27T10:00:00.000Z");
  assert.deepEqual(rewritten.snapshot, snapshot); assert.equal((await repository.loadCampaign("fixture_campaign", "previous")).campaign.revision, snapshot.revision);
  tick(campaign); assert.equal(session.hasUnsavedChanges, true);
  assert.equal((await repository.loadCampaign("fixture_campaign")).campaign.revision, snapshot.revision); // no autosave
});

test("three saves rotate exactly one previous successful snapshot", async t => {
  const root = await temporary(t), world = new WorldStore(fixtures());
  const campaign = new CampaignState(world, "fixture_campaign", { player_location: room, world_time: { world_minute: 0 } });
  const repository = new FileCampaignRepository(world, root);
  for (let revision = 1; revision <= 3; revision++) {
    tick(campaign); await repository.saveCampaign(campaign);
    assert.equal((await repository.loadCampaign("fixture_campaign")).campaign.revision, revision);
    if (revision > 1) assert.equal((await repository.loadCampaign("fixture_campaign", "previous")).campaign.revision, revision - 1);
  }
  assert.deepEqual((await fs.readdir(join(root, "fixture_campaign"))).sort(), ["save.json", "save.previous.json"]);
});

test("corrupt current fails explicitly; previous recovery is separate and corruption is never backed up", async t => {
  const root = await temporary(t), { world, campaign } = richCampaign(), repository = new FileCampaignRepository(world, root);
  await repository.saveCampaign(campaign); const first = campaign.exportSnapshot(); tick(campaign); await repository.saveCampaign(campaign);
  const backup = await fs.readFile(previous(root), "utf8"); await fs.writeFile(current(root), "{broken");
  await assert.rejects(repository.loadCampaign("fixture_campaign"), { code: "invalid_json" });
  const recovered = await repository.loadCampaign("fixture_campaign", "previous");
  assert.equal(recovered.slot, "previous"); assert.deepEqual(recovered.campaign.exportSnapshot(), first);
  await assert.rejects(repository.saveCampaign(campaign), { code: "invalid_json" });
  assert.equal(await fs.readFile(previous(root), "utf8"), backup); assert.equal(await fs.readFile(current(root), "utf8"), "{broken");
});

for (const failure of ["new_write", "backup_write", "backup_rename", "current_rename"] as const) test(`failed ${failure} preserves valid current and cleans temporary files`, async t => {
  const root = await temporary(t), { world, campaign } = richCampaign(), normal = new FileCampaignRepository(world, root);
  await normal.saveCampaign(campaign); tick(campaign); await normal.saveCampaign(campaign);
  const currentBefore = await fs.readFile(current(root), "utf8"), previousBefore = await fs.readFile(previous(root), "utf8");
  let writes = 0;
  const adapter: SaveFileSystem = { ...nodeSaveFileSystem,
    async writeNew(path, text) {
      writes++;
      if ((failure === "new_write" && writes === 1) || (failure === "backup_write" && writes === 2)) {
        await fs.writeFile(path, "partial temporary data", { flag: "wx" }); throw ioFailure();
      }
      await nodeSaveFileSystem.writeNew(path, text);
    },
    async rename(from, to) {
      if ((failure === "backup_rename" && to === previous(root)) || (failure === "current_rename" && to === current(root))) throw ioFailure();
      await nodeSaveFileSystem.rename(from, to);
    },
  };
  const repository = new FileCampaignRepository(world, root, { filesystem: adapter });
  const session = CampaignSession.fromLoaded(await repository.loadCampaign("fixture_campaign"), repository);
  const savedRevision = session.last_saved_revision; tick(session.campaign);
  await assert.rejects(session.save(), error => error instanceof CampaignSaveError && error.code === "io_error" && !error.message.includes("private path"));
  assert.equal(session.last_saved_revision, savedRevision); assert.equal(session.hasUnsavedChanges, true);
  assert.equal(await fs.readFile(current(root), "utf8"), currentBefore);
  assert.equal(await fs.readFile(previous(root), "utf8"), failure === "current_rename" ? currentBefore : previousBefore);
  assert.equal((await normal.loadCampaign("fixture_campaign")).campaign.revision, savedRevision);
  assert.equal((await fs.readdir(join(root, "fixture_campaign"))).some(name => name.endsWith(".tmp")), false);
});

test("first-save failure leaves no current, no backup and no saved revision", async t => {
  const root = await temporary(t), { world, campaign } = richCampaign();
  const adapter: SaveFileSystem = { ...nodeSaveFileSystem, async rename() { throw ioFailure(); } };
  const session = new CampaignSession(campaign, new FileCampaignRepository(world, root, { filesystem: adapter }));
  await assert.rejects(session.save(), { code: "io_error" }); assert.equal(session.last_saved_revision, null);
  assert.deepEqual(await fs.readdir(join(root, "fixture_campaign")), []);
});

test("cleanup failure leaves ignored temp files and preserves current", async t => {
  const root = await temporary(t), { world, campaign } = richCampaign(), normal = new FileCampaignRepository(world, root);
  await normal.saveCampaign(campaign); const before = campaign.exportSnapshot(); tick(campaign);
  const adapter: SaveFileSystem = { ...nodeSaveFileSystem,
    async writeNew(path) { await fs.writeFile(path, "partial", { flag: "wx" }); throw ioFailure(); }, async unlink() { throw ioFailure(); } };
  await assert.rejects(new FileCampaignRepository(world, root, { filesystem: adapter }).saveCampaign(campaign), { code: "io_error" });
  assert.ok((await fs.readdir(join(root, "fixture_campaign"))).some(name => name.endsWith(".tmp")));
  assert.deepEqual((await normal.loadCampaign("fixture_campaign")).campaign.exportSnapshot(), before);
  assert.equal((await normal.listSaves()).length, 1);
});

test("a post-replacement sync failure reports uncertainty without advancing saved revision", async t => {
  const root = await temporary(t), { world, campaign } = richCampaign(), normal = new FileCampaignRepository(world, root);
  await normal.saveCampaign(campaign); let syncs = 0;
  const adapter: SaveFileSystem = { ...nodeSaveFileSystem, async syncDirectory(path) { if (++syncs === 2) throw ioFailure(); await nodeSaveFileSystem.syncDirectory(path); } };
  const repository = new FileCampaignRepository(world, root, { filesystem: adapter });
  const session = CampaignSession.fromLoaded(await repository.loadCampaign("fixture_campaign"), repository), oldRevision = session.last_saved_revision!;
  tick(session.campaign); await assert.rejects(session.save(), { code: "io_error" });
  assert.equal(session.last_saved_revision, oldRevision); assert.equal(session.hasUnsavedChanges, true);
  assert.equal((await normal.loadCampaign("fixture_campaign")).campaign.revision, oldRevision + 1);
  assert.equal((await normal.loadCampaign("fixture_campaign", "previous")).campaign.revision, oldRevision);
});

test("in-flight save captures requested revision; later gameplay stays dirty; same-process races reject", async t => {
  const root = await temporary(t), { world, campaign } = richCampaign();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
  const adapter: SaveFileSystem = { ...nodeSaveFileSystem, async writeNew(path, text) { started(); await gate; await nodeSaveFileSystem.writeNew(path, text); } };
  const repository = new FileCampaignRepository(world, root, { filesystem: adapter }), session = new CampaignSession(campaign, repository);
  const snapshot = campaign.exportSnapshot(), pending = session.save();
  await entered;
  try {
    tick(campaign); await assert.rejects(session.save(), { code: "save_in_progress" });
    await assert.rejects(new FileCampaignRepository(world, root).saveCampaign(campaign), { code: "save_in_progress" });
  } finally { release(); }
  const result = await pending; assert.equal(result.revision, snapshot.revision); assert.equal(session.last_saved_revision, snapshot.revision);
  assert.equal(session.hasUnsavedChanges, true); assert.deepEqual((await repository.loadCampaign("fixture_campaign")).campaign.exportSnapshot(), snapshot);
});

test("listing is read-only metadata and distinguishes missing, corrupt, version and dataset failures", async t => {
  const root = join(await temporary(t), "saves"), { world, campaign } = richCampaign(), repository = new FileCampaignRepository(world, root);
  assert.deepEqual(await repository.listSaves(), []); await assert.rejects(fs.stat(root), { code: "ENOENT" });
  await repository.saveCampaign(campaign); const text = await fs.readFile(current(root), "utf8");
  for (const [id, contents] of [["broken", "{bad"], ["future", text.replace('"campaign_id": "fixture_campaign"', '"campaign_id": "future"').replace('"schema_version": 2', '"schema_version": 3')]]) {
    await fs.mkdir(join(root, id!)); await fs.writeFile(join(root, id!, "save.json"), contents!);
  }
  await fs.mkdir(join(root, "empty")); await fs.writeFile(join(root, "empty", ".save-stale.tmp"), "{}");
  const entries = await repository.listSaves();
  assert.equal(entries.find(e => e.campaign_id === "fixture_campaign")!.current.status, "valid");
  assert.equal(entries.find(e => e.campaign_id === "fixture_campaign")!.previous.status, "not_found");
  assert.equal(entries.find(e => e.campaign_id === "broken")!.current.status, "invalid_json");
  assert.equal(entries.find(e => e.campaign_id === "future")!.current.status, "unsupported_version");
  assert.equal(entries.find(e => e.campaign_id === "empty")!.current.exists, false);
  assert.equal(JSON.stringify(entries).includes("Fixture A"), false);
  const sources = fixtures(); sources[0]!.document.entity.summary = "changed canon";
  assert.equal((await new FileCampaignRepository(new WorldStore(sources), root).listSaves()).find(e => e.campaign_id === "fixture_campaign")!.current.status, "valid");
});

test("path traversal, absolute paths and Windows device IDs never reach filesystem", async t => {
  const root = await temporary(t), { world } = richCampaign(); let touched = false;
  const adapter: SaveFileSystem = { ...nodeSaveFileSystem, async info() { touched = true; throw ioFailure(); } };
  const repository = new FileCampaignRepository(world, root, { filesystem: adapter });
  for (const id of ["../escape", "..", "/absolute", "C:\\escape", "C:escape", "a/b", "a\\b", "a:stream", "a.", "con", "nul", "com1", "lpt9", "a".repeat(121)]) {
    assert.throws(() => validateSaveId(id), { code: "invalid_id" });
    await assert.rejects(repository.loadCampaign(id), { code: "invalid_id" });
  }
  assert.equal(touched, false); assert.throws(() => new FileCampaignRepository(world, "data/world/saves"), { code: "unsafe_path" });
});

test("campaign-directory junctions and hard-linked save files are rejected", async t => {
  const base = await temporary(t), root = join(base, "saves"), outside = join(base, "outside"), { world, campaign } = richCampaign();
  await fs.mkdir(root); await fs.mkdir(outside); await fs.writeFile(join(outside, "sentinel"), "unchanged");
  await fs.symlink(outside, join(root, "fixture_campaign"), "junction");
  const repository = new FileCampaignRepository(world, root);
  await assert.rejects(repository.saveCampaign(campaign), { code: "unsafe_path" });
  await assert.rejects(repository.loadCampaign("fixture_campaign"), { code: "unsafe_path" });
  assert.equal((await repository.listSaves())[0]!.current.status, "unsafe_path");
  assert.equal(await fs.readFile(join(outside, "sentinel"), "utf8"), "unchanged");
  await fs.unlink(join(root, "fixture_campaign")); await fs.mkdir(join(root, "fixture_campaign"));
  await fs.link(join(outside, "sentinel"), current(root));
  await assert.rejects(repository.loadCampaign("fixture_campaign"), { code: "unsafe_path" });
});

test("configured root junction is rejected and files remain portable across roots/canon source paths", async t => {
  const base = await temporary(t), root = join(base, "first"), second = join(base, "second"), { world, campaign } = richCampaign();
  await new FileCampaignRepository(world, root).saveCampaign(campaign);
  await fs.mkdir(join(second, "fixture_campaign"), { recursive: true }); await fs.copyFile(current(root), current(second));
  const alternate = new WorldStore(fixtures().map(s => ({ ...s, source: join(base, "alternate_canon", basename(s.source)) })));
  assert.equal(alternate.datasetId, world.datasetId);
  assert.deepEqual((await new FileCampaignRepository(alternate, second).loadCampaign("fixture_campaign")).campaign.exportSnapshot(), campaign.exportSnapshot());
  const linked = join(base, "linked"); await fs.symlink(root, linked, "junction");
  await assert.rejects(new FileCampaignRepository(world, linked).loadCampaign("fixture_campaign"), { code: "unsafe_path" });
});

test("missing files, invalid UTF-8, oversized saves and unexpected I/O are typed", async t => {
  const root = await temporary(t), { world } = richCampaign(), repository = new FileCampaignRepository(world, root);
  await assert.rejects(repository.loadCampaign("fixture_campaign"), { code: "not_found" });
  await fs.mkdir(join(root, "fixture_campaign")); await fs.writeFile(current(root), Buffer.from([0xff, 0xfe, 0xff]));
  await assert.rejects(repository.loadCampaign("fixture_campaign"), { code: "invalid_json" });
  const handle = await fs.open(current(root), "w"); try { await handle.truncate(MAX_SAVE_BYTES + 1); } finally { await handle.close(); }
  await assert.rejects(repository.loadCampaign("fixture_campaign"), { code: "invalid_save" });
  const adapter: SaveFileSystem = { ...nodeSaveFileSystem, async info() { throw ioFailure(); } };
  await assert.rejects(new FileCampaignRepository(world, root, { filesystem: adapter }).loadCampaign("fixture_campaign"), { code: "io_error" });
});
