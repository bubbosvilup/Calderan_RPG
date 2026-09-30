// Runtime Continuity Repair 1.1 targeted live check: production defaults (GLM 5.2 pinned to Z.AI by the adapter, reasoning disabled,
// 512-token cap; unchanged DeepSeek controller). Reproduces the Runtime Continuity Validation 1 state after T14 (Dell and Doran present
// at the Gatherer's Inn) and its delivered T1-T14 history, replayed through the coordinator's own RecentConversation (same bounds),
// then runs the exact T15 input (the turn that hit the 384 cap) and T16. One attempt each; retry only on infrastructure failure.
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { onlineCoordinator, narratorConfig } from '../.build/src/dev/turn-services.js';
import { capturingFetch, settle } from '../.build/src/dev/narrator-bakeoff.js';

const SOURCE = 'docs/evaluations/runtime-continuity-validation-1-2026-09-30T13-20-13Z';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
const dir = `docs/evaluations/runtime-continuity-repair-1-1-check-${stamp}`;
async function sourceHash() {
  const h = createHash('sha256');
  async function visit(d) { for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const p = `${d}/${e.name}`; if (e.isDirectory()) await visit(p); else { h.update(p); h.update(await readFile(p)); } } }
  await visit('src'); await visit('data'); return h.digest('hex');
}
const prior = await Promise.all(Array.from({ length: 16 }, (_, i) => readFile(`${SOURCE}/turn-${String(i + 1).padStart(2, '0')}.json`, 'utf8').then(JSON.parse)));
await mkdir(dir, { recursive: true });
const world = await loadWorld('data');
const INFRA = new Set(['network_error', 'provider_unavailable', 'rate_limited', 'timeout']);
const manifest = { started_at: new Date().toISOString(), source_before: await sourceHash(), narrator: narratorConfig(), reproduced_from: `${SOURCE} (state and delivered history after T14)`, turns: [] };

const campaign = createOpeningCampaign(world, 'runtime_continuity_repair_1_1_check');
campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'runtime_delta', delta: { player_location: 'gatherers_inn' } }] });
campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'register_character', character: { id: 'campaign_character_eval_dell_harrow', origin: { kind: 'created' },
  profile: { name: 'Dell Harrow', age: { kind: 'exact', years: 38 }, sex: 'male', species: 'Human', appearance: { description: 'A thick-armed dockworker in a salt-stained coat, several ales into a bad evening.' } },
  current: { current_location: 'gatherers_inn', status: 'active', presentation: 'Sour-tempered and loud after a long shift; a regular-looking patron, not a friend of anyone here.' } } }] });
campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'runtime_delta', delta: { character_movements: [{ character_id: 'captain_doran_hale', current_location: 'gatherers_inn' }] } }] });

const routing = [];
const nw = capturingFetch((url, init) => { routing.push(JSON.parse(String(init.body)).provider ?? null); return fetch(url, init); }), cw = capturingFetch(), debug = [];
const coordinator = await onlineCoordinator(world, false, p => p, { narrator_client: new OpenRouterClient({ fetch: nw.fetch }), controller_client: new OpenRouterClient({ fetch: cw.fetch }), debug_sink: r => debug.push(r) });
for (const t of prior.slice(0, 14)) coordinator.recent(campaign).add({ player: t.input, narration: t.delivered, status: 'finalized' });
manifest.seeded_history = { turns: coordinator.recent(campaign).forPrompt().length, serialized_characters: coordinator.recent(campaign).serializedLength() };

for (const n of [15, 16]) {
  const input = prior[n - 1].input;
  let turn;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ni = nw.captures.length, ci = cw.captures.length, di = debug.length, events = [], started = performance.now();
    try { for await (const e of coordinator.runTurn({ campaign, player_input: input })) events.push(e); } catch (e) { events.push({ type: 'exception', message: String(e?.message ?? e) }); }
    await Promise.all([...nw.captures.slice(ni).map(settle), ...cw.captures.slice(ci).map(settle)]);
    const last = events.at(-1), result = last?.type === 'turn_completed' ? last.result : null, rec = result?.narration_reconciliation, after = campaign.exportSnapshot();
    turn = { turn: n, input, attempt, outcome: result ? 'success' : last?.code ?? last?.type ?? 'exception', provider_code: last?.provider_code ?? null,
      draft: rec?.draft ?? null, issues: rec?.issues ?? [], revision_requested: rec?.revision !== undefined, revision: rec?.revision ?? null, revision_issues: rec?.revision_issues ?? [],
      delivered_source: rec?.delivered ?? null, delivered: events.filter(e => e.type === 'narration_delta').map(e => e.text).join(''),
      narrator: nw.captures.slice(ni).map((w, k) => ({ upstream_provider: w.upstream_provider ?? null, finish_reason: w.finish_reason ?? null, usage: w.usage ?? null, error: w.error ?? null, provider_routing: routing[ni + k] ?? null })),
      controller: { authorization: result?.authorization?.map(a => ({ command: a.command, authorized: a.authorized, reason: a.reason })) ?? null, upstream_provider: cw.captures[ci]?.upstream_provider ?? null, debug: debug.slice(di) },
      state: { revision_after: after.revision, present_npcs: after.runtime.npc_locations.filter(x => x.current_location === after.runtime.scene.player_location).map(x => x.character_id),
        created: after.characters.filter(c => c.origin.kind === 'created').map(c => ({ id: c.id, location: c.current.current_location ?? null, conditions: c.current.conditions ?? [] })) },
      recent_conversation: { prompt_turns: coordinator.recent(campaign).forPrompt().length, serialized_characters: coordinator.recent(campaign).serializedLength() },
      latency: { narrator_ttft_ms: result?.latency?.narrator_ttft_ms ?? null, narrator_total_ms: result?.latency?.narrator_total_ms ?? null, controller_ms: result?.latency?.controller_total_ms ?? null, turn_ms: performance.now() - started } };
    if (!(INFRA.has(turn.provider_code) && attempt === 1)) break;
  }
  manifest.turns.push({ turn: n, outcome: turn.outcome, attempt: turn.attempt });
  await writeFile(`${dir}/turn-${n}.json`, JSON.stringify(turn, null, 2));
  console.log(JSON.stringify({ turn: n, outcome: turn.outcome, code: turn.provider_code, delivered: turn.delivered_source, issues: turn.issues.map(i => i.kind),
    finish: turn.narrator.map(w => w.finish_reason), completion: turn.narrator.map(w => w.usage?.completion_tokens), prompt: turn.narrator.map(w => w.usage?.prompt_tokens), upstream: turn.narrator.map(w => w.upstream_provider),
    chars: turn.delivered.length, turn_ms: Math.round(turn.latency.turn_ms), narr_ms: turn.latency.narrator_total_ms, auth: turn.controller.authorization?.map(a => `${a.command.kind}:${a.reason}`), dell: turn.state.created[0]?.location }));
}
manifest.finished_at = new Date().toISOString(); manifest.source_after = await sourceHash(); manifest.source_unchanged = manifest.source_before === manifest.source_after;
await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ done: true, dir, seeded: manifest.seeded_history, source_unchanged: manifest.source_unchanged }));
