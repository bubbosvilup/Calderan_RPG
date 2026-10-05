import type { CampaignSnapshot, PremiumRollup, RelationshipDimension, RelationshipLevel } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { characterView } from "../campaign/projections.js";
import { activeNpcPlus } from "../campaign/premium-characters.js";
import { mannerismAvailable, mannerismEpistemicState } from "../campaign/mannerisms.js";
import { escapeRegExp as esc } from "./language/text.js";

/**
 * NPC+ Pass 1 — deterministic premium-character context, packed under ONE global scene budget, with an exact recovery seam.
 *
 * Fidelity tiers:
 *  A. Authority (identity, location, legal status, membership, rules, conditions, knowledge permissions, relationship values) is NOT
 *     produced here: it is already in the turn context, never-drop (H3), and outside this budget. NPC+ never drops it for flavour.
 *  B. Active NPC+ in focus (present and named or addressed by the player): compact, human-readable — pinned.
 *  C. Background NPC+ (other active members, present or not): the caveman line, vocabulary below — no generated prose.
 *  D. Dormant / deep (canon background chunks, lifecycle history, memories): never in the prompt by default; each source has a
 *     stable recovery handle, and relevant PUBLIC sources are recovered before narration (one narrator call stays one call).
 *
 * Compression is domain-aware and deterministic: every compact token renders exactly one authoritative value (relationship levels
 * come from the relationship domain; there is no second copy), and the exact source stays recoverable by handle. Private sources
 * (narrator-only canon known to this character, facts only they know) are recoverable for the engine but are never rendered here:
 * holder-scoped use of private canon stays on the H3 path ([NPC-PRIVATE CANON]); recovery permission is not disclosure.
 */
export const NPC_PLUS_LIMITS = Object.freeze({ budget_characters: 4_000, core_traits: 3, deep_refs: 4, recovered: 2, recovered_characters: 600 });
/** The single documented compact vocabulary (Tier C). */
export const NPC_PLUS_VOCABULARY = Object.freeze({
  dimensions: Object.freeze({ trust: "trust", wariness: "wary", affection: "aff", protectiveness: "prot", respect: "resp", fear: "fear", hostility: "host", romance: "rom" } satisfies Record<RelationshipDimension, string>),
  levels: Object.freeze({ none: "0", low: "L", moderate: "M", high: "H" } satisfies Record<RelationshipLevel, string>),
  /**
   * `core=` personality (campaign contract, else authored traits); `voice=` voice contract; `social=` social style; `role=` household
   * role; `N{…}` their relationship toward Nicco; `recent=` up to two development tokens; `deep=[…]` recoverable handles.
   * Development tokens (Pass 2): `trust>N:L→M` (their trust toward Nicco moved low→moderate; `<X` = X's edge toward them),
   * `+cond:injured` / `-cond:injured`, `legal:enslaved→free`, `sale` / `gift` / `assignment` / `freed`, `rule+`, `moved:<location>`,
   * `contract:<field>`, `joined` / `left` / `rejoined` / `migrated`.
   */
  keys: Object.freeze(["core", "voice", "social", "role", "N", "recent", "deep"] as const),
});
/** Bounded rendering of developments: Tier B shows up to this many, Tier C up to `recent_c`. */
const DEVELOPMENTS = { recent_b: 3, recent_c: 2 } as const;
type Development = DeepReadonly<CampaignSnapshot>["premium_characters"][number]["dynamic"]["recent_developments"][number];
/** Stable history handle: revision plus ordinal within that revision (survives retention dropping older entries). */
function historyHandles(characterId: string, list: readonly Development[]): string[] {
  return list.map((e, i) => `npcmem:${characterId}:history:r${e.revision}.${list.slice(0, i).filter(x => x.revision === e.revision).length}`);
}
const short = (snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, id: string) => id === "nicco" ? "N" : nameOf(snapshot, world, id).split(/\s+/)[0]!;
/** One development as a compact token (vocabulary above); `self` is the NPC+ whose history it is. */
function token(e: Development, self: string, snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore): string {
  const L = NPC_PLUS_VOCABULARY.levels;
  switch (e.kind) {
    case "relationship_changed": return `${NPC_PLUS_VOCABULARY.dimensions[e.dimension]}${e.actor_id === self ? `>${short(snapshot, world, e.other_id)}` : `<${short(snapshot, world, e.actor_id)}`}:${L[e.from]}→${L[e.to]}`;
    case "condition_added": return `+cond:${e.condition}`;
    case "condition_removed": return `-cond:${e.condition}`;
    case "legal_status_changed": return `legal:${e.from}→${e.to}`;
    case "person_transaction": return e.transaction_kind === "manumission" ? "freed" : e.transaction_kind;
    case "household_rule_added": return "rule+";
    case "moved": return `moved:${e.to ?? "?"}`;
    case "contract_established": return `contract:${e.field}`;
    default: return e.kind.replace(/_household$/, "").replace(/^migrated_member$/, "migrated");
  }
}
/**
 * NPC+ Pass 3: at most ONE consolidated-history token — `trust_hist>N:+3/-1` (a relationship row) or `injured_hist:+2/-2` (a condition
 * row). Preference: a row whose subject matches the player's words, else the most active row involving Nicco, else none. Counts only.
 */
