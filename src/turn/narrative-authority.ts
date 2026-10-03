import type { TurnContext } from "./context-builder.js";
import { narratorFactTruth } from "./context-builder.js";
import type { SceneParticipantPlan, EphemeralSceneParticipant } from "./scene-participants.js";
import { TurnError } from "./turn-types.js";
import { REQUEST_RESOURCE_CHARACTERS } from "../types/resource-limits.js";

/**
 * Narrative knowledge access (Phase 1N). A derived, ephemeral, per-turn projection: which present character may voice or act
 * on which fact already present in narrator context. It is NOT persisted and NOT a CampaignState domain.
 *
 * Persistent semantics are unchanged: a missing knowledge edge is not proof that a character is ignorant.
 * Narrative permission is a different concept: "DO NOT USE" means the engine has not authorized that character to use the
 * fact this turn, never "this character can never know it". Built only from the captured turn context and retrieval result.
 */
export interface AccessFact { readonly ref: string; readonly id: string; readonly source: "campaign_fact" | "retrieved_canon" | "player_household" | "npc_private_canon"; readonly text: string;
  readonly truth?: "true" | "false" | "unknown";
  /** npc_private_canon only: the present characters authored to know it (names, for rendering). */
  readonly holders?: readonly string[] }
export interface CharacterAccess { readonly character_id: string; readonly name: string; readonly kind?: "persistent" | "ephemeral"; readonly standing?: string; readonly can_use: readonly { readonly ref: string; readonly basis: string }[]; readonly do_not_use: readonly string[] }
export interface NarrativeKnowledgeAccess { readonly revision: number; readonly facts: readonly AccessFact[]; readonly player: readonly string[]; readonly characters: readonly CharacterAccess[] }

const MAX_FACTS = 40, MAX_RENDERED = 6_000, ALL_FACTS_UP_TO = 12, MAX_SELECTED = 16;
/** Relevance signals for narrator-side fact selection (Phase 1O). Never used for authorization. */
export interface RelevanceSignals { readonly input: string; readonly recent_text?: string; readonly intent_fact_ids?: readonly string[] }
const STOP = new Set(["the", "and", "that", "this", "with", "from", "have", "been", "were", "what", "about", "your", "you", "remember", "know", "told", "tell", "said"]);
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w)));
/**
 * Bounded relevance: up to ALL_FACTS_UP_TO (12) player-known facts are all projected (unchanged behavior). Beyond that, only facts the turn
 * references: the player intent (e.g. /tell), an explicit lexical reference in the input (a recall query such as "do you remember the
 * eastern bridge?"), or a reference in recent conversation. Absence from the prompt is never forgetting: CampaignState still holds every edge.
 */
export function selectRelevantFacts<F extends { readonly id: string; readonly statement: string }>(facts: readonly F[], signals?: RelevanceSignals): readonly F[] {
  if (!signals || facts.length <= ALL_FACTS_UP_TO) return facts;
  const input = tokens(signals.input), recent = tokens(signals.recent_text ?? "");
  const overlaps = (f: F, set: Set<string>) => [...tokens(f.statement)].some(w => set.has(w)) || set.has(f.id.toLowerCase());
  const picked = [...facts.filter(f => signals.intent_fact_ids?.includes(f.id)), ...facts.filter(f => overlaps(f, input)), ...facts.filter(f => overlaps(f, recent))];
  return [...new Set(picked)].slice(0, MAX_SELECTED);
}
interface RetrievalAwareness { readonly id: string; readonly player_access?: boolean; readonly known_by_present_npcs?: readonly string[]; readonly awareness?: string }
/**
 * Ordinary awareness (Phase 1P). public: any character. local:<id>: only a character whose locality (ephemeral: captured scene
 * ancestry with an ordinary local standing; persistent: authored home ancestry) contains <id>. specialized/private/unclassified:
 * never. Campaign facts have no ordinary awareness: they are private to their explicit edges.
 */
export function ordinaryAwareness(scope: string | undefined, locality: readonly string[], localStanding: boolean): string | null {
  if (scope === "public") return "public";
  if (scope?.startsWith("local:") && localStanding && locality.includes(scope.slice(6))) return scope;
  return null;
}
function awarenessOf(retrieval: unknown): readonly RetrievalAwareness[] {
  const list = (retrieval as { awareness?: unknown } | null)?.awareness;
  return Array.isArray(list) ? list.filter((a): a is RetrievalAwareness => !!a && typeof (a as RetrievalAwareness).id === "string") : [];
}

