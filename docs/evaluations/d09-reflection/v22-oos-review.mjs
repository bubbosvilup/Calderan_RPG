/** Agent blind semantic review. No candidate validation is invoked here. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='saves/d09-reflection-v22-oos',sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
if(existsSync(`${dir}/blind-semantic-review.json`)||existsSync(`${dir}/candidate-oos-outcomes.json`))throw Error('Review cannot be overwritten after freeze/scoring');
const records=JSON.parse(readFileSync(`${dir}/blind-review-records.json`)),labels=new Map();
function group(indices,classification,reason,factual=false,unsupported=false){for(const i of indices){if(labels.has(i))throw Error('Duplicate review index');labels.set(i,{classification,reason,factual_error:factual,unsupported_interpretation:unsupported});}}
group([7,16],'NEUTRAL','Equal trust and respect levels are accurate, but their juxtaposition adds little useful distinction.');
group([24,25,27,83],'NEUTRAL','Accurate literal membership chronology; no additional character-bearing interpretation.');
group([1,4,10,21,26,28,30,32,33,35,37,38,39,40,41,44,47,64,71,73,84,86,87,89,90,91,93],'REDUNDANT','Single fact/event restatement or rules-only accumulation with no useful synthesis beyond the stored authority.');
group([46,50,55,60,61],'MISLEADING','Juxtaposing an absent/none dimension with a positive dimension presents unsupported psychological contrast.',false,true);
group([48],'MISLEADING','Eight selected respect transitions end at none at r26, not the claimed low. Later r28 cannot repair the claimed selected endpoint.',true);
group([59],'MISLEADING','The fifth selected trust transition r28 ends at low, not the claimed moderate.',true);
group([70],'MISLEADING','Four-transition wariness claim omits r22 and r28 within its selected r10–r34 interval; actual full sequence has six transitions.',true);
group([77],'MISLEADING','Six claimed condition operations disagree with seven selected events and omit in-scope r24.1; episode sequence is not supported.',true);
for(let i=0;i<records.length;i++)if(!labels.has(i))group([i],'USEFUL','Grounded multi-event trajectory/path, meaningful positive-dimension comparison, or explicitly attributed linked/repeated commitments. Historical sequences remain historical; quotes do not establish performed roles.');
// Independently identify supporting subsets and compatible extras, before candidate roles/outcomes exist.
const cohorts={0:{kind:'CORROBORATING',core:[0,1]},2:{kind:'CONTEXT',core:[0]},3:{kind:'CONTEXT',core:[0,1]},62:{kind:'CONTEXT',core:[0,1]},63:{kind:'CONTEXT',core:[1,4]}};
const rows=records.map((r,i)=>{const label=labels.get(i),cohort=cohorts[i];return {id:r.id,index:i,proposal_sha:sha(r.proposal),...label,should_reach_narrator:label.classification==='USEFUL'?'YES':'NO',independent_extra_cohort:cohort?{kind:cohort.kind,core_refs:cohort.core.map(j=>r.proposal.evidence_refs[j]),extra_refs:r.proposal.evidence_refs.filter((_,j)=>!cohort.core.includes(j))}:null};});
if(rows.length!==100||labels.size!==100)throw Error('Expected complete 100-object blind review');
const review={reviewer:'Codex primary agent; not a human or independent second reviewer',candidate_outcomes_seen:false,reviewed_at:new Date().toISOString(),manifest_sha:sha(readFileSync(`${dir}/oos-manifest.json`,'utf8')),rows};
const bytes=JSON.stringify(review,null,2);writeFileSync(`${dir}/blind-semantic-review.json`,bytes);writeFileSync(`${dir}/blind-semantic-review.sha256`,sha(bytes)+'\n');
console.log(JSON.stringify({sha:sha(bytes),classes:Object.fromEntries(['USEFUL','NEUTRAL','REDUNDANT','MISLEADING','HARMFUL'].map(c=>[c,rows.filter(r=>r.classification===c).length]))}));
