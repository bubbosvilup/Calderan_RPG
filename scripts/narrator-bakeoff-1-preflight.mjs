// Evaluation only (Narrator Cross-Model Bakeoff 1 preflight): verifies catalog IDs, selects ONE provider per model by a fixed rule
// before any benchmark case, and checks a basic pinned completion with the production narrator request shape. No runtime code.
import { writeFile, mkdir } from 'node:fs/promises';
const MODELS = ['moonshotai/kimi-k2.5', 'z-ai/glm-5.2', 'z-ai/glm-5.3', 'xiaomi/mimo-v2.5-pro', 'xiaomi/mimo-v2.6-pro', 'google/gemini-3.8-flash', 'google/gemma-4-31b-it'];
/** Model maker's own provider tag, when the catalog lists one. */
const FIRST_PARTY = { 'z-ai': ['z-ai/fp8'], xiaomi: ['xiaomi/fp8'], google: ['google-ai-studio'] };
const headers = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' };
const out = process.argv[2];
const catalog = new Set((await (await fetch('https://openrouter.ai/api/v1/models', { headers })).json()).data.map(m => m.id));
const rank = (eps, model) => {
  const ok = eps.filter(e => e.status === 0 && (e.max_completion_tokens ?? 1e9) >= 384);
  const first = ok.filter(e => (FIRST_PARTY[model.split('/')[0]] ?? []).includes(e.tag));
  const byUp = a => [...a].sort((x, y) => (y.uptime_last_30m ?? 0) - (x.uptime_last_30m ?? 0));
  const precise = byUp(ok.filter(e => ['bf16', 'fp8'].includes(e.quantization)));
  const unknown = byUp(ok.filter(e => !['bf16', 'fp8', 'int4', 'fp4', 'mxfp4', 'nvfp4'].includes(e.quantization)));
  return [...first, ...precise, ...unknown].filter((e, i, a) => a.findIndex(x => x.tag === e.tag) === i);
};
async function probe(model, tag, reasoning) {
  const started = performance.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, max_tokens: 384, reasoning,
    provider: { order: [tag], allow_fallbacks: false }, messages: [{ role: 'system', content: 'Narrate briefly in plain prose.' }, { role: 'user', content: 'A tired traveler reaches an inn at dusk. One sentence.' }] }) });
  const body = await r.json().catch(() => ({}));
  return { http: r.status, provider: body.provider ?? null, finish: body.choices?.[0]?.finish_reason ?? null, text_chars: body.choices?.[0]?.message?.content?.length ?? 0,
    usage: body.usage ? { prompt: body.usage.prompt_tokens, completion: body.usage.completion_tokens, reasoning: body.usage.completion_tokens_details?.reasoning_tokens ?? 0 } : null,
    error: body.error ? String(body.error.message ?? body.error.code).slice(0, 200) : null, ms: Math.round(performance.now() - started) };
}
const results = [];
for (const model of MODELS) {
  if (!catalog.has(model)) { results.push({ model, status: 'BLOCKED', reason: 'not in catalog' }); continue; }
  const eps = (await (await fetch(`https://openrouter.ai/api/v1/models/${model}/endpoints`, { headers })).json()).data.endpoints;
  const candidates = rank(eps, model), attempts = [];
  let chosen = null;
  for (const e of candidates.slice(0, 4)) {
    // Production shape first (reasoning disabled); only if the model cannot disable reasoning, the lowest effort.
    let reasoning = { enabled: false }, p = await probe(model, e.tag, reasoning);
    const disableError = p.error;
    // Lowest supported effort first (minimal, then low), only when disabling is rejected.
    for (const effort of ['minimal', 'low']) { if (!(p.error && /reason/i.test(p.error))) break; reasoning = { effort }; p = { ...(await probe(model, e.tag, reasoning)), disable_error: disableError }; }
    attempts.push({ tag: e.tag, provider_name: e.provider_name, quantization: e.quantization, uptime_30m: e.uptime_last_30m, reasoning, ...p });
    if (p.http === 200 && p.finish === 'stop' && p.text_chars > 0) { chosen = { tag: e.tag, provider_name: e.provider_name, quantization: e.quantization, reasoning }; break; }
  }
  results.push({ model, status: chosen ? 'OK' : 'BLOCKED', chosen, attempts, endpoints_available: eps.map(e => e.tag) });
  console.log(JSON.stringify({ model, chosen, attempts: attempts.map(a => ({ tag: a.tag, http: a.http, provider: a.provider, finish: a.finish, reasoning: a.reasoning, usage: a.usage, error: a.error })) }));
}
await mkdir(out, { recursive: true });
await writeFile(`${out}/preflight.json`, JSON.stringify({ created_at: new Date().toISOString(), rule: 'first-party provider if listed; else highest-uptime bf16/fp8; else highest-uptime unknown precision; status 0 and max_completion_tokens >= 384; production request shape (max_tokens 384, reasoning disabled) pinned with allow_fallbacks false; lowest reasoning effort only if disabling is rejected', results }, null, 2));
