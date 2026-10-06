// Evaluation only (Canonical NPC Casting / Ephemeral Duplication audit). Deterministic, offline: real data/ world, real
// TurnCoordinator, scripted narration, no controller commands. Records each pipeline stage per turn.
// Usage: node scripts/casting-trace.mjs <out.json>
import { writeFile } from 'node:fs/promises';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { buildTurnContext } from '../.build/src/turn/context-builder.js';
import { canonicalInteractionTargets } from '../.build/src/turn/canonical-interaction-targets.js';
import { narratorIdentityGate } from '../.build/src/turn/narrator-identity.js';
import { readScene } from '../.build/src/turn/narrated-captives.js';
import { castingOptions } from '../.build/src/turn/scene-participants.js';
import { TurnCoordinator } from '../.build/src/turn/turn-coordinator.js';
import { RetrievalService } from '../.build/src/retrieval/retrieval-service.js';
import { HybridSearch } from '../.build/src/retrieval/hybrid-search.js';

const META = { model: 'offline-mock', usage: {}, latency: { request_started_at: '2026-01-01T00:00:00Z', headers_ms: 1, time_to_first_token_ms: 1, completed_at: '2026-01-01T00:00:01Z', elapsed_total_ms: 1 } };
const world = await loadWorld('data');
const ELARA_SCENE = "*Near a silk awning, a woman with long straight platinum-blonde hair and green-hazel eyes stands in elegant, expensive clothing, slowly working a decorative fan as she watches the crowd.*";
const KORVIN_SCENE = "*In the back rows, a short, compact seller with large damaged hands, a hooked nose and small, perceptive eyes leans on a pen rail, watching Nicco come.*";
const CASES = [
  ...[['A1', '*approaches the woman with the fan* Good day.'], ['A2', '*walks up to the woman with the fan* Good day.'], ['A3', '*walks over to the platinum-haired woman* Who are you?'],
    ['A4', '*approaches the platinum-blonde woman with the decorative fan* Who are you?'], ['A5', '*goes up to the woman with the decorative fan* Who are you?'], ['A6', 'Excuse me. Who are you?']].map(([id, engage]) => ({
    id, actor: 'mistress_elara', turns: [
      { input: '*looks around the market*', narration: ELARA_SCENE },
      { input: engage, narration: '*The woman lowers her fan a fraction and studies him.*\n\nVaelra. And you are?' },
      { input: 'I am looking for Mistress Elara.', narration: '*She snaps the fan shut.*\n\nI told you my name. Vaelra.' }] })),
  ...[['B1', '*approaches the short seller with the hooked nose* What have you got?'], ['B2', '*walks up to the seller* What have you got?'], ['B3', '*approaches the seller* What have you got?'],
    ['B4', '*walks over to the man with the hooked nose* What are you selling?'], ['B5', '*approaches the short, compact slaver with the hooked nose* What are you selling?']].map(([id, engage]) => ({
    id, actor: 'korvin', turns: [
      { input: '*heads into the back rows of the private sellers*', narration: KORVIN_SCENE },
      { input: engage, narration: '*The seller spits to one side.*\n\nLabor stock, mostly. Two women, a boy, a big lad for the docks.' },
      { input: '*asks the clerk whose stock this is*', narration: "*A clerk with an ink-stained ledger glances up.*\n\nHarren's stock. Harren runs these rows." }] })),
];

async function run(c) {
  const campaign = createOpeningCampaign(world, `cast_${c.id.toLowerCase()}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'runtime_delta', delta: { player_location: 'calderan_slave_market' } }, { kind: 'runtime_delta', delta: { time_advance_minutes: 630 } }] });
  let text = '', request;
  const narrator = { async generate() { throw new Error('unused'); }, async *stream(r) { request = r; yield { type: 'text_delta', text }; yield { type: 'completed', result: { text, ...META } }; } };
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, narrator, { async propose() { return { commands: [], ...META }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const turns = [];
  for (const t of c.turns) {
    const before = campaign.exportSnapshot(), context = buildTurnContext(world, before, { input: t.input });
    const gate = narratorIdentityGate(context);
    const eligible = context.characters.filter(x => x.id !== 'nicco').map(x => x.id);
    text = t.narration;
    let last; for await (const e of co.runTurn({ campaign, player_input: t.input })) last = e;
    const r = last.result, u = request.messages[0].content;
    const plan = r.scene_participants?.plan;
    const foreground = [...u.matchAll(/^Character ([^(]+)\(([^)]+)\)/gm)].map(m => m[2]).filter(x => x !== 'nicco');
    const bg = (u.match(/\[BACKGROUND PRESENT\]\n([\s\S]*?)BACKGROUND PRESENCE/) || [, ''])[1].split('\n').filter(Boolean).map(l => JSON.parse(l).ref);
    const reading = readScene(co.recent(campaign).finalized(), buildTurnContext(world, campaign.exportSnapshot()), world);
    turns.push({ input: t.input,
      eligible_present: eligible, actor_eligible: eligible.includes(c.actor),
      actor_label: gate?.identities.get(c.actor)?.observable_label,
      canonical_targets: [...canonicalInteractionTargets(context, t.input, castingOptions ? castingOptions(context, [], co.recent(campaign).finalized().slice(0, -1)) : {})],
      plan: plan && { created: plan.created, focus: plan.focus, addressed: plan.addressed, participants: plan.participants.map(p => `${p.ref} ${p.display_name}${p.descriptor ? ` (${p.descriptor})` : ''}`) },
      narrator_foreground: foreground, narrator_background_refs: bg,
      actor_ref: gate?.identities.get(c.actor)?.ref,
      scene_participants_block: (u.match(/\[SCENE PARTICIPANTS\]\n.*\n([\s\S]*?)\n\[/) || [])[1] ?? null,
      self_disclosure_offered: /CONTROLLED SELF-DISCLOSURE/.test(request.system_prompt),
      identity: r.identity ?? null,
      narrated_persons_after: reading.persons.map(p => `${p.ref}${p.present ? '' : ' (not present)'}`),
      created_characters_after: campaign.exportSnapshot().characters.map(x => `${x.id} ${x.profile.name ?? ''}`) });
  }
  return { id: c.id, actor: c.actor, turns };
}
const out = []; for (const c of CASES) out.push(await run(c));
await writeFile(process.argv[2], JSON.stringify(out, null, 2));
for (const c of out) {
  const t = c.turns[1];
  console.log(`${c.id} [${c.actor} eligible=${t.actor_eligible} ref=${t.actor_ref}] "${t.input}"\n   targets=${JSON.stringify(t.canonical_targets)} created=${t.plan?.created} focus=${t.plan?.focus} fg=${JSON.stringify(t.narrator_foreground)} disclosure=${t.self_disclosure_offered}\n   participants=${JSON.stringify(t.plan?.participants)} | T3 fg=${JSON.stringify(c.turns[2].narrator_foreground)} T3 targets=${JSON.stringify(c.turns[2].canonical_targets)} | promoted=${JSON.stringify(c.turns.flatMap(x => x.identity?.promoted ?? []).map(p => p.name))} persons=${JSON.stringify(c.turns[2].narrated_persons_after)}`);
}
