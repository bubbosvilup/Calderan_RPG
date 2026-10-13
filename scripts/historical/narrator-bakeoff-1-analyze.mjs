// Offline analysis of Narrator Cross-Model Bakeoff 1 artifacts. No model calls. Mechanical metrics only; quality grades are human.
import { readFile, readdir, writeFile } from 'node:fs/promises';
const dir = process.argv[2];
const models = (await readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const KIND = { private_player_fact: 'unauthorized_player_knowledge', household_claim: 'unauthorized_player_knowledge', invented_source: 'invented_rumor_source', unsourced_history: 'invented_history', absent_participant: 'absent_participant',
  asserts_uncommitted_transfer: 'narration_state_correction', contradicts_committed_transfer: 'narration_state_correction', false_premise: 'narration_state_correction', uncommitted_condition: 'narration_state_correction', uncommitted_constraint: 'narration_state_correction', player_agency: 'player_agency' };
const out = {};
for (const m of models) {
  const files = (await readdir(`${dir}/${m}`)).filter(f => f.endsWith('.json')).sort();
  const turns = [], cases = [];
  for (const f of files) {
    const r = JSON.parse(await readFile(`${dir}/${m}/${f}`, 'utf8'));
    cases.push({ file: f, test: r.test, npc: r.npc, outcomes: r.turns.map(t => t.outcome ?? t.skipped), retried: !!r.first_attempt });
    for (const t of r.turns) if (!t.skipped) turns.push({ ...t, test: r.test, npc: r.npc });
  }
  const ok = turns.filter(t => t.outcome === 'success');
  const revised = ok.filter(t => t.revision_requested), redacted = ok.filter(t => t.redaction);
  const counts = {}; for (const t of ok) for (const i of t.issues) { const k = KIND[i.kind] ?? i.kind; counts[k] = (counts[k] ?? 0) + 1; }
  const ctrl = { timeout: 0, structured_invalid: 0, normalized: 0, omission: 0, other_failure: 0 };
  for (const t of turns) {
    if (t.outcome === 'controller_failed') t.provider_code === 'timeout' ? ctrl.timeout++ : t.provider_code === 'structured_output_invalid' ? ctrl.structured_invalid++ : ctrl.other_failure++;
    for (const d of t.controller?.debug ?? []) { if (d.kind === 'controller_normalized') ctrl.normalized++; if (d.kind === 'controller_omission_candidate') ctrl.omission++; }
  }
  const wires = turns.flatMap(t => t.narrator?.wires ?? []);
  const usage = w => w.usage ?? {};
  const t2 = cases.filter(c => c.test === 'T2').map(c => { const r = turns.filter(t => t.test === 'T2' && t.npc === c.npc); const g = r[0]; const boots = g?.state?.items?.find(i => i.id === 'campaign_item_regression_leather_boots');
    return { npc: c.npc, gift_committed: boots?.owner_id === 'nicco', return_run: r.length > 1, return_final_owner: r[1]?.state?.items?.find(i => i.id === 'campaign_item_regression_leather_boots')?.owner_id ?? null }; });
  out[m] = {
    turns: turns.length, successful: ok.length, failed: turns.filter(t => t.outcome !== 'success').map(t => ({ test: t.test, npc: t.npc, outcome: t.outcome, provider_code: t.provider_code })),
    retried_cases: cases.filter(c => c.retried).map(c => c.file),
    intervention_rate: ok.length ? (revised.length) / ok.length : null, revision_rate: ok.length ? revised.length / ok.length : null, redaction_rate: ok.length ? redacted.length / ok.length : null,
    revision_success_rate: revised.length ? revised.filter(t => !t.redaction).length / revised.length : null,
    raw_violation_counts: counts, controller: ctrl, t2,
    upstream_narrator_providers: [...new Set(wires.map(w => w.upstream_provider).filter(Boolean))],
    narrator_finish_reasons: wires.reduce((a, w) => (a[w.finish_reason ?? 'none'] = (a[w.finish_reason ?? 'none'] ?? 0) + 1, a), {}),
    narrator_calls: wires.length, revision_calls: turns.reduce((a, t) => a + (t.narrator?.revision_calls ?? 0), 0),
    tokens: { prompt_mean: mean(wires.map(w => usage(w).prompt_tokens).filter(Number.isFinite)), completion_mean: mean(wires.map(w => usage(w).completion_tokens).filter(Number.isFinite)),
      reasoning_mean: mean(wires.map(w => usage(w).completion_tokens_details?.reasoning_tokens ?? 0)) },
    latency_ms: { ttft_mean: mean(ok.map(t => t.latency.narrator_ttft_ms).filter(Number.isFinite)), ttft_median: median(ok.map(t => t.latency.narrator_ttft_ms).filter(Number.isFinite)),
      narrator_total_mean: mean(ok.map(t => t.latency.narrator_total_ms).filter(Number.isFinite)), narrator_total_median: median(ok.map(t => t.latency.narrator_total_ms).filter(Number.isFinite)),
      turn_mean: mean(ok.map(t => t.latency.turn_ms)) },
    output_chars_mean: mean(ok.map(t => t.draft?.length ?? 0)),
    cases,
  };
}
await writeFile(`${dir}/analysis.json`, JSON.stringify(out, null, 2));
for (const [m, s] of Object.entries(out)) console.log(m, JSON.stringify({ ok: `${s.successful}/${s.turns}`, failed: s.failed.map(f => `${f.test}${f.npc ? ':' + f.npc : ''}=${f.outcome}/${f.provider_code}`), interv: s.intervention_rate?.toFixed(2), redact: s.redaction_rate?.toFixed(2), revOK: s.revision_success_rate?.toFixed(2), viol: s.raw_violation_counts, ctrl: s.controller, gifts: s.t2.filter(g => g.gift_committed).length, finish: s.narrator_finish_reasons, up: s.upstream_narrator_providers, tok: s.tokens, lat: { ttft: Math.round(s.latency_ms.ttft_mean ?? 0), total: Math.round(s.latency_ms.narrator_total_mean ?? 0) }, chars: Math.round(s.output_chars_mean ?? 0) }));
