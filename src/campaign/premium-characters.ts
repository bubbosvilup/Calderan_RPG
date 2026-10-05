import type { CampaignCommand, CampaignDomains, CampaignSnapshot, PremiumCharacterState, PremiumContractField, PremiumHistoryEntry, PremiumRollup, ReflectionNote, RelationshipDimension, RelationshipLevel } from "./types.js";
import { RELATIONSHIP_DIMENSIONS, RELATIONSHIP_LEVELS } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { PreparationContext } from "./preparation.js";
import { fail, PREMIUM_DEVELOPMENT_RETENTION, PREMIUM_ROLLUP_LIMITS, REFLECTION_LIMITS } from "./validation.js";
import { compareIds } from "../world/provenance.js";
import type { WorldStore } from "../world/world-store.js";
import { assignInitialMannerism } from "./mannerisms.js";

/**
 * NPC+ lifecycle and development (Pass 1 + Pass 2). Household membership is the ONLY trigger: a character becomes NPC+ when they become
 * a current member of a household Nicco keeps (Nicco is a member with role "owner"). Origin is irrelevant (authored or created); Nicco
 * never is NPC+. Leaving deactivates and preserves the record; rejoining reactivates the SAME record. There are no importance,
 * interaction, healing, gift, romance or model triggers.
 *
 * `syncPremiumCharacters` runs inside CampaignState preparation after every command of a proposal. It (1) reconciles lifecycle with
 * membership and (2) appends DEVELOPMENTS by diffing the authoritative domains the proposal changed — relationships, conditions, legal
 * status, person transactions, household rules, location and campaign contracts. A development therefore exists only in the same
 * revision as the committed change it records: a rejected or failed turn never prepares one, a stale replay cannot commit, and narration
 * alone changes no domain. Developments are history; the owning domain stays the current truth.
 */
type Domains = Pick<CampaignDomains, "households" | "premium_characters">;
/** Households Nicco keeps (he is a current member with the owner role). */
export function niccoHouseholds(s: DeepReadonly<Domains>): readonly string[] {
  return s.households.filter(h => h.members.some(m => m.character_id === "nicco" && m.status === "member" && m.role === "owner")).map(h => h.id);
}
/** Current members (not Nicco) of households Nicco keeps, each with the first such household (stable order). */
export function niccoHouseholdMembers(s: DeepReadonly<Domains>): ReadonlyMap<string, string> {
  const kept = new Set(niccoHouseholds(s)), out = new Map<string, string>();
  for (const h of [...s.households].sort((a, b) => compareIds(a.id, b.id))) if (kept.has(h.id))
    for (const m of h.members) if (m.character_id !== "nicco" && m.status === "member" && !out.has(m.character_id)) out.set(m.character_id, h.id);
  return out;
}
/** Active NPC+ character IDs (current members of a household Nicco keeps that have premium state). */
export function activeNpcPlus(s: DeepReadonly<Pick<CampaignSnapshot, "premium_characters">>): ReadonlySet<string> {
  return new Set(s.premium_characters.filter(p => p.metadata.active_household_member).map(p => p.character_id));
}

// ------------------------------------------------------------------------------------------------ contracts (NPC+ Pass 2)
const FIELD = { personality: "personality_contract", voice: "voice_contract", social_style: "baseline_social_style" } as const;
/** Set-once contract fields; a moral boundary accumulates (distinct). Contracts never change silently: no rewrite, no deletion. */
export function contractSet(p: DeepReadonly<PremiumCharacterState>, field: PremiumContractField, text: string): boolean {
  if (field === "moral_boundary") return (p.stable.moral_boundaries ?? []).some(b => b.toLowerCase() === text.toLowerCase());
  return p.stable[FIELD[field]] !== undefined;
}
/**
 * NPC+ Pass 6: structural checks for reflection notes (campaign layer). Semantic evidence checks (handles resolve to real sources,
 * minimum evidence per kind, forbidden inferences) happen before the command is built (turn/reflection.ts); this layer guarantees the
 * stored shape: unique IDs, per-kind caps, bounded text, revisions not in the future, and evidence handles OF THIS character only.
 */
