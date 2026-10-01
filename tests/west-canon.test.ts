import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { deriveSemanticDocuments } from "../src/retrieval/semantic-documents.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { retrieveForTurn } from "../src/turn/retrieval-policy.js";
import { ordinaryAwareness } from "../src/turn/narrative-authority.js";

const world = await loadWorld("data"), service = new RetrievalService(world), lexical = new LexicalSearch(service);
const context = buildTurnContext(world, createOpeningCampaign(world,"west_canon").exportSnapshot());
const retrieval = {service,search:new HybridSearch(service)};
const locations = ["the_coined_lie","main_market_square","fountain_of_the_fallen","the_daily_grind","blackiron_repairs_and_arms","mudlarks_herbs","livias_needles","chevalier_fountain","open_hand_chapel","the_white_basin","second_chance_pawn","the_slaughtered_pig","the_dangling_rope","gatherers_inn","west_guard_post","slave_market_back_back_alleys","gws","saint_orra_house"];

test("West POIs have valid structural ancestry, public local envelopes, and explicit travel access",()=>{
 for(const id of locations){
  const e=world.getEntity(id)!; assert.equal(e.type,"location",id);
  assert.ok(world.getAncestors(id).some(a=>a.id==="calderan_west"),id);
  assert.equal(e.knowledge?.awareness,"local:calderan",id);
  assert.deepEqual(e.knowledge?.visibility,{narrator:true,player:true});
  if(e.type==="location")assert.ok(e.connections.length > 0,id);
  assert.equal(service.get({entity_id:id},"player").kind,"found",id);
 }
 assert.deepEqual(world.getAncestors("the_daily_grind").map(e=>e.id),["calderan_west","calderan","west","continent"]);
 assert.deepEqual(world.getAncestors("slave_market_back_back_alleys").map(e=>e.id),["calderan_west","calderan","west","continent"]);
 for(const id of ["second_chance_pawn","west_guard_post","open_hand_chapel"])assert.equal(world.getEntity(id)!.parent,"calderan_west");
 assert.equal(world.getEntity("grey_brook")!.type,"world_lore");
 const square=world.getEntity("heartstone_square")!;
 if(square.type==="location")assert.ok(square.connections.some(c=>c.target==="heartstone_lr"));
 assert.deepEqual(world.getEntitiesByType("character").filter(c=>c.role==="npc").map(c=>c.id),["arwen_woodsigner", "azael_melakor", "bartolomhew", "blackthorn", "boran_dravendark", "bram_kessel", "brother_aven", "brunna_keld", "captain_doran_hale", "cassian_valerius", "corvinus_morvath", "dren", "dunrig_iron_hands", "elspeth_vael", "garran_holt", "gaston", "gideon_melakor", "hadrik_voss", "halden_cross", "helbrecht", "iseult_morvath", "jessa_rook", "kaelen_dravendark", "korvin", "livia_marr", "lysandra_vell", "maelor_morvath", "marta_pell", "matthias_eld", "mira_thorne", "mistress_elara", "niles_vanner", "odelia_crane", "oren_quarn", "orla_fen", "pellan", "rufus_tern", "seren_vael", "severan_krauss", "sister_mereth", "sister_veyra", "sun_emperor", "sybilla_melakor", "tavian_merrow", "uther_calderan", "vaelen_vael", "vorn_dravendark"]);
 for(const id of ["undertakers_door","quiet_yard"])assert.equal(world.getEntity(id),undefined);
});

