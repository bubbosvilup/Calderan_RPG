import type { HybridSearch } from "../retrieval/hybrid-search.js";
import { escapeRegExp } from "./language/text.js";
import type { RetrievalService } from "../retrieval/retrieval-service.js";
import { QUERY_STOPWORDS, stem } from "../retrieval/lexical-index.js";
import { tokenize } from "../retrieval/tokenizer.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { stripParticipantIntroductions } from "./scene-participants.js";
import { TurnError, type RetrievalDiagnostic } from "./turn-types.js";

export interface TurnRetrieval { readonly search: Pick<HybridSearch, "searchWithDiagnostics">; readonly service: Pick<RetrievalService, "get"> }
/** Canon-sensitive topics: any mention asks for canon. Word-family forms are listed because the trigger does not stem. */
const WORLD_TOPIC = /\b(?:what do i know|tell me about|history of|lore|religion|magic|mages?|race|faction|slaves?|slavery|slavers?|enslaved)\b/i;
/** World/location questions ("where is the …", "who is the …"); questions about the listener or the conversation stay local. */
const WORLD_QUESTION = /\b(?:where\s+(?:is|are|was|were|can\s+i\s+find|do\s+i\s+find)|how\s+(?:do|can|would)\s+i\s+get\s+to|which\s+way\s+(?:is|to)|(?:what|who)\s+(?:is|are|was|were))\s+(?!(?:you|your|yours|my|mine|me|i|we|our|he|his|him|she|her|they|them|their|it|its|this|that|these|those|there|here|wrong|happening|going|up|going\s+on)\b)(?:the\s+|a\s+|an\s+)?[a-z]/i;

/**
 * Query intent (Phase 1R): a small classifier used only to trigger and target retrieval and to add a grounding focus line.
 * Priority route > schedule > history > location > lore. It never decides an answer.
 */
export type QueryIntent = "route" | "schedule" | "history" | "location" | "lore";
/** Same listener/conversation exclusion as WORLD_QUESTION: "where are you going?" and "what is your name?" stay local. */
const NOT_LISTENER = "(?!(?:you|your|yours|my|mine|me|i|we|our|he|his|him|she|her|they|them|their|it|its|this|that|these|those|there|here|wrong|happening|going|up)\\b)";
const INTENTS: readonly [QueryIntent, RegExp][] = [
  ["route", /\b(?:how\s+(?:do|can|would|should)\s+i\s+get\s+to|how\s+to\s+get\s+to|(?:exact\s+)?route\s+to|directions?\s+to|the\s+way\s+to|which\s+way\s+(?:is|to)|how\s+far\s+(?:is|to))\b/i],
  ["schedule", /\b(?:when\s+(?:do|does|is|are|will|did)\s+(?:the\s+)?(?!you\b|i\b|we\b)\w+|what\s+time|how\s+often|opening\s+hours|what\s+days?|schedule)\b/i],
  ["history", /\b(?:who\s+(?:owned|built|lived|founded|ran|used\s+to)|how\s+long\s+(?:has|have|had|ago|since)|used\s+to\s+(?:be|belong|live|own)|before\s+(?:me|him|her|us|them|now)|history\s+of|was\s+(?:built|founded|abandoned)|how\s+old\s+is)\b/i],
  // A service destination need not name a known business to require grounding.
  ["location", /\bwhere\s+(?:can|could|do)\s+i\s+(?:buy|purchase|repair|sell|pawn|wash|stay|eat)\b/i],
  ["location", new RegExp(`\\b(?:where\\s+(?:is|are|was|were|can\\s+i\\s+find|do\\s+i\\s+find)\\s+${NOT_LISTENER}|location\\s+of)\\b`, "i")],
  ["lore", new RegExp(`\\b(?:what\\s+(?:is|are)\\s+${NOT_LISTENER}(?:the\\s+|a\\s+|an\\s+)?[a-z]+|what\\s+do\\s+(?:people|you|folk)\\s+know|tell\\s+me\\s+about|who\\s+(?:is|are)\\s+the)\\b`, "i")],
];
export function queryIntent(text: string): QueryIntent | null { return INTENTS.find(([, pattern]) => pattern.test(text))?.[0] ?? null; }
/** The canon-relevant part of the input: participant introductions and roleplay asterisks carry no lore. */
export function retrievalQuery(input: string): string {
  return stripParticipantIntroductions(input).replace(/\*/g, " ").replace(/\s+/g, " ").trim() || input;
}
export function retrievalRequired(input: string, context: TurnContext, world: WorldStore): boolean {
  if (WORLD_TOPIC.test(input) || WORLD_QUESTION.test(input) || queryIntent(input)) return true;
  const local = new Set([context.primary.scene.player_location?.id, ...context.characters.map(c => c.id), ...context.items.map(i => i.id)]);
  return world.listEntities().some(e => !local.has(e.id) && e.knowledge?.visibility.player && e.knowledge.visibility.narrator &&
    [e.id, e.name, ...e.aliases].some(name => name.length >= 4 && input.toLowerCase().includes(name.toLowerCase())));
}

