import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { loadWorld } from "../src/world/loader.js";
import { OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { GameSession, SessionHost, SLAVE_MARKET_V1, type SessionDeps } from "../src/app/index.js";
import { AutosaveScheduler, type AutosaveTimers } from "../src/app/autosave.js";
import { PortraitAssetStore } from "../src/app/portrait-store.js";
import { createUIPlaytestSession } from "../src/app/ui-playtest.js";
import { createPlaytestServer } from "../src/ui/server.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { GeneratedImage, ImageGenerationRequest, PortraitImageGenerator } from "../src/llm/image-generator.js";
import { metadata, mockController } from "./turn-fixtures.js";

/** Save/Load v1, pass 2: application lifecycle (host, create/load/save, continuity, transcript, autosave, shutdown, swaps). No paid calls. */
const world = await loadWorld("data");
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "caldrevan-slv1s-")); dirs.push(d); return d; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

class FakeGenerator implements PortraitImageGenerator {
  readonly identity = { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" };
  calls = 0; gate: Promise<void> | undefined;
  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const index = this.calls++; if (this.gate) await this.gate; else await tick();
    return { bytes: Buffer.concat([PNG, Buffer.from([index])]), media_type: "image/png", ...this.identity, provider_seed: request.seed, billable_units: 1, latency_ms: 1 };
  }
}
function fakeTimers() {
  let now = 0, id = 0; const queue = new Map<number, { at: number; fn: () => void }>();
  const timers: AutosaveTimers = { setTimeout(fn, ms) { const h = ++id; queue.set(h, { at: now + ms, fn }); return h; }, clearTimeout(h) { queue.delete(h as number); }, now: () => now };
  return { timers, pending: () => queue.size, async advance(ms: number) {
    const target = now + ms;
    for (;;) {
      const next = [...queue.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break; now = next[1].at; queue.delete(next[0]); next[1].fn(); await tick();
    }
    now = target;
  } };
}
/** One "process": its own repository, store, coordinator memory and narrator (a restart = a new call). */
function processDeps(root: string, options: { autosave?: AutosaveTimers; generator?: FakeGenerator } = {}) {
  const service = new RetrievalService(world), requests: GenerationRequest[] = [];
  let n = 0, setup: ((r: never) => never) | undefined;
  const reply = () => `*Nothing changes. Mark ${++n}.*`;
  const narrator = { async generate(r: GenerationRequest) { requests.push(r); return { text: reply(), ...metadata }; },
    async *stream(r: GenerationRequest) { requests.push(r); const text = reply(); yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...metadata } }; } };
  const coordinator = new TurnCoordinator(world, narrator, mockController([]), { service, search: new HybridSearch(service) },
    { provider_retry: false, narrator_request_setup: request => (setup ? setup(request as never) : request) });
  const repository = new FileCampaignRepository(world, join(root, "campaigns"));
  const deps: SessionDeps & { repository: FileCampaignRepository } = { world, repository, portrait_store: new PortraitAssetStore(join(root, "campaigns"), { layout: "campaign" }),
    portrait_generator: options.generator ?? new FakeGenerator(), portrait_retry_delay_ms: () => 0, engine_version: "0.1.0",
    ...(options.autosave ? { autosave: { timers: options.autosave } } : {}),
    createCoordinator: hooks => { setup = hooks.narrator_request_setup as never; return coordinator; } };
  return { deps, requests, repository };
}
let serial = 0;
/** A saved slave-market campaign with Mira Thorne (adult, canonical) as a managed NPC+ household member. */
async function seeded(root: string) {
  const id = `seeded_campaign_${++serial}`, c = SLAVE_MARKET_V1.create(world, id);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: { id: "mira_thorne", origin: { kind: "canonical", canonical_entity_id: "mira_thorne" }, profile: {}, current: {} } },
    { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "mira_thorne" }] });
  c.apply({ expected_revision: c.revision, commands: [...learnCanonicalName(world, c.exportSnapshot(), "mira_thorne")] as CampaignCommand[] });
  await new FileCampaignRepository(world, join(root, "campaigns")).saveCampaign(c, { metadata: { display_name: "Seeded", scenario_id: SLAVE_MARKET_V1.id, save_reason: "create" } });
  return id;
}
const mira = (s: GameSession) => s.getPlayUiView().household.flatMap(h => h.members).find(m => m.name === "Mira Thorne")!;
const rev = (s: GameSession) => s.getView().session.revision;

