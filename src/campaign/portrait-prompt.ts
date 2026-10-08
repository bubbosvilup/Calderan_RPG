import { createHash } from "node:crypto";
import type { ResolvedPermanentAppearance } from "./permanent-appearance.js";

/**
 * Portrait prompts, image generation v1 (anime, Raena-Qwen-Image): deterministic text prompts for an AVATAR (bust-up, square) or a
 * FULL BODY (head to feet) image, built only from the resolved permanent appearance (resolvePermanentAppearance owns canon/origin/
 * profile merging) plus a pose chosen from a curated, centrally defined list. Nothing is invented: unknown traits are omitted, prose is
 * never parsed, and current state (conditions, clothing, location, mood, events) is not an input at all. No provider syntax; the style
 * trigger is passed in by the image stack (src/app/image-stack.ts), the only place it is configured.
 *
 * Fixed line order: trigger + subject/framing → character details (quoted data) → clothing → pose and expression → background →
 * style → constraints. Every user-authored value is collapsed to one line, de-quoted, length-capped and placed after a fixed label; the
 * description is quoted as data. The details section is capped as a whole, and the fixed lines always follow it, so no description can
 * remove or replace the builder's framing, clothing or constraints.
 */
export const PORTRAIT_PROMPT_VERSION = "portrait-prompt-v2-anime";
/** Versions the appearance fingerprint (staleness), independent of prompt wording, so later wording tweaks do not stale every image. */
export const PORTRAIT_APPEARANCE_VERSION = "portrait-appearance-v1";
export const PORTRAIT_PROMPT_LIMITS = Object.freeze({ value: 100, list_items: 4, description: 500, details: 2000, prompt: 3200 });

export type PortraitKind = "avatar" | "fullbody";
export const PORTRAIT_KINDS: readonly PortraitKind[] = Object.freeze(["avatar", "fullbody"]);
export const AVATAR_POSES = Object.freeze(["neutral", "three_quarter", "confident", "shy", "playful", "hand_near_face", "wink"] as const);
export const FULLBODY_POSES = Object.freeze(["neutral", "contrapposto", "hand_on_hip", "relaxed", "playful", "kneeling", "confident"] as const);
export type AvatarPose = typeof AVATAR_POSES[number];
export type FullBodyPose = typeof FULLBODY_POSES[number];
export type PortraitPose = AvatarPose | FullBodyPose;
interface PoseDefinition { readonly label: string; readonly text: string }
/**
 * The ONLY pose texts that reach the image prompt (gender-neutral; adult, appealing, never explicit). The browser sends an id from these
 * lists, never free text. "Looking back over the shoulder" is deliberately absent (unreliable in the audit).
 */
export const PORTRAIT_POSE_TEXT: { readonly avatar: Readonly<Record<AvatarPose, PoseDefinition>>; readonly fullbody: Readonly<Record<FullBodyPose, PoseDefinition>> } = Object.freeze({
  avatar: Object.freeze({
    neutral: { label: "Neutral", text: "facing the viewer with a calm, natural expression" },
    three_quarter: { label: "Three-quarter view", text: "three-quarter view, holding eye contact with the viewer" },
    confident: { label: "Confident", text: "chin slightly raised, confident direct gaze, faint smile" },
    shy: { label: "Shy", text: "shy expression with a light blush, eyes glancing slightly away" },
    playful: { label: "Playful", text: "playful smile, head tilted slightly" },
    hand_near_face: { label: "Hand near face", text: "one hand raised near the face, fingertips lightly touching the cheek, soft expression" },
    wink: { label: "Wink", text: "a playful wink with a soft smile" },
  }),
  fullbody: Object.freeze({
    neutral: { label: "Neutral", text: "relaxed front-facing standing pose, arms loose at the sides, calm expression" },
    contrapposto: { label: "Contrapposto", text: "contrapposto stance with the weight on one leg, relaxed shoulders" },
    hand_on_hip: { label: "Hand on hip", text: "standing with one hand on the hip, confident expression" },
    relaxed: { label: "Relaxed", text: "relaxed, easy stance with the hands loosely clasped in front" },
    playful: { label: "Playful", text: "playful pose with a slight lean and a cheerful expression" },
    kneeling: { label: "Kneeling", text: "kneeling on one knee with an upright posture and a friendly expression" },
    confident: { label: "Confident", text: "confident stance, feet apart, shoulders squared, steady gaze" },
  }),
});
export function isPortraitKind(value: unknown): value is PortraitKind { return value === "avatar" || value === "fullbody"; }
export function isPortraitPose(kind: PortraitKind, value: unknown): value is PortraitPose {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PORTRAIT_POSE_TEXT[kind], value);
}
export function portraitPoseOptions(kind: PortraitKind): readonly { readonly id: PortraitPose; readonly label: string }[] {
  return (kind === "avatar" ? AVATAR_POSES : FULLBODY_POSES).map(id => ({ id, label: (PORTRAIT_POSE_TEXT[kind] as Record<string, PoseDefinition>)[id]!.label }));
}

