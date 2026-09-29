import { writeFile } from "node:fs/promises";
import { loadWorld } from "../world/loader.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { LexicalSearch } from "../retrieval/lexical-search.js";
import { deriveSemanticDocuments } from "../retrieval/semantic-documents.js";
import { evaluate } from "../../tests/retrieval-eval/evaluate.js";
import { runTurnRetrievalBenchmark } from "./turn-retrieval-benchmark.js";
const stage = process.argv[2];
if (!stage || !/^[a-z-]+$/.test(stage)) throw new Error("Supply a stage name");
const world = await loadWorld("data"), service = new RetrievalService(world), search = new LexicalSearch(service);
const report = { stage, dataset_id: world.datasetId, entities: world.listEntities().length, chunks: world.listChunks().length,
 types: Object.fromEntries(["location", "character", "event", "faction", "item", "concept", "world_lore"].map(type => [type, world.listEntities().filter(e => e.type === type).length])),
 ids: world.listEntities().map(e => e.id), provenance: world.listEntities().map(e => world.getProvenance(e.id)),
 lexical: evaluate(search), phase_1h: { semantic: "unavailable: offline, no production provider", hybrid_quality: "unavailable: no production vectors; fallback is not semantic evaluation", documents: deriveSemanticDocuments(service.indexSource(), "narrator").map(d => ({ reference: d.reference, text: d.text })) },
 phase_1r: await runTurnRetrievalBenchmark(world), queries: Object.fromEntries(["Calderan", "West District", "Heartstone", "slave market", "Light magic", "Inquisition", "Ironbound"].map(query => [query, search.searchDebug({ query }, "narrator")])) };
const output = `docs/evaluations/calderan-data-${stage}.json`;
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, dataset_id: world.datasetId, entities: report.entities, lexical: report.lexical.top1, turn_top1: report.phase_1r.policy.top1 }));
