/** Diagnostic extraction BEFORE scoring; never repairs an envelope for acceptance. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const dir='saves/d09-reflection-v21';
if(existsSync(`${dir}/candidate-oos-outcomes.json`)||existsSync(`${dir}/blind-semantic-review.json`))throw Error('Diagnostic records must precede review/scoring');
const manifest=JSON.parse(readFileSync(`${dir}/oos-manifest.json`,'utf8')),outputs=readFileSync(`${dir}/oos-outputs.jsonl`,'utf8').trim().split('\n').map(JSON.parse);
function completeObject(text,start){let depth=0,quoted=false,escaped=false;for(let i=start;i<text.length;i++){const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return{text:text.slice(start,i+1),end:i+1};}return null;}
const records=[],envelopes=[];
for(const o of outputs){const c=manifest.cases.find(c=>c.id===o.id);let text=o.text;
 if(text===null){try{text=JSON.parse(o.attempts.at(-1).raw.body).choices[0].message.content;}catch{text='';}}
 let proposals=o.parsed;
 if(!proposals){const head=text?.match(/"proposals"\s*:\s*\[/);proposals=[];if(head){let pos=head.index+head[0].length;while(pos<text.length){while(/[\s,]/.test(text[pos]??''))pos++;if(text[pos]!=='{')break;const part=completeObject(text,pos);if(!part)break;try{proposals.push(JSON.parse(part.text));}catch{break;}pos=part.end;}}
 }
 envelopes.push({id:o.id,envelope_valid:o.parsed!==null,transport_ok:o.text!==null,complete_diagnostic_proposals:proposals.length,unreviewable_output:proposals.length===0&&o.parsed===null,raw_text:text});
 for(const [i,p]of proposals.entries())records.push({id:`${o.id}:${i}`,request_id:o.id,envelope_valid:o.parsed!==null,transport_ok:o.text!==null,proposal:p,character:c.character,source_type:c.source_type,family:c.family,evidence_catalog:c.evidence_catalog});
}
writeFileSync(`${dir}/blind-review-records.json`,JSON.stringify(records,null,2));writeFileSync(`${dir}/diagnostic-envelopes.json`,JSON.stringify(envelopes,null,2));
console.log('All complete diagnostic proposals:',records.length,'envelopes unreviewable:',envelopes.filter(e=>e.unreviewable_output).length);
for(const r of records)console.log(r.id,r.envelope_valid?'VALID':'MALFORMED',JSON.stringify(r.proposal));