const distinctions = [
 ["slave market","calderan_slave_market"], ["slave pens","calderan_slave_market"],
 ["slave auction","calderan_slave_market"], ["public auction","calderan_slave_market"],
 ["licensed sellers","calderan_slave_market"], ["Back Alleys","slave_market_back_alleys"],
 ["Back-Back Alleys","slave_market_back_back_alleys"], ["market square ordinary shopping","main_market_square"],
 ["market square","main_market_square"], ["Grey Brook","grey_brook"], ["Heartstone Square","heartstone_square"],
] as const;
for(const [query,id] of distinctions)test(`West retrieval and turn grounding: ${query}`,async()=>{
 for(const audience of ["player","narrator"] as const)assert.equal(lexical.search({query},audience).candidates[0]?.entity_id,id);
 const result=await retrieveForTurn(`Tell me about ${query}.`,context,world,retrieval);
 assert.equal(result.diagnostics.ids[0],id);
 assert.equal(result.data.records.length,1);
 assert.equal((result.data.records[0] as {entity_id:string}).entity_id,id);
 assert.ok(!JSON.stringify(result.data).includes('criminal_interior'));
});

test("aliases preserve old square references and identify public pens independently",()=>{
 for(const [alias,id] of [["The Slave Pens","calderan_slave_market"],["Back Alleys","slave_market_back_alleys"],["the back-back","slave_market_back_back_alleys"],["Square outside Heartstone","heartstone_square"]]){
  const result=service.resolveEntityReference(alias,"player");assert.equal(result.kind,"found");
  if(result.kind==="found")assert.equal(result.candidate.entity_id,id);
 }
 assert.ok(lexical.search({query:"shops near Heartstone"},"player").candidates.some(c=>c.entity_id==="main_market_square"));
});

test("public, licensed, taboo and criminal canon remain distinct in fetched records",()=>{
 const market=world.getEntity("calderan_slave_market")!;
 assert.match(market.content,/Slavery is legal and socially accepted/);
 assert.match(market.content,/formal auctions primarily by day/);
 assert.match(market.content,/licensed private sellers handle or arrange their own authorized sale documentation/);
 assert.match(market.content,/no systematic doctors or medical inspection/);
 if(market.type==="location")assert.equal(market.features.length,7);
 assert.match(world.getEntity("slave_market_back_alleys")!.content,/not openly criminal or inherently illegal/);
 assert.match(world.getEntity("slave_market_back_back_alleys")!.content,/only the existence/);
 assert.match(world.getEntity("saint_orra_house")!.content,/reason is unestablished/);
});

test("restricted chunks are privileged narrator evidence, never player search or ordinary turn knowledge",async()=>{
 const chunks=world.listChunks().filter(c=>["slave_market_back_alleys","slave_market_back_back_alleys","gws"].includes(c.entity_id));
 assert.equal(chunks.length,5);
 const playerDocs=deriveSemanticDocuments(service.indexSource(),"player");
 for(const c of chunks){
  assert.equal(c.knowledge?.visibility.player,false);
  assert.ok(["private","specialized"].includes(c.knowledge!.awareness!));
  assert.equal(ordinaryAwareness(c.knowledge?.awareness,["calderan"],true),null);
  assert.equal(service.get({entity_id:c.entity_id,chunk_id:c.id},"player").kind,"not_visible");
  const privileged=service.get({entity_id:c.entity_id,chunk_id:c.id},"narrator");
  assert.equal(privileged.kind,"found");if(privileged.kind==="found")assert.equal(privileged.record.secret,true);
  assert.ok(!playerDocs.some(d=>d.reference.chunk_id===c.id));
  assert.ok(!lexical.search({query:c.summary},"player").candidates.some(hit=>hit.kind==="chunk" && hit.chunk_id===c.id));
  const turn=await retrieveForTurn(`Tell me about ${c.summary}`,context,world,retrieval);
  assert.ok(!JSON.stringify(turn.data).includes(c.id));
  assert.ok(!JSON.stringify(turn.data).includes(c.content));
 }
 for(const query of ["clandestine doctors","The Undertaker's Door","criminal lookouts","GW's password","illegal trafficking"]){
  const result=await retrieveForTurn(`Tell me about ${query}`,context,world,retrieval);
  if("candidates" in result.data)assert.ok(!result.data.candidates.some(c=>c.secret));
 }
 assert.equal(ordinaryAwareness(world.getEntity("gws")!.knowledge?.awareness,["calderan"],true),"local:calderan");
});
