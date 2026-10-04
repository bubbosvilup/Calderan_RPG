// Production promotion of the frozen dev candidate; import paths only differ.
/** Evaluation-only V2.1. V2 remains immutable; taxonomy, provider schema/prompt, renderer and factual checks are reused. */
import { CLAIM_SCHEMAS, V2_SCHEMA, V2_SYSTEM, EVIDENCE_VERSION, REASON_CODES, schemaMatches, validateStructuredClaim as validateV2, renderStructuredClaim, type StructuredEvidence, type StructuredProposal, type ClaimDiagnostic, type CandidateNote, type Reason } from "./reflection-v2.js";
import { INSTRUCTION_LIKE } from "../reflection.js";
export { V2_SCHEMA, V2_SYSTEM, EVIDENCE_VERSION };
export const V21_REASON_CODES = [...REASON_CODES, "contradictory_evidence", "irrelevant_evidence"] as const;
export type EvidenceRole = "SUPPORTING" | "CORROBORATING" | "CONTEXT" | "CONTRADICTORY" | "IRRELEVANT";
export interface EvidenceRoleRecord { readonly ref: string; readonly role: EvidenceRole; readonly reason: string }
export interface V21Diagnostic extends Omit<ClaimDiagnostic, "reasons" | "entitlement_validation"> {
  readonly reasons: readonly string[]; readonly entitlement_validation: readonly string[];
  readonly evidence_roles: readonly EvidenceRoleRecord[];
  readonly scope: { readonly type: "historical_interval" | "recorded_state" | "attributed_statements" | "environmental_events"; readonly start_revision: number | null; readonly end_revision: number | null } | null;
}
const sort = (es: readonly StructuredEvidence[]) => [...es].sort((a, b) => (a.revision ?? -1) - (b.revision ?? -1) || a.ref.localeCompare(b.ref, "en", { numeric: true }));
const CONTEXT_TYPES = new Set(["canon", "aggregate", "movement", "relationship_change", "relationship_snapshot", "condition_change", "household_membership", "household_context", "self_statement", "statement_event", "legal_status", "transaction"]);
/** Select supporting facts, classify extras; invoke the unchanged V2 factual/entitlement checks on support only. */
export function validateStructuredClaimV21(raw: unknown, catalog: readonly StructuredEvidence[], subject: string): V21Diagnostic {
  const empty = (d: ClaimDiagnostic): V21Diagnostic => ({ ...d, evidence_roles: [], scope: null });
  const p = raw as StructuredProposal | null;
  if (!p || !p.claim || !Object.hasOwn(CLAIM_SCHEMAS, p.claim.type) || !schemaMatches(V2_SCHEMA.properties!.proposals!.items!, raw)) return empty(validateV2(raw, catalog, subject));
  // Preserve strict identity/unknown-ref checks BEFORE filtering: never silently ignore an invalid extra.
  if (p.subject_character_id !== subject || p.evidence_refs.some(ref => !catalog.some(e => e.ref === ref)) || p.evidence_refs.some(ref => catalog.find(e => e.ref === ref)?.subject_character_id !== subject)) return empty(validateV2(raw, catalog, subject));
  const cited = sort(p.evidence_refs.map(ref => catalog.find(e => e.ref === ref)!)), c = p.claim;
  const rel = (e: StructuredEvidence, dimension: unknown) => e.evidence_type === "relationship_change" && e.owner_character_id === subject && e.payload.other_id === c.target_character_id && e.payload.dimension === dimension;
  const snapshot = (e: StructuredEvidence) => e.evidence_type === "relationship_snapshot" && e.owner_character_id === subject && e.payload.target_character_id === c.target_character_id;
  let support: StructuredEvidence[] = [];
  switch (c.type) {
    case "relationship_trajectory": support = cited.filter(e => rel(e, c.dimension)); break;
    case "relationship_parallel": support = cited.filter(e => rel(e, c.dimension_a) || rel(e, c.dimension_b)); break;
    case "relationship_contrast": {
      const snapshots = cited.filter(snapshot);
      // Snapshot owns current values; earlier historical changes are context, not current-state assertions.
      support = snapshots.length ? snapshots : cited.filter(e => rel(e, c.dimension_a) || rel(e, c.dimension_b)); break;
    }
    case "condition_trajectory": support = cited.filter(e => e.evidence_type === "condition_change" && e.payload.condition === c.condition_id); break;
    case "membership_trajectory": support = cited.filter(e => e.evidence_type === "household_membership" && e.payload.household_id === c.household_id); break;
    case "movement_trajectory": support = cited.filter(e => e.evidence_type === "movement" && e.owner_character_id === subject); break;
    case "self_statement_synthesis": support = cited.filter(e => e.evidence_type === "self_statement" && e.owner_character_id === subject && (c.statement_refs as string[]).includes(e.ref)); break;
    case "environmental_motif": support = cited.filter(e => e.evidence_type === "household_context" && e.payload.household_id === c.household_id && e.payload.kind === "household_rule_added" && e.owner_character_id === null); break;
  }
  const scopeType = c.type === "relationship_contrast" ? "recorded_state" : c.type === "self_statement_synthesis" ? "attributed_statements" : c.type === "environmental_motif" ? "environmental_events" : "historical_interval";
  const scope: V21Diagnostic["scope"] = { type: scopeType, start_revision: support[0]?.revision ?? null, end_revision: support.at(-1)?.revision ?? null };
  const claimedCount = c.type === "relationship_trajectory" ? Number(c.transition_count) : 0;
  const prefix = support.slice(0, claimedCount);
  const supportedPrefixWithScopeConflict = claimedCount > 0 && support.length > claimedCount && validateV2({ ...p, evidence_refs: prefix.map(e => e.ref) }, catalog, subject).accepted;
  const roles: EvidenceRoleRecord[] = cited.map(e => {
    if (supportedPrefixWithScopeConflict && support.indexOf(e) >= claimedCount) return { ref: e.ref, role: "CONTRADICTORY", reason: "Additional cited same-dimension event extends the included interval beyond the proven count/endpoint; never discarded as context." };
    if (support.includes(e)) return { ref: e.ref, role: "SUPPORTING", reason: "Required claim-specific authoritative fact; exact consistency checked by V2." };
    if (["relationship_trajectory", "relationship_parallel"].includes(c.type) && snapshot(e)) {
      const dims = e.payload.dimensions as Record<string, unknown>, ds = c.type === "relationship_trajectory" ? [c.dimension] : [c.dimension_a, c.dimension_b];
      const matches = ds.every(d => (dims[String(d)] ?? "none") === c.to);
      if (e.revision !== null && e.revision === scope.end_revision && !matches) return { ref: e.ref, role: "CONTRADICTORY", reason: "Snapshot at the historical endpoint disagrees with that endpoint." };
      if (e.revision !== null && scope.end_revision !== null && e.revision >= scope.end_revision && matches) return { ref: e.ref, role: "CORROBORATING", reason: "Directional snapshot independently confirms the recorded endpoint; no current-state claim added." };
      return { ref: e.ref, role: "CONTEXT", reason: "Snapshot is outside the historical endpoint; later state does not negate earlier trajectory." };
    }
    if (c.type === "relationship_contrast" && support.some(snapshot) && (rel(e, c.dimension_a) || rel(e, c.dimension_b))) {
      const expected = e.payload.dimension === c.dimension_a ? c.state_a : c.state_b;
      if (e.revision !== null && e.revision === scope.end_revision && e.payload.to !== expected) return { ref: e.ref, role: "CONTRADICTORY", reason: "Same-revision change contradicts the snapshot comparison." };
      return { ref: e.ref, role: "CONTEXT", reason: "Historical dimension change does not assert snapshot-time state." };
    }
    return { ref: e.ref, role: CONTEXT_TYPES.has(e.evidence_type) ? "CONTEXT" : "IRRELEVANT", reason: CONTEXT_TYPES.has(e.evidence_type) ? "Known authoritative same-subject context, not counted as support." : "Unknown semantic evidence class cannot be justified as contextual citation." };
  });
  let d: ClaimDiagnostic;
  if (!support.length) d = { proposal: raw, evidence_used: cited, factual_validation: [], entitlement_validation: ["missing_positive_evidence"], reasons: ["missing_positive_evidence"], accepted: false };
  else d = validateV2({ ...p, evidence_refs: support.map(e => e.ref) }, catalog, subject);
  const factual = [...d.factual_validation], entitlement: string[] = [...d.entitlement_validation];
  if (c.type === "self_statement_synthesis" && !(c.statement_refs as string[]).every(ref => support.some(e => e.ref === ref))) factual.push("claim_state_mismatch");
  if (c.type === "relationship_contrast" && support.some(snapshot)) {
    // A contrast is a recorded-state assertion, not a historical trajectory. Reject stale cited snapshots.
    if (catalog.some(e => snapshot(e) && e.revision !== null && scope.end_revision !== null && e.revision > scope.end_revision)) entitlement.push("contradictory_evidence");
  }
  if (roles.some(r => r.role === "CONTRADICTORY")) entitlement.push("contradictory_evidence");
  if (roles.some(r => r.role === "IRRELEVANT")) entitlement.push("irrelevant_evidence");
  // In-scope contradictions among SUPPORTING events are identified by V2's exact checks, never discarded as context.
  if (factual.some(r => ["claim_count_mismatch", "claim_direction_mismatch", "claim_state_mismatch", "claim_trajectory_mismatch", "claim_episode_mismatch"].includes(r))) {
    for (let i = 0; i < roles.length; i++) if (roles[i]!.role === "SUPPORTING") roles[i] = { ...roles[i]!, reason: "Selected support fails exact claim consistency; retained as support rather than ignored context." };
  }
  return { proposal: raw, evidence_used: cited, factual_validation: factual, entitlement_validation: entitlement, reasons: [...new Set([...factual, ...entitlement])], accepted: factual.length + entitlement.length === 0, evidence_roles: roles, scope };
}
/** Same renderer and duplicate/size/instruction checks as V2; only evidence-role validation differs. */
export function evaluateStructuredOutputV21(raw: readonly unknown[], catalog: readonly StructuredEvidence[], subject: string, names: ReadonlyMap<string, string>) {
  const diagnostics: V21Diagnostic[] = [], accepted: CandidateNote[] = [];
  for (const r of raw) {
    const d = validateStructuredClaimV21(r, catalog, subject);
    if (!d.accepted) { diagnostics.push(d); continue; }
    const p = r as StructuredProposal, text = renderStructuredClaim(p, catalog, names);
    const reason: Reason | undefined = accepted.some(n => JSON.stringify(n.proposal.claim) === JSON.stringify(p.claim)) ? "duplicate_claim" : text.length > 400 ? "rendering_limit" : INSTRUCTION_LIKE.test(text) ? "unsafe_statement" : undefined;
    if (reason) { diagnostics.push({ ...d, accepted: false, entitlement_validation: [reason], reasons: [reason] }); continue; }
    diagnostics.push(d); accepted.push({ format_version: 2, proposal: structuredClone(p), text });
  }
  return { accepted, diagnostics };
}