/** Head-noun equivalence for near-name matching only ("slave auctions" names the slave market). Deliberately tiny. */
const HEAD_EQUIVALENTS: readonly (readonly string[])[] = [["market", "auction", "sale"]];
const equivalent = (a: string, b: string) => a === b || HEAD_EQUIVALENTS.some(g => g.includes(a) && g.includes(b));
const content = (text: string) => tokenize(text).map(stem).filter(t => !QUERY_STOPWORDS.has(t));
const includesRun = (query: readonly string[], run: readonly string[], equivalentHead = false) => run.length > 0 && query.some((_, i) =>
  run.every((t, j) => j === run.length - 1 && equivalentHead ? query[i + j] !== undefined && equivalent(query[i + j]!, t) : query[i + j] === t));
const DEICTIC = /\b(?:this|that|the)\s+(tower|building|house|place|square|market|residence|home|hall)\b/i;
/**
 * Entities the query names (Phase 1R). explicit (2): a name/alias/display name as a token run (single-word names only when
 * capitalized). near (1): a multi-word name/alias minus tokens naming the entity's own ancestors ("Calderan Slave Market" →
 * "slave market"), last two tokens, head-noun equivalence allowed; dropped when the query explicitly names a location outside
 * the entity's ancestry and not contained in its parent ("slave market in Davenport"). deictic (1): "this tower" resolved
 * against the scene location, its ancestors and its connections.
 */
export function entityMentions(query: string, context: TurnContext, world: WorldStore): ReadonlyMap<string, 1 | 2> {
  const q = content(query), mentions = new Map<string, 1 | 2>();
  const visible = world.listEntities().filter(e => e.knowledge?.visibility.narrator && e.knowledge.visibility.player && !(context.player_profile && e.id === "nicco"));
  const names = (e: { readonly name: string; readonly display_name: string; readonly aliases: readonly string[] }) => [e.name, e.display_name, ...e.aliases];
  const ancestors = (id: string) => world.getAncestors(id).map(a => a.id);
  for (const e of visible) for (const n of names(e)) {
    const run = content(n);
    if (run.length > 1 || (run.length === 1 && new RegExp(`\\b${escapeRegExp(n)}\\b`).test(query))) { if (includesRun(q, run)) mentions.set(e.id, 2); }
  }
  const explicitPlaces = [...mentions.keys()].filter(id => world.getEntity(id)?.type === "location");
  for (const e of visible) {
    if (mentions.has(e.id)) continue;
    const own = ancestors(e.id), qualifiers = new Set(own.flatMap(id => { const a = world.getEntity(id)!; return names(a).flatMap(content); }));
    const conflict = explicitPlaces.some(p => p !== e.id && !own.includes(p) && !(e.parent && [p, ...ancestors(p)].includes(e.parent)));
    if (conflict) continue;
    for (const n of names(e)) {
      const stripped = content(n).filter(t => !qualifiers.has(t));
      if (stripped.length >= 2 && includesRun(q, stripped.slice(-2), true)) { mentions.set(e.id, 1); break; }
    }
  }
  const deictic = query.match(DEICTIC)?.[1]?.toLowerCase();
  if (deictic) {
    const here = context.primary.scene.player_location?.id;
    const scene = here ? [here, ...ancestors(here), ...((world.getEntity(here) as { connections?: { target: string }[] } | undefined)?.connections ?? []).flatMap(c => [c.target, ...ancestors(c.target)])] : [];
    const matches = [...new Set(scene)].filter(id => { const e = world.getEntity(id); return !!e && (names(e).some(n => content(n).includes(stem(deictic))) || new RegExp(`\\bis\\b[^.]*\\b${deictic}\\b(?!['’]s)`, "i").test(e.summary)); });
    for (const id of matches.filter(id => !matches.some(other => other !== id && ancestors(id).includes(other)))) if (!mentions.has(id)) mentions.set(id, 1);
  }
  return mentions;
}
/** Position of the closest scene ancestor containing the entity (0 = the scene location); undefined when not spatially placed. */
function localityRank(id: string, context: TurnContext, world: WorldStore): number | undefined {
  const scene = [context.primary.scene.player_location?.id, ...context.primary.scene.location_ancestry.map(a => a.id)].filter((x): x is string => !!x);
  const chain = [id, ...world.getAncestors(id).map(a => a.id)];
  const i = scene.findIndex(s => chain.includes(s));
  return i >= 0 && world.getEntity(id)?.type === "location" ? i : undefined;
}
/**
 * Hardening H3: every retrieval truncation is a named limit with a reason (values unchanged from Phase 1R).
 *  - query_characters: the cleaned query sent to search (a bound on input, not on results);
 *  - candidate_pool: lexical/hybrid candidates ranked by the turn policy;
 *  - mention_lookup_pool: candidates per extra lookup for an explicitly named entity missing from the pool;
 *  - ranked_results: candidates handed to the narrator as references (and to knowledge awareness);
 *  - exact_fetch: full records fetched (the top candidate only);
 *  - payload_characters: serialized retrieval payload; exceeding it fails the turn closed (retrieval_failed), never truncates lore.
 * Measured in H3: multi-answer misses are authoring-vocabulary gaps, not these limits (see the H3 report), so none was raised.
 */
