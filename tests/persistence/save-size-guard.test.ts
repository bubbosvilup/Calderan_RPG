import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { CampaignSaveError } from "../../src/persistence/errors.js";
import { encodeStore, decodeStore } from "../../src/persistence/optional-store.js";
import { MAX_SAVE_BYTES, SAVE_WARNING_BYTES } from "../../src/persistence/strict-json.js";
import { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { WorldStore } from "../../src/world/world-store.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { GameSession, type SessionDeps } from "../../src/app/index.js";
import { appError } from "../../src/app/app-errors.js";
import { AutosaveScheduler, type AutosaveTimers } from "../../src/app/autosave.js";
import { mockController, mockNarrator } from "../support/turn-fixtures.js";
import { fixtures, room } from "../support/world-fixtures.js";

/**
 * Block B4 (PER-1, N1, N8): an oversized save is its own non-fatal code, `save_too_large`, never `invalid_save` (which reads as corruption). Nothing on disk
 * changes when a save is refused for size; a save above SAVE_WARNING_BYTES still saves and says so; autosave keeps running but does not retry the same
 * oversized state on a timer; quit reports the size, not damage. The read cap also holds on write for the side stores.
 */
const world = new WorldStore(fixtures());
async function temporary(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), "caldrevan-size-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
/** Campaign facts of 8,000 characters each: `bytes` of fact text in total. */
function grow(campaign: CampaignState, bytes: number, tag: string) {
  const commands: CampaignCommand[] = [];
  for (let n = 0; n * 8000 < bytes; n++) commands.push({ kind: "create_fact", fact: { id: `campaign_fact_${tag}_${n}`, content: { kind: "campaign", statement: `${tag} ${n} ${"x".repeat(7980)}`, truth: "true" } } });
  for (let i = 0; i < commands.length; i += 128) campaign.apply({ expected_revision: campaign.revision, commands: commands.slice(i, i + 128) });
}
const fresh = (id = "fixture_campaign") => new CampaignState(world, id, { player_location: room, world_time: { world_minute: 0 } });

test("encodeStore enforces the read cap on write at the exact boundary (N1), mapped to save_too_large", () => {
  const encode = (filler: string) => encodeStore("learning", "fixture_campaign", 1, "2026-10-14T00:00:00.000Z", { premium_reflections: [filler as never] });
  const overhead = Buffer.byteLength(encode(""), "utf8");
  const atCap = encode("y".repeat(MAX_SAVE_BYTES - overhead));
  assert.equal(Buffer.byteLength(atCap, "utf8"), MAX_SAVE_BYTES, "a store of exactly the cap is written");
  assert.equal(decodeStore(atCap, "learning", "fixture_campaign").bound_revision, 1, "and the reader accepts it: write and read share one cap");
  assert.throws(() => encode("y".repeat(MAX_SAVE_BYTES - overhead + 1)), { code: "save_too_large" });
});

test("side stores and saves are written as compact JSON (P2)", async t => {
  const root = await temporary(t), campaign = fresh(); grow(campaign, 16_000, "small");
  await new FileCampaignRepository(world, root).saveCampaign(campaign);
  for (const file of ["save.json", "optional/learning.json", "optional/media.json"]) {
    const text = await fs.readFile(join(root, "fixture_campaign", file), "utf8");
    assert.equal(text.endsWith("}\n"), true); assert.equal(text.slice(0, -1).includes("\n"), false, `${file} is one line`);
  }
});

test("an oversized save fails with save_too_large and leaves every file on disk byte-identical", async t => {
  const root = await temporary(t), repository = new FileCampaignRepository(world, root, { checkpoint_interval_ms: 0 }), campaign = fresh();
  campaign.apply({ expected_revision: 0, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] });
  await repository.saveCampaign(campaign, { metadata: { save_reason: "manual" } });
  const directory = join(root, "fixture_campaign");
  const snapshot = async () => { const out: Record<string, string> = {}; for (const f of await fs.readdir(directory, { recursive: true })) { const p = join(directory, f); if ((await fs.stat(p)).isFile()) out[f] = await fs.readFile(p, "utf8"); } return out; };
  const before = await snapshot();
  grow(campaign, MAX_SAVE_BYTES + 1024, "huge");
  await assert.rejects(repository.saveCampaign(campaign, { metadata: { save_reason: "manual" } }), (e: CampaignSaveError) => e.code === "save_too_large" && /Nothing was written/.test(e.recovery_hint));
  assert.deepEqual(await snapshot(), before, "no slot, store, checkpoint or temp file changed");
  assert.equal((await repository.loadCampaign("fixture_campaign")).campaign.revision, 1, "the last save still loads");
});

