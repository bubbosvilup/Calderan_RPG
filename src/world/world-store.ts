import type { EntityType, WorldEntity } from "../types/entities.js";
import type { KnowledgeChunk } from "../types/knowledge.js";
import type { DeepReadonly } from "../types/readonly.js";
import { validateWorldSources, type WorldSource } from "./validation.js";
import { compareIds, datasetIdentity, sourcePath, type CanonicalProvenance } from "./provenance.js";

function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Validated, privately owned, immutable canon. No mutation API or database. */
export class WorldStore {
  #entities = new Map<string, DeepReadonly<WorldEntity>>();
  #chunks = new Map<string, DeepReadonly<KnowledgeChunk>>();
  #provenance = new Map<string, CanonicalProvenance>();
  #entityList: readonly DeepReadonly<WorldEntity>[];
  #chunkList: readonly DeepReadonly<KnowledgeChunk>[];
  readonly #datasetId: string;
  #associations = new Map<string, readonly DeepReadonly<Extract<WorldEntity, {type: "character"}>>[]>();

  constructor(sources: readonly WorldSource[], sourceRoot?: string) {
    const validated = validateWorldSources(sources);
    this.#datasetId = datasetIdentity(validated.map(s => s.document));
    for (const { source, document } of validated) {
      // Clone so even callers retaining their authoring objects cannot change canon.
      const owned = freeze(structuredClone(document));
      this.#entities.set(owned.entity.id, owned.entity);
      this.#provenance.set(owned.entity.id, Object.freeze({ source_kind: "authored_canon", source_path: sourcePath(source, sourceRoot), entity_id: owned.entity.id, schema_version: 1, dataset_id: this.#datasetId }));
      for (const chunk of owned.chunks) this.#chunks.set(chunk.id, chunk);
    }
    this.#entityList = Object.freeze([...this.#entities.values()].sort((a, b) => compareIds(a.id, b.id)));
    this.#chunkList = Object.freeze([...this.#chunks.values()].sort((a, b) => compareIds(a.id, b.id)));
    for (const field of ["base_location", "work_location", "home_location"] as const) {
      const buckets = new Map<string, DeepReadonly<Extract<WorldEntity, {type: "character"}>>[]>();
      for (const character of this.getEntitiesByType("character")) {
        const location = field === "base_location" && character.base_location === undefined ? character.location : character[field];
        if (location == null) continue;
        const list = buckets.get(location) ?? []; list.push(character); buckets.set(location, list);
      }
      for (const [location, values] of buckets) this.#associations.set(`${field}:${location}`, Object.freeze(values));
    }
  }

  get datasetId(): string { return this.#datasetId; }
  listEntities(): readonly DeepReadonly<WorldEntity>[] { return this.#entityList; }
  listChunks(): readonly DeepReadonly<KnowledgeChunk>[] { return this.#chunkList; }
  getProvenance(entityId: string): CanonicalProvenance | undefined { return this.#provenance.get(entityId); }
  getChunkProvenance(chunkId: string): CanonicalProvenance | undefined {
    const chunk = this.#chunks.get(chunkId);
    return chunk ? this.#provenance.get(chunk.entity_id) : undefined;
  }

  getEntity(id: string): DeepReadonly<WorldEntity> | undefined { return this.#entities.get(id); }
  hasEntity(id: string): boolean { return this.#entities.has(id); }
  getChunk(id: string): DeepReadonly<KnowledgeChunk> | undefined { return this.#chunks.get(id); }

  getChildren(parentId: string): readonly DeepReadonly<WorldEntity>[] {
    return Object.freeze(this.#entityList.filter(entity => entity.parent === parentId));
  }

  getEntitiesByType<T extends EntityType>(type: T): readonly DeepReadonly<Extract<WorldEntity, { type: T }>>[] {
    return Object.freeze(this.#entityList.filter(entity => entity.type === type)) as readonly DeepReadonly<Extract<WorldEntity, { type: T }>>[];
  }

  /** Derived ID-ordered association views. Never current-presence or awareness grants. */
  charactersBasedAt(locationId: string) { return this.#associations.get(`base_location:${locationId}`) ?? Object.freeze([]); }
  charactersWorkingAt(locationId: string) { return this.#associations.get(`work_location:${locationId}`) ?? Object.freeze([]); }
  charactersLivingAt(locationId: string) { return this.#associations.get(`home_location:${locationId}`) ?? Object.freeze([]); }

  /** Immediate parent first, root last; the queried entity is not included. */
  getAncestors(entityId: string): readonly DeepReadonly<WorldEntity>[] {
    const entity = this.getEntity(entityId);
    if (!entity) throw new Error(`Unknown entity ${entityId}`);
    const ancestors: DeepReadonly<WorldEntity>[] = [];
    const seen = new Set([entityId]);
    let parent = entity.parent;
    while (parent !== null) {
      if (seen.has(parent)) throw new Error(`Impossible parent cycle while resolving ${entityId}: ${parent}`);
      seen.add(parent);
      const next = this.getEntity(parent);
      if (!next) throw new Error(`Missing parent ${parent} while resolving ${entityId}`);
      ancestors.push(next);
      parent = next.parent;
    }
    return Object.freeze(ancestors);
  }
}
