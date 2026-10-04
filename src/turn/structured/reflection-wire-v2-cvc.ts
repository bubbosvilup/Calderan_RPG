// Production promotion of the frozen dev candidate; import paths only differ.
/** Same enum wire design, using finalized CVC visibility domains; no provider dispatch. */
import {reflectionWireSchema} from './reflection-wire.js';
import type {CitationContext} from './reflection-v23-cvc.js';
export function citationScopedReflectionWire(context:CitationContext) {
 const valid=(v:unknown):v is string=>typeof v==='string'&&v.length>=1&&v.length<=160;
 const domains={evidence_refs:context.evidence_refs.filter(valid),statement_refs:context.statement_refs.filter(valid),locations:[...new Set(context.request.evidence.filter(e=>e.evidence_type==='movement'&&e.owner_character_id===context.request.character.id&&context.evidence_refs.includes(e.ref)).flatMap(e=>[e.payload.from,e.payload.to]).filter(valid))].sort()};
 const schema=reflectionWireSchema('WIRE_ALIBABA_V1'),proposal=schema.properties!.proposals!.items!;
 proposal.properties!.evidence_refs!.items!.enum=domains.evidence_refs;
 proposal.properties!.claim!.anyOf=proposal.properties!.claim!.anyOf!.filter(branch=>{
  if(branch.properties!.type!.const==='self_statement_synthesis'){if(domains.statement_refs.length<2)return false;branch.properties!.statement_refs!.items!.enum=domains.statement_refs;}
  if(branch.properties!.type!.const==='movement_trajectory'){if(!domains.locations.length)return false;branch.properties!.locations!.items!.enum=domains.locations;}
  return true;
 });
 return {version:'WIRE_ALIBABA_V2_CVC_LOCAL' as const,schema,domains};
}
