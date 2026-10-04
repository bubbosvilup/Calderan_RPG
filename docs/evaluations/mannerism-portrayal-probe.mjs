/** Narrator-only diagnostic. Build first. No runtime campaign commits or learning. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { turnFixture } from '../../.build/src/dev/turn-fixture.js';
import { MANNERISM_SEEDS } from '../../.build/src/campaign/mannerism-seeds.js';
import { buildTurnContext } from '../../.build/src/turn/context-builder.js';
import { buildNarratorPrompt } from '../../.build/src/turn/prompt-builder.js';
import { prepareNarratorRequest, DEFAULT_CONTEXT_POLICY, ContextBudgetManager } from '../../.build/src/turn/context-budget.js';
import { LosslessContextCompactor } from '../../.build/src/turn/lossless-context-compaction.js';
import { MiniMaxNarratorProvider } from '../../.build/src/llm/openrouter/minimax-narrator.js';
import { OpenRouterClient } from '../../.build/src/llm/openrouter/client.js';
import { createDraftGenerator } from '../../.build/src/turn/stages/narration.js';
import { DEFAULT_RETRY_POLICY, ProviderBudget } from '../../.build/src/llm/retry.js';
import { selectedModels, NARRATOR_OUTPUT_TOKENS, contextCompressorModel } from '../../.build/src/app/provider-config.js';
const root='saves/mannerism-portrayal-probe'; mkdirSync(root,{recursive:true});
const put=(n,v)=>writeFileSync(`${root}/${n}.json`,JSON.stringify(v,null,2));
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const model=selectedModels().narrator;
if(model!=='z-ai/glm-5.2'||contextCompressorModel())throw new Error('Frozen production configuration differs; inspect before paying.');
const files=execFileSync('git',['ls-files','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/);
const freeze=Object.fromEntries(files.map(p=>[p,sha(readFileSync(p))]));
const cues={brenna:'pause_before_name',maren:'head_level_before_correction',gerome:'gaze_lower_before_lie'};
const matrix=[
  {id:'A-positive',npc:'brenna',kind:'positive',trigger:true,input:'I greet Brenna as I sit beside the table.',presentation:'Brenna is about to greet Nicco with a short sentence beginning with his established name, Nicco.'},
  {id:'A-negative',npc:'brenna',kind:'negative',trigger:false,input:'I look out of the arched window with Brenna in silence.',presentation:'Brenna is silently watching the light through the window. Nobody is speaking or preparing to address anyone.'},
  {id:'A-quiet',npc:'brenna',kind:'quiet',trigger:false,input:'I stay quietly beside the table for a little while.',presentation:'Brenna is resting quietly on the edge of the bed. There is no conversation.'},
  {id:'A-repeat',npc:'brenna',kind:'repeat',trigger:false,previous:'A-negative',input:'I continue watching the light through the window in silence.',presentation:'Brenna remains quietly beside the window. Nobody is speaking or preparing to address anyone.'},
  {id:'B-positive',npc:'maren',kind:'positive',trigger:true,input:'I say to Maren, "The eastern bridge is open."',presentation:'Maren knows that the eastern bridge is closed. She is about to correct Nicco\'s mistaken spoken statement with that factual detail.'},
  {id:'B-negative',npc:'maren',kind:'negative',trigger:false,input:'I say to Maren, "The eastern bridge is closed. We can leave that route for another day."',presentation:'Maren knows the eastern bridge is closed. Nicco\'s statement is factually correct; there is no mistaken detail to correct.'},
  {id:'B-quiet',npc:'maren',kind:'quiet',trigger:false,input:'I sit quietly with Maren near the table.',presentation:'Maren is quietly sitting near the table. No statement or question has been spoken.'},
  {id:'B-repeat',npc:'maren',kind:'repeat',trigger:false,previous:'B-negative',input:'I leave the route discussion there and sit quietly with Maren.',presentation:'Maren is quietly sitting near the table. The accurate route statement needs no correction.'},
  {id:'C-positive',npc:'gerome',kind:'positive',trigger:true,input:'I wait for Gerome to answer Maren with a gesture.',presentation:'Gerome has visibly remained by the wall for the entire last minute. Maren has just asked whether he crossed the room during that minute. He is about to give a knowingly false affirmative nod: an obvious nonverbal lie. Gerome remains a silent stone construct.'},
  {id:'C-negative',npc:'gerome',kind:'negative',trigger:false,input:'Gerome, thank you for being here. I leave space for whatever gesture you want to make.',presentation:'Gerome is standing quietly beside the wall, hearing a sincere thanks. No false claim, lie, denial or question is involved.'},
  {id:'C-quiet',npc:'gerome',kind:'quiet',trigger:false,input:'I sit quietly while Gerome stands beside the wall.',presentation:'Gerome stands silently beside the wall. No one is speaking or signaling anything, and no lie is involved.'},
  {id:'C-repeat',npc:'gerome',kind:'repeat',trigger:false,previous:'C-negative',input:'I remain quietly beside Gerome for another moment.',presentation:'Gerome stands silently beside the wall. No false claim, lie, denial or question is involved.'},
];
function fixture(c){
  const f=turnFixture();
  f.campaign.apply({expected_revision:f.campaign.revision,commands:[
    {kind:'create_household',id:'campaign_household_portrayal',name:'Tower household'},
    {kind:'set_membership',household_id:'campaign_household_portrayal',membership:{character_id:'nicco',status:'member',role:'owner'}},
    ...Object.keys(cues).map(character_id=>({kind:'join_household',household_id:'campaign_household_portrayal',character_id})),
    {kind:'set_knowledge',knowledge:{character_id:'maren',fact_id:'campaign_fact_bridge_closed',status:'knows'}},
    {kind:'set_condition',character_id:c.npc,conditions:c.npc==='brenna'?['recovering']:[],presentation:c.presentation},
  ]});
  // Select exact authored definitions in disposable fixture setup only.
  for(const p of f.campaign.exportSnapshot().premium_characters){
    f.campaign.deleteMannerism({expected_revision:f.campaign.revision,character_id:p.character_id,id:p.mannerisms[0].id});
    const {category,...definition}=MANNERISM_SEEDS.find(s=>s.canonical_key===cues[p.character_id]);
    f.campaign.addMannerism({expected_revision:f.campaign.revision,character_id:p.character_id,definition});
  }
  const snapshot=f.campaign.exportSnapshot();
  if(snapshot.premium_characters.some(p=>p.mannerisms.length!==1)||snapshot.premium_reflections.length)throw new Error('Unexpected fixture cue/reflection state');
  return {...f,snapshot};
}
const policy={...DEFAULT_CONTEXT_POLICY,output_tokens:NARRATOR_OUTPUT_TOKENS};
const compactor=new LosslessContextCompactor(undefined,new ContextBudgetManager(policy));
const outputs=[];
function request(c){
  const f=fixture(c);
  const prior=c.previous?outputs.find(o=>o.case.id===c.previous):undefined;
  if(c.previous&&!prior?.result)throw new Error('Repeated scene requires its recorded predecessor');
  const recent=prior?[{player:prior.case.input,narration:prior.result.text,status:'finalized'}]:[];
  const context=buildTurnContext(f.world,f.snapshot,{input:c.input,recent_text:recent.map(r=>`${r.player} ${r.narration}`).join(' ')});
  const prompt=prepareNarratorRequest(buildNarratorPrompt(c.input,context,recent,undefined,{candidates:[],runtime:[]}),compactor,policy);
  const text=JSON.stringify(prompt);
  for(const key of Object.values(cues))if(!text.includes(MANNERISM_SEEDS.find(s=>s.canonical_key===key).text))throw new Error('Normal packing omitted a cue');
  return {snapshot:f.snapshot,prompt,recent,snapshot_hash:sha(f.snapshot),request_hash:sha(prompt),budget:new ContextBudgetManager(policy).measure(prompt)};
}
if(!process.argv.includes('--live')){
  const previews=matrix.filter(c=>!c.previous).map(c=>({case:c,...request(c)}));
  put('dry-manifest',{model,matrix,cues:Object.fromEntries(Object.entries(cues).map(([id,k])=>[id,MANNERISM_SEEDS.find(s=>s.canonical_key===k)])),production_hashes:freeze,previews,max_paid_calls:18});
  console.log(JSON.stringify({dry:true,primary_calls:12,ablation_calls:6,model,previews:previews.length})); process.exit(0);
}
if(existsSync(`${root}/paid-run.started.json`))throw new Error('Existing paid run; no rerolls permitted');
const creditsResponse=await fetch('https://openrouter.ai/api/v1/credits',{headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`}});
if(!creditsResponse.ok)throw new Error('Credit preflight failed');
const credits=(await creditsResponse.json()).data;
const modelResponse=await fetch('https://openrouter.ai/api/v1/models');if(!modelResponse.ok)throw new Error('Price preflight failed');
const pricing=(await modelResponse.json()).data.find(m=>m.id===model)?.pricing;
if(!pricing||credits.total_credits-credits.total_usage<4)throw new Error('Insufficient verified reserve or pricing');
put('paid-run.started',{at:new Date().toISOString(),model,matrix,production_hashes:freeze,credits,pricing,cap_usd:1,max_paid_calls:18});
const ledger=[];let spent=0,logical='',stop;
class Metered extends OpenRouterClient{
  async *request(body,streaming,timeout,signal){
    const upper=2*(Buffer.byteLength(JSON.stringify(body))*Number(pricing.prompt)+body.max_tokens*Number(pricing.completion));
    if(ledger.length>=18||spent+upper>1)throw new Error('Probe paid-call/cost cap reached');
    const entry={call:ledger.length+1,logical,body,text:'',started_at:new Date().toISOString()};ledger.push(entry);put('ledger',ledger);
    try{for await(const e of super.request(body,streaming,timeout,signal)){
      if(e.type==='text_delta')entry.text+=e.text;else{entry.metadata=e.metadata;entry.status='completed';if(e.metadata.cost_usd!==undefined)spent+=e.metadata.cost_usd;}
      yield e;
    }}catch(e){entry.status='failed';entry.error=e.code??e.message;throw e;}finally{put('ledger',ledger);}
  }
}
const provider=new MiniMaxNarratorProvider(new Metered(),{model,max_output_tokens:NARRATOR_OUTPUT_TOKENS,disable_reasoning:true});
async function generate(id,frozen,c){
  logical=id;const abort=new AbortController();let attempts;
  const output={id,case:c,...frozen};
  put(`request-${id}`,output);
  try{const draft=await createDraftGenerator(provider,abort.signal,()=>{},undefined,{policy:DEFAULT_RETRY_POLICY,budget:new ProviderBudget(DEFAULT_RETRY_POLICY),record:r=>{attempts=r;}})(frozen.prompt);output.result=draft.result;}
  catch(e){output.error=e.code??e.message;}
  output.attempts=attempts;output.snapshot_unchanged=sha(frozen.snapshot)===frozen.snapshot_hash;
  put(`output-${id}`,output);outputs.push(output);console.log(JSON.stringify({id,ok:!!output.result,calls:ledger.length,reported_usd:spent}));
  if(output.error||ledger.some(c=>c.metadata?.cost_usd===undefined))throw new Error('Failed/unmetered transport; stop without reroll');
  return output;
}
try{
  for(const c of matrix)await generate(c.id,request(c),c);
  for(const id of ['A-negative','B-negative','C-negative']){
    const primary=outputs.find(o=>o.id===id);
    const frozen={snapshot:primary.snapshot,prompt:primary.prompt,recent:primary.recent,snapshot_hash:primary.snapshot_hash,request_hash:primary.request_hash,budget:primary.budget};
    const omitted=structuredClone(frozen);
    for(const m of omitted.prompt.messages){m.content=m.content.replace(/\nMannerisms:\n(?:- [^\n]+\n?)+/g,'\n');}
    if(omitted.prompt.system_prompt!==frozen.prompt.system_prompt||sha(omitted.prompt)===sha(frozen.prompt))throw new Error('Invalid omission control');
    // Shared production instruction, authoritative state, player input and recent conversation stay identical.
    if(!JSON.stringify(omitted.prompt).includes('Mannerisms are small optional recurring cues'))throw new Error('Shared rule unexpectedly altered');
    omitted.request_hash=sha(omitted.prompt);omitted.budget=new ContextBudgetManager(policy).measure(omitted.prompt);
    put(`pair-${id}`,{normal_request_hash:frozen.request_hash,omitted_request_hash:omitted.request_hash,snapshot_hash:frozen.snapshot_hash,removed_cues:Object.values(cues).map(k=>MANNERISM_SEEDS.find(s=>s.canonical_key===k).text),shared_rule_retained:true});
    await generate(`control-${id}-with`,frozen,primary.case);
    await generate(`control-${id}-without`,omitted,primary.case);
  }
}catch(e){stop=e.message;}
const changed=files.filter(p=>freeze[p]!==sha(readFileSync(p)));
const afterResponse=await fetch('https://openrouter.ai/api/v1/credits',{headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`}});
const after=afterResponse.ok?(await afterResponse.json()).data:undefined;
put('summary',{model,primary_outputs:outputs.filter(o=>!o.id.startsWith('control')).length,control_outputs:outputs.filter(o=>o.id.startsWith('control')).length,paid_calls:ledger.length,reported_usd:spent,unknown_cost_calls:ledger.filter(c=>c.metadata?.cost_usd===undefined).length,stop:stop??'complete',production_changed:changed,credits_before:credits,credits_after:after,account_delta:after?after.total_usage-credits.total_usage:undefined});
if(stop||changed.length)process.exitCode=1;
