import { isDeepStrictEqual } from "node:util";
import type { WorldStore } from "../world/world-store.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignSnapshot, PlayerCharacterProfile } from "../campaign/types.js";
import { activePlayerCharacter, derivePlayerCharacterContext, PLAYER_PROFILE_LIMITS } from "../campaign/player-character.js";
import { appearanceLabel, applyAppearancePatch, PERMANENT_APPEARANCE_FIELDS, type PermanentAppearanceField } from "../campaign/permanent-appearance.js";

/**
 * Player Character Profile V1 — the UI projection of the ACTIVE player character (v1: Nicco) and its narrow edit. The narrator
 * preview is the exact summary the narrator receives (derivePlayerCharacterContext), never a UI-only rendering.
 */
export type PlayerIdentityField = "sex" | "species" | "apparent_age";
export const PLAYER_IDENTITY_FIELDS: readonly PlayerIdentityField[] = Object.freeze(["sex", "species", "apparent_age"]);
const IDENTITY_LABELS: Readonly<Record<PlayerIdentityField, string>> = { sex: "Sex", species: "Species", apparent_age: "Apparent age" };
const GROUPS: Readonly<Record<PermanentAppearanceField, "body" | "hair" | "face" | "description">> = { height_cm: "body", weight_kg: "body", build: "body", skin: "body",
  hair_color: "hair", hair_texture: "hair", hair_description: "hair", eyes: "face", scars: "face", distinguishing_marks: "face", distinctive_traits: "face", description: "description" };
export interface PlayerProfileView {
  readonly name: string;
  readonly role_label: "Player Character";
  readonly identity: readonly { readonly key: PlayerIdentityField; readonly label: string; readonly value: string | null }[];
  readonly fields: readonly { readonly key: PermanentAppearanceField; readonly label: string; readonly group: "body" | "hair" | "face" | "description";
    readonly kind: "number" | "text" | "lines"; readonly unit?: "cm" | "kg"; readonly value: string | null }[];
  /** Exactly what the narrator receives as the player's visible appearance. */
  readonly narrator_summary: string;
}
function fieldValue(profile: DeepReadonly<PlayerCharacterProfile>, key: PermanentAppearanceField): string | null {
  const a = profile.appearance;
  const v = key === "hair_color" ? a.hair?.color : key === "hair_texture" ? a.hair?.texture : key === "hair_description" ? a.hair?.description
    : key === "scars" ? a.scars?.map(s => s.description) : a[key as Exclude<PermanentAppearanceField, "hair_color" | "hair_texture" | "hair_description" | "scars">];
  return v === undefined ? null : Array.isArray(v) ? v.join("\n") : String(v);
}
export function playerProfileView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>): PlayerProfileView | null {
  const profile = activePlayerCharacter(snapshot), context = derivePlayerCharacterContext(world, snapshot);
  if (!profile || !context) return null;
  return {
    name: context.name, role_label: "Player Character",
    identity: PLAYER_IDENTITY_FIELDS.map(key => ({ key, label: IDENTITY_LABELS[key], value: profile[key] ?? null })),
    fields: PERMANENT_APPEARANCE_FIELDS.map(key => ({ key, label: appearanceLabel(key), group: GROUPS[key],
      kind: key === "height_cm" || key === "weight_kg" ? "number" as const : key === "scars" || key === "distinguishing_marks" || key === "distinctive_traits" ? "lines" as const : "text" as const,
      ...(key === "height_cm" ? { unit: "cm" as const } : key === "weight_kg" ? { unit: "kg" as const } : {}), value: fieldValue(profile, key) })),
    narrator_summary: context.appearance_summary,
  };
}
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/; // newlines are allowed only as list separators, already split by the client
/**
 * Patch: appearance keys use the NPC+ patch semantics (omitted = unchanged, null = clear, value = set; bounded); identity keys
 * (sex, species, apparent_age) are bounded one-line text or null. Unknown keys and control characters are rejected.
 */
export function applyPlayerProfilePatch(current: DeepReadonly<PlayerCharacterProfile>, patch: unknown):
  { readonly ok: true; readonly profile: PlayerCharacterProfile; readonly changed: boolean } | { readonly ok: false; readonly field?: string; readonly reason: string } {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.getPrototypeOf(patch) !== Object.prototype) return { ok: false, reason: "Expected a profile patch object." };
  const entries = Object.entries(patch as Record<string, unknown>);
  if (!entries.length) return { ok: false, reason: "Nothing to change." };
  // A line break is whitespace in one-line text (collapsed below) but never valid inside a list item.
  const hasControl = (v: unknown): boolean => typeof v === "string" ? CONTROL.test(v) : Array.isArray(v) ? v.some(x => typeof x === "string" && /[\u0000-\u001f\u007f]/.test(x)) : false;
  for (const [key, value] of entries) if (hasControl(value)) return { ok: false, field: key, reason: "Remove control characters." };
  const next = structuredClone(current) as PlayerCharacterProfile, appearancePatch: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if ((PLAYER_IDENTITY_FIELDS as readonly string[]).includes(key)) {
      const k = key as PlayerIdentityField;
      if (value === null) { delete next[k]; continue; }
      if (typeof value !== "string" || !value.trim() || value.trim().length > PLAYER_PROFILE_LIMITS.identity) return { ok: false, field: key, reason: `Enter 1 to ${PLAYER_PROFILE_LIMITS.identity} characters, or clear the field.` };
      next[k] = value.trim().replace(/\s+/g, " ");
    } else if ((PERMANENT_APPEARANCE_FIELDS as readonly string[]).includes(key)) appearancePatch[key] = value;
    else return { ok: false, field: key, reason: "This field cannot be edited." };
  }
  if (typeof appearancePatch.description === "string" && appearancePatch.description.trim().length > PLAYER_PROFILE_LIMITS.description) return { ok: false, field: "description", reason: `Enter 1 to ${PLAYER_PROFILE_LIMITS.description} characters, or clear the field.` };
  if (Object.keys(appearancePatch).length) {
    const patched = applyAppearancePatch(current.appearance, appearancePatch);
    if (!patched.ok) return patched;
    next.appearance = patched.appearance ?? {};
  }
  return { ok: true, profile: next, changed: !isDeepStrictEqual(next, structuredClone(current)) };
}
