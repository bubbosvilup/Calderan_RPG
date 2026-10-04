/** Five prospectively selected paired frozen-state narrator diagnostics. Never commits campaign. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MiniMaxNarratorProvider} from '../../.build/src/llm/openrouter/minimax-narrator.js';
import {OpenRouterClient} from '../../.build/src/llm/openrouter/client.js';
import {createDraftGenerator} from '../../.build/src/turn/stages/narration.js';
import {DEFAULT_RETRY_POLICY,ProviderBudget} from '../../.build/src/llm/retry.js';
const root='saves/d09-soak-v2',dir=`${root}/ablation`;mkdirSync(dir,{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8')),put=(n,v)=>writeFileSync(`${dir}/${n}.json`,JSON.stringify(v,null,2));
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const start=read(`${root}/started.json`),selected=[3,8,20,23,25];
const plan=selected.flatMap(turn=>{
 const file=`${root}/turn-${String(turn).padStart(3,'0')}.json`,source=read(file),normal=source.requests.at(-1),omitted=structuredClone(normal);
 for(const message of omitted.messages)message.content=message.content.replace(/\nMannerisms:\n(?:- [^\n]+\n?)+/g,'\n');
 if(sha(normal)===sha(omitted)||normal.system_prompt!==omitted.system_prompt)throw new Error('Invalid paired omission');
 return [{id:`m${turn}-normal`,turn,condition:'normal',prompt:normal},{id:`m${turn}-omitted`,turn,condition:'omitted',prompt:omitted}].map(p=>({...p,request_hash:sha(p.prompt),source_file:file,source_sha256:sha(readFileSync(file)),snapshot_sha256:sha(source.before)}));
});
const manifest={selected_turns:selected,selection:'Neutral practical question T3, neutral Gerome gesture T8, natural quoted-word pause T20/T23, clarification/neutral planning T25. Chosen before seeing ablation outputs, not based on shadow findings.',reflection_pairs:0,reflection_reason:'No accepted/retrieved reflection exists; reflection ablation would fabricate exposure.',plan,model:start.models.narrator,max_calls:10,global_cap_usd:3};
if(!process.argv.includes('--live')){put('dry-manifest',manifest);console.log(JSON.stringify({dry:true,pairs:5,calls:10}));process.exit(0);}
if(!existsSync(`${root}/summary.json`))throw new Error('Organic paid run must be stopped before ablation');
if(existsSync(`${dir}/started.json`))throw new Error('Ablation already started; no rerolls');
const primary=read(`${root}/ledger.json`),primaryCost=primary.reduce((n,e)=>n+(e.metadata?.cost_usd??0),0);
if(primary.some(e=>e.metadata?.cost_usd===undefined))throw new Error('Unmetered primary call');
writeFileSync(`${dir}/started.json`,JSON.stringify({...manifest,at:new Date().toISOString(),primary_cost_usd:primaryCost},null,2),{flag:'wx'});
const rates=start.prices[manifest.model],ledger=[];let spent=0,logical,stop='complete';
class Metered extends OpenRouterClient{
 async *request(body,streaming,timeout,signal){
  const upper=2*(Buffer.byteLength(JSON.stringify(body))*Number(rates.prompt)+body.max_tokens*Number(rates.completion));
  if(ledger.length>=10||primary.filter(e=>e.family==='narrator').length+ledger.length>=100||primaryCost+spent+upper>3)throw new Error('Global ablation budget/call stop');
  const entry={id:logical,body,text:''};ledger.push(entry);put('ledger',ledger);
  try{for await(const event of super.request(body,streaming,timeout,signal)){
   if(event.type==='text_delta')entry.text+=event.text;else{entry.metadata=event.metadata;entry.status='completed';if(event.metadata.cost_usd!==undefined)spent+=event.metadata.cost_usd;}yield event;
  }}catch(e){entry.error=e.code??e.message;entry.status='failed';throw e;}finally{put('ledger',ledger);}
 }
}
const provider=new MiniMaxNarratorProvider(new Metered(),{model:manifest.model,max_output_tokens:512,disable_reasoning:true});
try{for(const item of plan){
 logical=item.id;const abort=new AbortController();let attempts;
 const draft=await createDraftGenerator(provider,abort.signal,()=>{},undefined,{policy:DEFAULT_RETRY_POLICY,budget:new ProviderBudget(DEFAULT_RETRY_POLICY),record:r=>{attempts=r;}})(item.prompt);
 put(`output-${item.id}`,{...item,result:draft.result,attempts,source_unchanged:sha(readFileSync(item.source_file))===item.source_sha256});
 console.log(JSON.stringify({id:item.id,calls:ledger.length,spend:spent}));
 if(ledger.some(e=>e.metadata?.cost_usd===undefined))throw new Error('Unmetered ablation call; no reroll');
}}
catch(e){stop=e.message;}
put('summary',{stop,calls:ledger.length,reported_usd:spent,global_reported_usd:primaryCost+spent,primary_source_unchanged:plan.every(p=>sha(readFileSync(p.source_file))===p.source_sha256)});
if(stop!=='complete')process.exitCode=1;
