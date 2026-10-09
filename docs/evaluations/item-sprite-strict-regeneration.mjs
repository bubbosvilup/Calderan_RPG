import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { turnFixture } from '../../.build/src/dev/turn-fixture.js';
import { ItemSpriteJobs } from '../../.build/src/app/item-sprite-jobs.js';
import { PortraitAssetStore, extensionFor } from '../../.build/src/app/portrait-store.js';
import { RAENA_IMAGE_STACK } from '../../.build/src/app/image-stack.js';
import { FalImageClient } from '../../.build/src/llm/huggingface/fal-image-client.js';
import { OpenRouterSpriteQualityReviewer, SPRITE_QA_MODEL } from '../../.build/src/llm/openrouter/sprite-quality-reviewer.js';
import { itemSpritePrompt, itemSpriteRetryPrompt, ITEM_SPRITE_NEGATIVE_PROMPT } from '../../.build/src/campaign/item-sprite-prompt.js';
import { exactBenchmarkCredential } from '../../.build/src/dev/reflection-benchmark.js';

// Evaluation instrumentation only. All provider requests are forwarded unchanged.
const reportPath = 'docs/evaluations/ITEM_SPRITE_STRICT_REGENERATION.json';
if (await readFile(reportPath).then(() => true, () => false)) throw Error('report_exists_do_not_repeat_live_calls');
const root = 'docs/evaluations/item-sprite-strict-regeneration-assets';
const tracked = ['src/app/item-sprite-jobs.ts', 'src/app/image-stack.ts', 'src/campaign/item-sprite-prompt.ts', 'src/llm/huggingface/fal-image-client.ts', 'src/llm/openrouter/sprite-quality-reviewer.ts'];
const hash = data => createHash('sha256').update(data).digest('hex');
const beforeHashes = Object.fromEntries(await Promise.all(tracked.map(async p => [p, hash(await readFile(p))])));
const report = { image_calls: 0, qa_calls: 0, fallback: false, image_route: 'HF router', image_endpoint: RAENA_IMAGE_STACK.endpoint,
  image_provider: RAENA_IMAGE_STACK.provider, image_model: RAENA_IMAGE_STACK.base_model, lora: RAENA_IMAGE_STACK.style_id,
  qa_provider: 'OpenRouter', qa_model: SPRITE_QA_MODEL, attempts: [] };
await mkdir(root, { recursive: true });
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
const { campaign } = turnFixture();
const name = 'Silver Knife', category = 'weapon';
const visual_description = 'Small plain silver knife with a straight undecorated blade and simple dark wooden handle.';
campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'create_item', name, category,
  description: 'A small plain silver knife.', visual_description, owner_id: 'nicco', position: { kind: 'carried', character_id: 'nicco' } }] });
const initial = campaign.exportSnapshot().items.find(i => i.name === name);
const gameplayBefore = campaign.exportSnapshot();
const client = new FalImageClient(RAENA_IMAGE_STACK), vision = new OpenRouterSpriteQualityReviewer();
const store = new PortraitAssetStore(root, { layout: 'campaign' });
const originalStage = store.stage.bind(store), originalFinalize = store.finalize.bind(store);
store.stage = async (...args) => { const result = await originalStage(...args); report.attempts.at(-1).staged = true; await save(); return result; };
store.finalize = async (...args) => { await originalFinalize(...args); report.attempts.at(-1).finalized = true; await save(); };
const generator = { identity: client.identity, async generate(request) {
  if (report.image_calls >= 2) throw Error('image_budget_exhausted');
  const number = report.image_calls + 1;
  const identity = { name, category, visual_description };
  const expected = number === 1 ? itemSpritePrompt(identity) : itemSpriteRetryPrompt(identity);
  if (request.prompt !== expected || request.negative_prompt !== ITEM_SPRITE_NEGATIVE_PROMPT || request.references) throw Error('production_prompt_mismatch');
  const attempt = { number, request, production_prompt_verified: true, generation_success: false, staged: false, finalized: false };
  report.attempts.push(attempt); report.image_calls++; await save();
  try {
    const image = await client.generate(request); // Do not replace seed, prompt or any request field.
    attempt.generation_success = true;
    attempt.debug_asset = join(root, `debug_${number}.${extensionFor(image.media_type)}`);
    await writeFile(attempt.debug_asset, image.bytes); await save(); return image;
  } catch (error) { attempt.generation_error = error.code ?? 'image_failed'; await save(); throw error; }
} };
const reviewer = { async review(input) {
  if (report.qa_calls >= 2) throw Error('qa_budget_exhausted');
  report.qa_calls++; await save();
  try {
    const result = await vision.review(input);
    report.attempts.at(-1).qa = result;
    report.attempts.at(-1).sprite_status_after_review = campaign.exportSnapshot().items.find(i => i.id === initial.id).sprite?.status;
    await save(); console.log(JSON.stringify({ attempt: report.attempts.length, qa: result })); return result;
  } catch (error) { report.attempts.at(-1).qa_error = 'review_failed'; await save(); throw error; }
} };
try {
  if (!process.env.OPENROUTER_API_KEY?.trim()) process.env.OPENROUTER_API_KEY = exactBenchmarkCredential({ fileText: await readFile('APIKEY.env', 'utf8') });
  report.hf_credential_present = !!process.env.HF_TOKEN?.trim(); report.qa_credential_present = !!process.env.OPENROUTER_API_KEY?.trim();
  if (!report.hf_credential_present || !report.qa_credential_present) throw Error('missing_credential');
  const jobs = new ItemSpriteJobs(campaign, { generator, reviewer, store });
  jobs.request(initial.id); await jobs.settled(); // Exactly one request; automatic second attempt belongs to ItemSpriteJobs.
  const final = campaign.exportSnapshot().items.find(i => i.id === initial.id);
  report.final_sprite = final.sprite;
  for (const attempt of report.attempts) attempt.final_sprite_status = final.sprite?.status;
  report.visual_description_changed = initial.visual_description !== final.visual_description;
  report.description_changed = initial.description !== final.description;
  report.item_id_changed = initial.id !== final.id;
  const projection = s => ({ ...s, revision: undefined, items: s.items.map(i => ({ ...i, sprite: undefined })) });
  report.gameplay_state_changed = JSON.stringify(projection(gameplayBefore)) !== JSON.stringify(projection(campaign.exportSnapshot()));
  if (final.sprite?.status === 'ready') report.final_asset = join(root, campaign.exportSnapshot().campaign_id, 'portraits', store.characterToken(campaign.exportSnapshot().campaign_id, final.id), final.sprite.asset_ref);
  report.strict_second_attempt_exercised = report.attempts.length === 2;
  report.recovery_live_validated = report.attempts.length === 2 && !report.attempts[0].qa?.accepted && report.attempts[1].qa?.accepted === true && final.sprite?.status === 'ready';
} catch (error) { report.error_code = error.code ?? (error.message === 'missing_credential' ? 'missing_credential' : 'evaluation_failed'); }
finally {
  const afterHashes = Object.fromEntries(await Promise.all(tracked.map(async p => [p, hash(await readFile(p))])));
  report.implementation_unchanged = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);
  await save();
}
console.log(JSON.stringify(report, null, 2));
