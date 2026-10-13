/** Evaluation only. Request/catalog identity must be captured before deriving domains. */
import {reflectionWireSchema} from './reflection-wire.js';
import {statementProvenance} from './reflection-v22.js';
import type {StructuredEvidence} from './reflection-v2.js';
export function requestScopedReflectionWire(request:{character:{id:string};evidence:readonly StructuredEvidence[]},catalog:readonly StructuredEvidence[]) {
 const subject=request.character.id;
 // Every visible entry must be an exact authoritative entry. Hidden authority is
 // retained for local semantic validation, but never exposed as an enum value.
 if(request.evidence.some(e=>!catalog.some(a=>JSON.stringify(a)===JSON.stringify(e))))throw new Error('Visible/authoritative evidence mismatch');
 const visible=request.evidence;
 const sorted=(values:readonly unknown[])=>[...new Set(values.filter((v):v is string=>typeof v==='string'&&v.length>=1&&v.length<=160))].sort();
 const domains={evidence_refs:sorted(visible.filter(e=>e.subject_character_id===subject).map(e=>e.ref)),statement_refs:sorted(statementProvenance(catalog,subject).filter(l=>visible.some(e=>e.ref===l.statement_ref)).map(e=>e.statement_ref)),locations:sorted(visible.filter(e=>e.subject_character_id===subject&&e.owner_character_id===subject&&e.evidence_type==='movement').flatMap(e=>[e.payload.from,e.payload.to]))};
 if(domains.statement_refs.includes('N/A'))throw new Error('Invalid authoritative statement handle');
 const schema=reflectionWireSchema('WIRE_ALIBABA_V1'),proposal=schema.properties!.proposals!.items!;
 proposal.properties!.evidence_refs!.items!.enum=domains.evidence_refs;
 const claim=proposal.properties!.claim!;
 // Empty domains make these families impossible under V2.3. Remove impossible branches
 // instead of submitting empty enum arrays, whose provider syntax support is unknown.
 claim.anyOf=claim.anyOf!.filter(branch=>{
  const type=branch.properties!.type!.const;
  if(type==='self_statement_synthesis') {
   if(domains.statement_refs.length<2)return false;
   branch.properties!.statement_refs!.items!.enum=domains.statement_refs;
  }
  if(type==='movement_trajectory') {
   if(domains.locations.length===0)return false;
   branch.properties!.locations!.items!.enum=domains.locations;
  }
  return true;
 });
 if(domains.evidence_refs.length===0)throw new Error('No visible authoritative evidence handles');
 return {version:'WIRE_ALIBABA_V2' as const,schema,domains};
}
