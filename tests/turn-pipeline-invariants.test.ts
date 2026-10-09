import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { WorldStore } from "../src/world/world-store.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { TurnEvent } from "../src/turn/turn-types.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { metadata } from "./turn-fixtures.js";

/**
 * Hardening H2: pipeline invariants written BEFORE the decomposition and kept through it — exactly one authoritative commit,
 * cancellation and staleness at every phase, and RecentConversation finalized only after commit. Offline; no LLM is called.
 */
const world = await loadWorld("data");
const transfer: CampaignCommand = { kind: "transfer_item", mode: "handoff", item_id: "boots",  position: { kind: "carried", character_id: "brenna" } };
const SQUARE = OPENING_LOCATION, M = "campaign_character_maren";

interface Hooks { narrations?: readonly string[]; commands?: readonly CampaignCommand[]; onNarrator?: (call: number, phase: "start" | "after_completed") => void;
  onController?: () => void; onSearch?: () => void; onEvent?: (e: TurnEvent) => void; signal?: AbortSignal }
async function run(w: WorldStore, campaign: CampaignState, input: string, h: Hooks) {
  const counts = { prepare: 0, commit: 0, narrator: 0, controller: 0 };
  const prepare = campaign.prepare.bind(campaign), commit = campaign.commit.bind(campaign);
  let recentAtCommit: number | undefined;
  campaign.prepare = (p: unknown) => { counts.prepare++; return prepare(p); };
  const service = new RetrievalService(w), search = new HybridSearch(service);
  const narrator = { async generate(): Promise<never> { throw new Error("unused"); }, async *stream() {
    const n = counts.narrator++; h.onNarrator?.(n, "start");
    const text = (h.narrations ?? ["Brenna accepts boots from Nicco."])[n] ?? h.narrations!.at(-1)!;
    yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...metadata } }; h.onNarrator?.(n, "after_completed"); } };
  const controller = { async propose() { counts.controller++; recentDuringController = co.recent(campaign).entries().length; h.onController?.(); return { commands: [...(h.commands ?? [transfer])], ...metadata }; } };
  let recentDuringController: number | undefined;
  const co = new TurnCoordinator(w, narrator, controller, { service, search: { searchWithDiagnostics: async (...a: Parameters<HybridSearch["searchWithDiagnostics"]>) => { h.onSearch?.(); return search.searchWithDiagnostics(...a); } } });
  campaign.commit = (r: unknown) => { counts.commit++; recentAtCommit = co.recent(campaign).entries().length; return commit(r); };
  const events: TurnEvent[] = [];
  for await (const e of co.runTurn({ campaign, player_input: input, ...(h.signal ? { signal: h.signal } : {}) })) { events.push(e); h.onEvent?.(e); }
  const last = events.at(-1)!;
  return { counts, events, last, code: last.type === "turn_failed" ? last.code : undefined, recent: co.recent(campaign).entries(), recentAtCommit, recentDuringController };
}

// ------------------------------------------------------------------------------------------------ exactly one commit
test("commit count: a changed turn commits exactly once; a no-op turn commits once without change; a failed turn never commits", async () => {
  const changed = turnFixture(); const a = await run(changed.world, changed.campaign, "I give boots to Brenna.", {});
  assert.deepEqual([a.last.type, a.counts.commit, changed.campaign.revision], ["turn_completed", 1, 2]);
  const noop = turnFixture(); const b = await run(noop.world, noop.campaign, "Hello, Brenna.", { narrations: ["Brenna nods."], commands: [] });
  assert.deepEqual([b.last.type, b.counts.commit, noop.campaign.revision], ["turn_completed", 1, 1], "no-op semantics: one commit call, revision unchanged");
  const failed = turnFixture(); const c = await run(failed.world, failed.campaign, "/wait 99999", {});
  assert.deepEqual([c.code, c.counts.commit, c.counts.narrator], ["invalid_runtime_intent", 0, 0]);
});
test("commit count: reconciliation does not cause a second commit; there is no controller retry", async () => {
  const f = turnFixture();
  const r = await run(f.world, f.campaign, "I give boots to Brenna.", { narrations: ["Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.", "Brenna accepts boots from Nicco."] });
  assert.equal(r.last.type, "turn_completed");
  assert.deepEqual([r.counts.narrator, r.counts.controller, r.counts.commit], [2, 1, 1]);
  assert.equal(r.last.type === "turn_completed" ? r.last.result.narration_reconciliation?.delivered : "", "revision");
  // Redaction fallback (the revision repeats the bad draft): still exactly one commit, still two narrator calls.
  const g = turnFixture(), bad = "Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.";
  const red = await run(g.world, g.campaign, "I give boots to Brenna.", { narrations: [bad, bad] });
  assert.equal(red.last.type === "turn_completed" ? red.last.result.narration_reconciliation?.delivered : "", "redacted");
  assert.deepEqual([red.counts.narrator, red.counts.controller, red.counts.commit, g.campaign.revision], [2, 1, 1, 2]);
});

