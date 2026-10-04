/** Failed V2 OOS is DEVELOPMENT ONLY. Original artifacts are never rewritten. */
import {readFileSync,writeFileSync} from 'node:fs';
import {sha} from './lib.mjs';
import {evaluateStructuredOutputV21,validateStructuredClaimV21} from '../../../.build/src/dev/reflection-v21.js';
const dir='saves/d09-reflection-v21',preserved=JSON.parse(readFileSync(`${dir}/v2-historical-preservation.json`,'utf8'));
for(const [name,hash]of Object.entries(preserved.artifact_hashes))if(sha(readFileSync(`saves/d09-reflection-v2/${name}`))!==hash)throw Error(`Historical V2 artifact changed: ${name}`);
const m=JSON.parse(readFileSync('saves/d09-reflection-v2/oos-manifest.json','utf8')),old=JSON.parse(readFileSync('saves/d09-reflection-v2/candidate-oos-outcomes.json','utf8')),outputs=readFileSync('saves/d09-reflection-v2/oos-outputs.jsonl','utf8').trim().split('\n').map(JSON.parse),rows=[];
for(const r of old.rows){const c=m.cases.find(c=>r.id.startsWith(c.id+':')),o=outputs.find(o=>o.id===c.id),index=Number(r.id.slice(r.id.lastIndexOf(':')+1));
 const diagnostic=o.parsed?evaluateStructuredOutputV21(o.parsed,c.evidence_catalog,c.character.id,new Map(c.knownNames)).diagnostics[index]:validateStructuredClaimV21(r.proposal,c.evidence_catalog,c.character.id);
 rows.push({...r,v21:diagnostic,v21_accepted:r.envelope_valid&&diagnostic.accepted});
}
const falseNegatives=rows.filter(r=>r.old_accepted&&!r.new_accepted&&r.classification==='USEFUL'),bad=rows.filter(r=>r.old_accepted&&!r.new_accepted&&['MISLEADING','HARMFUL'].includes(r.classification)),useful=rows.filter(r=>r.new_accepted&&r.classification==='USEFUL'),facts=rows.filter(r=>r.factual_error);
const metrics={dataset:'Failed V2 OOS, now development only',false_negatives_recovered:falseNegatives.filter(r=>r.v21_accepted).length,false_negatives_total:falseNegatives.length,bad_retained:bad.filter(r=>!r.v21_accepted).length,bad_total:bad.length,factual_rejections_retained:facts.filter(r=>!r.v21.accepted).length,factual_total:facts.length,useful_preserved:useful.filter(r=>r.v21_accepted).length,useful_total:useful.length};
metrics.gate=metrics.false_negatives_recovered===2&&metrics.bad_retained===6&&metrics.factual_rejections_retained===metrics.factual_total&&metrics.useful_preserved===28?'PASS':'FAIL';
writeFileSync(`${dir}/dev-regression.json`,JSON.stringify({metrics,rows},null,2));console.log(JSON.stringify(metrics,null,2));if(metrics.gate!=='PASS')process.exitCode=1;
