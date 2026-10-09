import test from 'node:test';
import type { CampaignCommand, CampaignSnapshot, ReflectionNote } from '../src/campaign/types.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { turnFixture } from '../src/dev/turn-fixture.js';
import { reflectAfterTurn, type ReflectionProvider } from '../src/turn/reflection.js';
import { captureProductionReflection } from '../src/turn/structured-reflection-maintenance.js';
import { E1_SCHEMA, E1_SYSTEM, evaluateStructuredOutputE1 } from '../src/turn/structured/reflection-v23-cvc-e1.js';
import { E1_SCHEMA as frozenSchema, E1_SYSTEM as frozenPrompt } from '../src/dev/reflection-v23-cvc-e1.js';
import { STORED_REFLECTION_SCHEMA } from '../src/campaign/reflection-proposal-schema.js';
import { ProviderError } from '../src/llm/errors.js';
import { OpenRouterReflectionProvider, ReflectionProviderError, DEFAULT_REFLECTION_MODEL } from '../src/llm/openrouter/reflection-provider.js';
import { createProductionDeps } from '../src/app/production.js';
import { instantReflectionPacing, testContrast, testEnvironment, productionStub } from './production-reflection-fixtures.js';
import { createSaveFile, serializeSave, decodeSave } from '../src/persistence/save-format.js';
import { CampaignState } from '../src/campaign/campaign-state.js';
import { buildTurnContext } from '../src/turn/context-builder.js';
import { recoverNpcContext } from '../src/turn/npc-plus.js';
import { runPlayTurn } from '../src/dev/play-turn.js';
import { TurnCoordinator } from '../src/turn/turn-coordinator.js';
import { mockController, mockNarrator } from './turn-fixtures.js';
import { RetrievalService } from '../src/retrieval/retrieval-service.js';
import { HybridSearch } from '../src/retrieval/hybrid-search.js';
const HOME = 'campaign_household_prod_reflection';
function fixture(mode = 'environment') {
    const f = turnFixture(false, { courtyard: true });
    const run = (commands: readonly CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
    run([{ kind: 'create_household', id: HOME }, { kind: 'set_membership', household_id: HOME, membership: { character_id: 'nicco', status: 'member', role: 'owner' } }, { kind: 'join_household', household_id: HOME, character_id: 'maren' }]);
    if (mode === 'environment')
        for (const stage of ['Dawn', 'Midday', 'Evening'])
            run([{ kind: 'add_household_rule', household_id: HOME, text: `${stage} check; Check kiln vents before lighting.` }]);
    if (mode === 'contrast')
        for (let i = 0; i < 2; i++)
            run(['trust', 'wariness'].map(dimension => ({ kind: 'adjust_relationship' as const, from_character_id: 'maren', to_character_id: 'brenna', dimension: dimension as 'trust' | 'wariness', direction: 'raise' as const })));
    if (mode === 'statements') {
        run([{ kind: 'establish_character_contract', character_id: 'maren', field: 'voice', text: 'I mark chipped pots.', quote: 'I mark chipped pots.' }]);
        run([{ kind: 'establish_character_contract', character_id: 'maren', field: 'social_style', text: 'I separate chipped pots from finished batches.', quote: 'I separate chipped pots from finished batches.' }]);
    }
    return { ...f, run };
}
const options = () => instantReflectionPacing();
test('production promotion preserves frozen semantics, schema/prompt and storage schema exactly', () => {
    assert.deepEqual(E1_SCHEMA, frozenSchema);
    assert.deepEqual(E1_SCHEMA, STORED_REFLECTION_SCHEMA);
    assert.equal(E1_SYSTEM, frozenPrompt);
    for (const name of ['reflection-v2', 'reflection-v21', 'reflection-v22', 'reflection-v23', 'reflection-v23-cvc', 'reflection-v23-cvc-e1', 'reflection-wire', 'reflection-wire-v2-cvc']) {
        const source = readFileSync(`src/dev/${name}.ts`, 'utf8').replaceAll('\r\n', '\n'), promoted = readFileSync(`src/turn/structured/${name}.ts`, 'utf8').split('\n').slice(1).join('\n').replaceAll('../../campaign/', '../campaign/').replaceAll('../../types/', '../types/').replaceAll('../../world/', '../world/').replace(/(['"])\.\.\/(reflection|npc-plus)\.js/g, '$1../turn/$2.js');
        assert.equal(promoted, source, name);
    }
});
test('accepted E1 notes persist exactly once, atomically with versioned original typed provenance', async () => {
    const f = fixture(), before = f.campaign.exportSnapshot(), runs = await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testEnvironment(r)]), options());
    assert.equal(runs[0]!.status, 'committed');
    const after = f.campaign.exportSnapshot(), notes = after.premium_reflections[0]!.notes;
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.structured!.source_revision, before.revision);
    assert.equal(notes[0]!.structured!.semantic_version, 'V2.3-CVC-E1');
    assert.match(notes[0]!.text, /Check kiln vents before lighting\./);
    assert.equal(after.revision, before.revision + 1);
    assert.deepEqual(await reflectAfterTurn(f.campaign, f.world, productionStub(() => { throw Error('must not dispatch again'); }), options()), []);
    const { revision: _r, premium_reflections: _p, ...domains } = after, { revision: _b, premium_reflections: _a, ...old } = before;
    assert.deepEqual(domains, old);
});
test('valid empty succeeds with zero notes and no retry', async () => { const f = fixture(); let calls = 0; const runs = await reflectAfterTurn(f.campaign, f.world, productionStub(() => { calls++; return []; }), options()); assert.equal(calls, 1); assert.equal(runs[0]!.status, 'committed'); assert.equal(runs[0]!.semantic_result, 'no_useful_notes'); assert.equal(f.campaign.exportSnapshot().premium_reflections[0]!.notes.length, 0); });
for (const bad of ['not JSON', '```json\n{"proposals":[]}\n```', '{"proposals":[]} trailing', '{"proposals":[]}{"proposals":[]}', '{"proposals":', '{"proposals":[],"extra":true}'])
    test(`strict malformed response ${bad.slice(0, 15)} retries once then skips`, async () => { const f = fixture(), before = f.campaign.exportSnapshot(); let calls = 0; const runs = await reflectAfterTurn(f.campaign, f.world, { async reflect() { calls++; return { text: bad }; } }, options()); assert.equal(calls, 2); assert.equal(runs[0]!.status, 'malformed'); assert.equal(f.campaign.exportSnapshot(), before); assert.equal(runs[0]!.attempts!.attempts, 2); });
