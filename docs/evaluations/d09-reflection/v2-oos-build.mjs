/** New independent corpus, constructed only after the committed V2 freeze. No desired output wording. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {turnFixture} from '../../../.build/src/dev/turn-fixture.js';
import {structuredReflectionEvidence,V2_SCHEMA,V2_SYSTEM} from '../../../.build/src/dev/reflection-v2.js';
import {characterView} from '../../../.build/src/campaign/projections.js';
import {sha,validationContext,MODELS} from './lib.mjs';
const dir='saves/d09-reflection-v2',freeze=JSON.parse(readFileSync(`${dir}/candidate-freeze.json`,'utf8'));
if(sha(readFileSync(freeze.source_file))!==freeze.source_sha||sha(V2_SCHEMA)!==freeze.schema_sha||sha(V2_SYSTEM)!==freeze.prompt_sha)throw Error('V2 changed after freeze');
if(existsSync(`${dir}/oos-manifest.json`))throw Error('Never overwrite OOS manifest');
const families=['condition','relationship','contrast','self_statement','membership','movement','environment','empty'],cases=[];
const old=JSON.parse(readFileSync('saves/d09-semantic-oos/corpus-manifest.json','utf8'));
function fixture(family,index,source){
 const f=turnFixture(false,{courtyard:true,secondStairs:true}),subject=family==='self_statement'?['maren','brenna','maren'][index%3]:['maren','gerome','brenna'][index%3],H=`campaign_household_v2_${source}_${family}_${index}`,trace=[];
 const run=command=>{trace.push(command);f.campaign.apply({expected_revision:f.campaign.revision,commands:[command]});};
 const tick=()=>run({kind:'runtime_delta',delta:{time_advance_minutes:3+index}});
 run({kind:'create_household',id:H,name:`North annex ${source} ${family} ${index}`});
 run({kind:'set_membership',household_id:H,membership:{character_id:'nicco',status:'member',role:'owner'}});
 run({kind:'join_household',household_id:H,character_id:subject});tick();
 if(family==='empty'&&source==='engine_state')for(const character_id of ['brenna','gerome']){run({kind:'join_household',household_id:H,character_id});tick();}
 const rel=(dimension,direction='raise')=>{run({kind:'adjust_relationship',from_character_id:subject,to_character_id:'nicco',dimension,direction});tick();};
 const cond=conditions=>{run({kind:'set_condition',character_id:subject,conditions});tick();};
 const move=location_id=>{run({kind:'move_character',character_id:subject,location_id});tick();};
 const contract=(field,text,quote)=>{run({kind:'establish_character_contract',character_id:subject,field,text,quote});tick();};
 function develop(stage){
  if(family==='condition'){
   const condition=['sore_wrist','chilled','strained_knee'][index%3];cond([condition]);cond([]);cond([condition]);if(index%2)cond([]);
  }else if(family==='relationship'){
   if(stage===0){rel('trust');rel('trust');}else{rel('trust','lower');rel('trust');}
   if(source==='fixture'&&index===1)rel('trust');if(source==='fixture'&&index===2){rel('trust','lower');rel('trust','lower');}
  }else if(family==='contrast'){
   if(stage===0){rel('trust');rel('trust');rel(index===2?'respect':'wariness');rel(index===2?'respect':'wariness');}
   else{rel('trust',stage===1?'raise':'lower');rel('wariness',stage===1?'raise':'lower');}
  }else if(family==='self_statement'){
   if(stage===0){
    contract(index===1?'personality':'social_style',index===1?'stoic':'keeps shared records',index===1?'I describe myself as stoic.':'I keep a record of shared supplies.');
    contract('voice','reports records plainly','I report the contents of my records plainly.');
   }else contract('moral_boundary',`labels loaned tools ${stage}`,`I mark tools loaned on day ${stage+1}.`);
   move(stage%2?'test_yard':'test_hall');
  }else if(family==='membership'){
   for(let j=0;j<(source==='fixture'?index+1:1);j++){run({kind:'leave_household',household_id:H,character_id:subject});tick();run({kind:'join_household',household_id:H,character_id:subject});tick();}
  }else if(family==='movement'){
   for(const loc of stage%2?['test_yard','test_hall','test_attic','test_hall']:['test_hall','test_yard','test_hall','test_room'])move(loc);
  }else if(family==='environment'){
   for(let j=0;j<2+index%2;j++){run({kind:'add_household_rule',household_id:H,text:`Day ${stage+1} provision ${j+1}: keep the east landing unobstructed.`});tick();}
  }else{
   if(stage===0&&index===1)move('test_hall');
   if(stage===0&&index===2)cond(['cold_hands']);
   tick(); // Later empty-state checkpoints add no reflection episodes.
  }
 }
 function capture(checkpoint){
  const selected=family==='empty'&&source==='engine_state'?['maren','brenna','gerome'][checkpoint]:subject;
  const snapshot=f.campaign.exportSnapshot(),catalog=structuredReflectionEvidence(f.world,snapshot,selected),vc=validationContext(f.world,snapshot,selected,characterView);
  const request={character:vc.character,evidence:catalog.structured,existing_notes:[]};
  const id=`V2_${source}_${family}_${index+1}_${checkpoint+1}`;
  const expectation=family==='empty'?'empty-appropriate':family==='environment'?'redundant-trap':family==='membership'?'ambiguous':'useful-opportunity';
  const record={id,source_type:source==='engine_state'?'played_state_evaluation':'fixture',organic:false,provenance:source==='engine_state'?'Scripted current-engine scenario checkpoint in a noncanonical evaluation world; not organic gameplay':'Independent deterministic fixture',family,input_opportunity:expectation,character:vc.character,evidence_catalog:catalog.structured,legacy_catalog:catalog.legacy,request,request_sha:sha(request),state_sha:sha(snapshot),knownNames:vc.knownNames,worldWords:vc.worldWords,command_trace:[...trace]};
  cases.push(record);writeFileSync(`${dir}/state-${id}.json`,JSON.stringify(snapshot,null,2));
 }
 return {develop,capture};
}
for(const family of families)for(let i=0;i<3;i++){const f=fixture(family,i,'fixture');f.develop(0);f.capture(0);}
for(const family of families){const f=fixture(family,0,'engine_state');for(let stage=0;stage<3;stage++){f.develop(stage);f.capture(stage);}}
if(cases.length!==48||new Set(cases.map(c=>c.request_sha)).size!==48)throw Error('Corpus size/identity');
const manifest={created_at:new Date().toISOString(),candidate_freeze:freeze,model:MODELS.deepseek,max_tokens:600,timeout_ms:20000,provider:{require_parameters:true},reasoning:{exclude:true,enabled:false},source_split:{fixture:24,played_state_evaluation:24,organic:0},families:Object.fromEntries(families.map(f=>[f,6])),comparison:'Same typed provider outputs, native old shape rejection recorded; diagnostic deterministic-rendering bridge to unchanged old validator. No V2 accept/reject outcome used by bridge.',gate:{useful_lost:0,bad_catch_min:0.7,wrong_factual_admitted:0,neutral_rejections:'inspect individually; none expected',require_old_accepted_bad_exposure:true},review_protocol:'Primary agent evidence-aware review, not human. Review all envelope and diagnostic claims BEFORE candidate evaluation; malformed diagnostic claims never accepted.',independent_of_development:true,old_manifest_sha:sha(readFileSync('saves/d09-semantic-oos/corpus-manifest.json')),cases};
const bytes=JSON.stringify(manifest,null,2)+'\n';writeFileSync(`${dir}/oos-manifest.json`,bytes);writeFileSync(`${dir}/oos-manifest.sha256`,sha(bytes)+'\n');
console.log(JSON.stringify({total:48,source_split:manifest.source_split,families:manifest.families,manifest_sha:sha(bytes)},null,2));
