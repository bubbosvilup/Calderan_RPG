import { readFile, writeFile } from 'node:fs/promises';
import { loadWorld } from '../.build/src/world/loader.js';
import { RetrievalService } from '../.build/src/retrieval/retrieval-service.js';
import { LexicalSearch } from '../.build/src/retrieval/lexical-search.js';
import { evaluate } from '../.build/tests/retrieval-eval/evaluate.js';
import { runTurnRetrievalBenchmark } from '../.build/src/dev/turn-retrieval-benchmark.js';

// Offline only: no provider construction. Outputs IDs and metrics, never NPC prose.
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw new Error('Expected before or after');
const prior = JSON.parse(await readFile('docs/evaluations/calderan-west-pass1-after.json', 'utf8'));
const queries = ['Korvin', 'Mistress Elara', 'Bartolomhew', 'The Redemptor', 'Blackthorn', 'Dren', 'Captain Doran Hale', 'Brother Aven', 'Sister Mereth', 'Carrion Dogs', 'Slave Market slavers', 'West guard captain', "Saint Orra's House", 'Open Hand Chapel', 'Back-Back Alleys', "GW's", 'Grey Brook', 'Inquisition', 'Calderan', 'West District'];
const world = await loadWorld('data'), search = new LexicalSearch(new RetrievalService(world));
const rows = qs => qs.map(query => ({query, ...Object.fromEntries(['narrator', 'player'].map(audience => [audience, search.search({query}, audience).candidates.map(c => c.kind === 'chunk' ? c.chunk_id : c.entity_id)]))}));
const report = {dataset_id: world.datasetId, queries: rows(queries), west_pass1: rows(prior.queries.map(r => r.query)), lexical: evaluate(search), turn: await runTurnRetrievalBenchmark(world)};
await writeFile(`docs/evaluations/calderan-west-npc-pass2a-${stage}.json`, JSON.stringify(report, null, 2) + '\n', {flag: stage === 'before' ? 'wx' : 'w'});
console.log(JSON.stringify({stage, lexical: {...report.lexical, rows: undefined}, turn: {...report.turn.policy, rows: undefined}}));