test('429 honors Retry-After and uses the identical body/context on recovery', async () => { const f = fixture(), p = options(), requests: string[] = []; const provider: ReflectionProvider = { async reflect(r) { requests.push(JSON.stringify({ character: r.character, evidence: r.evidence, existing: r.existing, wire: r.wire_schema })); if (requests.length === 1)
        throw new ReflectionProviderError(new ProviderError('rate_limited'), 8000); return { text: JSON.stringify({ proposals: [testEnvironment(r)] }) }; } }; const runs = await reflectAfterTurn(f.campaign, f.world, provider, p); assert.equal(requests.length, 2); assert.equal(requests[0], requests[1]); assert.ok(p.sleeps.includes(8000)); assert.equal(runs[0]!.attempts!.recovered, true); });
test('429 fallback uses 6000 ms then safely skips after second failure', async () => { const f = fixture(), p = options(), before = f.campaign.exportSnapshot(); let calls = 0; const runs = await reflectAfterTurn(f.campaign, f.world, { async reflect() { calls++; throw new ProviderError('rate_limited'); } }, p); assert.equal(calls, 2); assert.ok(p.sleeps.includes(6000)); assert.equal(runs[0]!.status, 'provider_failed'); assert.equal(f.campaign.exportSnapshot(), before); });
for (const attack of ['duplicate', 'outside', 'hidden'] as const)
    test(`canonical/domain ${attack} citation rejects without any persistence`, async () => { const f = fixture('contrast'), before = f.campaign.exportSnapshot(), hidden = captureProductionReflection(f.campaign, f.world, 'maren').catalog.find(e => e.evidence_type === 'relationship_snapshot')!.ref; const runs = await reflectAfterTurn(f.campaign, f.world, productionStub(r => { const p = testContrast(r); p.evidence_refs = attack === 'duplicate' ? [...p.evidence_refs, p.evidence_refs[0]!] : [...p.evidence_refs, attack === 'hidden' ? hidden : 'npcmem:maren:unknown']; return [p]; }), options()); assert.equal(runs[0]!.status, 'malformed'); assert.equal(f.campaign.exportSnapshot(), before); });
