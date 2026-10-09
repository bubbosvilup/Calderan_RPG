import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorldStore } from "../src/world/world-store.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { FileCampaignRepository, assetKey } from "../src/persistence/campaign-repository.js";
import { CampaignSession } from "../src/persistence/campaign-session.js";
import { createSaveFile, decodeSaveWithReport, serializeSave, type SaveContinuity } from "../src/persistence/save-format.js";
import { nodeSaveFileSystem, type SaveFileSystem } from "../src/persistence/filesystem.js";
import { parseTranscript, serializeTranscriptRecords } from "../src/persistence/transcript.js";
import { PortraitAssetStore } from "../src/app/portrait-store.js";
import { assessPortraitAssets, collectDeferredDeletions } from "../src/app/portrait-assets.js";
import type { CharacterPortraitVersion } from "../src/campaign/types.js";
import { richCampaign, change, a } from "./persistence-fixtures.js";
import { fixtures, find, location, character, document, base, room, garden } from "./fixtures.js";

/** Save/Load v1, pass 1: format 5 / snapshot 4, migration, tiered canon compatibility, repository, transcript, portrait asset lifecycle. */
const now = "2026-10-08T10:00:00.000Z";
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "caldrevan-slv1-")); dirs.push(d); return d; };
const continuity = (revision: number, n = 2): SaveContinuity => ({ authority: "non_authoritative", revision, recent: Array.from({ length: n }, (_, i) => ({ player: `p${i}`, narration: `n${i}`, location_id: room })) });
const clock = (start = Date.parse(now)) => { let t = start; return { now: () => new Date(t).toISOString(), advance: (ms: number) => { t += ms; } }; };

test("format 5 carries display name, scenario, save reason, engine version and bounded non-authoritative continuity", () => {
  const { world, campaign } = richCampaign(), snap = campaign.exportSnapshot();
  const file = createSaveFile(snap, world, now, now, { metadata: { display_name: "Nicco in Calderan", scenario_id: "caldrevan.slave_market.v1", save_reason: "manual", engine_version: "0.1.0" }, continuity: continuity(snap.revision) });
  assert.equal(file.schema_version, 5); assert.equal(file.snapshot.schema_version, 6);
  assert.deepEqual(file.metadata, { saved_at: now, created_at: now, display_name: "Nicco in Calderan", scenario_id: "caldrevan.slave_market.v1", save_reason: "manual", engine_version: "0.1.0" });
  assert.ok(file.canon_references!.every(r => typeof r.kind === "string"), "format-5 references record the entity kind");
  const text = serializeSave(file, world), decoded = decodeSaveWithReport(text, world);
  assert.deepEqual(decoded.file.continuity, continuity(snap.revision)); assert.equal(decoded.continuity_dropped, false); assert.equal(decoded.canon.tier, "compatible");
  // Bounds: too many exchanges / forged authority / extra fields are refused at write and dropped (not fatal) at read.
  assert.throws(() => createSaveFile(snap, world, now, now, { continuity: continuity(snap.revision, 13) }), { code: "invalid_save" });
  for (const bad of [{ ...continuity(snap.revision), authority: "authoritative" }, { ...continuity(snap.revision), recent: [{ player: "x", narration: "y", command: "set_funds" }] }, { ...continuity(snap.revision), recent: Array(13).fill({ player: "a", narration: "b" }) }]) {
    const value = JSON.parse(text); value.continuity = bad;
    const r = decodeSaveWithReport(JSON.stringify(value), world);
    assert.equal(r.file.continuity, undefined); assert.equal(r.continuity_dropped, true); assert.deepEqual(r.file.snapshot, decoded.file.snapshot, "continuity never affects canonical state");
  }
  for (const [key, value] of [["display_name", " padded "], ["display_name", "x".repeat(81)], ["scenario_id", "Bad Scenario"], ["save_reason", "sometimes"]] as const) {
    const v = JSON.parse(text); v.metadata[key] = value; assert.throws(() => decodeSaveWithReport(JSON.stringify(v), world), { code: "invalid_save" }, `${key}`);
  }
});

