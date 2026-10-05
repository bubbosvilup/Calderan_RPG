import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { stringify } from "yaml";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { LexicalSearch } from "../src/retrieval/lexical-search.js";
import { SemanticIndex } from "../src/retrieval/semantic-index.js";
import { FixtureEmbeddingProvider } from "./retrieval-eval/fixture-embedding-provider.js";
import { deriveSemanticDocuments } from "../src/retrieval/semantic-documents.js";
const world = await loadWorld("data");
const sources = () => world.listEntities().map(e => ({ source: `irrelevant/${e.id}.yaml`, document: { schema_version: 1, entity: structuredClone(e) as unknown as Record<string, unknown>, chunks: structuredClone(world.listChunks().filter(c => c.entity_id === e.id)) } }));
function changed(edit: (entity: Record<string, unknown>) => void) { const s = sources(); edit(s.find(s => s.document.entity.id === "pellan")!.document.entity); return s; }

test("arbitrary nested editorial paths preserve IDs, dataset, all query ranks, semantic text and saves", () => {
 const moved = new WorldStore(sources().reverse().map((s,i) => ({ ...s, source: `unrelated/guard/${i}/renamed-${i}.yml` })));
 assert.equal(moved.datasetId, world.datasetId);
 assert.deepEqual(moved.listEntities(), world.listEntities());
 assert.deepEqual(moved.getChildren("calderan"), world.getChildren("calderan"));
 const oldService = new RetrievalService(world), newService = new RetrievalService(moved);
 for (const audience of ["player", "narrator"] as const) {
   const texts = (w: RetrievalService) => deriveSemanticDocuments(w.indexSource(), audience).map(d => ({ reference: d.reference, text: d.text }));
   assert.deepEqual(texts(oldService), texts(newService));
   for (const query of ["Calderan", "West District", "Heartstone", "slave market", "Light magic", "Inquisition", "Ironbound", "Pellan"]) assert.deepEqual(new LexicalSearch(oldService).searchDebug({query},audience),new LexicalSearch(newService).searchDebug({query},audience));
 }
 const snapshot = new CampaignState(world, "move_test", {player_location:"heartstone_square",world_time:{world_minute:0}}).exportSnapshot();
 assert.deepEqual(CampaignState.restore(moved, structuredClone(snapshot)).exportSnapshot(), snapshot);
 assert.notEqual(moved.getProvenance("pellan")!.source_path, world.getProvenance("pellan")!.source_path);
 const edited = new WorldStore(changed(e => { e.purpose = "A different established purpose."; }));
 assert.notEqual(edited.datasetId, world.datasetId); assert.throws(() => CampaignState.restore(edited, structuredClone(snapshot)), /dataset/i);
});

test("recursive discovery supports renamed yaml/yml and still rejects nested duplicate IDs", async () => {
 const root=resolve(".build"), dir=await mkdtemp(join(root,"authored-test-"));
 try {
  await mkdir(join(dir,"a/deep"),{recursive:true}); await mkdir(join(dir,"z"));
  const entity={id:"stable",type:"concept",name:"Stable",display_name:"Stable",parent:null,aliases:[],summary:"Stable record.",tags:[],search_context:"",content:"Stable record.",related_entities:[]};
  const doc={schema_version:1,entity,chunks:[]};
  await writeFile(join(dir,"a/deep/editorial.yml"),stringify(doc));
  const first=await loadWorld(dir);assert.equal(first.getEntity("stable")!.id,"stable");
  assert.equal((await loadWorld(dir)).datasetId,first.datasetId);
  await writeFile(join(dir,"z/different.yaml"),stringify(doc));
  await assert.rejects(loadWorld(dir),/duplicate entity ID stable/);
 } finally { if (!dir.startsWith(root+sep)) throw new Error("Unsafe test cleanup"); await rm(dir,{recursive:true}); }
});

