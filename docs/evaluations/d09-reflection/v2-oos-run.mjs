/** Provider dispatch only: does not execute V2 validation. All diagnostic proposals enter blind review records. */
import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {OpenRouterClient} from '../../../.build/src/llm/openrouter/client.js';
import {DEFAULT_REFLECTION_MODEL} from '../../../.build/src/llm/openrouter/reflection-provider.js';
import {V2_SCHEMA,V2_SYSTEM,parseStructuredOutput,legacyComparisonProposal} from '../../../.build/src/dev/reflection-v2.js';
import {sha,parseReflectionOutput,validateProposals} from './lib.mjs';
const dir='saves/d09-reflection-v2',bytes=readFileSync(`${dir}/oos-manifest.json`,'utf8'),m=JSON.parse(bytes),f=m.candidate_freeze;
if(sha(bytes)!==readFileSync(`${dir}/oos-manifest.sha256`,'utf8').trim()||sha(readFileSync(f.source_file))!==f.source_sha||sha(readFileSync('.build/src/dev/reflection-v2.js'))!==f.compiled_sha||sha(V2_SCHEMA)!==f.schema_sha||sha(V2_SYSTEM)!==f.prompt_sha||DEFAULT_REFLECTION_MODEL!==m.model)throw Error('Frozen setup mismatch');
if(existsSync(`${dir}/candidate-oos-outcomes.json`))throw Error('Scoring already completed');
if(!process.env.OPENROUTER_API_KEY){const env=readFileSync('APIKEY.env','utf8'),v=env.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/m);if(!v)throw Error('No OpenRouter credential');process.env.OPENROUTER_API_KEY=v[1].replace(/^['"]|['"]$/g,'');}
const file=`${dir}/oos-outputs.jsonl`,done=new Set(existsSync(file)?readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).id):[]);
if(!existsSync(`${dir}/dispatch-started.json`))writeFileSync(`${dir}/dispatch-started.json`,JSON.stringify({manifest_sha:sha(bytes),started_at:new Date().toISOString()}));
async function run(c){
 if(sha(c.request)!==c.request_sha)throw Error('Request changed');
 const marker=`${dir}/inflight-${c.id}.json`;if(existsSync(marker))throw Error(`Ambiguous dispatched request ${c.id}: do not reroll`);
 writeFileSync(marker,JSON.stringify({id:c.id,started_at:new Date().toISOString()}));
 const attempts=[];let text=null,error=null;
 for(let n=1;n<=3;n++){
  const a={n,started_at:new Date().toISOString()};let raw;
  const client=new OpenRouterClient({fetch:async(url,init)=>{a.body_sha=sha(init.body);const res=await fetch(url,init);raw={status:res.status,body:await res.clone().text()};return res;}});
  const body={model:m.model,max_tokens:m.max_tokens,messages:[{role:'system',content:V2_SYSTEM},{role:'user',content:JSON.stringify(c.request)}],response_format:{type:'json_schema',json_schema:{name:'npc_reflection_v2',strict:true,schema:V2_SCHEMA}},provider:m.provider,reasoning:m.reasoning};
  let output='';try{for await(const e of client.request(body,false,m.timeout_ms)){if(e.type==='text_delta')output+=e.text;else a.metadata=e.metadata;}text=output;a.ok=true;}catch(e){a.ok=false;a.error=e.code??e.message;error=a.error;}
  a.raw=raw;try{const j=JSON.parse(raw?.body??'{}');a.cost_usd=j.usage?.cost??a.metadata?.cost_usd??null;a.usage=j.usage;a.provider=j.provider;}catch{a.cost_usd=null;}
  attempts.push(a);appendFileSync(`${dir}/oos-ledger.jsonl`,JSON.stringify({id:c.id,...a,raw:undefined})+'\n');
  if(text!==null||!['provider_unavailable','rate_limited','timeout'].includes(a.error))break;
  if(n<3)await new Promise(r=>setTimeout(r,2000*2**(n-1)));
 }
 const parsed=text!==null?parseStructuredOutput(text):undefined;
 let diagnostic=parsed;
 if(!diagnostic&&text){try{const envelope=JSON.parse(text.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));if(Array.isArray(envelope.proposals))diagnostic=envelope.proposals;}catch{}}
 const nativeRaw=text!==null?parseReflectionOutput(text):undefined,nativeOld=nativeRaw?validateProposals(nativeRaw,c.legacy_catalog,c.character,new Map(c.knownNames),new Set(c.worldWords)):null;
 const bridge=(diagnostic??[]).map(p=>legacyComparisonProposal(p,c.evidence_catalog,new Map(c.knownNames))??null);
 const oldBridge=bridge.map(p=>p?validateProposals([p],c.legacy_catalog,c.character,new Map(c.knownNames),new Set(c.worldWords)):null);
 const r={id:c.id,request_sha:c.request_sha,text,error:text!==null?null:error,attempts,parsed:parsed??null,diagnostic_proposals:diagnostic??[],native_old:nativeOld,bridge,old_bridge:oldBridge};appendFileSync(file,JSON.stringify(r)+'\n');
 console.log(c.id,text!==null?'ok':error,'proposals',diagnostic?.length??'malformed');
}
const pending=m.cases.filter(c=>!done.has(c.id));for(let i=0;i<pending.length;i+=4)await Promise.all(pending.slice(i,i+4).map(run));
const outputs=readFileSync(file,'utf8').trim().split('\n').map(JSON.parse),review=[];
for(const o of outputs){const c=m.cases.find(c=>c.id===o.id);for(const [i,p]of o.diagnostic_proposals.entries())review.push({id:`${o.id}:${i}`,request_id:o.id,envelope_valid:o.parsed!==null,proposal:p,character:c.character,source_type:c.source_type,family:c.family,evidence_catalog:c.evidence_catalog});}
writeFileSync(`${dir}/blind-review-records.json`,JSON.stringify(review,null,2));
console.log('Review records',review.length,'cost',outputs.flatMap(o=>o.attempts).reduce((n,a)=>n+(a.cost_usd??0),0),'unknown costs',outputs.flatMap(o=>o.attempts).filter(a=>a.cost_usd===null).length);