test("explicit 4 -> 5 migration is version-only and lossless; v4 files carrying v5 fields fail; future versions are refused clearly; load never rewrites", async () => {
  const { world, campaign } = richCampaign(), snap = campaign.exportSnapshot();
  const v5 = JSON.parse(serializeSave(createSaveFile(snap, world, now), world));
  const { player_characters: _pc, next_item_sequence: _seq, ...s4 } = v5.snapshot;
  const v4 = { ...v5, schema_version: 4, snapshot: { ...s4, schema_version: 3 }, canon_references: v5.canon_references.map(({ kind: _k, ...r }: { kind: string }) => r) };
  const decoded = decodeSaveWithReport(JSON.stringify(v4), world);
  assert.equal(decoded.migrated_from, 4); assert.equal(decoded.file.schema_version, 5);
  assert.deepEqual(CampaignState.restore(world, decoded.file.snapshot).exportSnapshot(), snap);
  for (const smuggle of [(f: any) => { f.metadata.display_name = "x"; }, (f: any) => { f.continuity = continuity(snap.revision); }, (f: any) => { f.snapshot.schema_version = 4; }]) {
    const f = structuredClone(v4); smuggle(f); assert.throws(() => decodeSaveWithReport(JSON.stringify(f), world), { code: "migration_failed" });
  }
  for (const future of [{ ...v5, schema_version: 6 }, { ...v5, snapshot: { ...v5.snapshot, schema_version: 7 } }]) assert.throws(() => decodeSaveWithReport(JSON.stringify(future), world), { code: "unsupported_version" });
  // On disk: loading the v4 file migrates in memory only.
  const root = await temp(), dir = join(root, snap.campaign_id); await fs.mkdir(dir, { recursive: true });
  const bytes = JSON.stringify(v4); await fs.writeFile(join(dir, "save.json"), bytes);
  const loaded = await new FileCampaignRepository(world, root).loadCampaign(snap.campaign_id);
  assert.equal(loaded.migrated_from, 4); assert.equal(await fs.readFile(join(dir, "save.json"), "utf8"), bytes, "load never rewrites the source");
  await fs.writeFile(join(dir, "save.json"), JSON.stringify({ ...v5, schema_version: 6 }));
  await assert.rejects(new FileCampaignRepository(world, root).loadCampaign(snap.campaign_id), { code: "unsupported_version" });
});

// ------------------------------------------------------------------------------------------------ tiered canon compatibility
const savedText = () => { const { world, campaign } = richCampaign(); return { world, campaign, text: serializeSave(createSaveFile(campaign.exportSnapshot(), world, now), world) }; };
test("additive canon authoring never invalidates or mutates a campaign: new NPC, location and item load as compatible with the state unchanged", () => {
  const { campaign, text } = savedText(), sources = fixtures();
  sources.push({ source: "fixtures/new_place.yaml", document: document(location("new_place")) });
  sources.push({ source: "fixtures/newcomer.yaml", document: document(character("newcomer", garden)) });
  sources.push({ source: "fixtures/lamp.yaml", document: document({ ...base("lamp"), type: "item", location: "new_place", state: {} } as never) });
  const world = new WorldStore(sources), before = campaign.exportSnapshot();
  const r = decodeSaveWithReport(text, world);
  assert.equal(r.canon.tier, "compatible"); assert.equal(r.canon.revision_advanced, false); assert.deepEqual(r.canon.drifted_references, []);
  assert.equal(world.getEntity("newcomer")?.type, "character", "the new NPC is available through canon");
  assert.equal(r.file.snapshot.runtime.npc_locations.some(n => n.character_id === "newcomer"), false, "no runtime entry is materialized by loading");
  assert.deepEqual({ ...r.file.snapshot, dataset_id: "" }, { ...before, dataset_id: "" }, "snapshot and revision are unchanged by the load");
  // Play may place the new NPC later through a normal committed change (which advances the revision then, not at load).
  const restored = CampaignState.restore(world, r.file.snapshot);
  restored.apply({ expected_revision: restored.revision, commands: [{ kind: "runtime_delta", delta: { character_movements: [{ character_id: "newcomer", current_location: garden }] } }] });
  assert.equal(restored.revision, before.revision + 1); assert.deepEqual(restored.exportSnapshot().runtime.npc_locations.find(n => n.character_id === "newcomer"), { character_id: "newcomer", current_location: garden });
});

