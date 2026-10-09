import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { turnFixture } from '../.build/src/dev/turn-fixture.js';
import { ItemSpriteJobs } from '../.build/src/app/item-sprite-jobs.js';
import { FalImageClient } from '../.build/src/llm/huggingface/fal-image-client.js';
import { RAENA_IMAGE_STACK } from '../.build/src/app/image-stack.js';
import { PortraitAssetStore, extensionFor } from '../.build/src/app/portrait-store.js';
import { OpenRouterSpriteQualityReviewer, SPRITE_QA_MODEL } from '../.build/src/llm/openrouter/sprite-quality-reviewer.js';
import { itemSpritePrompt, ITEM_SPRITE_NEGATIVE_PROMPT } from '../.build/src/campaign/item-sprite-prompt.js';
import { validateImageBytes } from '../.build/src/llm/image-generator.js';
import { exactBenchmarkCredential, benchmarkAuthentication } from '../.build/src/dev/reflection-benchmark.js';

// Explicit evaluation only. Never scans or modifies real campaigns. Hard total budget includes comparison.
const root = 'docs/evaluations/item-sprite-quality-assets';
const reportPath = 'docs/evaluations/ITEM_SPRITE_QUALITY_SMOKE.json';
if (await readFile(reportPath, 'utf8').then(() => true, () => false)) throw Error('existing_smoke_report_do_not_repeat_paid_calls');
const report = { image_calls: 0, qa_calls: 0, fallback: false, image_provider: RAENA_IMAGE_STACK.provider,
  image_model: RAENA_IMAGE_STACK.base_model, style: RAENA_IMAGE_STACK.style_id, qa_provider: 'OpenRouter', qa_model: SPRITE_QA_MODEL,
  comparison: { current: RAENA_IMAGE_STACK.trigger, reduced: 'Illustration of' }, items: [] };
