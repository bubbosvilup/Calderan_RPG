import {readFileSync,writeFileSync} from 'node:fs';
import {V2_SCHEMA,schemaMatches} from '../../../.build/src/dev/reflection-v2.js';
import {sha} from './lib.mjs';
export function violations(s,v,path='$'){
 if(schemaMatches(s,v))return [];
 if(s.anyOf)return s.anyOf.map(b=>violations(b,v,path)).sort((a,b)=>a.length-b.length)[0];
 const out=[];if(s.const!==undefined&&v!==s.const)out.push({family:'invalid_enum',path});if(s.enum&&!s.enum.includes(v))out.push({family:'invalid_enum',path});
 if(s.type==='object'){if(!v||typeof v!=='object'||Array.isArray(v))return [{family:'wrong_nesting_or_type',path}];for(const k of s.required??[])if(!Object.hasOwn(v,k))out.push({family:'missing_required_field',path:path+'.'+k});for(const k of Object.keys(v)){if(!Object.hasOwn(s.properties??{},k)){if(s.additionalProperties===false)out.push({family:'unknown_field',path:path+'.'+k});}else out.push(...violations(s.properties[k],v[k],path+'.'+k));}}
 else if(s.type==='array'){if(!Array.isArray(v))return [{family:'wrong_nesting_or_type',path}];if(v.length<(s.minItems??0)||v.length>(s.maxItems??Infinity))out.push({family:'array_bounds',path});if(s.uniqueItems&&new Set(v.map(JSON.stringify)).size!==v.length)out.push({family:'duplicate_item',path});v.forEach((e,i)=>out.push(...violations(s.items,e,`${path}[${i}]`)));}
 else if(s.type==='string'){if(typeof v!=='string')out.push({family:'wrong_nesting_or_type',path});else if(v.length<(s.minLength??0)||v.length>(s.maxLength??Infinity))out.push({family:'string_bounds',path});}
 else if(s.type==='integer'&&(!Number.isSafeInteger(v)||v<(s.minimum??-Infinity)||v>(s.maximum??Infinity)))out.push({family:'integer_bounds_or_type',path});
 return out;
}
export function classify(text,finish,wrapperValid=true){
 const families=[],details=[];if(!wrapperValid)families.push('provider_api_invalid_response');if(finish==='length')families.push('finish_reason_length');
 if(typeof text!=='string'||!text.trim())return {strict_usable:false,families:[...families,'empty_invalid'],details};
 let parsed;try{parsed=JSON.parse(text);}catch{families.push('malformed_json');const t=text.trim();if(t.includes('```'))families.push('markdown_fence');if(!t.startsWith('{'))families.push('analysis_or_reasoning_before_envelope');
  let depth=0,quote=false,escape=false,end=-1,negative=false;for(let i=0;i<t.length;i++){const ch=t[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quote=false;continue;}if(ch==='"'){quote=true;continue;}if(ch==='{'||ch==='[')depth++;if(ch==='}'||ch===']'){depth--;if(depth<0)negative=true;if(depth===0&&end<0)end=i+1;}}
  if(end>0){try{JSON.parse(t.slice(0,end));const rest=t.slice(end).trim();if(rest){families.push('trailing_content');if(rest.startsWith('}'))families.push('extra_closing_brace');else if(rest==='"')families.push('stray_trailing_quote');else if(rest.startsWith('{'))families.push('multiple_json_objects');else if(/[A-Za-z]/.test(rest))families.push('trailing_prose');else families.push('trailing_punctuation');}}catch{}}
  if(depth>0||quote)families.push(finish==='length'?'truncated_json':'unclosed_structure_or_string');if(negative)families.push('unmatched_closing_delimiter');if(families.length===(finish==='length'?2:1))families.push('other_json_syntax');
 }
 if(parsed!==undefined&&!schemaMatches(V2_SCHEMA,parsed)){families.push('schema_invalid');details.push(...violations(V2_SCHEMA,parsed));families.push(...details.map(d=>d.family));}
 return {strict_usable:wrapperValid&&finish!=='length'&&parsed!==undefined&&schemaMatches(V2_SCHEMA,parsed),valid_empty:parsed?.proposals?.length===0,proposal_count:Array.isArray(parsed?.proposals)?parsed.proposals.length:null,families:[...new Set(families)],details};
}
if(process.argv[1]?.endsWith('structured-reliability-forensics.mjs')){
 const rows=[];for(const name of ['v2','v21','v22-oos']){const dir='saves/d09-reflection-'+name,outputs=name==='v22-oos'?JSON.parse(readFileSync(dir+'/oos-outputs.json')):readFileSync(dir+'/oos-outputs.jsonl','utf8').trim().split('\n').map(JSON.parse);
 for(const o of outputs)for(const a of o.attempts){let j;try{j=JSON.parse(a.raw?.body??'');}catch{}const choice=j?.choices?.[0],text=choice?.message?.content,wrapperValid=a.raw?.status===200&&typeof text==='string'&&typeof choice.finish_reason==='string';const result=classify(text,choice?.finish_reason,wrapperValid);rows.push({source:name,request_id:o.id,attempt:a.n,provider:j?.provider,finish_reason:choice?.finish_reason,...result,content_sha:sha(text??''),content:text??null});}}
 const failed=rows.filter(r=>!r.strict_usable),families=Object.fromEntries([...new Set(failed.flatMap(r=>r.families))].sort().map(f=>[f,failed.filter(r=>r.families.includes(f)).length]));
 const stats={schema_bytes:Buffer.byteLength(JSON.stringify(V2_SCHEMA)),token_estimate_chars_over_four:Math.ceil(JSON.stringify(V2_SCHEMA).length/4),claim_variants:8,max_value_nesting:0,required_property_occurrences:0,optional_property_occurrences:0,union_branches:0,object_nodes:0,closed_object_nodes:0,descriptions:0,nullable_nodes:0};
 function walk(s,depth=0){stats.max_value_nesting=Math.max(stats.max_value_nesting,depth);if(s.type==='object'){stats.object_nodes++;if(s.additionalProperties===false)stats.closed_object_nodes++;stats.required_property_occurrences+=(s.required??[]).length;stats.optional_property_occurrences+=Object.keys(s.properties??{}).length-(s.required??[]).length;Object.values(s.properties??{}).forEach(v=>walk(v,depth+1));}if(s.items)walk(s.items,depth+1);if(s.anyOf){stats.union_branches+=s.anyOf.length;s.anyOf.forEach(v=>walk(v,depth));}if(s.description)stats.descriptions++;if(s.type==='null')stats.nullable_nodes++;}walk(V2_SCHEMA);
 const out={historical_physical_calls:rows.length,strict_usable:rows.filter(r=>r.strict_usable).length,failed:failed.length,by_source:Object.fromEntries(['v2','v21','v22-oos'].map(s=>[s,{calls:rows.filter(r=>r.source===s).length,failed:failed.filter(r=>r.source===s).length}])),families,overlap:'Family counts overlap. All retained attempts rechecked using exact JSON.parse and unchanged schema; older parsers may have stripped fences.',schema:stats,rows};
 writeFileSync('saves/structured-reflection-reliability/historical-forensics.json',JSON.stringify(out,null,2));console.log(JSON.stringify({...out,rows:undefined},null,2));
}
