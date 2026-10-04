/** Report exact wire/canonical accounting after the frozen screen completes. No API calls. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {sha} from './lib.mjs';
import {validateReflectionWire} from '../../../.build/src/dev/reflection-wire.js';
const dir='saves/structured-reflection-reliability-v2',read=n=>JSON.parse(readFileSync(`${dir}/${n}`)),p=read('plan.json'),done=read('dispatch-completed.json'),preflight=read('preflight.json'),probes=read('compatibility-probes.json'),arms=read('configured-arms.json'),outputs=read('outputs.json'),ranking=read('primary-ranking.json'),ledger=readFileSync(`${dir}/physical-ledger.jsonl`,'utf8').trim().split('\n').map(JSON.parse),candidate=existsSync(`${dir}/candidate-freeze.json`)?read('candidate-freeze.json'):null;
for(const[file,h]of Object.entries(p.file_hashes))if(sha(readFileSync(file))!==h)throw Error('Frozen source changed '+file);
if(ledger.length!==done.generation_calls||ledger.length>64)throw Error('Ledger/cap mismatch');
const median=aa=>{const v=aa.map(a=>a.latency_ms).sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2:null;},receipt=a=>{try{return JSON.parse(a.raw?.body??'{}');}catch{return {};}};
const matrix=Object.fromEntries(p.arms.map(arm=>[arm.id,Object.fromEntries(['additionalProperties','anyOf','enum','minItems','maxItems','uniqueItems','nested_required','array_union'].map(k=>{const probe=p.probes.find(q=>q.keywords.includes(k)),r=probes.find(r=>r.arm===`probe:${arm.id}:${probe.id}`);return[k,r?.probe_status??'UNKNOWN'];}))]));
const stats=arms.map(arm=>{const rr=outputs.filter(o=>o.arm===arm.id),first=rr.flatMap(o=>o.attempts.filter(a=>a.n===1)),all=rr.flatMap(o=>o.attempts),schema=p.schemas[arm.profile].schema,local=first.map(a=>{const content=receipt(a).choices?.[0]?.message?.content;return {...validateReflectionWire(typeof content==='string'?content:'',schema),id:a.id};});
 return {arm:arm.id,model:arm.model,projection:arm.profile,wire_sha:arm.wire_sha,provider_preferences:arm.provider,compatibility:arm.compatibility,primary_calls:first.length,physical_calls:all.length,strict_usable:first.filter(a=>a.usable).length,wire_valid:local.filter(v=>v.wire_valid).length,canonical_valid:local.filter(v=>v.canonical_valid).length,wire_only_rejected:local.filter(v=>v.wire_valid&&!v.canonical_valid).length,valid_nonempty:first.filter(a=>a.usable&&a.parsed.length>0).length,valid_empty:first.filter(a=>a.usable&&a.parsed.length===0).length,proposal_count:first.reduce((s,a)=>s+(a.usable?a.parsed.length:0),0),semantic_admissible_sanity:first.reduce((s,a)=>s+(a.semantic_sanity?.admissible??0),0),malformed:first.filter(a=>a.taxonomy.families.includes('malformed_json')).length,trailing:first.filter(a=>a.taxonomy.families.includes('trailing_content')).length,schema_invalid:first.filter(a=>a.taxonomy.families.includes('schema_invalid')).length,length:first.filter(a=>a.finish_reason==='length').length,config_errors:first.filter(a=>a.stop==='CONFIGURATION').length,first_failure_classes:Object.fromEntries([...new Set(first.filter(a=>!a.usable).map(a=>a.failure_class))].map(c=>[c,first.filter(a=>a.failure_class===c).length])),actual_providers:Object.fromEntries([...new Set(first.map(a=>a.provider??'unreported'))].map(c=>[c,first.filter(a=>(a.provider??'unreported')===c).length])),reported_cost_usd:all.reduce((s,a)=>s+(a.cost_usd??0),0),missing_cost_receipts:all.filter(a=>a.cost_usd===null).length,median_primary_latency_ms:median(first),retried:all.filter(a=>a.n===2).length,recovered:all.filter(a=>a.n===2&&a.usable).length,final_logical_usable:rr.filter(o=>o.parsed!==null).length};});
const total={generation_calls:ledger.length,probe_calls:probes.length,primary_calls:ledger.filter(a=>a.stage==='primary').length,retry_calls:ledger.filter(a=>a.stage==='retry').length,reported_cost_usd:ledger.reduce((s,a)=>s+(a.cost_usd??0),0),missing_cost_receipts:ledger.filter(a=>a.cost_usd===null).length,probe_cost_usd:probes.reduce((s,a)=>s+(a.cost_usd??0),0),auth_aborted:done.auth_aborted,candidate_found:!!candidate};
const structural=outputs.flatMap(o=>o.attempts.map(a=>({arm:o.arm,id:o.id,n:a.n,strict_usable:a.usable,wire_valid:a.wire_valid??false,canonical_valid:a.canonical_valid??false,failure_class:a.failure_class??null,body_sha:a.body_sha,request_sha:a.request_sha,snapshot_sha:a.snapshot_sha,semantic_sanity:a.semantic_sanity??null})));
writeFileSync(`${dir}/canonical-validation-results.json`,JSON.stringify(structural,null,2));writeFileSync(`${dir}/final-analysis.json`,JSON.stringify({total,matrix,stats,candidate,ranking},null,2));
const compatTable=Object.entries(matrix).map(([a,s])=>`| ${a} | ${s.additionalProperties} | ${s.anyOf} | ${s.enum} | ${s.minItems}/${s.maxItems} | ${s.uniqueItems} | ${s.nested_required} | ${s.array_union} |`).join('\n');
const armTable=stats.map(s=>`| ${s.arm} | ${s.primary_calls} | ${s.strict_usable}/16 | ${s.wire_valid} | ${s.canonical_valid} | ${s.valid_nonempty}/${s.valid_empty} | ${s.proposal_count} | ${s.malformed}/${s.trailing}/${s.schema_invalid}/${s.length} |`).join('\n');
const detail=stats.map(s=>`### Arm ${s.arm}

Model \`${s.model}\`; routing \`${JSON.stringify(s.provider_preferences)}\`. Projection \`${s.projection}\`; actual providers \`${JSON.stringify(s.actual_providers)}\`. Compatibility: ${s.compatibility}. First-attempt failure classes \`${JSON.stringify(s.first_failure_classes)}\`; deterministic primary configuration errors ${s.config_errors}. Wire-valid but canonical-rejected ${s.wire_only_rejected}. ${s.semantic_admissible_sanity} proposals passed frozen V2.3 checks as mechanical sanity only, not blind semantic quality scoring.

Physical comparison calls ${s.physical_calls}; provider-reported comparison cost USD ${s.reported_cost_usd.toFixed(9)} (${s.missing_cost_receipts} missing receipts). Median first-attempt latency ${s.median_primary_latency_ms?.toFixed(3)??'N/A'} ms. Technical retries ${s.retried}; recovered ${s.recovered}; final logical usable ${s.final_logical_usable}/16.
`).join('\n');
const best=stats.find(s=>s.arm===done.best),freezeText=candidate?`**RELIABILITY CANDIDATE FOUND: YES.** Arm ${done.best} meets the preregistered screen and final 16/16 target. This is a small reliability screen, not statistical proof or production authorization.

- Model: \`${candidate.model}\`.
- Routing: \`${JSON.stringify(candidate.provider)}\`.
- Wire profile/hash: \`${candidate.wire_projection}\` / \`${candidate.wire_schema_sha}\`.
- Canonical schema: \`${candidate.canonical_schema_sha}\`.
- Prompt: \`${candidate.prompt_sha}\`.
- V2.3 source: \`${candidate.v23_source_sha}\`.
- Max tokens ${candidate.max_tokens}; timeout ${candidate.timeout_ms} ms; reasoning \`${JSON.stringify(candidate.reasoning)}\`.
- Retry policy: \`${JSON.stringify(candidate.retry_policy)}\`.
- First ${candidate.first_usable}/16, final ${candidate.final_usable}/16, first-attempt nonempty ${candidate.nonempty}/16. Exact settings/configuration are in candidate-freeze.json. No post-selection tuning.

Next task: separately authorized independent V2.3 semantic OOS using **exactly this frozen provider/wire/canonical/prompt/retry configuration**. It must cover real provenance-equivalent, corroborating/context/contradictory exposure and convincingly useful membership/environment controls. Production provider, semantic reflection and turn publication remain unchanged.`:`**RELIABILITY CANDIDATE FOUND: NO.** ${best?'A qualifying first-attempt arm did not reach 16/16 final usability.':'No arm met the preregistered first-attempt/nonempty screen.'} No configuration is authorized for semantic OOS. Next experiment only: ${stats.some(s=>s.length>0)?'a preregistered length-focused screen on the most structurally compliant pinned endpoint, holding prompt/canonical semantics fixed and isolating the output limit; do not run it automatically.':'a single simpler wire-grammar experiment preserving exact canonical closedness locally, on the best syntax-compatible endpoint; do not run it automatically.'}`;
const report=`# Structured reflection provider reliability V2

${candidate?'**RELIABILITY SCREEN: CANDIDATE FOUND.**':'**RELIABILITY SCREEN: NO QUALIFYING CANDIDATE.**'} Clean preflight/probes/comparison completed. Production unchanged. Frozen V2.3 semantics unchanged/hash verified. D-09 **SOAK PENDING**; no semantic OOS was run.

## Credential preflight and benchmark fail-fast

Credential present; exact \`sk-or-v1-\` plus 64 hexadecimal characters validated. Legacy local-file extraction is fixed-width and rejects ambiguous keys; provided environment values must match the complete exact format. The old trailing-text extraction bug is covered by a deterministic test. Read-only /api/v1/key returned **HTTP 200 before any generation**; account data and credentials were neither printed nor saved. Public model endpoint metadata returned HTTP 200 with visible DeepSeek and Qwen endpoints before generation.

The shared, campaign-independent benchmark gate stops the entire batch on the first auth error (including auth codes inside HTTP-200 error wrappers), and stops the affected schema/model/provider configuration on its first deterministic error. Tests simulate 48 queued auth-failing tasks and observe **one dispatch**, plus grammar/config errors stopping an arm after one call while another arm continues. This does not alter production retry behavior. Budget test covers shared accounting across probes/comparison/retries. No auth error occurred in this run.

## Preregistration and corpus

Plan hash \`${readFileSync(`${dir}/plan.sha256`,'utf8').trim()}\`; comparison manifest \`${readFileSync(`${dir}/comparison-manifest.sha256`,'utf8').trim()}\`. The plan froze all 16 existing reliability-only requests, snapshots, catalogs/traces, source hashes, routing, three profiles, minimal probes, settings, qualification/tie-break and retry policy before generation. The comparison manifest then fixed the projection choices from the preregistered probe rule before full reflection calls.

Two requests per family (fixture and complex scripted checkpoint): trajectory, parallel, contrast, condition, membership, movement, self-statements, environment. Bodies reuse the prior reliability corpus; **not independent semantic OOS**. One environmental fixture is empty-appropriate. User JSON, captured state and prompt are identical across all arms. Full comparisons retain **600 tokens**, 20-second timeout, reasoning excluded/disabled and require_parameters:true. Only model/routing/wire syntax differs. Twelve minimal/full-wire probes use a separate 160-token limit; **all probes count toward the same 64-generation-call cap**.

## Keyword compatibility probes

Three minimal schema configurations per endpoint: closed required/nested objects with enum; arrays of closed union objects with anyOf/const/minItems/maxItems; uniqueItems. One full selected-wire schema probe per endpoint then asks for a valid empty envelope. These are schema syntax probes, not reflection quality samples. Each distinct probe configuration is attempted once; no grammar error is retried. An unsupported uniqueItems case ends that configuration, while the separately preregistered projection can still be tested.

SUPPORTED means a request was accepted and generated a strict schema-valid minimal output. UNSUPPORTED means deterministic request/schema rejection; UNKNOWN means no conclusive compatible output. These positive cases do **not prove native grammar enforcement or adversarial conformance**. Local canonical validation remains mandatory even for SUPPORTED keywords.

| Endpoint | additionalProperties:false | anyOf | enum | min/maxItems | uniqueItems | nested required | array union |
|---|---|---|---|---|---|---|---|
${compatTable}

A probes pinned Baidu FP8; B pinned DeepInfra FP8; C pinned Alibaba. DeepInfra explicitly returned Unimplemented keys: ["uniqueItems"]. Alibaba rejected arrays containing uniqueItems with a provider invalid_parameter_error. Both accepted the **full schema with only uniqueItems removed**. Baidu accepted the canonical schema in these small probes; this establishes request compatibility, not guaranteed strict enforcement. Actual full-response malformed rates below determine candidacy.

OpenRouter documents endpoint-specific support and differing strict enforcement strengths: [official structured-output docs](https://github.com/OpenRouterTeam/docs/blob/main/guides/features/structured-outputs.mdx), [official provider-routing docs](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/provider-selection.mdx). Public metadata snapshots are stored from [DeepSeek endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints) and [Qwen endpoints](https://openrouter.ai/api/v1/models/qwen/qwen3.8-flash/endpoints). Advertised supported parameters alone did not establish keyword compatibility.

## Wire projections and acceptance safety

Canonical V2.3 schema hash: \`${p.schemas.CANONICAL.sha}\`.

DeepInfra projection WIRE_DEEPINFRA_V1: \`${p.schemas.WIRE_DEEPINFRA_V1.sha}\`.

Alibaba projection WIRE_ALIBABA_V1: \`${p.schemas.WIRE_ALIBABA_V1.sha}\`.

The projected schemas have identical bytes because both omit exactly the two uniqueItems nodes. All eight closed claim branches, required fields, additionalProperties:false, enum/const, nesting, counts and string/array bounds remain. No provider-specific semantics or transformation of output objects. DeepInfra uses its projection; Alibaba's unsupported uniqueItems probe selects its projection under the frozen rule; A stays canonical.

Acceptance pipeline: one exact JSON.parse → local wire schema check → **unchanged canonical schema check** → frozen V2.3 validation for mechanical nonempty/admissibility sanity. Usable requires valid transport/finish plus wire AND canonical structure, before semantic validation. Duplicate refs/selectors can satisfy projected wire syntax but remain canonical-invalid and NOT usable. Fences, trailing prose/objects/punctuation, partial JSON and unknown-field coercion are never repaired; no first-object extraction promotes output.

Eight safety cases prove duplicate evidence refs, duplicate statement refs, unknown field, invalid enum, too many proposals, too many refs, wrong payload and missing required fields are not usable. The two duplicate cases demonstrate wire-valid/canonical-invalid. Other tests cover immutable projection, strict malformed rejection, exact key loading, read-only auth failure, auth/config fail-fast and cap sharing. Fifteen new tests; production files and frozen semantic candidate untouched.

## Arm results

Primary first attempts only; no retries during comparison. Wire/canonical columns count exact raw JSON structural validity, while strict usable additionally requires an acceptable provider wrapper/finish. No length response is accepted even if its raw text could parse. Valid nonempty/empty/proposal counts include strict usable envelopes only. Malformed/trailing/schema/length categories may overlap.

| Arm | Primary calls | Strict usable | Wire valid | Canonical valid | Nonempty/empty | Proposals | Malformed/trailing/schema/length |
|---|---:|---:|---:|---:|---:|---:|---|
${armTable}

${detail}

DeepInfra's two failures were a 600-token length termination on R02 and an HTTP 429 shared-upstream-pool rate limit on R08. They are separate truncation and API availability failures, not grammar incompatibility. Baidu's two parseable schema failures exceeded the eight-item evidence/operation bounds; its remaining failures were malformed/trailing content and length. Successful minimal probes therefore do not establish reliable enforcement of the full schema. The underlying Baidu enforcement mechanism is not proven from these receipts.

The canonical-validation artifact records each attempt, request/state/body hashes and local validation stage. No wire-only invalid object is credited as a semantic rejection or accepted reflection. Mechanical V2.3 admissibility numbers are not a new blind semantic quality score; there is no human semantic review here.

## Selection, technical retry and accounting

Qualification was frozen at >=15/16 strict usable, >=8 valid nonempty envelopes, and at least one V2.3-admissible proposal. This prevents an all-empty provider winning. Ranking among qualifying arms: strict usable, then nonempty, then lower reported cost, then arm ID. Preferred first-attempt target 16/16; final target 16/16 after at most one technical retry. With n=16 this is screening evidence, not a statistical reliability guarantee.

Best qualifying arm: **${done.best??'NONE'}**. ${best?`First-attempt rate ${(best.strict_usable/16*100).toFixed(2)}%; technical retries attempted ${best.retried}, recovered ${best.recovered}; final logical usability ${best.final_logical_usable}/16 (${(best.final_logical_usable/16*100).toFixed(2)}%).`:'No arm was eligible for secondary retries.'} Valid empty, successful, semantically rejected and unhelpful outputs are not retried. Retried requests, if any, use the exact original body, logical ID and frozen snapshot. Existing candidate retry handling replays the cached initial failure and dispatches only attempt 2; cached replay is not counted as a provider call. Auth/config errors are never contract retries.

The source-frozen harness supplies random=0 to retryPolicy, giving reproducible 250-ms backoff within its 250–500-ms policy bounds. No retry was needed for the winner, so this screen does not add empirical retry-recovery evidence; the existing deterministic reliability-contract tests cover that behavior. Keep this implementation setting with the frozen policy for the next OOS.

Total generation calls **${total.generation_calls}/64**: ${total.probe_calls} probes + ${total.primary_calls} primary comparisons + ${total.retry_calls} retries. Provider-reported total cost **USD ${total.reported_cost_usd.toFixed(9)}**, including probe cost USD ${total.probe_cost_usd.toFixed(9)}. ${total.missing_cost_receipts} calls have no reported cost receipt; missing costs are not established zero charges. Per-call latency, receipts, costs, usage and retry traces are retained. Config-incompatible probe receipts do not count as malformed model content.

## Candidate freeze and next step

${freezeText}

## Verification and retained artifacts

Typecheck PASS; unit/integration **1962 passed, 0 failures, same four TODO (1966 total)**; playthrough **25/25**. Frozen V2.3 source \`${p.semantic_freeze.source_sha}\`, schema and prompt match required hashes; dependencies remain byte-for-byte unchanged. Production model/reflection/publication unchanged; no new semantic OOS, prompt tuning or token-budget increase.

Ignored saves/structured-reflection-reliability-v2 contains plans/manifests/hashes, all request/state/catalog/trace bodies, endpoint metadata, canonical/projected schema files, compatibility probe receipts, private preflight **status only**, physical write-ahead/receipt ledger, outputs/failure taxonomy, canonical validation, retry traces, rankings, candidate freeze if qualified, tests and final analysis. No credentials. Reports and evaluation-only module/tests/harness are committed; raw artifacts stay local and ignored.
`;
writeFileSync('docs/evaluations/STRUCTURED_REFLECTION_PROVIDER_RELIABILITY_V2.md',report);console.log(JSON.stringify({total,matrix,stats,candidate},null,2));
