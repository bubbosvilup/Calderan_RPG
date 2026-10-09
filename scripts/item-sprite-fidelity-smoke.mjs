import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { turnFixture } from '../.build/src/dev/turn-fixture.js';
import { ItemSpriteJobs } from '../.build/src/app/item-sprite-jobs.js';
import { FalImageClient } from '../.build/src/llm/huggingface/fal-image-client.js';
import { RAENA_IMAGE_STACK } from '../.build/src/app/image-stack.js';
import { PortraitAssetStore } from '../.build/src/app/portrait-store.js';
const root='docs/evaluations/item-sprite-fidelity-assets';
const report={credential_exists:!!process.env.HF_TOKEN?.trim(),calls:0,retries:0,provider:RAENA_IMAGE_STACK.provider,model:RAENA_IMAGE_STACK.base_model,style:RAENA_IMAGE_STACK.style_id,trigger:RAENA_IMAGE_STACK.trigger,items:[]};
await mkdir(root,{recursive:true});
if(report.credential_exists){
  const {campaign}=turnFixture(), store=new PortraitAssetStore(root,{layout:'campaign'});
  const client=new FalImageClient(RAENA_IMAGE_STACK,{api_key:()=>process.env.HF_TOKEN});
  const requests=[];
  const generator={identity:client.identity,async generate(request){
    if(report.calls>=3)throw new Error('smoke_budget_exhausted');
    const actual={...request,seed:104911+report.calls};report.calls++;
    requests.push({prompt:actual.prompt,negative_prompt:actual.negative_prompt,width:actual.width,height:actual.height,seed:actual.seed});
    return client.generate(actual);
  }};
  const jobs=new ItemSpriteJobs(campaign,{generator,store});
  for(const [name,category,visual] of [
    ['Plain Silver Knife','weapon','Small plain silver knife with a straight undecorated blade and simple dark wooden handle.'],
    ['Plain Signet Ring','valuable','Simple plain silver signet ring with a flat oval face and no engraving or gemstone.'],
    ['Sealed Letter','document','Folded off-white paper letter sealed with a small plain dark red wax seal, no visible writing.']]){
    campaign.apply({expected_revision:campaign.revision,commands:[{kind:'create_item',name,description:`A ${name.toLowerCase()}.`,visual_description:visual,category,position:{kind:'carried',character_id:'nicco'}}]});
    const id=campaign.exportSnapshot().items.find(i=>i.name===name).id;
    jobs.request(id);await jobs.settled();
    const final=campaign.exportSnapshot().items.find(i=>i.id===id);
    const asset=final.sprite?.status==='ready'?join(root,campaign.exportSnapshot().campaign_id,'portraits',store.characterToken(campaign.exportSnapshot().campaign_id,id),final.sprite.asset_ref):undefined;
    report.items.push({name,id,visual_description:visual,visual_description_unchanged:final.visual_description===visual,request:requests.at(-1),sprite:final.sprite,asset});
    if(final.sprite?.status==='failed')break;
  }
}
await writeFile('docs/evaluations/ITEM_SPRITE_FIDELITY_SMOKE.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({credential_exists:report.credential_exists,calls:report.calls,retries:report.retries,items:report.items.map(i=>({name:i.name,status:i.sprite?.status,error_code:i.sprite?.error_code,asset:i.asset}))},null,2));
