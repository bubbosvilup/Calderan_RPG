/** Offline contextual safety gate and preregistration; no network. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {sha} from './lib.mjs';
import {requestScopedReflectionWire} from '../../../.build/src/dev/reflection-wire-v2.js';
import {V2_SCHEMA,V2_SYSTEM,validateStructuredClaimV23} from '../../../.build/src/dev/reflection-v23.js';
import {schemaMatches} from '../../../.build/src/dev/reflection-v2.js';
import {statementProvenance} from '../../../.build/src/dev/reflection-v22.js';
const dir='saves/structured-reflection-wire-v2';mkdirSync(dir,{recursive:true});
if(existsSync(`${dir}/dispatch-started.json`))throw Error('Already dispatched');
const m=JSON.parse(readFileSync('saves/d09-reflection-v23-oos/oos-manifest.json')),old=JSON.parse(readFileSync('saves/structured-reflection-reliability-v3/preregistered-plan.json')),outputs=JSON.parse(readFileSync('saves/d09-reflection-v23-oos/oos-outputs.json'));
assert.equal(sha(readFileSync('src/dev/reflection-v23.ts')),'10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d');assert.equal(sha(V2_SCHEMA),'c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba');assert.equal(sha(V2_SYSTEM),'fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09');
// Same preregistered representative subset, including historical prose failures.
const screen=old.screen.map(x=>m.cases.find(c=>c.id===x.id)),confirmation=old.confirmation.map(x=>m.cases.find(c=>c.id===x.id));
const rows=[],samples=[],negatives=[],coverage={};
function prepare(c){
 assert.equal(sha(c.request),c.request_sha);assert.equal(sha(c.snapshot),c.snapshot_sha);
 const w=requestScopedReflectionWire(c.request,c.evidence_catalog),subject=c.character.id,cat=c.evidence_catalog;
 const base=claim=>({subject_character_id:subject,evidence_refs:[],confidence:'high',claim});
 const candidates=outputs.find(o=>o.id===c.id).attempts.flatMap(a=>a.structural?.value?.proposals??[]);
 const ordered=es=>[...es].sort((a,b)=>a.revision-b.revision||a.ref.localeCompare(b.ref,'en',{numeric:true}));
 const groups=(es,key)=>Object.values(Object.groupBy(es,key));
 const add=(claim,es)=>candidates.push({...base(claim),evidence_refs:es.map(e=>e.ref)});
 const intervals=es=>{const out=[];es=ordered(es);for(let i=0;i<es.length;i++)for(let j=i+2;j<=Math.min(es.length,i+8);j++)out.push(es.slice(i,j));return out;};
 const rels=groups(cat.filter(e=>e.evidence_type==='relationship_change'&&e.owner_character_id===subject),e=>JSON.stringify([e.payload.other_id,e.payload.dimension]));
 for(const group of rels)for(const es of intervals(group)){const a=es[0].payload,b=es.at(-1).payload,ranks=['none','low','moderate','high'],diff=es.map(e=>ranks.indexOf(e.payload.to)-ranks.indexOf(e.payload.from));add({type:'relationship_trajectory',target_character_id:a.other_id,dimension:a.dimension,from:a.from,to:b.to,direction:diff.every(d=>d>0)?'increase':diff.every(d=>d<0)?'decrease':'mixed',transition_count:es.length},es);}
 for(const e of cat.filter(e=>e.evidence_type==='relationship_snapshot'&&e.owner_character_id===subject)){const dims=Object.entries(e.payload.dimensions);for(const [dimension_a,state_a] of dims)for(const [dimension_b,state_b] of dims)if(dimension_a!==dimension_b)add({type:'relationship_contrast',target_character_id:e.payload.target_character_id,dimension_a,state_a,dimension_b,state_b},[e]);}
 for(const a of rels)for(const b of rels)if(a!==b&&a[0].payload.other_id===b[0].payload.other_id)for(const x of intervals(a))for(const y of intervals(b))if(x.length===y.length&&x.length+y.length<=8)add({type:'relationship_parallel',target_character_id:x[0].payload.other_id,dimension_a:x[0].payload.dimension,dimension_b:y[0].payload.dimension,from:x[0].payload.from,to:x.at(-1).payload.to,transition_count:x.length},[...x,...y]);
 for(const g of groups(cat.filter(e=>e.evidence_type==='condition_change'),e=>e.payload.condition))for(const es of intervals(g)){const operations=es.map(e=>e.payload.kind==='condition_added'?'add':'remove');add({type:'condition_trajectory',condition_id:es[0].payload.condition,operations,episode_count:operations.filter(x=>x==='add').length},es);}
 for(const g of groups(cat.filter(e=>e.evidence_type==='household_membership'),e=>e.payload.household_id))for(const es of intervals(g)){const ops={joined_household:'join',left_household:'leave',rejoined_household:'rejoin',migrated_member:'migrate'},operations=es.map(e=>ops[e.payload.kind]);add({type:'membership_trajectory',household_id:es[0].payload.household_id,operations,join_count:operations.filter(x=>x==='join').length,rejoin_count:operations.filter(x=>x==='rejoin').length,leave_count:operations.filter(x=>x==='leave').length},es);}
 for(const g of groups(cat.filter(e=>e.evidence_type==='household_context'&&e.payload.kind==='household_rule_added'),e=>e.payload.household_id))for(const es of intervals(g))add({type:'environmental_motif',household_id:es[0].payload.household_id,event_type:'rule_added',occurrence_count:es.length},es);
 const movements=cat.filter(e=>e.evidence_type==='movement'&&e.owner_character_id===subject).sort((a,b)=>a.revision-b.revision||a.ref.localeCompare(b.ref,'en',{numeric:true}));
 for(let i=0;i<movements.length;i++)for(let j=i+2;j<=Math.min(movements.length,i+8);j++){const es=movements.slice(i,j);candidates.push({...base({type:'movement_trajectory',locations:[es[0].payload.from,...es.map(e=>e.payload.to)],transition_count:es.length}),evidence_refs:es.map(e=>e.ref)});}
 const links=statementProvenance(cat,subject);
 for(let i=0;i<links.length;i++)for(let j=i+1;j<links.length;j++)for(const a of [links[i].statement_ref,links[i].source_event_ref].filter(Boolean))for(const b of [links[j].statement_ref,links[j].source_event_ref].filter(Boolean))candidates.push({...base({type:'self_statement_synthesis',statement_refs:[links[i].statement_ref,links[j].statement_ref]}),evidence_refs:[a,b]});
 // Every archived admissible proposal plus generated intervals/quote-event combinations;
 // test each canonical-compatible extra context handle and all confidence levels.
 const valid=candidates.filter(p=>validateStructuredClaimV23(p,cat,subject).accepted);
 assert.ok(valid.length,`No positive samples ${c.id}`);
 for(const p of valid)for(const confidence of ['low','medium','high'])for(const extra of [null,...cat.map(e=>e.ref)]){const q={...p,confidence,evidence_refs:extra?[...new Set([...p.evidence_refs,extra])]:p.evidence_refs};if(!validateStructuredClaimV23(q,cat,subject).accepted)continue;const env={proposals:[q]};assert.ok(schemaMatches(V2_SCHEMA,env));const pass=schemaMatches(w.schema,env);samples.push({id:c.id,family:q.claim.type,proposal:q,wire_valid:pass});coverage[q.claim.type]=(coverage[q.claim.type]??0)+1;}
 assert.ok(schemaMatches(w.schema,{proposals:[]}));
 const p={...valid[0],evidence_refs:[w.domains.evidence_refs[0]]},badEvidence=['Prose summary instead of an evidence identifier','npcmem:foreign:history:r999.0'];
 for(const value of badEvidence){const env={proposals:[{...p,evidence_refs:[value]}]};assert.equal(schemaMatches(w.schema,env),false);negatives.push({id:c.id,kind:'foreign_or_prose_evidence',value,wire_reject:true});}
 for(const [claim,kind] of [[{type:'self_statement_synthesis',statement_refs:['N/A','N/A']},'N/A_statement'],[{type:'movement_trajectory',locations:['Invented movement explanation','Another invented endpoint'],transition_count:2},'prose_location']]){assert.equal(schemaMatches(w.schema,{proposals:[{...p,claim}]}),false);negatives.push({id:c.id,kind,wire_reject:true});}
 const duplicate={proposals:[{...p,claim:{type:'condition_trajectory',condition_id:'test',operations:['add'],episode_count:1},evidence_refs:[p.evidence_refs[0],p.evidence_refs[0]]}]};assert.equal(schemaMatches(w.schema,duplicate),true);assert.equal(schemaMatches(V2_SCHEMA,duplicate),false);negatives.push({id:c.id,kind:'duplicate_evidence',wire_permits:true,canonical_reject:true});
 if(w.domains.statement_refs.length>=2){const env={proposals:[{...p,claim:{type:'self_statement_synthesis',statement_refs:[w.domains.statement_refs[0],w.domains.statement_refs[0]]}}]};assert.ok(schemaMatches(w.schema,env));assert.equal(schemaMatches(V2_SCHEMA,env),false);negatives.push({id:c.id,kind:'duplicate_statement',wire_permits:true,canonical_reject:true});}
 const bytes=Buffer.byteLength(JSON.stringify(w.schema)),enumBytes=Buffer.byteLength(JSON.stringify(w.domains));rows.push({id:c.id,schema_bytes:bytes,enum_bytes:enumBytes,counts:Object.fromEntries(Object.entries(w.domains).map(([k,v])=>[k,v.length])),wire_sha:sha(w.schema)});
 return {...c,wire_schema:w.schema,wire_sha:sha(w.schema),domains:w.domains};
}
const s=screen.map(prepare),c=confirmation.map(prepare);
for(const family of Object.keys(m.families))assert.ok(coverage[family],`Uncovered family ${family}`);
const stats=xs=>{xs.sort((a,b)=>a-b);return {min:xs[0],median:(xs[Math.floor((xs.length-1)/2)]+xs[Math.ceil((xs.length-1)/2)])/2,max:xs.at(-1)}};
const local={result:samples.some(s=>!s.wire_valid)?'FAIL':'PASS',requests:rows.length,canonical_valid_samples:samples.length,false_rejections:samples.filter(s=>!s.wire_valid).length,safety_negatives:negatives.length,coverage,size_bytes:stats(rows.map(r=>r.schema_bytes)),domain_counts:Object.fromEntries(['evidence_refs','statement_refs','locations'].map(k=>[k,stats(rows.map(r=>r.counts[k]))])),rows};
writeFileSync(`${dir}/local-equivalence.json`,JSON.stringify(local,null,2));writeFileSync(`${dir}/local-samples.json`,JSON.stringify(samples));writeFileSync(`${dir}/safety-negatives.json`,JSON.stringify(negatives,null,2));
const paths=['src/dev/reflection-wire-v2.ts',...Object.keys(old.frozen_file_hashes),'docs/evaluations/d09-reflection/request-wire-v2-build.mjs','docs/evaluations/d09-reflection/request-wire-v2-run.mjs'];
const plan={created_at:new Date().toISOString(),purpose:'Request-scoped enums reliability only; no semantic OOS or scoring',hypothesis:'Does Alibaba/Qwen enforce request-scoped enum values reliably on the full dynamic reflection wire schema?',local_gate:local.result,dispatch_allowed:local.result==='PASS',local_gate_sha:sha(readFileSync(`${dir}/local-equivalence.json`)),documentation:'documentation-review.json',semantic_freeze:m.semantic_freeze,provider_freeze:m.provider_freeze,policy:{...old.policy,max_new_physical_calls:48},screen:s,confirmation:c,confirmation_rule:'Screen >=23/24 first and 24/24 final, zero request-scoped enum violations, >=16 physical calls remaining; one distinct 16-request confirmation with bounded retries within shared 48 cap.',frozen_file_hashes:Object.fromEntries([...new Set(paths)].map(p=>[p,sha(readFileSync(p))]))};
const bytes=JSON.stringify(plan,null,2);writeFileSync(`${dir}/preregistered-plan.json`,bytes);writeFileSync(`${dir}/preregistered-plan.sha256`,sha(bytes)+'\n');console.log(JSON.stringify({...local,rows:undefined},null,2));
