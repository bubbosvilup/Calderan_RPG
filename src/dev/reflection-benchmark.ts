/** Campaign-independent evaluation preflight and fail-fast. No production retry policy changes. */
export function exactBenchmarkCredential(input:{env?:string;fileText?:string}):string {
 if(input.env!==undefined){if(!/^sk-or-v1-[a-f0-9]{64}$/.test(input.env))throw Error('Invalid benchmark credential format');return input.env;}
 // Legacy local file contains surrounding text. Capture exactly the known fixed-width credential, never its suffix.
 const candidates=[...new Set([...input.fileText?.matchAll(/sk-or-v1-[a-f0-9]{64}/g)??[]].map(m=>m[0]))];
 if(candidates.length!==1)throw Error('Benchmark credential missing or ambiguous');
 const key=candidates[0]!;if(!/^sk-or-v1-[a-f0-9]{64}$/.test(key))throw Error('Invalid benchmark credential format');return key;
}
export async function benchmarkAuthentication(key:string,fetcher:typeof fetch=fetch):Promise<{valid:true;status:200}> {
 exactBenchmarkCredential({env:key});const response=await fetcher('https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
 if(response.status!==200){await response.body?.cancel();throw Error(`Benchmark authentication preflight failed HTTP ${response.status}`);}
 // Account details and credentials are neither returned nor stored.
 await response.body?.cancel();return {valid:true,status:200};
}
export type BenchmarkStop='AUTH'|'CONFIGURATION'|null;
export function benchmarkStop(status:number|undefined,body:unknown,providerCode?:string):BenchmarkStop {
 const error=(body&&typeof body==='object'?'error' in body?(body as {error?:unknown}).error:undefined:undefined) as {code?:unknown;message?:unknown}|undefined;
 const code=typeof error?.code==='number'?error.code:status;
 if(code===401||code===403||providerCode==='authentication_error')return 'AUTH';
 if(providerCode==='configuration_error'||code===400||code===404||code===422)return 'CONFIGURATION';
 if(typeof error?.message==='string'&&/grammar error|unimplemented keys|unsupported (?:model|provider|schema)|no endpoints|invalid schema/i.test(error.message))return 'CONFIGURATION';
 return null;
}
export class BenchmarkGate {
 calls=0;aborted=false;readonly stoppedArms=new Set<string>();
 constructor(readonly cap=64){}
 canDispatch(arm:string):boolean{return !this.aborted&&!this.stoppedArms.has(arm)&&this.calls<this.cap;}
 reserve(arm:string):number {if(!this.canDispatch(arm))throw Error('Benchmark dispatch blocked');return ++this.calls;}
 observe(arm:string,stop:BenchmarkStop){if(stop==='AUTH')this.aborted=true;else if(stop==='CONFIGURATION')this.stoppedArms.add(arm);}
}
/** All benchmark stages share this gate and inspect error receipts before the next dispatch. */
export async function runBenchmarkTasks<T extends {arm:string},R extends {stop:BenchmarkStop}>(tasks:readonly T[],run:(task:T,physical:number)=>Promise<R>,gate:BenchmarkGate):Promise<{task:T;result:R}[]> {
 const out:{task:T;result:R}[]=[];for(const task of tasks){if(!gate.canDispatch(task.arm))continue;const result=await run(task,gate.reserve(task.arm));out.push({task,result});gate.observe(task.arm,result.stop);}return out;
}
