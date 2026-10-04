/**
 * D-09 semantic validator calibration harness (offline, no provider calls, production unchanged).
 *
 * Modes:
 *   --full <dir> --rows a.rows.json[,b.rows.json]   the frozen bake-off corpus (corpus.jsonl + analysis rows + manual-review.json). Preferred.
 *   --packet <V3 packet .md>                        fallback: the 20 accepted proposals published in D09_REFLECTION_HUMAN_REVIEW_V3.md.
 *   --selftest                                      rule unit checks (2 rejects + 2 valid controls per family).
 * Output: saves/d09-semantic-validator/<mode>/ manifest.json (+sha256), decisions.json, diff.md, metrics.json.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {semanticFindings,ownership} from './semantic-rules.mjs';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const CLASSES=['USEFUL','NEUTRAL','REDUNDANT','MISLEADING','HARMFUL'];
const RULES=['reflection_restates_authority','passive_membership_not_character_evidence','tension_from_missing_provenance','unsupported_character_inference'];

/** Parse the blinded V3 packet (items + answer key). The packet only contains proposals the unchanged validator ACCEPTED. */
function loadPacket(file){
  const md=readFileSync(file,'utf8');const [body,key]=md.split('## Answer key');
  const labels=new Map([...key.matchAll(/^\| (\d+) \| ([^|]+) \| (\w) \| ([^|]+) \| (\w+) \|$/gm)].map(m=>[Number(m[1]),{request_id:m[2].trim(),arm:m[3],model_schema:m[4].trim(),label:m[5]}]));
  return body.split(/^## Item /m).slice(1).map(chunk=>{
    const n=Number(chunk.match(/^(\d+)/)[1]),k=labels.get(n);
    const catalog=[...chunk.matchAll(/^- `([^`]+)` \((\w+)\): (.*)$/gm)].map(m=>({ref:m[1],kind:m[2],text:m[3]}));
    const pm=chunk.match(/Proposed note: \*\*(\w+)\*\* \/ label `([^`]+)` \/ confidence (\w+)\n> (.*)\n\nCited refs: (.*)/);
    const p={kind:pm[1],label:pm[2],confidence:pm[3],text:pm[4],evidence_refs:pm[5].split(', ').map(s=>s.trim())};
    return {id:`V3#${n}`,request_id:k.request_id,arm:k.arm,model_schema:k.model_schema,character:{name:chunk.match(/^Character: (.*)$/m)[1]},catalog,proposal:p,validator:'accepted',validator_reason:null,label:k.label};
  });
}
/** The full frozen corpus, exactly as analyze.mjs scored it (rows carry the raw text, unchanged-validator outcome and manual label). */
function loadFull(dir,rowsFiles){
  const corpus=new Map(readFileSync(`${dir}/corpus.jsonl`,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).map(r=>[r.id,r]));
  const manual=JSON.parse(readFileSync(`${dir}/manual-review.json`,'utf8')).proposals;
  const out=[];
  for(const f of rowsFiles)for(const r of JSON.parse(readFileSync(f,'utf8'))){
    if(!r.proposals)continue;const rec=corpus.get(r.request_id),ps=JSON.parse(r.text).proposals;
    ps.forEach((p,i)=>{const id=`${r.request_id}|${r.arm}|${r.draw}|${i}`,o=r.proposal_outcomes[i];
      out.push({id,request_id:r.request_id,arm:r.arm,model_schema:`${r.model} / ${r.schema_name}`,character:rec.character??rec.request.character,catalog:(rec.catalog??rec.request.evidence).map(e=>({ref:e.ref,kind:e.kind,text:e.text})),proposal:p,validator:o.status,validator_reason:o.reason??null,label:manual[id]?.class??'UNRATED'});});
  }
  return out;
}

