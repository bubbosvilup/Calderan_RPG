/** Final reports: preserve unsuccessful dispatch history; never repair or rerun provider content. */
import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p)),dir='saves/structured-reflection-reliability',f=read('saves/d09-reflection-v23/candidate-freeze.json'),dev=read('saves/d09-reflection-v23/dev-regression.json'),m=read(`${dir}/manifest.json`),h=read(`${dir}/historical-forensics.json`),original=read(`${dir}/outputs.json`),continuation=read(`${dir}/continuation-outputs.json`);
const median=aa=>{const n=aa.map(a=>a.latency_ms).sort((a,b)=>a-b);return (n[Math.floor((n.length-1)/2)]+n[Math.floor(n.length/2)])/2;};
const metrics={physical_generation_requests:original.flatMap(o=>o.attempts).length+continuation.length,initial_auth_failed:48,corrected_configuration_calls:continuation.length,corrected_strict_usable:continuation.filter(a=>a.usable).length,corrected_upstream_schema_config_errors:continuation.filter(a=>{try{return JSON.parse(a.raw.body).error?.message?.includes('Unimplemented keys');}catch{return false;}}).length,secondary_retries:0,recovered:0,reported_cost_usd:[...original.flatMap(o=>o.attempts),...continuation].reduce((s,a)=>s+(a.cost_usd??0),0),missing_usage_cost_receipts:original.flatMap(o=>o.attempts).filter(a=>a.cost_usd===null).length+continuation.filter(a=>a.cost_usd===null).length,initial_arm_medians_ms:Object.fromEntries(m.arms.map(arm=>[arm.id,median(original.filter(o=>o.arm===arm.id).flatMap(o=>o.attempts))])),corrected_median_ms:median(continuation),semantic_dev:dev.metrics.gate,reliability:'FAIL / INCOMPLETE COMPARISON',candidate_found:false,production_changed:false};
writeFileSync(`${dir}/final-analysis.json`,JSON.stringify({metrics,initial_matrix:original.map(o=>({arm:o.arm,id:o.id,status:o.attempts[0].raw?.status,failure_class:o.attempts[0].failure_class})),corrected_screen:continuation.map(a=>({id:a.id,status:a.raw?.status,upstream_error:JSON.parse(a.raw.body).error,body_sha:a.body_sha,latency_ms:a.latency_ms})),offline_wire_recommendation:'Investigate provider-compatible projection omitting unsupported uniqueItems at wire layer ONLY while retaining unchanged full local V2 schema uniqueness validation before semantic validation. This is an offline proposal, not tested or adopted; duplicate outputs remain failures. Closed variants/required/additionalProperties must remain. No JSON repair.'},null,2));
writeFileSync('docs/evaluations/D09_REFLECTION_VALIDATOR_V23_DEV.md',`# D-09 reflection V2.3 development

**SEMANTIC DEV: PASS. This is development regression, not independent OOS or production authorization.** Production reflection/model and turn publication ordering remain unchanged. D-09 stays SOAK PENDING.

## Root cause and architecture

The sole V2.2 lost useful object, \`V22_OOS_engine_relationship_contrast_2_1:1\`, cites trust none→low→moderate and wariness none→low→moderate→high. Its final changes occurred at different revisions. V2 requires a cited snapshot or both final changes in the same revision; V2.1/V2.2 preserve that requirement. They reject missing_positive_evidence even though the authoritative current catalog snapshot proves moderate trust and high wariness.

The collector in src/dev/reflection-v2.ts constructs directional relationship snapshots from CampaignSnapshot relationships, with exact owner/subject/target and capture revision. The catalog is engine authority supplied independently of provider output. Model proposals cannot create or amend it. Full catalog authority is already consulted for omitted events and stale-state checks. V2.3 uses this existing boundary for this one current-state claim family; it does not search arbitrary uncited facts for other claim types. The caller must supply the catalog from the same captured validation state; this module does not fetch live state or establish production commit freshness.

## Contrast policy

A proposal **need not cite the snapshot handle** when it cites owned same-subject/target history for **both compared dimensions**. Alternatively it may cite the matching directional snapshot itself. All original references must exist uniquely and belong to the subject. Movement-only, one-dimension-only or unrelated references cannot authorize the comparison.

Current truth must come from one uniquely latest, owned directional snapshot in the full authoritative catalog. Both dimensions must be explicit, distinct and positive, and match the claimed values. Missing/ambiguous/foreign authority rejects; mismatched state rejects; stale cited snapshots or relevant changes newer than the authority snapshot reject. Same-revision contradictory changes also reject. Historical changes establish provenance, not simultaneous historical truth or the current endpoint. Other recognized facts may remain compatible context; unknown evidence classes still reject.

Verified current authority is passed to unchanged V2.2 closedness/entitlement checks internally; the diagnostic and accepted persisted proposal retain the model's original refs. A separate authority_ref identifies the verification snapshot. Rendering stays deterministic and uses recorded directional feelings. All non-contrast validation and all batch duplicate/size/instruction checks are unchanged. Historical trajectories, paths, lifecycle/condition sequences and self-statement proof still require their cited history.

The schema and prompt are unchanged. The prompt remains more conservative, asking for a cited snapshot or same-revision final changes; loosening prompt wording is outside this task. Provenance/versioning remain unchanged. There is no production caller of V2.3.

## Development regression

| Required result | Observed |
|---|---:|
| Lost useful recovered | 1/1 |
| Previously accepted useful preserved | 57/57 |
| Misleading retained rejected | 9/9 |
| Known factual errors retained rejected | 4/4 |
| Factual errors admitted | 0 |
| Previously accepted neutral lost | 0 |
| Non-contrast diagnostic changes | 0 |
| Unrelated-ref false positive | 0 |
| Stale-state control admissions | 0 |

V2.2's 100 reviewed OOS objects are **development only** for V2.3. Fourteen explicit controls cover recovered contrast, current mismatch, absent/no authority, stale cited snapshots (different and equal values), movement-only refs, partial provenance, foreign/ambiguous authority, unknown refs, same/none dimensions and events newer than authority. Five repository tests exercise the authority boundary and unchanged historical-proof requirement. Existing V2.2 provenance tests run unchanged, including direct/event/mixed links, invalid selectors, missing/foreign/ambiguous identity and unsafe/performed-role fields. Non-contrast diagnostics are byte-equivalent on the prior reviewed dataset; the four accepted attributed self statements retain quotation and have zero performed-role leaks.

## Freeze

- Source: \`${f.source_sha}\` (src/dev/reflection-v23.ts).
- Schema: \`${f.schema_sha}\` — identical to V2.2.
- Prompt: \`${f.prompt_sha}\` — identical to V2.2.
- Evidence version 2; provenance model version 1.
- Reason-code set: unchanged V2.2, SHA-256 \`${f.reason_codes_sha}\`; the complete set and dependency hashes are in the freeze artifact.
- V2/V2.1/V2.2 remain byte-for-byte unchanged.

## Verification and next step

Typecheck PASS. Unit/integration **1947 passed, 0 failed, same 4 TODO (1951 total)**; playthrough **25/25**. Candidate frozen before the provider experiment. Local ignored artifacts in saves/d09-reflection-v23 contain the freeze, complete development outcomes/control diagnostics and test logs. No new semantic OOS was run.

Reliability investigation found no usable candidate and did not complete a valid three-arm comparison. Work next on provider/wire-schema compatibility and exact enforcement, preserving this semantic freeze. Do not rerun semantic OOS until a reliable configuration is established; then a separately authorized independent OOS must exercise provenance/extras and useful controls. No production integration is authorized here.
`);
const taxonomy=Object.entries(h.families).map(([k,n])=>`| ${k} | ${n} |`).join('\n');
const arms=m.arms.map(a=>`| ${a.id} | ${a.model} | ${a.meaning} | 16 | 0 | 16 HTTP 401 | ${metrics.initial_arm_medians_ms[a.id].toFixed(3)} |`).join('\n');
writeFileSync('docs/evaluations/STRUCTURED_REFLECTION_PROVIDER_RELIABILITY.md',`# Structured reflection provider reliability isolation

**RELIABILITY: FAIL; provider comparison INCOMPLETE. NO RELIABILITY CANDIDATE FOUND.** The exact schema is demonstrably incompatible with the tested DeepInfra endpoint. The planned comparative compliance screen was invalidated by a credential-loading mistake. No production model, prompt, schema or transaction ordering changed. No JSON repair or semantic OOS.

## Historical forensics before new calls

All 176 retained physical attempts were rechecked with exact JSON.parse and the unchanged typed schema: V2 48 (8 strict failures), V2.1 48 (9), V2.2 OOS 80 (33); total **126 strict usable, 50 failures**. V2.2 development replayed retained data and contains no additional fresh responses. Every failed content and its receipt are retained in historical-forensics.json. Older evaluation parse handling may have stripped fences; this audit does not.

| Failure family (overlapping) | Attempts |
|---|---:|
${taxonomy}

Markdown fences, analysis before envelope, invalid enum, unknown field, wrong nesting, empty invalid and provider/API invalid response: **0 historical examples**. Historical JSON parsing fails in 47 attempts; three parseable envelopes fail array constraints. Of 47 malformed outputs, 46 have trailing content after a complete first object. Several are punctuation or stray quotes, not explanatory prose. Multiple objects count separately; delimiter/unclosed categories overlap with trailing content and cannot be summed. Three length receipts overlap malformed/truncation; only one was a V2.2 first attempt, the others are retained retry attempts. All retained historical malformed content came through valid API wrappers, not HTTP/auth failures. Provider was Baidu for the historical retained responses.

The scanner recognizes complete-prefix JSON **for diagnostics only**, never promotes it to valid output. Unclosed structures without a length receipt are labeled unclosed, not proven token truncation. This taxonomy supports a content-enforcement problem more strongly than token starvation. Exact upstream causality for Baidu is unproven; no token or prompt change was made.

## Actual request and schema

Actual bodies include model, max_tokens 600, system/user messages, response_format type json_schema with name npc_reflection_v2, **strict:true**, and unchanged schema; provider require_parameters:true; reasoning exclude:true/enabled:false; stream:false. Frozen bodies contain no credentials. The client adds no content/schema transformation: it serializes the body with stream:false and rejects length/API errors. The corrected screen compares the actual outgoing serialized payload hash with the frozen body hash.

Schema: **4447 UTF-8 bytes**; rough chars/4 estimate 1112 tokens (**not tokenizer-measured**). Eight claim variants through anyOf (not oneOf), maximum instance nesting depth five, 10 object nodes, all closed with additionalProperties:false. 44 required property occurrences, zero optional properties, zero descriptions, zero nullable nodes. Root proposals length 0–3; prompt prefers at most two; refs length 1–8 and uniqueItems; selected statements length 2–8 with uniqueItems. Three simultaneous proposals may fit schema but increase output complexity. Unique-items enforcement appears on two array schemas. There are no long descriptions or nullable unions to blame.

Routing capability is not proof of exact keyword support. OpenRouter documents provider order/only/fallback controls and notes that strict enforcement varies: some providers guarantee conformity, others translate schema or treat it as a strong hint. Sources: [official structured-output docs](https://github.com/OpenRouterTeam/docs/blob/main/guides/features/structured-outputs.mdx), [official routing docs](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/provider-selection.mdx). Public endpoint snapshots obtained before dispatch advertise response_format and structured_outputs for DeepInfra and Alibaba. Metadata sources: [DeepSeek endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints), [Qwen endpoints](https://openrouter.ai/api/v1/models/qwen/qwen3.8-flash/endpoints). Capability metadata has no per-keyword schema guarantee.

## Frozen reliability corpus and arms

Sixteen frozen requests reuse V2.2 development bodies solely for reliability: one fixture and one complex scripted checkpoint per supported family (including parallel). Environmental fixture is empty-appropriate; self-statements use three/five available quotes. Other families include simple and complex multi-proposal opportunities. These are **not independent semantic OOS samples**. Exactly identical user JSON, prompt, schema, state and 600-token settings were supplied across arms; only model/routing differs. Requests/snapshots/catalogs/traces are embedded in the manifest.

Manifest SHA: \`${readFileSync(`${dir}/manifest.sha256`,'utf8').trim()}\`. Planned schedule was 48 interleaved first attempts, followed by one technical retry for eligible failures of the best arm, up to 64 generation requests. Selection was preregistered: most usable, then most nonempty, then cost, then ID; a universally empty/useless provider cannot qualify.

| Arm | Model | Routing | Calls | Exact envelopes | Failure | Median ms |
|---|---|---|---:|---:|---|---:|
${arms}

No model content or provider assignment was returned for these 48 calls. **Zero usable is an observed API outcome, not a measured model/schema compliance rate.** No malformed JSON, schema-invalid model object, length, valid empty or valid nonempty output occurred in any initial arm; proposal count 0. Cost receipts absent; reported spend sum USD 0, not a verified billing charge. The lexical ranking artifact chooses A only by a tie; **there is no empirical best arm**.

## Credential incident and bounded continuation

The initial shell extractor matched letters beyond the 64 hexadecimal key characters, including trailing file text. This produced 48 HTTP 401 User not found responses. The harness correctly performed no auth retries, but the batch should have halted after its first auth failure. This is an agent/harness mistake, not a provider compliance failure. All original receipts and write-ahead dispatch markers are preserved; none relabeled as model malformed outputs. No key was printed or stored in raw artifacts.

Exact hexadecimal extraction was subsequently verified with read-only key endpoint HTTP 200. The remaining **16 generation requests** were preregistered as a corrected-configuration, single-arm **B** screen, chosen before any model output because it holds the model constant while using an advertised structured-output endpoint. This is not the original comparative best arm. The same B request bodies were resubmitted with corrected credentials, outside the automatic technical-retry contract; the original 401 attempts remain counted and retained. No successful answer was rerolled, and the total cap remained 64. Continuation manifest: \`${readFileSync(`${dir}/continuation-manifest.sha256`,'utf8').trim()}\`.

All 16 corrected requests returned HTTP 200 with an OpenRouter **error wrapper**, code 400, saying:

> Upstream error from DeepInfra: Grammar error: Unimplemented keys: ["uniqueItems"]

This is a **provider/schema configuration error**, not malformed model JSON or semantic rejection. The pinned provider was identified by the error message; no choice/provider usage receipt was supplied. Strict usable **0/16**, model-generated nonempty/empty **0/0**, model proposals **0**, length **0**, content malformed/schema-invalid **0**. Median latency **${metrics.corrected_median_ms.toFixed(3)} ms**. No secondary retry was appropriate for nonretryable configuration failures and no generation budget remained. Recovered **0**; final usable **0/16 for the corrected screen**, which measures request incompatibility, not model compliance. Initial 48 plus corrected 16 = **64 total generation requests**, no further dispatch.

All 64 new responses lack usage/cost receipts; reported cost sum USD 0 with 64 missing billing receipts. Read-only endpoint discovery/credential checks are recorded separately from generation requests. There is no successful-envelope semantic sanity result to score. The correct conclusion is **no candidate found / incomplete valid comparison**, not proof that Qwen, Baidu or every tested model is universally unreliable.

## Recommendation and offline wire analysis

Do not switch production or select a next-OOS model from this run. Historical Baidu content failures and DeepInfra's explicit grammar error show two different blockers: unreliable content enforcement and unsupported schema keywords. Public supported-parameter flags did not establish keyword compatibility. A clean future screen must verify credentials and halt on auth/config errors, preserve per-endpoint raw error distinctions, and reserve enough budget for valid comparative arms and bounded retry.

An offline follow-up option is a **versioned provider-compatible wire projection** that omits unsupported uniqueItems while enforcing the unchanged full V2 schema (including uniqueness) locally before semantic validation. Duplicate refs/selectors would still be exact-envelope failures; no coercion or JSON repair. Retain discriminated closed claim variants, required fields, enum restrictions, subject/provenance validation and array limits. Flattening arbitrary payloads without equivalent local closedness would be unsafe. This is **analysis only**: no simplified schema, prompt patch, token increase or extra arm was dispatched. Investigate other keyword constraints per endpoint before choosing a projection. The explicit error implicates uniqueItems; it does not prove the eight-way union itself is unsupported.

V2.3 semantic development passes, so the next task should address **wire/provider/schema reliability only**, with a newly budgeted clean screen. Do not reopen semantic design or run another semantic OOS until a reliable frozen configuration is established. No recommended production/provider switch and no independent V2.3 OOS authorization from this incomplete screen. Screening targets remain >=95% first attempt and >=99% after one technical retry; with 16 requests both thresholds require 16/16, and even that would not establish statistical proof.

## Verification and retained evidence

Typecheck PASS; unit/integration **1947 passed, 0 failures, same 4 TODO (1951 total)**; playthrough **25/25**. Frozen V2.3 source/schema/prompt and V2/V2.1/V2.2 dependencies remain unchanged. Production reflection and publication ordering are unchanged. D-09 SOAK PENDING, D-26 OPEN — SHADOW DATA COLLECTION.

Ignored saves/structured-reflection-reliability stores endpoint snapshots, historical content taxonomy, frozen complete wire bodies/catalogs/states, initial and continuation manifests/hashes, raw HTTP/error receipts, write-ahead/physical ledgers, initial rankings (invalid for candidate selection), exact key-validation status only and final analysis. No credentials. Raw historical model content is diagnostic data. Complete dev evidence/tests are in saves/d09-reflection-v23. Report/harness/candidate/tests are committed; raw artifacts remain local and ignored.
`);
console.log(JSON.stringify(metrics,null,2));
