import type { CampaignCharacter, CampaignSnapshot, CharacterRetirement, HouseholdMembership } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { isRetiredCharacter } from "./character-lifecycle.js";

/**
 * Block 5B: deterministic, human-authorized identity repair (Class C). Two operations on PERSISTENT characters:
 *   retire  one durable identity that should no longer be active (never deletion; the id stays referenceable);
 *   merge   SOURCE (the duplicate) is absorbed into TARGET (the identity to preserve); SOURCE is retired with `merged_into`.
 *
 * Both are all-or-nothing: `retireConflicts`/`mergeConflicts` list every hard conflict; a non-empty list means the operation REFUSES (fail closed, no
 * best guess, nothing is rewritten). The preflight (used before a confirmation is created) and the commit-time preparation use the SAME analysis, so
 * what the human is shown is what is checked again at Confirm. Scanner confidence is never an input here.
 */
export interface RepairConflict { readonly code: string; readonly detail: string }
export interface MergePlanSummary { readonly rewrites: Readonly<Record<string, number>>; readonly dropped_duplicates: Readonly<Record<string, number>>; readonly notes: readonly string[] }
export interface MergeAnalysis { readonly conflicts: readonly RepairConflict[]; readonly summary: MergePlanSummary }
type Snap = DeepReadonly<CampaignSnapshot>;
const PLAYER_ID = "nicco";
const lc = (s: string | undefined) => s?.trim().toLowerCase();
const nameOf = (c: DeepReadonly<CampaignCharacter> | undefined) => c?.profile.name;

/** Shared target/source eligibility. */
function eligibility(snapshot: Snap, id: string, role: "source" | "target" | "subject"): RepairConflict[] {
  const out: RepairConflict[] = [];
  if (id === PLAYER_ID || snapshot.player_characters.some(p => p.character_id === id)) return [{ code: "player_character", detail: `${role} is the player character` }];
  const c = snapshot.characters.find(x => x.id === id);
  if (!c) return role === "target" ? [] : [{ code: "unknown_character", detail: `${role} has no campaign record` }];
  if (isRetiredCharacter(c)) out.push({ code: "already_retired", detail: `${role} is already retired` });
  if (role !== "target" && c.origin.kind !== "created") out.push({ code: "canonical_identity", detail: `${role} is an authored canonical identity and cannot be retired` });
  if (c.current.status === "dead") out.push({ code: "dead", detail: `${role} is dead` });
  return out;
}
const activeMember = (m: DeepReadonly<HouseholdMembership>) => m.status === "member" || m.status === "guest";
const usesItems = (snapshot: Snap, id: string) => snapshot.items.filter(i => i.owner_id === id || ((i.position.kind === "carried" || i.position.kind === "equipped") && i.position.character_id === id));

export function retireConflicts(snapshot: Snap, id: string): RepairConflict[] {
  const out = eligibility(snapshot, id, "subject");
  if (out.length) return out;
  if (snapshot.premium_characters.some(p => p.character_id === id)) out.push({ code: "npc_plus", detail: "an NPC+ cannot be retired; resolve its NPC+ state first" });
  if (snapshot.households.some(h => h.members.some(m => m.character_id === id && activeMember(m)))) out.push({ code: "household_member", detail: "the character belongs to a household" });
  const legal = snapshot.legal_statuses.find(l => l.character_id === id);
  if (legal?.status === "enslaved") out.push({ code: "legal_status", detail: "the character is legally held" });
  if (snapshot.legal_statuses.some(l => l.holder_id === id)) out.push({ code: "legal_holder", detail: "the character legally holds someone" });
  if (usesItems(snapshot, id).length) out.push({ code: "owns_items", detail: "the character owns or carries items" });
  if ((snapshot.funds.find(f => f.character_id === id)?.gold ?? 0) > 0) out.push({ code: "funds", detail: "the character holds funds" });
  if ((snapshot.trade_offers ?? []).some(o => o.status === "active" && referencesTradeOffer(o, id))) out.push({ code: "active_trade_offer", detail: "an active trade offer involves the character" });
  return out;
}
function referencesTradeOffer(o: DeepReadonly<NonNullable<CampaignSnapshot["trade_offers"]>[number]>, id: string): boolean {
  return (o.counterparty.kind === "character" && o.counterparty.character_id === id) || (o.subject.kind === "person" && o.subject.subject_character_id === id);
}

