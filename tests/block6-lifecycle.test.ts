import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mannerismFixture } from "../src/dev/d10-mannerism-corpus.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { GameSession } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { packNpcPlus } from "../src/turn/context/npc-plus.js";
import type { MannerismExtractor, MannerismExtractionRequest } from "../src/turn/mannerism-extraction.js";
import type { ReflectionProvider } from "../src/turn/reflection.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { resolveOptionalServices, type OptionalServiceConfig } from "../src/app/optional-services.js";
import type { SessionDeps } from "../src/app/game-session.js";
type Hooks = Parameters<SessionDeps["createCoordinator"]>[0];
import { mockController, mockNarrator } from "./turn-fixtures.js";
import { testTrajectory } from "./production-reflection-fixtures.js";
import { coreOf } from "./block7-fixtures.js";

const narr = (text: string) => ({ async generate() { return mockNarrator(text).generate({} as never); }, async *stream() { yield* mockNarrator(text).stream({} as never); } });
const emptyOutput = (r: MannerismExtractionRequest) => JSON.stringify({ observations: [], owned_reviewed_ids: r.owned.map(m => m.id) });
interface Probe { calls: number; extractor: MannerismExtractor; hold(): void; release(): void; entered: Promise<void> }
/** `slow` calls block on a gate only while `hold()` is active, so earlier turns can settle normally. */
function probe(mode: "ok" | "slow" | "fail" | "malformed"): Probe {
  let release = () => {}, gate: Promise<void> | undefined, enter!: () => void;
  const entered = new Promise<void>(r => { enter = r; });
  const p: Probe = { calls: 0, entered, release: () => release(), hold() { gate = new Promise<void>(r => { release = () => { gate = undefined; r(); }; }); }, extractor: { async extract(r) {
    p.calls++; enter();
    if (mode === "slow" && gate) await gate;
    if (mode === "fail") throw Object.assign(new Error("provider down"), { code: "provider_failed" });
    return { text: mode === "malformed" ? "{bad" : emptyOutput(r) };
  } } };
  return p;
}
async function mannerSession(t: TestContext, mode: "ok" | "slow" | "fail" | "malformed", optional?: Partial<OptionalServiceConfig>, extra: Record<string, unknown> = {}) {
  const f = mannerismFixture(), p = probe(mode), service = new RetrievalService(f.world);
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-block6-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, dir), mannerism_extractor: p.extractor,
    ...(optional ? { optional_services: resolveOptionalServices(optional, {}) } : {}), ...extra,
    createCoordinator: (hooks: Hooks) => new TurnCoordinator(f.world, narr("Brenna taps two fingers while waiting."), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }) } as never, f.campaign);
  return { ...f, session, p };
}
type Sess = { session: GameSession };
/** The extractor batches finalized turns: drive three settled turns, then return the fourth turn's outcome. */
async function drive(f: Sess, last = true) { for (let i = 0; i < 3; i++) { assert.ok((await f.session.submitPlayerInput("I wait quietly.")).ok); await f.session.optionalSettled(); } return last ? f.session.submitPlayerInput("I wait quietly.") : undefined; }
const core = (s: unknown) => { const c = structuredClone(s) as Record<string, unknown>; for (const k of ["revision", "mannerism_learning", "premium_reflections"]) delete c[k]; for (const p of (c.premium_characters as { mannerisms?: unknown }[])) delete p.mannerisms; return JSON.stringify(c); };

test("block 6 lifecycle: the core turn returns while the optional extractor is still pending; the session is idle and the next turn runs", async t => {
  const f = await mannerSession(t, "slow");
  await drive(f, false); f.p.hold();
  const first = await f.session.submitPlayerInput("I wait quietly.");
  assert.ok(first.ok); await f.p.entered;
  assert.equal(f.session.status, "idle");
  assert.equal(f.session.getOptionalServices().find(s => s.service === "mannerism_learning")!.running, 1);
  const second = await f.session.submitPlayerInput("I wait again.");
  assert.ok(second.ok, "a pending optional task never blocks the next core turn");
  f.p.release(); await f.session.optionalSettled();
  assert.equal(f.session.getOptionalServices().find(s => s.service === "mannerism_learning")!.running, 0);
});

test("block 6 failure matrix: provider failure / malformed output never fail the turn, never reject unhandled, and only the monitor records it", async t => {
  const unhandled: unknown[] = []; const h = (e: unknown) => { unhandled.push(e); }; process.on("unhandledRejection", h); t.after(() => { process.off("unhandledRejection", h); });
  const normal = await mannerSession(t, "ok"), outcomeOk = await drive(normal), atReturn = normal.campaign.revision; assert.ok(outcomeOk?.ok); assert.ok(normal.p.calls >= 1, "the normal run really exercised the extractor"); await normal.session.optionalSettled();
  for (const mode of ["fail", "malformed"] as const) {
    const f = await mannerSession(t, mode), events: string[] = [];
    await drive(f, false); const out = await f.session.submitPlayerInput("I wait quietly.", { onEvent: e => events.push(e.type) });
    assert.ok(out.ok, mode); assert.ok(f.p.calls >= 1, mode); assert.equal(events.includes("turn_failed"), false, mode);
    assert.equal(f.campaign.revision, atReturn, `${mode}: identical core revision at turn return`);
    await f.session.optionalSettled();
    assert.equal(core(f.campaign.exportSnapshot()), core(normal.campaign.exportSnapshot()), `${mode}: identical core state`);
    const h = f.session.getOptionalServices().find(s => s.service === "mannerism_learning")!;
    assert.ok(h.last_error, mode); assert.equal(h.running, 0);
    assert.ok((await f.session.save()).ok);
  }
  await new Promise(r => setImmediate(r)); assert.deepEqual(unhandled, []);
});