test("a save above the warning threshold still saves and carries size_warning; a small one does not", async t => {
  const root = await temporary(t), repository = new FileCampaignRepository(world, root), campaign = fresh();
  const small = await repository.saveCampaign(campaign);
  assert.equal(small.size_warning, undefined); assert.ok(small.bytes > 0 && small.bytes < SAVE_WARNING_BYTES);
  grow(campaign, SAVE_WARNING_BYTES + 1024, "large");
  const large = await repository.saveCampaign(campaign);
  assert.equal(large.size_warning, true); assert.ok(large.bytes > SAVE_WARNING_BYTES && large.bytes <= MAX_SAVE_BYTES);
  assert.equal((await repository.loadCampaign("fixture_campaign")).campaign.revision, campaign.revision);
});

test("save_too_large is a player-safe, never-retry error distinct from a damaged save", () => {
  const big = appError("save_too_large"), damaged = appError("invalid_save");
  assert.equal(big.retryable, false); assert.notEqual(big.message, damaged.message);
  assert.match(big.message, /too large/); assert.match(big.message, /last save is intact/); assert.doesNotMatch(big.message, /invalid|damaged|corrupt/i);
});

/** Fake timers: callbacks run only when the test calls `run`. */
function fakeTimers(): AutosaveTimers & { run(): void; pending(): number } {
  let queue: (() => void)[] = [];
  return { setTimeout: fn => { queue.push(fn); return fn; }, clearTimeout: handle => { queue = queue.filter(f => f !== handle); }, now: () => 0,
    run() { const due = queue; queue = []; for (const fn of due) fn(); }, pending: () => queue.length };
}

test("autosave: a retry:false failure waits for the next mutation instead of a timed retry, and never stops", async () => {
  const timers = fakeTimers(); let dirty = true, attempts = 0;
  const scheduler = new AutosaveScheduler({ timers }, { dirty: () => dirty, ready: () => true, save: async () => { attempts++; return { ok: false, fatal: false, retry: false }; } });
  scheduler.notify(); timers.run(); await scheduler.idle();
  assert.equal(scheduler.state, "failed"); assert.equal(timers.pending(), 0, "no backoff timer"); assert.equal(attempts, 1);
  scheduler.notify(); timers.run(); await scheduler.idle();
  assert.equal(attempts, 2, "the next mutation tries again"); assert.equal(scheduler.state, "failed");
  dirty = false; scheduler.notify(); assert.notEqual(scheduler.state, "stopped");
});

function session(root: string, campaign: CampaignState, timers?: AutosaveTimers): GameSession {
  const service = new RetrievalService(world), repository = new FileCampaignRepository(world, root);
  const deps: SessionDeps = { world, repository, ...(timers ? { autosave: { timers } } : {}),
    createCoordinator: hooks => new TurnCoordinator(world, mockNarrator("Nothing changes."), mockController([]), { service, search: new HybridSearch(service) }, { diagnostics_sink: hooks.diagnostics_sink, provider_retry: false }) };
  return GameSession.fromCampaign(deps, campaign);
}

test("session: an oversized manual save and quit report save_too_large (not corruption); autosave keeps running", async t => {
  const root = await temporary(t), campaign = fresh(), timers = fakeTimers(), game = session(root, campaign, timers);
  assert.equal((await game.save()).ok, true);
  grow(campaign, MAX_SAVE_BYTES + 1024, "huge");
  const manual = await game.save();
  assert.equal(manual.ok, false); assert.equal(!manual.ok && manual.error.code, "save_too_large");
  assert.equal(game.saveStatus().error, "save_too_large");
  game.resumeAutosave(); timers.run(); await game.autosaveSettled();
  assert.notEqual(game.autosaveState, "stopped", "an oversized autosave is not fatal");
  assert.equal(timers.pending(), 0, "and is not retried on a timer");
  const quit = await game.shutdown({ save_reason: "quit" });
  assert.equal(quit.closed, false); assert.equal(!quit.closed && quit.error?.code, "save_too_large");
  assert.equal((await game.shutdown({ discard_unsaved: true })).closed, true);
});

test("session: a save past the warning threshold reports size_warning in the save status", async t => {
  const root = await temporary(t), campaign = fresh(), game = session(root, campaign);
  assert.equal((await game.save()).ok, true); assert.equal(game.saveStatus().size_warning, undefined);
  grow(campaign, SAVE_WARNING_BYTES + 1024, "large");
  assert.equal((await game.save()).ok, true); assert.equal(game.saveStatus().size_warning, true);
  assert.equal((await game.shutdown({ discard_unsaved: true })).closed, true);
});
