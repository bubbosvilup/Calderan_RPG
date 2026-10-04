/** Generic technical reliability. This module never repairs output or decides semantic quality. */
import {ProviderError,normalizeProviderFailure,type ProviderFailureClass} from "./errors.js";
import {providerRetryReason,withProviderRetry,ProviderBudget,NO_RETRY_POLICY,type ProviderRetryPolicy,type ProviderAttemptRecord} from "./retry.js";
export type ProviderSubsystem="narrator"|"controller"|"reconciliation"|"reflection"|"extractor"|"shadow"|"compression"|"embedding";
export const PROVIDER_CRITICALITY:Readonly<Record<ProviderSubsystem,"critical"|"maintenance"|"diagnostic">>={narrator:"critical",controller:"critical",reconciliation:"critical",reflection:"maintenance",extractor:"maintenance",shadow:"diagnostic",compression:"maintenance",embedding:"maintenance"};
export function failureClass(error:unknown):ProviderFailureClass {
 if(error instanceof ProviderError)return normalizeProviderFailure(error);
 if(error instanceof SyntaxError)return"malformed_envelope";
 if(error instanceof Error&&"code"in error&&error.code==="stale_turn")return"stale_revision";
 return"parser_failure";
}
/** Technical failure only. Auth/config/refusal/cancellation, local errors and semantic rejection do not retry. */
export function technicalRetryReason(error:unknown):string|undefined {
 if(!(error instanceof ProviderError))return undefined;
 if(["configuration_error","authentication_error","model_refusal","cancelled"].includes(error.code)||error.failure_class==="http_nonretryable")return undefined;
 return providerRetryReason(error)??(["invalid_provider_response","structured_output_invalid"].includes(error.code)?failureClass(error):undefined);
}
export function invalidStructured(text:string,validate:(value:unknown)=>boolean):unknown {
 if(!text.trim())throw new ProviderError("structured_output_invalid",undefined,undefined,"empty_output");
 let value:unknown;try{value=JSON.parse(text);}catch{throw new ProviderError("structured_output_invalid",undefined,undefined,"malformed_envelope");}
 if(!validate(value))throw new ProviderError("structured_output_invalid",undefined,undefined,"schema_invalid");return value;
}
export class ReliabilityMetrics {
 readonly counters:Record<string,number>={};
 increment(name:string,n=1){this.counters[name]=(this.counters[name]??0)+n;}
 observe(subsystem:ProviderSubsystem,r:ProviderAttemptRecord){const critical=PROVIDER_CRITICALITY[subsystem]==="critical",prefix=critical?"critical":"maintenance";this.increment(`${prefix}_provider_calls`,r.attempts);this.increment(critical?"critical_technical_retries":"maintenance_retries",r.retry_reasons.length);if(r.recovered)this.increment(`${prefix}_retry_recoveries`);if(r.final_outcome!=="success")this.increment(critical?"critical_exhausted_failures":"maintenance_skips");for(const c of r.failure_classes??[])this.increment(`${c}_count`);}
}
/** Default maintenance budget: ONE attempt then skip. Optional explicit D-05 policy enables one retry. */
export async function maintenanceCall<T>(i:{subsystem:"reflection"|"extractor"|"compression";run:(timeout_ms:number|undefined)=>Promise<T>;checkpoint:()=>void;signal?:AbortSignal;policy?:ProviderRetryPolicy;metrics?:ReliabilityMetrics;record?:(r:ProviderAttemptRecord)=>void}):Promise<T>{
 const policy=i.policy??NO_RETRY_POLICY,signal=i.signal??new AbortController().signal;
 return withProviderRetry({policy,budget:new ProviderBudget(policy),signal,checkpoint:i.checkpoint,reason:technicalRetryReason,run:async(_attempt,timeout)=>{const result=await i.run(timeout);i.checkpoint();return result;},record:r=>{i.metrics?.observe(i.subsystem,r);i.record?.(r);}});
}
/** Diagnostic-only calls get no retries and never propagate provider failure. */
export async function diagnosticCall<T>(run:()=>Promise<T>,log:(failure:ProviderFailureClass)=>void):Promise<T|undefined>{try{return await run();}catch(error){try{log(failureClass(error));}catch{}return undefined;}}
export function diagnosticSync<T>(run:()=>T,log:(failure:ProviderFailureClass)=>void):T|undefined{try{return run();}catch(error){try{log(failureClass(error));}catch{}return undefined;}}
