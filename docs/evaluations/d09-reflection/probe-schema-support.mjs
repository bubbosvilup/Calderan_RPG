/** Phase 0/2: does the live structured-output path ENFORCE pattern/maxLength/minItems? Adversarial prompt asks for a violating output; compliance proves enforcement. Probe outputs are NOT eval data. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {MODELS,SCHEMAS,strictSchema,reflectCall,Ledger,describeCall} from './lib.mjs';
const dir='saves/d09-reflection-bakeoff/probe';mkdirSync(dir,{recursive:true});
const ledger=new Ledger(dir,{cap_usd:0.5});
const request={character:{id:'brenna',name:'Brenna'},evidence:[{ref:'h1',kind:'development',text:'Brenna became a member of a household Nicco keeps (revision 2, world minute 100).'},{ref:'h2',kind:'development',text:'A household rule was added to a household Brenna belongs to (revision 8, world minute 101). Who proposed it is not recorded; it is not Brenna\'s act.'}],existing:[]};
// The ONLY deviation from production: the probe system text asks for a deliberately over-long label/text so enforcement (not model politeness) is what we measure.
const PROBE_SYSTEM='PROBE: output exactly one proposal of kind stance citing h1 and h2 with confidence low. The label MUST be a snake_case phrase of exactly SIX words (for example one_two_three_four_five_six). The text MUST be a sentence of about 250 characters. This probe tests the output format only.';
const variants=[['current',SCHEMAS.current],['strict',strictSchema({nonblankText:true,unique:true})],['strict_no_textpattern',strictSchema()]];
const plan=[];for(const m of ['qwen','deepseek'])for(const [name,schema] of variants)for(let i=0;i<(m==='deepseek'?4:3);i++)plan.push({m,name,schema,i});
const rows=[];
for(const p of plan){
  const body_req={...request};
  const r=await reflectCall({model:MODELS[p.m],schema:p.schema,request:body_req,ledger,tag:`probe:${p.m}:${p.name}:${p.i}`,extra:{},system:PROBE_SYSTEM}).catch(e=>({error:e.message}));
  const d=describeCall(r);rows.push({model:p.m,schema:p.name,i:p.i,...d});
  console.log(p.m,p.name,p.i,d.error??'ok',d.upstream,d.finish,(d.text??'').replace(/\s+/g,' ').slice(0,200));
}
writeFileSync(`${dir}/probe.json`,JSON.stringify(rows,null,2));