await mkdir(root, { recursive: true });
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
const { campaign } = turnFixture(), store = new PortraitAssetStore(root, { layout: 'campaign' });
const client = new FalImageClient(RAENA_IMAGE_STACK), vision = new OpenRouterSpriteQualityReviewer();
const specs = [
  ['Silver Knife', 'weapon', 'Small plain silver knife with a straight undecorated blade and simple dark wooden handle.'],
  ['Signet Ring', 'valuable', 'Simple plain silver signet ring with a flat oval face and no engraving or gemstone.'],
  ['Sealed Letter', 'document', 'Folded off-white paper letter sealed with a small plain dark red wax seal, no visible writing.'],
  ['Simple Key', 'tool', 'Small plain dark iron key with a simple rectangular bow and worn teeth, no engraving.'],
];
const apply = commands => campaign.apply({ expected_revision: campaign.revision, commands });
let current;
const generator = { identity: client.identity, async generate(request) {
  if (report.image_calls >= 8 || current.attempts.length >= 2) throw Error('smoke_budget_exhausted');
  const actual = { ...request, seed: current.name === 'Silver Knife' ? 104911 : 104911 + report.image_calls };
  const attempt = { number: current.attempts.length + 1, request: actual };
  current.attempts.push(attempt); report.image_calls++; await save();
  try {
    const image = await client.generate(actual);
    const checked = validateImageBytes(image.bytes, image.media_type);
    attempt.debug_asset = join(root, `debug_${report.image_calls}.${extensionFor(checked.media_type)}`);
    await writeFile(attempt.debug_asset, checked.bytes); await save(); return image;
  } catch (error) { attempt.error_code = error.code ?? 'image_failed'; await save(); throw error; }
} };
const reviewer = { async review(input) {
  report.qa_calls++; await save();
  try { const qa = await vision.review(input); current.attempts.at(-1).qa = qa; await save(); return qa; }
  catch (error) { current.attempts.at(-1).qa_error = 'review_failed'; await save(); throw error; }
} };
try {
  if (!process.env.OPENROUTER_API_KEY?.trim()) process.env.OPENROUTER_API_KEY = exactBenchmarkCredential({ fileText: await readFile('APIKEY.env', 'utf8') });
  report.hf_credential_present = !!process.env.HF_TOKEN?.trim(); report.qa_credential_present = !!process.env.OPENROUTER_API_KEY?.trim();
  if (!report.hf_credential_present || !report.qa_credential_present) throw Error('missing_credential');
  report.authentication = await benchmarkAuthentication(process.env.OPENROUTER_API_KEY);
  let trigger = RAENA_IMAGE_STACK.trigger;
  for (const [name, category, visual_description] of specs) {
    current = { name, visual_description, attempts: [] }; report.items.push(current);
    apply([{ kind: 'create_item', name, category, description: `A ${name.toLowerCase()}.`, visual_description, owner_id: 'nicco', position: { kind: 'carried', character_id: 'nicco' } }]);
    const initial = campaign.exportSnapshot().items.find(i => i.name === name); current.id = initial.id;
    if (name === 'Silver Knife') {
      // Required paired style experiment: exactly two samples with identical seed/prompt except trigger.
      // This evaluation-only second sample is a comparison, even if the first is accepted; no third knife image.
      apply([{ kind: 'set_item_sprite', item_id: initial.id, sprite: { status: 'pending' } }]);
      const samples = [];
      for (const [mode, candidateTrigger] of [['current', trigger], ['reduced', report.comparison.reduced]]) {
        const identity = { name, category, visual_description };
        const image = await generator.generate({ prompt: itemSpritePrompt(identity, candidateTrigger), negative_prompt: ITEM_SPRITE_NEGATIVE_PROMPT, width: 992, height: 992, seed: 104911 });
        current.attempts.at(-1).style_mode = mode; current.attempts.at(-1).purpose = 'paired_style_comparison';
        const qa = await reviewer.review({ ...identity, image }); samples.push({ image, qa, mode });
      }
      const reducedBetter = !samples[0].qa.accepted && samples[1].qa.accepted;
      report.comparison.reduced_clearly_better = reducedBetter;
      report.comparison.selected = reducedBetter ? 'reduced' : 'current';
      if (reducedBetter) trigger = report.comparison.reduced;
      const accepted = reducedBetter ? samples[1] : samples.find(s => s.qa.accepted);
      if (accepted) {
        const staged = await store.stage(campaign.exportSnapshot().campaign_id, initial.id, accepted.image.bytes);
        const asset_ref = `portrait_item_quality_knife.${extensionFor(accepted.image.media_type)}`;
        await store.finalize(staged, campaign.exportSnapshot().campaign_id, initial.id, asset_ref);
        apply([{ kind: 'set_item_sprite', item_id: initial.id, sprite: { status: 'ready', asset_ref, generated_from_visual_description: visual_description } }]);
        current.accepted_attempt = samples.indexOf(accepted) + 1;
      } else apply([{ kind: 'set_item_sprite', item_id: initial.id, sprite: { status: 'failed', error_code: 'quality_rejected' } }]);
    } else {
      const jobs = new ItemSpriteJobs(campaign, { generator, reviewer, store, trigger }); jobs.request(initial.id); await jobs.settled();
      current.accepted_attempt = current.attempts.find(a => a.qa?.accepted)?.number;
    }
    const final = campaign.exportSnapshot().items.find(i => i.id === initial.id);
    current.sprite = final.sprite;
    current.gameplay_unchanged = JSON.stringify({ ...initial, sprite: undefined }) === JSON.stringify({ ...final, sprite: undefined });
    if (final.sprite?.status === 'ready') current.final_asset = join(root, campaign.exportSnapshot().campaign_id, 'portraits', store.characterToken(campaign.exportSnapshot().campaign_id, initial.id), final.sprite.asset_ref);
    await save(); console.log(JSON.stringify({ name, calls: current.attempts.length, qa: current.attempts.map(a => a.qa ?? a.qa_error), status: final.sprite?.status }));
  }
} catch (error) { report.error_code = ['missing_credential'].includes(error.message) ? error.message : error.code ?? 'smoke_infrastructure_failed'; }
finally { await save(); }
console.log(JSON.stringify({ image_calls: report.image_calls, qa_calls: report.qa_calls, fallback: report.fallback, comparison: report.comparison, error_code: report.error_code }));
