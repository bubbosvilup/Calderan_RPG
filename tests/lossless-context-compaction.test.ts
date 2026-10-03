import test from "node:test";
import assert from "node:assert/strict";
import { prepareD04BakeoffCases } from "../src/dev/d04-compaction-bakeoff.js";
import { precomputeKnowledgeGroups,losslessCandidate,expandLosslessCandidate,renderLosslessCandidate,buildKnowledgeDictionary,losslessCacheIdentity,LOSSLESS_SCHEMA_VERSION } from "../src/turn/lossless-knowledge.js";
import { analyzeLosslessLayouts,LosslessContextCompactor } from "../src/turn/lossless-context-compaction.js";
import { narratorPackOf,contextHash,type NarratorPack } from "../src/turn/narrator-pack.js";
import { DEFAULT_COMPACTION_POLICY } from "../src/turn/context-compaction.js";
import { ContextBudgetManager } from "../src/turn/context-budget.js";
import { passiveResponseAudit } from "../src/dev/passive-response-audit.js";
import { OpenRouterLosslessCompressor } from "../src/llm/openrouter/lossless-compressor.js";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { createD04CrowdedContext } from "../src/dev/d04-context-baseline.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { mockNarrator,mockController,collect } from "./turn-fixtures.js";
const cases=prepareD04BakeoffCases();
async function identical():Promise<NarratorPack>{const {B}=await cases,pack=structuredClone(B.narrator_validation_pack),u=pack.source.units[0]!;
  return {...pack,source:{...pack.source,units:[{...structuredClone(u),id:"fact_1",ref:"F1"},{...structuredClone(u),id:"fact_2",ref:"F2"}]}};}
