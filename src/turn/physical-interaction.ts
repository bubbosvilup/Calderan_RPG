/**
 * Minimal physical-interaction authority (Live NPC Regression Repair 1). Class B only: short-lived physical conditions on the
 * existing character `conditions` field. No HP, armor, dice or turn order. See docs/architecture/PHYSICAL_INTERACTION.md.
 */
export type PhysicalInteractionKind = "strike" | "shove" | "grab" | "release";
export interface PhysicalInteraction { readonly actor: string; readonly target: string; readonly interaction: PhysicalInteractionKind }
/** Closed vocabulary of authorizable condition tags. */
export const PHYSICAL_CONDITIONS = ["minor_injury", "dazed", "knocked_down", "winded"] as const;
export type PhysicalCondition = (typeof PHYSICAL_CONDITIONS)[number];
export const isPhysicalCondition = (tag: string): tag is PhysicalCondition => (PHYSICAL_CONDITIONS as readonly string[]).includes(tag);
/** Narration terms that establish each tag. Used both to verify controller evidence and to audit uncommitted claims. */
export const CONDITION_TERMS: Readonly<Record<PhysicalCondition, RegExp>> = {
  minor_injury: /\b(?:blood\w*|bleed\w*|bled|split (?:lip|brow|cheek)|lip (?:splits?|split)|cut (?:lip|cheek|brow)|bruis\w*|swell\w*|swollen|broken nose|nose (?:bleeds?|breaks?|broke|cracks?|cracked)|busted)\b/i,
  dazed: /\b(?:dazed|daze|stunned|reel\w*|dizz\w*|groggy|seeing stars)\b/i,
  knocked_down: /\b(?:knock\w* (?:down|over|off (?:his|her|their) feet)|falls?|fell|sprawl\w*|collaps\w*|hits? the (?:ground|floor|cobbles|cobblestones)|onto (?:his|her|their) (?:back|rear|backside)|to the (?:ground|floor))\b/i,
  winded: /\b(?:winded|wind knocked|breathless|doubl\w* over|gasp\w* for (?:air|breath))\b/i,
};
