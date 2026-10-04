/** Dispatch frozen requests; strict technical handling only. Never invokes candidate semantic validation. */
import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {OpenRouterClient} from '../../../.build/src/llm/openrouter/client.js';
import {V2_SCHEMA,V2_SYSTEM,schemaMatches} from '../../../.build/src/dev/reflection-v2.js';
import {invalidStructured,technicalRetryReason,failureClass} from '../../../.build/src/llm/reliability.js';
import {withProviderRetry,ProviderBudget,retryPolicy} from '../../../.build/src/llm/retry.js';
import {ProviderError} from '../../../.build/src/llm/errors.js';
import {sha} from './lib.mjs';
const dir='saves/d09-reflection-v22-oos',read=n=>readFileSync(`${dir}/${n}`,'utf8'),bytes=read('oos-manifest.json'),m=JSON.parse(bytes);
if(sha(bytes)!==read('oos-manifest.sha256').trim())throw Error('Manifest changed');for(const[p,h]of Object.entries(m.frozen_file_hashes))if(sha(readFileSync(p))!==h)throw Error('Frozen file changed');
if(sha(V2_SCHEMA)!==m.candidate_freeze.schema_sha||sha(V2_SYSTEM)!==m.candidate_freeze.prompt_sha)throw Error('Schema/prompt changed');
if(existsSync(`${dir}/dispatch-started.json`))throw Error('Never rerun an ambiguous dispatch; inspect physical ledger first');
if(!process.env.OPENROUTER_API_KEY)throw Error('Missing environment credential');
writeFileSync(`${dir}/dispatch-started.json`,JSON.stringify({manifest_sha:sha(bytes),started_at:new Date().toISOString()}));
const logical=m.cases.map(c=>({id:c.id,request_sha:c.request_sha,attempts:[],parsed:null,error:null}));let physical=0,stopped=false;
function persist(){writeFileSync(`${dir}/oos-outputs.json`,JSON.stringify(logical,null,2));}
async function once(c,result,n,timeout_ms){
 if(physical>=80){stopped=true;throw Error('PHYSICAL_BUDGET_EXHAUSTED');}if(sha(c.request)!==c.request_sha||sha(c.snapshot)!==c.snapshot_sha)throw Error('Request/state mutated');
 const body={model:m.model,max_tokens:m.max_tokens,messages:[{role:'system',content:V2_SYSTEM},{role:'user',content:JSON.stringify(c.request)}],response_format:{type:'json_schema',json_schema:{name:'npc_reflection_v2',strict:true,schema:V2_SCHEMA}},provider:m.provider,reasoning:m.reasoning};
 const body_sha=sha(body),a={logical_id:c.id,n,physical_call:++physical,body_sha,started_at:new Date().toISOString(),usable:false,parsed:null};
 const earlier=result.attempts[0];if(earlier&&earlier.body_sha!==body_sha)throw Error('Retry changed request');
 appendFileSync(`${dir}/physical-dispatch.jsonl`,JSON.stringify({logical_id:c.id,n,physical_call:physical,body_sha,started_at:a.started_at})+'\n');
 let wire,metadata,text='',caught;const started=performance.now();
 try{const client=new OpenRouterClient({fetch:async(url,init)=>{const response=await fetch(url,init);wire={status:response.status,body:await response.clone().text()};return response;}});
  for await(const e of client.request(body,false,Math.min(m.timeout_ms,timeout_ms??Infinity))){if(e.type==='text_delta')text+=e.text;else metadata=e.metadata;}
  const envelope=invalidStructured(text,v=>schemaMatches(V2_SCHEMA,v));a.parsed=envelope.proposals;a.usable=true;a.parse_schema='valid';
 }catch(e){caught=e;a.failure_class=failureClass(e);a.provider_code=e instanceof ProviderError?e.code:'local_error';a.parse_schema=a.failure_class;}
 a.latency_ms=performance.now()-started;a.text=text;a.metadata=metadata;a.raw=wire;
 try{const receipt=JSON.parse(wire?.body??'{}');a.finish_reason=receipt.choices?.[0]?.finish_reason??null;a.provider=receipt.provider??null;a.cost_usd=receipt.usage?.cost??metadata?.cost_usd??null;a.usage=receipt.usage??metadata?.usage??null;}catch{a.finish_reason=null;a.cost_usd=null;}
 result.attempts.push(a);result.parsed=a.usable?a.parsed:null;result.error=a.usable?null:a.failure_class;appendFileSync(`${dir}/physical-ledger.jsonl`,JSON.stringify(a)+'\n');persist();
 console.log(c.id,'attempt',n,a.usable?'usable':a.failure_class);
 if(caught)throw caught;return a.parsed;
}
// First pass secures all 64 independent logical samples; deferred retry schedule was frozen before dispatch.
for(let i=0;i<m.cases.length;i++){try{await once(m.cases[i],logical[i],1);}catch(e){if(stopped)break;}}
for(let i=0;i<m.cases.length&&!stopped;i++){
 const c=m.cases[i],r=logical[i],first=r.attempts[0];if(!first||first.usable)continue;
 const cachedError=new ProviderError(first.provider_code,undefined,undefined,first.failure_class);if(!technicalRetryReason(cachedError))continue;
 if(physical>=80){stopped=true;break;}
 const policy=retryPolicy({...m.reliability,random:()=>0,now:()=>performance.now()});
 try{await withProviderRetry({policy,budget:new ProviderBudget(policy),signal:new AbortController().signal,checkpoint:()=>{if(sha(c.request)!==r.request_sha||sha(c.snapshot)!==c.snapshot_sha)throw Error('Stale frozen state');},reason:technicalRetryReason,run:async attempt=>{if(attempt===1)throw cachedError;return once(c,r,2);},record:trace=>{r.retry_trace=trace;}});}catch(e){if(stopped)break;}
 persist();
}
writeFileSync(`${dir}/dispatch-completed.json`,JSON.stringify({logical_dispatched:logical.filter(r=>r.attempts.length).length,physical_calls:physical,budget_stopped:stopped,finished_at:new Date().toISOString()}));persist();
const attempts=logical.flatMap(r=>r.attempts);console.log(JSON.stringify({logical:logical.length,physical,usable:logical.filter(r=>r.parsed!==null).length,retries:attempts.length-64,cost:attempts.reduce((s,a)=>s+(a.cost_usd??0),0),budget_stopped:stopped}));
