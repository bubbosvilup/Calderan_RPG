import type { AppErrorDto } from "./types";

/**
 * The only module that calls `fetch` (an architecture test enforces it). Every request is same-origin and relative to `/api`, so the
 * bundle carries no API base, key or secret. Failures become one `ApiError` with a `kind` the UI can act on; the message shown to the player
 * is either the server's player-safe text or our own copy, never an exception string or a stack trace.
 */
export const API_ROOT = "/api";

export type ApiErrorKind =
  | "network" // the server did not answer (stopped, restarting, connection dropped)
  | "validation" // the request was refused as invalid; nothing changed
  | "stale" // the view this request was based on is out of date (stale_turn)
  | "busy" // a turn or another exclusive operation is running
  | "unavailable" // the server or its narrator provider cannot serve the request right now
  | "save" // a save problem the server surfaced
  | "not_found" // the route or resource does not exist on this server (e.g. campaign routes in playtest mode)
  | "forbidden" // the server's loopback / same-origin boundary refused the request
  | "unknown";

const FALLBACK_MESSAGES: Readonly<Record<ApiErrorKind, string>> = {
  network: "The game server did not answer. Check that it is still running, then try again.",
  validation: "That request was not accepted. Nothing changed.",
  stale: "The story changed since this screen was drawn. It has been refreshed: review it and try again.",
  busy: "The narrator is still working. Try again when the turn finishes.",
  unavailable: "The game server cannot do that right now. Try again in a moment.",
  save: "The campaign could not be saved. Your progress is still in this session.",
  not_found: "That is not available on this server.",
  forbidden: "The game server only accepts requests from this computer.",
  unknown: "Something went wrong on the game server. Reload to check the current state before trying again.",
};

const CODE_KINDS: Readonly<Record<string, ApiErrorKind>> = {
  stale_turn: "stale",
  turn_key_conflict: "validation",
  invalid_input: "validation",
  turn_in_progress: "busy",
  save_in_progress: "save",
  io_error: "save",
  save_too_large: "save",
  campaign_locked: "unavailable",
  narrator_failed: "unavailable",
  controller_failed: "unavailable",
  narrator_truncated: "unavailable",
  retrieval_failed: "unavailable",
  portrait_generation_failed: "unavailable",
  internal_error: "unknown",
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, or null when no response arrived. */
  readonly status: number | null;
  /** The server's AppError code when it sent one. */
  readonly code: string | null;
  /** The parsed response body. Refusals carry the fresh authoritative state, which callers apply. */
  readonly body: unknown;
  constructor(kind: ApiErrorKind, message: string, details: { status?: number | null; code?: string | null; body?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = details.status ?? null;
    this.code = details.code ?? null;
    this.body = details.body;
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

function kindFor(status: number | null, code: string | null): ApiErrorKind {
  if (code && CODE_KINDS[code]) return CODE_KINDS[code];
  if (status === null) return "network";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "busy";
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  if (status >= 400 && status < 500) return "validation";
  return "unknown";
}

/** Maps a failed response (or a refused NDJSON result) to an ApiError. Exported for tests. */
export function toApiError(status: number | null, body: unknown): ApiError {
  const error = isRecord(body) ? body.error : undefined;
  const appError = isRecord(error) ? (error as Partial<AppErrorDto>) : undefined;
  const code = typeof appError?.code === "string" ? appError.code : null;
  const kind = kindFor(status, code);
  // Server text is player-safe by contract (AppError.message, or the adapter's short fixed sentences); anything else falls back to our copy.
  const serverMessage = typeof appError?.message === "string" ? appError.message : typeof error === "string" ? error : "";
  return new ApiError(kind, serverMessage || FALLBACK_MESSAGES[kind], { status, code, body });
}

export const networkError = () => new ApiError("network", FALLBACK_MESSAGES.network);

async function send(path: string, init: { readonly method: "GET" | "POST"; readonly body?: unknown; readonly signal?: AbortSignal | undefined; readonly accept: string }): Promise<Response> {
  try {
    return await fetch(`${API_ROOT}${path}`, {
      method: init.method,
      credentials: "same-origin",
      // The server accepts exactly "application/json" (no charset parameter) on a POST.
      headers: init.method === "POST" ? { "Content-Type": "application/json", Accept: init.accept } : { Accept: init.accept },
      ...(init.method === "POST" ? { body: JSON.stringify(init.body ?? {}) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw networkError();
  }
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

/** One JSON request. Resolves with the body of a successful response; throws ApiError otherwise. */
export async function requestJson<T>(path: string, init: { readonly method?: "GET" | "POST"; readonly body?: unknown; readonly signal?: AbortSignal | undefined } = {}): Promise<T> {
  const response = await send(path, { method: init.method ?? "GET", body: init.body, signal: init.signal, accept: "application/json" });
  const body = await readJson(response);
  if (!response.ok || (isRecord(body) && body.ok === false)) throw toApiError(response.status, body);
  if (body === null) throw new ApiError("unknown", FALLBACK_MESSAGES.unknown, { status: response.status });
  return body as T;
}

/**
 * A POST answered with NDJSON events (`application/x-ndjson`): each non-final line goes to `onEvent`, the single `{type: "result"}` line is
 * returned when it reports success and thrown as an ApiError when it reports a refusal. A response that is not a stream (a request rejected
 * before the turn started) is read as plain JSON.
 */
export async function requestNdjson(path: string, init: { readonly body: unknown; readonly signal?: AbortSignal | undefined; readonly onEvent?: (event: Record<string, unknown>) => void }): Promise<Record<string, unknown>> {
  const response = await send(path, { method: "POST", body: init.body, signal: init.signal, accept: "application/x-ndjson" });
  if (!response.headers.get("content-type")?.startsWith("application/x-ndjson") || !response.body) {
    const body = await readJson(response);
    if (!response.ok || !isRecord(body) || body.ok === false) throw toApiError(response.status, body);
    return body;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", result: Record<string, unknown> | undefined;
  const drain = () => {
    for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      let event: unknown;
      try { event = JSON.parse(line); } catch { continue; }
      if (!isRecord(event)) continue;
      if (event.type === "result") result = event;
      else init.onEvent?.(event);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain();
    }
    buffer += decoder.decode();
    drain();
  } catch (error) {
    if (isAbort(error)) throw error;
    throw networkError();
  } finally {
    reader.releaseLock();
  }
  // The stream closed without its final line: the connection dropped mid-turn. The turn may still have committed.
  if (!result) throw networkError();
  // A streamed refusal arrives with HTTP 200; its AppError code decides the kind (422 stands in for "refused" when the code is unmapped).
  if (result.ok === false) throw toApiError(422, result);
  return result;
}
