import { createHash } from "node:crypto";
import type { WorldStore } from "../world/world-store.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import { activePlayerCharacter } from "../campaign/player-character.js";
import { ageStatusFromText } from "../campaign/age.js";
import { appearanceLabel, appearanceValues, PERMANENT_APPEARANCE_FIELDS, type PermanentAppearanceField, type ResolvedPermanentAppearance } from "../campaign/permanent-appearance.js";
import { portraitDetails } from "../campaign/portrait-prompt.js";
import { portraitPromptPreviews, portraitEditorView, type AppearanceEditorView } from "./player-character-view.js";
import { playerCapabilities, type CharacterCapabilities } from "./character-capabilities.js";

/**
 * Player Character visuals. Nicco has no `characters[]` record and is never an NPC+ (no premium record, no promotion, no household
 * authority), but the SAME portrait pipeline (portraits[] keyed by character id, asset store, commands, editor projection) serves him.
 * This module only builds the player's editor-shaped projection; images never change appearance and never reach the narrator.
 */
export interface PlayerVisualView {
  /** Opaque ref the shared portrait endpoints accept for the player (same derivation as every character ref). */
  readonly ref: string;
  readonly capabilities: CharacterCapabilities;
  readonly editor: AppearanceEditorView;
  /** Selected Avatar / Full Body asset URLs (selected images only; never a canonical or generated-but-unselected fallback). */
  readonly avatar_url: string | null;
  readonly full_body_url: string | null;
}
const GROUPS: Readonly<Record<PermanentAppearanceField, AppearanceEditorView["fields"][number]["group"]>> = { height_cm: "body", weight_kg: "body", build: "body", skin: "body",
  hair_color: "hair", hair_texture: "hair", hair_description: "hair", eyes: "face", scars: "face", distinguishing_marks: "face", distinctive_traits: "face", description: "description" };
export const playerRef = (campaignId: string, characterId: string) => createHash("sha256").update(`${campaignId}:${characterId}`).digest("hex").slice(0, 24);
export const PLAYER_ADULT_ONLY = "Portrait generation is only available for adult characters.";

export function playerVisualView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>): PlayerVisualView | null {
  const profile = activePlayerCharacter(snapshot);
  if (!profile) return null;
  const id = profile.character_id, values = appearanceValues(profile.appearance);
  // The prompt's character-details section uses exactly the player's visible permanent appearance and stated identity.
  const resolved: ResolvedPermanentAppearance = { values, baseline: [], description: typeof values.description === "string" ? [values.description] : [],
    identity: { ...(profile.species ? { species: profile.species } : {}), ...(profile.sex ? { sex: profile.sex } : {}), ...(profile.apparent_age ? { age: profile.apparent_age } : {}) } };
  const details = portraitDetails(resolved), age = profile.apparent_age ? ageStatusFromText(profile.apparent_age) : "unknown";
  const portrait = portraitEditorView(world, snapshot, id, details, age);
  const editor: AppearanceEditorView = {
    identity: ([["Species", profile.species], ["Sex", profile.sex], ["Apparent age", profile.apparent_age]] as const).flatMap(([label, value]) => value ? [{ label, value }] : []),
    fields: PERMANENT_APPEARANCE_FIELDS.map(key => {
      const value = values[key], kind = key === "height_cm" || key === "weight_kg" ? "number" as const : key === "scars" || key === "distinguishing_marks" || key === "distinctive_traits" ? "lines" as const : "text" as const;
      return { key, label: appearanceLabel(key), group: GROUPS[key], kind, ...(key === "height_cm" ? { unit: "cm" as const } : key === "weight_kg" ? { unit: "kg" as const } : {}),
        override: value === undefined ? null : Array.isArray(value) ? value.join("\n") : String(value), inherited: null };
    }),
    portrait_prompts: portraitPromptPreviews(details), portrait_details: details, portrait };
  return { ref: playerRef(snapshot.campaign_id, id), capabilities: playerCapabilities({ generation_blocked: portrait.generation_blocked }), editor,
    avatar_url: portrait.avatar?.url ?? null, full_body_url: portrait.full_body?.url ?? null };
}
