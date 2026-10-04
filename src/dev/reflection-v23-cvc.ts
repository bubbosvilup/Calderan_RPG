/** Evaluation-only V2.3-CVC. Visibility gates model references; full authority stays intact. */
import {isDeepStrictEqual} from 'node:util';
import type {StructuredEvidence} from './reflection-v2.js';
import {statementProvenance,type ProvenanceEvidence} from './reflection-v22.js';
import {validateStructuredClaimV23,evaluateStructuredOutputV23,type V23Diagnostic} from './reflection-v23.js';
export interface CitationRequest {readonly character:{readonly id:string};readonly evidence:readonly StructuredEvidence[]}
export interface CitationContext {
 readonly request:CitationRequest;
 readonly catalog:readonly StructuredEvidence[];
 readonly evidence_refs:readonly string[];
 readonly statement_refs:readonly string[];
 readonly hidden_authority_refs:readonly string[];
 readonly resolutions:readonly {readonly event_ref:string;readonly statement_ref:string;readonly exposure:'provenance'|'authoritative_statement'}[];
}
const equal=(a:unknown,b:unknown)=>isDeepStrictEqual(a,b);
/** Recognize only existing typed selectors, never strings found by searching arbitrary text. */
export function reflectionCitationContext(request:CitationRequest,catalog:readonly StructuredEvidence[]):CitationContext {
 const subject=request.character.id,links=statementProvenance(catalog,subject);
 const visible=request.evidence;
 const roots=visible.filter(e=>e.subject_character_id===subject&&catalog.filter(a=>a.ref===e.ref).length===1&&catalog.some(a=>a.ref===e.ref&&a.subject_character_id===subject&&a.evidence_type===e.evidence_type&&a.owner_character_id===e.owner_character_id&&a.revision===e.revision&&a.event_id===e.event_id&&Object.entries(a.payload).every(([k,v])=>equal(e.payload[k],v))));
 const statements=new Set(roots.filter(e=>e.evidence_type==='self_statement'&&links.some(l=>l.statement_ref===e.ref)).map(e=>e.ref));
 const resolutions:CitationContext['resolutions'][number][]=[];
 for(const e of roots.filter(e=>e.evidence_type==='statement_event')) {
  const link=links.find(l=>l.source_event_ref===e.ref);if(!link)continue;
  const provenance=(e as ProvenanceEvidence).provenance;
  const exposed=e.payload.authoritative_statement as Record<string,unknown>|undefined;
  const quote=catalog.find(a=>a.ref===link.statement_ref)!;
  const exactProvenance=provenance&&equal(provenance,link);
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
export function validateStructuredClaimV23CVC(raw:unknown,context:CitationContext):V23Diagnostic {
 const baseline=validateStructuredClaimV23(raw,context.catalog,context.request.character.id),violations=citationVisibilityViolations(raw,context);
 if(!violations.length)return baseline;
 const reasons=[...new Set(violations.map(v=>v.reason))];
 return {...baseline,accepted:false,reasons:[...new Set([...baseline.reasons,...reasons])],entitlement_validation:[...new Set([...baseline.entitlement_validation,...reasons])]};
}
/** Preserve original batch duplicate/rendering checks, proposal objects and hidden authority. */
export function evaluateStructuredOutputV23CVC(raw:readonly unknown[],context:CitationContext,names:ReadonlyMap<string,string>) {
 const result=evaluateStructuredOutputV23(raw,context.catalog,context.request.character.id,names);
 const diagnostics=result.diagnostics.map((d,i)=>{const cvc=validateStructuredClaimV23CVC(raw[i],context);return cvc.accepted?d:{...d,accepted:false,reasons:[...new Set([...d.reasons,...cvc.reasons])],entitlement_validation:[...new Set([...d.entitlement_validation,...cvc.entitlement_validation])]};});
 return {diagnostics,accepted:result.accepted.filter(n=>!citationVisibilityViolations(n.proposal,context).length)};
}
