/** Same raw outputs; old validator first, immutable candidate only on old accepted proposals. */
import {readFileSync,writeFileSync} from 'node:fs';
import {sha,validateProposals,REFLECTION_SYSTEM,REFLECTION_SCHEMA} from './lib.mjs';
import {semanticFindings} from './semantic-rules.mjs';
const dir='saves/d09-semantic-oos',read=n=>readFileSync(`${dir}/${n}`,'utf8');
const manifest=JSON.parse(read('corpus-manifest.json')),review=JSON.parse(read('manual-semantic-review.json'));
if(sha(read('corpus-manifest.json'))!==read('manifest.sha256').trim()||sha(read('manual-semantic-review.json'))!==read('review.sha256').trim())throw Error('Freeze mismatch');
if(sha(readFileSync('docs/evaluations/d09-reflection/semantic-rules.mjs'))!==manifest.rule_sha)throw Error('Rule mismatch');
if(sha(REFLECTION_SYSTEM)!==manifest.prompt_sha||sha(REFLECTION_SCHEMA)!==manifest.schema_sha)throw Error('Production setup changed');
const outputs=read('outputs.jsonl').trim().split('\n').map(JSON.parse),reviews=new Map(review.records.map(r=>[r.id,r]));
const classes=['USEFUL','NEUTRAL','REDUNDANT','MISLEADING','HARMFUL'],counts=()=>Object.fromEntries(classes.map(c=>[c,0]));
const old_counts=counts(),new_counts=counts(),rejected_counts=counts(),per_rule={},rows=[];
for(const o of outputs){const c=manifest.cases.find(c=>c.id===o.id);if(c.request_sha!==o.request_sha)throw Error('Request changed');
 const old=o.parsed?validateProposals(o.parsed,c.evidence_catalog,c.character,new Map(c.knownNames),new Set(c.worldWords)):null;
 if(sha(old)!==sha(o.old))throw Error('Old validator changed');
 for(const [i,p] of (o.parsed??[]).entries()){
  const r=reviews.get(`${o.id}:${i}`);if(!r||sha(p)!==r.proposal_sha)throw Error('Review mismatch');
  const accepted=old.accepted.some(q=>sha({...q,text:p.text})===sha(p));
  const findings=accepted?semanticFindings(p,c.evidence_catalog,c.character):[];
  if(accepted){old_counts[r.classification]++;if(findings.length)rejected_counts[r.classification]++;else new_counts[r.classification]++;}
  for(const rule of findings){per_rule[rule]??=counts();per_rule[rule][r.classification]++;}
  rows.push({id:r.id,proposal:p,classification:r.classification,reason:r.reason,should_reach_narrator:r.should_reach_narrator,old_accepted:accepted,old_rejection:accepted?null:old.rejected.find(x=>sha(x.proposal)===sha(p))?.reason,findings,new_accepted:accepted&&!findings.length});
 }
}
const oldBad=old_counts.MISLEADING+old_counts.HARMFUL,newBad=new_counts.MISLEADING+new_counts.HARMFUL,caught=oldBad-newBad;
const metrics={total_requests:outputs.length,physical_calls:outputs.flatMap(o=>o.attempts).length,retries:outputs.reduce((n,o)=>n+o.attempts.length-1,0),cost_usd:outputs.flatMap(o=>o.attempts).reduce((n,a)=>n+a.cost_usd,0),empty_responses:outputs.filter(o=>o.parsed?.length===0).length,malformed_responses:outputs.filter(o=>o.output&&!o.parsed).length,provider_failures:outputs.filter(o=>!o.output).length,parsed_proposals:rows.length,old_counts,new_counts,rejected_counts,bad_caught:caught,bad_escaped:newBad,catch_rate:oldBad?caught/oldBad:null,bad_rate_old:oldBad/Object.values(old_counts).reduce((a,b)=>a+b,0),bad_rate_new:newBad/Object.values(new_counts).reduce((a,b)=>a+b,0),per_rule,gate:rejected_counts.USEFUL===0&&oldBad>0&&caught/oldBad>=0.5?'PASS':'FAIL'};
const positives=rows.filter(r=>r.classification==='USEFUL');metrics.positive_controls={useful_generated:positives.length,old_accepted:positives.filter(r=>r.old_accepted).length,candidate_preserved:positives.filter(r=>r.new_accepted).length,candidate_lost:positives.filter(r=>r.old_accepted&&!r.new_accepted).length,old_rejected:positives.filter(r=>!r.old_accepted).map(r=>({id:r.id,reason:r.old_rejection}))};
writeFileSync(`${dir}/candidate-outcomes.json`,JSON.stringify({metrics,rows},null,2));writeFileSync(`${dir}/per-rule-findings.json`,JSON.stringify(per_rule,null,2));console.log(JSON.stringify(metrics,null,2));
