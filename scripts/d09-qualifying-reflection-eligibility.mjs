/** Offline proof only. No production dependency factory or provider implementation is imported. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadWorld} from '../.build/src/world/loader.js';
import {createOpeningCampaign, OPENING_HOUSEHOLD} from '../.build/src/campaign/opening-state.js';
import {buildTurnContext} from '../.build/src/turn/context-builder.js';
import {contractCommands} from '../.build/src/turn/character-contracts.js';
import {prepareCommit} from '../.build/src/turn/stages/commit-preparation.js';
import {statementProvenance} from '../.build/src/turn/structured/reflection-v22.js';
import {captureProductionReflection, parseProductionReflection} from '../.build/src/turn/structured-reflection-maintenance.js';
import {E1_SCHEMA, evaluateStructuredOutputE1, validateStructuredClaimE1} from '../.build/src/turn/structured/reflection-v23-cvc-e1.js';
import {schemaMatches} from '../.build/src/turn/structured/reflection-v2.js';
import {reflectionDue} from '../.build/src/turn/reflection.js';
import {npcPlusFragments} from '../.build/src/turn/npc-plus.js';
import {buildNarratorPrompt} from '../.build/src/turn/prompt-builder.js';
import {playerIntent} from '../.build/src/turn/player-intent.js';
import {parseControllerEvidenceProposal} from '../.build/src/llm/controller-schema.js';
import {deriveTurnEvidence} from '../.build/src/turn/turn-evidence.js';
import {authorizeWithEvidence} from '../.build/src/turn/evidence-authorization.js';
import {inspectEligibilityCheckpoint} from './d09-eligibility-checkpoint.mjs';

const dir='saves/d09-qualifying-reflection-eligibility'; await mkdir(dir,{recursive:true});
const save=(name,value)=>writeFile(`${dir}/${name}`,JSON.stringify(value,null,2)+'\n');
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
let attemptedNetworkCalls=0;
globalThis.fetch=async()=>{attemptedNetworkCalls++; throw Error('Offline-only task: network forbidden');};
const paths=execFileSync('git',['ls-files','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/), sources={};
for(const p of paths)sources[p]=sha(await readFile(p)); await save('source-freeze.json',{sources,offline_only:true});
const world=await loadWorld('data'), id='campaign_character_iris';
function fixture(label) {
  const campaign=createOpeningCampaign(world,`d09_eligibility_${label}`);
  campaign.apply({expected_revision:campaign.revision,commands:[{kind:'runtime_delta',delta:{player_location:'heartstone_f1'}},
    {kind:'register_character',character:{id,origin:{kind:'created'},profile:{name:'Iris'},current:{current_location:'heartstone_f1',status:'active'}}},
    {kind:'join_household',household_id:OPENING_HOUSEHOLD,character_id:id}]});
  return campaign;
}
function finalize(campaign,narration,authorizedCommands=[]) {
  const before=campaign.exportSnapshot(), context=buildTurnContext(world,before), extracted=contractCommands(narration,context,before), skipped=[];
  const prepared=campaign.prepare({expected_revision:before.revision,commands:authorizedCommands});
  const plan=prepareCommit({world,prepare:proposal=>campaign.prepare(proposal),prepared,commands:authorizedCommands,finalized:[],player_input:'Iris, I listen.',
    delivered:narration,scene:{participants:[]},base_revision:before.revision,location_changed:false,on_skip:reason=>skipped.push(reason)});
  campaign.commit(plan.receipt); assert.deepEqual(skipped,[]);
  const captured=captureProductionReflection(campaign,world,id), provenance=statementProvenance(captured.catalog,id);
  return {before_revision:before.revision,after_revision:campaign.revision,commands:extracted,authorized_commands:authorizedCommands,
    statements:provenance.map(link=>({link,quote:captured.catalog.find(e=>e.ref===link.statement_ref).payload.quote,
      source_event:captured.catalog.find(e=>e.ref===link.source_event_ref)}))};
}
const candidates=[
  ['moral_boundary',"I won't hurt children.",true],
  ['moral_boundary','I will never betray friends.',true],
  ['moral_boundary','I would never harm children.',true],
  ['moral_boundary',"I'd never abandon children.",true],
  ['moral_boundary','I shall not torture prisoners.',true],
  ['personal_habit','I always speak plainly.',true],
  ['personal_habit','I speak softly.',true],
  ['personal_habit',"I don't mince words.",true],
  ['social_preference',"I don't like noise.",true],
  ['social_preference','I do not trust strangers.',true],
  ['social_preference','I never care for crowds.',true],
  ['self_description',"I've always been stubborn.",true],
  ['self_description','I have always been patient and careful.',true],
  ['personal_habit','I always tap my fingers.',false],
  ['intention','I want to rest.',false],
  ['intention','I will take a quiet break.',false],
  ['refusal',"I won't hurt you.",false],
  ['social_preference','I prefer quiet.',false],
  ['self_description','I am stubborn.',false],
  ['hedge',"Maybe I've always been stubborn.",false],
  ['conditional','If they pressure me, I will never hurt children.',false],
  ['question','Would I ever hurt children?',false],
  ['negation',"I don't always speak plainly.",false],
  ['unsupported_clause',"I don't like noise because it distracts me.",false],
  ['refusal',"I won't talk now.",false],
  ['situational',"I don't like this.",false],
  ['typographic_contraction','I won\u2019t hurt children.',false],
];
const matrix=[];
for(const [i,[category,utterance,expected]] of candidates.entries()) {
  const campaign=fixture(`candidate_${i+1}`), result=finalize(campaign,`Iris says, "${utterance}"`);
  const accepted=result.commands.length>0; assert.equal(accepted,expected,utterance);
  matrix.push({category,utterance,narration:`Iris says, "${utterance}"`,accepted,classification:accepted?'DEFINITELY ACCEPTED in explicit active/present attribution':'REJECTED / unsupported by current anchored grammar',
    contract_field:result.commands[0]?.field??null,normalized_value:result.commands[0]?.text??null,
    statement_ref:result.statements[0]?.link.statement_ref??null,source_event:result.statements[0]?.source_event??null,
    revision_before:result.before_revision,revision_after:result.after_revision,
    reason:accepted?'Exact supported anchored form; no hedge/question; attributed first person; unset active-NPC field.':'No contract command: unsupported full-sentence form or conservative question/hedge/conditional/pronoun gate. No reject diagnostic is emitted; reasons derive from source predicates.'});
}
for(const [label,narration] of [
  ['unquoted','Iris always speaks plainly.'],['unattributed','"I always speak plainly."'],
  ['wrong_speaker','Nicco says, "I always speak plainly."'],
  ['curly_quotes','Iris says, \u201cI always speak plainly.\u201d'],
  ['pronoun_attribution','Iris looks at Nicco. "I always speak plainly," she says.'],
]) {
  const result=finalize(fixture(label),narration), accepted=result.commands.length>0;
  assert.equal(accepted,['curly_quotes','pronoun_attribution'].includes(label));
  matrix.push({category:label,utterance:narration,accepted,contract_field:result.commands[0]?.field??null,
    normalized_value:result.commands[0]?.text??null,statement_ref:result.statements[0]?.link.statement_ref??null,
    source_event:result.statements[0]?.source_event??null,revision_before:result.before_revision,revision_after:result.after_revision,
    reason:accepted?'Production quote/speaker attribution succeeded.':'Unquoted, speakerless or non-active-NPC first-person utterance cannot establish Iris authority.'});
}
await save('fixture-matrix.json',matrix); assert.ok(matrix.filter(r=>r.accepted).length>=4);

const campaign=fixture('selected'), A="I don't like noise.", B='I always speak softly.';
const first=finalize(campaign,`Iris says, "${A}"`), firstCapture=captureProductionReflection(campaign,world,id);
const firstDue=reflectionDue(campaign.exportSnapshot(),id);
const firstCheckpoint=inspectEligibilityCheckpoint(campaign.exportSnapshot(),firstCapture.catalog,id);
assert.equal(firstCheckpoint.statement_authorities.length,1);assert.equal(firstCheckpoint.stop_self_statement_development,false);
const second=finalize(campaign,`Iris says, "${B}"`), c=captureProductionReflection(campaign,world,id), links=statementProvenance(c.catalog,id);
assert.equal(links.length,2);assert.equal(new Set(links.map(l=>l.origin_revision)).size,2);assert.ok(links.every(l=>l.source_event_ref));
const secondCheckpoint=inspectEligibilityCheckpoint(campaign.exportSnapshot(),c.catalog,id);assert.equal(secondCheckpoint.stop_self_statement_development,true);
await save('read-only-checkpoints.json',{first:firstCheckpoint,second:secondCheckpoint,stop_after_second:true});
const proposal={subject_character_id:id,confidence:'high',evidence_refs:links.map(l=>l.source_event_ref),claim:{type:'self_statement_synthesis',statement_refs:links.map(l=>l.statement_ref)}};
const envelope={proposals:[proposal]};
assert.equal(schemaMatches(E1_SCHEMA,envelope),true);assert.equal(schemaMatches(c.request.wire_schema,envelope),true);
const parsed=parseProductionReflection(JSON.stringify(envelope),c.request,c.context), result=evaluateStructuredOutputE1(parsed,c.context,new Map([[id,'Iris']]));
assert.equal(result.accepted.length,1);assert.ok(links.every(l=>c.context.citation.statement_refs.includes(l.statement_ref)));
assert.equal(c.request.evidence.some(e=>e.evidence_type==='self_statement'),false);
const contextual={...proposal,evidence_refs:[...proposal.evidence_refs,c.catalog.find(e=>e.evidence_type==='household_membership').ref]};
assert.equal(validateStructuredClaimE1(contextual,c.context).accepted,true);
const visibilityNegative={...proposal,claim:{...proposal.claim,statement_refs:proposal.evidence_refs}};
assert.equal(validateStructuredClaimE1(visibilityNegative,c.context).accepted,false);
const singleContextResult={...proposal,claim:{...proposal.claim,statement_refs:[links[0].statement_ref,links[0].statement_ref]}};
assert.equal(validateStructuredClaimE1(singleContextResult,c.context).accepted,false);
const sameRevision=fixture('same_revision');finalize(sameRevision,`Iris says, "${A} ${B}"`);
const same=captureProductionReflection(sameRevision,world,id), sameLinks=statementProvenance(same.catalog,id);
assert.equal(sameLinks.length,2);assert.equal(new Set(sameLinks.map(l=>l.origin_revision)).size,1);
const sameProposal={...proposal,evidence_refs:sameLinks.map(l=>l.source_event_ref),claim:{...proposal.claim,statement_refs:sameLinks.map(l=>l.statement_ref)}};
assert.equal(validateStructuredClaimE1(sameProposal,same.context).accepted,false);
const duplicates=fixture('duplicates');finalize(duplicates,'Iris says, "I will never hurt children."');
const equivalent=finalize(duplicates,'Iris says, "I won\'t hurt children."');assert.equal(equivalent.commands.length,0);
const near=finalize(duplicates,'Iris says, "I will never harm children."');assert.equal(near.commands.length,1);
const setOnce=fixture('set_once');finalize(setOnce,'Iris says, "I speak softly."');
const contradiction=finalize(setOnce,'Iris says, "I speak bluntly."');assert.equal(contradiction.commands.length,0);
await save('duplicate-and-revision-checks.json',{moral_paraphrase_same_normalized_value_skipped:equivalent,near_semantic_synonym_not_deduplicated:near,
  set_once_contradiction_skipped:contradiction,same_revision_two_contracts_rejected:validateStructuredClaimE1(sameProposal,same.context),same_revision_links:sameLinks,
  duplicate_selector_rejected:true,event_as_statement_selector_rejected:true,compatible_contextual_evidence_accepted:true});
await save('selected-authority-state.json',{offline_only:true,not_gameplay_closure_evidence:true,first,second,state:campaign.exportSnapshot(),links});
await save('synthesis-eligibility.json',{status:'PASS',proposal,canonical_schema:true,wire_schema:true,validator:result.diagnostics,rendered:result.accepted[0].text,
  separate_revisions:links.map(l=>l.origin_revision),independent_statement_authorities:2,contextual_false_rejections:0,scope:'Offline eligibility only, not provider realization/persistence/narration benefit'});
await save('request-wire-eligibility.json',{status:'PASS',request:c.request,full_catalog:c.catalog,citation_context:c.context.citation,wire:c.wire,
  selected_statement_refs:proposal.claim.statement_refs,visible_typed_selectors:true,hidden_handle_dependency:false,
  exposure:'Full quote rows omitted normally; exact typed event provenance exposes both selectors. Full canonical quote authority remains in catalog.'});
await save('reflection-trigger-plan.json',{first_contract_due:firstDue,first_request_statement_selectors:firstCapture.context.citation.statement_refs,
  second_contract_due:reflectionDue(campaign.exportSnapshot(),id),minimum_additional_developments:0,
  reason:'A newly established contract independently makes reflection due. The second is later than any maintenance source captured after the first, even if that first attempt persisted empty. No third development is necessary.',
  first_attempt_may_be_valid_empty:true,no_cursor_mutation:true,rollup_required:false});

const later='Iris, if a difficult disagreement comes up while we share this room, how would you want us to handle the conversation?';
const snapshot=campaign.exportSnapshot(), context=buildTurnContext(world,snapshot,{input:later}), ordinary=npcPlusFragments(world,snapshot,new Set([id]),later).find(f=>f.tier==='B');
assert.ok(ordinary.text.includes('voice: speaks softly'));assert.ok(ordinary.text.includes('social style: dislikes noise'));
const normalPrompt=buildNarratorPrompt(later,context,[],[],playerIntent(later,context,snapshot,world));
assert.ok(JSON.stringify(normalPrompt).includes('voice: speaks softly'));
assert.ok(JSON.stringify(normalPrompt).includes('social style: dislikes noise'));
await save('later-use-and-marginal-precheck.json',{later_prompt:later,normal_context:context,ordinary_tier_b_source:ordinary,normal_prompt_without_any_reflection:normalPrompt,
  intended_combined_use:'Manage disagreement without loud pressure while respecting Iris\'s own soft-speaking habit and dislike of noise.',
  equivalent_compact_synthesis_already_present:true,ordinary_combined_meaning:['voice: speaks softly','social style: dislikes noise'],
  self_synthesis_unique_value:false,reason:'Both normalized authoritative meanings occur together in the same ordinary compact NPC+ source. The frozen reflection renderer merely joins exact quotes; attribution/wording alone does not establish material unique value.',
  future_ablation_condition:'RUN only when target note accepted/persisted, full text normally packed, relevant later scene, and no other packed source expresses substantially the same combined meaning; retain all raw authority. Otherwise MARGINAL_VALUE_NOT_TESTABLE.',
  no_paid_run_authorized:true});
await save('conditional-gameplay-plan.json',{status:'DRAFT ONLY; DO NOT RUN - final unique-value gate D fails',classification:'DEVELOPMENT-RICH CONTROLLED GAMEPLAY',location:'heartstone_f1',movement:false,
  finalized_turn_target:'6-8 maximum; stop development as soon as two distinct target contracts exist',
  prompts:[
    'Iris, when several conversations compete in one room, what sort of company or surroundings do you usually dislike?',
    'Iris, when you need to say something difficult, how do you usually speak? I want to understand your own way of doing it.',
    'Iris, is that an ordinary preference for you, or only how this room feels today?',
    'Iris, when you want someone to hear you without pressure, what is your usual speaking habit?',
    'Iris, I leave room for you to answer in your own words. Is there a stable preference you want me to understand?',
    'Iris, I listen without interrupting. What would make a difficult conversation easier for you?',
  ],later_prompt:later,
  checkpoint:'After every finalized turn inspect stable.contract_evidence and production statement provenance. Record first target. After second distinct target at a later revision STOP development; do not require more turns. Automatic normal maintenance is observed, never suppressed or forced. If bounded turns yield one/none, STOP; no manual reflection or A/B.',
  submission_guard:'Reserve a submission artifact exclusively before submitPlayerInput; count interrupted and failed submissions against a hard cap of 8. Stop at awaited turn boundaries; never kill a live loop merely to adapt prompts.',
  realization_guaranteed:false,exact_answers_supplied_by_player:false});

// Conditional relationship fallback: every delta passes exact controller schema + hybrid
// evidence authorization before deterministic finalization. No direct relationship writes.
const fallback=fixture('relationship_fallback'), relationshipTurns=[];
const developments=[
  {dimension:'respect',direction:'raise',narration:'Iris says, "I respect your willingness to hear my disagreement, Nicco."',input:'Iris, before we decide anything, I make room for your opinion and agree to hear a disagreement. How do you regard that way of handling a decision?'},
  {dimension:'respect',direction:'raise',narration:'Iris says, "I admire your careful attention, Nicco."',input:'Iris, I take your concern seriously and work through the practical details carefully. How does my handling of it affect what you think of my judgement?'},
  {dimension:'wariness',direction:'raise',narration:'Iris stiffens as she watches Nicco carefully.',input:'I raise my voice while describing my side of the disagreement, then leave Iris room to reply.'},
  {dimension:'wariness',direction:'lower',narration:'Iris relaxes near Nicco.',input:'I lower my voice and apologize for making the conversation uncomfortable. Iris, you may answer at your own pace.'},
  {dimension:'wariness',direction:'raise',narration:'Iris stiffens as Nicco presses his point.',input:'I press my point once more and ask Iris for a direct answer, then listen.'},
];
for(const [i,d]of developments.entries()) {
  const state=fallback.exportSnapshot(),ctx=buildTurnContext(world,state,{input:d.input}),intent=playerIntent(d.input,ctx,state,world);
  const command={kind:'adjust_relationship',from_character_id:id,to_character_id:'nicco',dimension:d.dimension,direction:d.direction};
  const parsed=parseControllerEvidenceProposal(JSON.stringify({commands:[{command,evidence_quote:d.narration}]}));
  const diagnostics=authorizeWithEvidence(parsed.map(p=>p.command),parsed.map(p=>p.evidence_quote),deriveTurnEvidence(intent,d.narration,ctx),d.narration,ctx,state,'hybrid');
  assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].authorized,true,JSON.stringify({turn:i+1,diagnostics}));
  const finalized=finalize(fallback,d.narration,diagnostics.filter(d=>d.authorized).map(d=>d.command));
  relationshipTurns.push({turn:i+1,...d,diagnostics,finalized});
}
const f=captureProductionReflection(fallback,world,id),respect=f.catalog.filter(e=>e.evidence_type==='relationship_change'&&e.owner_character_id===id&&e.payload.dimension==='respect');
assert.equal(respect.length,2);
const relProposal={subject_character_id:id,confidence:'high',evidence_refs:respect.map(e=>e.ref),claim:{type:'relationship_trajectory',target_character_id:'nicco',dimension:'respect',from:'none',to:'moderate',direction:'increase',transition_count:2}};
const relEnvelope={proposals:[relProposal]};assert.equal(schemaMatches(f.request.wire_schema,relEnvelope),true);
const relResult=evaluateStructuredOutputE1(parseProductionReflection(JSON.stringify(relEnvelope),f.request,f.context),f.context,new Map([[id,'Iris'],['nicco','Nicco']]));assert.equal(relResult.accepted.length,1);
assert.equal(inspectEligibilityCheckpoint(fallback.exportSnapshot(),f.catalog,id).stop_respect_development,true);
const fallbackLater='Iris, I would like your counsel before deciding how to handle a difficult disagreement. How should we approach it together?';
const fState=fallback.exportSnapshot(),fContext=buildTurnContext(world,fState,{input:fallbackLater}),fOrdinary=npcPlusFragments(world,fState,new Set([id]),fallbackLater).find(row=>row.tier==='B');
assert.ok(fOrdinary.text.includes('respect moderate'));assert.equal(fOrdinary.text.includes('resp>N:'),false);
const rawRecent=relationshipTurns.map(t=>({player:t.input,narration:t.narration,status:'finalized'}));
const fPrompt=buildNarratorPrompt(fallbackLater,fContext,rawRecent,[],playerIntent(fallbackLater,fContext,fState,world));
assert.equal(JSON.stringify(fPrompt).includes('resp>N:'),false);
await save('relationship-fallback-eligibility.json',{status:'PASS - conditional on live realization',offline_only:true,turns:relationshipTurns,state:fState,
  proposal:relProposal,validation:relResult.diagnostics,rendered:relResult.accepted[0].text,wire:f.request.wire_schema,provider_visible_request:f.request,
  later_prompt:fallbackLater,ordinary_compact_source:fOrdinary,normal_prompt:fPrompt,raw_recent_supplied_intact:rawRecent,
  equivalent_compact_trajectory_already_present:false,plausible_unique_value:'The two-step growth from initially absent respect to moderate respect is absent from ordinary compact context, which supplies only current moderate respect and three newer wariness changes. Reflection could preserve earned/accumulated development when Iris is asked for counsel, instead of flattening it into a present score.',
  limits:['Plausible value only; no material benefit or provider realization is proven.','Raw individual conversation/history must stay untouched.','Future actual compact sources, unrelated reflections and retrieval must be rechecked; any equivalent trajectory stops A/B.','The same two-event trajectory is redundant immediately after turn 2; only consider the later turn after three genuine newer relationship developments.'],
  contrast_fallback:'A current contrast alone remains redundant with current dimensions and is not selected.',
  reflection_due_plan:{first_due_after_respect_events:2,lifecycle_join_entries:1,additional_newer_events_after_normal_first_maintenance:3,
    newer_events_proof:fState.premium_characters[0].dynamic.recent_developments.filter(e=>e.revision>relationshipTurns[1].finalized.after_revision).length,
    note:'Proof state omits simulated memory writes; actual live revision numbers shift with automatic maintenance. Counts/ordering remain the same.'},
  checkpoint:'Target trajectory requires two authorized respect increases in distinct revisions. The three later wariness developments must materialize independently through normal authority, not be forced or injected.'});
await save('conditional-gameplay-plan.json',{status:'PREVALIDATED OFFLINE fallback; no live calls authorized this task',selected_family:'relationship_trajectory',preferred_self_statement_route:'Do not use for A/B: compact-equivalent meaning already present',
  classification:'DEVELOPMENT-RICH CONTROLLED GAMEPLAY',location:'heartstone_f1',movement:false,finalized_turn_target:'6-8 maximum; hard cap 8 total submitted attempts including failed/interrupted submissions',
  ordered_prompts:developments.map(d=>d.input),later_prompt:fallbackLater,
  contingency_prompts:[
    'Iris, what do you think of the way I have listened and worked through your concern?',
    'Iris, I stop arguing my side and give you room to say how you feel about this exchange.',
  ],
  branching:'After each awaited turn inspect authoritative state and production catalog. Missing development is not assumed. Freeze each evidence event and exact before/after revision. Once two respect increases exist, stop trying to develop respect. Observe the separate three-turn interaction phase only to create a genuinely later, nonredundant packing opportunity. Use at most two topic-only follow-up attempts within total 8 if a required development is absent; otherwise stop. Do not run until explicitly requested.',
  self_checkpoint:'If live play unexpectedly establishes self contracts, record exact provenance. After two distinct relevant contracts, stop that development phase and inspect synthesis eligibility. If only one by the bound, no self reflection/A/B case. Do not suppress automatic production maintenance.',
  minimum_extra_trigger_developments:'Self statements: 0. Relationship: first due after two changes plus joining; after normal maintenance, three newer changes make due again. Cursor is never changed by the harness.',
  marginal_precheck:'A/B only if useful accepted/persisted target exists, full text normally packed, later scene relevant, and no other compact packed source already expresses the same trajectory. Keep recent conversation and all raw authority. Otherwise STOP MARGINAL_VALUE_NOT_TESTABLE.',
  clean_stop:'No forced process interruption to adapt prompts. Allocate both submission and physical request IDs from exclusive artifacts; resume uses maximum captured request index, preserves unresolved calls, and audits one-to-one receipts.',
  realization_guaranteed:false,exact_NPC_answers_or_reactions_supplied_by_player:false,production_tuning:false});
for(const [p,h]of Object.entries(sources))assert.equal(sha(await readFile(p)),h,p);
assert.equal(attemptedNetworkCalls,0);
await save('decision-freeze.json',{eligibility_gate:'PASS - relationship fallback only',gates:{A_supported_distinct_forms:'PASS',B_frozen_semantics:'PASS',C_provider_visible_wire:'PASS',D_plausible_unique_marginal_value:'PASS for prevalidated relationship fallback; FAIL for selected self case',E_instrumentation_fixed:'PASS (focused tests recorded separately)'},
  authority_eligibility:'PASS',reason:'Self synthesis is reachable but redundant. A separately controller/evidence-authorized relationship trajectory has a later normal-packing opportunity with plausible unique marginal value.',
  d09:'SOAK PENDING',prior_concern:'REFLECTION_USEFULNESS_CONCERN remains',previous_pair:'VALID NEGATIVE RESULT; preserved',paid_calls:0,production_unchanged:true,
  next_step:'If subsequently authorized, one bounded 6-8-turn live sequence using the exact relationship fallback plan. This task performs no live run; no offline state or stubbed outputs count toward D-09 closure.'});
await save('hashes.json',{production_sources:sources,selected_state:sha(snapshot),proposal:sha(proposal),request:sha(c.request),wire:sha(c.wire.schema),ordinary_compact_source:sha(ordinary.text),normal_later_prompt:sha(normalPrompt),
  fallback_state:sha(fState),fallback_proposal:sha(relProposal),fallback_request:sha(f.request),fallback_wire:sha(f.request.wire_schema),fallback_normal_prompt:sha(fPrompt),
  gameplay_plan:sha(await readFile(`${dir}/conditional-gameplay-plan.json`))});
console.log(JSON.stringify({fixtures:matrix.length,accepted:matrix.filter(r=>r.accepted).length,rejected:matrix.filter(r=>!r.accepted).length,
  semantic:'PASS',request_wire:'PASS',self_unique_marginal_value:'FAIL',fallback_unique_marginal_value:'PASS - plausible only',eligibility:'PASS - relationship fallback',additional_self_developments:0,paid_calls:0,production_unchanged:true}));