function evaluate(items,{enabled=RULES}={}){
  return items.map(it=>{
    const findings=it.validator==='accepted'?semanticFindings(it.proposal,it.catalog,it.character).filter(r=>enabled.includes(r)):[];
    return {...it,findings,candidate:it.validator!=='accepted'?'rejected':findings.length?'rejected':'accepted',candidate_reason:it.validator!=='accepted'?it.validator_reason:findings[0]??null};
  });
}
function metrics(dec){
  const count=f=>Object.fromEntries(CLASSES.map(c=>[c,dec.filter(d=>d.label===c&&f(d)).length]));
  const acc=dec.filter(d=>d.validator==='accepted'),bad=d=>d.label==='MISLEADING'||d.label==='HARMFUL',newRej=d=>d.validator==='accepted'&&d.candidate==='rejected';
  const m={total:dec.length,all:count(()=>true),accepted_old:count(d=>d.validator==='accepted'),rejected_old:count(d=>d.validator!=='accepted'),accepted_new:count(d=>d.candidate==='accepted'),
    accepted_bad_rate_old:+(acc.filter(bad).length/Math.max(1,acc.length)).toFixed(3),
    TP_BAD_REJECT:dec.filter(d=>newRej(d)&&bad(d)).length,FN_BAD_ESCAPE:dec.filter(d=>d.candidate==='accepted'&&bad(d)).length,
    FP_USEFUL_REJECT:dec.filter(d=>newRej(d)&&d.label==='USEFUL').length,FP_NEUTRAL_REJECT:dec.filter(d=>newRej(d)&&d.label==='NEUTRAL').length,REDUNDANT_REJECT:dec.filter(d=>newRej(d)&&d.label==='REDUNDANT').length,per_rule:{}};
  const accNew=dec.filter(d=>d.candidate==='accepted');m.accepted_bad_rate_new=+(accNew.filter(bad).length/Math.max(1,accNew.length)).toFixed(3);
  for(const r of RULES){const fired=dec.filter(d=>d.findings.includes(r)),primary=dec.filter(d=>d.candidate_reason===r&&newRej(d));
    m.per_rule[r]={fired_any:fired.length,fired_on_bad:fired.filter(bad).length,fired_on_useful:fired.filter(d=>d.label==='USEFUL').length,fired_on_neutral:fired.filter(d=>d.label==='NEUTRAL').length,fired_on_redundant:fired.filter(d=>d.label==='REDUNDANT').length,
      unique_bad_catch:fired.filter(d=>bad(d)&&d.findings.length===1).length,primary_reason:primary.length,request_groups:[...new Set(fired.map(d=>d.request_id))].length};}
  return m;
}
/** Leave-one-request-group-out: a rule counts for held-out group G only if it ALSO catches a bad accepted note in some other group. */
function logo(dec){
  const groups=[...new Set(dec.map(d=>d.request_id))],bad=d=>d.label==='MISLEADING'||d.label==='HARMFUL';
  return groups.map(g=>{
    const support=RULES.filter(r=>dec.some(d=>d.request_id!==g&&d.validator==='accepted'&&bad(d)&&d.findings.includes(r)));
    const held=dec.filter(d=>d.request_id===g&&d.validator==='accepted');
    const caught=held.filter(d=>d.findings.some(r=>support.includes(r)));
    return {group:g,accepted:held.length,bad:held.filter(bad).length,bad_caught_with_rules_supported_elsewhere:caught.filter(bad).length,bad_caught_all_rules:held.filter(d=>bad(d)&&d.findings.length).length,
      useful_rejected:caught.filter(d=>d.label==='USEFUL').length,neutral_rejected:caught.filter(d=>d.label==='NEUTRAL').length,rules_without_outside_support:RULES.filter(r=>!support.includes(r)&&held.some(d=>d.findings.includes(r)))};
  });
}

