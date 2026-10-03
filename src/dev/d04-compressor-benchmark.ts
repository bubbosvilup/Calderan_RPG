/** Evaluation only. Explicit six-call command; never used by production. Raw artifacts stay in saves/. */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { execFileSync } from "node:child_process";
import { createBakeoffArtifact, prepareD04BakeoffCases, evaluateBakeoffCandidate } from "./d04-compaction-bakeoff.js";
import { OpenRouterClient, type TransportRequest, type TransportEvent } from "../llm/openrouter/client.js";
import { OpenRouterContextCompressor } from "../llm/openrouter/context-compressor.js";
import { COMPRESSOR_SCHEMA, COMPRESSOR_SYSTEM, type CompressionResponse } from "../llm/context-compressor-provider.js";
import { ContextBudgetManager } from "../turn/context-budget.js";
import { NarratorContextCompactor, validateCompressionCandidate } from "../turn/context-compaction.js";
import { COMPRESSION_SCHEMA_VERSION, COMPRESSION_POLICY_VERSION, contextHash, narratorPackOf, renderCandidateRequest, type KnowledgeUnit } from "../turn/narrator-pack.js";
import type { GenerationMetadata } from "../llm/types.js";

export const BAKEOFF_MODELS = ["qwen/qwen3.8-flash", "openai/gpt-5.6-luna"] as const;
type Artifact = ReturnType<typeof createBakeoffArtifact>;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const failure = (error: unknown) => error instanceof Error ? error.message : "unknown_error";

/** An intentionally over-generous lower bound: even protected articles and mandatory whitespace are removed.
 * It is NOT a legal candidate and is never validated/activated. Any legal text needs at least these bytes. */
export function optimisticLowerBound(artifact: Artifact) {
  const units = artifact.compression_request.source_pack.units.map(u => ({ ...u,
    text: (u.text.match(/[\p{L}\p{N}_]+|[^\s]/gu) ?? []).filter(t => t !== "the").join("") }));
  return new ContextBudgetManager(artifact.context_policy).measure(renderCandidateRequest(artifact.narrator_validation_pack, units));
}