/**
 * Relevant-fact set = facts already in this turn's narrator context: player-known campaign facts (context.facts) and retrieved
 * canon entries. Nothing is searched for beyond that, so absence never becomes an unbounded negative-knowledge list.
 * Sources of permission: explicit campaign knowledge edges; authored canonical awareness (known_by / canonical_awareness).
 * No public-fact policy exists yet, so no fact is treated as public. Narrator, player or retrieval access grants nothing to NPCs.
 */
export function projectKnowledgeAccess(context: TurnContext, retrieval: unknown, signals?: RelevanceSignals, scene?: SceneParticipantPlan): NarrativeKnowledgeAccess {
  const facts: AccessFact[] = [
    ...selectRelevantFacts(context.facts, signals).map((f, i) => ({ ref: `F${i + 1}`, id: f.id, source: "campaign_fact" as const, text: f.statement, ...(narratorFactTruth(f) ? { truth: narratorFactTruth(f)! } : {}) })),
    ...awarenessOf(retrieval).map((a, i) => ({ ref: `R${i + 1}`, id: a.id, source: "retrieved_canon" as const, text: `retrieved canon "${a.id}"${a.awareness ? ` [${a.awareness}]` : ""}` })),
    // Repair 1: Nicco's household roles (e.g. owner of Heartstone) are controlled facts, not ambient truth. Only fellow members
    // may use them; everyone else may at most guess from what is visible now (e.g. standing at its door), framed as a guess.
    ...(context.player_profile?.households ?? []).map((h, i) => ({ ref: `H${i + 1}`, id: h.id, source: "player_household" as const, text: `Nicco is ${h.role ?? h.status} of the household ${h.name}.` })),
  ];
  if (facts.length > MAX_FACTS) throw new TurnError("context_too_large");
  // Hardening H3: restricted canon a present character is authored to know (known_by). One entry per canon record, listing every
  // present holder. Grants are never cut: the complete set is in context; size is bounded by the render budget, which fails closed.
  const privateCanon = new Map<string, { label: string; summary: string; holders: string[] }>();
  for (const g of context.npc_private_canon ?? []) {
    const entry = privateCanon.get(g.id) ?? { label: g.label, summary: g.summary, holders: [] };
    entry.holders.push(g.character_id); privateCanon.set(g.id, entry);
  }
  const nameOf = (id: string) => context.characters.find(c => c.id === id)?.profile.name ?? id;
  facts.push(...[...privateCanon].map(([id, p], i) => ({ ref: `P${i + 1}`, id, source: "npc_private_canon" as const, text: `${p.label}: ${p.summary}`, holders: p.holders.map(nameOf) })));
  const privateHolders = new Map([...privateCanon].map(([id, p]) => [id, p.holders]));
  const retrieved = new Map(awarenessOf(retrieval).map(a => [a.id, a]));
  const households = new Map((context.player_profile?.households ?? []).map(h => [h.id, h.member_ids ?? []]));
  const characters: CharacterAccess[] = context.characters.filter(c => c.id !== "nicco").map(c => {
    const can_use = facts.flatMap(f => {
      if (f.source === "npc_private_canon") return privateHolders.get(f.id)?.includes(c.id) ? [{ ref: f.ref, basis: "canonical_private" }] : [];
      if (f.source === "player_household") return households.get(f.id)?.includes(c.id) ? [{ ref: f.ref, basis: "household_member" }] : [];
      if (f.source === "campaign_fact") {
        const edge = context.knowledge.find(k => k.character_id === c.id && k.fact_id === f.id);
        return edge ? [{ ref: f.ref, basis: edge.status }] : [];
      }
      const canonical = retrieved.get(f.id)?.known_by_present_npcs?.includes(c.id) || c.canonical_awareness.includes(f.id);
      if (canonical) return [{ ref: f.ref, basis: "canonical" }];
      const ordinary = ordinaryAwareness(retrieved.get(f.id)?.awareness, c.locality, true);
      return ordinary ? [{ ref: f.ref, basis: ordinary }] : [];
    });
    return { character_id: c.id, name: c.profile.name ?? c.id, kind: "persistent" as const, can_use, do_not_use: facts.filter(f => !can_use.some(u => u.ref === f.ref)).map(f => f.ref) };
  });
  // Every character who may speak has a scope: ephemeral participants get only ordinary awareness, never campaign facts.
  const ephemeral = (scene?.participants ?? []).map((p: EphemeralSceneParticipant) => {
    const can_use = facts.flatMap(f => {
      if (f.source !== "retrieved_canon") return [];
      const ordinary = ordinaryAwareness(retrieved.get(f.id)?.awareness, p.locality, p.standing === "ordinary_local");
      return ordinary ? [{ ref: f.ref, basis: ordinary }] : [];
    });
    return { character_id: p.id, name: `${p.ref} ${p.display_name}`, kind: "ephemeral" as const, standing: p.standing, can_use, do_not_use: facts.filter(f => !can_use.some(u => u.ref === f.ref)).map(f => f.ref) };
  });
  characters.push(...ephemeral);
  // NPC-private canon is never player/narration knowledge.
  const player = facts.filter(f => f.source !== "npc_private_canon" && (f.source !== "retrieved_canon" || retrieved.get(f.id)?.player_access !== false)).map(f => f.ref);
  return { revision: context.primary.runtime_revision, facts, player, characters };
}

