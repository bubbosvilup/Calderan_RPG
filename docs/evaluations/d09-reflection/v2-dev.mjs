/** Known 40-case corpus is DEVELOPMENT ONLY. Explicit annotations, not a free-prose translator or performance estimate. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {turnFixture} from '../../../.build/src/dev/turn-fixture.js';
import {structuredReflectionEvidence,validateStructuredClaim,renderStructuredClaim,REASON_CODES,V2_SCHEMA,EVIDENCE_VERSION} from '../../../.build/src/dev/reflection-v2.js';
import {sha} from './lib.mjs';
const dir='saves/d09-reflection-v2';mkdirSync(dir,{recursive:true});
const manifest=JSON.parse(readFileSync('saves/d09-semantic-oos/corpus-manifest.json','utf8'));
const old=JSON.parse(readFileSync('saves/d09-semantic-oos/candidate-outcomes.json','utf8')).rows;
const world=turnFixture(false,{courtyard:true,secondStairs:true}).world;
const cases=new Map(manifest.cases.map(c=>{const suffix=c.id.replace('OOS_','').replace(/_(\d+)$/,(_,n)=>`-${n}`),snapshot=JSON.parse(readFileSync(`saves/d09-semantic-oos/state-${suffix}.json`,'utf8'));return[c.id,{...c,catalog:structuredReflectionEvidence(world,snapshot,c.character.id).structured}];}));
const rows=[];
function run(id,claim,expected,{refs,kind='known_escape'}={}){
 const previous=old.find(r=>r.id===id), c=cases.get(id.slice(0,id.lastIndexOf(':')));
 if(!previous||!c)throw Error(id);
 const p={subject_character_id:c.character.id,evidence_refs:refs??previous.proposal.evidence_refs,confidence:previous.proposal.confidence,claim};
 const outcome=validateStructuredClaim(p,c.catalog,c.character.id);
 if(outcome.accepted!==expected)throw Error(`${id}: ${JSON.stringify(outcome.reasons)}`);
 rows.push({id,kind,original_proposal:previous.proposal,annotation:p,annotation_scope:'Hand-annotated structured regression counterpart. Not an automatic translation, model regeneration, or OOS proposal.',...outcome,rendered:outcome.accepted?renderStructuredClaim(p,c.catalog,new Map(c.knownNames)):null});
}
run('OOS_condition_1:1',{type:'missing_provenance_tension'},false);
run('OOS_relationship_6:0',{type:'relationship_contrast',target_character_id:'maren',dimension_a:'trust',state_a:'moderate',dimension_b:'respect',state_b:'low',interpretation:'openness with measured regard'},false);
run('OOS_self_statement_1:1',{type:'relationship_trajectory',target_character_id:'maren',dimension:'trust',from:'none',to:'low',direction:'decrease',transition_count:1},false,{refs:['npcmem:brenna:history:r8.0']});
run('OOS_membership_6:2',{type:'membership_trajectory',household_id:'campaign_household_oos_membership_5',operations:['join','rejoin'],join_count:1,rejoin_count:2,leave_count:0},false);
run('OOS_movement_1:0',{type:'movement_trajectory',locations:['test_room','test_hall','test_yard','test_hall','test_room'],transition_count:4,interpretation:'without settling'},false);
run('OOS_tension_1:1',{type:'relationship_parallel',target_character_id:'maren',dimension_a:'trust',dimension_b:'wariness',from:'none',to:'moderate',transition_count:1},false);
for(const [id,condition_id,operations] of [['OOS_condition_4:0','sprained_ankle',['add','remove','add']],['OOS_condition_1:0','sprained_ankle',['add','remove','add','remove']]])run(id,{type:'condition_trajectory',condition_id,operations,episode_count:2},true,{kind:'old_accepted_useful'});
for(const [id,target]of [['OOS_relationship_5:0','brenna'],['OOS_relationship_6:1','maren']]){
 const c=cases.get(id.slice(0,id.lastIndexOf(':'))), snapshot=c.catalog.find(e=>e.evidence_type==='relationship_snapshot');
 run(id,{type:'relationship_contrast',target_character_id:target,dimension_a:'trust',state_a:'moderate',dimension_b:'respect',state_b:'low'},true,{refs:[snapshot.ref],kind:'old_accepted_useful'});
 const refs=c.catalog.filter(e=>e.evidence_type==='relationship_change'&&e.payload.dimension==='trust').map(e=>e.ref);
 run(id,{type:'relationship_trajectory',target_character_id:target,dimension:'trust',from:'none',to:'moderate',direction:'increase',transition_count:2},true,{refs,kind:'old_accepted_useful_trajectory_component'});
}
run('OOS_tension_3:1',{type:'relationship_parallel',target_character_id:'maren',dimension_a:'trust',dimension_b:'wariness',from:'none',to:'moderate',transition_count:2},true,{kind:'old_accepted_useful'});
run('OOS_self_statement_6:0',{type:'self_statement_synthesis',statement_refs:['npcmem:gerome:contract:0','npcmem:gerome:contract:1']},true,{kind:'old_rejected_useful',refs:['npcmem:gerome:contract:0','npcmem:gerome:contract:1']});
run('OOS_tension_1:0',{type:'relationship_contrast',target_character_id:'maren',dimension_a:'trust',state_a:'moderate',dimension_b:'wariness',state_b:'moderate'},true,{kind:'old_rejected_useful'});
run('OOS_tension_3:0',{type:'relationship_contrast',target_character_id:'maren',dimension_a:'trust',state_a:'moderate',dimension_b:'wariness',state_b:'moderate'},true,{kind:'old_rejected_useful'});
const legacyBoundary=old.map(r=>({id:r.id,classification:r.classification,v2:validateStructuredClaim(r.proposal,cases.get(r.id.slice(0,r.id.lastIndexOf(':'))).catalog,cases.get(r.id.slice(0,r.id.lastIndexOf(':'))).character.id)}));
const result={dataset:'FAILED 40-case OOS now DEVELOPMENT; no V2 performance claim',known_escapes_rejected:6,old_accepted_useful_preserved:5,old_rejected_useful_recovered:3,native_legacy_prose:'Not convertible automatically; all 45 parsed legacy proposals rejected at typed-schema boundary. Only explicitly annotated meanings are evaluated as structured regressions.',rows,legacyBoundary};
writeFileSync(`${dir}/dev-regression.json`,JSON.stringify(result,null,2));
writeFileSync(`${dir}/structured-evidence-examples.json`,JSON.stringify([...cases.values()].slice(0,6).map(c=>({id:c.id,evidence:c.catalog})),null,2));
console.log(JSON.stringify({known_escapes_rejected:6,old_accepted_useful_preserved:5,old_rejected_useful_recovered:3,rows:rows.length}));