/** Concrete legal minimum for ordinary whitespace/article removal, keeping quoted/name spans verbatim. */
export function legalExtractiveCandidate(artifact: Artifact) {
  const names = artifact.narrator_validation_pack.access.characters.map(c => c.name);
  const units = artifact.compression_request.source_pack.units.map(u => {
    const spans = [...u.text.matchAll(/["\u201c][^"\u201d]+["\u201d]/g)].map(m => [m.index, m.index + m[0].length]);
    for (const name of names) { if (!name) continue; let at = 0; while ((at = u.text.indexOf(name, at)) >= 0) { spans.push([at, at + name.length]); at += name.length; } }
    return { ...u, text: u.text.replace(/\bthe\b\s*|\s+/g, (match, at: number) => spans.some(([a,b]) => at >= a! && at < b!) ? match : match.startsWith("the") ? "" : " ").trim() || u.text };
  });
  return validateCompressionCandidate({ version: artifact.schema_version, source_hash: artifact.compression_request.source_hash,
    context_identity: artifact.compression_request.context_identity, units }, artifact.narrator_validation_pack);
}

/** Disjoint serialized-message byte accounting. System reserve is reported separately, as in ContextBudgetManager. */
export function requestBreakdown(artifact: Artifact, units?: readonly KnowledgeUnit[]) {
  const pack = artifact.narrator_validation_pack;
  const request = units ? renderCandidateRequest(pack, units) : pack.request;
  const currentPack = units ? narratorPackOf(request)! : pack;
  const content = request.messages[0]!.content;
  const escapedBytes = (s: string) => Buffer.byteLength(JSON.stringify(s).slice(1,-1), "utf8");
  const scene = content.indexOf("[CURRENT AUTHORITATIVE SCENE]");
  const knowledge = currentPack.knowledge_start, knowledgeEnd = knowledge + currentPack.knowledge_block.length;
  const retrieval = content.indexOf("[RETRIEVED CANON ? AUTHORITATIVE FOR THIS QUERY]", knowledgeEnd);
  const retrievalEnd = content.indexOf("[UNESTABLISHED DETAILS]", retrieval);
  const recent = content.indexOf("[RECENT CONVERSATION ?", retrievalEnd);
  const player = content.indexOf("[PLAYER ACTION ? Nicco]", recent);
  if (!(scene >= 0 && knowledge > scene && retrieval > knowledgeEnd && retrievalEnd > retrieval && recent > retrievalEnd && player > recent)) throw new Error("Unsupported frozen layout");
  const bytes = { fixed_protected: escapedBytes(content.slice(0,scene) + content.slice(knowledgeEnd,retrieval) + content.slice(retrievalEnd,recent) + content.slice(player)),
    knowledge: escapedBytes(content.slice(knowledge,knowledgeEnd)), recent_conversation: escapedBytes(content.slice(recent,player)),
    retrieval_lore: escapedBytes(content.slice(retrieval,retrievalEnd)), scene_state: escapedBytes(content.slice(scene,knowledge)), other: 0 };
  const total = Buffer.byteLength(JSON.stringify(request.messages), "utf8");
  bytes.other = total - Object.values(bytes).reduce((a,b)=>a+b,0);
  return { serialized_message_bytes: total, estimated_tokens: new ContextBudgetManager(artifact.context_policy).measure(request).estimated_tokens,
    fixed_system_reserve_tokens: artifact.baseline.fixed_instructions_tokens, bytes,
    token_equivalents: Object.fromEntries(Object.entries(bytes).map(([k,v])=>[k,v/4])) };
}

class RecordingClient extends OpenRouterClient {
  metadata?: GenerationMetadata;
  override async *request(body: TransportRequest, streaming: boolean, timeout: number, signal?: AbortSignal): AsyncGenerator<TransportEvent> {
    for await (const event of super.request(body,streaming,timeout,signal)) { if (event.type === "completed") this.metadata = event.metadata; yield event; }
  }
}

export async function verifyBakeoffCache(artifact: Artifact, live: Artifact, model: string, response: CompressionResponse) {
  if (!isDeepStrictEqual(artifact.compression_request,live.compression_request) || !isDeepStrictEqual(artifact.narrator_validation_pack.request,live.narrator_validation_pack.request)) throw new Error("Live cache fixture differs from frozen artifact");
  let calls = 0, currentModel = model;
  const provider = { get model_id() { return currentModel; }, async compress() { calls++; return response; } };
  const policy: Record<keyof Artifact["compaction_policy"],number> = { ...artifact.compaction_policy };
  const service = new NarratorContextCompactor(provider,new ContextBudgetManager(artifact.context_policy),policy);
  const request = live.narrator_validation_pack.request;
  const first = await service.compact({ reason: artifact.compression_request.reason, request, current:()=>request });
  if (first.status !== "success") return { verified:false, detail:first.detail, status:first.status, offline_provider_calls:calls, paid_calls:0 };
  const again = await service.compact({ reason:artifact.compression_request.reason, request });
  const hit = again.diagnostics?.cache_hit === true && calls === 1;
  currentModel += "-changed"; const modelMiss = service.apply(request) === request; currentModel = model;
  const ratioField = artifact.compression_request.reason === "manual" ? "manual_ratio" : "normal_ratio";
  const originalRatio = policy[ratioField]; policy[ratioField] -= .01;
  const changedTarget = Math.floor(Math.min(artifact.baseline.usable_budget_tokens*policy.normal_ratio,
    artifact.compression_request.reason === "manual" ? artifact.baseline.estimated_tokens*policy.manual_ratio : Infinity));
  const targetMiss = changedTarget !== artifact.compression_request.target_budget_tokens && service.apply(request) === request;
  policy[ratioField] = originalRatio;
  policy.timeout_ms += 1; const policyMiss = service.apply(request) === request; policy.timeout_ms -= 1;
  const oldSource = live.narrator_validation_pack.source;
  const changedUnits = oldSource.units.map((u,i)=>i ? u : {...u,text:u.text+" Additional ledger marker."});
  const changedSource = {...oldSource,units:changedUnits};
  const changedPack = { ...live.narrator_validation_pack, source:changedSource,
    source_hash:contextHash({version:changedSource.version,context_identity:changedSource.context_identity,revision:changedSource.revision,units:changedUnits}) };
  const changedRequest = renderCandidateRequest(changedPack, changedPack.source.units);
  const changedSourceMiss = service.apply(changedRequest) === changedRequest;
  // Versions are immutable module constants; a changed deployed version starts a fresh service/cache.
  const fresh = new NarratorContextCompactor(provider,new ContextBudgetManager(artifact.context_policy),policy);
  const versionRestartMiss = fresh.apply(request) === request;
  return { verified:hit && modelMiss && targetMiss && policyMiss && changedSourceMiss && versionRestartMiss,
    cache_hit:hit, model_miss:modelMiss, source_miss:changedSourceMiss, target_miss:targetMiss, policy_miss:policyMiss,
    original_target:artifact.compression_request.target_budget_tokens, changed_target:changedTarget,
    version_restart_miss:versionRestartMiss, version_key_includes:[COMPRESSION_SCHEMA_VERSION,COMPRESSION_POLICY_VERSION],
    offline_provider_calls:calls, paid_calls:0 };
}

export async function runD04CompressorBenchmark() {
  if (process.env.CONTEXT_COMPRESSOR_MODEL?.trim()) throw new Error("Production compressor must remain UNSET");
  if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY missing");
  const out = resolve("saves/d04-context/bakeoff-results"); await mkdir(out,{recursive:true});
  const ledger = resolve(out,"attempt-ledger.json");
  try { await access(ledger); throw new Error("Existing attempt ledger: refusing to rerun paid samples"); } catch(error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const artifacts: Artifact[] = [], hashes: Record<string,string> = {};
  for (const label of ["A","B","C"]) {
    const raw = await readFile(resolve(`saves/d04-context/bakeoff/case-${label}.json`),"utf8");
    const a = JSON.parse(raw) as Artifact;
    if (a.schema_version !== COMPRESSION_SCHEMA_VERSION || a.policy_version !== COMPRESSION_POLICY_VERSION || a.compressor_system !== COMPRESSOR_SYSTEM || !isDeepStrictEqual(a.compressor_schema,COMPRESSOR_SCHEMA)) throw new Error("Frozen contract differs from main");
    if (!isDeepStrictEqual(new ContextBudgetManager(a.context_policy).measure(a.narrator_validation_pack.request),a.baseline)) throw new Error("Frozen baseline differs");
    artifacts.push(a); hashes[label] = sha(raw);
  }
  const prepared = await prepareD04BakeoffCases(), live = [prepared.A,prepared.B,prepared.C];
  for (let i=0;i<3;i++) if (!isDeepStrictEqual(artifacts[i]!.compression_request,live[i]!.compression_request)) throw new Error("Cannot reproduce frozen source for offline cache checks");
  const catalogResponse = await fetch("https://openrouter.ai/api/v1/models");
  if (!catalogResponse.ok) throw new Error("Catalog verification failed");
  const catalog = await catalogResponse.json() as {data:{id:string; canonical_slug?:string; pricing:unknown; supported_parameters:string[]; reasoning?:unknown}[]};
  const models = BAKEOFF_MODELS.map(id=>{ const m=catalog.data.find(x=>x.id===id); return { id, available:!!m, ...(m ? {canonical_slug:m.canonical_slug,pricing:m.pricing,supported_parameters:m.supported_parameters,reasoning:m.reasoning} : {}) }; });
  const main = execFileSync("git",["rev-parse","main"],{encoding:"utf8"}).trim();
  const manifest = { frozen_at:new Date().toISOString(), main_commit:main, fixture_sha256:hashes,
    prompt_sha256:sha(COMPRESSOR_SYSTEM), schema_sha256:sha(JSON.stringify(COMPRESSOR_SCHEMA)), schema_version:COMPRESSION_SCHEMA_VERSION, policy_version:COMPRESSION_POLICY_VERSION,
    models, catalog_url:"https://openrouter.ai/api/v1/models", paid_call_cap:6, attempts_per_cell:1, retries:0, backoff_ms:0,
    transport_adjustments:[], production_compressor:"UNSET", ordering:"case A,B,C; Qwen then Luna", validation:"real Pass-2 validator/render/budget; min saving 64; no retries or stronger semantic rerolls" };
  await writeFile(resolve(out,"frozen-manifest.json"),json(manifest),"utf8");
  const attempts: {case:string;model:string;started_at:string}[] = [];
  const cells: Record<string,unknown>[] = [];
  for (const [i,a] of artifacts.entries()) for (const model of models) {
    if (!model.available) { cells.push({case:a.label, model:model.id, compatibility_failure:"Exact model absent from catalog", attempts:0}); continue; }
    if (attempts.length >= 6) throw new Error("Paid call cap reached");
    const stem = `case-${["A","B","C"][i]}-${model.id.startsWith("qwen/") ? "qwen":"luna"}`;
    attempts.push({case:a.label,model:model.id,started_at:new Date().toISOString()});
    await writeFile(ledger,json(attempts),"utf8");
    let rawBody: Record<string,any> | undefined, httpStatus: number | undefined;
    const client = new RecordingClient({fetch:async (url,init)=>{
      // Never serialize headers or credentials.
      await writeFile(resolve(out,`${stem}-request.json`),String(init?.body),"utf8");
      const result = await fetch(url,init); httpStatus=result.status;
      const raw = await result.clone().text(); await writeFile(resolve(out,`${stem}-response.json`),raw,"utf8");
      try { rawBody=JSON.parse(raw); } catch { /* malformed transport JSON is recorded verbatim */ }
      return result;
    }});
    const started=performance.now(); let response:CompressionResponse | undefined, error:string | undefined;
    try { response=await new OpenRouterContextCompressor(model.id,client).compress(a.compression_request); } catch(e) { error=failure(e); }
    const generation_ms=performance.now()-started;
    const evaluation=response ? evaluateBakeoffCandidate(a,response,generation_ms) : undefined;
    const cache=evaluation?.accepted ? await verifyBakeoffCache(a,live[i]!,model.id,response!) : null;
    const cell = {case:a.label,model:model.id, provider:rawBody?.provider ?? client.metadata?.provider ?? null, returned_model:rawBody?.model ?? null,
      generation_id:rawBody?.id ?? null, attempts:1,retries:0,backoff_ms:0,http_status:httpStatus ?? null, transport_error:error ?? null,
      generation_ms:client.metadata?.latency.elapsed_total_ms ?? generation_ms, end_to_end_ms:performance.now()-started, latency:client.metadata?.latency ?? null,
      input_tokens:rawBody?.usage?.prompt_tokens ?? response?.usage?.prompt_tokens ?? null,
      output_tokens:rawBody?.usage?.completion_tokens ?? response?.usage?.completion_tokens ?? null,
      reported_cost_usd:rawBody?.usage?.cost ?? response?.cost_usd ?? null, finish_reason:rawBody?.choices?.[0]?.finish_reason ?? null,
      empty_response:rawBody?.choices?.[0]?.message?.content === "", evaluation:evaluation ?? null, cache,
      semantic_review:evaluation?.validator_pass ? "PENDING MANUAL REVIEW":"NOT ACCEPTED" };
    cells.push(cell); await writeFile(resolve(out,`${stem}-result.json`),json(cell),"utf8");
    await writeFile(resolve(out,"summary.json"),json({manifest,paid_calls:attempts.length,cells}),"utf8");
    console.log(JSON.stringify(cell));
  }
  const c=artifacts[2]!, legal=legalExtractiveCandidate(c), legalBudget=new ContextBudgetManager(c.context_policy).measure(renderCandidateRequest(c.narrator_validation_pack,legal.units));
  const analysis = { target:c.compression_request.target_budget_tokens, baseline:c.baseline, optimistic_lower_bound:optimisticLowerBound(c),
    concrete_legal_article_removal:legalBudget, baseline_breakdown:requestBreakdown(c), legal_breakdown:requestBreakdown(c,legal.units),
    mathematical_target_possible:optimisticLowerBound(c).estimated_tokens <= c.compression_request.target_budget_tokens ? "not disproven":"NO",
    interpretation:"Lower bound even drops protected articles and all whitespace; legal output cannot be smaller. Not a model sample or activated candidate." };
  await writeFile(resolve(out,"case-C-analysis.json"),json(analysis),"utf8");
  console.log(JSON.stringify({analysis,paid_calls:attempts.length}));
  return {manifest,paid_calls:attempts.length,cells,analysis};
}

/** Offline postmortem: recover fidelity diagnostics for a recorded late body without accepting the timed-out call. */
export async function analyzeSavedD04Benchmark() {
  const out=resolve("saves/d04-context/bakeoff-results");
  const manifest=JSON.parse(await readFile(resolve(out,"frozen-manifest.json"),"utf8"));
  if (manifest.prompt_sha256!==sha(COMPRESSOR_SYSTEM) || manifest.schema_sha256!==sha(JSON.stringify(COMPRESSOR_SCHEMA))) throw new Error("Contract changed since freeze");
  const prepared=await prepareD04BakeoffCases(), live=[prepared.A,prepared.B,prepared.C];
  const cells=[];
  for (const [i,label] of ["A","B","C"].entries()) {
    const raw=await readFile(resolve(`saves/d04-context/bakeoff/case-${label}.json`),"utf8");
    if (sha(raw)!==manifest.fixture_sha256[label]) throw new Error("Frozen fixture changed");
    const artifact=JSON.parse(raw) as Artifact;
    for (const model of BAKEOFF_MODELS) {
      const stem=`case-${label}-${model.startsWith("qwen/") ? "qwen":"luna"}`;
      const result=JSON.parse(await readFile(resolve(out,`${stem}-result.json`),"utf8"));
      let postmortem:ReturnType<typeof evaluateBakeoffCandidate>|null=null, cache:unknown=null;
      if (result.generation_id && result.transport_error) {
        const body=JSON.parse(await readFile(resolve(out,`${stem}-response.json`),"utf8"));
        postmortem=evaluateBakeoffCandidate(artifact,{candidate:body.choices?.[0]?.message?.content},result.generation_ms);
        if (postmortem.accepted) cache=await verifyBakeoffCache(artifact,live[i]!,model,{candidate:body.choices[0].message.content});
      }
      let providerGeneration:null|{generation_time_ms:number|null;latency_ms:number|null;total_cost_usd:number|null}=null;
      try { const body=JSON.parse(await readFile(resolve(out,`${stem}-generation.json`),"utf8"));
        providerGeneration={generation_time_ms:body.data?.generation_time ?? null,latency_ms:body.data?.latency ?? null,total_cost_usd:body.data?.total_cost ?? null};
      } catch(error) { if ((error as NodeJS.ErrnoException).code!=="ENOENT") throw error; }
      cells.push({...result,case:label,postmortem,offline_postmortem_cache:cache,provider_generation:providerGeneration,
        production_eligible:!result.transport_error && result.evaluation?.accepted===true,
        baseline_tokens:artifact.baseline.estimated_tokens,target_tokens:artifact.compression_request.target_budget_tokens,
        before_usage_percent:artifact.baseline.usage_percent,
        // Set by the reviewer in the public summary after inspecting every accepted unit.
        semantic_review:result.transport_error ? (postmortem?.validator_pass ? "PENDING MANUAL REVIEW (late body)":"NOT ACCEPTED") : result.semantic_review});
    }
  }
  const analysis=JSON.parse(await readFile(resolve(out,"case-C-analysis.json"),"utf8"));
  const knownCost=cells.reduce((sum,c)=>sum+(c.reported_cost_usd ?? 0),0), missingCost=cells.filter(c=>c.reported_cost_usd===null).length;
  const summary={manifest,paid_calls:cells.reduce((sum,c)=>sum+c.attempts,0),retries:0,reported_cost_usd:knownCost,
    unreported_cost_calls:missingCost,exact_total_cost_usd:missingCost ? null:knownCost,cells,analysis,
    recommendation:"CURRENT CONTRACT/TARGET NEEDS REVISION",production_compressor_changed:false};
  await writeFile(resolve(out,"review-summary.json"),json(summary),"utf8");
  console.log(JSON.stringify({paid_calls:summary.paid_calls,reported_cost_usd:knownCost,unreported_cost_calls:missingCost,
    cells:cells.map(c=>({case:c.case,model:c.model,eligible:c.production_eligible,postmortem:c.postmortem?.validator_pass,cache:c.offline_postmortem_cache}))}));
  return summary;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--analyze-saved")) await analyzeSavedD04Benchmark();
  else if (process.argv.includes("--run-six-paid-calls")) await runD04CompressorBenchmark();
  else throw new Error("Use --analyze-saved (offline) or --run-six-paid-calls (maximum six requests, no retries)");
}
