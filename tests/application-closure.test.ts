import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { ReflectionProvider } from "../src/turn/reflection.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import { GameSession, createProductionDeps, readProviderStatus, type SessionDeps, type SessionEvent } from "../src/app/index.js";
import { mockController, mockNarrator, metadata } from "./turn-fixtures.js";
import { scriptedController, scriptedNarrator, type Step } from "./provider-failure-scripts.js";

const canon = await loadWorld("data");
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
async function tempRepo(world: WorldStore) { const dir = await mkdtemp(join(tmpdir(), "caldrevan-app-")); dirs.push(dir); return { dir, repository: new FileCampaignRepository(world, dir) }; }
function depsFor(world: WorldStore, repository: FileCampaignRepository, narrator: NarratorProvider, controller = mockController([]), extra: Partial<SessionDeps> = {}): SessionDeps {
  const service = new RetrievalService(world), retrieval = { service, search: new HybridSearch(service) };
  return { world, repository, createCoordinator: hooks => new TurnCoordinator(world, narrator, controller, retrieval, { diagnostics_sink: hooks.diagnostics_sink, provider_retry: false }), ...extra };
}
const story = "The tower door opens onto a quiet room. Nothing else changes.";
async function newSession(narrator: NarratorProvider = mockNarrator(story), extra: Partial<SessionDeps> = {}) {
  const { dir, repository } = await tempRepo(canon), deps = depsFor(canon, repository, narrator, mockController([]), extra);
  const created = GameSession.createCampaign(deps, "app_closure"); assert.ok(created.ok);
  return { dir, repository, deps, session: created.session };
}

test("smoke: new game → inspect → talk → move → act → save → mutate → load rolls back → continue → shutdown (public façade only)", async () => {
  const { dir, deps, session } = await newSession();
  const v0 = session.getView();
  assert.equal(v0.session.revision, 1); assert.equal(v0.session.save.state, "unsaved"); assert.equal(v0.scene.location.id, "heartstone_square"); assert.equal(v0.player.gold, 500);
  assert.deepEqual(v0.household.map(h => h.members), [[]], "the opening household has no members: no accidental NPC+ creation");
  assert.ok(v0.scene.exits.some(e => e.target_id === "heartstone_lr"));
  const events: SessionEvent[] = [];
  const talk = await session.submitPlayerInput("I greet the empty square.", { onEvent: e => events.push(e) });
  assert.ok(talk.ok); assert.equal(talk.narration, story);
  assert.deepEqual(events.map(e => e.type), ["status_changed", "player_message", "narrator_preview", "narrator_preview", "narration_delta", "turn_completed", "status_changed"]);
  assert.equal(events.find(e => e.type === "narration_delta")!.type, "narration_delta");
  const move = await session.submitPlayerInput("/go heartstone_lr"); assert.ok(move.ok);
  assert.equal(move.view.scene.location.id, "heartstone_lr"); assert.equal(move.trace.movement?.location_before, "heartstone_square"); assert.ok(move.trace.movement!.minutes_elapsed > 0);
  const wait = await session.submitPlayerInput("/wait 30"); assert.ok(wait.ok);
  assert.equal(wait.view.scene.time.world_minute, move.view.scene.time.world_minute + 30);
  const saved = await session.save(); assert.ok(saved.ok); assert.equal(saved.view.session.save.state, "saved"); assert.equal(session.hasUnsavedChanges, false);
  const savedView = session.getView();
  const more = await session.submitPlayerInput("/wait 60"); assert.ok(more.ok); assert.equal(session.hasUnsavedChanges, true);
  const loaded = await GameSession.loadCampaign(deps, "app_closure"); assert.ok(loaded.ok);
  assert.deepEqual({ ...loaded.session.getView().scene, }, savedView.scene, "state is exactly the saved state");
  assert.equal(loaded.session.getView().session.revision, savedView.session.revision); assert.equal(loaded.session.hasUnsavedChanges, false);
  const cont = await loaded.session.submitPlayerInput("/wait 15"); assert.ok(cont.ok);
  assert.equal((await loaded.session.shutdown()).closed, false, "unsaved changes are never discarded silently");
  assert.deepEqual(await loaded.session.shutdown({ discard_unsaved: true }), { closed: true, discarded_unsaved_changes: true });
  assert.equal(loaded.session.status, "closed");
  assert.equal((await loaded.session.submitPlayerInput("hello")).ok, false);
  assert.ok((await readdir(dir)).includes("app_closure"));
});

