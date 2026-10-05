import { createOpeningCampaign } from "../campaign/opening-state.js";
import { GameSession, type SessionDeps } from "./game-session.js";

export const UI_PLAYTEST_LOCATION = "calderan_slave_market";
export const UI_PLAYTEST_OPENING = `*Suddenly there is daylight, dust, and the sound of voices all around Nicco.*

*Packed earth and loose gravel stretch across a broad square. Feet and wagon traffic have churned its surface into uneven tracks. The air carries the smell of animals and close-packed people. Somewhere ahead, a voice calls out above the bargaining; another answers with a price.*

*Holding pens stand beside the auction area. People wait inside them while buyers gather outside, looking them over. A handler brings a captive out for display. The conversation nearby continues without a pause.*

*At the edge of the auction, clerks attend to sale papers. Guards patrol through the traffic. Caravans are being loaded and unloaded, and people step around the work on their way between the pens and the sellers beyond. There is no hush around the trading, no attempt to conceal what is being bought.*

*The next price is called. Between the auction crowd and the holding pens, a strip of open ground remains.*`;

/** Disposable arrival override, owned by the application, never written to canon or saves.
 * Keeps the existing Nicco opening records; only location and daytime start differ.
 */
export function createUIPlaytestSession(deps: SessionDeps): GameSession {
  const campaign = createOpeningCampaign(deps.world, "ui_playtest");
  campaign.apply({ expected_revision: campaign.revision, commands: [
    { kind: "runtime_delta", delta: { player_location: UI_PLAYTEST_LOCATION, time_advance_minutes: 600 } },
  ] });
  let initial = true;
  return GameSession.fromCampaign({ ...deps, createCoordinator: hooks => deps.createCoordinator({
    ...hooks,
    narrator_request_setup: request => {
      if (!initial) return request;
      initial = false;
      // The shared system contract owns formatting; only the opening example is one-shot.
      return { ...request,
        messages: [{ role: "assistant", content: UI_PLAYTEST_OPENING }, ...request.messages] };
    },
  }) }, campaign);
}