for (const [field,value,pattern] of [
 ["base_location","missing",/unknown entity/], ["work_location","church",/type location/], ["home_location","pellan",/type location/],
 ["affiliations",["calderan"],/faction or concept/], ["affiliations",["missing"],/unknown entity/], ["affiliations",["church","church"],/duplicate ID/],
 ["purpose","x".repeat(801),/bound/], ["morality","x".repeat(801),/bound/], ["private_notes","x".repeat(1601),/1600/],
 ["sex","unknown",/one of/], ["location","calderan",/never both/], ["traits",Array(25).fill("anxious"),/24 traits/],
] as const) test(`character validation: ${field} ${String(value).slice(0,30)}`, () => { assert.throws(() => new WorldStore(changed(e => {e[field]=value;})),pattern); });

test("typed affiliations, null associations and awareness validation remain explicit", () => {
 assert.doesNotThrow(() => new WorldStore(changed(e => {e.affiliations=["church","city_magistracy"];})));
 assert.throws(() => new WorldStore(changed(e => {e.knowledge={visibility:{narrator:true,player:true},known_by:[],awareness:"local:church"};})), /location/);
 const s=sources();s.find(s=>s.document.entity.id==="calderan")!.document.entity.parent="calderan_west";
 assert.throws(() => new WorldStore(s), /parent cycle/);
});

test("portrayal cannot leak through search text, ranking, public fetch or character knowledge", async () => {
 const guarded = new WorldStore(changed(e=>{ e.purpose="ZZQMOTIVESENTINEL";e.morality="ZZQBOUNDARYSENTINEL";e.private_notes="ZZQSECRETSENTINEL";e.traits=["ZZQTEMPERAMENTSENTINEL"]; }));
 const service=new RetrievalService(guarded), search=new LexicalSearch(service);
 for(const audience of ["player","narrator"] as const){
  const docs=JSON.stringify(deriveSemanticDocuments(service.indexSource(),audience).map(d=>d.text));
  const provider=new FixtureEmbeddingProvider(); await SemanticIndex.build(service.indexSource(),provider,audience);
  assert.ok(!JSON.stringify(provider.batches).includes("ZZQSECRETSENTINEL"));
  const fetch=JSON.stringify(service.get({entity_id:"pellan"},audience));
  for(const word of ["ZZQMOTIVESENTINEL","ZZQBOUNDARYSENTINEL","ZZQSECRETSENTINEL","ZZQTEMPERAMENTSENTINEL"]){assert.ok(!docs.includes(word));assert.ok(!fetch.includes(word));assert.deepEqual(search.search({query:word},audience).candidates,[]);}
  assert.equal(search.search({query:"Pellan"},audience).candidates[0]!.entity_id,"pellan");
 }
 const campaign=new CampaignState(guarded,"privacy",{player_location:"calderan_center",world_time:{world_minute:0}}),ctx=buildTurnContext(guarded,campaign.exportSnapshot());
 const prompt=JSON.stringify(buildNarratorPrompt("Hello Pellan",ctx,[],{}, {candidates:[],runtime:[]}));
 assert.match(prompt,/ZZQSECRETSENTINEL/);assert.match(prompt,/narrator_portrayal_only_not_character_knowledge/);
 assert.ok(!JSON.stringify(projectKnowledgeAccess(ctx,[])).includes("ZZQSECRETSENTINEL"));
 const hidden=new WorldStore(changed(e=>{e.knowledge={visibility:{narrator:false,player:false},known_by:[]};e.private_notes="ZZQHIDDENSENTINEL";}));
 const hiddenCampaign=new CampaignState(hidden,"hidden",{player_location:"calderan_center",world_time:{world_minute:0}});
 assert.ok(!JSON.stringify(buildTurnContext(hidden,hiddenCampaign.exportSnapshot())).includes("ZZQHIDDENSENTINEL"));
});

