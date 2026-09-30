// Evaluation only: Tests 3 (observation) and 4 (unprovoked punch) through the unchanged production coordinator.
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { buildTurnContext } from '../.build/src/turn/context-builder.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { onlineCoordinator, selectedModels } from '../.build/src/dev/turn-services.js';
import { capturingFetch, settle } from '../.build/src/dev/narrator-bakeoff.js';

const rotation = ['pellan','korvin','mistress_elara','bartolomhew','dren','blackthorn','captain_doran_hale','brother_aven','sister_mereth','bram_kessel','hadrik_voss','mira_thorne','livia_marr','jessa_rook','orla_fen','niles_vanner'];
const tests = ['observe','punch'];
const inputFor = (test,name) => test==='observe' ? `*He looks at ${name}, trying to understand what kind of person he has in front of him.*` : `*He punches ${name} directly in the face.*`;
const stamp = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, '-');
const publicDir = `docs/evaluations/live-npc-regression-1-tests34-${stamp}`;
const privateDir = `.build/live-npc-regression-1-tests34-${stamp}`;
await mkdir(publicDir, {recursive:true});
await mkdir(privateDir, {recursive:true});
async function sourceHash() {
  const h=createHash('sha256');
  async function visit(dir) { for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const p=`${dir}/${entry.name}`;
    if(entry.isDirectory()) await visit(p); else {h.update(p);h.update(await readFile(p));}
  }}
  await visit('src'); await visit('data'); return h.digest('hex');
}
const manifest = process.argv[2] ? JSON.parse(await readFile(`${publicDir}/manifest.json`,'utf8')) : {started_at:new Date().toISOString(),models:selectedModels(),provider:'OpenRouter',retrieval:'lexical; standard live-evaluation onlineCoordinator(world, false)',rotation,tests,public_dir:publicDir,private_dir:privateDir,source_before:await sourceHash(),scene_rule:{observe:'target NPC moved to heartstone_square with Nicco (as Tests 1-2)',punch:'Nicco moved to the target NPC canonical base location when one exists (opening-state co-location retained); otherwise target NPC moved to heartstone_square'},cases:[]};
await writeFile(`${publicDir}/manifest.json`,JSON.stringify(manifest,null,2));
if(!process.env.OPENROUTER_API_KEY?.trim()) throw new Error('LIVE NPC REGRESSION BLOCKED: no configured credential');
const world=await loadWorld('data');
function section(prompt,label) {const marker=`\n[${label}]\n`;const found=prompt.indexOf(marker);const start=found<0?(prompt.startsWith(`[${label}]\n`)?0:-1):found+1;if(start<0)return null;const end=prompt.indexOf('\n\n[',start+label.length+2);return prompt.slice(start,end<0?undefined:end);}
function stateAudit(s) {const {revision,...rest}=s;return rest;}
function diff(before,after) {
  const out={};const a=stateAudit(before),b=stateAudit(after);
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])) if(JSON.stringify(a[k])!==JSON.stringify(b[k])) out[k]={before:a[k],after:b[k]};
  return out;
}
async function runCase(id,test) {
 if(manifest.cases.some(c=>c.npc_id===id&&c.test===test)) return;
 const entity=world.getEntity(id),name=entity.name;
 const campaign=createOpeningCampaign(world,`npc_regression_${id}_${test}`);
 const base=entity.base_location??null;
 const sceneLocation=test==='punch'&&base?base:'heartstone_square';
 const delta=sceneLocation==='heartstone_square'?{character_movements:[{character_id:id,current_location:'heartstone_square'}]}:{player_location:sceneLocation,character_movements:[{character_id:id,current_location:sceneLocation}]};
 campaign.apply({expected_revision:campaign.revision,commands:[{kind:'runtime_delta',delta}]});
 const nw=capturingFetch(),cw=capturingFetch(),requests=[];
 const coordinator=await onlineCoordinator(world,false,p=>({generate:p.generate.bind(p),stream:r=>{requests.push(r);return p.stream(r);}}),{narrator_client:new OpenRouterClient({fetch:nw.fetch}),controller_client:new OpenRouterClient({fetch:cw.fetch})});
 const input=inputFor(test,name);
 const before=campaign.exportSnapshot(),context=buildTurnContext(world,before),events=[];
 const runtimeCoLocated=before.runtime.npc_locations.filter(c=>c.current_location===sceneLocation).map(c=>c.character_id);
 let exception=null;
 try {for await(const e of coordinator.runTurn({campaign,player_input:input}))events.push(e);}catch(e){exception={name:e.name,message:e.message};}
 await Promise.all([settle(nw.captures[0]),settle(cw.captures[0])]);
 const last=events.at(-1),result=last?.type==='turn_completed'?last.result:null,after=campaign.exportSnapshot();
 const prompt=requests[0]?.messages[0]?.content??'';
 const turn={input,scene_location:sceneLocation,runtime_co_located:runtimeCoLocated,outcome:result?'success':last?.code??last?.type??'exception',exception,narration:events.filter(e=>e.type==='narration_delta').map(e=>e.text).join(''),result,events,before,after,state_diff:diff(before,after),context,knowledge_access:section(prompt,'CHARACTER KNOWLEDGE ACCESS'),scene_section:section(prompt,'CURRENT AUTHORITATIVE SCENE'),characters_section:section(prompt,'CURRENT AUTHORITATIVE CHARACTERS'),portrayal_supplied:!!context.primary.scene.present_characters.find(c=>c.id===id)?.portrayal,present_ids:context.characters.map(c=>c.id),narrator_present_ids:context.primary.scene.present_characters.map(c=>c.id),narrator_request:requests[0]??null,narrator_wire:nw.captures[0]??null,controller_wire:cw.captures[0]??null};
 const record={npc_id:id,name,test,campaign_id:before.campaign_id,turns:[turn]};
 await writeFile(`${privateDir}/${id}-${test}.json`,JSON.stringify(record,null,2));
 console.log(JSON.stringify({npc:id,test,outcome:turn.outcome,scene:sceneLocation}));
 const publicRecord=id==='dren'?{npc_id:id,name,test,redacted:true,note:'Protected character content retained only in the local private artifact.',turns:[{input,scene_location:sceneLocation,outcome:turn.outcome,state_diff_keys:Object.keys(turn.state_diff),portrayal_supplied:turn.portrayal_supplied,present_ids:turn.present_ids,natural_actions:result?.action_resolution?.actions?.map(a=>({kind:a.kind,status:a.status}))??null,proposal_kinds:result?.controller_proposal?.map(c=>c.kind)??null,authorized_kinds:result?.authorized_commands?.map(c=>c.kind)??null,narrator_wire:turn.narrator_wire,controller_wire:turn.controller_wire}]}:{...record,turns:[(({context,narrator_request,characters_section,...t})=>t)(turn)]};
 await writeFile(`${publicDir}/${id}-${test}.json`,JSON.stringify(publicRecord,null,2));
 manifest.cases.push({npc_id:id,test,file:`${id}-${test}.json`,outcome:turn.outcome,scene_location:sceneLocation});
 await writeFile(`${publicDir}/manifest.json`,JSON.stringify(manifest,null,2));
}
// Two independent campaigns may call the providers concurrently. No shared state or conversation.
const queue=rotation.flatMap(id=>tests.map(test=>[id,test]));let next=0;
async function worker(){while(next<queue.length){const [id,test]=queue[next++];await runCase(id,test);}}
await Promise.all([worker(),worker()]);
manifest.finished_at=new Date().toISOString();manifest.source_after=await sourceHash();manifest.source_unchanged=manifest.source_before===manifest.source_after;
await writeFile(`${publicDir}/manifest.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({completed:manifest.cases.length,public_dir:publicDir,private_dir:privateDir,source_unchanged:manifest.source_unchanged}));
