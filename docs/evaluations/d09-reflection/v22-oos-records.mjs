/** Blind review input only. Invalid physical attempts stay in a separate diagnostic cohort. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const dir='saves/d09-reflection-v22-oos';
if(existsSync(`${dir}/blind-semantic-review.json`)||existsSync(`${dir}/candidate-oos-outcomes.json`))throw Error('Review already frozen');
const m=JSON.parse(readFileSync(`${dir}/oos-manifest.json`)),outputs=JSON.parse(readFileSync(`${dir}/oos-outputs.json`));
function extract(text){const start=text?.match(/"proposals"\s*:\s*\[/);if(!start)return [];const out=[];let pos=start.index+start[0].length;while(pos<text.length){while(/[\s,]/.test(text[pos]??''))pos++;if(text[pos]!=='{')break;let depth=0,quote=false,escape=false,end=null;for(let i=pos;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue;}if(c==='"'){quote=true;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0){end=i+1;break;}}if(end===null)break;try{out.push(JSON.parse(text.slice(pos,end)));}catch{break;}pos=end;}return out;}
const records=[],diagnostic=[];
for(const o of outputs){const c=m.cases.find(c=>c.id===o.id);if(o.parsed!==null)for(const[i,p]of o.parsed.entries())records.push({id:`${o.id}:${i}`,request_id:o.id,proposal:p,character:c.character,source_type:c.source_type,primary_family:c.primary_family,evidence_catalog:c.evidence_catalog});
 for(const a of o.attempts.filter(a=>!a.usable)){let text=a.text;try{text=JSON.parse(a.raw.body).choices[0].message.content??text;}catch{}const proposals=extract(text);for(const[i,p]of proposals.entries())diagnostic.push({id:`${o.id}:attempt${a.n}:diagnostic${i}`,request_id:o.id,attempt:a.n,proposal:p,failure_class:a.failure_class,finish_reason:a.finish_reason,evidence_catalog:c.evidence_catalog});}
}
writeFileSync(`${dir}/blind-review-records.json`,JSON.stringify(records,null,2));writeFileSync(`${dir}/diagnostic-malformed-objects.json`,JSON.stringify(diagnostic,null,2));console.log(JSON.stringify({primary_objects:records.length,invalid_attempt_diagnostic_objects:diagnostic.length}));
for(const[i,r]of records.entries())console.log(i,r.id,JSON.stringify(r.proposal));
