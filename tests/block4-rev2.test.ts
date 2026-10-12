import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { GameSession } from "../src/app/game-session.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { revisionOf, turnJson } from "./turn-http.js";
import { TURN_RECEIPT_LIMIT } from "../src/persistence/turn-receipts.js";
import { NARRATION, countingController, sessionWith, stepNarrator, transfer } from "./block4-fixtures.js";

const INPUT = "I give boots to Brenna.", GOOD = "Brenna accepts boots from Nicco.";
const dirs: string[] = [];
const tempDir = async () => { const d = await mkdtemp(join(tmpdir(), "caldrevan-block4-rev2-")); dirs.push(d); return d; };
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
const KEY = (n: number | string) => `turnkey_${String(n).padStart(4, "0")}`;
const idOf = (s: { campaign: { exportSnapshot(): { campaign_id: string } } }) => s.campaign.exportSnapshot().campaign_id;

test("REV-2: a stale expected_revision is rejected before ANY provider call, with no mutation, and is not remembered under the key", async () => {
  const n = stepNarrator([{ text: GOOD }]), c = countingController([transfer]), s = sessionWith(n, c);
  const before = s.campaign.exportSnapshot();
  const stale = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(1), expected_revision: s.campaign.revision + 5 });
  assert.ok(!stale.ok && stale.error.code === "stale_turn"); assert.deepEqual([n.calls(), c.calls()], [0, 0]); assert.equal(s.campaign.exportSnapshot(), before);
  const ok = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(1), expected_revision: s.campaign.revision });
  assert.ok(ok.ok, "the same key may run once the player's view is current: a stale rejection is not a terminal result");
});

test("REV-2: the same turn_key after a SUCCESS is replayed: no Narrator, Controller, commit or transcript change", async () => {
  const n = stepNarrator([{ text: GOOD }, { text: NARRATION }]), c = countingController([transfer]), s = sessionWith(n, c);
  const revision = s.campaign.revision, first = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(2), expected_revision: revision });
  assert.ok(first.ok); const after = s.campaign.exportSnapshot(), calls = [n.calls(), c.calls()], messages = s.session.getTranscript().length;
  const second = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(2), expected_revision: revision });
  assert.ok(second.ok && second.replayed === true, "marked as a replay"); if (!second.ok || !first.ok) return;
  assert.equal(second.narration, first.narration); assert.equal(second.turn_id, first.turn_id);
  assert.deepEqual([n.calls(), c.calls()], calls, "zero provider calls"); assert.equal(s.campaign.exportSnapshot(), after, "no state change"); assert.equal(s.session.getTranscript().length, messages, "no second transcript entry");
  assert.equal(s.campaign.revision, revision + 1, "exactly one commit");
});

test("REV-2: the same turn_key after a TERMINAL FAILURE is replayed too; a retry needs a NEW key", async () => {
  const n = stepNarrator([{ fail: "provider_unavailable" }, { text: GOOD }]), c = countingController([transfer]), s = sessionWith(n, c, { retry: false });
  const revision = s.campaign.revision, first = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(3), expected_revision: revision });
  assert.ok(!first.ok); if (first.ok) return; const failedCalls = n.calls();
  const again = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(3), expected_revision: revision });
  assert.ok(!again.ok && again.replayed === true && again.error.code === first.error.code, "the stored terminal failure is returned"); assert.equal(n.calls(), failedCalls, "no provider call");
  const fresh = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(4), expected_revision: revision });
  assert.ok(fresh.ok, "a new key is a new logical turn"); assert.ok(n.calls() > failedCalls);
});

test("REV-2: concurrent submissions of the same key run the pipeline once and both callers get the same result", async () => {
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  const n = stepNarrator([{ text: GOOD }], () => gate), c = countingController([transfer]), s = sessionWith(n, c);
  const revision = s.campaign.revision, options = { turn_key: KEY(5), expected_revision: revision };
  const a = s.session.submitPlayerInput(INPUT, options), b = s.session.submitPlayerInput(INPUT, options);
  release(); const [ra, rb] = await Promise.all([a, b]);
  assert.ok(ra.ok && rb.ok); if (!ra.ok || !rb.ok) return;
  assert.equal(n.calls(), 1); assert.equal(c.calls(), 1); assert.equal(s.campaign.revision, revision + 1);
  assert.equal(ra.turn_id, rb.turn_id); assert.equal(ra.narration, rb.narration);
});

