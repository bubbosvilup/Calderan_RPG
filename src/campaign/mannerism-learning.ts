import type { CampaignSnapshot, MannerismCandidate, MannerismDefinition, MannerismFinalizedSource } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { dataSchema, fail, validateId } from "./validation.js";
import { MANNERISM_ACTIONS, MANNERISM_TRIGGERS, MANNERISM_LEARNING_POLICY as P, equivalentMannerismConcepts, mannerismConceptOf, mannerismConceptText, requiredMannerismEvidence, type MannerismConcept } from "./mannerism-concepts.js";
import { mannerismAvailable, validateMannerismDefinition } from "./mannerisms.js";
import { MANNERISM_SEEDS } from "./mannerism-seeds.js";
import { compareIds } from "../world/provenance.js";

export interface ValidatedMannerismObservation extends MannerismConcept {
  character_id: string; sequence: number; span_start: number; span_end: number;
  requires_item_id?: string; requires_entity_id?: string; equivalent_owned_ids: string[];
}
export interface MannerismMetrics {
  observations_considered: number; observations_rejected_personality: number; observations_rejected_prerequisite: number;
  observations_rejected_existing_mannerism: number; observations_rejected_global_duplicate: number; observations_rejected_evidence: number;
  candidates_created: number; candidates_reinforced: number; candidates_expired: number; mannerisms_promoted: number;
}
export const emptyMannerismMetrics = (): MannerismMetrics => ({ observations_considered: 0, observations_rejected_personality: 0, observations_rejected_prerequisite: 0,
  observations_rejected_existing_mannerism: 0, observations_rejected_global_duplicate: 0, observations_rejected_evidence: 0, candidates_created: 0, candidates_reinforced: 0, candidates_expired: 0, mannerisms_promoted: 0 });
const { object, text, integer, choice, list, optional } = dataSchema;
const boolean = (v: unknown, field: string) => { if (typeof v !== "boolean") fail(field, "expected boolean"); return v; };
const ids = list(validateId, 128);
const sourceInput = object({ turn_id: text, narration_hash: text, narration_length: integer(1, 20000), character_ids: list(validateId, 64),
  available_items: list(object({ character_id: validateId, item_id: validateId, worn: boolean }), 256) });
const observationInput = object({ character_id: validateId, sequence: integer(1), action: choice(...MANNERISM_ACTIONS), trigger: choice(...MANNERISM_TRIGGERS), span_start: integer(0), span_end: integer(1),
  requires_item_id: optional(validateId), requires_entity_id: optional(validateId), equivalent_owned_ids: ids });
type Operation = { kind: "finalized"; expected_revision: number; source: { turn_id: string; narration_hash: string; narration_length: number; character_ids: string[]; available_items: MannerismFinalizedSource["available_items"] } }
  | { kind: "observations"; expected_revision: number; through_sequence: number; observations: ValidatedMannerismObservation[] };
