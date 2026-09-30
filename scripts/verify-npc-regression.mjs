import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z';
const m=JSON.parse(await readFile(`${dir}/manifest.json`,'utf8'));
const report=await readFile('docs/evaluations/CALDERAN_LIVE_NPC_REGRESSION_1.md','utf8');
assert.equal(m.cases.length,32);
const campaigns=new Set();let turns=0;
for(const id of m.rotation)for(const test of ['identity','items']){
 const r=JSON.parse(await readFile(`${m.private_dir}/${id}-${test}.json`,'utf8'));
 const pub=JSON.parse(await readFile(`${dir}/${id}-${test}.json`,'utf8'));
 assert(!campaigns.has(r.campaign_id));campaigns.add(r.campaign_id);
 assert.equal(r.turns.length,test==='identity'?1:2);
 const expected=test==='identity'?[`*He asks ${r.name} who they think he is and where he comes from.*`]:[`${r.name} gives Nicco a pair of leather boots.`,m.return_input];
 for(let i=0;i<r.turns.length;i++){
  const t=r.turns[i];turns++;
  assert.equal(t.input,expected[i]);assert.equal(t.outcome,'success');
  assert.equal(t.narrator_wire.finish_reason,'stop');
  assert.equal(t.result.retrieval.operations,0);assert.equal(t.result.retrieval.ids.length,0);
  assert.equal(t.result.authorized_commands.length,0);
  assert.equal(t.result.action_resolution.actions.length,0);
  if(id!=='dren'){
   assert(t.knowledge_access.startsWith('[CHARACTER KNOWLEDGE ACCESS]\nFacts:'));
   assert(t.knowledge_access.includes(`${r.name}: CAN USE none; DO NOT USE F1, F2`));
   assert.equal(pub.turns[i].knowledge_access,t.knowledge_access);
   assert(report.includes(t.narration));assert(report.includes(t.input));
   assert.equal(t.portrayal_supplied,true);
  }
  if(test==='items')for(const s of [t.before,t.after]){
   assert.equal(s.items.length,1);assert.equal(s.items[0].id,m.item_id);
   assert.equal(s.items[0].owner_id,id);assert.deepEqual(s.items[0].position,{kind:'carried',character_id:id});
  }
 }
 if(id==='dren'){assert(pub.redacted);for(const t of pub.turns){assert(!('narration' in t));assert(!('context' in t));assert(!('narrator_request' in t));}}
}
assert.equal(turns,48);assert.equal(campaigns.size,32);
for(const letter of 'ABCDEFGHIJKLMNO')assert(new RegExp(`^## ${letter}\\. `,'m').test(report));
assert(report.trimEnd().endsWith('LIVE NPC REGRESSION ISSUES FOUND'));
for(const match of report.matchAll(/\]\(([^)]+)\)/g)){
 const p=match[1];if(!p.includes('://'))await access(`docs/evaluations/${p}`);
}
const h=createHash('sha256');
async function visit(dir){for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=`${dir}/${e.name}`;if(e.isDirectory())await visit(p);else{h.update(p);h.update(await readFile(p));}}}
await visit('src');await visit('data');assert.equal(h.digest('hex'),m.source_before);
console.log(JSON.stringify({verified:true,campaigns:32,turns:48,non_dren_transcripts_in_report:45,exact_inputs:true,all_sections_and_links:true,dren_public_transcripts_redacted:true,source_and_canon_unchanged:true}));