export function mergeConflicts(snapshot: Snap, source_id: string, target_id: string): MergeAnalysis {
  const conflicts: RepairConflict[] = [], rewrites: Record<string, number> = {}, dropped: Record<string, number> = {}, notes: string[] = [];
  const add = (code: string, detail: string) => conflicts.push({ code, detail });
  const count = (r: Record<string, number>, key: string, n = 1) => { r[key] = (r[key] ?? 0) + n; };
  if (source_id === target_id) { add("same_identity", "source and target are the same identity"); return { conflicts, summary: { rewrites, dropped_duplicates: dropped, notes } }; }
  conflicts.push(...eligibility(snapshot, source_id, "source"), ...eligibility(snapshot, target_id, "target"));
  if (conflicts.length) return { conflicts, summary: { rewrites, dropped_duplicates: dropped, notes } };
  const S = snapshot.characters.find(c => c.id === source_id)!, T = snapshot.characters.find(c => c.id === target_id);
  if (!T && !/^[a-z0-9_]+$/.test(target_id)) add("unknown_character", "target is not a known identity");
  // Names, descriptive facts that are authoritative identity.
  if (lc(nameOf(S)) && lc(nameOf(T)) && lc(nameOf(S)) !== lc(nameOf(T))) add("names_differ", "the two records carry different established names");
  for (const f of ["sex", "species"] as const) { const a = S.profile[f], b = T?.profile[f]; if (a !== undefined && b !== undefined && lc(String(a)) !== lc(String(b))) add(`${f}_differs`, `the records disagree on ${f}`); }
  const ageA = S.profile.age, ageB = T?.profile.age;
  if (ageA && ageB && JSON.stringify(ageA) !== JSON.stringify(ageB)) add("age_differs", "the records disagree on age");
  if (T && T.profile.appearance?.description && S.profile.appearance?.description && T.profile.appearance.description !== S.profile.appearance.description) notes.push("appearance text differs: the target's is kept, the source's stays on the retired record");
  // Location: two different places cannot both hold the same person.
  const locS = S.current.current_location, locT = T?.current.current_location ?? snapshot.runtime.npc_locations.find(n => n.character_id === target_id)?.current_location;
  if (locS !== undefined && locT !== undefined && locS !== locT) add("location_differs", "the records stand in different places");
  // NPC+ / household / legal / money.
  if (snapshot.premium_characters.some(p => p.character_id === source_id)) add("npc_plus", "the source is an NPC+");
  const hs = snapshot.households.flatMap(h => h.members.filter(m => m.character_id === source_id).map(m => ({ h, m })));
  for (const { h, m } of hs) {
    const other = h.members.find(x => x.character_id === target_id);
    if (other) { if (other.status !== m.status) add("household_conflict", "the two records have different standing in the same household"); else count(dropped, "household_memberships"); }
    else {
      if (activeMember(m) && snapshot.households.some(g => g.id !== h.id && g.members.some(x => x.character_id === target_id && activeMember(x)))) add("household_conflict", "the records belong to different households");
      else count(rewrites, "household_memberships");
    }
  }
  const lS = snapshot.legal_statuses.find(l => l.character_id === source_id), lT = snapshot.legal_statuses.find(l => l.character_id === target_id);
  if (lS && lT) { if (lS.status !== lT.status || lS.holder_id !== lT.holder_id) add("legal_conflict", "the records have different legal status or holder"); else count(dropped, "legal_statuses"); }
  else if (lS) count(rewrites, "legal_statuses");
  count(rewrites, "legal_holder_links", snapshot.legal_statuses.filter(l => l.holder_id === source_id).length);
  const fS = snapshot.funds.find(f => f.character_id === source_id), fT = snapshot.funds.find(f => f.character_id === target_id);
  if (fS && fT) { if (fS.gold > 0) add("funds_conflict", "both records hold tracked funds"); else count(dropped, "funds"); } else if (fS) count(rewrites, "funds");
  // Items: ownership and equipment. A slot both would occupy is a conflict.
  const itemsS = usesItems(snapshot, source_id);
  for (const i of itemsS) {
    const pos = i.position;
    if (pos.kind === "equipped" && snapshot.items.some(o => o !== i && o.position.kind === "equipped" && o.position.character_id === target_id && o.position.slot === pos.slot)) add("equipment_slot_conflict", "both records occupy the same equipment slot");
  }
  count(rewrites, "items", itemsS.length + snapshot.items.filter(i => i.acquisition?.from_character_id === source_id && !itemsS.includes(i)).length);
  // Relationships and knowledge: rewrite, dropping only exact duplicates.
  const relKey = (r: { from_character_id: string; to_character_id: string }, a: string, b: string) => `${r.from_character_id === source_id ? a : r.from_character_id}>${r.to_character_id === source_id ? b : r.to_character_id}`;
  for (const r of snapshot.relationships.filter(x => x.from_character_id === source_id || x.to_character_id === source_id)) {
    const from = r.from_character_id === source_id ? target_id : r.from_character_id, to = r.to_character_id === source_id ? target_id : r.to_character_id;
    if (from === to) { count(dropped, "self_relationships"); continue; }
    const twin = snapshot.relationships.find(x => x !== r && relKey(x, source_id, target_id) === `${from}>${to}` && x.from_character_id !== source_id && x.to_character_id !== source_id);
    if (twin) { if (JSON.stringify({ t: twin.trust, d: twin.dimensions }) !== JSON.stringify({ t: r.trust, d: r.dimensions })) add("relationship_conflict", "both records have a different relationship with the same person"); else count(dropped, "relationships"); }
    else count(rewrites, "relationships");
  }
  for (const k of snapshot.knowledge.filter(x => x.character_id === source_id)) {
    const twin = snapshot.knowledge.find(x => x.character_id === target_id && x.fact_id === k.fact_id);
    if (twin) { if (twin.status !== k.status) add("knowledge_conflict", "both records hold the same fact with a different status"); else count(dropped, "knowledge"); } else count(rewrites, "knowledge");
  }
  count(rewrites, "knowledge_sources", snapshot.knowledge.filter(x => x.provenance?.source_character_id === source_id).length);
  count(rewrites, "goals", snapshot.goals.filter(g => g.character_id === source_id || (g.target?.kind === "character" && g.target.id === source_id)).length);
  count(rewrites, "scheduled_event_participants", snapshot.scheduled_events.filter(e => e.participants?.includes(source_id)).length);
  const pS = (snapshot.price_indices ?? []).find(p => p.character_id === source_id), pT = (snapshot.price_indices ?? []).find(p => p.character_id === target_id);
  if (pS && pT) { count(dropped, "price_indices"); notes.push("the target's price tendency is kept"); } else if (pS) count(rewrites, "price_indices");
  // Active commercial and learning links cannot be silently re-pointed.
  if ((snapshot.trade_offers ?? []).some(o => o.status === "active" && (referencesTradeOffer(o, source_id) || referencesTradeOffer(o, target_id)))) add("active_trade_offer", "an active trade offer involves one of the records");
  const learning = snapshot.mannerism_learning;
  if (learning && (learning.candidates.some(c => c.character_id === source_id) || learning.journal.some(j => j.character_ids.includes(source_id) || j.available_items.some(a => a.character_id === source_id)))) add("mannerism_learning", "mannerism learning evidence references the source");
  // Historical, immutable references stay on the retired source id (it remains referenceable and names its survivor).
  count(rewrites, "history_kept_on_source", snapshot.transactions.filter(t => t.subject_id === source_id || t.from_holder_id === source_id || t.to_holder_id === source_id || t.payer_id === source_id || t.payee_id === source_id).length);
  return { conflicts, summary: { rewrites, dropped_duplicates: dropped, notes } };
}

