/** Offline scoring: wire / provider-schema / production-shape / authority (UNCHANGED validateProposals), then merge with manual semantic judgements. No provider calls. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {SCHEMAS,schemaViolations,parseReflectionOutput,validateProposals,shapeFaults} from './lib.mjs';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const runs=arg('--runs','saves/d09-reflection-bakeoff/runs/pass1').split(','),outName=arg('--out','saves/d09-reflection-bakeoff/analysis-pass1');
const dir='saves/d09-reflection-bakeoff',read=f=>readFileSync(f,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const corpus=new Map(read(arg('--corpus',`${dir}/corpus.jsonl`)).map(r=>[r.id,r]));
const manual=existsSync(`${dir}/manual-review.json`)?JSON.parse(readFileSync(`${dir}/manual-review.json`,'utf8')):{requests:{},proposals:{}};
export function scoreResult(r){
  const rec=corpus.get(r.request_id),schema=SCHEMAS[r.schema_name];
  const row={request_id:r.request_id,origin:r.origin,arm:r.arm,draw:r.draw,model:r.model,schema_name:r.schema_name,upstream:r.upstream,finish:r.finish,physical_attempts:r.physical_attempts,cost:r.cost??0,latency_ms:r.attempts?.filter(a=>a.ok).at(-1)?.latency?.elapsed_total_ms??null,transport_error:r.error,text:r.text};
  row.http_ok=!r.error;
  const parsed=r.text?parseReflectionOutput(r.text):undefined;
  row.valid_json=parsed!==undefined;
  row.wire_valid=row.http_ok&&row.valid_json;
  let json;try{json=JSON.parse(r.text);}catch{}
  row.schema_arm_violations=json?schemaViolations(schema,json):['unparseable'];
  row.schema_arm_compliant=row.wire_valid&&row.schema_arm_violations.length===0;
  row.schema_strict_violations=json?schemaViolations(SCHEMAS.strict,json):['unparseable'];
  row.strict_compliant=row.wire_valid&&row.schema_strict_violations.length===0;
  row.proposals=parsed?parsed.length:0;row.empty=row.wire_valid&&parsed.length===0;
  if(parsed){
    const res=validateProposals(parsed,rec.catalog,rec.character,new Map(rec.knownNames),new Set(rec.worldWords));
    row.shape_faults=parsed.map(shapeFaults);
    row.shape_valid=res.rejected.every(x=>x.reason!=='invalid_shape');
    row.accepted=res.accepted;row.rejected=res.rejected.map(x=>({reason:x.reason,label:x.proposal?.label,text:x.proposal?.text}));
    row.proposal_outcomes=parsed.map(p=>{const a=res.accepted.find(x=>x.label===p.label&&x.text===p.text?.trim());const rj=res.rejected.find(x=>x.proposal===p);return a?{status:'accepted'}:{status:'rejected',reason:rj?.reason};});
  }else{row.shape_valid=null;row.accepted=[];row.rejected=[];row.proposal_outcomes=[];row.shape_faults=[];}
  return row;
}
const rows=runs.flatMap(d=>read(`${d}/results.jsonl`)).map(scoreResult);
const key=(r,i)=>`${r.request_id}|${r.arm}|${r.draw}|${i}`;
for(const r of rows){
  r.manual=r.proposal_outcomes.map((_,i)=>manual.proposals[key(r,i)]??null);
  if(r.empty){const j=manual.requests[r.request_id];r.manual_empty=j?(j.empty_correct?'EMPTY_CORRECT':'EMPTY_MISSED_OPPORTUNITY'):null;}
}
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?(s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):null;};
export function armMetrics(sub){
  const m={calls:sub.length,physical_attempts:sub.reduce((n,r)=>n+r.physical_attempts,0),wire_valid:sub.filter(r=>r.wire_valid).length,schema_arm_compliant:sub.filter(r=>r.schema_arm_compliant).length,strict_schema_compliant:sub.filter(r=>r.strict_compliant).length,
   shape_valid_responses:sub.filter(r=>r.shape_valid===true).length,shape_invalid_responses:sub.filter(r=>r.shape_valid===false).length,
   empty_responses:sub.filter(r=>r.empty).length,proposals:sub.reduce((n,r)=>n+r.proposals,0),accepted_proposals:sub.reduce((n,r)=>n+r.accepted.length,0),responses_with_accepted:sub.filter(r=>r.accepted.length).length,
   rejected_by_reason:{},cost_usd:+sub.reduce((n,r)=>n+r.cost,0).toFixed(6),latency_mean_ms:null,latency_median_ms:median(sub.map(r=>r.latency_ms).filter(x=>x!=null)),upstreams:{}};
  const lat=sub.map(r=>r.latency_ms).filter(x=>x!=null);m.latency_mean_ms=lat.length?Math.round(lat.reduce((a,b)=>a+b,0)/lat.length):null;
  for(const r of sub){for(const x of r.rejected)m.rejected_by_reason[x.reason]=(m.rejected_by_reason[x.reason]??0)+1;m.upstreams[r.upstream??'none']=(m.upstreams[r.upstream??'none']??0)+1;}
  const sem={USEFUL:0,NEUTRAL:0,REDUNDANT:0,MISLEADING:0,HARMFUL:0};const semAcc={...sem},semRej={...sem};let unrated=0;
  for(const r of sub)r.manual.forEach((mm,i)=>{if(!mm){unrated++;return;}sem[mm.class]++;(r.proposal_outcomes[i].status==='accepted'?semAcc:semRej)[mm.class]++;});
  m.semantic_all=sem;m.semantic_accepted=semAcc;m.semantic_rejected=semRej;m.proposals_unrated=unrated;
  m.correct_empty=sub.filter(r=>r.manual_empty==='EMPTY_CORRECT').length;m.empty_missed_opportunity=sub.filter(r=>r.manual_empty==='EMPTY_MISSED_OPPORTUNITY').length;m.empty_unrated=sub.filter(r=>r.empty&&!r.manual_empty).length;
  return m;
}
const metrics={};
for(const a of [...new Set(rows.map(r=>r.arm))].sort())for(const d of [...new Set(rows.map(r=>r.draw))].sort())for(const o of ['ALL','PLAYED','FIXTURE']){
  const sub=rows.filter(r=>r.arm===a&&r.draw===d&&(o==='ALL'||r.origin===o));if(sub.length)(metrics[`${a}|draw${d}|${o}`]=armMetrics(sub));
}
writeFileSync(`${outName}.rows.json`,JSON.stringify(rows,null,1));writeFileSync(`${outName}.metrics.json`,JSON.stringify(metrics,null,2));
if(process.argv.includes('--sheet')){
  const lines=['# Review sheet (generated)'];
  for(const [id,rec] of corpus){
    const rr=rows.filter(r=>r.request_id===id);if(!rr.length)continue;
    lines.push(`\n## ${id} [${rec.origin}] ${rec.character?.name??rec.request.character.name}`,'Evidence:',...rec.request.evidence.map(e=>`- (${e.ref}|${e.kind}) ${e.text}`));
    for(const r of rr.sort((a,b)=>a.arm<b.arm?-1:1)){
      lines.push(`\n**${r.arm} d${r.draw}** ${r.model} ${r.schema_name} upstream=${r.upstream} wire=${r.wire_valid} proposals=${r.proposals}${r.transport_error?' ERR='+r.transport_error:''}`);
      if(r.empty)lines.push('  (empty)');
      r.proposal_outcomes.forEach((o,i)=>{const p=JSON.parse(r.text).proposals[i];lines.push(`  [${i}] ${o.status}${o.reason?':'+o.reason:''} faults=${r.shape_faults[i].join(',')||'-'} | ${p.kind} ${p.label} (${p.confidence}) refs=${(p.evidence_refs||[]).join(',')}\n      "${p.text}"`);});
    }
  }
  writeFileSync(`${outName}.sheet.md`,lines.join('\n'));
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(metrics).filter(([k])=>k.endsWith('ALL')).map(([k,v])=>[k,{calls:v.calls,wire:v.wire_valid,shape_ok:v.shape_valid_responses,shape_bad:v.shape_invalid_responses,empty:v.empty_responses,props:v.proposals,acc:v.accepted_proposals,cost:v.cost_usd,lat_med:v.latency_median_ms}])),null,1));
