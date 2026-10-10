import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { RETRIEVAL_LIMITS, retrieveForTurn } from "../src/turn/retrieval-policy.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { SemanticIndex } from "../src/retrieval/semantic-index.js";
import { EmbeddingError } from "../src/retrieval/embedding-provider.js";
import { runRetrievalBenchmarkH3, RETRIEVAL_BENCHMARK_H3 } from "../src/dev/retrieval-benchmark-h3.js";
import { runTurnRetrievalBenchmark } from "../src/dev/turn-retrieval-benchmark.js";
import { FixtureEmbeddingProvider } from "./retrieval-eval/fixture-embedding-provider.js";

/** Hardening H3: offline retrieval gates on real canon with the production turn policy. No paid provider. */
const world = await loadWorld("data");
const result = await runRetrievalBenchmarkH3(world);
const row = (id: string) => result.rows.find(r => r.id === id)!;

test("benchmark covers every required category", () => {
  const categories = new Set(RETRIEVAL_BENCHMARK_H3.map(c => c.category));
  for (const c of ["exact_entity", "alias", "multiple_exact", "lexical_lore", "multi_answer", "ambiguous", "conversational", "restricted", "npc_known_restricted", "ordinary_action"]) assert.ok(categories.has(c as never), c);
});
test("hard gates: zero secret leakage and zero forbidden results across ALL cases (all restricted canon checked on every query)", () => {
  assert.equal(result.restricted_records_checked, 31); // +1 World Tree (West pass); +6 mythology pass; canon migration: +3 restricted Church/history records, sealed set now 2 holder_only + 1 grant + 4 author_only
  assert.equal(result.secret_leakage_rate, 0);
  assert.equal(result.forbidden_result_rate, 0, JSON.stringify(result.rows.filter(r => r.forbidden_hit.length)));
});
test("trigger policy: ordinary actions and conversation never retrieve; every lore/world question does", () => {
  assert.equal(result.unnecessary_retrieval_rate, 0, JSON.stringify(result.rows.filter(r => RETRIEVAL_BENCHMARK_H3.find(c => c.id === r.id)!.expected_mode === "none" && r.mode !== "none")));
  assert.equal(result.missed_retrieval_rate, 0);
});
test("exact-mention priority does not regress: exact NPC, location, organization, alias and lore are top-1; multiple exact mentions both returned", () => {
  for (const id of ["exact_inquisition", "exact_ironbound", "exact_npc_korvin", "exact_location_gilded_row", "exact_org_carrion_dogs", "alias_port_of_chains", "alias_fortress_edge", "lore_light_magic", "lore_slave_market"]) {
    const c = RETRIEVAL_BENCHMARK_H3.find(x => x.id === id)!;
    assert.equal(row(id).returned[0], c.relevant[0], id);
  }
  assert.deepEqual([...row("multi_exact_two").returned.slice(0, 3)].filter(x => ["inquisition", "ironbound"].includes(x)).sort(), ["inquisition", "ironbound"]);
  assert.equal(result.top1, "9/9"); assert.equal(result.mrr_at_5, 1);
});
test("pre-H3 turn benchmark unchanged (25/25 top-1, Recall@3 1.0; engine-only ablation 18/25)", async () => {
  const r = await runTurnRetrievalBenchmark(world);
  assert.deepEqual([r.policy.top1, r.policy.recall_at_3, r.engine_only.top1], [25, 1, 18]);
});
test("restricted queries: the secret is never returned, even when the player names it exactly", () => {
  assert.deepEqual(row("secret_dren").returned.filter(x => x.startsWith("dren")), []);
  assert.ok(!row("secret_ritual").returned.includes("mutilating_ritual"));
  assert.ok(!row("secret_sun_emperor").returned.includes("sun_emperor.light_secret"));
  assert.ok(!row("npc_known_korvin_past").returned.includes("korvin.private_background"), "Korvin's own knowledge is NPC-private access, never retrieval");
});
test("multi-answer recall is measured, not inflated: the turn pool's Recall@5 equals Recall@3, so a larger result limit would not help", () => {
  assert.equal(result.multi_recall_at_5, result.multi_recall_at_3);
  assert.deepEqual(RETRIEVAL_LIMITS, { query_characters: 500, candidate_pool: 5, mention_lookup_pool: 5, ranked_results: 3, exact_fetch: 1, payload_characters: 10_000 });
});
test("semantic provider failure at query time falls back to lexical; the turn still retrieves the exact entity", async () => {
  const service = new RetrievalService(world);
  const provider = new FixtureEmbeddingProvider();
  const index = await SemanticIndex.build(service.indexSource(), provider, "narrator");
  provider.embedQuery = async () => { throw new EmbeddingError("provider_unavailable"); };
  const context = buildTurnContext(world, createOpeningCampaign(world, "h3_semantic_failure").exportSnapshot());
  const r = await retrieveForTurn("Who are the Inquisition?", context, world, { service, search: new HybridSearch(service, [index]) });
  assert.equal(r.diagnostics.mode, "lexical");
  assert.equal((r.data as { candidates: { entity_id: string }[] }).candidates[0]!.entity_id, "inquisition");
});
test("lexical retrieval works with no semantic provider at all", async () => {
  const service = new RetrievalService(world);
  const context = buildTurnContext(world, createOpeningCampaign(world, "h3_lexical_only").exportSnapshot());
  const r = await retrieveForTurn("Tell me about Ironbound.", context, world, { service, search: new HybridSearch(service) });
  assert.deepEqual([r.diagnostics.mode, (r.data as { candidates: { entity_id: string }[] }).candidates[0]!.entity_id], ["lexical", "ironbound"]);
});
