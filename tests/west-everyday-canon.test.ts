import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {loadWorld} from "../src/world/loader.js";
import {CampaignState} from "../src/campaign/campaign-state.js";
import {createOpeningCampaign} from "../src/campaign/opening-state.js";
import {buildTurnContext} from "../src/turn/context-builder.js";
import {buildNarratorPrompt} from "../src/turn/prompt-builder.js";
import {projectKnowledgeAccess} from "../src/turn/narrative-authority.js";
import {retrieveForTurn,queryIntent,retrievalRequired} from "../src/turn/retrieval-policy.js";
import {RetrievalService} from "../src/retrieval/retrieval-service.js";
import {LexicalSearch} from "../src/retrieval/lexical-search.js";
import {HybridSearch} from "../src/retrieval/hybrid-search.js";
import {deriveSemanticDocuments} from "../src/retrieval/semantic-documents.js";
import {SemanticIndex} from "../src/retrieval/semantic-index.js";
import {FixtureEmbeddingProvider} from "./retrieval-eval/fixture-embedding-provider.js";

const anchors=[
 ["bram_kessel","Bram Kessel","the_daily_grind","The Daily Grind"],
 ["hadrik_voss","Hadrik Voss","blackiron_repairs_and_arms","Blackiron Repairs & Arms"],
 ["mira_thorne","Mira Thorne","mudlarks_herbs","Mudlark's Herbs"],
 ["livia_marr","Livia Marr","livias_needles","Livia's Needles"],
 ["jessa_rook","Jessa Rook","gatherers_inn","Gatherer's Inn"],
 ["orla_fen","Orla Fen","the_white_basin","The White Basin"],
 ["niles_vanner","Niles Vanner","second_chance_pawn","Second Chance Pawn"],
] as const;
const world=await loadWorld("data"),service=new RetrievalService(world),search=new LexicalSearch(service);
const retrieval={service,search:new HybridSearch(service)};
const opening=buildTurnContext(world,createOpeningCampaign(world,"everyday_audit").exportSnapshot());
const npc=(id:string)=>{const e=world.getEntity(id);assert.ok(e?.type==="character");return e;};

/** Four-District + Institutional Authoring Pass 1 records (added after this pass). */
const FOUR_DISTRICT_NPCS=["azael_melakor","boran_dravendark","corvinus_morvath","elspeth_vael","gideon_melakor","iseult_morvath","kaelen_dravendark","maelor_morvath","seren_vael","sun_emperor","sybilla_melakor","uther_calderan","vaelen_vael","vorn_dravendark"];
/** NPC Authoring Pass 2 records (added after this pass). */
const NPC_PASS_2_NPCS=["arwen_woodsigner","cassian_valerius","dunrig_iron_hands","gaston","helbrecht"];
/** NPC Authoring Pass 3 records (added after this pass). */
const NPC_PASS_3_NPCS=["brunna_keld","garran_holt","halden_cross","lysandra_vell","marta_pell","matthias_eld","odelia_crane","oren_quarn","rufus_tern","severan_krauss","sister_veyra","tavian_merrow"];
test("Exactly seven everyday owners use existing locations with no family, faction or relationship inventions",()=>{
 const prior=["bartolomhew","blackthorn","brother_aven","captain_doran_hale","dren","korvin","mistress_elara","pellan","sister_mereth"];
 assert.deepEqual(world.getEntitiesByType("character").filter(c=>c.role==="npc").map(c=>c.id),[...prior,...anchors.map(a=>a[0]),...FOUR_DISTRICT_NPCS,...NPC_PASS_2_NPCS,...NPC_PASS_3_NPCS].sort());
 assert.equal(world.getEntitiesByType("location").length,74); // 50 + 23 Four-District anchors + The Bent Bough (NPC Pass 2)
 for(const [id,name,location] of anchors){
  const e=npc(id);assert.equal(e.name,name);assert.equal(e.base_location,location);assert.equal(e.work_location,location);assert.equal(e.home_location,null);
  assert.equal(e.species,id==="hadrik_voss"?"Dwarf":"Human");
  assert.deepEqual(e.affiliations,[]);assert.deepEqual(e.relationships,[]);
  assert.deepEqual(e.knowledge,{visibility:{narrator:true,player:true},known_by:[],awareness:"local:calderan"});
  assert.deepEqual(world.charactersBasedAt(location).map(c=>c.id),[id]);assert.deepEqual(world.charactersWorkingAt(location).map(c=>c.id),[id]);
  assert.deepEqual(world.charactersLivingAt(location),[]);
  assert.deepEqual(world.listChunks().filter(c=>c.entity_id===id),[]);
  assert.ok(world.getEntity(location)!.content.includes(name));
  assert.ok(!world.getEntity(location)!.content.includes("owner is unestablished"));
 }
});

