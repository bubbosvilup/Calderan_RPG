import type { ResolvedPermanentAppearance } from "./permanent-appearance.js";
import { portraitDetails, PORTRAIT_CLOTHING, PORTRAIT_CONSTRAINTS, PORTRAIT_FRAMING, PORTRAIT_POSE } from "./portrait-prompt.js";

/**
 * Anime Portrait Benchmark V1: a deterministic, conservative Danbooru/booru-style tag layer for character reference portraits, and the
 * two prompt dialects the benchmark compares. NOT wired into production generation: the production prompt is unchanged until the
 * benchmark result is reviewed (ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md).
 *
 * Rules: only structured established facts map to tags, and only when the WHOLE normalized field value (or list item) is an entry of a
 * closed vocabulary below. Prose is never parsed, nothing is inferred, unknown traits are omitted, weight never maps to a tag. Output is
 * lower-case, deduplicated and in a fixed group order: style → subject → species → body → hair → face/eyes/skin → scars/features →
 * pose → composition. Tag spellings were checked against the live Danbooru tag index (cel_shading is deprecated there, so the colouring
 * tag is `anime coloring`; `lineart` means uncoloured line art and is deliberately not a tag here; `light background` is not a tag).
 */
export interface AnimePortraitTags {
  readonly style: readonly string[];
  readonly subject: readonly string[];
  readonly appearance: readonly string[];
  readonly pose: readonly string[];
  readonly composition: readonly string[];
}
/** Fixed style group: a generic phrase plus the Danbooru colouring tag. */
export const ANIME_STYLE_TAGS = Object.freeze(["anime illustration", "anime coloring"]);
/** Fixed pose and composition groups for a full-body reference. */
export const ANIME_POSE_TAGS = Object.freeze(["standing", "looking at viewer"]);
export const ANIME_COMPOSITION_TAGS = Object.freeze(["full body", "simple background", "grey background"]);
/** Generic quality prefix under test (Animagine/Illustrious-family vocabulary; never `score_*`, which is Pony-only). */
export const ANIME_QUALITY_TAGS = Object.freeze(["masterpiece", "best quality", "very aesthetic"]);

const norm = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.]+$/, "") : "";
const HAIR_COLORS: Readonly<Record<string, string>> = { black: "black hair", brown: "brown hair", "dark brown": "brown hair", "light brown": "brown hair", blonde: "blonde hair", blond: "blonde hair",
  red: "red hair", auburn: "red hair", orange: "orange hair", grey: "grey hair", gray: "grey hair", silver: "grey hair", white: "white hair", blue: "blue hair", green: "green hair", pink: "pink hair", purple: "purple hair" };
const HAIR_TEXTURES: Readonly<Record<string, string>> = { straight: "straight hair", wavy: "wavy hair", curly: "curly hair" };
const HAIR_LENGTHS: Readonly<Record<string, string>> = { "very short": "very short hair", short: "short hair", "medium-length": "medium hair", medium: "medium hair", "shoulder-length": "medium hair",
  long: "long hair", "very long": "very long hair", bald: "bald" };
const EYE_COLORS: Readonly<Record<string, string>> = { brown: "brown eyes", "dark brown": "brown eyes", blue: "blue eyes", green: "green eyes", grey: "grey eyes", gray: "grey eyes", black: "black eyes",
  amber: "orange eyes", hazel: "brown eyes", red: "red eyes", yellow: "yellow eyes", purple: "purple eyes" };
const SKINS: Readonly<Record<string, string>> = { pale: "pale skin", "very pale": "pale skin", fair: "pale skin", dark: "dark skin", "dark brown": "dark skin", tan: "tan", tanned: "tan" };
const BUILDS: Readonly<Record<string, string>> = { muscular: "muscular" };
const FEATURES: Readonly<Record<string, string>> = { freckles: "freckles", mole: "mole", "mole under eye": "mole under eye", "mole under the left eye": "mole under eye", "mole under the right eye": "mole under eye",
  "pointed ears": "pointy ears", "pointy ears": "pointy ears", heterochromia: "heterochromia", "eyepatch": "eyepatch", "facial scar": "scar on face", "scar on face": "scar on face" };
