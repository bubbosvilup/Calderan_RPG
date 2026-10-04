import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { structuredReflectionEvidence, validateStructuredClaim, evaluateStructuredOutput, renderStructuredClaim, parseStructuredOutput, type StructuredProposal } from "../src/dev/reflection-v2.js";

function fixture() {
  const f = turnFixture(false, { courtyard: true });
  const run = (command: CampaignCommand) => f.campaign.apply({ expected_revision: f.campaign.revision, commands: [command] });
  run({ kind: "create_household", id: "campaign_household_v2", name: "V2 test household" });
  run({ kind: "set_membership", household_id: "campaign_household_v2", membership: { character_id: "nicco", status: "member", role: "owner" } });
  run({ kind: "join_household", household_id: "campaign_household_v2", character_id: "maren" });
  const catalog = () => structuredReflectionEvidence(f.world, f.campaign.exportSnapshot(), "maren");
  const rel = (dimension: "trust" | "wariness", direction: "raise" | "lower" = "raise") => run({ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "brenna", dimension, direction });
  const proposal = (claim: StructuredProposal["claim"], type: string): StructuredProposal => ({ subject_character_id: "maren", evidence_refs: catalog().structured.filter(e => e.evidence_type === type).map(e => e.ref), confidence: "high", claim });
  const check = (p: unknown) => validateStructuredClaim(p, catalog().structured, "maren");
  return { ...f, run, catalog, rel, proposal, check };
}
test("V2 trust trajectory checks counts, direction, contiguous endpoints, ownership and display independence", () => {
  const f = fixture(); f.rel("trust"); f.rel("trust");
  const p = f.proposal({ type: "relationship_trajectory", target_character_id: "brenna", dimension: "trust", from: "none", to: "moderate", direction: "increase", transition_count: 2 }, "relationship_change");
  assert.equal(f.check(p).accepted, true);
  assert.ok(f.check({ ...p, claim: { ...p.claim, transition_count: 1 } }).reasons.includes("claim_count_mismatch"));
  assert.ok(f.check({ ...p, claim: { ...p.claim, direction: "decrease" } }).reasons.includes("claim_direction_mismatch"));
  assert.ok(f.check({ ...p, claim: { ...p.claim, to: "high" } }).reasons.includes("claim_state_mismatch"));
  const c = f.catalog();
  assert.deepEqual(f.check(p), validateStructuredClaim(p, c.structured, "maren"));
  assert.ok(c.legacy.some(e => e.text.includes("trust")));
  // Legacy English strings are absent from the validator's input and cannot affect the result.
  const changedDisplay = c.legacy.map(e => ({ ...e, text: "Entirely different display template." }));
  assert.ok(changedDisplay.every(e => e.text === "Entirely different display template."));
  assert.equal(validateStructuredClaim(p, c.structured, "maren").accepted, true);
  assert.equal(validateStructuredClaim(p, c.structured.map(e => ({ ...e, owner_character_id: "brenna" })), "maren").accepted, false);
});
test("V2 membership separates initial join from rejoin", () => {
  const f = fixture();
  f.run({ kind: "leave_household", household_id: "campaign_household_v2", character_id: "maren" });
  f.run({ kind: "join_household", household_id: "campaign_household_v2", character_id: "maren" });
  const p = f.proposal({ type: "membership_trajectory", household_id: "campaign_household_v2", operations: ["join", "leave", "rejoin"], join_count: 1, rejoin_count: 1, leave_count: 1 }, "household_membership");
  assert.equal(f.check(p).accepted, true);
  assert.ok(f.check({ ...p, claim: { ...p.claim, rejoin_count: 2 } }).reasons.includes("claim_count_mismatch"));
});
test("V2 movement allows literal recurrence and blocks psychology side channels", () => {
  const f = fixture();
  for (const location_id of ["test_hall", "test_room", "test_hall"]) f.run({ kind: "move_character", character_id: "maren", location_id });
  const p = f.proposal({ type: "movement_trajectory", locations: ["test_room", "test_hall", "test_room", "test_hall"], transition_count: 3 }, "movement");
  assert.equal(f.check(p).accepted, true);
  for (const psychology of ["restless", "without settling", "rootless"]) assert.equal(f.check({ ...p, claim: { ...p.claim, psychology } }).accepted, false);
  assert.ok(f.check({ ...p, claim: { ...p.claim, transition_count: 2 } }).reasons.includes("claim_count_mismatch"));
});
test("V2 condition add/remove/add has two episode starts, no healing inference", () => {
  const f = fixture();
  for (const conditions of [["minor_injury"], [], ["minor_injury"]]) f.run({ kind: "set_condition", character_id: "maren", conditions });
  const p = f.proposal({ type: "condition_trajectory", condition_id: "minor_injury", operations: ["add", "remove", "add"], episode_count: 2 }, "condition_change");
  assert.equal(f.check(p).accepted, true);
  assert.ok(f.check({ ...p, claim: { ...p.claim, episode_count: 3 } }).reasons.includes("claim_episode_mismatch"));
  assert.equal(f.check({ ...p, claim: { ...p.claim, healing: "failed to heal" } }).accepted, false);
  assert.ok(f.check({ ...p, claim: { type: "missing_provenance_tension" } }).reasons.includes("missing_provenance_not_tension"));
});
test("V2 one multidimensional snapshot supports simultaneous contrast without a lexical connector", () => {
  const f = fixture(); for (let i = 0; i < 2; i++) f.rel("trust"); for (let i = 0; i < 3; i++) f.rel("wariness");
  const p = f.proposal({ type: "relationship_contrast", target_character_id: "brenna", dimension_a: "trust", state_a: "moderate", dimension_b: "wariness", state_b: "high" }, "relationship_snapshot");
  assert.equal(p.evidence_refs.length, 1); assert.equal(f.check(p).accepted, true);
  assert.ok(f.check({ ...p, claim: { ...p.claim, state_a: "high" } }).reasons.includes("claim_state_mismatch"));
  assert.equal(f.check({ ...p, claim: { ...p.claim, dimension_b: "trust" } }).accepted, false);
});
test("V2 two independent self-statements count, one statement plus its history does not", () => {
  const f = fixture();
  f.run({ kind: "establish_character_contract", character_id: "maren", field: "social_style", text: "coordinates supplies", quote: "I coordinate supplies for the household." });
  f.run({ kind: "establish_character_contract", character_id: "maren", field: "voice", text: "reports counts", quote: "I report supply counts each evening." });
  const refs = f.catalog().structured.filter(e => e.evidence_type === "self_statement").map(e => e.ref);
  const p = f.proposal({ type: "self_statement_synthesis", statement_refs: refs }, "self_statement");
  assert.equal(f.check(p).accepted, true);
  const cat = f.catalog().structured;
  assert.equal(validateStructuredClaim(p, cat.map(e => e.evidence_type === "self_statement" ? { ...e, revision: 10 } : e), "maren").accepted, false);
  assert.equal(f.check({ ...p, evidence_refs: [refs[0], f.catalog().structured.find(e => e.evidence_type === "statement_event")!.ref], claim: { ...p.claim, statement_refs: [refs[0], f.catalog().structured.find(e => e.evidence_type === "statement_event")!.ref] } }).accepted, false);
  assert.match(renderStructuredClaim(p, cat, new Map()), /explicitly stated/);
});
test("V2 household context stays environmental; unknown owned role capability fails closed", () => {
  const f = fixture(); for (const text of ["Keep tools dry.", "Keep stairs clear."]) f.run({ kind: "add_household_rule", household_id: "campaign_household_v2", text });
  const p = f.proposal({ type: "environmental_motif", household_id: "campaign_household_v2", event_type: "rule_added", occurrence_count: 2 }, "household_context");
  assert.equal(f.check(p).accepted, true);
  assert.ok(f.catalog().structured.filter(e => e.evidence_type === "household_context").every(e => e.owner_character_id === null));
  assert.equal(f.check({ ...p, claim: { type: "emerging_role", role_label: "quartermaster" } }).accepted, false);
  assert.ok(f.check({ ...p, claim: { type: "movement_trajectory", locations: ["test_room", "test_hall", "test_room"], transition_count: 2 } }).reasons.includes("environment_not_character_evidence"));
});
test("V2 hidden prose, unknown fields/refs, subject mismatch, malformed envelopes reject", () => {
  const f = fixture(); f.rel("trust"); f.rel("trust");
  const p = f.proposal({ type: "relationship_trajectory", target_character_id: "brenna", dimension: "trust", from: "none", to: "moderate", direction: "increase", transition_count: 2 }, "relationship_change");
  assert.equal(f.check({ ...p, text: "Maren is open and receptive." }).accepted, false);
  assert.ok(f.check({ ...p, subject_character_id: "brenna" }).reasons.includes("claim_subject_mismatch"));
  assert.ok(f.check({ ...p, evidence_refs: ["unknown"] }).reasons.includes("unknown_evidence"));
  assert.equal(parseStructuredOutput('```json\n{"proposals":[]}\n```'), undefined);
  assert.deepEqual(parseStructuredOutput('{"proposals":[]}'), []);
  assert.equal(evaluateStructuredOutput([p, p], f.catalog().structured, "maren", new Map()).accepted.length, 1);
});
test("V2 omitted intermediate relationship transitions cannot manufacture a contiguous trajectory", () => {
  const f = fixture(); f.rel("trust"); f.rel("trust"); f.rel("trust", "lower"); f.rel("trust");
  const p = f.proposal({ type: "relationship_trajectory", target_character_id: "brenna", dimension: "trust", from: "none", to: "moderate", direction: "increase", transition_count: 2 }, "relationship_change");
  assert.ok(f.check({ ...p, evidence_refs: [p.evidence_refs[0], p.evidence_refs[3]] }).reasons.includes("claim_trajectory_mismatch"));
});
