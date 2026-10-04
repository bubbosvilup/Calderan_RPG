/**
 * FIXTURE reflection requests (adversarial/synthesis shapes the played run did not naturally produce). Built with the engine's own state machinery
 * (campaign.apply of production commands, the same mechanism the offline reflection test suites use), then run through the UNCHANGED
 * reflectionEvidence(). No reflection note, development or catalog entry is hand-written. Labelled FIXTURE; never primary usefulness evidence.
 */
import {writeFileSync} from 'node:fs';
import {turnFixture} from '../../../.build/src/dev/turn-fixture.js';
import {reflectionEvidence} from '../../../.build/src/turn/reflection.js';
import {characterView} from '../../../.build/src/campaign/projections.js';
import {sha,validationContext} from './lib.mjs';
const H='campaign_household_d09';
const mk=()=>{const f=turnFixture(false,{courtyard:true});f.campaign.apply({expected_revision:f.campaign.revision,commands:[{kind:'create_household',id:H,name:'Tower household'},{kind:'set_membership',household_id:H,membership:{character_id:'nicco',status:'member',role:'owner'}},...['brenna','gerome','maren'].map(character_id=>({kind:'join_household',household_id:H,character_id}))]});return f;};
const run=(f,c)=>f.campaign.apply({expected_revision:f.campaign.revision,commands:[c]});
const mv=(id,to)=>({kind:'move_character',character_id:id,location_id:to});
const rule=t=>({kind:'add_household_rule',household_id:H,text:t});
const rel=(a,b,dimension,direction='raise')=>({kind:'adjust_relationship',from_character_id:a,to_character_id:b,dimension,direction});
const cond=(id,conditions)=>({kind:'set_condition',character_id:id,conditions});
const R=['House rule: ask before moving another household member\'s belongings.','House rule: anyone may ask for a quiet break without having to explain.','House rule: tell the household before leaving the tower.','House rule: meals are shared at the long table.'];
const cases=[
 ['FX01_movement_only','brenna','Four recorded moves between hall and room; nothing else',f=>{for(const to of ['test_hall','test_room','test_hall','test_room'])run(f,mv('brenna',to));}],
 ['FX02_rules_only','maren','Four household rules only (authorship trap)',f=>{R.forEach(t=>run(f,rule(t)));}],
 ['FX03_single_condition_episode','brenna','One condition added then removed (recurrence trap) plus two rules',f=>{run(f,cond('brenna',['minor_injury']));run(f,cond('brenna',[]));run(f,rule(R[0]));run(f,rule(R[1]));}],
 ['FX04_two_episode_condition','brenna','Condition added, removed, added again: two legitimate episodes',f=>{run(f,cond('brenna',['minor_injury']));run(f,cond('brenna',[]));run(f,cond('brenna',['minor_injury']));}],
 ['FX05_tension_candidate','brenna','Trust and wariness raised toward the same person',f=>{run(f,rel('brenna','maren','trust'));run(f,rel('brenna','maren','wariness'));run(f,rule(R[2]));}],
 ['FX06_contract_plus_relationship','maren','Explicit voice contract plus two trust steps toward Brenna',f=>{run(f,{kind:'establish_character_contract',character_id:'maren',field:'voice',text:'speaks plainly',quote:'I speak plainly.'});run(f,rel('maren','brenna','trust'));run(f,rel('maren','brenna','trust'));}],
 ['FX07_sparse_membership_rules','gerome','Only membership plus two rules for a silent construct',f=>{run(f,rule(R[0]));run(f,rule(R[3]));}],
 ['FX08_leave_rejoin_moves','gerome','Left household, rejoined, moved twice',f=>{run(f,{kind:'leave_household',household_id:H,character_id:'gerome'});run(f,{kind:'join_household',household_id:H,character_id:'gerome'});run(f,mv('gerome','test_hall'));run(f,mv('gerome','test_yard'));}],
 ['FX09_mixed_rich','maren','Moves, rules, a trust step and a condition: synthesis opportunity',f=>{run(f,mv('maren','test_hall'));run(f,rule(R[1]));run(f,rel('maren','brenna','trust'));run(f,cond('maren',['minor_injury']));run(f,mv('maren','test_room'));run(f,rule(R[2]));}],
 ['FX10_repeated_trust','brenna','Trust raised twice toward Maren then affection once',f=>{run(f,rel('brenna','maren','trust'));run(f,rel('brenna','maren','trust'));run(f,rel('brenna','maren','affection'));}],
 ['FX11_moves_plus_rules_construct','gerome','Three moves and two rules for the silent construct',f=>{run(f,mv('gerome','test_hall'));run(f,rule(R[0]));run(f,mv('gerome','test_yard'));run(f,rule(R[2]));run(f,mv('gerome','test_hall'));}],
];
const out=[];
for(const [id,character,note,build] of cases){
  const f=mk();build(f);const snap=f.campaign.exportSnapshot(),catalog=reflectionEvidence(f.world,snap,character),vc=validationContext(f.world,snap,character,characterView);
  out.push({id,origin:'FIXTURE',note,turn:null,revision:snap.revision,cursor_before:-1,developments_since_cursor:snap.premium_characters.find(p=>p.character_id===character).dynamic.recent_developments,
    request:{character:vc.character,evidence:catalog.map(e=>({ref:e.ref,kind:e.kind,text:e.text})),existing:[]},catalog,knownNames:vc.knownNames,worldWords:vc.worldWords,character:vc.character,state_sha:sha(snap)});
}
writeFileSync('saves/d09-reflection-bakeoff/fixture-requests.jsonl',out.map(r=>JSON.stringify(r)).join('\n')+'\n');
console.log(out.map(r=>`${r.id}: ${r.request.evidence.length} evidence, ${r.developments_since_cursor.length} devs`).join('\n'));