test("label edits are compatible; content edits of referenced records warn; a removed runtime-only NPC is reconciled with a warning", () => {
  const { campaign, text } = savedText(), before = campaign.exportSnapshot();
  const labels = fixtures(); find(labels, room).entity.display_name = "Renamed"; find(labels, "brenna").entity.summary = "New prose";
  const l = decodeSaveWithReport(text, new WorldStore(labels)); assert.equal(l.canon.tier, "compatible"); assert.deepEqual(l.canon.drifted_references, []);
  const content = fixtures(); (find(content, room).entity as { tags: string[] }).tags = ["changed"];
  const c = decodeSaveWithReport(text, new WorldStore(content)); assert.equal(c.canon.tier, "compatible_with_warnings"); assert.deepEqual(c.canon.drifted_references, [room]);
  assert.equal(c.file.snapshot.revision, before.revision, "warnings alone never bump the revision");
  // A canonical NPC the campaign knows only as a runtime location entry may be removed from canon: reconciled with a warning.
  const withDrifter = fixtures(); withDrifter.push({ source: "fixtures/drifter.yaml", document: document(character("drifter", garden)) });
  const w1 = new WorldStore(withDrifter), lone = new CampaignState(w1, "drifter_campaign", { player_location: room, world_time: { world_minute: 0 } });
  const loneText = serializeSave(createSaveFile(lone.exportSnapshot(), w1, now), w1);
  const m = decodeSaveWithReport(loneText, new WorldStore(fixtures()));
  assert.equal(m.canon.tier, "compatible_with_warnings"); assert.deepEqual(m.canon.removed_npc_locations, ["drifter"]); assert.equal(m.file.snapshot.revision, lone.revision + 1);
  // maren is a registered campaign character: removing her from canon is NOT reconcilable.
  assert.throws(() => decodeSaveWithReport(text, new WorldStore(fixtures().filter(s => !["maren", "meeting", "ritual", "history"].includes(s.document.entity.id)))), { code: "reference_invalid" });
});

test("incompatible: a referenced record disappeared or changed kind; load stops with the IDs and never mutates the save", async () => {
  const { campaign, text } = savedText();
  const gone = JSON.parse(JSON.stringify(fixtures()).replaceAll("brenna", "brenna_replacement"));
  assert.throws(() => decodeSaveWithReport(text, new WorldStore(gone)), (e: { code?: string; details?: { ids?: string[] } }) => e.code === "reference_invalid" && !!e.details?.ids?.includes("brenna"));
  const retyped = fixtures().filter(s => s.document.entity.id !== "bag" && s.document.entity.id !== "coin");
  retyped.push({ source: "fixtures/bag.yaml", document: document(location("bag")) });
  assert.throws(() => decodeSaveWithReport(text, new WorldStore(retyped)), (e: { code?: string; details?: { ids?: string[] } }) => e.code === "dataset_mismatch" && e.details?.ids?.[0] === "bag");
  const root = await temp(), dir = join(root, campaign.exportSnapshot().campaign_id); await fs.mkdir(dir); await fs.writeFile(join(dir, "save.json"), text);
  await assert.rejects(new FileCampaignRepository(new WorldStore(gone), root).loadCampaign(campaign.exportSnapshot().campaign_id), { code: "reference_invalid" });
  assert.equal(await fs.readFile(join(dir, "save.json"), "utf8"), text);
});

// ------------------------------------------------------------------------------------------------ repository
test("rolling checkpoints: manual/create/quit always, autosave at most every 15 minutes; at most 5 kept; saves only (no transcript or images); loadable", async () => {
  const root = await temp(), { world, campaign } = richCampaign(), c = clock(), repository = new FileCampaignRepository(world, root, { now: c.now });
  const id = campaign.exportSnapshot().campaign_id;
  const save = (reason: "manual" | "autosave" | "create") => repository.saveCampaign(campaign, { metadata: { save_reason: reason } });
  assert.ok((await save("create")).checkpoint);
  for (let i = 0; i < 3; i++) { change(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } }); c.advance(60_000); assert.equal((await save("autosave")).checkpoint, undefined); }
  c.advance(15 * 60_000); change(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } }); assert.ok((await save("autosave")).checkpoint, "due after the interval");
  for (let i = 0; i < 6; i++) { change(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } }); c.advance(1000); assert.ok((await save("manual")).checkpoint); }
  const backups = await repository.listBackups(id);
  assert.equal(backups.length, 5); assert.match(backups[0]!, new RegExp(`^r${String(campaign.revision).padStart(8, "0")}-`));
  await repository.appendTranscript(id, [{ i: 0, at: now, role: "narrator", text: "Opening.", revision: 0 }]);
  for (const name of backups) assert.doesNotMatch(await fs.readFile(join(root, id, "backups", name), "utf8"), /Opening\.|base64/);
  const restored = await repository.loadCampaign(id, `backup:${backups[0]}`);
  assert.equal(restored.campaign.revision, campaign.revision); assert.equal(restored.slot, `backup:${backups[0]}`);
  await assert.rejects(repository.loadCampaign(id, "backup:../save.json"), { code: "invalid_save" });
  // A checkpoint failure never fails the canonical save.
  const failing: SaveFileSystem = { ...nodeSaveFileSystem, async rename(from, to) { if (to.includes(`backups`)) throw Object.assign(new Error("x"), { code: "EIO" }); await nodeSaveFileSystem.rename(from, to); } };
  change(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } });
  const saved = await new FileCampaignRepository(world, root, { now: c.now, filesystem: failing }).saveCampaign(campaign, { metadata: { save_reason: "manual" } });
  assert.equal(saved.checkpoint_failed, true); assert.equal((await repository.loadCampaign(id)).campaign.revision, campaign.revision);
});

