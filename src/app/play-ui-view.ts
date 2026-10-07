import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { SessionView } from "./session-view.js";
import { playerCharacterProjection } from "./player-character-view.js";
import { OPENING_HOUSEHOLD } from "../campaign/opening-state.js";

/** Layout adapter only: all character knowledge decisions belong to the shared projection. */
export function derivePlayUiView(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, view: SessionView) {
  const characters = playerCharacterProjection(world, snapshot);
  const participants = [{ ref: "player", name: view.player.name, category: "You", household: false, npc_plus: false, card: null }, ...view.scene.present.flatMap(p => {
    const card = characters.project(p.id);
    return card ? [{ ref: card.ref, name: card.name, name_known: card.name_known, category: card.category, household: card.household, npc_plus: card.npc_plus, card }] : [];
  })];
  const household = view.household.map(h => ({ members: h.members.flatMap(m => {
    const card = characters.project(m.id); return card ? [card] : [];
  }) }));
  const household_title = snapshot.households.some(h => h.id === OPENING_HOUSEHOLD && h.name === "Heartstone" && h.members.some(m => m.character_id === "nicco" && m.status === "member")) ? "Household of the Heartstone" : "Household";
  return { participants, household, household_title, gold: view.player.gold, day: view.scene.time.day };
}