function selftest(){
  const c=[{ref:'canon',kind:'canon',text:'A young woman staying in the tower.'},{ref:'join',kind:'development',text:'Maren became a member of a household Nicco keeps (revision 2, world minute 100).'},
    ...[3,4,5].map(r=>({ref:`rule${r}`,kind:'development',text:`A household rule was added to a household Maren belongs to (revision ${r}, world minute 100). Who proposed it is not recorded; it is not Maren's act.`})),
    {ref:'mv1',kind:'development',text:'Maren moved from test_room to test_hall (revision 6, world minute 100).'},{ref:'mv2',kind:'development',text:'Maren moved from test_hall to test_room (revision 7, world minute 101).'},
    {ref:'t1',kind:'development',text:"Maren's trust toward Brenna moved none → low (revision 8, world minute 100). A recorded state change; what caused it is not recorded."},
    {ref:'t2',kind:'development',text:"Maren's trust toward Brenna moved low → moderate (revision 9, world minute 100). A recorded state change; what caused it is not recorded."},
    {ref:'a1',kind:'development',text:"Maren's affection toward Brenna moved moderate → low (revision 10, world minute 100). A recorded state change; what caused it is not recorded."},
    {ref:'rel',kind:'relationship',text:"Current recorded feelings of Maren toward Brenna: trust moderate, affection low. These are Maren's feelings only."},
    {ref:'k',kind:'contract',text:'{"field":"temperament","revision":11,"quote":"I hesitate before I commit."}'},
    {ref:'c1',kind:'development',text:'The condition "minor_injury" was recorded for Maren (revision 12, world minute 100); its cause is not recorded.'},
    {ref:'c2',kind:'development',text:'The condition "minor_injury" was recorded for Maren (revision 14, world minute 110); its cause is not recorded.'}];
  const ch={id:'maren',name:'Maren'},P=(kind,label,text,refs)=>({kind,label,text,evidence_refs:refs,confidence:'medium'});
  const cases=[
    ['reflection_restates_authority',true,P('emerging_role','household_member','Maren remained a member of the household through several revisions.',['join','mv1','mv2'])],
    ['reflection_restates_authority',true,P('emerging_role','tower_resident','Maren keeps staying in the tower household as it changes.',['join','mv1'])],
    ['reflection_restates_authority',false,P('emerging_role','household_quartermaster','Maren has begun taking responsibility for the stores across several recorded episodes.',['join','mv1','mv2'])],
    ['reflection_restates_authority',false,P('signature_pattern','hall_room_shuttle','Maren has moved between the hall and the room several times.',['mv1','mv2'])],
    ['passive_membership_not_character_evidence',true,P('signature_pattern','house_rule_changes','Maren\'s household accumulated rules while she remained a member.',['rule3','rule4','rule5'])],
    ['passive_membership_not_character_evidence',true,P('emerging_role','rule_witness','Rules were added in the household Maren belongs to across revisions.',['join','rule3','rule4'])],
    ['passive_membership_not_character_evidence',false,P('signature_pattern','hall_room_shuttle','Maren has moved between the hall and the room several times.',['mv1','mv2','rule3'])],
    ['passive_membership_not_character_evidence',false,P('shared_motif','rule_additions','Rules keep being added to the household Maren belongs to.',['rule3','rule4','rule5'])],
    ['tension_from_missing_provenance',true,P('unresolved_tension','rule_additions_alone','Two rules were added to Maren\'s household, but her own role in them is not recorded.',['rule3','rule4'])],
    ['tension_from_missing_provenance',true,P('unresolved_tension','trust_ambiguity','Maren\'s trust toward Brenna is low, yet the cause of the change is not documented.',['t1','rel'])],
    ['tension_from_missing_provenance',false,P('unresolved_tension','trust_vs_affection','Maren\'s trust toward Brenna rose to moderate while her affection fell to low.',['t2','a1'])],
    ['tension_from_missing_provenance',false,P('unresolved_tension','illness_injury_cycle','Maren is described as staying in the tower while minor injury conditions are recorded twice.',['canon','c1','c2'])],
    ['unsupported_character_inference',true,P('signature_pattern','rapid_trust_recalibration','Maren\'s trust toward Brenna changed twice quickly, a reactive adjustment rather than stability.',['t1','t2'])],
    ['unsupported_character_inference',true,P('signature_pattern','restless_mover','Maren is restless, moving between rooms within a minute.',['mv1','mv2'])],
    ['unsupported_character_inference',false,P('signature_pattern','trust_two_steps','Maren\'s trust toward Brenna rose in two recorded steps, from none to moderate.',['t1','t2'])],
    ['unsupported_character_inference',false,P('stance','hesitant_commitment','Maren says she hesitates before she commits, and her trust toward Brenna rose in two steps.',['k','t1','t2'])],
  ];
  const res=cases.map(([rule,expect,p])=>{const f=semanticFindings(p,c,ch);return {rule,expect_reject:expect,label:p.label,findings:f,pass:expect?f.includes(rule):f.length===0};});
  return {pass:res.every(r=>r.pass),cases:res};
}

