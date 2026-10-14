/**
 * The legacy play client's `#status` vocabulary (src/ui/client.js), as one closed list shared by the turn-reliability browser check
 * (scripts/browser/turn-reliability-browser-check.mjs) and the source test that pins it to the client (tests/ui/legacy-turn-status.test.ts).
 *
 * While a turn runs, PIPE-1 allows status words only, never narrator prose. The legacy client shows two kinds:
 *  - "Generating…": written on submit, before the first progress event, and by `render()` while the session is busy;
 *  - the phase words of the server's `progress` events (its PHASE_LABELS table).
 */
export const LEGACY_PHASE_STATUS = ["Thinking…", "Narrating…", "Resolving…"] as const;
export const LEGACY_PENDING_STATUS = ["Generating…", ...LEGACY_PHASE_STATUS] as const;
/** Every other literal the client writes to `#status`: idle, terminal and non-turn states. None of them is valid while a turn runs. */
export const LEGACY_OTHER_STATUS = ["Your turn.", "Session ended.", "Set OPENROUTER_API_KEY and restart to play.", "Disconnected.", "Choose or create a campaign.", "Correcting location…"] as const;

export const isLegacyPendingStatus = (text: string): boolean => (LEGACY_PENDING_STATUS as readonly string[]).includes(text);
export const isLegacyPhaseStatus = (text: string): boolean => (LEGACY_PHASE_STATUS as readonly string[]).includes(text);