export function parseMannerismLearningOperation(input: unknown): Operation {
  const tag = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "kind") : undefined;
  if (!tag || !("value" in tag)) fail("mannerism_learning", "missing operation");
  if (tag.value === "finalized") return object({ kind: choice("finalized"), expected_revision: integer(0), source: sourceInput })(input, "mannerism_learning") as Operation;
  return object({ kind: choice("observations"), expected_revision: integer(0), through_sequence: integer(1), observations: list(observationInput, P.observations_per_batch) })(input, "mannerism_learning") as Operation;
}
function hashKey(s: string): string { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h.toString(16); }
export function observationDefinition(o: MannerismConcept & { requires_item_id?: string; requires_entity_id?: string }, s: DeepReadonly<CampaignSnapshot>): MannerismDefinition {
  const item = o.requires_item_id ? s.items.find(i => i.id === o.requires_item_id) : undefined;
  const text = mannerismConceptText(o, item?.name ?? item?.id);
  const seed = MANNERISM_SEEDS.find(d => d.text.toLowerCase() === text.toLowerCase());
  const canonical_key = seed?.canonical_key ?? `emergent_${o.action}_${o.trigger}${o.requires_item_id || o.requires_entity_id ? `_p${hashKey(`${o.requires_item_id ?? ""}:${o.requires_entity_id ?? ""}`)}` : ""}`;
  return { canonical_key, text, ...(o.requires_item_id ? { requires_item_id: o.requires_item_id } : {}), ...(o.requires_entity_id ? { requires_entity_id: o.requires_entity_id } : {}) };
}
function isEquivalent(a: MannerismConcept, definition: DeepReadonly<MannerismDefinition>): boolean {
  const b = mannerismConceptOf(definition); return !!b && equivalentMannerismConcepts(a, b);
}
export function applyMannerismLearning(s: CampaignSnapshot, world: WorldStore, operation: Operation): MannerismMetrics {
  const metrics = emptyMannerismMetrics();
  if (operation.expected_revision !== s.revision) fail("expected_revision", "stale mannerism maintenance");
  if (operation.kind === "finalized") {
    if (s.mannerism_learning?.last_turn_id === operation.source.turn_id) return metrics;
    if (!/^[a-f0-9]{64}$/.test(operation.source.narration_hash)) fail("mannerism.source", "invalid narration fingerprint");
    const learning = s.mannerism_learning ?? { sequence: 0, processed_sequence: 0, last_turn_id: "", journal: [], candidates: [] };
    const sequence = learning.sequence + 1; if (!Number.isSafeInteger(sequence)) fail("mannerism.sequence", "overflow");
    for (const id of operation.source.character_ids) if (!s.premium_characters.some(p => p.character_id === id && p.metadata.active_household_member)) fail("mannerism.character_id", "source must name active NPC+");
    for (const a of operation.source.available_items) {
      const item = s.items.find(i => i.id === a.item_id);
      if (!item || item.owner_id !== a.character_id || !(item.position.kind === "carried" || item.position.kind === "equipped") || item.position.character_id !== a.character_id || a.worn !== (item.position.kind === "equipped" && item.position.mode === "worn")) fail("mannerism.source", "invalid witnessed item access");
    }
    const { turn_id, ...source } = operation.source;
    learning.sequence = sequence; learning.last_turn_id = turn_id;
    learning.journal = [...learning.journal, { ...source, sequence, revision: s.revision, event_id: `${s.campaign_id}:mannerism:${sequence}` }].slice(-P.journal_turns);
    s.mannerism_learning = learning; return metrics;
  }
  const l = s.mannerism_learning;
  if (!l || operation.through_sequence <= l.processed_sequence || operation.through_sequence > l.sequence) fail("mannerism.sequence", "already processed or future source");
  const expired = l.candidates.filter(c => l.sequence - c.last_observed_sequence > P.expiry_turns);
  metrics.candidates_expired = expired.length; l.candidates = l.candidates.filter(c => !expired.includes(c));
  const sources = new Map(l.journal.map(x => [x.sequence, x]));
  const owned = s.premium_characters.flatMap(p => (p.mannerisms ?? []).map(m => ({ character_id: p.character_id, m })));
  l.candidates = l.candidates.filter(c => !owned.some(x => x.m.canonical_key === c.canonical_key || isEquivalent(c, x.m)));
  const reviewed = new Set<string>();
  for (const [ordinal, o] of operation.observations.entries()) {
    metrics.observations_considered++;
    const source = sources.get(o.sequence), p = s.premium_characters.find(p => p.character_id === o.character_id && p.metadata.active_household_member);
    if (!source || !p || !source.character_ids.includes(o.character_id) || o.sequence <= l.processed_sequence || o.sequence > operation.through_sequence || o.span_end <= o.span_start || o.span_end > source.narration_length) { metrics.observations_rejected_evidence++; continue; }
    if ((p.mannerisms ?? []).length >= 4) continue;
    let d: MannerismDefinition;
    try { d = observationDefinition(o, s); validateMannerismDefinition(d); } catch { metrics.observations_rejected_personality++; continue; }
    if ((o.action === "object_grip" || o.action === "clothing_smooth") && !o.requires_item_id || !mannerismAvailable(d, p.character_id, s, world)
      || o.requires_item_id && !source.available_items.some(a => a.item_id === o.requires_item_id && a.character_id === o.character_id && (o.action !== "clothing_smooth" || a.worn))) { metrics.observations_rejected_prerequisite++; continue; }
    const equivalents = owned.filter(x => x.m.canonical_key === d.canonical_key || isEquivalent(o, x.m) || o.equivalent_owned_ids.includes(x.m.id));
    if (equivalents.length) {
      if (equivalents.some(x => x.character_id === p.character_id)) metrics.observations_rejected_existing_mannerism++; else metrics.observations_rejected_global_duplicate++;
      l.candidates = l.candidates.filter(c => c.character_id !== p.character_id || !equivalentMannerismConcepts(o, c)); continue;
    }
    let candidate = l.candidates.find(c => c.character_id === p.character_id && c.requires_item_id === o.requires_item_id && c.requires_entity_id === o.requires_entity_id && c.action === o.action && c.trigger === o.trigger);
    const evidence = { sequence: source.sequence, revision: source.revision, event_id: source.event_id, narration_hash: source.narration_hash, span_start: o.span_start, span_end: o.span_end };
    if (candidate) {
      if (candidate.evidence.some(e => e.sequence === source.sequence)) continue;
      candidate.evidence = [...candidate.evidence, evidence].slice(-P.evidence_per_candidate); candidate.last_observed_sequence = source.sequence; metrics.candidates_reinforced++;
    } else {
      candidate = { ...d, id: `candidate_s${source.sequence}_o${ordinal}`, character_id: p.character_id, action: o.action, trigger: o.trigger, evidence: [evidence], first_observed_sequence: source.sequence, last_observed_sequence: source.sequence };
      l.candidates.push(candidate); metrics.candidates_created++;
    }
    const ranked = l.candidates.filter(c => c.character_id === p.character_id).sort((a, b) => b.evidence.length - a.evidence.length || b.last_observed_sequence - a.last_observed_sequence || compareIds(a.id, b.id));
    reviewed.add(candidate.id);
    const retained = new Set(ranked.slice(0, P.candidates_per_npc)); l.candidates = l.candidates.filter(c => c.character_id !== p.character_id || retained.has(c));
  }
  for (const c of [...l.candidates].sort((a, b) => b.evidence.length - a.evidence.length || compareIds(a.id, b.id))) {
    const p = s.premium_characters.find(p => p.character_id === c.character_id && p.metadata.active_household_member);
    if (!reviewed.has(c.id) || !p || (p.mannerisms ?? []).length >= 4 || c.evidence.length < requiredMannerismEvidence((p.mannerisms ?? []).length) || !mannerismAvailable(c, p.character_id, s, world)) continue;
    const conflict = s.premium_characters.flatMap(q => (q.mannerisms ?? []).map(m => ({ q, m }))).find(x => x.m.canonical_key === c.canonical_key || isEquivalent(c, x.m));
    if (conflict) { l.candidates = l.candidates.filter(x => x !== c); metrics.observations_rejected_global_duplicate++; continue; }
    const { id: _id, character_id: _char, action: _a, trigger: _t, evidence: _e, first_observed_sequence: _f, last_observed_sequence: _last, ...definition } = c;
    const ordinal = s.premium_characters.reduce((n, p) => n + (p.mannerisms ?? []).length, 0);
    p.mannerisms = [...(p.mannerisms ?? []), { ...definition, id: `mannerism_r${s.revision + 1}_n${ordinal}`, source: "emergent", created_revision: s.revision + 1, user_edited: false }];
    p.metadata.last_updated_revision = s.revision + 1; l.candidates = l.candidates.filter(x => x !== c); metrics.mannerisms_promoted++;
  }
  l.processed_sequence = operation.through_sequence;
  l.candidates.sort((a, b) => compareIds(a.character_id, b.character_id) || compareIds(a.id, b.id)); return metrics;
}
export function validateMannerismLearning(s: CampaignSnapshot): void {
  const l = s.mannerism_learning; if (!l) return;
  if (l.processed_sequence > l.sequence) fail("mannerism_learning", "future cursor");
  const ids = new Set<string>(), concepts = new Set<string>(), counts = new Map<string, number>(); let last = 0;
  for (const e of l.journal) {
    if (e.sequence <= last || e.sequence > l.sequence || e.revision > s.revision || e.event_id !== `${s.campaign_id}:mannerism:${e.sequence}` || !/^[a-f0-9]{64}$/.test(e.narration_hash)) fail("mannerism_learning.journal", "invalid finalized provenance");
    last = e.sequence;
    if (new Set(e.character_ids).size !== e.character_ids.length || e.character_ids.some(id => !s.premium_characters.some(p => p.character_id === id))) fail("mannerism_learning.journal", "unknown or duplicate NPC+");
  }
  for (const c of l.candidates) {
    validateMannerismDefinition(c);
    const definition = observationDefinition(c, s), concept = `${c.character_id}:${c.action}:${c.trigger}:${c.requires_item_id ?? ""}:${c.requires_entity_id ?? ""}`;
    if (definition.canonical_key !== c.canonical_key || definition.text !== c.text || concepts.has(concept)) fail("mannerism_learning.candidate", "inconsistent or duplicate concept");
    concepts.add(concept);
    if (ids.has(c.id) || !s.premium_characters.some(p => p.character_id === c.character_id) || !c.evidence.length || c.first_observed_sequence > c.last_observed_sequence || c.last_observed_sequence > l.processed_sequence) fail("mannerism_learning.candidate", "invalid candidate");
    ids.add(c.id); counts.set(c.character_id, (counts.get(c.character_id) ?? 0) + 1);
    if (counts.get(c.character_id)! > P.candidates_per_npc) fail("mannerism_learning.candidate", "too many candidates");
    const sequences = new Set<number>(); let previous = 0;
    for (const e of c.evidence) {
      if (e.sequence <= previous || sequences.has(e.sequence) || e.sequence < c.first_observed_sequence || e.sequence > c.last_observed_sequence || e.revision > s.revision || e.event_id !== `${s.campaign_id}:mannerism:${e.sequence}` || e.span_end <= e.span_start || e.span_end > 20000 || !/^[a-f0-9]{64}$/.test(e.narration_hash)) fail("mannerism_learning.evidence", "invalid independent provenance");
      sequences.add(e.sequence); previous = e.sequence;
      const source = l.journal.find(j => j.sequence === e.sequence);
      if (source && (source.narration_hash !== e.narration_hash || source.revision !== e.revision || e.span_end > source.narration_length || !source.character_ids.includes(c.character_id))) fail("mannerism_learning.evidence", "source mismatch");
    }
    if (previous !== c.last_observed_sequence) fail("mannerism_learning.evidence", "inconsistent last moment");
  }
}