test("metadata persists across saves; listing has a safe summary; corrupt current is refused unless explicitly quarantined (never destroyed)", async () => {
  const root = await temp(), { world, campaign } = richCampaign(), repository = new FileCampaignRepository(world, root, { now: () => now });
  const id = campaign.exportSnapshot().campaign_id;
  await repository.saveCampaign(campaign, { metadata: { display_name: "First", scenario_id: "caldrevan.slave_market.v1", save_reason: "create" } });
  change(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 5 } });
  await repository.saveCampaign(campaign, { metadata: { save_reason: "autosave" } });
  const listed = (await repository.listSaves()).find(e => e.campaign_id === id)!;
  assert.deepEqual([listed.current.display_name, listed.current.scenario_id, listed.current.save_reason, listed.current.summary?.location_id, listed.locked], ["First", "caldrevan.slave_market.v1", "autosave", garden, false]);
  assert.doesNotMatch(JSON.stringify(listed), /Fixture A|Fixture secret/);
  const current = join(root, id, "save.json"), previousBytes = await fs.readFile(join(root, id, "save.previous.json"), "utf8");
  await fs.writeFile(current, "{broken");
  await assert.rejects(repository.saveCampaign(campaign), { code: "invalid_json" });
  // Explicit recovery: load previous, then the first save moves the corrupt current aside (kept) and writes a fresh current.
  const recovered = CampaignSession.fromLoaded(await repository.loadCampaign(id, "previous"), repository, { quarantine_corrupt_current: true });
  const saved = await recovered.save({ reason: "manual" });
  assert.match(saved.quarantined!, /^save\.corrupt-\d{8}T\d{9}Z\.json$/);
  assert.equal(await fs.readFile(join(root, id, saved.quarantined!), "utf8"), "{broken", "the corrupt artifact is preserved");
  assert.equal(await fs.readFile(join(root, id, "save.previous.json"), "utf8"), previousBytes, "the last known-good previous slot is not overwritten by a corrupt file");
  assert.equal((await repository.loadCampaign(id)).metadata.display_name, "First");
});

