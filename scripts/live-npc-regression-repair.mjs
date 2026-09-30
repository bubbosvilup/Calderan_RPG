// Evaluation only (Live NPC Regression Repair 1 rerun): the EXACT Test 1/2 matrix, inputs and scaffold of live-npc-regression.mjs,
// run through the repaired production coordinator. Writes to a new directory; the baseline artifacts are never touched.
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { buildTurnContext } from '../.build/src/turn/context-builder.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { onlineCoordinator, selectedModels } from '../.build/src/dev/turn-services.js';
import { capturingFetch, settle } from '../.build/src/dev/narrator-bakeoff.js';

const rotation = ['pellan','korvin','mistress_elara','bartolomhew','dren','blackthorn','captain_doran_hale','brother_aven','sister_mereth','bram_kessel','hadrik_voss','mira_thorne','livia_marr','jessa_rook','orla_fen','niles_vanner'];
const returnInput = "Thanks *he said to them, after which he decides to give them back the boots*\nYou'll need them more than me";
const itemId = 'campaign_item_regression_leather_boots';
const stamp = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, '-');
const publicDir = `docs/evaluations/live-npc-regression-repair-1-${stamp}`;
const privateDir = `.build/live-npc-regression-repair-1-${stamp}`;
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
const manifest = process.argv[2] ? JSON.parse(await readFile(`${publicDir}/manifest.json`,'utf8')) : {started_at:new Date().toISOString(),models:selectedModels(),provider:'OpenRouter',retrieval:'lexical; standard live-evaluation onlineCoordinator(world, false)',rotation,item_id:itemId,return_input:returnInput,public_dir:publicDir,private_dir:privateDir,source_before:await sourceHash(),cases:[]};
manifest.item_id=itemId;
await writeFile(`${publicDir}/manifest.json`,JSON.stringify(manifest,null,2));
if(!process.env.OPENROUTER_API_KEY?.trim()) throw new Error('LIVE NPC REGRESSION BLOCKED: no configured credential');
const world=await loadWorld('data');
function section(prompt,label) {const marker=`\n[${label}]\n`;const found=prompt.indexOf(marker);const start=found<0?(prompt.startsWith(`[${label}]\n`)?0:-1):found+1;if(start<0)return null;const end=prompt.indexOf('\n\n[',start+label.length+2);return prompt.slice(start,end<0?undefined:end);}
function audit(snapshot) {return {revision:snapshot.revision,items:snapshot.items,characters:snapshot.characters.map(c=>({id:c.id,current:c.current})),item_count:snapshot.items.filter(i=>i.id===itemId).length,boot_like_count:snapshot.items.filter(i=>/boot/i.test(`${i.id} ${i.name??''}`)).length,equipped:snapshot.items.filter(i=>i.position.kind==='equipped')};}
async function runCase(id,test) {
 if(manifest.cases.some(c=>c.npc_id===id&&c.test===test)) return;
 const name=world.getEntity(id).name;
 const campaign=createOpeningCampaign(world,`npc_regression_${id}_${test}`);
 const commands=[{kind:'runtime_delta',delta:{character_movements:[{character_id:id,current_location:'heartstone_square'}]}}];
 if(test==='items')commands.push({kind:'register_item',item:{id:itemId,origin:{kind:'created'},name:'pair of leather boots',owner_id:id,position:{kind:'carried',character_id:id}}});
 campaign.apply({expected_revision:campaign.revision,commands});
 const nw=capturingFetch(),cw=capturingFetch(),requests=[];
 const coordinator=await onlineCoordinator(world,false,p=>({generate:p.generate.bind(p),stream:r=>{requests.push(r);return p.stream(r);}}),{narrator_client:new OpenRouterClient({fetch:nw.fetch}),controller_client:new OpenRouterClient({fetch:cw.fetch})});
 const record={npc_id:id,name,test,campaign_id:campaign.exportSnapshot().campaign_id,initial:audit(campaign.exportSnapshot()),turns:[]};
 const inputs=test==='identity'?[`*He asks ${name} who they think he is and where he comes from.*`]:[`${name} gives Nicco a pair of leather boots.`,returnInput];
 for(const input of inputs) {
  const before=campaign.exportSnapshot(),context=buildTurnContext(world,before),ni=nw.captures.length,ci=cw.captures.length,ri=requests.length,events=[];
  let exception=null;
  try {for await(const e of coordinator.runTurn({campaign,player_input:input}))events.push(e);}catch(e){exception={name:e.name,message:e.message};}
  await Promise.all([...nw.captures.slice(ni).map(settle),settle(cw.captures[ci])]);
  const last=events.at(-1),result=last?.type==='turn_completed'?last.result:null,after=campaign.exportSnapshot();
  const prompt=requests[ri]?.messages[0]?.content??'';
  const turn={input,outcome:result?'success':last?.code??last?.type??'exception',exception,narration:events.filter(e=>e.type==='narration_delta').map(e=>e.text).join(''),result,events,before,after,before_audit:audit(before),after_audit:audit(after),context,knowledge_access:section(prompt,'CHARACTER KNOWLEDGE ACCESS'),portrayal_supplied:!!context.primary.scene.present_characters.find(c=>c.id===id)?.portrayal,present_ids:context.characters.map(c=>c.id),reconciliation:result?.narration_reconciliation??null,revision_requested:requests.length-ri>1,narrator_request:requests[ri]??null,revision_request:requests[ri+1]??null,narrator_wire:nw.captures[ni]??null,controller_wire:cw.captures[ci]??null};
  record.turns.push(turn);
  await writeFile(`${privateDir}/${id}-${test}.json`,JSON.stringify(record,null,2));
  console.log(JSON.stringify({npc:id,test,turn:record.turns.length,outcome:turn.outcome}));
 }
 const publicRecord=id==='dren'?{npc_id:id,name,test,redacted:true,note:'Protected character content retained only in the local private artifact.',initial:record.initial,turns:record.turns.map(t=>({input:t.input,outcome:t.outcome,delivered:t.reconciliation?.delivered??null,issue_kinds:(t.reconciliation?.issues??[]).map(i=>i.kind),revision_issue_kinds:(t.reconciliation?.revision_issues??[]).map(i=>i.kind),natural_actions:t.result?.action_resolution?.actions?.map(a=>({kind:a.kind,status:a.status}))??null,authorized_kinds:t.result?.authorized_commands?.map(c=>c.kind)??null,before_audit:t.before_audit,after_audit:t.after_audit,portrayal_supplied:t.portrayal_supplied,present_ids:t.present_ids,narrator_wire:t.narrator_wire,controller_wire:t.controller_wire}))}:{...record,turns:record.turns.map(({context,narrator_request,revision_request,...t})=>t)};
 await writeFile(`${publicDir}/${id}-${test}.json`,JSON.stringify(publicRecord,null,2));
 manifest.cases.push({npc_id:id,test,file:`${id}-${test}.json`,outcomes:record.turns.map(t=>t.outcome)});
 await writeFile(`${publicDir}/manifest.json`,JSON.stringify(manifest,null,2));
}
// Two independent campaigns may call the providers concurrently. No shared state or conversation.
let next=0;
async function worker(){while(next<rotation.length){const id=rotation[next++];await runCase(id,'identity');await runCase(id,'items');}}
await Promise.all([worker(),worker()]);
manifest.finished_at=new Date().toISOString();manifest.source_after=await sourceHash();manifest.source_unchanged=manifest.source_before===manifest.source_after;
await writeFile(`${publicDir}/manifest.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({completed:manifest.cases.length,public_dir:publicDir,private_dir:privateDir,source_unchanged:manifest.source_unchanged}));
