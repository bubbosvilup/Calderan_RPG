import type { WorldStore } from "../world/world-store.js";
import type { WorldEntity as RawEntity } from "../types/entities.js";
import type { DeepReadonly } from "../types/readonly.js";
type WorldEntity = DeepReadonly<RawEntity>;
import { compareIds } from "../world/provenance.js";

/**
 * Hardening H3 — authored canonical knowledge grants (`known_by`), indexed once per immutable WorldStore.
 *
 * Four different things, deliberately kept apart:
 *  A. player-visible canon   — visibility.player && visibility.narrator: Nicco/narration may know it directly.
 *  B. NPC-known canon         — `known_by` names the NPCs authored to know an entity or chunk.
 *  C. narrator access         — what the narrator may use to decide what a PRESENT character can plausibly say.
 *  D. player disclosure       — what narration actually reveals; only a character with a grant may voice B-but-not-A canon.
 *
 * `public` (A ∩ B) feeds `canonical_awareness`. `restricted` (B on narrator-visible, player-invisible canon) feeds the
 * NPC-private knowledge projection: before H3 it was unreachable (retrieval filters secret records, and canonical_awareness
 * required player visibility). Narrator-invisible canon is never indexed, with ONE exception: sealed `holder_only` canon (tier 2,
 * manual secret) is indexed as restricted for its explicit known_by holders, which is its only path to the narrator. `author_only`
 * canon (tier 3) is never indexed (validation also forbids it any holder).
 */
export interface PrivateCanonGrant { readonly id: string; readonly kind: "entity" | "chunk"; readonly label: string; readonly summary: string }
export interface KnowledgeGrantIndex {
  /** NPC id → player-visible entity ids it is authored to know, in WorldStore order (the pre-H3 canonical_awareness order). */
  readonly public: ReadonlyMap<string, readonly string[]>;
  /** NPC id → restricted (narrator-only) entities and chunks it is authored to know, ordered by id. */
  readonly restricted: ReadonlyMap<string, readonly PrivateCanonGrant[]>;
}
const cache = new WeakMap<WorldStore, KnowledgeGrantIndex>();
const push = <T>(map: Map<string, T[]>, key: string, value: T) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };

export function knowledgeGrants(world: WorldStore): KnowledgeGrantIndex {
  const cached = cache.get(world); if (cached) return cached;
  const pub = new Map<string, string[]>(), restricted = new Map<string, PrivateCanonGrant[]>();
  const indexed = (k: WorldEntity["knowledge"]): k is NonNullable<WorldEntity["knowledge"]> => !!k && (k.visibility.narrator || k.secrecy === "holder_only");
  for (const e of world.listEntities()) {
    const k = e.knowledge; if (!indexed(k)) continue;
    for (const id of k.known_by) {
      if (k.visibility.player) push(pub, id, e.id);
      else push(restricted, id, { id: e.id, kind: "entity", label: e.display_name, summary: e.summary });
    }
  }
  // Only chunks with their OWN policy: a chunk inheriting its owner's policy is already covered by the owner's grant.
  for (const c of world.listChunks()) {
    const k = c.knowledge; if (!indexed(k) || k.visibility.player) continue;
    const owner = world.getEntity(c.entity_id);
    for (const id of k.known_by) push(restricted, id, { id: c.id, kind: "chunk", label: `${owner?.display_name ?? c.entity_id} (${c.section.replace(/_/g, " ")})`, summary: c.summary });
  }
  for (const list of restricted.values()) list.sort((a, b) => compareIds(a.id, b.id));
  const index = Object.freeze({ public: pub, restricted });
  cache.set(world, index);
  return index;
}
