/** Evaluation only. Build first. --prepare freezes truth/requests; --run attempts 60 cells; --summarize is offline.
 * Only rejected transport calls may be retried, first with --retry-transport, then additionally --tool-transport.
 * Model outputs (including malformed JSON and truncation) are never retried. Raw artifacts are ignored.
 */
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { isDeepStrictEqual as equal } from 'node:util';
import { household } from '../.build/tests/pass10-support.js';
import { mockNarrator, metadata, collect } from '../.build/tests/turn-fixtures.js';
import { TurnCoordinator } from '../.build/src/turn/turn-coordinator.js';
import { RetrievalService } from '../.build/src/retrieval/retrieval-service.js';
import { HybridSearch } from '../.build/src/retrieval/hybrid-search.js';
import { DeepSeekStateControllerProvider, DEFAULT_CONTROLLER_MODEL, CONTROLLER_POLICY } from '../.build/src/llm/openrouter/deepseek-controller.js';
import { OpenRouterClient } from '../.build/src/llm/openrouter/client.js';
import { CONTROLLER_EVIDENCE_SCHEMA, parseControllerEvidenceProposal } from '../.build/src/llm/controller-schema.js';

const dir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'saves/controller-bakeoff-round-1';
assert.ok(dir && execFileSync('git', ['check-ignore', dir + '/prepared.json'], { encoding: 'utf8' }).trim(), 'Output must be git-ignored');
const manifestPath = 'docs/evaluations/controller-bakeoff-round-1-summary.json';
const models = ['deepseek/deepseek-v4-flash-0731', 'deepseek/deepseek-v4.1-flash', 'qwen/qwen3.8-flash', 'z-ai/glm-5.3-flashx', 'google/gemini-3.7-flash'];
const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const move = { kind: 'move_character', character_id: 'maren', location_id: 'test_hall' };
const tell = { kind: 'set_knowledge', knowledge: { character_id: 'brenna', fact_id: 'campaign_fact_bridge_closed', status: 'knows', provenance: { source_character_id: 'nicco', acquisition_kind: 'told' } } };
const affection = { kind: 'adjust_relationship', from_character_id: 'brenna', to_character_id: 'nicco', dimension: 'affection', direction: 'raise' };
const cases = [
  { id: '01_no_command', input: 'I read by the window.', narration: 'Dust drifts in the window light. Brenna remains seated.', expected: [] },
  { id: '02_valid_tell', input: '/tell campaign_fact_bridge_closed to brenna', narration: 'Nicco tells Brenna that the eastern bridge is closed.', expected: [tell], source: 'tests/evidence-authorization.test.ts: explicit telling regression' },
  { id: '03_ambiguous_intent', input: '/tell campaign_fact_bridge_closed to brenna', narration: 'Nicco opens his mouth to tell Brenna that the eastern bridge is closed, then thinks better of it and says nothing.', expected: [], source: 'src/dev/shadow-evidence.ts: A8' },
  { id: '04_player_movement', input: 'I go down to the main hall.', narration: 'Nicco walks down to the main hall. Maren stays in the Observation room.', expected: [], engine_expected: 'player_location=test_hall; controller must not propose Nicco movement' },
  { id: '05_independent_npc', input: 'I read by the window.', narration: 'Maren heads down to the main hall.', expected: [move], source: 'tests/final-movement-closure.test.ts: independent movement' },
  { id: '06_npc_refusal', input: 'Maren, go down to the main hall, please.', narration: 'Maren shakes her head. "No. I am staying here." She stays in the Observation room.', expected: [] },
  { id: '07_relationship', input: 'I wait quietly beside Brenna.', narration: 'Brenna embraces Nicco.', expected: [affection], source: 'production relationship evidence: embracing establishes affection' },
  { id: '08_relationship_insufficient', input: 'I smile at Brenna.', narration: 'Brenna politely nods. She remains seated.', expected: [] },
  { id: '09_secret_boundary', input: 'Brenna, what is Maren hiding?', narration: 'Brenna says, "I do not know Maren\'s secret." Maren says nothing.', expected: [], source: 'turnFixture private fact known only to Maren; no telling' },
  { id: '10_duplicate_action', input: '/tell campaign_fact_bridge_closed to brenna', narration: 'Nicco tells Brenna that the eastern bridge is closed. He repeats to Brenna that the eastern bridge is closed.', expected: [tell] },
  { id: '11_messy_tell', input: '/tell campaign_fact_bridge_closed to brenna', narration: 'Nicco turns to Brenna, who sits alert by the window, and tells her that the eastern bridge is closed.', expected: [tell], source: 'src/dev/shadow-evidence.ts: A11 relative clause' },
  { id: '12_multi_action', input: '/tell campaign_fact_bridge_closed to brenna', narration: 'Nicco tells Brenna that the eastern bridge is closed. Maren heads down to the main hall. Brenna remains seated. Nicco plans a trip to Remote docks tomorrow.', expected: [tell, move], gold_quotes: ['Nicco tells Brenna that the eastern bridge is closed.', 'Maren heads down to the main hall.'] },
];
async function replay(c, result, frozen) {
  const f = household(['maren', 'brenna']);
  const service = new RetrievalService(f.world);
  let request;
  const co = new TurnCoordinator(f.world, mockNarrator(c.narration), { async propose(r) {
    request = { player_action: r.player_action, prior_state: r.prior_state, final_narration: r.final_narration };
    if (frozen) assert.deepEqual(request, frozen, 'production request changed since preparation');
    return result;
  } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: c.input }));
  const done = events.find(e => e.type === 'turn_completed');
  return { request, result: done?.result ?? null, failure: events.find(e => e.type === 'turn_failed') ?? null, snapshot: f.campaign.exportSnapshot() };
}
async function prepare() {
  await mkdir(dir, { recursive: true });
  const catalog = await (await fetch('https://openrouter.ai/api/v1/models')).json();
  const selected = models.map(id => { const m = catalog.data.find(m => m.id === id); assert.ok(m, `Unavailable exact model: ${id}; no substitution`); return m; });
  const prepared = [];
  for (const c of cases) {
    const p = await replay(c, { ...metadata, commands: c.expected, evidence: c.gold_quotes ?? c.expected.map(() => c.narration) });
    assert.ok(p.request, `No controller request: ${c.id}`);
    assert.ok(p.result, `Gold replay failed: ${c.id} ${JSON.stringify(p.failure)}`);
    assert.equal(p.request.final_narration, c.narration);
    for (const e of c.expected) assert.ok(p.result.authorized_commands.some(x => equal(x, e)), `Gold not authorized: ${c.id} ${JSON.stringify(p.result.authorization)}`);
    if (c.id === '04_player_movement') assert.equal(p.snapshot.runtime.scene.player_location, 'test_hall');
    assert.ok(!p.request.prior_state.includes('HIDDEN_SECRET_SENTINEL'), 'Private knowledge leaked into controller input');
    prepared.push({ ...c, expected_count: c.expected.length, correct_abstention: c.expected.length === 0, unacceptable_false_positives: 'Every command outside expected, including duplicate instances', request: p.request, request_sha256: hash(p.request) });
  }
  const setup = { date: new Date().toISOString(), git_head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), production_model: DEFAULT_CONTROLLER_MODEL, policy_sha256: hash(CONTROLLER_POLICY), schema_sha256: hash(CONTROLLER_EVIDENCE_SCHEMA), max_tokens: 512, timeout_ms: 20000, temperature: 'unset, production provider defaults', reasoning: { exclude: true, enabled: false }, strict_schema: true, provider_require_parameters: true, retries: 0, models: selected, cases: prepared };
  await writeFile(`${dir}/prepared.json`, JSON.stringify(setup, null, 2), { flag: 'wx' });
  console.log(`Frozen ${cases.length} ground-truth cases; all gold commands authorized; all IDs verified. No paid calls.`);
}
async function run() {
  assert.ok(process.env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY missing');
  const setup = JSON.parse(await readFile(`${dir}/prepared.json`, 'utf8'));
  assert.equal(hash(CONTROLLER_POLICY), setup.policy_sha256); assert.equal(hash(CONTROLLER_EVIDENCE_SCHEMA), setup.schema_sha256);
  let previous = [];
  try { previous = (await readFile(`${dir}/calls.jsonl`, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  // Sequential requests avoid concurrency distortion; scenario-major rotation reduces systematic cache/order bias.
  for (const [index, c] of setup.cases.entries()) for (let offset = 0; offset < models.length; offset++) {
    const model = models[(index + offset) % models.length];
    const prior = previous.filter(r => r.model === model && r.scenario === c.id).at(-1);
    const retry = process.argv.includes('--retry-transport');
    if (prior && (!retry || !(prior.http_status >= 400 || prior.transport_failure || prior.timeout))) continue;
    const toolTransport = process.argv.includes('--tool-transport');
    if (prior && previous.filter(r=>r.model===model&&r.scenario===c.id).length >= (toolTransport ? 3 : 2)) continue;
    let raw = null, body = null, status = null, response = null, result = null, error = null;
    const captureFetch = async (url, options) => {
      body = JSON.parse(options.body);
      if (retry && ['z-ai/glm-5.3-flashx', 'google/gemini-3.7-flash'].includes(model)) body.reasoning = { exclude: true, effort: 'low' };
      if (retry && (model === 'z-ai/glm-5.3-flashx' || toolTransport && model === 'google/gemini-3.7-flash')) {
        body.tools = [{ type: 'function', function: { name: body.response_format.json_schema.name, description: 'Return the controller proposal using the supplied schema.', parameters: body.response_format.json_schema.schema, strict: true } }];
        body.tool_choice = toolTransport ? 'required' : { type: 'function', function: { name: body.response_format.json_schema.name } };
        delete body.response_format;
      }
      assert.deepEqual(body.messages, [{ role: 'system', content: CONTROLLER_POLICY }, { role: 'user', content: JSON.stringify(c.request) }]);
      assert.equal(body.max_tokens, 512);
      response = await fetch(url, { ...options, body: JSON.stringify(body) }); status = response.status;
      raw = await response.clone().text();
      if (retry && (model === 'z-ai/glm-5.3-flashx' || toolTransport && model === 'google/gemini-3.7-flash') && response.ok) {
        const adapted = JSON.parse(raw), choice = adapted.choices?.[0];
        const calls = choice?.message?.tool_calls;
        if (calls?.length === 1 && calls[0].function?.name === 'campaign_proposal_with_evidence' && choice.finish_reason === 'tool_calls') {
          choice.message.content = calls[0].function.arguments; choice.finish_reason = 'stop';
          return new Response(JSON.stringify(adapted), { status: response.status, headers: response.headers });
        }
      }
      return response;
    };
    const started = performance.now();
    try { result = await new DeepSeekStateControllerProvider(new OpenRouterClient({ fetch: captureFetch }), { model }).propose(c.request); }
    catch (e) { error = e.code ?? e.message; }
    const latency_ms = result?.latency.elapsed_total_ms ?? performance.now() - started;
    let rawParsed = null; try { rawParsed = JSON.parse(raw); } catch { /* retain raw failure */ }
    const content = rawParsed?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? rawParsed?.choices?.[0]?.message?.content ?? '';
    let schema_valid = false; try { parseControllerEvidenceProposal(content); schema_valid = true; } catch { /* strict wire schema differs from accepted normalized/legacy output */ }
    const proposed = result?.commands ?? [];
    const remaining = [...c.expected], false_positives = [], true_positives = [];
    for (const command of proposed) { const i = remaining.findIndex(x => equal(x, command)); if (i < 0) false_positives.push(command); else { true_positives.push(command); remaining.splice(i, 1); } }
    const validation = result ? await replay(c, result, c.request) : null;
    const usage = rawParsed?.usage ?? result?.usage ?? {};
    const rate = setup.models.find(m => m.id === model).pricing;
    const estimated_cost_usd = typeof usage.cost === 'number' ? usage.cost : typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number' ? usage.prompt_tokens * Number(rate.prompt) + usage.completion_tokens * Number(rate.completion) : null;
    const row = { model, scenario: c.id, request_sha256: c.request_sha256, wire_request_sha256: hash(body), wire_request: body, raw_response: raw, parsed_structured_output: rawParsed, schema_valid, production_parse_valid: !!result, normalization: result?.normalization ?? null, proposed, evidence: result?.evidence ?? null, expected: c.expected, true_positives, false_positives, false_negatives: remaining, exact_match: !!result && !false_positives.length && !remaining.length, correct_abstention: c.correct_abstention ? !!result && proposed.length === 0 : null, validation: validation ? { authorization: validation.result?.authorization ?? null, authorized_commands: validation.result?.authorized_commands ?? null, turn_failure: validation.failure } : null, usage, latency_ms, ttft_ms: null, provider: rawParsed?.provider ?? null, estimated_cost_usd, cost_source: typeof usage.cost === 'number' ? 'provider usage.cost' : 'catalog token estimate', http_status: status, error, structured_output_invalid: error === 'structured_output_invalid', transport_failure: status >= 400 || ['network_error', 'provider_unavailable', 'rate_limited'].includes(error), timeout: error === 'timeout', refusal: error === 'model_refusal' || !!rawParsed?.choices?.[0]?.message?.refusal, empty_response: status === 200 && !content, finish_reason: rawParsed?.choices?.[0]?.finish_reason ?? null, retries: previous.filter(r=>r.model===model&&r.scenario===c.id).length, transport_adapted: retry && ['z-ai/glm-5.3-flashx','google/gemini-3.7-flash'].includes(model) };
    await appendFile(`${dir}/calls.jsonl`, JSON.stringify(row) + '\n');
    console.log(`${c.id} ${model}: ${error ?? (row.exact_match ? 'exact' : `FP=${false_positives.length} FN=${remaining.length}`)} ${(latency_ms / 1000).toFixed(2)}s`);
  }
  await summarize();
}
async function summarize() {
  const setup = JSON.parse(await readFile(`${dir}/prepared.json`, 'utf8'));
  const attempts = (await readFile(`${dir}/calls.jsonl`, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const rows = [...new Map(attempts.map(r=>[`${r.model}:${r.scenario}`,r])).values()];
  // Missing destination IDs are a production-context limitation, not a post-hoc change to frozen engine truth.
  const unavailable = setup.cases.flatMap(c=>c.expected.filter(e=>e.kind==='move_character'&&!c.request.prior_state.includes(`"${e.location_id}"`)).map(command=>({scenario:c.id,command})));
  const summaries = models.map(model => {
    const rs = rows.filter(r => r.model === model), lat = rs.filter(r=>r.http_status===200).map(r => r.latency_ms).sort((a,b) => a-b);
    const tp = rs.reduce((s,r) => s + r.true_positives.length, 0), fp = rs.reduce((s,r) => s+r.false_positives.length, 0), fn = rs.reduce((s,r) => s+r.false_negatives.length, 0);
    return { model, calls: rs.length, paid_responses: rs.filter(r=>r.http_status===200).length, strict_schema_valid: rs.filter(r=>r.schema_valid).length, production_parse_valid: rs.filter(r=>r.production_parse_valid).length, correct_abstention: rs.filter(r=>r.correct_abstention === true).length, abstention_cases: setup.cases.filter(c=>c.correct_abstention).length, tp, fp, fn, precision: tp+fp ? tp/(tp+fp) : null, recall: tp+fn ? tp/(tp+fn) : null, exact_matches: rs.filter(r=>r.exact_match).length, mean_ms: lat.length ? lat.reduce((s,x)=>s+x,0)/lat.length : null, median_ms: lat.length ? (lat[Math.floor((lat.length-1)/2)] + lat[Math.floor(lat.length/2)])/2 : null, p95_ms: lat[Math.ceil(lat.length*.95)-1] ?? null, prompt_tokens: rs.reduce((s,r)=>s+(r.usage.prompt_tokens??0),0), completion_tokens: rs.reduce((s,r)=>s+(r.usage.completion_tokens??0),0), cost_usd: attempts.filter(r=>r.model===model).reduce((s,r)=>s+(r.estimated_cost_usd??0),0), missing_cost_calls: rs.filter(r=>r.estimated_cost_usd === null).length, failures: rs.filter(r=>r.error).length, retries: rs.filter(r=>r.retries>0).length, failed_attempts: attempts.filter(r=>r.model===model&&r.error).length, providers: [...new Set(rs.map(r=>r.provider).filter(Boolean))] };
  });
  for (const s of summaries) {
    const rs=rows.filter(r=>r.model===s.model), paid=rs.filter(r=>r.http_status===200);
    s.retries=attempts.filter(r=>r.model===s.model).length-rs.length;
    s.attempts=attempts.filter(r=>r.model===s.model).length;
    s.failure_types=Object.fromEntries([...new Set(attempts.filter(r=>r.model===s.model&&r.error).map(r=>`${r.http_status}:${r.error}`))].map(k=>[k,attempts.filter(r=>r.model===s.model&&`${r.http_status}:${r.error}`===k).length]));
    s.context_feasible_recall=paid.length===12 ? s.tp/(7-unavailable.length) : null;
    if (!paid.length) { s.precision=null; s.recall=null; s.fp=null; s.fn=null; s.correct_abstention=null; s.cost_usd=null; }
  }
  const summary = { setup: { ...setup, models: setup.models.map(({id,canonical_slug,pricing,supported_parameters,reasoning})=>({id,canonical_slug,pricing,supported_parameters,reasoning})), cases: setup.cases.map(({request,...c})=>c) }, calls: rows.length, total_attempts: attempts.length, paid_responses: attempts.filter(r=>r.http_status===200).length, context_unavailable_ground_truth: unavailable, transport_adaptations: { 'z-ai/glm-5.3-flashx': 'Initial native schema rejected; retries with unchanged schema through named, then required function choice; mandatory reasoning low; all rejected', 'google/gemini-3.7-flash': 'Initial reasoning-disabled rejected; retries with reasoning low + native schema, then same schema through required function choice; all rejected' }, summaries, per_scenario: setup.cases.map(c=>({id:c.id, results: models.map(model=> { const r=rows.find(r=>r.model===model&&r.scenario===c.id); return {model, exact_match:r?.http_status===200 ? r.exact_match : null, schema_valid:r?.http_status===200 ? r.schema_valid : null, fp:r?.http_status===200 ? r.false_positives.length : null, fn:r?.http_status===200 ? r.false_negatives.length : null, error:r?.error??null, validation_rejections:r?.validation?.authorization?.filter(a=>!a.authorized).map(a=>a.reason)??[]}; }) })) };
  await writeFile(manifestPath, JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summaries,null,2));
}
if (process.argv.includes('--prepare')) await prepare();
else if (process.argv.includes('--run')) await run();
else if (process.argv.includes('--summarize')) await summarize();
else throw new Error('Use --prepare, --run, or --summarize. Build first with npm run build.');
