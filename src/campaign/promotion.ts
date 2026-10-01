import type { CampaignCharacter, CampaignSnapshot, CharacterAppearance, CharacterOriginSnapshot, CharacterProfile } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { campaignId } from "./identity.js";

/**
 * Promotion Pass 1.1: the generic promotion primitive. A narrator-invented (ephemeral) person becomes a MINIMUM DURABLE created
 * character: stable ID, established identity only, current location, active status, and an immutable origin snapshot. It is not
 * personality generation: nothing unestablished (history, family, traits, fears, skills, relationships, household role) is added.
 * Only the purchase trigger is production-wired (turn/person-transactions.ts); other triggers are reserved in the type only.
 */
export interface PromotionInput {
  readonly label: string;
  readonly established: CharacterOriginSnapshot["established"];
  readonly evidence: readonly string[];
  readonly location_id: string;
  readonly trigger: CharacterOriginSnapshot["trigger"];
  /** The revision the promotion commits at (base revision + 1) and the current world minute. */
  readonly promoted_revision: number;
  readonly world_minute: number;
  readonly ephemeral_ref?: string;
}
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "person";
/**
 * Collision-safe, deterministic ID under the created-character policy: revision-scoped, so a second person with the same name gets a
 * different ID (names are never identity), and a replayed promotion at a later revision cannot reuse an earlier person's ID.
 */
export function promotedCharacterId(label: string, promotedRevision: number): string {
  return campaignId("character", `r${promotedRevision}_${slug(label.replace(/^(?:the|a|an)\s+/i, ""))}`);
}
export function buildPromotedCharacter(input: PromotionInput): CampaignCharacter {
  const e = input.established;
  const appearance: CharacterAppearance | undefined = e.appearance?.length ? { description: e.appearance.join("; ") } : undefined;
  const profile: CharacterProfile = { ...(e.name ? { name: e.name } : {}), ...(e.age ? { age: e.age } : {}), ...(e.sex ? { sex: e.sex } : {}), ...(e.species ? { species: e.species } : {}), ...(appearance ? { appearance } : {}) };
  const origin_snapshot: CharacterOriginSnapshot = { source: "narrator_ephemeral", trigger: input.trigger, promoted_revision: input.promoted_revision, promoted_world_minute: input.world_minute,
    location_id: input.location_id, label: input.label, ...(input.ephemeral_ref ? { ephemeral_ref: input.ephemeral_ref } : {}),
    established: Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && (!Array.isArray(v) || v.length))) as CharacterOriginSnapshot["established"],
    evidence: input.evidence.slice(0, 12).map(s => s.slice(0, 240)) };
  return { id: promotedCharacterId(input.label, input.promoted_revision), origin: { kind: "created" }, profile,
    current: { current_location: input.location_id, status: "active", ...(e.condition?.length ? { conditions: [...new Set(e.condition)] } : {}) }, origin_snapshot };
}
/** Future NPC+ hook: persistent characters that originated as narrator-created ephemerals (query only; no generation). */
export function narratorEphemeralCharacters(snapshot: DeepReadonly<Pick<CampaignSnapshot, "characters">>) {
  return snapshot.characters.filter(c => c.origin_snapshot?.source === "narrator_ephemeral");
}
/** Narrator-facing label: the established name, else the promotion description ("the girl"). Never a fabricated name. */
export function promotedLabel(character: DeepReadonly<Pick<CampaignCharacter, "profile" | "origin_snapshot">>): string | undefined {
  return character.profile.name ?? character.origin_snapshot?.label;
}