test("create campaign (host): stable generated ID, display name, scenario recorded, saved and listed at once, opening in history", async () => {
  const root = await temp(), { deps } = processDeps(root), host = new SessionHost(deps);
  assert.equal(host.active, undefined);
  const created = await host.createCampaign({ display_name: "  Nicco   in Calderan " });
  assert.ok(created.ok, JSON.stringify(created));
  const session = host.active!, id = session.campaignId;
  assert.match(id, /^campaign_\d{8}_[0-9a-f]{6}$/); assert.deepEqual(session.campaignMeta, { display_name: "Nicco in Calderan", scenario_id: "caldrevan.slave_market.v1" });
  assert.equal(session.hasUnsavedChanges, false); assert.equal(session.getView().scene.location.id, "calderan_slave_market");
  const save = JSON.parse(await fs.readFile(join(root, "campaigns", id, "save.json"), "utf8"));
  assert.deepEqual([save.schema_version, save.snapshot.schema_version, save.metadata.display_name, save.metadata.scenario_id, save.metadata.save_reason, save.metadata.engine_version], [5, 6, "Nicco in Calderan", "caldrevan.slave_market.v1", "create", "0.1.0"]);
  assert.match(save.canonical_dataset_id, /^sha256:/);
  const listed = await host.listCampaigns();
  assert.deepEqual(listed.map(c => [c.campaign_id, c.display_name, c.status, c.location_name]), [[id, "Nicco in Calderan", "valid", world.getEntity("calderan_slave_market")!.display_name]]);
  const history = (await fs.readFile(join(root, "campaigns", id, "transcript.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(history.map(h => [h.role, h.text === SLAVE_MARKET_V1.opening_text]), [["narrator", true]]);
  for (const bad of ["", " ", "x".repeat(81), "bell\u0007"]) assert.ok(!(await host.createCampaign({ display_name: bad })).ok);
  assert.ok(!(await host.createCampaign({ display_name: "ok", scenario_id: "caldrevan.unknown.v1" })).ok);
  assert.equal(host.active!.campaignId, id, "a refused create keeps the active campaign");
});

test("save -> restart -> load restores location, time, revision, NPC+ edits, household, gallery, roles, images, Scene RAM, continuity and history; expected_revision stays coherent", async () => {
  const root = await temp(), id = await seeded(root);
  const first = processDeps(root), host = new SessionHost(first.deps);
  assert.ok((await host.loadCampaign({ campaign_id: id })).ok);
  const s = host.active!;
  assert.ok(s.updateNpcAppearance({ ref: mira(s).ref, expected_revision: rev(s), patch: { hair_color: "copper", build: "lean" } }).ok);
  assert.ok(s.overridePlayerLocation({ target: "mudlarks_herbs", expected_revision: rev(s) }).ok);
  for (const input of ["*looks around the shop*", "*asks Mira about her herbs*"]) assert.ok((await s.submitPlayerInput(input)).ok);
  assert.ok((await s.generateNpcPortraitBatch({ ref: mira(s).ref, expected_revision: rev(s), kind: "avatar", pose: "neutral" })).ok);
  assert.ok((await s.generateNpcPortraitBatch({ ref: mira(s).ref, expected_revision: rev(s), kind: "fullbody", pose: "relaxed" })).ok);
  let g = mira(s).appearance_editor!.portrait.gallery;
  assert.ok(s.setNpcPortraitFullBody({ ref: mira(s).ref, expected_revision: rev(s), item: g[4]!.token }).ok);
  const before = { view: s.getView(), play: s.getPlayUiView(), card: mira(s), continuity: s.exportContinuity(), transcript: s.getTranscript() };
  assert.equal(before.continuity!.recent.length, 2);
  const saved = await s.save(); assert.ok(saved.ok);
  assert.equal((await host.shutdown()).saved_error, undefined);
  // Restart: brand-new process objects; nothing carried over in memory.
  const second = processDeps(root), host2 = new SessionHost(second.deps);
  assert.equal(host2.active, undefined, "no campaign is opened silently on startup");
  const loaded = await host2.loadCampaign({ campaign_id: id });
  assert.ok(loaded.ok); assert.deepEqual(loaded.load_report!.warnings, [], "a normal load stays quiet");
  assert.equal(loaded.load_report!.continuity, "restored"); assert.equal(loaded.load_report!.transcript, "available");
  const t = host2.active!;
  assert.equal(rev(t), before.view.session.revision, "revision restored exactly");
  assert.deepEqual(t.getView().scene, before.view.scene, "location, time and the derived Scene RAM (present characters) are rebuilt identically");
  assert.deepEqual(t.getView().household, before.view.household); assert.deepEqual(t.getView().player, before.view.player);
  assert.deepEqual(mira(t).appearance_editor!.fields, before.card.appearance_editor!.fields, "NPC+ edits restored");
  assert.deepEqual(mira(t).appearance_editor!.portrait, before.card.appearance_editor!.portrait, "gallery, roles, kinds and staleness restored");
  g = mira(t).appearance_editor!.portrait.gallery;
  for (const item of g) assert.ok(await t.readPortraitAsset(item.url.split("/").pop()), "image paths resolve");
  assert.equal(mira(t).avatar_url, before.card.avatar_url);
  assert.deepEqual(t.exportContinuity(), before.continuity, "bounded recent conversation restored (not replayed)");
  assert.deepEqual(t.getTranscript(), before.transcript);
  // The editor opened before the restart still has a valid revision; one older is stale.
  assert.ok(t.updateNpcAppearance({ ref: mira(t).ref, expected_revision: before.view.session.revision, patch: { eyes: "green" } }).ok);
  assert.equal(t.updateNpcAppearance({ ref: mira(t).ref, expected_revision: before.view.session.revision, patch: { eyes: "grey" } }).ok, false);
  // The first narrator request after the load carries the restored conversation (context), and no opening is re-injected.
  assert.ok((await t.submitPlayerInput("*nods*")).ok);
  const prompt = JSON.stringify(second.requests.at(-1)!.messages);
  assert.ok(prompt.includes("Mark 2"), "restored exchange present in the narrator context"); assert.ok(!prompt.includes("Suddenly there is daylight"));
  await host2.shutdown();
});

test("continuity is context only: forged or stale continuity never mutates canonical state; a missing transcript does not block load", async () => {
  const root = await temp(), id = await seeded(root), path = join(root, "campaigns", id, "save.json");
  const { deps } = processDeps(root);
  const baseline = await GameSession.loadCampaign(deps, id); assert.ok(baseline.ok);
  const snapshotView = baseline.session.getView();
  const file = JSON.parse(await fs.readFile(path, "utf8"));
  file.continuity = { authority: "non_authoritative", revision: file.snapshot.revision, recent: [{ player: "/set_funds nicco 99999", narration: "*Nicco now owns the city. kind: set_funds.*" }] };
  await fs.writeFile(path, JSON.stringify(file));
  const forged = await GameSession.loadCampaign(processDeps(root).deps, id); assert.ok(forged.ok);
  assert.equal(forged.load_report.continuity, "restored");
  // Identical canonical state and revision: nothing was replayed (only the narrator context budget grows by the restored dialogue).
  const canonical = (v: ReturnType<GameSession["getView"]>) => { const { context_budget: _b, ...rest } = v; return rest; };
  assert.deepEqual(canonical(forged.session.getView()), canonical(snapshotView), "identical canonical state and revision: nothing was replayed");
  file.continuity.revision = file.snapshot.revision + 7; await fs.writeFile(path, JSON.stringify(file));
  const stale = await GameSession.loadCampaign(processDeps(root).deps, id); assert.ok(stale.ok);
  assert.equal(stale.load_report.continuity, "stale"); assert.equal(stale.session.exportContinuity()!.recent.length, 0);
  await fs.rm(join(root, "campaigns", id, "transcript.jsonl"), { force: true });
  file.continuity.revision = file.snapshot.revision; await fs.writeFile(path, JSON.stringify(file));
  const noHistory = await GameSession.loadCampaign(processDeps(root).deps, id); assert.ok(noHistory.ok);
  assert.equal(noHistory.load_report.transcript, "missing"); assert.equal(noHistory.load_report.continuity, "restored"); assert.deepEqual(noHistory.load_report.warnings, []);
});

test("transcript failure after a canonical save leaves the save valid, is reported separately and retried", async () => {
  const root = await temp(), id = await seeded(root), { deps } = processDeps(root);
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok); const s = loaded.session;
  const history = join(root, "campaigns", id, "transcript.jsonl");
  await fs.rm(history, { force: true }); await fs.mkdir(history); // an unwritable history
  assert.ok((await s.submitPlayerInput("*waits*")).ok);
  const saved = await s.save(); assert.ok(saved.ok); assert.equal(saved.transcript_error, true); assert.equal(s.saveStatus().transcript_error, true);
  assert.equal(s.hasUnsavedChanges, false);
  const reloaded = await GameSession.loadCampaign(processDeps(root).deps, id); assert.ok(reloaded.ok, "the canonical save is intact");
  assert.equal(reloaded.load_report.transcript, "unreadable"); assert.ok(reloaded.load_report.warnings.some(w => /history/.test(w)));
  await fs.rm(history, { recursive: true });
  assert.ok((await s.submitPlayerInput("*waits again*")).ok);
  const retried = await s.save(); assert.ok(retried.ok); assert.equal(retried.transcript_error, undefined);
  const lines = (await fs.readFile(history, "utf8")).trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => l.text), ["*waits*", "*Nothing changes. Mark 1.*", "*waits again*", "*Nothing changes. Mark 2.*"], "pending history was retried, in order");
});

