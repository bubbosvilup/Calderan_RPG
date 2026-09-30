// Evaluation only (Calderan Long-Form Narrator Trial 1): one continuous 18-turn campaign per narrator configuration, through the
// frozen production coordinator. The harness only pins the narrator provider and reasoning setting in the narrator HTTP body and
// applies the pre-written scenario scaffold (temporary patron before turn 8, Doran's arrival before turn 14). No runtime changes.
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { onlineCoordinator, selectedModels } from '../.build/src/dev/turn-services.js';
import { capturingFetch, settle } from '../.build/src/dev/narrator-bakeoff.js';

const stamp = process.argv[2];
const dir = `docs/evaluations/long-form-narrator-trial-1-${stamp}`;
const script = JSON.parse(await readFile(`${dir}/player-script.json`, 'utf8'));
const CONFIGS = [
  { id: 'glm-5.2', model: 'z-ai/glm-5.2', tag: 'z-ai/fp8', provider_name: 'Z.AI', reasoning: { enabled: false } },
  { id: 'gemini-3.8-flash-vertex', model: 'google/gemini-3.8-flash', tag: 'google-vertex/global', provider_name: 'Google', reasoning: { effort: 'minimal' } },
];
async function sourceHash() {
  const h = createHash('sha256');
  async function visit(d) { for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const p = `${d}/${e.name}`; if (e.isDirectory()) await visit(p); else { h.update(p); h.update(await readFile(p)); } } }
  await visit('src'); await visit('data'); return h.digest('hex');
}
const world = await loadWorld('data');
const INFRA = new Set(['network_error', 'provider_unavailable', 'rate_limited', 'timeout']);
const manifest = { started_at: new Date().toISOString(), source_before: await sourceHash(), controller: selectedModels().controller, narrator_output_tokens: 384, configs: CONFIGS, runs: [] };

