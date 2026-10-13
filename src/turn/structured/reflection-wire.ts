/** Reflection wire projection: the provider-facing schema with visibility-scoped enums (Cleanup C; formerly the wire, V2-CVC wire and E1 wire layers). The canonical schema is always checked locally. */
import { BASE_PROPOSAL_SCHEMA, ENVIRONMENTAL_RULE_CLAIM_SCHEMA } from "./reflection-schema.js";
import { isAuthoritativeRuleEvidence, type CitationContext, type ReflectionContext } from "./reflection-validation.js";
type Schema=typeof BASE_PROPOSAL_SCHEMA;
function withoutUnique<T>(value:T):T {
 if(Array.isArray(value))return value.map(v=>withoutUnique(v)) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='uniqueItems').map(([k,v])=>[k,withoutUnique(v)])) as T;
 return value;
}
/** Only uniqueItems is omitted; closed objects, branches, enum/const, required and bounds remain identical (the WIRE_ALIBABA_V1 profile). */
function wireSchema():Schema {return withoutUnique(BASE_PROPOSAL_SCHEMA);}
function citationScopedWire(context:CitationContext) {
 const valid=(v:unknown):v is string=>typeof v==='string'&&v.length>=1&&v.length<=160;
 const domains={evidence_refs:context.evidence_refs.filter(valid),statement_refs:context.statement_refs.filter(valid),locations:[...new Set(context.request.evidence.filter(e=>e.evidence_type==='movement'&&e.owner_character_id===context.request.character.id&&context.evidence_refs.includes(e.ref)).flatMap(e=>[e.payload.from,e.payload.to]).filter(valid))].sort()};
 const schema=wireSchema(),proposal=schema.properties!.proposals!.items!;
 proposal.properties!.evidence_refs!.items!.enum=domains.evidence_refs;
 proposal.properties!.claim!.anyOf=proposal.properties!.claim!.anyOf!.filter(branch=>{
  if(branch.properties!.type!.const==='self_statement_synthesis'){if(domains.statement_refs.length<2)return false;branch.properties!.statement_refs!.items!.enum=domains.statement_refs;}
  if(branch.properties!.type!.const==='movement_trajectory'){if(!domains.locations.length)return false;branch.properties!.locations!.items!.enum=domains.locations;}
  return true;
 });
 return {version:'WIRE_ALIBABA_V2_CVC_LOCAL' as const,schema,domains};
}

export function reflectionWire(context:ReflectionContext){
 const old=citationScopedWire(context.citation),schema=structuredClone(old.schema),anchors=context.citation.catalog.filter(e=>context.citation.evidence_refs.includes(e.ref)&&isAuthoritativeRuleEvidence(e,context)&&typeof e.payload.rule_text==='string').map(e=>e.ref).sort();
 if(anchors.length>=2){const branch=structuredClone(ENVIRONMENTAL_RULE_CLAIM_SCHEMA);Object.assign(branch.properties.anchor_ref,{enum:anchors});schema.properties!.proposals!.items!.properties!.claim!.anyOf!.push(branch);}
 return {version:'WIRE_ALIBABA_V2_CVC_E1_LOCAL',schema,domains:{...old.domains,environmental_anchors:anchors}};
}