test("block 6 OFF: mannerism learning OFF makes zero extractor calls, records nothing, yet established mannerisms still reach the Narrator", async t => {
  const f = await mannerSession(t, "ok", { mannerism_learning: false });
  await drive(f); await f.session.optionalSettled();
  assert.equal(f.p.calls, 0);
  assert.equal(f.campaign.exportSnapshot().mannerism_learning, undefined);
  assert.equal(f.session.getOptionalServices().find(s => s.service === "mannerism_learning")!.enabled, false);
  const lines = packNpcPlus(f.world, f.campaign.exportSnapshot(), new Set(["brenna"]), "Brenna")!.lines.join("\n");
  assert.ok(lines.includes("Raises one eyebrow during a short exchange."), "promoted mannerism stays Narrator-visible");
});

test("block 6 / 7 OFF vs ON: the core turn's own commit AND the final semantic revision are identical (the block 6 revision-divergence caveat is gone)", async t => {
  const on = await mannerSession(t, "slow"), off = await mannerSession(t, "ok", { mannerism_learning: false });
  await drive(on, false); await drive(off, false); on.p.hold();
  const a = await on.session.submitPlayerInput("I wait quietly."), b = await off.session.submitPlayerInput("I wait quietly.");
  assert.ok(a.ok && b.ok);
  assert.equal(a.trace.revision_after - a.trace.revision_before, b.trace.revision_after - b.trace.revision_before, "the core turn commits the same number of revisions");
  assert.deepEqual(a.trace.committed_command_kinds, b.trace.committed_command_kinds);
  on.p.release(); await on.session.optionalSettled(); await off.session.optionalSettled();
  assert.equal(core(on.campaign.exportSnapshot()), core(off.campaign.exportSnapshot()));
  assert.equal(on.campaign.revision, off.campaign.revision, "block 7: optional maintenance never moves the semantic revision");
  assert.equal(coreOf(on.campaign), coreOf(off.campaign), "identical authoritative state");
  assert.ok(on.campaign.stateVersion > off.campaign.stateVersion, "the optional work really happened (learning state differs) without a revision");
});

async function reflSession(t: TestContext, provider: ReflectionProvider, optional?: Partial<OptionalServiceConfig>) {
  const f = turnFixture(), service = new RetrievalService(f.world);
  const run = (...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  run({ kind: "create_household", id: "campaign_household_b6" }, { kind: "set_membership", household_id: "campaign_household_b6", membership: { character_id: "nicco", status: "member", role: "owner" } }, { kind: "join_household", household_id: "campaign_household_b6", character_id: "maren" });
  for (let i = 0; i < 3; i++) run({ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "respect", direction: "raise" });
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-block6r-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, dir), reflection_provider: provider, ...(optional ? { optional_services: resolveOptionalServices(optional, {}) } : {}),
    createCoordinator: (hooks: Hooks) => new TurnCoordinator(f.world, narr("Maren nods."), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }) } as never, f.campaign);
  return { ...f, session };
}

test("block 6 OFF: reflection producer OFF makes zero provider calls and writes no note; ON writes after the turn without owning it", async t => {
  let calls = 0; const provider: ReflectionProvider = { async reflect(request) { calls++; return { text: JSON.stringify({ proposals: [testTrajectory(request, "respect")] }) }; } };
  const off = await reflSession(t, provider, { reflection: false });
  assert.ok((await off.session.submitPlayerInput("I wait.")).ok); await off.session.optionalSettled();
  assert.equal(calls, 0); assert.deepEqual(off.campaign.exportSnapshot().premium_reflections, []);
  const on = await reflSession(t, provider, { reflection: true });
  const out = await on.session.submitPlayerInput("I wait.");
  assert.ok(out.ok); await on.session.optionalSettled();
  assert.equal(calls, 1); assert.equal(on.campaign.exportSnapshot().premium_reflections[0]!.notes.length, 1);
  assert.equal(on.campaign.revision, off.campaign.revision, "block 7: a Reflection note is not a semantic revision"); assert.equal(coreOf(on.campaign), coreOf(off.campaign));
});

test("block 6 failure: a throwing reflection provider never fails the turn and is recorded as service health", async t => {
  const provider: ReflectionProvider = { async reflect() { throw new Error("boom"); } };
  const f = await reflSession(t, provider, { reflection: true });
  const out = await f.session.submitPlayerInput("I wait."); assert.ok(out.ok);
  await f.session.optionalSettled();
  assert.ok(f.session.getOptionalServices().find(s => s.service === "reflection")!.last_error);
  assert.deepEqual(f.campaign.exportSnapshot().premium_reflections, []);
});

test("block 6: reading service health never changes a revision", async t => {
  const f = await mannerSession(t, "ok"); await drive(f); await f.session.optionalSettled();
  const before = f.campaign.revision; for (let i = 0; i < 3; i++) f.session.getOptionalServices(); assert.equal(f.campaign.revision, before);
});

test("block 6 ALL OFF: a session with no optional provider at all runs, saves and reports every service disabled", async t => {
  const f = turnFixture(), service = new RetrievalService(f.world), dir = await mkdtemp(join(tmpdir(), "caldrevan-block6a-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, dir), optional_services: resolveOptionalServices({ reflection: false, mannerism_learning: false, portrait_generation: false, item_sprite_generation: false, sprite_qa: false, semantic_retrieval: false }, {}),
    createCoordinator: (hooks: Hooks) => new TurnCoordinator(f.world, narr("Maren nods."), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }) } as never, f.campaign);
  assert.ok((await session.submitPlayerInput("I wait.")).ok); assert.ok((await session.save()).ok);
  assert.ok(session.getOptionalServices().every(s => !s.enabled && s.running === 0 && !s.last_error));
});