const SPECIES: Readonly<Record<string, readonly string[]>> = { elf: ["elf", "pointy ears"], "half-elf": ["pointy ears"] };
/** Booru `tall female` / `tall male` mean notably tall; thresholds are deliberately high (exact height still goes in the details prose). */
const TALL_CM = { female: 178, male: 190 } as const;

/** Conservative booru tags for one resolved permanent appearance. */
export function buildAnimePortraitTags(appearance: ResolvedPermanentAppearance): AnimePortraitTags {
  const { values: v, identity } = appearance, sex = norm(identity.sex);
  const gendered = sex === "female" || sex === "woman" ? "female" : sex === "male" || sex === "man" ? "male" : undefined;
  const subject = [gendered === "female" ? "1girl" : gendered === "male" ? "1boy" : "1other", "solo"];
  const out: string[] = [];
  const add = (tag: string | undefined) => { if (tag) out.push(tag); };
  for (const tag of SPECIES[norm(identity.species)] ?? []) add(tag);
  if (gendered && typeof v.height_cm === "number" && v.height_cm >= TALL_CM[gendered]) add(`tall ${gendered}`);
  const build = BUILDS[norm(v.build)];
  add(build && gendered ? `${build} ${gendered}` : build);
  add(HAIR_COLORS[norm(v.hair_color).replace(/ hair$/, "")]);
  add(HAIR_LENGTHS[norm(v.hair_description).replace(/ hair$/, "")]);
  add(HAIR_TEXTURES[norm(v.hair_texture).replace(/ hair$/, "")]);
  add(EYE_COLORS[norm(v.eyes).replace(/ eyes$/, "")]);
  add(SKINS[norm(v.skin).replace(/ skin$/, "")]);
  if (Array.isArray(v.scars) && v.scars.length) add("scar");
  for (const key of ["distinguishing_marks", "distinctive_traits"] as const) for (const item of Array.isArray(v[key]) ? v[key] as readonly string[] : []) add(FEATURES[norm(item)]);
  return Object.freeze({ style: ANIME_STYLE_TAGS, subject: Object.freeze(subject), appearance: Object.freeze([...new Set(out)]), pose: ANIME_POSE_TAGS, composition: ANIME_COMPOSITION_TAGS });
}
/** All tags in the fixed group order, deduplicated, optionally behind the quality prefix. */
export function flattenAnimePortraitTags(tags: AnimePortraitTags, options: { readonly quality?: boolean } = {}): string[] {
  return [...new Set([...(options.quality ? ANIME_QUALITY_TAGS : []), ...tags.style, ...tags.subject, ...tags.appearance, ...tags.pose, ...tags.composition])];
}

export type AnimePromptDialect = "natural" | "hybrid";
/** Fixed anime intent: grounded mature anime fantasy, explicitly not photoreal/3D/painterly/chibi. */
export const ANIME_INTENT = "Anime fantasy character illustration for a dark-fantasy RPG: grounded, mature anime art style with clean lineart and controlled cel shading, adult proportions, restrained muted palette. Not photorealistic, not a photograph, not a 3D render, not a painterly or oil-painting style, not western comic style, not chibi.";
/**
 * Benchmark prompt dialects over IDENTICAL character text: A = natural-language anime prompt; B = hybrid (adds the booru tag block).
 * Both reuse the production details section and its fixed clothing, pose, framing and constraint lines verbatim.
 */
export function buildAnimeBenchmarkPrompt(appearance: ResolvedPermanentAppearance, options: { readonly dialect: AnimePromptDialect; readonly quality?: boolean }): string {
  const lines = [ANIME_INTENT];
  if (options.dialect === "hybrid") lines.push(`Booru-style visual tags: ${flattenAnimePortraitTags(buildAnimePortraitTags(appearance), { quality: options.quality === true }).join(", ")}.`);
  lines.push(`Character details: ${portraitDetails(appearance)}`, PORTRAIT_CLOTHING, PORTRAIT_POSE, PORTRAIT_FRAMING, PORTRAIT_CONSTRAINTS);
  return lines.join("\n");
}
