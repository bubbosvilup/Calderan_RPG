/** Frozen OOS dispatch: actual production provider; no candidate outcomes exposed here. */
import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {OpenRouterClient} from '../../../.build/src/llm/openrouter/client.js';
import {OpenRouterReflectionProvider,DEFAULT_REFLECTION_MODEL} from '../../../.build/src/llm/openrouter/reflection-provider.js';
import {sha,parseReflectionOutput,validateProposals} from './lib.mjs';
const dir='saves/d09-semantic-oos',bytes=readFileSync(`${dir}/corpus-manifest.json`,'utf8'),manifest=JSON.parse(bytes);
if(sha(bytes)!==readFileSync(`${dir}/manifest.sha256`,'utf8').trim())throw Error('Manifest mismatch');
if(sha(readFileSync('docs/evaluations/d09-reflection/semantic-rules.mjs'))!==manifest.rule_sha)throw Error('Rule mismatch');
if(DEFAULT_REFLECTION_MODEL!==manifest.model)throw Error('Model changed');
if(!process.env.OPENROUTER_API_KEY){const env=readFileSync('APIKEY.env','utf8');const m=env.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/m);if(!m)throw Error('Missing credential');process.env.OPENROUTER_API_KEY=m[1].replace(/^['"]|['"]$/g,'');}
const file=`${dir}/outputs.jsonl`,done=new Set(existsSync(file)?readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).id):[]);
writeFileSync(`${dir}/dispatch-started.json`,JSON.stringify({manifest_sha:sha(bytes),started_at:new Date().toISOString()}));
async function run(c){
 if(sha(c.request)!==c.request_sha)throw Error('Request mismatch');
 const attempts=[];let output,error;
 for(let n=1;n<=3;n++){
  const a={n,started_at:new Date().toISOString()};let raw;
  const client=new OpenRouterClient({fetch:async(url,init)=>{a.body_sha=sha(init.body);const res=await fetch(url,init);raw={status:res.status,body:await res.clone().text()};return res;}});
  try{output=await new OpenRouterReflectionProvider(client).reflect(c.request);a.ok=true;}
  catch(e){a.ok=false;a.error=e.code??e.message;error=a.error;}
  a.raw=raw;try{const j=JSON.parse(raw?.body??'{}');a.cost_usd=j.usage?.cost??0;a.usage=j.usage;a.provider=j.provider;}catch{a.cost_usd=0;}
  attempts.push(a);appendFileSync(`${dir}/ledger.jsonl`,JSON.stringify({id:c.id,...a,raw:undefined})+'\n');
  if(output||!['provider_unavailable','rate_limited','timeout'].includes(a.error))break;
  if(n<3)await new Promise(r=>setTimeout(r,2000*2**(n-1)));
 }
 const raw=output?parseReflectionOutput(output.text):undefined;
 const old=raw?validateProposals(raw,c.evidence_catalog,c.character,new Map(c.knownNames),new Set(c.worldWords)):null;
 const record={id:c.id,request_sha:c.request_sha,output:output??null,error:output?null:error,attempts,parsed:raw??null,old};
 appendFileSync(file,JSON.stringify(record)+'\n');
 console.log(c.id,output?'ok':error,'proposals',raw?.length??'malformed');
}
const pending=manifest.cases.filter(c=>!done.has(c.id));
for(let i=0;i<pending.length;i+=4)await Promise.all(pending.slice(i,i+4).map(run));
const outputs=readFileSync(file,'utf8').trim().split('\n').map(JSON.parse),reviews=[];
for(const o of outputs){const c=manifest.cases.find(c=>c.id===o.id);for(const [i,p] of (o.parsed??[]).entries())reviews.push({id:`${o.id}:${i}`,request_id:o.id,proposal:p,character:c.character,cited_evidence:c.evidence_catalog.filter(e=>p.evidence_refs?.includes(e.ref)),catalog:c.evidence_catalog});}
writeFileSync(`${dir}/blind-review-records.json`,JSON.stringify(reviews,null,2));
console.log('Blind records',reviews.length,'cost',outputs.flatMap(o=>o.attempts).reduce((n,a)=>n+a.cost_usd,0));
