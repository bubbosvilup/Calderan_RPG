import type { WorldStore } from "../world/world-store.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignCommand, CampaignSnapshot, CharacterAppearance, PlayerCharacterProfile } from "./types.js";
import type { PreparationContext } from "./preparation.js";
import { fail } from "./validation.js";
import { APPEARANCE_LIMITS } from "./permanent-appearance.js";

/**
 * Player Character Profile V1. One canonical seam for the ACTIVE player character's identity and visible appearance:
 *
 *   authored canon (initial values only) → CampaignSnapshot.player_characters (campaign-authoritative, editable)
 *   → derivePlayerCharacterContext() → TurnContext.player_profile.visible → narrator prompt (and the UI's "Narrator sees" preview)
 *
 * v1 has exactly one player character (Nicco); every consumer asks for the ACTIVE one, so a later player_characters[] +
 * active_player_character_id model changes only activePlayerCharacterId(). Visible appearance is world/physical truth the narrator
 * may use; it is never NPC knowledge, never retrieval content, and carries no biography, clothing or stats.
 */
export const PLAYER_PROFILE_LIMITS = Object.freeze({ identity: 60, text: APPEARANCE_LIMITS.text, description: 1000, items: APPEARANCE_LIMITS.items, serialized: 6000, summary: 700 });
const CONTROL = /[\u0000-\u001f\u007f]/;

/** The authored player characters of this world (v1: at most one, enforced by snapshot validation's "unsupported player"). */
export function authoredPlayerIds(world: WorldStore): string[] {
  return world.getEntitiesByType("character").filter(c => c.role === "player").map(c => c.id).sort();
}
/**
 * Deterministic initial profile from canon: structured fields only (sex, species, age band, traits). Prose is never parsed, so
 * anything canon states only in prose stays unestablished until the player sets it.
 */
export function defaultPlayerCharacterProfile(world: WorldStore, characterId: string): PlayerCharacterProfile {
  const e = world.getEntity(characterId);
  const c = e?.type === "character" ? e : undefined;
  const clip = (v: unknown, n: number) => typeof v === "string" && v.trim() ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, n) : undefined;
  const traits = [...new Set((c?.traits ?? []).map(t => clip(t, PLAYER_PROFILE_LIMITS.text)).filter((t): t is string => !!t))].slice(0, PLAYER_PROFILE_LIMITS.items);
  const sex = clip(c?.sex, PLAYER_PROFILE_LIMITS.identity), species = clip(c?.species, PLAYER_PROFILE_LIMITS.identity), age = clip(c?.age_band, PLAYER_PROFILE_LIMITS.identity);
  return { character_id: characterId, ...(sex ? { sex } : {}), ...(species ? { species } : {}), ...(age ? { apparent_age: age } : {}), appearance: traits.length ? { distinctive_traits: traits } : {} };
}
export function defaultPlayerCharacters(world: WorldStore): PlayerCharacterProfile[] {
  return authoredPlayerIds(world).map(id => defaultPlayerCharacterProfile(world, id));
}
/** v1: the single player character. The seam every consumer uses instead of hard-coding "nicco". */
export function activePlayerCharacterId(snapshot: DeepReadonly<Pick<CampaignSnapshot, "player_characters">>): string | undefined {
  return snapshot.player_characters[0]?.character_id;
}
export function activePlayerCharacter(snapshot: DeepReadonly<Pick<CampaignSnapshot, "player_characters">>): DeepReadonly<PlayerCharacterProfile> | undefined {
  return snapshot.player_characters[0];
}

/** Content bounds beyond the shared shape parser: no control characters, bounded lengths and list sizes, bounded total size. */
export function validatePlayerProfileBounds(profile: DeepReadonly<PlayerCharacterProfile>, field = "player_characters"): void {
  const text = (v: unknown, n: number, path: string) => { if (v !== undefined && (typeof v !== "string" || !v.trim() || v.length > n || CONTROL.test(v))) fail(`${field}.${path}`, `expected 1 to ${n} characters without control characters`); };
  text(profile.sex, PLAYER_PROFILE_LIMITS.identity, "sex"); text(profile.species, PLAYER_PROFILE_LIMITS.identity, "species"); text(profile.apparent_age, PLAYER_PROFILE_LIMITS.identity, "apparent_age");
  const a = profile.appearance;
  for (const key of ["build", "skin", "eyes"] as const) text(a[key], PLAYER_PROFILE_LIMITS.text, `appearance.${key}`);
  for (const key of ["color", "texture", "description"] as const) text(a.hair?.[key], PLAYER_PROFILE_LIMITS.text, `appearance.hair.${key}`);
  text(a.description, PLAYER_PROFILE_LIMITS.description, "appearance.description");
  for (const [key, n] of [["height_cm", APPEARANCE_LIMITS.height_cm], ["weight_kg", APPEARANCE_LIMITS.weight_kg]] as const) {
    const v = a[key]; if (v !== undefined && (!Number.isSafeInteger(v) || v < n[0] || v > n[1])) fail(`${field}.appearance.${key}`, "out of range");
  }
  for (const key of ["distinguishing_marks", "distinctive_traits"] as const) {
    const list = a[key] ?? []; if (list.length > PLAYER_PROFILE_LIMITS.items) fail(`${field}.appearance.${key}`, "too many items");
    list.forEach((v, i) => text(v, PLAYER_PROFILE_LIMITS.text, `appearance.${key}[${i}]`));
  }
  const scars = a.scars ?? []; if (scars.length > PLAYER_PROFILE_LIMITS.items) fail(`${field}.appearance.scars`, "too many items");
  scars.forEach((s, i) => { text(s.description, PLAYER_PROFILE_LIMITS.text, `appearance.scars[${i}]`); text(s.location, PLAYER_PROFILE_LIMITS.text, `appearance.scars[${i}].location`); });
  if (JSON.stringify(profile).length > PLAYER_PROFILE_LIMITS.serialized) fail(field, "player character profile too large");
}
/** Whole-snapshot rule: exactly one profile per authored player character, each within bounds. */
export function validatePlayerCharacters(snapshot: DeepReadonly<Pick<CampaignSnapshot, "player_characters">>, world: WorldStore): void {
  const ids = snapshot.player_characters.map(p => p.character_id);
  if (new Set(ids).size !== ids.length) fail("player_characters", "duplicate player character");
  if ([...ids].sort().join("|") !== authoredPlayerIds(world).join("|")) fail("player_characters", "must hold exactly one profile per authored player character");
  snapshot.player_characters.forEach(p => validatePlayerProfileBounds(p));
}
export function preparePlayerCharacterCommand(context: PreparationContext, command: CampaignCommand): boolean {
  if (command.kind !== "set_player_character_profile") return false;
  const list = context.draft.player_characters, at = list.findIndex(p => p.character_id === command.profile.character_id);
  if (at < 0) fail("profile.character_id", "not a player character");
  validatePlayerProfileBounds(command.profile, "profile");
  list[at] = structuredClone(command.profile);
  return true;
}

