import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { CampaignCommand, CampaignSnapshot } from "./types.js";
import { characterView } from "./projections.js";
import { OPENING_HOUSEHOLD } from "./opening-state.js";
import { insideHeartstoneInterior } from "./heartstone-recognition.js";
import { isNpcPlus } from "./premium-characters.js";

/**
 * Heartstone household rite: the ONE authoritative way it completes mechanically (player-authored fiction, explicit confirmation).
 *
 * CANON says what the rite consists of in-world (barefoot, bare-skin stone contact, the oath, the Keeper's acceptance): that stays lore and
 * roleplay guidance. The ENGINE does not police the performance. The player narrates the scene and, when they consider it complete,
 * confirms it through the UI (GameSession.completeHeartstoneRite). Narration and Controller output can never complete it.
 *
 * The effect is a single `join_household` into the household Nicco keeps. Premium (NPC+) state is derived from that membership inside the
 * same CampaignState preparation (syncPremiumCharacters), so membership and promotion commit atomically in one revision, or neither does.
 * No new command kind, no rite state and no save-schema field exist: the resulting membership and premium record ARE the completion.
 */
export type RiteBlock = "character_not_found" | "not_campaign_npc" | "already_npc_plus" | "not_active" | "not_at_heartstone" | "household_unavailable" | "not_keeper";
export type RiteEligibility = { readonly ok: true; readonly household_id: string } | { readonly ok: false; readonly code: RiteBlock; readonly reason: string };

const REASONS: Record<RiteBlock, string> = {
  character_not_found: "That character is not part of this campaign.",
  not_campaign_npc: "Only a campaign character other than the player can complete the Heartstone rite.",
  already_npc_plus: "This character is already NPC+.",
  not_active: "This character is no longer active.",
  not_at_heartstone: "The character must be inside Heartstone to complete the rite.",
  household_unavailable: "The Heartstone household is not available in this campaign.",
  not_keeper: "Only the Keeper of the Heartstone household can complete the rite.",
};
const block = (code: RiteBlock): RiteEligibility => ({ ok: false, code, reason: REASONS[code] });

/** Eligibility is deliberately simple and never reads prose: a persistent non-player character, not yet NPC+, active and inside Heartstone, with Nicco as Keeper. */
export function heartstoneRiteEligibility(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, characterId: string): RiteEligibility {
  if (characterId === "nicco") return block("not_campaign_npc");
  const record = snapshot.characters.find(c => c.id === characterId);
  if (!record) return block(world.getEntity(characterId)?.type === "character" ? "not_campaign_npc" : "character_not_found");
  if (isNpcPlus(snapshot, characterId)) return block("already_npc_plus");
  const household = snapshot.households.find(h => h.id === OPENING_HOUSEHOLD);
  if (!household) return block("household_unavailable");
  if (!household.members.some(m => m.character_id === "nicco" && m.status === "member" && m.role === "owner")) return block("not_keeper");
  const view = characterView(snapshot, world, characterId);
  if (view.current.status === "inactive" || view.current.status === "dead") return block("not_active");
  if (!insideHeartstoneInterior(world, view.current.current_location)) return block("not_at_heartstone");
  return { ok: true, household_id: household.id };
}

/** The commands that complete the rite for an eligible character (one join; promotion follows from membership in the same revision). */
export function heartstoneRiteCommands(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, characterId: string): { readonly ok: true; readonly commands: readonly CampaignCommand[] } | Extract<RiteEligibility, { ok: false }> {
  const eligibility = heartstoneRiteEligibility(world, snapshot, characterId);
  return eligibility.ok ? { ok: true, commands: [{ kind: "join_household", household_id: eligibility.household_id, character_id: characterId }] } : eligibility;
}