test("no hidden autosave: turns never write a save; create → save → load preserves the exact opening", async () => {
  const { dir, deps, session } = await newSession();
  await session.submitPlayerInput("/wait 5"); await session.submitPlayerInput("I wait quietly.");
  assert.deepEqual(await readdir(dir), [], "no save directory exists before an explicit save");
  assert.ok((await session.save()).ok); const before = session.getView();
  const loaded = await GameSession.loadCampaign(deps, "app_closure"); assert.ok(loaded.ok);
  const a = { ...before, session: { ...before.session, status: "idle" } }, b = { ...loaded.session.getView(), session: { ...loaded.session.getView().session, status: "idle" } };
  // Recent dialogue is session-local; load reconstructs metrics without that unsaved continuity.
  assert.deepEqual({ ...b, context_budget: undefined }, { ...a, context_budget: undefined });
});

test("application commands never reach the narrator; busy and overlapping submits are rejected without mutation", async () => {
  let calls = 0, release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const slow: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { calls++; await gate; yield { type: "text_delta", text: story }; yield { type: "completed", result: { text: story, ...metadata } }; } };
  const { session } = await newSession(slow);
  for (const text of ["/save", "/load x", "/new y", "/quit", "/status", "/debug"]) { const r = await session.submitPlayerInput(text); assert.ok(!r.ok && r.error.code === "invalid_input", text); }
  assert.equal(calls, 0);
  const first = session.submitPlayerInput("I wait."), second = await session.submitPlayerInput("I also wait.");
  assert.equal(session.status, "running_turn");
  assert.ok(!second.ok && second.error.code === "turn_in_progress" && second.error.retryable && !second.error.turn_state_changed);
  const saveWhileBusy = await session.save(); assert.ok(!saveWhileBusy.ok && saveWhileBusy.error.code === "turn_in_progress");
  release(); const done = await first; assert.ok(done.ok); assert.equal(calls, 1); assert.equal(session.getView().session.revision, 1 + (done.trace.revision_after - done.trace.revision_before));
  assert.equal(session.status, "idle");
});

test("provider failures: no partial commit, readable error, session stays usable (narrator and controller matrix)", async () => {
  const cases: { narrator?: Step[]; controller?: Step[]; code: string; provider?: string; retryable: boolean }[] = [
    { narrator: [{ fail: "timeout" }], code: "narrator_failed", provider: "timeout", retryable: true },
    { narrator: [{ fail: "rate_limited" }], code: "narrator_failed", provider: "rate_limited", retryable: true },
    { narrator: [{ fail: "provider_unavailable" }], code: "narrator_failed", provider: "provider_unavailable", retryable: true },
    { narrator: ["malformed"], code: "narrator_failed", provider: "invalid_provider_response", retryable: true },
    { narrator: [{ fail: "authentication_error" }], code: "narrator_failed", provider: "authentication_error", retryable: false },
    { narrator: ["empty"], code: "narrator_failed", retryable: true },
    { controller: [{ fail: "timeout" }], code: "controller_failed", provider: "timeout", retryable: true },
    { controller: [{ fail: "rate_limited" }], code: "controller_failed", provider: "rate_limited", retryable: true },
    { controller: [{ fail: "provider_unavailable" }], code: "controller_failed", provider: "provider_unavailable", retryable: true },
    { controller: ["malformed"], code: "controller_failed", provider: "structured_output_invalid", retryable: true },
  ];
  for (const c of cases) {
    const { repository } = await tempRepo(canon);
    const deps = depsFor(canon, repository, scriptedNarrator([story], c.narrator ?? ["ok"]), scriptedController([], c.controller ?? ["ok"]));
    const created = GameSession.createCampaign(deps, "failing"); assert.ok(created.ok);
    const session = created.session, before = session.getView();
    const failed = await session.submitPlayerInput("I wait quietly.");
    assert.ok(!failed.ok, JSON.stringify(c)); assert.equal(failed.error.code, c.code); assert.equal(failed.error.provider_code, c.provider); assert.equal(failed.error.retryable, c.retryable);
    assert.equal(failed.error.turn_state_changed, false); assert.ok(!/at .*\.(ts|js):\d+|Error:/.test(failed.error.message), "no stack or raw exception text");
    assert.equal(session.status, "idle"); assert.deepEqual(session.getView().scene, before.scene); assert.equal(session.getView().session.revision, before.session.revision);
    assert.equal(session.getTurn(failed.turn_id!)!.outcome, "failed");
  }
});

