import { createHash } from "node:crypto";
import { characterView } from "../campaign/projections.js";
import { isIdentityNameFact } from "../campaign/identity-knowledge.js";
import { mannerismAvailable, mannerismEpistemicState } from "../campaign/mannerisms.js";
import type { CampaignSnapshot, CharacterKnowledge } from "../campaign/types.js";
import type { KnowledgeAccess } from "../types/entities.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { characterPublicProfile } from "../world/character-contract.js";
import { isPhysicalCondition } from "../turn/physical-interaction.js";
import { escapeRegExp } from "../turn/language/text.js";
import { isVisible } from "../retrieval/policy.js";

export interface PlayerCharacterView {
  readonly ref: string;
  readonly name: string;
  readonly name_known: boolean;
  readonly category: string;
  readonly household: boolean;
  readonly npc_plus: boolean;
  /** Management-shell eligibility only; this grants no mutation or private-data access. */
  readonly appearance_editor_eligible: boolean;
  readonly presence: "present" | "away";
  readonly role: string;
  readonly relationship: string;
  readonly state: string;
  readonly where: string;
  readonly known_location: string | null;
  readonly appearance: string;
  readonly affiliations: readonly string[];
  readonly public_profile: Readonly<Record<string, string | null>>;
  readonly public_summary: string | null;
  readonly story_facts: readonly { readonly text: string; readonly status: CharacterKnowledge["status"] }[];
  readonly history: readonly { readonly text: string; readonly source: string }[];
  readonly observations: readonly string[];
  readonly knowledge_boundary: string;
}

/**
 * The name Nicco knows a CREATED character by now, or undefined. Current over historical: the profile name wins when play established
 * it — it equals the promotion-time established name, or name establishment wrote it with its provenance (late naming of an unnamed
 * acquired person). Any other profile name on an origin-bearing record is unproven and the origin's established name stands. A record
 * without an origin snapshot keeps the pre-existing rule (its profile name). Origin snapshots are never rewritten for display.
 */
export function knownCreatedName(c: DeepReadonly<Pick<CampaignSnapshot["characters"][number], "profile" | "origin_snapshot">>): string | undefined {
  const current = c.profile.name, established = c.origin_snapshot?.established.name;
  if (!c.origin_snapshot) return current;
  return current && (current === established || c.profile.name_source) ? current : established;
}
/** Matches the existing player-visible canonical grant boundary, not narrator-only access. */
const publicAccess = (p: DeepReadonly<KnowledgeAccess> | undefined) => isVisible(p, "player") && isVisible(p, "narrator");

