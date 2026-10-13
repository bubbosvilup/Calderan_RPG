/**
 * Reflection claim validation: one authoritative path (Cleanup C). A proposal passes cumulative stages, each owning one rule family:
 *   validateClaimFacts          exact claim facts and entitlement against cited evidence (formerly V2)
 *   validateEvidenceRoles       support / context / contradiction roles of every cited ref (formerly V2.1)
 *   validateStatementProvenance quote access through exact statement provenance links (formerly V2.2)
 *   validateRelationshipAuthority current directional snapshot authority for contrasts (formerly V2.3)
 *   validateCitationVisibility  only refs the request made visible may be cited (formerly V2.3-CVC)
 *   validateReflectionClaim     the environmental shared-rule-text claim, else the stages above (formerly E1); the entry point
 * Behavior is pinned against the frozen oracle copies in tests/frozen/reflection/ (tests/reflection/reflection-oracle-equivalence.test.ts).
 */
import { isDeepStrictEqual } from 'node:util';
import type { CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import { INSTRUCTION_LIKE } from "../optional/reflection.js";
import { statementProvenance, type ProvenanceEvidence, type StructuredEvidence } from "./reflection-evidence.js";
import { CLAIM_SCHEMAS, BASE_PROPOSAL_SCHEMA, REFLECTION_SCHEMA, schemaMatches, renderReflectionClaim, exactRuleSegments, type StructuredProposal } from "./reflection-schema.js";

// ---- claim facts (formerly V2) ----
type Payload = Record<string, unknown>;
export const REASON_CODES = ["invalid_claim_shape", "unknown_evidence", "claim_subject_mismatch", "claim_count_mismatch", "claim_direction_mismatch", "claim_episode_mismatch", "claim_state_mismatch", "claim_trajectory_mismatch", "unsupported_claim_from_evidence", "missing_positive_evidence", "environment_not_character_evidence", "missing_provenance_not_tension", "authority_restatement", "unsafe_statement", "rendering_limit", "duplicate_claim"] as const;
export type Reason = typeof REASON_CODES[number];
export interface ClaimDiagnostic { readonly proposal: unknown; readonly evidence_used: readonly StructuredEvidence[]; readonly factual_validation: readonly Reason[]; readonly entitlement_validation: readonly Reason[]; readonly reasons: readonly Reason[]; readonly accepted: boolean }
export interface CandidateNote { readonly format_version: 2; readonly proposal: StructuredProposal; readonly text: string }
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const rank = (s: unknown) => ["none", "low", "moderate", "high"].indexOf(String(s));
const ordered = (es: readonly StructuredEvidence[]) => [...es].sort((a, b) => (a.revision ?? -1) - (b.revision ?? -1) || a.ref.localeCompare(b.ref, "en", { numeric: true }));
function contiguous(es: readonly StructuredEvidence[], all: readonly StructuredEvidence[], match: (e: StructuredEvidence) => boolean): boolean {
  const first = es[0]?.revision, last = es.at(-1)?.revision;
  return first !== null && first !== undefined && last !== null && last !== undefined && all.filter(e => match(e) && e.revision !== null && e.revision >= first && e.revision <= last).every(e => es.some(c => c.ref === e.ref));
}
/** Every output key is checked, including the nested claim: no free display/psychology side channel. */
export function validateClaimFacts(raw: unknown, catalog: readonly StructuredEvidence[], subject: string): ClaimDiagnostic {
  const factual: Reason[] = [], entitlement: Reason[] = [], evidence: StructuredEvidence[] = [];
  const finish = (): ClaimDiagnostic => ({ proposal: raw, evidence_used: evidence, factual_validation: factual, entitlement_validation: entitlement, reasons: [...new Set([...factual, ...entitlement])], accepted: factual.length + entitlement.length === 0 });
  const p = raw as StructuredProposal | null;
  if (!p || typeof p !== "object" || !p.claim || typeof p.claim !== "object") { factual.push("invalid_claim_shape"); return finish(); }
  if (!Object.hasOwn(CLAIM_SCHEMAS, p.claim.type)) {
    entitlement.push(p.claim.type === "missing_provenance_tension" ? "missing_provenance_not_tension" : "unsupported_claim_from_evidence"); return finish();
  }
  if (!schemaMatches(BASE_PROPOSAL_SCHEMA.properties!.proposals!.items!, raw)) { factual.push("invalid_claim_shape"); return finish(); }
  if (p.subject_character_id !== subject) { factual.push("claim_subject_mismatch"); return finish(); }
  for (const ref of p.evidence_refs) { const e = catalog.find(e => e.ref === ref); if (!e) factual.push("unknown_evidence"); else evidence.push(e); }
  if (factual.length) return finish();
  if (evidence.some(e => e.subject_character_id !== subject)) { factual.push("claim_subject_mismatch"); return finish(); }
  const c = p.claim, es = ordered(evidence);
  const requireOnly = (match: (e: StructuredEvidence) => boolean) => {
    if (!es.length || !es.every(match)) { entitlement.push(es.some(e => e.evidence_type === "household_context") ? "environment_not_character_evidence" : "unsupported_claim_from_evidence"); return false; } return true;
  };
  const relMatch = (dimension: unknown) => (e: StructuredEvidence) => e.evidence_type === "relationship_change" && e.owner_character_id === subject && e.payload.other_id === c.target_character_id && e.payload.dimension === dimension;
  const trajectory = (rs: StructuredEvidence[]) => {
    if (rs.length < 2) entitlement.push("authority_restatement");
    if (rs.length !== c.transition_count) factual.push("claim_count_mismatch");
    if (rs[0]?.payload.from !== c.from || rs.at(-1)?.payload.to !== c.to) factual.push("claim_state_mismatch");
    if (rs.some((e, i) => i > 0 && rs[i - 1]!.payload.to !== e.payload.from)) factual.push("claim_trajectory_mismatch");
  };
  switch (c.type) {
    case "relationship_trajectory": {
      if (!requireOnly(relMatch(c.dimension))) break;
      trajectory(es);
      if (!contiguous(es, catalog, relMatch(c.dimension))) factual.push("claim_trajectory_mismatch");
      const diffs = es.map(e => rank(e.payload.to) - rank(e.payload.from));
      const direction = diffs.every(d => d > 0) ? "increase" : diffs.every(d => d < 0) ? "decrease" : "mixed";
      if (c.direction !== direction) factual.push("claim_direction_mismatch");
      break;
    }
    case "relationship_parallel": {
      if (c.dimension_a === c.dimension_b) { entitlement.push("missing_positive_evidence"); break; }
      if (!requireOnly(e => relMatch(c.dimension_a)(e) || relMatch(c.dimension_b)(e))) break;
      const a = es.filter(relMatch(c.dimension_a)), b = es.filter(relMatch(c.dimension_b)); trajectory(a); trajectory(b);
      if (!sameJson(a.map(e => [e.payload.from, e.payload.to]), b.map(e => [e.payload.from, e.payload.to])) || !contiguous(a, catalog, relMatch(c.dimension_a)) || !contiguous(b, catalog, relMatch(c.dimension_b))) factual.push("claim_trajectory_mismatch");
      break;
    }
    case "relationship_contrast": {
      if (c.dimension_a === c.dimension_b || c.state_a === "none" || c.state_b === "none") entitlement.push("missing_positive_evidence");
      const snapshots = es.filter(e => e.evidence_type === "relationship_snapshot" && e.owner_character_id === subject && e.payload.target_character_id === c.target_character_id);
      const changes = es.filter(e => relMatch(c.dimension_a)(e) || relMatch(c.dimension_b)(e));
      if (!requireOnly(e => snapshots.includes(e) || changes.includes(e))) break;
      if (snapshots.length === 1) {
        const dims = snapshots[0]!.payload.dimensions as Payload;
        if ((dims[String(c.dimension_a)] ?? "none") !== c.state_a || (dims[String(c.dimension_b)] ?? "none") !== c.state_b) factual.push("claim_state_mismatch");
        for (const e of changes) if (e.payload.to !== dims[String(e.payload.dimension)]) factual.push("claim_state_mismatch");
      } else if (!snapshots.length) {
        const a = changes.filter(relMatch(c.dimension_a)).at(-1), b = changes.filter(relMatch(c.dimension_b)).at(-1);
        if (!a || !b || a.revision !== b.revision) entitlement.push("missing_positive_evidence");
        else {
          if (a.payload.to !== c.state_a || b.payload.to !== c.state_b) factual.push("claim_state_mismatch");
          // A recorded contrast is historical at this revision, never asserted as current.
          if (catalog.some(e => (relMatch(c.dimension_a)(e) || relMatch(c.dimension_b)(e)) && (e.revision ?? 0) > (a.revision ?? 0))) factual.push("claim_state_mismatch");
        }
      } else entitlement.push("unsupported_claim_from_evidence");
      break;
    }
    case "condition_trajectory": {
      const match = (e: StructuredEvidence) => e.evidence_type === "condition_change" && e.payload.condition === c.condition_id;
      if (!requireOnly(match)) break;
      const ops = es.map(e => e.payload.kind === "condition_added" ? "add" : "remove");
      if (es.length < 2) entitlement.push("authority_restatement");
      if (!sameJson(ops, c.operations) || !contiguous(es, catalog, match) || ops.some((op, i) => i > 0 && op === ops[i - 1])) factual.push("claim_trajectory_mismatch");
      if (ops.filter(op => op === "add").length !== c.episode_count) factual.push("claim_episode_mismatch");
      break;
    }
    case "membership_trajectory": {
      const match = (e: StructuredEvidence) => e.evidence_type === "household_membership" && e.payload.household_id === c.household_id;
      if (!requireOnly(match)) break;
      const operations: Record<string, string> = { joined_household: "join", left_household: "leave", rejoined_household: "rejoin", migrated_member: "migrate" };
      const ops = es.map(e => operations[String(e.payload.kind)]);
      if (es.length < 2) entitlement.push("authority_restatement");
      if (!sameJson(ops, c.operations) || !contiguous(es, catalog, match)) factual.push("claim_trajectory_mismatch");
      if (c.join_count !== ops.filter(x => x === "join").length || c.leave_count !== ops.filter(x => x === "leave").length || c.rejoin_count !== ops.filter(x => x === "rejoin").length) factual.push("claim_count_mismatch");
      break;
    }
    case "movement_trajectory": {
      const match = (e: StructuredEvidence) => e.evidence_type === "movement" && e.owner_character_id === subject;
      if (!requireOnly(match)) break;
      if (es.length < 2) entitlement.push("authority_restatement");
      if (c.transition_count !== es.length) factual.push("claim_count_mismatch");
      if (es.some((e, i) => !e.payload.from || !e.payload.to || i > 0 && es[i - 1]!.payload.to !== e.payload.from) || !contiguous(es, catalog, match)) factual.push("claim_trajectory_mismatch");
      if (!sameJson([es[0]?.payload.from, ...es.map(e => e.payload.to)], c.locations)) factual.push("claim_state_mismatch");
      break;
    }
    case "self_statement_synthesis": {
      if (!requireOnly(e => e.evidence_type === "self_statement" && e.owner_character_id === subject)) break;
      if (!sameJson([...p.evidence_refs].sort(), [...c.statement_refs as string[]].sort())) factual.push("claim_state_mismatch");
      if (new Set(es.map(e => e.revision)).size < 2 || new Set(es.map(e => e.event_id)).size < 2) entitlement.push("missing_positive_evidence");
      if (es.some(e => typeof e.payload.quote !== "string" || String(e.payload.quote).length > 160 || INSTRUCTION_LIKE.test(String(e.payload.quote)))) entitlement.push("unsafe_statement");
      break;
    }
    case "environmental_motif": {
      if (!requireOnly(e => e.evidence_type === "household_context" && e.payload.household_id === c.household_id && e.payload.kind === "household_rule_added" && e.owner_character_id === null)) break;
      if (new Set(es.map(e => e.event_id)).size < 2) entitlement.push("missing_positive_evidence");
      if (c.occurrence_count !== es.length) factual.push("claim_count_mismatch");
      break;
    }
  }
  if (!factual.length && !entitlement.length && renderReflectionClaim(p, catalog, new Map()).length > 400) entitlement.push("rendering_limit");
  return finish();
}

// ---- evidence roles (formerly V2.1) ----
export type EvidenceRole = "SUPPORTING" | "CORROBORATING" | "CONTEXT" | "CONTRADICTORY" | "IRRELEVANT";
export interface EvidenceRoleRecord { readonly ref: string; readonly role: EvidenceRole; readonly reason: string }
export interface EvidenceRoleDiagnostic extends Omit<ClaimDiagnostic, "reasons" | "entitlement_validation"> {
  readonly reasons: readonly string[]; readonly entitlement_validation: readonly string[];
  readonly evidence_roles: readonly EvidenceRoleRecord[];
  readonly scope: { readonly type: "historical_interval" | "recorded_state" | "attributed_statements" | "environmental_events"; readonly start_revision: number | null; readonly end_revision: number | null } | null;
}
const CONTEXT_TYPES = new Set(["canon", "aggregate", "movement", "relationship_change", "relationship_snapshot", "condition_change", "household_membership", "household_context", "self_statement", "statement_event", "legal_status", "transaction"]);
/** Select supporting facts, classify extras; invoke the unchanged V2 factual/entitlement checks on support only. */
export function validateEvidenceRoles(raw: unknown, catalog: readonly StructuredEvidence[], subject: string): EvidenceRoleDiagnostic {
  const empty = (d: ClaimDiagnostic): EvidenceRoleDiagnostic => ({ ...d, evidence_roles: [], scope: null });
  const p = raw as StructuredProposal | null;
  if (!p || !p.claim || !Object.hasOwn(CLAIM_SCHEMAS, p.claim.type) || !schemaMatches(BASE_PROPOSAL_SCHEMA.properties!.proposals!.items!, raw)) return empty(validateClaimFacts(raw, catalog, subject));
  // Preserve strict identity/unknown-ref checks BEFORE filtering: never silently ignore an invalid extra.
  if (p.subject_character_id !== subject || p.evidence_refs.some(ref => !catalog.some(e => e.ref === ref)) || p.evidence_refs.some(ref => catalog.find(e => e.ref === ref)?.subject_character_id !== subject)) return empty(validateClaimFacts(raw, catalog, subject));
  const cited = ordered(p.evidence_refs.map(ref => catalog.find(e => e.ref === ref)!)), c = p.claim;
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
  const scope: EvidenceRoleDiagnostic["scope"] = { type: scopeType, start_revision: support[0]?.revision ?? null, end_revision: support.at(-1)?.revision ?? null };
  const claimedCount = c.type === "relationship_trajectory" ? Number(c.transition_count) : 0;
  const prefix = support.slice(0, claimedCount);
  const supportedPrefixWithScopeConflict = claimedCount > 0 && support.length > claimedCount && validateClaimFacts({ ...p, evidence_refs: prefix.map(e => e.ref) }, catalog, subject).accepted;
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
  else d = validateClaimFacts({ ...p, evidence_refs: support.map(e => e.ref) }, catalog, subject);
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
// ---- statement provenance (formerly V2.2) ----
export function validateStatementProvenance(raw: unknown,catalog: readonly StructuredEvidence[],subject: string): EvidenceRoleDiagnostic {
 const p=raw as StructuredProposal|null;
 if(!p||!schemaMatches(BASE_PROPOSAL_SCHEMA.properties!.proposals!.items!,raw)||p.claim.type!=="self_statement_synthesis")return validateEvidenceRoles(raw,catalog,subject);
 // Outer identity checks still execute before adding any proven equivalent quote handle.
 if(p.subject_character_id!==subject||p.evidence_refs.some(ref=>catalog.filter(e=>e.ref===ref&&e.subject_character_id===subject).length!==1))return validateEvidenceRoles(raw,catalog,subject);
 const links=statementProvenance(catalog,subject),selected=p.claim.statement_refs as string[];
 const resolved=selected.map(ref=>links.find(l=>l.statement_ref===ref));
 const valid=resolved.every(l=>l&&(p.evidence_refs.includes(l.statement_ref)||l.source_event_ref!==null&&p.evidence_refs.includes(l.source_event_ref)));
 if(!valid){const d=validateEvidenceRoles(raw,catalog,subject);return {...d,accepted:false,entitlement_validation:[...d.entitlement_validation,"invalid_statement_provenance"],reasons:[...new Set([...d.reasons,"invalid_statement_provenance"])]};}
 // Equivalent events authorize access to the selected quotes; they never become an independent second statement.
 const d=validateEvidenceRoles({...p,evidence_refs:[...new Set([...p.evidence_refs,...selected])]},catalog,subject);
 return {...d,proposal:raw,evidence_roles:d.evidence_roles.map(r=>resolved.some(l=>l?.source_event_ref===r.ref)?{...r,role:"SUPPORTING",reason:"Exact subject/revision/field provenance link to selected authoritative statement; not an additional independent statement."}:r)};
}
// ---- relationship authority (formerly V2.3) ----
export interface ReflectionClaimDiagnostic extends EvidenceRoleDiagnostic {readonly authority_ref?:string}
/** Catalog must be captured from the same authoritative validation revision as the request. */
export function validateRelationshipAuthority(raw:unknown,catalog:readonly StructuredEvidence[],subject:string):ReflectionClaimDiagnostic {
 const baseline=validateStatementProvenance(raw,catalog,subject),p=raw as StructuredProposal|null;
 if(!p||!schemaMatches(BASE_PROPOSAL_SCHEMA.properties!.proposals!.items!,raw)||p.claim.type!=='relationship_contrast')return baseline;
 const reject=(reason:string):ReflectionClaimDiagnostic=>({...baseline,accepted:false,reasons:[reason],factual_validation:reason==='claim_state_mismatch'?[reason]:[],entitlement_validation:reason==='claim_state_mismatch'?[]:[reason]});
 if(p.subject_character_id!==subject||p.evidence_refs.some(ref=>catalog.filter(e=>e.ref===ref&&e.subject_character_id===subject).length!==1))return baseline.accepted?reject('unknown_evidence'):baseline;
 const c=p.claim,cited=p.evidence_refs.map(ref=>catalog.find(e=>e.ref===ref)!);
 const snapshot=(e:StructuredEvidence)=>e.evidence_type==='relationship_snapshot'&&e.subject_character_id===subject&&e.owner_character_id===subject&&e.payload.target_character_id===c.target_character_id;
 const history=(e:StructuredEvidence)=>e.evidence_type==='relationship_change'&&e.subject_character_id===subject&&e.owner_character_id===subject&&e.payload.actor_id===subject&&e.payload.other_id===c.target_character_id&&[c.dimension_a,c.dimension_b].includes(e.payload.dimension);
 // Require provenance for both dimensions, or an explicitly cited matching directional snapshot.
 if(!cited.some(snapshot)&&![c.dimension_a,c.dimension_b].every(d=>cited.some(e=>history(e)&&e.payload.dimension===d)))return reject('missing_positive_evidence');
 const snapshots=catalog.filter(snapshot).filter(e=>e.revision!==null&&Number.isSafeInteger(e.revision));
 const revision=Math.max(...snapshots.map(e=>e.revision!)),latest=snapshots.filter(e=>e.revision===revision);
 if(latest.length!==1||catalog.filter(e=>e.ref===latest[0]!.ref).length!==1)return reject('missing_positive_evidence');
 const authority=latest[0]!,dims=authority.payload.dimensions;
 if(!dims||typeof dims!=='object'||Array.isArray(dims))return reject('missing_positive_evidence');
 const values=dims as Record<string,unknown>;
 if(c.dimension_a===c.dimension_b||c.state_a==='none'||c.state_b==='none'||!Object.hasOwn(values,String(c.dimension_a))||!Object.hasOwn(values,String(c.dimension_b)))return reject('missing_positive_evidence');
 if(values[String(c.dimension_a)]!==c.state_a||values[String(c.dimension_b)]!==c.state_b)return reject('claim_state_mismatch');
 if(cited.some(e=>snapshot(e)&&e.ref!==authority.ref)||catalog.some(e=>history(e)&&(e.revision??Infinity)>revision))return reject('contradictory_evidence');
 // Reuse all closedness/entitlement checks with verified current authority as support.
 const verified=validateStatementProvenance({...p,evidence_refs:[authority.ref]},catalog,subject);
 const irrelevant=baseline.evidence_roles.some(e=>e.role==='IRRELEVANT');
 if(irrelevant)return reject('irrelevant_evidence');
 if(cited.some(e=>history(e)&&e.revision===revision&&e.payload.to!==values[String(e.payload.dimension)]))return reject('contradictory_evidence');
 return {...verified,proposal:raw,evidence_used:cited,authority_ref:authority.ref,evidence_roles:cited.map(e=>({ref:e.ref,role:snapshot(e)||history(e)?'SUPPORTING':'CONTEXT',reason:snapshot(e)?'Cited current directional snapshot.':history(e)?'Cited same-subject/target relationship provenance; current truth verified independently.':'Known compatible context; not current-state support.'}))};
}
export function evaluateAuthorityBatch(raw:readonly unknown[],catalog:readonly StructuredEvidence[],subject:string,names:ReadonlyMap<string,string>){
 const diagnostics:ReflectionClaimDiagnostic[]=[],accepted:{format_version:2;proposal:StructuredProposal;text:string}[]=[];
 for(const proposal of raw){let d=validateRelationshipAuthority(proposal,catalog,subject);if(d.accepted){const p=proposal as StructuredProposal,text=renderReflectionClaim(p,catalog,names),reason=accepted.some(n=>JSON.stringify(n.proposal.claim)===JSON.stringify(p.claim))?'duplicate_claim':text.length>400?'rendering_limit':INSTRUCTION_LIKE.test(text)?'unsafe_statement':undefined;if(reason)d={...d,accepted:false,reasons:[reason],entitlement_validation:[reason]};else accepted.push({format_version:2,proposal:structuredClone(p),text});}diagnostics.push(d);}return {diagnostics,accepted};
}

// ---- citation visibility (formerly V2.3-CVC) ----
export interface CitationRequest {readonly character:{readonly id:string};readonly evidence:readonly StructuredEvidence[]}
export interface CitationContext {
 readonly request:CitationRequest;
 readonly catalog:readonly StructuredEvidence[];
 readonly evidence_refs:readonly string[];
 readonly statement_refs:readonly string[];
 readonly hidden_authority_refs:readonly string[];
 readonly resolutions:readonly {readonly event_ref:string;readonly statement_ref:string;readonly exposure:'provenance'|'authoritative_statement'}[];
}
const deepEqual=(a:unknown,b:unknown)=>isDeepStrictEqual(a,b);
/** Recognize only existing typed selectors, never strings found by searching arbitrary text. */
export function reflectionCitationContext(request:CitationRequest,catalog:readonly StructuredEvidence[]):CitationContext {
 const subject=request.character.id,links=statementProvenance(catalog,subject);
 const visible=request.evidence;
 const roots=visible.filter(e=>e.subject_character_id===subject&&catalog.filter(a=>a.ref===e.ref).length===1&&catalog.some(a=>a.ref===e.ref&&a.subject_character_id===subject&&a.evidence_type===e.evidence_type&&a.owner_character_id===e.owner_character_id&&a.revision===e.revision&&a.event_id===e.event_id&&Object.entries(a.payload).every(([k,v])=>deepEqual(e.payload[k],v))));
 const statements=new Set(roots.filter(e=>e.evidence_type==='self_statement'&&links.some(l=>l.statement_ref===e.ref)).map(e=>e.ref));
 const resolutions:CitationContext['resolutions'][number][]=[];
 for(const e of roots.filter(e=>e.evidence_type==='statement_event')) {
  const link=links.find(l=>l.source_event_ref===e.ref);if(!link)continue;
  const provenance=(e as ProvenanceEvidence).provenance;
  const exposed=e.payload.authoritative_statement as Record<string,unknown>|undefined;
  const quote=catalog.find(a=>a.ref===link.statement_ref)!;
  const exactProvenance=provenance&&deepEqual(provenance,link);
  const exactStatement=exposed&&exposed.statement_ref===link.statement_ref&&exposed.statement_id===link.statement_id&&exposed.origin_revision===link.origin_revision&&exposed.field===link.field&&exposed.quote===quote.payload.quote;
  if(exactProvenance||exactStatement){statements.add(link.statement_ref);resolutions.push({event_ref:e.ref,statement_ref:link.statement_ref,exposure:exactStatement?'authoritative_statement':'provenance'});}
 }
 // A quote handle exposed as a typed selector is visible even if its catalog record
 // is omitted. V2.2 already permits direct refs or its exact source event for support.
 const evidence_refs=[...new Set([...roots.map(e=>e.ref),...statements])].sort(),statement_refs=[...statements].sort();
 return {request:structuredClone(request),catalog:structuredClone(catalog),evidence_refs,statement_refs,hidden_authority_refs:catalog.filter(e=>!evidence_refs.includes(e.ref)).map(e=>e.ref).sort(),resolutions};
}
export function citationVisibilityViolations(raw:unknown,context:CitationContext) {
 if(!raw||typeof raw!=='object')return [];
 const p=raw as {evidence_refs?:unknown;claim?:{type?:unknown;statement_refs?:unknown}};
 const refs=Array.isArray(p.evidence_refs)?p.evidence_refs:[];
 const statements=p.claim?.type==='self_statement_synthesis'&&Array.isArray(p.claim.statement_refs)?p.claim.statement_refs:[];
 return [...refs.flatMap((value:unknown,i)=>typeof value==='string'&&context.evidence_refs.includes(value)?[]:[{path:`$.evidence_refs[${i}]`,value,reason:'citation_not_visible'}]),
  ...statements.flatMap((value:unknown,i)=>typeof value==='string'&&context.statement_refs.includes(value)?[]:[{path:`$.claim.statement_refs[${i}]`,value,reason:'statement_selector_not_visible'}])];
}
export function validateCitationVisibility(raw:unknown,context:CitationContext):ReflectionClaimDiagnostic {
 const baseline=validateRelationshipAuthority(raw,context.catalog,context.request.character.id),violations=citationVisibilityViolations(raw,context);
 if(!violations.length)return baseline;
 const reasons=[...new Set(violations.map(v=>v.reason))];
 return {...baseline,accepted:false,reasons:[...new Set([...baseline.reasons,...reasons])],entitlement_validation:[...new Set([...baseline.entitlement_validation,...reasons])]};
}
/** Preserve original batch duplicate/rendering checks, proposal objects and hidden authority. */
export function evaluateVisibleBatch(raw:readonly unknown[],context:CitationContext,names:ReadonlyMap<string,string>) {
 const result=evaluateAuthorityBatch(raw,context.catalog,context.request.character.id,names);
 const diagnostics=result.diagnostics.map((d,i)=>{const cvc=validateCitationVisibility(raw[i],context);return cvc.accepted?d:{...d,accepted:false,reasons:[...new Set([...d.reasons,...cvc.reasons])],entitlement_validation:[...new Set([...d.entitlement_validation,...cvc.entitlement_validation])]};});
 return {diagnostics,accepted:result.accepted.filter(n=>!citationVisibilityViolations(n.proposal,context).length)};
}

// ---- environmental shared rule text (formerly E1); the entry point ----
export interface ReflectionContext {readonly citation:CitationContext;readonly snapshot:DeepReadonly<CampaignSnapshot>}
export function reflectionContext(request:CitationRequest,catalog:readonly StructuredEvidence[],snapshot:DeepReadonly<CampaignSnapshot>):ReflectionContext{return {citation:reflectionCitationContext(request,catalog),snapshot:structuredClone(snapshot)};}
export function isAuthoritativeRuleEvidence(e:StructuredEvidence,context:ReflectionContext):boolean {
 const subject=context.citation.request.character.id,households=context.snapshot.households.filter(h=>h.id===e.payload.household_id),rules=households[0]?.rules?.filter(r=>r.id===e.payload.rule_id)??[];
 const premium=context.snapshot.premium_characters.filter(p=>p.character_id===subject),history=premium[0]?.dynamic.recent_developments??[],events=history.filter((v,i)=>`npcmem:${subject}:history:r${v.revision}.${history.slice(0,i).filter(x=>x.revision===v.revision).length}`===e.ref);
 const exactEvent=premium.length===1&&events.length===1&&events[0]!.world_minute===e.world_minute&&Object.entries(events[0]!).every(([k,v])=>e.payload[k]===v);
 return exactEvent&&households.length===1&&rules.length===1&&e.subject_character_id===subject&&e.owner_character_id===null&&e.evidence_type==='household_context'&&e.payload.kind==='household_rule_added'&&e.event_id===e.ref&&Number.isSafeInteger(e.revision)&&e.revision!==null&&e.payload.revision===e.revision&&e.revision<=context.snapshot.revision&&rules[0]!.created_revision===e.revision&&rules[0]!.text===e.payload.rule_text;
}
export function validateReflectionClaim(raw:unknown,context:ReflectionContext):ReflectionClaimDiagnostic {
 const p=raw as StructuredProposal|null;
 if(p?.claim?.type!=='environmental_shared_rule_text')return validateCitationVisibility(raw,context.citation);
 const reasons:string[]=[],es:StructuredEvidence[]=[];
 const reject=(reason:string)=>{reasons.push(reason);};
 if(!schemaMatches(REFLECTION_SCHEMA.properties!.proposals!.items!,raw))reject('invalid_claim_shape');
 if(!reasons.length){
  if(p.subject_character_id!==context.citation.request.character.id)reject('claim_subject_mismatch');
  for(const ref of p.evidence_refs){const matches=context.citation.catalog.filter(e=>e.ref===ref);if(matches.length!==1)reject('unknown_or_ambiguous_evidence');else es.push(matches[0]!);}
  if(citationVisibilityViolations(p,context.citation).length)reject('citation_not_visible');
  const cl=p.claim,anchor=es.find(e=>e.ref===cl.anchor_ref),segment=exactRuleSegments(anchor?.payload.rule_text)[Number(cl.segment_index)];
  if(!anchor||!context.citation.evidence_refs.includes(String(cl.anchor_ref)))reject('invalid_environmental_anchor');
  if(!segment||segment.length<12||segment.length>100)reject('unsupported_environmental_segment');
  if(es.length<2||es.some(e=>!isAuthoritativeRuleEvidence(e,context)||e.payload.household_id!==cl.household_id))reject('invalid_environmental_authority');
  if(new Set(es.map(e=>e.payload.rule_id)).size!==es.length||new Set(es.map(e=>e.revision)).size<2)reject('missing_independent_environmental_sources');
  if(cl.occurrence_count!==es.length)reject('claim_count_mismatch');
  if(segment&&es.some(e=>!exactRuleSegments(e.payload.rule_text).includes(segment)))reject('environmental_text_mismatch');
  const min=Math.min(...es.map(e=>e.revision??Infinity)),max=Math.max(...es.map(e=>e.revision??-Infinity));
  if(segment&&context.citation.catalog.some(e=>isAuthoritativeRuleEvidence(e,context)&&e.payload.household_id===cl.household_id&&e.revision!>=min&&e.revision!<=max&&exactRuleSegments(e.payload.rule_text).includes(segment)&&!p.evidence_refs.includes(e.ref)))reject('environmental_interval_not_closed');
  if(segment&&context.snapshot.households.find(h=>h.id===cl.household_id)?.rules?.some(r=>r.created_revision>=min&&r.created_revision<=max&&exactRuleSegments(r.text).includes(segment)&&!es.some(e=>e.payload.rule_id===r.id)))reject('environmental_interval_not_closed');
 }
 const result:ReflectionClaimDiagnostic={proposal:raw,evidence_used:es,factual_validation:[],entitlement_validation:[...new Set(reasons)],reasons:[...new Set(reasons)],accepted:reasons.length===0,evidence_roles:es.map(e=>({ref:e.ref,role:'SUPPORTING',reason:'Exact state-verified rule addition containing the selected literal segment.'})),scope:es.length?{type:'environmental_events',start_revision:Math.min(...es.map(e=>e.revision??0)),end_revision:Math.max(...es.map(e=>e.revision??0))}:null};
 if(result.accepted){const rendered=renderEnvironmentalRuleClaim(p,context),reason=rendered.length>400?'rendering_limit':INSTRUCTION_LIKE.test(rendered)?'unsafe_statement':undefined;if(reason)return {...result,accepted:false,reasons:[reason],entitlement_validation:[reason]};}
 return result;
}
export function renderEnvironmentalRuleClaim(p:StructuredProposal,context:ReflectionContext):string {
 const anchor=context.citation.catalog.find(e=>e.ref===p.claim.anchor_ref),segment=exactRuleSegments(anchor?.payload.rule_text)[Number(p.claim.segment_index)]??'',revisions=context.citation.catalog.filter(e=>p.evidence_refs.includes(e.ref)).map(e=>e.revision??0);
 return `Household rules added at revisions ${Math.min(...revisions)}–${Math.max(...revisions)} share this exact recorded text: “${segment}”.`;
}
/** Existing families delegate unchanged; batch ordering/duplicate checks apply across both versions. */
export function evaluateReflectionOutput(raw:readonly unknown[],context:ReflectionContext,names:ReadonlyMap<string,string>){
 const diagnostics:ReflectionClaimDiagnostic[]=[],accepted:{format_version:2;proposal:StructuredProposal;text:string}[]=[];
 for(const proposal of raw){const p=proposal as StructuredProposal|null;let d:ReflectionClaimDiagnostic;let rendered='';
  if(p?.claim?.type==='environmental_shared_rule_text'){d=validateReflectionClaim(proposal,context);if(d.accepted)rendered=renderEnvironmentalRuleClaim(p,context);}
  else {const old=evaluateVisibleBatch([proposal],context.citation,names);d=old.diagnostics[0]!;if(d.accepted)rendered=old.accepted[0]!.text;}
  if(d.accepted){if(accepted.some(n=>JSON.stringify(n.proposal.claim)===JSON.stringify(p!.claim)))d={...d,accepted:false,reasons:['duplicate_claim'],entitlement_validation:['duplicate_claim']};else accepted.push({format_version:2,proposal:structuredClone(p!),text:rendered});}diagnostics.push(d);
 }return {diagnostics,accepted};
}
