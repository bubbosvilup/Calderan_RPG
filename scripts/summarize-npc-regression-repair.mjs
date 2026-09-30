// Offline: one line per recorded turn of a Repair 1 rerun (private artifacts). No model calls.
import { readFile } from 'node:fs/promises';
const P = process.argv[2];
const rot = ['pellan','korvin','mistress_elara','bartolomhew','dren','blackthorn','captain_doran_hale','brother_aven','sister_mereth','bram_kessel','hadrik_voss','mira_thorne','livia_marr','jessa_rook','orla_fen','niles_vanner'];
for (const id of rot) for (const test of ['identity', 'items']) {
  const r = JSON.parse(await readFile(`${P}/${id}-${test}.json`, 'utf8'));
  r.turns.forEach((t, i) => {
    const res = t.result, it = t.after.items.find(x => x.id === 'campaign_item_regression_leather_boots');
    console.log([id, test, i + 1, t.outcome, t.events.at(-1)?.provider_code ?? '',
      'nat=' + JSON.stringify(res?.action_resolution?.actions?.map(a => a.kind + ':' + a.status)),
      'prop=' + JSON.stringify(res?.controller_proposal?.map(c => c.kind + (c.owner_id ? '>' + c.owner_id : ''))),
      'auth=' + JSON.stringify(res?.authorization?.map(a => (a.authorized ? 'OK ' : '') + a.reason + (a.evidence ? '/' + a.evidence.check : ''))),
      'deliv=' + (res?.narration_reconciliation?.delivered ?? '-'),
      'iss=' + JSON.stringify((res?.narration_reconciliation?.issues ?? []).map(x => x.kind)),
      'riss=' + JSON.stringify((res?.narration_reconciliation?.revision_issues ?? []).map(x => x.kind)),
      'owner=' + (it?.owner_id ?? '-') + '/' + (it?.position?.kind ?? '-') + ':' + (it?.position?.character_id ?? '-'),
      'n=' + t.after.items.length, 'eq=' + t.after.items.filter(x => x.position.kind === 'equipped').length, 'port=' + t.portrayal_supplied].join(' '));
  });
}
