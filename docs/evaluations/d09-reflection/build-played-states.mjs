/** PLAYED_STATE requests: the exact request production WOULD send for each household member at saved checkpoints of the played run (reflectionEvidence on the real snapshot). Not production-timed due points. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {turnFixture} from '../../../.build/src/dev/turn-fixture.js';
import {reflectionEvidence} from '../../../.build/src/turn/reflection.js';
import {characterView} from '../../../.build/src/campaign/projections.js';
import {sha,validationContext} from './lib.mjs';
const dir='saves/d09-reflection-bakeoff/play',world=turnFixture(false,{courtyard:true}).world,out=[];
for(const T of [40,60,80,100]){
  const f=`${dir}/snapshot-T${T}.json`;if(!existsSync(f))continue;const snap=JSON.parse(readFileSync(f,'utf8'));
  for(const id of ['brenna','gerome','maren']){
    const catalog=reflectionEvidence(world,snap,id),vc=validationContext(world,snap,id,characterView),p=snap.premium_characters.find(x=>x.character_id===id);
    out.push({id:`state:T${T}:${id}`,origin:'PLAYED_STATE',turn:T,revision:snap.revision,cursor_before:snap.premium_reflections.find(r=>r.character_id===id)?.last_reflected_revision??-1,developments_since_cursor:p.dynamic.recent_developments,rollup:p.dynamic.long_term??null,
      request:{character:vc.character,evidence:catalog.map(e=>({ref:e.ref,kind:e.kind,text:e.text})),existing:[]},catalog,knownNames:vc.knownNames,worldWords:vc.worldWords,character:vc.character,state_sha:sha(snap)});
  }
}
writeFileSync('saves/d09-reflection-bakeoff/played-state-requests.jsonl',out.map(r=>JSON.stringify(r)).join('\n')+'\n');
console.log(out.map(r=>`${r.id}: ${r.request.evidence.length} evidence kinds=${[...new Set(r.catalog.map(e=>e.kind))].join('/')}`).join('\n'));
