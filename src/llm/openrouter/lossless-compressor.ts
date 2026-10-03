import { ProviderError } from "../errors.js";
import type { CompressionRequest, CompressionResponse, ContextCompressorProvider } from "../context-compressor-provider.js";
import { LOSSLESS_COMPRESSOR_SYSTEM, LOSSLESS_COMPRESSOR_SCHEMA,losslessProviderRequest } from "../lossless-compressor-provider.js";
import { OpenRouterClient } from "./client.js";
/** Explicit-model V2 transport only. Production deterministic compaction does not call it. */
export class OpenRouterLosslessCompressor implements ContextCompressorProvider {
  constructor(readonly model_id:string,private readonly client=new OpenRouterClient()){if(!model_id.trim())throw new ProviderError("configuration_error");}
  async compress(request:CompressionRequest):Promise<CompressionResponse> {
    const payload=losslessProviderRequest({source:request.source_pack,source_hash:request.source_hash},request.target_budget_tokens,request.reason);let text="";
    for await(const event of this.client.request({model:this.model_id,max_tokens:Math.min(4096,Math.max(512,payload.legal_groups.length*16)),
      messages:[{role:"system",content:LOSSLESS_COMPRESSOR_SYSTEM},{role:"user",content:JSON.stringify(payload)}],
      response_format:{type:"json_schema",json_schema:{name:"lossless_context_compression",strict:true,schema:LOSSLESS_COMPRESSOR_SCHEMA}},provider:{require_parameters:true},reasoning:{exclude:true,enabled:false}},false,20_000,request.signal)){
      if(event.type==="text_delta")text+=event.text;else return {candidate:text,usage:event.metadata.usage,...(event.metadata.cost_usd===undefined?{}:{cost_usd:event.metadata.cost_usd})};
    }throw new ProviderError("invalid_provider_response");
  }
}