test('visible event selectors support synthesis from hidden exact quote records', async () => { const f = fixture('statements'), c = captureProductionReflection(f.campaign, f.world, 'maren'); assert.equal(c.request.evidence.some(e => e.evidence_type === 'self_statement'), false); assert.equal(c.context.citation.statement_refs.length, 2); const runs = await reflectAfterTurn(f.campaign, f.world, productionStub(r => [{ subject_character_id: r.character.id, confidence: 'high', evidence_refs: r.evidence.filter(e => e.evidence_type === 'statement_event').map(e => e.ref), claim: { type: 'self_statement_synthesis', statement_refs: c.context.citation.statement_refs } }]), options()); assert.equal(runs[0]!.accepted.length, 1); assert.equal(f.campaign.exportSnapshot().premium_reflections[0]!.notes[0]!.structured!.proposal.claim.type, 'self_statement_synthesis'); });
test('history-only current contrast uses hidden authority and persists', async () => { const f = fixture('contrast'), c = captureProductionReflection(f.campaign, f.world, 'maren'); assert.equal(c.request.evidence.some(e => e.evidence_type === 'relationship_snapshot'), false); assert.ok(c.context.citation.hidden_authority_refs.some(v => v.startsWith('npcrel:'))); const runs = await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testContrast(r)]), options()); assert.equal(runs[0]!.accepted.length, 1); });
test('stale captured revision never writes, and preserves the newer player change', async () => { const f = fixture(), source = f.campaign.revision; const runs = await reflectAfterTurn(f.campaign, f.world, { async reflect(r) { f.run([{ kind: 'runtime_delta', delta: { time_advance_minutes: 1 } }]); return { text: JSON.stringify({ proposals: [testEnvironment(r)] }) }; } }, options()); assert.equal(runs[0]!.status, 'stale'); assert.equal(f.campaign.revision, source + 1); assert.equal(f.campaign.exportSnapshot().premium_reflections.length, 0); });
test('semantic rejection has no reroll and preserves qualified batch acceptance', async () => { const f = fixture(), provider = productionStub(r => { const p = testEnvironment(r); return [p, { ...p, claim: { ...p.claim, occurrence_count: 2 } }]; }); const c = captureProductionReflection(f.campaign, f.world, 'maren'), expected = evaluateStructuredOutputE1(JSON.parse((await provider.reflect(c.request)).text).proposals, c.context, new Map()), runs = await reflectAfterTurn(f.campaign, f.world, provider, options()); assert.equal(runs[0]!.attempts!.attempts, 1); assert.equal(runs[0]!.accepted.length, expected.accepted.length); assert.equal(runs[0]!.rejected.length, 1); assert.equal(f.campaign.exportSnapshot().premium_reflections[0]!.notes.length, 1); });
test('all accepted distinct claims persist coherently, while a malformed batch persists none', async () => { const f = fixture(), runs = await reflectAfterTurn(f.campaign, f.world, productionStub(r => { const p = testEnvironment(r); return [p, { ...p, claim: { ...p.claim, anchor_ref: p.evidence_refs[1] } }]; }), options()); assert.equal(runs[0]!.accepted.length, 2); const notes = f.campaign.exportSnapshot().premium_reflections[0]!.notes; assert.equal(notes.length, 2); assert.notEqual(notes[0]!.label, notes[1]!.label); });
test('legacy notes and new structured notes round-trip manual Save and remain recoverable and hidden from narration', async () => { const f = fixture(), ref = captureProductionReflection(f.campaign, f.world, 'maren').request.evidence[0]!.ref; f.run([{ kind: 'record_reflection', character_id: 'maren', reflected_revision: 0, notes: [{ id: 'legacy_note', kind: 'stance', label: 'historical', text: 'Historical interpretation.', evidence_refs: [ref], confidence: 'low', created_revision: 1, updated_revision: 1 }] }]); await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testEnvironment(r)]), options()); const snapshot = f.campaign.exportSnapshot(), save = serializeSave(createSaveFile(snapshot, f.world, '2026-10-05T00:00:00.000Z'), f.world), restored = CampaignState.restore(f.world, decodeSave(save, f.world).snapshot).exportSnapshot(); assert.deepEqual(restored.premium_reflections, snapshot.premium_reflections); assert.equal(restored.premium_reflections[0]!.notes.find(n => n.id === 'legacy_note')!.structured, undefined); const note = restored.premium_reflections[0]!.notes.find(n => n.structured)!; assert.ok(recoverNpcContext(f.world, restored, `npcmem:maren:reflection:${note.id}`)!.exact_payload.includes('V2.3-CVC-E1')); const context = buildTurnContext(f.world, restored, { input: 'Maren, tell me about the workshop.' }); assert.ok(context.npc_plus!.lines.every(l => !l.includes(' | reflection:') && !l.includes('; refl='))); assert.deepEqual(context.npc_plus, buildTurnContext(f.world, { ...restored, premium_reflections: [] }, { input: 'Maren, tell me about the workshop.' }).npc_plus); assert.deepEqual(restored.premium_reflections, snapshot.premium_reflections); });
test('real post-turn publication remains successful when reflection transport fails twice', async () => { const f = fixture(), service = new RetrievalService(f.world), coordinator = new TurnCoordinator(f.world, mockNarrator('Maren nods.'), mockController([]), { service, search: new HybridSearch(service) }), published: string[] = []; let finalized: ReturnType<typeof f.campaign.exportSnapshot> | undefined; const runs = await runPlayTurn({ coordinator, world: f.world, request: { campaign: f.campaign, player_input: 'I wait.' }, publish: e => published.push(e.type), reflection_provider: { async reflect() { assert.equal(published.at(-1), 'turn_completed'); finalized = f.campaign.exportSnapshot(); throw new ProviderError('configuration_error'); } } }); assert.ok(published.includes('narration_delta')); assert.equal(published.filter(t => t === 'turn_completed').length, 1); assert.equal(published.includes('turn_failed'), false); assert.equal(runs[0]!.status, 'provider_failed'); assert.equal(f.campaign.exportSnapshot(), finalized); });
test('reflection adapter enforces exact Haiku config (no provider pin), unchanged strict schema, stop finish and reasoning exclusion', async () => { const f = fixture(), request = captureProductionReflection(f.campaign, f.world, 'maren').request, bodies: Record<string, unknown>[] = []; const provider = new OpenRouterReflectionProvider(undefined, { api_key: () => 'test-key', fetch: async (_url, init) => { bodies.push(JSON.parse(String(init!.body))); return new Response(JSON.stringify({ provider: 'Azure', model: 'anthropic/claude-haiku-5.5', choices: [{ finish_reason: 'stop', message: { content: '{"proposals":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.0001 } }), { status: 200 }); } }); const result = await provider.reflect(request); assert.equal(result.provider, 'Azure'); assert.equal(bodies[0]!.model, 'anthropic/claude-haiku-5.5'); assert.equal('models' in bodies[0]!, false); assert.deepEqual(bodies[0]!.provider, { require_parameters: true }); assert.equal(bodies[0]!.max_tokens, 600); assert.equal(bodies[0]!.stream, false); assert.deepEqual((bodies[0]!.response_format as { json_schema: { schema: unknown; strict: boolean } }).json_schema.schema, request.wire_schema); assert.deepEqual(bodies[0]!.reasoning, { enabled: false, exclude: true }); assert.equal((bodies[0]!.messages as {
    content: string;
}[])[0]!.content, E1_SYSTEM); });

for (const tamper of ['subject','refs','confidence','future','accessor','cycle']) test('stored typed provenance fails closed: '+tamper, async () => {
 const f=fixture();await reflectAfterTurn(f.campaign,f.world,productionStub(r=>[testEnvironment(r)]),options());
 const snapshot=structuredClone(f.campaign.exportSnapshot()) as CampaignSnapshot,note=snapshot.premium_reflections[0]!.notes[0]!;let executed=false;
 if(tamper==='subject')note.structured!.proposal.subject_character_id='brenna';
 if(tamper==='refs')note.structured!.proposal.evidence_refs=[note.evidence_refs[0]!];
 if(tamper==='confidence')note.structured!.proposal.confidence='low';
 if(tamper==='future')note.structured!.source_revision=snapshot.revision;
 if(tamper==='accessor')Object.defineProperty(note.structured!.proposal.claim,'type',{get(){executed=true;return 'environmental_shared_rule_text';}});
 if(tamper==='cycle')note.structured!.proposal.claim.loop=note.structured!.proposal.claim;
 assert.throws(()=>CampaignState.restore(f.world,snapshot));assert.equal(executed,false);
});
test('a new qualified claim never retroactively versions a historical note with identical rendered text', async()=>{
 const f=fixture();await reflectAfterTurn(f.campaign,f.world,productionStub(r=>[testEnvironment(r)]),options());
 const old=structuredClone(f.campaign.exportSnapshot().premium_reflections[0]!.notes[0]!) as ReflectionNote;delete old.structured;old.id='historical_same_text';
 f.run([{kind:'record_reflection',character_id:'maren',reflected_revision:0,notes:[old]}]);
 await reflectAfterTurn(f.campaign,f.world,productionStub(r=>[testEnvironment(r)]),options());
 const notes=f.campaign.exportSnapshot().premium_reflections[0]!.notes;assert.equal(notes.length,2);assert.deepEqual(notes.find(n=>n.id===old.id),old);assert.equal(notes.filter(n=>n.structured).length,1);
});

test('Haiku reflection through the real adapter: valid output commits through the unchanged schema/validator; 429, 503 and malformed output skip without mutation', async () => {
 for (const mode of ['ok', '429', '503', 'malformed'] as const) {
  const f = fixture(), before = f.campaign.exportSnapshot(); let calls = 0;
  const provider = new OpenRouterReflectionProvider(undefined, { api_key: () => 'test-key', fetch: async (_url, init) => {
   calls++; const body = JSON.parse(String(init!.body));
   assert.equal(body.model, DEFAULT_REFLECTION_MODEL); assert.equal('models' in body, false); assert.equal(body.max_tokens, 600);
   assert.equal(body.model, 'anthropic/claude-haiku-5.5'); assert.deepEqual(body.provider, { require_parameters: true });
   if (mode === '429') return new Response(JSON.stringify({ error: { code: 429, message: 'limited' } }), { status: 429, headers: { 'retry-after': '1' } });
   if (mode === '503') return new Response('{}', { status: 503 });
   const user = JSON.parse(body.messages[1].content), content = mode === 'malformed' ? '{bad' : JSON.stringify({ proposals: [testEnvironment({ character: user.character, evidence: user.evidence } as Parameters<typeof testEnvironment>[0])] });
   return new Response(JSON.stringify({ model: DEFAULT_REFLECTION_MODEL, provider: 'Azure', choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.0001 } }), { status: 200 });
  } });
  const runs = await reflectAfterTurn(f.campaign, f.world, provider, options());
  assert.ok(calls >= 1, mode);
  if (mode === 'ok') { assert.equal(runs[0]!.status, 'committed'); assert.equal(f.campaign.exportSnapshot().premium_reflections[0]!.notes.length, 1); assert.equal(runs[0]!.attempt_details?.[0]?.model, 'anthropic/claude-haiku-5.5'); assert.equal(runs[0]!.attempt_details?.[0]?.provider, 'Azure'); }
  else { assert.notEqual(runs[0]!.status, 'committed', mode); assert.deepEqual(f.campaign.exportSnapshot().premium_reflections, before.premium_reflections, mode); }
 }
});

test('production shadow wiring: a controller model override never reaches reflection (regression: configuration_error)', async () => {
 const saved = { c: process.env.OPENROUTER_CONTROLLER_MODEL, r: process.env.OPENROUTER_REFLECTION_MODEL, k: process.env.OPENROUTER_API_KEY }, original = globalThis.fetch, bodies: Record<string, unknown>[] = [];
 process.env.OPENROUTER_CONTROLLER_MODEL = 'custom/controller'; delete process.env.OPENROUTER_REFLECTION_MODEL; process.env.OPENROUTER_API_KEY = 'test-key-not-real';
 try {
  const deps = await createProductionDeps({ reflection_mode: 'shadow', enable_emergent_mannerisms: false });
  assert.equal(deps.provider_status!.reflection_model, DEFAULT_REFLECTION_MODEL); assert.equal(deps.provider_status!.controller_model, 'custom/controller');
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init!.body))); return new Response(JSON.stringify({ provider: 'Azure', model: DEFAULT_REFLECTION_MODEL, choices: [{ finish_reason: 'stop', message: { content: '{"proposals":[]}' } }], usage: {} }), { status: 200 }); }) as typeof fetch;
  const f = fixture(), result = await deps.reflection_provider!.reflect(captureProductionReflection(f.campaign, f.world, 'maren').request);
  assert.equal(result.text, '{"proposals":[]}'); assert.equal(bodies.length, 1); assert.equal(bodies[0]!.model, 'anthropic/claude-haiku-5.5');
 } finally {
  globalThis.fetch = original;
  for (const [k, v] of [['OPENROUTER_CONTROLLER_MODEL', saved.c], ['OPENROUTER_REFLECTION_MODEL', saved.r], ['OPENROUTER_API_KEY', saved.k]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v;
 }
});