for(const [id,name,location,business] of anchors)test(`Merchant and establishment stay distinct: ${name}`,async()=>{
 for(const audience of ["player","narrator"] as const){
  assert.equal(search.search({query:name},audience).candidates[0]?.entity_id,id);
  assert.equal(search.search({query:business},audience).candidates[0]?.entity_id,location);
 }
 assert.equal((await retrieveForTurn(`Tell me about ${name}`,opening,world,retrieval)).diagnostics.ids[0],id);
 const place=await retrieveForTurn(`Where is ${business}?`,opening,world,retrieval);
 assert.equal(place.diagnostics.ids[0],location);
 const owner=await retrieveForTurn(`Who owns ${business}?`,opening,world,retrieval);
 assert.ok(JSON.stringify(owner.data.records).includes(name));
});

const shopping=[
 ["food delivery West","the_daily_grind"],["ordinary armor West","blackiron_repairs_and_arms"],
 ["herbalist West","mudlarks_herbs"],["clothes West","livias_needles"],
 ["inn near Heartstone","gatherers_inn"],["laundry near Heartstone","the_white_basin"],
 ["pawn shop West","second_chance_pawn"],["where can I buy food?","the_daily_grind"],
 ["where can I repair armor?","blackiron_repairs_and_arms"],
] as const;
test("Service destination questions trigger grounding without changing conversation or intent precedence",()=>{
 for(const query of ["Where can I buy food?","Where could I repair my armor?","Where do I wash clothes?","Where can I stay?"]){
  assert.equal(queryIntent(query),"location");assert.equal(retrievalRequired(query,opening,world),true);
 }
 for(const query of ["I buy food.","Can I repair this?","Where are you going?","How are you?"])assert.equal(queryIntent(query),null);
 assert.equal(queryIntent("Where can I buy food, and how do I get to the market?"),"route");
});
test("Functional shopping favors the business; short established names resolve to places",async()=>{
 for(const [query,id] of shopping){
  for(const audience of ["player","narrator"] as const)assert.equal(search.search({query},audience).candidates[0]?.entity_id,id,query);
 }
 for(const [query,id] of shopping.slice(-2))assert.equal((await retrieveForTurn(query,opening,world,retrieval)).diagnostics.ids[0],id,query);
 for(const [query,id] of [["Blackiron","blackiron_repairs_and_arms"],["Mudlark","mudlarks_herbs"],["White Basin","the_white_basin"]])assert.equal(search.search({query},"player").candidates[0]?.entity_id,id);
 assert.ok(search.search({query:"shops near Heartstone"},"player").candidates.some(c=>c.entity_id==="main_market_square"));
});

const portrayal:Record<string,RegExp[]>={
 bram_kessel:[/sociable/,/dependable/,/Supply failure/,/Generous with food but stingy with money/,/falsify weights/],
 hadrik_voss:[/meticulous/,/repairs that work/,/life depends/,/Sells weapons but prefers repairs/,/structural damage/],
 mira_thorne:[/skeptical/,/expertise she lacks/,/beyond her competence/,/intensely curious/,/unidentified ingredients/],
 livia_marr:[/quick-witted/,/affordable/,/mass goods from East/,/little respect for fashion/,/damaged fabric/],
 jessa_rook:[/composed/,/boring/,/criminal-haunt reputation/,/does not particularly like strangers/i,/intimidation of staff/],
 orla_fen:[/dependable/,/lack the labor/,/fire and contaminated water/,/dislikes gossip/,/burial clothing/],
 niles_vanner:[/analytical/,/loan sharks/,/stolen valuables/,/Dislikes exploiting desperation/,/vulnerable customers/],
};
for(const [id,name,location] of anchors)test(`Present portrayal stays separate from character knowledge: ${name}`,()=>{
 const campaign=new CampaignState(world,`shop_${id}`,{player_location:location,world_time:{world_minute:0}});
 const context=buildTurnContext(world,campaign.exportSnapshot());
 const present=context.primary.scene.present_characters.find(c=>c.id===id)!;
 assert.ok(present?.portrayal);const text=JSON.stringify(present.portrayal);
 for(const pattern of portrayal[id]!)assert.ok(pattern.test(text),`${id}: required portrayal component`);
 assert.ok(text.includes("not compulsory gestures or catchphrases"));
 assert.equal(present.portrayal.authority,"narrator_portrayal_only_not_character_knowledge");
 const prompt=JSON.stringify(buildNarratorPrompt("Hello",context,[],{}, {candidates:[],runtime:[]}));
 assert.ok(prompt.includes(npc(id).purpose!));assert.ok(prompt.includes(npc(id).private_notes!));
 const access=projectKnowledgeAccess(context,{});assert.deepEqual(access.facts,[]);assert.deepEqual(access.player,[]);
 assert.deepEqual(campaign.exportSnapshot().goals,[]);assert.deepEqual(campaign.exportSnapshot().knowledge,[]);
 campaign.apply({expected_revision:0,commands:[{kind:"runtime_delta",delta:{character_movements:[{character_id:id,current_location:"calderan_center"}]}}]});
 assert.ok(!buildTurnContext(world,campaign.exportSnapshot()).characters.some(c=>c.id===id));
 assert.equal(npc(id).base_location,location);
});

