// Offline only: replays saved baseline Test 1/2 narrations through the Repair 1 narration audit. No model calls.
import { readFile } from 'node:fs/promises';
import { loadWorld } from '../.build/src/world/loader.js';
import { createOpeningCampaign } from '../.build/src/campaign/opening-state.js';
import { buildTurnContext } from '../.build/src/turn/context-builder.js';
import { projectKnowledgeAccess } from '../.build/src/turn/narrative-authority.js';
import { auditNarration } from '../.build/src/turn/narration-audit.js';
import { deriveTurnEvidence } from '../.build/src/turn/turn-evidence.js';
const dir = process.argv[2] ?? 'docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z', test = process.argv[3] ?? 'identity';
const m = JSON.parse(await readFile(`${dir}/manifest.json`, 'utf8')), world = await loadWorld('data');
const out = {};
for (const id of m.rotation) {
  if (id === 'dren') continue;
  const r = JSON.parse(await readFile(`${dir}/${id}-${test}.json`, 'utf8'));
  const campaign = createOpeningCampaign(world, 'replay');
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: 'runtime_delta', delta: { character_movements: [{ character_id: id, current_location: 'heartstone_square' }] } }] });
  const snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot);
  const narration = r.turns[0].narration;
  const issues = auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, {}), evidence: deriveTurnEvidence({ candidates: [], runtime: [] }, narration, context), diagnostics: [], committed: [], prepared: snapshot });
  out[id] = issues.map(i => `${i.kind}: ${i.sentence.slice(0, 110)}`);
}
console.log(JSON.stringify(out, null, 1));
