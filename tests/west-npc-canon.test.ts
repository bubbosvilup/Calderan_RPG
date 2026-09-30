import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildNarrativeContext } from "../src/scene/narrative-context-builder.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { projectKnowledgeAccess, ordinaryAwareness } from "../src/turn/narrative-authority.js";
import { retrieveForTurn } from "../src/turn/retrieval-policy.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { deriveSemanticDocuments } from "../src/retrieval/semantic-documents.js";
import { characterPortrayal } from "../src/world/character-contract.js";

const ids=["bartolomhew","blackthorn","brother_aven","captain_doran_hale","dren","korvin","mistress_elara","sister_mereth"];
const world=await loadWorld("data"), service=new RetrievalService(world), search=new LexicalSearch(service);
const retrieval={service,search:new HybridSearch(service)};
const opening=buildTurnContext(world,createOpeningCampaign(world,"npc_audit").exportSnapshot());
const npc=(id:string)=>{const e=world.getEntity(id);assert.ok(e?.type==="character");return e;};
const sources=()=>world.listEntities().map(e=>({source:`nested/${e.id}.yaml`,document:{schema_version:1,entity:structuredClone(e) as unknown as Record<string,unknown>,chunks:structuredClone(world.listChunks().filter(c=>c.entity_id===e.id))}}));

test("Pass 2A adds exactly eight NPCs and one organization with valid identity and association contracts",()=>{
 assert.deepEqual(world.getEntitiesByType("character").filter(e=>e.role==="npc").map(e=>e.id),[...ids,"pellan","bram_kessel","hadrik_voss","mira_thorne","livia_marr","jessa_rook","orla_fen","niles_vanner"].sort());
 assert.equal(world.getEntity("carrion_dogs")?.type,"faction");
 for(const id of ids){const e=npc(id);assert.equal(e.home_location,null);assert.equal(e.parent,null);assert.equal(e.species,"Human");assert.ok(e.purpose&&e.morality&&e.traits.length);}
 assert.deepEqual(world.charactersWorkingAt("calderan_slave_market").map(c=>c.id),["bartolomhew","korvin","mistress_elara"]);
 for(const [id,location] of [["captain_doran_hale","west_guard_post"],["brother_aven","open_hand_chapel"],["sister_mereth","saint_orra_house"]]){
  assert.equal(npc(id!).base_location,location);assert.equal(npc(id!).work_location,location);
 }
 assert.equal(npc("blackthorn").work_location,"gws");
 assert.equal(npc("blackthorn").base_location,null);
 assert.ok(!JSON.stringify(ids.map(npc)).match(/Merovar|Dorian/));
 for(const id of ["elspeth_vael","seren_vael","magistrate_quarn","sister_veyra","inquisitor_kaelen","lord_malakor_vane"])assert.equal(world.getEntity(id),undefined);
 const snapshot=createOpeningCampaign(world,"no_goals").exportSnapshot();
 assert.deepEqual(snapshot.goals,[]);assert.deepEqual(snapshot.relationships,[]);assert.deepEqual(snapshot.scheduled_events,[]);
 assert.deepEqual(opening.primary.scene.present_characters,[]);
});

for(const [query,id] of [["Korvin","korvin"],["Mistress Elara","mistress_elara"],["Bartolomhew","bartolomhew"],["The Redemptor","bartolomhew"],["Blackthorn","blackthorn"],["Captain Doran Hale","captain_doran_hale"],["West guard captain","captain_doran_hale"],["Brother Aven","brother_aven"],["Sister Mereth","sister_mereth"],["Carrion Dogs","carrion_dogs"]])test(`NPC identity retrieval: ${query}`,async()=>{
 for(const audience of ["player","narrator"] as const)assert.equal(search.search({query},audience).candidates[0]?.entity_id,id);
 assert.equal((await retrieveForTurn(`Tell me about ${query}`,opening,world,retrieval)).diagnostics.ids[0],id);
});

test("Pass 1 targeted retrieval primary targets and shopping recovery survive NPC competition",async()=>{
 const prior=JSON.parse(await readFile("docs/evaluations/calderan-west-pass1-after.json","utf8")) as {queries:{query:string;narrator:string[];player:string[]}[]};
 for(const row of prior.queries)for(const audience of ["player","narrator"] as const){
  const actual=search.search({query:row.query},audience).candidates;
  assert.equal(actual[0]?.entity_id,row[audience][0],`${audience}: ${row.query}`);
 }
 assert.ok(search.search({query:"shops near Heartstone"},"player").candidates.some(c=>c.entity_id==="main_market_square"));
});

