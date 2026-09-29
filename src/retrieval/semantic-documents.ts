import { characterSearchText } from "../world/character-contract.js";
import { compareIds } from "../world/provenance.js";
import { EmbeddingError } from "./embedding-provider.js";
import { isVisible } from "./policy.js";
import { tokenize } from "./tokenizer.js";
import { audience } from "./validation.js";
import type { CandidateReference, RetrievalAudience, RetrievalEntitySource, RetrievalIndexSource } from "./types.js";

export const SEMANTIC_DOCUMENT_VERSION = "authorized-canon-text-v2";
export const MAX_SEMANTIC_DOCUMENT_CHARACTERS = 20000;
/** Trusted builder input only. Never send these full texts through world_search. */
export interface SemanticDocument {
  readonly reference: CandidateReference;
  readonly text: string;
  readonly duplicate_group: number;
  readonly filter_owner?: RetrievalEntitySource;
}
export const recordKey = (ref: CandidateReference): string => ref.chunk_id ?? ref.entity_id;
/** Shared passage grouping without deriving embedding text or imposing provider budgets. */
export function authorizedDuplicateGroups(source: RetrievalIndexSource, who: RetrievalAudience): ReadonlyMap<string, number> {
  const a = audience(who), entities = new Map(source.entities().map(e => [e.id, e]));
  const groups = new Map<string, number>(), records = new Map<string, number>();
  const add = (ref: CandidateReference, summary: string, content: string) => {
    const text = `${ref.entity_id}\n${tokenize(summary).join(" ")}\n${tokenize(content).join(" ")}`;
    const group = groups.get(text) ?? groups.size; groups.set(text, group); records.set(recordKey(ref), group);
  };
  for (const e of source.entities()) if (isVisible(e.knowledge, a)) add({ entity_id: e.id }, e.summary, e.content);
  for (const c of source.chunks()) if (isVisible(c.knowledge ?? entities.get(c.entity_id)?.knowledge, a)) add({ entity_id: c.entity_id, chunk_id: c.id }, c.summary, c.content);
  return records;
}
export function deriveSemanticDocuments(source: RetrievalIndexSource, who: RetrievalAudience): readonly SemanticDocument[] {
  const a = audience(who), entities = new Map(source.entities().map(e => [e.id, e]));
  const documents: SemanticDocument[] = [], groups = new Map<string, number>();
  const add = (reference: CandidateReference, lines: readonly string[], summary: string, content: string, owner?: RetrievalEntitySource) => {
    const text = lines.filter(line => line.trim()).join("\n");
    if (text.length > MAX_SEMANTIC_DOCUMENT_CHARACTERS) throw new EmbeddingError("document_too_large");
    // Same exact duplicate policy as lexical search; calculated once, not per query.
    const groupKey = `${reference.entity_id}\n${tokenize(summary).join(" ")}\n${tokenize(content).join(" ")}`;
    const duplicate_group = groups.get(groupKey) ?? groups.size; groups.set(groupKey, duplicate_group);
    documents.push(Object.freeze({ reference: Object.freeze(reference), text, duplicate_group, ...(owner ? { filter_owner: owner } : {}) }));
  };
  for (const e of source.entities()) {
    if (!isVisible(e.knowledge, a)) continue;
    const parent = e.parent === null ? undefined : entities.get(e.parent);
    const relations = e.type === "character" ? e.relationships : e.type === "faction" ? e.relations : [];
    add({ entity_id: e.id }, [
      `Name: ${e.name}`, ...(e.display_name !== e.name ? [`Display name: ${e.display_name}`] : []),
      ...(e.aliases.length ? [`Aliases: ${[...new Set(e.aliases)].join("; ")}`] : []),
      `Type: ${e.type}`, ...(parent && isVisible(parent.knowledge, a) ? [`Parent: ${parent.name}`] : []),
      ...(e.type === "character" ? characterSearchText(e) : []),
      `Summary: ${e.summary}`, ...(e.search_context ? [`Context: ${e.search_context}`] : []), e.content,
      ...(e.type === "location" ? e.features.map(f => `Feature: ${f.name}. ${f.description}`) : []),
      ...relations.map(r => `Relationship: ${r.kind}. ${r.description}`),
    ], e.summary, e.content, e);
  }
  for (const c of source.chunks()) {
    const owner = entities.get(c.entity_id);
    if (!owner) throw new Error("Semantic source chunk lacks owner");
    if (!isVisible(c.knowledge ?? owner.knowledge, a)) continue;
    const visibleOwner = isVisible(owner.knowledge, a) ? owner : undefined;
    add({ entity_id: c.entity_id, chunk_id: c.id }, [
      ...(visibleOwner ? [`Owner: ${visibleOwner.name}`] : []),
      `Section: ${c.section}`, `Summary: ${c.summary}`,
      ...(c.search_context ? [`Context: ${c.search_context}`] : []), c.content,
    ], c.summary, c.content, visibleOwner);
  }
  return Object.freeze(documents.sort((a, b) => compareIds(recordKey(a.reference), recordKey(b.reference))));
}