/** Retirement applied to a draft: inactive, nowhere, marker set. Caller has verified the preconditions. */
export function applyRetirement(draft: CampaignSnapshot, id: string, retirement: CharacterRetirement): void {
  const c = draft.characters.find(x => x.id === id)!;
  c.current = { ...c.current, status: "inactive" }; delete c.current.current_location; delete c.current.presentation; c.retirement = retirement;
}
/** Merge applied to a draft. Caller has verified `mergeConflicts(...).conflicts` is empty on this same draft. */
export function applyMerge(draft: CampaignSnapshot, source_id: string, target_id: string, stamp: { revision: number; world_minute: number }): void {
  const swap = (id: string) => id === source_id ? target_id : id;
  const S = draft.characters.find(c => c.id === source_id)!;
  let T = draft.characters.find(c => c.id === target_id);
  // Profile: the target keeps every field it has; absent identity fields are filled from the source (a name is only learned when the target has none).
  if (T) {
    const p = T.profile, q = S.profile;
    if (!p.name && q.name) { p.name = q.name; if (q.name_source) p.name_source = q.name_source; }
    if (!p.sex && q.sex) p.sex = q.sex; if (!p.species && q.species) p.species = q.species; if (!p.age && q.age) p.age = structuredClone(q.age);
    if (!p.appearance && q.appearance) p.appearance = structuredClone(q.appearance);
  }
  T = T ?? undefined;
  for (const i of draft.items) {
    if (i.owner_id === source_id) i.owner_id = target_id;
    if ((i.position.kind === "carried" || i.position.kind === "equipped") && i.position.character_id === source_id) i.position.character_id = target_id;
    if (i.acquisition?.from_character_id === source_id) i.acquisition.from_character_id = target_id;
  }
  for (const h of draft.households) {
    const mine = h.members.find(m => m.character_id === source_id); if (!mine) continue;
    if (h.members.some(m => m.character_id === target_id)) h.members = h.members.filter(m => m !== mine); else mine.character_id = target_id;
  }
  const lT = draft.legal_statuses.find(l => l.character_id === target_id);
  draft.legal_statuses = draft.legal_statuses.flatMap(l => l.character_id === source_id ? (lT ? [] : [{ ...l, character_id: target_id }]) : [{ ...l, ...(l.holder_id === source_id ? { holder_id: target_id } : {}) }]);
  const fT = draft.funds.find(f => f.character_id === target_id);
  draft.funds = draft.funds.flatMap(f => f.character_id === source_id ? (fT ? [] : [{ ...f, character_id: target_id }]) : [f]);
  if (draft.price_indices) { const pT = draft.price_indices.find(p => p.character_id === target_id); draft.price_indices = draft.price_indices.flatMap(p => p.character_id === source_id ? (pT ? [] : [{ ...p, character_id: target_id }]) : [p]); }
  const seen = new Set<string>();
  draft.relationships = draft.relationships.flatMap(r => {
    const x = { ...r, from_character_id: swap(r.from_character_id), to_character_id: swap(r.to_character_id) };
    if (x.from_character_id === x.to_character_id) return [];
    const key = `${x.from_character_id}>${x.to_character_id}`; if (seen.has(key)) return []; seen.add(key); return [x];
  });
  const known = new Set<string>();
  draft.knowledge = draft.knowledge.flatMap(k => {
    const x = { ...k, character_id: swap(k.character_id), ...(k.provenance ? { provenance: { ...k.provenance, ...(k.provenance.source_character_id === source_id ? { source_character_id: target_id } : {}) } } : {}) };
    const key = `${x.character_id}|${x.fact_id}`; if (known.has(key)) return []; known.add(key); return [x];
  });
  for (const g of draft.goals) { g.character_id = swap(g.character_id); if (g.target?.kind === "character" && g.target.id === source_id) g.target = { kind: "character", id: target_id }; }
  for (const e of draft.scheduled_events) if (e.participants) e.participants = [...new Set(e.participants.map(swap))];
  applyRetirement(draft, source_id, { ...stamp, reason: "duplicate_merged", merged_into: target_id });
}
