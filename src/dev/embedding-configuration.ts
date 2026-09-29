import { resolve } from "node:path";
import { VoyageEmbeddingProvider } from "../retrieval/voyage-embedding-provider.js";
import { pathToFileURL } from "node:url";
import { embeddingIdentity, EmbeddingError, type EmbeddingProvider } from "../retrieval/embedding-provider.js";

/** Explicit trusted module override, otherwise Voyage when its runtime key is present. */
export async function configuredEmbeddingProvider(): Promise<EmbeddingProvider | undefined> {
  const modulePath = process.env.CALDREVAN_EMBEDDING_ADAPTER;
  if (!modulePath) return process.env.VOYAGE_API_KEY ? new VoyageEmbeddingProvider() : undefined;
  try {
    const adapter: unknown = await import(pathToFileURL(resolve(modulePath)).href);
    if (!adapter || typeof adapter !== "object" || !("createEmbeddingProvider" in adapter) || typeof adapter.createEmbeddingProvider !== "function") throw new Error();
    const provider = await adapter.createEmbeddingProvider() as EmbeddingProvider;
    embeddingIdentity(provider);
    if (provider.purpose !== "production") throw new Error(); // Never publish synthetic quality metrics.
    return provider;
  } catch { throw new EmbeddingError("invalid_configuration"); }
}
