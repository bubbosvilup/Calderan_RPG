/**
 * Development-rich disposable current-engine play (Phase 4 corpus play and Phase 12 candidate E2E). Normal player turns through GameSession only.
 *   --mode corpus : reflection provider is a CAPTURE STUB returning the valid empty proposal (cursor advances exactly as production does on an empty reflection); no paid reflection call.
 *   --mode e2e --model deepseek|qwen --schema current|strict : reflection is a live eval provider (model/schema override ONLY); mannerism extractor ON as in production.
 * No production file is modified; no development, contract, household event, movement or knowledge is injected: after the household-membership baseline (same baseline as eval-organic-reflection) every change comes from a player turn.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync,appendFileSync} from 'node:fs';
import {turnFixture} from '../../../.build/src/dev/turn-fixture.js';
import {GameSession} from '../../../.build/src/app/game-session.js';
import {readProviderStatus} from '../../../.build/src/app/production.js';
import {selectedModels,mannerismExtractorModel,NARRATOR_OUTPUT_TOKENS} from '../../../.build/src/app/provider-config.js';
import {OpenRouterClient} from '../../../.build/src/llm/openrouter/client.js';
import {MiniMaxNarratorProvider} from '../../../.build/src/llm/openrouter/minimax-narrator.js';
import {OpenRouterStateControllerProvider} from '../../../.build/src/llm/openrouter/state-controller.js';
import {OpenRouterMannerismExtractor} from '../../../.build/src/llm/openrouter/mannerism-extractor.js';
import {FileCampaignRepository} from '../../../.build/src/persistence/campaign-repository.js';
import {TurnCoordinator} from '../../../.build/src/turn/turn-coordinator.js';
import {RetrievalService} from '../../../.build/src/retrieval/retrieval-service.js';
import {HybridSearch} from '../../../.build/src/retrieval/hybrid-search.js';
import {LosslessContextCompactor} from '../../../.build/src/turn/lossless-context-compaction.js';
import {ContextBudgetManager,DEFAULT_CONTEXT_POLICY} from '../../../.build/src/turn/context-budget.js';
import {reflectionDue,reflectionEvidence} from '../../../.build/src/turn/reflection.js';
import {characterView} from '../../../.build/src/campaign/projections.js';
import {sha,MODELS,SCHEMAS,reflectCall,Ledger,meteredFetch,validationContext,describeCall} from './lib.mjs';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const mode=arg('--mode','corpus'),maxTurns=Number(arg('--turns',100)),cap=Number(arg('--cap',1.5)),targetRequests=Number(arg('--target-requests',999));
const root=arg('--root',mode==='corpus'?'saves/d09-reflection-bakeoff/play':'saves/d09-reflection-candidate-e2e'),model=arg('--model','qwen'),schemaName=arg('--schema','strict');
if(existsSync(`${root}/started.json`)&&!process.argv.includes('--resume-forbidden-override'))throw new Error('Existing run at '+root+'; no rerolls');
mkdirSync(root,{recursive:true});
const put=(n,v)=>writeFileSync(`${root}/${n}.json`,JSON.stringify(v,null,2));
const ledger=new Ledger(root,{cap_usd:cap});
const models=selectedModels(),status=readProviderStatus(),extractorModel=mannerismExtractorModel();
if(models.narrator!=='z-ai/glm-5.2'||models.controller!=='qwen/qwen3.8-flash'||extractorModel!==models.controller)throw new Error('Production configuration differs from frozen brief');

// ---- scripted plan: categories rotate; location-dependent entries resolve at run time. No outcome is scripted, only the player's own inputs.
const RULES=["House rule: ask before moving another household member's belongings.","House rule: anyone may ask for a quiet break without having to explain.","House rule: tell the household before leaving the tower so nobody has to search for you.","House rule: meals are shared at the long table whenever everyone is able.","House rule: the hearth is never left burning unattended overnight.","House rule: disagreements are spoken aloud, not left to fester.","House rule: guests are welcomed at the door and introduced to the household.","House rule: nobody is expected to carry more than they can manage; ask for help."];
const REL=[
 {need:['maren'],text:"I'm carrying a heavy basket of firewood toward the hearth. Maren, would you like to help, or would you rather I managed alone?"},
 {need:['brenna'],text:"Brenna, you've been on your feet a while. I offer you my arm toward the chair; take it only if you want it."},
 {need:['maren'],text:"I tell Maren I am worried the bridge closure will strand us, and wait to hear what she says."},
 {need:['brenna'],text:"I hand Brenna a cup of warm broth and step back to give her room."},
 {need:['maren'],text:"I knock over a stack of plates near Maren with a loud crash and apologize at once."},
 {need:['gerome'],text:"Gerome, I ask you to carry the heavy chest across the room; decline if it is beyond what you will do."},
 {need:['brenna'],text:"A draft slams the shutter toward Brenna's hand as she reaches for it, and I rush over to check on her."},
 {need:['brenna','maren'],text:"I tell Brenna that Maren seemed worried earlier and ask whether she would like to talk with her."},
 {need:['maren'],text:"Maren, would you teach me a small craft you know? I'll be a clumsy student."},
 {need:['gerome','brenna'],text:"I thank Gerome for steadying the table and ask Brenna to hold the other end while I wipe it down."},
 {need:['brenna','maren'],text:"I admit to Brenna and Maren that I was short-tempered earlier and ask how they would like me to make it right."},
 {need:['maren'],text:"Maren, I offer to share the work of mending this torn sleeve. Would you like company or quiet?"},
 {need:['brenna'],text:"I ask Brenna whether she would prefer the chair by the hearth or by the window, and move it where she says."},
 {need:['maren'],text:"I ask Maren to hold the lantern steady while I mend the latch, and thank her."},
 {need:['gerome'],text:"Gerome, I place the water jug on the table and ask whether you would steady it for me."},
 {need:['brenna','maren'],text:"I ask Brenna and Maren to settle who should keep the spare key; I will abide by whatever they choose."},
 {need:['brenna'],text:"Brenna, I ask whether you would rather rest or help me sort these blankets, and respect your answer."},
 {need:['maren'],text:"Maren, I ask whether you would like to choose what we cook tonight."}];
const CONTRACT=[
 {need:['brenna'],text:"Brenna, in your own words, how do you speak when you are being honest with me? Tell me plainly."},
 {need:['maren'],text:"Maren, tell me in your own words one thing you would never do to anyone."},
 {need:['brenna'],text:"Brenna, is there something about people or places you simply cannot stand? Say it your way."},
 {need:['maren'],text:"Maren, how would you describe yourself in one sentence beginning 'I've always been'?"}];
const COND=[
 {need:['maren'],text:"I stumble on the top stair and catch Maren's arm; we both bump the wall and she scrapes her elbow."},
 {need:['brenna'],text:"I swing the heavy door open and it clips Brenna's shoulder; she winces and I apologize."}];
const TALK=["I ask whether anyone needs anything before we carry on.","I sit quietly and listen to what the room is like right now.","I thank everyone present for the day so far and ask what comes next.","I ask what each of them noticed about the weather today."];
const NAMES={brenna:'Brenna',gerome:'Gerome',maren:'Maren'},IDS=Object.keys(NAMES);
const npcLoc=s=>Object.fromEntries(s.runtime.npc_locations.map(x=>[x.character_id,x.current_location]));
const PLACE={test_room:'the observation room',test_hall:'the main hall',test_yard:'the courtyard'};
const PATH={test_room:['test_hall'],test_hall:['test_room'],test_yard:['test_hall']};
const verb={test_room:'I go upstairs to the observation room',test_hall:'I go downstairs to the main hall',test_yard:'I step out the back door into the courtyard'};
const goTo=(dest,from)=>dest==='test_hall'&&from==='test_yard'?'I walk back in through the door to the main hall':verb[dest];
const dir={test_room:'up to the observation room',test_hall:'down to the main hall',test_yard:'out through the back door to the courtyard'};
const usedPrompts=new Set();let cnt={rule:0,rel:0,contract:0,cond:0,talk:0,move:0,send:0,sendDest:0};let relIdx=0;
const nameList=ids=>ids.map(i=>NAMES[i]).join(ids.length===2?' and ':', ');
/** Plain player choices only: ask a present household member to go somewhere and wait; declare rules; speak. Nothing about the outcome is scripted. */
function pick(i,snapshot){
  const here=snapshot.runtime.scene.player_location,loc=npcLoc(snapshot),present=IDS.filter(id=>loc[id]===here);
  if(!present.length){const best=PATH[here].map(o=>[o,IDS.filter(id=>loc[id]===o).length]).sort((a,b)=>b[1]-a[1])[0];cnt.move++;return {k:'rejoin',text:`${goTo(best[0],here)}.`};}
  const kinds=['send','rule','rel','send','contract','send','cond','talk'];let k=kinds[i%kinds.length];
  if(k==='rule'&&cnt.rule>=RULES.length)k='send';
  const usable=bank=>{for(let t=0;t<bank.length;t++){const e=bank[(relIdx+t)%bank.length];if(!usedPrompts.has(e.text)&&e.need.every(n=>present.includes(n))){usedPrompts.add(e.text);relIdx=(relIdx+t+1)%bank.length;return e;}}return undefined;};
  if(k==='contract'){const rest=CONTRACT.slice(cnt.contract),e=rest.find(x=>x.need.every(n=>present.includes(n)));if(e){cnt.contract=CONTRACT.indexOf(e)+1;return {k,text:e.text};}k='rel';}
  if(k==='cond'){const rest=COND.slice(cnt.cond),e=rest.find(x=>x.need.every(n=>present.includes(n)));if(e){cnt.cond=COND.indexOf(e)+1;return {k,text:e.text};}k='rel';}
  if(k==='rel'){const e=usable(REL);if(e)return {k,text:e.text};k='talk';}
  if(k==='send'){const who=present[cnt.send++%present.length],opts=PATH[here],dest=opts[cnt.sendDest++%opts.length];return {k,text:`${NAMES[who]}, would you please go ${dir[dest]} and wait for me there? I'll be along shortly.`};}
  if(k==='rule')return {k,text:RULES[cnt.rule++]};
  return {k:'talk',text:TALK[(cnt.talk++)%TALK.length]};
}

