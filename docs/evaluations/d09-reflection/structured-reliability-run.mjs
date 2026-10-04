import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {sha} from './lib.mjs';
import {OpenRouterClient} from '../../../.build/src/llm/openrouter/client.js';
import {schemaMatches,V2_SCHEMA} from '../../../.build/src/dev/reflection-v2.js';
import {evaluateStructuredOutputV23} from '../../../.build/src/dev/reflection-v23.js';
import {invalidStructured,technicalRetryReason,failureClass} from '../../../.build/src/llm/reliability.js';
import {ProviderError} from '../../../.build/src/llm/errors.js';
import {withProviderRetry,retryPolicy,ProviderBudget} from '../../../.build/src/llm/retry.js';
import {classify} from './structured-reliability-forensics.mjs';
const dir='saves/structured-reflection-reliability',read=n=>readFileSync(`${dir}/${n}`,'utf8'),bytes=read('manifest.json'),m=JSON.parse(bytes);
if(sha(bytes)!==read('manifest.sha256').trim())throw Error('Manifest changed');for(const[p,h]of Object.entries(m.frozen.files))if(sha(readFileSync(p))!==h)throw Error('Freeze changed '+p);
if(existsSync(`${dir}/dispatch-started.json`))throw Error('Do not repeat dispatch');if(!process.env.OPENROUTER_API_KEY)throw Error('Missing process credential');
writeFileSync(`${dir}/dispatch-started.json`,JSON.stringify({manifest_sha:sha(bytes),started_at:new Date().toISOString()}));
const outputs=m.arms.flatMap(arm=>m.cases.map(c=>({arm:arm.id,id:c.reliability_id,request_sha:c.request_sha,snapshot_sha:c.snapshot_sha,attempts:[],parsed:null})));let physical=0;
function persist(){writeFileSync(`${dir}/outputs.json`,JSON.stringify(outputs,null,2));}
async function once(result,n){const c=m.cases.find(c=>c.reliability_id===result.id),body=m.requests[result.arm].find(r=>r.id===result.id).body;if(physical>=64)throw Error('Physical cap');if(sha(c.request)!==result.request_sha||sha(c.snapshot)!==result.snapshot_sha)throw Error('State changed');const body_sha=sha(body);if(result.attempts.length&&result.attempts[0].body_sha!==body_sha)throw Error('Retry body changed');
 const a={arm:result.arm,id:result.id,n,physical_call:++physical,body_sha,usable:false,started_at:new Date().toISOString()},started=performance.now();let wire,text='',metadata,error;
 appendFileSync(`${dir}/physical-dispatch.jsonl`,JSON.stringify(a)+'\n');
 try{const client=new OpenRouterClient({fetch:async(url,init)=>{if(sha(String(init.body))!==sha(JSON.stringify(body)))throw Error('Wire payload differs from frozen request');const response=await fetch(url,init);wire={status:response.status,body:await response.clone().text()};return response;}});for await(const e of client.request(body,false,m.settings.timeout_ms)){if(e.type==='text_delta')text+=e.text;else metadata=e.metadata;}a.parsed=invalidStructured(text,v=>schemaMatches(V2_SCHEMA,v)).proposals;a.usable=true;}catch(e){error=e;a.failure_class=failureClass(e);a.provider_code=e instanceof ProviderError?e.code:'local_error';}
 a.latency_ms=performance.now()-started;a.raw=wire;a.text=text;a.metadata=metadata;let receipt;try{receipt=JSON.parse(wire?.body??'{}');}catch{}a.provider=receipt?.provider??null;a.finish_reason=receipt?.choices?.[0]?.finish_reason??null;a.cost_usd=receipt?.usage?.cost??metadata?.cost_usd??null;a.usage=receipt?.usage??null;a.taxonomy=classify(receipt?.choices?.[0]?.message?.content,a.finish_reason,wire?.status===200&&typeof receipt?.choices?.[0]?.message?.content==='string');
 if(a.usable){const sanity=evaluateStructuredOutputV23(a.parsed,c.evidence_catalog,c.character.id,new Map(c.knownNames));a.semantic_sanity={proposals:a.parsed.length,admissible:sanity.accepted.length,not_full_semantic_scoring:true};}
 result.attempts.push(a);result.parsed=a.usable?a.parsed:null;appendFileSync(`${dir}/physical-ledger.jsonl`,JSON.stringify(a)+'\n');persist();console.log(result.arm,result.id,n,a.usable?'usable':a.failure_class,a.provider??'none');if(error)throw error;
}
for(const c of m.cases)for(const arm of m.arms){try{await once(outputs.find(o=>o.arm===arm.id&&o.id===c.reliability_id),1);}catch{}}
const ranks=m.arms.map(arm=>{const rr=outputs.filter(o=>o.arm===arm.id),aa=rr.map(o=>o.attempts[0]);return {arm:arm.id,usable:aa.filter(a=>a.usable).length,nonempty:aa.filter(a=>a.usable&&a.parsed.length>0).length,cost:aa.reduce((s,a)=>s+(a.cost_usd??0),0)};}).sort((a,b)=>b.usable-a.usable||b.nonempty-a.nonempty||a.cost-b.cost||a.arm.localeCompare(b.arm));
writeFileSync(`${dir}/primary-ranking.json`,JSON.stringify(ranks,null,2));const best=ranks[0].arm;
for(const r of outputs.filter(o=>o.arm===best&&o.parsed===null)){const first=r.attempts[0],error=new ProviderError(first.provider_code,undefined,undefined,first.failure_class);if(!technicalRetryReason(error))continue;if(physical>=64)break;const policy=retryPolicy({max_attempts:2,backoff_ms:250,max_backoff_ms:500,turn_budget_ms:120000,min_retry_window_ms:5000,retry_after_timeout_cap_ms:30000,max_attempt_ms:60000,random:()=>0});try{await withProviderRetry({policy,budget:new ProviderBudget(policy),signal:new AbortController().signal,checkpoint:()=>{},reason:technicalRetryReason,run:async n=>{if(n===1)throw error;await once(r,2);},record:trace=>{r.retry_trace=trace;}});}catch{}persist();}
writeFileSync(`${dir}/dispatch-completed.json`,JSON.stringify({physical_calls:physical,best_arm:best,finished_at:new Date().toISOString()}));persist();console.log(JSON.stringify({physical,best,ranking:ranks}));
