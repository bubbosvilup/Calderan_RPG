import { characterSearchText } from "../world/character-contract.js";
import { compareIds } from "../world/provenance.js";
import { matchesAuthorizedOwner } from "./filters.js";
import { isVisible } from "./policy.js";
import { searchableRelationships } from "./relationship-policy.js";
import { tokenize } from "./tokenizer.js";
import { audience, validateWorldSearchRequest } from "./validation.js";
import type { CandidateReference, RetrievalAudience, RetrievalEntitySource, RetrievalFilter, RetrievalIndexSource } from "./types.js";

export const FIELD_WEIGHTS = Object.freeze({
  id: 14, name: 12, alias: 12, display_name: 10, feature_name: 8,
  summary: 6, search_context: 5, tags: 4, content: 2,
  feature_description: 2, parent: 2, owner: 2, section: 8, relationship: 2,
});
export type LexicalField = keyof typeof FIELD_WEIGHTS;
const EXACT_BONUSES: Partial<Record<LexicalField, number>> = { id: 300, name: 240, alias: 220, display_name: 200, feature_name: 60, section: 60 };
type FieldInput = Partial<Record<LexicalField, readonly string[]>>;
interface LexicalDocument {
  readonly ref: CandidateReference;
  readonly key: string;
  // Present only when the owner itself is authorized; never used to score.
  readonly filterOwner?: RetrievalEntitySource;
  readonly fields: ReadonlyMap<LexicalField, ReadonlySet<string>>;
  readonly exact: ReadonlyMap<LexicalField, ReadonlySet<string>>;
  readonly duplicateGroup: number;
}
type PendingDocument = Omit<LexicalDocument, "duplicateGroup"> & { readonly presentation: string };
interface AudienceIndex {
  readonly documents: ReadonlyMap<string, LexicalDocument>;
  readonly postings: ReadonlyMap<string, readonly string[]>;
}
export interface TokenContribution {
  readonly token: string;
  readonly field: LexicalField;
  readonly contribution: number;
  readonly document_frequency: number;
  readonly inverse_frequency: number;
}
export interface LexicalHit {
  readonly reference: CandidateReference;
  readonly score: number;
  readonly matched_tokens: readonly string[];
  readonly contributions: readonly TokenContribution[];
  readonly coverage_bonus: number;
  readonly exact_bonus: number;
  readonly exact_field: LexicalField | null;
}

/**
 * Stemming-lite (Phase 1R): deterministic plural folding only (auctions→auction, pens→pen, slaves→slave, cities→city).
 * No derivational stemming, so slave/slavery and mage/magic stay distinct. Applied identically to index and query.
 */
export function stem(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(?:ss|us|is)$/.test(token)) return token;
  if (/(?:ches|shes|xes|zes|sses)$/.test(token)) return token.slice(0, -2);
  return token.endsWith("s") ? token.slice(0, -1) : token;
}
/** Query-side function words and conversational filler; they never select canon. Never applied to indexed text. */
export const QUERY_STOPWORDS: ReadonlySet<string> = new Set(("a an the to of in on at by for from with and or but is are was were be been being do does did what whats when where who whom how why which s t d ll re ve it its this that these those " +
  "here there i im me my you your we us our they them their he him his she her excuse please tell about can could would will any some happen know anything something just so if then than as into over").split(" "));
const stems = (value: string) => tokenize(value).map(stem);
function normalizedSequence(value: string): string { return stems(value).join(" "); }
function document(ref: CandidateReference, input: FieldInput, summary: string, content: string, owner?: RetrievalEntitySource): PendingDocument {
  const fields = new Map<LexicalField, ReadonlySet<string>>();
  const exact = new Map<LexicalField, ReadonlySet<string>>();
  for (const field of Object.keys(FIELD_WEIGHTS) as LexicalField[]) {
    const values = input[field];
    if (!values) continue;
    fields.set(field, new Set(values.flatMap(v => stems(v))));
    if (EXACT_BONUSES[field]) exact.set(field, new Set(values.map(normalizedSequence).filter(Boolean)));
  }
  return { ref: Object.freeze(ref), key: ref.chunk_id ?? ref.entity_id, fields, exact,
    presentation: `${normalizedSequence(summary)}\n${normalizedSequence(content)}`,
    ...(owner ? { filterOwner: owner } : {}) };
}

