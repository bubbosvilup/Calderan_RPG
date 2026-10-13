import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { turnFixture } from "../src/dev/support/turn-fixture.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { STORED_REFLECTION_SCHEMA } from "../src/campaign/reflection-proposal-schema.js";
import { reflectionEvidenceCatalog, statementProvenance, type StructuredEvidence } from "../src/turn/structured/reflection-evidence.js";
import { REFLECTION_SCHEMA, REFLECTION_SYSTEM, REFLECTION_SEMANTIC_VERSION, BASE_PROPOSAL_SCHEMA, CLAIM_SCHEMAS, schemaMatches } from "../src/turn/structured/reflection-schema.js";
import { reflectionContext, validateReflectionClaim, evaluateReflectionOutput, citationVisibilityViolations, type ReflectionContext } from "../src/turn/structured/reflection-validation.js";
import { reflectionWire } from "../src/turn/structured/reflection-wire.js";
import * as frozen from "./frozen/reflection/reflection-v23-cvc-e1.js";
import { V2_SCHEMA as frozenBaseSchema, CLAIM_SCHEMAS as frozenClaimSchemas, schemaMatches as frozenSchemaMatches } from "./frozen/reflection/reflection-v2.js";
import { statementProvenance as frozenStatementProvenance } from "./frozen/reflection/reflection-v22.js";
import { citationVisibilityViolations as frozenCitationVisibilityViolations } from "./frozen/reflection/reflection-v23-cvc.js";

/**
 * Cleanup C behavioral freeze. Production Reflection is four current-purpose modules; the frozen version chain in tests/frozen/reflection/
 * is the oracle. Every production entry point must return exactly what the oracle returns on a generated corpus of real campaign catalogs,
 * visibility contexts and mutated proposals (accepted and rejected), and the schema, prompt and wire projections must be identical.
 * Deterministic, no model calls.
 */
const HOME = "campaign_household_equivalence";
type Run = (commands: readonly CampaignCommand[]) => void;
function campaign(build: (run: Run) => void) {
  const f = turnFixture(false, { courtyard: true });
  const run: Run = commands => { f.campaign.apply({ expected_revision: f.campaign.revision, commands }); };
  run([{ kind: "create_household", id: HOME, name: "Equivalence household" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } }, { kind: "join_household", household_id: HOME, character_id: "maren" }]);
  build(run);
  return { world: f.world, snapshot: f.campaign.exportSnapshot() };
}
const rel = (dimension: "trust" | "wariness" | "respect", direction: "raise" | "lower" = "raise"): CampaignCommand => ({ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "brenna", dimension, direction });
const SCENARIOS: Record<string, (run: Run) => void> = {
  environment: run => { for (const stage of ["Dawn", "Midday", "Evening"]) run([{ kind: "add_household_rule", household_id: HOME, text: `${stage} check; Check kiln vents before lighting.` }]); },
  environment_mixed: run => { run([{ kind: "add_household_rule", household_id: HOME, text: "Opening inspection; Keep kiln vents clear before firing." }]); run([{ kind: "add_household_rule", household_id: HOME, text: "Sweep the yard" }]); run([{ kind: "add_household_rule", household_id: HOME, text: "Closing inspection; Keep kiln vents clear before firing.; Bar the gate" }]); },
  contrast: run => { for (let i = 0; i < 2; i++) run([rel("trust"), rel("wariness")]); },
  trajectory: run => { run([rel("trust")]); run([rel("trust")]); run([rel("trust", "lower")]); run([rel("respect")]); run([rel("respect")]); },
  statements: run => {
    run([{ kind: "establish_character_contract", character_id: "maren", field: "voice", text: "I mark chipped pots.", quote: "I mark chipped pots." }]);
    run([{ kind: "establish_character_contract", character_id: "maren", field: "social_style", text: "I separate chipped pots from finished batches.", quote: "I separate chipped pots from finished batches." }]);
  },
  movement_condition_membership: run => {
    for (const location_id of ["test_hall", "test_yard", "test_hall", "test_room"]) run([{ kind: "move_character", character_id: "maren", location_id }]);
    run([{ kind: "set_condition", character_id: "maren", conditions: ["tired"] }]); run([{ kind: "set_condition", character_id: "maren", conditions: [] }]); run([{ kind: "set_condition", character_id: "maren", conditions: ["tired"] }]);
    run([{ kind: "leave_household", household_id: HOME, character_id: "maren" }]); run([{ kind: "join_household", household_id: HOME, character_id: "maren" }]);
  },
  everything: run => { for (const b of ["environment", "contrast", "statements", "movement_condition_membership"] as const) SCENARIOS[b]!(run); },
};

