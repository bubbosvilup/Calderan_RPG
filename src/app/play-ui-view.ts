import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { SessionView } from "./session-view.js";
import { playerCharacterProjection } from "./player-character-view.js";

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
  return { participants, household, gold: view.player.gold, day: view.scene.time.day };
}
