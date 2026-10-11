/**
 * Character visual/UI capabilities by tier. DERIVED from authoritative state on every projection and never persisted.
 * Tier-based absence is expressed here (a capability is false and the UI does not render the control); temporary readiness
 * (request in flight, provider failure) is a separate, action-level concern that the client keeps for controls that DO exist.
 *
 *  - world_canon : authored world character, read-only; no campaign record.
 *  - campaign_npc: persistent campaign character that is not promoted; read-only visuals.
 *  - npc_plus    : promoted (an authoritative premium record exists). Promotion, not household membership or the active behavior gate.
 */
export type CharacterTier = "world_canon" | "campaign_npc" | "npc_plus" | "player";
/** No Avatar upload pipeline exists (only the deferred reference image), so no tier is offered an Upload control. */
export const AVATAR_UPLOAD_SUPPORTED = false;
export interface CharacterCapabilities {
  readonly tier: CharacterTier;
  readonly portrait_display: boolean;
  readonly portrait_editable: boolean;
  readonly can_upload_avatar: boolean;
  readonly can_generate_avatar: boolean;
  readonly can_show_full_body: boolean;
  readonly can_manage_full_body: boolean;
  readonly can_show_gallery: boolean;
  readonly can_manage_gallery: boolean;
  readonly can_edit_npc_plus: boolean;
  readonly can_edit_appearance: boolean;
  /** Why an NPC+ cannot be edited right now (an inactive or dead character); null when editable or when the tier never has editing. */
  readonly edit_unavailable_reason: string | null;
  /** A real reason avatar/full-body generation is unavailable for an editable NPC+ (for example an adult-only rule); null otherwise. */
  readonly generate_unavailable_reason: string | null;
  /**
   * Heartstone rite confirmation (explicit NPC+ promotion): true only for a campaign_npc that currently satisfies the rite eligibility
   * (campaign/heartstone-rite.ts). Derived from campaign state, never from prose. The UI renders the promotion control from this.
   */
  readonly can_promote_to_npc_plus: boolean;
  /** Why a campaign_npc cannot be promoted right now (player-safe, no ids); null when promotable or when the tier never offers promotion. */
  readonly promotion_unavailable_reason: string | null;
}
export function characterCapabilities(input: { readonly promoted: boolean; readonly has_campaign_record: boolean; readonly editable: boolean; readonly status?: string; readonly generation_blocked?: string | null;
  /** The rite eligibility of a campaign_npc (ignored for every other tier). */ readonly promotion?: { readonly ok: boolean; readonly reason?: string } }): CharacterCapabilities {
  const tier: CharacterTier = input.promoted ? "npc_plus" : input.has_campaign_record ? "campaign_npc" : "world_canon";
  const npcPlus = tier === "npc_plus", manage = npcPlus && input.editable;
  return { tier, portrait_display: true, portrait_editable: manage, can_upload_avatar: manage && AVATAR_UPLOAD_SUPPORTED, can_generate_avatar: manage,
    can_show_full_body: manage, can_manage_full_body: manage, can_show_gallery: manage, can_manage_gallery: manage, can_edit_npc_plus: manage, can_edit_appearance: manage,
    edit_unavailable_reason: npcPlus && !input.editable ? input.status === "dead" ? "This character is dead." : "This character is no longer active." : null,
    generate_unavailable_reason: manage ? input.generation_blocked ?? null : null,
    can_promote_to_npc_plus: tier === "campaign_npc" && input.promotion?.ok === true,
    promotion_unavailable_reason: tier === "campaign_npc" && input.promotion?.ok !== true ? input.promotion?.reason ?? null : null };
}

/**
 * The player character (Nicco) is not an NPC+: no premium record, promotion or household authority (`can_edit_npc_plus` is always false),
 * but it shares the same visual pipeline (Avatar, Full Body, Gallery, generation, permanent appearance) with the NPC+ editor.
 */
export function playerCapabilities(input: { readonly generation_blocked?: string | null }): CharacterCapabilities {
  return { tier: "player", portrait_display: true, portrait_editable: true, can_upload_avatar: AVATAR_UPLOAD_SUPPORTED, can_generate_avatar: true,
    can_show_full_body: true, can_manage_full_body: true, can_show_gallery: true, can_manage_gallery: true, can_edit_npc_plus: false, can_edit_appearance: true,
    edit_unavailable_reason: null, generate_unavailable_reason: input.generation_blocked ?? null, can_promote_to_npc_plus: false, promotion_unavailable_reason: null };
}
