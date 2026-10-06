// Evaluation only (P8 Economic Baseline V1). Captures fully prepared production narrator requests through the real
// TurnCoordinator (canonical data/ world, scripted offline setup, no controller commands) and sends only the probe request
// to the production narrator. Usage: node scripts/p8-economy-live.mjs <requests.json> <ledger.json> <samples>
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { learnCanonicalName } from '../.build/src/campaign/identity-knowledge.js';
import { TurnCoordinator } from '../.build/src/turn/turn-coordinator.js';
import { DEFAULT_CONTEXT_POLICY } from '../.build/src/turn/context-budget.js';
import { RetrievalService } from '../.build/src/retrieval/retrieval-service.js';
import { HybridSearch } from '../.build/src/retrieval/hybrid-search.js';
import { MiniMaxNarratorProvider, DEFAULT_NARRATOR_MODEL } from '../.build/src/llm/openrouter/minimax-narrator.js';
import { NARRATOR_OUTPUT_TOKENS } from '../.build/src/app/provider-config.js';
import { exactBenchmarkCredential } from '../.build/src/dev/reflection-benchmark.js';

const META = { model: 'offline-mock', usage: {}, latency: { request_started_at: '2026-01-01T00:00:00Z', headers_ms: 1, time_to_first_token_ms: 1, completed_at: '2026-01-01T00:00:01Z', elapsed_total_ms: 1 } };
const INTRO = { input: '*walks up to Korvin at the private sellers\' stalls* Morning.', narration: '*Korvin turns as Nicco approaches, small eyes flicking over him — build, clothing, hands — before settling on his face.*\n\nGood hour for it. Pens are full this morning.\n\nWhat are you after? Labor, household, something specific?' };
const SCENES = [
  { id: 'E1_korvin_slave_ask', location: 'calderan_slave_market', minute: 630, korvin: true, setup: [INTRO],
    probe: 'Korvin, how much for an ordinary slave who can cook and keep a house? Give me a number.' },
  { id: 'E2_slave_auction', location: 'calderan_slave_market', minute: 660, setup: [{ input: '*walks toward the auction block*', narration: '*A crowd thickens around the auction block. An auctioneer in a stained coat calls for quiet as a broad-shouldered young man, healthy and chained at the wrists, is led up the steps.*' }],
    probe: '*watches the bidding on the young laborer* What are people bidding?' },
  { id: 'E3_inn_meal_room', location: 'gatherers_inn', minute: 1140, setup: [{ input: '*steps into the inn*', narration: '*The common room is warm and loud. Behind the bar, the innkeeper looks up from a tray of mugs.*' }],
    probe: 'Evening. How much for a hot meal and a room for the night?' },
];
async function capture(world, scene) {
  const c = createOpeningCampaign(world, `p8live_${scene.id.toLowerCase()}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: 'runtime_delta', delta: { player_location: scene.location } }, { kind: 'runtime_delta', delta: { time_advance_minutes: scene.minute } }] });
  if (scene.korvin) c.apply({ expected_revision: c.revision, commands: [...learnCanonicalName(world, c.exportSnapshot(), 'korvin')] });
  let text = '', captured;
  const narrator = { async generate() { throw new Error('unused'); }, async *stream(r) { captured = r; yield { type: 'text_delta', text }; yield { type: 'completed', result: { text, ...META } }; } };
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, narrator, { async propose() { return { commands: [], ...META }; } }, { service, search: new HybridSearch(service) },
    { context_policy: { ...DEFAULT_CONTEXT_POLICY, output_tokens: NARRATOR_OUTPUT_TOKENS }, provider_retry: false });
  for (const s of [...scene.setup, { input: scene.probe, narration: '*placeholder*' }]) { text = s.narration; let last; for await (const e of co.runTurn({ campaign: c, player_input: s.input })) last = e; if (last?.type !== 'turn_completed') throw new Error(`${scene.id}: ${JSON.stringify(last).slice(0, 300)}`); }
  const request = { system_prompt: captured.system_prompt, messages: captured.messages };
  const korvin = c.exportSnapshot().price_indices?.find(p => p.character_id === 'korvin')?.percent;
  return { id: scene.id, probe: scene.probe, korvin_index: korvin, sha256: createHash('sha256').update(JSON.stringify(request)).digest('hex'), request };
}
const [requestsPath, ledgerPath, samples] = process.argv.slice(2);
const world = await loadWorld('data');
const scenes = []; for (const s of SCENES) scenes.push(await capture(world, s));
await writeFile(requestsPath, JSON.stringify({ captured_at: new Date().toISOString(), scenes }, null, 2));
process.env.OPENROUTER_API_KEY = exactBenchmarkCredential(process.env.OPENROUTER_API_KEY !== undefined ? { env: process.env.OPENROUTER_API_KEY } : { fileText: await readFile('APIKEY.env', 'utf8') });
const ledger = { model: DEFAULT_NARRATOR_MODEL, route: 'z-ai/fp8', fallbacks: false, reasoning: 'disabled', max_output_tokens: NARRATOR_OUTPUT_TOKENS, automatic_retries: false, attempts: [] };
const narrator = new MiniMaxNarratorProvider(undefined, { model: DEFAULT_NARRATOR_MODEL, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
for (const scene of scenes) for (let i = 1; i <= Number(samples); i++) {
  const a = { scene: scene.id, sample: i, sha256: scene.sha256, started_at: new Date().toISOString() };
  try { const r = await narrator.generate({ ...scene.request, max_output_tokens: NARRATOR_OUTPUT_TOKENS }); Object.assign(a, { status: 'completed', text: r.text, model: r.model, provider: r.provider, cost_usd: r.cost_usd, usage: r.usage }); }
  catch (e) { Object.assign(a, { status: 'failed', error: String(e?.code ?? e) }); }
  ledger.attempts.push(a); await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(`${a.scene}#${i} ${a.status} ${a.provider ?? ''} $${a.cost_usd ?? '?'}`);
}
console.log('total $' + ledger.attempts.reduce((s, a) => s + (a.cost_usd ?? 0), 0).toFixed(6));
