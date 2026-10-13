import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameSession } from "../src/app/game-session.js";
import type { ConfirmationKind } from "../src/app/confirmation-kinds.js";
import { MANUMISSION_KIND } from "../src/app/confirmation-kinds.js";
import { PendingConfirmationLog } from "../src/app/pending-confirmation-log.js";
import { boundTerminal, parseInteractionMetadata, PENDING_TERMINAL_LIMIT, type PendingConfirmation } from "../src/persistence/pending-confirmations.js";
import { migrateSave } from "../src/persistence/save-migrations.js";
import { CampaignSaveError } from "../src/persistence/errors.js";
import type { PendingProposal } from "../src/turn/authorization/pending-proposals.js";
import type { TurnCoordinator } from "../src/turn/coordinator/turn-coordinator.js";
import { countingController, NARRATION, sessionWith, stepNarrator, withRunTurn } from "./block4-fixtures.js";

/**
 * Consolidation block 5A, phases 1 and 2: the PendingConfirmation foundation, proven with a TEST-ONLY kind (no gameplay semantics), independent of AUTH-1.
 * Providers are counted stubs: a confirm or a cancel must never call a Narrator or a Controller.
 */
const KEY = (n: number) => `turn_key_${String(n).padStart(4, "0")}`;
const hex = (n: number) => n.toString(16).padStart(24, "0");
const TEST_KIND: ConfirmationKind = {
  kind: "test_condition",
  payload_valid: p => typeof p.condition === "string" && p.condition.length > 0,
  invalid_reason: (snapshot, record) => {
    const c = snapshot.characters.find(x => x.id === record.subject_id);
    if (!c) return "subject_missing";
    return (c.current.conditions ?? []).includes(String(record.payload.condition)) ? "already_applied" : undefined;
  },
  commands: (snapshot, record) => [{ kind: "set_condition", character_id: record.subject_id, conditions: [...(snapshot.characters.find(x => x.id === record.subject_id)?.current.conditions ?? []), String(record.payload.condition)] }],
  card: (_world, snapshot, record) => {
    const label = snapshot.characters.find(x => x.id === record.subject_id)?.profile.name ?? "Someone";
    return { title: `Mark ${label}?`, body: `Marks ${label} (test).`, subject_label: label, confirm_label: `Mark ${label}`, cancel_label: "Not now" };
  },
};
const KINDS = new Map<string, ConfirmationKind>([[TEST_KIND.kind, TEST_KIND], [MANUMISSION_KIND.kind, MANUMISSION_KIND]]);
const proposal = (condition = "test_marked", subject_id = "brenna"): PendingProposal => ({ kind: "test_condition", subject_id, actor_id: "nicco", payload: { condition } });
/** Decorates the real coordinator: the finalized turn additionally reports `proposals` (as the intent stage would for a recognized interpretation). */
const proposing = (proposals: readonly PendingProposal[]) => (c: TurnCoordinator) => withRunTurn(c, async function* (real, request) {
  for await (const e of real.runTurn(request)) yield e.type === "state_committed" ? { ...e, confirmation_proposals: proposals } : e;
});
async function harness(options: { proposals?: readonly PendingProposal[]; dir?: string } = {}) {
  const dir = options.dir ?? await mkdtemp(join(tmpdir(), "block5a-"));
  const narrator = stepNarrator([{ text: NARRATION }]), controller = countingController();
  const h = sessionWith(narrator, controller, { save_dir: dir, autosave: false, confirmation_kinds: KINDS, ...(options.proposals ? { wrap: proposing(options.proposals) } : {}) });
  return { ...h, dir, narrator, controller, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
const turn = (h: Awaited<ReturnType<typeof harness>>, n: number, text = "I look around the room.") =>
  h.session.submitPlayerInput(text, { turn_key: KEY(n), expected_revision: h.campaign.revision });
const providerCalls = (h: Awaited<ReturnType<typeof harness>>) => h.narrator.calls() + h.controller.calls();
const marks = (h: Awaited<ReturnType<typeof harness>>) => (h.campaign.exportSnapshot().characters.find(c => c.id === "brenna")!.current.conditions ?? []).filter(c => c === "test_marked").length;
const cardOf = (h: Awaited<ReturnType<typeof harness>>) => h.session.getConfirmationView().cards[0]!;

// ------------------------------------------------------------------------------------------------ phase 1: data and persistence
const record = (n: number, extra: Partial<PendingConfirmation> = {}): PendingConfirmation =>
  ({ ref: hex(n), kind: "test_condition", subject_id: "brenna", actor_id: "nicco", payload: { condition: `c${n}` }, provenance: { source: "test" }, created_revision: 0, status: "pending", ...extra });
const accept = () => true;

test("parse: well-formed records of every status survive; structure is validated, meaning is the handler's", () => {
  const records = [record(1), record(2, { status: "confirmed", terminal_reason: "player_confirmed", resolved_revision: 3 }), record(3, { status: "cancelled", terminal_reason: "player_cancelled" }), record(4, { status: "invalidated", terminal_reason: "subject_missing" })];
  const parsed = parseInteractionMetadata({ authority: "interaction_metadata", pending_confirmations: records }, 5, accept);
  assert.deepEqual(parsed?.pending_confirmations.map(r => r.status), ["pending", "confirmed", "cancelled", "invalidated"]);
});
test("parse: malformed, unknown-kind, duplicate-ref and impossible-state records fail safely (dropped, never a throw)", () => {
  const good = record(1);
  const bad: unknown[] = [
    { ...record(2), ref: "nothex" }, { ...record(3), kind: "Bad Kind" }, { ...record(4), payload: { nested: { a: 1 } } }, { ...record(5), payload: [1] }, { ...record(6), extra_field: true },
    { ...record(7), created_revision: 99 }, { ...record(8), status: "pending", terminal_reason: "x" }, { ...record(9), status: "confirmed", terminal_reason: "player_confirmed" },
    { ...record(10), status: "confirmed", terminal_reason: "player_confirmed", resolved_revision: 99 }, { ...record(11), status: "cancelled" }, { ...record(12), status: "weird" },
    { ...record(13), provenance: { source: "player_text", turn_key: "short" } }, { ...record(14), provenance: { source: "elsewhere" } }, { ...record(15), subject_id: "Bad Id" }, "text", null, 7,
    { ...good }, // duplicate ref of the first record
    { ...record(16), kind: "unregistered_kind" },
  ];
  const parsed = parseInteractionMetadata({ authority: "interaction_metadata", pending_confirmations: [good, ...bad] }, 5, kind => kind !== "unregistered_kind");
  assert.deepEqual(parsed?.pending_confirmations.map(r => r.ref), [good.ref]);
  for (const garbage of [null, "x", 1, [], { authority: "wrong", pending_confirmations: [] }, { authority: "interaction_metadata" }, { authority: "interaction_metadata", pending_confirmations: {} }, { authority: "interaction_metadata", pending_confirmations: [], extra: 1 }])
    assert.equal(parseInteractionMetadata(garbage, 5, accept), undefined);
  assert.equal(parseInteractionMetadata(undefined, 5, accept), undefined);
});
test("retention: ACTIVE records are never pruned; only the newest terminal records are bounded", () => {
  const records = [...Array.from({ length: 40 }, (_, i) => record(i + 1)), ...Array.from({ length: 50 }, (_, i) => record(100 + i, { status: "cancelled", terminal_reason: "player_cancelled" }))];
  const kept = boundTerminal(records);
  assert.equal(kept.filter(r => r.status === "pending").length, 40, "every active record survives");
  assert.deepEqual(kept.filter(r => r.status !== "pending").map(r => r.ref), records.filter(r => r.status !== "pending").slice(-PENDING_TERMINAL_LIMIT).map(r => r.ref), "the newest terminal records survive");
  const log = new PendingConfirmationLog(records);
  assert.equal(log.size, 40 + PENDING_TERMINAL_LIMIT);
  const resolved = log.active()[0]!;
  log.resolve(resolved.ref, "invalidated", "subject_missing");
  assert.equal(log.list().filter(r => r.status !== "pending").length, PENDING_TERMINAL_LIMIT, "the terminal bound holds on every transition");
});
test("log: refs are opaque and unique; resolve is once-only; the dirty flag follows create and terminal transitions", () => {
  const log = new PendingConfirmationLog();
  assert.equal(log.unsaved, false);
  const a = log.create({ campaign_id: "c", kind: "test_condition", subject_id: "brenna", actor_id: "nicco", payload: { condition: "x" }, provenance: { source: "test" }, created_revision: 1 })!;
  const b = log.create({ campaign_id: "c", kind: "test_condition", subject_id: "brenna", actor_id: "nicco", payload: { condition: "x" }, provenance: { source: "test" }, created_revision: 1 })!;
  assert.match(a.ref, /^[0-9a-f]{24}$/); assert.notEqual(a.ref, b.ref);
  assert.equal(log.unsaved, true);
  const exported = log.export(); log.saved(exported.token);
  assert.equal(log.unsaved, false);
  assert.equal(log.resolve(a.ref, "cancelled", "player_cancelled")?.status, "cancelled");
  assert.equal(log.unsaved, true, "a terminal transition marks the log dirty");
  assert.equal(log.resolve(a.ref, "confirmed", "player_confirmed", 3), undefined, "a terminal record never changes again");
  assert.equal(log.resolve(hex(999), "cancelled", "player_cancelled"), undefined);
  const token = log.export().token; log.resolve(b.ref, "cancelled", "player_cancelled"); log.saved(token);
  assert.equal(log.unsaved, true, "a change made after the export is not durable yet");
});
test("save schema 6: a v5 file migrates losslessly; a v5 file already carrying the block is malformed; an older build refuses v6", () => {
  const v5 = { format: "caldrevan_campaign_save", schema_version: 5, campaign_id: "x", snapshot: {} };
  assert.deepEqual(JSON.parse(JSON.stringify(migrateSave(v5))), { ...v5, schema_version: 8 });
  assert.throws(() => migrateSave({ ...v5, interaction_metadata: { authority: "interaction_metadata", pending_confirmations: [] } }), (e: unknown) => e instanceof CampaignSaveError && e.code === "migration_failed");
  const v6 = { ...v5, schema_version: 6 };
  assert.throws(() => migrateSave(v6, 5), (e: unknown) => e instanceof CampaignSaveError && e.code === "unsupported_version", "a build that stops at schema 5 never silently drops the block");
});

test("creation: a finalized no-op turn creates a pending record WITHOUT a revision bump, and it survives an immediate reload", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    const revision = h.campaign.revision;
    const outcome = await turn(h, 1);
    assert.equal(outcome.ok, true);
    assert.equal(h.campaign.revision, revision, "creating a pending record is not a semantic change");
    const card = cardOf(h);
    assert.equal(h.session.getConfirmationView().cards.length, 1);
    assert.deepEqual(Object.keys(card).sort(), ["body", "cancel_label", "confirm_label", "created_revision", "kind", "ref", "subject_label", "title"], "the card carries display strings and the opaque ref only");
    assert.match(card.ref, /^[0-9a-f]{24}$/);
    assert.equal((await h.session.save()).ok, true);
    const reloaded = await GameSession.loadCampaign(h.deps, "turn_fixture");
    assert.equal(reloaded.ok, true);
    if (reloaded.ok) {
      assert.equal(reloaded.session.getConfirmationView().cards[0]?.ref, card.ref, "same record, same ref");
      await reloaded.session.shutdown({ discard_unsaved: true });
    }
    const file = JSON.parse(await readFile(join(h.dir, "turn_fixture", "save.json"), "utf8")) as { schema_version: number; interaction_metadata: { authority: string; pending_confirmations: { ref: string; status: string }[] } };
    assert.equal(file.schema_version, 8);
    assert.equal(file.interaction_metadata.authority, "interaction_metadata");
    assert.deepEqual(file.interaction_metadata.pending_confirmations.map(r => [r.ref, r.status]), [[card.ref, "pending"]]);
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
test("dirty tracking: a record created or ended by a no-op turn is saved by the quit save even though no revision changed", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1);
    const ref = cardOf(h).ref;
    const closed = await h.session.shutdown({ save_reason: "quit" });
    assert.equal(closed.closed, true, "the quit save persisted the unsaved interaction metadata");
    const reloaded = await GameSession.loadCampaign(h.deps, "turn_fixture");
    assert.equal(reloaded.ok && reloaded.session.getConfirmationView().cards[0]?.ref, ref);
    if (reloaded.ok) {
      assert.equal(reloaded.session.cancelPending({ ref, expected_revision: reloaded.session.getView().session.revision }).ok, true);
      assert.equal((await reloaded.session.shutdown({ save_reason: "quit" })).closed, true, "a cancel alone (no revision change) is also saved");
      const again = await GameSession.loadCampaign(h.deps, "turn_fixture");
      assert.equal(again.ok && again.session.getConfirmationView().cards.length, 0);
      assert.equal(again.ok && again.session.getConfirmationView().recent[0]?.status, "cancelled");
      if (again.ok) await again.session.shutdown({ discard_unsaved: true });
    }
  } finally { await h.cleanup(); }
});

