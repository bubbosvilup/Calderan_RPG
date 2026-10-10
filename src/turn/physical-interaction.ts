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
/** Narration terms that establish each tag. Pass 10: "to the ground/floor" is a fall outcome, never a walking destination ("descends to the ground-floor hall", "to the floor below"); a live chores turn was redacted for it. Used both to verify controller evidence and to audit uncommitted claims. */
export const CONDITION_TERMS: Readonly<Record<PhysicalCondition, RegExp>> = {
  minor_injury: /\b(?:blood\w*|bleed\w*|bled|split (?:lip|brow|cheek)|lip (?:splits?|split)|cut (?:lip|cheek|brow)|bruis\w*|swell\w*|swollen|broken nose|nose (?:bleeds?|breaks?|broke|cracks?|cracked)|busted)\b/i,
  dazed: /\b(?:dazed|daze|stunned|reel\w*|dizz\w*|groggy|seeing stars)\b/i,
  knocked_down: /\b(?:knock\w* (?:down|over|off (?:his|her|their) feet)|falls?|fell|sprawl\w*|collaps\w*|hits? the (?:ground|floor|cobbles|cobblestones)|onto (?:his|her|their) (?:back|rear|backside)|(?<!\b(?:descends?|descended|climbs?|climbed|steps?|stepped|walks?|walked|heads?|headed|returns?|returned)\s+(?:(?:down|back|up)\s+)?)to the (?:ground(?![-\s](?:floor|level)\b)|floor(?!\s+(?:below|above|beneath)\b|[-\s]level\b)))\b/i,
  winded: /\b(?:winded|wind knocked|breathless|doubl\w* over|gasp\w* for (?:air|breath)|knock\w* the (?:breath|wind|air) (?:out|from)|(?:air|breath) (?:rush\w*|burst\w*) (?:out of |from )?(?:her|him|them)|(?:air|breath) (?:leav\w+|left) (?:out of |from )?(?:her|him|them)(?: in a (?:rush|whoosh|gasp)| with a (?:grunt|whoosh|gasp)| all at once| lungs)|struggl\w* (?:to|for) (?:catch (?:her|his|their) )?(?:breath|air)|fight(?:s|ing)? for (?:air|breath)|(?:can't|cannot|unable to) breathe)\b/i,
};
