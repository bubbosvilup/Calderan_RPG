/** Evaluation-only: current relationship contrast authority; all other claims remain V2.2. */
import {V2_SCHEMA,V2_SYSTEM,schemaMatches,renderStructuredClaim,type StructuredEvidence,type StructuredProposal} from './reflection-v2.js';
import {validateStructuredClaimV22,V22_REASON_CODES} from './reflection-v22.js';
import type {V21Diagnostic} from './reflection-v21.js';
import {INSTRUCTION_LIKE} from '../turn/reflection.js';
export {V2_SCHEMA,V2_SYSTEM};
export const EVIDENCE_VERSION=2,PROVENANCE_MODEL_VERSION=1;
export const V23_REASON_CODES=[...V22_REASON_CODES] as const;
export interface V23Diagnostic extends V21Diagnostic {readonly authority_ref?:string}
/** Catalog must be captured from the same authoritative validation revision as the request. */
export function validateStructuredClaimV23(raw:unknown,catalog:readonly StructuredEvidence[],subject:string):V23Diagnostic {
 const baseline=validateStructuredClaimV22(raw,catalog,subject),p=raw as StructuredProposal|null;
 if(!p||!schemaMatches(V2_SCHEMA.properties!.proposals!.items!,raw)||p.claim.type!=='relationship_contrast')return baseline;
 const reject=(reason:string):V23Diagnostic=>({...baseline,accepted:false,reasons:[reason],factual_validation:reason==='claim_state_mismatch'?[reason]:[],entitlement_validation:reason==='claim_state_mismatch'?[]:[reason]});
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
 const verified=validateStructuredClaimV22({...p,evidence_refs:[authority.ref]},catalog,subject);
 const irrelevant=baseline.evidence_roles.some(e=>e.role==='IRRELEVANT');
 if(irrelevant)return reject('irrelevant_evidence');
 if(cited.some(e=>history(e)&&e.revision===revision&&e.payload.to!==values[String(e.payload.dimension)]))return reject('contradictory_evidence');
 return {...verified,proposal:raw,evidence_used:cited,authority_ref:authority.ref,evidence_roles:cited.map(e=>({ref:e.ref,role:snapshot(e)||history(e)?'SUPPORTING':'CONTEXT',reason:snapshot(e)?'Cited current directional snapshot.':history(e)?'Cited same-subject/target relationship provenance; current truth verified independently.':'Known compatible context; not current-state support.'}))};
}
export function evaluateStructuredOutputV23(raw:readonly unknown[],catalog:readonly StructuredEvidence[],subject:string,names:ReadonlyMap<string,string>){
 const diagnostics:V23Diagnostic[]=[],accepted:{format_version:2;proposal:StructuredProposal;text:string}[]=[];
 for(const proposal of raw){let d=validateStructuredClaimV23(proposal,catalog,subject);if(d.accepted){const p=proposal as StructuredProposal,text=renderStructuredClaim(p,catalog,names),reason=accepted.some(n=>JSON.stringify(n.proposal.claim)===JSON.stringify(p.claim))?'duplicate_claim':text.length>400?'rendering_limit':INSTRUCTION_LIKE.test(text)?'unsafe_statement':undefined;if(reason)d={...d,accepted:false,reasons:[reason],entitlement_validation:[reason]};else accepted.push({format_version:2,proposal:structuredClone(p),text});}diagnostics.push(d);}return {diagnostics,accepted};
}