test("derived associations are sorted frozen canon; runtime movement wins without modifying them", () => {
 assert.deepEqual(world.charactersBasedAt("calderan_center").map(c=>c.id),["pellan"]);
 assert.deepEqual(world.charactersWorkingAt("calderan_center"),[]);assert.deepEqual(world.charactersLivingAt("calderan_center"),[]);
 assert.ok(Object.isFrozen(world.charactersBasedAt("calderan_center")));assert.ok(Object.isFrozen(world.charactersBasedAt("calderan_center")[0]));
 const c=new CampaignState(world,"movement",{player_location:"calderan_center",world_time:{world_minute:0}});
 c.apply({expected_revision:0,commands:[{kind:"runtime_delta",delta:{character_movements:[{character_id:"pellan",current_location:"calderan_east"}]}}]});
 assert.ok(!buildTurnContext(world,c.exportSnapshot()).characters.some(p=>p.id==="pellan"));
 assert.deepEqual(world.charactersBasedAt("calderan_center").map(p=>p.id),["pellan"]);
 const unknown=new WorldStore(changed(e=>{e.base_location=null;})),u=new CampaignState(unknown,"unknown",{player_location:"calderan_center",world_time:{world_minute:0}});
 assert.deepEqual(u.exportSnapshot().runtime.npc_locations.filter(n=>n.character_id==="pellan"),[]);assert.doesNotThrow(()=>CampaignState.restore(unknown,structuredClone(u.exportSnapshot())));
 u.apply({expected_revision:0,commands:[{kind:"runtime_delta",delta:{character_movements:[{character_id:"pellan",current_location:"calderan_center"}]}}]});
 assert.ok(buildTurnContext(unknown,u.exportSnapshot()).characters.some(p=>p.id==="pellan"));
});

test("Calderan districts, fringe and one NPC pilot preserve tower topology and canon limits", () => {
 const districts=["west","east","north","south","center"].map(s=>`calderan_${s}`);
 assert.deepEqual(world.getChildren("calderan").map(e=>e.id),[...districts,"imperial_road","north_approach"].sort());
 for(const id of districts){ const e=world.getEntity(id)!;assert.equal(e.type,"location");if(e.type==="location")assert.deepEqual(e.connections,[]); }
 assert.equal(world.getEntity("slave_market_back_alleys")!.parent,"calderan_west");
 assert.deepEqual(world.getAncestors("heartstone_f1").map(e=>e.id),["heartstone","calderan_west","calderan","west","continent"]);
 assert.deepEqual(world.getEntitiesByType("character").filter(e=>e.role==="npc").map(e=>e.id),["arwen_woodsigner", "azael_melakor", "bartolomhew", "blackthorn", "boran_dravendark", "bram_kessel", "brother_aven", "brunna_keld", "captain_doran_hale", "cassian_valerius", "corvinus_morvath", "dren", "dunrig_iron_hands", "elspeth_vael", "garran_holt", "gaston", "gideon_melakor", "hadrik_voss", "halden_cross", "helbrecht", "iseult_morvath", "jessa_rook", "kaelen_dravendark", "korvin", "livia_marr", "lysandra_vell", "maelor_morvath", "marta_pell", "matthias_eld", "mira_thorne", "mistress_elara", "niles_vanner", "odelia_crane", "oren_quarn", "orla_fen", "pellan", "rufus_tern", "seren_vael", "severan_krauss", "sister_mereth", "sister_veyra", "sun_emperor", "sybilla_melakor", "tavian_merrow", "uther_calderan", "vaelen_vael", "vorn_dravendark"]);
 const pellan=world.getEntity("pellan")!;assert.equal(pellan.type,"character");if(pellan.type!=="character")return;
 assert.equal(pellan.work_location,"calderan_civil_registry"); // Four-District pass: the Registry location now existsassert.equal(pellan.home_location,null);assert.deepEqual(pellan.affiliations,[]);assert.equal(pellan.private_notes,undefined);
 assert.match(pellan.traits.join(" "),/fainting/);assert.match(pellan.morality!,/falsifying records/);
});
