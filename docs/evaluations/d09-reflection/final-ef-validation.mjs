/** E1 strict pre-semantic pipeline. No semantic validator is called here. */
import {E1_SCHEMA} from '../../../.build/src/dev/reflection-v23-cvc-e1.js';
import {schemaMatches} from '../../../.build/src/dev/reflection-v2.js';
import {citationVisibilityViolations} from '../../../.build/src/dev/reflection-v23-cvc.js';
import {violations} from './reliability-v3-forensics.mjs';
export function completionValidation(text,schema,context){
 let value;try{value=JSON.parse(text);}catch{return {structural:{parse_valid:false,wire_valid:false,canonical_valid:false,usable:false},wire_failures:[],canonical_failures:[],visibility_failures:[],enum_violations:[],usable:false};}
 const wire_valid=schemaMatches(schema,value),canonical_valid=schemaMatches(E1_SCHEMA,value),wire=violations(schema,value),canonical=violations(E1_SCHEMA,value);
 const visibility=canonical_valid?value.proposals.flatMap((p,i)=>{
  const v=citationVisibilityViolations(p,context);
  if(p.claim.type==='environmental_shared_rule_text'&&(!context.evidence_refs.includes(p.claim.anchor_ref)||!p.evidence_refs.includes(p.claim.anchor_ref)))v.push({path:'$.claim.anchor_ref',value:p.claim.anchor_ref,reason:'anchor_not_visible_or_cited'});
  return v.map(v=>({...v,path:v.path.replace('$',`$.proposals[${i}]`)}));
 }):[];
 const usable=wire_valid&&canonical_valid&&visibility.length===0;
 return {structural:{parse_valid:true,wire_valid,canonical_valid,usable,value},wire_failures:wire,canonical_failures:canonical,visibility_failures:visibility,enum_violations:wire.filter(v=>v.category==='wrong_enum').map(v=>({...v,enum_domain_size:v.expected.length,outside_enum:true})),usable};
}
