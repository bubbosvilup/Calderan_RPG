/** D26 one frozen fresh run. Existing failed evidence is read-only. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {MANNERISM_NARRATOR_RULE} from '../../.build/src/turn/npc-plus.js';
import {MiniMaxNarratorProvider} from '../../.build/src/llm/openrouter/minimax-narrator.js';
import {OpenRouterClient} from '../../.build/src/llm/openrouter/client.js';
import {createDraftGenerator} from '../../.build/src/turn/stages/narration.js';
import {DEFAULT_RETRY_POLICY,ProviderBudget} from '../../.build/src/llm/retry.js';
import {selectedModels,NARRATOR_OUTPUT_TOKENS} from '../../.build/src/app/provider-config.js';
const original='saves/mannerism-portrayal-probe',root=`${original}/d26-fix`;
mkdirSync(root,{recursive:true});
const read=(dir,n)=>JSON.parse(readFileSync(`${dir}/${n}.json`,'utf8'));
const put=(n,v)=>writeFileSync(`${root}/${n}.json`,JSON.stringify(v,null,2));
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const oldRule='Mannerisms are small optional recurring cues: use occasionally and naturally, never in every scene or as caricature. They do not define personality, motivation, consent or internal state. Never invent objects, prerequisites or facts to perform them.';
throw new Error('Archived failed prompt-only run is read-only; use d26-shadow-validation.mjs for the current pass.');
const baseline=read(original,'paid-run.started');
const ids=baseline.matrix.map(c=>c.id).concat(['A-negative','B-negative','C-negative'].flatMap(id=>[`control-${id}-with`,`control-${id}-without`]));
const plan=ids.map(id=>{
  const source=read(original,`output-${id}`),prompt=structuredClone(source.prompt);let count=0;
  for(const m of prompt.messages){if(m.content.includes(oldRule)){count++;m.content=m.content.replace(oldRule,MANNERISM_NARRATOR_RULE);}}
  if(count!==1||prompt.system_prompt!==source.prompt.system_prompt)throw new Error('Expected sole shared portrayal-rule substitution');
  return {id,case:source.case,prompt,recent:source.recent,snapshot_hash:source.snapshot_hash,original_request_hash:source.request_hash,request_hash:sha(prompt),source_hash:sha(readFileSync(`${original}/output-${id}.json`))};
});
for(const id of ['A-negative','B-negative'])for(let n=1;n<=2;n++)plan.push({...structuredClone(plan.find(p=>p.id===id)),id:`replica-${id}-${n}`});
const files=execFileSync('git',['ls-files','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/);
const frozen=Object.fromEntries(files.map(p=>[p,sha(readFileSync(p))]));
const manifest={model:selectedModels().narrator,old_rule:oldRule,new_rule:MANNERISM_NARRATOR_RULE,plan,production_hashes:frozen,max_calls:22,cap_usd:1};
if(manifest.model!=='z-ai/glm-5.2'||NARRATOR_OUTPUT_TOKENS!==512)throw new Error('Production configuration changed');
if(!process.argv.includes('--live')){put('dry-manifest',manifest);console.log(JSON.stringify({dry:true,requests:plan.length,only_shared_rule_changed:true}));process.exit(0);}
if(existsSync(`${root}/paid-run.started.json`))throw new Error('Existing D26 run; no rerolls');
const creditResponse=await fetch('https://openrouter.ai/api/v1/credits',{headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`}});
if(!creditResponse.ok)throw new Error('Credit preflight failed');const before=(await creditResponse.json()).data;
const modelResponse=await fetch('https://openrouter.ai/api/v1/models');if(!modelResponse.ok)throw new Error('Price preflight failed');
const pricing=(await modelResponse.json()).data.find(m=>m.id===manifest.model)?.pricing;
if(!pricing||before.total_credits-before.total_usage<4)throw new Error('Insufficient verified reserve/pricing');
writeFileSync(`${root}/paid-run.started.json`,JSON.stringify({...manifest,at:new Date().toISOString(),credits:before,pricing},null,2),{flag:'wx'});
const ledger=[],outputs=[];let logical='',spent=0,stop;
class Metered extends OpenRouterClient{
 async *request(body,streaming,timeout,signal){
  const upper=2*(Buffer.byteLength(JSON.stringify(body))*Number(pricing.prompt)+body.max_tokens*Number(pricing.completion));
  if(ledger.length>=22||spent+upper>1)throw new Error('D26 bounded paid-call/cost stop');
  const entry={call:ledger.length+1,logical,body,text:''};ledger.push(entry);put('ledger',ledger);
  try{for await(const e of super.request(body,streaming,timeout,signal)){
   if(e.type==='text_delta')entry.text+=e.text;else{entry.metadata=e.metadata;entry.status='completed';if(e.metadata.cost_usd!==undefined)spent+=e.metadata.cost_usd;}yield e;
  }}catch(e){entry.status='failed';entry.error=e.code??e.message;throw e;}finally{put('ledger',ledger);}
 }
}
const provider=new MiniMaxNarratorProvider(new Metered(),{model:manifest.model,max_output_tokens:512,disable_reasoning:true});
try{for(const item of plan){
 logical=item.id;const abort=new AbortController();let attempts;const output={...item};
 try{const draft=await createDraftGenerator(provider,abort.signal,()=>{},undefined,{policy:DEFAULT_RETRY_POLICY,budget:new ProviderBudget(DEFAULT_RETRY_POLICY),record:r=>{attempts=r;}})(item.prompt);output.result=draft.result;}catch(e){output.error=e.code??e.message;}
 output.attempts=attempts;outputs.push(output);put(`output-${item.id}`,output);
 console.log(JSON.stringify({id:item.id,ok:!!output.result,calls:ledger.length,cost_usd:spent}));
 if(output.error||ledger.some(c=>c.metadata?.cost_usd===undefined))throw new Error('Failed/unmetered call; no reroll');
}}
catch(e){stop=e.message;}
const changed=files.filter(p=>frozen[p]!==sha(readFileSync(p)));
const originals_unchanged=ids.every(id=>sha(readFileSync(`${original}/output-${id}.json`))===plan.find(p=>p.id===id).source_hash);
put('summary',{model:manifest.model,outputs:outputs.length,paid_calls:ledger.length,reported_usd:spent,stop:stop??'complete',production_changed_during_run:changed,originals_unchanged,credits_before:before,unknown_cost_calls:ledger.filter(c=>c.metadata?.cost_usd===undefined).length});
if(stop||changed.length||!originals_unchanged)process.exitCode=1;