test("missing image file: load succeeds, the record stays, the report counts it; deferred deletion protects files retained saves reference", async () => {
  const root = await temp(), id = await seeded(root), { deps } = processDeps(root);
  const host = new SessionHost(deps); assert.ok((await host.loadCampaign({ campaign_id: id })).ok);
  const s = host.active!;
  assert.ok((await s.generateNpcPortraitBatch({ ref: mira(s).ref, expected_revision: rev(s), kind: "avatar" })).ok);
  assert.ok((await s.save()).ok);
  const g = mira(s).appearance_editor!.portrait.gallery, unassigned = g.find(x => !x.is_avatar)!;
  assert.ok((await s.deleteNpcPortrait({ ref: mira(s).ref, expected_revision: rev(s), item: unassigned.token })).ok);
  assert.equal(mira(s).appearance_editor!.portrait.gallery.length, 2, "gone from the live Gallery");
  const portraitDir = join(root, "campaigns", id, "portraits"), files = async () => (await fs.readdir(join(portraitDir, (await fs.readdir(portraitDir))[0]!))).sort();
  assert.equal((await files()).length, 3, "save.json (and its checkpoint) still reference it: the file is kept");
  assert.ok((await s.save()).ok); assert.equal((await files()).length, 3, "save.previous.json and the backup still reference it");
  assert.deepEqual((await s.portraitAssetReport())!.orphans, [], "a protected file is not an orphan");
  assert.equal(mira(s).appearance_editor!.portrait.gallery.length, 2, "protection never resurrects the Gallery entry");
  // Remove the avatar file on disk, then reload: the record stays and the load is not blocked.
  await host.shutdown();
  const loadedSave = JSON.parse(await fs.readFile(join(root, "campaigns", id, "save.json"), "utf8"));
  const avatarAsset = loadedSave.snapshot.portraits[0].versions.find((v: { version_id: string }) => v.version_id === loadedSave.snapshot.portraits[0].avatar_version_id).asset_file;
  await fs.rm(join(portraitDir, (await fs.readdir(portraitDir))[0]!, avatarAsset));
  const host2 = new SessionHost(processDeps(root).deps), reloaded = await host2.loadCampaign({ campaign_id: id });
  assert.ok(reloaded.ok); assert.equal(reloaded.load_report!.missing_assets, 1); assert.ok(reloaded.load_report!.warnings.some(w => /placeholder/.test(w)));
  const t = host2.active!, card = mira(t);
  assert.equal(card.appearance_editor!.portrait.gallery.length, 2); assert.ok(card.avatar_url);
  assert.equal(await t.readPortraitAsset(card.avatar_url!.split("/").pop()), undefined, "missing bytes are simply not served");
  await host2.shutdown();
});