test("REV-2: the same key with a different request is a conflict (never a replay) and spends zero provider calls", async () => {
  const n = stepNarrator([{ text: GOOD }]), c = countingController([transfer]), s = sessionWith(n, c);
  const revision = s.campaign.revision; assert.ok((await s.session.submitPlayerInput(INPUT, { turn_key: KEY(6), expected_revision: revision })).ok);
  const calls = [n.calls(), c.calls()], snapshot = s.campaign.exportSnapshot();
  const otherText = await s.session.submitPlayerInput("I look around.", { turn_key: KEY(6), expected_revision: revision });
  const otherRevision = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(6), expected_revision: revision + 1 });
  for (const r of [otherText, otherRevision]) { assert.ok(!r.ok && r.error.code === "turn_key_conflict"); assert.ok(!r.replayed); }
  assert.deepEqual([n.calls(), c.calls()], calls); assert.equal(s.campaign.exportSnapshot(), snapshot);
});

test("REV-2: a different key while a turn is running keeps the busy behavior (turn_in_progress, no queue, zero calls)", async () => {
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  const n = stepNarrator([{ text: GOOD }], () => gate), c = countingController([transfer]), s = sessionWith(n, c);
  const revision = s.campaign.revision, running = s.session.submitPlayerInput(INPUT, { turn_key: KEY(7), expected_revision: revision });
  const other = await s.session.submitPlayerInput("Hello.", { turn_key: KEY(8), expected_revision: revision });
  assert.ok(!other.ok && other.error.code === "turn_in_progress"); release(); assert.ok((await running).ok); assert.equal(n.calls(), 1, "the second request was dropped, not queued");
  assert.ok(!s.session.turnKeyKnown(KEY(8)), "a busy rejection is not remembered");
});

test("REV-2: malformed turn keys and revisions are request-level rejections with zero provider calls", async () => {
  const n = stepNarrator([{ text: GOOD }]), c = countingController(), s = sessionWith(n, c);
  for (const options of [{ turn_key: "short" }, { turn_key: "bad key with spaces" }, { turn_key: "x".repeat(65) }, { turn_key: KEY(9), expected_revision: -1 }, { turn_key: KEY(9), expected_revision: 1.5 }]) {
    const r = await s.session.submitPlayerInput(INPUT, options); assert.ok(!r.ok && r.error.code === "invalid_input", JSON.stringify(options));
  }
  assert.deepEqual([n.calls(), c.calls()], [0, 0]);
});

test("REV-2: receipts are persisted in the save file and survive reload; the replay needs no provider after a restart", async () => {
  const dir = await tempDir(), n = stepNarrator([{ text: GOOD }]), s = sessionWith(n, countingController([transfer]), { save_dir: dir });
  const revision = s.campaign.revision; assert.ok((await s.session.submitPlayerInput(INPUT, { turn_key: KEY(10), expected_revision: revision })).ok);
  assert.ok((await s.session.save()).ok);
  const loaded = await s.repository.loadCampaign(idOf(s));
  assert.equal(loaded.turn_receipts?.length, 1); 
  assert.equal(loaded.turn_receipts![0]!.committed_revision, loaded.campaign.revision, "the receipt and the snapshot revision agree in the same file");
  const n2 = stepNarrator([{ text: "must not be used" }]), c2 = countingController(), restarted = await GameSession.loadCampaign({ ...s.deps, createCoordinator: sessionWith(n2, c2, { save_dir: dir }).deps.createCoordinator }, idOf(s));
  assert.ok(restarted.ok); if (!restarted.ok) return;
  const again = await restarted.session.submitPlayerInput(INPUT, { turn_key: KEY(10), expected_revision: revision });
  assert.ok(again.ok && again.replayed === true); assert.equal(again.ok && again.narration, GOOD); assert.deepEqual([n2.calls(), c2.calls()], [0, 0]);
  await restarted.session.shutdown({ discard_unsaved: true });
});