function rollupToken(r: DeepReadonly<PremiumRollup>, self: string, input: string, snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore): string | undefined {
  const asked = new Set(words(input));
  const rel = (x: (typeof r.relationships)[number]) => `${NPC_PLUS_VOCABULARY.dimensions[x.dimension]}_hist${x.actor_id === self ? `>${short(snapshot, world, x.other_id)}` : `<${short(snapshot, world, x.actor_id)}`}:+${x.raises}/-${x.lowers}`;
  const matchRel = r.relationships.find(x => asked.has(x.dimension) || asked.has(NPC_PLUS_VOCABULARY.dimensions[x.dimension]));
  if (matchRel) return rel(matchRel);
  const matchCond = r.conditions.find(x => asked.has(x.condition));
  if (matchCond) return `${matchCond.condition}_hist:+${matchCond.added}/-${matchCond.removed}`;
  const nicco = [...r.relationships].filter(x => x.actor_id === "nicco" || x.other_id === "nicco").sort((a, b) => (b.raises + b.lowers) - (a.raises + a.lowers) || b.last_revision - a.last_revision)[0];
  return nicco ? rel(nicco) : undefined;
}
/** NPC+ Pass 6: at most 2 reflection notes in Tier B and 1 token in Tier C; ranked by confidence, kind priority, then recency. */
const REFLECTION_RENDER = { tier_b: 2 } as const;
const REFLECTION_TOKEN = { stance: "stance", signature_pattern: "pattern", shared_motif: "motif", emerging_role: "role", unresolved_tension: "tension" } as const;
const KIND_PRIORITY = { unresolved_tension: 5, stance: 4, signature_pattern: 3, emerging_role: 2, shared_motif: 1 } as const;
const CONFIDENCE = { high: 3, medium: 2, low: 1 } as const;
function topReflections(snapshot: DeepReadonly<CampaignSnapshot>, id: string) {
  return [...(snapshot.premium_reflections.find(r => r.character_id === id)?.notes ?? [])]
    .sort((a, b) => CONFIDENCE[b.confidence] - CONFIDENCE[a.confidence] || KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] || b.updated_revision - a.updated_revision || (a.id < b.id ? -1 : 1));
}
/** Deterministic relevance of a development to this turn: player-input words, Nicco, a mentioned person, recency (no model). */
function rankDevelopments(list: readonly Development[], input: string, mentioned: ReadonlySet<string>): Development[] {
  const asked = new Set(words(input));
  const ids = (e: Development) => e.kind === "relationship_changed" ? [e.actor_id, e.other_id] : e.kind === "legal_status_changed" && e.holder_id ? [e.holder_id] : [];
  const topical = (e: Development) => [e.kind, "dimension" in e ? e.dimension : "", "condition" in e ? e.condition : "", "field" in e ? e.field : "", e.kind === "person_transaction" && e.transaction_kind === "manumission" ? "free freed freedom" : ""].join(" ");
  const score = (e: Development, i: number) => (words(topical(e)).some(w => asked.has(w)) ? 40 : 0) + (ids(e).includes("nicco") || e.kind === "person_transaction" ? 20 : 0) + (ids(e).some(x => mentioned.has(x)) ? 10 : 0) + i;
  return list.map((e, i) => ({ e, s: score(e, i), i })).sort((a, b) => b.s - a.s || b.i - a.i).map(x => x.e);
}

