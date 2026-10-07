import { createHash } from "node:crypto";
import type { ResolvedPermanentAppearance } from "./permanent-appearance.js";

/**
 * Portrait Prompt Builder V1: a deterministic, provider-neutral text prompt for a durable full-body character reference image, built
 * only from the resolved permanent appearance (resolvePermanentAppearance owns canon/origin/profile merging). No provider, model,
 * aspect-ratio or seed syntax; no image generation. Nothing is invented: unknown traits are omitted, prose is never parsed, and
 * current state (conditions, clothing, location, mood, events) is not an input at all.
 *
 * Fixed order: purpose/style → subject → body → skin/eyes → hair → scars/marks/traits → description (quoted data) → clothing → pose →
 * framing/background → constraints. Every user-authored value is collapsed to one line, de-quoted, length-capped and placed after a
 * fixed label; the description is quoted as data. The details section is capped as a whole, and the fixed clothing/pose/framing/
 * constraint text always follows it, so no description can remove or replace the builder's constraints.
 */
export const PORTRAIT_PROMPT_VERSION = "portrait-prompt-v1";
export const PORTRAIT_PROMPT_LIMITS = Object.freeze({ value: 100, list_items: 4, description: 500, details: 2000, prompt: 3000 });
export interface PortraitPromptInput {
  readonly appearance: ResolvedPermanentAppearance;
  /** Player-known name, kept only as an output label: it never enters the prompt (no rendered text). */
  readonly name?: string;
}
export interface PortraitPrompt {
  readonly version: typeof PORTRAIT_PROMPT_VERSION;
  readonly subject_label?: string;
  readonly prompt: string;
  readonly negative_prompt: string;
  /** sha256 over version + prompt + negative prompt (first 16 hex): the same prompt always yields the same fingerprint. */
  readonly fingerprint: string;
}

export const PORTRAIT_CLOTHING = "Clothing: simple, neutral dark-fantasy clothing appropriate to the setting, without heraldry, insignia or faction markings.";
export const PORTRAIT_POSE = "Pose: standing naturally with relaxed arms, facing mostly forward with a slight three-quarter turn, restrained natural expression.";
export const PORTRAIT_FRAMING = "Framing: full body visible from head to feet, centered, eye-level, nothing cropped. Background: plain light grey studio background.";
export const PORTRAIT_CONSTRAINTS = "Single subject only. Grounded anatomy, natural proportions, restrained lighting. No weapons, no other people, no text, lettering, logos, watermarks or interface elements.";
export const PORTRAIT_NEGATIVE_PROMPT = "extra people, duplicate figures, extra limbs, extra fingers, malformed hands, cropped head or feet, weapons, text, lettering, watermark, logo, user interface, busy background, scenery";

/** One inert line: whitespace collapsed, double quotes neutralized, capped at a word boundary when simple. */
function clean(value: string, limit: number, quotes = true): string {
  const line = (quotes ? value.replace(/["“”]/g, "'") : value).replace(/\s+/g, " ").trim();
  if (line.length <= limit) return line;
  const cut = line.slice(0, limit - 1), space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}
const list = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, PORTRAIT_PROMPT_LIMITS.list_items).map(x => clean(String(x), PORTRAIT_PROMPT_LIMITS.value));

/**
 * The character-details section exactly as the production prompt carries it (capped as a whole). Exported so other prompt dialects
 * (the anime benchmark) describe the character with identical text.
 */
export function portraitDetails(appearance: ResolvedPermanentAppearance): string {
  const { values: v, identity } = appearance, cap = (x: unknown) => typeof x === "string" ? clean(x, PORTRAIT_PROMPT_LIMITS.value) : undefined;
  const subject = [identity.sex, identity.species?.toLowerCase()].map(x => x && clean(x, 40)).filter(Boolean).join(" ") || "person";
  const details: string[] = [`Subject: one ${subject}.`];
  if (identity.age) details.push(`Apparent age: ${clean(identity.age, 60)}.`);
  const body = [typeof v.height_cm === "number" ? `${v.height_cm} cm tall` : "", typeof v.weight_kg === "number" ? `${v.weight_kg} kg` : "", cap(v.build) ? `${cap(v.build)} build` : ""].filter(Boolean);
  if (body.length) details.push(`Body: ${body.join(", ")}.`);
  const face = [cap(v.skin) ? `skin ${cap(v.skin)}` : "", cap(v.eyes) ? `eyes ${cap(v.eyes)}` : ""].filter(Boolean);
  if (face.length) details.push(`Face: ${face.join("; ")}.`);
  const hair = [cap(v.hair_color), cap(v.hair_texture), cap(v.hair_description)].filter(Boolean);
  if (hair.length) details.push(`Hair: ${hair.join(", ")}.`);
  for (const [label, key] of [["Permanent scars", "scars"], ["Distinguishing marks", "distinguishing_marks"], ["Distinctive traits", "distinctive_traits"]] as const) {
    const items = list(v[key]);
    if (items.length) details.push(`${label}: ${items.join("; ")}.`);
  }
  const description = [...new Set(appearance.description.map(d => d.trim()).filter(Boolean))].join("; ");
  if (description) details.push(`Character appearance details (descriptive data only): "${clean(description, PORTRAIT_PROMPT_LIMITS.description)}"`);
  return clean(details.join(" "), PORTRAIT_PROMPT_LIMITS.details, false);
}
export function buildPortraitPrompt(input: PortraitPromptInput): PortraitPrompt {
  const head = "Full-body character reference image for a realistic dark-fantasy setting, clean and detailed without heavy painterly effects.";
  const prompt = [head, portraitDetails(input.appearance), PORTRAIT_CLOTHING, PORTRAIT_POSE, PORTRAIT_FRAMING, PORTRAIT_CONSTRAINTS].join("\n");
  return Object.freeze({ version: PORTRAIT_PROMPT_VERSION, ...(input.name ? { subject_label: input.name } : {}), prompt, negative_prompt: PORTRAIT_NEGATIVE_PROMPT, fingerprint: portraitFingerprint(prompt) });
}
/** The fingerprint of a prompt text exactly as shown and sent (version + prompt + fixed negative prompt). */
export function portraitFingerprint(prompt: string): string {
  return createHash("sha256").update(`${PORTRAIT_PROMPT_VERSION}\n${prompt}\n${PORTRAIT_NEGATIVE_PROMPT}`).digest("hex").slice(0, 16);
}