test("REV-2: recording a receipt never bumps the semantic campaign revision", async () => {
  const n = stepNarrator([{ fail: "provider_unavailable" }]), s = sessionWith(n, countingController(), { retry: false });
  const revision = s.campaign.revision, before = s.campaign.exportSnapshot();
  const failed = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(11), expected_revision: revision });
  assert.ok(!failed.ok); assert.ok(s.session.turnKeyKnown(KEY(11)));
  assert.equal(s.campaign.revision, revision); assert.equal(s.campaign.exportSnapshot(), before);
});

test("REV-2: a terminal FAILURE receipt is durable too (saved even though no revision changed) and replays after reload", async () => {
  const dir = await tempDir(), s = sessionWith(stepNarrator([{ fail: "provider_unavailable" }]), countingController(), { save_dir: dir, retry: false });
  const revision = s.campaign.revision, failed = await s.session.submitPlayerInput(INPUT, { turn_key: KEY(12), expected_revision: revision });
  assert.ok(!failed.ok); assert.ok(s.session.hasUnsavedChanges || (await s.session.save()).ok, "the receipt is pending durable metadata or already saved"); assert.ok((await s.session.save()).ok);
  const loaded = await s.repository.loadCampaign(idOf(s));
  assert.deepEqual(loaded.turn_receipts?.map(r => [r.turn_key, r.status]), [[KEY(12), "failed"]]); assert.equal(loaded.campaign.revision, revision);
  const n2 = stepNarrator([{ text: GOOD }]), restarted = await GameSession.loadCampaign({ ...s.deps, createCoordinator: sessionWith(n2, countingController(), { save_dir: dir }).deps.createCoordinator }, idOf(s));
  assert.ok(restarted.ok); if (!restarted.ok) return;
  const again = await restarted.session.submitPlayerInput(INPUT, { turn_key: KEY(12), expected_revision: revision });
  assert.ok(!again.ok && again.replayed === true && again.error.code === (failed.ok ? "" : failed.error.code)); assert.equal(n2.calls(), 0);
  await restarted.session.shutdown({ discard_unsaved: true });
});

test(`REV-2: the receipt window is bounded to ${TURN_RECEIPT_LIMIT}; the oldest key falls off, the newest stay replayable`, async () => {
  const dir = await tempDir(), n = stepNarrator([{ text: NARRATION }]), s = sessionWith(n, countingController(), { save_dir: dir });
  const total = TURN_RECEIPT_LIMIT + 8;
  for (let i = 0; i < total; i++) assert.ok((await s.session.submitPlayerInput("Hello, Brenna.", { turn_key: KEY(100 + i), expected_revision: s.campaign.revision })).ok, `turn ${i}`);
  assert.ok((await s.session.save()).ok);
  const loaded = await s.repository.loadCampaign(idOf(s));
  assert.equal(loaded.turn_receipts!.length, TURN_RECEIPT_LIMIT); assert.equal(loaded.turn_receipts!.at(-1)!.turn_key, KEY(100 + total - 1));
  assert.ok(!s.session.turnKeyKnown(KEY(100)), "the oldest receipt fell off the window"); assert.ok(s.session.turnKeyKnown(KEY(100 + total - 1)));
});

test("REV-2 crash boundary: a commit that never became durable is lost WITH its receipt, so re-execution after a crash is not a duplicate", async () => {
  const dir = await tempDir(), s = sessionWith(stepNarrator([{ text: NARRATION }, { text: GOOD }]), countingController([transfer]), { save_dir: dir });
  const r0 = s.campaign.revision;
  assert.ok((await s.session.submitPlayerInput("Hello, Brenna.", { turn_key: KEY(20), expected_revision: r0 })).ok); assert.ok((await s.session.save()).ok);   // A: durable
  const durableRevision = s.campaign.revision;
  assert.ok((await s.session.submitPlayerInput(INPUT, { turn_key: KEY(21), expected_revision: durableRevision })).ok);                                           // B: committed, NOT saved
  assert.equal(s.campaign.revision, durableRevision + 1);
  // "Crash": the process dies here. The next process only sees what the last atomic save wrote.
  const n2 = stepNarrator([{ text: GOOD }]), restarted = await GameSession.loadCampaign({ ...s.deps, createCoordinator: sessionWith(n2, countingController([transfer]), { save_dir: dir }).deps.createCoordinator }, idOf(s));
  assert.ok(restarted.ok); if (!restarted.ok) return;
  assert.equal(restarted.session.campaignId, idOf(s)); assert.equal(restarted.session.getView().session.revision, durableRevision, "the unsaved commit is gone");
  assert.ok(restarted.session.turnKeyKnown(KEY(20)), "the durable turn's receipt is there"); assert.ok(!restarted.session.turnKeyKnown(KEY(21)), "the lost commit's receipt is lost with it");
  const retry = await restarted.session.submitPlayerInput(INPUT, { turn_key: KEY(21), expected_revision: durableRevision });
  assert.ok(retry.ok && !retry.replayed, "the retry legitimately runs once"); assert.equal(n2.calls(), 1); assert.equal(restarted.session.getView().session.revision, durableRevision + 1);
  await restarted.session.shutdown({ discard_unsaved: true });
});

