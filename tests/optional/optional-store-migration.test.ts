import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { CURRENT_SAVE_VERSION } from "../../src/persistence/save-migrations.js";
import { OPTIONAL_STORE_DIRECTORY, canonicalJson, decodeStore, encodeStore, optionalStoreFile } from "../../src/persistence/optional-store.js";
import { extractOptionalState } from "../../src/campaign/optional-state.js";
import { NOW, faultFs, legacyCampaign, populated, run, tempRoot, coreOf, type Part, type FsOp, type Where } from "../support/optional-domain-fixtures.js";

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const read = async (path: string) => JSON.parse(await fs.readFile(path, "utf8"));
const exists = (path: string) => fs.stat(path).then(() => true, () => false);
type Fixture = ReturnType<typeof populated>;
const reopen = (f: Fixture, root: string, fsx?: ConstructorParameters<typeof FileCampaignRepository>[2]) => new FileCampaignRepository(f.world, root, { now: () => NOW, ...fsx });
const full = (f: Fixture) => plain(f.campaign.exportSnapshot());

test("schema: the main save schema is 8; a v7 file loads as PRE-migration (inline optional state, snapshot authoritative) and loading rewrites nothing", async t => {
  assert.equal(CURRENT_SAVE_VERSION, 8);
  const f = populated(), l = await legacyCampaign(t, f), bytes = await fs.readFile(l.path, "utf8");
  const file = JSON.parse(bytes); assert.equal(file.schema_version, 7); assert.equal(file.snapshot.schema_version, 7); assert.equal("optional_state" in file, false);
  assert.ok(file.snapshot.premium_reflections.length && file.snapshot.mannerism_learning && file.snapshot.portraits && file.snapshot.items.some((i: any) => i.sprite));
  const loaded = await l.repository.loadCampaign(l.id);
  assert.deepEqual(loaded.optional_state_source, { learning: "legacy_snapshot", media: "legacy_snapshot" });
  assert.deepEqual(plain(loaded.campaign.exportSnapshot()), full(f)); assert.equal(loaded.campaign.revision, f.campaign.revision);
  assert.equal(await fs.readFile(l.path, "utf8"), bytes, "load never rewrites the source");
  assert.equal(await exists(join(l.dir, OPTIONAL_STORE_DIRECTORY)), false, "load creates no store");
});

test("migration: the first save writes BOTH stores, then the schema-8 snapshot carrying the markers; the snapshot no longer holds the migrated fields", async t => {
  const f = populated(), l = await legacyCampaign(t, f);
  const loaded = await l.repository.loadCampaign(l.id), revision = loaded.campaign.revision;
  await l.repository.saveCampaign(loaded.campaign);
  const file = await read(l.path);
  assert.equal(file.schema_version, 8); assert.equal(file.snapshot.schema_version, 8);
  assert.deepEqual(file.optional_state, { learning: { completed: true, version: 1 }, media: { completed: true, version: 1 } });
  for (const field of ["premium_reflections", "mannerism_learning", "portraits"]) assert.equal(field in file.snapshot, false, `${field} left the snapshot`);
  assert.equal(file.snapshot.items.some((i: any) => "sprite" in i), false);
  assert.deepEqual(file.snapshot.portrait_selections, [{ character_id: "nicco", avatar_version_id: "portrait_v1" }], "the selection stays authoritative");
  assert.equal(file.snapshot.revision, revision, "migration is not a semantic revision");
  assert.equal(await exists(join(l.dir, "optional", "learning.json")), true); assert.equal(await exists(join(l.dir, "optional", "media.json")), true);
  const again = await l.repository.loadCampaign(l.id);
  assert.deepEqual(again.optional_state_source, { learning: "side_store", media: "side_store" });
  assert.deepEqual(plain(again.campaign.exportSnapshot()), full(f)); assert.equal(again.campaign.revision, revision);
  assert.equal(coreOf(again.campaign), coreOf(f.campaign));
});

