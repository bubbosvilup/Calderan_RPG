// Evaluation only (Character Performance Contract Pilot). Builds frozen, fully prepared production narrator requests through the
// real TurnCoordinator (canonical data/ world, scripted offline setup narration, no controller commands), then optionally sends them
// to the production narrator. Usage:
//   node scripts/character-performance-pilot.mjs capture <out.json>
//   node scripts/character-performance-pilot.mjs live <requests.json> <ledger.json> <condition> <samples> [sceneId...]
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign, OPENING_HOUSEHOLD } from '../.build/src/campaign/opening-state.js';
import { learnCanonicalName } from '../.build/src/campaign/identity-knowledge.js';
import { TurnCoordinator } from '../.build/src/turn/turn-coordinator.js';
import { DEFAULT_CONTEXT_POLICY } from '../.build/src/turn/context-budget.js';
import { RetrievalService } from '../.build/src/retrieval/retrieval-service.js';
import { HybridSearch } from '../.build/src/retrieval/hybrid-search.js';
import { MiniMaxNarratorProvider, DEFAULT_NARRATOR_MODEL } from '../.build/src/llm/openrouter/minimax-narrator.js';
import { NARRATOR_OUTPUT_TOKENS } from '../.build/src/app/provider-config.js';
import { exactBenchmarkCredential } from '../.build/src/dev/reflection-benchmark.js';

const META = { model: 'offline-mock', usage: {}, latency: { request_started_at: '2026-01-01T00:00:00Z', headers_ms: 1, time_to_first_token_ms: 1, completed_at: '2026-01-01T00:00:01Z', elapsed_total_ms: 1 } };
const BRENNA = 'campaign_character_pilot_brenna';
const brenna = presentation => [
  { kind: 'register_character', character: { id: BRENNA, origin: { kind: 'created' }, profile: { name: 'Brenna', sex: 'female', age: { kind: 'exact', years: 32 }, voice: 'Low and clipped; says little.' },
    current: { current_location: 'heartstone_lr', status: 'active', presentation } } },
  { kind: 'set_membership', household_id: OPENING_HOUSEHOLD, membership: { character_id: BRENNA, status: 'member' } },
];
const INTRO = { input: '*walks up to Korvin at the private sellers\' stalls* Morning.', narration: '*Korvin turns as Nicco approaches, small eyes flicking over him — build, clothing, hands — before settling on his face.*\n\nGood hour for it. Pens are full this morning.\n\n*He gestures with one broad hand toward the rows of holding pens behind him.*\n\nWhat are you after? Labor, household, something specific?' };
const POINT = { input: 'Household. Someone who can cook and keep a house running.', narration: '*Korvin grunts and jerks his chin toward the nearest pen, where a woman of about thirty sits on the straw with her wrists chained in front of her. She watches the two of them without moving.*\n\nThat one. Worked a kitchen before she came to me. Ask her yourself if you like.' };
/** Five frozen scenes. Setup narration is fixture prose delivered by an offline mock; only the probe request is ever sent live. */
export const SCENES = [
  { id: 'S1_seller_negotiation', location: 'calderan_slave_market', minute: 630, korvin: true, setup: [INTRO],
    probe: 'Korvin, I need someone for a household. Someone who can cook and keep a house running. I don\'t want to overpay for it, though.' },
  { id: 'S2_seller_captive', location: 'calderan_slave_market', minute: 640, korvin: true, setup: [INTRO, POINT],
    probe: '*crouches in front of the pen and speaks to the chained woman directly* Can you cook? And have you ever run a household before?' },
  { id: 'S3_quiet_guarded', location: 'heartstone_lr', minute: 1150, extra: brenna('Wary and guarded; brought to the tower two days ago and still recovering from a fever.'),
    setup: [{ input: '*comes down to the living floor*', narration: '*Brenna sits at the far end of the table with a blanket around her shoulders, still pale from the fever. She watches the hearth more than the room.*' }],
    probe: 'Are you hungry?' },
  { id: 'S4_specific_physical', location: 'calderan_slave_market', minute: 650, korvin: true, setup: [INTRO],
    probe: '*notices the old scarring across Korvin\'s knuckles and laughs before he can stop himself* Sorry. Those hands look like they\'ve lost a few arguments with crates.' },
  { id: 'S5_household_ordinary', location: 'heartstone_lr', minute: 960, extra: brenna('Settling into the household; quiet, practical, recovered from her fever.'),
    setup: [{ input: '*comes down to the living floor*', narration: '*Brenna stands at the kitchen side of the room, peeling and cutting root vegetables on the table, sleeves pushed back. A pot sits on the hearth.*' }],
    probe: '*leans against the edge of the table* Need a hand with that?' },
];

