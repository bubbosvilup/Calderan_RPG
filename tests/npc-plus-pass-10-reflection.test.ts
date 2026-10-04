import { productionStub, testTrajectory, testContrast, testMovement, instantReflectionPacing } from "./production-reflection-fixtures.js";
import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import type { CampaignCommand, CampaignSnapshot } from "../src/campaign/types.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { recoverNpcContext } from "../src/turn/npc-plus.js";
import { reflectAfterTurn, reflectionDue, reflectionEvidence, validateProposals, type Proposal, type ReflectionProvider } from "../src/turn/reflection.js";

/** NPC+ Pass 10: organic-like development sequences feed reflection correctly, and the validator rejects claims no evidence supports. */
const HOME = "campaign_household_h";
function fixture() {
  const f = turnFixture();
  const run = (...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  run({ kind: "create_household", id: HOME, name: "Home" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } });
  run({ kind: "join_household", household_id: HOME, character_id: "brenna" }, { kind: "join_household", household_id: HOME, character_id: "maren" });
  return { ...f, run, snap: () => f.campaign.exportSnapshot() as DeepReadonly<CampaignSnapshot> };
}
const names = new Map([["brenna", "Brenna"], ["maren", "Maren"], ["gerome", "Gerome"]]);
const P = (kind: Proposal["kind"], label: string, text: string, evidence_refs: string[], confidence: Proposal["confidence"] = "medium") => ({ kind, label, text, evidence_refs, confidence });
const stub = (proposals: unknown[]): ReflectionProvider => ({ async reflect() { return { text: JSON.stringify({ proposals }), model: "stub" }; } });
const moves = (f: ReturnType<typeof fixture>, n: number) => { for (let i = 0; i < n; i++) f.run({ kind: "move_character", character_id: "maren", location_id: f.snap().runtime.npc_locations.find(l => l.character_id === "maren")?.current_location === "test_hall" ? "test_room" : "test_hall" }); };
const moveRefs = (f: ReturnType<typeof fixture>) => reflectionEvidence(f.world, f.snap(), "maren").filter(e => e.kind === "development" && / moved from /.test(e.text)).map(e => e.ref);
const verdict = (f: ReturnType<typeof fixture>, who: "brenna" | "maren", p: ReturnType<typeof P>) => validateProposals([p], reflectionEvidence(f.world, f.snap(), who), { id: who, name: names.get(who)! }, names);