/** One detached projection for scene, household and future people views; never mutates or infers campaign truth. */
export function playerCharacterProjection(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>) {
  const learned = new Map(snapshot.knowledge.filter(k => k.character_id === "nicco").map(k => [k.fact_id, k]));
  const knownNames = new Set(snapshot.facts.filter(f => isIdentityNameFact(f) && learned.get(f.id)?.status === "knows").flatMap(f => f.content.kind === "canonical" ? [f.content.entity_id] : []));
  const household = snapshot.households.filter(h => h.members.some(m => m.character_id === "nicco" && m.status === "member"));
  const memberIds = new Set(household.flatMap(h => h.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id)));
  // Free prose can mention other, unknown identities. Apply knowledge masking to every public text surface.
  // Do not reuse narrator masking: its NPC<n> correlation tokens must never appear in the UI.
  const substitutions = new Map<string, string>();
  for (const entity of world.listEntities()) {
    const named = entity.type !== "character" || entity.id === "nicco" || knownNames.has(entity.id);
    const label = entity.type === "character" ? named ? entity.name : "Unfamiliar person" : publicAccess(entity.knowledge) ? entity.display_name : "Unknown entity";
    substitutions.set(entity.id, label);
    for (const alias of entity.aliases) if (alias !== entity.name) substitutions.set(alias, label);
    if (entity.type === "character" && entity.display_name !== entity.name) substitutions.set(entity.display_name, label);
    if (!named || entity.type !== "character" && !publicAccess(entity.knowledge)) for (const name of [entity.name, entity.display_name]) substitutions.set(name, label);
  }
  for (const c of snapshot.characters) {
    const label = c.origin.kind === "created" ? knownCreatedName(c) ?? c.origin_snapshot?.label ?? "Unfamiliar person" : knownNames.has(c.origin.canonical_entity_id) ? world.getEntity(c.origin.canonical_entity_id)?.name ?? "Unfamiliar person" : "Unfamiliar person";
    substitutions.set(c.id, label);
    const establishedName = c.origin.kind === "canonical" ? world.getEntity(c.origin.canonical_entity_id)?.name : knownCreatedName(c);
    if (c.profile.name && (c.origin.kind === "canonical" || c.origin_snapshot) && c.profile.name !== establishedName) substitutions.set(c.profile.name, label);
    for (const alias of c.profile.aliases ?? []) if (alias !== establishedName) substitutions.set(alias, label);
  }
  for (const id of [...snapshot.facts.map(f => f.id), ...snapshot.households.map(h => h.id), ...world.listChunks().map(c => c.id)]) substitutions.set(id, "[reference withheld]");
  // One pass prevents replacement labels from being interpreted as further identity metadata.
  const entries = [...substitutions].filter(([from, to]) => from && from !== to).sort((a, b) => b[0].length - a[0].length);
  const lookup = new Map(entries.map(([from, to]) => [from.toLowerCase(), to]));
  const pattern = entries.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${entries.map(([from]) => escapeRegExp(from)).join("|")})(?![\\p{L}\\p{N}_])`, "giu") : undefined;
  const text = (source: string): string => (pattern ? source.replace(pattern, match => lookup.get(match.toLowerCase())!) : source)
    .replace(/\b(?:campaign_[a-z0-9_]+|NPC\d+)\b/gi, "[reference withheld]");
  const cache = new Map<string, DeepReadonly<PlayerCharacterView>>();
  const project = (id: string): DeepReadonly<PlayerCharacterView> | undefined => {
    if (cache.has(id)) return cache.get(id);
    const record = snapshot.characters.find(c => c.id === id);
    const canonicalId = record?.origin.kind === "canonical" ? record.origin.canonical_entity_id : id;
    const e = world.getEntity(canonicalId);
    const canonical = e?.type === "character" ? e : undefined;
    if (!canonical && record?.origin.kind !== "created") return undefined;
    const view = characterView(snapshot, world, id), origin = record?.origin_snapshot;
    const created = record?.origin.kind === "created";
    const createdName = created ? knownCreatedName(record) : undefined;
    const named = id === "nicco" || (created ? !!createdName : knownNames.has(canonicalId));
    const name = text(named ? created ? createdName! : canonical!.name : origin?.label ?? "Unfamiliar person");
    const here = view.current.current_location === snapshot.runtime.scene.player_location && view.current.status !== "inactive" && view.current.status !== "dead";
    const isMember = memberIds.has(id), npcPlus = snapshot.premium_characters.some(p => p.character_id === id);
    const accessible = canonical && publicAccess(canonical.knowledge) && (here || named || isMember);
    const profile = accessible ? Object.fromEntries(Object.entries(characterPublicProfile(canonical)).map(([k, v]) => [k, v === null ? null : text(v)])) : {};
    const appearances = [profile.appearance, ...(origin?.established.appearance ?? []).map(text)].filter((v): v is string => !!v);
    // Arbitrary conditions/presentation have no epistemic policy. Use engine-classified physical tags or established origin observations, only here.
    const conditions = here ? (view.current.conditions ?? []).filter(c => isPhysicalCondition(c) || origin?.established.condition?.includes(c)).map(c => text(c.replace(/_/g, " "))) : [];
    const relationships = accessible ? canonical.relationships.filter(r => r.target === "nicco" && publicAccess(r.knowledge ?? canonical.knowledge)).map(r => text(r.description)) : [];
    // The affiliations array is narrator portrayal. Public faction membership is a separate, policy-bearing representation.
    const affiliations = here || named || isMember ? world.getEntitiesByType("faction").filter(f => publicAccess(f.knowledge) && f.members.includes(canonicalId)).map(f => text(f.display_name)) : [];
    if (isMember) affiliations.unshift("Nicco's household");
    const story: PlayerCharacterView["story_facts"][number][] = [];
    const history: PlayerCharacterView["history"][number][] = (origin?.established.background ?? []).map(b => ({ text: text(b.text), source: b.source === "narration" ? "Established in play" : b.source === "self" ? "Their account" : b.source === "seller" ? "Seller's account" : "Someone else's account" }));
    // Contract capture is explicitly first-person speech in delivered narration. Preserve the account, not the inferred trait.
    for (const evidence of snapshot.premium_characters.find(p => p.character_id === id)?.stable.contract_evidence ?? []) history.push({ text: text(evidence.quote), source: "Their account" });
    for (const chunk of world.listChunks().filter(c => c.entity_id === canonicalId)) {
      if (!publicAccess(chunk.knowledge ?? canonical?.knowledge)) continue;
      const edge = snapshot.facts.filter(f => f.content.kind === "canonical" && f.content.entity_id === canonicalId && f.content.chunk_id === chunk.id).map(f => learned.get(f.id)).find(Boolean);
      if (!edge) continue;
      const fact = { text: text(chunk.content), status: edge.status };
      story.push(fact);
      if (chunk.section === "history" && fact.status === "knows") history.push({ text: fact.text, source: "Known canon" });
    }
    // Whole-entity facts are explicit subject bindings; generic campaign statements have no subject link and are not guessed.
    for (const f of snapshot.facts) if (!isIdentityNameFact(f) && f.content.kind === "canonical" && f.content.entity_id === canonicalId && !f.content.chunk_id && accessible && learned.has(f.id)) {
      story.push({ text: text(canonical.content), status: learned.get(f.id)!.status });
    }
    const observations = here ? (snapshot.premium_characters.find(p => p.character_id === id)?.mannerisms ?? []).filter(m => m.known_by_character_ids?.includes("nicco") && mannerismEpistemicState(m) !== "emergent" && mannerismAvailable(m, id, snapshot, world)).map(m => text(m.text)) : [];
    const householdRole = household.flatMap(h => h.members).find(m => m.character_id === id && m.status === "member")?.role;
    const dto: PlayerCharacterView = {
      ref: createHash("sha256").update(`${snapshot.campaign_id}:${id}`).digest("hex").slice(0, 24), name, name_known: named,
      category: !named ? created ? "Met this campaign · name unknown" : "Name unknown" : [isMember ? "Household" : created ? "Met this campaign" : "Canonical NPC", npcPlus ? "NPC+" : ""].filter(Boolean).join(" · "),
      household: isMember, npc_plus: npcPlus, presence: here ? "present" : "away",
      appearance_editor_eligible: id !== "nicco" && snapshot.premium_characters.some(p => p.character_id === id && p.metadata.active_household_member)
        && household.some(h => h.members.some(m => m.character_id === "nicco" && m.status === "member" && m.role === "owner") && h.members.some(m => m.character_id === id && m.status === "member" && m.role !== "owner")),
      role: text(origin?.established.role ?? profile.occupation ?? householdRole ?? "Not known"), relationship: relationships.join(" · ") || "Not recorded",
      state: conditions.join(" · ") || "Not recorded", known_location: here ? text(world.getEntity(snapshot.runtime.scene.player_location)?.display_name ?? "the current scene") : null,
      where: here ? `Here, in ${text(world.getEntity(snapshot.runtime.scene.player_location)?.display_name ?? "the current scene")}` : "Whereabouts not known",
      appearance: [...new Set(appearances)].join("\n\n") || "No known appearance recorded.", affiliations, public_profile: profile,
      public_summary: accessible ? text(canonical.summary) : null, story_facts: story, history, observations,
      knowledge_boundary: "Only public information, observations here, and facts learned by Nicco. Accounts and uncertainty retain their source; private knowledge and unrecorded details are withheld.",
    };
    const freeze = (value: unknown): void => { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } };
    freeze(dto); cache.set(id, dto); return dto;
  };
  return { project };
}
