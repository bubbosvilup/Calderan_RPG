/** Single bounded live evaluation; production providers and authority are unchanged. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {createHash,randomInt} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {EvidenceArtifactStore} from './d09-evidence-artifacts.mjs';
import {inspectEligibilityCheckpoint} from './d09-eligibility-checkpoint.mjs';
import {createProductionDeps} from '../.build/src/app/production.js';
import {GameSession} from '../.build/src/app/game-session.js';
import {createOpeningCampaign,OPENING_HOUSEHOLD} from '../.build/src/campaign/opening-state.js';
import {buildTurnContext} from '../.build/src/turn/context-builder.js';
import {captureProductionReflection} from '../.build/src/turn/structured-reflection-maintenance.js';
import {reflectionDue} from '../.build/src/turn/reflection.js';
import {npcPlusFragments} from '../.build/src/turn/npc-plus.js';
import {OpenRouterClient} from '../.build/src/llm/openrouter/client.js';
import {exactBenchmarkCredential} from '../.build/src/dev/reflection-benchmark.js';

const dir='saves/d09-final-relationship-ablation', iris='campaign_character_iris';
await mkdir(dir,{recursive:true});
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['reasoning','reasoning_details','reasoning_content'].includes(k)).map(([k,x])=>[k,clean(x)])):v;
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const save=(p,v)=>writeFile(`${dir}/${p}`,JSON.stringify(v,null,2)+'\n');
// Exclusive guard rejects reruns even if the previous process failed.
await writeFile(`${dir}/started.json`,JSON.stringify({timestamp:new Date().toISOString(),submitted_cap:8})+'\n',{flag:'wx'});
const store=await EvidenceArtifactStore.open(dir,{mark_pending_on_resume:true});
const frozenPlan=JSON.parse(await readFile('saves/d09-qualifying-reflection-eligibility/conditional-gameplay-plan.json','utf8'));
const prompts=frozenPlan.ordered_prompts, later=frozenPlan.later_prompt;
const sources={};for(const p of execFileSync('git',['ls-files','src','data'],{encoding:'utf8'}).trim().split(/\r?\n/))sources[p]=sha(await readFile(p));
await save('plan-freeze.json',{...frozenPlan,status:'AUTHORIZED LIVE RUN',target_finalized_turns:6,maximum_submitted_attempts:8,ablation_narrator_calls:2,blind_reviewer_calls:1,production_sources:sources,eligibility_plan_sha:sha(await readFile('saves/d09-qualifying-reflection-eligibility/conditional-gameplay-plan.json')),post_setup_direct_commands:false});
process.env.OPENROUTER_API_KEY=exactBenchmarkCredential(process.env.OPENROUTER_API_KEY!==undefined?{env:process.env.OPENROUTER_API_KEY}:{fileText:await readFile('APIKEY.env','utf8')});
const network=globalThis.fetch, ledger=[], observations=[], captures=[];
let deps,world,campaign,coordinator,session,turn=0,phase='gameplay',input,decision,withBody,withoutBody,withText,withoutText,withSent=0,withoutSent=0,reviewSent=0;
const targetNote=s=>s.premium_reflections.find(r=>r.character_id===iris)?.notes.find(n=>{const c=n.structured?.proposal.claim;return c?.type==='relationship_trajectory'&&c.target_character_id==='nicco'&&c.dimension==='respect'&&c.from==='none'&&c.to==='moderate'&&c.direction==='increase'&&c.transition_count===2;});
const respect=s=>s.relationships.find(r=>r.from_character_id===iris&&r.to_character_id==='nicco')?.dimensions.respect??'none';
const readCheckpoint=s=>{const c=captureProductionReflection(campaign,world,iris);return {...inspectEligibilityCheckpoint(s,c.catalog,iris),relationship_snapshot:s.relationships.find(r=>r.from_character_id===iris&&r.to_character_id==='nicco')??null,all_relationship_developments:c.catalog.filter(e=>e.evidence_type==='relationship_change'&&e.owner_character_id===iris&&e.payload.other_id==='nicco'),reflection_due:reflectionDue(s,iris),packing_candidates:npcPlusFragments(world,s,new Set([iris]),later)};};

async function marginalPrecheck(body,state){
 const note=targetNote(state), recent=coordinator.recent(campaign).forPrompt();
 const context=buildTurnContext(world,state,{input:later,recent_text:recent.map(e=>`${e.player} ${e.narration}`).join(' ')});
 const cp=readCheckpoint(state), ordinary=cp.packing_candidates.find(f=>f.tier==='B');
 const entry=note?`${note.kind.replace(/_/g,' ')} "${note.text}"`:null;
 const occurrences=entry?body.messages.reduce((n,m)=>n+m.content.split(entry).length-1,0):0;
 const history=cp.respect_history, secondRevision=history[1]?.revision;
 const newer=cp.all_relationship_developments.filter(e=>e.revision>secondRevision);
 const ordinaryWithoutTarget=ordinary?.text.replace(` | reflection: ${entry}`,'').replace(entry??'\0','');
 const otherNotes=state.premium_reflections.flatMap(r=>r.notes).filter(n=>n.id!==note?.id);
 const rest=JSON.stringify(body.messages.map(m=>({...m,content:entry?m.content.replace(entry,''):m.content})));
 const equivalentMarkers=[...rest.matchAll(/resp>N:[^\s,;]+/g)].map(m=>m[0]);
 // Conservative semantic audit of all actual compact text; raw separate dialogue remains untouched.
 const equivalentProse=/(?:respect[^\n]{0,160}(?:none\s*(?:â†’|->|to)\s*moderate|(?:two|2)\s+increases)|(?:respect|admiration)[^\n]{0,120}(?:grew|growth|grown|earned|developed)[^\n]{0,80}(?:twice|two|2|none|low|moderate))/i.test(rest);
 const gates={A_current_respect:respect(state)==='moderate',B_old_trajectory_not_compact:!ordinaryWithoutTarget?.includes('resp>N:')&&equivalentMarkers.length===0,C_packing_isolation:newer.length>=3||(!ordinaryWithoutTarget?.includes('resp>N:')&&newer.length>0),D_full_note_packed:!!note&&occurrences===1,E_no_other_equivalent_compact_source:!equivalentProse&&!otherNotes.some(n=>/respect/i.test(n.text)&&/(?:none|increase|grew|growth|earned)/i.test(n.text)),F_raw_authority_intact:history.length===2&&cp.stop_respect_development};
 const audit={gates,pass:Object.values(gates).every(Boolean),current_respect:respect(state),target:note,ordinary_tier_b:ordinary,newer_relationship_developments:newer,equivalent_markers:equivalentMarkers,equivalent_prose_detected:equivalentProse,other_notes:otherNotes,all_normal_messages:body.messages,raw_recent:recent,raw_authority_retained:true};
 await save('marginal-value-audit.json',audit);
 if(!audit.pass){decision='MARGINAL_VALUE_NOT_TESTABLE';throw Error(decision);}
 const frozen={state,revision:state.revision,narrative_context:context,recent_conversation:recent,relationship_snapshot:cp.relationship_snapshot,ordinary_packed_history:ordinary,target_reflection:note,provider:deps.provider_status,body,generation_settings:Object.fromEntries(Object.entries(body).filter(([k])=>k!=='messages'))};
 await save('later-use-freeze.json',{...frozen,hashes:Object.fromEntries(Object.entries(frozen).map(([k,v])=>[k,sha(v)])),body_bytes_sha:sha(JSON.stringify(body))});
 withBody=structuredClone(body);withoutBody=structuredClone(body);
 let removed=0;withoutBody.messages=withoutBody.messages.map(m=>{if(!m.content.includes(entry))return m;let text=m.content;if(text.includes(` | reflection: ${entry}; `))text=text.replace(` | reflection: ${entry}; `,' | reflection: ');else if(text.includes(`; ${entry}`))text=text.replace(`; ${entry}`,'');else text=text.replace(` | reflection: ${entry}`,'');removed++;return {...m,content:text};});
 assert.equal(removed,1);assert.deepEqual({...withoutBody,messages:withBody.messages},withBody);
 const diffs=[];for(let i=0;i<body.messages.length;i++){const a=body.messages[i].content,b=withoutBody.messages[i].content;if(a===b)continue;let start=0;while(a[start]===b[start])start++;let end=0;while(end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;const deleted=a.slice(start,a.length-end),inserted=b.slice(start,b.length-end);assert.equal(inserted,'');assert.ok(deleted.includes(entry));assert.ok(deleted===entry||deleted===`${entry}; `||deleted===`; ${entry}`||deleted===` | reflection: ${entry}`);diffs.push({message:i,start,deleted,inserted});}
 assert.equal(diffs.length,1);await save('with-body.json',withBody);await save('without-body.json',withoutBody);await save('body-diff.json',{pass:true,only_target_reflection_removed:true,diffs,with_sha:sha(JSON.stringify(withBody)),without_sha:sha(JSON.stringify(withoutBody)),preserved_raw_state_sha:sha(state)});
}

globalThis.fetch=async(url,init)=>{
 const body=init?.body?JSON.parse(String(init.body)):null;if(!body)return network(url,init);
 let role=phase==='blind_review'?'blind_review':phase==='ablation_without'?'ablation_without':body.response_format?.json_schema?.name==='npc_reflection_v23_cvc_e1'?'reflection':body.response_format?.json_schema?.name==='npc_mannerism_observations'?'extractor':body.model===deps.provider_status.narrator_model?'narrator':'controller';
 if(phase==='later'&&role==='narrator'){
  assert.equal(withSent,0,'No second WITH narrator dispatch authorized');await marginalPrecheck(body,campaign.exportSnapshot());role='ablation_with';withSent++;
 }
 if(role==='ablation_without')assert.equal(++withoutSent,1,'No extra WITHOUT call authorized');
 if(role==='blind_review')assert.equal(++reviewSent,1,'No extra reviewer call authorized');
 const before=campaign.exportSnapshot(),request=await store.recordRequest({turn,role,body,body_sha:sha(String(init.body)),source_revision:before.revision}),started=performance.now();
 console.log(JSON.stringify({dispatch:request.id,turn,role}));
 if(role==='reflection'){const character=JSON.parse(body.messages[1].content).character.id,c=captureProductionReflection(campaign,world,character);captures.push({id:request.id,turn,character,state:before,request:c.request,catalog:c.catalog});await save('reflection-contexts.json',captures);}
 try{
  const response=await network(url,init),raw=await response.clone().text();
  const receipt=body.stream?raw.split(/\r?\n/).filter(l=>l.startsWith('data: ')).map(l=>{const t=l.slice(6);if(t==='[DONE]')return t;try{return clean(JSON.parse(t));}catch{return {unparsed:t};}}):(()=>{try{return clean(JSON.parse(raw));}catch{return {unparsed:raw};}})();
  const usage=(Array.isArray(receipt)?receipt:[receipt]).filter(r=>r?.usage).at(-1)?.usage;
  const item={id:request.id,turn,role,http_status:response.status,latency_ms:performance.now()-started,reported_cost_usd:typeof usage?.cost==='number'?usage.cost:null,billing:typeof usage?.cost==='number'?'REPORTED':'UNKNOWN',usage:usage??null,receipt};
  await store.recordReceipt(item);ledger.push(item);await save('ledger.json',ledger);const audit=await store.audit();assert.equal(audit.errors.length,0,'Instrumentation integrity failed');
  if(role==='ablation_with')withText=(Array.isArray(receipt)?receipt:[]).map(r=>r?.choices?.[0]?.delta?.content??'').join('');
  return response;
 }catch(e){if(!(await store.audit()).receipts.includes(request.id)){const failure={id:request.id,turn,role,transport_failure:true,billing:'UNKNOWN',latency_ms:performance.now()-started};await store.recordReceipt(failure);ledger.push(failure);await save('ledger.json',ledger);}throw e;}
};

try{
 deps=await createProductionDeps({save_dir:`${dir}/manual-campaign-saves`});world=deps.world;
 assert.equal(deps.provider_status.narrator_model,'z-ai/glm-5.2');assert.equal(deps.provider_status.controller_model,'qwen/qwen3.8-flash');assert.equal(deps.provider_status.reflection_model,'qwen/qwen3.8-flash');
 await save('provider-status.json',deps.provider_status);
 campaign=createOpeningCampaign(world,'d09_final_relationship');
 campaign.apply({expected_revision:campaign.revision,commands:[{kind:'runtime_delta',delta:{player_location:'heartstone_f1'}},{kind:'register_character',character:{id:iris,origin:{kind:'created'},profile:{name:'Iris'},current:{current_location:'heartstone_f1',status:'active'}}},{kind:'join_household',household_id:OPENING_HOUSEHOLD,character_id:iris}]});
 assert.equal(campaign.exportSnapshot().premium_reflections.length,0);assert.ok(campaign.exportSnapshot().premium_characters.every(p=>p.dynamic.recent_developments.every(d=>d.kind==='joined_household')));
 await save('baseline-state.json',campaign.exportSnapshot());
 const create=deps.createCoordinator;session=GameSession.fromCampaign({...deps,createCoordinator:hooks=>{coordinator=create(hooks);return coordinator;},mannerism_diagnostics_sink:r=>appendFile(`${dir}/extractor-runs.jsonl`,JSON.stringify(clean(r))+'\n')},campaign);
 async function submit(text,label){
  input=text;const before=campaign.exportSnapshot(),reservation=await store.recordSubmission({input:text,phase:label,source_revision:before.revision,timestamp:new Date().toISOString()},8);turn=reservation.id;
  const events=[];phase=label==='later'?'later':'gameplay';const outcome=await session.submitPlayerInput(text,{onEvent:e=>events.push(clean(e))}),after=campaign.exportSnapshot(),cp=readCheckpoint(after);
  const calls=ledger.filter(l=>l.turn===turn),record={turn,input:text,phase:label,before,after,outcome,events,checkpoint:cp,request_receipt_ids:calls.map(l=>l.id),before_sha:sha(before),after_sha:sha(after)};
  observations.push(record);await save(`turn-${String(turn).padStart(2,'0')}.json`,record);await save(`checkpoint-${String(turn).padStart(2,'0')}.json`,cp);await save('final-state.json',after);
  const reflectionCaptures=captures.filter(c=>c.turn===turn);for(const c of reflectionCaptures){const {revision:r,premium_reflections:f,...domains}=c.state,{revision:s,premium_reflections:g,...actual}=after;assert.deepEqual(actual,domains,'Reflection changed authoritative domains');}
  const audit=await store.audit();await save('request-receipt-audit.json',audit);assert.equal(audit.errors.length,0);assert.equal(audit.pending_requests.length,0);
  assert.equal(after.runtime.scene.player_location,'heartstone_f1');assert.equal(outcome.trace?.movement?.characters_moved?.length??0,0);
  console.log(JSON.stringify({completed:turn,ok:outcome.ok,revision:after.revision,respect:respect(after),respect_events:cp.respect_history.length,notes:cp.reflection_notes.map(n=>({text:n.text,claim:n.structured?.proposal.claim})),reflection:outcome.trace?.reflection}));
  return cp;
 }
 let cp;
 for(const prompt of prompts.slice(0,2)){cp=await submit(prompt,'respect');if(cp.stop_respect_development)break;if(decision)break;}
 if(!cp.stop_respect_development&&!decision)cp=await submit(frozenPlan.contingency_prompts[0],'respect_contingency');
 if(!cp.stop_respect_development||cp.respect_history.length!==2||respect(campaign.exportSnapshot())!=='moderate')decision??='RELATIONSHIP_REALIZATION_INSUFFICIENT';
 if(!decision&&!targetNote(campaign.exportSnapshot()))decision='QUALIFYING_RELATIONSHIP_REFLECTION_NOT_PRODUCED';
 if(!decision){
  await save('target-reflection-persistence.json',{note:targetNote(campaign.exportSnapshot()),state:campaign.exportSnapshot(),normal_automatic_maintenance:true});
  for(const prompt of prompts.slice(2))cp=await submit(prompt,'packing_isolation');
  const laterCount=()=>cp.all_relationship_developments.filter(e=>e.revision>cp.respect_history[1]?.revision).length;
  if(laterCount()<3)cp=await submit(frozenPlan.contingency_prompts[1],'packing_contingency');
  if(!targetNote(campaign.exportSnapshot()))decision='QUALIFYING_RELATIONSHIP_REFLECTION_NOT_PRODUCED';
  else if(laterCount()<3)decision='MARGINAL_VALUE_NOT_TESTABLE';
 }
 if(!decision){
  await submit(later,'later');
  if(!decision&&withBody&&withSent===1){
   const immutable=sha(campaign.exportSnapshot()),client=new OpenRouterClient();phase='ablation_without';withoutText='';
   for await(const e of client.request(withoutBody,true,60000))if(e.type==='text_delta')withoutText+=e.text;
   assert.equal(sha(campaign.exportSnapshot()),immutable);
   await save('ablation-outputs.json',{WITH:withText,WITHOUT:withoutText,state_unchanged_by_without:true});
   const labels=randomInt(2)?{X:'WITH',Y:'WITHOUT'}:{X:'WITHOUT',Y:'WITH'};
   const dims=['factual_continuity','character_continuity','relationship_continuity','accumulated_development_use','contradiction_avoidance','grounded_specificity','narrative_usefulness','unnecessary_repetition','unsupported_invention'];
   const packageBody={player_input:later,authority:JSON.parse(await readFile(`${dir}/later-use-freeze.json`,'utf8')).state.relationships,prior_delivered_gameplay:observations.filter(o=>o.phase!=='later').map(o=>({input:o.input,narration:o.outcome.narration})),outputs:Object.fromEntries(Object.entries(labels).map(([k,v])=>[k,v==='WITH'?withText:withoutText])),dimensions:dims};
   await save('anonymous-review-package.json',packageBody);phase='blind_review';
   const reviewBody={model:deps.provider_status.controller_model,max_tokens:1800,provider:{only:['alibaba'],order:['alibaba'],allow_fallbacks:false},reasoning:{enabled:false,exclude:true},messages:[{role:'system',content:'You are a blind narrative reviewer, MODEL AGENT NOT HUMAN. Do not guess WITH/WITHOUT assignment. Score supplied nine dimensions integer 0-3, higher better for first seven; last two are penalties, lower better. Respect is NOT trust. Wariness is NOT hostility. Material benefit must reflect historical accumulated respect growth, not generic warmth, prose length, style, invented affection/trust/psychology. Return exact JSON: {scores:{X:{dimension:score},Y:{dimension:score}},winner:"X"|"Y"|"TIE",material_difference:boolean,rationale:string,continuity_evidence:string[],unsupported_material:{X:string[],Y:string[]}}.'},{role:'user',content:JSON.stringify(packageBody)}]};
   let text='';for await(const e of client.request(reviewBody,false,30000))if(e.type==='text_delta')text+=e.text;
   const review=JSON.parse(text);await save('blind-review-frozen.json',{review,assignment_hidden:true,timestamp:new Date().toISOString(),package_sha:sha(packageBody)});
   const score=k=>dims.reduce((a,d,i)=>a+(i<7?1:-1)*(review.scores[k]?.[d]??0),0);
   await save('assignment-reveal.json',{labels,review,winner:review.winner==='TIE'?'TIE':labels[review.winner],material_difference:review.material_difference,WITH_score:score(Object.keys(labels).find(k=>labels[k]==='WITH')),WITHOUT_score:score(Object.keys(labels).find(k=>labels[k]==='WITHOUT'))});
   decision='GROUNDING_REVIEW_REQUIRED';
  }
 }
}catch(e){decision??='TECHNICAL_OR_INSTRUMENTATION_FAILURE';await save('stop-error.json',{message:e.message,classification:decision});console.log(JSON.stringify({stopped:decision,message:e.message}));}
finally{
 if(campaign){await save('final-state.json',campaign.exportSnapshot());await save('relationship-history.json',readCheckpoint(campaign.exportSnapshot()));}
 const audit=await store.audit();await save('request-receipt-audit.json',audit);
 for(const [p,h]of Object.entries(sources))assert.equal(sha(await readFile(p)),h,p);
 await save('source-freeze-after.json',{verified_unchanged:true,production_sources:sources});
 const all=await store.readReceipts();await save('cost-latency.json',{physical_requests:audit.requests.length,receipts:all.length,reported_cost_usd:all.reduce((a,r)=>a+(r.reported_cost_usd??0),0),unknown_billing_ids:all.filter(r=>r.billing==='UNKNOWN').map(r=>r.id),pending_requests:audit.pending_requests,latency_ms:all.reduce((a,r)=>a+(r.latency_ms??0),0),by_role:Object.fromEntries([...new Set(all.map(r=>r.role))].map(role=>[role,{calls:all.filter(r=>r.role===role).length,cost:all.filter(r=>r.role===role).reduce((a,r)=>a+(r.reported_cost_usd??0),0)}]))});
 await save('development-completed.json',{classification:decision,finalized_turns:observations.filter(o=>o.outcome.ok).length,submitted_attempts:observations.length,WITH_calls:withSent,WITHOUT_calls:withoutSent,blind_review_calls:reviewSent,production_unchanged:true,d09:'SOAK PENDING',instrumentation:audit.errors.length?'FAIL':'PASS'});
 globalThis.fetch=network;
 console.log(JSON.stringify({decision,turns:observations.length,finalized:observations.filter(o=>o.outcome.ok).length,calls:audit.requests.length}));
}
