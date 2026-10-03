import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createD04CrowdedContext } from "./d04-context-baseline.js";
import { turnFixture } from "./turn-fixture.js";
import { WorldStore } from "../world/world-store.js";
import { CampaignState } from "../campaign/campaign-state.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { WorldEntity } from "../types/entities.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { buildNarratorPrompt } from "../turn/prompt-builder.js";
import { ContextBudgetManager } from "../turn/context-budget.js";
import { DEFAULT_COMPACTION_POLICY, validateCompressionCandidate } from "../turn/context-compaction.js";
import { COMPRESSION_SCHEMA_VERSION, COMPRESSION_POLICY_VERSION, narratorPackOf, renderCandidateRequest, type NarratorPack } from "../turn/narrator-pack.js";
import { COMPRESSOR_SYSTEM, COMPRESSOR_SCHEMA, type CompressionResponse } from "../llm/context-compressor-provider.js";
import type { NarratorRequest } from "../turn/stages/narration.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { retrieveForTurn } from "../turn/retrieval-policy.js";
import type { RecentExchange } from "../turn/recent-conversation.js";
export function createBakeoffArtifact(label: string, request: NarratorRequest, manager = new ContextBudgetManager()) {
 const pack = narratorPackOf(request); if(!pack) throw new Error("An annotated narrator request is required");
 const budget = manager.measure(request), target = Math.floor(Math.min(budget.usable_budget_tokens * DEFAULT_COMPACTION_POLICY.normal_ratio, budget.estimated_tokens * DEFAULT_COMPACTION_POLICY.manual_ratio));
 return { label, schema_version: COMPRESSION_SCHEMA_VERSION, policy_version: COMPRESSION_POLICY_VERSION, compressor_system: COMPRESSOR_SYSTEM, compressor_schema: COMPRESSOR_SCHEMA,
  compression_request: { source_pack: pack.source, source_hash: pack.source_hash, context_identity: pack.source.context_identity, target_budget_tokens: target, reason: budget.compaction_required ? "auto" as const : "manual" as const, level: 1 },
  baseline: budget, context_policy: manager.policy, compaction_policy: DEFAULT_COMPACTION_POLICY,
  validation_oracle: { ids: pack.source.units.map(u=>u.id), refs: pack.source.units.map(u=>u.ref), epistemology: pack.source.units.map(({text:_text,...tags})=>tags), semantic_contract: "All non-article-the words, numbers, identifiers and punctuation in exact order/case; quoted spans and character names exact. No new IDs/scopes/tags. Unknown permission is not actual ignorance." },
  // All fields below originated in the already filtered narrator projection; no CampaignSnapshot is exported.
  narrator_validation_pack: pack,
 };
}
export function evaluateBakeoffCandidate(artifact: ReturnType<typeof createBakeoffArtifact>, response: CompressionResponse, duration_ms: number) {
 const manager = new ContextBudgetManager(artifact.context_policy); let accepted=false, failure="", after=artifact.baseline;
 try { const candidate=validateCompressionCandidate(response.candidate,artifact.narrator_validation_pack); const request=renderCandidateRequest(artifact.narrator_validation_pack,candidate.units); after=manager.measure(request);
  accepted=after.estimated_tokens<artifact.baseline.estimated_tokens && after.estimated_tokens<=artifact.compression_request.target_budget_tokens && !after.hard_limit_reached;
  if(!accepted)failure="target_or_size";
 } catch(error) {failure=error instanceof Error ? error.message : "validation_failed";}
 return { accepted, deterministic_fidelity: accepted ? "extractive_contract_pass" : "rejected", failure, target_success:accepted,
  compression_ratio:after.estimated_tokens/artifact.baseline.estimated_tokens, final_estimated_tokens:after.estimated_tokens,duration_ms,usage:response.usage??null,cost_usd:response.cost_usd??null,
  human_semantic_review_required:true, schema_retry_failures:failure ? 1:0 };
}
async function epistemicCase() {
 const original = turnFixture(); const entities=structuredClone(original.world.listEntities()) as WorldEntity[];
 const lore=entities.find(e=>e.id==="ironbound")!; lore.knowledge={visibility:{narrator:true,player:false},known_by:["maren"]}; lore.content="Ironbound keeps its west ledger in a locked cabinet. Only Maren was told where the key is hidden.";
 const world=new WorldStore(entities.map(entity=>({source:`d04/${entity.id}.yaml`,document:{schema_version:1,entity,chunks:[]}})));
 const campaign=new CampaignState(world,"d04_epistemic",{player_location:"test_room",world_time:{world_minute:100}});
 const examples=[
  ["known","The western bridge is open.","true","knows"],
  ["unknown","Brenna does not know whether the western keeper has a key.","true","knows"],
  ["suspected","A sealed box may contain the missing ledger; this is only a suspicion.","unknown","suspects"],
  ["false_belief","The keeper owns the southern warehouse.","false","believes"],
  ["uncertain","It is uncertain whether the harbor shipment arrived before sunset.","unknown","knows"],
  ["rumor","The west ledger was copied; this is an unverified rumor.","unknown","heard_rumor"],
 ] as const;
 const commands:CampaignCommand[]=[];
 for(const [key,statement,truth,status] of examples) {const id=`campaign_fact_d04_${key}`;commands.push({kind:"create_fact",fact:{id,content:{kind:"campaign",statement,truth}}},{kind:"set_knowledge",knowledge:{character_id:"nicco",fact_id:id,status:"knows"}},{kind:"set_knowledge",knowledge:{character_id:"maren",fact_id:id,status}});}
 // The fact itself is narrator-visible; Brenna has no permission to use any of it. No inference of actual ignorance from that absence.
 campaign.apply({expected_revision:campaign.revision,commands}); const context=buildTurnContext(world,campaign.exportSnapshot());
 return buildNarratorPrompt("What do you know?",context,[],undefined,{candidates:[],runtime:[]});
}
/** Local-only construction: lexical retrieval, no model/embedding calls. */
export async function prepareD04BakeoffCases() {
 const a=await createD04CrowdedContext(); const b=await epistemicCase();
 const descriptions=["the keeper counted the sealed crates against the harbor ledger", "the watchman checked the wax mark before the gate closed", "the porter recorded the warehouse door and the delivery time", "the clerk compared the receipt with the household account", "the buyer reserved the empty cart until the morning tide", "the steward retained the original invoice for the outstanding debt", "the ferryman noted the quay and the captain who signed", "the guard inspected the manifest without opening the sealed box", "the messenger left the signed copy at the west warehouse", "the owner confirmed the delivery against the old purchase record"];
 const detailed=(index:number)=>`Ledger ${index}: `+Array.from({length:20},(_,j)=>`Entry ${j+1} records that ${descriptions[(index+j)%descriptions.length]}.`).join(" ");
 const mixed=await createD04CrowdedContext({statement:detailed}), service=new RetrievalService(mixed.world), input="Tell me about the Inquisition and the harbor ledger.";
 const retrieval=await retrieveForTurn(input,mixed.context,mixed.world,{service,search:new HybridSearch(service)});
 const recent:RecentExchange[]=Array.from({length:12},(_,i)=>({player:`I ask D04 Person ${i%7} to wait while I compare the harbor ledger.`,narration:`D04 Person ${i%7} says, "I can wait here while you compare the numbered entries. The sealed copies are on the same page; I will keep my place until you have finished reading."`,status:"finalized"}));
 const c=buildNarratorPrompt(input,mixed.context,recent,retrieval.data,{candidates:[],runtime:[]});
 const artifacts={A:createBakeoffArtifact("A crowded knowledge: 7 NPC+, 32 known/16 selected facts each",a.request),B:createBakeoffArtifact("B epistemic and private distinctions",b),C:createBakeoffArtifact("C mixed ledger detail, dialogue, scene and permission-filtered lore",c)};
 return artifacts;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const cases=await prepareD04BakeoffCases(); await mkdir("saves/d04-context/bakeoff",{recursive:true});
 for(const [name,artifact] of Object.entries(cases)) {await writeFile(`saves/d04-context/bakeoff/case-${name}.json`,JSON.stringify(artifact,null,2));console.log(JSON.stringify({case:name,tokens:artifact.baseline.estimated_tokens,usage:artifact.baseline.usage_percent,target:artifact.compression_request.target_budget_tokens,source_units:artifact.compression_request.source_pack.units.length}));}
}