function build(source: RetrievalIndexSource, who: RetrievalAudience): AudienceIndex {
  const entities = new Map(source.entities().map(e => [e.id, e]));
  const documents = new Map<string, LexicalDocument>();
  const presentations = new Map<string, number>();
  const add = (d: PendingDocument) => {
    // Compare passage text once at build time; queries deduplicate integer groups.
    const key = `${d.ref.entity_id}\n${d.presentation}`;
    const duplicateGroup = presentations.get(key) ?? presentations.size;
    presentations.set(key, duplicateGroup);
    const { presentation: _presentation, ...indexed } = d;
    documents.set(d.key, { ...indexed, duplicateGroup });
  };
  for (const e of source.entities()) {
    if (!isVisible(e.knowledge, who)) continue;
    const parent = e.parent === null ? undefined : entities.get(e.parent);
    const relationship = searchableRelationships(e, who);
    add(document({ entity_id: e.id }, {
      id: [e.id], name: [e.name], alias: e.aliases, display_name: [e.display_name],
      summary: [e.summary], search_context: [e.search_context, ...(e.type === "character" ? characterSearchText(e) : [])], content: [e.content], tags: e.tags,
      ...(e.type === "location" ? { feature_name: e.features.map(f => f.name), feature_description: e.features.map(f => f.description) } : {}),
      ...(parent && isVisible(parent.knowledge, who) ? { parent: [parent.id, parent.name, parent.display_name] } : {}),
      // Only this record's authored relation prose, never target metadata or traversal.
      relationship: relationship.flatMap(r => [r.kind, r.description]),
    }, e.summary, e.content, e));
  }
  for (const c of source.chunks()) {
    const owner = entities.get(c.entity_id);
    if (!owner) throw new Error("Lexical source chunk lacks owner");
    if (!isVisible(c.knowledge ?? owner.knowledge, who)) continue;
    const visibleOwner = isVisible(owner.knowledge, who) ? owner : undefined;
    add(document({ entity_id: c.entity_id, chunk_id: c.id }, {
      id: [c.id], section: [c.section], summary: [c.summary], search_context: [c.search_context], content: [c.content], tags: c.tags,
      ...(visibleOwner ? { owner: [owner.id, owner.name, owner.display_name] } : {}),
    }, c.summary, c.content, visibleOwner));
  }
  const postings = new Map<string, string[]>();
  for (const d of [...documents.values()].sort((a, b) => compareIds(a.key, b.key))) {
    for (const token of new Set([...d.fields.values()].flatMap(tokens => [...tokens]))) {
      const list = postings.get(token) ?? []; list.push(d.key); postings.set(token, list);
    }
  }
  return { documents, postings };
}

function matches(d: LexicalDocument, filter: RetrievalFilter): boolean {
  return matchesAuthorizedOwner(d.ref, d.filterOwner, filter);
}

/** Derived, in-memory audience corpora bound to one immutable canonical dataset. */
export class LexicalIndex {
  readonly datasetId: string;
  readonly #audiences: Readonly<Record<RetrievalAudience, AudienceIndex>>;
  constructor(source: RetrievalIndexSource) {
    this.datasetId = source.datasetId();
    this.#audiences = { narrator: build(source, "narrator"), player: build(source, "player") };
    Object.freeze(this);
  }
  documentCount(who: RetrievalAudience): number { return this.#audiences[audience(who)].documents.size; }

  /** Dev/internal ranked hits only. Public search rechecks policy and bounds projections. */
  searchDebug(input: unknown, who: RetrievalAudience): readonly LexicalHit[] {
    const request = validateWorldSearchRequest(input);
    const index = this.#audiences[audience(who)];
    const sequence = normalizedSequence(request.query);
    const all = [...new Set(stems(request.query))], content = all.filter(t => !QUERY_STOPWORDS.has(t));
    const tokens = (content.length ? content : all).sort(compareIds);
    const frequencies = new Map(tokens.map(token => {
      const document_frequency = index.postings.get(token)?.length ?? 0;
      return [token, { document_frequency, inverse_frequency: document_frequency ? Math.log(1 + index.documents.size / document_frequency) : 0 }];
    }));
    const keys = new Set(tokens.flatMap(t => index.postings.get(t) ?? []));
    const hits: LexicalHit[] = [];
    for (const key of [...keys].sort(compareIds)) {
      const d = index.documents.get(key)!;
      if (!matches(d, request.filters ?? {})) continue;
      const contributions: TokenContribution[] = [];
      for (const token of tokens) {
        let best: LexicalField | undefined;
        for (const [field, words] of d.fields) {
          if (words.has(token) && (best === undefined || FIELD_WEIGHTS[field] > FIELD_WEIGHTS[best])) best = field;
        }
        if (best !== undefined) {
          const { document_frequency, inverse_frequency } = frequencies.get(token)!;
          contributions.push(Object.freeze({ token, field: best, document_frequency, inverse_frequency,
            contribution: FIELD_WEIGHTS[best] * inverse_frequency }));
        }
      }
      const coverage_bonus = 2 * contributions.reduce((sum, c) => sum + c.inverse_frequency, 0) ** 2;
      let exact_bonus = 0, exact_field: LexicalField | null = null;
      for (const [field, values] of d.exact) {
        const bonus = EXACT_BONUSES[field] ?? 0;
        if (values.has(sequence) && bonus > exact_bonus) { exact_bonus = bonus; exact_field = field; }
      }
      const score = contributions.reduce((sum, c) => sum + c.contribution, coverage_bonus + exact_bonus);
      if (score > 0) hits.push(Object.freeze({ reference: d.ref, score,
        matched_tokens: Object.freeze(contributions.map(c => c.token)), contributions: Object.freeze(contributions),
        coverage_bonus, exact_bonus, exact_field }));
    }
    hits.sort((a, b) => b.score - a.score || compareIds(a.reference.chunk_id ?? a.reference.entity_id, b.reference.chunk_id ?? b.reference.entity_id));
    // Independent records compete; suppress only same-owner identical normalized summary+content.
    const seen = new Set<number>();
    return Object.freeze(hits.filter(hit => {
      const d = index.documents.get(hit.reference.chunk_id ?? hit.reference.entity_id)!;
      if (seen.has(d.duplicateGroup)) return false;
      seen.add(d.duplicateGroup); return true;
    }));
  }
}