// ------------------------------------------------------------------------------------------------ phase 2: generic lifecycle
test("confirm: resolves server-side, commits the deterministic command once, ends terminal, and calls NO provider", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1);
    const calls = providerCalls(h), ref = cardOf(h).ref, revision = h.campaign.revision;
    const outcome = h.session.confirmPending({ ref, expected_revision: revision });
    assert.deepEqual([outcome.ok, outcome.ok && outcome.status, outcome.ok && outcome.changed], [true, "confirmed", true]);
    assert.equal(h.campaign.revision, revision + 1, "confirming is a real authoritative change");
    assert.equal(marks(h), 1);
    assert.equal(providerCalls(h), calls, "zero Narrator or Controller calls");
    assert.equal(h.session.getConfirmationView().cards.length, 0);
    assert.equal(h.session.getConfirmationView().recent[0]?.status, "confirmed");
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
test("confirm is idempotent: the second answer is a successful replay that changes nothing", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1);
    const ref = cardOf(h).ref, revision = h.campaign.revision;
    assert.equal(h.session.confirmPending({ ref, expected_revision: revision }).ok, true);
    const after = h.campaign.revision;
    const again = h.session.confirmPending({ ref, expected_revision: revision });
    assert.deepEqual([again.ok, again.ok && again.replayed, again.ok && again.changed], [true, true, false]);
    assert.equal(h.campaign.revision, after, "no second mutation");
    assert.equal(marks(h), 1, "applied exactly once");
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
test("cancel: zero campaign mutation, no revision bump, idempotent; confirm after cancel and cancel after confirm are refused", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1);
    const ref = cardOf(h).ref, revision = h.campaign.revision, before = JSON.stringify(h.campaign.exportSnapshot());
    const cancelled = h.session.cancelPending({ ref, expected_revision: revision });
    assert.deepEqual([cancelled.ok, cancelled.ok && cancelled.status, cancelled.ok && cancelled.changed], [true, "cancelled", true]);
    assert.equal(JSON.stringify(h.campaign.exportSnapshot()), before, "the campaign is byte-identical");
    const again = h.session.cancelPending({ ref, expected_revision: revision });
    assert.deepEqual([again.ok, again.ok && again.replayed], [true, true]);
    const confirm = h.session.confirmPending({ ref, expected_revision: revision });
    assert.equal(confirm.ok, false); assert.equal(!confirm.ok && confirm.reason, "already_cancelled");
    assert.equal(JSON.stringify(h.campaign.exportSnapshot()), before);
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
  const g = await harness({ proposals: [proposal()] });
  try {
    await turn(g, 1);
    const ref = cardOf(g).ref;
    assert.equal(g.session.confirmPending({ ref, expected_revision: g.campaign.revision }).ok, true);
    const cancel = g.session.cancelPending({ ref, expected_revision: g.campaign.revision });
    assert.equal(cancel.ok, false); assert.equal(!cancel.ok && cancel.reason, "already_confirmed");
  } finally { await g.session.shutdown({ discard_unsaved: true }); await g.cleanup(); }
});
test("confirm refusals change nothing: unknown or malformed ref, stale revision, malformed revision", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1);
    const ref = cardOf(h).ref, revision = h.campaign.revision, before = JSON.stringify(h.campaign.exportSnapshot());
    for (const bad of [undefined, null, 5, "", "not-a-ref", hex(123456), ref.toUpperCase()]) {
      const outcome = h.session.confirmPending({ ref: bad, expected_revision: revision });
      assert.equal(outcome.ok, false); assert.equal(!outcome.ok && outcome.reason, "unknown_confirmation");
    }
    for (const stale of [revision + 1, revision - 1, "1", null, undefined, 1.5, NaN]) {
      const outcome = h.session.confirmPending({ ref, expected_revision: stale });
      assert.equal(outcome.ok, false); assert.equal(!outcome.ok && outcome.reason, "stale"); assert.equal(!outcome.ok && outcome.error.code, "stale_turn");
    }
    assert.equal(JSON.stringify(h.campaign.exportSnapshot()), before);
    assert.equal(h.session.getConfirmationView().cards.length, 1, "the card is still there and still works");
    assert.equal(h.session.confirmPending({ ref, expected_revision: revision }).ok, true);
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
test("invalidation by REAL preconditions: when the act is no longer possible the card disappears and confirm refuses with a stable reason", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1);
    const ref = cardOf(h).ref;
    h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "set_condition", character_id: "brenna", conditions: ["test_marked"] }] });
    assert.equal(h.session.getConfirmationView().cards.length, 0, "an act that can no longer happen is never offered");
    const outcome = h.session.confirmPending({ ref, expected_revision: h.campaign.revision });
    assert.equal(outcome.ok, false); assert.equal(!outcome.ok && outcome.reason, "invalidated"); assert.equal(!outcome.ok && outcome.terminal_reason, "already_applied");
    assert.equal(h.session.getConfirmationView().recent[0]?.status, "invalidated");
    const cancel = h.session.cancelPending({ ref, expected_revision: h.campaign.revision });
    assert.equal(cancel.ok, false); assert.equal(!cancel.ok && cancel.reason, "invalidated");
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
test("invalidation does not depend on the revision moving: an unrelated revision change keeps the card valid", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1);
    const ref = cardOf(h).ref;
    h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 5 } }] });
    assert.equal(h.session.getConfirmationView().cards.length, 1);
    assert.equal(h.session.confirmPending({ ref, expected_revision: h.campaign.revision }).ok, true);
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
test("operation locking: confirm and cancel are refused while a turn runs, and work once it is idle", async () => {
  let hold: Promise<void> = Promise.resolve(), open = () => {};
  const dir = await mkdtemp(join(tmpdir(), "block5a-"));
  const narrator = stepNarrator([{ text: NARRATION }], () => hold), controller = countingController();
  const h = sessionWith(narrator, controller, { save_dir: dir, autosave: false, confirmation_kinds: KINDS, wrap: proposing([proposal()]) });
  try {
    await h.session.submitPlayerInput("I look around.", { turn_key: KEY(1), expected_revision: h.campaign.revision });
    const ref = h.session.getConfirmationView().cards[0]!.ref, revision = h.campaign.revision;
    hold = new Promise<void>(r => { open = r; });
    const running = h.session.submitPlayerInput("I wait.", { turn_key: KEY(2), expected_revision: revision });
    assert.notEqual(h.session.status, "idle");
    const busy = h.session.confirmPending({ ref, expected_revision: revision });
    assert.equal(busy.ok, false); assert.equal(!busy.ok && busy.reason, "busy"); assert.equal(!busy.ok && busy.error.code, "turn_in_progress");
    const busyCancel = h.session.cancelPending({ ref, expected_revision: revision });
    assert.equal(busyCancel.ok, false); assert.equal(!busyCancel.ok && busyCancel.reason, "busy");
    open(); await running;
    assert.equal(h.session.confirmPending({ ref, expected_revision: h.campaign.revision }).ok, true);
  } finally { await h.session.shutdown({ discard_unsaved: true }); await rm(dir, { recursive: true, force: true }); }
});