export const RETRIEVAL_LIMITS = Object.freeze({ query_characters: 500, candidate_pool: 5, mention_lookup_pool: 5, ranked_results: 3, exact_fetch: 1, payload_characters: 10_000 });
export const POOL_SIZE = RETRIEVAL_LIMITS.candidate_pool, RESULT_LIMIT = RETRIEVAL_LIMITS.ranked_results, LOCALITY_TIE = 0.85;
type Candidate = { readonly entity_id: string; readonly kind: string; readonly chunk_id?: string; readonly secret?: boolean };
/**
 * Turn-level ranking (Phase 1R): lexical pool, then named entities first (explicit, then near/deictic; missing ones are fetched so
 * they survive the cutoff), then lexical order with scene locality only as a tiebreak among placed locations scoring within
 * LOCALITY_TIE of their group's top. Locality never outranks an explicit name and is never a filter.
 */
export async function rankForTurn(input: string, context: TurnContext, world: WorldStore, retrieval: TurnRetrieval, pool = POOL_SIZE) {
  const query = retrievalQuery(input), intent = queryIntent(query);
  const found = await retrieval.search.searchWithDiagnostics({ query: query.slice(0, RETRIEVAL_LIMITS.query_characters), limit: pool }, "narrator", "hybrid");
  const keep = (c: Candidate) => !c.secret && !(context.player_profile && c.kind === "entity" && c.entity_id === "nicco");
  const score = new Map(found.debug.hits.map(h => [h.reference.chunk_id ?? h.reference.entity_id, h.lexical_score ?? h.hybrid_score]));
  const key = (c: Candidate) => c.chunk_id ?? c.entity_id;
  const candidates: Candidate[] = [...(found.result.candidates as readonly Candidate[])].filter(keep);
  const mentions = entityMentions(query, context, world);
  for (const id of mentions.keys()) {
    if (candidates.some(c => c.entity_id === id)) continue;
    const entity = world.getEntity(id)!;
    const extra = (await retrieval.search.searchWithDiagnostics({ query: entity.name, limit: RETRIEVAL_LIMITS.mention_lookup_pool }, "narrator", "hybrid")).result.candidates as readonly Candidate[];
    const hit = extra.find(c => c.entity_id === id && c.kind === "entity" && keep(c));
    if (hit) candidates.push(hit);
  }
  const tier = (c: Candidate) => c.kind === "entity" ? mentions.get(c.entity_id) ?? 0 : 0;
  // Lexical token sets discard repetition in overlapping names such as
  // Back Alleys / Back-Back Alleys. Prefer the longer matched explicit name.
  const queryTokens = content(query);
  const specificity = (c: Candidate) => {
    if (tier(c) !== 2) return 0;
    const e = world.getEntity(c.entity_id)!;
    return Math.max(0, ...[e.name, e.display_name, ...e.aliases].map(content)
      .filter(run => includesRun(queryTokens, run)).map(run => run.length));
  };
  const s = (c: Candidate) => score.get(key(c)) ?? 0;
  const byScore = [...candidates].sort((a, b) => tier(b) - tier(a) || specificity(b) - specificity(a) || s(b) - s(a));
  const ordered: Candidate[] = [];
  for (let i = 0; i < byScore.length;) {
    const top = byScore[i]!, group = [top];
    for (let j = i + 1; j < byScore.length && tier(byScore[j]!) === tier(top) && specificity(byScore[j]!) === specificity(top) && s(byScore[j]!) >= LOCALITY_TIE * s(top); j++) group.push(byScore[j]!);
    ordered.push(...group.map((c, index) => ({ c, index, rank: localityRank(c.entity_id, context, world) }))
      .sort((a, b) => a.rank !== undefined && b.rank !== undefined ? a.rank - b.rank || a.index - b.index : a.index - b.index).map(x => x.c));
    i += group.length;
  }
  return { query, intent, mentions, used_mode: found.debug.used_mode, fallback_reason: found.debug.fallback_reason, candidates: ordered };
}

