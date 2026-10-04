/** D26 epistemic packing + diagnostics-only gate: offline replay, then one frozen ten-call narrator run. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {MANNERISM_NARRATOR_RULE} from '../../.build/src/turn/npc-plus.js';
import {turnFixture} from '../../.build/src/dev/turn-fixture.js';
import {MannerismPortrayalGate} from '../../.build/src/turn/mannerism-portrayal-gate.js';
import {buildTurnContext} from '../../.build/src/turn/context-builder.js';
import {buildNarratorPrompt} from '../../.build/src/turn/prompt-builder.js';
import {prepareNarratorRequest,DEFAULT_CONTEXT_POLICY,ContextBudgetManager} from '../../.build/src/turn/context-budget.js';
import {LosslessContextCompactor} from '../../.build/src/turn/lossless-context-compaction.js';
import {MiniMaxNarratorProvider} from '../../.build/src/llm/openrouter/minimax-narrator.js';
import {OpenRouterClient} from '../../.build/src/llm/openrouter/client.js';
import {createDraftGenerator} from '../../.build/src/turn/stages/narration.js';
import {DEFAULT_RETRY_POLICY,ProviderBudget} from '../../.build/src/llm/retry.js';
import {selectedModels,NARRATOR_OUTPUT_TOKENS} from '../../.build/src/app/provider-config.js';
const original='saves/mannerism-portrayal-probe',root='saves/d26-shadow';
mkdirSync(root,{recursive:true});
const read=(dir,n)=>JSON.parse(readFileSync(`${dir}/${n}.json`,'utf8'));
const put=(n,v)=>writeFileSync(`${root}/${n}.json`,JSON.stringify(v,null,2));
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const world=turnFixture().world, gate=new MannerismPortrayalGate();
const policy={...DEFAULT_CONTEXT_POLICY,output_tokens:NARRATOR_OUTPUT_TOKENS};
const compactor=new LosslessContextCompactor(undefined,new ContextBudgetManager(policy));
function inspect(item,text,packedOnly=true){
 const context=buildTurnContext(world,item.snapshot,{input:item.case.input});
 return gate.inspect({turn_id:item.id,revision:item.snapshot.revision,narration:text,player_input:item.case.input,include_local_text:true,
 characters:context.characters.map(c=>({id:c.id,name:c.profile.name??world.getEntity(c.id)?.name??c.id})),
 cues:item.snapshot.premium_characters.flatMap(p=>(p.mannerisms??[]).filter(m=>!packedOnly||item.prompt.messages.some(msg=>msg.content.includes(m.text))).map(m=>({character_id:p.character_id,character_name:world.getEntity(p.character_id)?.name??p.character_id,mannerism:m,local_evidence:context.characters.find(c=>c.id===p.character_id)?.current.presentation}))) });
}
const replay=[];
for(const dir of [original,`${original}/d26-fix`])for(const file of readdirSync(dir).filter(n=>/^output-.*\.json$/.test(n))){
 const source=JSON.parse(readFileSync(`${dir}/${file}`,'utf8'));if(!source.result)continue;
 const baseline=source.snapshot?source:read(original,`output-${source.case.id}`);
 const item={...source,snapshot:baseline.snapshot,id:`${dir.endsWith('d26-fix')?'previous-fix':'original'}:${source.id??file.slice(7,-5)}`};
 replay.push({id:item.id,case:item.case,diagnostics:inspect(item,source.result.text)});
}
put('offline-replay',replay);
const ids=['A-positive','A-negative','A-quiet','B-positive','B-negative','B-quiet','C-positive','C-negative'];
const plan=ids.map(id=>{
 const source=read(original,`output-${id}`),context=buildTurnContext(world,source.snapshot,{input:source.case.input});
 const prompt=prepareNarratorRequest(buildNarratorPrompt(source.case.input,context,source.recent,undefined,{candidates:[],runtime:[]}),compactor,policy);
 return {id,case:source.case,snapshot:source.snapshot,prompt,recent:source.recent,snapshot_hash:sha(source.snapshot),original_request_hash:source.request_hash,request_hash:sha(prompt),source_hash:sha(readFileSync(`${original}/output-${id}.json`)),estimated_token_delta:new ContextBudgetManager(policy).measure(prompt).estimated_tokens-new ContextBudgetManager(policy).measure(source.prompt).estimated_tokens};
});
for(const id of ['A-negative','B-negative']){
 const item=structuredClone(plan.find(p=>p.id===id));item.id=`omitted-${id}`;
 for(const message of item.prompt.messages)message.content=message.content.replace(/\nMannerisms:\n(?:- [^\n]+\n?)+/g,'\n');
 if(sha(item.prompt)===item.request_hash)throw new Error('Omission failed');item.request_hash=sha(item.prompt);plan.push(item);
}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/);
const frozen=Object.fromEntries(files.map(p=>[p,sha(readFileSync(p))]));
const manifest={model:selectedModels().narrator,new_rule:MANNERISM_NARRATOR_RULE,plan,production_hashes:frozen,max_calls:12,cap_usd:1};
if(manifest.model!=='z-ai/glm-5.2'||NARRATOR_OUTPUT_TOKENS!==512)throw new Error('Production configuration changed');
if(process.argv.includes('--reinspect')){
 const rows=readdirSync(root).filter(n=>/^output-.*\.json$/.test(n)).map(file=>{
  const output=read(root,file.slice(0,-5)),diagnostics=inspect(output,output.result.text);
  return {id:output.id,narration_hash:sha(output.result.text),snapshot_unchanged:sha(output.snapshot)===output.snapshot_hash,diagnostics_identical:sha(diagnostics)===sha(output.diagnostics),diagnostics};
 });
 put('final-gate-reinspection',{production_hashes:frozen,rows});
 if(rows.some(r=>!r.snapshot_unchanged||!r.diagnostics_identical))throw new Error('Final gate differs on frozen live outputs; review explicitly.');
 console.log(JSON.stringify({reinspected:rows.length,diagnostics_identical:true,paid_calls:0}));process.exit(0);
}
if(!process.argv.includes('--live')){put('dry-manifest',manifest);console.log(JSON.stringify({dry:true,requests:plan.length,replayed:replay.length,epistemic_packing:true}));process.exit(0);}
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
  if(ledger.length>=12||spent+upper>1)throw new Error('D26 bounded paid-call/cost stop');
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
 output.attempts=attempts;if(output.result)output.diagnostics=inspect(item,output.result.text);output.snapshot_unchanged=sha(item.snapshot)===item.snapshot_hash;outputs.push(output);put(`output-${item.id}`,output);
 console.log(JSON.stringify({id:item.id,ok:!!output.result,calls:ledger.length,cost_usd:spent}));
 if(output.error||ledger.some(c=>c.metadata?.cost_usd===undefined))throw new Error('Failed/unmetered call; no reroll');
}}
catch(e){stop=e.message;}
const changed=files.filter(p=>frozen[p]!==sha(readFileSync(p)));
const originals_unchanged=ids.every(id=>sha(readFileSync(`${original}/output-${id}.json`))===plan.find(p=>p.id===id).source_hash);
put('summary',{model:manifest.model,outputs:outputs.length,paid_calls:ledger.length,reported_usd:spent,stop:stop??'complete',production_changed_during_run:changed,originals_unchanged,credits_before:before,unknown_cost_calls:ledger.filter(c=>c.metadata?.cost_usd===undefined).length});
if(stop||changed.length||!originals_unchanged)process.exitCode=1;