/** Framing per kind. Every subject is stated as an adult. */
export const PORTRAIT_FRAMING: Readonly<Record<PortraitKind, string>> = Object.freeze({
  avatar: "an adult fantasy RPG character: a bust-up portrait from the chest up, centered, the face clearly visible.",
  fullbody: "an adult fantasy RPG character: full-body character artwork with the entire figure visible from head to feet, centered, nothing cropped, both feet on the ground.",
});
export const PORTRAIT_CLOTHING: Readonly<Record<PortraitKind, string>> = Object.freeze({
  avatar: "Clothing: simple, neutral dark-fantasy clothing with a high-collared, modest neckline, without heraldry, insignia or faction markings.",
  fullbody: "Clothing: simple, practical dark-fantasy clothing appropriate to the setting, without heraldry, insignia or faction markings.",
});
/** Added once on the single content-refusal retry (with a new seed); prompts are never weakened further. */
export const PORTRAIT_MODEST_REINFORCEMENT: Readonly<Record<PortraitKind, string>> = Object.freeze({
  avatar: "Fully clothed; high-collared, modest neckline.",
  fullbody: "Fully clothed in a modest outfit.",
});
export const PORTRAIT_BACKGROUND: Readonly<Record<PortraitKind, string>> = Object.freeze({
  avatar: "Background: softly blurred, muted neutral backdrop.",
  fullbody: "Background: plain light grey background with a clean, readable silhouette.",
});
export const PORTRAIT_STYLE = "Style: polished modern anime illustration, clean linework, controlled cel shading, detailed expressive eyes, detailed hair strands, soft cinematic lighting, refined and attractive character art for a grounded dark-fantasy RPG.";
export const PORTRAIT_CONSTRAINTS: Readonly<Record<PortraitKind, string>> = Object.freeze({
  avatar: "Single subject only, adult proportions. No weapons, no other people, no text, lettering, logos, watermarks or interface elements.",
  fullbody: "Single subject only, adult proportions, detailed hands and feet. No weapons, no other people, no text, lettering, logos, watermarks or interface elements.",
});
/** The validated shared negative prompt; the avatar variant omits "cropped feet" (feet are out of frame by design). */
export const PORTRAIT_NEGATIVE_PROMPT: Readonly<Record<PortraitKind, string>> = Object.freeze({
  avatar: "blurry, lowres, bad anatomy, bad hands, extra fingers, missing fingers, deformed face, text, watermark, logo, signature, photo, 3d render",
  fullbody: "blurry, lowres, bad anatomy, bad hands, extra fingers, missing fingers, deformed face, text, watermark, logo, signature, cropped feet, photo, 3d render",
});

