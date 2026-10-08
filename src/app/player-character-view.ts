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
import { appearanceFingerprint, composePortraitPrompt, portraitDetails, portraitPoseOptions, type PortraitKind, type PortraitPose } from "../campaign/portrait-prompt.js";
import { ageStatus } from "../campaign/age.js";
import { RAENA_IMAGE_STACK } from "./image-stack.js";
import { avatarPortrait, fullBodyPortrait, MAX_PORTRAIT_VERSIONS, PORTRAIT_BATCH_SIZE, portraitAssetToken, portraitItemToken, portraitRecord } from "../campaign/portraits.js";
import { appearanceLabel, appearanceLines, PERMANENT_APPEARANCE_FIELDS, resolvePermanentAppearance, type PermanentAppearanceField } from "../campaign/permanent-appearance.js";

export interface PlayerCharacterView {
  readonly ref: string;
  readonly name: string;
  readonly name_known: boolean;
  readonly category: string;
  readonly household: boolean;
  readonly npc_plus: boolean;
  /** Management eligibility for the Household appearance editor; grants no private-data access. */
  readonly appearance_editor_eligible: boolean;
  /** Permanent Appearance V1: the bounded editor projection, present only when eligible. */
  readonly appearance_editor: AppearanceEditorView | null;
  /** Portrait Gallery V2: the Avatar image URL (opaque token route) for compact surfaces, else null. Never the Full Body. */
  readonly avatar_url: string | null;
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
/**
 * Permanent Appearance V1 editor projection for a managed NPC+: read-only identity and, per editable field, the stored campaign
 * override (null = none stored) and what applies without one. Inherited values are never presented as stored. The editor saves
 * against the session state's campaign revision it opened with.
 */
export interface AppearanceEditorView {
  readonly identity: readonly { readonly label: string; readonly value: string }[];
  readonly fields: readonly { readonly key: PermanentAppearanceField; readonly label: string; readonly group: "body" | "hair" | "face" | "description";
    readonly kind: "number" | "text" | "lines"; readonly unit?: "cm" | "kg"; readonly override: string | null; readonly inherited: string | null }[];
  /** Image generation v1 read-only previews (neutral pose) of the prompts the committed appearance yields per kind; nothing is generated. */
  readonly portrait_prompts: Readonly<Record<PortraitKind, { readonly prompt: string; readonly negative_prompt: string }>>;
  /** The masked character-details section every portrait prompt carries (the session composes the sent prompt from this). */
  readonly portrait_details: string;
  /** Portrait Gallery V2 status: derived media only (no paths, file names, internal IDs, fingerprints or costs). */
  readonly portrait: PortraitEditorView;
}
/** One role slot. `stale` = generated from a different appearance than the current committed one describes. */
export interface PortraitRoleView { readonly url: string; readonly stale: boolean }
/** One Gallery image. `token` is an opaque per-item handle for role and delete actions (not the asset token, not a version ID). */
export interface PortraitGalleryItemView { readonly token: string; readonly url: string; readonly is_avatar: boolean; readonly is_full_body: boolean; readonly stale: boolean;
  readonly generated_at: string; readonly model_label: string; readonly reference_used: boolean;
  /** `legacy` = generated before image generation v1 (no kind): viewable, keeps any role it holds, cannot receive a new one. */
  readonly kind: "avatar" | "fullbody" | "legacy";
  /** Pose label for v1 images, else null. */
  readonly pose_label: string | null;
  /** Whether this image may be assigned the role now (kind rule); a role it already holds is shown by is_avatar / is_full_body. */
  readonly can_be_avatar: boolean; readonly can_be_full_body: boolean }
export interface PortraitEditorView {
  /** null = no Avatar yet. */
  readonly avatar: PortraitRoleView | null;
  /** null = no Full Body selected. Deliberately never substituted by the Avatar. */
  readonly full_body: PortraitRoleView | null;
  readonly gallery: readonly PortraitGalleryItemView[];
  readonly gallery_limit: number; readonly batch_size: number;
  /** False when fewer than `batch_size` Gallery slots remain, or generation is blocked: refused before any provider call. */
  readonly can_generate_batch: boolean;
  /** Why generation is unavailable for this character (e.g. not an established adult), else null. */
  readonly generation_blocked: string | null;
  /** The curated pose choices per kind (ids are what the browser sends; texts stay server-side). */
  readonly poses: Readonly<Record<PortraitKind, readonly { readonly id: PortraitPose; readonly label: string }[]>>;
  /** Reference image: stored data is kept, but v1 generation does not use it (deferred to a future image-edit path). */
  readonly reference_attached: boolean; readonly reference_url: string | null;
}
const EDITOR_GROUPS: Readonly<Record<PermanentAppearanceField, AppearanceEditorView["fields"][number]["group"]>> = { height_cm: "body", weight_kg: "body", build: "body", skin: "body",
  hair_color: "hair", hair_texture: "hair", hair_description: "hair", eyes: "face", scars: "face", distinguishing_marks: "face", distinctive_traits: "face", description: "description" };
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
    const editable = id !== "nicco" && view.current.status !== "inactive" && view.current.status !== "dead" && snapshot.premium_characters.some(p => p.character_id === id && p.metadata.active_household_member)
      && household.some(h => h.members.some(m => m.character_id === "nicco" && m.status === "member" && m.role === "owner") && h.members.some(m => m.character_id === id && m.status === "member" && m.role !== "owner"));
    // Permanent appearance: public canonical prose and established origin observations; campaign profile values only for a managed
    // member, whose appearance Nicco authors in the editor. Elsewhere profile values stay unproven and hidden.
    const permanent = resolvePermanentAppearance(world, snapshot, id, { canonical: !!accessible, overrides: editable });
    const appearances = appearanceLines(permanent).map(text);
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
    // Portrait Gallery V2 + image generation v1. Compact surfaces get the Avatar for any projected character that has one (portraits only
    // ever exist for characters Nicco managed). The Gallery, role slots and staleness are editor-only (managed members). Stale = an image
    // was generated from a different appearance than the current committed one (appearance fingerprint over the masked details, exactly
    // as the session sends them). Pre-v1 images carry a whole-prompt fingerprint and therefore show as stale.
    const details = editable ? text(portraitDetails(permanent)) : "";
    const preview = (kind: PortraitKind) => composePortraitPrompt({ details, kind, pose: "neutral", trigger: RAENA_IMAGE_STACK.trigger });
    const assetUrl = (file: string) => `/api/portrait/asset/${portraitAssetToken(snapshot.campaign_id, id, file)}`;
    const avatar = avatarPortrait(snapshot, id), avatarUrl = avatar ? assetUrl(avatar.asset_file) : null;
    const portraitView = (): PortraitEditorView => {
      const record = portraitRecord(snapshot, id), fullBody = fullBodyPortrait(snapshot, id), current = appearanceFingerprint(details);
      const versions = record?.versions ?? [], blocked = ageStatus(world, snapshot, id) === "minor" ? "Portrait generation is only available for adult characters." : null;
      const poseLabel = (kind: PortraitKind, pose: string | undefined) => pose ? portraitPoseOptions(kind).find(p => p.id === pose)?.label ?? null : null;
      return { avatar: avatar ? { url: avatarUrl!, stale: avatar.prompt_fingerprint !== current } : null,
        full_body: fullBody ? { url: assetUrl(fullBody.asset_file), stale: fullBody.prompt_fingerprint !== current } : null,
        gallery: versions.map(v => ({ token: portraitItemToken(snapshot.campaign_id, id, v.version_id), url: assetUrl(v.asset_file), is_avatar: v.version_id === record!.avatar_version_id,
          is_full_body: v.version_id === record!.full_body_version_id, stale: v.prompt_fingerprint !== current, generated_at: v.created_at, model_label: v.style_id ?? v.model,
          reference_used: v.reference_used === true, kind: v.kind ?? "legacy", pose_label: v.kind ? poseLabel(v.kind, v.pose) : null, can_be_avatar: v.kind === "avatar", can_be_full_body: v.kind === "fullbody" })),
        gallery_limit: MAX_PORTRAIT_VERSIONS, batch_size: PORTRAIT_BATCH_SIZE, can_generate_batch: !blocked && versions.length + PORTRAIT_BATCH_SIZE <= MAX_PORTRAIT_VERSIONS,
        generation_blocked: blocked, poses: { avatar: portraitPoseOptions("avatar"), fullbody: portraitPoseOptions("fullbody") },
        reference_attached: !!record?.reference, reference_url: record?.reference ? assetUrl(record.reference.asset_file) : null };
    };
    const dto: PlayerCharacterView = {
      ref: createHash("sha256").update(`${snapshot.campaign_id}:${id}`).digest("hex").slice(0, 24), name, name_known: named,
      category: !named ? created ? "Met this campaign · name unknown" : "Name unknown" : [isMember ? "Household" : created ? "Met this campaign" : "Canonical NPC", npcPlus ? "NPC+" : ""].filter(Boolean).join(" · "),
      household: isMember, npc_plus: npcPlus, presence: here ? "present" : "away",
      appearance_editor_eligible: editable,
      appearance_editor: editable ? {
        identity: ([["Species", permanent.identity.species], ["Sex", permanent.identity.sex], ["Age", permanent.identity.age]] as const).flatMap(([label, value]) => value ? [{ label, value: text(value) }] : []),
        fields: PERMANENT_APPEARANCE_FIELDS.map(key => {
          const value = permanent.values[key], kind = key === "height_cm" || key === "weight_kg" ? "number" as const : key === "scars" || key === "distinguishing_marks" || key === "distinctive_traits" ? "lines" as const : "text" as const;
          const baseline = key === "description" && permanent.baseline.length ? [...new Set(permanent.baseline.map(b => text(b.text)))].join("\n\n") : null;
          return { key, label: appearanceLabel(key), group: EDITOR_GROUPS[key], kind, ...(key === "height_cm" ? { unit: "cm" as const } : key === "weight_kg" ? { unit: "kg" as const } : {}),
            override: value === undefined ? null : Array.isArray(value) ? value.map(text).join("\n") : text(String(value)), inherited: baseline };
        }),
        portrait_prompts: { avatar: preview("avatar"), fullbody: preview("fullbody") },
        portrait_details: details,
        portrait: portraitView(),
      } : null,
      avatar_url: avatarUrl,
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
