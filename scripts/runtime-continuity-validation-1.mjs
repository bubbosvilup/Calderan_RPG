// Runtime Continuity Repair 1 live validation: ONE fresh continuous campaign with the production defaults (GLM 5.2 pinned to Z.AI by
// the narrator adapter, reasoning disabled, 384 tokens; unchanged DeepSeek controller), replaying the exact 18-turn player script
// and scaffold of Calderan Long-Form Narrator Trial 1. The harness only captures wires; it pins nothing itself. One retry only for a
// clear infrastructure failure.
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { onlineCoordinator, selectedModels, narratorConfig } from '../.build/src/dev/turn-services.js';
import { NARRATOR_PROVIDER_ROUTING } from '../.build/src/llm/openrouter/minimax-narrator.js';
import { capturingFetch, settle } from '../.build/src/dev/narrator-bakeoff.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
const dir = `docs/evaluations/runtime-continuity-validation-1-${stamp}`;
const script = JSON.parse(await readFile('docs/evaluations/long-form-narrator-trial-1-2026-09-30T12-30-09Z/player-script.json', 'utf8'));
async function sourceHash() {
  const h = createHash('sha256');
  async function visit(d) { for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const p = `${d}/${e.name}`; if (e.isDirectory()) await visit(p); else { h.update(p); h.update(await readFile(p)); } } }
  await visit('src'); await visit('data'); return h.digest('hex');
}
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/player-script.json`, JSON.stringify({ source: 'long-form-narrator-trial-1-2026-09-30T12-30-09Z/player-script.json (reused unchanged)', ...script }, null, 2));
const world = await loadWorld('data');
const INFRA = new Set(['network_error', 'provider_unavailable', 'rate_limited', 'timeout']);
const config = narratorConfig();
const manifest = { started_at: new Date().toISOString(), source_before: await sourceHash(), narrator: { ...config, provider: NARRATOR_PROVIDER_ROUTING[config.model] ?? null }, controller: selectedModels().controller, turns: [] };

const campaign = createOpeningCampaign(world, 'runtime_continuity_validation_1');
campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'runtime_delta', delta: { player_location: 'gatherers_inn' } }] });
const routing = []; // provider routing actually sent in each narrator request body (the harness pins nothing)
const nw = capturingFetch((url, init) => { routing.push(JSON.parse(String(init.body)).provider ?? null); return fetch(url, init); }), cw = capturingFetch(), requests = [], debug = [];
const coordinator = await onlineCoordinator(world, false, p => ({ generate: p.generate.bind(p), stream: r => { requests.push(r); return p.stream(r); } }),
  { narrator_client: new OpenRouterClient({ fetch: nw.fetch }), controller_client: new OpenRouterClient({ fetch: cw.fetch }), debug_sink: r => debug.push(r) });
for (const [index, input] of script.turns.entries()) {
  const n = index + 1;
  if (n === 8) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'register_character', character: { id: 'campaign_character_eval_dell_harrow', origin: { kind: 'created' },
    profile: { name: 'Dell Harrow', age: { kind: 'exact', years: 38 }, sex: 'male', species: 'Human', appearance: { description: 'A thick-armed dockworker in a salt-stained coat, several ales into a bad evening.' } },
    current: { current_location: 'gatherers_inn', status: 'active', presentation: 'Sour-tempered and loud after a long shift; a regular-looking patron, not a friend of anyone here.' } } }] });
  if (n === 14) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'runtime_delta', delta: { character_movements: [{ character_id: 'captain_doran_hale', current_location: 'gatherers_inn' }] } }] });
  let turn;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ni = nw.captures.length, ci = cw.captures.length, ri = requests.length, di = debug.length, events = [], started = performance.now();
    try { for await (const e of coordinator.runTurn({ campaign, player_input: input })) events.push(e); } catch (e) { events.push({ type: 'exception', message: String(e?.message ?? e) }); }
    await Promise.all([...nw.captures.slice(ni).map(settle), ...cw.captures.slice(ci).map(settle)]);
    const last = events.at(-1), result = last?.type === 'turn_completed' ? last.result : null, rec = result?.narration_reconciliation, after = campaign.exportSnapshot();
    const wires = nw.captures.slice(ni).map((w, k) => ({ upstream_provider: w.upstream_provider ?? null, finish_reason: w.finish_reason ?? null, http_status: w.http_status, usage: w.usage ?? null, error: w.error ?? null, provider_routing: routing[ni + k] ?? null }));
    const recent = coordinator.recent(campaign);
    turn = { turn: n, input, attempt, outcome: result ? 'success' : last?.code ?? last?.type ?? 'exception', provider_code: last?.provider_code ?? null,
      prompt_hash: requests[ri] ? createHash('sha256').update(JSON.stringify(requests[ri].messages)).digest('hex').slice(0, 16) : null,
      prompt_characters: requests[ri] ? JSON.stringify(requests[ri].messages).length + requests[ri].system_prompt.length : null,
      draft: rec?.draft ?? null, issues: rec?.issues ?? [], revision_requested: rec?.revision !== undefined, revision: rec?.revision ?? null, revision_issues: rec?.revision_issues ?? [],
      redaction: rec?.delivered === 'redacted', delivered_source: rec?.delivered ?? null, delivered: events.filter(e => e.type === 'narration_delta').map(e => e.text).join(''),
      controller: { proposal: result?.controller_proposal ?? null, authorization: result?.authorization?.map(a => ({ kind: a.command.kind, command: a.command, authorized: a.authorized, reason: a.reason, check: a.evidence?.check ?? null, quote: a.evidence?.quote ?? null })) ?? null, upstream_provider: cw.captures[ci]?.upstream_provider ?? null, debug: debug.slice(di) },
      state: { revision_after: after.revision, present_npcs: after.runtime.npc_locations.filter(x => x.current_location === after.runtime.scene.player_location).map(x => x.character_id),
        created: after.characters.filter(c => c.origin.kind === 'created').map(c => ({ id: c.id, location: c.current.current_location ?? null, conditions: c.current.conditions ?? [] })),
        conditions: after.characters.filter(c => c.current.conditions?.length).map(c => ({ id: c.id, conditions: c.current.conditions })) },
      recent_conversation: { turns_retained: recent.entries().length, prompt_turns: recent.forPrompt().length, serialized_characters: recent.serializedLength(), context_recent_characters: result?.context_characters?.recent_conversation ?? null },
      narrator: { calls: wires.length, wires, metadata: result?.narrator ?? null },
      latency: { narrator_ttft_ms: result?.latency?.narrator_ttft_ms ?? null, narrator_total_ms: result?.latency?.narrator_total_ms ?? null, controller_ms: result?.latency?.controller_total_ms ?? null, turn_ms: performance.now() - started } };
    if (!(INFRA.has(turn.provider_code) && attempt === 1)) break;
  }
  manifest.turns.push({ turn: n, outcome: turn.outcome, attempt: turn.attempt });
  await writeFile(`${dir}/turn-${String(n).padStart(2, '0')}.json`, JSON.stringify(turn, null, 2));
  console.log(JSON.stringify({ turn: n, outcome: turn.outcome, code: turn.provider_code, delivered: turn.delivered_source, issues: turn.issues.map(i => i.kind), auth: turn.controller.authorization?.map(a => `${a.kind}:${a.reason}`), upstream: [...new Set(turn.narrator.wires.map(w => w.upstream_provider))], recent: turn.recent_conversation.turns_retained, dell: turn.state.created[0]?.location ?? null }));
}
manifest.finished_at = new Date().toISOString(); manifest.source_after = await sourceHash(); manifest.source_unchanged = manifest.source_before === manifest.source_after;
await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ done: true, dir, source_unchanged: manifest.source_unchanged }));
