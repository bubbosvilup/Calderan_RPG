/** Evaluation-only continuous production session, checkpointed at 25/50; no source/prompt patches. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {turnFixture} from '../../.build/src/dev/turn-fixture.js';
import {CampaignState} from '../../.build/src/campaign/campaign-state.js';
import {decodeSave} from '../../.build/src/persistence/save-format.js';
import {GameSession} from '../../.build/src/app/game-session.js';
import {readProviderStatus} from '../../.build/src/app/production.js';
import {selectedModels,mannerismExtractorModel,contextCompressorModel,NARRATOR_OUTPUT_TOKENS} from '../../.build/src/app/provider-config.js';
import {OpenRouterClient} from '../../.build/src/llm/openrouter/client.js';
import {MiniMaxNarratorProvider} from '../../.build/src/llm/openrouter/minimax-narrator.js';
import {OpenRouterStateControllerProvider} from '../../.build/src/llm/openrouter/state-controller.js';
import {OpenRouterReflectionProvider} from '../../.build/src/llm/openrouter/reflection-provider.js';
import {OpenRouterMannerismExtractor} from '../../.build/src/llm/openrouter/mannerism-extractor.js';
import {FileCampaignRepository} from '../../.build/src/persistence/campaign-repository.js';
import {TurnCoordinator} from '../../.build/src/turn/turn-coordinator.js';
import {RetrievalService} from '../../.build/src/retrieval/retrieval-service.js';
import {HybridSearch} from '../../.build/src/retrieval/hybrid-search.js';
import {LosslessContextCompactor} from '../../.build/src/turn/lossless-context-compaction.js';
import {ContextBudgetManager,DEFAULT_CONTEXT_POLICY} from '../../.build/src/turn/context-budget.js';
import {reflectionDue} from '../../.build/src/turn/reflection.js';
const root='saves/d09-soak-v2';mkdirSync(root,{recursive:true});
const put=(n,v)=>writeFileSync(`${root}/${n}.json`,JSON.stringify(v,null,2));
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const source='saves/d09-soak/campaign/turn_fixture/save.json',sourceHash=sha(readFileSync(source));
const files=execFileSync('git',['ls-files','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/),freeze=Object.fromEntries(files.map(p=>[p,sha(readFileSync(p))]));
const fixture=turnFixture(),snapshot=decodeSave(readFileSync(source,'utf8'),fixture.world).snapshot;
let campaign=CampaignState.restore(fixture.world,snapshot);
const plan=[
 'House rule: ask before moving another household member\'s belongings.',
 'Brenna, I remember you preferred company while recovering. Is sitting nearby still helpful today?',
 'Maren, could we agree on one small practical thing to do together this morning?',
 'House rule: anyone may ask for a quiet break without having to explain.',
 'I tell Brenna and Maren that the eastern bridge is closed, and ask which other route they would prefer when we eventually travel.',
 'Maren, what part of that route discussion matters most to you?',
 'Brenna, I thank you for telling me plainly when company helps. Disagreement is welcome too.',
 'Gerome, I thank you for staying nearby and leave room for a gesture rather than asking you to speak.',
 'House rule: tell the household before leaving so nobody has to search for you.',
 'I ask Brenna and Maren whether they would like to go downstairs with me; they may stay here instead.',
 'I go downstairs to the main hall, leaving the choice to follow to everyone else.',
 'I greet whoever is here and ask what modest task would make the hall more comfortable.',
 'I set my sturdy boots beside the long table so I can sit more comfortably, keeping them in sight.',
 'I listen to those present and ask which part of our household rules they find practical or inconvenient.',
 'I admit I interrupted earlier, apologize, and wait for the person speaking to finish.',
 'I pick up my sturdy boots from beside the long table.',
 'I go upstairs to the observation room.',
 'I greet those present and ask how their quiet break went, without assuming they enjoyed it.',
 'Maren, if you are here, I ask whether our route discussion left anything unresolved.',
 'Brenna, if you are here, I ask which offer of help today was useful and which was unnecessary.',
 'I promise to ask before making plans that involve anyone else, and invite a reminder if I forget.',
 'I sit quietly with those present for five minutes.',
 'I ask those present what changed between this morning and now, even if the answer is very little.',
 'I thank those present for the practical advice, without treating their patience as agreement.',
 'I ask whether tomorrow should keep the same rhythm or leave more room for separate plans.',
 'I greet everyone present and ask which unfinished practical matter should come first today.',
 'Maren, if you are here, I ask what you remember about why we set the bridge route aside.',
 'Brenna, if you are here, I ask whether company still helps or whether a quiet break would be better.',
 'Gerome, if you are here, I make space beside the table and thank you for your help without assigning feelings to your silence.',
 'I ask those present whether asking before moving belongings has been convenient or cumbersome.',
 'I ask whether anyone would like to spend a little time in the main hall rather than this room.',
 'I go downstairs to the main hall.',
 'I greet whoever is here and ask what they want to do independently today.',
 'I say I have not forgotten the promise to ask before planning for other people, and ask whether I have kept it.',
 'I listen without defending myself and thank whoever answered plainly.',
 'I look around the hall and leave a little silence rather than assigning anyone a task.',
 'I go upstairs to the observation room.',
 'I ask those present whether we need to revise any practical arrangements from yesterday.',
 'Maren, if you are here, I ask which of our conversations you would like to continue.',
 'Brenna, if you are here, I ask how you would like company and rest to fit together today.',
 'I tell those present that I would rather hear a correction than repeat a mistake.',
 'I ask whether leaving room for disagreement has changed how we make small decisions.',
 'I sit quietly for five minutes with whoever chooses to stay.',
 'I ask those present if any quiet-break request went unheard and listen to the answer.',
 'I thank those present for keeping me informed of their separate plans.',
 'I ask whether anyone would prefer a change of scene; nobody needs to follow me.',
 'I go downstairs to the main hall.',
 'I greet whoever is here and ask what should carry over from the last two days.',
 'I listen to the answer and ask which detail I should remember next time.',
 'I ask those present to suggest one modest next step, leaving them free to disagree.',
];
const models=selectedModels(),status=readProviderStatus(),extractorModel=mannerismExtractorModel();
if(models.narrator!=='z-ai/glm-5.2'||models.controller!=='qwen/qwen3.8-flash'||extractorModel!==models.controller||contextCompressorModel())throw new Error('Production configuration differs from frozen brief');
const manifest={source,source_sha256:sourceHash,source_category:'C: disposable continuation of previously played synthetic current-engine campaign; no real compatible save/history-state reconstruction available',previous_finalized_turns:4,baseline_revision:snapshot.revision,models:{...models,reflection:status.reflection_model,extractor:extractorModel},plan,production_sha256:freeze,git:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cap_usd:3,max_paid_narrator_calls:100};
if(!process.argv.includes('--live')){put('dry-manifest',manifest);console.log(JSON.stringify({dry:true,planned_turns:plan.length,source_category:manifest.source_category,models:manifest.models}));process.exit(0);}
if(existsSync(`${root}/started.json`))throw new Error('Existing run; no rerolls or second paid session');
const headers={Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`};
const creditResponse=await fetch('https://openrouter.ai/api/v1/credits',{headers});if(!creditResponse.ok)throw new Error('Credit preflight failed');const credits=(await creditResponse.json()).data;
const priceResponse=await fetch('https://openrouter.ai/api/v1/models');if(!priceResponse.ok)throw new Error('Price preflight failed');const available=(await priceResponse.json()).data;
const prices=Object.fromEntries([...new Set(Object.values(manifest.models))].map(id=>[id,available.find(m=>m.id===id.replace(/:nitro$/, ''))?.pricing]));
if(Object.values(prices).some(p=>!p)||credits.total_credits-credits.total_usage<4)throw new Error('Pricing/reserve unavailable');
writeFileSync(`${root}/started.json`,JSON.stringify({...manifest,credits,prices,at:new Date().toISOString()},null,2),{flag:'wx'});
copyFileSync(source,`${root}/source-copy.json`);put('baseline',campaign.exportSnapshot());
let turn=0,spent=0,unknown=false,stop='complete';const ledger=[],records=[];
class Metered extends OpenRouterClient{
 constructor(family){super();this.family=family;}
 async *request(body,streaming,timeout,signal){
  const rates=prices[body.model],upper=2*(Buffer.byteLength(JSON.stringify(body))*Number(rates.prompt)+body.max_tokens*Number(rates.completion));
  if(unknown||spent+upper>3||this.family==='narrator'&&ledger.filter(c=>c.family==='narrator').length>=100)throw new Error('Hard evaluation budget/call stop');
  const entry={call:ledger.length+1,turn,family:this.family,body,text:'',started_at:new Date().toISOString()};ledger.push(entry);put('ledger',ledger);
  try{for await(const event of super.request(body,streaming,timeout,signal)){
   if(event.type==='text_delta')entry.text+=event.text;else{entry.metadata=event.metadata;entry.status='completed';if(event.metadata.cost_usd===undefined)unknown=true;else spent+=event.metadata.cost_usd;}yield event;
  }}catch(e){entry.status='failed';entry.error=e.code??e.message;unknown=true;throw e;}finally{put('ledger',ledger);}
 }
}
const policy={...DEFAULT_CONTEXT_POLICY,output_tokens:NARRATOR_OUTPUT_TOKENS},compaction=new LosslessContextCompactor(undefined,new ContextBudgetManager(policy));
const repository=new FileCampaignRepository(fixture.world,`${root}/campaign`),service=new RetrievalService(fixture.world);
const reflection=new OpenRouterReflectionProvider(new Metered('reflection'),{model:status.reflection_model});
const extractor=new OpenRouterMannerismExtractor(new Metered('extractor'),{model:extractorModel});
let requests=[],maintenance=[],reflectionRequests=[],diagnostics,deliveredState;
const deps={world:fixture.world,repository,context_policy:policy,compaction_service:compaction,unsafe_trace:true,provider_status:status,
 createCoordinator:hooks=>{
  const narrator=new MiniMaxNarratorProvider(new Metered('narrator'),{model:models.narrator,max_output_tokens:NARRATOR_OUTPUT_TOKENS,disable_reasoning:true});
  const capture=req=>{const {signal,...data}=req;requests.push(structuredClone(data));};
  return new TurnCoordinator(fixture.world,{generate(req){capture(req);return narrator.generate(req);},async *stream(req){capture(req);yield* narrator.stream(req);}},new OpenRouterStateControllerProvider(new Metered('controller'),{model:models.controller}),{service,search:new HybridSearch(service)},
   {context_policy:policy,context_compaction:compaction,diagnostics_include_query:true,diagnostics_sink:d=>{diagnostics=structuredClone(d);hooks.diagnostics_sink(d);}});
 },reflection_provider:{async reflect(req){const record={request:req};reflectionRequests.push(record);try{return record.result=await reflection.reflect(req);}catch(e){record.error=e.code??e.message;throw e;}}},
 mannerism_extractor:{async extract(req){const {signal,...data}=req,record={request:data};maintenance.push(record);try{return record.result=await extractor.extract(req);}catch(e){record.error=e.code??e.message;throw e;}}},
 mannerism_diagnostics_sink:run=>maintenance.push({run})};
const session=GameSession.fromCampaign(deps,campaign);
function summary(){
 const runs=records.flatMap(r=>r.maintenance.filter(m=>m.run).map(m=>m.run)),extractorCalls=ledger.filter(c=>c.family==='extractor').length,malformed=runs.filter(r=>r.status==='malformed').length;
 const gates=records.filter(r=>r.outcome.ok).map(r=>r.diagnostics?.mannerism_portrayal).filter(Boolean);
 return {stop,attempted:turn,finalized:records.filter(r=>r.outcome.ok).length,spent_usd:spent,unknown_cost:unknown,calls_by_family:Object.fromEntries(['narrator','controller','extractor','reflection'].map(f=>[f,ledger.filter(c=>c.family===f).length])),malformed,extractor_calls:extractorCalls,cue_exposures:gates.reduce((n,g)=>n+g.mannerism_cues_packed,0),findings:gates.reduce((n,g)=>n+g.gate_findings_total,0),notes:campaign.exportSnapshot().premium_reflections.reduce((n,r)=>n+r.notes.length,0),source_unchanged:sourceHash===sha(readFileSync(source)),production_changed:files.filter(p=>freeze[p]!==sha(readFileSync(p)))};
}
try{for(const input of plan){
 turn++;requests=[];maintenance=[];reflectionRequests=[];diagnostics=undefined;deliveredState=undefined;
 const before=campaign.exportSnapshot();const outcome=await session.submitPlayerInput(input,{onEvent:event=>{if(event.type==='turn_completed')deliveredState=campaign.exportSnapshot();}});
 const after=campaign.exportSnapshot(),dueChecks=(deliveredState??before).premium_characters.map(p=>({character_id:p.character_id,due:reflectionDue(deliveredState??before,p.character_id),developments_since_cursor:p.dynamic.recent_developments.filter(e=>e.revision>((deliveredState??before).premium_reflections.find(r=>r.character_id===p.character_id)?.last_reflected_revision??-1)).length}));
 const shadowReview=(diagnostics?.mannerism_portrayal?.findings??[]).map(f=>{const at=outcome.narration?.indexOf(f.matched_narration_span)??-1;return {finding:f,local_context:at<0?'':outcome.narration.slice(Math.max(0,at-200),at+f.matched_narration_span.length+300),packed:requests.some(p=>p.messages.some(m=>m.content.includes(f.mannerism_text)))};});
 const record={turn,input,before,deliveredState,after,outcome,requests,diagnostics,maintenance,reflectionRequests,dueChecks,shadowReview};records.push(record);put(`turn-${String(turn).padStart(3,'0')}`,record);put('live-summary',summary());
 console.log(JSON.stringify({turn,ok:outcome.ok,notes:summary().notes,findings:summary().findings,malformed:summary().malformed,spend:spent}));
 const s=summary();
 if(!outcome.ok||unknown){stop='pipeline_or_unmetered_call';break;}
 if(outcome.narration.includes('HIDDEN_SECRET_SENTINEL')){stop='privacy_leak';break;}
 if(s.malformed>=3||s.extractor_calls>=10&&s.malformed/s.extractor_calls>.2){stop='extractor_provider_quality_blocker';break;}
 if(turn>=10&&s.findings/s.cue_exposures>.25){stop='pathological_shadow_rate_review_required';break;}
 if(spent>2.8){stop='budget_reserve_stop';break;}
 if(turn===25||turn===50){
  const saved=await session.save();if(!saved.ok)throw new Error('Checkpoint save failed');
  const loaded=await repository.loadCampaign(after.campaign_id);if(sha(loaded.campaign.exportSnapshot())!==sha(after))throw new Error('Save/load authority mismatch');
  put(`checkpoint-${turn}`,{...summary(),save_load_exact:true});console.log(JSON.stringify({checkpoint:turn,awaiting_internal_review:true}));
  const control=`${root}/decision-${turn}.json`;const deadline=Date.now()+1800000;
  while(!existsSync(control)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1000));
  if(!existsSync(control)||JSON.parse(readFileSync(control,'utf8')).action!=='continue'){stop=`checkpoint_${turn}_stop`;break;}
 }
}}
catch(e){stop=e.message;}
const saved=await session.save();put('final-snapshot',campaign.exportSnapshot());put('summary',{...summary(),save_ok:saved.ok});
if(summary().production_changed.length||!summary().source_unchanged)throw new Error('Production/source freeze violated');
