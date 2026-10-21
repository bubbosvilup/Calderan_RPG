/**
 * TanStack Query keys. The play server holds ONE active session at a time, and `/api/session` already returns the complete player-facing
 * projection (transcript, scene, characters, trade, confirmations, gold) in one read model, so the play screen uses one query for it rather
 * than fragmenting the same payload into per-panel queries. The route checks the payload's campaign id against the URL. Separate keys exist
 * only for genuinely separate resources.
 */
export const queryKeys = {
  session: ["session"] as const,
  campaigns: ["campaigns"] as const,
  saveStatus: ["save-status"] as const,
  optionalServices: ["optional-services"] as const,
};

/** Mutation keys: `turn` (the composer) and `action` (every other state-changing click) let the UI lock actions while one is in flight. */
export const mutationKeys = {
  turn: ["turn"] as const,
  action: (name: string) => ["action", name] as const,
  anyAction: ["action"] as const,
};