test("context_too_large is clean at the application layer: no commit, stable code, not retryable, campaign unchanged", async () => {
  const f = turnFixture(), { repository } = await tempRepo(f.world);
  for (let batch = 0; batch < 3; batch++) f.campaign.apply({ expected_revision: f.campaign.revision, commands: Array.from({ length: 100 }, (_, k): CampaignCommand => ({ kind: "register_item",
    item: { id: `campaign_item_load_${batch * 100 + k}`, origin: { kind: "created" }, name: `Heavy ledger ${batch * 100 + k}`, description: "A ledger bound in cracked leather.", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } } })) });
  const session = GameSession.fromCampaign(depsFor(f.world, repository, mockNarrator(story)), f.campaign), before = f.campaign.exportSnapshot();
  const r = await session.submitPlayerInput("Hello.");
  assert.ok(!r.ok); assert.equal(r.error.code, "context_too_large"); assert.equal(r.error.retryable, false); assert.equal(r.error.turn_state_changed, false);
  assert.equal(f.campaign.exportSnapshot(), before);
  assert.equal(r.turn_id, undefined, "oversized active context is rejected by preflight before a turn is accepted");
});

test("save errors are readable and non-mutating: corrupt save, missing save, dataset mismatch, invalid id", async () => {
  const { dir, deps, session } = await newSession(); assert.ok((await session.save()).ok);
  const path = join(dir, "app_closure", "save.json"), good = await readFile(path, "utf8");
  await writeFile(path, good.slice(0, 40));
  const corrupt = await GameSession.loadCampaign(deps, "app_closure"); assert.ok(!corrupt.ok); assert.ok(["invalid_json", "invalid_save"].includes(corrupt.error.code)); assert.equal(corrupt.error.retryable, false);
  assert.equal(await readFile(path, "utf8"), good.slice(0, 40), "a failed load never rewrites the file");
  await writeFile(path, good);
  const fx = turnFixture(), fxRepo = new FileCampaignRepository(fx.world, join(dir, "fx")); await fxRepo.saveCampaign(fx.campaign);
  const other = turnFixture(true).world, fxPath = join(dir, "fx", "turn_fixture", "save.json"), fxGood = await readFile(fxPath, "utf8");
  const mismatch = await GameSession.loadCampaign(depsFor(other, new FileCampaignRepository(other, join(dir, "fx")), mockNarrator(story)), "turn_fixture");
  // Save/Load v1 tiered canon compatibility: referenced NPCs whose authored location field changed still load, with a drift warning.
  assert.ok(mismatch.ok, JSON.stringify(mismatch.ok ? "" : mismatch.error)); assert.equal(mismatch.load_report.canon.tier, "compatible_with_warnings");
  assert.deepEqual([...mismatch.load_report.canon.drifted_references].filter(id => id === "gerome" || id === "maren"), ["gerome", "maren"]);
  assert.equal(await readFile(fxPath, "utf8"), fxGood, "no silent migration");
  const missing = await GameSession.loadCampaign(deps, "nope"); assert.ok(!missing.ok); assert.equal(missing.error.code, "not_found");
  const bad = GameSession.createCampaign(deps, "../escape"); assert.ok(!bad.ok); assert.equal(bad.error.code, "invalid_id");
});

test("stale revision: a campaign that changes while a turn runs discards the turn and keeps only the outside change", async () => {
  const f = turnFixture(), { repository } = await tempRepo(f.world);
  const controller = mockController([], () => { f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "set_funds", character_id: "nicco", gold: 7 }] }); });
  const session = GameSession.fromCampaign(depsFor(f.world, repository, mockNarrator("Brenna smiles."), controller), f.campaign);
  const r = await session.submitPlayerInput("Hello.");
  assert.ok(!r.ok); assert.equal(r.error.code, "stale_turn"); assert.equal(session.getView().player.gold, 7); assert.equal(f.campaign.revision, 2);
});

