import type { ActiveSessionPayload } from "../api/types";

/**
 * Client routes of one live session. A persistent campaign lives under `/play/<campaign id>`; the disposable playtest session (no campaign) under
 * `/play`. Every page of the session derives its links from here so navigation always stays inside the campaign the server has open.
 */
type SessionRef = Pick<ActiveSessionPayload, "campaign">;

const base = (session: SessionRef) => (session.campaign ? `/play/${encodeURIComponent(session.campaign.id)}` : "/play");

export const playPath = (session: SessionRef) => base(session);
export const inventoryPath = (session: SessionRef) => `${base(session)}/inventory`;
export const playerCharacterPath = (session: SessionRef) => `${base(session)}/character/player`;
