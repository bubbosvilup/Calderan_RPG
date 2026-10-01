import type { WorldStore } from "../world/world-store.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { rankForTurn, retrieveForTurn } from "../turn/retrieval-policy.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";

/**
 * Hardening H3: offline turn-retrieval benchmark (production turn policy, real canon, no provider). Each case states the expected
 * retrieval mode, the relevant ids (rank expectation: the first relevant id should be top-1 when `top1` is set), acceptable
 * alternatives, and forbidden ids. EVERY case also forbids all restricted (player-invisible) canon, so secret leakage is measured on
 * every query, not only on the secret-themed ones. Audience: player-safe narrator retrieval (the only retrieval the turn performs).
 */
export type BenchmarkCategory = "exact_entity" | "alias" | "multiple_exact" | "lexical_lore" | "multi_answer" | "ambiguous" | "conversational" | "restricted" | "npc_known_restricted" | "ordinary_action";
export interface RetrievalBenchmarkCase {
  readonly id: string; readonly category: BenchmarkCategory; readonly query: string; readonly location?: string;
  readonly expected_mode: "none" | "retrieve"; readonly relevant: readonly string[]; readonly top1?: boolean;
  readonly acceptable?: readonly string[]; readonly forbidden?: readonly string[];
}
export const RETRIEVAL_BENCHMARK_H3: readonly RetrievalBenchmarkCase[] = [
  { id: "exact_inquisition", category: "exact_entity", query: "Who are the Inquisition?", expected_mode: "retrieve", relevant: ["inquisition"], top1: true },
  { id: "exact_ironbound", category: "exact_entity", query: "Tell me about Ironbound.", expected_mode: "retrieve", relevant: ["ironbound"], top1: true },
  { id: "exact_npc_korvin", category: "exact_entity", query: "Who is Korvin?", expected_mode: "retrieve", relevant: ["korvin"], top1: true, forbidden: ["korvin.private_background"] },
  { id: "exact_location_gilded_row", category: "exact_entity", query: "Where is the Gilded Row?", expected_mode: "retrieve", relevant: ["gilded_row"], top1: true },
  { id: "exact_org_carrion_dogs", category: "exact_entity", query: "Who are the Carrion Dogs?", expected_mode: "retrieve", relevant: ["carrion_dogs"], top1: true, forbidden: ["carrion_dogs.private_organization"] },
  { id: "alias_port_of_chains", category: "alias", query: "What is the Port of Chains?", expected_mode: "retrieve", relevant: ["davenport"], top1: true },
  { id: "alias_fortress_edge", category: "alias", query: "What is the Fortress on the Edge?", expected_mode: "retrieve", relevant: ["ironbound"], top1: true },
  { id: "multi_exact_two", category: "multiple_exact", query: "Tell me about the Inquisition and Ironbound.", expected_mode: "retrieve", relevant: ["inquisition", "ironbound"] },
  { id: "lore_light_magic", category: "lexical_lore", query: "What is Light magic?", expected_mode: "retrieve", relevant: ["light_and_shadow"], top1: true },
  { id: "lore_slave_market", category: "lexical_lore", query: "Where is the slave market?", expected_mode: "retrieve", relevant: ["calderan_slave_market"], top1: true },
  { id: "multi_districts", category: "multi_answer", query: "What are the districts of Calderan?", expected_mode: "retrieve", relevant: ["main_city_structure", "calderan"] },
  { id: "multi_pirates", category: "multi_answer", query: "Tell me about the pirate cities.", expected_mode: "retrieve", relevant: ["blackwater", "sandspear"] },
  { id: "multi_slave_trade_west", category: "multi_answer", query: "Tell me about the slave trade in the West.", expected_mode: "retrieve", relevant: ["west_slavery", "calderan_slave_market"] },
  { id: "ambiguous_market", category: "ambiguous", query: "Tell me about the market.", expected_mode: "retrieve", relevant: [] },
  { id: "conv_greeting", category: "conversational", query: "Hello, how are you today?", expected_mode: "none", relevant: [] },
  { id: "conv_listener_name", category: "conversational", query: "What is your name?", expected_mode: "none", relevant: [] },
  { id: "conv_thanks", category: "conversational", query: "Thanks, that is kind of you.", expected_mode: "none", relevant: [] },
  { id: "secret_dren", category: "restricted", query: "Tell me about Dren.", expected_mode: "retrieve", relevant: [], forbidden: ["dren", "dren.private_baseline"] },
  { id: "secret_ritual", category: "restricted", query: "What is the Mutilating Ritual?", expected_mode: "retrieve", relevant: [], forbidden: ["mutilating_ritual"] },
  { id: "secret_sun_emperor", category: "restricted", query: "What is the Sun Emperor's light secret?", expected_mode: "retrieve", relevant: [], forbidden: ["sun_emperor.light_secret"] },
  { id: "npc_known_korvin_past", category: "npc_known_restricted", location: "calderan_slave_market", query: "What is Korvin hiding about his past?", expected_mode: "retrieve", relevant: [], acceptable: ["korvin"], forbidden: ["korvin.private_background"] },
  { id: "action_walk", category: "ordinary_action", query: "*walks across the square*", expected_mode: "none", relevant: [] },
  { id: "action_wait", category: "ordinary_action", query: "/wait 10", expected_mode: "none", relevant: [] },
  { id: "action_handover", category: "ordinary_action", query: "I give the boots to Brenna.", expected_mode: "none", relevant: [] },
  { id: "action_rest", category: "ordinary_action", query: "*sits on the bench and rests*", expected_mode: "none", relevant: [] },
  { id: "action_household", category: "ordinary_action", location: "heartstone_lr", query: "Please sweep the hall before supper.", expected_mode: "none", relevant: [] },
];