test("process lock: one writer per campaign; same-process second session refused; a dead holder's lock is recovered; release frees it", async () => {
  const root = await temp(), { world, campaign } = richCampaign(), id = campaign.exportSnapshot().campaign_id;
  const alive = new Set<number>([4242]);
  const mine = new FileCampaignRepository(world, root, { process_alive: pid => alive.has(pid) });
  const lock = await mine.acquireLock(id);
  await assert.rejects(mine.acquireLock(id), { code: "campaign_locked" });
  await assert.rejects(new FileCampaignRepository(world, root).acquireLock(id), { code: "campaign_locked" }, "another session in this process");
  await mine.saveCampaign(campaign);
  await assert.rejects(new FileCampaignRepository(world, root).saveCampaign(campaign), { code: "campaign_locked" }, "a writer without the lock is refused");
  assert.equal((await new FileCampaignRepository(world, root).listSaves())[0]!.locked, true);
  await lock.release(); await assert.rejects(fs.stat(join(root, id, ".lock")));
  // A lock written by another, live process blocks; once that process is gone, it is stale and replaced.
  const other = new FileCampaignRepository(world, root, { pid: 4242, process_alive: pid => alive.has(pid) });
  await other.acquireLock(id);
  await assert.rejects(mine.acquireLock(id), { code: "campaign_locked" });
  alive.delete(4242);
  const recovered = await mine.acquireLock(id); await mine.saveCampaign(campaign); await recovered.release();
  // PID reuse (seen live on Windows): the holder died and its PID now belongs to another process. Its heartbeat stopped, so after
  // the stale period the lock is free although the PID is "alive".
  alive.add(4242); await other.acquireLock(id);
  await assert.rejects(mine.acquireLock(id), { code: "campaign_locked" }, "fresh heartbeat + live PID: held");
  const later = new FileCampaignRepository(world, root, { process_alive: pid => alive.has(pid), clock_ms: () => Date.now() + 91_000 });
  assert.equal((await later.listSaves())[0]!.locked, false, "a silent lock is stale even if its PID is reused");
  const taken = await later.acquireLock(id); await later.saveCampaign(campaign); await taken.release();
  // A live holder's heartbeat refreshes the lock file.
  const beating = new FileCampaignRepository(world, root, { lock_heartbeat_ms: 20 }), held = await beating.acquireLock(id);
  const first = (await fs.stat(join(root, id, ".lock"))).mtimeMs; await new Promise(r => setTimeout(r, 80));
  assert.ok((await fs.stat(join(root, id, ".lock"))).mtimeMs >= first); await held.release();
});

test("soft delete moves the whole campaign to saves/.deleted (refused while locked); nothing is permanently deleted", async () => {
  const base = await temp(), root = join(base, "campaigns"), { world, campaign } = richCampaign(), id = campaign.exportSnapshot().campaign_id;
  const repository = new FileCampaignRepository(world, root, { now: () => now });
  await repository.saveCampaign(campaign); await repository.appendTranscript(id, [{ i: 0, at: now, role: "narrator", text: "x", revision: 1 }]);
  const lock = await repository.acquireLock(id);
  await assert.rejects(repository.deleteCampaign(id), { code: "campaign_locked" }); await lock.release();
  const { moved_to } = await repository.deleteCampaign(id);
  assert.deepEqual((await fs.readdir(join(base, ".deleted", moved_to))).sort(), ["backups", "save.json", "transcript.jsonl"]);
  assert.deepEqual(await repository.listSaves(), []);
});

// ------------------------------------------------------------------------------------------------ transcript
test("transcript: append-only JSONL history; damaged lines skipped; rollback markers hide abandoned history; missing is not an error", async () => {
  const root = await temp(), { world, campaign } = richCampaign(), repository = new FileCampaignRepository(world, root), id = campaign.exportSnapshot().campaign_id;
  await repository.saveCampaign(campaign);
  assert.equal((await repository.readTranscript(id)).status, "missing");
  await repository.appendTranscript(id, [{ i: 0, at: now, role: "narrator", text: "Opening", revision: 1 }, { i: 1, at: now, role: "player", text: "Hi", revision: 2, turn_id: "c:r1:t1" }, { i: 2, at: now, role: "narrator", text: "Hello", revision: 2, turn_id: "c:r1:t1" }]);
  await fs.appendFile(join(root, id, "transcript.jsonl"), "{torn line\n");
  await repository.appendTranscript(id, [{ i: 3, at: now, kind: "rollback", revision: 1 }, { i: 4, at: now, role: "player", text: "Again", revision: 2 }]);
  const read = await repository.readTranscript(id);
  assert.deepEqual([read.status, read.entries.map(e => e.text), read.next_index, read.invalid_lines], ["ok", ["Opening", "Again"], 5, 1]);
  assert.equal(parseTranscript(serializeTranscriptRecords([{ i: 0, at: now, role: "system", text: "s", revision: 0 }])).entries.length, 1);
  assert.equal(parseTranscript('{"i":0,"at":"x","role":"narrator","text":"t","revision":0}\n').invalid_lines, 1);
});

// ------------------------------------------------------------------------------------------------ portrait asset lifecycle
const version = (n: number): CharacterPortraitVersion => ({ version_id: `portrait_v${n}`, prompt_version: "portrait-prompt-v2-anime", prompt_fingerprint: "0123456789abcdef", model: "Qwen/Qwen-Image",
  created_at: now, media_type: "image/png", asset_file: `portrait_v${n}.png`, kind: "avatar" });
