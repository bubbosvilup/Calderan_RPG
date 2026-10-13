/** Bounded, single-use evidence run. Production code/configuration are never changed. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,appendFile,access} from 'node:fs/promises';
import {createHash,randomInt} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createProductionDeps} from '../.build/src/app/production.js';
import {GameSession} from '../.build/src/app/game-session.js';
import {createOpeningCampaign,OPENING_HOUSEHOLD} from '../.build/src/campaign/opening-state.js';
import {buildTurnContext} from '../.build/src/turn/context-builder.js';
import {captureProductionReflection} from '../.build/src/turn/structured-reflection-maintenance.js';
import {recoverNpcContext} from '../.build/src/turn/npc-plus.js';
import {OpenRouterClient} from '../.build/src/llm/openrouter/client.js';
import {exactBenchmarkCredential,benchmarkAuthentication} from '../.build/src/dev/reflection-benchmark.js';
const dir='saves/d09-unique-value-matched-ablation';await mkdir(dir,{recursive:true});
const json=(file,value)=>writeFile(`${dir}/${file}`,JSON.stringify(value,null,2)+'\n');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['reasoning','reasoning_details','reasoning_content'].includes(k)).map(([k,v])=>[k,clean(v)])):value;
try{await access(`${dir}/started.json`);throw Error('Run already started; refuse an accidental paid rerun.');}catch(e){if(e.code!=='ENOENT')throw e;}
const plan=[
 'Iris, while we sit together here, how do you usually speak when something is difficult to say? Do you soften the words or speak plainly? Describe your usual habit in your own words.',
 'Iris, apart from how you speak, what is a firm personal boundary you hold even when others pressure you? What would you never do to vulnerable people?',
 'Iris, what sort of company do you consistently dislike, and what makes sharing a room easier for you? I am asking about your ordinary preference, not just this moment.',
 'Iris, looking back over your life, what quality have you always had? I want to understand how you describe yourself, without putting an answer in your mouth.',
 'Iris, when you disagree with someone close to you, how would you want the conversation to unfold?',
 'Iris, I listen without interrupting. Is there a boundary you would want me to respect in a difficult disagreement?',
 'Iris, I offer my hand if you would like help settling comfortably; you are equally free to decline. What suits you?',
 'Iris, I accept your choice without trying to persuade you. What would make our time together more comfortable?',
 'Iris, if you have a concern about me or about sharing this room, I will hear it without arguing. What would you like to say?',
 'Iris, I thank you for saying what you want. Do you want company now, or would you prefer a quiet pause?',
 'Iris, a difficult disagreement could arise while we share this room. How would you want us to handle it?',
 'Iris, I leave room for your answer. What would you want me to understand before we choose how to spend this afternoon?'
];
const laterInput='Iris, a difficult disagreement could arise while we share this room. How would you want us to handle it?';
const families=['self_statement_synthesis','relationship_trajectory','relationship_contrast'];
const rubric={dimensions:['factual_continuity','character_continuity','relationship_continuity','accumulated_development','contradiction_avoidance','specificity','narrative_usefulness','unnecessary_repetition','unsupported_invention'],scale:'0 poor, 1 weak, 2 adequate, 3 strong; repetition/invention are penalties, lower is better',material:'At least one grounded continuity gain beyond lexical reuse; no reflection-caused factual error',reviewer:'MODEL AGENT, NOT HUMAN',minimum_pairs:1,planned_case_turns:"first normal turn after qualifying production note",maximum_turns:12,maximum_calls:100,maximum_reported_cost_usd:2.5};
const sourcePaths=execFileSync('git',['ls-files','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/),sources={};for(const p of sourcePaths)sources[p]=hash(await readFile(p));
await json('plan-freeze.json',{classification:'DEVELOPMENT-RICH CONTROLLED GAMEPLAY',plan,rubric,production_sources:sources,seeded_development_history:false,seeded_reflections:false,post_setup_direct_commands:false});
const key=exactBenchmarkCredential(process.env.OPENROUTER_API_KEY!==undefined?{env:process.env.OPENROUTER_API_KEY}:{fileText:await readFile('APIKEY.env','utf8')});process.env.OPENROUTER_API_KEY=key;
await json('preflight.json',await benchmarkAuthentication(key));await json('started.json',{timestamp:new Date().toISOString(),plan_sha:hash(await readFile(`${dir}/plan-freeze.json`)),maximum_turns:12,maximum_calls:100});
let campaign,world,currentTurn=0,phase='setup',calls=0,cost=0;const network=fetch,ledger=[],caseFreezes=[],observations=[],reflectionCaptures=[];
globalThis.fetch=async(url,init)=>{
 const body=init?.body?JSON.parse(String(init.body)):null;if(!body)return network(url,init);
 assert.ok(calls<100&&cost<2.5,'Frozen call/cost guard reached');
 const id=++calls,role=phase.startsWith('ablation')||phase==='blind_review'?phase:body.response_format?.json_schema?.name==='npc_reflection_v23_cvc_e1'?'reflection':body.response_format?.json_schema?.name==='npc_mannerism_observations'?'extractor':body.model===deps.provider_status.narrator_model?'narrator':'controller',started=performance.now();
 const before=campaign.exportSnapshot();await json(`request-${String(id).padStart(3,'0')}.json`,{id,turn:currentTurn,role,body,body_sha:hash(String(init.body)),source_revision:before.revision});
 if(role==='reflection'){const character=JSON.parse(body.messages[1].content).character.id,c=captureProductionReflection(campaign,world,character);reflectionCaptures.push({physical:id,turn:currentTurn,character,source_revision:before.revision,state:before,full_catalog:c.catalog,request:c.request});await json('reflection-contexts.json',reflectionCaptures);}
 if(role==='narrator'&&!caseFreezes.length){
  const notes=before.premium_reflections.flatMap(r=>r.notes.filter(n=>n.structured&&families.includes(n.structured.proposal.claim.type)&&body.messages.some(m=>m.content.includes(n.text))).map(n=>({character_id:r.character_id,note:n})));
  if(notes.length){const frozen={turn:currentTurn,physical:id,state:before,revision:before.revision,body,request_sha:hash(body),narrative_context:buildTurnContext(world,before,{input:actualInput}),recent:coordinator.recent(campaign).forPrompt(),notes,provider:deps.provider_status,randomness:{temperature:'omitted: provider default',seed:'omitted: provider default'}};caseFreezes.push(frozen);await json(`case-${currentTurn}-freeze.json`,frozen);}
 }
 try{
  const response=await network(url,init),raw=await response.clone().text(),receipt=body.stream?raw.split(/\r?\n/).filter(l=>l.startsWith('data: ')).map(l=>{const t=l.slice(6);if(t==='[DONE]')return '[DONE]';try{return clean(JSON.parse(t));}catch{return {unparsed:t};}}):(()=>{try{return clean(JSON.parse(raw));}catch{return {unparsed:raw};}})();
  const usages=(Array.isArray(receipt)?receipt:[receipt]).filter(r=>r&&typeof r==='object'&&r.usage).map(r=>r.usage),reported=usages.at(-1)?.cost;cost+=typeof reported==='number'?reported:0;
  const item={id,turn:currentTurn,role,http_status:response.status,latency_ms:performance.now()-started,reported_cost_usd:reported??null,usage:usages.at(-1)??null,receipt};ledger.push(item);await json(`receipt-${String(id).padStart(3,'0')}.json`,item);await json('ledger.json',ledger);return response;
 }catch(e){ledger.push({id,turn:currentTurn,role,transport_failure:true,latency_ms:performance.now()-started});await json('ledger.json',ledger);throw e;}
};
const deps=await createProductionDeps({save_dir:`${dir}/manual-campaign-saves`});world=deps.world;assert.equal(deps.provider_status.narrator_model,'z-ai/glm-5.2');assert.equal(deps.provider_status.controller_model,'qwen/qwen3.8-flash');assert.equal(deps.provider_status.reflection_model,'qwen/qwen3.8-flash');
campaign=createOpeningCampaign(world,'d09_unique_value');
// A declared new household scenario, not a historical fixture or a source of reflection support.
campaign.apply({expected_revision:campaign.revision,commands:[{kind:'runtime_delta',delta:{player_location:'heartstone_f1'}},...['iris'].flatMap(name=>[{kind:'register_character',character:{id:`campaign_character_${name}`,origin:{kind:'created'},profile:{name:name==='iris'?'Iris':'Dain'},current:{current_location:'heartstone_f1',status:'active'}}},{kind:'join_household',household_id:OPENING_HOUSEHOLD,character_id:`campaign_character_${name}`}])]});
assert.ok(campaign.exportSnapshot().premium_characters.every(p=>p.dynamic.recent_developments.every(d=>d.kind==='joined_household')));assert.equal(campaign.exportSnapshot().premium_reflections.length,0);await json('baseline-state.json',campaign.exportSnapshot());
let coordinator;const create=deps.createCoordinator;const instrumented={...deps,createCoordinator:hooks=>{coordinator=create(hooks);return coordinator;},mannerism_diagnostics_sink:r=>appendFile(`${dir}/extractor-runs.jsonl`,JSON.stringify(clean(r))+'\n')};
const session=GameSession.fromCampaign(instrumented,campaign);
let actualInput;
for(const [i,plannedInput] of plan.entries()){
 const hasQualified=campaign.exportSnapshot().premium_reflections.some(r=>r.notes.some(n=>n.structured&&families.includes(n.structured.proposal.claim.type)));
 const input=hasQualified?laterInput:plannedInput;actualInput=input;
 currentTurn=i+1;phase='gameplay';const before=campaign.exportSnapshot(),first=calls+1,events=[];let finalized;
 const outcome=await session.submitPlayerInput(input,{onEvent:e=>{events.push(clean(e));if(e.type==='turn_completed')finalized=campaign.exportSnapshot();}}),after=campaign.exportSnapshot();
 if(finalized){const {revision:_r,premium_reflections:_f,...domains}=after,{revision:_s,premium_reflections:_g,...game}=finalized;
  // Extractor owns its documented maintenance domains; reflection itself may only change reflection state.
  const refs=ledger.filter(l=>l.turn===currentTurn&&l.role==='reflection');if(refs.length){const captured=reflectionCaptures.filter(r=>r.turn===currentTurn).at(-1),stateAtReflection=captured?.source_revision;assert.ok(stateAtReflection<=after.revision);const {revision:ra,premium_reflections:pa,...actual}=after,{revision:rb,premium_reflections:pb,...expected}=captured.state;assert.deepEqual(actual,expected,'Reflection altered non-reflection campaign domains');}
 }
 const record={turn:currentTurn,input,first_physical:first,last_physical:calls,outcome,events,before,after,before_sha:hash(before),after_sha:hash(after)};observations.push(record);await json(`turn-${String(currentTurn).padStart(2,'0')}.json`,record);await json('progress.json',{turns:currentTurn,successful:observations.filter(t=>t.outcome.ok).length,calls,reported_cost_usd:cost,accepted_notes:after.premium_reflections.flatMap(r=>r.notes).filter(n=>n.structured).length,reflection_calls:ledger.filter(l=>l.role==='reflection').length});
 console.log(JSON.stringify({turn:currentTurn,ok:outcome.ok,revision:after.revision,calls,cost,notes:after.premium_reflections.flatMap(r=>r.notes).map(n=>n.structured?.proposal.claim.type)}));
 assert.equal(after.runtime.scene.player_location,'heartstone_f1');assert.equal(outcome.trace?.movement?.characters_moved?.length??0,0);
 if(caseFreezes.length)break;
 if(!outcome.ok&&['internal_error','campaign_validation_failed'].includes(outcome.error?.code)){await json('stopped-real-bug.json',{turn:currentTurn,error:outcome.error});break;}
 if(cost>=2.5||calls>=90)break;
}
await json('final-state.json',campaign.exportSnapshot());

await json('development-completed.json',{timestamp:new Date().toISOString(),turns:observations.length,successful_turns:observations.filter(t=>t.outcome.ok).length,calls,reported_cost_usd:cost,qualifying_freezes:caseFreezes.length,ablation_calls:0,next_stage:'OFFLINE marginal-value precheck REQUIRED before paid A/B',production_unchanged:true});
for(const [p,h]of Object.entries(sources))assert.equal(hash(await readFile(p)),h,p);
await json('source-freeze-after.json',{production_sources:sources,verified_unchanged:true});
globalThis.fetch=network;
