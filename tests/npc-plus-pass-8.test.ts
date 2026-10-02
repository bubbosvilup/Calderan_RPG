import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { metadata, mockNarrator, collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { MotifTracker, observeOrganicTurn, type OrganicTurnDiagnostics } from "../src/dev/organic-discovery.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";

/** NPC+ Pass 8: the evaluation-only organic discovery observer. It classifies; it never mutates or authorizes anything. */
async function observedTurn(narration: string, commands: readonly CampaignCommand[] = [], evidence: readonly string[] = [], input = "I sit down.") {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: "campaign_household_home", character_id: "brenna" },
  ] });
  const service = new RetrievalService(f.world);
  const coordinator = new TurnCoordinator(f.world, mockNarrator(narration), { async propose() { return { commands, evidence, ...metadata }; } }, { service, search: new HybridSearch(service) });
  const before = f.campaign.exportSnapshot();
  const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: input }));
  const done = events.find(e => e.type === "turn_completed");
  assert.ok(done && done.type === "turn_completed");
  const after = f.campaign.exportSnapshot();
  const observed = observeOrganicTurn({ world: f.world, before, after, player_input: input, turn: done.result as TurnResult });
  assert.equal(f.campaign.exportSnapshot(), after, "observing a turn never mutates the campaign");
  return { ...observed, after };
}
const protect = "Brenna steps between Nicco and the open door to protect him.";
const protectCommand: CampaignCommand = { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "protectiveness", direction: "raise" };
const find = (d: OrganicTurnDiagnostics, cls: string) => d.interactions.find(x => x.class === cls && x.npc_id === "brenna");

test("verified, proposed and committed protection is COMMITTED_EXISTING_DOMAIN with a premium development", async () => {
  const { diagnostics } = await observedTurn(protect, [protectCommand], [protect]);
  assert.equal(find(diagnostics, "protect")?.outcome, "COMMITTED_EXISTING_DOMAIN");
  assert.equal(find(diagnostics, "protect")?.stopped_at, "commit");
  assert.equal(diagnostics.counts.premium_developments, 1);
  assert.deepEqual(diagnostics.development_kinds, ["relationship_changed"]);
});

test("the same verifiable narration with no controller proposal is EVIDENCE_DETECTED_NO_PROPOSAL and commits nothing", async () => {
  const { diagnostics, after } = await observedTurn(protect);
  assert.equal(find(diagnostics, "protect")?.outcome, "EVIDENCE_DETECTED_NO_PROPOSAL");
  assert.equal(find(diagnostics, "protect")?.stopped_at, "evidence");
  assert.ok(diagnostics.counts.relationship_evidence >= 1);
  assert.equal(diagnostics.counts.premium_developments, 0);
  assert.equal(after.relationships.length, 0);
});

test("a proposal whose quote fails the verifier is PROPOSED_BUT_REJECTED", async () => {
  const hedged = "Brenna almost hugs Nicco, then thinks better of it.";
  const { diagnostics } = await observedTurn(hedged, [{ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "affection", direction: "raise" }], [hedged]);
  assert.equal(find(diagnostics, "affection_act")?.outcome, "PROPOSED_BUT_REJECTED");
  assert.equal(diagnostics.counts.rejected, 1);
  assert.equal(diagnostics.counts.premium_developments, 0);
});

test("politeness and gratitude are NO_STATE_EXPECTED; an apology with no hostility to lower is out of bounds, not evidence", async () => {
  const { diagnostics } = await observedTurn("Brenna smiles. \"Thank you,\" Brenna says. \"I'm sorry I snapped,\" she adds, and she apologizes to him again.");
  assert.equal(find(diagnostics, "gratitude")?.outcome, "NO_STATE_EXPECTED");
  assert.equal(find(diagnostics, "apology")?.outcome, "NO_STATE_EXPECTED");
  assert.equal(diagnostics.counts.relationship_evidence, 0);
  assert.equal(diagnostics.counts.premium_developments, 0);
});

test("a strong follow cue without completed movement to a known location is flagged VALID_EVIDENCE_NOT_DETECTED for review", async () => {
  const { diagnostics } = await observedTurn("Brenna walks beside him toward the stairs, then stops.", [], [], "Brenna, come with me.");
  const follow = find(diagnostics, "following");
  assert.equal(follow?.outcome, "VALID_EVIDENCE_NOT_DETECTED");
  assert.equal(follow?.review_required, true);
  assert.equal(diagnostics.counts.movement_evidence, 0);
  assert.equal(diagnostics.counts.follow_invitations, 1);
});

test("safe diagnostics carry no narration text; the separate review record does", async () => {
  const { diagnostics, review } = await observedTurn(protect);
  const json = JSON.stringify(diagnostics);
  assert.equal(json.includes("open door"), false);
  assert.equal(json.includes(protect), false);
  assert.ok(review.narration.includes("open door"));
  assert.ok(review.relationship_probes.some(p => p.sentence.includes("open door")));
});

test("motif recurrence counts distinct turns only and needs two of them", () => {
  const m = new MotifTracker();
  const d = (tag: string) => ({ motif_tags: [{ npc_id: "maren", tag }], interactions: [] });
  m.record(1, d("tends_hearth")); m.record(1, d("tends_hearth")); m.record(2, d("brings_food"));
  assert.deepEqual(m.motifs(), []);
  m.record(4, d("tends_hearth"));
  assert.deepEqual(m.motifs(), [{ npc_id: "maren", tag: "tends_hearth", turns: [1, 4] }]);
  const chore = { motif_tags: [], interactions: [{ npc_id: "maren", class: "chore" as const, domain: "none" as const }] } as never;
  m.record(1, chore); m.record(2, chore); assert.deepEqual(m.unrepresented(), []);
  m.record(3, chore); assert.deepEqual(m.unrepresented(), [{ npc_id: "maren", class: "chore", turns: 3 }]);
});

// Pass 8 demonstrated defect (live errands turn 22): ambient light "falling" inside a sentence led by a person was read as that person
// being knocked down, and the turn was redacted. Ambient subjects (light, shadow, dust…) falling are scenery, never a person's condition.
async function conditionIssues(narration: string) {
  const f = turnFixture(); const service = new RetrievalService(f.world);
  const coordinator = new TurnCoordinator(f.world, mockNarrator(narration), { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const done = (await collect(coordinator.runTurn({ campaign: f.campaign, player_input: "Gerome, move the table." }))).find(e => e.type === "turn_completed");
  assert.ok(done && done.type === "turn_completed");
  return done.result.narration_reconciliation?.issues.filter(i => i.kind === "uncommitted_condition") ?? [];
}
test("ambient light falling across a surface in a person-led sentence is not an uncommitted condition", async () => {
  assert.deepEqual(await conditionIssues("Gerome lifts the small table. He carries it toward the arched window and sets it down, angling it so the light from outside falls across the surface."), []);
  assert.deepEqual(await conditionIssues("Gerome steps back. He stands still while a shadow falls over the floorboards and dust falls through the beam."), []);
});
test("a person who falls is still an uncommitted condition, even with light in the sentence", async () => {
  assert.equal((await conditionIssues("Gerome lifts the small table. He trips and falls to the floor beside it.")).length, 1);
  assert.equal((await conditionIssues("Gerome turns. He falls to the floor as the light shifts across the boards.")).length, 1);
  assert.ok((await conditionIssues("Light falls across Brenna as she collapses onto the floor.")).length >= 1);
});