test("autosave (scheduler): 2 s debounce, 10 s max wait, single flight, follow-up after a mutation during a save, waits while not ready, bounded retries, fatal stop", async () => {
  const clock = fakeTimers(); let dirty = false, ready = true, saves = 0, release: (() => void) | undefined, next: { ok: boolean; fatal?: boolean } = { ok: true };
  const scheduler = new AutosaveScheduler({ timers: clock.timers }, { dirty: () => dirty, ready: () => ready,
    save: async () => { saves++; if (release === undefined) { const gate = new Promise<void>(r => { release = r; }); await gate; } const r = next; if (r.ok) dirty = false; return r.ok ? { ok: true } : { ok: false, fatal: !!r.fatal }; } });
  const settle = async () => { release?.(); release = () => undefined; await scheduler.idle(); release = undefined; };
  scheduler.notify(); assert.equal(clock.pending(), 0, "clean campaigns never schedule");
  dirty = true; scheduler.notify(); await clock.advance(1500); scheduler.notify(); await clock.advance(1500);
  assert.equal(saves, 0, "debounced: each mutation restarts the 2 s window");
  for (let i = 0; i < 6; i++) { scheduler.notify(); await clock.advance(1900); }
  assert.equal(saves, 1, "max wait: at most 10 s after the first unsaved mutation");
  scheduler.notify(); assert.equal(scheduler.state, "saving", "single flight: a notification during a save never starts another");
  dirty = true; await settle(); // the save of the earlier revision finishes; a newer mutation is still unsaved
  dirty = true; scheduler.notify(); await clock.advance(2000); assert.equal(saves, 2, "a mutation during a save causes exactly one follow-up save"); await settle();
  ready = false; dirty = true; scheduler.notify(); await clock.advance(5000); assert.equal(saves, 2); assert.equal(scheduler.state, "waiting", "never during a turn, batch or swap");
  ready = true; scheduler.notify(); await clock.advance(0); assert.equal(saves, 3); await settle();
  next = { ok: false, fatal: false }; dirty = true; scheduler.notify(); await clock.advance(2000); await settle();
  assert.equal(scheduler.state, "retrying"); await clock.advance(2000); await settle(); await clock.advance(10_000); await settle(); await clock.advance(30_000); await settle();
  assert.equal(scheduler.state, "failed", "bounded backoff: 3 retries, then wait for the next mutation"); assert.equal(saves, 7);
  next = { ok: false, fatal: true }; scheduler.notify(); await clock.advance(2000); await settle();
  assert.equal(scheduler.state, "stopped", "corrupt/incompatible save state stops autosave"); scheduler.notify(); await clock.advance(60_000); assert.equal(saves, 8);
});

