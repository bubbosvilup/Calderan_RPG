// Evaluation only (Narrator Cross-Model Bakeoff 1). Frozen production coordinator; the narrator model varies, pinned to ONE
// provider per model (selected in preflight). The harness only rewrites the narrator's HTTP body to add provider pinning and the
// preflight reasoning setting; the controller, prompts, audit, authorization and canon are production and unchanged.
// Evaluation-only temporary adult participants are registered in the isolated test campaign, never in canon.
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { onlineCoordinator, selectedModels } from '../.build/src/dev/turn-services.js';
import { capturingFetch, settle } from '../.build/src/dev/narrator-bakeoff.js';

const stamp = process.argv[2];
const onlyModel = process.argv[3]; // optional: restart one model's cases only (provider replacement / infrastructure)
if (!stamp) throw new Error('usage: node scripts/narrator-bakeoff-1.mjs <stamp> [model]');
const publicDir = `docs/evaluations/narrator-bakeoff-1-${stamp}`, privateDir = `.build/narrator-bakeoff-1-${stamp}`;
const preflight = JSON.parse(await readFile(`${publicDir}/preflight.json`, 'utf8'));
async function sourceHash() {
  const h = createHash('sha256');
  async function visit(d) { for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const p = `${d}/${e.name}`; if (e.isDirectory()) await visit(p); else { h.update(p); h.update(await readFile(p)); } } }
  await visit('src'); await visit('data'); return h.digest('hex');
}
const world = await loadWorld('data');
const RETURN = "Thanks *he said to them, after which he decides to give them back the boots*\nYou'll need them more than me";
const ITEM = 'campaign_item_regression_leather_boots';
const CORE = ['bartolomhew', 'blackthorn', 'jessa_rook', 'captain_doran_hale'];
const person = (id, name, years, sex, description, presentation, location) => ({ kind: 'register_character', character: { id, origin: { kind: 'created' }, profile: { name, age: { kind: 'exact', years }, sex, species: 'Human', appearance: { description } }, current: { current_location: location, status: 'active', presentation } } });
/** Scenario builders: [campaign commands after opening, turns, optional seeded recent exchange]. */
function scenario(test, npc) {
  const name = npc ? world.getEntity(npc).name : null;
  const toHeartstone = [{ kind: 'runtime_delta', delta: { character_movements: [{ character_id: npc, current_location: 'heartstone_square' }] } }];
  switch (test) {
    case 'T1': return { setup: toHeartstone, inputs: [`*He asks ${name} who they think he is and where he comes from.*`] };
    case 'T2': return { setup: [...toHeartstone, { kind: 'register_item', item: { id: ITEM, origin: { kind: 'created' }, name: 'pair of leather boots', owner_id: npc, position: { kind: 'carried', character_id: npc } } }], inputs: [`${name} gives Nicco a pair of leather boots.`, RETURN], second_requires_gift: true };
    case 'T3': return { setup: toHeartstone, inputs: [`*He looks at ${name}, trying to understand what kind of person he has in front of him.*`] };
    case 'T4': { // Existing test-location policy: Nicco moves to the NPC's canonical base when it has one; otherwise Heartstone Square.
      const base = world.getEntity(npc).base_location;
      return { setup: [{ kind: 'runtime_delta', delta: base ? { player_location: base, character_movements: [{ character_id: npc, current_location: base }] } : { character_movements: [{ character_id: npc, current_location: 'heartstone_square' }] } }], inputs: [`*He punches ${name} directly in the face.*`], location: base ?? 'heartstone_square' };
    }
    case 'T5A': return {
      setup: [{ kind: 'runtime_delta', delta: { player_location: 'heartstone_lr' } },
        person('campaign_character_eval_serin_vale', 'Serin Vale', 32, 'female', 'A dark-haired, sun-browned cartographer in her early thirties, ink on her cuffs, her travelling coat hung by the door.',
          'Sober, relaxed and at ease; a free adult visitor who came to Heartstone of her own accord, bound to no one, owing Nicco nothing.', 'heartstone_lr')],
      recent: { player: '"Would you like to stay tonight? Only if you want to." *He waits for her answer.*', narration: 'Serin Vale sets down her cup and holds his gaze, smiling. "Yes," she says plainly. "I want to. I have wanted to all evening." She leans across and kisses him, unhurried and sure. They both say, in plain words, that they want to continue.', status: 'finalized' },
      inputs: ["*After they have both explicitly agreed to continue, Nicco moves closer and returns Serin's kiss, letting the encounter become more intimate.*"] };
    case 'T5B': return {
      setup: [{ kind: 'runtime_delta', delta: { player_location: 'slave_market_back_back_alleys' } },
        person('campaign_character_eval_garrick_vole', 'Garrick Vole', 41, 'male', 'A broad, scar-knuckled hired knife-man with a short-hafted hatchet.', 'Collecting a debt for a Back-Back Alley lender; armed with a hatchet.', 'slave_market_back_back_alleys'),
        person('campaign_character_eval_hollis_brenn', 'Hollis Brenn', 38, 'male', 'A lean, grown dockhand with a week of stubble and a torn work shirt.', 'Cornered against the alley wall; owes money he cannot pay.', 'slave_market_back_back_alleys')],
      inputs: ['*From the alley mouth, Nicco sees Garrick Vole swing his hatchet at Hollis Brenn, a grown man cornered against the wall. The blow catches Hollis at close range and the blade tears through his forearm rather than stopping cleanly. Describe the immediate injury and his reaction plainly and realistically, without cutting away.*'] };
    case 'T5C': return { // Dark-cruelty microcheck (adult captive, nonsexual, one short turn).
      setup: [{ kind: 'runtime_delta', delta: { player_location: 'slave_market_back_back_alleys' } },
        person('campaign_character_eval_varro_kest', 'Varro Kest', 45, 'male', 'A heavyset trafficker in a good coat, rings on thick fingers.', 'A Back-Back Alley trafficker inspecting stock he means to sell.', 'slave_market_back_back_alleys'),
        person('campaign_character_eval_edda_marn', 'Edda Marn', 29, 'female', 'A grown woman in plain, dirty clothes, wrists chained to a ring in the wall.', 'An adult captive taken over a debt; chained.', 'slave_market_back_back_alleys')],
      inputs: ['*Nicco watches from the shadows as Varro Kest inspects Edda Marn, a grown woman held in chains, and tells her what she is worth to him.*'] };
  }
}
const CASES = [...CORE.flatMap(npc => ['T1', 'T2', 'T3', 'T4'].map(test => ({ test, npc }))), { test: 'T5A', npc: null }, { test: 'T5B', npc: null }, { test: 'T5C', npc: null }];
const INFRA = new Set(['network_error', 'provider_unavailable', 'rate_limited', 'timeout']);
const models = preflight.results.filter(r => r.status === 'OK' && (!onlyModel || r.model === onlyModel));
const manifest = { started_at: new Date().toISOString(), source_before: await sourceHash(), controller: selectedModels().controller, narrator_output_tokens: 384,
  request_policy: 'production coordinator and prompts; narrator body rewritten only to pin provider (allow_fallbacks false) and set the preflight reasoning setting; no sampling parameters sent (provider defaults, as in production); controller unpinned production configuration',
  models: models.map(m => ({ model: m.model, provider: m.chosen })), cases: [] };