async function captureScene(world, scene) {
  const c = createOpeningCampaign(world, `cpp_${scene.id.toLowerCase()}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: 'runtime_delta', delta: { player_location: scene.location } }, { kind: 'runtime_delta', delta: { time_advance_minutes: scene.minute } }, ...(scene.extra ?? [])] });
  if (scene.korvin) c.apply({ expected_revision: c.revision, commands: [...learnCanonicalName(world, c.exportSnapshot(), 'korvin')] });
  let text = '', captured;
  const narrator = { async generate() { throw new Error('unused'); },
    async *stream(request) { captured = request; yield { type: 'text_delta', text }; yield { type: 'completed', result: { text, ...META } }; } };
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, narrator, { async propose() { return { commands: [], ...META }; } }, { service, search: new HybridSearch(service) },
    { context_policy: { ...DEFAULT_CONTEXT_POLICY, output_tokens: NARRATOR_OUTPUT_TOKENS }, provider_retry: false });
  const turn = async (input, narration) => {
    text = narration; let last;
    for await (const e of co.runTurn({ campaign: c, player_input: input })) last = e;
    if (last?.type !== 'turn_completed') throw new Error(`${scene.id} setup failed: ${JSON.stringify(last).slice(0, 400)}`);
  };
  for (const s of scene.setup) await turn(s.input, s.narration);
  await turn(scene.probe, '*placeholder*');
  const request = { system_prompt: captured.system_prompt, messages: captured.messages };
  return { id: scene.id, probe: scene.probe, sha256: createHash('sha256').update(JSON.stringify(request)).digest('hex'), max_output_tokens: captured.max_output_tokens ?? null, request };
}

const [mode, ...args] = process.argv.slice(2);
if (mode === 'capture') {
  const world = await loadWorld('data');
  const out = [];
  for (const scene of SCENES) out.push(await captureScene(world, scene));
  await writeFile(args[0], JSON.stringify({ captured_at: new Date().toISOString(), scenes: out }, null, 2));
  console.log(out.map(s => `${s.id} ${s.sha256.slice(0, 12)} sys=${s.request.system_prompt.length} user=${s.request.messages[0].content.length}`).join('\n'));
} else if (mode === 'live') {
  const [requestsPath, ledgerPath, condition, samplesText, ...only] = args;
  process.env.OPENROUTER_API_KEY = exactBenchmarkCredential(process.env.OPENROUTER_API_KEY !== undefined ? { env: process.env.OPENROUTER_API_KEY } : { fileText: await readFile('APIKEY.env', 'utf8') });
  const { scenes } = JSON.parse(await readFile(requestsPath, 'utf8'));
  let ledger; try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); } catch { ledger = { model: DEFAULT_NARRATOR_MODEL, route: 'z-ai/fp8', fallbacks: false, reasoning: 'disabled', max_output_tokens: NARRATOR_OUTPUT_TOKENS, automatic_retries: false, attempts: [] }; }
  // Production adapter and routing (z-ai/fp8, allow_fallbacks false, reasoning disabled); no retry wrapper.
  const narrator = new MiniMaxNarratorProvider(undefined, { model: DEFAULT_NARRATOR_MODEL, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
  for (const scene of scenes.filter(s => !only.length || only.includes(s.id))) for (let i = 0; i < Number(samplesText); i++) {
    const attempt = { scene: scene.id, condition, sample: ledger.attempts.filter(a => a.scene === scene.id && a.condition === condition).length + 1, sha256: scene.sha256, started_at: new Date().toISOString() };
    try { const r = await narrator.generate({ ...scene.request, max_output_tokens: NARRATOR_OUTPUT_TOKENS }); Object.assign(attempt, { status: 'completed', text: r.text, model: r.model, provider: r.provider, cost_usd: r.cost_usd, usage: r.usage, latency_ms: r.latency?.elapsed_total_ms }); }
    catch (e) { Object.assign(attempt, { status: 'failed', error: String(e?.code ?? e) }); }
    ledger.attempts.push(attempt);
    await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log(`${attempt.scene} ${condition}#${attempt.sample} ${attempt.status} ${attempt.provider ?? ''} $${attempt.cost_usd ?? '?'} ${attempt.usage?.prompt_tokens ?? '?'}/${attempt.usage?.completion_tokens ?? '?'}`);
  }
  const done = ledger.attempts.filter(a => a.status === 'completed');
  console.log(`total completed ${done.length}, cost $${done.reduce((s, a) => s + (a.cost_usd ?? 0), 0).toFixed(6)}`);
} else throw new Error('usage: capture <out> | live <requests> <ledger> <condition> <samples> [scene...]');
