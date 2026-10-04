/** Credential-loader correction: bounded single-arm screen, never auth retries or quality rerolls. */
import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {sha} from './lib.mjs';
import {OpenRouterClient} from '../../../.build/src/llm/openrouter/client.js';
import {V2_SCHEMA,schemaMatches} from '../../../.build/src/dev/reflection-v2.js';
import {evaluateStructuredOutputV23} from '../../../.build/src/dev/reflection-v23.js';
import {invalidStructured,failureClass} from '../../../.build/src/llm/reliability.js';
import {classify} from './structured-reliability-forensics.mjs';
const dir='saves/structured-reflection-reliability',read=n=>readFileSync(`${dir}/${n}`,'utf8'),m=JSON.parse(read('manifest.json')),prior=JSON.parse(read('outputs.json'));
if(prior.length!==48||prior.some(o=>o.attempts.length!==1||o.attempts[0].raw?.status!==401))throw Error('Unexpected previous dispatch state');
if(existsSync(`${dir}/continuation-manifest.json`))throw Error('Do not repeat continuation');
for(const[p,h]of Object.entries(m.frozen.files))if(sha(readFileSync(p))!==h)throw Error('Frozen source changed');
const credential=readFileSync('APIKEY.env','utf8').match(/sk-or-v1-[a-f0-9]{64}/)?.[0];if(!credential)throw Error('No exact key');
const manifest={created_at:new Date().toISOString(),original_manifest_sha:sha(read('manifest.json')),purpose:'Corrected credential configuration, single preselected alternative route screen; original 48 auth failures preserved, not retried',arm:'B',selection_reason:'Same model, explicitly advertised structured_outputs at DeepInfra. Chosen before any valid model outputs; no comparative best-arm claim.',remaining_generation_budget:16,secondary_retries:0,source_sha:sha(readFileSync('docs/evaluations/d09-reflection/structured-reliability-continuation.mjs')),request_bodies:m.requests.B};
writeFileSync(`${dir}/continuation-manifest.json`,JSON.stringify(manifest,null,2));writeFileSync(`${dir}/continuation-manifest.sha256`,sha(JSON.stringify(manifest,null,2))+'\n');
const outputs=[];let physical=48;
for(const request of m.requests.B){if(physical>=64)break;const c=m.cases.find(c=>c.reliability_id===request.id),body=request.body,a={phase:'corrected_credentials',arm:'B',id:request.id,n:1,physical_call:++physical,body_sha:sha(body),request_sha:c.request_sha,snapshot_sha:c.snapshot_sha,started_at:new Date().toISOString(),usable:false};
 if(sha(c.request)!==a.request_sha||sha(c.snapshot)!==a.snapshot_sha)throw Error('State mutation');appendFileSync(`${dir}/physical-dispatch.jsonl`,JSON.stringify(a)+'\n');const started=performance.now();let wire,text='',metadata;
 try{const client=new OpenRouterClient({api_key:()=>credential,fetch:async(url,init)=>{if(sha(String(init.body))!==sha(JSON.stringify(body)))throw Error('Wire body mismatch');const response=await fetch(url,init);wire={status:response.status,body:await response.clone().text()};return response;}});for await(const e of client.request(body,false,m.settings.timeout_ms)){if(e.type==='text_delta')text+=e.text;else metadata=e.metadata;}a.parsed=invalidStructured(text,v=>schemaMatches(V2_SCHEMA,v)).proposals;a.usable=true;}catch(e){a.failure_class=failureClass(e);a.provider_code=e.code??'local_error';}
 a.latency_ms=performance.now()-started;a.text=text;a.raw=wire;a.metadata=metadata;let j;try{j=JSON.parse(wire?.body??'{}');}catch{}a.provider=j?.provider??null;a.finish_reason=j?.choices?.[0]?.finish_reason??null;a.usage=j?.usage??null;a.cost_usd=j?.usage?.cost??metadata?.cost_usd??null;a.taxonomy=classify(j?.choices?.[0]?.message?.content,a.finish_reason,wire?.status===200&&typeof j?.choices?.[0]?.message?.content==='string');
 if(a.usable){const sanity=evaluateStructuredOutputV23(a.parsed,c.evidence_catalog,c.character.id,new Map(c.knownNames));a.semantic_sanity={proposals:a.parsed.length,admissible:sanity.accepted.length,not_full_semantic_scoring:true};}
 outputs.push(a);appendFileSync(`${dir}/physical-ledger.jsonl`,JSON.stringify(a)+'\n');writeFileSync(`${dir}/continuation-outputs.json`,JSON.stringify(outputs,null,2));console.log(a.id,a.usable?'usable':a.failure_class,a.provider??'none');if(a.provider_code==='authentication_error'||a.provider_code==='configuration_error')break;
}
writeFileSync(`${dir}/continuation-completed.json`,JSON.stringify({total_generation_calls:physical,screen_calls:outputs.length,usable:outputs.filter(a=>a.usable).length,finished_at:new Date().toISOString()}));