test("REV-2: a save file with malformed or future-revision receipts still loads; the bad receipts are dropped", async () => {
  const dir = await tempDir(), s = sessionWith(stepNarrator([{ text: NARRATION }]), countingController(), { save_dir: dir });
  assert.ok((await s.session.submitPlayerInput("Hello, Brenna.", { turn_key: KEY(30), expected_revision: s.campaign.revision })).ok); assert.ok((await s.session.save()).ok);
  const { parseTurnReceipts } = await import("../src/persistence/turn-receipts.js");
  const good = (await s.repository.loadCampaign(idOf(s))).turn_receipts![0]!;
  const parsed = parseTurnReceipts({ authority: "idempotency_metadata", receipts: [good, { turn_key: "x" }, { ...good, turn_key: KEY(31), committed_revision: good.committed_revision! + 10 }, { ...good, extra: 1 }] }, good.committed_revision!);
  assert.deepEqual(parsed?.receipts.map(r => r.turn_key), [KEY(30)]); assert.equal(parseTurnReceipts("garbage", 5), undefined); assert.equal(parseTurnReceipts(undefined, 5), undefined);
});

/** The HTTP contract: the request identity is mandatory, duplicates are answered from the first result, a stale view is a 409 before any provider call. */
test("REV-2 HTTP: malformed requests are 400 with zero calls; a duplicate POST replays; a stale POST is 409 with zero calls", async t => {
  const n = stepNarrator([{ text: GOOD }, { text: NARRATION }]), c = countingController([transfer]), s = sessionWith(n, c);
  const server = createPlaytestServer(s.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { await s.session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string"); const url = `http://127.0.0.1:${address.port}`;
  const post = (body: string) => fetch(`${url}/api/turn`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const revision = await revisionOf(url);
  for (const body of [JSON.stringify({ text: INPUT }), JSON.stringify({ text: INPUT, turn_key: "short", expected_revision: revision }), JSON.stringify({ text: INPUT, turn_key: KEY(40) }), JSON.stringify({ text: INPUT, turn_key: KEY(40), expected_revision: -3 })])
    assert.equal((await post(body)).status, 400, body);
  assert.deepEqual([n.calls(), c.calls()], [0, 0]);
  const first = await post(turnJson(INPUT, revision, KEY(41))), firstBody = await first.json() as { ok: boolean; replayed?: boolean; messages: { text: string }[] };
  assert.equal(first.status, 200); assert.ok(firstBody.ok && !firstBody.replayed);
  const duplicate = await post(turnJson(INPUT, revision, KEY(41))), dupBody = await duplicate.json() as typeof firstBody;
  assert.equal(duplicate.status, 200); assert.ok(dupBody.ok && dupBody.replayed === true); assert.deepEqual(dupBody.messages, firstBody.messages, "the player sees the same story, once");
  assert.deepEqual([n.calls(), c.calls()], [1, 1]);
  const stale = await post(turnJson("Hello, Brenna.", revision, KEY(42))), staleBody = await stale.json() as { ok: boolean; error: { code: string } };
  assert.equal(stale.status, 409); assert.equal(staleBody.error.code, "stale_turn"); assert.deepEqual([n.calls(), c.calls()], [1, 1]);
});
