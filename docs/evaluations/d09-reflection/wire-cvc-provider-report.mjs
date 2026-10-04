/** Offline report/receipt audit. No inference calls. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {sha} from './lib.mjs';
const dir='saves/structured-reflection-wire-v2-provider',read=n=>JSON.parse(readFileSync(`${dir}/${n}`,'utf8')),manifest=read('manifest.json'),runs=read('responses.json'),done=read('dispatch-completed.json');
const ledger=readFileSync(`${dir}/physical-ledger.jsonl`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),dispatch=readFileSync(`${dir}/physical-dispatch.jsonl`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
assert.equal(ledger.length,dispatch.length);assert.equal(ledger.length,done.physical_calls);assert.ok(ledger.length<=48);
assert.equal(sha(readFileSync(`${dir}/manifest.json`)),readFileSync(`${dir}/manifest.sha256`,'utf8').trim());for(const [p,h] of Object.entries(manifest.source_hashes))assert.equal(sha(readFileSync(p)),h,p);
for(const a of ledger){const c=[...manifest.screen,...manifest.confirmation].find(c=>c.id===a.id);assert.equal(a.body_sha,c.body_sha);assert.equal(a.request_sha,c.request_sha);assert.equal(a.snapshot_sha,c.snapshot_sha);}
const count=(xs,p)=>xs.filter(p).length,percentile=(xs,p)=>xs.length?xs.slice().sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1]:null;
function stats(batch){if(!batch)return null;const aa=batch.outputs.flatMap(o=>o.attempts),first=batch.outputs.flatMap(o=>o.attempts.slice(0,1)),retries=aa.filter(a=>a.n===2),last=batch.outputs.flatMap(o=>o.attempts.slice(-1)),lat=aa.map(a=>a.latency_ms).sort((a,b)=>a-b);return {logical:batch.outputs.length,dispatched:first.length,physical:aa.length,first_usable:count(first,a=>a.usable),first_rate:count(first,a=>a.usable)/batch.outputs.length,retries:retries.length,recovered:count(retries,a=>a.usable),final_usable:count(last,a=>a.usable),final_rate:count(last,a=>a.usable)/batch.outputs.length,http_429:count(aa,a=>a.raw?.status===429),malformed:count(aa,a=>a.failure_class==='malformed_envelope'),length:count(aa,a=>a.finish_reason==='length'),timeout:count(aa,a=>a.failure_class==='timeout'),wire_invalid:count(aa,a=>a.structural?.parse_valid&&!a.structural.wire_valid),canonical_only_invalid:count(aa,a=>a.structural?.wire_valid&&!a.structural.canonical_valid),visibility_invalid:count(aa,a=>a.visibility_failures?.length),enum_violation_attempts:count(aa,a=>a.enum_violations?.length),enum_violation_values:aa.flatMap(a=>a.enum_violations??[]).length,evidence_enum_violations:aa.flatMap(a=>a.enum_violations??[]).filter(v=>v.path.includes('.evidence_refs[')).length,statement_enum_violations:aa.flatMap(a=>a.enum_violations??[]).filter(v=>v.path.includes('.statement_refs[')).length,location_enum_violations:aa.flatMap(a=>a.enum_violations??[]).filter(v=>v.path.includes('.locations[')).length,valid_empty:count(last,a=>a.usable&&a.valid_empty),valid_nonempty:count(last,a=>a.usable&&!a.valid_empty),cost_usd:aa.reduce((s,a)=>s+(a.cost_usd??0),0),missing_cost_receipts:count(aa,a=>a.cost_usd===null),median_latency_ms:lat.length?(lat[Math.floor((lat.length-1)/2)]+lat[Math.floor(lat.length/2)])/2:null,p95_latency_ms:percentile(lat,.95)};}
const screen=stats(runs[0]),confirmation=stats(runs[1]),enumFailures=ledger.flatMap(a=>(a.enum_violations??[]).map(v=>({id:a.id,attempt:a.n,...v,retry_recovered:runs.flatMap(r=>r.outputs).find(o=>o.id===a.id).attempts.at(-1).usable}))),qualified=screen.first_usable>=23&&screen.final_usable===24&&screen.enum_violation_attempts===0&&(!confirmation||confirmation.final_usable===16&&confirmation.enum_violation_attempts===0);
const exhausted=runs.flatMap(r=>r.outputs).filter(o=>!o.attempts.at(-1)?.usable),blocker=qualified?'NONE':enumFailures.length?'ENUM_CONSTRAINT_NOT_ENFORCED':exhausted.some(o=>o.attempts.at(-1)?.structural?.wire_valid&&!o.attempts.at(-1)?.structural?.canonical_valid)?'CANONICAL_ONLY_UNIQUENESS':exhausted.some(o=>o.attempts.at(-1)?.raw?.status===429)?'RATE_LIMIT':exhausted.some(o=>['timeout','http_retryable','network_error'].includes(o.attempts.at(-1)?.failure_class))?'TRANSPORT':'OTHER';
const metrics={screen,confirmation,reliability_gate:qualified?'PASS':'FAIL',blocker,physical_total:ledger.length,cost_total:ledger.reduce((s,a)=>s+(a.cost_usd??0),0)};
writeFileSync(`${dir}/metrics.json`,JSON.stringify(metrics,null,2));writeFileSync(`${dir}/validation-results.json`,JSON.stringify(ledger.map(a=>({id:a.id,n:a.n,usable:a.usable,finish_reason:a.finish_reason,wire_failures:a.wire_failures,canonical_failures:a.canonical_failures,visibility_failures:a.visibility_failures,enum_violations:a.enum_violations,exact_output:a.output_text,retry_recovered:runs.flatMap(r=>r.outputs).find(o=>o.id===a.id).attempts.at(-1)?.usable})),null,2));
const freeze={status:qualified?'QUALIFIED_FOR_TARGETED_EXPOSURE_SOAK_ONLY':'NOT_QUALIFIED_DO_NOT_ADOPT',wire_version:'WIRE_ALIBABA_V2_CVC',wire_generator_source:'src/dev/reflection-wire-v2-cvc.ts',wire_generator_sha:manifest.local_freeze.wire_generator_sha,algorithm:'CVC visible roots + verified existing typed statement exposures; sorted exact domains; enum evidence/statement/movement fields; V1 structural projection; impossible empty-domain families omitted',cvc_source_sha:manifest.local_freeze.source_sha,v23_source_sha:manifest.local_freeze.v23_source_sha,canonical_schema_sha:manifest.local_freeze.canonical_schema_sha,prompt_sha:manifest.local_freeze.prompt_sha,model:manifest.screen[0].body.model,provider:manifest.screen[0].body.provider,max_tokens:600,timeout_ms:20000,reasoning:manifest.screen[0].body.reasoning,pacing:manifest.policy,retry:manifest.retry,manifest_sha:sha(readFileSync(`${dir}/manifest.json`)),request_schema_set_sha:sha([...manifest.screen,...manifest.confirmation].map(c=>({id:c.id,wire_sha:c.wire_sha}))),physical_calls:ledger.length,qualified,production_adoption:false};writeFileSync(`${dir}/freeze.json`,JSON.stringify(freeze,null,2));
const size=manifest.screen.map(c=>Buffer.byteLength(JSON.stringify(c.wire_schema))).sort((a,b)=>a-b),fmt=x=>x===null?'N/A':Number(x).toFixed(2),table=Object.entries(screen).map(([k,v])=>`| ${k} | ${v??'N/A'} |`).join('\n');
const text=`# Structured reflection wire V2 CVC — provider reliability screen

Reviewed 2026-10-04, Europe/Rome. **Reliability ${metrics.reliability_gate}; blocker ${blocker}.** Production unchanged; V2.3-CVC frozen / local semantic PASS; D-09 SOAK PENDING. Reliability only: no new semantic OOS, U/N/R/M review, prompt tuning, repair or targeted exposure testing.

## FREEZE

Frozen V2.3 source ${freeze.v23_source_sha}; canonical ${freeze.canonical_schema_sha}; prompt ${freeze.prompt_sha}; CVC ${freeze.cvc_source_sha}; wire generator ${freeze.wire_generator_sha}. All source/body/request/snapshot/dynamic-schema hashes MATCH before inference and in final receipt audit. Manifest ${freeze.manifest_sha}. Existing local proof: 40 requests, 28,464 accepted samples, zero false rejections, 205 safety negatives. No frozen semantics or wire domains changed during the run.

## PREFLIGHT

Exact credential format checked privately; one read-only authentication check: HTTP 200. No account details or credentials stored. Tests green before inference. No additional generic documentation research or minimal keyword probes. Model qwen/qwen3.8-flash, Alibaba only, no fallback, require_parameters true, strict JSON Schema, 600 tokens, 20 seconds, reasoning disabled/excluded.

## SCREEN CORPUS

Exact archived next-paid-screen bodies: 24 requests, three per eight claim families. Captured catalogs/states, request/snapshot/schema hashes and domains are retained in manifest.json. Body hashes match the prepared archive. No cases regenerated/substituted after dispatch. Logical dispatched ${screen.dispatched}/24; physical ${screen.physical}. Distinct preregistered confirmation cases retained separately.

## DYNAMIC SCHEMA DOMAINS

Only evidence refs, verified received statement selectors and visible movement endpoints receive request enums. Embedded selectors already transmitted in typed event metadata remain citable; no hidden handles are exposed. Unsupported uniqueItems is omitted only from provider wire. Canonical uniqueness stays mandatory. Screen schema UTF-8 bytes min/median/max: ${size[0]} / ${(size[11]+size[12])/2} / ${size.at(-1)}; exact domains and per-field cardinalities are in manifest.json. No token estimate is claimed.

## PROVIDER RESULTS

| Metric | Result |
| --- | ---: |
${table}

## ENUM ENFORCEMENT

Evidence violations ${screen.evidence_enum_violations}; statement violations ${screen.statement_enum_violations}; locations ${screen.location_enum_violations}. Exact attempt/request/path/value/expected-domain/cardinality and recovery are archived in validation-results.json. ${enumFailures.length?'A strict accepted schema emitted out-of-enum values: ENUM_CONSTRAINT_NOT_ENFORCED. Further dispatch stopped; no alternative encoding was tried.':'No request-scoped enum violation observed. This finite screen does not establish universal keyword enforcement.'}

## CANONICAL VALIDITY

Wrapper and finish stop precede exact JSON.parse, dynamic wire, canonical structure and CVC visibility checks. Valid empty envelopes count as usable. Canonical-only invalid attempts ${screen.canonical_only_invalid}; visibility-invalid ${screen.visibility_invalid}. No deduplication, coercion, proposal dropping, selector replacement, first-object extraction or JSON repair occurred. Invalid-finish raw content is retained diagnostically without becoming usable.

## RETRIES

Screen retries ${screen.retries}; recovered ${screen.recovered}. Maximum two attempts per request; technical failures only, deferred after first attempts; exact same body/state/schema checked. No semantic, quality or valid-empty reroll. Retry traces and write-ahead dispatch/receipt pairs retained. Shared physical cap 48, used ${ledger.length}. Frozen V3 pacing retained: concurrency one, launch floor 1,000ms, post-completion gap 250ms, Retry-After honored, fallback 429 delay 6/12 seconds. No tuning.

## 429

Screen natural 429 receipts ${screen.http_429}. Whitelisted Retry-After/X-RateLimit headers, upstream errors, timing and attempt number retained in raw receipts. No rate-limit failure manufactured.

## LATENCY

Screen physical-attempt median ${fmt(screen.median_latency_ms)} ms; P95 ${fmt(screen.p95_latency_ms)} ms (nearest-rank percentile; median midpoint). Includes request completion/validation, excludes pacing wait. Timing/pacing waits retained per receipt.

## COST

Screen provider-reported cost $${screen.cost_usd}; missing cost receipts ${screen.missing_cost_receipts}. Total screen plus confirmation provider-reported cost $${metrics.cost_total}; authentication is not an inference call. These are usage receipts, not an independent billing audit.

## CONFIRMATION

Run ${confirmation?'YES':'NO'}. ${confirmation?`Distinct logical ${confirmation.logical}; dispatched ${confirmation.dispatched}; physical ${confirmation.physical}; final usable ${confirmation.final_usable}/16; enum violations ${confirmation.enum_violation_attempts}; reported cost $${confirmation.cost_usd}.`:`Omitted: ${done.confirmation_omission_reason}.`} Confirmation requires screen first >=23/24, final24/24 and zero enum violations plus budget/time. No first-screen failure triggers confirmation.

## DECISION

**${metrics.reliability_gate} / ${blocker}.** Reliability candidate frozen ${qualified?'YES':'NO'}. ${qualified?'WIRE_ALIBABA_V2_CVC is qualified only for the targeted missing-exposure soak.':'freeze.json records NOT_QUALIFIED_DO_NOT_ADOPT; no reliability candidate is qualified.'} Production changed NO. Semantics, prompt, canonical structure and provenance/visibility remain frozen. D-09 SOAK PENDING.

## NEXT STEP

${qualified?'Targeted missing-exposure soak only, as a separate task. No production integration.':'Documentation-first analysis of the exact new blocker before any new calls. No post-failure experiment or encoding redesign.'}

Raw artifacts: saves/structured-reflection-wire-v2-provider/. Credential scan and final tests are recorded in final-verification.json.
`;
writeFileSync('docs/evaluations/STRUCTURED_REFLECTION_WIRE_V2_PROVIDER_SCREEN.md',text);console.log(JSON.stringify(metrics,null,2));
