import { readFile,writeFile,mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { prepareD04BakeoffCases, type createBakeoffArtifact } from "./d04-compaction-bakeoff.js";
import { analyzeLosslessLayouts } from "../turn/lossless-context-compaction.js";
import { LOSSLESS_SCHEMA_VERSION,LOSSLESS_POLICY_VERSION,precomputeKnowledgeGroups,expandLosslessCandidate } from "../turn/lossless-knowledge.js";
import { LOSSLESS_COMPRESSOR_SYSTEM,LOSSLESS_COMPRESSOR_SCHEMA,losslessProviderRequest } from "../llm/lossless-compressor-provider.js";
import { requestBreakdown } from "./d04-compressor-benchmark.js";
import { narratorPackOf } from "../turn/narrator-pack.js";
import { ContextBudgetManager } from "../turn/context-budget.js";
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function prepareLosslessFixtures() {
  const live=await prepareD04BakeoffCases(),out=resolve("saves/d04-context/bakeoff-v2");await mkdir(out,{recursive:true});
  const summary=[];
  for(const label of ["A","B","C"] as const){
    const originalRaw=await readFile(resolve(`saves/d04-context/bakeoff/case-${label}.json`),"utf8"),original=JSON.parse(originalRaw) as ReturnType<typeof createBakeoffArtifact>;
    if(!isDeepStrictEqual(original.compression_request,live[label].compression_request) || !isDeepStrictEqual(original.narrator_validation_pack.request,live[label].narrator_validation_pack.request))throw new Error("Frozen V1 context differs from reconstructed live request");
    const request=live[label].narrator_validation_pack.request,pack=narratorPackOf(request)!,analysis=analyzeLosslessLayouts(request,new ContextBudgetManager(original.context_policy)),best=analysis.best;
    if(!best)throw new Error("No resource-safe legal V2 layout");
    const target=original.compression_request.target_budget_tokens;
    const rebuiltPack=narratorPackOf(best.request)!;
    const breakdown=requestBreakdown({...original,narrator_validation_pack:rebuiltPack});
    const oracle=expandLosslessCandidate(best.candidate,pack);if(!isDeepStrictEqual(oracle,pack.source.units))throw new Error("Expansion oracle failed");
    const artifact={label,schema_version:LOSSLESS_SCHEMA_VERSION,policy_version:LOSSLESS_POLICY_VERSION,compressor_system:LOSSLESS_COMPRESSOR_SYSTEM,compressor_schema:LOSSLESS_COMPRESSOR_SCHEMA,
      original_fixture_sha256:sha(originalRaw),source_hash:pack.source_hash,target,baseline:original.baseline,source:pack.source,
      legal_groups:precomputeKnowledgeGroups(pack),compression_request:losslessProviderRequest(pack,target,original.compression_request.reason),
      deterministic_grouped_baseline:best.budget,legal_lower_bound:best.budget,layouts:analysis.layouts.map(l=>({candidate:l.candidate,budget:l.budget,resource_safe:l.resource_safe})),
      validator_oracle:oracle,request:best.request,breakdown};
    const raw=JSON.stringify(artifact,null,2)+"\n";await writeFile(resolve(out,`case-${label}.json`),raw,"utf8");
    summary.push({case:label,schema:LOSSLESS_SCHEMA_VERSION,policy:LOSSLESS_POLICY_VERSION,fixture_sha256:sha(raw),original_fixture_sha256:sha(originalRaw),source_hash:pack.source_hash,
      before:original.baseline.estimated_tokens,target,deterministic_grouped:best.budget.estimated_tokens,legal_lower_bound:best.budget.estimated_tokens,layout:best.candidate.layout,
      target_met:best.budget.estimated_tokens<=target,margin:target-best.budget.estimated_tokens,groups:artifact.legal_groups.length,units:oracle.length,breakdown});
  }
  await writeFile(resolve(out,"manifest.json"),JSON.stringify({schema:LOSSLESS_SCHEMA_VERSION,policy:LOSSLESS_POLICY_VERSION,prompt_sha256:sha(LOSSLESS_COMPRESSOR_SYSTEM),schema_sha256:sha(JSON.stringify(LOSSLESS_COMPRESSOR_SCHEMA)),summary},null,2)+"\n","utf8");
  console.log(JSON.stringify(summary));return summary;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareLosslessFixtures();
