/** Offline analysis only: no providers, campaign mutations or paid calls. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { estimateContextTokens } from '../../.build/src/turn/context-budget.js';
const root = 'saves/d09-soak';
const read = name => JSON.parse(readFileSync(`${root}/${name}.json`, 'utf8'));
const turns = readdirSync(root).filter(n => /^turn-\d+\.json$/.test(n)).sort().map(n => JSON.parse(readFileSync(`${root}/${n}`, 'utf8')));
const ledger = read('ledger');
const groups = {};
for (const call of ledger) {
  const g = groups[call.family] ??= { calls: 0, reported_usd: 0, prompt_tokens: 0, completion_tokens: 0, unknown_cost_calls: 0 };
  g.calls++; g.reported_usd += call.metadata?.cost_usd ?? 0;
  g.prompt_tokens += call.metadata?.usage.prompt_tokens ?? 0;
  g.completion_tokens += call.metadata?.usage.completion_tokens ?? 0;
  if (call.metadata?.cost_usd === undefined) g.unknown_cost_calls++;
}
const context = turns.map(r => {
  const s = r.requests[0].messages.map(m => m.content).join('\n');
  const block = s.match(/\[NPC\+ HOUSEHOLD CHARACTERS\][\s\S]*?(?=\n\[CURRENT EQUIPMENT\])/u)?.[0] ?? '';
  const cues = [...block.matchAll(/\nMannerisms:\n((?:- [^\n]+\n?)+)/g)].map(m => m[0]).join('');
  const rule = block.split('\n').find(l => l.startsWith('Mannerisms are small optional')) ?? '';
  return { turn: r.turn, reflection_estimated_tokens: 0, mannerism_cues_estimated_tokens: estimateContextTokens(cues), mannerism_with_rule_estimated_tokens: estimateContextTokens(cues + rule), npc_plus_estimated_tokens: estimateContextTokens(block), npc_plus_payload_characters: r.diagnostics.context.npc_plus.chars_after, budget_estimated_tokens: r.diagnostics.context_budget.estimated_tokens, budget_usage_percent: r.diagnostics.context_budget.usage_percent, actual_narrator_prompt_tokens: r.outcome.trace.usage.narrator.prompt_tokens };
});
const summary = { finalized: turns.filter(r => r.outcome.ok).length, groups, reported_usd: ledger.reduce((n,c) => n + (c.metadata?.cost_usd ?? 0),0), context,
  reflections_generated: 0, reflections_retrieved: 0, reflection_due_checks: turns.length, reflection_statuses: turns.map(r=>r.outcome.trace.reflection.status),
  seed_slots: turns[0].before.premium_characters.map(p=>({character_id:p.character_id,seeded:p.mannerisms.length,final_slots:turns.at(-1).after.premium_characters.find(q=>q.character_id===p.character_id).mannerisms.length})),
  proposed_observations: turns.flatMap(r=>r.maintenance.filter(m=>m.result).flatMap(m=>JSON.parse(m.result.text).observations)).length,
  accepted_observations: 0, candidates: 0, promoted: 0, finalized_commit_failures: 0, audits: turns.map(r=>r.outcome.trace.audit_issue_kinds), retrieval_modes: turns.map(r=>r.outcome.trace.retrieval_mode),
  private_sentinel_in_narrator_prompt: turns.some(r=>JSON.stringify(r.requests).includes('HIDDEN_SECRET_SENTINEL')), human_review: 'pending', ablation_pairs: { reflection:0, mannerism:0 },
};
writeFileSync(`${root}/analysis.json`,JSON.stringify(summary,null,2));
const history = read('historical-window');
const anon = s => s.replace(/\bBrenna\b/gi,'Persona A').replace(/\bMaren\b/gi,'Persona B').replace(/\bGerome\b/gi,'Persona C');
const samples = turns.map(r => ({ id:`current-${r.turn}`, condition:'current engine, seeded cues present; no reflection', source:`turn-${String(r.turn).padStart(3,'0')}.json`, context: turns.filter(t=>t.turn<r.turn).slice(-2).map(t=>`Player: ${t.input}\nNarration: ${t.outcome.narration}`).join('\n\n') || 'Opening scene: Persona A is a tall woman recovering from illness; Persona B is a young woman staying in the tower; Persona C is a silent stone construct. No personality or relationship contract is established.', input:r.input, text:r.outcome.narration }));
for (const pair of [277,293,305,325,326,330,331,332,347,382]) {
  const i=pair-261, p=history[i], prev=history[i-1];
  samples.push({id:`historical-${pair}`,condition:'historical user playthrough; current-engine reflection/mannerism state unavailable',source:`historical-window.json pair ${pair}`,context:`Player: ${prev.player_message}\nNarration: ${prev.assistant_response}`,input:p.player_message,text:p.assistant_response});
}
const sha = s=>createHash('sha256').update(s).digest('hex');
samples.sort((a,b)=>sha(`d09-blind-v1:${a.id}`).localeCompare(sha(`d09-blind-v1:${b.id}`)));
const key=samples.map((s,i)=>({sample:`S${String(i+1).padStart(2,'0')}`,source:s.source,condition:s.condition,hash:sha(s.text)}));
writeFileSync(`${root}/review-key.json`,JSON.stringify(key,null,2));
const intro = `# D-09: lettura cieca\n\n14 campioni, identita anonimizzate in modo coerente. Non e un test A/B: nessuna ablation e stata eseguita. Giudica prima di aprire la chiave nel documento D09_HUMAN_REVIEW.md. Il contesto immediato e riportato, ma non prova da solo che una storia personale narrata sia canonica. Le informazioni non presenti nel contesto vanno segnate come non verificabili.\n\nPer ogni S01-S14 indica: NATURAL / NOTICEABLE BUT ACCEPTABLE / OVERUSED / FORCED / CONTRADICTORY; una breve ragione; se il gesto cambia indebitamente personalita, motivazione, consenso o storia. Per Persona A/B/C valuta DISTINCT / PARTIALLY DISTINCT / GENERIC, citando un passaggio. Se non hai elementi, scrivi INSUFFICIENT. I campioni non sono indipendenti: non trattare le frequenze come un test statistico.\n\n## Giudizi umani\n\nDa compilare: S01-S14; differenziazione A/B/C; eventuali contraddizioni e ripetizioni. Nessun giudizio umano e stato ancora acquisito.\n`;
const passages=samples.map((s,i)=>`\n## S${String(i+1).padStart(2,'0')}\n\n### Contesto precedente\n\n${anon(s.context)}\n\n### Input\n\n${anon(s.input)}\n\n### Risposta da giudicare\n\n${anon(s.text)}\n`).join('');
writeFileSync('docs/evaluations/d09_review_packet.md',intro+passages);
writeFileSync('docs/evaluations/D09_HUMAN_REVIEW.md',intro+passages+`\n## Chiave: aprire soltanto dopo aver espresso i giudizi\n\n<details>\n<summary>Condizioni e fonti</summary>\n\n${key.map(k=>`- ${k.sample}: ${k.condition}; ${k.source}`).join('\n')}\n\n</details>\n\nPersona A = Brenna; Persona B = Maren; Persona C = Gerome. La chiave macchina con hash e conservata solo sotto saves/d09-soak/.\n`);
console.log(JSON.stringify(summary));
