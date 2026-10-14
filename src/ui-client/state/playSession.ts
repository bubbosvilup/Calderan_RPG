import type { MutableRefObject } from "react";
import { useOutletContext } from "react-router";
import type { ActiveSessionPayload } from "../api/types";

/**
 * What the pages of an open session (play, Inventory, the player character page) receive from the play route: the authoritative session,
 * the connection state, and the presentation state that must survive moving between the pages (the composer draft).
 */
export interface PlaySessionContext {
  readonly session: ActiveSessionPayload;
  readonly connectionLost: boolean;
  /** The composer draft. A ref, not state: typing must not re-render the pages. */
  readonly draftRef: MutableRefObject<string>;
}

export const usePlaySession = () => useOutletContext<PlaySessionContext>();