/** Plausible proposals built from the catalog, one family at a time (accepted or not, the oracle decides). */
function baseProposals(subject: string, es: readonly StructuredEvidence[]): unknown[] {
  const of = (type: string) => es.filter(e => e.evidence_type === type).sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
  const out: unknown[] = [], p = (refs: readonly StructuredEvidence[], claim: Record<string, unknown>) => out.push({ subject_character_id: subject, confidence: "high", evidence_refs: [...new Set(refs.map(e => e.ref))], claim });
  const changes = of("relationship_change").filter(e => e.owner_character_id === subject), dims = [...new Set(changes.map(e => String(e.payload.dimension)))];
  for (const d of dims) {
    const rs = changes.filter(e => e.payload.dimension === d);
    p(rs, { type: "relationship_trajectory", target_character_id: rs[0]!.payload.other_id, dimension: d, from: rs[0]!.payload.from, to: rs.at(-1)!.payload.to, direction: "increase", transition_count: rs.length });
    p(rs, { type: "relationship_trajectory", target_character_id: rs[0]!.payload.other_id, dimension: d, from: rs[0]!.payload.from, to: rs.at(-1)!.payload.to, direction: "mixed", transition_count: rs.length });
  }
  if (dims.length >= 2) {
    const [a, b] = [dims[0]!, dims[1]!], la = changes.filter(e => e.payload.dimension === a).at(-1)!, lb = changes.filter(e => e.payload.dimension === b).at(-1)!, snaps = of("relationship_snapshot");
    const contrast = { type: "relationship_contrast", target_character_id: la.payload.other_id, dimension_a: a, state_a: la.payload.to, dimension_b: b, state_b: lb.payload.to };
    p(changes, contrast); p(snaps, contrast); p([...changes, ...snaps], contrast);
    const ra = changes.filter(e => e.payload.dimension === a), rb = changes.filter(e => e.payload.dimension === b);
    p([...ra, ...rb], { type: "relationship_parallel", target_character_id: la.payload.other_id, dimension_a: a, dimension_b: b, from: ra[0]!.payload.from, to: la.payload.to, transition_count: ra.length });
  }
  const moves = of("movement").filter(e => e.owner_character_id === subject);
  if (moves.length) p(moves, { type: "movement_trajectory", locations: [moves[0]!.payload.from, ...moves.map(e => e.payload.to)], transition_count: moves.length });
  const conditions = of("condition_change");
  if (conditions.length) p(conditions, { type: "condition_trajectory", condition_id: conditions[0]!.payload.condition, operations: conditions.map(e => e.payload.kind === "condition_added" ? "add" : "remove"), episode_count: conditions.filter(e => e.payload.kind === "condition_added").length });
  const members = of("household_membership");
  if (members.length) p(members, { type: "membership_trajectory", household_id: HOME, operations: members.map(e => ({ joined_household: "join", left_household: "leave", rejoined_household: "rejoin", migrated_member: "migrate" } as Record<string, string>)[String(e.payload.kind)] ?? "join"), join_count: 1, rejoin_count: members.filter(e => e.payload.kind === "rejoined_household").length, leave_count: members.filter(e => e.payload.kind === "left_household").length });
  const statements = of("self_statement"), events = of("statement_event");
  if (statements.length) { p(statements, { type: "self_statement_synthesis", statement_refs: statements.map(e => e.ref) }); p(events, { type: "self_statement_synthesis", statement_refs: statements.map(e => e.ref) }); }
  const rules = of("household_context");
  if (rules.length) {
    p(rules, { type: "environmental_motif", household_id: HOME, event_type: "rule_added", occurrence_count: rules.length });
    for (let segment_index = 0; segment_index < 3; segment_index++) for (const anchor of rules) p(rules, { type: "environmental_shared_rule_text", household_id: HOME, relation: "shared_exact_segment", anchor_ref: anchor.ref, segment_index, occurrence_count: rules.length });
    if (rules.length >= 3) p([rules[0]!, rules[2]!], { type: "environmental_shared_rule_text", household_id: HOME, relation: "shared_exact_segment", anchor_ref: rules[0]!.ref, segment_index: 1, occurrence_count: 2 });
  }
  return out;
}
/** Systematic single-field mutations of a proposal: refs, subject, claim values, types and shape. */
function mutations(raw: unknown, es: readonly StructuredEvidence[]): unknown[] {
  const p = raw as { subject_character_id: string; evidence_refs: string[]; claim: Record<string, unknown> }, out: unknown[] = [raw];
  const withClaim = (patch: Record<string, unknown>) => out.push({ ...p, claim: { ...p.claim, ...patch } });
  out.push({ ...p, subject_character_id: "brenna" }, { ...p, confidence: "low" }, { ...p, evidence_refs: p.evidence_refs.slice(1) }, { ...p, evidence_refs: p.evidence_refs.slice(0, -1) },
    { ...p, evidence_refs: [...p.evidence_refs, "no-such-ref"] }, { ...p, evidence_refs: [...p.evidence_refs, p.evidence_refs[0]] }, { ...p, evidence_refs: [...p.evidence_refs].reverse() }, { ...p, extra: true });
  for (const e of es.slice(0, 12)) if (!p.evidence_refs.includes(e.ref)) out.push({ ...p, evidence_refs: [...p.evidence_refs, e.ref] });
  for (const [k, v] of Object.entries(p.claim)) {
    if (k === "type") continue;
    if (typeof v === "number") { withClaim({ [k]: v + 1 }); withClaim({ [k]: Math.max(0, v - 1) }); }
    if (typeof v === "string") for (const alt of ["none", "low", "moderate", "high", "trust", "wariness", "decrease", "increase", "brenna", "shared_activity", "x"]) if (alt !== v) withClaim({ [k]: alt });
    if (Array.isArray(v)) { withClaim({ [k]: v.slice(1) }); withClaim({ [k]: [...v].reverse() }); }
    const { [k]: _drop, ...rest } = p.claim; out.push({ ...p, claim: rest });
  }
  for (const type of [...Object.keys(CLAIM_SCHEMAS), "environmental_shared_rule_text", "missing_provenance_tension", "invented"]) if (type !== p.claim.type) withClaim({ type });
  withClaim({ extra_field: 1 });
  return out;
}
function corpus() {
  const cases: { name: string; context: ReflectionContext; frozenContext: frozen.E1Context; proposals: unknown[]; names: Map<string, string> }[] = [];
  for (const [name, build] of Object.entries(SCENARIOS)) {
    const { world, snapshot } = campaign(build);
    const catalog = reflectionEvidenceCatalog(world, snapshot, "maren"), oracle = frozen.structuredReflectionEvidenceE1(world, snapshot, "maren");
    assert.deepEqual(catalog, oracle, `${name}: evidence catalog`);
    assert.deepEqual(statementProvenance(catalog.structured, "maren"), frozenStatementProvenance(oracle.structured, "maren"), `${name}: statement provenance`);
    const es = catalog.structured, proposals = [...baseProposals("maren", es).flatMap(p => mutations(p, es)), null, 7, "x", {}, { claim: null }, { subject_character_id: "maren", evidence_refs: [], confidence: "high", claim: { type: "environmental_shared_rule_text" } }];
    const visibilities: [string, readonly StructuredEvidence[]][] = [["all", es], ["none", []], ...es.slice(0, 8).map((e, i): [string, StructuredEvidence[]] => [`without-${i}`, es.filter(x => x.ref !== e.ref)]), ...[...new Set(es.map(e => e.evidence_type))].map((t): [string, StructuredEvidence[]] => [`only-${t}`, es.filter(e => e.evidence_type === t)])];
    for (const [visibility, evidence] of visibilities) {
      const request = { character: { id: "maren" }, evidence }, names = new Map([["maren", "Maren"], ["brenna", "Brenna"]]);
      const context = reflectionContext(request, es, snapshot), frozenContext = frozen.environmentalE1Context(request, oracle.structured, snapshot);
      assert.deepEqual(context, frozenContext, `${name}/${visibility}: context`);
      cases.push({ name: `${name}/${visibility}`, context, frozenContext, proposals, names });
    }
  }
  return cases;
}

