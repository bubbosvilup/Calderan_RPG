/** Phase 5/8: 2x2 provider/schema bake-off over the frozen corpus. No quality retries, no rerolls: one logical call per (request, arm, draw); transport retries only (all physical attempts recorded). */
import {readFileSync,writeFileSync,mkdirSync,existsSync,appendFileSync} from 'node:fs';
import {MODELS,SCHEMAS,reflectCall,Ledger,describeCall,sha} from './lib.mjs';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const out=arg('--out','saves/d09-reflection-bakeoff/runs/pass1'),arms=arg('--arms','A,B,C,D').split(','),draw=Number(arg('--draw',1)),only=arg('--only')?readFileSync(arg('--only'),'utf8').split('\n').filter(Boolean):null;
const ARMS={A:{model:'deepseek',schema:'current'},B:{model:'deepseek',schema:'strict'},C:{model:'qwen',schema:'current'},D:{model:'qwen',schema:'strict'}};
const corpus=readFileSync(arg('--corpus','saves/d09-reflection-bakeoff/corpus.jsonl'),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(r=>!only||only.includes(r.id));
mkdirSync(out,{recursive:true});
const ledger=new Ledger(out,{cap_usd:Number(arg('--cap',0.6))});
const resultsFile=`${out}/results.jsonl`;
const done=new Set(existsSync(resultsFile)?readFileSync(resultsFile,'utf8').split('\n').filter(Boolean).map(l=>{const r=JSON.parse(l);return `${r.request_id}|${r.arm}|${r.draw}`;}):[]);
for(const rec of corpus){
  await Promise.all(arms.filter(a=>!done.has(`${rec.id}|${a}|${draw}`)).map(async a=>{
    const {model,schema}=ARMS[a];
    const r=await reflectCall({model:MODELS[model],schema:SCHEMAS[schema],request:rec.request,ledger,tag:`bakeoff:${rec.id}:${a}:d${draw}`});
    const d=describeCall(r);
    appendFileSync(resultsFile,JSON.stringify({request_id:rec.id,origin:rec.origin,arm:a,model:MODELS[model],schema_name:schema,draw,request_sha:sha(rec.request),...d,attempts:r.attempts.map(x=>({n:x.n,ok:x.ok,error:x.error,started_at:x.started_at,usage:x.metadata?.usage,cost_usd:x.metadata?.cost_usd,latency:x.metadata?.latency??x.latency,raw_status:x.raw?.status,raw_body:x.raw?.body}))})+'\n');
    console.log(rec.id,a,d.error??'ok',d.upstream,d.finish,d.cost);
  }));
}
console.log('ledger spent',ledger.spent);
