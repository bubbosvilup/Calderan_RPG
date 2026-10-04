/** Offline strict completion diagnostics; no repair or semantic quality review. */
import {V2_SCHEMA} from '../../../.build/src/dev/reflection-v23.js';
import {validateReflectionWire} from '../../../.build/src/dev/reflection-wire.js';
import {citationVisibilityViolations} from '../../../.build/src/dev/reflection-v23-cvc.js';
import {violations} from './reliability-v3-forensics.mjs';
export function completionValidation(text,schema,context){
 const structural=validateReflectionWire(text,schema);
 const wire=structural.parse_valid?violations(schema,structural.value):[],canonical=structural.parse_valid?violations(V2_SCHEMA,structural.value):[];
 const visibility=structural.canonical_valid?structural.value.proposals.flatMap((p,i)=>citationVisibilityViolations(p,context).map(v=>({...v,path:v.path.replace('$',`$.proposals[${i}]`)}))):[];
 const enums=wire.filter(v=>v.category==='wrong_enum').map(v=>({...v,enum_domain_size:v.expected.length,outside_enum:true}));
 return {structural,wire_failures:wire,canonical_failures:canonical,visibility_failures:visibility,enum_violations:enums,usable:structural.usable&&visibility.length===0};
}
