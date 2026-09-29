import type { WorldStore } from "../world/world-store.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { rankForTurn, retrievalQuery } from "../turn/retrieval-policy.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";

/**
 * Phase 1R compact turn-level retrieval benchmark: queries as a player types them, ranked by the production turn policy
 * from the canonical opening scene (heartstone_square → calderan → west → continent). Offline and deterministic.
 * `engine_only` is an ablation: the same engine on the raw input without the turn policy (query cleaning, mentions, locality).
 */
export const TURN_RETRIEVAL_CASES: readonly { readonly query: string; readonly relevant: readonly string[]; readonly group: string }[] = [
  ...["Where is the slave market?", "Where are the slave markets?", "Where is the slave-market?", "When do the slave auctions happen?", "Where is the slave auction?",
    "Where is the slave pen?", "Where are the slave pens?", "What's the exact route to the slave market from here?", "How do I get to the slave market?",
    "*stops an ordinary passer-by* \"Excuse me, where is the slave pen?\""].map(query => ({ query, relevant: ["calderan_slave_market"], group: "slave_market" })),
  { query: "Where is the slave market in Davenport?", relevant: ["davenport"], group: "davenport" },
  { query: "Tell me about Davenport.", relevant: ["davenport"], group: "davenport" },
  { query: "What is the Port of Chains?", relevant: ["davenport"], group: "davenport" },
  { query: "Who owned Heartstone before me?", relevant: ["heartstone"], group: "heartstone" },
  { query: "How long has this tower been empty?", relevant: ["heartstone"], group: "heartstone" },
  { query: "Who lived in Heartstone?", relevant: ["heartstone"], group: "heartstone" },
  { query: "What is Calderan like?", relevant: ["calderan"], group: "calderan" },
  { query: "What are the districts of Calderan?", relevant: ["main_city_structure", "calderan"], group: "calderan" },
  { query: "What do people know about Light magic?", relevant: ["light_and_shadow"], group: "light_magic" },
  { query: "What is Light magic?", relevant: ["light_and_shadow"], group: "light_magic" },
  { query: "Who are the Inquisition?", relevant: ["inquisition"], group: "inquisition" },
  { query: "What does the Inquisition do?", relevant: ["inquisition"], group: "inquisition" },
  { query: "Tell me about Ironbound.", relevant: ["ironbound"], group: "ironbound" },
  { query: "What is the Fortress on the Edge?", relevant: ["ironbound"], group: "ironbound" },
  { query: "Do slave caravans pass through Ironbound?", relevant: ["ironbound"], group: "ironbound" },
];
export interface TurnRetrievalRow { readonly query: string; readonly group: string; readonly ids: readonly string[]; readonly top1: boolean; readonly recall_at_3: number; readonly recall_at_5: number }
const score = (ids: readonly string[], relevant: readonly string[], k: number) => relevant.filter(r => ids.slice(0, k).includes(r)).length / relevant.length;
function summarize(rows: readonly TurnRetrievalRow[]) {
  const mean = (f: (r: TurnRetrievalRow) => number) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  return { cases: rows.length, top1: rows.filter(r => r.top1).length, recall_at_3: mean(r => r.recall_at_3), recall_at_5: mean(r => r.recall_at_5) };
}
export async function runTurnRetrievalBenchmark(world: WorldStore) {
  const context = buildTurnContext(world, createOpeningCampaign(world, "benchmark").exportSnapshot()), service = new RetrievalService(world), search = new HybridSearch(service);
  const policy: TurnRetrievalRow[] = [], engine: TurnRetrievalRow[] = [];
  for (const c of TURN_RETRIEVAL_CASES) {
    const ranked = (await rankForTurn(c.query, context, world, { search, service })).candidates.map(x => x.entity_id);
    const raw = (await search.searchWithDiagnostics({ query: c.query, limit: 5 }, "narrator", "hybrid")).result.candidates.map(x => x.entity_id).filter(id => id !== "nicco");
    for (const [list, ids] of [[policy, ranked], [engine, raw]] as const)
      list.push({ query: c.query, group: c.group, ids: ids.slice(0, 5), top1: c.relevant.includes(ids[0] ?? ""), recall_at_3: score(ids, c.relevant, 3), recall_at_5: score(ids, c.relevant, 5) });
  }
  return { policy: { ...summarize(policy), rows: policy }, engine_only: { ...summarize(engine), rows: engine }, cleaned_example: retrievalQuery(TURN_RETRIEVAL_CASES[9]!.query) };
}