const portrayals:Record<string,RegExp[]>={
 korvin:[/gruff/,/pragmatic/,/perceptive/,/independence/],
 mistress_elara:[/theatrical/,/charming/,/observant/,/Social ascent/],
 bartolomhew:[/warm and polite/,/emotional indifference/,/not gleefully sadistic/,/not emotionally excited/],
 blackthorn:[/impatient/,/organized/,/efficient commerce/,/admiration/],
 captain_doran_hale:[/disciplined/,/moral/,/pragmatic/,/West District/],
 brother_aven:[/compassionate without naivety/,/practical/],
 sister_mereth:[/strict/,/organized/,/pragmatic/,/food, shelter/],
};
for(const [id,patterns] of Object.entries(portrayals))test(`Present NPC portrayal and knowledge separation: ${id}`,()=>{
 const campaign=new CampaignState(world,`present_${id}`,{player_location:"heartstone_square",world_time:{world_minute:0}});
 campaign.apply({expected_revision:0,commands:[{kind:"runtime_delta",delta:{character_movements:[{character_id:id,current_location:"heartstone_square"}]}}]});
 const context=buildTurnContext(world,campaign.exportSnapshot());
 const projected=context.primary.scene.present_characters.find(c=>c.id===id)!;
 assert.ok(projected.portrayal);const text=JSON.stringify(projected.portrayal);
 for(const pattern of patterns)assert.ok(pattern.test(text),`${id}: portrayal requirement`);
 assert.equal(projected.portrayal.authority,"narrator_portrayal_only_not_character_knowledge");
 const prompt=JSON.stringify(buildNarratorPrompt("Hello",context,[],{}, {candidates:[],runtime:[]}));
 assert.ok(prompt.includes(npc(id).purpose!));
 const access=projectKnowledgeAccess(context,{});
 assert.deepEqual(access.facts,[]);assert.deepEqual(access.player,[]);
 assert.deepEqual(campaign.exportSnapshot().knowledge,[]);
 assert.deepEqual(campaign.exportSnapshot().goals,[]);
});

test("Authoritative scene projection supports new workplaces and runtime movement overrides canon",()=>{
 for(const location of ["calderan_slave_market","west_guard_post","open_hand_chapel","saint_orra_house","gws"]){
  const campaign=new CampaignState(world,`scene_${location}`,{player_location:location,world_time:{world_minute:0}});
  assert.doesNotThrow(()=>buildTurnContext(world,campaign.exportSnapshot()));
 }
 const campaign=new CampaignState(world,"move_aven",{player_location:"open_hand_chapel",world_time:{world_minute:0}});
 campaign.apply({expected_revision:0,commands:[{kind:"runtime_delta",delta:{character_movements:[{character_id:"brother_aven",current_location:"heartstone_square"}]}}]});
 assert.ok(!buildTurnContext(world,campaign.exportSnapshot()).characters.some(c=>c.id==="brother_aven"));
 assert.deepEqual(world.charactersBasedAt("open_hand_chapel").map(c=>c.id),["brother_aven"]);
});

test("Private NPC fields and classified chunks never enter public fetch, index or ordinary turns",async()=>{
 const playerDocs=JSON.stringify(deriveSemanticDocuments(service.indexSource(),"player").map(d=>({reference:d.reference,text:d.text})));
 const restricted=world.listChunks().filter(c=>ids.includes(c.entity_id)||c.entity_id==="carrion_dogs");
 assert.equal(restricted.length,10);
 for(const id of ids){
  const e=npc(id),publicResult=JSON.stringify(service.get({entity_id:id},"player"));
  for(const field of [e.purpose,e.morality,e.private_notes])if(field){assert.ok(!publicResult.includes(field));assert.ok(!playerDocs.includes(field));}
 }
 for(const c of restricted){
  assert.equal(c.knowledge?.visibility.player,false);
  assert.equal(ordinaryAwareness(c.knowledge?.awareness,["calderan"],true),null);
  assert.equal(service.get({entity_id:c.entity_id,chunk_id:c.id},"player").kind,"not_visible");
  assert.ok(!playerDocs.includes(c.content));
  assert.ok(!playerDocs.includes(c.id));
 }
 for(const query of ["Korvin daughter","Elara aging fear","Bartolomhew expulsion","Dren","Blackthorn routes depots","Mereth private records","higher coalition leadership"]){
  const result=await retrieveForTurn(`Tell me about ${query}`,opening,world,retrieval);
  const projected=JSON.stringify(result.data);
  for(const c of restricted)assert.ok(!projected.includes(c.content));
  if("candidates" in result.data)assert.ok(!result.data.candidates.some(c=>c.secret));
 }
 assert.ok(!playerDocs.includes("lost a daughter"));
 assert.ok(!playerDocs.includes("fears aging"));
 assert.ok(!playerDocs.includes("Dren"));
});

