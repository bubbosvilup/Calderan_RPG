import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { nodeSaveFileSystem } from "../../src/persistence/filesystem.js";
import { OPTIONAL_STORE_VERSIONS, canonicalJson, contentDigest, decodeStore, encodeStore, optionalStoreFile, writeStoreFile } from "../../src/persistence/optional-store.js";
import { corePartition, extractOptionalState, portraitSelections, toPersistedSnapshot, fromPersistedSnapshot } from "../../src/campaign/optional-state.js";
import { NOW, populated, run, tempRoot, coreOf } from "../support/optional-domain-fixtures.js";

const store = async (t: Parameters<typeof tempRoot>[0]) => { const dir = await tempRoot(t); return { dir, learning: join(dir, optionalStoreFile("learning")), media: join(dir, optionalStoreFile("media")) }; };
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const bad = (fn: () => unknown) => assert.throws(fn, { code: "optional_state_invalid" });

test("store: create, atomic rewrite and reload round-trip the exact data", async t => {
  const f = populated(), data = extractOptionalState(f.campaign.exportSnapshot()), s = await store(t);
  const text = encodeStore("learning", "camp", 8, NOW, data.learning);
  await writeStoreFile(nodeSaveFileSystem, s.dir, "learning", text);
  assert.equal(await fs.readFile(s.learning, "utf8"), text);
  assert.deepEqual(plain(decodeStore(text, "learning", "camp").data), data.learning);
  const next = encodeStore("learning", "camp", 9, NOW, { premium_reflections: [] });
  await writeStoreFile(nodeSaveFileSystem, s.dir, "learning", next);
  assert.deepEqual(plain(decodeStore(await fs.readFile(s.learning, "utf8"), "learning", "camp").data), { premium_reflections: [] });
  assert.deepEqual((await fs.readdir(s.dir)).sort(), ["learning.json"], "no temp is left behind");
  assert.equal(contentDigest(data.learning), contentDigest(JSON.parse(JSON.stringify(data.learning))), "the digest is canonical");
});

test("store: a store bound to another campaign, of an unsupported version or malformed is a HARD invalid, never partially read", async () => {
  const data = extractOptionalState(populated().campaign.exportSnapshot()), ok = encodeStore("media", "camp", 8, NOW, data.media);
  assert.doesNotThrow(() => decodeStore(ok, "media", "camp"));
  bad(() => decodeStore(ok, "media", "other_campaign"));
  bad(() => decodeStore(ok, "learning", "camp"));
  const raw = JSON.parse(ok);
  bad(() => decodeStore(canonicalJson({ ...raw, store_version: OPTIONAL_STORE_VERSIONS.media + 1 }), "media", "camp"));
  bad(() => decodeStore(canonicalJson({ ...raw, store_version: 0 }), "media", "camp"));
  bad(() => decodeStore("{not json", "media", "camp"));
  bad(() => decodeStore("", "media", "camp"));
  bad(() => decodeStore(canonicalJson({ ...raw, extra: 1 }), "media", "camp"));
  const { content_sha256: _d, ...missing } = raw; bad(() => decodeStore(canonicalJson(missing), "media", "camp"));
  bad(() => decodeStore(canonicalJson({ ...raw, data: { ...raw.data, portraits: [] } }), "media", "camp"));
  bad(() => decodeStore(canonicalJson({ ...raw, content_sha256: "0".repeat(64) }), "media", "camp"));
  bad(() => decodeStore(ok.slice(0, ok.length >> 1), "media", "camp"));
  bad(() => decodeStore(canonicalJson({ ...raw, format: "something_else" }), "media", "camp"));
});

test("store: an interrupted temp is never read and the real store is untouched; a failed rewrite keeps the previous store", async t => {
  const s = await store(t), data = extractOptionalState(populated().campaign.exportSnapshot());
  const first = encodeStore("learning", "camp", 8, NOW, data.learning);
  await writeStoreFile(nodeSaveFileSystem, s.dir, "learning", first);
  await fs.writeFile(join(s.dir, ".learning-interrupted.tmp"), first.slice(0, 40));
  assert.equal(decodeStore(await fs.readFile(s.learning, "utf8"), "learning", "camp").bound_revision, 8, "the temp is ignored");
  const failing = { ...nodeSaveFileSystem, async rename() { throw Object.assign(new Error("crash"), { code: "EIO" }); } };
  await assert.rejects(writeStoreFile(failing, s.dir, "learning", encodeStore("learning", "camp", 9, NOW, { premium_reflections: [] })), { code: "EIO" });
  assert.equal(await fs.readFile(s.learning, "utf8"), first, "a failed rewrite leaves the previous store byte for byte");
  assert.deepEqual((await fs.readdir(s.dir)).filter(n => n.endsWith(".tmp")), [".learning-interrupted.tmp"], "the failed write cleaned its own temp");
});

