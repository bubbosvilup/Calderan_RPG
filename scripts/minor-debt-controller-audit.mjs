import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseControllerEvidenceProposal, parseControllerProposal, normalizeControllerOutput, CONTROLLER_EVIDENCE_SCHEMA } from '../.build/src/llm/controller-schema.js';
// Receipt replay only: no clients, providers, credentials or network.
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const schemaHash=hash(CONTROLLER_EVIDENCE_SCHEMA), rows=[];
for(const dir of ['saves/d09-final-campaign-soak','saves/d09-final-matched-ablation','saves/d09-final-relationship-ablation']) {
 for(const name of readdirSync(dir).filter(n=>/^receipt-\d+\.json$/.test(n)).sort()) {
  const path=`${dir}/${name}`, receipt=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));if(receipt.role!=='controller')continue;
  const requestPath=`${dir}/${name.replace('receipt','request')}`;
  let request;try{request=JSON.parse(readFileSync(requestPath,'utf8').replace(/^\uFEFF/,''));}catch{}
  const row={receipt:path,receipt_sha256:hash(readFileSync(path,'utf8')),id:receipt.id,turn:receipt.turn,http_status:receipt.http_status,
   request:requestPath,request_matches_identity:!!request&&request.id===receipt.id&&request.turn===receipt.turn&&request.role===receipt.role,
   model:request?.body?.model,reported_provider:receipt.receipt?.provider,
   schema_matches_current:!!request&&hash(request.body?.response_format?.json_schema?.schema)===schemaHash,
   strict:request?.body?.response_format?.json_schema?.strict,require_parameters:request?.body?.provider?.require_parameters};
  if(receipt.http_status===200){const choice=receipt.receipt?.choices?.[0];row.finish_reason=choice?.finish_reason;
   const text=choice?.message?.content;row.parse='invalid';
   if(typeof text==='string'){try{parseControllerEvidenceProposal(text);row.parse='evidence';}catch{try{parseControllerProposal(text);row.parse='legacy';}catch{const n=normalizeControllerOutput(text);try{if(n.normalized_json){parseControllerEvidenceProposal(n.normalized_json);row.parse='normalized';}}catch{}}}}
  }else row.provider_error_code=receipt.receipt?.error?.code;
  rows.push(row);
 }
}
const counts={physical_controller_receipts:rows.length,http_200:rows.filter(r=>r.http_status===200).length,http_429:rows.filter(r=>r.http_status===429).length,
 parser_invalid_http200:rows.filter(r=>r.parse==='invalid').length,identity_mismatches:rows.filter(r=>!r.request_matches_identity).length,
 schema_mismatches:rows.filter(r=>!r.schema_matches_current).length,normalized:rows.filter(r=>r.parse==='normalized').length};
const historical=[];
const round1Path='saves/controller-bakeoff-round-1/calls.jsonl';
const round1=readFileSync(round1Path,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(r=>r.model==='qwen/qwen3.8-flash');
historical.push({archive:round1Path,model:'qwen/qwen3.8-flash',physical:round1.length,http_429:round1.filter(r=>r.http_status===429).length,production_parse_valid:round1.filter(r=>r.production_parse_valid===true).length,structured_output_invalid:round1.filter(r=>r.structured_output_invalid===true).length});
for(const dir of ['saves/controller-bakeoff-round-2/cells','saves/controller-switch-qwen/cells']) {
 const cases=readdirSync(dir).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(readFileSync(`${dir}/${n}`,'utf8').replace(/^\uFEFF/,''))).filter(r=>r.model==='qwen/qwen3.8-flash');
 historical.push({archive:dir,model:'qwen/qwen3.8-flash',logical:cases.length,production_parse_valid:cases.filter(r=>r.production_parse_valid===true).length,structured_output_invalid:cases.filter(r=>r.structured_output_invalid===true).length,technical_retries:cases.reduce((n,r)=>n+(r.retries??0),0)});
}
const result={historical,scope:'Three recent D-09 raw receipt directories only; no statistical reliability claim and no new dispatch. Identity mismatches are excluded from matched-path claims.',controller_schema_sha256:schemaHash,counts,rows};
writeFileSync('docs/evaluations/minor-debt-sweep/controller-receipt-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(counts));