export type NpcPlusTier = "B" | "C";
export interface NpcPlusFragment { readonly key: string; readonly character_id: string; readonly tier: NpcPlusTier; readonly pinned: boolean; readonly score: number; readonly text: string; readonly recovery_refs: readonly string[] }
export interface NpcContextRecovery { readonly handle: string; readonly character_id: string; readonly kind: "canon" | "history" | "knowledge" | "rollup" | "contract" | "reflection"; readonly visibility: "public" | "holder_private"; readonly exact_payload: string }
export interface NpcPlusDiagnostics { readonly active_count: number; readonly candidate_fragments: number; readonly selected_fragments: number; readonly chars_before: number; readonly chars_after: number;
  readonly omitted_fragments: number; readonly recovery_refs: number; readonly recovered: number; readonly tier_counts: Readonly<Record<"B" | "C" | "D", number>> }
export interface NpcPlusContext { readonly lines: readonly string[]; readonly diagnostics: NpcPlusDiagnostics }

const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []);
const nameOf = (snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, id: string) => { const v = characterView(snapshot, world, id); return v.profile.name ?? snapshot.characters.find(c => c.id === id)?.origin_snapshot?.label ?? id; };

/** Deep (Tier D) sources of one NPC+, each with a stable handle. Derived from canon, premium state and runtime: never stored. */
export function npcDeepSources(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, characterId: string): readonly NpcContextRecovery[] {
  const out: NpcContextRecovery[] = [];
  const entity = world.getEntity(characterId);
  // NPC+ Pass 3: the authored character's own entity content (canon NPC chunks are all private; public canon lives here).
  if (entity?.type === "character" && entity.content && entity.knowledge?.visibility.narrator) {
    const pub = !!entity.knowledge.visibility.player, holder = (entity.knowledge.known_by ?? []).includes(characterId);
    if (pub || holder) out.push({ handle: `npcmem:${characterId}:canon:entity`, character_id: characterId, kind: "canon", visibility: pub ? "public" : "holder_private", exact_payload: entity.content });
  }
  if (entity?.type === "character") for (const c of world.listChunks().filter(x => x.entity_id === characterId)) {
    const k = c.knowledge ?? entity.knowledge;
    if (!k?.visibility.narrator) continue;
    const pub = !!k.visibility.player, holder = (k.known_by ?? []).includes(characterId);
    if (!pub && !holder) continue; // narrator-only canon this character does not know is not theirs to recall
    out.push({ handle: `npcmem:${characterId}:canon:${c.id}`, character_id: characterId, kind: "canon", visibility: pub ? "public" : "holder_private", exact_payload: c.content });
  }
  const premium = snapshot.premium_characters.find(p => p.character_id === characterId);
  // Pass 2: the exact structured entry (stable keys), not a rendering of it.
  const history = premium?.dynamic.recent_developments ?? [], handles = historyHandles(characterId, history);
  history.forEach((e, i) => out.push({ handle: handles[i]!, character_id: characterId, kind: "history", visibility: "public", exact_payload: JSON.stringify(e) }));
  // NPC+ Pass 3: consolidated history is recoverable exactly, typed as a roll-up (never presented as the original events).
  if (premium?.dynamic.long_term) out.push({ handle: `npcmem:${characterId}:rollup:long_term`, character_id: characterId, kind: "rollup", visibility: "public",
    exact_payload: JSON.stringify({ type: "consolidated_history", ...premium.dynamic.long_term }) });
  // NPC+ Pass 6: contract evidence (verbatim self-descriptions) and reflection notes are recoverable exactly by stable handles.
  premium?.stable.contract_evidence?.forEach((c, i) => out.push({ handle: `npcmem:${characterId}:contract:${i}`, character_id: characterId, kind: "contract", visibility: "public", exact_payload: JSON.stringify(c) }));
  for (const n of snapshot.premium_reflections.find(r => r.character_id === characterId)?.notes ?? [])
    out.push({ handle: `npcmem:${characterId}:reflection:${n.id}`, character_id: characterId, kind: "reflection", visibility: "public", exact_payload: JSON.stringify({ type: "reflection_note", ...n }) });
  const niccoKnows = new Set(snapshot.knowledge.filter(k => k.character_id === "nicco" && k.status === "knows").map(k => k.fact_id));
  const memoryIds = new Set([...snapshot.knowledge.filter(k => k.character_id === characterId).map(k => k.fact_id), ...(premium?.dynamic.private_memory_refs ?? [])]);
  for (const f of snapshot.facts.filter(x => memoryIds.has(x.id) && x.content.kind === "campaign"))
    out.push({ handle: `npcmem:${characterId}:knowledge:${f.id}`, character_id: characterId, kind: "knowledge", visibility: niccoKnows.has(f.id) ? "public" : "holder_private",
      exact_payload: f.content.kind === "campaign" ? f.content.statement : "" });
  return out;
}
/** Exact recovery by handle (the source itself, not the compact rendering). Undefined for an unknown or non-NPC+ handle. */
export function recoverNpcContext(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, handle: string): NpcContextRecovery | undefined {
  const m = handle.match(/^npcmem:([a-z0-9_]+):/);
  if (!m || !snapshot.premium_characters.some(p => p.character_id === m[1])) return undefined;
  return npcDeepSources(world, snapshot, m[1]!).find(s => s.handle === handle);
}

