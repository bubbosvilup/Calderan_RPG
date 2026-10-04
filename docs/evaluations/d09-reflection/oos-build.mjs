/** Independent D-09 OOS preregistration. All cases are deterministic fixtures, never organic play. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {turnFixture} from '../../../.build/src/dev/turn-fixture.js';
import {reflectionEvidence} from '../../../.build/src/turn/reflection.js';
import {characterView} from '../../../.build/src/campaign/projections.js';
import {sha,validationContext,REFLECTION_SYSTEM,REFLECTION_SCHEMA,MODELS} from './lib.mjs';
const dir='saves/d09-semantic-oos', rule='docs/evaluations/d09-reflection/semantic-rules.mjs';
const required='cb3abd33b661decc8a62a8b980c15686f8589fe2fffa04728d171baa87c693cc';
if(sha(readFileSync(rule))!==required)throw Error('Frozen hash mismatch');
if(existsSync(`${dir}/corpus-manifest.json`))throw Error('Never overwrite preregistration');
mkdirSync(dir,{recursive:true});
const cases=[];
for(const [family,n] of [['condition',6],['relationship',6],['self_statement',6],['membership',6],['movement',6],['tension',6],['empty',4]])for(let i=0;i<n;i++){
 const f=turnFixture(false,{courtyard:true,secondStairs:true}), id=['brenna','maren','gerome'][i%3], other=id==='maren'?'brenna':'maren', H=`campaign_household_oos_${family}_${i}`;
 const commands=[],apply=c=>{commands.push(c);f.campaign.apply({expected_revision:f.campaign.revision,commands:[c]});};
 apply({kind:'create_household',id:H,name:`OOS ${family} household ${i+1}`});
 apply({kind:'set_membership',household_id:H,membership:{character_id:'nicco',status:'member',role:'owner'}});
 apply({kind:'join_household',household_id:H,character_id:id});
 const cond=conditions=>apply({kind:'set_condition',character_id:id,conditions});
 const rel=(dimension,direction='raise',reverse=false)=>apply({kind:'adjust_relationship',from_character_id:reverse?other:id,to_character_id:reverse?id:other,dimension,direction});
 const move=location_id=>apply({kind:'move_character',character_id:id,location_id});
 const rule=()=>apply({kind:'add_household_rule',household_id:H,text:`OOS ${family} ${i+1}: keep the west stair clear during deliveries.`});
 const statement=(field,text,quote)=>apply({kind:'establish_character_contract',character_id:id,field,text,quote});
 let expectation='useful-opportunity', positive=null;
 if(family==='condition'){
  const c=['sprained_ankle','bruised_shoulder','fatigue'][i%3];
  cond([c]);cond([]);if(i<4){cond([c]);cond(i%2?[c,'recovering']:[]);positive='independent condition episodes';}else{cond(['recovering']);expectation='ambiguous';}
 }else if(family==='relationship'){
  rel('trust');rel('trust');if(i<3){rel('trust','lower');positive='literal multi-step trust trajectory';}else if(i===3){rel('affection');rel('affection','lower');positive='trust versus affection contrast';}else{rel('respect');expectation='ambiguous';}
 }else if(family==='self_statement'){
  const statements=[['personality','stoic','I remain stoic through setbacks.'],['social_style','plain and direct','I speak directly to people.'],['moral_boundary','keeps passageways clear','I keep shared passageways clear.'],['voice','quiet and measured','I speak quietly and measure my words.'],['personality','restless','I describe myself as restless.'],['social_style','coordinates supplies','I coordinate supplies for the household.']];
  statement(...statements[i]);move('test_hall');move('test_yard');
  if(i===5){statement('voice','reports supply counts','I report supply counts each evening.');positive='explicit coordinating role with repeated owned statements';}else{rel('trust');positive='explicit self-statement permits supported stance';}
 }else if(family==='membership'){
  for(let j=0;j<2+i%3;j++)apply({kind:'add_household_rule',household_id:H,text:`OOS household ${i+1} rule ${j+1}: ${['leave the stair clear','mark borrowed tools','close shutters at dusk','store dry fuel upstairs'][j]}.`});
  if(i%2){apply({kind:'leave_household',household_id:H,character_id:id});apply({kind:'join_household',household_id:H,character_id:id});}
  expectation=i<3?'misleading-trap':'redundant-trap';
 }else if(family==='movement'){
  for(const to of ['test_hall','test_yard','test_hall',i%2?'test_attic':'test_room'])move(to);
  if(i>=2)rule();if(i>=4){apply({kind:'move_character',character_id:other,location_id:'test_hall'});apply({kind:'move_character',character_id:other,location_id:'test_yard'});}
  positive='literal movement recurrence';expectation=i>=4?'ambiguous':'useful-opportunity';
 }else if(family==='tension'){
  if(i<3){rel('trust');rel('trust');rel('wariness');rel('wariness');positive='true recorded trust/wariness contrast';}
  else{rule();rel('trust', 'raise', i===5);expectation='misleading-trap';}
 }else{expectation='empty-appropriate';if(i===1)move('test_hall');if(i===2)rule();if(i===3)cond(['tired']);}
 const snap=f.campaign.exportSnapshot(),catalog=reflectionEvidence(f.world,snap,id),vc=validationContext(f.world,snap,id,characterView);
 const request={character:vc.character,evidence:catalog.map(({ref,kind,text})=>({ref,kind,text})),existing:[]};
 cases.push({id:`OOS_${family}_${i+1}`,source_type:'fixture',character:vc.character,evidence_refs:catalog.map(e=>e.ref),evidence_catalog:catalog,intended_evidence_family:family,input_expectation:expectation,positive_control:positive,request,request_sha:sha(request),knownNames:vc.knownNames,worldWords:vc.worldWords,state_sha:sha(snap),commands});
 writeFileSync(`${dir}/state-${family}-${i+1}.json`,JSON.stringify(snap,null,2));
}
const manifest={version:1,independent_of_original_148:true,created_at:new Date().toISOString(),rule_sha:required,model:MODELS.deepseek,prompt_sha:sha(REFLECTION_SYSTEM),schema_sha:sha(REFLECTION_SCHEMA),max_tokens:600,reasoning:{exclude:true,enabled:false},provider:{require_parameters:true},review_protocol:'Evidence-aware primary-agent review: freeze classifications before candidate outcomes; not human review. All proposals, including old rejects, reviewed.',source_limitation:'40 deterministic current-engine fixtures; zero organic/played requests. No fixture evidence is called organic. Current catalog cannot expose inventory acts, so quartermaster acts are not claimed.',cases};
const bytes=JSON.stringify(manifest,null,2)+'\n';writeFileSync(`${dir}/corpus-manifest.json`,bytes);writeFileSync(`${dir}/manifest.sha256`,sha(bytes)+'\n');
console.log(JSON.stringify({total:cases.length,manifest_sha:sha(bytes),families:Object.fromEntries([...new Set(cases.map(c=>c.intended_evidence_family))].map(k=>[k,cases.filter(c=>c.intended_evidence_family===k).length]))}));
