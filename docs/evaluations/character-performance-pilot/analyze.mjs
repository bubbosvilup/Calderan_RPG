// Deterministic text analysis of the pilot ledger: stock-gesture frequency, example-echo markers and output length by condition.
import { readFile, writeFile } from 'node:fs/promises';
const dir = 'docs/evaluations/character-performance-pilot';
const ledger = JSON.parse(await readFile(`${dir}/live-ledger.json`, 'utf8'));
const STOCK = {
  shifts_weight: /shifts? (?:his |her )?weight|weight shifting/gi, eyes_narrow: /eyes narrow/gi, mouth_twitch: /mouth twitch/gi,
  folds_arms: /folds? (?:his |her )?arms|arms folded/gi, studying_measuring: /\bstud(?:y|ies|ying)\b|\bmeasur(?:e|es|ing)\b|apprais/gi,
  not_quite_a_smile: /not quite a smile/gi, brows: /brows? (?:lift|rise|raise)/gi,
};
const ECHO = { looks_at_hands: /(?:eyes|gaze|glance)[^.]{0,40}\bhands\b/gi, sleeve_seam: /seam/gi, head_tilt: /tips? (?:her|his) head|tilts? (?:her|his) head/gi,
  glance_then_back: /glanc\w* once[^.]{0,40}(?:back|return)/gi, i_can_answer: /\bI can answer\b/g, oven_behaves: /oven behaves/gi, kitchen_linger: /kitchen[^.]{0,40}(?:linger|stay)/gi };
const count = (text, re) => (text.match(re) ?? []).length;
const groups = {};
for (const a of ledger.attempts.filter(a => a.status === 'completed')) (groups[a.condition] ??= []).push(a);
const out = {};
for (const [condition, list] of Object.entries(groups)) {
  const per = list.length;
  out[condition] = { outputs: per,
    mean_completion_tokens: +(list.reduce((s, a) => s + (a.usage?.completion_tokens ?? 0), 0) / per).toFixed(1),
    mean_prompt_tokens: +(list.reduce((s, a) => s + (a.usage?.prompt_tokens ?? 0), 0) / per).toFixed(1),
    stock_per_output: Object.fromEntries(Object.entries(STOCK).map(([k, re]) => [k, +(list.reduce((s, a) => s + count(a.text, re), 0) / per).toFixed(2)])),
    stock_total_per_output: +(list.reduce((s, a) => s + Object.values(STOCK).reduce((t, re) => t + count(a.text, re), 0), 0) / per).toFixed(2),
    example_echo_hits: Object.fromEntries(Object.entries(ECHO).map(([k, re]) => [k, list.filter(a => count(a.text, re)).map(a => `${a.scene}#${a.sample}`)])),
    nonverbal_only_outputs: list.filter(a => a.text.split(/\n+/).every(p => !p.trim() || p.trim().startsWith('*'))).map(a => `${a.scene}#${a.sample}`),
    cost_usd: +list.reduce((s, a) => s + (a.cost_usd ?? 0), 0).toFixed(6) };
}
await writeFile(`${dir}/text-analysis.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
