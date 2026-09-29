import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LexicalSearch } from "../retrieval/lexical-search.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { loadWorld } from "../world/loader.js";
import { HybridSearch, type SearchMode } from "../retrieval/hybrid-search.js";
import { SemanticIndex } from "../retrieval/semantic-index.js";
import { EmbeddingError } from "../retrieval/embedding-provider.js";
import { configuredEmbeddingProvider } from "./embedding-configuration.js";

/** One process, one load/index build, read-only narrator inspection. */
export async function inspectSearch(query: string, debug = false, mode: SearchMode = "lexical") {
  const retrieval = new RetrievalService(await loadWorld(resolve("data")));
  const lexical = new LexicalSearch(retrieval);
  if (mode === "lexical") return debug ? lexical.searchDebug({ query }, "narrator").slice(0, 5) : lexical.search({ query }, "narrator");
  let indexes: SemanticIndex[] = [], build_status = "not_configured";
  try {
    const provider = await configuredEmbeddingProvider();
    if (provider) { indexes = [await SemanticIndex.build(retrieval.indexSource(), provider, "narrator")]; build_status = "available"; }
  } catch (error) {
    if (!(error instanceof EmbeddingError)) throw error;
    build_status = error.code;
  }
  if (mode === "semantic" && !indexes.length) return { status: "unavailable", mode, reason: build_status, quality_evaluation: "pending" };
  const search = new HybridSearch(retrieval, indexes, lexical);
  const output = await search.searchWithDiagnostics({ query }, "narrator", mode);
  return { status: output.debug.semantic_status, build_status, used_mode: output.debug.used_mode,
    ...(output.debug.fallback_reason ? { fallback_reason: output.debug.fallback_reason } : {}),
    ...(debug ? { hits: output.debug.hits.slice(0, 5) } : { result: output.result }) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2); let debug = false, mode: SearchMode = "lexical";
    while (args[0]?.startsWith("--")) {
      const flag = args.shift();
      if (flag === "--debug") debug = true;
      else if (flag === "--mode" && ["lexical", "semantic", "hybrid"].includes(args[0] ?? "")) mode = args.shift() as SearchMode;
      else throw new Error("Unknown search inspection option");
    }
    if (args.length !== 1 || !args[0]) throw new Error('Usage: npm run inspect:search -- [--debug] [--mode lexical|semantic|hybrid] "query"');
    process.stdout.write(`${JSON.stringify(await inspectSearch(args[0], debug, mode), null, 2)}\n`);
  } catch (error) { process.stderr.write(`Search inspection failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