test("Private pressures, contradictions and morality never enter public or narrator search text",async()=>{
 const provider=new FixtureEmbeddingProvider();await SemanticIndex.build(service.indexSource(),provider,"player");
 const embedded=JSON.stringify(provider.batches);
 for(const audience of ["player","narrator"] as const){
  const texts=JSON.stringify(deriveSemanticDocuments(service.indexSource(),audience).map(d=>d.text));
  for(const [id] of anchors){
   const e=npc(id),result=service.get({entity_id:id},audience);assert.equal(result.kind,"found");
   for(const value of [e.purpose,e.morality,e.private_notes]){
    assert.ok(value);assert.ok(!texts.includes(value));assert.ok(!embedded.includes(value));assert.ok(!JSON.stringify(result).includes(value));
   }
  }
 }
 const privateMarkers=["Supply failure and empty shelves embarrass","Fears a repair bearing his name","mistook her for a physician or miracle healer","Fears being displaced","people behave better when they have something worth losing","Quietly washes burial clothing","Fears inadvertently handling stolen valuables"];
 const publicText=JSON.stringify(deriveSemanticDocuments(service.indexSource(),"player").map(d=>d.text));
 for(const phrase of privateMarkers){
  assert.ok(!publicText.includes(phrase));
  const turn=await retrieveForTurn(`Tell me about ${phrase}`,opening,world,retrieval);
  assert.ok(!JSON.stringify(turn.data).includes(phrase));
 }
});

test("Opening scene, ordinary knowledge and private criminal boundaries remain unchanged",()=>{
 const snapshot=createOpeningCampaign(world,"ordinary_opening").exportSnapshot();
 assert.deepEqual(opening.characters.map(c=>c.id),["nicco"]);assert.deepEqual(opening.primary.scene.present_characters,[]);
 for(const [id,,location] of anchors)assert.equal(snapshot.runtime.npc_locations.find(n=>n.character_id===id)?.current_location,location);
 assert.deepEqual(snapshot.goals,[]);assert.deepEqual(snapshot.relationships,[]);assert.deepEqual(snapshot.scheduled_events,[]);
 for(const e of [...world.listEntities(),...world.listChunks()])if(!e.knowledge?.visibility.player)for(const [id] of anchors)assert.ok(!e.knowledge?.known_by.includes(id));
 const campaign=new CampaignState(world,"local_knowledge",{player_location:"the_daily_grind",world_time:{world_minute:0}});
 const context=buildTurnContext(world,campaign.exportSnapshot());
 const access=projectKnowledgeAccess(context,{awareness:[{id:"captain_doran_hale",player_access:true,awareness:"local:calderan"},{id:"restricted_fact",player_access:false,awareness:"private"}]});
 const bram=access.characters.find(c=>c.character_id==="bram_kessel")!;
 assert.deepEqual(bram.can_use.map(f=>f.ref),["R1"]);assert.deepEqual(bram.do_not_use,["R2"]);assert.deepEqual(access.player,["R1"]);
});

test("Pass 1 and Pass 2A query primary targets remain stable with seven new merchants",async()=>{
 const prior=JSON.parse(await readFile("docs/evaluations/calderan-west-npc-pass2a-after.json","utf8")) as {queries:{query:string;player:string[];narrator:string[]}[];west_pass1:{query:string;player:string[];narrator:string[]}[]};
 for(const row of [...prior.queries,...prior.west_pass1])for(const audience of ["player","narrator"] as const){
  const first=search.search({query:row.query},audience).candidates[0];
  assert.equal(first?.kind==="chunk"?first.chunk_id:first?.entity_id,row[audience][0],`${audience}: ${row.query}`);
 }
});
