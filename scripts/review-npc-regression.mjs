import {readFile,writeFile} from 'node:fs/promises';
const dir='docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z';
const m=JSON.parse(await readFile(`${dir}/manifest.json`,'utf8'));
const mode=process.argv[2]??'summary';
for(const id of m.rotation)for(const test of ['identity','items']){
 const file=`${id}-${test}.json`,r=JSON.parse(await readFile(`${dir}/${file}`,'utf8'));
 if(mode==='repair-extraction'){
  const raw=JSON.parse(await readFile(`${m.private_dir}/${file}`,'utf8'));
  for(let i=0;i<raw.turns.length;i++){
   const p=raw.turns[i].narrator_request?.messages[0]?.content??'';
   const start=p.indexOf('\n[CHARACTER KNOWLEDGE ACCESS]\n')+1;
   const end=p.indexOf('\n\n[',start+30);
   raw.turns[i].knowledge_access=start>0?p.slice(start,end<0?undefined:end):null;
   if(id!=='dren')r.turns[i].knowledge_access=raw.turns[i].knowledge_access;
  }
  await writeFile(`${m.private_dir}/${file}`,JSON.stringify(raw,null,2));
  await writeFile(`${dir}/${file}`,JSON.stringify(r,null,2));
  continue;
 }
 if(id==='dren')continue;
 if(mode==='identity'&&test==='identity')console.log(JSON.stringify({id,knowledge:r.turns[0].knowledge_access}));
 if(mode==='items'&&test==='items')console.log(JSON.stringify({id,turns:r.turns.map(t=>({narration:t.narration,owner:t.after_audit.items[0]?.owner_id,proposal:t.result.controller_proposal,auth:t.result.authorization.map(a=>({authorized:a.authorized,reason:a.reason,check:a.evidence?.check})),natural:t.result.action_resolution}))}));
 if(mode==='summary')console.log(JSON.stringify({id,test,turns:r.turns.map(t=>({owner:t.after_audit.items[0]?.owner_id,commands:t.result.authorized_commands,proposals:t.result.controller_proposal,authorization:t.result.authorization.map(a=>({reason:a.reason,verified:a.evidence?.verified,check:a.evidence?.check})),natural:t.result.action_resolution,retrieval:t.result.retrieval.ids,narrator_wire:t.narrator_wire,controller_wire:t.controller_wire}))}));
}
