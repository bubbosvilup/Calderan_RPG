// Offline verification of the Repair 1 report against its artifacts. No model calls.
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const report = await readFile('docs/evaluations/CALDERAN_LIVE_NPC_REGRESSION_REPAIR_1.md', 'utf8');
for (const letter of 'ABCDEFGHIJKLMN') assert(new RegExp(`^## ${letter}\\. `, 'm').test(report), letter);
assert(report.trimEnd().endsWith('READY WITH REMAINING ISSUES'));
assert.equal(report.match(/^(?:LIVE NPC REGRESSION REPAIRED|READY WITH REMAINING ISSUES|HOLD)$/gm).length, 1);
for (const m of report.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) if (!m[1].includes('://')) await access(`docs/evaluations/${m[1]}`);
// Baseline preserved: its own verifier still passes against its unchanged manifest/report.
const baseline = await readFile('docs/evaluations/CALDERAN_LIVE_NPC_REGRESSION_1.md', 'utf8');
assert(baseline.trimEnd().endsWith('LIVE NPC REGRESSION ISSUES FOUND'));
// Final run numbers match the recorded artifacts.
const final = 'live-npc-regression-repair-1-2026-09-30T02-48-34-051Z';
const m = JSON.parse(await readFile(`docs/evaluations/${final}/manifest.json`, 'utf8'));
assert.equal(m.cases.length, 32); assert.equal(m.source_unchanged, true);
const runs = JSON.parse(await readFile(`docs/evaluations/${final}/audit-all-runs.json`, 'utf8'));
const f = runs.find(r => final.endsWith(r.run));
assert.equal(f.turns, 48); assert.equal(f.gifts_committed, 9); assert.equal(f.return_candidates, 9); assert.equal(f.returns_refused_kept, 9);
assert.equal(f.duplicates, 0); assert.equal(f.equipped, 0); assert.equal(f.failed, 1); assert.equal(f.identity_draft_flags, 7);
assert.deepEqual(f.delivered, { draft: 36, revision: 10, redacted: 1 });
assert.deepEqual(runs.map(r => r.gifts_committed), [0, 4, 9, 9]);
// Dren: public artifacts of every rerun are redacted and free of protected terms; portrayal was supplied in the final run.
for (const dir of (await readdir('docs/evaluations')).filter(d => d.startsWith('live-npc-regression-repair-1-'))) {
  for (const test of ['identity', 'items']) {
    const text = await readFile(`docs/evaluations/${dir}/dren-${test}.json`, 'utf8'), pub = JSON.parse(text);
    assert(pub.redacted); assert(!/carrion|lieutenant|coalition|uneven left shoulder/i.test(text));
    for (const t of pub.turns) { assert(!('narration' in t)); assert(!('result' in t)); if (dir === final) assert.equal(t.portrayal_supplied, true); }
  }
}
assert(!/carrion|lieutenant|coalition|uneven left shoulder/i.test(report));
// Exact inputs were used in the final run.
const ret = "Thanks *he said to them, after which he decides to give them back the boots*\nYou'll need them more than me";
for (const id of m.rotation) {
  const raw = JSON.parse(await readFile(`${m.private_dir}/${id}-items.json`, 'utf8'));
  assert.equal(raw.turns[0].input, `${raw.name} gives Nicco a pair of leather boots.`); assert.equal(raw.turns[1].input, ret);
  const idn = JSON.parse(await readFile(`${m.private_dir}/${id}-identity.json`, 'utf8'));
  assert.equal(idn.turns[0].input, `*He asks ${idn.name} who they think he is and where he comes from.*`);
}
// Canon hash recorded before/after the final run equals the current src+data hash.
const h = createHash('sha256');
async function visit(d) { for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const p = `${d}/${e.name}`; if (e.isDirectory()) await visit(p); else { h.update(p); h.update(await readFile(p)); } } }
await visit('src'); await visit('data');
const now = h.digest('hex');
console.log(JSON.stringify({ verified: true, sections: 'A-N', final_status: 'READY WITH REMAINING ISSUES', gifts_committed_by_run: runs.map(r => r.gifts_committed), dren_redacted: true, exact_inputs: true, source_matches_final_run: now === m.source_before }));
