import type { EmbeddingCallOptions, EmbeddingProvider, EmbeddingVector } from "../../src/retrieval/embedding-provider.js";

/** Mechanical vector fixture only. Does not model or measure semantic understanding. */
export class FixtureEmbeddingProvider implements EmbeddingProvider {
  providerId = "synthetic-fixture";
  modelId = "test-directions-v1";
  dimension = 2;
  readonly purpose = "test" as const;
  readonly batches: (readonly string[])[] = [];
  readonly queries: string[] = [];
  constructor(readonly documentVector: (text: string) => EmbeddingVector = () => [1, 0], readonly queryVector: (text: string) => EmbeddingVector = () => [1, 0]) {}
  async embedDocuments(texts: readonly string[], _options?: EmbeddingCallOptions): Promise<readonly EmbeddingVector[]> {
    this.batches.push([...texts]); return texts.map(t => [...this.documentVector(t)]);
  }
  async embedQuery(text: string, _options?: EmbeddingCallOptions): Promise<EmbeddingVector> {
    this.queries.push(text); return [...this.queryVector(text)];
  }
}
