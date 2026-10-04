import test from 'node:test';
import assert from 'node:assert/strict';
import {V2_SCHEMA} from '../src/dev/reflection-v23.js';
import {reflectionWireSchema,validateReflectionWire} from '../src/dev/reflection-wire.js';
import {exactBenchmarkCredential,benchmarkAuthentication,benchmarkStop,BenchmarkGate,runBenchmarkTasks} from '../src/dev/reflection-benchmark.js';
const p={subject_character_id:'maren',evidence_refs:['r1','r2'],confidence:'high',claim:{type:'relationship_trajectory',target_character_id:'brenna',dimension:'trust',from:'none',to:'moderate',direction:'increase',transition_count:2}},wire=reflectionWireSchema('WIRE_DEEPINFRA_V1');
const cases:[string,unknown,boolean][]=[
 ['duplicate evidence refs',{proposals:[{...p,evidence_refs:['r1','r1']}]},true],
 ['duplicate statement refs',{proposals:[{...p,claim:{type:'self_statement_synthesis',statement_refs:['s1','s1']}}]},true],
 ['unknown field',{proposals:[{...p,extra:'unexpected'}]},false],
 ['invalid enum',{proposals:[{...p,confidence:'certain'}]},false],
 ['too many proposals',{proposals:[p,p,p,p]},false],
 ['too many refs',{proposals:[{...p,evidence_refs:Array.from({length:9},(_,i)=>`r${i}`)}]},false],
 ['wrong claim payload',{proposals:[{...p,claim:{type:'relationship_trajectory',operations:['add']}}]},false],
 ['missing required',{proposals:[{subject_character_id:'maren',evidence_refs:['r1'],claim:p.claim}]},false],
];
for(const[name,value,wireAccepts]of cases)test(`wire projection safety: ${name}`,()=>{const r=validateReflectionWire(JSON.stringify(value),wire);assert.equal(r.wire_valid,wireAccepts);assert.equal(r.canonical_valid,false);assert.equal(r.usable,false);});
test('wire projections remove only uniqueItems and never mutate the canonical schema',()=>{const before=JSON.stringify(V2_SCHEMA),canonical=reflectionWireSchema('CANONICAL');assert.deepEqual(canonical,V2_SCHEMA);assert.equal(JSON.stringify(wire).includes('uniqueItems'),false);assert.deepEqual(reflectionWireSchema('WIRE_ALIBABA_V1'),wire);assert.equal(validateReflectionWire(JSON.stringify({proposals:[p]}),wire).usable,true);assert.equal(JSON.stringify(V2_SCHEMA),before);});
test('wire parser rejects fences, prose, extra object, punctuation and missing braces without prefix extraction',()=>{const valid=JSON.stringify({proposals:[p]});for(const text of ['```json\n'+valid+'\n```',valid+' explanation',valid+'{}',valid+'}',valid.slice(0,-1),''])assert.equal(validateReflectionWire(text,wire).usable,false);});
const key='sk-or-v1-'+'a'.repeat(64);
test('benchmark key loading validates exact format and bounds legacy text extraction',()=>{assert.equal(exactBenchmarkCredential({fileText:'OpenRouter key: '+key+'abcdef trailing notes'}),key);assert.equal(exactBenchmarkCredential({env:key}),key);for(const env of [key+'suffix',' '+key,key.slice(0,-1),'missing'])assert.throws(()=>exactBenchmarkCredential({env}));assert.throws(()=>exactBenchmarkCredential({fileText:key+' '+('sk-or-v1-'+'b'.repeat(64))}));});
test('read-only authentication preflight rejects once before generations',async()=>{let calls=0;const fetcher:typeof fetch=async()=>{calls++;return new Response('{}',{status:401});};await assert.rejects(benchmarkAuthentication(key,fetcher),/HTTP 401/);assert.equal(calls,1);assert.deepEqual(await benchmarkAuthentication(key,async()=>new Response('{}',{status:200})),{valid:true,status:200});});
test('benchmark auth fail-fast stops all arms after one response, including HTTP-200 error wrappers',async()=>{for(const response of [{status:401,body:{}},{status:200,body:{error:{code:401,message:'User not found'}}}]){const gate=new BenchmarkGate(),out=await runBenchmarkTasks(Array.from({length:48},(_,i)=>({arm:['A','B','C'][i%3]!})),async()=>({stop:benchmarkStop(response.status,response.body)}),gate);assert.equal(out.length,1);assert.equal(gate.aborted,true);assert.equal(gate.calls,1);}});
test('benchmark deterministic grammar/config errors stop the affected arm immediately',async()=>{const gate=new BenchmarkGate(),tasks=Array.from({length:16},()=>[{arm:'B'},{arm:'C'}]).flat(),out=await runBenchmarkTasks(tasks,async task=>({stop:task.arm==='B'?benchmarkStop(200,{error:{code:400,message:'Grammar error: Unimplemented keys'}}):null}),gate);assert.equal(out.filter(o=>o.task.arm==='B').length,1);assert.equal(out.filter(o=>o.task.arm==='C').length,16);assert.equal(benchmarkStop(404,{}),'CONFIGURATION');assert.equal(benchmarkStop(429,{}),null);assert.equal(benchmarkStop(500,{}),null);});
test('benchmark budget is shared across probes, comparisons and retries',async()=>{const gate=new BenchmarkGate(3),out=await runBenchmarkTasks(Array.from({length:10},()=>({arm:'A'})),async()=>({stop:null}),gate);assert.equal(out.length,3);assert.throws(()=>gate.reserve('B'));});
