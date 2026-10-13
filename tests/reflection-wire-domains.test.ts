import { test } from "node:test";
import assert from "node:assert/strict";
import { reflectionContext, validateReflectionClaim } from "../src/turn/structured/reflection-validation.js";
import { reflectionWire } from "../src/turn/structured/reflection-wire.js";
import { BASE_PROPOSAL_SCHEMA, schemaMatches } from "../src/turn/structured/reflection-schema.js";
import type { StructuredEvidence } from "../src/turn/structured/reflection-evidence.js";

/**
 * The production Reflection wire keeps the three properties the superseded request-scoped wire oracle (`reflection-wire-v2`, removed in
 * Repository Cleanup E) pinned only on frozen code: exact movement endpoints (repeats included) with uniqueness checked locally, enums limited to
 * visible evidence, and no enum authority from visible evidence that differs from the authoritative catalog (production fails closed).
 */
const evidence = (ref: string, revision: number, from: string, to: string) => ({ ref, revision, evidence_version: 2, evidence_type: "movement", subject_character_id: "subject", owner_character_id: "subject", world_minute: revision, event_id: ref, payload: { from, to } }) as unknown as StructuredEvidence;
const snapshot = { households: [], premium_characters: [] } as unknown as Parameters<typeof reflectionContext>[2];
const context = (visible: readonly StructuredEvidence[], catalog: readonly StructuredEvidence[]) => reflectionContext({ character: { id: "subject" }, evidence: visible } as Parameters<typeof reflectionContext>[0], catalog, snapshot);
const trajectory = (refs: string[], locations: string[]) => ({ subject_character_id: "subject", evidence_refs: refs, confidence: "high", claim: { type: "movement_trajectory", locations, transition_count: locations.length - 1 } });

test("reflection wire: repeated movement endpoints stay expressible; uniqueness is checked locally, not on the wire", () => {
  const catalog = [evidence("move:1", 1, "a", "b"), evidence("move:2", 2, "b", "a")], wire = reflectionWire(context(catalog, catalog));
  const p = trajectory(["move:1", "move:2"], ["a", "b", "a"]);
  assert.equal(validateReflectionClaim(p, context(catalog, catalog)).accepted, true);
  assert.equal(schemaMatches(wire.schema, { proposals: [p] }), true);
  assert.equal(schemaMatches(wire.schema, { proposals: [{ ...p, evidence_refs: ["foreign:ref"] }] }), false);
  const duplicate = { proposals: [{ ...p, evidence_refs: ["move:1", "move:1"] }] };
  assert.equal(schemaMatches(wire.schema, duplicate), true); assert.equal(schemaMatches(BASE_PROPOSAL_SCHEMA, duplicate), false);
  assert.deepEqual(wire, reflectionWire(context(catalog, catalog)));
});

test("reflection wire: location enums come from visible movement only", () => {
  const catalog = [evidence("move:1", 1, "a", "b"), evidence("move:2", 2, "b", "c")];
  assert.deepEqual(reflectionWire(context([catalog[0]!], catalog)).domains.locations, ["a", "b"]);
});

test("reflection wire: altered visible evidence supplies no enum authority and no accepted claim", () => {
  const catalog = [evidence("move:1", 1, "a", "b")], altered = { ...catalog[0]!, payload: { from: "invented", to: "b" } } as StructuredEvidence;
  const ctx = context([altered], catalog), wire = reflectionWire(ctx);
  assert.deepEqual([wire.domains.evidence_refs, wire.domains.locations], [[], []]);
  for (const locations of [["invented", "b"], ["a", "b"]]) assert.equal(validateReflectionClaim(trajectory(["move:1"], locations), ctx).accepted, false);
});
