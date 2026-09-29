import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LexicalSearch } from "../../src/retrieval/lexical-search.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { loadWorld } from "../../src/world/loader.js";
import { evaluationCases } from "./cases.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import { SemanticIndex } from "../../src/retrieval/semantic-index.js";
import { configuredEmbeddingProvider } from "../../src/dev/embedding-configuration.js";
import { EmbeddingError, embeddingIdentity } from "../../src/retrieval/embedding-provider.js";

export function evaluate(search: LexicalSearch) {
  return evaluateIds(search.datasetId, evaluationCases.map(c => {
    const request = { query: c.query, ...(c.filters ? { filters: c.filters } : {}) };
    return search.search(request, "narrator").candidates.map(hit => hit.entity_id);
  }));
}
export function evaluateIds(datasetId: string, results: readonly (readonly string[])[]) {
  const rows = evaluationCases.map((c, i) => {
    const ids = results[i]!;
    const matched = c.relevant.filter(id => ids.includes(id)).length;
    const top1 = c.top1 ? ids[0] === c.top1 : undefined;
    const rank = c.top1 ? ids.indexOf(c.top1) + 1 : 0;
    const status = c.diagnostic ? "diagnostic" : top1 === false || matched < c.relevant.length ? "fail" : c.top1 ? "pass" : "acceptable";
    return { ...c, ids, matched, top1_pass: top1, reciprocal_rank: rank > 0 ? 1 / rank : 0, status };
  });
  const obvious = rows.filter(r => r.top1 !== undefined);
  const relevant = rows.filter(r => r.relevant.length > 0);
  const multi = relevant.filter(r => r.top1 === undefined);
  const ratio = (a: number, b: number) => b ? a / b : 0;
  return { dataset_id: datasetId, cases: rows.length,
    top1: { passed: obvious.filter(r => r.top1_pass).length, total: obvious.length },
    recall_at_5: ratio(relevant.reduce((s, r) => s + r.matched, 0), relevant.reduce((s, r) => s + r.relevant.length, 0)),
    mrr_at_5: ratio(obvious.reduce((s, r) => s + r.reciprocal_rank, 0), obvious.length),
    multi_answer_recall_at_5: ratio(multi.reduce((s, r) => s + r.matched, 0), multi.reduce((s, r) => s + r.relevant.length, 0)), rows };
}

/** Same cases and metrics; fallback is NOT counted as a successful semantic/hybrid run. */
export async function evaluateMode(search: HybridSearch, mode: "semantic" | "hybrid") {
  const results: (readonly string[])[] = [];
  for (const c of evaluationCases) {
    const { result, debug } = await search.searchWithDiagnostics({ query: c.query, ...(c.filters ? { filters: c.filters } : {}) }, "narrator", mode);
    if (debug.semantic_status !== "available") throw new EmbeddingError(debug.fallback_reason ?? "provider_unavailable");
    results.push(result.candidates.map(hit => hit.entity_id));
  }
  return evaluateIds(search.datasetId, results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const retrieval = new RetrievalService(await loadWorld("data")), lexical = new LexicalSearch(retrieval);
    const result = evaluate(lexical);
    if (process.argv.includes("--markdown")) {
      process.stdout.write(`# Phase 1G retrieval evaluation\n\nDataset: \`${result.dataset_id}\`\n\n` +
        `${result.cases} cases. Top-1: ${result.top1.passed}/${result.top1.total}. ` +
        `Micro recall@5: ${(100 * result.recall_at_5).toFixed(1)}%. MRR@5: ${result.mrr_at_5.toFixed(3)}. ` +
        `Multi-answer recall@5: ${(100 * result.multi_answer_recall_at_5).toFixed(1)}%.\n\n` +
        `Top-1/MRR use only single-target cases; recall counts labeled relevant IDs, not every potentially relevant result. Diagnostic cases are excluded from these denominators. This is a development suite, not held-out generalization evidence.\n\n` +
        `| Query | Top five IDs | Expected | Status | Notes |\n| --- | --- | --- | --- | --- |\n` +
        result.rows.map(r => `| ${r.query}${r.filters ? " (West child locations)" : ""} | ${r.ids.join(", ") || "none"} | ${r.top1 ? `top-1: ${r.top1}` : r.relevant.join(", ") || "diagnostic"} | ${r.status} | ${r.diagnostic ?? (r.status === "fail" ? `${r.failure_category ?? "scoring problem"}: ${r.failure_note ?? "Relevant terms match, but competing field weights/coverage rank another record higher."}` : "")} |`).join("\n") + "\n");
    } else {
      const unavailable = (reason: string) => ({ status: "unavailable", reason, quality_evaluation: "pending" });
      if (process.env.VOYAGE_API_KEY && !process.env.CALDREVAN_EMBEDDING_ADAPTER) {
        const { evaluateVoyage } = await import("./voyage-evaluation.js");
        const report = await evaluateVoyage(retrieval, lexical, evaluate, evaluateMode);
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        process.exitCode = report.status === "semantic real provider available" ? 0 : 1;
      } else {
      let semantic: unknown = unavailable("not_configured"), hybrid: unknown = unavailable("not_configured"), provider_identity: unknown = null;
      try {
        const provider = await configuredEmbeddingProvider();
        if (provider) {
          provider_identity = embeddingIdentity(provider);
          const index = await SemanticIndex.build(retrieval.indexSource(), provider, "narrator");
          const search = new HybridSearch(retrieval, [index], lexical);
          for (const mode of ["semantic", "hybrid"] as const) {
            let report: unknown;
            try { report = { status: "measured", metrics: await evaluateMode(search, mode) }; }
            catch { report = unavailable("evaluation_failed"); }
            if (mode === "semantic") semantic = report; else hybrid = report;
          }
        }
      } catch { semantic = unavailable("configuration_or_build_failed"); hybrid = unavailable("configuration_or_build_failed"); }
      process.stdout.write(`${JSON.stringify({ lexical: { status: "measured", metrics: result }, provider_identity, semantic, hybrid }, null, 2)}\n`);
      }
    }
  } catch (error) { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; }
}