test("reflection after a turn is non-blocking: failure leaves the committed turn intact and is surfaced only in the trace; next input waits as busy", async () => {
  const f = turnFixture(), { repository } = await tempRepo(f.world);
  const home = "campaign_household_h";
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: home, name: "Home" }, { kind: "set_membership", household_id: home, membership: { character_id: "nicco", status: "member", role: "owner" } }] });
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "join_household", household_id: home, character_id: "brenna" }] });
  for (const dir of ["raise", "raise", "raise"] as const) f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: dir }] });
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  const failing: ReflectionProvider = { async reflect() { await gate; throw new Error("provider exploded with secret sk-test-123"); } };
  const session = GameSession.fromCampaign(depsFor(f.world, repository, mockNarrator("Brenna nods."), mockController([]), { reflection_provider: failing }), f.campaign);
  const events: SessionEvent[] = [];
  const running = session.submitPlayerInput("Hello.", { onEvent: e => events.push(e) });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(session.status, "post_turn"); assert.ok(events.some(e => e.type === "turn_completed"), "narration is delivered before reflection settles");
  const busy = await session.submitPlayerInput("Again."); assert.ok(!busy.ok && busy.error.code === "turn_in_progress");
  release(); const done = await running;
  assert.ok(done.ok); assert.equal(done.trace.reflection.status, "failed_nonblocking"); assert.equal(session.status, "idle");
  assert.ok(!JSON.stringify(done).includes("sk-test-123"), "raw provider exception text never reaches the result");
  const post = events.find(e => e.type === "post_turn_completed"); assert.ok(post);
});

test("debug export is safe by default and the turn id is quotable; unsafe content needs an explicit session opt-in", async () => {
  const f = turnFixture(), { repository } = await tempRepo(f.world);
  const make = (unsafe: boolean) => GameSession.fromCampaign(depsFor(f.world, repository, mockNarrator("Brenna smiles."), mockController([]), { unsafe_trace: unsafe }), f.campaign);
  const safe = make(false), r = await safe.submitPlayerInput("Tell me a secret."); assert.ok(r.ok);
  assert.match(r.turn_id, /^turn_fixture:r\d+:t1$/);
  const exported = safe.exportTurnDebug(r.turn_id, { unsafe: true })!; assert.equal(exported.includes_unsafe_content, false);
  const text = JSON.stringify(exported); assert.ok(!text.includes("HIDDEN_SECRET_SENTINEL")); assert.ok(!("unsafe" in exported.trace));
  assert.equal(exported.trace.player_input, "Tell me a secret."); assert.equal(exported.trace.narration_status, "draft"); assert.ok(exported.trace.context_chars! > 0); assert.ok(exported.trace.models?.narrator);
  const dev = make(true), d = await dev.submitPlayerInput("Hello again."); assert.ok(d.ok);
  assert.equal(dev.exportTurnDebug(d.turn_id)!.includes_unsafe_content, false, "unsafe is opt-in per export as well");
  assert.equal(dev.exportTurnDebug(d.turn_id, { unsafe: true })!.includes_unsafe_content, true);
});

test("secrets and private canon: the view never carries private facts; the provider status carries no key; saves never contain the key", async () => {
  const f = turnFixture(), { dir, repository } = await tempRepo(f.world), previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "sk-secret-sentinel-999";
  try {
    const status = readProviderStatus(); assert.equal(status.configured, true); assert.ok(!JSON.stringify(status).includes("sk-secret-sentinel-999"));
    const session = GameSession.fromCampaign(depsFor(f.world, repository, mockNarrator("Brenna smiles."), mockController([]), { provider_status: status }), f.campaign);
    await session.submitPlayerInput("Hello."); assert.ok((await session.save()).ok);
    const ui = JSON.stringify([session.getView(), session.listTurns(), session.exportTurnDebug(session.listTurns()[0]!.turn_id)]), file = await readFile(join(dir, "turn_fixture", "save.json"), "utf8");
    for (const secret of ["sk-secret-sentinel-999", "HIDDEN_SECRET_SENTINEL"]) assert.ok(!ui.includes(secret), `UI/debug: ${secret}`);
    assert.ok(!file.includes("sk-secret-sentinel-999"), "the save never holds the key");
  } finally { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; }
});

test("authored canon is never written by session operations", async () => {
  const before = canon.datasetId, { session } = await newSession();
  await session.submitPlayerInput("/wait 10"); await session.save();
  assert.equal(canon.datasetId, before); assert.equal((await loadWorld("data")).datasetId, before);
});

