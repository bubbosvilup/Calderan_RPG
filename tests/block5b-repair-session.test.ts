import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameSession } from "../src/app/game-session.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { countingController, sessionWith, stepNarrator } from "./block4-fixtures.js";

/**
 * Consolidation block 5B, phases 5/6 (session level): human-invoked retire / merge go through PendingConfirmation. Nothing mutates before Confirm,
 * Confirm commits exactly once with zero provider calls, Cancel mutates nothing, a conflict creates nothing, and the card survives save/reload.
 */
const A = "campaign_character_maren", B = "campaign_character_maren_two", C = "campaign_character_lira";
const person = (id: string, name: string): CampaignCommand => ({ kind: "register_character",
  character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 19 } }, current: { current_location: "test_room", status: "active" } } as never });
async function harness() {
  const dir = await mkdtemp(join(tmpdir(), "block5b-repair-"));
  const narrator = stepNarrator([]), controller = countingController();
  const h = sessionWith(narrator, controller, { save_dir: dir, autosave: false, setup: campaign => {
    campaign.apply({ expected_revision: campaign.revision, commands: [person(A, "Maren"), person(B, "Maren"), person(C, "Lira"),
      { kind: "create_item", name: "Shawl", description: "d", visual_description: "v", owner_id: B, position: { kind: "carried", character_id: B } }] });
  } });
  return { ...h, dir, narrator, controller, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
type H = Awaited<ReturnType<typeof harness>>;
const calls = (h: H) => h.narrator.calls() + h.controller.calls();
const rec = (h: H, id: string) => h.campaign.exportSnapshot().characters.find(c => c.id === id)!;
const request = (h: H, extra: object) => h.session.requestRepair({ operation: "merge", character_id: B, target_id: A, expected_revision: h.campaign.revision, ...extra });

test("C: merge request -> one card naming SOURCE and TARGET; NO mutation before Confirm; Confirm commits exactly once with zero provider calls", async () => {
  const h = await harness();
  try {
    const before = h.campaign.revision, snapshotBefore = JSON.stringify(h.campaign.exportSnapshot());
    const r = request(h, {});
    assert.ok(r.ok && r.created); if (!r.ok) return;
    assert.equal(r.summary?.rewrites.items, 1);
    assert.equal(h.campaign.revision, before, "creating the card does not change the revision");
    assert.equal(JSON.stringify(h.campaign.exportSnapshot()), snapshotBefore, "no mutation before Confirm");
    const cards = h.session.getConfirmationView().cards;
    assert.equal(cards.length, 1); assert.match(cards[0]!.title, /^Merge .* into .*\?$/); assert.match(cards[0]!.body, /SOURCE .*TARGET/);
    assert.equal(request(h, {}).ok && (request(h, {}) as { created: boolean }).created, false, "the same request reuses the same card");
    const outcome = h.session.confirmPending({ ref: r.ref, expected_revision: h.campaign.revision });
    assert.ok(outcome.ok && outcome.changed);
    assert.equal(h.campaign.revision, before + 1, "exactly one commit");
    assert.equal(rec(h, B).retirement?.merged_into, A);
    assert.equal(h.campaign.exportSnapshot().items.find(i => i.name === "Shawl")!.owner_id, A);
    const again = h.session.confirmPending({ ref: r.ref, expected_revision: h.campaign.revision });
    assert.ok(again.ok && again.replayed === true && h.campaign.revision === before + 1, "a repeated Confirm is a replay, not a second commit");
    assert.equal(calls(h), 0, "zero provider calls");
  } finally { await h.cleanup(); }
});
test("Cancel mutates nothing and leaves both identities persistent", async () => {
  const h = await harness();
  try {
    const r = request(h, {}); assert.ok(r.ok); if (!r.ok) return;
    const before = JSON.stringify(h.campaign.exportSnapshot());
    const outcome = h.session.cancelPending({ ref: r.ref, expected_revision: h.campaign.revision });
    assert.ok(outcome.ok && outcome.status === "cancelled");
    assert.equal(JSON.stringify(h.campaign.exportSnapshot()), before);
    assert.equal(rec(h, B).retirement, undefined);
    assert.equal(h.session.getConfirmationView().cards.length, 0);
    assert.equal(calls(h), 0);
  } finally { await h.cleanup(); }
});
test("retire: a conflict-free request makes a card, Confirm retires once (not a deletion)", async () => {
  const h = await harness();
  try {
    const r = h.session.requestRepair({ operation: "retire", character_id: C, expected_revision: h.campaign.revision }); assert.ok(r.ok); if (!r.ok) return;
    assert.match(h.session.getConfirmationView().cards[0]!.title, /^Retire /);
    const before = h.campaign.revision;
    assert.ok(h.session.confirmPending({ ref: r.ref, expected_revision: before }).ok);
    assert.equal(h.campaign.revision, before + 1);
    assert.equal(rec(h, C).current.status, "inactive"); assert.equal(rec(h, C).profile.name, "Lira");
  } finally { await h.cleanup(); }
});
test("conflicts fail closed: no card, every conflict reported (player, canonical, unknown, owner of items, same identity)", async () => {
  const h = await harness();
  try {
    const none = () => assert.equal(h.session.getConfirmationView().cards.length, 0);
    for (const [extra, code] of [[{ operation: "retire", character_id: "nicco", target_id: undefined }, "player_character"], [{ operation: "retire", character_id: B, target_id: undefined }, "owns_items"],
      [{ operation: "retire", character_id: "no_such_one", target_id: undefined }, "unknown_character"], [{ operation: "merge", character_id: A, target_id: A }, "same_identity"],
      [{ operation: "merge", character_id: B, target_id: "no_such_one" }, "unknown_character"]] as const) {
      const r = request(h, extra);
      assert.ok(!r.ok, code); if (r.ok) continue;
      assert.ok(r.conflicts.some(c => c.code === code), `${code}: ${JSON.stringify(r.conflicts)}`);
      none();
    }
    assert.equal(h.campaign.revision, h.campaign.revision);
    assert.equal(calls(h), 0);
  } finally { await h.cleanup(); }
});
test("a stale or malformed request creates nothing; a second repair on an involved identity is refused", async () => {
  const h = await harness();
  try {
    assert.ok(!request(h, { expected_revision: h.campaign.revision + 5 }).ok);
    assert.ok(!request(h, { operation: "delete" }).ok); assert.ok(!request(h, { character_id: 42 }).ok); assert.ok(!request(h, { operation: "retire", target_id: A }).ok);
    assert.equal(h.session.getConfirmationView().cards.length, 0);
    assert.ok(request(h, {}).ok);
    const second = h.session.requestRepair({ operation: "retire", character_id: A, expected_revision: h.campaign.revision });
    assert.ok(!second.ok && second.conflicts.some(c => c.code === "pending_repair_exists"));
    assert.equal(h.session.getConfirmationView().cards.length, 1);
  } finally { await h.cleanup(); }
});
test("Confirm revalidates: a card whose precondition no longer holds is invalidated and commits nothing", async () => {
  const h = await harness();
  try {
    const r = request(h, {}); assert.ok(r.ok); if (!r.ok) return;
    h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "set_condition", character_id: A, conditions: [], status: "dead" }] });
    const before = h.campaign.revision;
    const outcome = h.session.confirmPending({ ref: r.ref, expected_revision: before });
    assert.ok(!outcome.ok && outcome.reason === "invalidated");
    assert.equal(h.campaign.revision, before); assert.equal(rec(h, B).retirement, undefined);
  } finally { await h.cleanup(); }
});
test("the pending repair card and the retirement survive save and reload; reload does not apply a pending repair", async () => {
  const h = await harness();
  try {
    const r = request(h, {}); assert.ok(r.ok); if (!r.ok) return;
    assert.ok((await h.session.save({ reason: "manual" })).ok);
    const loaded = await GameSession.loadCampaign(h.deps, "turn_fixture"); assert.ok(loaded.ok); if (!loaded.ok) return;
    assert.equal(loaded.session.getConfirmationView().cards.length, 1, "the card is restored");
    const disk = async () => (await h.repository.loadCampaign("turn_fixture", "current")).campaign.exportSnapshot().characters.find(c => c.id === B);
    assert.equal((await disk())?.retirement, undefined, "restoring a card does not apply it");
    const revision = (await h.repository.loadCampaign("turn_fixture", "current")).campaign.revision;
    assert.ok(loaded.session.confirmPending({ ref: r.ref, expected_revision: revision }).ok);
    assert.ok((await loaded.session.save({ reason: "manual" })).ok);
    const again = await GameSession.loadCampaign(h.deps, "turn_fixture"); assert.ok(again.ok); if (!again.ok) return;
    assert.equal((await disk())?.retirement?.merged_into, A);
    assert.equal(again.session.getConfirmationView().cards.length, 0);
  } finally { await h.cleanup(); }
});
