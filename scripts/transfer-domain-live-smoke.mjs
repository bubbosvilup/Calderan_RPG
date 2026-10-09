import { readFile, writeFile, access } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { exactBenchmarkCredential, benchmarkAuthentication } from '../.build/src/dev/reflection-benchmark.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { OpenRouterStateControllerProvider } from '../.build/src/llm/openrouter/state-controller.js';
import { readProviderStatus, controllerFallbackModels } from '../.build/src/app/production.js';
import { WorldStore } from '../.build/src/world/world-store.js';
import { CampaignState } from '../.build/src/campaign/campaign-state.js';
import { learnCanonicalName } from '../.build/src/campaign/identity-knowledge.js';
import { TurnCoordinator } from '../.build/src/turn/turn-coordinator.js';
import { RetrievalService } from '../.build/src/retrieval/retrieval-service.js';
import { HybridSearch } from '../.build/src/retrieval/hybrid-search.js';

// Deliberate one-shot evaluation: never overwrite a paid run inadvertently.
const output = 'docs/evaluations/TRANSFER_DOMAIN_LIVE_SMOKE.json';
let exists = false; try { await access(output); exists = true; } catch {}
if (exists) throw new Error('A live report already exists; do not retry this evaluation.');
const report = { timestamp: new Date().toISOString(), authentication: 'not_attempted', calls: 0, retries: 0, image_calls: 0, cases: [] };
// Entirely synthetic, public-only evaluation context. No real campaign/save/canon
// loading and no private facts from the larger shared turnFixture.
function fixture() {
  const base = (id, name) => ({ id, name, display_name: name, parent: null, aliases: [], summary: name, tags: [], search_context: '', content: name, knowledge: { visibility: { narrator: true, player: true }, known_by: [] } });
  const entities = [
    { ...base('shop', 'Shop'), type: 'location', features: [], connections: [] },
    { ...base('nicco', 'Nicco'), type: 'character', role: 'player', location: null, traits: [], relationships: [] },
    ...['brenna', 'maren'].map(id => ({ ...base(id, id[0].toUpperCase() + id.slice(1)), type: 'character', role: 'npc', location: 'shop', traits: [], relationships: [] })),
  ];
  const world = new WorldStore(entities.map(entity => ({ source: `synthetic/${entity.id}.yaml`, document: { schema_version: 1, entity, chunks: [] } })));
  const campaign = new CampaignState(world, 'transfer_live_smoke', { player_location: 'shop', world_time: { world_minute: 600 } });
  campaign.apply({ expected_revision: campaign.revision, commands: ['brenna', 'maren'].flatMap(id => learnCanonicalName(world, campaign.exportSnapshot(), id)) });
  return { world, campaign };
}
const cases = [
  { name: 'Gift', item: 'Silver Knife', owner: 'nicco', holder: 'nicco', to: 'brenna', mode: 'gift', finalOwner: 'brenna', input: "I give Brenna the silver knife as a gift. It's hers now.", narration: 'Brenna accepts the silver knife from Nicco as a permanent gift. The silver knife is now hers.' },
  { name: 'Temporary handoff', item: 'Letter', owner: 'nicco', holder: 'nicco', to: 'brenna', mode: 'handoff', finalOwner: 'nicco', input: 'I hand Brenna the letter so she can read it.', narration: 'Brenna takes the letter from Nicco to read it, holding it temporarily for him.' },
  { name: 'Loan', item: 'Sword', owner: 'nicco', holder: 'nicco', to: 'brenna', mode: 'lend', finalOwner: 'nicco', input: 'I lend Brenna my sword.', narration: "Brenna accepts Nicco's sword on loan and carries the sword. Nicco remains the owner." },
  { name: 'Return', item: 'Sword', owner: 'nicco', holder: 'brenna', to: 'nicco', mode: 'return', finalOwner: 'nicco', input: 'I accept my sword back from Brenna.', narration: "Brenna returns Nicco's sword to Nicco. Nicco takes the sword back from Brenna and carries it." },
  { name: 'Successful theft', item: 'Signet Ring', owner: 'brenna', holder: 'brenna', to: 'nicco', mode: 'steal', finalOwner: 'brenna', input: "I steal Brenna's signet ring.", narration: "Nicco successfully steals Brenna's signet ring from Brenna and pockets the signet ring. The ring remains Brenna's property." },
  { name: 'Reclaim', item: 'Signet Ring', owner: 'brenna', holder: 'nicco', to: 'brenna', mode: 'reclaim', finalOwner: 'brenna', input: 'I let Brenna take her signet ring back.', narration: 'Brenna reclaims her signet ring from Nicco and carries the signet ring herself.' },
  { name: 'Refused gift', item: 'Silver Knife', owner: 'nicco', holder: 'nicco', to: 'nicco', mode: null, finalOwner: 'nicco', input: 'I offer Brenna the silver knife as a gift.', narration: 'Brenna refuses the silver knife. Nicco keeps the silver knife in his hands; no handover occurs.' },
  { name: 'Stolen-item attempted regift', item: 'Signet Ring', owner: 'brenna', holder: 'nicco', to: 'maren', mode: 'handoff', finalOwner: 'brenna', input: 'I give Maren the signet ring as a present.', narration: "Maren accepts the signet ring from Nicco and carries it. Nicco is giving away something he stole: the signet ring remains Brenna's property, although Maren now physically holds it." },
];
try {
  if (!process.env.OPENROUTER_API_KEY?.trim()) process.env.OPENROUTER_API_KEY = exactBenchmarkCredential({ fileText: await readFile('APIKEY.env', 'utf8') });
  report.key_exists = !!process.env.OPENROUTER_API_KEY?.trim();
  const status = readProviderStatus(), fallback = controllerFallbackModels();
  report.primary = status.controller_model; report.fallback = fallback;
  if (report.primary !== 'openai/gpt-6-luna' || fallback.join() !== 'anthropic/claude-haiku-5.5') throw new Error('resolver_mismatch');
  await benchmarkAuthentication(process.env.OPENROUTER_API_KEY); report.authentication = 'passed';
  const client = new OpenRouterClient({ fetch: async (...args) => {
    if (report.calls >= 8) throw new Error('live_call_limit');
    report.calls++; return fetch(...args);
  } });
  for (const c of cases) {
    const f = fixture(), campaign = f.campaign;
    const apply = commands => campaign.apply({ expected_revision: campaign.revision, commands });
    const description = `A plain ${c.item.toLowerCase()}.`, visual_description = c.item === 'Silver Knife' ? 'Small plain silver knife with a straight undecorated blade and simple dark wooden handle.' : c.item === 'Letter' ? 'Folded cream paper letter with an unbroken red wax seal.' : c.item === 'Sword' ? 'Plain straight steel sword with a simple brown leather grip.' : 'Small silver signet ring with a plain oval face.';
    apply([{ kind: 'create_item', name: c.item, description, visual_description, owner_id: c.owner, position: { kind: 'carried', character_id: c.holder } }]);
    const id = 'campaign_item_00000001';
    apply([{ kind: 'set_item_sprite', item_id: id, sprite: { status: 'pending' } }, { kind: 'set_item_sprite', item_id: id, sprite: { status: 'ready', asset_ref: 'portrait_item_fixture.png', generated_from_visual_description: visual_description } }]);
    const before = campaign.exportSnapshot(), itemBefore = before.items.find(i => i.id === id);
    let proposal, failure, prior;
    const provider = new OpenRouterStateControllerProvider(client, { model: report.primary, fallback_models: fallback });
    const controller = { async propose(request) {
      prior = JSON.parse(request.prior_state);
      try { return proposal = await provider.propose(request); }
      catch (e) { failure = { code: e.code ?? 'transport_failed', status: e.http?.status }; throw e; }
    } };
    const meta = { model: 'scripted-narration', usage: {}, latency: { request_started_at: new Date().toISOString(), completed_at: new Date().toISOString(), elapsed_total_ms: 0 } };
    const narrator = { async generate() { return { text: c.narration, ...meta }; }, async *stream() { yield { type: 'text_delta', text: c.narration }; yield { type: 'completed', result: { text: c.narration, ...meta } }; } };
    const service = new RetrievalService(f.world);
    const coordinator = new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false });
    const events = []; for await (const e of coordinator.runTurn({ campaign, player_input: c.input })) events.push(e);
    const last = events.at(-1), result = last?.type === 'turn_completed' ? last.result : undefined;
    const after = campaign.exportSnapshot(), item = after.items.find(i => i.id === id);
    const commands = proposal?.commands ?? [], transfers = commands.filter(x => x.kind === 'transfer_item');
    const grade = {
      mode: c.mode === null ? commands.length === 0 : transfers.length === 1 && transfers[0].mode === c.mode,
      id_reuse: c.mode === null ? commands.length === 0 : transfers.length === 1 && transfers[0].item_id === id,
      carrier: item?.position.kind === 'carried' && item.position.character_id === c.to,
      owner: item?.owner_id === c.finalOwner,
      authorization: !!result && (c.mode === null ? result.authorization.length === 0 : result.authorization.length === 1 && result.authorization[0].authorized),
      engine: !!result && after.revision === before.revision + (c.mode === null ? 0 : 1),
      no_duplicate: after.items.length === before.items.length && !commands.some(x => x.kind === 'create_item'),
      visual_identity: isDeepStrictEqual({ ...item, owner_id: undefined, position: undefined, acquisition: undefined }, { ...itemBefore, owner_id: undefined, position: undefined, acquisition: undefined }),
    };
    const pass = Object.values(grade).every(Boolean);
    report.cases.push({ name: c.name, input: c.input, narration: c.narration, expected: { mode: c.mode, owner: c.finalOwner, carrier: c.to, id }, prior, proposal: commands, evidence: proposal?.evidence, response_model: proposal?.response_model, fallback: proposal?.model_fallback, failure,
      authorization: result?.authorization, turn_status: last?.type, engine: { id: item?.id, owner: item?.owner_id, position: item?.position, revision_delta: after.revision - before.revision, duplicate_created: !grade.no_duplicate, visual_identity_unchanged: grade.visual_identity }, grade, overall: pass ? 'PASS' : 'FAIL',
      failure_class: pass ? undefined : failure ? failure.code === 'structured_output_invalid' ? 'schema/parse' : 'unrelated infrastructure' : !grade.mode || !grade.id_reuse ? 'semantic model decision' : !grade.authorization ? 'authorization' : 'engine command' });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`${report.cases.length}/8 ${c.name}: ${pass ? 'PASS' : 'FAIL'} (${proposal?.response_model ?? failure?.code ?? 'unknown'})`);
    if (failure?.code === 'authentication_error') break;
  }
} catch (e) { report.error = e.code ?? 'preflight_or_runner_failed'; }
report.fallback_occurred = report.cases.some(c => c.fallback === true);
report.parsing_failed = report.cases.some(c => c.failure?.code === 'structured_output_invalid');
report.authorization_rejected = report.cases.some(c => c.authorization?.some(d => !d.authorized));
report.passed = report.cases.filter(c => c.overall === 'PASS').length;
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ calls: report.calls, passed: report.passed, total: report.cases.length, fallback_occurred: report.fallback_occurred, parsing_failed: report.parsing_failed, image_calls: report.image_calls, error: report.error }));
