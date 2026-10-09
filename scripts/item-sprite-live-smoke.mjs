import { writeFile } from 'node:fs/promises';
import { turnFixture } from '../.build/src/dev/turn-fixture.js';
import { ItemSpriteJobs } from '../.build/src/app/item-sprite-jobs.js';
import { FalImageClient } from '../.build/src/llm/huggingface/fal-image-client.js';
import { RAENA_IMAGE_STACK } from '../.build/src/app/image-stack.js';
import { PortraitAssetStore } from '../.build/src/app/portrait-store.js';
import { FileCampaignRepository } from '../.build/src/persistence/campaign-repository.js';
const report={credential_exists:!!process.env.HF_TOKEN?.trim(),calls:0,retries:0,provider:RAENA_IMAGE_STACK.provider,model:RAENA_IMAGE_STACK.base_model,style:RAENA_IMAGE_STACK.style_id,items:[]};
if(report.credential_exists){
  const {world,campaign}=turnFixture();
  const root='docs/evaluations/item-sprite-smoke-assets',store=new PortraitAssetStore(root,{layout:'campaign'}),repository=new FileCampaignRepository(world,root);
  const client=new FalImageClient(RAENA_IMAGE_STACK,{api_key:()=>process.env.HF_TOKEN});
  const generator={identity:client.identity,async generate(request){report.calls++;return client.generate(request);}};
  const jobs=new ItemSpriteJobs(campaign,{generator,store});
  for(const [name,category,visual] of [
    ['Ivory Figurine','valuable','Small hand-sized ivory figurine depicting a kneeling woman, aged cream-coloured ivory, fine carved facial details, slightly worn rectangular base, no paint.'],
    ['Silver Knife','weapon','Small silver knife with a straight narrow blade and a simple smooth silver handle, softly polished metal, no ornament.']]){
    campaign.apply({expected_revision:campaign.revision,commands:[{kind:'create_item',name,description:`A ${name.toLowerCase()}.`,visual_description:visual,category,position:{kind:'carried',character_id:'nicco'}}]});
    const id=campaign.exportSnapshot().items.find(i=>i.name===name).id;
    const queued=jobs.request(id);const immediate=campaign.exportSnapshot().items.find(i=>i.id===id).sprite?.status;
    await jobs.settled();
    const final=campaign.exportSnapshot().items.find(i=>i.id===id);
    const persisted=final.sprite?.status==='ready'&&await store.exists(campaign.exportSnapshot().campaign_id,id,final.sprite.asset_ref);
    await repository.saveCampaign(campaign);
    report.items.push({name,id,queued,immediate_status:immediate,sprite:final.sprite,asset_persisted:persisted});
    if(final.sprite?.status==='failed')break;
  }
}
await writeFile('docs/evaluations/ITEM_SPRITE_LIVE_SMOKE.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
