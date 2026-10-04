/** Primary-agent semantic review, frozen before candidate decisions. No validator imports. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {sha} from './lib.mjs';
const dir='saves/d09-reflection-v21';
if(existsSync(`${dir}/candidate-oos-outcomes.json`)||existsSync(`${dir}/blind-semantic-review.json`))throw Error('Review must precede reveal and remain immutable');
const records=JSON.parse(readFileSync(`${dir}/blind-review-records.json`,'utf8')),decisions=new Map();
function group(indices,classification,reason,factual_error=false){for(const i of indices){if(decisions.has(i))throw Error('Duplicate judgment');decisions.set(i,{classification,reason,factual_error,should_reach_narrator:classification==='USEFUL'?'YES':'NO'});}}
// These are individually inspected output objects, grouped for readable recording; not predictions from input families.
group([0,5,9,58,61,63],'USEFUL','Correct ordered independent condition episodes, exact operations/additions, no cause or healing inference.');
group([3,10,11,13,16,18,19,20,30,31,55,66,67,69,70,72,73,75,76,80,81,98],'USEFUL','Accurate owned multi-transition relationship trajectory and scoped endpoints; no temperament or motive added. Compatible extra facts do not make it false.');
group([12,14,17,21,32,56,68,71,74,77,82],'USEFUL','Two genuine recorded dimensions toward the same target, with exact levels and direction; useful coexistence/contrast without unsupported psychology.');
group([22,25,78],'USEFUL','Independent explicit meal-recordkeeping/reporting statements are correctly attributed, without claiming observed performance.');
group([83,86],'USEFUL','Nested statement_refs resolve to actual independent quoted contracts. Root evidence_refs instead cite their matching contract-established events. Citation bookkeeping is inconsistent, but the selected attributed meal/report or meal/tool-recording commitments are true and useful; mechanical invalidity alone is not semantic falsehood.');
group([36,43,46,84,95,97],'USEFUL','Correct literal movement/return pattern across independent owned transitions; no psychological explanation.');
group([28],'NEUTRAL','Reserved self-description and meal-count reporting are both accurately attributed but have no demonstrated confirming link.');
group([33,34,38,88,90,92],'NEUTRAL','Accurate join/leave/rejoin chronology and counts, harmless but little additional narrative meaning.');
group([79],'NEUTRAL','Accurate two-step movement with no return/recurrence or relationship-bearing place meaning.');
group([4],'MISLEADING','Parallel claim compares trust with itself rather than two independent dimensions; creates an apparent parallel pattern without independent evidence.');
group([89],'MISLEADING','Membership operation names and rule-event name are asserted as movement locations; no movement evidence supports this path.',true);
group([100],'MISLEADING','Three cited respect changes none-low-moderate-high are described as two transitions.',true);
group([102],'MISLEADING','Claimed path/count omits the in-scope hall-to-attic movement at revision 32; cited revision 34 ends in hall, whereas the claimed final location is attic.',true);
group([1,2,6,7,8,15,23,24,26,27,29,35,37,39,40,41,42,44,45,47,48,49,50,51,52,53,54,57,59,60,62,64,65,85,87,91,93,94,96,99,101,103,104,105,106,107],'REDUNDANT','Literal single-state/event restatement or rules-only household accumulation already stored authoritatively; extra context does not create useful character synthesis.');
if(records.length!==108||decisions.size!==records.length||records.some((_,i)=>!decisions.has(i)))throw Error('Incomplete review');
const review={reviewer:'Primary Codex agent, NOT human and NOT independent; definitions known, computed candidate outcomes hidden.',candidate_outcomes_seen:false,created_at:new Date().toISOString(),records:records.map((r,i)=>({id:r.id,proposal_sha:sha(r.proposal),envelope_valid:r.envelope_valid,...decisions.get(i)}))};
const bytes=JSON.stringify(review,null,2)+'\n';writeFileSync(`${dir}/blind-semantic-review.json`,bytes);writeFileSync(`${dir}/blind-review.sha256`,sha(bytes)+'\n');console.log(JSON.stringify({reviewed:records.length,sha:sha(bytes)}));