export interface NpcPlusPackingOptions { readonly include_reflections?: boolean }

/** Candidate fragments for every ACTIVE NPC+ (B for present characters in focus, C for everyone), in snapshot order. */
export function npcPlusFragments(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, present: ReadonlySet<string>, input = "", options: NpcPlusPackingOptions = {}): readonly NpcPlusFragment[] {
  const active = activeNpcPlus(snapshot);
  const presentActive = snapshot.premium_characters.filter(p => active.has(p.character_id) && present.has(p.character_id)).map(p => p.character_id);
  const out: NpcPlusFragment[] = [];
  // Pass 10: who the player's words mention, computed once per NPC+ (it was recomputed for every pair: O(P²) character lookups and regex builds).
  const mentioned_by_input = new Map(snapshot.premium_characters.map(x => [x.character_id, new RegExp(`\\b${esc(nameOf(snapshot, world, x.character_id).split(/\s+/)[0]!)}\\b`, "i").test(input)] as const));
  for (const p of snapshot.premium_characters) {
    if (!active.has(p.character_id)) continue;
    const id = p.character_id, name = nameOf(snapshot, world, id), view = characterView(snapshot, world, id);
    const entity = world.getEntity(id), canonical = entity?.type === "character" && entity.knowledge?.visibility.narrator ? entity : undefined;
    const core = p.stable.personality_contract ?? (canonical?.traits.length ? canonical.traits.slice(0, NPC_PLUS_LIMITS.core_traits).join(", ") : undefined);
    const voice = p.stable.voice_contract ?? view.profile.voice;
    const social = p.stable.baseline_social_style;
    const moral = [...(p.stable.moral_boundaries ?? []), ...(canonical?.morality ? [canonical.morality] : [])].join("; ") || undefined;
    const role = snapshot.households.flatMap(h => h.members).find(m => m.character_id === id && m.status === "member")?.role;
    const edge = snapshot.relationships.find(e => e.from_character_id === id && e.to_character_id === "nicco")?.dimensions ?? {};
    const dims = (Object.keys(NPC_PLUS_VOCABULARY.dimensions) as RelationshipDimension[]).filter(d => edge[d] !== undefined);
    const latest = p.dynamic.recent_developments.at(-1)!;
    const others = new Set(snapshot.premium_characters.map(x => x.character_id).filter(x => x !== id && mentioned_by_input.get(x)));
    const ranked = rankDevelopments(p.dynamic.recent_developments, input, others);
    const chrono = (n: number) => ranked.slice(0, n).sort((a, b) => p.dynamic.recent_developments.indexOf(a) - p.dynamic.recent_developments.indexOf(b));
    const refs = npcDeepSources(world, snapshot, id).filter(s => s.kind !== "history" && s.kind !== "contract" && s.kind !== "reflection").slice(0, NPC_PLUS_LIMITS.deep_refs).map(s => s.handle);
    const reflections = options.include_reflections === false ? [] : topReflections(snapshot, id);
    const rollupHint = p.dynamic.long_term ? rollupToken(p.dynamic.long_term, id, input, snapshot, world) : undefined;
    const mentioned = [name, ...name.split(/\s+/).filter(t => t.length > 2)].some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(input));
    const addressed = mentioned || presentActive.length === 1 && presentActive[0] === id && /\b(?:you|your)\b/i.test(input);
    const here = present.has(id);
    const cues = here ? (p.mannerisms ?? []).filter(m => mannerismAvailable(m, id, snapshot, world)).map(m => `${m.text} [recurrence=${mannerismEpistemicState(m)}; recognized_by=${(m.known_by_character_ids ?? []).map(id => nameOf(snapshot, world, id)).join(",") || "nobody"}]`) : [];
    const mannerisms = cues.length ? `\nMannerisms:\n${cues.map(text => `- ${text}`).join("\n")}` : "";
    const score = (addressed ? 1000 : 0) + (here ? 100 : 0) + (dims.some(d => edge[d] !== "none") ? 10 : 0) + Math.max(0, 5 - Math.floor((snapshot.revision - latest.revision) / 5));
    const deep = refs.length ? `; deep=[${refs.join(",")}]` : "";
    if (here && addressed) out.push({ key: `${id}:B`, character_id: id, tier: "B", pinned: true, score, recovery_refs: refs,
      text: `NPC+ ${name} (${id}) — personality: ${core ?? "unknown"} | voice: ${voice ?? "unknown"} | morality: ${moral ?? "unknown"} | social style: ${social ?? "unknown"} | household role: ${role ?? "unestablished"} | toward Nicco: ${dims.length ? dims.map(d => `${d} ${edge[d]}`).join(", ") : "no recorded relationship"} | recent (r${latest.revision}): ${chrono(DEVELOPMENTS.recent_b).map(e => token(e, id, snapshot, world)).join(", ")}${rollupHint ? ` | history: ${rollupHint}` : ""}${reflections.length ? ` | reflection: ${reflections.slice(0, REFLECTION_RENDER.tier_b).map(n => `${n.kind.replace(/_/g, " ")} "${n.text}"`).join("; ")}` : ""}${deep}${mannerisms}` });
    out.push({ key: `${id}:C`, character_id: id, tier: "C", pinned: here && addressed, score, recovery_refs: refs,
      text: `${name}: core=${core ? core.replace(/\s*,\s*/g, ",").replace(/\s+/g, "_") : "?"}${voice ? `; voice=${voice.replace(/\s+/g, "_")}` : ""}${social ? `; social=${social.replace(/\s+/g, "_")}` : ""}; role=${role ?? "?"}; N{${dims.map(d => `${NPC_PLUS_VOCABULARY.dimensions[d]}=${NPC_PLUS_VOCABULARY.levels[edge[d]!]}`).join(",")}}; recent=${chrono(DEVELOPMENTS.recent_c).map(e => token(e, id, snapshot, world)).join(",")}${rollupHint ? `; hist=${rollupHint}` : ""}${reflections.length ? `; refl=${REFLECTION_TOKEN[reflections[0]!.kind]}:${reflections[0]!.label}` : ""}${here ? "" : "; away"}${deep}${mannerisms}` });
  }
  return out;
}

