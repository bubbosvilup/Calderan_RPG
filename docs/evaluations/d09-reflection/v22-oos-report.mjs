/** Post-score accounting/report only. Frozen review, corpus and outcomes are preserved. */
import {readFileSync,writeFileSync} from 'node:fs';
import {sha} from './lib.mjs';
import {validateStructuredClaim} from '../../../.build/src/dev/reflection-v2.js';
const dir='saves/d09-reflection-v22-oos',read=n=>readFileSync(`${dir}/${n}`,'utf8'),m=JSON.parse(read('oos-manifest.json')),x=JSON.parse(read('candidate-oos-outcomes.json')),v=x.metrics;
// Correct a review subset-index bookkeeping mistake without rewriting the hashed blind review.
const extras={};for(const kind of ['CORROBORATING','CONTEXT','CONTRADICTORY']){const rr=x.rows.filter(r=>{if(r.classification!=='USEFUL')return false;const c=m.cases.find(c=>c.id===r.request_id),core=r.diagnostic.evidence_roles.filter(e=>e.role==='SUPPORTING').map(e=>e.ref);return r.diagnostic.evidence_roles.some(e=>e.role===kind)&&core.length>0&&validateStructuredClaim({...r.proposal,evidence_refs:core},c.evidence_catalog,c.character.id).accepted;});extras[kind]={eligible:rr.length,accepted:rr.filter(r=>r.new_accepted).length,rejected:rr.filter(r=>!r.new_accepted).length,ids:rr.map(r=>r.id),exposure:rr.length>=2?'SUFFICIENT':'INSUFFICIENT'};}
const accepted=x.rows.filter(r=>r.new_accepted),stale=accepted.filter(r=>{if(r.proposal.claim.type!=='relationship_contrast')return false;const c=m.cases.find(c=>c.id===r.request_id),cl=r.proposal.claim,s=c.evidence_catalog.filter(e=>e.evidence_type==='relationship_snapshot'&&e.payload.target_character_id===cl.target_character_id).sort((a,b)=>b.revision-a.revision)[0];return !s||(s.payload.dimensions[cl.dimension_a]??'none')!==cl.state_a||(s.payload.dimensions[cl.dimension_b]??'none')!==cl.state_b;});
const audit={extra_definition:'USEFUL valid-envelope claims with an unchanged V2-valid required supporting subset; candidate role partition audited after blind review. All otherwise-invalid cores excluded.',extras,subset_index_correction:'Blind row 2 incorrectly nominated evidence_refs[0] as the contrast core; the actual snapshot is evidence_refs[3]. Frozen review/outcomes remain unchanged. Post-score exact-core audit counts this additional compatible-context claim. Semantic classes and gate unchanged.',stale_current_state_violations:stale.length,performed_role_leakage:0,self_renderings:accepted.filter(r=>r.proposal.claim.type==='self_statement_synthesis').map(r=>({id:r.id,text:r.rendered})),review_sha:x.review_sha,manifest_sha:x.manifest_sha};
writeFileSync(`${dir}/cohort-analysis.json`,JSON.stringify(audit,null,2));
const table=Object.entries(v.classes).map(([c,n])=>`| ${c} | ${n.reviewed} | ${n.old_accepted} | ${n.accepted} |`).join('\n');
const extraTable=Object.entries(extras).map(([c,n])=>`| ${c} | ${n.eligible} | ${n.accepted} | ${n.rejected} | ${n.exposure} |`).join('\n');
const opportunityTable=Object.entries(m.opportunity_counts).map(([k,n])=>`| ${k} | ${n} |`).join('\n');
const report=`# D-09 reflection V2.2 independent OOS

**SEMANTIC HARD GATE: FAIL. RELIABILITY GATE: FAIL (concerning). PRODUCTION CANDIDATE: NO.** One bridge-accepted useful proposal was lost. Final logical usability was 47/64 (73.4375%), below the 98% target. Production semantics and publication ordering are unchanged; no V2.3, prompt/schema patch or further provider dispatch was performed. D-09 remains SOAK PENDING; D-26 remains OPEN — SHADOW DATA COLLECTION.

## Rule freeze and preregistration

- Source: \`${m.candidate_freeze.source_sha}\`.
- Schema: \`${m.candidate_freeze.schema_sha}\`.
- Prompt: \`${m.candidate_freeze.prompt_sha}\`.
- Evidence structure 2; provenance model 1. All required hashes matched before dispatch and after scoring. Frozen dependency, transport/reliability and dispatch-harness hashes are embedded in the manifest.
- Manifest: \`${x.manifest_sha}\`.
- Blind review: \`${x.review_sha}\`, frozen before the first candidate outcome computation. Primary Codex agent review; **not human review and not a second independent reviewer**. Known validator design, hidden computed acceptance. All 100 proposal objects from final valid envelopes reviewed with U/N/R/M/H, narrator, factual-error and unsupported-interpretation fields.
- APIKEY.env and raw directory ignored; no tracked credential. Initial tree clean. Secrets were privately compared against tracked contents without printing key values.

## Corpus

64 distinct logical request bodies: 32 fixtures and 32 scripted current-engine checkpoints, **0 organic**. Eight requests per family: relationship trajectory, parallel, contrast, condition trajectory, membership trajectory, movement trajectory, self-statement synthesis and environmental motif. Engine checkpoints are four successive states from one scripted campaign per family, so requests are distinct but not statistically independent gameplay episodes. Snapshots, catalogs, full command traces, revision hashes, source types and request hashes were frozen before dispatch. Body hashes did not match the previous scored corpus hashes; V2.2 development used the V2.1 bodies included in that exclusion.

Preregistered positive-control opportunity flags: trajectory 8, parallel 8, contrast 7, condition 8, membership 8, movement 8, self-statements 8, environment 7. **These flags are not evidence of realized usefulness.** In particular membership counts received NEUTRAL reviews; rules-only environmental accumulation received REDUNDANT reviews. Thus the intended useful membership/environment controls were not convincingly established. The environmental collector exposes rule event identity rather than full themed rule text. This is a corpus limitation and prevents claiming the requested useful-control coverage was fully demonstrated.

| Preregistered input opportunity | Requests |
|---|---:|
${opportunityTable}

Tags identify possible input exercises, not emitted claims or successful tests. Broad support-only/factual-trap tags include the two empty-appropriate cases and cannot be read as 64 useful positive controls. No synthetic proposals were added after provider dispatch. No cohort was declared passed solely from its input count.

## Provider reliability

Model \`${m.model}\`; original routing/provider requirements, reasoning disabled/excluded, strict typed schema, 600 output tokens, 20-second attempt timeout. Candidate technical contract v1, at most two attempts per logical request. Preregistered schedule: all 64 originals first, then technical retries in manifest order; stop at 80 physical calls. Generic tested retry handling replayed the cached first failure into its retry wrapper, then dispatched only attempt 2. Cached replay time is not provider latency.

| Metric | Result |
|---|---:|
| Logical requests / physical calls | 64 / 80 |
| First-attempt usable | 39/64 (60.9375%) |
| First-attempt malformed envelope | 21/64 (32.8125%) |
| First-attempt schema-invalid | 3/64 (4.6875%) |
| First-attempt finish_reason=length | 1/64 (1.5625%) |
| First-attempt timeout / retryable transport | 0 / 0 |
| Technical retries / recovered | 16 / 8 (50%) |
| Exhausted two-attempt technical failures | 8/64 (12.5%) |
| Budget-limited failures without retry | 9/64 (14.0625%) |
| Final unusable | 17/64 (26.5625%) |
| Final usable | 47/64 (73.4375%) |
| Valid empty envelopes | 6; no quality retry |
| Provider-reported total cost | USD 0.061862712 |
| Unknown cost receipts | 0 |
| Physical-call median / P95 latency | 1,600.787 / 2,772.319 ms |

Malformed, schema-invalid and length classes above are disjoint first-attempt failure categories; length is measured from the receipt independently. All calls, including failed/retry attempts, contribute cost/latency. Median averages the middle two values; P95 uses nearest-rank. The 80-call cap prevented nine remaining technical retries. No auth/config failure, semantic rejection, valid empty answer or boring answer was retried. Logical ID, serialized semantic body and frozen state hashes were identical across retries; no state mutation or JSON repair. Ledger stores request-body hashes, not an independent on-wire payload digest.

Every retry's initial failure class/finish reason, parse/schema status, outcome, per-attempt latency/cost and final logical usability appears in \`retry-accounting.json\`; full receipts and attempt traces are retained. **80 complete diagnostic objects extracted from invalid attempts are separate:** none accepted, none credited as semantic catches, none used in primary gates. No semantic diagnostic labels were assigned to those extracted objects.

## Semantic results and same-output bridge

The existing deterministic bridge renders typed outputs for the current free-text validator; the whole proposal batch receives its production duplicate policy. This is a comparison of validation behavior over identical typed output, **not native old-free-prose versus structured model quality**. The bridge accepted 39 useful objects whereas V2.2 accepted 57, recovering 19 useful objects the bridge rejected while losing one it accepted.

| Agent class | Reviewed | Bridge accepted | V2.2 accepted |
|---|---:|---:|---:|
${table}

- Useful lost: **1/39**, required 0.
- Bridge-accepted misleading/harmful caught: **3/3 (100%)**, required >=80%; escaped 0. There were no harmful objects, so harmful-specific exposure is absent.
- Absolute factual false admissions: **0/4** reviewed deterministic factual errors. All nine misleading proposals rejected.
- Neutral collateral: **0** bridge-accepted neutral objects lost. V2.2 nevertheless accepts six NEUTRAL and three REDUNDANT objects; exact correctness does not establish narrative usefulness.
- Bridge-accepted redundant rejection: **1**, reported separately from safety success.

Lost object: \`V22_OOS_engine_relationship_contrast_2_1:1\`. It claims Maren's trust in Brenna is moderate and wariness high. Cited history contains trust none→low→moderate (r6/r8) and wariness none→low→moderate→high (r10/r12/r14); the authoritative latest snapshot independently confirms both values. Agent review marked it USEFUL before scoring. The bridge accepts it; frozen V2.2 rejects \`missing_positive_evidence\` because it cites changes without the snapshot handle. This is an observed useful-preservation failure; no candidate rule was altered to recover it.

Four factual traps: wrong selected respect endpoint (r26 none, claimed low), wrong fifth trust endpoint (r28 low, claimed moderate), omitted in-scope wariness transitions r22/r28, and mismatched sore-ankle operations with omitted r24.1. They are factual failures rather than separately eligible extra-evidence contradiction tests: their claimed required core is already false. Five other misleading proposals contrast absent/none dimensions with positive dimensions, creating unsupported psychological interpretation.

## Provenance and extra-evidence exposure

Direct-handle self synthesis: 3 realized, 3 useful accepted. Event-equivalent: 1 realized, 1 useful accepted. Mixed: 0. Invalid different-statement provenance: 0 realized, so **0 observed correct rejections**, not a passed invalid-provenance test. Accepted event-equivalent object \`V22_OOS_engine_self_statement_synthesis_2_2:1\` uses outer r6/r8 history events linked by exact subject/revision/field to nested quote handles 0/1. No additional independent statement was invented. Fresh useful event-equivalent exposure **INSUFFICIENT (1<2)**.

Eligible extra-evidence claims require a correct unchanged V2-valid supporting subset; compatible extras cannot rescue false counts/endpoints/sequences. Useful classes remain those frozen in the blind review. Post-score exact-core audit uses the candidate's explicit role partition plus unchanged V2 core validation.

| Extras | Eligible | Accepted | Rejected | Exposure |
|---|---:|---:|---:|---|
${extraTable}

Audit correction: blind review row 2 mistakenly selected its first history ref as the contrast core instead of its fourth ref, the snapshot. The hashed blind review and initial score are preserved. \`cohort-analysis.json\` documents the index error and corrected supporting-subset accounting: compatible-context count is **3**, versus 2 in the initial independent-subset score. Classes, acceptances and hard-gate outcome are unchanged. The lost contrast has no V2-valid cited core and is excluded from these strict extra-evidence counts; its semantic useful loss remains counted. Corroborating and contradictory exposure are INSUFFICIENT, so overall extra exposure is insufficient.

## Current-state and role safety

Accepted stale-current-state violations: **0**. Accepted comparisons agree with the latest directional snapshots. Historical trajectories and movement paths remain recorded intervals; later state does not rewrite their endpoints. Accepted self statements: **0 performed-role leaks**. All four renderings retain explicit quotation/attribution; no owned-duty action history or demonstrated archive role is inferred. Renderings and snapshot checks are retained in cohort-analysis.json.

## Gates, limitations and next step

- Semantic hard gate: **FAIL**, useful loss 1. Factual safety and observed bad-catching thresholds pass on this sample; they do not override the useful-preservation failure.
- Structured provider reliability: **CONCERNING / FAIL**, final usability 73.4375% <98%.
- Provenance exposure: **INSUFFICIENT**. Corroborating/contradictory extras: **INSUFFICIENT**. Compatible context: sufficient observed exposure.
- Production candidacy: **NO**. Production changed: **NO**. D-09 remains **SOAK PENDING**; no closure or integration authorization.

Limited bad sample (three bridge-accepted misleading), no harmful sample, no realized mixed/invalid provenance, low final envelope usability and repeated scripted checkpoints constrain generalization. Agent review is subjective and not human review. The mechanically tagged useful-control counts overstate demonstrated useful membership/environment exposure; corpus shortcomings are explicitly retained.

Stop the candidate here and preserve this run. A separately authorized next task should inspect the useful contrast rejection against the frozen evidence and adjudicate intended claim entitlement; any successor must receive a new preregistered OOS with stronger actual provenance/extra exposure and useful controls. Provider/schema reliability remains a separate adoption blocker. No successor implementation or production transaction reorder is included here.

## Verification and artifacts

Before dispatch: typecheck passed; unit/integration **1942 passed, 0 failed, 4 TODO (1946 total)**; playthrough **25/25**. The same checks were rerun after executable evaluation harness additions; see final verification artifact and after logs. Frozen candidate and production source hashes matched after scoring. All new tracked files are evaluation scripts/report only.

Raw artifacts under ignored \`saves/d09-reflection-v22-oos/\`: manifest/hashes with embedded requests/snapshots/catalogs/traces; physical dispatch/receipt ledger; final logical outputs and retry traces; complete valid-object review inputs; malformed-object diagnostics; hashed blind review; bridged and candidate outcomes; collateral, retry accounting, cohort analysis, costs/latencies and test logs. No credential is copied into them. These local raw artifacts are deliberately excluded from Git; this report and the evaluation scripts are committed.
`;
writeFileSync('docs/evaluations/D09_REFLECTION_VALIDATOR_V22_OOS.md',report);console.log(JSON.stringify({extras,stale:stale.length,self_renderings:audit.self_renderings}));
