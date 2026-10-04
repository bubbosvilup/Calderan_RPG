/** Fresh preregistration only. No expected provider output and no candidate decision execution. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {turnFixture} from '../../../.build/src/dev/turn-fixture.js';
import {structuredReflectionEvidenceV22,V2_SCHEMA,V2_SYSTEM} from '../../../.build/src/dev/reflection-v22.js';
import {characterView} from '../../../.build/src/campaign/projections.js';
import {sha,validationContext,MODELS} from './lib.mjs';
const dir='saves/d09-reflection-v22-oos',freeze=JSON.parse(readFileSync('docs/evaluations/d09-reflection/v22-freeze.json'));
if(sha(readFileSync(freeze.source_file))!==freeze.source_sha||sha(V2_SCHEMA)!==freeze.schema_sha||sha(V2_SYSTEM)!==freeze.prompt_sha)throw Error('STOP freeze mismatch');
if(existsSync(`${dir}/oos-manifest.json`))throw Error('Never overwrite');
const families=['relationship_trajectory','relationship_parallel','relationship_contrast','condition_trajectory','membership_trajectory','movement_trajectory','self_statement_synthesis','environmental_motif'],cases=[];
function scenario(family,index,source){
 const f=turnFixture(false,{courtyard:true,secondStairs:true}),subject=['brenna','maren','gerome','maren'][index%4],target=subject==='brenna'?'maren':'brenna',H=`campaign_household_v22_oos_${source}_${family}_${index}`,trace=[];
 const run=command=>{trace.push(structuredClone(command));f.campaign.apply({expected_revision:f.campaign.revision,commands:[command]});};
 const tick=()=>run({kind:'runtime_delta',delta:{time_advance_minutes:19+index*3}});
 run({kind:'create_household',id:H,name:`East archive ${source} ${family} ${index}`});run({kind:'set_membership',household_id:H,membership:{character_id:'nicco',status:'member',role:'owner'}});run({kind:'join_household',household_id:H,character_id:subject});tick();
 const rel=(dimension,direction='raise')=>{run({kind:'adjust_relationship',from_character_id:subject,to_character_id:target,dimension,direction});tick();};
 const cond=conditions=>{run({kind:'set_condition',character_id:subject,conditions});tick();};
 const move=location_id=>{run({kind:'move_character',character_id:subject,location_id});tick();};
 const statement=(field,quote)=>{run({kind:'establish_character_contract',character_id:subject,field,text:quote,quote});tick();};
 let stage=0;
 function develop(s){stage=s;
  if(family==='relationship_trajectory'){
   if(s===0){rel('respect');rel('respect');}else{rel('respect','lower');rel('respect');}
   if(index===1||source==='engine'){rel('wariness',s%2?'lower':'raise');}
   if(index===2||s===2)rel('respect','lower');
   if(index===3&&source==='fixture'){/* one isolated change plus prior path: ordinary history */cond(['dusty_cuffs']);}
  }else if(family==='relationship_parallel'){
   const direction=s===0?'raise':s%2?'lower':'raise';for(let k=0;k<(s===0?2:1);k++){rel('trust',direction);rel('respect',direction);}
   if(index===1)rel('wariness',s%2?'lower':'raise');if(index===2)rel('respect','lower');
  }else if(family==='relationship_contrast'){
   if(s===0){rel('trust');rel('trust');rel('wariness');rel('wariness');rel('wariness');}
   else{rel('trust',s%2?'lower':'raise');rel('wariness',s%2?'lower':'raise');}
   if(index===1){move('test_hall');cond(['ink_stained']);}
   if(index===3&&source==='fixture'){rel('trust','lower');rel('trust','lower');}
  }else if(family==='condition_trajectory'){
   const c=['dry_throat','sore_ankle','stinging_palm','tired_shoulders'][index];cond([c]);cond([]);cond([c]);if(index===2||s%2)cond([]);
   if(index===1||source==='engine'){cond([c,'dusty_cuffs']);move(s%2?'test_room':'test_hall');}
  }else if(family==='membership_trajectory'){
   for(let k=0;k<(source==='fixture'?index+1:1);k++){run({kind:'leave_household',household_id:H,character_id:subject});tick();run({kind:'join_household',household_id:H,character_id:subject});tick();}
   if(index===1||source==='engine'){run({kind:'add_household_rule',household_id:H,text:`Archive interval ${s}: return borrowed stools before dusk.`});tick();}
  }else if(family==='movement_trajectory'){
   for(const location_id of s%2?['test_hall','test_yard','test_hall','test_room']:['test_hall','test_room','test_hall','test_attic'])move(location_id);
   if(index===1||source==='engine')cond(['chalk_dust']);
   if(index===2){move('test_hall');move('test_yard');}
  }else if(family==='self_statement_synthesis'){
   if(s===0){statement('social_style','I count lanterns returned to the archive.');statement('voice','I announce missing lanterns at the evening inventory.');}
   else statement(s%2?'moral_boundary':'personality',`I record borrowed keys in the archive ledger on shift ${s+1}.`);
   if(index===1||source==='engine'){move(s%2?'test_room':'test_hall');rel('respect',s%2?'lower':'raise');}
   if(index===2)statement('personality','I describe my manner as cheerful.');
   if(index===3&&source==='fixture'){/* one new statement unrelated to the records; invalid provenance/selector opportunities */statement('moral_boundary','I close the archive shutters before sleep.');}
  }else{
   for(let k=0;k<2+index%2;k++){run({kind:'add_household_rule',household_id:H,text:`Archive shift ${s+1} safety ${k+1}: lanterns are stored on the stone shelf away from ledger paper.`});tick();}
   if(index===1||source==='engine')cond(['dusty_cuffs']);
  }
 }
 function capture(checkpoint){const snapshot=f.campaign.exportSnapshot(),catalog=structuredReflectionEvidenceV22(f.world,snapshot,subject),vc=validationContext(f.world,snapshot,subject,characterView),id=`V22_OOS_${source}_${family}_${index+1}_${checkpoint+1}`;
  const opportunities=['support_only','factual_traps'];
  if(family==='relationship_trajectory'||family==='relationship_parallel')opportunities.push('corroborating_snapshot','historical_vs_current');
  if(index===1||source==='engine'||['membership_trajectory','environmental_motif'].includes(family))opportunities.push('compatible_context');
  if(index===2||source==='engine'&&checkpoint>=2)opportunities.push('in_scope_contradiction_or_omission');
  if(family==='relationship_contrast')opportunities.push('historical_changes_with_current_snapshot','stale_current_comparison_trap');
  if(family==='self_statement_synthesis')opportunities.push('direct_statement_provenance','equivalent_event_provenance','mixed_provenance','different_statement_provenance_trap','nonexistent_selector_trap');
  if(index===3&&source==='fixture'&&['relationship_contrast','environmental_motif'].includes(family))opportunities.push('empty_appropriate');
  const request={character:vc.character,evidence:catalog.structured,existing_notes:[]};
  cases.push({id,source_type:source==='fixture'?'fixture':'played_state_evaluation',organic:false,primary_family:family,input_opportunities:opportunities,positive_control_opportunity:!opportunities.includes('empty_appropriate'),request,request_sha:sha(request),snapshot,snapshot_sha:sha(snapshot),evidence_catalog:catalog.structured,legacy_catalog:catalog.legacy,character:vc.character,knownNames:vc.knownNames,worldWords:vc.worldWords,command_trace:structuredClone(trace)});
 }
 return {develop,capture};
}
for(const family of families)for(let i=0;i<4;i++){const s=scenario(family,i,'fixture');if(!(i===3&&['relationship_contrast','environmental_motif'].includes(family)))s.develop(0);s.capture(0);}
for(const family of families){const s=scenario(family,1,'engine');for(let stage=0;stage<4;stage++){s.develop(stage);s.capture(stage);}}
const previousPaths=['saves/d09-semantic-oos/corpus-manifest.json','saves/d09-reflection-v2/oos-manifest.json','saves/d09-reflection-v21/oos-manifest.json'];
const priorHashes=new Set();for(const path of previousPaths){const old=JSON.parse(readFileSync(path));for(const c of old.cases??old.requests??[]){if(c.request_sha)priorHashes.add(c.request_sha);if(c.request)priorHashes.add(sha(c.request));}}
if(cases.length!==64||new Set(cases.map(c=>c.request_sha)).size!==64||cases.some(c=>priorHashes.has(c.request_sha)))throw Error('Request count/reuse');
const frozenFiles=[freeze.source_file,...Object.keys(freeze.dependency_hashes),'src/llm/reliability.ts','src/llm/retry.ts','src/llm/errors.ts','src/llm/openrouter/client.ts','docs/evaluations/d09-reflection/v22-oos-build.mjs','docs/evaluations/d09-reflection/v22-oos-run.mjs'];
const rubric={reviewer:'Primary Codex agent, not human, not independent. Candidate definitions known, computed acceptance hidden.',categories:['USEFUL','NEUTRAL','REDUNDANT','MISLEADING','HARMFUL'],fields:['should_reach_narrator','factual_error','unsupported_interpretation'],useful:'Grounded multi-source synthesis useful beyond authoritative restatement; true attributed commitments are not misleading solely for citation bookkeeping.',neutral:'Accurate harmless chronology or unrelated attribution with little added narrative meaning.',redundant:'Single fact/event or rules-only accumulation already stored without character-bearing synthesis.',misleading:'Unsupported or false factual/semantic assertion, fake dimension comparison or unsupported provenance.',harmful:'Unsafe instruction or harmful authority/role leakage.',primary:'Only final usable logical request envelopes; invalid first/retry diagnostic objects are separate, never accepted or credited as semantic catches.'};
const manifest={created_at:new Date().toISOString(),candidate_freeze:freeze,frozen_file_hashes:Object.fromEntries(frozenFiles.map(p=>[p,sha(readFileSync(p))])),model:MODELS.deepseek,max_tokens:600,timeout_ms:20000,provider:{require_parameters:true},reasoning:{exclude:true,enabled:false},source_split:{fixture:32,played_state_evaluation:32,organic:0},families:Object.fromEntries(families.map(f=>[f,8])),positive_opportunities:Object.fromEntries(families.map(f=>[f,cases.filter(c=>c.primary_family===f&&c.positive_control_opportunity).length])),opportunity_counts:Object.fromEntries([...new Set(cases.flatMap(c=>c.input_opportunities))].map(o=>[o,cases.filter(c=>c.input_opportunities.includes(o)).length])),reliability:{version:'candidate-technical-contract-v1',max_logical:64,max_physical:80,max_attempts:2,scheduling:'First dispatch all 64 original logical requests in manifest order. Then one technical retry in manifest order for invalid requests. Replay the cached first failure through unchanged withProviderRetry; only attempt 2 dispatches. Stop before any physical call beyond 80.',backoff_ms:250,max_backoff_ms:500,turn_budget_ms:120000,min_retry_window_ms:5000,retry_after_timeout_cap_ms:30000,max_attempt_ms:60000},gates:{useful_lost:0,bad_catch_min:0.8,factual_admitted:0,neutral_rejections:0,provenance_useful_event_equivalent_min:2,extra_each_min:2,final_usable_min:0.98},review_rubric:rubric,cases};
const bytes=JSON.stringify(manifest,null,2)+'\n';writeFileSync(`${dir}/oos-manifest.json`,bytes);writeFileSync(`${dir}/oos-manifest.sha256`,sha(bytes)+'\n');console.log(JSON.stringify({requests:64,manifest:sha(bytes),sources:manifest.source_split,families:manifest.families,opportunities:manifest.opportunity_counts,positive_controls:manifest.positive_opportunities}));
