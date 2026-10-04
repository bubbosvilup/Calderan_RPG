/** D-09 reflection provider/schema bake-off: evaluation-only helpers. Production code is imported, never modified. Credentials come only from the process environment. */
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {OpenRouterClient} from '../../../.build/src/llm/openrouter/client.js';
import {REFLECTION_SYSTEM,REFLECTION_SCHEMA,parseReflectionOutput,validateProposals} from '../../../.build/src/turn/reflection.js';
import {REFLECTION_LIMITS} from '../../../.build/src/campaign/validation.js';
import {DEFAULT_REFLECTION_MODEL} from '../../../.build/src/llm/openrouter/reflection-provider.js';

export const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export const MODELS={deepseek:DEFAULT_REFLECTION_MODEL,qwen:'qwen/qwen3.8-flash'};
export {REFLECTION_SYSTEM,REFLECTION_SCHEMA,REFLECTION_LIMITS,parseReflectionOutput,validateProposals};

/**
 * reflection-schema-v2-eval: mirrors EXISTING deterministic shape constraints (validateProposals `shapeOk` + parseReflectionOutput) as far as JSON Schema can.
 *  - label: /^[a-z][a-z0-9]*(?:_[a-z0-9]+){0,3}$/ and length <= REFLECTION_LIMITS.label (validator regex copied verbatim; ASCII only, so no Unicode ambiguity).
 *  - text: 1..REFLECTION_LIMITS.text characters (validator limit 200, NOT the prompt's softer 160), non-blank.
 *  - evidence_refs: 1..REFLECTION_LIMITS.evidence_refs distinct strings; proposals: at most 6 (parse limit).
 * Authority checks (evidence existence, recurrence, inference, persons...) are NOT expressible and stay in the validator.
 */
export const LABEL_PATTERN='^[a-z][a-z0-9]*(?:_[a-z0-9]+){0,3}$';
export const TEXT_NONBLANK_PATTERN='^\\s*\\S[\\s\\S]*$';
export function strictSchema({nonblankText=false,unique=false}={}){
  const text={type:'string',minLength:1,maxLength:REFLECTION_LIMITS.text,...(nonblankText?{pattern:TEXT_NONBLANK_PATTERN}:{})};
  return {type:'object',additionalProperties:false,required:['proposals'],properties:{proposals:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['kind','label','text','evidence_refs','confidence'],properties:{
    kind:REFLECTION_SCHEMA.properties.proposals.items.properties.kind,
    label:{type:'string',minLength:1,maxLength:REFLECTION_LIMITS.label,pattern:LABEL_PATTERN},
    text,
    evidence_refs:{type:'array',minItems:1,maxItems:REFLECTION_LIMITS.evidence_refs,...(unique?{uniqueItems:true}:{}),items:{type:'string'}},
    confidence:REFLECTION_SCHEMA.properties.proposals.items.properties.confidence}}}}};
}
export const SCHEMAS={current:REFLECTION_SCHEMA,strict:strictSchema()};

/** Minimal JSON-Schema checker for exactly the keywords used above (no ajv dependency). Returns a list of violations. */
export function schemaViolations(schema,value,path='$'){
  const out=[];const t=schema.type;
  const typeOk=t==='object'?(value&&typeof value==='object'&&!Array.isArray(value)):t==='array'?Array.isArray(value):t==='string'?typeof value==='string':true;
  if(!typeOk)return [`${path}: type ${t}`];
  if(schema.enum&&!schema.enum.includes(value))out.push(`${path}: enum`);
  if(t==='string'){
    if(schema.minLength!==undefined&&value.length<schema.minLength)out.push(`${path}: minLength`);
    if(schema.maxLength!==undefined&&value.length>schema.maxLength)out.push(`${path}: maxLength ${value.length}>${schema.maxLength}`);
    if(schema.pattern&&!new RegExp(schema.pattern).test(value))out.push(`${path}: pattern`);
  }
  if(t==='array'){
    if(schema.maxItems!==undefined&&value.length>schema.maxItems)out.push(`${path}: maxItems`);
    if(schema.minItems!==undefined&&value.length<schema.minItems)out.push(`${path}: minItems`);
    if(schema.uniqueItems&&new Set(value).size!==value.length)out.push(`${path}: uniqueItems`);
    if(schema.items)value.forEach((v,i)=>out.push(...schemaViolations(schema.items,v,`${path}[${i}]`)));
  }
  if(t==='object'){
    for(const k of schema.required??[])if(!(k in value))out.push(`${path}: missing ${k}`);
    if(schema.additionalProperties===false)for(const k of Object.keys(value))if(!(k in (schema.properties??{})))out.push(`${path}: extra ${k}`);
    for(const [k,s] of Object.entries(schema.properties??{}))if(k in value)out.push(...schemaViolations(s,value[k],`${path}.${k}`));
  }
  return out;
}

