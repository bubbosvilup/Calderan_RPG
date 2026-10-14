import { ApiError, isRecord, requestJson, requestNdjson } from "./client";
import type { ActiveSessionPayload, NoCampaignPayload, SaveStatusDto, SessionPayload, TurnPhase } from "./types";

export const fetchSession = (signal?: AbortSignal) => requestJson<SessionPayload>("/session", { signal });

/** A live session (campaign open, or the disposable playtest session). */
export const isActiveSession = (payload: SessionPayload | null | undefined): payload is ActiveSessionPayload =>
  !!payload && payload.campaign !== null && typeof (payload as Partial<ActiveSessionPayload>).revision === "number";
/** Persistent-campaign server (Save/Load): the payload carries `campaign`. The disposable playtest server never does. */
export const isHostMode = (payload: SessionPayload): boolean => "campaign" in payload;
export const isNoCampaign = (payload: SessionPayload): payload is NoCampaignPayload => payload.campaign === null;

const STATE_KEYS = ["campaign", "messages", "status", "configured", "revision", "scene", "play", "player_character", "inventory", "trade", "confirmations", "provisional"] as const;

/**
 * Every mutation response carries the fresh authoritative session state next to its own outcome fields. This extracts it, or returns null
 * when the body is not a complete state (a network failure, or a committed turn whose state view degraded: then the caller refetches).
 */
export function sessionStateFrom(body: unknown): SessionPayload | null {
  if (!isRecord(body) || !Array.isArray(body.messages)) return null;
  if (body.campaign === null) return { campaign: null, messages: body.messages, status: body.status, configured: body.configured } as NoCampaignPayload;
  if (typeof body.revision !== "number" || !isRecord(body.play) || !isRecord(body.scene)) return null;
  return Object.fromEntries(STATE_KEYS.filter(key => key in body).map(key => [key, body[key]])) as unknown as ActiveSessionPayload;
}

/** The authoritative state attached to a refusal, if any. */
export const stateFromError = (error: unknown): SessionPayload | null => (error instanceof ApiError ? sessionStateFrom(error.body) : null);

/** A fresh request identity per submission (REV-2): the server runs one key at most once and answers a retry from the first result. */
export function newTurnKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

const PHASES: readonly TurnPhase[] = ["thinking", "narrating", "resolving"];
const isPhase = (value: unknown): value is TurnPhase => PHASES.includes(value as TurnPhase);
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

export interface TurnResult { readonly state: SessionPayload | null; readonly replayed: boolean; readonly warnings: readonly string[] }

/**
 * Submits one player turn and streams its progress phases. A dropped connection is retried with the SAME turn key, so a turn the server
 * already accepted is answered from its first result and never runs twice. A refusal (stale, busy, provider failure) is thrown as ApiError;
 * it carries the fresh state.
 */
export async function submitTurn(request: { readonly text: string; readonly expectedRevision: number }, options: { readonly onPhase?: (phase: TurnPhase) => void; readonly signal?: AbortSignal } = {}): Promise<TurnResult> {
  const body = { text: request.text, turn_key: newTurnKey(), expected_revision: request.expectedRevision };
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await requestNdjson("/turn", { body, signal: options.signal, onEvent: event => { if (event.type === "progress" && isPhase(event.phase)) options.onPhase?.(event.phase); } });
      return { state: sessionStateFrom(result), replayed: result.replayed === true, warnings: Array.isArray(result.warnings) ? result.warnings.filter((w): w is string => typeof w === "string") : [] };
    } catch (error) {
      if (!(error instanceof ApiError) || error.kind !== "network" || attempt >= 2) throw error;
      await wait(1000 * (attempt + 1), options.signal);
    }
  }
}

/** `/location <target>`: the administrative location correction (revision-guarded). */
export async function correctLocation(request: { readonly target: string; readonly expectedRevision: number }) {
  const body = await requestJson<Record<string, unknown>>("/location", { method: "POST", body: { target: request.target, expected_revision: request.expectedRevision } });
  return { state: sessionStateFrom(body), confirmation: typeof body.confirmation === "string" ? body.confirmation : "" };
}

/** Location candidates the server suggests when a correction target is ambiguous. */
export const locationCandidates = (error: unknown): readonly string[] => {
  const body = error instanceof ApiError ? error.body : undefined;
  return isRecord(body) && Array.isArray(body.candidates) ? body.candidates.filter((c): c is string => typeof c === "string") : [];
};

export const fetchSaveStatus = (signal?: AbortSignal) => requestJson<SaveStatusDto>("/save-status", { signal });

export async function saveCampaign() {
  return { state: sessionStateFrom(await requestJson<unknown>("/save", { method: "POST", body: {} })) };
}