// ------------------------------------------------------------------------------------------------ narrator-facing projection
export interface PlayerVisibleAppearance {
  readonly sex?: string; readonly species?: string; readonly apparent_age?: string;
  readonly height_cm?: number; readonly weight_kg?: number; readonly build?: string; readonly skin?: string; readonly eyes?: string;
  readonly hair?: string; readonly scars?: readonly string[]; readonly distinguishing_marks?: readonly string[]; readonly distinctive_traits?: readonly string[];
  readonly description?: string;
}
/** The ONE representation of the active player character for narration (and the UI preview, which shows exactly this). */
export interface PlayerCharacterContext {
  readonly character_id: string;
  readonly name: string;
  /** Structured visible appearance (identity + permanent body), compacted. */
  readonly visible_appearance: PlayerVisibleAppearance;
  /** Deterministic compact summary rendered into the narrator prompt as quoted data (bounded; never LLM-written). */
  readonly appearance_summary: string;
}
const hairOf = (h: CharacterAppearance["hair"] | undefined) => [h?.color, h?.texture, h?.description].filter(Boolean).join(", ") || undefined;
/**
 * Deterministic compact summary: identity, body, face/hair, scars/marks/traits, then the free description, each capped; the whole
 * summary is capped at PLAYER_PROFILE_LIMITS.summary characters (most visually meaningful structured parts first).
 */
export function playerAppearanceSummary(v: PlayerVisibleAppearance): string {
  const identity = [v.apparent_age ? `apparent age ${v.apparent_age}` : "", v.sex, v.species].filter(Boolean).join(" ");
  const body = [v.height_cm ? `${v.height_cm} cm tall` : "", v.weight_kg ? `${v.weight_kg} kg` : "", v.build ? `${v.build} build` : ""].filter(Boolean).join(", ");
  const parts = [identity, body, v.hair ? `hair ${v.hair}` : "", v.eyes ? `eyes ${v.eyes}` : "", v.skin ? `skin ${v.skin}` : "",
    v.scars?.length ? `scars: ${v.scars.join("; ")}` : "", v.distinguishing_marks?.length ? `marks: ${v.distinguishing_marks.join("; ")}` : "",
    v.distinctive_traits?.length ? `traits: ${v.distinctive_traits.join("; ")}` : "", v.description ? `described as: ${v.description.slice(0, 300)}` : ""].filter(Boolean);
  const text = parts.join(". ") + (parts.length ? "." : "");
  return text.length <= PLAYER_PROFILE_LIMITS.summary ? text : `${text.slice(0, PLAYER_PROFILE_LIMITS.summary - 1).replace(/\s+\S*$/, "")}…`;
}
export function derivePlayerCharacterContext(world: WorldStore, snapshot: DeepReadonly<Pick<CampaignSnapshot, "player_characters">>): PlayerCharacterContext | undefined {
  const profile = activePlayerCharacter(snapshot);
  if (!profile) return undefined;
  const e = world.getEntity(profile.character_id), a = profile.appearance;
  const v: PlayerVisibleAppearance = Object.fromEntries(Object.entries({ sex: profile.sex, species: profile.species, apparent_age: profile.apparent_age, height_cm: a.height_cm, weight_kg: a.weight_kg,
    build: a.build, skin: a.skin, eyes: a.eyes, hair: hairOf(a.hair), scars: a.scars?.map(s => s.location ? `${s.description} (${s.location})` : s.description),
    distinguishing_marks: a.distinguishing_marks, distinctive_traits: a.distinctive_traits, description: a.description }).filter(([, x]) => x !== undefined && !(Array.isArray(x) && !x.length))) as PlayerVisibleAppearance;
  return Object.freeze({ character_id: profile.character_id, name: e?.name ?? profile.character_id, visible_appearance: Object.freeze(v), appearance_summary: playerAppearanceSummary(v) });
}