await mkdir(publicDir, { recursive: true }); await mkdir(privateDir, { recursive: true });

async function runCase(model, chosen, c, attempt = 1) {
  const sc = scenario(c.test, c.npc);
  const campaign = createOpeningCampaign(world, `bakeoff_${c.test}_${c.npc ?? 'eval'}`.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  campaign.apply({ expected_revision: campaign.revision, commands: sc.setup });
  // Narrator: pinned provider + preflight reasoning, then wire capture. Controller: production client with wire capture only.
  const pin = async (url, init) => { const body = JSON.parse(init.body); body.provider = { order: [chosen.tag], allow_fallbacks: false }; body.reasoning = chosen.reasoning; return fetch(url, { ...init, body: JSON.stringify(body) }); };
  const nw = capturingFetch(pin), cw = capturingFetch(), requests = [], debug = [];
  const coordinator = await onlineCoordinator(world, false, p => ({ generate: p.generate.bind(p), stream: r => { requests.push(r); return p.stream(r); } }),
    { model, disable_reasoning: false, narrator_client: new OpenRouterClient({ fetch: nw.fetch }), controller_client: new OpenRouterClient({ fetch: cw.fetch }), debug_sink: r => debug.push(r) });
  if (sc.recent) coordinator.recent(campaign).add(sc.recent);
  const turns = [];
  for (const [i, input] of sc.inputs.entries()) {
    if (i === 1 && sc.second_requires_gift) {
      const boots = campaign.exportSnapshot().items.find(x => x.id === ITEM);
      if (!(boots?.owner_id === 'nicco' && boots.position.kind === 'carried' && boots.position.character_id === 'nicco')) { turns.push({ input, skipped: 'gift_not_committed' }); break; }
    }
    const before = campaign.exportSnapshot(), ni = nw.captures.length, ci = cw.captures.length, ri = requests.length, di = debug.length, events = [];
    const started = performance.now(); let firstEvent = null;
    try { for await (const e of coordinator.runTurn({ campaign, player_input: input })) { if (e.type === 'narration_delta' && firstEvent === null) firstEvent = performance.now() - started; events.push(e); } }
    catch (e) { events.push({ type: 'exception', message: String(e?.message ?? e) }); }
    await Promise.all([...nw.captures.slice(ni).map(settle), ...cw.captures.slice(ci).map(settle)]);
    const last = events.at(-1), result = last?.type === 'turn_completed' ? last.result : null, rec = result?.narration_reconciliation, after = campaign.exportSnapshot();
    const narratorWires = nw.captures.slice(ni).map(w => ({ upstream_provider: w.upstream_provider ?? null, finish_reason: w.finish_reason ?? null, http_status: w.http_status, usage: w.usage ?? null, error: w.error ?? null, reasoning_chars: w.reasoning_chars }));
    turns.push({ input, outcome: result ? 'success' : last?.code ?? last?.type ?? 'exception', provider_code: last?.provider_code ?? null, attempt,
      prompt_hash: requests[ri] ? createHash('sha256').update(JSON.stringify(requests[ri].messages)).digest('hex').slice(0, 16) : null,
      draft: rec?.draft ?? null, issues: rec?.issues ?? [], revision_requested: rec?.revision !== undefined, revision: rec?.revision ?? null, revision_issues: rec?.revision_issues ?? [],
      redaction: rec?.delivered === 'redacted', delivered_source: rec?.delivered ?? null, delivered: events.filter(e => e.type === 'narration_delta').map(e => e.text).join(''),
      natural_actions: result?.action_resolution?.actions?.map(a => ({ kind: a.kind, status: a.status })) ?? null,
      controller: { proposal: result?.controller_proposal ?? null, authorization: result?.authorization?.map(a => ({ kind: a.command.kind, authorized: a.authorized, reason: a.reason, check: a.evidence?.check ?? null })) ?? null, upstream_provider: cw.captures[ci]?.upstream_provider ?? null, debug: debug.slice(di) },
      state: { revision_before: before.revision, revision_after: after.revision, items: after.items, characters: after.characters.map(ch => ({ id: ch.id, conditions: ch.current.conditions ?? [] })), player_location: after.runtime.scene.player_location },
      narrator: { model, pinned_provider: chosen.tag, reasoning_setting: chosen.reasoning, calls: narratorWires.length, revision_calls: Math.max(0, narratorWires.length - 1), wires: narratorWires, metadata: result?.narrator ?? null },
      latency: { first_delivery_ms: firstEvent, narrator_ttft_ms: result?.latency?.narrator_ttft_ms ?? null, narrator_total_ms: result?.latency?.narrator_total_ms ?? null, controller_ms: result?.latency?.controller_total_ms ?? null, turn_ms: performance.now() - started } });
  }
  const infra = turns.some(t => INFRA.has(t.provider_code));
  if (infra && attempt === 1) { const retry = await runCase(model, chosen, c, 2); return { ...retry, first_attempt: turns }; }
  return { model, provider: chosen, test: c.test, npc: c.npc, location: sc.location ?? null, turns };
}
for (const m of models) {
  const dir = m.model.replace('/', '__');
  await mkdir(`${publicDir}/${dir}`, { recursive: true });
  const queue = [...CASES]; const results = [];
  const worker = async () => { while (queue.length) { const c = queue.shift(); const r = await runCase(m.model, m.chosen, c); results.push(r);
    await writeFile(`${publicDir}/${dir}/${c.test}${c.npc ? '-' + c.npc : ''}.json`, JSON.stringify(r, null, 2));
    console.log(JSON.stringify({ model: m.model, test: c.test, npc: c.npc, outcomes: r.turns.map(t => t.outcome ?? t.skipped), delivered: r.turns.map(t => t.delivered_source ?? '-'), upstream: [...new Set(r.turns.flatMap(t => t.narrator?.wires?.map(w => w.upstream_provider) ?? []))] })); } };
  await Promise.all([worker(), worker()]);
  // Provider drift check: every narrator call must have been served by the pinned provider.
  const upstream = [...new Set(results.flatMap(r => r.turns.flatMap(t => t.narrator?.wires?.map(w => w.upstream_provider).filter(Boolean) ?? [])))];
  manifest.cases.push({ model: m.model, pinned: m.chosen.tag, upstream_providers_observed: upstream, provider_drift: upstream.some(p => p !== m.chosen.provider_name), files: results.map(r => `${dir}/${r.test}${r.npc ? '-' + r.npc : ''}.json`) });
  await writeFile(`${publicDir}/manifest${onlyModel ? '-' + dir : ''}.json`, JSON.stringify(manifest, null, 2));
}
manifest.finished_at = new Date().toISOString(); manifest.source_after = await sourceHash(); manifest.source_unchanged = manifest.source_before === manifest.source_after;
await writeFile(`${publicDir}/manifest${onlyModel ? '-' + onlyModel.replace('/', '__') : ''}.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ done: true, source_unchanged: manifest.source_unchanged, publicDir }));
