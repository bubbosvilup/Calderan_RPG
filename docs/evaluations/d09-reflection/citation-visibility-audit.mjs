/** Offline-only contract audit, reviewed replay and gated wire recheck. No network imports. */
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reflectionCitationContext,evaluateStructuredOutputV23CVC,validateStructuredClaimV23CVC,citationVisibilityViolations} from '../../../.build/src/dev/reflection-v23-cvc.js';
import {citationScopedReflectionWire} from '../../../.build/src/dev/reflection-wire-v2-cvc.js';
import {V2_SCHEMA,V2_SYSTEM} from '../../../.build/src/dev/reflection-v23.js';
import {schemaMatches} from '../../../.build/src/dev/reflection-v2.js';
const sha=v=>createHash('sha256').update(Buffer.isBuffer(v)||typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const dir='saves/d09-reflection-citation-visibility';mkdirSync(dir,{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),write=(name,v)=>writeFileSync(`${dir}/${name}`,JSON.stringify(v,null,2));
const preservedDirs=['saves/d09-reflection-v22','saves/d09-reflection-v22-oos','saves/d09-reflection-v23','saves/d09-reflection-v23-oos','saves/structured-reflection-wire-v2'];
const preservation=Object.fromEntries(preservedDirs.flatMap(d=>readdirSync(d).filter(n=>statSync(`${d}/${n}`).isFile()).map(n=>[`${d}/${n}`,sha(readFileSync(`${d}/${n}`))])));
const frozen=read('saves/d09-reflection-v23/candidate-freeze.json');for(const [path,hash] of Object.entries(frozen.dependencies))assert.equal(sha(readFileSync(path)),hash);
assert.equal(sha(readFileSync('src/dev/reflection-v23.ts')),'10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d');assert.equal(sha(V2_SCHEMA),'c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba');assert.equal(sha(V2_SYSTEM),'fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09');
const datasets=[{name:'V22_DEV',manifest:'saves/d09-reflection-v21/oos-manifest.json',rows:'saves/d09-reflection-v22/dev-regression.json',outputs:'saves/d09-reflection-v21/oos-outputs.jsonl'},{name:'V22_OOS_V23_DEV',manifest:'saves/d09-reflection-v22-oos/oos-manifest.json',rows:'saves/d09-reflection-v22-oos/candidate-oos-outcomes.json',outputs:'saves/d09-reflection-v22-oos/oos-outputs.json'},{name:'V23_OOS',manifest:'saves/d09-reflection-v23-oos/oos-manifest.json',rows:'saves/d09-reflection-v23-oos/candidate-oos-outcomes.json',outputs:'saves/d09-reflection-v23-oos/oos-outputs.json'}];
const audit=[],embedded=[],replays=[],unreviewed=[];
const allStrings=(x,h)=>typeof x==='string'?x===h:Array.isArray(x)?x.some(v=>allStrings(v,h)):x&&typeof x==='object'?Object.values(x).some(v=>allStrings(v,h)):false;
for(const ds of datasets){const manifest=read(ds.manifest),rows=read(ds.rows).rows,outputs=ds.outputs.endsWith('.jsonl')?readFileSync(ds.outputs,'utf8').trim().split('\n').map(JSON.parse):read(ds.outputs);
 for(const c of manifest.cases){const rs=rows.filter(r=>(r.request_id??r.id.slice(0,r.id.lastIndexOf(':')))===c.id),context=reflectionCitationContext(c.request,c.evidence_catalog),batch=evaluateStructuredOutputV23CVC(rs.map(r=>r.proposal),context,new Map(c.knownNames));
  for(const [i,r] of rs.entries()){
   const issues=citationVisibilityViolations(r.proposal,context),refs=[...r.proposal.evidence_refs,...(r.proposal.claim.statement_refs??[])],absentRoots=[...new Set(refs.filter(ref=>!c.request.evidence.some(e=>e.ref===ref)))];
   const output=outputs.find(o=>o.id===c.id);const rawMatch=output?.attempts?.some(a=>{try{return JSON.parse(a.text??JSON.parse(a.raw?.body??'{}')?.choices?.[0]?.message?.content).proposals.some(p=>sha(p)===sha(r.proposal));}catch{return false;}})??output?.parsed?.some(p=>sha(p)===sha(r.proposal));
   const record={dataset:ds.name,id:r.id,request_id:c.id,classification:r.classification,proposal:r.proposal,issues,absent_root_handles:absentRoots,unseen_handles:absentRoots.filter(ref=>!allStrings(c.request,ref)),authoritative_hidden_handles:issues.filter(v=>c.evidence_catalog.some(e=>e.ref===v.value)).map(v=>v.value),actual_provider_output:!!rawMatch,source_type:c.source_type};
   if(issues.length)audit.push(record);else if(absentRoots.length)embedded.push(record);
   replays.push({...r,dataset:ds.name,cvc_accepted:(r.envelope_valid??true)&&batch.diagnostics[i].accepted,cvc_diagnostic:batch.diagnostics[i],visibility_issues:issues});
  }
  for(const a of outputs.find(o=>o.id===c.id)?.attempts??[]){let ps;try{ps=JSON.parse(a.text??JSON.parse(a.raw?.body??'{}').choices?.[0]?.message?.content)?.proposals;}catch{}if(!Array.isArray(ps))continue;for(const [i,p] of ps.entries()){if(rows.some(r=>sha(r.proposal)===sha(p)&&(r.request_id??r.id.slice(0,r.id.lastIndexOf(':')))===c.id))continue;const issues=citationVisibilityViolations(p,context);if(issues.length)unreviewed.push({dataset:ds.name,id:c.id,n:a.n,index:i,classification:'UNREVIEWED_ATTEMPT_DIAGNOSTIC',proposal:p,issues,actual_provider_output:true});}}
 }
}
const countClasses=rows=>Object.fromEntries(['USEFUL','NEUTRAL','REDUNDANT','MISLEADING','HARMFUL'].map(k=>[k,rows.filter(r=>r.classification===k).length]));
const auditSummary={reviewed_unique_objects:replays.length,impossible_citation_objects:audit.length,classes:countClasses(audit),actual_provider_outputs:audit.filter(r=>r.actual_provider_output).length,synthetic_or_unverified:audit.filter(r=>!r.actual_provider_output).length,authoritative_hidden_objects:audit.filter(r=>r.authoritative_hidden_handles.length).length,embedded_visible_objects:embedded.length,embedded_visible_classes:countClasses(embedded),unreviewed_invalid_attempts:unreviewed.length};
write('impossible-citation-audit.json',{summary:auditSummary,rows:audit,embedded_visible:embedded,unreviewed_attempts:unreviewed});
const v23=replays.filter(r=>r.dataset==='V23_OOS'),metrics={previous_useful:v23.filter(r=>r.classification==='USEFUL'&&r.new_accepted).length,preserved:v23.filter(r=>r.classification==='USEFUL'&&r.new_accepted&&r.cvc_accepted).length,misleading_total:v23.filter(r=>r.classification==='MISLEADING').length,misleading_admitted:v23.filter(r=>r.classification==='MISLEADING'&&r.cvc_accepted).length,factual_false:v23.filter(r=>r.factual_error&&r.cvc_accepted).length,neutral_collateral:v23.filter(r=>r.classification==='NEUTRAL'&&r.new_accepted&&!r.cvc_accepted).length,stale_violations:v23.filter(r=>r.stale_state_error&&r.cvc_accepted).length};
metrics.result=metrics.previous_useful===35&&metrics.preserved===35&&metrics.misleading_total===63&&metrics.misleading_admitted===0&&metrics.factual_false===0&&metrics.neutral_collateral===0&&metrics.stale_violations===0?'PASS':'FAIL';
write('regression.json',{metrics,rows:replays});
// Separate synthetic hidden citations from actual archived outputs; prior wire evidence stays intact.
const oldSamples=read('saves/structured-reflection-wire-v2/local-samples.json'),oldPlan=read('saves/structured-reflection-wire-v2/preregistered-plan.json'),cases=[...oldPlan.screen,...oldPlan.confirmation],contexts=new Map(cases.map(c=>[c.id,reflectionCitationContext(c.request,c.evidence_catalog)]));
const excluded=oldSamples.filter(s=>!validateStructuredClaimV23CVC(s.proposal,contexts.get(s.id)).accepted);
write('synthetic-wire-citation-audit.json',{total:oldSamples.length,excluded:excluded.length,origin:'Generated offline confidence/context/provenance variants; never provider outputs; no independent review labels',rows:excluded.map(s=>({...s,issues:citationVisibilityViolations(s.proposal,contexts.get(s.id))}))});
if(metrics.result!=='PASS'){write('wire-recheck.json',{result:'NOT_RUN',reason:'Semantic development gate failed'});throw Error('Stop before wire recheck');}
const accepted=oldSamples.filter(s=>validateStructuredClaimV23CVC(s.proposal,contexts.get(s.id)).accepted),wireRows=[],falseRejections=[],negatives=[];
for(const c of cases){const context=contexts.get(c.id),w=citationScopedReflectionWire(context);assert.ok(schemaMatches(w.schema,{proposals:[]}));for(const s of accepted.filter(s=>s.id===c.id)){assert.ok(schemaMatches(V2_SCHEMA,{proposals:[s.proposal]}));if(!schemaMatches(w.schema,{proposals:[s.proposal]}))falseRejections.push(s);}
 const p=accepted.find(s=>s.id===c.id).proposal;
 for(const value of ['A prose evidence summary','npcmem:foreign:history:r999.0']){assert.equal(schemaMatches(w.schema,{proposals:[{...p,evidence_refs:[value]}]}),false);negatives.push({id:c.id,kind:'bad_evidence',value});}
 for(const claim of [{type:'self_statement_synthesis',statement_refs:['N/A','N/A']},{type:'movement_trajectory',locations:['An invented movement explanation','Another invented endpoint'],transition_count:2}]){assert.equal(schemaMatches(w.schema,{proposals:[{...p,claim}]}),false);negatives.push({id:c.id,kind:claim.type});}
 const dup={proposals:[{...p,evidence_refs:[w.domains.evidence_refs[0],w.domains.evidence_refs[0]],claim:{type:'condition_trajectory',condition_id:'test',operations:['add'],episode_count:1}}]};assert.ok(schemaMatches(w.schema,dup));assert.equal(schemaMatches(V2_SCHEMA,dup),false);negatives.push({id:c.id,kind:'canonical_evidence_uniqueness'});
 if(w.domains.statement_refs.length>=2){const dup={proposals:[{...p,claim:{type:'self_statement_synthesis',statement_refs:[w.domains.statement_refs[0],w.domains.statement_refs[0]]},evidence_refs:[w.domains.evidence_refs[0]]}]};assert.ok(schemaMatches(w.schema,dup));assert.equal(schemaMatches(V2_SCHEMA,dup),false);negatives.push({id:c.id,kind:'canonical_statement_uniqueness'});}
 wireRows.push({id:c.id,request_sha:c.request_sha,snapshot_sha:c.snapshot_sha,wire_sha:sha(w.schema),schema_bytes:Buffer.byteLength(JSON.stringify(w.schema)),domains:w.domains,schema:w.schema});
}
const wireSummary={result:falseRejections.length?'FAIL':'PASS',requests:cases.length,accepted_samples:accepted.length,excluded_by_contract:excluded.length,false_rejections:falseRejections.length,safety_negatives:negatives.length,coverage:Object.fromEntries([...new Set(accepted.map(s=>s.proposal.claim.type))].map(f=>[f,accepted.filter(s=>s.proposal.claim.type===f).length]))};
write('wire-recheck.json',{summary:wireSummary,rows:wireRows,false_rejections:falseRejections,negatives});
write('frozen-artifact-preservation.json',preservation);for(const [path,h] of Object.entries(preservation))assert.equal(sha(readFileSync(path)),h);
write('candidate-freeze.json',{candidate:'V2.3-CVC',status:metrics.result==='PASS'&&wireSummary.result==='PASS'?'LOCAL_ONLY_PASS_NOT_PROVIDER_QUALIFIED':'LOCAL_FAIL',source_sha:sha(readFileSync('src/dev/reflection-v23-cvc.ts')),wire_generator_sha:sha(readFileSync('src/dev/reflection-wire-v2-cvc.ts')),canonical_schema_sha:sha(V2_SCHEMA),prompt_sha:sha(V2_SYSTEM),v23_source_sha:sha(readFileSync('src/dev/reflection-v23.ts')),semantic:metrics.result,wire_local:wireSummary.result,physical_calls:0,production_adoption:false});
console.log(JSON.stringify({audit:auditSummary,regression:metrics,wire:wireSummary},null,2));
