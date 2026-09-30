// Offline: aggregate mechanics across Repair 1 reruns (private artifacts). No model calls.
import { readFile, readdir } from 'node:fs/promises';
const rot = ['pellan','korvin','mistress_elara','bartolomhew','dren','blackthorn','captain_doran_hale','brother_aven','sister_mereth','bram_kessel','hadrik_voss','mira_thorne','livia_marr','jessa_rook','orla_fen','niles_vanner'];
const dirs = (await readdir('.build')).filter(d => d.startsWith('live-npc-regression-repair-1-')).sort();
const out = [];
for (const d of dirs) {
  const s = { run: d.replace('live-npc-regression-repair-1-', ''), turns: 0, failed: 0, timeouts: 0, gifts_committed: 0, gift_ids: [], return_candidates: 0, returns_committed: 0, returns_refused_kept: 0, duplicates: 0, equipped: 0, delivered: { draft: 0, revision: 0, redacted: 0 }, draft_issues: {}, identity_draft_flags: 0, revisions: 0, narrator_routes: {}, controller_routes: {} };
  for (const id of rot) for (const test of ['identity', 'items']) {
    const r = JSON.parse(await readFile(`.build/${d}/${id}-${test}.json`, 'utf8'));
    r.turns.forEach((t, i) => {
      s.turns++;
      if (t.outcome !== 'success') { s.failed++; if (t.events.at(-1)?.provider_code === 'timeout') s.timeouts++; }
      const rec = t.result?.narration_reconciliation;
      if (rec) { s.delivered[rec.delivered]++; for (const x of rec.issues) s.draft_issues[x.kind] = (s.draft_issues[x.kind] ?? 0) + 1; if (rec.revision !== undefined) s.revisions++; if (test === 'identity' && rec.issues.length) s.identity_draft_flags++; }
      for (const [role, w] of [['narrator_routes', t.narrator_wire], ['controller_routes', t.controller_wire]]) { const p = w?.upstream_provider ?? 'not reported'; s[role][p] = (s[role][p] ?? 0) + 1; }
      const boots = t.after.items.filter(x => /boot/i.test(`${x.id} ${x.name ?? ''}`));
      if (boots.length > 1) s.duplicates++;
      s.equipped += t.after.items.filter(x => x.position.kind === 'equipped').length;
      if (test === 'items' && i === 0 && boots[0]?.owner_id === 'nicco' && boots[0].position.character_id === 'nicco') { s.gifts_committed++; s.gift_ids.push(id); }
      if (test === 'items' && i === 1) {
        if (t.result?.turn_evidence?.player_intents?.some(c => c.kind === 'transfer_item' && c.owner_id === id)) s.return_candidates++;
        const before = t.before.items[0], after = t.after.items[0];
        if (before?.owner_id === 'nicco' && after?.owner_id === id) s.returns_committed++;
        if (before?.owner_id === 'nicco' && after?.owner_id === 'nicco' && t.outcome === 'success') s.returns_refused_kept++;
      }
    });
  }
  out.push(s);
}
console.log(JSON.stringify(out, null, 1));