export interface BenchmarkRow { readonly id: string; readonly category: BenchmarkCategory; readonly mode: string; readonly returned: readonly string[]; readonly pool: readonly string[];
  readonly forbidden_hit: readonly string[]; readonly secret_leak: boolean }
export async function runRetrievalBenchmarkH3(world: WorldStore) {
  const service = new RetrievalService(world), search = new HybridSearch(service), retrieval = { service, search };
  const restricted = [...world.listEntities().filter(e => e.knowledge && !e.knowledge.visibility.player).map(e => e.id), ...world.listChunks().filter(c => c.knowledge && !c.knowledge.visibility.player).map(c => c.id)];
  const restrictedText = [...world.listEntities().filter(e => e.knowledge && !e.knowledge.visibility.player).map(e => e.content), ...world.listChunks().filter(c => c.knowledge && !c.knowledge.visibility.player).map(c => c.content)]
    .map(t => t.slice(0, 60)).filter(t => t.length >= 30);
  const rows: BenchmarkRow[] = [];
  for (const c of RETRIEVAL_BENCHMARK_H3) {
    const campaign = createOpeningCampaign(world, `bench_${c.id}`);
    if (c.location) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: c.location } }] });
    const context = buildTurnContext(world, campaign.exportSnapshot(), { input: c.query });
    const r = await retrieveForTurn(c.query, context, world, retrieval);
    const data = r.data as { candidates?: readonly { entity_id: string; chunk_id?: string; kind: string }[] };
    const returned = (data.candidates ?? []).map(x => x.kind === "chunk" && x.chunk_id ? x.chunk_id : x.entity_id);
    const pool = r.diagnostics.mode === "none" ? [] : (await rankForTurn(c.query, context, world, retrieval)).candidates.map(x => x.chunk_id ?? x.entity_id);
    const serialized = JSON.stringify(r.data);
    const forbidden = [...new Set([...(c.forbidden ?? []), ...restricted])];
    rows.push({ id: c.id, category: c.category, mode: r.diagnostics.mode, returned, pool: pool.slice(0, 5),
      forbidden_hit: forbidden.filter(id => returned.includes(id) || pool.includes(id)), secret_leak: restrictedText.some(t => serialized.includes(t)) });
  }
  const at = (ids: readonly string[], rel: readonly string[], k: number) => rel.filter(id => ids.slice(0, k).includes(id)).length;
  const caseOf = (row: BenchmarkRow) => RETRIEVAL_BENCHMARK_H3.find(c => c.id === row.id)!;
  const withRelevant = rows.filter(r => caseOf(r).relevant.length), single = rows.filter(r => caseOf(r).top1), multi = rows.filter(r => caseOf(r).relevant.length > 1);
  const ratio = (n: number, d: number) => d ? Math.round(n / d * 10_000) / 10_000 : 0;
  const sumRel = (list: readonly BenchmarkRow[]) => list.reduce((s, r) => s + caseOf(r).relevant.length, 0);
  const none = rows.filter(r => caseOf(r).expected_mode === "none"), retrieve = rows.filter(r => caseOf(r).expected_mode === "retrieve");
  return {
    cases: rows.length,
    top1: `${single.filter(r => [...caseOf(r).relevant, ...(caseOf(r).acceptable ?? [])].includes(r.returned[0] ?? "")).length}/${single.length}`,
    recall_at_3: ratio(withRelevant.reduce((s, r) => s + at(r.returned, caseOf(r).relevant, 3), 0), sumRel(withRelevant)),
    recall_at_5: ratio(withRelevant.reduce((s, r) => s + at(r.pool, caseOf(r).relevant, 5), 0), sumRel(withRelevant)),
    mrr_at_5: ratio(single.reduce((s, r) => { const i = r.pool.indexOf(caseOf(r).relevant[0]!); return s + (i >= 0 && i < 5 ? 1 / (i + 1) : 0); }, 0), single.length),
    multi_recall_at_3: ratio(multi.reduce((s, r) => s + at(r.returned, caseOf(r).relevant, 3), 0), sumRel(multi)),
    multi_recall_at_5: ratio(multi.reduce((s, r) => s + at(r.pool, caseOf(r).relevant, 5), 0), sumRel(multi)),
    forbidden_result_rate: ratio(rows.filter(r => r.forbidden_hit.length).length, rows.length),
    secret_leakage_rate: ratio(rows.filter(r => r.secret_leak).length, rows.length),
    unnecessary_retrieval_rate: ratio(none.filter(r => r.mode !== "none").length, none.length),
    missed_retrieval_rate: ratio(retrieve.filter(r => r.mode === "none").length, retrieve.length),
    avg_returned_records: ratio(retrieve.reduce((s, r) => s + r.returned.length, 0), retrieve.length),
    restricted_records_checked: restricted.length,
    rows,
  };
}