test("autosave (session): commits mark dirty, reading does not; the background save clears dirty; never during a portrait batch", async () => {
  const root = await temp(), id = await seeded(root), clock = fakeTimers(), generator = new FakeGenerator();
  const { deps, repository } = processDeps(root, { autosave: clock.timers, generator });
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok); const s = loaded.session;
  s.getView(); s.getPlayUiView(); s.getTranscript(); await clock.advance(20_000); assert.equal(clock.pending(), 0, "viewing never dirties the campaign");
  assert.ok(s.updateNpcAppearance({ ref: mira(s).ref, expected_revision: rev(s), patch: { build: "wiry" } }).ok);
  assert.equal(s.hasUnsavedChanges, true); await clock.advance(2000); await s.autosaveSettled();
  assert.equal(s.hasUnsavedChanges, false); assert.equal((await repository.loadCampaign(id)).campaign.revision, rev(s));
  assert.equal(JSON.parse(await fs.readFile(join(root, "campaigns", id, "save.json"), "utf8")).metadata.save_reason, "autosave");
  let open!: () => void; generator.gate = new Promise<void>(r => { open = r; });
  const batch = s.generateNpcPortraitBatch({ ref: mira(s).ref, expected_revision: rev(s), kind: "avatar" }); await tick();
  assert.ok(s.overridePlayerLocation({ target: "mudlarks_herbs", expected_revision: rev(s) }).ok);
  await clock.advance(30_000); await s.autosaveSettled();
  assert.equal(s.hasUnsavedChanges, true, "no autosave while the image batch runs"); assert.equal(s.autosaveState, "waiting");
  open(); assert.ok((await batch).ok); await clock.advance(0); await s.autosaveSettled();
  assert.equal(s.hasUnsavedChanges, false, "the batch result and the earlier change are saved once idle");
  await s.shutdown({ discard_unsaved: true });
});

