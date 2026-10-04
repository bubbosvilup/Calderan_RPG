/** Evaluation only. Build first; paid execution requires --stage-b. Never writes canonical data. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { turnFixture } from '../../.build/src/dev/turn-fixture.js';
import { GameSession } from '../../.build/src/app/game-session.js';
import { readProviderStatus } from '../../.build/src/app/production.js';
import { selectedModels, mannerismExtractorModel, contextCompressorModel, NARRATOR_OUTPUT_TOKENS } from '../../.build/src/app/provider-config.js';
import { OpenRouterClient } from '../../.build/src/llm/openrouter/client.js';
import { MiniMaxNarratorProvider } from '../../.build/src/llm/openrouter/minimax-narrator.js';
import { OpenRouterStateControllerProvider } from '../../.build/src/llm/openrouter/state-controller.js';
import { OpenRouterReflectionProvider } from '../../.build/src/llm/openrouter/reflection-provider.js';
import { OpenRouterMannerismExtractor } from '../../.build/src/llm/openrouter/mannerism-extractor.js';
import { FileCampaignRepository } from '../../.build/src/persistence/campaign-repository.js';
import { TurnCoordinator } from '../../.build/src/turn/turn-coordinator.js';
import { RetrievalService } from '../../.build/src/retrieval/retrieval-service.js';
import { HybridSearch } from '../../.build/src/retrieval/hybrid-search.js';
import { LosslessContextCompactor } from '../../.build/src/turn/lossless-context-compaction.js';
import { ContextBudgetManager, DEFAULT_CONTEXT_POLICY } from '../../.build/src/turn/context-budget.js';
import { OpenRouterLosslessCompressor } from '../../.build/src/llm/openrouter/lossless-compressor.js';
const root = 'saves/d09-soak';
mkdirSync(root, { recursive: true });
const put = (name, value) => writeFileSync(`${root}/${name}.json`, JSON.stringify(value, null, 2));
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const productionFiles = execFileSync('git', ['ls-files', 'src', 'data'], { encoding: 'utf8' }).trim().split(/\r?\n/);
const frozen = Object.fromEntries(productionFiles.map(p => [p, hash(readFileSync(p))]));
const budget = JSON.parse(readFileSync(`${root}/budget-preflight.json`, 'utf8'));
const plan = [
  'Good morning, Brenna and Maren. How are you finding this quiet morning?',
  'Brenna, would you prefer company or some quiet while you recover? Either is fine.',
  'Maren, what would you like to do with the morning? We can keep it simple.',
  'Gerome, thank you for being here. I leave space for whatever gesture you want to make.',
  'I tell Maren and Brenna that the eastern bridge is closed. We should keep that in mind before any journey.',
  'Maren, what did I just tell you about the bridge?',
  'I sit quietly with everyone for five minutes, without filling every silence.',
  'Brenna, I would like to help, but I do not want to crowd you. Tell me if I am doing that.',
  'I suggest we go downstairs to the main hall together. Everyone may stay here if they prefer.',
  'I go downstairs to the main hall and wait by the table.',
  'I look around the hall and greet whoever is here, without assuming anyone followed me.',
  'I admit that I sometimes rush to offer solutions before listening. I ask those here what they think.',
  'I take a quiet moment at the table and let the conversation settle.',
  'I go upstairs to the observation room.',
  'I greet whoever is in the room and ask whether they would like company.',
  'Brenna, if you are here, I ask how you would prefer me to help today; otherwise I leave the question for later.',
  'Maren, if you are here, I ask what you remember about the route we discussed; otherwise I wait.',
  'I apologize for being impatient earlier and give those present time to respond.',
  'I ask those present to suggest a modest plan for the rest of the day, without committing anyone to it.',
  'I listen to the suggestions rather than deciding immediately.',
  'I thank those present for their patience. I would rather hear disagreement than a polite yes.',
  'I spend five minutes quietly watching the light through the window.',
  'I ask those present whether the quiet feels comfortable or whether they would prefer a change of scene.',
  'I say that we can leave the bigger decisions until everyone feels ready.',
  'I let the conversation end naturally and remain quietly with whoever wants to stay.',
];
if (!process.argv.includes('--stage-b')) { console.log(JSON.stringify({ dry: true, turns: plan.length, models: readProviderStatus(), cap_usd: budget.hard_cap_usd })); process.exit(0); }
if (existsSync(`${root}/stage-b-start.json`)) throw new Error('Stage B already started; no rerolls or duplicate runs. Inspect archived records.');
put('stage-b-start', { at: new Date().toISOString(), plan, production_sha256: frozen, budget, synthetic: true, history_seeded: false });
let turn = 0, spent = 0, family = '', unknown = false;
const ledger = [], records = [];
class MeteredClient extends OpenRouterClient {
  constructor(label) { super(); this.label = label; }
  async *request(body, streaming, timeout, signal) {
    const rates = budget.prices.find(p => p.id === body.model)?.pricing;
    if (!rates) throw new Error('No verified price for frozen model');
    const upper = 2 * (Buffer.byteLength(JSON.stringify(body)) * Number(rates.prompt) + body.max_tokens * Number(rates.completion));
    if (unknown || spent + upper > budget.hard_cap_usd) throw new Error('Evaluation budget stop');
    const entry = { turn, family: this.label || family, body, started_at: new Date().toISOString(), text: '' };
    ledger.push(entry); put('ledger', ledger);
    try {
      for await (const event of super.request(body, streaming, timeout, signal)) {
        if (event.type === 'text_delta') entry.text += event.text;
        else { entry.metadata = event.metadata; entry.status = 'completed'; if (event.metadata.cost_usd === undefined) unknown = true; else spent += event.metadata.cost_usd; }
        yield event;
      }
      entry.status = 'completed';
    } catch (error) { entry.status = 'failed'; entry.error = error.code ?? error.message; unknown = true; throw error; }
    finally { put('ledger', ledger); }
  }
}
const fixture = turnFixture();
let campaign = fixture.campaign;
campaign.apply({ expected_revision: campaign.revision, commands: [
  { kind: 'create_household', id: 'campaign_household_d09', name: 'Tower household' },
  { kind: 'set_membership', household_id: 'campaign_household_d09', membership: { character_id: 'nicco', status: 'member', role: 'owner' } },
  ...['brenna', 'maren', 'gerome'].map(character_id => ({ kind: 'join_household', household_id: 'campaign_household_d09', character_id })),
] });
put('baseline', campaign.exportSnapshot());
const repository = new FileCampaignRepository(fixture.world, `${root}/campaign`);
const policy = { ...DEFAULT_CONTEXT_POLICY, output_tokens: NARRATOR_OUTPUT_TOKENS };
const cm = contextCompressorModel();
const compaction = new LosslessContextCompactor(cm ? new OpenRouterLosslessCompressor(cm, new MeteredClient('compressor')) : undefined, new ContextBudgetManager(policy));
const service = new RetrievalService(fixture.world);
const models = selectedModels();
const reflection = new OpenRouterReflectionProvider(new MeteredClient('reflection'), { model: readProviderStatus().reflection_model });
const extractor = new OpenRouterMannerismExtractor(new MeteredClient('extractor'), { model: mannerismExtractorModel() });
let requests = [], maintenance = [], reflectionRequests = [], diagnostics;
const deps = {
  world: fixture.world, repository, context_policy: policy, compaction_service: compaction, unsafe_trace: true,
  createCoordinator: hooks => {
    const narrator = new MiniMaxNarratorProvider(new MeteredClient('narrator'), { model: models.narrator, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
    const capture = req => { const { signal, ...data } = req; requests.push(structuredClone(data)); };
    return new TurnCoordinator(fixture.world, { generate(req) { capture(req); return narrator.generate(req); }, async *stream(req) { capture(req); yield* narrator.stream(req); } },
      new OpenRouterStateControllerProvider(new MeteredClient('controller'), { model: models.controller }), { service, search: new HybridSearch(service) },
      { context_policy: policy, context_compaction: compaction, diagnostics_include_query: true, diagnostics_sink: d => { diagnostics = structuredClone(d); hooks.diagnostics_sink(d); } });
  },
  reflection_provider: { async reflect(req) { const result = await reflection.reflect(req); reflectionRequests.push({ request: req, result }); return result; } },
  mannerism_extractor: { async extract(req) { const { signal, ...data } = req; const result = await extractor.extract(req); maintenance.push({ request: data, result }); return result; } },
  mannerism_diagnostics_sink: run => maintenance.push({ run }),
};
let session = GameSession.fromCampaign(deps, campaign);
let stop = 'stage_b_complete', checkpoint;
for (const input of plan) {
  turn++; requests = []; maintenance = []; reflectionRequests = []; diagnostics = undefined;
  const before = campaign.exportSnapshot();
  const outcome = await session.submitPlayerInput(input);
  const after = campaign.exportSnapshot();
  const record = { turn, input, before, after, outcome, requests, diagnostics, maintenance, reflectionRequests };
  records.push(record); put(`turn-${String(turn).padStart(3, '0')}`, record);
  console.log(JSON.stringify({ turn, ok: outcome.ok, spent_usd: spent, reflections: after.premium_reflections.reduce((n, p) => n + p.notes.length, 0), candidates: after.mannerism_learning?.candidates.length ?? 0 }));
  if (!outcome.ok || unknown || maintenance.some(m => ['provider_failed', 'malformed'].includes(m.run?.status))) { stop = 'failed_or_unmetered_call'; break; }
  if (turn === 12) {
    const saved = await session.save(); if (!saved.ok) throw new Error('Checkpoint save failed');
    const loaded = await repository.loadCampaign(campaign.exportSnapshot().campaign_id);
    checkpoint = { turn, before_hash: hash(after), loaded_hash: hash(loaded.campaign.exportSnapshot()), exact: hash(after) === hash(loaded.campaign.exportSnapshot()) };
    if (!checkpoint.exact) throw new Error('Checkpoint authority mismatch');
    campaign = loaded.campaign; session = GameSession.fromCampaign(deps, campaign); put('checkpoint', checkpoint);
  }
}
await session.save();
const changed = productionFiles.filter(p => frozen[p] !== hash(readFileSync(p)));
put('stage-b-summary', { stop, finalized: records.filter(r => r.outcome.ok).length, attempted: turn, spent_usd: spent, unknown_cost: unknown, checkpoint, production_changed: changed, stage_c_authorized: false });
if (changed.length) throw new Error('Production freeze violated');