test("precedence: marker ABSENT -> snapshot wins even if a (stale, different) store exists; store existence alone never decides", async t => {
  const f = populated(), l = await legacyCampaign(t, f);
  const stale = extractOptionalState(populated(["portraits"]).campaign.exportSnapshot());
  await fs.mkdir(join(l.dir, "optional"));
  await fs.writeFile(join(l.dir, "optional", "learning.json"), encodeStore("learning", f.campaign.exportSnapshot().campaign_id, 99, NOW, stale.learning));
  await fs.writeFile(join(l.dir, "optional", "media.json"), encodeStore("media", f.campaign.exportSnapshot().campaign_id, 99, NOW, stale.media));
  const loaded = await l.repository.loadCampaign(l.id);
  assert.deepEqual(loaded.optional_state_source, { learning: "legacy_snapshot", media: "legacy_snapshot" });
  assert.deepEqual(plain(loaded.campaign.exportSnapshot()), full(f));
  await l.repository.saveCampaign(loaded.campaign);
  const after = await l.repository.loadCampaign(l.id);
  assert.deepEqual(plain(after.campaign.exportSnapshot()), full(f), "the rerun overwrites the stale store from the authoritative snapshot");
  assert.deepEqual(after.optional_state_source, { learning: "side_store", media: "side_store" });
});

test("precedence: marker PRESENT -> the side store wins; a divergent legacy copy in the snapshot is ignored", async t => {
  const f = populated(), l = await legacyCampaign(t, f), loaded = await l.repository.loadCampaign(l.id);
  await l.repository.saveCampaign(loaded.campaign);
  const file = await read(l.path); file.snapshot.premium_reflections = []; file.snapshot.mannerism_learning = { sequence: 0, processed_sequence: 0, last_turn_id: "", journal: [], candidates: [] };
  await fs.writeFile(l.path, JSON.stringify(file));
  const again = await l.repository.loadCampaign(l.id);
  assert.deepEqual(plain(again.campaign.exportSnapshot()), full(f), "stray inline copies never merge once the marker is present");
});

test("markers: an unsupported future marker fails safely (unsupported_version); a malformed marker is invalid_save; markers never touch gameplay truth", async t => {
  const f = populated(), l = await legacyCampaign(t, f);
  await l.repository.saveCampaign((await l.repository.loadCampaign(l.id)).campaign);
  const good = await read(l.path), core = coreOf((await l.repository.loadCampaign(l.id)).campaign);
  const write = (patch: unknown) => fs.writeFile(l.path, JSON.stringify({ ...good, optional_state: patch }));
  await write({ learning: { completed: true, version: 2 }, media: { completed: true, version: 1 } });
  await assert.rejects(l.repository.loadCampaign(l.id), { code: "unsupported_version" });
  for (const bad of [{ learning: { completed: false, version: 1 } }, { learning: { version: 1 } }, { learning: true }, { unknown: { completed: true, version: 1 } }, "x", []]) {
    await write(bad); await assert.rejects(l.repository.loadCampaign(l.id), { code: "invalid_save" }, JSON.stringify(bad));
  }
  await fs.writeFile(l.path, JSON.stringify(good));
  assert.equal(coreOf((await l.repository.loadCampaign(l.id)).campaign), core);
  const half = { ...good, optional_state: { learning: { completed: true, version: 1 } } };
  await fs.writeFile(l.path, JSON.stringify(half));
  const partial = await l.repository.loadCampaign(l.id);
  assert.deepEqual(partial.optional_state_source, { learning: "side_store", media: "legacy_snapshot" }, "markers are per domain");
});