export function validateReflectionNotes(characterId: string, notes: DeepReadonly<ReflectionNote[]>, revision: number): void {
  const ids = new Set<string>();
  for (const n of notes) {
    if (ids.has(n.id)) fail("premium_reflections.notes", "duplicate note id"); ids.add(n.id);
    if (n.text.length > (n.structured?400:REFLECTION_LIMITS.text) || n.label.length > REFLECTION_LIMITS.label || !n.evidence_refs.length || n.evidence_refs.length > REFLECTION_LIMITS.evidence_refs) fail("premium_reflections.notes", "unbounded note");
    if(n.structured&&(n.structured.source_revision>=n.updated_revision||n.structured.proposal.subject_character_id!==characterId||n.structured.proposal.confidence!==n.confidence||JSON.stringify(n.structured.proposal.evidence_refs)!==JSON.stringify(n.evidence_refs)))fail('premium_reflections.structured','inconsistent provenance');
    if (n.created_revision > n.updated_revision || n.updated_revision > revision) fail("premium_reflections.notes", "invalid revisions");
    for (const ref of n.evidence_refs) if (!ref.startsWith(`npcmem:${characterId}:`) && !new RegExp(`^npcrel:(?:${characterId}:[a-z0-9_]+|[a-z0-9_]+:${characterId})$`).test(ref)) fail("premium_reflections.evidence_refs", "evidence of another character");
  }
  for (const kind of ["stance", "signature_pattern", "shared_motif", "emerging_role", "unresolved_tension"] as const)
    if (notes.filter(n => n.kind === kind).length > REFLECTION_LIMITS[kind]) fail("premium_reflections.notes", `too many ${kind} notes`);
}
export function preparePremiumCommand(context: PreparationContext, command: CampaignCommand): boolean {
  if (command.kind === "record_reflection") {
    const { draft } = context;
    if (!draft.premium_characters.some(p => p.character_id === command.character_id && p.metadata.active_household_member)) fail("character_id", "only an active NPC+ can be reflected on");
    if (command.reflected_revision > draft.revision) fail("reflected_revision", "reflection cannot postdate its evidence");
    validateReflectionNotes(command.character_id, command.notes, draft.revision + 1);
    const existing = draft.premium_reflections.find(r => r.character_id === command.character_id);
    if (existing) { existing.notes = structuredClone(command.notes); existing.last_reflected_revision = command.reflected_revision; }
    else draft.premium_reflections.push({ character_id: command.character_id, notes: structuredClone(command.notes), last_reflected_revision: command.reflected_revision });
    return true;
  }
  if (command.kind !== "establish_character_contract") return false;
  const { draft } = context;
  const p = draft.premium_characters.find(x => x.character_id === command.character_id && x.metadata.active_household_member);
  if (!p) fail("character_id", "only an active NPC+ can have a campaign contract");
  const text = command.text.trim(), quote = command.quote.trim();
  if (text.length > 160 || quote.length > 240) fail("text", "contract text or quote too long");
  if (contractSet(p, command.field, text)) fail("field", "contract already established (contracts are never rewritten silently)");
  if (command.field === "moral_boundary") {
    if ((p.stable.moral_boundaries ?? []).length >= 24) fail("field", "too many moral boundaries");
    p.stable.moral_boundaries = [...(p.stable.moral_boundaries ?? []), text];
  } else p.stable[FIELD[command.field]] = text;
  p.stable.contract_evidence = [...(p.stable.contract_evidence ?? []), { field: command.field, revision: draft.revision + 1, quote }];
  return true;
}

