import { ContextBudgetManager } from "./context-budget.js";
import { DEFAULT_COMPACTION_POLICY, type CompactionPolicy, type CompactionResult, type ContextCompactionService, type CompactionReason } from "./context-compaction.js";
import { contextHash, narratorPackOf } from "./narrator-pack.js";
import { losslessCandidate, LOSSLESS_LAYOUTS, losslessCacheIdentity, renderLosslessCandidate, type LosslessCandidate } from "./lossless-knowledge.js";
import type { ContextCompressorProvider } from "../llm/context-compressor-provider.js";
import type { NarratorRequest } from "./stages/narration.js";
import { REQUEST_RESOURCE_CHARACTERS } from "../types/resource-limits.js";
export function analyzeLosslessLayouts(request:NarratorRequest,manager=new ContextBudgetManager()) {
  const pack=narratorPackOf(request);if(!pack)throw new Error("Annotated narrator request required");
  const layouts=LOSSLESS_LAYOUTS.map(layout=>{const candidate=losslessCandidate(pack,layout),rebuilt=renderLosslessCandidate(pack,candidate);
    return {candidate,request:rebuilt,budget:manager.measure(rebuilt),resource_safe:JSON.stringify(rebuilt).length<=REQUEST_RESOURCE_CHARACTERS};});
  const legal=layouts.filter(l=>l.resource_safe && !l.budget.hard_limit_reached);
  return {baseline:manager.measure(request),layouts,best:legal.sort((a,b)=>a.budget.estimated_tokens-b.budget.estimated_tokens)[0]};
}
/** Model-free first; the finite precomputed layout minimum proves when a provider cannot improve the target.
 * All cache/activation state is narrator-only and ephemeral. No production model is required or selected. */
export class LosslessContextCompactor implements ContextCompactionService {
  readonly #cache=new Map<string,{candidate:LosslessCandidate;target:number}>();
  readonly #active=new Map<string,string>(); #busy=false;
  constructor(readonly provider:ContextCompressorProvider|undefined,readonly manager=new ContextBudgetManager(),readonly policy:CompactionPolicy=DEFAULT_COMPACTION_POLICY) {
    if(!(0<policy.strong_ratio && policy.strong_ratio<policy.normal_ratio && policy.normal_ratio<manager.policy.auto && 0<policy.manual_ratio && policy.manual_ratio<1) || ![policy.min_saving_tokens,policy.cache_capacity,policy.timeout_ms,policy.max_attempts].every(n=>Number.isSafeInteger(n)&&n>0) || policy.max_attempts>2)throw new Error("Invalid compaction policy");
  }
  apply(request:NarratorRequest):NarratorRequest {
    const pack=narratorPackOf(request);if(!pack)return request;
    const key=this.#active.get(pack.source_hash),entry=key?this.#cache.get(key):undefined;
    if(!entry || key!==losslessCacheIdentity(pack,this.provider?.model_id,entry.target,this.policy,this.manager.policy))return request;
    try {const next=renderLosslessCandidate(pack,entry.candidate),budget=this.manager.measure(next);
      return budget.estimated_tokens<this.manager.measure(request).estimated_tokens && budget.estimated_tokens<=entry.target && !budget.hard_limit_reached && JSON.stringify(next).length<=REQUEST_RESOURCE_CHARACTERS ? next:request;
    } catch{return request;}
  }
  async compact(input:{reason:CompactionReason;request:NarratorRequest;current?:()=>NarratorRequest|undefined;signal?:AbortSignal}):Promise<CompactionResult> {
    if(this.#busy)return {status:"failed",reason:input.reason,detail:"Compaction is already in progress."};
    this.#busy=true;
    try {
      const started=performance.now(),pack=narratorPackOf(input.request),before=this.manager.measure(input.request),initialHash=contextHash(input.request);
      const target=Math.floor(Math.min(before.usable_budget_tokens*this.policy.normal_ratio,input.reason==="manual"?before.estimated_tokens*this.policy.manual_ratio:Infinity));
      const result=(status:CompactionResult["status"],detail:string,request=input.request,hit=false):CompactionResult=>{
        const after=this.manager.measure(request);return {status,reason:input.reason,detail,diagnostics:{before_estimated_tokens:before.estimated_tokens,after_estimated_tokens:after.estimated_tokens,before_usage_percent:before.usage_percent,after_usage_percent:after.usage_percent,compression_ratio:after.estimated_tokens/before.estimated_tokens,source_hash:pack?.source_hash??"",cache_hit:hit,compression_level:1,target_budget_tokens:target,duration_ms:performance.now()-started,...(this.provider?{compressor_model:this.provider.model_id}:{})}};};
      if(!pack || !pack.source.units.length)return result("no_op","No compactable knowledge units.");
      const cached=this.apply(input.request);if(cached!==input.request)return result("no_op","Validated V2 cache reused; no provider call.",cached,true);
      if(input.reason==="auto" && !before.compaction_required)return result("no_op","Context below automatic threshold.");
      const analysis=analyzeLosslessLayouts(input.request,this.manager),best=analysis.best;
      if(!best || before.estimated_tokens-best.budget.estimated_tokens<this.policy.min_saving_tokens)return result("no_op","No material safe grouping reduction.");
      if(best.budget.estimated_tokens>target)return result("insufficient","Finite legal V2 layout minimum exceeds target; provider cannot improve it.");
      const current=input.current?.();
      if(input.signal?.aborted || contextHash(input.request)!==initialHash || (input.current && (!current || narratorPackOf(current)?.source_hash!==pack.source_hash || contextHash(current)!==initialHash)))return result("failed","Source changed or compaction cancelled; old representation retained.");
      const key=losslessCacheIdentity(pack,this.provider?.model_id,target,this.policy,this.manager.policy);
      // No await from freshness check through activation. Expansion and full measurement already passed.
      this.#cache.set(key,{candidate:best.candidate,target});this.#active.set(pack.source_hash,key);
      while(this.#cache.size>this.policy.cache_capacity){const first=this.#cache.keys().next().value!;this.#cache.delete(first);for(const [hash,active]of this.#active)if(active===first)this.#active.delete(hash);}
      return result("success","Lossless V2 deterministic layout activated; zero provider calls.",best.request);
    }catch{return {status:"failed",reason:input.reason,detail:"Lossless validation/build failed; old representation retained."};}
    finally{this.#busy=false;}
  }
}
