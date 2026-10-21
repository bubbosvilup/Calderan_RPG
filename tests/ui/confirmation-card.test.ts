import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlaytestServer } from "../../src/ui/server.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { countingController, sessionWith, stepNarrator } from "../support/turn-reliability-fixtures.js";

/**
 * Consolidation block 5A, phase 3: the generic confirmation card, server side. The page renders only the masked projection it is given (an opaque
 * ref, display strings) and its Confirm / Cancel requests carry ONLY that ref and the revision it rendered; the React side is pinned in
 * src/ui-client/features/confirmations/PendingConfirmations.test.tsx. Here: a real local server and the routes.
 */
// ------------------------------------------------------------------------------------------------ the real server routes
const BRENNA = "brenna";
async function liveServer(t: { after: (fn: () => unknown) => void }) {
  const dir = await mkdtemp(join(tmpdir(), "block5a-ui-"));
  const heldBrenna: CampaignCommand = { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "nicco" };
  const h = sessionWith(stepNarrator([{ text: "Brenna goes very still." }]), countingController([]), { save_dir: dir, autosave: false, setup: c => c.apply({ expected_revision: c.revision, commands: [heldBrenna] }) });
  const server = createPlaytestServer(h.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await h.session.shutdown({ discard_unsaved: true }); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown) => { const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() as any }; };
  const state = async () => await (await fetch(`${base}/api/session`)).json() as any;
  return { h, base, post, state };
}
test("server: the state carries the masked card; Confirm frees the person through the route; a repeat is a 200 replay; stale is 409; unknown is 422; no ids or payload leak", async t => {
  const { h, post, state } = await liveServer(t);
  await post("/api/turn", { text: "I hereby free you, Brenna.", turn_key: "ui_turn_key_0001", expected_revision: h.campaign.revision });
  const before = await state();
  assert.equal(before.confirmations.cards.length, 1);
  assert.doesNotMatch(JSON.stringify(before.confirmations), /subject_id|actor_id|payload|holder_id|campaign_character|"brenna"|manumit/);
  const ref = before.confirmations.cards[0].ref, rev = before.revision;
  assert.equal((await post("/api/confirmation/confirm", { ref, expected_revision: rev - 1 })).status, 409);
  assert.equal((await post("/api/confirmation/confirm", { ref: "f".repeat(24), expected_revision: rev })).status, 422);
  assert.equal(h.campaign.exportSnapshot().legal_statuses.find(l => l.character_id === BRENNA)?.status, "enslaved", "refusals changed nothing");
  // Extra fields are ignored: the browser cannot choose a subject or a payload.
  const ok = await post("/api/confirmation/confirm", { ref, expected_revision: rev, character_id: "nicco", holder_id: "korvin", payload: { x: 1 } });
  assert.equal(ok.status, 200); assert.equal(ok.data.ok, true); assert.equal(ok.data.confirmation, "confirmed");
  assert.equal(h.campaign.exportSnapshot().legal_statuses.find(l => l.character_id === BRENNA)?.status, "free");
  assert.equal(ok.data.confirmations.cards.length, 0);
  const again = await post("/api/confirmation/confirm", { ref, expected_revision: rev });
  assert.equal(again.status, 200); assert.equal(again.data.replayed, true);
  assert.equal(h.campaign.exportSnapshot().transactions.filter(x => x.kind === "manumission").length, 1);
  const cancelAfter = await post("/api/confirmation/cancel", { ref, expected_revision: rev + 1 });
  assert.equal(cancelAfter.status, 422); assert.equal(cancelAfter.data.reason, "already_confirmed");
});
test("server: Cancel is a 200 with zero campaign change; the routes demand JSON and reject cross-origin writes", async t => {
  const { h, base, post, state } = await liveServer(t);
  await post("/api/turn", { text: "I hereby free you, Brenna.", turn_key: "ui_turn_key_0002", expected_revision: h.campaign.revision });
  const before = await state(), ref = before.confirmations.cards[0].ref;
  const cancelled = await post("/api/confirmation/cancel", { ref, expected_revision: before.revision });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.data.confirmation, "cancelled");
  assert.equal((await state()).revision, before.revision, "cancel never moves the revision");
  assert.equal((await state()).confirmations.cards.length, 0);
  const text = await fetch(`${base}/api/confirmation/confirm`, { method: "POST", headers: { "Content-Type": "text/plain", Origin: base }, body: "{}" });
  assert.equal(text.status, 415);
  const foreign = await fetch(`${base}/api/confirmation/confirm`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://evil.example" }, body: JSON.stringify({ ref, expected_revision: 0 }) });
  assert.equal(foreign.status, 403);
});