// ------------------------------------------------------------------------------------------------ lifecycle + developments
type Draft = CampaignSnapshot;
const levelOf = (dims: DeepReadonly<Partial<Record<RelationshipDimension, RelationshipLevel>>> | undefined, d: RelationshipDimension): RelationshipLevel => dims?.[d] ?? "none";
const locationOf = (s: DeepReadonly<Draft>, id: string) => s.characters.find(c => c.id === id && c.origin.kind === "created")?.current.current_location ?? s.runtime.npc_locations.find(n => n.character_id === id)?.current_location;
/** Structured developments of one character between two states (fixed category order; ID order within a category). */
function developments(base: DeepReadonly<Draft>, draft: DeepReadonly<Draft>, id: string, stamp: { revision: number; world_minute: number }): PremiumHistoryEntry[] {
  const out: PremiumHistoryEntry[] = [];
  const edges = (s: DeepReadonly<Draft>) => new Map(s.relationships.filter(e => e.from_character_id === id || e.to_character_id === id).map(e => [`${e.from_character_id}>${e.to_character_id}`, e] as const));
  const before = edges(base), after = edges(draft);
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort(compareIds)) {
    const a = before.get(key), b = after.get(key), [actor_id, other_id] = key.split(">") as [string, string];
    for (const dimension of RELATIONSHIP_DIMENSIONS) {
      const from = levelOf(a?.dimensions, dimension), to = levelOf(b?.dimensions, dimension);
      if (from !== to) out.push({ kind: "relationship_changed", actor_id, other_id, dimension, from, to, ...stamp });
    }
  }
  const conditions = (s: DeepReadonly<Draft>) => new Set(s.characters.find(c => c.id === id)?.current.conditions ?? []);
  const c0 = conditions(base), c1 = conditions(draft);
  for (const condition of [...c1].filter(c => !c0.has(c)).sort()) out.push({ kind: "condition_added", condition, ...stamp });
  for (const condition of [...c0].filter(c => !c1.has(c)).sort()) out.push({ kind: "condition_removed", condition, ...stamp });
  const legal = (s: DeepReadonly<Draft>) => s.legal_statuses.find(l => l.character_id === id);
  const l0 = legal(base), l1 = legal(draft);
  if ((l0?.status ?? "unestablished") !== (l1?.status ?? "unestablished") || l0?.holder_id !== l1?.holder_id)
    out.push({ kind: "legal_status_changed", from: l0?.status ?? "unestablished", to: l1?.status ?? "unestablished", ...(l1?.holder_id ? { holder_id: l1.holder_id } : {}), ...stamp });
  const known = new Set(base.transactions.map(t => t.id));
  for (const t of draft.transactions.filter(x => x.subject_id === id && !known.has(x.id)).sort((x, y) => compareIds(x.id, y.id)))
    out.push({ kind: "person_transaction", transaction_id: t.id, transaction_kind: t.kind, ...stamp });
  for (const h of draft.households.filter(x => x.members.some(m => m.character_id === id && m.status === "member")).sort((x, y) => compareIds(x.id, y.id))) {
    const old = new Set(base.households.find(x => x.id === h.id)?.rules?.map(r => r.id) ?? []);
    for (const r of (h.rules ?? []).filter(r => !old.has(r.id))) out.push({ kind: "household_rule_added", household_id: h.id, rule_id: r.id, ...stamp });
  }
  // Registration is not movement: a character that did not exist before this revision has no "from".
  const existed = base.characters.some(c => c.id === id) || base.runtime.npc_locations.some(n => n.character_id === id);
  const from = locationOf(base, id), to = locationOf(draft, id);
  if (existed && from !== to) out.push({ kind: "moved", ...(from ? { from } : {}), ...(to ? { to } : {}), ...stamp });
  const p0 = base.premium_characters.find(p => p.character_id === id)?.stable.contract_evidence?.length ?? 0;
  for (const e of draft.premium_characters.find(p => p.character_id === id)?.stable.contract_evidence?.slice(p0) ?? []) out.push({ kind: "contract_established", field: e.field, ...stamp });
  return out;
}
// ------------------------------------------------------------------------------------------------ consolidation (NPC+ Pass 3)
const emptyRollup = (revision: number): PremiumRollup => ({ first_revision: revision, last_revision: revision, entries: 0, lifecycle: { joined: 0, left: 0, rejoined: 0, migrated: 0 },
  relationships: [], other_relationship_changes: 0, conditions: [], other_condition_changes: 0, legal_changes: 0, transactions: { sale: 0, gift: 0, assignment: 0, manumission: 0 }, moves: 0, rules_added: 0, contracts: 0 });
