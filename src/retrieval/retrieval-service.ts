import { matchesEntityFilter } from "./filters.js";
import type { WorldStore } from "../world/world-store.js";
import { compareIds } from "../world/provenance.js";
import { createIndexSource } from "./index-source.js";
import { isVisible } from "./policy.js";
import { bounded, chunkCandidate, chunkFetch, entityCandidate, entityFetch, RetrievalProjectionError } from "./projections.js";
import { audience, dataArray, exactId, normalizeName, queryText, RETRIEVAL_LIMITS, RetrievalValidationError, validateFilter, validatePage, validateWorldGetRequest } from "./validation.js";
import type { CandidateReference, ResolutionResult, RetrievalAudience, RetrievalCandidate, RetrievalIndexSource, RetrievalPage, WorldGetResult, WorldSearchResult } from "./types.js";

/** Loaded-canon-only reads. No RuntimeState, filesystem, provider, or search engine. */
export class RetrievalService {
  readonly #world: WorldStore;
  readonly #source: RetrievalIndexSource;
  readonly #names = new Map<string, string[]>();
  readonly #aliases = new Map<string, string[]>();

  constructor(world: WorldStore) {
    this.#world = world;
    this.#source = createIndexSource(world);
    const add = (map: Map<string, string[]>, key: string, id: string) => {
      const list = map.get(key) ?? [];
      if (!list.includes(id)) list.push(id);
      map.set(key, list);
    };
    for (const entity of world.listEntities()) {
      add(this.#names, normalizeName(entity.name), entity.id);
      for (const alias of entity.aliases) add(this.#aliases, normalizeName(alias), entity.id);
    }
  }

  /** Privileged startup/index-builder API, not an audience-facing read. */
  indexSource(): RetrievalIndexSource { return this.#source; }

  private permitted(ref: CandidateReference, who: RetrievalAudience): boolean {
    const owner = this.#world.getEntity(ref.entity_id);
    if (!owner) return false;
    if (ref.chunk_id !== undefined) {
      const chunk = this.#world.getChunk(ref.chunk_id);
      return !!chunk && chunk.entity_id === owner.id && isVisible(chunk.knowledge ?? owner.knowledge, who);
    }
    return isVisible(owner.knowledge, who);
  }

  private candidate(ref: CandidateReference): RetrievalCandidate {
    const owner = this.#world.getEntity(ref.entity_id)!;
    if (ref.chunk_id !== undefined) {
      const chunk = this.#world.getChunk(ref.chunk_id)!;
      const policy = (chunk.knowledge ?? owner.knowledge)!;
      return chunkCandidate(chunk, this.#world.getChunkProvenance(chunk.id)!, !policy.visibility.player);
    }
    return entityCandidate(owner, this.#world.getProvenance(owner.id)!);
  }

  private page(refs: readonly CandidateReference[], options: Required<RetrievalPage>): WorldSearchResult {
    const end = options.offset + options.limit;
    return bounded({ candidates: Object.freeze(refs.slice(options.offset, end).map(ref => this.candidate(ref))), next_offset: end < refs.length ? end : null });
  }

  /** Rechecks authorization on index hit IDs; never trusts preprojected hit metadata. */
  projectCandidates(input: unknown, who: RetrievalAudience, options: unknown = {}): WorldSearchResult {
    const a = audience(who);
    const page = validatePage(options);
    const references = dataArray(input, "candidates", RETRIEVAL_LIMITS.candidate_references).map(validateWorldGetRequest);
    const unique = new Map<string, CandidateReference>();
    for (const ref of references) {
      if (this.permitted(ref, a)) unique.set(ref.chunk_id ?? ref.entity_id, ref);
    }
    const refs = [...unique.values()].sort((a, b) => compareIds(a.chunk_id ?? a.entity_id, b.chunk_id ?? b.entity_id));
    return this.page(refs, page);
  }

  filterEntities(input: unknown, who: RetrievalAudience, options: unknown = {}): WorldSearchResult {
    const a = audience(who);
    const filter = validateFilter(input);
    const page = validatePage(options);
    const refs = this.#world.listEntities().filter(e => isVisible(e.knowledge, a) && matchesEntityFilter(e, filter)).map(e => ({ entity_id: e.id }));
    return this.page(refs, page);
  }

  private resolveClass(ids: readonly string[], who: RetrievalAudience, matched_by: "id" | "name" | "alias", page: Required<RetrievalPage>): ResolutionResult {
    const refs = ids.map(entity_id => ({ entity_id })).filter(ref => this.permitted(ref, who));
    if (!refs.length) return Object.freeze({ kind: "not_found" });
    if (refs.length === 1) return page.offset === 0
      ? bounded({ kind: "found", matched_by, candidate: this.candidate(refs[0]!) })
      : Object.freeze({ kind: "not_found" });
    if (matched_by === "id") throw new Error("Impossible nonunique canonical ID");
    return bounded({ kind: "ambiguous", matched_by, ...this.page(refs, page) });
  }

  resolveEntityId(input: unknown, who: RetrievalAudience): ResolutionResult {
    const a = audience(who);
    const id = exactId(input, "entity_id");
    return this.resolveClass([id], a, "id", validatePage({}));
  }
  resolveChunkId(input: unknown, who: RetrievalAudience): ResolutionResult {
    const a = audience(who);
    const id = exactId(input, "chunk_id", true);
    const chunk = this.#world.getChunk(id);
    if (!chunk) return Object.freeze({ kind: "not_found" });
    const ref = { entity_id: chunk.entity_id, chunk_id: chunk.id };
    return this.permitted(ref, a) ? bounded({ kind: "found", matched_by: "id", candidate: this.candidate(ref) }) : Object.freeze({ kind: "not_found" });
  }
  resolveCanonicalName(input: unknown, who: RetrievalAudience, options: unknown = {}): ResolutionResult {
    return this.resolveClass(this.#names.get(normalizeName(queryText(input))) ?? [], audience(who), "name", validatePage(options));
  }
  resolveAlias(input: unknown, who: RetrievalAudience, options: unknown = {}): ResolutionResult {
    return this.resolveClass(this.#aliases.get(normalizeName(queryText(input))) ?? [], audience(who), "alias", validatePage(options));
  }
  resolveEntityReference(input: unknown, who: RetrievalAudience, options: unknown = {}): ResolutionResult {
    const a = audience(who);
    const normalized = normalizeName(queryText(input));
    const page = validatePage(options);
    // ID is literal: whitespace/case normalization applies only to names/aliases.
    const exact = this.#world.getEntity(input as string);
    if (exact && isVisible(exact.knowledge, a)) return this.resolveClass([exact.id], a, "id", page);
    const names = this.#names.get(normalized) ?? [];
    if (names.some(id => isVisible(this.#world.getEntity(id)!.knowledge, a))) return this.resolveClass(names, a, "name", page);
    return this.resolveClass(this.#aliases.get(normalized) ?? [], a, "alias", page);
  }

  /** Diagnostic internal outcome; publicGetResult conceals denied existence. */
  get(input: unknown, who: RetrievalAudience): WorldGetResult {
    try {
      const a = audience(who);
      const ref = validateWorldGetRequest(input);
      const owner = this.#world.getEntity(ref.entity_id);
      if (!owner) return Object.freeze({ kind: "not_found" });
      if (ref.chunk_id !== undefined && !this.#world.getChunk(ref.chunk_id)) return Object.freeze({ kind: "not_found" });
      if (!this.permitted(ref, a)) return Object.freeze({ kind: "not_visible" });
      if (ref.chunk_id !== undefined) {
        const chunk = this.#world.getChunk(ref.chunk_id)!;
        const policy = (chunk.knowledge ?? owner.knowledge)!;
        return bounded({ kind: "found", record: chunkFetch(chunk, this.#world.getChunkProvenance(chunk.id)!, !policy.visibility.player) });
      }
      return bounded({ kind: "found", record: entityFetch(owner, this.#world.getProvenance(owner.id)!) });
    } catch (error) {
      if (error instanceof RetrievalValidationError) return Object.freeze({ kind: "invalid_request", field: error.field });
      if (error instanceof RetrievalProjectionError) return Object.freeze({ kind: "too_large", field: error.field });
      throw error;
    }
  }
}