test("campaign layout: portraits live inside the campaign folder; deferred deletion keeps files any retained save still references; orphans and missing files are reported", async () => {
  const root = await temp(), { world, campaign } = richCampaign(), id = campaign.exportSnapshot().campaign_id;
  const repository = new FileCampaignRepository(world, root, { now: () => now }), store = new PortraitAssetStore(root, { layout: "campaign" });
  const write = async (file: string) => store.finalize(await store.stage(id, a, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), id, a, file);
  for (const n of [1, 2, 3]) await write(`portrait_v${n}.png`);
  change(campaign, { kind: "record_portrait_batch", character_id: a, versions: [version(1), version(2), version(3)], avatar_version_id: "portrait_v1" });
  assert.ok((await fs.readdir(join(root, id, "portraits"))).length === 1, "portraits/<character token>/ inside the campaign folder");
  await repository.saveCampaign(campaign, { metadata: { save_reason: "create" } });
  // The player deletes v3: metadata only; save.json (and its checkpoint) still reference the file, so it is protected.
  change(campaign, { kind: "delete_portrait_version", character_id: a, version_id: "portrait_v3" });
  let pending = (await collectDeferredDeletions(store, id, campaign.exportSnapshot(), await repository.retainedAssetReferences(id), new Set([assetKey(a, "portrait_v3.png")]))).pending;
  assert.equal(pending.size, 1); assert.ok(await store.exists(id, a, "portrait_v3.png"));
  assert.ok(!campaign.exportSnapshot().portraits![0]!.versions.some(v => v.version_id === "portrait_v3"), "protection keeps the file, never the Gallery membership");
  // Two autosaves rotate it out of current and previous, but the create checkpoint still references it.
  for (let i = 0; i < 2; i++) { change(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } }); await repository.saveCampaign(campaign, { metadata: { save_reason: "autosave" } }); }
  pending = (await collectDeferredDeletions(store, id, campaign.exportSnapshot(), await repository.retainedAssetReferences(id), pending)).pending;
  assert.equal(pending.size, 1, "a retained backup protects the file"); assert.ok(await store.exists(id, a, "portrait_v3.png"));
  await fs.rm(join(root, id, "backups"), { recursive: true });
  pending = (await collectDeferredDeletions(store, id, campaign.exportSnapshot(), await repository.retainedAssetReferences(id), pending)).pending;
  assert.equal(pending.size, 0); assert.equal(await store.exists(id, a, "portrait_v3.png"), false);
  // Orphans: an unreferenced file is reported (never auto-removed); a missing referenced file is reported; temps only after an hour.
  await write("portrait_stray.png"); await fs.rm(join(root, id, "portraits", store.characterToken(id, a), "portrait_v2.png"));
  const tmp = await store.stage(id, a, Buffer.from("x"));
  const report = await assessPortraitAssets(store, id, campaign.exportSnapshot(), await repository.retainedAssetReferences(id));
  assert.deepEqual(report.orphans, [`${store.characterToken(id, a)}/portrait_stray.png`]); assert.deepEqual(report.missing, [{ character_id: a, file: "portrait_v2.png" }]);
  assert.equal((await assessPortraitAssets(store, id, campaign.exportSnapshot(), await repository.retainedAssetReferences(id), Date.now() + 2 * 3600_000)).orphans.length, 2);
  assert.ok(await store.exists(id, a, "portrait_stray.png")); await store.discard(tmp);
  // An unreadable retained save makes the reference set incomplete: nothing may be removed and no orphan is claimed.
  await fs.writeFile(join(root, id, "save.previous.json"), "{bad");
  const incomplete = await repository.retainedAssetReferences(id); assert.equal(incomplete.complete, false);
  assert.deepEqual((await assessPortraitAssets(store, id, campaign.exportSnapshot(), incomplete)).orphans, []);
  assert.equal((await collectDeferredDeletions(store, id, campaign.exportSnapshot(), incomplete, new Set([assetKey(a, "portrait_stray.png")]))).pending.size, 1);
  // Cross-campaign: the same character in another campaign uses another folder; listed keys never escape the campaign tree.
  assert.notEqual(store.characterToken("other_campaign", a), store.characterToken(id, a));
  assert.equal(await store.removeListed(id, "../../save.json"), false); assert.equal(await store.removeListed(id, `${store.characterToken(id, a)}/../x.png`), false);
});