test("a dialogue-only turn (no state change) is still persisted: autosave writes its continuity and history, quit saves the rest; the campaign never shows unsaved", async () => {
  const root = await temp(), id = await seeded(root), clock = fakeTimers();
  const { deps } = processDeps(root, { autosave: clock.timers }), host = new SessionHost(deps);
  assert.ok((await host.loadCampaign({ campaign_id: id })).ok);
  const s = host.active!, revision = rev(s);
  assert.ok((await s.submitPlayerInput("*listens to the bargaining*")).ok);
  assert.equal(rev(s), revision, "this turn committed no canonical change"); assert.equal(s.hasUnsavedChanges, false, "the indicator stays Saved");
  await clock.advance(2000); await s.autosaveSettled();
  const save = () => JSON.parse(require_(join(root, "campaigns", id, "save.json")));
  const require_ = (p: string) => readFileSync(p, "utf8");
  assert.equal(save().continuity.recent.length, 1); assert.equal(save().metadata.save_reason, "autosave");
  assert.match(readFileSync(join(root, "campaigns", id, "transcript.jsonl"), "utf8"), /listens to the bargaining/);
  assert.ok((await s.submitPlayerInput("*keeps listening*")).ok);
  await host.shutdown(); // before the debounce elapses
  assert.equal(save().continuity.recent.length, 2); assert.equal(save().metadata.save_reason, "quit");
});

test("graceful shutdown saves a dirty campaign (reason quit); a refused swap while busy keeps everything as it was", async () => {
  const root = await temp(), idA = await seeded(root), idB = await seeded(root), generator = new FakeGenerator();
  const { deps } = processDeps(root, { generator }), host = new SessionHost(deps);
  assert.ok((await host.loadCampaign({ campaign_id: idA })).ok);
  const a = host.active!;
  let open!: () => void; generator.gate = new Promise<void>(r => { open = r; });
  const batch = a.generateNpcPortraitBatch({ ref: mira(a).ref, expected_revision: rev(a), kind: "avatar" }); await tick();
  for (const attempt of [host.loadCampaign({ campaign_id: idB }), host.createCampaign({ display_name: "New" }), host.closeCampaign()]) {
    const r = await attempt; assert.ok(!r.ok); assert.equal(r.error.code, "turn_in_progress");
  }
  assert.equal(host.active, a, "session swap blocked while an image batch runs");
  open(); assert.ok((await batch).ok);
  assert.ok(a.hasUnsavedChanges);
  assert.ok((await host.loadCampaign({ campaign_id: idB })).ok, "after the batch the swap proceeds");
  assert.equal(a.status, "closed"); assert.equal(host.active!.campaignId, idB);
  const savedA = JSON.parse(await fs.readFile(join(root, "campaigns", idA, "save.json"), "utf8"));
  assert.equal(savedA.metadata.save_reason, "quit", "the dirty campaign was saved before it was closed");
  assert.equal(savedA.snapshot.portraits[0].versions.length, 3);
  // Old session operations after the swap can never touch the new campaign.
  const stale = a.updateNpcAppearance({ ref: mira(host.active!).ref, expected_revision: rev(host.active!), patch: { build: "x" } });
  assert.ok(!stale.ok); assert.equal(stale.error.code, "session_closed");
  assert.ok(host.active!.overridePlayerLocation({ target: "mudlarks_herbs", expected_revision: rev(host.active!) }).ok);
  await host.shutdown();
  assert.equal(JSON.parse(await fs.readFile(join(root, "campaigns", idB, "save.json"), "utf8")).metadata.save_reason, "quit", "process shutdown saved the dirty campaign");
  await assert.rejects(fs.stat(join(root, "campaigns", idB, ".lock")), "lock released");
});

