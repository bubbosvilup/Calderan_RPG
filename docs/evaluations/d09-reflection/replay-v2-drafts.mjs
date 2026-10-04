/**
 * Phase 1: replay the archived D-09 V2 reflection drafts against the UNCHANGED production validator, decomposing every shape rule so a
 * five-word label is shown to be the ONLY structural fault. READ-ONLY on saves/d09-soak-v2 (never edited); prints sha256 of each archived file/draft.
 * Run on the machine that holds the ignored archive:  node docs/evaluations/d09-reflection/replay-v2-drafts.mjs [saves/d09-soak-v2]
 * (--selftest replays two RECONSTRUCTED stand-in drafts, clearly marked, when the archive is unavailable.)
 */
import {readFileSync,readdirSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {turnFixture} from '../../../.build/src/dev/turn-fixture.js';
import {reflectionEvidence,parseReflectionOutput,validateProposals} from '../../../.build/src/turn/reflection.js';
import {sha,shapeFaults} from './lib.mjs';
const selftest=process.argv.includes('--selftest'),root=process.argv.find(a=>a.startsWith('saves/'))??'saves/d09-soak-v2';
const world=turnFixture().world;
const names=snap=>new Map([...snap.characters.filter(c=>c.profile.name).map(c=>[c.id,c.profile.name]),...world.getEntitiesByType('character').map(c=>[c.id,c.name])]);
const words=new Set(world.listEntities().filter(e=>e.type!=='character').flatMap(e=>[e.name,e.display_name]).flatMap(n=>(n??'').toLowerCase().split(/\s+/)).filter(w=>w.length>=3));
const out=[];
if(selftest){
  const ev=[{ref:'h1',kind:'development',text:'x'}];
  for(const [who,label] of [['gerome','construct_serves_household_since_joining'],['maren','household_member_without_rule_voice_recorded']]){
    const text=JSON.stringify({proposals:[{kind:'stance',label,text:'Stand-in sentence.',evidence_refs:['h1'],confidence:'low'}]});
    const raw=parseReflectionOutput(text),p=raw[0];
    out.push({RECONSTRUCTED_STAND_IN:true,character:who,draft_sha256:sha(text),label,label_words:label.split('_').length,shape_faults:shapeFaults(p),validator:validateProposals(raw,[],{id:who,name:who},new Map(),new Set()).rejected.map(r=>r.reason)});
  }
}else{
  if(!existsSync(root))throw new Error(`${root} not found: archive is ignored and exists only on the machine that ran V2`);
  for(const n of readdirSync(root).filter(n=>/^turn-\d+\.json$/.test(n)).sort()){
    const raw=readFileSync(`${root}/${n}`,'utf8'),r=JSON.parse(raw);
    for(const x of r.reflectionRequests??[]){
      if(!x.result)continue;
      const catalog=reflectionEvidence(world,r.after,x.request.character.id),parsed=parseReflectionOutput(x.result.text);
      const res=parsed?validateProposals(parsed,catalog,x.request.character,names(r.after),words):null;
      out.push({turn:r.turn,turn_file_sha256:sha(raw),character:x.request.character,draft_sha256:sha(x.result.text),draft:x.result.text,
        proposals:(parsed??[]).map(p=>({label:p?.label,label_words:typeof p?.label==='string'?p.label.split(/[_\s]+/).filter(Boolean).length:null,shape_faults:shapeFaults(p)})),
        validator:res?{accepted:res.accepted.length,rejected:res.rejected.map(q=>q.reason)}:'unparseable'});
    }
  }
}
mkdirSync('saves/d09-reflection-bakeoff',{recursive:true});
writeFileSync(`saves/d09-reflection-bakeoff/v2-replay${selftest?'-SELFTEST':''}.json`,JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,1));
