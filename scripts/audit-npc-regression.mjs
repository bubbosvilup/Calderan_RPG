import {readFile,writeFile} from 'node:fs/promises';
import {loadWorld} from '../.build/src/world/loader.js';
const dir='docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z';
const m=JSON.parse(await readFile(`${dir}/manifest.json`,'utf8'));
const w=await loadWorld('data');
const rows=[],providers={narrator:{},controller:{}},counts={turns:0,successful:0,gifts_committed:0,authorized_commands:0,proposals:0,rejected_proposals:0,verified_but_rejected:0,natural_actions:0,duplicates:0,equipped:0,unrelated_changes:0,knowledge_changes:0};
for(const id of m.rotation){
 const row={id,tests:{}};
 for(const test of ['identity','items']){
  const raw=JSON.parse(await readFile(`${m.private_dir}/${id}-${test}.json`,'utf8'));
  row.tests[test]=raw.turns.map((t,i)=>{
   counts.turns++;if(t.outcome==='success')counts.successful++;
   for(const role of ['narrator','controller']){const p=t[`${role}_wire`]?.upstream_provider??'not reported';providers[role][p]=(providers[role][p]??0)+1;}
   counts.authorized_commands+=t.result?.authorized_commands.length??0;
   counts.proposals+=t.result?.controller_proposal.length??0;
   counts.rejected_proposals+=t.result?.authorization.filter(a=>!a.authorized).length??0;
   counts.verified_but_rejected+=t.result?.authorization.filter(a=>!a.authorized&&a.evidence?.verified).length??0;
   counts.natural_actions+=t.result?.action_resolution.actions.length??0;
   if(t.after_audit.boot_like_count>1)counts.duplicates++;
   counts.equipped+=t.after_audit.equipped.length;
   if(JSON.stringify(t.before.knowledge)!==JSON.stringify(t.after.knowledge))counts.knowledge_changes++;
   const unrelated=s=>s.items.filter(a=>a.id!==m.item_id);
   if(JSON.stringify(unrelated(t.before))!==JSON.stringify(unrelated(t.after)))counts.unrelated_changes++;
   const item=t.after.items.find(a=>a.id===m.item_id);
   if(test==='items'&&i===0&&item?.owner_id==='nicco'&&item.position.character_id==='nicco')counts.gifts_committed++;
   return {outcome:t.outcome,owner:item?.owner_id,position:item?.position,present:t.present_ids.includes(id),portrayal:t.portrayal_supplied,proposed:t.result?.controller_proposal.length,accepted:t.result?.authorized_commands.length,reasons:t.result?.authorization.map(a=>a.reason),verified:t.result?.authorization.map(a=>a.evidence?.verified),checks:t.result?.authorization.map(a=>a.evidence?.check),retrieval:t.result?.retrieval,finish:t.narrator_wire?.finish_reason,knowledge_can_use:t.knowledge_access?.split('\n').find(l=>l.startsWith(`${w.getEntity(id).name}:`))??null};
  });
 }
 rows.push(row);
}
await writeFile(`${dir}/audit.json`,JSON.stringify({counts,providers,rows},null,2));
console.log(JSON.stringify({counts,providers},null,2));
