import { readFile, writeFile } from 'node:fs/promises';
import { exactBenchmarkCredential, benchmarkAuthentication } from '../.build/src/dev/reflection-benchmark.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { OpenRouterStateControllerProvider } from '../.build/src/llm/openrouter/state-controller.js';
import { readProviderStatus, controllerFallbackModels } from '../.build/src/app/production.js';
import { WorldStore } from '../.build/src/world/world-store.js';
import { CampaignState } from '../.build/src/campaign/campaign-state.js';
import { TurnCoordinator } from '../.build/src/turn/turn-coordinator.js';
import { RetrievalService } from '../.build/src/retrieval/retrieval-service.js';
import { HybridSearch } from '../.build/src/retrieval/hybrid-search.js';
const report = { authentication: 'not_attempted', calls: 0, retries: 0, cases: [] };
try {
  // Use the existing credential loader; never expose or inspect credential values.
  if (!process.env.OPENROUTER_API_KEY?.trim()) process.env.OPENROUTER_API_KEY = exactBenchmarkCredential({ fileText: await readFile('APIKEY.env', 'utf8') });
  report.key_exists = !!process.env.OPENROUTER_API_KEY?.trim();
  const client = new OpenRouterClient(); report.client_initialized = true;
  const status = readProviderStatus(), fallback = controllerFallbackModels();
  report.primary = status.controller_model; report.fallback = fallback;
  if (report.primary !== 'openai/gpt-6-luna' || fallback.join() !== 'anthropic/claude-haiku-5.5') throw new Error('resolver_mismatch');
  await benchmarkAuthentication(process.env.OPENROUTER_API_KEY); report.authentication = 'passed';
  const base = (id, name) => ({id,name,display_name:name,parent:null,aliases:[],summary:name,tags:[],search_context:'',content:name,knowledge:{visibility:{narrator:true,player:true},known_by:[]}});
  const entities = [{...base('shop','Shop'),type:'location',features:[],connections:[]},{...base('manor','Manor'),type:'location',features:[],connections:[]},
    {...base('nicco','Nicco'),type:'character',role:'player',location:null,traits:[],relationships:[]},
    {...base('pellan','Lord Pellan'),type:'character',role:'npc',location:'manor',traits:[],relationships:[]}];
  const world = new WorldStore(entities.map(entity=>({source:`synthetic/${entity.id}.yaml`,document:{schema_version:1,entity,chunks:[]}})));
  const campaign = new CampaignState(world,'item_live_smoke',{player_location:'shop',world_time:{world_minute:600}});
  const apply = commands => campaign.apply({expected_revision:campaign.revision,commands});
  apply([{kind:'create_item',name:'Silver Knife',description:'A silver knife.',visual_description:'Small plain silver knife with a straight blade and simple handle.',category:'weapon',owner_id:'nicco',position:{kind:'carried',character_id:'nicco'}}]);
  const cases = [
    ['put down','I leave the silver knife here.','Nicco lays the silver knife on the desk and leaves it there.','stored'],
    ['pick back up','I pick the silver knife back up.','Nicco picks the silver knife back up and carries it.','carried'],
    ['absent owner','I take the ring.',"Lord Pellan's signet ring rests on the desk. Nicco takes Pellan's signet ring and pockets it.",'ring'],
    ['existing reuse','I take the silver knife.','Nicco takes the silver knife from the desk and carries it.','carried']];
  for (const [name,input,narration,expected] of cases) {
    if(name==='existing reuse') apply([{kind:'place_item',item_id:'campaign_item_00000001',position:{kind:'stored',location_id:'shop'}}]);
    let proposal, failure, grounded;
    const provider = new OpenRouterStateControllerProvider(client,{model:status.controller_model,fallback_models:fallback});
    const controller = {async propose(request){report.calls++;grounded=JSON.parse(request.prior_state).referenced_known_characters;try { return proposal=await provider.propose(request); } catch(e){failure={code:e.code,status:e.http?.status};throw e;}}};
    const meta={model:'scripted-narration',usage:{},latency:{request_started_at:new Date().toISOString(),completed_at:new Date().toISOString(),elapsed_total_ms:0}};
    const narrator={async generate(){return {text:narration,...meta};},async *stream(){yield {type:'text_delta',text:narration};yield {type:'completed',result:{text:narration,...meta}};}};
    const service=new RetrievalService(world),co=new TurnCoordinator(world,narrator,controller,{service,search:new HybridSearch(service)},{provider_retry:false});
    const events=[];for await(const e of co.runTurn({campaign,player_input:input})) events.push(e);
    const items=campaign.exportSnapshot().items, knife=items.find(i=>i.id==='campaign_item_00000001'),ring=items.find(i=>i.id==='campaign_item_00000002');
    const pass=expected==='ring'?ring?.owner_id==='pellan'&&ring.position.kind==='carried'&&ring.position.character_id==='nicco'&&proposal?.commands.filter(c=>c.kind==='create_item').length===1&&grounded?.some(c=>c.id==='pellan'):
      knife?.position.kind===expected&&knife.owner_id==='nicco'&&items.filter(i=>i.name==='Silver Knife').length===1&&!proposal?.commands.some(c=>c.kind==='create_item');
    report.cases.push({name,proposal:proposal?.commands,fallback:proposal?.model_fallback,response_model:proposal?.response_model,grounded,failure,engine:items,structural:events.some(e=>e.type==='turn_completed')?'passed':'failed',grade:pass?'PASS':'FAIL'});
    if(failure?.code==='authentication_error') break;
  }
} catch(e) { report.authentication = report.authentication === 'passed' ? 'passed' : 'failed'; report.error = e.code ?? (e.message?.startsWith('Benchmark authentication')?e.message:'preflight_failed'); }
if(report.authentication==='failed' && !report.cases.length) report.cases=['put down','pick back up','absent owner','existing reuse'].map(name=>({name,proposal:null,engine:'not run',semantic:'not evaluated',structural:'not evaluated',fallback:false,grade:'BLOCKED_AUTH'}));
await writeFile('docs/evaluations/ITEM_INVENTORY_LIVE_SMOKE.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
