// Production promotion of the frozen dev candidate; import paths only differ.
/** Evaluation-only wire syntax projections. The unchanged V2.3 canonical structure is always checked locally. */
import {V2_SCHEMA} from './reflection-v23.js';
import {schemaMatches} from './reflection-v2.js';
type Schema=typeof V2_SCHEMA;
export type ReflectionWireProfile='CANONICAL'|'WIRE_DEEPINFRA_V1'|'WIRE_ALIBABA_V1';
function withoutUnique<T>(value:T):T {
 if(Array.isArray(value))return value.map(v=>withoutUnique(v)) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='uniqueItems').map(([k,v])=>[k,withoutUnique(v)])) as T;
 return value;
}
/** Only uniqueItems is omitted; closed objects, branches, enum/const, required and bounds remain identical. */
export function reflectionWireSchema(profile:ReflectionWireProfile):Schema {return profile==='CANONICAL'?structuredClone(V2_SCHEMA):withoutUnique(V2_SCHEMA);}
export interface ReflectionWireResult {readonly parse_valid:boolean;readonly wire_valid:boolean;readonly canonical_valid:boolean;readonly usable:boolean;readonly value?:unknown;readonly failure?:'empty_output'|'malformed_envelope'|'wire_schema_invalid'|'canonical_schema_invalid'}
export function validateReflectionWire(text:string,wire:Schema):ReflectionWireResult {
 if(!text.trim())return {parse_valid:false,wire_valid:false,canonical_valid:false,usable:false,failure:'empty_output'};
 let value:unknown;try{value=JSON.parse(text);}catch{return {parse_valid:false,wire_valid:false,canonical_valid:false,usable:false,failure:'malformed_envelope'};}
 const wire_valid=schemaMatches(wire,value),canonical_valid=schemaMatches(V2_SCHEMA,value);
 return {parse_valid:true,wire_valid,canonical_valid,usable:wire_valid&&canonical_valid,value,...(!wire_valid?{failure:'wire_schema_invalid' as const}:!canonical_valid?{failure:'canonical_schema_invalid' as const}:{})};
}
