/** Evaluation-only provenance successor. No production reflection imports this module. */
import { V2_SCHEMA, V2_SYSTEM, schemaMatches, renderStructuredClaim, structuredReflectionEvidence, type StructuredEvidence, type StructuredProposal } from "./reflection-v2.js";
import type {CampaignSnapshot} from "../campaign/types.js";
import type {DeepReadonly} from "../types/readonly.js";
import type {WorldStore} from "../world/world-store.js";
import { V21_REASON_CODES, validateStructuredClaimV21, type V21Diagnostic } from "./reflection-v21.js";
import { INSTRUCTION_LIKE } from "../turn/reflection.js";
export { V2_SCHEMA, V2_SYSTEM };
export const EVIDENCE_VERSION = 2, PROVENANCE_MODEL_VERSION = 1;
export const V22_REASON_CODES = [...V21_REASON_CODES, "invalid_statement_provenance"] as const;
export interface StatementProvenance { readonly statement_ref: string; readonly statement_id: string; readonly origin_revision: number; readonly field: string; readonly source_event_ref: string | null }
export interface ProvenanceEvidence extends StructuredEvidence {readonly provenance?:StatementProvenance}
/** Candidate catalog exposes identical quote/event identity; persisted production state is never rewritten. */
export function structuredReflectionEvidenceV22(world:WorldStore,snapshot:DeepReadonly<CampaignSnapshot>,subject:string){const evidence=structuredReflectionEvidence(world,snapshot,subject),links=statementProvenance(evidence.structured,subject);return {...evidence,structured:evidence.structured.map((e):ProvenanceEvidence=>{const provenance=links.find(l=>l.statement_ref===e.ref||l.source_event_ref===e.ref);return provenance?{...e,provenance}:e;})};}
/** Identity comes from authoritative contract revision/field, never quote similarity. Ambiguous identities have no link. */
export function statementProvenance(catalog: readonly StructuredEvidence[], subject: string): readonly StatementProvenance[] {
 const statements=catalog.filter(e=>e.evidence_type==="self_statement"&&e.subject_character_id===subject&&e.owner_character_id===subject);
 return statements.flatMap(e=>{
  const field=e.payload.field,revision=e.revision;
  if(typeof field!=="string"||!Number.isSafeInteger(revision)||revision===null||e.payload.revision!==revision||e.event_id!==`statement:${subject}:${revision}:${field}`||typeof e.payload.quote!=="string"||!e.payload.quote.trim())return [];
  if(statements.filter(s=>s.event_id===e.event_id).length!==1||catalog.filter(s=>s.ref===e.ref).length!==1)return [];
  const events=catalog.filter(s=>s.evidence_type==="statement_event"&&s.subject_character_id===subject&&s.owner_character_id===subject&&s.revision===revision&&s.payload.revision===revision&&s.payload.field===field&&s.payload.kind==="contract_established"&&s.event_id===s.ref);
  return [{statement_ref:e.ref,statement_id:e.event_id,origin_revision:revision,field,source_event_ref:events.length===1?events[0]!.ref:null}];
 });
}
export function validateStructuredClaimV22(raw: unknown,catalog: readonly StructuredEvidence[],subject: string): V21Diagnostic {
 const p=raw as StructuredProposal|null;
 if(!p||!schemaMatches(V2_SCHEMA.properties!.proposals!.items!,raw)||p.claim.type!=="self_statement_synthesis")return validateStructuredClaimV21(raw,catalog,subject);
 // Outer identity checks still execute before adding any proven equivalent quote handle.
 if(p.subject_character_id!==subject||p.evidence_refs.some(ref=>catalog.filter(e=>e.ref===ref&&e.subject_character_id===subject).length!==1))return validateStructuredClaimV21(raw,catalog,subject);
 const links=statementProvenance(catalog,subject),selected=p.claim.statement_refs as string[];
 const resolved=selected.map(ref=>links.find(l=>l.statement_ref===ref));
 const valid=resolved.every(l=>l&&(p.evidence_refs.includes(l.statement_ref)||l.source_event_ref!==null&&p.evidence_refs.includes(l.source_event_ref)));
 if(!valid){const d=validateStructuredClaimV21(raw,catalog,subject);return {...d,accepted:false,entitlement_validation:[...d.entitlement_validation,"invalid_statement_provenance"],reasons:[...new Set([...d.reasons,"invalid_statement_provenance"])]};}
 // Equivalent events authorize access to the selected quotes; they never become an independent second statement.
 const d=validateStructuredClaimV21({...p,evidence_refs:[...new Set([...p.evidence_refs,...selected])]},catalog,subject);
 return {...d,proposal:raw,evidence_roles:d.evidence_roles.map(r=>resolved.some(l=>l?.source_event_ref===r.ref)?{...r,role:"SUPPORTING",reason:"Exact subject/revision/field provenance link to selected authoritative statement; not an additional independent statement."}:r)};
}
export function evaluateStructuredOutputV22(raw: readonly unknown[],catalog: readonly StructuredEvidence[],subject: string,names: ReadonlyMap<string,string>){
 const diagnostics: V21Diagnostic[]=[],accepted: {format_version:2;proposal:StructuredProposal;text:string}[]=[];
 for(const proposal of raw){let d=validateStructuredClaimV22(proposal,catalog,subject);
  if(d.accepted){const p=proposal as StructuredProposal,text=renderStructuredClaim(p,catalog,names),reason=accepted.some(n=>JSON.stringify(n.proposal.claim)===JSON.stringify(p.claim))?"duplicate_claim":text.length>400?"rendering_limit":INSTRUCTION_LIKE.test(text)?"unsafe_statement":undefined;
   if(reason)d={...d,accepted:false,reasons:[reason],entitlement_validation:[reason]};else accepted.push({format_version:2,proposal:structuredClone(p),text});}
  diagnostics.push(d);
 }return {diagnostics,accepted};
}
