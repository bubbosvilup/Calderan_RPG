import { GameSession, type SessionDeps } from "./game-session.js";
import { SLAVE_MARKET_V1 } from "./scenarios.js";

export const UI_PLAYTEST_LOCATION = "calderan_slave_market";
/** The opening text of the starting scenario `caldrevan.slave_market.v1` (kept here for the disposable playtest mode). */
export const UI_PLAYTEST_OPENING = SLAVE_MARKET_V1.opening_text;

/**
 * Disposable playtest mode (`npm run play:ui -- --playtest`): the `caldrevan.slave_market.v1` scenario as campaign `ui_playtest`, never
 * saved and discarded on shutdown. Real campaigns use the SessionHost (create/load/save) instead. The opening is narrator context
 * until the first finalized exchange; it is never parsed into state.
 */
export function createUIPlaytestSession(deps: SessionDeps): GameSession {
  return GameSession.fromCampaign(deps, SLAVE_MARKET_V1.create(deps.world, "ui_playtest"), { opening_text: SLAVE_MARKET_V1.opening_text });
}