export function renderKnowledgeAccess(access: NarrativeKnowledgeAccess): string {
  if (!access.facts.length) return "[CHARACTER KNOWLEDGE ACCESS]\nNo facts in this context require character access control.";
  const shared = access.facts.filter(f => f.source !== "npc_private_canon"), restricted = access.facts.filter(f => f.source === "npc_private_canon");
  const characterLine = (c: CharacterAccess) => `${c.name}${c.kind === "ephemeral" ? ` (temporary, ${c.standing === "ordinary_local" ? "ordinary local" : c.standing === "foreign" ? "not local" : "origin unestablished"})` : ""}: CAN USE ${c.can_use.map(u => `${u.ref} (${u.basis})`).join(", ") || "none"}; DO NOT USE ${c.do_not_use.join(", ") || "none"}`;
  const head = [
    "[CHARACTER KNOWLEDGE ACCESS]",
    `Facts: ${shared.map(f => `${f.ref} ${f.source === "campaign_fact" ? `${f.id} ${JSON.stringify(f.text)}` : f.source === "player_household" ? `household ${JSON.stringify(f.text)}` : `${f.text} (content in RETRIEVED CANON)`}`).join(" | ") || "none"}`,
    // Hardening H3: restricted canon only the listed character knows, kept in its own section, one line per record.
    ...(restricted.length ? ["[NPC-PRIVATE CANON] Narrator-only background known ONLY to the character named on each line: not public, not known to Nicco, never stated or hinted by the narration voice or anyone else. Only that character may voice it, in their own words, if they choose to reveal it.",
      ...restricted.map(f => `${f.ref} (${(f.holders ?? []).join(", ")} only): ${JSON.stringify(f.text)}`)] : []),
    `Narration and Nicco (player): ${access.player.join(", ") || "none"}. Nicco's speech and decisions still belong to the player.`,
  ];
  const rules = [
    "A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, \"everyone says\" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.",
    "UNKNOWN IS NOT A RUMOR: when a character cannot use a fact, it is unknown to them, never something they heard. \"People say\", \"I heard\", \"word is\", \"everyone knows\", registries, records, reports, past meetings or sightings are sources; a character may cite one only when a CAN USE entry with that basis exists. Allowed instead: \"I don't know\", a question, or a guess explicitly framed as a guess and based only on what they can see or hear right now.",
  ];
  const full = [...head, ...access.characters.map(characterLine), ...rules].join("\n");
  if (full.length <= MAX_RENDERED) return full;
  // Hardening H3: a crowded scene keeps every permission. Lossless compaction: each DO NOT USE list is exactly the complement of
  // that character's CAN USE list, so it is stated once instead of enumerated, and characters who may use nothing share one line.
  // If even that exceeds the budget, the access cannot be represented safely: fail closed.
  const none = access.characters.filter(c => !c.can_use.length), some = access.characters.filter(c => c.can_use.length);
  const compactLine = (c: CharacterAccess) => characterLine({ ...c, do_not_use: [] }).replace(/; DO NOT USE none$/, "; DO NOT USE every other fact above");
  const compact = [...head, ...some.map(compactLine), ...(none.length ? [`Everyone else present (${none.map(c => c.name).join(", ")}): CAN USE none; DO NOT USE any fact above.`] : []), ...rules].join("\n");
  // 6k was a token approximation. Keep its lossless formatting optimization, but let final token accounting decide capacity.
  if (compact.length > REQUEST_RESOURCE_CHARACTERS) throw new TurnError("context_too_large");
  return compact;
}
