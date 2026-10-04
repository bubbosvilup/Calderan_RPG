/** First candidate outcome reveal: requires frozen semantic review and unchanged candidate/corpus. */
import {readFileSync,writeFileSync} from 'node:fs';
import {sha,validateProposals} from './lib.mjs';
import {evaluateStructuredOutput,legacyComparisonProposal,validateStructuredClaim,V2_SCHEMA,V2_SYSTEM} from '../../../.build/src/dev/reflection-v2.js';
const dir='saves/d09-reflection-v2',read=n=>readFileSync(`${dir}/${n}`,'utf8'),m=JSON.parse(read('oos-manifest.json')),review=JSON.parse(read('blind-semantic-review.json')),records=JSON.parse(read('blind-review-records.json')),outputs=read('oos-outputs.jsonl').trim().split('\n').map(JSON.parse),freeze=m.candidate_freeze;
if(sha(read('oos-manifest.json'))!==read('oos-manifest.sha256').trim()||sha(read('blind-semantic-review.json'))!==read('blind-review.sha256').trim()||sha(readFileSync(freeze.source_file))!==freeze.source_sha||sha(readFileSync('.build/src/dev/reflection-v2.js'))!==freeze.compiled_sha||sha(V2_SCHEMA)!==freeze.schema_sha||sha(V2_SYSTEM)!==freeze.prompt_sha)throw Error('Freeze mismatch');
const classifications=new Map(review.records.map(r=>[r.id,r])),classes=['USEFUL','NEUTRAL','REDUNDANT','MISLEADING','HARMFUL'],counts=()=>Object.fromEntries(classes.map(c=>[c,0]));
const old=counts(),v2=counts(),all=counts(),rows=[],reasons={},split={};
for(const o of outputs){const c=m.cases.find(c=>c.id===o.id);if(c.request_sha!==o.request_sha)throw Error('Request mismatch');
 const rs=records.filter(r=>r.request_id===o.id),names=new Map(c.knownNames);
 const bridges=rs.map(r=>legacyComparisonProposal(r.proposal,c.evidence_catalog,names)??null);
 // Production old validator receives the whole bridged proposal batch, including its duplicate policy.
 const oldResult=o.parsed!==null?validateProposals(bridges.filter(Boolean),c.legacy_catalog,c.character,names,new Set(c.worldWords)):null;
 const candidate=o.parsed!==null?evaluateStructuredOutput(o.parsed,c.evidence_catalog,c.character.id,names):null;
 for(const [i,r]of rs.entries()){
  const review=classifications.get(r.id);if(!review||sha(r.proposal)!==review.proposal_sha)throw Error('Review changed');
  const bridge=bridges[i],oldAccepted=!!bridge&&!!oldResult?.accepted.some(p=>sha(p)===sha(bridge));
  const d=candidate?.diagnostics[i]??validateStructuredClaim(r.proposal,c.evidence_catalog,c.character.id);
  const newAccepted=o.parsed!==null&&d.accepted;
  all[review.classification]++;if(oldAccepted)old[review.classification]++;if(newAccepted)v2[review.classification]++;
  for(const reason of d.reasons)reasons[reason]=(reasons[reason]??0)+1;
  split[c.source_type]??={old:counts(),v2:counts()};if(oldAccepted)split[c.source_type].old[review.classification]++;if(newAccepted)split[c.source_type].v2[review.classification]++;
  rows.push({id:r.id,...review,proposal:r.proposal,old_bridge:bridge,old_accepted:oldAccepted,new_accepted:newAccepted,old_reason:o.parsed===null?'malformed_envelope':bridge?oldResult?.rejected.find(p=>sha(p.proposal)===sha(bridge))?.reason??null:'comparison_shape_unavailable',diagnostic:d,envelope_valid:o.parsed!==null});
 }
}
const isBad=r=>['MISLEADING','HARMFUL'].includes(r.classification),badOld=rows.filter(r=>r.old_accepted&&isBad(r)),caught=badOld.filter(r=>!r.new_accepted),lost=rows.filter(r=>r.old_accepted&&r.classification==='USEFUL'&&!r.new_accepted),neutralLost=rows.filter(r=>r.old_accepted&&r.classification==='NEUTRAL'&&!r.new_accepted);
const factual=rows.filter(r=>r.factual_error),factualAdmitted=factual.filter(r=>r.new_accepted),validFactual=factual.filter(r=>r.envelope_valid);
const metrics={total_requests:48,physical_calls:outputs.flatMap(o=>o.attempts).length,retries:outputs.reduce((n,o)=>n+o.attempts.length-1,0),cost_usd:outputs.flatMap(o=>o.attempts).reduce((n,a)=>n+(a.cost_usd??0),0),unknown_costs:outputs.flatMap(o=>o.attempts).filter(a=>a.cost_usd===null).length,native_old_accepted:outputs.reduce((n,o)=>n+(o.native_old?.accepted.length??0),0),valid_envelopes:outputs.filter(o=>o.parsed!==null).length,malformed_envelopes:outputs.filter(o=>o.text!==null&&o.parsed===null).length,provider_failed:outputs.filter(o=>o.text===null).length,empty_envelopes:outputs.filter(o=>o.parsed?.length===0).length,reviewed_proposals:rows.length,valid_envelope_proposals:rows.filter(r=>r.envelope_valid).length,all_classes:all,old_bridge_accepted:old,v2_accepted:v2,useful_lost:lost.length,bad_old:badOld.length,bad_caught:caught.length,bad_escaped:badOld.length-caught.length,bad_catch_rate:badOld.length?caught.length/badOld.length:null,neutral_rejected:neutralLost.length,redundant_rejected:rows.filter(r=>r.old_accepted&&r.classification==='REDUNDANT'&&!r.new_accepted).length,newly_recovered_useful:rows.filter(r=>!r.old_accepted&&r.new_accepted&&r.classification==='USEFUL').length,wrong_factual_admitted:factualAdmitted.length,wrong_factual_rejected:factual.length-factualAdmitted.length,valid_envelope_wrong_factual:validFactual.length,valid_envelope_wrong_factual_rejected:validFactual.filter(r=>!r.new_accepted).length,reasons,split,gate:lost.length===0&&badOld.length>0&&caught.length/badOld.length>=0.7&&factualAdmitted.length===0&&neutralLost.length===0?'PASS':'FAIL'};
writeFileSync(`${dir}/candidate-oos-outcomes.json`,JSON.stringify({metrics,rows},null,2));
writeFileSync(`${dir}/oos-collateral.json`,JSON.stringify({useful_lost:lost,neutral_lost:neutralLost,wrong_factual_admitted:factualAdmitted,bad_caught:caught},null,2));console.log(JSON.stringify(metrics,null,2));