test("store: the two stores are independent files with independent versions", async t => {
  const s = await store(t), data = extractOptionalState(populated().campaign.exportSnapshot());
  await writeStoreFile(nodeSaveFileSystem, s.dir, "learning", encodeStore("learning", "camp", 8, NOW, data.learning));
  await writeStoreFile(nodeSaveFileSystem, s.dir, "media", encodeStore("media", "camp", 8, NOW, data.media));
  const learningBefore = await fs.readFile(s.learning, "utf8");
  await writeStoreFile(nodeSaveFileSystem, s.dir, "media", encodeStore("media", "camp", 9, NOW, { item_sprites: [], portraits: [] }));
  assert.equal(await fs.readFile(s.learning, "utf8"), learningBefore, "rewriting media does not touch learning");
  await fs.writeFile(s.media, "garbage");
  assert.doesNotThrow(() => decodeStore(learningBefore, "learning", "camp"), "a corrupt media store does not invalidate the learning store");
  assert.deepEqual(Object.keys(OPTIONAL_STORE_VERSIONS).sort(), ["learning", "media"]);
});

test("partitions: optional enrichment is outside the authoritative projection; selections and promoted mannerisms are inside", () => {
  const f = populated(), snap = f.campaign.exportSnapshot(), core = canonicalJson(corePartition(snap));
  const stripped = structuredClone(snap) as any;
  stripped.premium_reflections = []; delete stripped.mannerism_learning; stripped.items.forEach((i: any) => delete i.sprite); stripped.portraits[0].versions = []; delete stripped.portraits[0].reference;
  assert.equal(canonicalJson(corePartition(stripped)), core, "reflections, mannerism learning, sprites and gallery versions are not authoritative");
  const moved = structuredClone(snap) as any; moved.portraits[0].avatar_version_id = "portrait_v2";
  assert.notEqual(canonicalJson(corePartition(moved)), core, "the selected avatar is authoritative");
  const promoted = structuredClone(snap) as any; promoted.premium_characters[0].mannerisms = [];
  assert.notEqual(canonicalJson(corePartition(promoted)), core, "promoted mannerisms are authoritative");
  assert.deepEqual(portraitSelections(snap), [{ character_id: "nicco", avatar_version_id: "portrait_v1" }]);
  assert.equal(JSON.stringify(corePartition(snap)).includes("portrait_v3"), false, "no gallery version leaks into the authoritative projection");
});

test("partitions: persisted -> composed round trip is exact, keeps a dangling selection and ignores stray copies for a migrated store", () => {
  const snap = populated().campaign.exportSnapshot(), sides = extractOptionalState(snap), both = { learning: true, media: true };
  const persisted = toPersistedSnapshot(snap, both) as any;
  assert.equal(persisted.schema_version, 8); assert.equal("premium_reflections" in persisted, false); assert.equal("portraits" in persisted, false);
  assert.equal(persisted.items.some((i: any) => "sprite" in i), false);
  const composed = fromPersistedSnapshot(persisted, both, { learning: sides.learning, media: sides.media }) as any;
  assert.deepEqual(composed, snap);
  const stray = { ...persisted, premium_reflections: [{ character_id: "x", notes: [], last_reflected_revision: 0 }] };
  assert.deepEqual((fromPersistedSnapshot(stray, both, { learning: sides.learning, media: sides.media }) as any).premium_reflections, snap.premium_reflections, "a stray copy never merges");
  const dangling = fromPersistedSnapshot(persisted, both, { learning: sides.learning, media: { item_sprites: [], portraits: [] } }) as any;
  assert.equal(dangling.portraits[0].avatar_version_id, "portrait_v1", "the selection is kept");
  assert.deepEqual(dangling.portraits[0].versions, [], "rendering degrades: no version is silently chosen");
});

test("a store write is not a campaign revision; an optional-only change keeps the revision and advances the state version; a save writes only the changed store", async t => {
  const f = populated(["sprites", "portraits"]), root = await tempRoot(t), repository = new FileCampaignRepository(f.world, root, { now: () => NOW });
  const id = f.campaign.exportSnapshot().campaign_id, dir = join(root, id, "optional");
  await repository.saveCampaign(f.campaign);
  const revision = f.campaign.revision, version = f.campaign.stateVersion, core = coreOf(f.campaign);
  const learningBefore = await fs.readFile(join(dir, "learning.json"), "utf8"), mediaBefore = await fs.readFile(join(dir, "media.json"), "utf8");
  const itemId = f.campaign.exportSnapshot().items.find(i => i.sprite?.status === "failed")!.id;
  const result = run(f.campaign, { kind: "set_item_sprite", item_id: itemId, sprite: { status: "pending" } });
  assert.equal(result.changed, true); assert.equal(f.campaign.revision, revision, "no semantic revision"); assert.equal(result.revision, revision);
  assert.ok(f.campaign.stateVersion > version, "the state version tracks unsaved optional changes"); assert.equal(coreOf(f.campaign), core);
  await repository.saveCampaign(f.campaign);
  assert.equal(await fs.readFile(join(dir, "learning.json"), "utf8"), learningBefore, "the unchanged learning store is not rewritten");
  assert.notEqual(await fs.readFile(join(dir, "media.json"), "utf8"), mediaBefore);
  const loaded = await repository.loadCampaign(id);
  assert.equal(loaded.campaign.revision, revision); assert.equal(loaded.campaign.exportSnapshot().items.find(i => i.id === itemId)!.sprite?.status, "pending");
  assert.deepEqual(loaded.optional_state_source, { learning: "side_store", media: "side_store" });
});