test("Restricted character visibility and present narrator projection remain mechanically isolated",()=>{
 const e=npc("dren");
 assert.ok(e.knowledge?.visibility.narrator===true && e.knowledge.visibility.player===false);
 assert.equal(service.get({entity_id:e.id},"player").kind,"not_visible");
 assert.equal(service.resolveEntityReference(e.name,"player").kind,"not_found");
 assert.equal(service.get({entity_id:e.id},"narrator").kind,"found");
 assert.ok(characterPortrayal(e));
 const runtime=new RuntimeState(world,{player_location:"heartstone_square",world_time:{world_minute:0}});
 runtime.moveCharacter(e.id,"heartstone_square");
 const privileged=buildNarrativeContext(world,runtime).scene.present_characters.find(c=>c.id===e.id);
 assert.ok(privileged?.secret && privileged.portrayal);
 assert.ok(privileged.appearance===e.appearance);
 const campaign=new CampaignState(world,"restricted_presence",{player_location:"heartstone_square",world_time:{world_minute:0}});
 campaign.apply({expected_revision:0,commands:[{kind:"runtime_delta",delta:{character_movements:[{character_id:e.id,current_location:"heartstone_square"}]}}]});
 const context=buildTurnContext(world,campaign.exportSnapshot());
 // Repair 1 confidential encounter: runtime presence projects the protected character for this turn only, marked confidential.
 // Retrieval/player visibility above is unchanged, and presence grants no fact access.
 assert.ok(context.characters.some(c=>c.id===e.id));
 const encounter=context.primary.scene.present_characters.find(c=>c.id===e.id);
 assert.ok(encounter && "confidential_encounter" in encounter && encounter.confidential_encounter===true && encounter.portrayal);
 assert.deepEqual(projectKnowledgeAccess(context,{}).player,[]);
 assert.equal(service.get({entity_id:e.id},"player").kind,"not_visible");
 const absent=new CampaignState(world,"restricted_absent",{player_location:"heartstone_square",world_time:{world_minute:0}});
 assert.ok(!buildTurnContext(world,absent.exportSnapshot()).characters.some(c=>c.id===e.id));
});

test("Restricted relationship prose cannot affect public-owner lexical or semantic indexing",()=>{
 const docs=sources();const e=docs.find(d=>d.document.entity.id==="blackthorn")!.document.entity;
 e.relationships=[{target:"dren",kind:"ZZQPRIVATEEDGEKIND",description:"ZZQPRIVATEEDGEPROSE",knowledge:{visibility:{narrator:true,player:false},known_by:["blackthorn"],awareness:"private"}}];
 const guarded=new RetrievalService(new WorldStore(docs)),lexical=new LexicalSearch(guarded);
 for(const audience of ["player","narrator"] as const){
  const texts=JSON.stringify(deriveSemanticDocuments(guarded.indexSource(),audience).map(d=>d.text));
  for(const word of ["ZZQPRIVATEEDGEKIND","ZZQPRIVATEEDGEPROSE"]){
   assert.ok(!texts.includes(word));assert.deepEqual(lexical.search({query:word},audience).candidates,[]);
   assert.ok(!JSON.stringify(guarded.get({entity_id:"blackthorn"},audience)).includes(word));
  }
 }
 const invalid=sources(),item=invalid.find(d=>d.document.entity.id==="blackthorn")!.document.entity;
 for(const knowledge of [{visibility:{narrator:true,player:false},known_by:["nicco"],awareness:"private"},{visibility:{narrator:true,player:false},known_by:[],awareness:"local:church"}]){
  item.relationships=[{target:"dren",kind:"contact",description:"Restricted contact.",knowledge}];
  assert.throws(()=>new WorldStore(invalid));
 }
});

test("Canonical knowledge edges remain NPC-scoped without inventing missing secrets or runtime trust",()=>{
 assert.ok(world.getChunk("dren.private_baseline")!.knowledge!.known_by.includes("blackthorn"));
 assert.ok(!world.getChunk("dren.private_baseline")!.knowledge!.known_by.includes("captain_doran_hale"));
 assert.ok(world.getChunk("bartolomhew.clerical_background")!.knowledge!.known_by.includes("brother_aven"));
 for(const c of world.listChunks())assert.ok(!c.knowledge?.known_by.includes("nicco"));
 assert.ok(world.getEntity("saint_orra_house")!.content.includes("reason is unestablished"));
 assert.ok(npc("bartolomhew").private_notes!.includes("must not be filled in"));
 assert.ok(!npc("bartolomhew").affiliations!.includes("church"));
 assert.ok(npc("captain_doran_hale").content.includes("not overall commander"));
 assert.ok(!npc("captain_doran_hale").morality!.includes("Lawful Good"));
});
