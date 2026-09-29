import type { EntityType } from "../types/entities.js";
import type { RetrievalAudience, RetrievalFilter, RetrievalPage, WorldGetRequest, WorldSearchRequest } from "./types.js";

export const RETRIEVAL_LIMITS = Object.freeze({
  query: 512, id: 200, name: 200, summary: 600, content: 8000,
  features: 24, feature_description: 400, tags: 32, filter_values: 64,
  default_candidates: 5, max_candidates: 5, projection_characters: 20000,
  candidate_references: 10000,
});

export class RetrievalValidationError extends Error {
  constructor(public readonly field: string, reason: string) {
    super(`${field}: ${reason}`); this.name = "RetrievalValidationError";
  }
}
export function dataRecord(input: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new RetrievalValidationError(field, "expected a plain data object");
  }
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !keys.includes(key)) throw new RetrievalValidationError(field, "unknown field");
    const d = Object.getOwnPropertyDescriptor(input, key)!;
    if (!d.enumerable || !("value" in d)) throw new RetrievalValidationError(field, "expected enumerable data properties");
    out[key] = d.value as unknown;
  }
  return out;
}
export function dataArray(input: unknown, field: string, max: number): readonly unknown[] {
  if (!Array.isArray(input) || input.length > max) throw new RetrievalValidationError(field, `expected an array of at most ${max} entries`);
  for (const key of Reflect.ownKeys(input)) {
    if (key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)) throw new RetrievalValidationError(field, "unknown array field");
  }
  const out: unknown[] = [];
  for (let i = 0; i < input.length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !d.enumerable || !("value" in d)) throw new RetrievalValidationError(field, "expected dense data entries");
    out.push(d.value);
  }
  return out;
}
export function exactId(input: unknown, field: string, chunk = false): string {
  const part = "[a-z][a-z0-9]*(?:_[a-z0-9]+)*";
  if (typeof input !== "string" || input.length > RETRIEVAL_LIMITS.id || !new RegExp(`^${part}${chunk ? `\\.${part}` : ""}$`).test(input)) {
    throw new RetrievalValidationError(field, "expected an exact canonical ID");
  }
  return input;
}
export function audience(input: unknown): RetrievalAudience {
  if (input !== "narrator" && input !== "player") throw new RetrievalValidationError("audience", "expected narrator or player");
  return input;
}
export function queryText(input: unknown): string {
  if (typeof input !== "string" || input.length > RETRIEVAL_LIMITS.query || !input.trim()) throw new RetrievalValidationError("query", "expected nonempty bounded text");
  return input.trim();
}
export function normalizeName(input: string): string { return input.trim().toLowerCase(); }
const types: readonly EntityType[] = ["location", "character", "event", "faction", "item", "concept", "world_lore"];

export function validateFilter(input: unknown): RetrievalFilter {
  const r = dataRecord(input, "filters", ["entity_types", "entity_ids", "parent_ids", "tags_all", "tags_any"]);
  const out: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(r)) {
    const list = dataArray(value, `filters.${key}`, RETRIEVAL_LIMITS.filter_values).map(v => {
      if (key === "entity_types") {
        if (typeof v !== "string" || !types.includes(v as EntityType)) throw new RetrievalValidationError(`filters.${key}`, "unknown entity type");
        return v;
      }
      return exactId(v, `filters.${key}`);
    });
    out[key] = Object.freeze([...new Set(list)].sort());
  }
  return Object.freeze(out) as RetrievalFilter;
}
export function validatePage(input: unknown): Required<RetrievalPage> {
  const r = dataRecord(input, "page", ["limit", "offset"]);
  const limit = Object.hasOwn(r, "limit") ? r.limit : RETRIEVAL_LIMITS.default_candidates;
  const offset = Object.hasOwn(r, "offset") ? r.offset : 0;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > RETRIEVAL_LIMITS.max_candidates) throw new RetrievalValidationError("limit", "expected 1 through 5");
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + limit)) throw new RetrievalValidationError("offset", "expected a nonnegative safe page offset");
  return Object.freeze({ limit, offset });
}
export function validateWorldSearchRequest(input: unknown): WorldSearchRequest {
  const r = dataRecord(input, "$", ["query", "filters", "limit"]);
  const query = queryText(r.query);
  const page = validatePage(Object.hasOwn(r, "limit") ? { limit: r.limit } : {});
  return Object.freeze({ query, limit: page.limit, ...(Object.hasOwn(r, "filters") ? { filters: validateFilter(r.filters) } : {}) });
}
export function validateWorldGetRequest(input: unknown): WorldGetRequest {
  const r = dataRecord(input, "$", ["entity_id", "chunk_id"]);
  const entity_id = exactId(r.entity_id, "entity_id");
  if (!Object.hasOwn(r, "chunk_id")) return Object.freeze({ entity_id });
  const chunk_id = exactId(r.chunk_id, "chunk_id", true);
  if (!chunk_id.startsWith(`${entity_id}.`)) throw new RetrievalValidationError("chunk_id", "chunk must belong to requested entity");
  return Object.freeze({ entity_id, chunk_id });
}
