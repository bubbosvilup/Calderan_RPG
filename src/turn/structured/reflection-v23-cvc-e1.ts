// Production promotion of the frozen dev candidate; import paths only differ.
/** Evaluation-only E1: exact shared authored rule text. Frozen V2.3-CVC stays intact. */
import type {CampaignSnapshot} from '../../campaign/types.js';
import type {DeepReadonly} from '../../types/readonly.js';
import type {WorldStore} from '../../world/world-store.js';
import {V2_SCHEMA,V2_SYSTEM,schemaMatches,type StructuredEvidence,type StructuredProposal} from './reflection-v2.js';
import {structuredReflectionEvidenceV22} from './reflection-v22.js';
import {reflectionCitationContext,citationVisibilityViolations,validateStructuredClaimV23CVC,evaluateStructuredOutputV23CVC,type CitationContext,type CitationRequest} from './reflection-v23-cvc.js';
import {citationScopedReflectionWire} from './reflection-wire-v2-cvc.js';
import type {V23Diagnostic} from './reflection-v23.js';
import {INSTRUCTION_LIKE} from '../reflection.js';

export const E1_VERSION='V2.3-CVC-E1';
const text={type:'string',minLength:1,maxLength:160};
export const E1_CLAIM_SCHEMA={type:'object',additionalProperties:false,required:['type','household_id','relation','anchor_ref','segment_index','occurrence_count'],properties:{type:{const:'environmental_shared_rule_text'},household_id:{...text},relation:{const:'shared_exact_segment'},anchor_ref:{...text},segment_index:{type:'integer',minimum:0,maximum:7},occurrence_count:{type:'integer',minimum:2,maximum:8}}};
export const E1_SCHEMA=structuredClone(V2_SCHEMA);
E1_SCHEMA.properties!.proposals!.items!.properties!.claim!.anyOf!.push(E1_CLAIM_SCHEMA);
export const E1_SYSTEM=V2_SYSTEM+' E1 additionally permits environmental_shared_rule_text: cite at least two distinct household rule additions at different revisions that contain the same exact semicolon-delimited text segment. Select anchor_ref from the cited rule events and segment_index (zero-based after splitting exact rule_text on semicolons and trimming segment boundaries). The segment must have 12–100 characters. Cite every matching rule addition within the selected revision interval. This is shared recorded wording only, never an inferred topic, activity, progression, causation, frequency, current active policy or NPC trait. Prefer substantive shared operational wording over generic boilerplate; exact overlap alone does not establish usefulness.';
export interface E1Context {readonly citation:CitationContext;readonly snapshot:DeepReadonly<CampaignSnapshot>}
export function environmentalE1Context(request:CitationRequest,catalog:readonly StructuredEvidence[],snapshot:DeepReadonly<CampaignSnapshot>):E1Context{return {citation:reflectionCitationContext(request,catalog),snapshot:structuredClone(snapshot)};}
/** Exact immutable rule identity/text joined from authoritative state; no categories authored here. */
export function structuredReflectionEvidenceE1(world:WorldStore,snapshot:DeepReadonly<CampaignSnapshot>,subject:string){
 const base=structuredReflectionEvidenceV22(world,snapshot,subject);
 return {...base,structured:base.structured.map(e=>{if(e.evidence_type!=='household_context')return e;const rule=snapshot.households.find(h=>h.id===e.payload.household_id)?.rules?.find(r=>r.id===e.payload.rule_id);return rule&&rule.created_revision===e.revision?{...e,payload:{...e.payload,rule_text:rule.text}}:e;})};
}
/** Boundary trimming only: no case folding, token similarity, stemming or semantic extraction. */
export function exactRuleSegments(value:unknown):readonly string[]{return typeof value==='string'?value.split(';').map(v=>v.trim()):[];}
function authoritativeRule(e:StructuredEvidence,context:E1Context):boolean {
 const subject=context.citation.request.character.id,households=context.snapshot.households.filter(h=>h.id===e.payload.household_id),rules=households[0]?.rules?.filter(r=>r.id===e.payload.rule_id)??[];
 const premium=context.snapshot.premium_characters.filter(p=>p.character_id===subject),history=premium[0]?.dynamic.recent_developments??[],events=history.filter((v,i)=>`npcmem:${subject}:history:r${v.revision}.${history.slice(0,i).filter(x=>x.revision===v.revision).length}`===e.ref);
 const exactEvent=premium.length===1&&events.length===1&&events[0]!.world_minute===e.world_minute&&Object.entries(events[0]!).every(([k,v])=>e.payload[k]===v);
 return exactEvent&&households.length===1&&rules.length===1&&e.subject_character_id===subject&&e.owner_character_id===null&&e.evidence_type==='household_context'&&e.payload.kind==='household_rule_added'&&e.event_id===e.ref&&Number.isSafeInteger(e.revision)&&e.revision!==null&&e.payload.revision===e.revision&&e.revision<=context.snapshot.revision&&rules[0]!.created_revision===e.revision&&rules[0]!.text===e.payload.rule_text;
}
export function validateStructuredClaimE1(raw:unknown,context:E1Context):V23Diagnostic {
 const p=raw as StructuredProposal|null;
 if(p?.claim?.type!=='environmental_shared_rule_text')return validateStructuredClaimV23CVC(raw,context.citation);
 const reasons:string[]=[],es:StructuredEvidence[]=[];
 const reject=(reason:string)=>{reasons.push(reason);};
 if(!schemaMatches(E1_SCHEMA.properties!.proposals!.items!,raw))reject('invalid_claim_shape');
 if(!reasons.length){
  if(p.subject_character_id!==context.citation.request.character.id)reject('claim_subject_mismatch');
  for(const ref of p.evidence_refs){const matches=context.citation.catalog.filter(e=>e.ref===ref);if(matches.length!==1)reject('unknown_or_ambiguous_evidence');else es.push(matches[0]!);}
  if(citationVisibilityViolations(p,context.citation).length)reject('citation_not_visible');
  const cl=p.claim,anchor=es.find(e=>e.ref===cl.anchor_ref),segment=exactRuleSegments(anchor?.payload.rule_text)[Number(cl.segment_index)];
  if(!anchor||!context.citation.evidence_refs.includes(String(cl.anchor_ref)))reject('invalid_environmental_anchor');
  if(!segment||segment.length<12||segment.length>100)reject('unsupported_environmental_segment');
  if(es.length<2||es.some(e=>!authoritativeRule(e,context)||e.payload.household_id!==cl.household_id))reject('invalid_environmental_authority');
  if(new Set(es.map(e=>e.payload.rule_id)).size!==es.length||new Set(es.map(e=>e.revision)).size<2)reject('missing_independent_environmental_sources');
  if(cl.occurrence_count!==es.length)reject('claim_count_mismatch');
  if(segment&&es.some(e=>!exactRuleSegments(e.payload.rule_text).includes(segment)))reject('environmental_text_mismatch');
  const min=Math.min(...es.map(e=>e.revision??Infinity)),max=Math.max(...es.map(e=>e.revision??-Infinity));
  if(segment&&context.citation.catalog.some(e=>authoritativeRule(e,context)&&e.payload.household_id===cl.household_id&&e.revision!>=min&&e.revision!<=max&&exactRuleSegments(e.payload.rule_text).includes(segment)&&!p.evidence_refs.includes(e.ref)))reject('environmental_interval_not_closed');
  if(segment&&context.snapshot.households.find(h=>h.id===cl.household_id)?.rules?.some(r=>r.created_revision>=min&&r.created_revision<=max&&exactRuleSegments(r.text).includes(segment)&&!es.some(e=>e.payload.rule_id===r.id)))reject('environmental_interval_not_closed');
 }
 const result:V23Diagnostic={proposal:raw,evidence_used:es,factual_validation:[],entitlement_validation:[...new Set(reasons)],reasons:[...new Set(reasons)],accepted:reasons.length===0,evidence_roles:es.map(e=>({ref:e.ref,role:'SUPPORTING',reason:'Exact state-verified rule addition containing the selected literal segment.'})),scope:es.length?{type:'environmental_events',start_revision:Math.min(...es.map(e=>e.revision??0)),end_revision:Math.max(...es.map(e=>e.revision??0))}:null};
 if(result.accepted){const rendered=renderEnvironmentalE1(p,context),reason=rendered.length>400?'rendering_limit':INSTRUCTION_LIKE.test(rendered)?'unsafe_statement':undefined;if(reason)return {...result,accepted:false,reasons:[reason],entitlement_validation:[reason]};}
 return result;
}
export function renderEnvironmentalE1(p:StructuredProposal,context:E1Context):string {
 const anchor=context.citation.catalog.find(e=>e.ref===p.claim.anchor_ref),segment=exactRuleSegments(anchor?.payload.rule_text)[Number(p.claim.segment_index)]??'',revisions=context.citation.catalog.filter(e=>p.evidence_refs.includes(e.ref)).map(e=>e.revision??0);
 return `Household rules added at revisions ${Math.min(...revisions)}–${Math.max(...revisions)} share this exact recorded text: “${segment}”.`;
}
/** Existing families delegate unchanged; batch ordering/duplicate checks apply across both versions. */
export function evaluateStructuredOutputE1(raw:readonly unknown[],context:E1Context,names:ReadonlyMap<string,string>){
 const diagnostics:V23Diagnostic[]=[],accepted:{format_version:2;proposal:StructuredProposal;text:string}[]=[];
 for(const proposal of raw){const p=proposal as StructuredProposal|null;let d:V23Diagnostic;let rendered='';
  if(p?.claim?.type==='environmental_shared_rule_text'){d=validateStructuredClaimE1(proposal,context);if(d.accepted)rendered=renderEnvironmentalE1(p,context);}
  else {const old=evaluateStructuredOutputV23CVC([proposal],context.citation,names);d=old.diagnostics[0]!;if(d.accepted)rendered=old.accepted[0]!.text;}
  if(d.accepted){if(accepted.some(n=>JSON.stringify(n.proposal.claim)===JSON.stringify(p!.claim)))d={...d,accepted:false,reasons:['duplicate_claim'],entitlement_validation:['duplicate_claim']};else accepted.push({format_version:2,proposal:structuredClone(p!),text:rendered});}diagnostics.push(d);
 }return {diagnostics,accepted};
}
export function citationScopedReflectionWireE1(context:E1Context){
 const old=citationScopedReflectionWire(context.citation),schema=structuredClone(old.schema),anchors=context.citation.catalog.filter(e=>context.citation.evidence_refs.includes(e.ref)&&authoritativeRule(e,context)&&typeof e.payload.rule_text==='string').map(e=>e.ref).sort();
 if(anchors.length>=2){const branch=structuredClone(E1_CLAIM_SCHEMA);Object.assign(branch.properties.anchor_ref,{enum:anchors});schema.properties!.proposals!.items!.properties!.claim!.anyOf!.push(branch);}
 return {version:'WIRE_ALIBABA_V2_CVC_E1_LOCAL',schema,domains:{...old.domains,environmental_anchors:anchors}};
}
