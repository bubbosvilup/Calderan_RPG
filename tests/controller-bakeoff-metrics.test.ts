import test from "node:test";
import assert from "node:assert/strict";
import { scoreControllerCommands, falseProposalSeverity, latencyStats } from "../src/dev/controller-bakeoff-metrics.js";
import type { CampaignCommand } from "../src/campaign/types.js";
const move: CampaignCommand = { kind: "move_character", character_id: "maren", location_id: "room" };
const rel: CampaignCommand = { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "affection", direction: "raise" };
test("bakeoff multiset consumes gold once and counts duplicate relationship mutations", () => {
  const r = scoreControllerCommands([rel, rel], [rel]);
  assert.equal(r.true_positives.length, 1); assert.deepEqual(r.false_positives, [rel]); assert.deepEqual(r.duplicate_proposals, [rel]); assert.equal(r.exact_match, false);
});
test("bakeoff engine-owned movement is allowed without adding recall or requiring emission", () => {
  for (const proposed of [[rel], [move, rel]]) { const r = scoreControllerCommands(proposed, [rel], [move]); assert.equal(r.true_positives.length, 1); assert.equal(r.false_negatives.length, 0); assert.equal(r.exact_match, true); }
  const r = scoreControllerCommands([move, move], [], [move]); assert.equal(r.engine_owned_proposals.length, 1); assert.equal(r.false_positives.length, 1);
});
test("bakeoff wrong destination is both an unmatched proposal and a missed required command", () => {
  const r = scoreControllerCommands([{ ...move, location_id: "invented" }], [move]); assert.equal(r.false_positives.length, 1); assert.equal(r.false_negatives.length, 1);
});
test("bakeoff scoring ignores order and serialization property order", () => {
  const r = scoreControllerCommands([{ direction: "raise", dimension: "affection", to_character_id: "nicco", from_character_id: "brenna", kind: "adjust_relationship" }, move], [move, rel]); assert.equal(r.exact_match, true);
});
test("bakeoff rejection cannot lower invented-entity severity", () => {
  const known = new Set(["maren", "room", "nicco", "brenna"]);
  assert.equal(falseProposalSeverity({ ...move, location_id: "invented" }, known, false), "severe");
  assert.equal(falseProposalSeverity(rel, known, false), "moderate"); assert.equal(falseProposalSeverity(rel, known, true), "moderate");
  assert.equal(falseProposalSeverity({ ...rel, from_character_id: "maren" }, known, false, [rel]), "severe");
});
test("bakeoff latency statistics do not turn unavailable measurements into zero", () => {
  assert.deepEqual(latencyStats([]), { n: 0, mean_ms: null, median_ms: null, p95_ms: null });
  assert.deepEqual(latencyStats([100, 1, 2, 3]), { n: 4, mean_ms: 26.5, median_ms: 2.5, p95_ms: 100 });
});
test("bakeoff existing-knowledge regrant is redundant mutation, not invented knowledge", () => {
  const knowledge: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "bridge", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
  const known = new Set(["brenna", "bridge", "nicco"]);
  assert.equal(falseProposalSeverity(knowledge, known, false, [], true), "moderate");
  assert.equal(falseProposalSeverity(knowledge, known, false), "severe");
});
