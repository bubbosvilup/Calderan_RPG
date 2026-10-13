import type { CampaignCommand, CampaignSnapshot } from "../src/campaign/types.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import type { WorldStore } from "../src/world/world-store.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { resolvePersonOffers, type PersonOfferResolution } from "../src/turn/commerce/person-offers.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import type { EphemeralSceneParticipant } from "../src/turn/scene-participants.js";

/**
 * Actual Offer V1 test helper. A person sale is now read as a structured OFFER; the commands its stored plan will apply when the PLAYER
 * accepts are what most settlement-level assertions inspect. `planOf` flattens an offer resolution into those plan commands.
 */
export function readOffer(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, input: string, recent: readonly RecentExchange[], revision: number, participants?: readonly EphemeralSceneParticipant[]): PersonOfferResolution {
  return resolvePersonOffers(input, buildTurnContext(world, snapshot), snapshot, recent, revision, { world, ...(participants ? { participants } : {}) });
}
export const planOf = (r: PersonOfferResolution): CampaignCommand[] =>
  r.commands.flatMap(c => c.kind === "propose_trade_offer" && c.subject.kind === "person" ? [...c.subject.plan] : [c]);
/** The offer resolution with its commands replaced by the stored plan (the commands a settlement would dispatch). */
export const asPlan = (r: PersonOfferResolution): PersonOfferResolution & { notes: string[]; offer: PersonOfferResolution } => ({ ...r, commands: planOf(r), notes: [], offer: r });
