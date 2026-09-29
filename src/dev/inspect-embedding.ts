import { VoyageEmbeddingProvider } from "../retrieval/voyage-embedding-provider.js";
try {
  const provider = new VoyageEmbeddingProvider();
  await provider.embedQuery(process.argv.slice(2).join(" ") || "church investigators");
  process.stdout.write(JSON.stringify({ model: provider.model, dimension: provider.dimension, vector: "valid", usage: provider.usage }, null, 2) + "\n");
} catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Embedding failed"}\n`); process.exitCode = 1; }