async function runCampaign(cfg) {
  await mkdir(`${dir}/${cfg.id}`, { recursive: true });
  const campaign = createOpeningCampaign(world, `long_form_trial_${cfg.id.replace(/[^a-z0-9]/g, '_')}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'runtime_delta', delta: { player_location: 'gatherers_inn' } }] });
  const pin = async (url, init) => { const body = JSON.parse(init.body); body.provider = { order: [cfg.tag], allow_fallbacks: false }; body.reasoning = cfg.reasoning; return fetch(url, { ...init, body: JSON.stringify(body) }); };
  const nw = capturingFetch(pin), cw = capturingFetch(), requests = [], debug = [];
  const coordinator = await onlineCoordinator(world, false, p => ({ generate: p.generate.bind(p), stream: r => { requests.push(r); return p.stream(r); } }),
    { model: cfg.model, disable_reasoning: false, narrator_client: new OpenRouterClient({ fetch: nw.fetch }), controller_client: new OpenRouterClient({ fetch: cw.fetch }), debug_sink: r => debug.push(r) });
  const turns = [];
  for (const [index, input] of script.turns.entries()) {
    const n = index + 1;
    if (n === 8) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'register_character', character: { id: 'campaign_character_eval_dell_harrow', origin: { kind: 'created' },
      profile: { name: 'Dell Harrow', age: { kind: 'exact', years: 38 }, sex: 'male', species: 'Human', appearance: { description: 'A thick-armed dockworker in a salt-stained coat, several ales into a bad evening.' } },
      current: { current_location: 'gatherers_inn', status: 'active', presentation: 'Sour-tempered and loud after a long shift; a regular-looking patron, not a friend of anyone here.' } } }] });
    if (n === 14) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'runtime_delta', delta: { character_movements: [{ character_id: 'captain_doran_hale', current_location: 'gatherers_inn' }] } }] });
    let turn;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const before = campaign.exportSnapshot(), ni = nw.captures.length, ci = cw.captures.length, ri = requests.length, di = debug.length, events = [], started = performance.now();
      try { for await (const e of coordinator.runTurn({ campaign, player_input: input })) events.push(e); } catch (e) { events.push({ type: 'exception', message: String(e?.message ?? e) }); }
      await Promise.all([...nw.captures.slice(ni).map(settle), ...cw.captures.slice(ci).map(settle)]);
      const last = events.at(-1), result = last?.type === 'turn_completed' ? last.result : null, rec = result?.narration_reconciliation, after = campaign.exportSnapshot();
      const wires = nw.captures.slice(ni).map(w => ({ upstream_provider: w.upstream_provider ?? null, finish_reason: w.finish_reason ?? null, http_status: w.http_status, usage: w.usage ?? null, error: w.error ?? null }));
      turn = { turn: n, input, attempt, outcome: result ? 'success' : last?.code ?? last?.type ?? 'exception', provider_code: last?.provider_code ?? null,
        prompt_hash: requests[ri] ? createHash('sha256').update(JSON.stringify(requests[ri].messages)).digest('hex').slice(0, 16) : null,
        draft: rec?.draft ?? null, issues: rec?.issues ?? [], revision_requested: rec?.revision !== undefined, revision: rec?.revision ?? null, revision_issues: rec?.revision_issues ?? [],
        redaction: rec?.delivered === 'redacted', delivered_source: rec?.delivered ?? null, delivered: events.filter(e => e.type === 'narration_delta').map(e => e.text).join(''),
        natural_actions: result?.action_resolution?.actions?.map(a => ({ kind: a.kind, status: a.status })) ?? null,
        controller: { proposal: result?.controller_proposal ?? null, authorization: result?.authorization?.map(a => ({ kind: a.command.kind, authorized: a.authorized, reason: a.reason, check: a.evidence?.check ?? null })) ?? null, upstream_provider: cw.captures[ci]?.upstream_provider ?? null, debug: debug.slice(di) },
        state: { revision_before: before.revision, revision_after: after.revision, player_location: after.runtime.scene.player_location,
          present_npcs: after.runtime.npc_locations.filter(x => x.current_location === after.runtime.scene.player_location).map(x => x.character_id),
          created_present: after.characters.filter(c => c.origin.kind === 'created' && c.current.current_location === after.runtime.scene.player_location).map(c => c.id),
          conditions: after.characters.filter(c => c.current.conditions?.length).map(c => ({ id: c.id, conditions: c.current.conditions })), items: after.items },
        narrator: { model: cfg.model, pinned: cfg.tag, reasoning: cfg.reasoning, calls: wires.length, wires, metadata: result?.narrator ?? null },
        latency: { narrator_ttft_ms: result?.latency?.narrator_ttft_ms ?? null, narrator_total_ms: result?.latency?.narrator_total_ms ?? null, controller_ms: result?.latency?.controller_total_ms ?? null, turn_ms: performance.now() - started } };
      // One retry only for a clear infrastructure failure; content blocks and quality are results.
      if (!(INFRA.has(turn.provider_code) && attempt === 1)) break;
    }
    turns.push(turn);
    await writeFile(`${dir}/${cfg.id}/turn-${String(n).padStart(2, '0')}.json`, JSON.stringify(turn, null, 2));
    console.log(JSON.stringify({ config: cfg.id, turn: n, outcome: turn.outcome, code: turn.provider_code, delivered: turn.delivered_source, issues: turn.issues.map(i => i.kind), upstream: [...new Set(turn.narrator.wires.map(w => w.upstream_provider))] }));
  }
  const upstream = [...new Set(turns.flatMap(t => t.narrator.wires.map(w => w.upstream_provider).filter(Boolean)))];
  return { config: cfg.id, turns: turns.length, successful: turns.filter(t => t.outcome === 'success').length, upstream_observed: upstream, provider_drift: upstream.some(p => p !== cfg.provider_name) };
}
// The two campaigns are fully independent; they may run concurrently.
manifest.runs = await Promise.all(CONFIGS.map(runCampaign));
manifest.finished_at = new Date().toISOString(); manifest.source_after = await sourceHash(); manifest.source_unchanged = manifest.source_before === manifest.source_after;
await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ done: true, source_unchanged: manifest.source_unchanged, runs: manifest.runs }));
