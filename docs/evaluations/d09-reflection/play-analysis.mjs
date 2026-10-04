/** Offline analysis of the disposable played run (no provider calls): development tally, D-26 shadow exposure, context cost, move/authorization side findings. */
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {estimateContextTokens} from '../../../.build/src/turn/context-budget.js';
const dir=process.argv[2]??'saves/d09-reflection-bakeoff/play';
const rows=readdirSync(dir).filter(n=>/^turn-\d+\.json$/.test(n)).sort().map(n=>JSON.parse(readFileSync(`${dir}/${n}`,'utf8')));
const gates=rows.map(r=>r.diagnostics?.mannerism_portrayal).filter(Boolean);
const sum=k=>gates.reduce((n,g)=>n+(g[k]??0),0);
const shadow={turns_with_gate:gates.length,cue_exposures:sum('mannerism_cues_packed'),conditional_exposures:sum('conditional_cues_packed'),findings:sum('gate_findings_total'),
  epistemic_states:Object.fromEntries(['emergent','observed','established'].map(s=>[s,gates.reduce((n,g)=>n+(g.epistemic_states_packed?.[s]??0),0)])),
  by_rule:Object.fromEntries(['OUT_OF_TRIGGER','UNSUPPORTED_RECURRENCE','UNSUPPORTED_AWARENESS'].map(k=>[k,gates.reduce((n,g)=>n+(g.findings_by_rule?.[k]??0),0)])),
  findings_detail:rows.flatMap(r=>(r.diagnostics?.mannerism_portrayal?.findings??[]).map(f=>({turn:r.turn,...f})))};
// authorization / movement side findings
const rejected=rows.flatMap(r=>(r.diagnostics?.authorization?.decisions??[]).filter(d=>!d.authorized).map(d=>({turn:r.turn,kind:d.kind,reason:d.reason,evidence_check:d.evidence_check})));
const followNarrated=rows.filter(r=>r.category==='send'&&r.ok&&/\b(?:descend|goes?|leaves?|heads?|walks?|rises?)\b/i.test(r.narration??'')&&!r.new_developments.some(d=>d.includes(':moved:'))).map(r=>({turn:r.turn,input:r.input,excerpt:(r.narration??'').replace(/\s+/g,' ').slice(0,260)}));
const redactions=rows.filter(r=>r.diagnostics?.audit?.redaction_used).map(r=>r.turn);
// context cost at early/middle/late turns: NPC+ block and mannerism lines out of the first narrator request
const ctx=[1,25,50,75,100].map(t=>{const r=rows.find(x=>x.turn===t);if(!r||!r.requests?.length)return {turn:t,missing:true};
  const text=r.requests[0].messages.map(m=>m.content).join('\n'),npc=text.match(/\[NPC\+ HOUSEHOLD CHARACTERS\][\s\S]*?(?=\n\n\[|$)/)?.[0]??'',mann=[...npc.matchAll(/Mannerisms:\n(?:- .*\n?)+/g)].map(m=>m[0]).join('\n');
  const b=r.diagnostics?.context_budget;return {turn:t,total_estimated_tokens:(b?.estimated_tokens??0)+(b?.fixed_instructions_tokens??0),npc_plus_block_tokens:estimateContextTokens(npc),mannerism_tokens:estimateContextTokens(mann),reflection_block_tokens:0,retrieved_history_tokens:0};});
const tally={};for(const r of rows)for(const d of r.new_developments){const k=d.split(':')[2];tally[k]=(tally[k]??0)+1;}
const calls=rows.flatMap(r=>r.reflection.map(x=>({turn:r.turn,id:x.request_id})));
const out={turns:rows.length,finalized:rows.filter(r=>r.ok).length,categories:rows.reduce((o,r)=>(o[r.category]=(o[r.category]??0)+1,o),{}),development_tally:tally,reflection_due_calls:calls.length,shadow,rejected_commands:rejected,send_turns_with_departure_prose_but_no_moved_development:followNarrated,audit_redaction_turns:redactions,context:ctx};
writeFileSync(`${dir}/play-analysis.json`,JSON.stringify(out,null,2));console.log(JSON.stringify({...out,shadow:{...shadow,findings_detail:shadow.findings_detail.length},send_turns_with_departure_prose_but_no_moved_development:followNarrated.length,rejected_commands:rejected.length},null,1));