test("Reflection consolidation: schema, prompt, semantic version and storage schema are the frozen ones, byte for byte", () => {
  assert.deepEqual(REFLECTION_SCHEMA, frozen.E1_SCHEMA);
  assert.deepEqual(REFLECTION_SCHEMA, STORED_REFLECTION_SCHEMA);
  assert.deepEqual(BASE_PROPOSAL_SCHEMA, frozenBaseSchema);
  assert.deepEqual(CLAIM_SCHEMAS, frozenClaimSchemas);
  assert.equal(REFLECTION_SYSTEM, frozen.E1_SYSTEM);
  assert.equal(REFLECTION_SEMANTIC_VERSION, frozen.E1_VERSION);
  assert.equal(createHash("sha256").update(JSON.stringify(REFLECTION_SCHEMA)).digest("hex"), createHash("sha256").update(JSON.stringify(frozen.E1_SCHEMA)).digest("hex"));
  for (const value of [{ proposals: [] }, { proposals: [{}] }, { proposals: [], extra: 1 }, [], null, "x"]) assert.equal(schemaMatches(REFLECTION_SCHEMA, value), frozenSchemaMatches(frozen.E1_SCHEMA, value));
});
test("Reflection consolidation: validation, batch evaluation, visibility and wire equal the frozen oracle on the whole corpus", () => {
  let validations = 0, accepted = 0; const reasons = new Set<string>(), acceptedTypes = new Set<string>();
  for (const c of corpus()) {
    assert.deepEqual(reflectionWire(c.context), frozen.citationScopedReflectionWireE1(c.frozenContext), `${c.name}: wire`);
    for (const raw of c.proposals) {
      const d = validateReflectionClaim(raw, c.context);
      assert.deepEqual(d, frozen.validateStructuredClaimE1(raw, c.frozenContext), `${c.name}: ${JSON.stringify(raw)}`);
      assert.deepEqual(citationVisibilityViolations(raw, c.context.citation), frozenCitationVisibilityViolations(raw, c.frozenContext.citation));
      validations++; if (d.accepted) { accepted++; acceptedTypes.add(String((raw as { claim: { type: string } }).claim.type)); } for (const r of d.reasons) reasons.add(r);
    }
    for (let i = 0; i < c.proposals.length; i += 7) {
      const batch = [c.proposals[i], c.proposals[i], c.proposals[(i * 3) % c.proposals.length], c.proposals[0]];
      assert.deepEqual(evaluateReflectionOutput(batch, c.context, c.names), frozen.evaluateStructuredOutputE1(batch, c.frozenContext, c.names), `${c.name}: batch ${i}`);
    }
  }
  // The corpus must exercise acceptance and a broad range of rejection reasons, or the equivalence would be vacuous.
  assert.ok(validations > 20000, `validations ${validations}`);
  assert.ok(accepted > 100, `accepted ${accepted}`);
  assert.ok(reasons.size >= 20, `reasons ${[...reasons].sort().join(",")}`);
  assert.deepEqual([...acceptedTypes].sort(), [...Object.keys(CLAIM_SCHEMAS), "environmental_shared_rule_text"].sort(), "every claim family is accepted at least once");
});
