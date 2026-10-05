/** Offline diagnostic fixtures only; never live gameplay or closure evidence. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadWorld} from '../.build/src/world/loader.js';
import {createOpeningCampaign,OPENING_HOUSEHOLD} from '../.build/src/campaign/opening-state.js';
import {CampaignState} from '../.build/src/campaign/campaign-state.js';
import {captureProductionReflection,parseProductionReflection,reflectStructuredAfterTurn} from '../.build/src/turn/structured-reflection-maintenance.js';
import {evaluateStructuredOutputE1} from '../.build/src/turn/structured/reflection-v23-cvc-e1.js';
import {npcPlusFragments,packNpcPlus,npcDeepSources} from '../.build/src/turn/npc-plus.js';
import {buildTurnContext} from '../.build/src/turn/context-builder.js';
import {buildNarratorPrompt} from '../.build/src/turn/prompt-builder.js';
import {estimateContextTokens} from '../.build/src/turn/context-budget.js';
import {RecentConversation} from '../.build/src/turn/recent-conversation.js';
import {ReflectionPacing} from '../.build/src/turn/reflection-pacing.js';

const dir='saves/d09-reflection-utility-review';await mkdir(dir,{recursive:true});
const save=(p,v)=>writeFile(`${dir}/${p}`,JSON.stringify(v,null,2)+'\n');
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
let networkAttempts=0;globalThis.fetch=async()=>{networkAttempts++;throw Error('Offline-only review: network disabled');};
const sources={};for(const p of execFileSync('git',['ls-files','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/))sources[p]=sha(await readFile(p));
await save('source-freeze.json',{sources,paid_calls:0,synthetic_diagnostic_fixtures:true});
const world=await loadWorld('data'),id='campaign_character_iris',input='Iris, what should we keep in mind as we decide what to do together?',names=new Map([[id,'Iris'],['nicco','Nicco']]);
const apply=(c,commands)=>c.apply({expected_revision:c.revision,commands});
const adjust=(dimension,direction='raise')=>({kind:'adjust_relationship',from_character_id:id,to_character_id:'nicco',dimension,direction});
function fixture(label){const c=createOpeningCampaign(world,`d09_packing_${label}`);apply(c,[{kind:'runtime_delta',delta:{player_location:'heartstone_f1'}},{kind:'register_character',character:{id,origin:{kind:'created'},profile:{name:'Iris'},current:{current_location:'heartstone_f1',status:'active'}}},{kind:'join_household',household_id:OPENING_HOUSEHOLD,character_id:id}]);return c;}
const families=['relationship_trajectory','relationship_contrast','relationship_parallel','condition_trajectory','membership_trajectory','movement_trajectory','self_statement_synthesis','environmental_motif','environmental_shared_rule_text'];
function setup(family){
 const c=fixture(family);
 if(family==='relationship_trajectory'){apply(c,[adjust('respect')]);apply(c,[adjust('respect')]);}
 if(family==='relationship_contrast'){apply(c,[adjust('respect')]);apply(c,[adjust('respect'),adjust('wariness')]);}
 if(family==='relationship_parallel'){apply(c,[adjust('respect'),adjust('trust')]);apply(c,[adjust('respect'),adjust('trust')]);}
 if(family==='condition_trajectory'){for(const conditions of [['fatigued'],[],['fatigued'],[]])apply(c,[{kind:'set_condition',character_id:id,conditions}]);}
 if(family==='membership_trajectory'){apply(c,[{kind:'leave_household',household_id:OPENING_HOUSEHOLD,character_id:id}]);apply(c,[{kind:'join_household',household_id:OPENING_HOUSEHOLD,character_id:id}]);}
 if(family==='movement_trajectory'){for(const location_id of ['heartstone_u1','heartstone_f1'])apply(c,[{kind:'move_character',character_id:id,location_id}]);}
 if(family==='self_statement_synthesis'){apply(c,[{kind:'establish_character_contract',character_id:id,field:'social_style',text:'dislikes noise',quote:"I don't like noise."}]);apply(c,[{kind:'establish_character_contract',character_id:id,field:'voice',text:'speaks softly',quote:'I always speak softly.'}]);}
 if(family.startsWith('environmental_')){for(const scope of ['shared reading','household discussions'])apply(c,[{kind:'add_household_rule',household_id:OPENING_HOUSEHOLD,text:`During ${scope}; A quiet-break request needs no explanation and is answered by lowering voices.`}]);}
 const cap=captureProductionReflection(c,world,id),catalog=cap.catalog;
 const rel=d=>catalog.filter(e=>e.evidence_type==='relationship_change'&&e.owner_character_id===id&&e.payload.dimension===d);
 let support,claim;
 if(family==='relationship_trajectory'){support=rel('respect');claim={type:family,target_character_id:'nicco',dimension:'respect',from:'none',to:'moderate',direction:'increase',transition_count:2};}
 if(family==='relationship_contrast'){support=catalog.filter(e=>e.evidence_type==='relationship_change'&&e.revision===c.revision);claim={type:family,target_character_id:'nicco',dimension_a:'respect',state_a:'moderate',dimension_b:'wariness',state_b:'low'};}
 if(family==='relationship_parallel'){support=[...rel('respect'),...rel('trust')];claim={type:family,target_character_id:'nicco',dimension_a:'respect',dimension_b:'trust',from:'none',to:'moderate',transition_count:2};}
 if(family==='condition_trajectory'){support=catalog.filter(e=>e.evidence_type==='condition_change');claim={type:family,condition_id:'fatigued',operations:['add','remove','add','remove'],episode_count:2};}
 if(family==='membership_trajectory'){support=catalog.filter(e=>e.evidence_type==='household_membership');claim={type:family,household_id:OPENING_HOUSEHOLD,operations:['join','leave','rejoin'],join_count:1,rejoin_count:1,leave_count:1};}
 if(family==='movement_trajectory'){support=catalog.filter(e=>e.evidence_type==='movement');claim={type:family,locations:['heartstone_f1','heartstone_u1','heartstone_f1'],transition_count:2};}
 if(family==='self_statement_synthesis'){support=catalog.filter(e=>e.evidence_type==='self_statement');claim={type:family,statement_refs:support.map(e=>e.ref)};}
 if(family.startsWith('environmental_')){support=catalog.filter(e=>e.evidence_type==='household_context');claim=family==='environmental_motif'?{type:family,household_id:OPENING_HOUSEHOLD,event_type:'rule_added',occurrence_count:2}:{type:family,household_id:OPENING_HOUSEHOLD,relation:'shared_exact_segment',anchor_ref:support[0].ref,segment_index:1,occurrence_count:2};}
 const proposal={subject_character_id:id,confidence:'high',evidence_refs:support.map(e=>e.ref),claim};
 const parsed=parseProductionReflection(JSON.stringify({proposals:[proposal]}),cap.request,cap.context),result=evaluateStructuredOutputE1(parsed,cap.context,names);
 assert.equal(result.accepted.length,1,JSON.stringify({family,diagnostics:result.diagnostics}));
 return {campaign:c,proposal,cap,result,support};
}
const pacing=()=>{let clock=0;return new ReflectionPacing(()=>clock,async ms=>{clock+=ms;});};
async function maintain(c,proposals=[],pace=pacing()){return reflectStructuredAfterTurn(c,world,{reflect:async()=>({text:JSON.stringify({proposals}),model:'OFFLINE_DETERMINISTIC_FIXTURE',provider:'NO_PROVIDER'})},{pacing:pace});}
const summaries=[],aging=[],tokens=[],variants=[];
for(const family of families){
 const f=setup(family),c=f.campaign,pace=pacing(),initial=await maintain(c,[f.proposal],pace);
 assert.equal(initial[0]?.accepted.length,1,JSON.stringify({family,initial}));
 const initialState=c.exportSnapshot(),note=initialState.premium_reflections[0].notes[0],base=c.revision,rows=[];
 const supportTokens=npcPlusFragments(world,initialState,new Set([id]),input).find(x=>x.tier==='B').text.split(' | recent ')[1].split(' | ')[0];
 const rawTexts={relationship_trajectory:'resp>N:0â†’L, resp>N:Lâ†’M',relationship_contrast:'toward Nicco: respect moderate, wariness low',relationship_parallel:'resp>N:0â†’L, trust>N:0â†’L, resp>N:Lâ†’M, trust>N:Lâ†’M',condition_trajectory:'+cond:fatigued, -cond:fatigued, +cond:fatigued, -cond:fatigued',membership_trajectory:'joined, left, rejoined',movement_trajectory:'Heartstone F1â†’U1, U1â†’F1',self_statement_synthesis:'social style: dislikes noise | voice: speaks softly',environmental_motif:'household rule additions: 2',environmental_shared_rule_text:'r3,r4 share: A quiet-break request needs no explanation and is answered by lowering voices.'};
 const snapshotTexts={relationship_trajectory:'toward Nicco: respect moderate',relationship_contrast:rawTexts[family],relationship_parallel:'toward Nicco: respect moderate, trust moderate',condition_trajectory:'Iris conditions: none',membership_trajectory:'Iris: current household member',movement_trajectory:'Iris: currently Heartstone F1',self_statement_synthesis:rawTexts[family],environmental_motif:'Active rules: During shared reading; A quiet-break request needs no explanation and is answered by lowering voices. During household discussions; A quiet-break request needs no explanation and is answered by lowering voices.',environmental_shared_rule_text:'Active rules: During shared reading; A quiet-break request needs no explanation and is answered by lowering voices. During household discussions; A quiet-break request needs no explanation and is answered by lowering voices.'};
 tokens.push({family,note:note.text,packed_entry:`${note.kind.replace(/_/g,' ')} "${note.text}"`,note_tokens:estimateContextTokens(note.text),entry_tokens:estimateContextTokens(`${note.kind.replace(/_/g,' ')} "${note.text}"`),minimum_equivalent_raw:rawTexts[family],raw_tokens:estimateContextTokens(rawTexts[family]),current_snapshot:snapshotTexts[family],snapshot_tokens:estimateContextTokens(snapshotTexts[family]),baseline_recent_render:supportTokens,estimator:'ceil(UTF8 bytes/4), NOT provider tokenizer; raw text is a compact meaningful rendering, not internal JSON'});
 function observe(stage,newEvents){
  const state=c.exportSnapshot(),capture=captureProductionReflection(c,world,id),p=state.premium_characters.find(p=>p.character_id===id),packed=packNpcPlus(world,state,new Set([id]),input),line=packed?.lines[0]??'',noteNow=state.premium_reflections.find(r=>r.character_id===id)?.notes.find(n=>n.id===note.id);
  const recent=npcPlusFragments(world,state,new Set([id]),input).find(x=>x.tier==='B')?.text.split(' | recent ')[1]?.split(' | ')[0];
  const valid=evaluateStructuredOutputE1([f.proposal],capture.context,names).diagnostics[0];
  rows.push({revision_offset:state.revision-base,revision:state.revision,stage,new_events:newEvents,raw_window_size:p.dynamic.recent_developments.length,supporting_refs_live:f.proposal.evidence_refs.filter(ref=>capture.catalog.some(e=>e.ref===ref)),required_supporting_refs:f.proposal.evidence_refs.length,note_stored:!!noteNow,full_note_packed:!!noteNow&&line.includes(note.text),recent_compact:recent,rollup:p.dynamic.long_term??null,current_relationship:state.relationships.find(e=>e.from_character_id===id&&e.to_character_id==='nicco')?.dimensions??null,old_proposal_would_validate_now:valid.accepted,revalidation_reasons:valid.reasons,normal_packed:packed});
 }
 observe('post_initial_maintenance',0);
 for(let i=1;i<=24;i++){
  const dims=c.exportSnapshot().relationships.find(e=>e.from_character_id===id&&e.to_character_id==='nicco')?.dimensions;
  apply(c,[adjust('wariness',dims?.wariness==='low'?'lower':'raise')]);observe('post_development_before_maintenance',i);
  const r=await maintain(c,[],pace);if(r.length)observe('post_normal_due_maintenance',i);
 }
 const requested=[0,1,3,5,10,16,20,24].map(offset=>rows.find(r=>r.revision_offset===offset));assert.ok(requested.every(Boolean));
 const firstMissing=rows.find(r=>r.supporting_refs_live.length<r.required_supporting_refs),firstPruned=rows.find(r=>!r.note_stored),sample10=requested.find(r=>r.revision_offset===10);
 assert.equal(sample10.full_note_packed,true,`${family} should retain full note during compact-history aging`);
 if(family!=='self_statement_synthesis')assert.ok(firstPruned,`${family} should eventually lose a source-based note`);
 summaries.push({family,baseline_revision:base,rendered:note.text,source_ref_types:f.support.map(e=>e.evidence_type),first_support_loss:firstMissing?{revision_offset:firstMissing.revision_offset,new_events:firstMissing.new_events}:null,first_note_pruned:firstPruned?{revision_offset:firstPruned.revision_offset,new_events:firstPruned.new_events}:null,requested_offsets:requested});
 aging.push({family,proposal:f.proposal,initial_state:initialState,initial_maintenance:initial,all_rows:rows});
 const topicalInput=family.startsWith('relationship_')?'Iris, what do you think about respect?':family==='condition_trajectory'?'Iris, tell me about being fatigued.':'Iris, what should we keep in mind?';
 // Exact N+10 state is reconstructed from recorded commits in a separate branch for a topical query.
 const topical=CampaignState.restore(world,initialState),tp=pacing();while(topical.revision-base<10){const dims=topical.exportSnapshot().relationships.find(e=>e.from_character_id===id&&e.to_character_id==='nicco')?.dimensions;apply(topical,[adjust('wariness',dims?.wariness==='low'?'lower':'raise')]);if(topical.revision-base<10)await maintain(topical,[],tp);}
 variants.push({family,variant:'topical history can re-enter Tier B before source eviction',revision_offset:topical.revision-base,input:topicalInput,packed:packNpcPlus(world,topical.exportSnapshot(),new Set([id]),topicalInput)});
 variants.push({family,variant:'Tier C carries opaque reflection label, not full note',packed:packNpcPlus(world,initialState,new Set([id]),'I listen.'),full_note_available:packNpcPlus(world,initialState,new Set([id]),'I listen.').lines.some(l=>l.includes(note.text))});
 // Revisions alone do not age source windows.
 const quiet=CampaignState.restore(world,initialState);for(let n=0;n<10;n++)apply(quiet,[{kind:'runtime_delta',delta:{time_advance_minutes:1}}]);
 assert.deepEqual(quiet.exportSnapshot().premium_characters[0].dynamic.recent_developments,initialState.premium_characters[0].dynamic.recent_developments);
 variants.push({family,variant:'10 quiet revisions, no developments',old_history_unchanged:true,full_note_packed:packNpcPlus(world,quiet.exportSnapshot(),new Set([id]),input).lines[0].includes(note.text)});
 if(family==='self_statement_synthesis'){
  const events=f.cap.catalog.filter(e=>e.evidence_type==='statement_event'),other=CampaignState.restore(world,f.cap.snapshot),p={...f.proposal,evidence_refs:events.map(e=>e.ref)};
  assert.equal(evaluateStructuredOutputE1([p],f.cap.context,names).accepted.length,1);
  await maintain(other,[p]);for(let n=0;n<24;n++){const d=other.exportSnapshot().relationships.find(e=>e.from_character_id===id&&e.to_character_id==='nicco')?.dimensions;apply(other,[adjust('wariness',d?.wariness==='low'?'lower':'raise')]);await maintain(other,[]);}
  variants.push({family,variant:'event-supported quote synthesis vs permanent quote-supported synthesis',event_supported_notes_after_24_developments:other.exportSnapshot().premium_reflections[0]?.notes??[],quote_supported_notes_after_24_developments:c.exportSnapshot().premium_reflections[0]?.notes??[]});
 }
 if(family==='relationship_contrast')variants.push({family,variant:'stored current contrast is not revalidated at rendering/merge',first_changed_state:rows.find(r=>r.new_events===1),snapshot_handle_visible_to_provider:f.cap.request.evidence.some(e=>e.evidence_type==='relationship_snapshot')});
 if(family==='membership_trajectory'){
  const away=CampaignState.restore(world,initialState);apply(away,[{kind:'leave_household',household_id:OPENING_HOUSEHOLD,character_id:id}]);variants.push({family,variant:'inactive household member',note_stored:away.exportSnapshot().premium_reflections[0].notes.length>0,packed:packNpcPlus(world,away.exportSnapshot(),new Set([id]),input)??null});
 }
 const without=structuredClone(initialState);without.premium_reflections=[];
 const withPack=packNpcPlus(world,initialState,new Set([id]),input),withoutPack=packNpcPlus(world,without,new Set([id]),input),small=withoutPack.diagnostics.chars_after;
 const tightWith=packNpcPlus(world,initialState,new Set([id]),input,small),tightWithout=packNpcPlus(world,without,new Set([id]),input,small);
 variants.push({family,variant:'counterfactual packing budget, offline only',default_budget:4000,with_tokens:estimateContextTokens(withPack.lines.join('\n')),without_tokens:estimateContextTokens(withoutPack.lines.join('\n')),controlled_small_budget_characters:small,with_tiers:tightWith.diagnostics.tier_counts,without_tiers:tightWithout.diagnostics.tier_counts,with_lines:tightWith.lines,without_lines:tightWithout.lines});
 // Irrelevant input still packs top-ranked full notes when the character is in focus.
 assert.ok(packNpcPlus(world,initialState,new Set([id]),'Iris, look at the cabinet.').lines[0].includes(note.text));
}
const recent=new RecentConversation();for(let i=0;i<22;i++)recent.add({player:`Iris, turn ${i}.`,narration:`Iris nods toward Nicco. Iris says, "Answer ${i}."`,status:'finalized'});
const conversationFixture=fixture('recent'),context=buildTurnContext(world,conversationFixture.exportSnapshot(),{input}),prompt=buildNarratorPrompt(input,context,recent.forPrompt(),{records:[]},{candidates:[],runtime:[]});
await save('recent-conversation-proof.json',{retained:recent.forPrompt(),retained_count:recent.forPrompt().length,normal_prompt:prompt,description_not_replayed:!JSON.stringify(prompt.messages).includes('nods toward Nicco')});
// Legitimate high-ranked redundant families can displace a historical trajectory without query relevance.
const crowded=setup('relationship_trajectory');await maintain(crowded.campaign,[crowded.proposal]);
apply(crowded.campaign,[{kind:'establish_character_contract',character_id:id,field:'social_style',text:'dislikes noise',quote:"I don't like noise."}]);
apply(crowded.campaign,[{kind:'establish_character_contract',character_id:id,field:'voice',text:'speaks softly',quote:'I always speak softly.'}]);
let cc=captureProductionReflection(crowded.campaign,world,id),quotes=cc.catalog.filter(e=>e.evidence_type==='self_statement');
const selfP={subject_character_id:id,confidence:'high',evidence_refs:quotes.map(e=>e.ref),claim:{type:'self_statement_synthesis',statement_refs:quotes.map(e=>e.ref)}};await maintain(crowded.campaign,[selfP]);
apply(crowded.campaign,[adjust('respect'),adjust('wariness'),{kind:'set_condition',character_id:id,conditions:['fatigued']}]);
cc=captureProductionReflection(crowded.campaign,world,id);const latest=cc.catalog.filter(e=>e.evidence_type==='relationship_change'&&e.revision===crowded.campaign.revision);
const contrastP={subject_character_id:id,confidence:'high',evidence_refs:latest.map(e=>e.ref),claim:{type:'relationship_contrast',target_character_id:'nicco',dimension_a:'respect',state_a:'high',dimension_b:'wariness',state_b:'low'}};
const maintenance=await maintain(crowded.campaign,[contrastP]);assert.equal(maintenance[0].accepted.length,1);
const crowdedState=crowded.campaign.exportSnapshot(),crowdedPack=packNpcPlus(world,crowdedState,new Set([id]),'Iris, what should we keep in mind as we decide what to do together?');
assert.equal(crowdedState.premium_reflections[0].notes.length,3);assert.equal(crowdedPack.lines[0].includes(crowded.result.accepted[0].text),false);
await save('reflection-slot-competition.json',{offline_only:true,state:crowdedState,packed:crowdedPack,notes_stored:3,full_notes_packed:2,omitted_historical_trajectory:crowded.result.accepted[0].text,reason:'High confidence contrast (kind priority 5) and self stance (4) outrank trajectory signature pattern (3); no input relevance score.'});
const original=JSON.parse(await readFile('saves/d09-final-matched-ablation/case-11-ablation-freeze.json','utf8'));
const originalFreeze=JSON.parse(await readFile('saves/d09-final-matched-ablation/case-11-freeze.json','utf8'));
await save('previous-matched-request-audit.json',{with_body:original.with_body,without_body:original.without_body,original_proof:original.proof,original_context:originalFreeze.narrative_context,notes:original.targets,with_tokens:estimateContextTokens(JSON.stringify(original.with_body.messages)),without_tokens:estimateContextTokens(JSON.stringify(original.without_body.messages)),same_non_message_settings:JSON.stringify({...original.with_body,messages:[]})===JSON.stringify({...original.without_body,messages:[]}),note:'Matched WITHOUT removes the entry from the already-packed WITH body. It does not repack and cannot restore raw sources previously omitted by packing.'});
await save('history-aging-summary.json',summaries);await save('history-aging-full.json',aging);await save('token-comparison.json',tokens);await save('packing-variants.json',variants);
const runs=[];
for(const directory of ['d09-final-campaign-soak','d09-final-matched-ablation','d09-unique-value-matched-ablation','d09-final-relationship-ablation']){
 const root=`saves/${directory}`,turns=[];for(const name of (await readdir(root)).filter(n=>/^turn-\d+\.json$/.test(n)).sort()){
  const d=JSON.parse(await readFile(`${root}/${name}`,'utf8')),before=d.before,after=d.after;
  turns.push({file:name,finalized:d.outcome?.ok===true,relationship_domain_changed:JSON.stringify(before.relationships)!==JSON.stringify(after.relationships),committed_relationship_command:d.outcome?.trace?.committed_command_kinds?.includes('adjust_relationship')??false,recent_relationship_events:after.premium_characters.flatMap(p=>p.dynamic.recent_developments).filter(e=>e.kind==='relationship_changed').length});
 }
 runs.push({directory,retained_attempt_artifacts:turns.length,finalized:turns.filter(t=>t.finalized).length,relationship_change_turns:turns.filter(t=>t.relationship_domain_changed||t.committed_relationship_command).length,turns});
}
await save('existing-live-reachability.json',{runs,scope:'retained canonical-world turn artifacts only; not a representative organic frequency estimate; older summaries and overwritten/missing attempts excluded'});
const sections=[];
for(const f of aging){const context=buildTurnContext(world,f.initial_state,{input}),body=buildNarratorPrompt(input,context,[],{records:[]},{candidates:[],runtime:[]}).messages[0].content;const matches=[...body.matchAll(/^\[[^\n\]]+\]/gm)];sections.push({family:f.family,npc_plus_tokens:estimateContextTokens(context.npc_plus.lines.join('\n')),sections:matches.map((m,i)=>{const text=body.slice(m.index,matches[i+1]?.index??body.length);return {header:m[0],characters:text.length,estimated_tokens:estimateContextTokens(text)};})});}
await save('normal-source-token-sections.json',sections);
for(const [p,h]of Object.entries(sources))assert.equal(sha(await readFile(p)),h,p);
assert.equal(networkAttempts,0);await save('offline-validation.json',{families:9,all_initial_proposals_validated_and_persisted_offline:true,all_N_plus_10_full_notes_packed:true,nonself_notes_pruned_after_source_eviction:8,quiet_revision_proofs:9,network_attempts:0,paid_calls:0,production_source_hashes_unchanged:Object.keys(sources).length,live_closure_evidence:false});
console.log(JSON.stringify({families:9,paid_calls:0,aging:summaries.map(s=>({family:s.family,first_support_loss:s.first_support_loss,first_note_pruned:s.first_note_pruned})),live_runs:runs.map(r=>({directory:r.directory,finalized:r.finalized,relationship_change_turns:r.relationship_change_turns}))}));