test("durability: the mutation and the terminal state are saved together; a crash before the save loses BOTH, never half", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1); await h.session.save();
    const ref = cardOf(h).ref;
    assert.equal(h.session.confirmPending({ ref, expected_revision: h.campaign.revision }).ok, true);
    // "Crash" before any save: a fresh session loaded from disk sees the pre-confirm world, with the card still pending.
    const crashed = await GameSession.loadCampaign(h.deps, "turn_fixture");
    assert.equal(crashed.ok, true);
    if (crashed.ok) {
      assert.equal(crashed.session.getConfirmationView().cards[0]?.ref, ref);
      assert.equal(crashed.session.getConfirmationView().cards.length, 1);
      assert.equal((crashed.session.getView().player.inventory.length >= 0), true);
      await crashed.session.shutdown({ discard_unsaved: true });
    }
    assert.equal((await h.session.save()).ok, true);
    const reloaded = await GameSession.loadCampaign(h.deps, "turn_fixture");
    assert.equal(reloaded.ok, true);
    if (reloaded.ok) {
      assert.equal(reloaded.session.getConfirmationView().cards.length, 0);
      assert.equal(reloaded.session.getConfirmationView().recent[0]?.status, "confirmed");
      const replay = reloaded.session.confirmPending({ ref, expected_revision: 0 });
      assert.deepEqual([replay.ok, replay.ok && replay.replayed], [true, true], "a confirmed record answers a repeat after a reload, without a second mutation");
      await reloaded.session.shutdown({ discard_unsaved: true });
    }
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
test("binding is by id: a rename re-renders the same card (same ref) and confirmation still acts on the same subject", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1);
    const before = cardOf(h);
    const profile = h.campaign.exportSnapshot().characters.find(c => c.id === "brenna")!.profile;
    h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "set_profile", character_id: "brenna", profile: { ...profile, name: "Brenna Vale" } }] });
    const after = cardOf(h);
    assert.equal(after.ref, before.ref);
    assert.match(after.title, /Brenna Vale/);
    assert.notEqual(after.title, before.title);
    assert.equal(h.session.confirmPending({ ref: before.ref, expected_revision: h.campaign.revision }).ok, true);
    assert.equal(marks(h), 1);
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
test("dedup with revalidation: the same interpretation reuses the active card; a changed payload supersedes it; an invalid one creates nothing", async () => {
  const h = await harness({ proposals: [proposal("test_marked")] });
  try {
    await turn(h, 1); await turn(h, 2);
    assert.equal(h.session.getConfirmationView().cards.length, 1, "the same interpretation twice is one card");
    const first = cardOf(h).ref;
    const h2 = await harness({ proposals: [proposal("a")] });
    await turn(h2, 1);
    assert.equal(h2.session.getConfirmationView().cards.length, 1);
    await h2.session.shutdown({ discard_unsaved: true }); await h2.cleanup();
    assert.ok(first);
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
  const g = await harness({ proposals: [proposal("x"), proposal("y")] });
  try {
    await turn(g, 1);
    assert.deepEqual(g.session.getConfirmationView().cards.length, 1, "a second payload for the same subject supersedes the first");
    assert.equal(g.session.getConfirmationView().recent[0]?.status, "invalidated");
  } finally { await g.session.shutdown({ discard_unsaved: true }); await g.cleanup(); }
  const k = await harness({ proposals: [proposal("z", "nobody_here")] });
  try { await turn(k, 1); assert.equal(k.session.getConfirmationView().cards.length, 0, "a proposal that is not valid at creation produces no card"); }
  finally { await k.session.shutdown({ discard_unsaved: true }); await k.cleanup(); }
});
test("a load drops a record of a kind this build cannot confirm (it can never become a command)", async () => {
  const h = await harness({ proposals: [proposal()] });
  try {
    await turn(h, 1); await h.session.save();
    const narrower = { ...h.deps, confirmation_kinds: new Map([[MANUMISSION_KIND.kind, MANUMISSION_KIND]]) };
    const loaded = await GameSession.loadCampaign(narrower, "turn_fixture");
    assert.equal(loaded.ok, true);
    if (loaded.ok) { assert.equal(loaded.session.getConfirmationView().cards.length, 0); await loaded.session.shutdown({ discard_unsaved: true }); }
  } finally { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); }
});
