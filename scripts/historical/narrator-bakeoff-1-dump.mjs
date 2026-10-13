// Offline reader for Narrator Bakeoff 1 artifacts: prints each turn's draft, audit issues and (if different) delivered text.
import { readFile, readdir } from 'node:fs/promises';
const [dir, model, filter] = process.argv.slice(2);
for (const f of (await readdir(`${dir}/${model}`)).sort()) {
  if (filter && !new RegExp(filter).test(f)) continue;
  const r = JSON.parse(await readFile(`${dir}/${model}/${f}`, 'utf8'));
  r.turns.forEach((t, i) => {
    if (t.skipped) { console.log(`=== ${f} T${i + 1}: SKIPPED (${t.skipped})\n`); return; }
    const ctrl = (t.controller?.authorization ?? []).map(a => `${a.kind}:${a.authorized ? 'OK' : a.reason}`).join(',');
    console.log(`=== ${f} T${i + 1} [${t.outcome}${t.provider_code ? '/' + t.provider_code : ''}] deliv=${t.delivered_source} issues=${t.issues.map(x => x.kind).join(',') || '-'} ctrl=${ctrl || '-'} len=${t.draft?.length ?? 0}`);
    console.log(`DRAFT: ${(t.draft ?? '').replace(/\n+/g, ' / ')}`);
    if (t.delivered_source && t.delivered_source !== 'draft') console.log(`DELIVERED: ${t.delivered.replace(/\n+/g, ' / ')}`);
    console.log();
  });
}
