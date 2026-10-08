import type { WorldStore } from "../world/world-store.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";

/**
 * Save/Load v1 starting scenarios: how a NEW campaign begins. A scenario is application data with a stable, versioned ID that is
 * recorded in every save (`metadata.scenario_id`); it builds the initial campaign from canon and supplies the one-shot opening text
 * given to the narrator until the first exchange is finalized. Adding scenarios never touches persistence or the UI.
 */
export interface StartingScenario {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Presentation and narrator context only: never parsed into state. */
  readonly opening_text: string;
  create(world: WorldStore, campaignId: string): CampaignState;
}
const SLAVE_MARKET_OPENING = `*Suddenly there is daylight, dust, and the sound of voices all around Nicco.*

*Packed earth and loose gravel stretch across a broad square. Feet and wagon traffic have churned its surface into uneven tracks. The air carries the smell of animals and close-packed people. Somewhere ahead, a voice calls out above the bargaining; another answers with a price.*

*Holding pens stand beside the auction area. People wait inside them while buyers gather outside, looking them over. A handler brings a captive out for display. The conversation nearby continues without a pause.*

*At the edge of the auction, clerks attend to sale papers. Guards patrol through the traffic. Caravans are being loaded and unloaded, and people step around the work on their way between the pens and the sellers beyond. There is no hush around the trading, no attempt to conceal what is being bought.*

*The next price is called. Between the auction crowd and the holding pens, a strip of open ground remains.*`;
export const SLAVE_MARKET_V1: StartingScenario = Object.freeze({
  id: "caldrevan.slave_market.v1",
  label: "Arrival at the Calderan slave market",
  description: "Nicco arrives in the Calderan slave market in the late morning, with his canonical starting purse and household.",
  opening_text: SLAVE_MARKET_OPENING,
  create(world: WorldStore, campaignId: string): CampaignState {
    // The canonical opening records, moved to the market at minute 600 (the former Play UI arrival override).
    const campaign = createOpeningCampaign(world, campaignId);
    campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market", time_advance_minutes: 600 } }] });
    return campaign;
  },
});
export const STARTING_SCENARIOS: readonly StartingScenario[] = Object.freeze([SLAVE_MARKET_V1]);
export const DEFAULT_SCENARIO_ID = SLAVE_MARKET_V1.id;
export function scenarioById(id: unknown): StartingScenario | undefined { return STARTING_SCENARIOS.find(s => s.id === id); }