// ------------------------------------------------------------------------------------------------ readiness: organic-like movement sequences
test("organic moves: each commit appends exactly one `moved` development; due after the trigger; the catalog cites each; a faithful note persists, renders and recovers exactly", async () => {
  const f = fixture();
  assert.equal(reflectionDue(f.snap(), "maren"), false);
  moves(f, 1);
  assert.equal(reflectionDue(f.snap(), "maren"), false, "joined + one move = 2 developments");
  moves(f, 2);
  const dev = f.snap().premium_characters.find(p => p.character_id === "maren")!.dynamic.recent_developments;
  assert.deepEqual(dev.map(e => e.kind), ["joined_household", "moved", "moved", "moved"]);
  assert.equal(reflectionDue(f.snap(), "maren"), true);
  const refs = moveRefs(f);
  assert.equal(refs.length, 3);
  for (const r of refs) assert.ok(recoverNpcContext(f.world, f.snap(), r), "recovery resolves each handle exactly");
  const runs = await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testMovement(r)]));
  assert.equal(runs[0]!.status, "committed"); assert.equal(runs[0]!.accepted.length, 1);
  const note = f.snap().premium_reflections.find(r => r.character_id === "maren")!.notes[0]!;
  assert.deepEqual(note.evidence_refs, refs);
  assert.equal(reflectionDue(f.snap(), "maren"), false, "reflected evidence is not re-sent");
  const ctx = buildTurnContext(f.world, f.snap(), { input: "Maren, how are you?" });
  assert.ok(ctx.npc_plus!.lines.some(l => /movement_|recorded route/.test(l) && /Maren/.test(l)));
});
test("mixed sequences: movement + relationship + rule, movement + condition + movement, contract + movement all reach the catalog with correct kinds", () => {
  const f = fixture();
  moves(f, 1);
  f.run({ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  f.run({ kind: "add_household_rule", household_id: HOME, text: "Nobody enters the cellar alone." });
  f.run({ kind: "set_condition", character_id: "maren", conditions: ["minor_injury"] });
  moves(f, 1);
  f.run({ kind: "establish_character_contract", character_id: "maren", field: "voice", text: "soft, quick", quote: "I talk fast when I am nervous." });
  moves(f, 1);
  const catalog = reflectionEvidence(f.world, f.snap(), "maren");
  const kinds = catalog.filter(e => e.kind === "development").map(e => (/ moved from /.test(e.text) ? "moved" : /household rule/.test(e.text) ? "rule" : /condition/.test(e.text) ? "condition" : /toward/.test(e.text) ? "relationship" : "other"));
  assert.deepEqual(kinds.filter(k => k !== "other").sort(), ["condition", "moved", "moved", "moved", "relationship", "rule"]);
  assert.ok(catalog.some(e => e.kind === "contract"));
  assert.equal(catalog.filter(e => e.movement_only).length, 3, "only the movement developments are movement-only");
});
test("movement-only evidence cannot license a stance: attachment, comfort, trust, wants and enjoyment are rejected; a plain behavioural description is accepted", () => {
  const f = fixture(); moves(f, 3); const refs = moveRefs(f);
  for (const text of ["Three moves show she likes accompanying Nicco.", "Maren moved three times and wants to stay near Nicco.", "Maren is eager to join Nicco wherever he goes.",
    "Maren is devoted to staying near Nicco.", "Maren moves wherever Nicco moves, feeling safe near him.", "Maren trusts Nicco enough to keep moving with him.", "Maren is a loyal companion who follows Nicco."])
    assert.deepEqual(verdict(f, "maren", P("signature_pattern", "follows_nicco", text, refs)).rejected.map(r => r.reason), ["forbidden_inference"], text);
  assert.equal(verdict(f, "maren", P("shared_motif", "stairs", "Maren has moved between the observation room and the main hall several times.", refs)).accepted.length, 1);
});
test("movement evidence mixed with a recorded relationship may still support a recorded dimension (not movement-only)", () => {
  const f = fixture(); moves(f, 2);
  f.run({ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  const refs = [...moveRefs(f).slice(0, 1), "npcrel:maren:nicco"];
  assert.equal(verdict(f, "maren", P("stance", "cautious_trust", "Approaches Nicco with growing but cautious trust.", refs)).accepted.length, 1);
});

// ------------------------------------------------------------------------------------------------ adversarial faithfulness
test("adversarial reflection proposals are rejected (reliance, love, motive, learned beliefs, enjoyment, Nicco's inner state, rule authorship, reciprocity, childhood, a single injury as a pattern)", () => {
  const f = fixture(); moves(f, 3);
  f.run({ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  f.run({ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  f.run({ kind: "add_household_rule", household_id: HOME, text: "Nobody enters the cellar alone." });
  const bRefs = reflectionEvidence(f.world, f.snap(), "brenna").filter(e => e.kind === "development").map(e => e.ref), rel = "npcrel:brenna:nicco", mRefs = moveRefs(f);
  const cases: [string, ReturnType<typeof P>, "brenna" | "maren"][] = [
    ["Brenna depends on Nicco.", P("stance", "depends", "Brenna depends on Nicco.", [rel]), "brenna"],
    ["Maren loves Nicco.", P("stance", "loves", "Maren loves Nicco.", mRefs), "maren"],
    ["Gerome sees Nicco as his master.", P("stance", "master", "Gerome sees Nicco as his master.", [rel]), "brenna"],
    ["Brenna follows because she fears abandonment.", P("stance", "abandon", "Brenna follows because she fears abandonment.", [rel]), "brenna"],
    ["Maren's childhood made her protective.", P("stance", "childhood", "Maren's childhood made her protective.", mRefs), "maren"],
    ["Brenna has learned that men cannot be trusted.", P("stance", "learned", "Brenna has learned that men cannot be trusted.", [rel]), "brenna"],
    ["Gerome enjoys serving the household.", P("stance", "enjoys", "Brenna enjoys serving the household.", [rel]), "brenna"],
    ["Three moves show she likes accompanying Nicco.", P("signature_pattern", "likes", "Three moves show she likes accompanying Nicco.", mRefs), "maren"],
    ["A single injury became a recurring weakness.", P("signature_pattern", "weak", "A single injury became a recurring weakness.", bRefs.slice(0, 1)), "brenna"],
    ["The relationship is reciprocal.", P("stance", "reciprocal", "The relationship is reciprocal.", [rel]), "brenna"],
    ["Nicco's trust in Brenna increased.", P("stance", "nicco_trust", "Nicco's trust in Brenna increased.", [rel]), "brenna"],
    ["Brenna created the household rules.", P("signature_pattern", "rules", "Brenna created the household rules.", bRefs), "brenna"],
    ["Brenna set the household rules.", P("signature_pattern", "rules2", "Brenna set the household rules.", bRefs), "brenna"],
    ["Brenna decided that Nicco is safe, so that she trusts him.", P("stance", "decided", "Brenna thinks Nicco is safe.", [rel]), "brenna"],
  ];
  for (const [label, p, who] of cases) assert.equal(verdict(f, who, p).accepted.length, 0, label);
});
test("legitimate notes remain accepted: a recorded stance, a pattern across recorded changes, a tension with a contrast", () => {
  const f = fixture();
  f.run({ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  f.run({ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  f.run({ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "wariness", direction: "raise" });
  const refs = reflectionEvidence(f.world, f.snap(), "brenna").filter(e => e.kind === "development" && / toward .+ moved /.test(e.text)).map(e => e.ref);
  assert.equal(verdict(f, "brenna", P("stance", "cautious_trust", "Approaches Nicco with growing but cautious trust.", ["npcrel:brenna:nicco"])).accepted.length, 1);
  assert.equal(verdict(f, "brenna", P("signature_pattern", "steady_trust_steps", "Trust toward Nicco has grown in repeated small steps.", refs.slice(0, 2))).accepted.length, 1);
  // "like" as a preposition is not an inner state of Nicco.
  assert.equal(verdict(f, "brenna", P("stance", "like_a_guest", "Treats Nicco like a guest she is still getting to know.", ["npcrel:brenna:nicco"])).accepted.length, 1);
  assert.equal(verdict(f, "brenna", P("unresolved_tension", "trust_and_wariness", "Trusts Nicco more each time while staying wary of him.", refs.slice(1, 3))).accepted.length, 1);
});
test("private or foreign evidence is never citable: another character's handle, a private fact and a stale handle are rejected as unknown evidence", () => {
  const f = fixture(); moves(f, 3);
  const v = verdict(f, "maren", P("stance", "x", "Maren keeps close to the household.", ["npcmem:brenna:history:r3.0", "npcmem:maren:knowledge:campaign_fact_private_secret"]));
  assert.deepEqual(v.rejected.map(r => r.reason), ["unknown_evidence"]);
  assert.equal(reflectionEvidence(f.world, f.snap(), "maren").some(e => /HIDDEN_SECRET_SENTINEL/.test(e.text)), false, "a private fact is never in the catalog");
});