test("view model: household, presence, equipment, money and inventory come only from authoritative state; reload reproduces it exactly", async () => {
  const f = turnFixture(), { repository } = await tempRepo(f.world), home = "campaign_household_h";
  assert.equal(GameSession.fromCampaign(depsFor(f.world, repository, mockNarrator(story)), f.campaign).getView().player.gold, null, "untracked money is null, never 0");
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: home, name: "Home" }, { kind: "set_membership", household_id: home, membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: home, character_id: "brenna" }, { kind: "join_household", household_id: home, character_id: "gerome" }, { kind: "set_funds", character_id: "nicco", gold: 42 },
    { kind: "move_character", character_id: "gerome", location_id: "test_hall" }, { kind: "set_condition", character_id: "brenna", conditions: ["recovering"], status: "active" },
    { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" }] });
  const session = GameSession.fromCampaign(depsFor(f.world, repository, mockNarrator("Brenna nods.")), f.campaign), view = session.getView();
  assert.equal(view.player.gold, 42); assert.deepEqual(view.player.inventory.map(i => i.id).sort(), ["boots", "pink_cotton", "pink_fluffy", "pink_shorts", "ring"]);
  const members = Object.fromEntries(view.household[0]!.members.map(m => [m.id, m]));
  assert.equal(members.brenna!.presence, "present"); assert.equal(members.brenna!.location?.id, "test_room"); assert.deepEqual(members.brenna!.conditions, ["recovering"]); assert.ok(members.brenna!.relationship_to_player);
  assert.equal(members.brenna!.equipment[0]?.id, "brenna_boots");
  assert.equal(members.gerome!.presence, "away"); assert.equal(members.gerome!.location, undefined, "the whereabouts of an absent member are not given to the player");
  assert.deepEqual(view.scene.present.map(p => p.id).sort(), ["brenna", "maren"]);
  assert.ok(Object.isFrozen(view) === false && JSON.parse(JSON.stringify(view)), "plain JSON; mutating it cannot touch campaign state");
  (view.player as { name: string }).name = "tampered"; assert.equal(session.getView().player.name, "Nicco");
  assert.ok((await session.save()).ok);
  const loaded = await GameSession.loadCampaign(depsFor(f.world, repository, mockNarrator(story)), "turn_fixture"); assert.ok(loaded.ok);
  const norm = (v: ReturnType<GameSession["getView"]>) => ({ ...v, session: { ...v.session, save: null } });
  assert.deepEqual(norm(loaded.session.getView()), norm(session.getView()));
});

test("shutdown during a running request cancels it, leaves the campaign unchanged and closes cleanly", async () => {
  const hanging: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream(request) {
    await new Promise<void>((_, reject) => { request.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); });
    yield { type: "completed", result: { text: "", ...metadata } };
  } };
  const { session } = await newSession(hanging), revision = session.getView().session.revision;
  const running = session.submitPlayerInput("I wait."); await new Promise(r => setTimeout(r, 20));
  assert.equal(session.status, "running_turn");
  const closed = await session.shutdown({ discard_unsaved: true }); assert.deepEqual(closed, { closed: true, discarded_unsaved_changes: true });
  const outcome = await running; assert.ok(!outcome.ok); assert.equal(outcome.error.code, "cancelled"); assert.equal(outcome.error.turn_state_changed, false);
  assert.equal(session.getView().session.revision, revision);
});

test("replay safety: resubmitting identical input after a success is a new turn with its own id, never a double commit of the first", async () => {
  const { session } = await newSession(), a = await session.submitPlayerInput("/wait 10"), b = await session.submitPlayerInput("/wait 10");
  assert.ok(a.ok && b.ok); assert.notEqual(a.turn_id, b.turn_id);
  assert.equal(b.view.scene.time.world_minute - a.view.scene.time.world_minute, 10, "each submit advances time exactly once");
  assert.equal(b.trace.revision_before, a.trace.revision_after);
});

test("production wiring without credentials: real providers fail closed as a configuration error, nothing is committed, no network is attempted", async () => {
  const previous = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  try {
    const { dir } = await tempRepo(canon), deps = await createProductionDeps({ save_dir: dir });
    assert.equal(deps.provider_status?.configured, false); assert.equal(deps.provider_status?.mode, "live");
    const created = GameSession.createCampaign(deps, "prod_wiring"); assert.ok(created.ok);
    const r = await created.session.submitPlayerInput("I look around.");
    assert.ok(!r.ok); assert.equal(r.error.code, "narrator_failed"); assert.equal(r.error.provider_code, "configuration_error"); assert.equal(r.error.retryable, false);
    assert.match(r.error.message, /not configured/); assert.equal(created.session.getView().session.revision, 1);
  } finally { if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous; }
});
