/** Evaluation only. Build, --prepare, then --run. --summarize is offline. No semantic transport adaptations. */
import { readFile, writeFile, mkdir, appendFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { isDeepStrictEqual as equal } from 'node:util';
import { CASES, dellId, respectLower } from './controller-bakeoff-round-2-cases.mjs';
import { turnFixture } from '../.build/src/dev/turn-fixture.js';
import { mockNarrator, metadata, collect } from '../.build/tests/turn-fixtures.js';
import { TurnCoordinator } from '../.build/src/turn/turn-coordinator.js';
import { RetrievalService } from '../.build/src/retrieval/retrieval-service.js';
import { HybridSearch } from '../.build/src/retrieval/hybrid-search.js';
import { DeepSeekStateControllerProvider, DEFAULT_CONTROLLER_MODEL, CONTROLLER_POLICY } from '../.build/src/llm/openrouter/deepseek-controller.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { CONTROLLER_EVIDENCE_SCHEMA, parseControllerEvidenceProposal } from '../.build/src/llm/controller-schema.js';
import { DEFAULT_RETRY_POLICY, ProviderBudget, withProviderRetry } from '../.build/src/llm/retry.js';
import { scoreControllerCommands, falseProposalSeverity, latencyStats } from '../.build/src/dev/controller-bakeoff-metrics.js';

const models=['deepseek/deepseek-v4-flash-0731:nitro','qwen/qwen3.8-flash'];
const dir=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'saves/controller-bakeoff-round-2';
assert.ok(dir&&execFileSync('git',['check-ignore',dir+'/prepared.json'],{encoding:'utf8'}).trim(),'Raw output must be git-ignored');
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
async function sourceHash() {
  const h=createHash('sha256');
  async function visit(dir) { for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) { const p=dir+'/'+e.name; if(e.isDirectory())await visit(p);else{h.update(p);h.update(await readFile(p));} } }
  await visit('src');await visit('data');return h.digest('hex');
}
function fixture(c) {
  const f=turnFixture(!!c.garments);
  const extra=[];
  if(c.maren_at_hall)extra.push({kind:'move_character',character_id:'maren',location_id:'test_hall'});
  if(c.brenna_knows)extra.push({kind:'set_knowledge',knowledge:{character_id:'brenna',fact_id:'campaign_fact_bridge_closed',status:'knows'}});
  if(c.dell)extra.push({kind:'register_character',character:{id:dellId,origin:{kind:'created'},profile:{name:'Dell Harrow',age:{kind:'exact',years:38},sex:'male',species:'Human',appearance:{description:'A thick-armed dockworker in a salt-stained coat.'}},current:{current_location:'test_room',status:'active',presentation:'Sour-tempered and loud after a long shift.'}}});
  if(c.contract_probe)extra.push({kind:'seed_relationship',relationship:{from_character_id:'brenna',to_character_id:'nicco',dimensions:{respect:'moderate'}}});
  f.campaign.apply({expected_revision:f.campaign.revision,commands:[
    {kind:'create_household',id:'campaign_household_home',name:'Home'},
    {kind:'set_membership',household_id:'campaign_household_home',membership:{character_id:'nicco',status:'member',role:'owner'}},
    ...['maren','brenna'].map(character_id=>({kind:'join_household',household_id:'campaign_household_home',character_id})),...extra]});
  return f;
}
// Compare authoritative domains, excluding revision numbers, diagnostic history and narration metadata.
function stateProjection(s) {
  const scrub=v=>Array.isArray(v)?v.map(scrub):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!/revision$/.test(k)).map(([k,x])=>[k,scrub(x)])):v;
  return scrub({characters:s.characters,items:s.items,households:s.households,facts:s.facts,knowledge:s.knowledge,relationships:s.relationships,goals:s.goals,scheduled_events:s.scheduled_events,funds:s.funds,legal_statuses:s.legal_statuses,transactions:s.transactions,runtime:s.runtime});
}
async function replay(c, result, frozen) {
  const f=fixture(c),service=new RetrievalService(f.world);let request;
  const co=new TurnCoordinator(f.world,mockNarrator(c.narration),{async propose(r){
    request={player_action:r.player_action,prior_state:r.prior_state,final_narration:r.final_narration};
    if(frozen)assert.deepEqual(request,frozen,'Frozen production request changed');return result;
  }},{service,search:new HybridSearch(service)},{provider_retry:false});
  const events=await collect(co.runTurn({campaign:f.campaign,player_input:c.input}));
  return {request,result:events.find(e=>e.type==='turn_completed')?.result??null,failure:events.find(e=>e.type==='turn_failed')??null,state:stateProjection(f.campaign.exportSnapshot())};
}
function idsIn(v,out=new Set()) { if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if((k==='id'||k.endsWith('_id')||k==='player_location'||k==='current_location')&&typeof x==='string')out.add(x);else idsIn(x,out);}return out; }
function commandIds(command){const ids=[];function walk(v){if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(k.endsWith('_id')&&typeof x==='string')ids.push(x);else walk(x);}}walk(command);return ids;}
function reviewedSeverity(score,c){
  const prior=JSON.parse(c.request.prior_state);
  return score.false_positives.map(command=>({command,severity:falseProposalSeverity(command,new Set(c.known_ids),score.duplicate_proposals.some(x=>equal(x,command)),[...c.expected,...c.optional],command.kind==='set_knowledge'&&prior.context.knowledge.some(k=>k.character_id===command.knowledge.character_id&&k.fact_id===command.knowledge.fact_id&&k.status==='knows'))}));
}
async function prepare() {
  assert.equal(CASES.length,30);assert.equal(new Set(CASES.map(c=>c.id)).size,30);
  assert.ok(CASES.filter(c=>c.adversarial.length).length>=8);
  await mkdir(dir,{recursive:true});await mkdir(dir+'/cells',{recursive:true});await mkdir(dir+'/started',{recursive:true});
  const catalog=await(await fetch('https://openrouter.ai/api/v1/models')).json();
  const selected=models.map(id=>{const m=catalog.data.find(m=>m.id===id.replace(':nitro',''));assert.ok(m,'Exact family ID unavailable');return {request_id:id,...m};});
  const endpoints=await Promise.all(selected.map(async m=>({model:m.request_id,...await(await fetch('https://openrouter.ai/api/v1/models/'+m.id+'/endpoints')).json()})));
  const prepared=[];
  for(const c of CASES){
    const p=await replay(c,{...metadata,commands:c.expected,evidence:c.gold_quotes??c.expected.map(()=>c.narration)});
    assert.ok(p.request,`Missing production request: ${c.id}`);assert.ok(p.result,`Gold replay failed: ${c.id} ${JSON.stringify(p.failure)}`);
    assert.equal(p.request.final_narration,c.narration);
    assert.ok(!p.request.prior_state.includes('HIDDEN_SECRET_SENTINEL'),'Private knowledge leaked');
    const prior=JSON.parse(p.request.prior_state),known=idsIn(prior);known.add('nicco');
    for(const e of [...c.expected,...c.optional])for(const id of commandIds(e))assert.ok(known.has(id),`Controller-infeasible ID ${id}: ${c.id}`);
    for(const e of c.expected)assert.ok(p.result.authorized_commands.some(x=>equal(x,e)),`Gold command rejected ${c.id}: ${JSON.stringify(p.result.authorization)}`);
    for(const e of c.expected.filter(e=>e.kind==='set_knowledge'))assert.ok(prior.context.facts.some(f=>f.id===e.knowledge.fact_id),'Expected fact not visible');
    if(c.optional.length){
      const q=await replay(c,{...metadata,commands:[...c.expected,...c.optional],evidence:[...(c.gold_quotes??c.expected.map(()=>c.narration)),...c.optional.map(()=>c.narration)]},p.request);
      assert.ok(q.result,'Optional gold failed');for(const e of c.optional)assert.ok(q.result.authorized_commands.some(x=>equal(x,e)),'Optional command rejected');
      assert.deepEqual(q.state,p.state,'Engine-owned path did not supply identical authoritative result without model');
    }
    if(c.id==='m03_temporary_exit'){
      const q=await replay(c,{...metadata,commands:[]},p.request);
      assert.ok(!equal(q.state,p.state),'Temporary departure unexpectedly engine-owned');
    }
    let exclusion_validation=null;
    if(c.contract_probe){
      const q=await replay(c,{...metadata,commands:c.contract_probe,evidence:c.contract_probe.map(()=>c.narration)},p.request);
      assert.ok(q.result&&!q.result.authorization.some(a=>a.authorized),'Respect/lower gap unexpectedly closed');
      exclusion_validation=q.result.authorization;
    }
    prepared.push({...c,request:p.request,input_hash:hash(p.request),known_ids:[...known].sort(),gold_authorization:p.result.authorization,gold_state:p.state,gold_state_hash:hash(p.state),exclusion_validation});
  }
  const setup={prepared_at:new Date().toISOString(),base_head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_sha256:await sourceHash(),policy_sha256:hash(CONTROLLER_POLICY),schema_sha256:hash(CONTROLLER_EVIDENCE_SCHEMA),production_default:DEFAULT_CONTROLLER_MODEL,models:selected,endpoints,routing:'DeepSeek production :nitro on every case; Qwen plain ID, sole advertised Alibaba upstream; require_parameters:true unchanged',policy:{max_tokens:512,timeout_ms:20000,stream:false,reasoning:{enabled:false,exclude:true},temperature:'unset; production provider defaults',retry:'production DEFAULT_RETRY_POLICY: two attempts, 250–500 ms backoff, 120 s budget',samples_per_case:1},cases:prepared};
  await writeFile(dir+'/prepared.json',JSON.stringify(setup,null,2),{flag:'wx'});
  console.log(JSON.stringify({prepared:30,scored:prepared.filter(c=>c.scored).length,required_commands:prepared.reduce((s,c)=>s+c.expected.length,0),engine_owned_commands:prepared.reduce((s,c)=>s+c.optional.length,0),strict_abstention_cases:prepared.filter(c=>c.expected_abstention).length,adversarial_cases:prepared.filter(c=>c.adversarial.length).length,base_head:setup.base_head,paid_calls:0}));
}
async function run(){
  assert.ok(process.env.OPENROUTER_API_KEY?.trim(),'Missing API credential');
  const setup=JSON.parse(await readFile(dir+'/prepared.json','utf8'));
  assert.equal(await sourceHash(),setup.source_sha256,'Source changed after freezing');assert.equal(hash(CONTROLLER_POLICY),setup.policy_sha256);assert.equal(hash(CONTROLLER_EVIDENCE_SCHEMA),setup.schema_sha256);
  // Sequential scenario-major alternating order avoids concurrency distortion and balances time/order effects.
  for(const[index,c]of setup.cases.entries())for(const model of index%2?[...models].reverse():models){
    const key=`${c.id}-${models.indexOf(model)}`,path=dir+'/cells/'+key+'.json';
    try{await readFile(path);continue;}catch(e){if(e.code!=='ENOENT')throw e;}
    await writeFile(dir+'/started/'+key,JSON.stringify({started_at:new Date().toISOString(),model,case:c.id}),{flag:'wx'});
    const attempts=[];let result=null,error=null,retry_record=null;
    const wrapped=async(url,options)=>{
      const body=JSON.parse(options.body);
      assert.equal(body.model,model);assert.equal(body.max_tokens,512);assert.deepEqual(body.reasoning,{exclude:true,enabled:false});
      assert.deepEqual(body.messages,[{role:'system',content:CONTROLLER_POLICY},{role:'user',content:JSON.stringify(c.request)}]);
      assert.deepEqual(body.response_format.json_schema.schema,CONTROLLER_EVIDENCE_SCHEMA);
      const a={attempt:attempts.length+1,started_at:new Date().toISOString(),wire_request:body,http_status:null,raw_response:null,response:null,transport_error:null};attempts.push(a);
      try{const res=await fetch(url,options);a.http_status=res.status;a.raw_response=await res.clone().text();try{a.response=JSON.parse(a.raw_response);}catch{}await appendFile(dir+'/attempts.jsonl',JSON.stringify({cell:key,model,...a})+'\n');return res;}
      catch(e){a.transport_error=e.name;await appendFile(dir+'/attempts.jsonl',JSON.stringify({cell:key,model,...a})+'\n');throw e;}
    };
    const provider=new DeepSeekStateControllerProvider(new OpenRouterClient({fetch:wrapped}),{model});
    const abort=new AbortController(),started=performance.now();
    try{result=await withProviderRetry({policy:DEFAULT_RETRY_POLICY,budget:new ProviderBudget(DEFAULT_RETRY_POLICY),signal:abort.signal,checkpoint(){},record:r=>{retry_record=r;},run:(_attempt,timeout_ms)=>provider.propose({...c.request,...(timeout_ms?{timeout_ms}:{})})});}
    catch(e){error=e.code??e.message;}
    const end_to_end_ms=performance.now()-started,last=attempts.at(-1),raw=last?.response,content=raw?.choices?.[0]?.message?.content??'';
    let raw_json_valid=false,wire_schema_valid=false;try{JSON.parse(content);raw_json_valid=true;}catch{}try{parseControllerEvidenceProposal(content);wire_schema_valid=true;}catch{}
    const model_outcome_available=attempts.some(a=>a.http_status===200),score=scoreControllerCommands(result?.commands??[],c.expected,c.optional);
    const validation=result?await replay(c,result,c.request):null;
    const severity=reviewedSeverity(score,c);
    const usage=raw?.usage??result?.usage??{};
    let cost_usd=0,cost_available=true;for(const a of attempts){if(typeof a.response?.usage?.cost==='number')cost_usd+=a.response.usage.cost;else if(a.http_status===200){const u=a.response?.usage,price=setup.models.find(m=>m.request_id===model).pricing;if(typeof u?.prompt_tokens==='number'&&typeof u?.completion_tokens==='number')cost_usd+=u.prompt_tokens*Number(price.prompt)+u.completion_tokens*Number(price.completion);else cost_available=false;}}
    const auth=validation?.result?.authorization??[];
    const authorized_outside_gold=auth.filter(a=>a.authorized&&![...c.expected,...c.optional].some(e=>equal(e,a.command))).map(a=>a.command);
    const state_match=validation?.result?equal(validation.state,c.gold_state):null;
    const row={scenario:c.id,category:c.category,model,input_hash:c.input_hash,scored:c.scored,expected:c.expected,optional:c.optional,proposed:result?.commands??[],evidence:result?.evidence??null,...score,exact_match:result?score.exact_match:false,correct_abstention:c.expected_abstention?!!result&&result.commands.length===0:null,severity,model_outcome_available,raw_json_valid,wire_schema_valid,production_parse_valid:!!result,normalization:result?.normalization??null,api_schema_acceptance:last?.http_status===200,error,structured_output_invalid:error==='structured_output_invalid',empty_response:last?.http_status===200&&!content,refusal:error==='model_refusal',timeout:error==='timeout',finish_reason:raw?.choices?.[0]?.finish_reason??null,generation_latency_ms:result?.latency.elapsed_total_ms??(last?.http_status===200?end_to_end_ms:null),end_to_end_ms,retry_record,retries:Math.max(0,attempts.length-1),initial_http_failure:attempts[0]?.http_status>=400,usage,cost_usd:cost_available?cost_usd:null,cost_source:typeof usage.cost==='number'?'OpenRouter usage.cost':'catalog token estimate or no reported charge',provider:raw?.provider??null,validation:validation?{authorization:auth,turn_failure:validation.failure,authorized_outside_gold,state_match,actual_state_hash:hash(validation.state),gold_state_hash:c.gold_state_hash,engine_missing:c.expected.concat(c.optional).filter(e=>!validation.result?.authorized_commands.some(a=>equal(a,e))),reconciliation:validation.result?.narration_reconciliation??null}:null,attempts:attempts.map(({wire_request,raw_response,response,...a})=>({...a,provider:response?.provider??null,usage:response?.usage??null}))};
    await writeFile(path,JSON.stringify(row,null,2),{flag:'wx'});
    console.log(`${c.id} ${model}: ${error??(c.scored?`${row.exact_match?'exact':'mismatch'} TP=${score.true_positives.length} FP=${score.false_positives.length} FN=${score.false_negatives.length}`:'excluded contract probe')} retries=${row.retries} e2e=${(end_to_end_ms/1000).toFixed(2)}s`);
  }
  await summarize();
}
function aggregate(rows){
  const scored=rows.filter(r=>r.scored&&r.model_outcome_available),tp=scored.reduce((s,r)=>s+r.true_positives.length,0),fp=scored.reduce((s,r)=>s+r.false_positives.length,0),fn=scored.reduce((s,r)=>s+r.false_negatives.length,0);
  return {cells:rows.length,generated_responses:rows.reduce((s,r)=>s+r.attempts.filter(a=>a.http_status===200).length,0),scored_cases:scored.length,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,context_feasible_recall:tp+fn?tp/(tp+fn):null,correct_abstention:scored.filter(r=>r.correct_abstention===true).length,abstention_cases:scored.filter(r=>r.correct_abstention!==null).length,exact_cases:scored.filter(r=>r.exact_match).length,duplicates:scored.reduce((s,r)=>s+r.duplicate_proposals.length,0),severity:Object.fromEntries(['severe','moderate','low'].map(k=>[k,scored.reduce((s,r)=>s+r.severity.filter(e=>e.severity===k).length,0)])),api_accepted:rows.filter(r=>r.api_schema_acceptance).length,raw_json_valid:rows.filter(r=>r.raw_json_valid).length,wire_schema_valid:rows.filter(r=>r.wire_schema_valid).length,production_parse_valid:rows.filter(r=>r.production_parse_valid).length,normalizations:rows.filter(r=>r.normalization).length,structured_output_invalid:rows.filter(r=>r.structured_output_invalid).length,empty_responses:rows.filter(r=>r.empty_response).length,refusals:rows.filter(r=>r.refusal).length,initial_http_failures:rows.filter(r=>r.initial_http_failure).length,retries:rows.reduce((s,r)=>s+r.retries,0),recovered_retries:rows.filter(r=>r.retry_record?.recovered).length,unrecovered_failures:rows.filter(r=>r.error).length,failed_attempts:rows.reduce((s,r)=>s+r.attempts.filter(a=>a.http_status>=400||a.transport_error).length,0),prompt_tokens:rows.reduce((s,r)=>s+(r.usage.prompt_tokens??0),0),completion_tokens:rows.reduce((s,r)=>s+(r.usage.completion_tokens??0),0),cost_usd:rows.reduce((s,r)=>s+(r.cost_usd??0),0),unknown_cost_cells:rows.filter(r=>r.cost_usd===null).length,latency_generation:latencyStats(rows.map(r=>r.generation_latency_ms).filter(x=>x!==null)),latency_end_to_end:latencyStats(rows.map(r=>r.end_to_end_ms)),providers:[...new Set(rows.map(r=>r.provider).filter(Boolean))],engine_state_matches:scored.filter(r=>r.validation?.state_match).length,engine_state_mismatches:scored.filter(r=>r.validation?.state_match===false).length,engine_turn_failures:scored.filter(r=>r.validation?.turn_failure).length,engine_unexpected_authorized:scored.reduce((s,r)=>s+(r.validation?.authorized_outside_gold.length??0),0),engine_missing_commands:scored.reduce((s,r)=>s+(r.validation?.engine_missing.length??0),0)};
}
async function summarize(){
  const setup=JSON.parse(await readFile(dir+'/prepared.json','utf8')),rows=[];
  for(const f of(await readdir(dir+'/cells')).filter(f=>f.endsWith('.json')))rows.push(JSON.parse(await readFile(dir+'/cells/'+f,'utf8')));
  // Review severity against the frozen prior state: regranting existing knowledge is redundant, not invented knowledge.
  for(const r of rows)r.severity=reviewedSeverity(r,setup.cases.find(c=>c.id===r.scenario));
  assert.equal(new Set(rows.map(r=>r.model+':'+r.scenario)).size,rows.length);
  assert.ok(rows.reduce((s,r)=>s+r.attempts.filter(a=>a.http_status===200).length,0)<=60,'Generated outputs repeated');
  const categorySummary=rs=>{const a=aggregate(rs);return Object.fromEntries(['cells','scored_cases','tp','fp','fn','precision','context_feasible_recall','correct_abstention','abstention_cases','exact_cases','duplicates','severity','engine_missing_commands'].map(k=>[k,a[k]]));};
  const summaries=models.map(model=>({model,...aggregate(rows.filter(r=>r.model===model)),categories:Object.fromEntries(['abstention','knowledge','relationships','movement','multi-action','duplication'].map(cat=>[cat,categorySummary(rows.filter(r=>r.model===model&&r.category===cat))]))}));
  const disagreements=[];for(const c of setup.cases){const pair=models.map(model=>rows.find(r=>r.model===model&&r.scenario===c.id));if(pair.some(r=>!r))continue;if(!scoreControllerCommands(pair[0].proposed,pair[1].proposed).exact_match||pair[0].production_parse_valid!==pair[1].production_parse_valid)disagreements.push({id:c.id,category:c.category,scored:c.scored,gold:c.expected,allowed_engine_owned:c.optional,contract_probe:c.contract_probe??null,evidence_basis:c.evidence_basis,results:pair.map(r=>({model:r.model,proposed:r.proposed,exact:c.scored?r.exact_match:null,fp:c.scored?r.false_positives:null,fn:c.scored?r.false_negatives:null,severity:c.scored?r.severity:null,semantic_probe_match:c.contract_probe?scoreControllerCommands(r.proposed,c.contract_probe).exact_match:null,engine_state_match:r.validation?.state_match??null,error:r.error}))});}
  const manifest={round:2,status:rows.length===60?'complete':'partial',prepared_at:setup.prepared_at,analyzed_at:new Date().toISOString(),base_head:setup.base_head,source_sha256:setup.source_sha256,policy_sha256:setup.policy_sha256,schema_sha256:setup.schema_sha256,production_default:setup.production_default,routing:setup.routing,policy:setup.policy,models:setup.models.map(({request_id,id,canonical_slug,pricing,supported_parameters,reasoning})=>({request_id,id,canonical_slug,pricing,supported_parameters,reasoning})),cases:setup.cases.map(({request,gold_authorization,gold_state,known_ids,exclusion_validation,...c})=>({...c,preflight_gold_authorized:true,exclusion_validation:exclusion_validation?.map(a=>({authorized:a.authorized,reason:a.reason,evidence_check:a.evidence?.check}))??null})),summaries,disagreements};
  const compact='{\n'+Object.entries(manifest).map(([k,v])=>'  '+JSON.stringify(k)+': '+(['cases','summaries','disagreements'].includes(k)?'[\n'+v.map(x=>'    '+JSON.stringify(x)).join(',\n')+'\n  ]':JSON.stringify(v))).join(',\n')+'\n}\n';
  await writeFile('docs/evaluations/controller-bakeoff-round-2-summary.json',compact);
  console.log(JSON.stringify(summaries.map(({categories,...s})=>s),null,2));
}
if(process.argv.includes('--prepare'))await prepare();else if(process.argv.includes('--run'))await run();else if(process.argv.includes('--summarize'))await summarize();else throw new Error('Use --prepare, --run, or --summarize; build first.');