/** One inert line: whitespace collapsed, double quotes neutralized, capped at a word boundary when simple. */
function clean(value: string, limit: number, quotes = true): string {
  const line = (quotes ? value.replace(/["“”]/g, "'") : value).replace(/\s+/g, " ").trim();
  if (line.length <= limit) return line;
  const cut = line.slice(0, limit - 1), space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}
const list = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, PORTRAIT_PROMPT_LIMITS.list_items).map(x => clean(String(x), PORTRAIT_PROMPT_LIMITS.value));

/** The character-details section exactly as every prompt carries it (capped as a whole). Shared by both kinds and the benchmark dialects. */
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

export interface ComposePortraitInput {
  /** portraitDetails() output (possibly masked for the reader by the projection). */
  readonly details: string;
  readonly kind: PortraitKind;
  readonly pose: PortraitPose;
  /** The style trigger from the image stack (e.g. "Anime illustration of"). */
  readonly trigger: string;
  /** The single content-refusal retry: adds PORTRAIT_MODEST_REINFORCEMENT. */
  readonly modest?: boolean;
}
/** Deterministic prompt + negative prompt for one kind and pose. Throws on an unknown pose (callers validate first). */
export function composePortraitPrompt(input: ComposePortraitInput): { readonly prompt: string; readonly negative_prompt: string } {
  if (!isPortraitKind(input.kind) || !isPortraitPose(input.kind, input.pose)) throw new Error("unknown portrait kind or pose");
  const pose = (PORTRAIT_POSE_TEXT[input.kind] as Record<string, PoseDefinition>)[input.pose]!.text;
  const clothing = input.modest ? `${PORTRAIT_CLOTHING[input.kind]} ${PORTRAIT_MODEST_REINFORCEMENT[input.kind]}` : PORTRAIT_CLOTHING[input.kind];
  const prompt = [`${clean(input.trigger, 60)} ${PORTRAIT_FRAMING[input.kind]}`, `Character details: ${input.details}`, clothing, `Pose and expression: ${pose}.`,
    PORTRAIT_BACKGROUND[input.kind], PORTRAIT_STYLE, PORTRAIT_CONSTRAINTS[input.kind]].join("\n");
  return Object.freeze({ prompt, negative_prompt: PORTRAIT_NEGATIVE_PROMPT[input.kind] });
}

export interface PortraitPromptInput {
  readonly appearance: ResolvedPermanentAppearance;
  readonly kind: PortraitKind;
  readonly pose?: PortraitPose;
  readonly trigger: string;
  readonly modest?: boolean;
  /** Player-known name, kept only as an output label: it never enters the prompt (no rendered text). */
  readonly name?: string;
}
export interface PortraitPrompt {
  readonly version: typeof PORTRAIT_PROMPT_VERSION;
  readonly kind: PortraitKind;
  readonly pose: PortraitPose;
  readonly subject_label?: string;
  readonly prompt: string;
  readonly negative_prompt: string;
  /** appearanceFingerprint of the details: the same appearance always yields the same fingerprint, whatever the kind or pose. */
  readonly fingerprint: string;
}
export function buildPortraitPrompt(input: PortraitPromptInput): PortraitPrompt {
  const details = portraitDetails(input.appearance), pose = input.pose ?? "neutral";
  const { prompt, negative_prompt } = composePortraitPrompt({ details, kind: input.kind, pose, trigger: input.trigger, ...(input.modest ? { modest: true } : {}) });
  return Object.freeze({ version: PORTRAIT_PROMPT_VERSION, kind: input.kind, pose, ...(input.name ? { subject_label: input.name } : {}), prompt, negative_prompt, fingerprint: appearanceFingerprint(details) });
}
/**
 * Staleness fingerprint: sha256 over the appearance version + the character-details text (first 16 hex). Pose, kind, style and the
 * refusal reinforcement do not feed it, so a portrait is stale only when the described appearance changed. Images made before v1
 * carry a fingerprint over their whole V1 prompt and therefore show as stale (expected; they stay viewable and keep their roles).
 */
export function appearanceFingerprint(details: string): string {
  return createHash("sha256").update(`${PORTRAIT_APPEARANCE_VERSION}\n${details}`).digest("hex").slice(0, 16);
}
