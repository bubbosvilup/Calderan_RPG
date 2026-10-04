/** Supplemental diagnostic review only. Never repairs input for production acceptance. */
import {readFileSync,writeFileSync} from 'node:fs';
const dir='saves/d09-semantic-oos';
const outputs=readFileSync(`${dir}/outputs.jsonl`,'utf8').trim().split('\n').map(JSON.parse),records=[];
for(const o of outputs.filter(o=>o.output&&!o.parsed)){
 const diagnostic=JSON.parse(o.output.text.replace(/^\s*```json\s*/,'').replace(/\s*```\s*$/,''));
 for(const [i,p] of diagnostic.proposals.entries())records.push({id:`${o.id}:malformed:${i}`,proposal:p,classification:i===0?'REDUNDANT':'MISLEADING',should_reach_narrator:'NO',reason:i===0?'Restates membership authority.':'One recorded move cannot establish a relocation pattern.',old_accepted:false,old_rejection:'malformed_response',candidate_evaluated:false,review_stage:'Supplemental review AFTER candidate reveal. Original blind review remains frozen. These proposals never enter primary metrics.'});
}
writeFileSync(`${dir}/supplemental-malformed-review.json`,JSON.stringify(records,null,2));console.log('Supplemental malformed proposals:',records.length);