const rawJson=r=>{try{return JSON.parse(r.body);}catch{return undefined;}};
export const rawCost=r=>{const j=rawJson(r);const c=j?.usage?.cost;return typeof c==='number'?c:0;};
export const rawProvider=r=>rawJson(r)?.provider;
/** Provider-reported spend over EVERY ledger under saves/ (task-level hard stop, well under the user's USD 8.00 ceiling). */
export const TASK_CAP_USD=5.5;
export function globalSpent(){let t=0;const walk=d=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=`${d}/${e.name}`;if(e.isDirectory())walk(p);else if(e.name==='ledger.jsonl')for(const l of readFileSync(p,'utf8').split('\n').filter(Boolean)){try{t+=JSON.parse(l).cost_usd??0;}catch{}}}};
  for(const d of ['saves/d09-reflection-bakeoff','saves/d09-reflection-candidate-e2e'])if(existsSync(d))walk(d);return t;}
/** Spend ledger shared by every physical call; refuses to start a call that could pass the cap. */
export class Ledger{
  constructor(dir,{cap_usd,start_total_usage}){this.dir=dir;this.cap=cap_usd;this.spent=0;this.calls=0;mkdirSync(dir,{recursive:true});this.file=`${dir}/ledger.jsonl`;
    if(existsSync(this.file)){for(const l of readFileSync(this.file,'utf8').split('\n').filter(Boolean)){const r=JSON.parse(l);this.spent+=r.cost_usd??0;this.calls++;}}}
  guard(estimate=0.01){if(this.spent+estimate>this.cap)throw new Error(`BUDGET_STOP spent=${this.spent.toFixed(6)} cap=${this.cap}`);
    const g=globalSpent();if(g+estimate>TASK_CAP_USD)throw new Error(`TASK_BUDGET_STOP global=${g.toFixed(4)} cap=${TASK_CAP_USD}`);}
  record(entry){this.spent+=entry.cost_usd??0;this.calls++;appendFileSync(this.file,JSON.stringify(entry)+'\n');}
}

/** One logical reflection call exactly as production builds it (OpenRouterReflectionProvider body), with an overridable model/schema. Transport retry only. */
export async function reflectCall({model,schema,request,ledger,tag,max_tokens=600,timeout_ms=60000,maxAttempts=3,extra={},system=REFLECTION_SYSTEM}){
  let rawCapture={};
  const client=new OpenRouterClient({fetch:async(url,init)=>{const res=await fetch(url,init);try{rawCapture={status:res.status,body:await res.clone().text()};}catch{rawCapture={status:res.status};}return res;}});
  const body={model,max_tokens,messages:[{role:"system",content:system},{role:'user',content:JSON.stringify({character:request.character,evidence:request.evidence,existing_notes:request.existing})}],
    response_format:{type:'json_schema',json_schema:{name:'npc_reflection',strict:true,schema}},provider:{require_parameters:true},reasoning:{exclude:true,enabled:false},...extra};
  const attempts=[];let result;
  for(let n=1;n<=maxAttempts;n++){
    ledger.guard();
    const a={n,started_at:new Date().toISOString()};let text='';rawCapture={};
    try{
      for await(const e of client.request(body,false,timeout_ms)){if(e.type==='text_delta')text+=e.text;else{a.metadata=e.metadata;}}
      a.ok=true;a.text=text;a.raw=rawCapture;ledger.record({tag,model,attempt:n,ok:true,cost_usd:a.metadata?.cost_usd??rawCost(rawCapture),upstream:a.metadata?.provider,usage:a.metadata?.usage,elapsed_ms:a.metadata?.latency?.elapsed_total_ms});attempts.push(a);result=a;break;
    }catch(e){
      a.ok=false;a.error=e.code??e.message;a.latency=e.latency;a.raw=rawCapture;attempts.push(a);
      ledger.record({tag,model,attempt:n,ok:false,error:a.error,cost_usd:rawCost(rawCapture),upstream:rawProvider(rawCapture),http_status:rawCapture.status,elapsed_ms:e.latency?.elapsed_total_ms});
      if(!['provider_unavailable','rate_limited','timeout'].includes(a.error))break;
      await new Promise(r=>setTimeout(r,2000*2**(n-1)));
    }
  }
  return {body_sha:sha(body),attempts,final:result??null,error:result?null:attempts.at(-1)?.error};
}