/** Fold one development that left the recent window into the roll-up (pure counting; caps evict the least recently changed row). */
export function foldDevelopment(rollup: PremiumRollup | undefined, e: DeepReadonly<PremiumHistoryEntry>): PremiumRollup {
  const r = rollup ? structuredClone(rollup) : emptyRollup(e.revision);
  r.first_revision = Math.min(r.first_revision, e.revision); r.last_revision = Math.max(r.last_revision, e.revision); r.entries++;
  switch (e.kind) {
    case "joined_household": r.lifecycle.joined++; break;
    case "left_household": r.lifecycle.left++; break;
    case "rejoined_household": r.lifecycle.rejoined++; break;
    case "migrated_member": r.lifecycle.migrated++; break;
    case "relationship_changed": {
      let row = r.relationships.find(x => x.actor_id === e.actor_id && x.other_id === e.other_id && x.dimension === e.dimension);
      if (!row) { row = { actor_id: e.actor_id, other_id: e.other_id, dimension: e.dimension, raises: 0, lowers: 0, first_revision: e.revision, last_revision: e.revision }; r.relationships.push(row); }
      if (RELATIONSHIP_LEVELS.indexOf(e.to) > RELATIONSHIP_LEVELS.indexOf(e.from)) row.raises++; else row.lowers++;
      row.last_revision = Math.max(row.last_revision, e.revision);
      r.relationships.sort((a, b) => compareIds(a.actor_id, b.actor_id) || compareIds(a.other_id, b.other_id) || compareIds(a.dimension, b.dimension));
      while (r.relationships.length > PREMIUM_ROLLUP_LIMITS.relationships) {
        const evict = [...r.relationships].sort((a, b) => a.last_revision - b.last_revision || compareIds(`${a.actor_id}>${a.other_id}:${a.dimension}`, `${b.actor_id}>${b.other_id}:${b.dimension}`))[0]!;
        r.other_relationship_changes += evict.raises + evict.lowers; r.relationships = r.relationships.filter(x => x !== evict);
      }
      break;
    }
    case "condition_added": case "condition_removed": {
      let row = r.conditions.find(x => x.condition === e.condition);
      if (!row) { row = { condition: e.condition, added: 0, removed: 0, last_revision: e.revision }; r.conditions.push(row); }
      if (e.kind === "condition_added") row.added++; else row.removed++;
      row.last_revision = Math.max(row.last_revision, e.revision);
      r.conditions.sort((a, b) => compareIds(a.condition, b.condition));
      while (r.conditions.length > PREMIUM_ROLLUP_LIMITS.conditions) {
        const evict = [...r.conditions].sort((a, b) => a.last_revision - b.last_revision || compareIds(a.condition, b.condition))[0]!;
        r.other_condition_changes += evict.added + evict.removed; r.conditions = r.conditions.filter(x => x !== evict);
      }
      break;
    }
    case "legal_status_changed": r.legal_changes++; break;
    case "person_transaction": r.transactions[e.transaction_kind]++; break;
    case "moved": r.moves++; break;
    case "household_rule_added": r.rules_added++; break;
    case "contract_established": r.contracts++; break;
  }
  return r;
}

/** Reconcile premium state with membership and append committed developments (mutates the draft; deterministic; no-op when unchanged). */
export function syncPremiumCharacters(draft: Draft, base: DeepReadonly<Draft>, world: WorldStore): void {
  const members = niccoHouseholdMembers(draft), before = niccoHouseholdMembers(base);
  const stamp = { revision: draft.revision + 1, world_minute: draft.runtime.scene.world_time.world_minute };
  const lifecycle = new Map<string, PremiumHistoryEntry>();
  for (const [id, household] of [...members].sort(([a], [b]) => compareIds(a, b))) {
    const existing = draft.premium_characters.find(p => p.character_id === id);
    if (!existing) {
      draft.premium_characters.push({ character_id: id, stable: {}, dynamic: { recent_developments: [] },
        metadata: { created_revision: stamp.revision, last_updated_revision: stamp.revision, active_household_member: true } });
      assignInitialMannerism(draft, world, draft.premium_characters.at(-1)!);
      lifecycle.set(id, { kind: "joined_household", household_id: household, ...stamp });
    } else if (!existing.metadata.active_household_member) {
      existing.metadata.active_household_member = true;
      lifecycle.set(id, { kind: "rejoined_household", household_id: household, ...stamp });
    }
  }
  for (const p of draft.premium_characters) {
    if (!p.metadata.active_household_member || members.has(p.character_id)) continue;
    p.metadata.active_household_member = false;
    const household = before.get(p.character_id) ?? niccoHouseholds(base)[0] ?? niccoHouseholds(draft)[0] ?? draft.households[0]!.id;
    lifecycle.set(p.character_id, { kind: "left_household", household_id: household, ...stamp });
  }
  for (const p of draft.premium_characters) {
    const changes = [...(lifecycle.has(p.character_id) ? [lifecycle.get(p.character_id)!] : []), ...developments(base, draft, p.character_id, stamp)];
    if (!changes.length) continue;
    // NPC+ Pass 3: entries leaving the recent window are folded into the bounded roll-up in the same revision (never lost silently).
    const merged = [...p.dynamic.recent_developments, ...changes], overflow = Math.max(0, merged.length - PREMIUM_DEVELOPMENT_RETENTION);
    for (const e of merged.slice(0, overflow)) p.dynamic.long_term = foldDevelopment(p.dynamic.long_term, e);
    p.dynamic.recent_developments = merged.slice(overflow);
    p.metadata.last_updated_revision = stamp.revision;
  }
  draft.premium_characters.sort((a, b) => compareIds(a.character_id, b.character_id));
}