test("hard recovery: marker present + missing / corrupt / foreign / wrong-version store is optional_state_invalid; there is NO silent fallback to the snapshot or another slot", async t => {
  const f = populated(), l = await legacyCampaign(t, f);
  await l.repository.saveCampaign((await l.repository.loadCampaign(l.id)).campaign);
  await l.repository.saveCampaign((await l.repository.loadCampaign(l.id)).campaign); // a previous slot exists too
  const learning = join(l.dir, "optional", "learning.json"), media = join(l.dir, "optional", "media.json"), original = await fs.readFile(learning, "utf8");
  const breakers: [string, string | null][] = [["corrupt", original.slice(0, 50)], ["missing", null], ["foreign", original.replace(/"campaign_id": ?"[^"]*"/, '"campaign_id":"another"')],
    ["wrong version", canonicalJson({ ...JSON.parse(original), store_version: 7 })], ["tampered", original.replace("maren", "marex")]];
  for (const [name, content] of breakers) {
    if (content === null) await fs.rm(learning); else await fs.writeFile(learning, content);
    await assert.rejects(l.repository.loadCampaign(l.id), { code: "optional_state_invalid" }, name);
    await assert.rejects(l.repository.loadCampaign(l.id, "previous"), { code: "optional_state_invalid" }, `${name} (previous slot: the store is shared, no fallback)`);
  }
  await fs.writeFile(learning, original);
  await fs.writeFile(media, "garbage");
  await assert.rejects(l.repository.loadCampaign(l.id), { code: "optional_state_invalid" }, "a corrupt media store is equally hard");
  const listed = await l.repository.listSaves(); assert.ok(listed.find(e => e.campaign_id === l.id), "listing needs only the core state and still works");
});

// ------------------------------------------------------------------------------------------------ crash injection A-F
const POINTS: { id: string; op: FsOp; where: Where; nth: number; marker: boolean; label: string }[] = [
  { id: "A", op: "writeNew", where: "store", nth: 1, marker: false, label: "before any store write" },
  { id: "B", op: "rename", where: "store", nth: 1, marker: false, label: "after the temp write, before the store rename" },
  { id: "C", op: "syncDirectory", where: "store", nth: 1, marker: false, label: "after the store rename, before its fsync / the marker" },
  { id: "D", op: "writeNew", where: "snapshot", nth: 1, marker: false, label: "after both stores are durable, before the snapshot save" },
  { id: "E", op: "rename", where: "snapshot", nth: 2, marker: false, label: "during the snapshot save, before the atomic rename" },
  { id: "F", op: "syncDirectory", where: "snapshot", nth: 3, marker: true, label: "after the marker is persisted" },
];
for (const point of POINTS) test(`crash ${point.id} (${point.label}): ${point.marker ? "marker present -> the side store wins" : "marker absent -> the snapshot wins and a rerun is safe"}`, async t => {
  const f = populated(), l = await legacyCampaign(t, f), before = await fs.readFile(l.path, "utf8");
  const campaign = (await l.repository.loadCampaign(l.id)).campaign, log: string[] = [];
  const crashing = reopen(f, l.root, { filesystem: faultFs(point.op, point.where, point.nth, log) });
  await assert.rejects(crashing.saveCampaign(campaign), { code: "io_error" }); assert.equal(log.length, 1, `the fault fired once at ${log[0]}`);
  const file = await read(l.path);
  if (point.marker) {
    assert.equal(file.schema_version, 8); assert.ok(file.optional_state?.learning?.completed && file.optional_state?.media?.completed);
  } else {
    assert.equal(await fs.readFile(l.path, "utf8"), before, "the legacy snapshot is untouched: still the authority");
    assert.equal("optional_state" in file, false);
  }
  const recovered = await reopen(f, l.root).loadCampaign(l.id);
  assert.deepEqual(recovered.optional_state_source, point.marker ? { learning: "side_store", media: "side_store" } : { learning: "legacy_snapshot", media: "legacy_snapshot" });
  assert.deepEqual(plain(recovered.campaign.exportSnapshot()), full(f), "no data lost whichever side wins");
  assert.equal(recovered.campaign.revision, f.campaign.revision);
  assert.equal((await fs.readdir(l.dir)).filter(n => n.endsWith(".tmp")).length, 0, "a failed save leaves no snapshot temp");
  // Rerun with a healthy filesystem: idempotent and complete, no duplicate rows.
  await reopen(f, l.root).saveCampaign(recovered.campaign);
  const done = await reopen(f, l.root).loadCampaign(l.id);
  assert.deepEqual(done.optional_state_source, { learning: "side_store", media: "side_store" });
  assert.deepEqual(plain(done.campaign.exportSnapshot()), full(f));
  const snap = done.campaign.exportSnapshot();
  assert.equal(snap.premium_reflections.length, f.campaign.exportSnapshot().premium_reflections.length); assert.equal(snap.premium_reflections[0]!.notes.length, 1);
  assert.equal(snap.mannerism_learning!.journal.length, 1); assert.equal(snap.mannerism_learning!.candidates.length, 1);
  assert.equal(snap.portraits![0]!.versions.length, 3); assert.equal(snap.items.filter(i => i.sprite).length, 3);
  for (const n of ["learning.json", "media.json"]) decodeStore(await fs.readFile(join(l.dir, "optional", n), "utf8"), n.startsWith("learning") ? "learning" : "media", snap.campaign_id);
  const stable = await fs.readFile(join(l.dir, "optional", "media.json"), "utf8");
  await reopen(f, l.root).saveCampaign(done.campaign);
  assert.equal(JSON.parse(await fs.readFile(join(l.dir, "optional", "media.json"), "utf8")).content_sha256, JSON.parse(stable).content_sha256, "idempotent: the same state writes the same store");
});

test("crash (steady state): a crash after the snapshot but before the store write leaves a store BEHIND, never ahead; the next save catches up", async t => {
  const f = populated(["sprites", "portraits", "mannerism"]), l = await legacyCampaign(t, f);
  await l.repository.saveCampaign((await l.repository.loadCampaign(l.id)).campaign);
  const campaign = (await l.repository.loadCampaign(l.id)).campaign;
  const itemId = campaign.exportSnapshot().items.find(i => i.sprite?.status === "failed")!.id;
  run(campaign, { kind: "set_item_sprite", item_id: itemId, sprite: { status: "pending" } });
  run(campaign, { kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "trust", direction: "raise" }); // an authoritative change in the same save
  const log: string[] = [];
  await assert.rejects(reopen(f, l.root, { filesystem: faultFs("writeNew", "store", 1, log) }).saveCampaign(campaign), { code: "io_error" });
  const behind = await reopen(f, l.root).loadCampaign(l.id);
  assert.equal(behind.campaign.revision, campaign.revision, "the authoritative change is durable");
  assert.equal(behind.campaign.exportSnapshot().items.find(i => i.id === itemId)!.sprite?.status, "failed", "enrichment is merely older");
  await reopen(f, l.root).saveCampaign(campaign);
  assert.equal((await reopen(f, l.root).loadCampaign(l.id)).campaign.exportSnapshot().items.find(i => i.id === itemId)!.sprite?.status, "pending");
});

// ------------------------------------------------------------------------------------------------ legacy-save fixture matrix A-K
interface Case { id: string; name: string; parts: readonly Part[]; shape: "legacy" | "migrated" | "interrupted" | "marker_valid" | "marker_corrupt" | "partial_temp" | "none_migrated" }
const MATRIX: Case[] = [
  { id: "A", name: "all optional state populated", parts: ["reflection", "mannerism", "sprites", "portraits"], shape: "legacy" },
  { id: "B", name: "Reflection only", parts: ["reflection"], shape: "legacy" },
  { id: "C", name: "Mannerism only", parts: ["mannerism"], shape: "legacy" },
  { id: "D", name: "sprites pending / ready / failed", parts: ["sprites"], shape: "legacy" },
  { id: "E", name: "portraits multi-version + selected avatar", parts: ["portraits"], shape: "legacy" },
  { id: "F", name: "no optional state at all", parts: [], shape: "none_migrated" },
  { id: "G", name: "already migrated", parts: ["reflection", "mannerism", "sprites", "portraits"], shape: "migrated" },
  { id: "H", name: "interrupted: store exists, marker absent", parts: ["reflection", "mannerism", "sprites", "portraits"], shape: "interrupted" },
  { id: "I", name: "marker + valid store", parts: ["reflection", "mannerism", "sprites", "portraits"], shape: "marker_valid" },
  { id: "J", name: "marker + corrupt store", parts: ["reflection", "mannerism", "sprites", "portraits"], shape: "marker_corrupt" },
  { id: "K", name: "partial temp store", parts: ["reflection", "mannerism", "sprites", "portraits"], shape: "partial_temp" },
];
for (const c of MATRIX) test(`legacy-save matrix ${c.id}: ${c.name}`, async (t: TestContext) => {
  const f = populated(c.parts), original = full(f), revision = f.campaign.revision, core = coreOf(f.campaign);
  const l = await legacyCampaign(t, f), id = original.campaign_id, optional = join(l.dir, "optional");
  if (c.shape === "migrated" || c.shape === "marker_valid" || c.shape === "marker_corrupt") {
    await l.repository.saveCampaign((await l.repository.loadCampaign(l.id)).campaign);
    if (c.shape === "marker_corrupt") await fs.writeFile(join(optional, "media.json"), "{ corrupt");
  }
  if (c.shape === "interrupted") {
    await fs.mkdir(optional); const s = extractOptionalState(f.campaign.exportSnapshot());
    await fs.writeFile(join(optional, "learning.json"), encodeStore("learning", id, revision, NOW, s.learning)); await fs.writeFile(join(optional, "media.json"), encodeStore("media", id, revision, NOW, s.media));
  }
  if (c.shape === "partial_temp") { await fs.mkdir(optional); await fs.writeFile(join(optional, ".learning-partial.tmp"), '{"format":"caldrevan_optional_'); }
  const expectMigrated = c.shape === "migrated" || c.shape === "marker_valid";
  if (c.shape === "marker_corrupt") {
    await assert.rejects(l.repository.loadCampaign(id), { code: "optional_state_invalid" }, "no silent fallback");
    return;
  }
  // 1. load: the authority source matches the marker, nothing is lost, the semantic revision is the original one.
  const loaded = await l.repository.loadCampaign(id);
  assert.deepEqual(loaded.optional_state_source, expectMigrated ? { learning: "side_store", media: "side_store" } : { learning: "legacy_snapshot", media: "legacy_snapshot" });
  assert.deepEqual(plain(loaded.campaign.exportSnapshot()), original); assert.equal(loaded.campaign.revision, revision); assert.equal(coreOf(loaded.campaign), core);
  // 2. migration (or steady save): revision stable, save/reload stable, the second save changes nothing.
  await l.repository.saveCampaign(loaded.campaign);
  const reloaded = await l.repository.loadCampaign(id);
  assert.deepEqual(reloaded.optional_state_source, { learning: "side_store", media: "side_store" });
  assert.deepEqual(plain(reloaded.campaign.exportSnapshot()), original); assert.equal(reloaded.campaign.revision, revision);
  const fileA = await read(l.path), learningA = await fs.readFile(join(optional, "learning.json"), "utf8"), mediaA = await fs.readFile(join(optional, "media.json"), "utf8");
  await l.repository.saveCampaign(reloaded.campaign);
  const fileB = await read(l.path);
  assert.equal(fileB.snapshot.revision, fileA.snapshot.revision); assert.deepEqual(fileB.snapshot, fileA.snapshot); assert.deepEqual(fileB.optional_state, fileA.optional_state);
  assert.equal(await fs.readFile(join(optional, "learning.json"), "utf8"), learningA, "no store rewrite without a change"); assert.equal(await fs.readFile(join(optional, "media.json"), "utf8"), mediaA);
  // 3. no duplicate rows after repeated migration passes.
  const once = plain((await l.repository.loadCampaign(id)).campaign.exportSnapshot());
  assert.equal(once.premium_reflections.length, original.premium_reflections.length); assert.equal(once.items.filter(i => i.sprite).length, original.items.filter(i => i.sprite).length);
  assert.equal(once.portraits?.length ?? 0, original.portraits?.length ?? 0); assert.equal(once.mannerism_learning?.journal.length ?? 0, original.mannerism_learning?.journal.length ?? 0);
  assert.deepEqual(once, original);
});