test("campaign isolation and process lock: two campaigns never share portraits; a second host cannot open a held campaign; a failed load keeps the old one", async () => {
  const root = await temp(), idA = await seeded(root), idB = await seeded(root);
  const hostA = new SessionHost(processDeps(root).deps), hostB = new SessionHost(processDeps(root).deps);
  assert.ok((await hostA.loadCampaign({ campaign_id: idA })).ok); assert.ok((await hostB.loadCampaign({ campaign_id: idB })).ok);
  const a = hostA.active!, b = hostB.active!;
  for (const s of [a, b]) assert.ok((await s.generateNpcPortraitBatch({ ref: mira(s).ref, expected_revision: rev(s), kind: "avatar" })).ok);
  const urlA = mira(a).avatar_url!, urlB = mira(b).avatar_url!;
  assert.notEqual(urlA, urlB);
  assert.equal(await b.readPortraitAsset(urlA.split("/").pop()), undefined, "no cross-campaign portrait leakage");
  assert.equal(await a.readPortraitAsset(urlB.split("/").pop()), undefined);
  assert.notDeepEqual(await fs.readdir(join(root, "campaigns", idA, "portraits")), await fs.readdir(join(root, "campaigns", idB, "portraits")));
  const blocked = await hostB.loadCampaign({ campaign_id: idA });
  assert.ok(!blocked.ok); assert.equal(blocked.error.code, "campaign_locked"); assert.equal(hostB.active, b, "the old campaign stays active after a failed load");
  assert.equal((await hostB.listCampaigns()).find(c => c.campaign_id === idA)!.locked, true);
  await hostA.shutdown(); await hostB.shutdown();
});

test("corrupt current: load refuses and keeps the active campaign; explicit recovery from previous is reported; the next save keeps the corrupt artifact", async () => {
  const root = await temp(), id = await seeded(root), other = await seeded(root), { deps } = processDeps(root), host = new SessionHost(deps);
  assert.ok((await host.loadCampaign({ campaign_id: id })).ok);
  const s = host.active!; assert.ok(s.overridePlayerLocation({ target: "mudlarks_herbs", expected_revision: rev(s) }).ok); assert.ok((await s.save()).ok);
  assert.ok((await host.loadCampaign({ campaign_id: other })).ok);
  await fs.writeFile(join(root, "campaigns", id, "save.json"), "{truncated");
  const failed = await host.loadCampaign({ campaign_id: id });
  assert.ok(!failed.ok); assert.equal(failed.error.code, "invalid_json"); assert.equal(host.active!.campaignId, other);
  const entry = (await host.listCampaigns()).find(c => c.campaign_id === id)!;
  assert.deepEqual([entry.status, entry.previous_valid, entry.backups.length > 0], ["invalid_json", true, true]);
  const recovered = await host.loadCampaign({ campaign_id: id, slot: "previous" });
  assert.ok(recovered.ok); assert.equal(recovered.load_report!.recovered_from, "previous"); assert.ok(recovered.load_report!.warnings.some(w => /previous save/.test(w)));
  const saved = await host.active!.save(); assert.ok(saved.ok); assert.ok(saved.saved.quarantined);
  assert.equal(await fs.readFile(join(root, "campaigns", id, saved.saved.quarantined!), "utf8"), "{truncated");
  assert.equal((await host.listCampaigns()).find(c => c.campaign_id === id)!.status, "valid");
  await host.shutdown();
});

test("additive canon after a save: the campaign loads quietly and unchanged; not dirty; no autosave is scheduled because canon grew", async () => {
  const root = await temp(), id = await seeded(root), path = join(root, "campaigns", id, "save.json");
  // Simulate a save written before an NPC existed in canon: drop one canonical NPC from the saved runtime and its reference.
  const file = JSON.parse(await fs.readFile(path, "utf8")), npc = file.snapshot.runtime.npc_locations.find((n: { character_id: string }) => !JSON.stringify({ ...file.snapshot, runtime: { ...file.snapshot.runtime, npc_locations: [] } }).includes(`"${n.character_id}"`)).character_id;
  file.snapshot.runtime.npc_locations = file.snapshot.runtime.npc_locations.filter((n: { character_id: string }) => n.character_id !== npc);
  file.canon_references = file.canon_references.filter((r: { id: string }) => r.id !== npc);
  await fs.writeFile(path, JSON.stringify(file));
  const clock = fakeTimers(), { deps } = processDeps(root, { autosave: clock.timers });
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok);
  assert.equal(loaded.load_report.canon.tier, "compatible"); assert.equal(loaded.load_report.canon.revision_advanced, false); assert.deepEqual(loaded.load_report.warnings, []);
  assert.equal(world.getEntity(npc)?.type, "character", "the NPC stays available through canon");
  assert.equal(rev(loaded.session), file.snapshot.revision, "revision unchanged"); assert.equal(loaded.session.hasUnsavedChanges, false, "the session stays saved");
  assert.equal(clock.pending(), 0, "no autosave is scheduled because canon grew"); await clock.advance(30_000);
  assert.equal(loaded.session.autosaveState, "idle");
  await loaded.session.shutdown({ discard_unsaved: true });
  assert.equal(JSON.parse(await fs.readFile(path, "utf8")).snapshot.revision, file.snapshot.revision, "the save file was not rewritten by loading");
});

