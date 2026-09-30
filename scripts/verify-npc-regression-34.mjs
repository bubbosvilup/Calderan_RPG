import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/evaluations/live-npc-regression-1-tests34-2026-09-30T01-36-29-565Z';
const m=JSON.parse(await readFile(`${dir}/manifest.json`,'utf8'));
const report=await readFile('docs/evaluations/CALDERAN_LIVE_NPC_REGRESSION_1.md','utf8');
assert.equal(m.cases.length,32);assert.equal(m.source_unchanged,true);
const campaigns=new Set();let transcripts=0;
for(const id of m.rotation)for(const test of ['observe','punch']){
 const r=JSON.parse(await readFile(`${m.private_dir}/${id}-${test}.json`,'utf8'));
 const pub=JSON.parse(await readFile(`${dir}/${id}-${test}.json`,'utf8'));
 assert(!campaigns.has(r.campaign_id));campaigns.add(r.campaign_id);
 const t=r.turns[0];
 assert.equal(t.input,test==='observe'?`*He looks at ${r.name}, trying to understand what kind of person he has in front of him.*`:`*He punches ${r.name} directly in the face.*`);
 assert.equal(t.outcome,'success');assert.equal(t.narrator_wire.finish_reason,'stop');
 assert.equal(t.result.action_resolution.actions.length,0);assert.equal(t.result.authorized_commands.length,0);
 assert.deepEqual(t.state_diff,{});assert.equal(t.before.revision,t.after.revision);
 assert(t.present_ids.includes(id)||id==='dren');
 if(id==='dren'){
  assert(pub.redacted);assert(!('narration' in pub.turns[0]));assert(!report.includes(t.narration.trim()));
  assert.equal(t.portrayal_supplied,false);
 }else{
  assert(report.includes(t.narration.trim()));assert(report.includes(t.input));transcripts++;
  assert.equal(t.portrayal_supplied,true);
 }
}
assert.equal(campaigns.size,32);assert.equal(transcripts,30);
for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVW')assert(new RegExp(`^## ${letter}\\. `,'m').test(report),letter);
assert(report.trimEnd().endsWith('LIVE NPC REGRESSION ISSUES FOUND'));
for(const match of report.matchAll(/\]\(([^)]+)\)/g)){const p=match[1];if(!p.includes('://'))await access(`docs/evaluations/${p}`);}
const h=createHash('sha256');
async function visit(d){for(const e of (await readdir(d,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=`${d}/${e.name}`;if(e.isDirectory())await visit(p);else{h.update(p);h.update(await readFile(p));}}}
await visit('src');await visit('data');assert.equal(h.digest('hex'),m.source_before);
console.log(JSON.stringify({verified:true,campaigns:32,non_dren_transcripts_in_report:30,dren_redacted:true,state_diffs:0,sections:'A-W',source_unchanged:true}));
