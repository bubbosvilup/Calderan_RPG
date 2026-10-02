import test from "node:test";
import assert from "node:assert/strict";
import { household } from "./pass10-support.js";
import { collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { scriptedController, scriptedNarrator } from "./provider-failure-scripts.js";
import { characterLocation } from "../src/turn/character-movement.js";

/**
 * NPC+ Pass 10 — revision/reconciliation x follow. Authorization reads the DRAFT; the audit may then ask for one revision for an
 * unrelated issue. The revision narrator must be told what the draft's authorized move committed, or it can drop the follow
 * (state moved, narration silent). Transfers and departures already had COMMITTED lines; a move had none.
 */
async function turn(texts: string[]) {
  const f = household(), service = new RetrievalService(f.world), narrator = scriptedNarrator(texts);
  const co = new TurnCoordinator(f.world, narrator, scriptedController([]), { service, search: new HybridSearch(service) });
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: "I go down to the main hall. Maren, come with me." }));
  const done = events.find(e => e.type === "turn_completed"), r = done && done.type === "turn_completed" ? done.result : undefined;
  const delivered = (events.find(e => e.type === "narration_completed") as { text: string } | undefined)?.text;
  return { f, r, narrator, delivered, maren: characterLocation(f.campaign.exportSnapshot(), f.world, "maren"), moved: f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === "maren")!.dynamic.recent_developments.filter(e => e.kind === "moved").length };
}
const FOLLOW_AND_FALL = "Nicco goes down the stairs. Maren follows him. Nicco falls to the floor.";
test("the reconciliation request tells the revision narrator that the follow was committed", async () => {
  const t = await turn([FOLLOW_AND_FALL, "Nicco goes down the stairs. Maren follows him."]);
  assert.equal(t.narrator.requests.length, 2, "one draft and one revision");
  const revision = t.narrator.requests[1]!.messages.at(-1)!.content;
  assert.match(revision, /COMMITTED: Maren moved to Main hall and is there now: keep that arrival/);
  assert.equal(t.maren, "test_hall"); assert.equal(t.moved, 1); assert.equal(t.r!.narration_reconciliation?.delivered, "revision");
});
test("a turn with no move has no COMMITTED movement line", async () => {
  const t = await turn(["Nicco goes down the stairs alone. Nicco falls to the floor.", "Nicco goes down the stairs alone."]);
  assert.doesNotMatch(t.narrator.requests[1]!.messages.at(-1)!.content, /moved to/);
  assert.equal(t.maren, "test_room");
});
test("a revision that ADDS an unrecorded follow is audited and redacted: the state never moves for revision-only prose", async () => {
  const t = await turn(["Nicco goes down the stairs. Nicco falls to the floor.", "Nicco goes down the stairs. Maren follows him."]);
  assert.equal(t.maren, "test_room"); assert.equal(t.moved, 0);
  assert.equal(t.r!.narration_reconciliation?.delivered, "redacted");
  assert.ok(t.r!.narration_reconciliation?.revision_issues?.some(i => i.kind === "absent_participant" || i.kind === "uncommitted_movement"));
  assert.doesNotMatch(t.delivered!, /Maren follows/);
});
test("a revision that still carries the issue is redacted sentence by sentence; the authorized follow survives in the delivered text", async () => {
  const t = await turn([FOLLOW_AND_FALL, FOLLOW_AND_FALL]);
  assert.equal(t.r!.narration_reconciliation?.delivered, "redacted");
  assert.match(t.delivered!, /Maren follows him/); assert.doesNotMatch(t.delivered!, /falls to the floor/);
  assert.equal(t.maren, "test_hall"); assert.equal(t.moved, 1);
});
