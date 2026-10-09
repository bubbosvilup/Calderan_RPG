import type { ItemSpriteIdentity } from "../campaign/item-sprite-prompt.js";
import type { ImageReference } from "./image-generator.js";

export const SPRITE_QUALITY_REASONS = ["text_leakage", "decorative_frame", "multiple_objects", "human_present", "scene_present", "major_visual_mismatch"] as const;
export type SpriteQualityReason = typeof SPRITE_QUALITY_REASONS[number];
export interface SpriteQualityResult { readonly accepted: boolean; readonly reasons: readonly SpriteQualityReason[] }
/** Visual projection only. No campaign context or narrative description. */
export interface SpriteQualityInput extends ItemSpriteIdentity { readonly image: ImageReference }
export interface SpriteQualityReviewer { review(input: SpriteQualityInput): Promise<SpriteQualityResult> }
export class SpriteQualityError extends Error {
  constructor(readonly code: "review_failed" | "quality_rejected") { super(code); }
}
/** Validate even injected reviewers; malformed acceptance must fail closed. */
export function validateSpriteQuality(value: unknown): SpriteQualityResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SpriteQualityError("review_failed");
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some(k => k !== "accepted" && k !== "reasons") || typeof r.accepted !== "boolean" || !Array.isArray(r.reasons)
    || r.reasons.length > SPRITE_QUALITY_REASONS.length || r.reasons.some(c => !SPRITE_QUALITY_REASONS.includes(c))
    || new Set(r.reasons).size !== r.reasons.length || r.accepted !== (r.reasons.length === 0)) throw new SpriteQualityError("review_failed");
  return { accepted: r.accepted, reasons: [...r.reasons] as SpriteQualityReason[] };
}