// ---- state
const fixture=turnFixture(false,{courtyard:true});const campaign=fixture.campaign,world=fixture.world;
campaign.apply({expected_revision:campaign.revision,commands:[{kind:'create_household',id:'campaign_household_d09',name:'Tower household'},{kind:'set_membership',household_id:'campaign_household_d09',membership:{character_id:'nicco',status:'member',role:'owner'}},...['brenna','gerome','maren'].map(character_id=>({kind:'join_household',household_id:'campaign_household_d09',character_id}))]});
const baseline=campaign.exportSnapshot();
if(baseline.premium_characters.some(p=>p.dynamic.recent_developments.some(e=>e.kind!=='joined_household')||p.stable.contract_evidence?.length||p.dynamic.long_term)||baseline.premium_reflections.length)throw new Error('baseline unexpectedly seeded');
const headers={Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`};
const creditsBefore=(await (await fetch('https://openrouter.ai/api/v1/credits',{headers})).json()).data;
writeFileSync(`${root}/started.json`,JSON.stringify({mode,model,schemaName,cap,maxTurns,models,extractorModel,credits_before:creditsBefore,baseline_sha:sha(baseline),at:new Date().toISOString()},null,2),{flag:'wx'});
put('baseline',baseline);
const policy={...DEFAULT_CONTEXT_POLICY,output_tokens:NARRATOR_OUTPUT_TOKENS},compaction=new LosslessContextCompactor(undefined,new ContextBudgetManager(policy));
const repository=new FileCampaignRepository(world,`${root}/campaign`),service=new RetrievalService(world);
const scriptFile=arg('--script');const scriptInputs=scriptFile?JSON.parse(readFileSync(scriptFile,'utf8')):null;
const ctx={turn:0};const mk=f=>new OpenRouterClient({fetch:meteredFetch(ledger,f,ctx)});
let requests=[],maintenance=[],reflectionLog=[],diagnostics;
const captured=[];
const reflectionProvider=mode==='corpus'?{async reflect(req){
  const snap=campaign.exportSnapshot(),catalog=reflectionEvidence(world,snap,req.character.id),vc=validationContext(world,snap,req.character.id,characterView);
  const premium=snap.premium_characters.find(p=>p.character_id===req.character.id),cursor=snap.premium_reflections.find(r=>r.character_id===req.character.id)?.last_reflected_revision??-1;
  const rec={id:`play:T${ctx.turn}:${req.character.id}`,origin:'PLAYED',turn:ctx.turn,revision:snap.revision,cursor_before:cursor,developments_since_cursor:premium.dynamic.recent_developments.filter(e=>e.revision>cursor),rollup:premium.dynamic.long_term??null,
    request:{character:req.character,evidence:req.evidence,existing:req.existing},catalog,...vc,state_sha:sha(snap)};
  captured.push(rec);appendFileSync(`${root}/frozen-requests.jsonl`,JSON.stringify(rec)+'\n');reflectionLog.push({request_id:rec.id,provider:'capture_stub'});
  return {text:'{"proposals":[]}'};}}
 :{async reflect(req){
  const snap=campaign.exportSnapshot(),catalog=reflectionEvidence(world,snap,req.character.id),vc=validationContext(world,snap,req.character.id,characterView);
  const cursor=snap.premium_reflections.find(r=>r.character_id===req.character.id)?.last_reflected_revision??-1;
  const premium=snap.premium_characters.find(p=>p.character_id===req.character.id);
  const id=`e2e:T${ctx.turn}:${req.character.id}`;
  const r=await reflectCall({model:MODELS[model],schema:SCHEMAS[schemaName],request:req,ledger,tag:`reflection:${id}`,maxAttempts:2});
  const entry={request_id:id,turn:ctx.turn,revision:snap.revision,cursor_before:cursor,developments_since_cursor:premium.dynamic.recent_developments.filter(e=>e.revision>cursor),request:{character:req.character,evidence:req.evidence,existing:req.existing},catalog,...vc,...describeCall(r),attempts:r.attempts};
  reflectionLog.push(entry);
  if(!r.final)throw new Error(r.error);
  return {text:r.final.text,usage:r.final.metadata?.usage,model:r.final.metadata?.model};}};
const deps={world,repository,context_policy:policy,compaction_service:compaction,unsafe_trace:true,provider_status:status,
 createCoordinator:hooks=>{
  const narrator=new MiniMaxNarratorProvider(mk('narrator'),{model:models.narrator,max_output_tokens:NARRATOR_OUTPUT_TOKENS,disable_reasoning:true});
  const capture=req=>{const {signal,...data}=req;requests.push(structuredClone(data));};
  return new TurnCoordinator(world,{generate(req){capture(req);return narrator.generate(req);},async *stream(req){capture(req);yield* narrator.stream(req);}},new OpenRouterStateControllerProvider(mk('controller'),{model:models.controller}),{service,search:new HybridSearch(service)},
   {context_policy:policy,context_compaction:compaction,diagnostics_include_query:true,diagnostics_sink:d=>{diagnostics=structuredClone(d);hooks.diagnostics_sink(d);}});
 },reflection_provider:reflectionProvider,
 ...(mode==='e2e'?{mannerism_extractor:{async extract(req){const {signal,...data}=req,record={request:data};maintenance.push(record);const ex=new OpenRouterMannerismExtractor(mk('extractor'),{model:extractorModel});try{return record.result=await ex.extract(req);}catch(e){record.error=e.code??e.message;throw e;}}},mannerism_diagnostics_sink:run=>maintenance.push({run})}:{})};
const session=GameSession.fromCampaign(deps,campaign);
const devKinds=s=>s.premium_characters.flatMap(p=>p.dynamic.recent_developments.map(e=>`${p.character_id}:${e.revision}:${e.kind}:${e.actor_id??''}:${e.other_id??''}:${e.dimension??''}:${e.field??''}:${e.to??''}`));
const records=[];let failures=0,stop='complete';const tally={};
for(let i=0;i<(scriptInputs?Math.min(maxTurns,scriptInputs.length):maxTurns);i++){
  const before=campaign.exportSnapshot(),p=scriptInputs?{k:'script',text:scriptInputs[i]}:pick(i,before),turn=i+1;ctx.turn=turn;
  requests=[];maintenance=[];reflectionLog=[];diagnostics=undefined;let delivered;
  const outcome=await session.submitPlayerInput(p.text,{onEvent:e=>{if(e.type==='turn_completed')delivered=campaign.exportSnapshot();}});
  const after=campaign.exportSnapshot();
  const seen=new Set(devKinds(before));const fresh=devKinds(after).filter(x=>!seen.has(x));
  for(const f of fresh){const kind=f.split(':')[2];tally[kind]=(tally[kind]??0)+1;}
  const dueChecks=(delivered??before).premium_characters.map(c=>({character_id:c.character_id,due:reflectionDue(delivered??before,c.character_id),since:c.dynamic.recent_developments.filter(e=>e.revision>((delivered??before).premium_reflections.find(r=>r.character_id===c.character_id)?.last_reflected_revision??-1)).length}));
  const rec={turn,category:p.k,input:p.text,ok:outcome.ok,narration:outcome.narration??null,error:outcome.ok?null:outcome.error,new_developments:fresh,location:after.runtime.scene.player_location,revision:after.revision,dueChecks,
    committed:diagnostics?.commit??null,diagnostics,requests,maintenance,reflection:reflectionLog,reflection_notes:after.premium_reflections.map(r=>({character_id:r.character_id,last_reflected_revision:r.last_reflected_revision,notes:r.notes})),state_sha:sha(after)};
  records.push(rec);writeFileSync(`${root}/turn-${String(turn).padStart(3,'0')}.json`,JSON.stringify(rec,null,1));
  console.log(JSON.stringify({turn,k:p.k,ok:outcome.ok,fresh:fresh.length,calls:reflectionLog.length,captured:captured.length,spent:+ledger.spent.toFixed(4)}));
  if(!outcome.ok){failures++;if(failures>=4){stop='pipeline_failures';break;}}
  if(outcome.narration?.includes('HIDDEN_SECRET_SENTINEL')){stop='privacy_leak';break;}
  if(ledger.spent>cap*0.95){stop='budget';break;}
  if(captured.length>=targetRequests){stop='target_requests_reached';break;}
  if(turn%20===0)put(`snapshot-T${turn}`,after);
}
const saved=await session.save();put('final-snapshot',campaign.exportSnapshot());
const credits=(await (await fetch('https://openrouter.ai/api/v1/credits',{headers})).json()).data;
put('summary',{stop,turns:records.length,finalized:records.filter(r=>r.ok).length,failures,development_tally:tally,frozen_requests:captured.length,ledger_spent_usd:ledger.spent,credits_before:creditsBefore,credits_after:credits,account_delta_usd:credits.total_usage-creditsBefore.total_usage,save_ok:saved.ok});
console.log('DONE',stop);