/** Flat summary of one logical call (last physical attempt): upstream provider, finish reason, HTTP status, cost, text. */
export function describeCall(r){
  const a=r.attempts?.at(-1)??{},j=rawJson(a.raw??{});
  return {upstream:j?.provider??null,finish:j?.choices?.[0]?.finish_reason??null,status:a.raw?.status??null,cost:a.metadata?.cost_usd??rawCost(a.raw??{}),text:r.final?.text??null,error:r.error??null,physical_attempts:r.attempts?.length??0};
}

/** fetch wrapper for any OpenRouterClient: records status/provider/cost of EVERY physical HTTP call (streaming or not, success or failure) into the ledger. */
export function meteredFetch(ledger,family,ctx={}){
  return async(url,init)=>{
    ledger.guard(0.02);
    const started=Date.now();let res;
    try{res=await fetch(url,init);}catch(e){ledger.record({tag:family,turn:ctx.turn,ok:false,error:String(e.code??e.message),cost_usd:0});throw e;}
    let model;try{model=JSON.parse(init.body).model;}catch{}
    const dec=new TextDecoder();let buf='';
    let done=false;const finish=()=>{if(done)return;done=true;const body=buf;
      const costs=[...body.matchAll(/"cost":\s*([0-9.eE+-]+)/g)].map(m=>Number(m[1]));const prov=[...body.matchAll(/"provider":\s*"([^"]+)"/g)].map(m=>m[1]);
      const fin=[...body.matchAll(/"finish_reason":\s*"([^"]+)"/g)].map(m=>m[1]).at(-1);
      ledger.record({tag:family,turn:ctx.turn,model,ok:res.ok,http_status:res.status,cost_usd:costs.length?costs.at(-1):(res.ok?null:0),upstream:prov[0],finish:fin,elapsed_ms:Date.now()-started});};
    if(!res.body){finish();return res;}
    const tee=new TransformStream({transform(chunk,ctl){buf+=dec.decode(chunk,{stream:true});ctl.enqueue(chunk);if(buf.includes('[DONE]'))finish();},flush(){buf+=dec.decode();finish();},cancel(){finish();}});
    return new Response(res.body.pipeThrough(tee),{status:res.status,statusText:res.statusText,headers:res.headers});
  };
}
/** Mirrors reflectAfterTurn's per-character derivations so a frozen request can be re-validated offline with the UNCHANGED validator. */
export function validationContext(world,snapshot,characterId,characterView){
  const nameOf=x=>characterView(snapshot,world,x).profile.name??snapshot.characters.find(c=>c.id===x)?.origin_snapshot?.label??x;
  const knownNames=[...new Map([...snapshot.characters.flatMap(c=>c.profile.name?[[c.id,c.profile.name]]:[]),...world.getEntitiesByType('character').map(e=>[e.id,e.name])].filter(([,n])=>n.length>=3))];
  const worldWords=[...new Set(world.listEntities().filter(e=>e.type!=='character').flatMap(e=>[e.name,e.display_name]).flatMap(n=>(n??'').toLowerCase().split(/\s+/)).filter(w=>w.length>=3))];
  return {character:{id:characterId,name:nameOf(characterId)},knownNames,worldWords};
}

const labelWords=l=>typeof l==='string'?l.split(/[_\s]+/).filter(Boolean).length:null;
/** Decompose the production shape predicate so a shape reject is attributable to a specific constraint (pure restatement of validateProposals' shapeOk). */
export function shapeFaults(p){
  const f=[];const KINDS=['stance','signature_pattern','shared_motif','emerging_role','unresolved_tension'];
  if(!p||typeof p!=='object')return ['not_object'];
  if(!Object.keys(p).every(k=>['kind','label','text','evidence_refs','confidence'].includes(k)))f.push('extra_keys');
  if(!KINDS.includes(p.kind))f.push('kind');
  if(typeof p.label!=='string')f.push('label_type');else{if(!new RegExp(LABEL_PATTERN).test(p.label))f.push(labelWords(p.label)>4?'label_words>4':'label_pattern');if(p.label.length>REFLECTION_LIMITS.label)f.push('label_length>32');}
  if(typeof p.text!=='string'||!p.text.trim().length)f.push('text_blank');else if(p.text.length>REFLECTION_LIMITS.text)f.push('text_length>200');
  if(!['low','medium','high'].includes(p.confidence))f.push('confidence');
  if(!Array.isArray(p.evidence_refs)||!p.evidence_refs.length||p.evidence_refs.length>REFLECTION_LIMITS.evidence_refs||!p.evidence_refs.every(x=>typeof x==='string')||new Set(p.evidence_refs).size!==p.evidence_refs.length)f.push('evidence_refs');
  return f;
}