const outRoot='saves/d09-semantic-validator';
if(process.argv.includes('--selftest')){const r=selftest();mkdirSync(outRoot,{recursive:true});writeFileSync(`${outRoot}/rules-selftest.json`,JSON.stringify(r,null,1));console.log('selftest',r.pass?'PASS':'FAIL',r.cases.filter(c=>!c.pass).map(c=>c.label));process.exit(r.pass?0:1);}
const mode=arg('--full')?'full':'packet';
const items=mode==='full'?loadFull(arg('--full'),arg('--rows').split(',')):loadPacket(arg('--packet','docs/evaluations/D09_REFLECTION_HUMAN_REVIEW_V3.md'));
const out=`${outRoot}/${mode}`;mkdirSync(out,{recursive:true});
const manifest={mode,frozen_at:new Date().toISOString(),source:mode==='full'?{dir:arg('--full'),rows:arg('--rows')}:{packet:arg('--packet','docs/evaluations/D09_REFLECTION_HUMAN_REVIEW_V3.md'),packet_sha256:sha(readFileSync(arg('--packet','docs/evaluations/D09_REFLECTION_HUMAN_REVIEW_V3.md'),'utf8'))},
  proposals:items.map(it=>({id:it.id,request_id:it.request_id,arm:it.arm,model_schema:it.model_schema,kind:it.proposal.kind,label_slug:it.proposal.label,text:it.proposal.text,refs:it.proposal.evidence_refs,validator:it.validator,validator_reason:it.validator_reason,semantic_label:it.label,catalog_sha256:sha(it.catalog)}))};
manifest.manifest_sha256=sha(manifest.proposals);
const mf=`${out}/manifest.json`;
if(existsSync(mf)&&JSON.parse(readFileSync(mf,'utf8')).manifest_sha256!==manifest.manifest_sha256)throw new Error('frozen manifest differs from current input; refusing to overwrite');
if(!existsSync(mf))writeFileSync(mf,JSON.stringify(manifest,null,1));
const dec=evaluate(items),m=metrics(dec),groups=logo(dec);
const ablation=Object.fromEntries(RULES.map(r=>{const d=evaluate(items,{enabled:RULES.filter(x=>x!==r)});const mm=metrics(d);return [`without_${r}`,{TP_BAD_REJECT:mm.TP_BAD_REJECT,FP_USEFUL_REJECT:mm.FP_USEFUL_REJECT,FP_NEUTRAL_REJECT:mm.FP_NEUTRAL_REJECT,REDUNDANT_REJECT:mm.REDUNDANT_REJECT}];}));
writeFileSync(`${out}/decisions.json`,JSON.stringify(dec.map(d=>({id:d.id,request_id:d.request_id,arm:d.arm,kind:d.proposal.kind,label_slug:d.proposal.label,text:d.proposal.text,refs:d.proposal.evidence_refs,
  cited_ownership:d.proposal.evidence_refs.map(r=>ownership(d.catalog.find(e=>e.ref===r)??{},d.character.name)),semantic_label:d.label,old:d.validator,old_reason:d.validator_reason,new:d.candidate,new_reason:d.candidate_reason,all_findings:d.findings})),null,1));
writeFileSync(`${out}/metrics.json`,JSON.stringify({manifest_sha256:manifest.manifest_sha256,metrics:m,leave_one_group_out:groups,ablation},null,1));
writeFileSync(`${out}/diff.md`,['| id | request | kind | label | semantic | old | new | reason codes |','|---|---|---|---|---|---|---|---|',
  ...dec.map(d=>`| ${d.id} | ${d.request_id} | ${d.proposal.kind} | ${d.proposal.label} | ${d.label} | ${d.validator}${d.validator_reason?':'+d.validator_reason:''} | ${d.candidate} | ${d.findings.join(', ')||'-'} |`)].join('\n')+'\n');
console.log(JSON.stringify({mode,manifest_sha256:manifest.manifest_sha256,...m,leave_one_group_out:groups,ablation},null,1));
