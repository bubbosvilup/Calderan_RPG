/** Serialize primary-agent source review BEFORE semantic outcome computation. No scorer imports. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {sha} from './lib.mjs';
const dir='saves/d09-reflection-targeted-exposure';
if(existsSync(`${dir}/blind-review.json`))throw Error('Review already frozen');
const m=JSON.parse(readFileSync(`${dir}/manifest.json`)),r=JSON.parse(readFileSync(`${dir}/responses.json`));
// Explicit decisions made after inspecting every proposal and the captured authoritative sources.
const misleading=new Set(['TARGET_CORROBORATING_1:1','TARGET_CORROBORATING_2:1','TARGET_CORROBORATING_3:1','TARGET_CORROBORATING_4:0','TARGET_CONTRADICTORY_1:1','TARGET_CONTRADICTORY_2:1','TARGET_CONTRADICTORY_3:1']);
const reviews=[];
for(const o of r[0].outputs){const a=o.attempts.at(-1);if(!a.usable)continue;const c=m.cases.find(c=>c.id===o.id);
 for(const[pindex,p]of a.structural.value.proposals.entries()){
 const id=`${o.id}:${pindex}`,bad=misleading.has(id),cl=p.claim;
 let reason;
 if(bad)reason=cl.dimension_a===cl.dimension_b?'The same relationship dimension is presented as a contrast; it adds no independent dimension. In CORROBORATING_4 it also asserts simultaneous none/high trust although current trust is high.':'The contrast invents an affection-none state from an absent dimension. Absence is not authoritative negative evidence.';
 else if(cl.type==='self_statement_synthesis')reason='Both exact attributed statements describe complementary concrete reporting/storage practices. The pair adds grounded meaning beyond either statement and the cited direct/event provenance belongs to the subject.';
 else if(cl.type==='relationship_contrast')reason='Owned trust and wariness histories establish moderate trust alongside high wariness; the unique later hidden directional snapshot independently verifies both simultaneous states.';
 else reason='The owned chronological changes establish the exact endpoints, direction and number of transitions. These multi-event changes are useful relational context; other-dimension refs in HISTORICAL_CONTRAST_3 are compatible context, not corroboration.';
 reviews.push({id,request_id:o.id,proposal_index:pindex,proposal_sha:sha(p),classification:bad?'MISLEADING':'USEFUL',should_reach_narrator:!bad,factual_error:bad&&(cl.dimension_a!==cl.dimension_b||id==='TARGET_CORROBORATING_4:0'),unsupported_interpretation:bad,stale_state_error:false,performed_role_leak:false,reason,proposal:p,cited_sources:c.catalog.filter(e=>p.evidence_refs.includes(e.ref)),authoritative_sources:c.catalog.filter(e=>e.evidence_type==='relationship_snapshot'||e.evidence_type==='self_statement')});
 }}
const review={reviewer:'Primary Codex agent; explicitly not human',candidate_semantic_outcomes_seen:false,review_completed_at:new Date().toISOString(),manifest_sha:sha(readFileSync(`${dir}/manifest.json`)),responses_sha:sha(readFileSync(`${dir}/responses.json`)),valid_empty_requests:r[0].outputs.filter(o=>o.attempts.at(-1).valid_empty).map(o=>o.id),reviews};
const bytes=JSON.stringify(review,null,2)+'\n';writeFileSync(`${dir}/blind-review.json`,bytes);writeFileSync(`${dir}/blind-review.sha256`,sha(bytes)+'\n');console.log(JSON.stringify({proposals:reviews.length,review_sha:sha(bytes),counts:reviews.reduce((a,r)=>(a[r.classification]=(a[r.classification]??0)+1,a),{})}));
