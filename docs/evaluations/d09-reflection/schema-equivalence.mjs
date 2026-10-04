/** UNPAID Phase 0/2 check: is reflection-schema-v2-eval ever STRICTER than the production shape validator, and exactly where is it weaker? Fuzz + targeted edge cases against the unchanged validateProposals. */
import {writeFileSync,mkdirSync} from 'node:fs';
import {SCHEMAS,schemaViolations,validateProposals} from './lib.mjs';
let seed=12345;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/2**32,pick=a=>a[Math.floor(rnd()*a.length)];
const chars='abcdefghijklmnopqrstuvwxyz0123456789_ -ABCÉé.é中';const rs=n=>Array.from({length:n},()=>pick([...chars])).join('');
const words=['household','rule','membership','quiet','stone','return','movement_pattern','x','a1','b2c'];
const label=()=>{const m=Math.floor(rnd()*9);if(m===0)return rs(Math.floor(rnd()*40));if(m===1)return Array.from({length:1+Math.floor(rnd()*6)},()=>pick(words)).join('_');
  if(m===2)return Array.from({length:1+Math.floor(rnd()*6)},()=>pick(words)).join(pick(['_','-',' ','__']));if(m===3)return '';if(m===4)return pick(words).toUpperCase();if(m===5)return `_${pick(words)}`;if(m===6)return `${pick(words)}_`;return Array.from({length:1+Math.floor(rnd()*4)},()=>pick(words)).join('_');};
const text=()=>{const m=Math.floor(rnd()*7);if(m===0)return '';if(m===1)return ' '.repeat(1+Math.floor(rnd()*3));if(m===2)return 'x'.repeat(190+Math.floor(rnd()*20));if(m===3)return '😀'.repeat(Math.floor(rnd()*110));return rs(5+Math.floor(rnd()*60));};
const refs=()=>{const m=Math.floor(rnd()*6);if(m===0)return [];if(m===1)return ['a','a'];if(m===2)return Array.from({length:7+Math.floor(rnd()*4)},(_,i)=>`r${i}`);if(m===3)return [1];return Array.from({length:1+Math.floor(rnd()*3)},(_,i)=>`r${i}`);};
const ch={id:'brenna',name:'Brenna'};
const stats={n:0,both_ok:0,both_bad:0,schema_stricter:0,schema_weaker:0};const weaker={},stricter=[];
for(let i=0;i<30000;i++){
  const p={kind:pick(['stance','shared_motif','bogus']),label:label(),text:text(),evidence_refs:refs(),confidence:pick(['low','medium','high','x'])};
  const v=validateProposals([p],[],ch,new Map(),new Set()).rejected[0]?.reason==='invalid_shape';
  const s=schemaViolations(SCHEMAS.strict,{proposals:[p]}).length>0;stats.n++;
  if(!v&&!s)stats.both_ok++;else if(v&&s)stats.both_bad++;else if(s&&!v){stats.schema_stricter++;if(stricter.length<10)stricter.push(p);}
  else{stats.schema_weaker++;const why=[p.text.trim().length===0?'blank_text':null,new Set(p.evidence_refs).size!==p.evidence_refs.length?'duplicate_refs':null,p.label.length>32?'label_length_gt_32':null,p.text.length>200?'text_length_gt_200(utf16 vs codepoints)':null].filter(Boolean).join('+')||'other';weaker[why]=(weaker[why]??0)+1;}
}
const cases={five_word_label:'a_b_c_d_e',four_word_label:'a_b_c_d',hyphen_label:'a-b',caps_label:'Household_rule',digits_ok:'rule2_b3',empty_label:'',leading_underscore:'_a',double_underscore:'a__b',unicode_label:'café_rule',trailing_newline:'a_b\n'};
const edge=Object.fromEntries(Object.entries(cases).map(([k,l])=>{const p={kind:'stance',label:l,text:'ok',evidence_refs:['r'],confidence:'low'};return [k,{validator_shape_invalid:validateProposals([p],[],ch,new Map(),new Set()).rejected[0]?.reason==='invalid_shape',schema_violation:schemaViolations(SCHEMAS.strict,{proposals:[p]}).length>0}];}));
mkdirSync('saves/d09-reflection-bakeoff',{recursive:true});
const out={fuzz:stats,schema_weaker_breakdown:weaker,schema_stricter_examples:stricter,edge_cases:edge};
writeFileSync('saves/d09-reflection-bakeoff/schema-equivalence.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,1));
