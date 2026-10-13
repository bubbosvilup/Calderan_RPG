/** Bounded, single-use evidence run. Production code/configuration are never changed. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,appendFile,access} from 'node:fs/promises';
import {createHash,randomInt} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createProductionDeps} from '../.build/src/app/production.js';
import {CampaignState} from '../.build/src/campaign/campaign-state.js';
import {GameSession} from '../.build/src/app/game-session.js';
import {createOpeningCampaign,OPENING_HOUSEHOLD} from '../.build/src/campaign/opening-state.js';
import {buildTurnContext} from '../.build/src/turn/context-builder.js';
import {captureProductionReflection} from '../.build/src/turn/structured-reflection-maintenance.js';
import {recoverNpcContext} from '../.build/src/turn/npc-plus.js';
import {OpenRouterClient} from '../.build/src/llm/openrouter/client.js';
import {exactBenchmarkCredential,benchmarkAuthentication} from '../.build/src/dev/reflection-benchmark.js';
const dir='saves/d09-final-matched-ablation';await mkdir(dir,{recursive:true});
const json=(file,value)=>writeFile(`${dir}/${file}`,JSON.stringify(value,null,2)+'\n');
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['reasoning','reasoning_details','reasoning_content'].includes(k)).map(([k,v])=>[k,clean(v)])):value;
const plan=[
 'Iris, while we sit together on the observation floor, what would make conversation comfortable for you?',
 'House rule: during shared reading; A quiet-break request needs no explanation and is answered by lowering voices.',
 'Iris, would you prefer to discuss the view or sit quietly for a while? I leave the choice to you.',
 'House rule: during household discussions; A quiet-break request needs no explanation and is answered by lowering voices.',
 'Iris, I pause our conversation and ask how you would like the rest of this quiet afternoon to unfold.',
 'Iris, I have been talking for a while. What would you like to happen next in our conversation?',
 'Iris, is there anything about sharing this room today that you would like to say plainly?',
 'Iris, I listen and leave you room to answer at your own pace.',
 'I declare and adopt this household rule: during shared reading; A quiet-break request needs no explanation and is answered by lowering voices.',
 'I declare and adopt this second household rule: during household discussions; A quiet-break request needs no explanation and is answered by lowering voices.',
 'Iris, I have been talking for a while. What would you like to happen next in our conversation?',
 'Iris, what would you like from this conversation now?'
];
const rubric={dimensions:['factual_continuity','character_continuity','relationship_continuity','accumulated_development','contradiction_avoidance','specificity','narrative_usefulness','unnecessary_repetition','unsupported_invention'],scale:'0 poor, 1 weak, 2 adequate, 3 strong; repetition/invention are costs: lower is better',material:'At least one grounded continuity gain beyond lexical reuse; no reflection-caused factual error',reviewer:'MODEL AGENT, NOT HUMAN',minimum_pairs:1,planned_case_turns:[5,6,7,8,9,10,11,12],maximum_turns:12,maximum_calls:100,maximum_reported_cost_usd:2.5};
const sourcePaths=execFileSync('git',['ls-files','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/),sources={};for(const p of sourcePaths)sources[p]=hash(await readFile(p));
await json('adapted-plan-freeze.json',{classification:'DEVELOPMENT-RICH CONTROLLED GAMEPLAY',plan,rubric,production_sources:sources,seeded_development_history:false,seeded_reflections:false,post_setup_direct_commands:false});
const key=exactBenchmarkCredential(process.env.OPENROUTER_API_KEY!==undefined?{env:process.env.OPENROUTER_API_KEY}:{fileText:await readFile('APIKEY.env','utf8')});process.env.OPENROUTER_API_KEY=key;
await json('resume.json',{timestamp:new Date().toISOString(),reason:'No useful reflection through turn 8; four remaining turns use explicit normal rule declarations',last_completed_turn:8});
let campaign,world,currentTurn=0,phase='setup',calls=18,cost=0.023372122000000002;const network=fetch,ledger=JSON.parse(await readFile(`${dir}/ledger.json`,'utf8')),caseFreezes=[],observations=await Promise.all(Array.from({length:8},(_,i)=>readFile(`${dir}/turn-${String(i+1).padStart(2,'0')}.json`,'utf8').then(JSON.parse))),reflectionCaptures=[];
globalThis.fetch=async(url,init)=>{
 const body=init?.body?JSON.parse(String(init.body)):null;if(!body)return network(url,init);
 assert.ok(calls<100&&cost<2.5,'Frozen call/cost guard reached');
 const id=++calls,role=phase.startsWith('ablation')||phase==='blind_review'?phase:body.response_format?.json_schema?.name==='npc_reflection_v23_cvc_e1'?'reflection':body.response_format?.json_schema?.name==='npc_mannerism_observations'?'extractor':body.model===deps.provider_status.narrator_model?'narrator':'controller',started=performance.now();
 const before=campaign.exportSnapshot();await json(`request-${String(id).padStart(3,'0')}.json`,{id,turn:currentTurn,role,body,body_sha:hash(String(init.body)),source_revision:before.revision});
 if(role==='reflection'){const character=JSON.parse(body.messages[1].content).character.id,c=captureProductionReflection(campaign,world,character);reflectionCaptures.push({physical:id,turn:currentTurn,character,source_revision:before.revision,state:before,full_catalog:c.catalog,request:c.request});await json('reflection-contexts.json',reflectionCaptures);}
 if(role==='narrator'&&currentTurn>=5&&!caseFreezes.length){
  const notes=before.premium_reflections.flatMap(r=>r.notes.filter(n=>n.structured&&n.structured.proposal.claim.type!=='environmental_motif'&&body.messages.some(m=>m.content.includes(n.text))).map(n=>({character_id:r.character_id,note:n})));
  if(notes.length){const frozen={turn:currentTurn,physical:id,state:before,revision:before.revision,body,request_sha:hash(body),narrative_context:buildTurnContext(world,before,{input:plan[currentTurn-1]}),recent:coordinator.recent(campaign).forPrompt(),notes,provider:deps.provider_status,randomness:{temperature:'omitted: provider default',seed:'omitted: provider default'}};caseFreezes.push(frozen);await json(`case-${currentTurn}-freeze.json`,frozen);throw Error("EVIDENCE_FREEZE_BEFORE_NARRATION");}
 }
 try{
  const response=await network(url,init),raw=await response.clone().text(),receipt=body.stream?raw.split(/\r?\n/).filter(l=>l.startsWith('data: ')).map(l=>{const t=l.slice(6);if(t==='[DONE]')return '[DONE]';try{return clean(JSON.parse(t));}catch{return {unparsed:t};}}):(()=>{try{return clean(JSON.parse(raw));}catch{return {unparsed:raw};}})();
  const usages=(Array.isArray(receipt)?receipt:[receipt]).filter(r=>r&&typeof r==='object'&&r.usage).map(r=>r.usage),reported=usages.at(-1)?.cost;cost+=typeof reported==='number'?reported:0;
  const item={id,turn:currentTurn,role,http_status:response.status,latency_ms:performance.now()-started,reported_cost_usd:reported??null,usage:usages.at(-1)??null,receipt};ledger.push(item);await json(`receipt-${String(id).padStart(3,'0')}.json`,item);await json('ledger.json',ledger);return response;
 }catch(e){ledger.push({id,turn:currentTurn,role,transport_failure:true,latency_ms:performance.now()-started});await json('ledger.json',ledger);throw e;}
};
const deps=await createProductionDeps({save_dir:`${dir}/manual-campaign-saves`});world=deps.world;assert.equal(deps.provider_status.narrator_model,'z-ai/glm-5.2');assert.equal(deps.provider_status.controller_model,'qwen/qwen3.8-flash');assert.equal(deps.provider_status.reflection_model,'qwen/qwen3.8-flash');
campaign=CampaignState.restore(world,observations.at(-1).after);
let coordinator;const create=deps.createCoordinator;const instrumented={...deps,createCoordinator:hooks=>{coordinator=create(hooks);return coordinator;},mannerism_diagnostics_sink:r=>appendFile(`${dir}/extractor-runs.jsonl`,JSON.stringify(clean(r))+'\n')};
const session=GameSession.fromCampaign(instrumented,campaign);
for(const [i,input] of plan.entries()){
 if(i<8)continue;
 currentTurn=i+1;phase='gameplay';const before=campaign.exportSnapshot(),first=calls+1,events=[];let finalized;
 const outcome=await session.submitPlayerInput(input,{onEvent:e=>{events.push(clean(e));if(e.type==='turn_completed')finalized=campaign.exportSnapshot();}}),after=campaign.exportSnapshot();
 if(finalized){const {revision:_r,premium_reflections:_f,...domains}=after,{revision:_s,premium_reflections:_g,...game}=finalized;
  // Extractor owns its documented maintenance domains; reflection itself may only change reflection state.
  const refs=ledger.filter(l=>l.turn===currentTurn&&l.role==='reflection');if(refs.length){const captured=reflectionCaptures.filter(r=>r.turn===currentTurn).at(-1),stateAtReflection=captured?.source_revision;assert.ok(stateAtReflection<=after.revision);const {revision:ra,premium_reflections:pa,...actual}=after,{revision:rb,premium_reflections:pb,...expected}=captured.state;assert.deepEqual(actual,expected,'Reflection altered non-reflection campaign domains');}
 }
 const record={turn:currentTurn,input,first_physical:first,last_physical:calls,outcome,events,before,after,before_sha:hash(before),after_sha:hash(after)};observations.push(record);await json(`turn-${String(currentTurn).padStart(2,'0')}.json`,record);await json('progress.json',{turns:currentTurn,successful:observations.filter(t=>t.outcome.ok).length,calls,reported_cost_usd:cost,accepted_notes:after.premium_reflections.flatMap(r=>r.notes).filter(n=>n.structured).length,reflection_calls:ledger.filter(l=>l.role==='reflection').length});
 console.log(JSON.stringify({turn:currentTurn,ok:outcome.ok,revision:after.revision,calls,cost,notes:after.premium_reflections.flatMap(r=>r.notes).map(n=>n.structured?.proposal.claim.type)}));
 if(caseFreezes.length)break;
 if(!outcome.ok&&['internal_error','campaign_validation_failed'].includes(outcome.error?.code)){await json('stopped-real-bug.json',{turn:currentTurn,error:outcome.error});break;}
 if(cost>=2.5||calls>=90)break;
}
await json('final-state.json',campaign.exportSnapshot());
const pairs=[];const client=new OpenRouterClient();
for(const c of caseFreezes.slice(0,1)){
 let removed=0;const without=structuredClone(c.body);const target=c.notes[0];c.notes=[target];
 const entry=`${target.note.kind.replace(/_/g,' ')} "${target.note.text}"`;
 without.messages=without.messages.map(m=>{if(!m.content.includes(entry))return m;let content=m.content;
 if(content.includes(` | reflection: ${entry}; `))content=content.replace(` | reflection: ${entry}; `,' | reflection: ');
 else if(content.includes(`; ${entry}`))content=content.replace(`; ${entry}`,'');
 else content=content.replace(` | reflection: ${entry}`,'');
 assert.notEqual(content,m.content);removed++;return {...m,content};});
 assert.equal(removed,1);assert.deepEqual({...without,messages:c.body.messages},c.body);
 const removalProof=[];for(let i=0;i<c.body.messages.length;i++){const a=c.body.messages[i].content,b=without.messages[i].content;if(a!==b){let pos=0;for(const piece of b.split('\n')){assert.ok(a.includes(piece)||piece.includes('NPC+'));}removalProof.push({message:i,before_sha:hash(a),after_sha:hash(b),removed_characters:a.length-b.length});}}
 await json(`case-${c.turn}-ablation-freeze.json`,{with_body:c.body,without_body:without,with_sha:hash(c.body),without_sha:hash(without),only_intentional_variable:'targeted packed reflection section',targets:c.notes.map(n=>n.note.id),proof:removalProof,state_sha:hash(c.state),revision:c.revision,randomness:c.randomness,immutable_campaign:true});
 const order=randomInt(2)?['WITH','WITHOUT']:['WITHOUT','WITH'],outputs={};
 for(const variant of order){phase=`ablation_${variant.toLowerCase()}`;const body=variant==='WITH'?c.body:without;let text='',meta;for await(const event of client.request(body,true,60000)){if(event.type==='text_delta')text+=event.text;else meta=event.metadata;}outputs[variant]={text,metadata:meta};}
 const labels=randomInt(2)?{X:'WITH',Y:'WITHOUT'}:{X:'WITHOUT',Y:'WITH'};await json(`case-${c.turn}-blind-packet.json`,{reviewer:'MODEL AGENT, NOT HUMAN',player_input:plan[c.turn-1],outputs:{X:outputs[labels.X].text,Y:outputs[labels.Y].text},rubric});
 phase='blind_review';const packet={player_input:plan[c.turn-1],prior_delivered_gameplay:observations.filter(t=>t.turn<c.turn).map(t=>({turn:t.turn,input:t.input,narration:t.outcome.narration})),outputs:{X:outputs[labels.X].text,Y:outputs[labels.Y].text},rubric};
 const reviewBody={model:'qwen/qwen3.8-flash',max_tokens:1800,provider:{only:['alibaba'],order:['alibaba'],allow_fallbacks:false},reasoning:{enabled:false,exclude:true},messages:[{role:'system',content:'You are a blind narrative continuity reviewer, MODEL AGENT NOT HUMAN. Score anonymous X and Y on each of the nine supplied dimensions, integer 0-3, higher better for dimensions 1-7; unnecessary_repetition and unsupported_invention lower is better. Do not guess experimental assignment. Superficial lexical reuse is not benefit. Return one exact JSON object with scores:{X:{dimension:score},Y:{dimension:score}}, winner:"X"|"Y"|"TIE", material_difference:boolean, rationale:string, continuity_evidence:string[], unsupported_material:{X:string[],Y:string[]}. You have past delivered play for continuity review; authoritative-state grounding is a separate later check.'},{role:'user',content:JSON.stringify(packet)}]};
 let text='';for await(const event of client.request(reviewBody,false,20000))if(event.type==='text_delta')text+=event.text;
 let review;try{review=JSON.parse(text);}catch{review={review_invalid:true,raw:text};}
 await json(`case-${c.turn}-blind-review-frozen.json`,{reviewer:'MODEL AGENT, NOT HUMAN',review,timestamp:new Date().toISOString(),packet_sha:hash(packet),assignment_revealed:false});
 const result={turn:c.turn,notes:c.notes,outputs,labels,review,with_score:Object.values(review.scores?.[Object.keys(labels).find(l=>labels[l]==='WITH')]??{}).reduce((a,b)=>a+b,0),without_score:Object.values(review.scores?.[Object.keys(labels).find(l=>labels[l]==='WITHOUT')]??{}).reduce((a,b)=>a+b,0),winner:review.winner==='TIE'?'TIE':labels[review.winner]??'INVALID',material_difference:review.material_difference??false};pairs.push(result);await json(`case-${c.turn}-revealed.json`,result);console.log(JSON.stringify({ablation_turn:c.turn,winner:result.winner,with_score:result.with_score,without_score:result.without_score,material:result.material_difference}));
}
await json('ablation-summary.json',pairs);await json('completed.json',{timestamp:new Date().toISOString(),turns:observations.length,successful_turns:observations.filter(t=>t.outcome.ok).length,calls,reported_cost_usd:cost,pairs:pairs.length,production_unchanged:true});
for(const [p,h]of Object.entries(sources))assert.equal(hash(await readFile(p)),h,p);
globalThis.fetch=network;