export async function retrieveForTurn(input: string, context: TurnContext, world: WorldStore, retrieval: TurnRetrieval) {
  const start = performance.now();
  if (!retrievalRequired(input, context, world)) return { data: { records: [] as unknown[], unknown: false }, payload_characters: 30, fallback_reason: undefined, diagnostics: { operations: 0, mode: "none", ids: [], elapsed_ms: performance.now() - start, outcome: "not_needed" } satisfies RetrievalDiagnostic };
  try {
    const ranked = await rankForTurn(input, context, world, retrieval);
    const candidates = ranked.candidates.slice(0, RETRIEVAL_LIMITS.ranked_results);
    const first = candidates[0]; // RETRIEVAL_LIMITS.exact_fetch: only the top candidate's record is fetched
    const fetched = first ? retrieval.service.get({ entity_id: first.entity_id, ...(first.kind === "chunk" ? { chunk_id: first.chunk_id } : {}) }, "narrator") : undefined;
    if (fetched && fetched.kind !== "found") throw new TurnError("retrieval_failed");
    const records: unknown[] = fetched?.kind === "found" && !fetched.record.secret ? [fetched.record] : [];
    const awareness = candidates.map(c => {
      const owner = world.getEntity(c.entity_id), chunk = c.kind === "chunk" && c.chunk_id ? world.getChunk(c.chunk_id) : undefined;
      const policy = chunk?.knowledge ?? owner?.knowledge;
      return { id: c.kind === "chunk" && c.chunk_id ? c.chunk_id : c.entity_id, narrator_access: true, player_access: true,
        known_by_present_npcs: policy?.known_by.filter(id => context.characters.some(person => person.id === id)) ?? [],
        // Authored ordinary awareness (Phase 1P). Retrieval returns canon to the narrator; this scope, not retrieval, decides NPC use.
        ...(policy?.awareness ? { awareness: policy.awareness } : {}) };
    });
    // question_focus is prompt guidance only (Phase 1R); it is not rendered inside [RETRIEVED CANON].
    const data = { records, candidates, awareness, unknown: candidates.length === 0, ...(ranked.intent ? { question_focus: ranked.intent } : {}) };
    const payload_characters = JSON.stringify(data).length;
    if (payload_characters > RETRIEVAL_LIMITS.payload_characters) throw new TurnError("retrieval_failed");
    return { data, payload_characters, fallback_reason: ranked.fallback_reason, diagnostics: { operations: (first ? 2 : 1) + [...ranked.mentions.keys()].filter(id => !(ranked.candidates as readonly Candidate[]).some(c => c.entity_id === id)).length,
      mode: ranked.used_mode === "hybrid" ? "hybrid" : "lexical", ids: candidates.map(c => c.kind === "chunk" && c.chunk_id ? c.chunk_id : c.entity_id), elapsed_ms: performance.now() - start, outcome: candidates.length ? "found" : "unknown",
      query: ranked.query, intent: ranked.intent, mentions: Object.fromEntries(ranked.mentions) } satisfies RetrievalDiagnostic };
  } catch { throw new TurnError("retrieval_failed"); }
}