test("disposable playtest mode stays isolated: fixed session, server-held transcript, no campaign routes, nothing under the campaigns root", async () => {
  const root = await temp(), { deps } = processDeps(root);
  const session = createUIPlaytestSession({ ...deps, repository: new FileCampaignRepository(world, join(root, "ui_playtest")) });
  assert.equal(session.campaignId, "ui_playtest");
  const server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const state = await (await fetch(`${url}/api/session`)).json();
    assert.equal(state.messages.length, 1); assert.equal(state.campaign, undefined);
    assert.equal((await fetch(`${url}/api/campaigns`)).status, 404);
    assert.equal((await fetch(`${url}/api/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 404);
  } finally { server.close(); await session.shutdown({ discard_unsaved: true }); }
  await assert.rejects(fs.stat(join(root, "campaigns")), "the playtest never writes into the campaigns root");
  const host = new SessionHost(processDeps(root).deps);
  await fs.mkdir(join(root, "ui_playtest", "ui_playtest"), { recursive: true });
  assert.deepEqual(await host.listCampaigns(), [], "legacy playtest folders are not campaigns");
});

test("HTTP host mode: start screen, create, save, load, close; save state in the session payload", async () => {
  const root = await temp(), id = await seeded(root), { deps } = processDeps(root), host = new SessionHost(deps);
  const server = createPlaytestServer(host); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (route: string, body: unknown) => fetch(`${url}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const start = await (await fetch(`${url}/api/session`)).json();
    assert.equal(start.campaign, null); assert.deepEqual(start.messages, []);
    assert.equal((await post("/api/turn", { text: "hello" })).status, 409, "no campaign: no play");
    const list = await (await fetch(`${url}/api/campaigns`)).json();
    assert.deepEqual(list.scenarios.map((s: { id: string }) => s.id), ["caldrevan.slave_market.v1"]); assert.equal(list.campaigns[0].campaign_id, id);
    const created = await (await post("/api/campaigns/create", { display_name: "Fresh", scenario_id: "caldrevan.slave_market.v1" })).json();
    assert.equal(created.ok, true); assert.equal(created.campaign.display_name, "Fresh"); assert.equal(created.campaign.save.state, "saved");
    assert.equal(created.messages[0].text, SLAVE_MARKET_V1.opening_text);
    const turned = await (await post("/api/turn", { text: "*looks around*" })).json();
    assert.equal(turned.messages.length, 3, "opening + player + narrator from the session-owned history");
    const moved = await (await post("/api/location", { target: "mudlarks_herbs", expected_revision: turned.revision })).json();
    assert.equal(moved.campaign.save.state, "unsaved");
    const saved = await (await post("/api/save", {})).json();
    assert.equal(saved.ok, true); assert.equal(saved.campaign.save.state, "saved"); assert.doesNotMatch(JSON.stringify(saved), /campaigns[\\/]|\.json|tmp/);
    const loaded = await (await post("/api/campaigns/load", { campaign_id: id })).json();
    assert.equal(loaded.ok, true); assert.equal(loaded.campaign.id, id); assert.deepEqual(loaded.load_report.warnings, []);
    assert.equal((await post("/api/campaigns/load", { campaign_id: "../escape" })).status, 422);
    const closed = await (await post("/api/campaigns/close", {})).json();
    assert.equal(closed.ok, true); assert.equal(closed.campaign, null);
  } finally { server.close(); await host.shutdown(); }
});