/**
 * Deterministic global packing. Pinned characters keep Tier B when it fits, else their Tier C; then optional Tier C by
 * score (ties by snapshot order); then relevant PUBLIC deep material for selected characters, recovered by handle. Output keeps
 * snapshot order. A > B > C > D: authority is not in this budget and is never traded away here.
 */
export function packNpcPlus(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, present: ReadonlySet<string>, input = "", budget: number = NPC_PLUS_LIMITS.budget_characters, options: NpcPlusPackingOptions = {}): NpcPlusContext | undefined {
  const fragments = npcPlusFragments(world, snapshot, present, input, options);
  if (!fragments.length) return undefined;
  const order = new Map(fragments.map((f, i) => [f.key, i]));
  const chosen = new Map<string, NpcPlusFragment>(); let used = 0;
  const fits = (text: string) => used + text.length + 1 <= budget;
  const take = (f: NpcPlusFragment) => { chosen.set(f.character_id, f); used += f.text.length + 1; };
  const byScore = (a: NpcPlusFragment, b: NpcPlusFragment) => b.score - a.score || order.get(a.key)! - order.get(b.key)!;
  for (const f of fragments.filter(x => x.tier === "B").sort(byScore)) if (fits(f.text)) take(f);
  // Pinned characters whose Tier B did not fit fall back to Tier C before any optional fragment is considered (the budget is hard).
  for (const f of fragments.filter(x => x.tier === "C" && x.pinned && !chosen.has(x.character_id)).sort(byScore)) if (fits(f.text)) take(f);
  for (const f of fragments.filter(x => x.tier === "C" && !x.pinned).sort(byScore)) if (!chosen.has(f.character_id) && fits(f.text)) take(f);
  // Pre-narration recovery: public deep sources of selected characters that share a distinctive word with the player's input.
  const asked = new Set(words(input).filter(w => w.length >= 5));
  const recovered: { character_id: string; line: string }[] = [];
  for (const f of [...chosen.values()].sort(byScore)) {
    if (recovered.length >= NPC_PLUS_LIMITS.recovered || !asked.size) break;
    const name = nameOf(snapshot, world, f.character_id);
    for (const s of npcDeepSources(world, snapshot, f.character_id).filter(x => x.visibility === "public" && x.kind !== "history" && x.kind !== "rollup" && x.kind !== "contract" && x.kind !== "reflection" && !(x.handle.endsWith(":canon:entity") && present.has(f.character_id)))) {
      if (recovered.length >= NPC_PLUS_LIMITS.recovered || !words(s.exact_payload).some(w => asked.has(w))) continue;
      const line = `Recovered for ${name} [${s.handle}]: ${s.exact_payload.slice(0, NPC_PLUS_LIMITS.recovered_characters)}`;
      if (fits(line)) { recovered.push({ character_id: f.character_id, line }); used += line.length + 1; }
    }
  }
  const selected = [...chosen.values()].sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  const lines = selected.flatMap(f => [f.text, ...recovered.filter(r => r.character_id === f.character_id).map(r => r.line)]);
  const characters = new Set(fragments.map(f => f.character_id));
  const before = [...characters].reduce((n, id) => n + Math.max(...fragments.filter(f => f.character_id === id).map(f => f.text.length + 1)), 0);
  const tiers = { B: selected.filter(f => f.tier === "B").length, C: selected.filter(f => f.tier === "C").length, D: characters.size - selected.length };
  return Object.freeze({ lines: Object.freeze(lines), diagnostics: Object.freeze({ active_count: characters.size, candidate_fragments: fragments.length, selected_fragments: selected.length,
    chars_before: before, chars_after: lines.reduce((n, l) => n + l.length + 1, 0), omitted_fragments: fragments.length - selected.length, recovery_refs: selected.reduce((n, f) => n + f.recovery_refs.length, 0),
    recovered: recovered.length, tier_counts: Object.freeze(tiers) }) });
}
/**
 * NPC+ Pass 4: same-turn de-duplication by SOURCE IDENTITY (never text similarity). A recovered public canon line whose source the H3
 * retrieval already fetched this turn (an entity record → `npcmem:<id>:canon:entity`, a chunk record → `npcmem:<id>:canon:<chunk_id>`)
 * is replaced by a pointer to [RETRIEVED CANON]: the payload appears once, its handle stays visible, nothing is lost. Private sources are
 * never on recovered lines in the first place, so they are untouched. Recovery stays when retrieval did not fetch the source.
 */
