import test from 'node:test';
import assert from 'node:assert/strict';
import type {StructuredEvidence} from '../src/dev/reflection-v2.js';
import {statementProvenance} from '../src/dev/reflection-v22.js';
import {validateStructuredClaimV23} from '../src/dev/reflection-v23.js';
import {reflectionCitationContext,validateStructuredClaimV23CVC,evaluateStructuredOutputV23CVC} from '../src/dev/reflection-v23-cvc.js';
import {citationScopedReflectionWire} from '../src/dev/reflection-wire-v2-cvc.js';
import {schemaMatches,V2_SCHEMA} from '../src/dev/reflection-v2.js';
const entry=(ref:string,type:string,revision:number,payload:Record<string,unknown>):StructuredEvidence=>({ref,evidence_version:2,evidence_type:type,subject_character_id:'maren',owner_character_id:'maren',revision,world_minute:revision,event_id:ref,payload});
function relationship(){
 const a=entry('trust-history','relationship_change',2,{actor_id:'maren',other_id:'brenna',dimension:'trust',from:'low',to:'moderate'}),b=entry('wariness-history','relationship_change',3,{actor_id:'maren',other_id:'brenna',dimension:'wariness',from:'moderate',to:'high'}),snapshot=entry('current','relationship_snapshot',4,{target_character_id:'brenna',dimensions:{trust:'moderate',wariness:'high'}});
 const proposal={subject_character_id:'maren',confidence:'high',evidence_refs:[a.ref,b.ref],claim:{type:'relationship_contrast',target_character_id:'brenna',dimension_a:'trust',state_a:'moderate',dimension_b:'wariness',state_b:'high'}};
 const catalog=[a,b,snapshot],request={character:{id:'maren'},evidence:[a,b]};return {a,b,snapshot,proposal,catalog,request};
}
test('CVC preserves visible histories and hidden matching current authority without exposing its handle',()=>{
 const f=relationship(),context=reflectionCitationContext(f.request,f.catalog),d=validateStructuredClaimV23CVC(f.proposal,context);
 assert.equal(d.accepted,true);assert.equal(d.authority_ref,'current');assert.deepEqual(d.proposal,f.proposal);assert.deepEqual(context.hidden_authority_refs,['current']);
 assert.equal(validateStructuredClaimV23CVC({...f.proposal,evidence_refs:['current']},context).accepted,false);
 assert.equal(validateStructuredClaimV23CVC({...f.proposal,evidence_refs:['current']},reflectionCitationContext({...f.request,evidence:f.catalog},f.catalog)).accepted,true);
 const wire=citationScopedReflectionWire(context);assert.equal(schemaMatches(wire.schema,{proposals:[f.proposal]}),true);assert.equal(wire.domains.evidence_refs.includes('current'),false);
});
test('CVC rejects hidden unrelated context and foreign hidden authority directly',()=>{
 const f=relationship(),extra={...entry('hidden-canon','canon',1,{text:'Context'}),owner_character_id:null},catalog=[...f.catalog,extra],context=reflectionCitationContext(f.request,catalog),p={...f.proposal,evidence_refs:[...f.proposal.evidence_refs,extra.ref]};
 assert.equal(validateStructuredClaimV23(p,catalog,'maren').accepted,true);assert.equal(validateStructuredClaimV23CVC(p,context).accepted,false);
 const foreign={...extra,ref:'foreign',subject_character_id:'brenna'};assert.equal(validateStructuredClaimV23CVC({...p,evidence_refs:['foreign']},reflectionCitationContext(f.request,[...catalog,foreign])).accepted,false);
});
test('CVC retains mismatch, foreign, ambiguous and stale hidden current authority checks',()=>{
 const f=relationship();for(const snapshot of [{...f.snapshot,payload:{...f.snapshot.payload,dimensions:{trust:'low',wariness:'high'}}},{...f.snapshot,owner_character_id:'brenna'},{...f.snapshot,revision:1}])assert.equal(validateStructuredClaimV23CVC(f.proposal,reflectionCitationContext(f.request,[f.a,f.b,snapshot])).accepted,false);
 assert.equal(validateStructuredClaimV23CVC(f.proposal,reflectionCitationContext(f.request,[...f.catalog,{...f.snapshot,ref:'ambiguous'}])).accepted,false);
 const stale={...f.snapshot,ref:'stale',revision:1},catalog=[...f.catalog,stale];assert.equal(validateStructuredClaimV23CVC({...f.proposal,evidence_refs:['stale']},reflectionCitationContext({...f.request,evidence:[...f.request.evidence,stale]},catalog)).accepted,false);
});
function statements(){
 const quotes=[entry('quote:1','self_statement',1,{field:'voice',revision:1,quote:'I count pots.'}),entry('quote:2','self_statement',2,{field:'voice',revision:2,quote:'I record pots.'})].map(e=>({...e,event_id:`statement:maren:${e.revision}:voice`}));
 const events=[entry('event:1','statement_event',1,{kind:'contract_established',field:'voice',revision:1}),entry('event:2','statement_event',2,{kind:'contract_established',field:'voice',revision:2})],catalog=[...quotes,...events],links=statementProvenance(catalog,'maren');
 const visible=events.map(e=>({...e,provenance:links.find(l=>l.source_event_ref===e.ref)!}));
 const p={subject_character_id:'maren',confidence:'high',evidence_refs:events.map(e=>e.ref),claim:{type:'self_statement_synthesis',statement_refs:quotes.map(e=>e.ref)}};
 return {quotes,events,catalog,visible,p};
}
test('CVC event-equivalent statements resolve exposed exact selectors to omitted quote records',()=>{
 const f=statements(),context=reflectionCitationContext({character:{id:'maren'},evidence:f.visible},f.catalog);
 assert.equal(validateStructuredClaimV23CVC(f.p,context).accepted,true);assert.equal(context.resolutions.length,2);assert.deepEqual(context.statement_refs,['quote:1','quote:2']);
 assert.equal(schemaMatches(citationScopedReflectionWire(context).schema,{proposals:[f.p]}),true);
 // Direct root citation also uses a received exact statement handle, not a guess.
 assert.equal(validateStructuredClaimV23CVC({...f.p,evidence_refs:['quote:1','quote:2']},context).accepted,true);
 const direct=reflectionCitationContext({character:{id:'maren'},evidence:f.quotes},f.catalog);assert.equal(validateStructuredClaimV23CVC({...f.p,evidence_refs:['quote:1','quote:2']},direct).accepted,true);
});
test('CVC truly unexposed quote selectors and event IDs used as statement selectors reject',()=>{
 const f=statements(),context=reflectionCitationContext({character:{id:'maren'},evidence:f.events},f.catalog);
 assert.equal(validateStructuredClaimV23(f.p,f.catalog,'maren').accepted,true);assert.equal(validateStructuredClaimV23CVC(f.p,context).accepted,false);
 assert.deepEqual(context.statement_refs,[]);assert.equal(validateStructuredClaimV23CVC({...f.p,claim:{...f.p.claim,statement_refs:['event:1','event:2']}},context).accepted,false);
});
test('CVC accepts existing authoritative_statement exposure and rejects forged/fuzzy metadata',()=>{
 const f=statements(),visible=f.events.map((e,i)=>({...e,payload:{...e.payload,authoritative_statement:{statement_ref:f.quotes[i]!.ref,statement_id:f.quotes[i]!.event_id,quote:f.quotes[i]!.payload.quote,origin_revision:e.revision,field:'voice'}}}));
 assert.equal(validateStructuredClaimV23CVC(f.p,reflectionCitationContext({character:{id:'maren'},evidence:visible},f.catalog)).accepted,true);
 const forged=f.visible.map(e=>({...e,provenance:{...e.provenance,statement_id:'wrong'},payload:{...e.payload,text:'quote:1 quote:2'}}));
 assert.deepEqual(reflectionCitationContext({character:{id:'maren'},evidence:forged},f.catalog).statement_refs,[]);
});
test('CVC batch preserves original duplicate-claim rejection and canonical uniqueness',()=>{
 const f=relationship(),context=reflectionCitationContext(f.request,f.catalog),result=evaluateStructuredOutputV23CVC([f.proposal,f.proposal],context,new Map());assert.equal(result.accepted.length,1);assert.equal(result.diagnostics[1]!.accepted,false);
 const dup={proposals:[{...f.proposal,evidence_refs:['trust-history','trust-history']}]};assert.equal(schemaMatches(citationScopedReflectionWire(context).schema,dup),true);assert.equal(schemaMatches(V2_SCHEMA,dup),false);
});