// ------------------------------------------------------------------------------------------------ cancellation by phase
const unchanged = (c: CampaignState, before: ReturnType<CampaignState["exportSnapshot"]>) => assert.equal(c.exportSnapshot(), before, "no projected state, time or movement committed");
test("cancellation before provider work: no narrator, controller, preparation or commit", async () => {
  const f = turnFixture(), before = f.campaign.exportSnapshot(), ac = new AbortController(); ac.abort();
  const r = await run(f.world, f.campaign, "I give boots to Brenna.", { signal: ac.signal });
  assert.deepEqual([r.code, r.counts.narrator, r.counts.controller, r.counts.commit], ["cancelled", 0, 0, 0]); unchanged(f.campaign, before);
  assert.deepEqual(r.recent, []);
});
test("cancellation during narrator streaming and after narration (before the controller)", async () => {
  for (const phase of ["start", "after_completed"] as const) {
    const f = turnFixture(), before = f.campaign.exportSnapshot(), ac = new AbortController();
    const r = await run(f.world, f.campaign, "I give boots to Brenna.", { signal: ac.signal, onNarrator: (_n, p) => { if (p === phase) ac.abort(); } });
    assert.deepEqual([r.code, r.counts.controller, r.counts.commit], ["cancelled", 0, 0], phase); unchanged(f.campaign, before);
    assert.ok(!r.events.some(e => e.type === "narration_delta"), `${phase}: an unaudited draft is never delivered`);
    assert.ok(r.recent.every(e => e.status !== "finalized"));
  }
});
test("cancellation after the controller, before final preparation", async () => {
  const f = turnFixture(), before = f.campaign.exportSnapshot(), ac = new AbortController();
  const r = await run(f.world, f.campaign, "I give boots to Brenna.", { signal: ac.signal, onController: () => ac.abort() });
  assert.deepEqual([r.code, r.counts.prepare, r.counts.commit], ["cancelled", 0, 0]); unchanged(f.campaign, before);
});
test("cancellation immediately before commit (a carry turn): no move, no time, no finalized history", async () => {
  const c = createOpeningCampaign(world, "h2_cancel_commit");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: { id: M, origin: { kind: "created" }, profile: { name: "Maren", sex: "female" }, current: { current_location: SQUARE, status: "active" } } },
    { kind: "set_legal_status", character_id: M, status: "enslaved", holder_id: "nicco" }] });
  const before = c.exportSnapshot(), ac = new AbortController();
  const r = await run(world, c, "*picks Maren up and carries her into Heartstone*", { signal: ac.signal, commands: [],
    narrations: ["Nicco lifts Maren and carries her through the heavy door into the tower."], onEvent: e => { if (e.type === "narration_completed") ac.abort(); } });
  assert.deepEqual([r.code, r.counts.commit], ["cancelled", 0]); unchanged(c, before);
  assert.equal(c.exportSnapshot().runtime.scene.player_location, SQUARE);
  assert.ok(r.recent.every(e => e.status !== "finalized"), "the delivered text is kept only as a state_failed diagnostic");
});

// ------------------------------------------------------------------------------------------------ staleness by phase
test("stale revision during retrieval, narration, controller and reconciliation fails closed and never commits the candidate", async () => {
  const cases: [string, (f: ReturnType<typeof turnFixture>) => Hooks, string][] = [
    ["retrieval", f => ({ narrations: ["Ironbound is a guild of smiths."], commands: [], onSearch: () => bump(f.campaign) }), "What do I know about Ironbound?"],
    ["narrator", f => ({ onNarrator: (_n, p) => { if (p === "start") bump(f.campaign); } }), "I give boots to Brenna."],
    ["controller", f => ({ onController: () => bump(f.campaign) }), "I give boots to Brenna."],
    ["reconciliation", f => ({ narrations: ["Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.", "Brenna accepts boots from Nicco."], onNarrator: (n, p) => { if (n === 1 && p === "start") bump(f.campaign); } }), "I give boots to Brenna."],
  ];
  for (const [phase, hooks, input] of cases) {
    const f = turnFixture();
    const r = await run(f.world, f.campaign, input, hooks(f));
    assert.equal(r.code, "stale_turn", phase);
    assert.equal(r.counts.commit, 1, `${phase}: only the external change committed`);
    assert.equal(f.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "nicco", `${phase}: the turn's candidate never committed`);
  }
});
function bump(c: CampaignState) { c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }); }

// ------------------------------------------------------------------------------------------------ recent conversation ordering
test("RecentConversation: nothing is recorded before commit; the delivered narration is finalized only after the commit", async () => {
  const f = turnFixture();
  const r = await run(f.world, f.campaign, "I give boots to Brenna.", {});
  assert.deepEqual([r.recentDuringController, r.recentAtCommit], [0, 0], "no history update during provider work or before commit");
  assert.deepEqual(r.recent.map(e => [e.status, e.narration]), [["finalized", "Brenna accepts boots from Nicco."]]);
});
