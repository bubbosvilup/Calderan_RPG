import type { WorldStore } from "../world/world-store.js";
import type { RetrievalIndexSource } from "./types.js";

/** Build once from loaded canon. Full privileged source; never give it to a model. */
export function createIndexSource(world: WorldStore): RetrievalIndexSource {
  const entities = Object.freeze(world.listEntities().map(entity => Object.freeze({
    ...entity, entity_id: entity.id, provenance: world.getProvenance(entity.id)!,
  })));
  // Do not augment chunks with owner prose, names, aliases, features, or tags.
  const chunks = Object.freeze(world.listChunks().map(chunk => Object.freeze({
    ...chunk, chunk_id: chunk.id, provenance: world.getChunkProvenance(chunk.id)!,
  })));
  return Object.freeze({ datasetId: () => world.datasetId, entities: () => entities, chunks: () => chunks });
}