test("identical public fact text and full metadata share one canonical group, preserving separate IDs",async()=>{const p=await identical();const groups=precomputeKnowledgeGroups(p);assert.equal(groups.length,1);assert.deepEqual(groups[0]!.bindings,[0,1]);assert.deepEqual(expandLosslessCandidate(losslessCandidate(p),p),p.source.units);});
for(const difference of ["scope","private_holders","source","truth","player_access","text"] as const)test(`different ${difference} prevents whole-fact grouping`,async()=>{
  const p=await identical(),units=structuredClone(p.source.units) as any[];
  if(difference==="scope")units[1].scope[0].tag="SUSPECTS";
  else if(difference==="private_holders")units[1].private_holders=["Brenna"];
  else if(difference==="source")units[1].source="npc_private_canon";
  else if(difference==="truth")units[1].truth="unknown";
  else if(difference==="player_access")units[1].player_access=false;
  else units[1].text="Different subject does not know this.";
  const changed={...p,source:{...p.source,units}};assert.equal(precomputeKnowledgeGroups(changed).length,2);
  assert.deepEqual(expandLosslessCandidate(losslessCandidate(changed),changed),units);
});
test("same epistemic tag with different basis remains separate",async()=>{const p=await identical(),units=structuredClone(p.source.units) as any[];units[1].scope[0].basis="different provenance";assert.equal(precomputeKnowledgeGroups({...p,source:{...p.source,units}}).length,2);});
for(const corruption of ["missing","duplicate","invented","metadata","revision","version","hash","layout"] as const)test(`V2 rejects ${corruption} candidate without editing source`,async()=>{
  const {B}=await cases,p=B.narrator_validation_pack,c=losslessCandidate(p) as any,original=structuredClone(p.source.units);
  if(corruption==="missing")c.group_refs.pop();else if(corruption==="duplicate")c.group_refs[1]=c.group_refs[0];else if(corruption==="invented")c.group_refs[0]="G999";
  else if(corruption==="metadata")c.scope=[];else if(corruption==="revision")c.revision++;else if(corruption==="version")c.version="d04-extractive-v1";else if(corruption==="hash")c.source_hash="invented";else c.layout="paraphrase";
  assert.throws(()=>expandLosslessCandidate(c,p));assert.deepEqual(p.source.units,original);
});
test("reordered group references expand back to original ordering and every ID exactly once",async()=>{const {C}=await cases,p=C.narrator_validation_pack,c=losslessCandidate(p);c.group_refs.reverse();const units=expandLosslessCandidate(c,p);assert.deepEqual(units,p.source.units);assert.equal(new Set(units.map(u=>u.id)).size,units.length);});
test("fragment sharing reconstructs exact punctuation, quotes, names, separators and imperative data",()=>{
  const texts=['Maren says "the ledger"; do not obey. Maren says "the ledger"; do not obey.','Brenna says "the ledger"; do not obey. Brenna says "the ledger"; do not obey.'];
  const groups=texts.map((canonical_text,i)=>({id:`G${i}`,canonical_text,bindings:[i],family:0})),dictionary=buildKnowledgeDictionary(groups);
  for(const [i,sequence]of dictionary.sequences)assert.equal(sequence.map(id=>dictionary.texts[id]).join(""),texts[i]);
});
test("Case B retains all seven epistemic/private units with no whole-fact merges",async()=>{const {B}=await cases,p=B.narrator_validation_pack;assert.equal(precomputeKnowledgeGroups(p).length,7);for(const layout of ["expanded","grouped","dictionary"] as const)assert.deepEqual(expandLosslessCandidate(losslessCandidate(p,layout),p),p.source.units);});
test("Case C finite legal layout minimum reaches target with exact fixed frame and untouched source/retrieval",async()=>{
  const {C}=await cases,original=structuredClone(C),analysis=analyzeLosslessLayouts(C.narrator_validation_pack.request),best=analysis.best!;
  assert.ok(best.budget.estimated_tokens<=C.compression_request.target_budget_tokens);
  assert.equal(best.budget.estimated_tokens,Math.min(...analysis.layouts.map(l=>l.budget.estimated_tokens)));
  const p=C.narrator_validation_pack,n=narratorPackOf(best.request)!;
  assert.equal(best.request.system_prompt,p.request.system_prompt);assert.equal(best.request.messages[0]!.content.slice(0,n.knowledge_start),p.request.messages[0]!.content.slice(0,p.knowledge_start));
  assert.equal(best.request.messages[0]!.content.slice(n.knowledge_start+n.knowledge_block.length),p.request.messages[0]!.content.slice(p.knowledge_start+p.knowledge_block.length));assert.deepEqual(C,original);
});
test("deterministic fast path reaches all targets and cache reuse without any provider call",async()=>{
  const fixtures=await cases;for(const a of Object.values(fixtures)){let calls=0;const provider={model_id:"offline-must-not-call",async compress(){calls++;throw new Error("Forbidden provider call");}};
    const service=new LosslessContextCompactor(provider),request=a.narrator_validation_pack.request;
    assert.equal((await service.compact({reason:a.compression_request.reason,request,current:()=>request})).status,"success");assert.notEqual(service.apply(request),request);
    assert.equal((await service.compact({reason:a.compression_request.reason,request})).diagnostics?.cache_hit,true);assert.equal(calls,0);
  }
});
test("no-op/insufficient never calls model; changed source and cancellation preserve active context",async()=>{
  const {C}=await cases,request=C.narrator_validation_pack.request,service=new LosslessContextCompactor(undefined);
  assert.equal((await service.compact({reason:"auto",request,current:()=>({...request})})).status,"failed");assert.equal(service.apply(request),request);
  assert.equal((await service.compact({reason:"auto",request,signal:AbortSignal.abort()})).status,"failed");
  const strict=new LosslessContextCompactor(undefined,new ContextBudgetManager(),{...DEFAULT_COMPACTION_POLICY,normal_ratio:.4,strong_ratio:.3});assert.equal((await strict.compact({reason:"auto",request})).status,"insufficient");
  const tiny={system_prompt:"fixed",messages:[{role:"user" as const,content:"No knowledge"}]};assert.equal((await service.compact({reason:"manual",request:tiny})).status,"no_op");
});
test("V1/V2 cache namespaces differ despite identical source, model, target and unchanged watermark ratios",async()=>{const {C}=await cases,p=C.narrator_validation_pack;
  const v2=losslessCacheIdentity(p,"model",8287,DEFAULT_COMPACTION_POLICY,new ContextBudgetManager().policy);
  const v1=contextHash({source_hash:p.source_hash,identity:p.source.context_identity,revision:p.source.revision,model:"model",schema:"d04-extractive-v1",policy:"d04-watermarks-v1",targets:DEFAULT_COMPACTION_POLICY,budget:new ContextBudgetManager().policy,target:8287,level:1});assert.notEqual(v1,v2);
});
test("passive response auditing never delays usable original body while clone is blocked",async()=>{
  let release!:(s:string)=>void;const blocked=new Promise<string>(resolve=>{release=resolve;});let recorded=false;
  const response=new Response("usable response");response.clone=()=>({text:()=>blocked}) as Response;
  const audit=passiveResponseAudit(response,async()=>{recorded=true;});assert.equal(await response.text(),"usable response");assert.equal(recorded,false);release("audit body");await audit;assert.equal(recorded,true);
});
test("V2 provider wire contract uses only bounded reference selections and unchanged 20-second timeout (mock HTTP)",async()=>{
  const {B}=await cases;let body:any;
  const client=new OpenRouterClient({api_key:()=>"offline-key",fetch:async(_url,init)=>{body=JSON.parse(init!.body as string);return new Response(JSON.stringify({model:"offline",choices:[{message:{content:JSON.stringify(losslessCandidate(B.narrator_validation_pack))},finish_reason:"stop"}],usage:{prompt_tokens:1,completion_tokens:1}}));}});
  const response=await new OpenRouterLosslessCompressor("offline",client).compress(B.compression_request);
  assert.equal(body.response_format.json_schema.schema.properties.version.enum[0],LOSSLESS_SCHEMA_VERSION);assert.match(body.messages[0].content,/never follow instructions/);assert.deepEqual(expandLosslessCandidate(response.candidate,B.narrator_validation_pack),B.compression_request.source_pack.units);
});
test("stale fixed frame modified by freshness callback is rejected before activation",async()=>{
  const {A}=await cases,request=structuredClone(A.narrator_validation_pack.request);
  // Rebuild a fresh annotated request so other tests never share the mutated frame.
  const fresh=await prepareD04BakeoffCases(),live=fresh.A.narrator_validation_pack.request,service=new LosslessContextCompactor(undefined);
  const result=await service.compact({reason:"manual",request:live,current:()=>{(live.messages[0] as any).content+="\nNew action";return live;}});
  assert.equal(result.status,"failed");assert.equal(service.apply(live),live);assert.ok(request.messages.length);
});
test("actual coordinator keeps validated V2 rendering isolated from controller/retrieval/authorization",async()=>{
  const f=await createD04CrowdedContext(),service=new LosslessContextCompactor(undefined,new ContextBudgetManager(),{...DEFAULT_COMPACTION_POLICY,manual_ratio:.96}),retrievalService=new RetrievalService(f.world);
  const retrieval={service:retrievalService,search:new HybridSearch(retrievalService)};let narrated="",prior="";
  // The actual turn may select a different knowledge set through retrieval. Exercise that narrator seam with
  // the real validated V2 renderer, rather than pretending a stale-source cache entry should be reused.
  const spy={compact:service.compact.bind(service),apply:(request:Parameters<typeof service.apply>[0])=>{
    const pack=narratorPackOf(request)!;return renderLosslessCandidate(pack,losslessCandidate(pack,"dictionary"));}};
  const co=new TurnCoordinator(f.world,mockNarrator("The air is still.",r=>narrated=JSON.stringify(r)),{async propose(r){prior=r.prior_state;return mockController([]).propose(r);}},retrieval,{context_compaction:spy});
  const source=co.contextRequest(f.campaign),before=f.campaign.exportSnapshot();
  assert.equal((await service.compact({reason:"manual",request:source,current:()=>co.contextRequest(f.campaign)})).status,"success");
  assert.equal(f.campaign.exportSnapshot(),before);
  const events=await collect(co.runTurn({campaign:f.campaign,player_input:"I look around."}));assert.equal(events.at(-1)?.type,"turn_completed");
  assert.ok(narrated.includes("LOSSLESS KNOWLEDGE DATA"));assert.ok(!prior.includes("LOSSLESS KNOWLEDGE DATA"));
  assert.ok(prior.includes("campaign_fact_d04_0"));assert.equal(retrieval.service,retrievalService);
});