export function retrievedSourceHandles(retrieved: unknown): ReadonlySet<string> {
  const records = (retrieved as { records?: readonly { kind?: string; entity_id?: string; chunk_id?: string }[] } | undefined)?.records ?? [];
  return new Set(records.flatMap(r => r.entity_id ? [r.kind === "chunk" && r.chunk_id ? `npcmem:${r.entity_id}:canon:${r.chunk_id}` : `npcmem:${r.entity_id}:canon:entity`] : []));
}
const RECOVERED = /^Recovered for (.+?) \[(npcmem:[^\]]+)\]: /;
export function deduplicateRecovered(npc: NpcPlusContext, retrieved: unknown): { readonly npc: NpcPlusContext; readonly removed: number } {
  const fetched = retrievedSourceHandles(retrieved);
  let removed = 0;
  const lines = npc.lines.map(line => {
    const m = line.match(RECOVERED);
    if (!m || !fetched.has(m[2]!)) return line;
    removed++;
    return `Recovered for ${m[1]} [${m[2]}]: same source as [RETRIEVED CANON] (shown there once).`;
  });
  return { npc: removed ? Object.freeze({ ...npc, lines: Object.freeze(lines) }) : npc, removed };
}
/** Narrator section (absent when no active NPC+). Authority stays in the state blocks above it. */
export const MANNERISM_NARRATOR_RULE = "Mannerisms are optional local cues: use occasionally and naturally, never in every scene or as caricature, only when their stated condition occurs. Recurrence: emergent establishes no prior occurrence; observed records an occurrence, not a habit; established supports recurrence, not universal frequency. Characters recognize a habit only if listed in recognized_by. Do not infer history, personality, psychology, motivation, consent or internal state from cue presence. Never invent objects, prerequisites or facts to perform a cue.";
export function renderNpcPlus(npc: NpcPlusContext): string {
  return [`[NPC+ HOUSEHOLD CHARACTERS] Premium continuity for household members (portrayal guidance, not public knowledge). Authoritative state above wins on any conflict. Compact keys: core=personality traits, role=household role, N{…}=their relationship toward Nicco (0 none, L low, M moderate, H high; trust, wary=wariness, aff=affection, prot=protectiveness, resp=respect, fear, host=hostility, rom=romance), recent=latest household event, away=not in this scene, deep=[…]=recoverable background not shown.`,
    ...(npc.lines.some(line => line.includes("\nMannerisms:\n")) ? [MANNERISM_NARRATOR_RULE] : []), ...npc.lines].join("\n");
}
